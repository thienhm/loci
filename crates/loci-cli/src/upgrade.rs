use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::db::{connect_project_db, connect_registry_db};
use crate::domain::{ProjectRecord, RegisteredProject};
use crate::paths::{find_workspace_root, LociPaths};
use crate::project::{get_project, insert_project};
use crate::registry::upsert_registered_project;
use crate::templates;

#[derive(Debug, Serialize)]
pub struct UpgradeReport {
    pub dry_run: bool,
    pub schema: SchemaReport,
    pub template_pack: TemplatePackReport,
    pub actions: Vec<UpgradeAction>,
    pub legacy_import: LegacyImportReport,
}

#[derive(Debug, Serialize)]
pub struct SchemaReport {
    pub current_version: i64,
}

#[derive(Debug, Serialize)]
pub struct TemplatePackReport {
    pub id: String,
    pub current_version: String,
    pub target_version: String,
}

#[derive(Debug, Serialize)]
pub struct UpgradeAction {
    pub kind: String,
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Default)]
pub struct LegacyImportReport {
    pub tickets: Vec<LegacyTicketAction>,
    pub unsupported: Vec<LegacyUnsupportedItem>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LegacyTicketAction {
    pub ticket_id: String,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LegacyUnsupportedItem {
    pub ticket_id: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
struct LegacyTicketFile {
    id: String,
    title: String,
    status: String,
    priority: String,
    labels: Vec<String>,
    assignee: Option<String>,
    progress: i64,
    #[serde(default)]
    archived: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct LegacyProjectFile {
    id: String,
    name: String,
    prefix: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize)]
struct ProjectConfig {
    project_id: String,
    name: String,
    prefix: String,
    loci_version: String,
}

impl UpgradeReport {
    pub fn count_status(&self, status: &str) -> usize {
        self.actions
            .iter()
            .filter(|action| action.status == status)
            .count()
    }
}

pub fn plan(dry_run: bool) -> Result<UpgradeReport> {
    let paths = workspace_paths("inspect Loci upgrade state")?;

    let conn = Connection::open(&paths.project_db)
        .with_context(|| format!("open project database at {}", paths.project_db.display()))?;
    build_report(&paths, &conn, dry_run)
}

pub fn apply() -> Result<UpgradeReport> {
    let paths = workspace_paths("upgrade Loci project state")?;

    let conn = connect_project_db(&paths.project_db)?;
    seed_missing_project_metadata(&paths, &conn)?;
    let mut report = build_report(&paths, &conn, false)?;
    report.legacy_import.backup_path = Some(backup_legacy_tickets(&paths)?.display().to_string());
    apply_legacy_ticket_imports(&conn, &paths, &report).context("apply legacy ticket imports")?;
    apply_template_actions(&paths, &report).context("apply template actions")?;
    update_template_pack_state(&conn).context("update template pack state")?;
    update_project_loci_version(&conn).context("update project version metadata")?;
    update_project_config_version(&paths).context("update project config version")?;
    upsert_registry_project(&paths, &conn).context("upsert project in global registry")?;

    Ok(report)
}

fn workspace_paths(home_context: &str) -> Result<LociPaths> {
    let current_dir = env::current_dir()?;
    let workspace_root = find_workspace_root(&current_dir)
        .context("not in a Loci workspace; run `loci init` first")?
        .canonicalize()?;
    let home_dir = env::var_os("HOME")
        .map(Into::into)
        .with_context(|| format!("HOME is required to {home_context}"))?;

    Ok(LociPaths::new(workspace_root, home_dir))
}

fn build_report(paths: &LociPaths, conn: &Connection, dry_run: bool) -> Result<UpgradeReport> {
    let project = project_for_upgrade(paths, conn)?;
    let current_schema_version = current_schema_version(conn)?;
    let current_template_pack_version = current_template_pack_version(conn)?;
    let actions = template_actions(paths, &project)?;
    let legacy_import = legacy_import_plan(paths, conn)?;

    Ok(UpgradeReport {
        dry_run,
        schema: SchemaReport {
            current_version: current_schema_version,
        },
        template_pack: TemplatePackReport {
            id: templates::DEFAULT_TEMPLATE_PACK_ID.to_string(),
            current_version: current_template_pack_version,
            target_version: templates::DEFAULT_TEMPLATE_PACK_VERSION.to_string(),
        },
        actions,
        legacy_import,
    })
}

fn current_schema_version(conn: &Connection) -> Result<i64> {
    let version = conn.query_row("SELECT MAX(version) FROM schema_version", [], |row| {
        row.get::<_, Option<i64>>(0)
    })?;

    Ok(version.unwrap_or(0))
}

fn current_template_pack_version(conn: &Connection) -> Result<String> {
    let version = conn
        .query_row(
            "SELECT version FROM template_pack WHERE id = ?1",
            params![templates::DEFAULT_TEMPLATE_PACK_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    Ok(version.unwrap_or_else(|| "missing".to_string()))
}

fn project_for_upgrade(paths: &LociPaths, conn: &Connection) -> Result<ProjectRecord> {
    match get_project(conn) {
        Ok(project) => Ok(project),
        Err(error) if paths.project_state_dir.join("project.json").is_file() => {
            legacy_project_record(paths).with_context(|| {
                format!("read legacy project metadata after SQLite project lookup failed: {error}")
            })
        }
        Err(error) => Err(error),
    }
}

fn seed_missing_project_metadata(paths: &LociPaths, conn: &Connection) -> Result<()> {
    if get_project(conn).is_ok() {
        return Ok(());
    }

    let project = legacy_project_record(paths)?;
    insert_project(conn, &project)?;
    update_template_pack_state(conn)?;
    write_project_config_if_missing(paths, &project)?;
    Ok(())
}

fn legacy_project_record(paths: &LociPaths) -> Result<ProjectRecord> {
    let path = paths.project_state_dir.join("project.json");
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let legacy: LegacyProjectFile =
        serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
    Ok(ProjectRecord {
        id: legacy.id,
        name: legacy.name,
        prefix: legacy.prefix,
        loci_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: legacy.created_at.clone(),
        updated_at: legacy.created_at,
    })
}

fn write_project_config_if_missing(paths: &LociPaths, project: &ProjectRecord) -> Result<()> {
    if paths.project_config.exists() {
        return Ok(());
    }
    if let Some(parent) = paths.project_config.parent() {
        fs::create_dir_all(parent)?;
    }
    let config = ProjectConfig {
        project_id: project.id.clone(),
        name: project.name.clone(),
        prefix: project.prefix.clone(),
        loci_version: project.loci_version.clone(),
    };
    fs::write(&paths.project_config, toml::to_string(&config)?)?;
    Ok(())
}

fn upsert_registry_project(paths: &LociPaths, conn: &Connection) -> Result<()> {
    let project = get_project(conn)?;
    let (open_ticket_count, review_ticket_count, validation_failure_count): (i64, i64, i64) = conn
        .query_row(
            r#"
            SELECT
              COALESCE(SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN validation_state = 'failing' THEN 1 ELSE 0 END), 0)
            FROM ticket
            "#,
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    let registered_project = RegisteredProject {
        id: project.id,
        name: project.name,
        prefix: project.prefix,
        path: paths.workspace_root.display().to_string(),
        loci_version: env!("CARGO_PKG_VERSION").to_string(),
        health_status: "warning".to_string(),
        open_ticket_count,
        review_ticket_count,
        validation_failure_count,
    };
    let registry_conn = connect_registry_db(&paths.global_registry_db)?;
    upsert_registered_project(
        &registry_conn,
        &registered_project,
        &registered_project.path,
    )?;
    Ok(())
}

fn template_actions(
    paths: &LociPaths,
    project: &crate::domain::ProjectRecord,
) -> Result<Vec<UpgradeAction>> {
    let mut actions = Vec::new();

    for doc in templates::built_in_template_docs(project) {
        let absolute_path = paths.workspace_root.join(doc.path);
        let status = match fs::read_to_string(&absolute_path) {
            Ok(existing) if existing == doc.content => "unchanged",
            Ok(_) => "conflict",
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => "create",
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("read template doc {}", absolute_path.display()))
            }
        };

        actions.push(UpgradeAction {
            kind: "template".to_string(),
            path: doc.path.to_string(),
            status: status.to_string(),
        });
    }

    Ok(actions)
}

fn apply_template_actions(paths: &LociPaths, report: &UpgradeReport) -> Result<()> {
    let conn = Connection::open(&paths.project_db)
        .with_context(|| format!("open project database at {}", paths.project_db.display()))?;
    let project = get_project(&conn)?;

    for (action, doc) in report
        .actions
        .iter()
        .zip(templates::built_in_template_docs(&project))
    {
        let absolute_path = paths.workspace_root.join(&action.path);
        match action.status.as_str() {
            "create" | "update" => {
                if let Some(parent) = absolute_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&absolute_path, doc.content)?;
            }
            "conflict" => {
                let conflict_path = absolute_path.with_file_name(format!(
                    "{}.loci-conflict",
                    absolute_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .context("template doc path should have a UTF-8 file name")?
                ));
                if !conflict_path.exists() {
                    fs::write(conflict_path, doc.content)?;
                }
            }
            "unchanged" => {}
            _ => {}
        }
    }

    Ok(())
}

fn legacy_import_plan(paths: &LociPaths, conn: &Connection) -> Result<LegacyImportReport> {
    let mut report = LegacyImportReport::default();
    let tickets_root = paths.workspace_root.join(".loci/tickets");
    if !tickets_root.exists() {
        return Ok(report);
    }

    for entry in fs::read_dir(&tickets_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let ticket_id = entry.file_name().to_string_lossy().to_string();
        if ticket_id == "archived" {
            continue;
        }
        let ticket_json_path = entry.path().join("ticket.json");
        if !ticket_json_path.exists() {
            continue;
        }

        let raw = fs::read_to_string(&ticket_json_path)
            .with_context(|| format!("read {}", ticket_json_path.display()))?;
        let legacy: LegacyTicketFile = serde_json::from_str(&raw)
            .with_context(|| format!("parse {}", ticket_json_path.display()))?;
        if legacy.archived {
            report.tickets.push(LegacyTicketAction {
                ticket_id: legacy.id,
                status: "skip".to_string(),
                reason: Some("archived".to_string()),
            });
            continue;
        }

        let existing = existing_ticket_snapshot(conn, &legacy.id)?;
        match existing {
            None => {
                report.tickets.push(LegacyTicketAction {
                    ticket_id: legacy.id.clone(),
                    status: "insert".to_string(),
                    reason: None,
                });
            }
            Some(current) => {
                let mapped_status = map_legacy_status(&legacy.status);
                let is_same = current.0 == legacy.title
                    && current.1 == mapped_status
                    && current.2 == legacy.priority
                    && current.3 == legacy.progress;
                report.tickets.push(LegacyTicketAction {
                    ticket_id: legacy.id.clone(),
                    status: if is_same { "skip" } else { "conflict" }.to_string(),
                    reason: if is_same {
                        Some("already_imported".to_string())
                    } else {
                        Some("sqlite_and_legacy_diverge".to_string())
                    },
                });
            }
        }

        let files_dir = entry.path().join("files");
        if files_dir.exists() {
            report.unsupported.push(LegacyUnsupportedItem {
                ticket_id: legacy.id.clone(),
                path: path_relative_to_workspace(paths, &files_dir),
                kind: "files".to_string(),
            });
        }
        let attachments_json = entry.path().join("attachments.json");
        if attachments_json.exists() {
            report.unsupported.push(LegacyUnsupportedItem {
                ticket_id: legacy.id,
                path: path_relative_to_workspace(paths, &attachments_json),
                kind: "attachments".to_string(),
            });
        }
    }

    Ok(report)
}

fn apply_legacy_ticket_imports(
    conn: &Connection,
    paths: &LociPaths,
    report: &UpgradeReport,
) -> Result<()> {
    if report
        .legacy_import
        .tickets
        .iter()
        .any(|action| action.status == "conflict")
    {
        let conflicts: Vec<&LegacyTicketAction> = report
            .legacy_import
            .tickets
            .iter()
            .filter(|action| action.status == "conflict")
            .collect();
        let json = serde_json::to_string(&conflicts)?;
        bail!("legacy import conflict: {json}");
    }

    for action in &report.legacy_import.tickets {
        if action.status != "insert" {
            continue;
        }
        let ticket_dir = paths
            .workspace_root
            .join(".loci/tickets")
            .join(&action.ticket_id);
        let raw = fs::read_to_string(ticket_dir.join("ticket.json"))?;
        let legacy: LegacyTicketFile = serde_json::from_str(&raw)?;
        conn.execute(
            r#"
            INSERT INTO ticket (
                id, title, status, priority, assignee, labels_json, progress, risk_lane,
                readiness_state, validation_state, review_state, created_at, updated_at, story_path
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'normal', 'missing', 'missing', 'not_ready', ?8, ?9, ?10)
            "#,
            params![
                legacy.id,
                legacy.title,
                map_legacy_status(&legacy.status),
                legacy.priority,
                legacy.assignee,
                serde_json::to_string(&legacy.labels)?,
                legacy.progress,
                legacy.created_at,
                legacy.updated_at,
                "description.md"
            ],
        )?;
    }
    Ok(())
}

fn backup_legacy_tickets(paths: &LociPaths) -> Result<PathBuf> {
    let source = paths.workspace_root.join(".loci/tickets");
    let timestamp = OffsetDateTime::now_utc().unix_timestamp();
    let backup = paths
        .workspace_root
        .join(".loci/backups")
        .join(format!("legacy-tickets-{timestamp}"));
    fs::create_dir_all(backup.parent().context("backup parent missing")?)?;
    if source.exists() {
        copy_dir_recursive(&source, &backup)?;
    }
    Ok(backup)
}

fn copy_dir_recursive(source: &Path, dest: &Path) -> Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let entry_dest = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &entry_dest)?;
        } else {
            fs::copy(entry.path(), &entry_dest)?;
        }
    }
    Ok(())
}

