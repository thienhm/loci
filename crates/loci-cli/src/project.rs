use anyhow::Result;
use rusqlite::types::Type;
use rusqlite::{params, Connection};

use crate::domain::{ProjectRecord, TicketRecord};

pub fn insert_project(conn: &Connection, project: &ProjectRecord) -> Result<()> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO project (id, name, prefix, loci_version, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            project.id,
            project.name,
            project.prefix,
            project.loci_version,
            project.created_at,
            project.updated_at
        ],
    )?;

    Ok(())
}

pub fn list_tickets(conn: &Connection) -> Result<Vec<TicketRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, priority, assignee, labels_json, progress, risk_lane,
               readiness_state, validation_state, review_state, created_at, updated_at,
               story_path, design_path, plan_path, validation_path, evidence_path,
               summary_path, lessons_path, harness_delta_path
        FROM ticket
        ORDER BY created_at ASC
        "#,
    )?;

    let rows = stmt.query_map([], ticket_from_row)?;
    let mut tickets = Vec::new();
    for row in rows {
        tickets.push(row?);
    }

    Ok(tickets)
}

pub fn get_ticket(conn: &Connection, id: &str) -> Result<Option<TicketRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, priority, assignee, labels_json, progress, risk_lane,
               readiness_state, validation_state, review_state, created_at, updated_at,
               story_path, design_path, plan_path, validation_path, evidence_path,
               summary_path, lessons_path, harness_delta_path
        FROM ticket
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(ticket_from_row(row)?)),
        None => Ok(None),
    }
}

fn ticket_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TicketRecord> {
    let labels_json: String = row.get(5)?;
    let labels: Vec<String> = serde_json::from_str(&labels_json)
        .map_err(|err| rusqlite::Error::FromSqlConversionFailure(5, Type::Text, Box::new(err)))?;

    Ok(TicketRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        status: row.get(2)?,
        priority: row.get(3)?,
        assignee: row.get(4)?,
        labels,
        progress: row.get(6)?,
        risk_lane: row.get(7)?,
        readiness_state: row.get(8)?,
        validation_state: row.get(9)?,
        review_state: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        story_path: row.get(13)?,
        design_path: row.get(14)?,
        plan_path: row.get(15)?,
        validation_path: row.get(16)?,
        evidence_path: row.get(17)?,
        summary_path: row.get(18)?,
        lessons_path: row.get(19)?,
        harness_delta_path: row.get(20)?,
    })
}
