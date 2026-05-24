use std::env;
use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};
use rusqlite::params;
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::db::{connect_project_db, connect_registry_db};
use crate::domain::{ProjectRecord, RegisteredProject};
use crate::paths::LociPaths;
use crate::project::insert_project;
use crate::registry::upsert_registered_project;
use crate::templates;

pub fn run(name: &str, prefix: &str) -> Result<()> {
    validate_prefix(prefix)?;

    let workspace_root = env::current_dir()?.canonicalize()?;
    let home_dir = env::var_os("HOME")
        .map(Into::into)
        .context("HOME is required to initialize the global Loci registry")?;
    let paths = LociPaths::new(workspace_root, home_dir);

    ensure_not_initialized(&paths)?;

    fs::create_dir_all(&paths.visible_loci_dir)?;
    fs::create_dir_all(paths.visible_loci_dir.join("decisions"))?;
    fs::create_dir_all(paths.visible_loci_dir.join("templates"))?;
    fs::create_dir_all(paths.visible_loci_dir.join("tickets"))?;
    fs::create_dir_all(&paths.project_state_dir)?;

    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let project = ProjectRecord {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        prefix: prefix.to_string(),
        loci_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    write_if_missing(
        &paths.workspace_root.join("AGENTS.md"),
        &templates::agents_md(),
    )?;
    write_if_missing(
        &paths.workspace_root.join("LOCI.md"),
        &templates::loci_md(&project),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("project.md"),
        &templates::project_md(&project),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("architecture.md"),
        templates::architecture_md(),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("validation.md"),
        templates::validation_md(),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("guardrails.md"),
        templates::guardrails_md(),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("current-state.md"),
        templates::current_state_md(),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("glossary.md"),
        templates::glossary_md(),
    )?;
    write_if_missing(
        &paths.visible_loci_dir.join("backlog.md"),
        templates::backlog_md(),
    )?;
    write_if_missing(&paths.project_config, &project_config(&project))?;

    let project_conn = connect_project_db(&paths.project_db)?;
    insert_project(&project_conn, &project)?;
    project_conn.execute(
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

    let registered_project = RegisteredProject {
        id: project.id.clone(),
        name: project.name.clone(),
        prefix: project.prefix.clone(),
        path: paths.workspace_root.display().to_string(),
        loci_version: project.loci_version.clone(),
        health_status: "warning".to_string(),
        open_ticket_count: 0,
        review_ticket_count: 0,
        validation_failure_count: 0,
    };
    let registry_conn = connect_registry_db(&paths.global_registry_db)?;
    upsert_registered_project(
        &registry_conn,
        &registered_project,
        &registered_project.path,
    )?;

    println!(
        "Initialized Loci workspace at {}",
        paths.workspace_root.display()
    );

    Ok(())
}

fn validate_prefix(prefix: &str) -> Result<()> {
    if !is_valid_prefix(prefix) {
        bail!("prefix must be 2-5 uppercase ASCII letters");
    }

    Ok(())
}

fn is_valid_prefix(prefix: &str) -> bool {
    (2..=5).contains(&prefix.len()) && prefix.chars().all(|char| char.is_ascii_uppercase())
}

fn ensure_not_initialized(paths: &LociPaths) -> Result<()> {
    if paths.project_config.exists()
        || paths.project_db.exists()
        || paths.workspace_root.join("LOCI.md").exists()
        || paths.visible_loci_dir.join("project.md").exists()
    {
        bail!("project already initialized");
    }

    Ok(())
}

fn write_if_missing(path: &Path, content: &str) -> Result<()> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(path, content)?;
    Ok(())
}

fn project_config(project: &ProjectRecord) -> String {
    toml::to_string(&ProjectConfig {
        project_id: project.id.clone(),
        name: project.name.clone(),
        prefix: project.prefix.clone(),
        loci_version: project.loci_version.clone(),
    })
    .expect("project config should serialize")
}

#[derive(Serialize)]
struct ProjectConfig {
    project_id: String,
    name: String,
    prefix: String,
    loci_version: String,
}