fn map_legacy_status(status: &str) -> &str {
    if status == "todo" {
        "idea"
    } else {
        status
    }
}

fn existing_ticket_snapshot(
    conn: &Connection,
    id: &str,
) -> Result<Option<(String, String, String, i64)>> {
    let mut stmt =
        conn.prepare("SELECT title, status, priority, progress FROM ticket WHERE id = ?1")?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        return Ok(Some((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)));
    }
    Ok(None)
}

fn path_relative_to_workspace(paths: &LociPaths, path: &Path) -> String {
    path.strip_prefix(&paths.workspace_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

fn update_template_pack_state(conn: &Connection) -> Result<()> {
    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    conn.execute(
        r#"
        INSERT OR REPLACE INTO template_pack (id, name, version, applied_at)
        VALUES (?1, ?2, ?3, ?4)
        "#,
        params![
            templates::DEFAULT_TEMPLATE_PACK_ID,
            "Loci Default",
            templates::DEFAULT_TEMPLATE_PACK_VERSION,
            now
        ],
    )?;

    Ok(())
}

fn update_project_loci_version(conn: &Connection) -> Result<()> {
    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    conn.execute(
        r#"
        UPDATE project
        SET loci_version = ?1,
            updated_at = ?2
        "#,
        params![env!("CARGO_PKG_VERSION"), now],
    )?;

    Ok(())
}

fn update_project_config_version(paths: &LociPaths) -> Result<()> {
    let content = fs::read_to_string(&paths.project_config)
        .with_context(|| format!("read {}", paths.project_config.display()))?;
    let mut value: toml::Value = toml::from_str(&content)
        .with_context(|| format!("parse {}", paths.project_config.display()))?;

    if let Some(table) = value.as_table_mut() {
        table.insert(
            "loci_version".to_string(),
            toml::Value::String(env!("CARGO_PKG_VERSION").to_string()),
        );
    }

    fs::write(&paths.project_config, toml::to_string(&value)?)?;
    Ok(())
}
