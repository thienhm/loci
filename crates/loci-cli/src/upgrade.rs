use std::env;
use std::fs;

use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::db::connect_project_db;
use crate::paths::{find_workspace_root, LociPaths};
use crate::project::get_project;
use crate::templates;

#[derive(Debug, Serialize)]
pub struct UpgradeReport {
    pub dry_run: bool,
    pub schema: SchemaReport,
    pub template_pack: TemplatePackReport,
    pub actions: Vec<UpgradeAction>,
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
    let report = build_report(&paths, &conn, false)?;
    apply_template_actions(&paths, &report)?;
    update_template_pack_state(&conn)?;
    update_project_loci_version(&conn)?;
    update_project_config_version(&paths)?;

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
    let project = get_project(conn)?;
    let current_schema_version = current_schema_version(conn)?;
    let current_template_pack_version = current_template_pack_version(conn)?;
    let actions = template_actions(paths, &project)?;

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
    })
}

fn current_schema_version(conn: &Connection) -> Result<i64> {
    let version = conn.query_row("SELECT MAX(version) FROM schema_version", [], |row| {
        row.get::<_, Option<i64>>(0)
    })?;

    Ok(version.unwrap_or(0))
}

fn current_template_pack_version(conn: &Connection) -> Result<String> {
    let version = conn.query_row(
        "SELECT version FROM template_pack WHERE id = ?1",
        params![templates::DEFAULT_TEMPLATE_PACK_ID],
        |row| row.get::<_, String>(0),
    )?;

    Ok(version)
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
