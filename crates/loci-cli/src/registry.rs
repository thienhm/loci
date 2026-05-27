use std::path::Path;

use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};

use crate::domain::RegisteredProject;

pub fn upsert_registered_project(
    conn: &Connection,
    project: &RegisteredProject,
    path: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO registered_project (
            id, name, prefix, path, loci_version, last_seen_at, health_status,
            open_ticket_count, review_ticket_count, validation_failure_count
        )
        VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6, ?7, ?8, ?9)
        ON CONFLICT(path) DO UPDATE SET
            id = excluded.id,
            name = excluded.name,
            prefix = excluded.prefix,
            loci_version = excluded.loci_version,
            last_seen_at = excluded.last_seen_at,
            health_status = excluded.health_status,
            open_ticket_count = excluded.open_ticket_count,
            review_ticket_count = excluded.review_ticket_count,
            validation_failure_count = excluded.validation_failure_count
        "#,
        params![
            project.id,
            project.name,
            project.prefix,
            path,
            project.loci_version,
            project.health_status,
            project.open_ticket_count,
            project.review_ticket_count,
            project.validation_failure_count
        ],
    )?;

    Ok(())
}

pub fn refresh_registered_project_counts(workspace_root: &Path) -> Result<()> {
    let home =
        std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable is not set"))?;
    let registry_path = Path::new(&home).join(".loci/registry.db");
    if !registry_path.exists() {
        return Ok(());
    }

    let project_conn = Connection::open(workspace_root.join(".loci/loci.db"))?;
    let (open_count, review_count, validation_failure_count): (i64, i64, i64) = project_conn
        .query_row(
            r#"
            SELECT
              COALESCE(SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END), 0) AS open_ticket_count,
              COALESCE(SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END), 0) AS review_ticket_count,
              COALESCE(SUM(CASE WHEN validation_state = 'failing' THEN 1 ELSE 0 END), 0) AS validation_failure_count
            FROM ticket
            "#,
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

    let registry_conn = Connection::open(registry_path)?;
    registry_conn.execute(
        r#"
        UPDATE registered_project
        SET open_ticket_count = ?1,
            review_ticket_count = ?2,
            validation_failure_count = ?3
        WHERE path = ?4
        "#,
        params![
            open_count,
            review_count,
            validation_failure_count,
            workspace_root.to_string_lossy().as_ref()
        ],
    )?;

    Ok(())
}
