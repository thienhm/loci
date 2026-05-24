use anyhow::{bail, Context, Result};
use rusqlite::types::Type;
use rusqlite::{params, Connection};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

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

pub fn get_project(conn: &Connection) -> Result<ProjectRecord> {
    let project = conn
        .query_row(
            r#"
            SELECT id, name, prefix, loci_version, created_at, updated_at
            FROM project
            LIMIT 1
            "#,
            [],
            |row| {
                Ok(ProjectRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    prefix: row.get(2)?,
                    loci_version: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .context("project metadata is missing; run `loci init` first")?;

    Ok(project)
}

pub fn next_ticket_id(conn: &Connection, prefix: &str) -> Result<String> {
    // Callers that create tickets must hold a SQLite write transaction before
    // using this value; otherwise concurrent adds can allocate the same id.
    let pattern = format!("{prefix}-%");
    let mut stmt = conn.prepare("SELECT id FROM ticket WHERE id LIKE ?1")?;
    let rows = stmt.query_map([pattern], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix(&format!("{prefix}-")) else {
            continue;
        };
        if suffix.len() >= 3 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    let next = max_suffix + 1;
    if next < 1000 {
        Ok(format!("{prefix}-{next:03}"))
    } else {
        Ok(format!("{prefix}-{next}"))
    }
}

pub fn insert_ticket(conn: &Connection, ticket: &TicketRecord) -> Result<()> {
    let labels_json = serde_json::to_string(&ticket.labels)?;
    conn.execute(
        r#"
        INSERT INTO ticket (
            id, title, status, priority, assignee, labels_json, progress, risk_lane,
            readiness_state, validation_state, review_state, created_at, updated_at,
            story_path, design_path, plan_path, validation_path, evidence_path,
            summary_path, lessons_path, harness_delta_path
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20, ?21
        )
        "#,
        params![
            ticket.id,
            ticket.title,
            ticket.status,
            ticket.priority,
            ticket.assignee,
            labels_json,
            ticket.progress,
            ticket.risk_lane,
            ticket.readiness_state,
            ticket.validation_state,
            ticket.review_state,
            ticket.created_at,
            ticket.updated_at,
            ticket.story_path,
            ticket.design_path,
            ticket.plan_path,
            ticket.validation_path,
            ticket.evidence_path,
            ticket.summary_path,
            ticket.lessons_path,
            ticket.harness_delta_path,
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

pub fn update_ticket_packet_paths_and_state(
    conn: &Connection,
    id: &str,
    status: Option<&str>,
    risk_lane: Option<&str>,
    story_path: Option<&str>,
    plan_path: Option<&str>,
    validation_path: Option<&str>,
) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET status = COALESCE(?2, status),
            risk_lane = COALESCE(?3, risk_lane),
            story_path = COALESCE(?4, story_path),
            plan_path = COALESCE(?5, plan_path),
            validation_path = COALESCE(?6, validation_path),
            updated_at = ?7
        WHERE id = ?1
        "#,
        params![
            id,
            status,
            risk_lane,
            story_path,
            plan_path,
            validation_path,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
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
