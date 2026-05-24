use anyhow::Result;
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
