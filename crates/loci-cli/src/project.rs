use anyhow::{bail, Context, Result};
use rusqlite::types::Type;
use rusqlite::{params, Connection};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::domain::{
    BacklogListFilters, BacklogRecord, DecisionListFilters, DecisionRecord, EvidenceRecord,
    ProjectRecord, TicketRecord, TraceListFilters, TraceRecord, ValidationRunRecord,
};

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

pub fn update_ticket_readiness(
    conn: &Connection,
    id: &str,
    status: &str,
    readiness_state: &str,
) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET status = ?2,
            readiness_state = ?3,
            updated_at = ?4
        WHERE id = ?1
        "#,
        params![
            id,
            status,
            readiness_state,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
}

pub fn next_evidence_id(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare("SELECT id FROM evidence WHERE id LIKE 'EV-%'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix("EV-") else {
            continue;
        };
        if suffix.len() == 6 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    Ok(format!("EV-{:06}", max_suffix + 1))
}

pub fn insert_evidence(conn: &Connection, evidence: &EvidenceRecord) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO evidence (
            id, ticket_id, evidence_type, layer, title, summary, command,
            artifact_path, url, note, exit_code, outcome, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        "#,
        params![
            evidence.id,
            evidence.ticket_id,
            evidence.evidence_type,
            evidence.layer,
            evidence.title,
            evidence.summary,
            evidence.command,
            evidence.artifact_path,
            evidence.url,
            evidence.note,
            evidence.exit_code,
            evidence.outcome,
            evidence.created_at,
        ],
    )?;

    Ok(())
}

pub fn list_evidence_for_ticket(conn: &Connection, ticket_id: &str) -> Result<Vec<EvidenceRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, ticket_id, evidence_type, layer, title, summary, command,
               artifact_path, url, note, exit_code, outcome, created_at
        FROM evidence
        WHERE ticket_id = ?1
        ORDER BY created_at ASC, id ASC
        "#,
    )?;

    let rows = stmt.query_map([ticket_id], evidence_from_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }

    Ok(records)
}

pub fn get_evidence(conn: &Connection, id: &str) -> Result<Option<EvidenceRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, ticket_id, evidence_type, layer, title, summary, command,
               artifact_path, url, note, exit_code, outcome, created_at
        FROM evidence
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(evidence_from_row(row)?)),
        None => Ok(None),
    }
}

pub fn update_ticket_evidence_path(conn: &Connection, id: &str, evidence_path: &str) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET evidence_path = ?2,
            updated_at = ?3
        WHERE id = ?1
        "#,
        params![
            id,
            evidence_path,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
}

pub fn update_ticket_validation_state(
    conn: &Connection,
    id: &str,
    validation_state: &str,
) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET validation_state = ?2,
            updated_at = ?3
        WHERE id = ?1
        "#,
        params![
            id,
            validation_state,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
}

pub fn update_ticket_summary_path(conn: &Connection, id: &str, summary_path: &str) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET summary_path = ?2,
            updated_at = ?3
        WHERE id = ?1
        "#,
        params![
            id,
            summary_path,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
}

pub fn update_ticket_review_state(
    conn: &Connection,
    id: &str,
    status: &str,
    review_state: &str,
    validation_state: Option<&str>,
) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE ticket
        SET status = ?2,
            review_state = ?3,
            validation_state = COALESCE(?4, validation_state),
            updated_at = ?5
        WHERE id = ?1
        "#,
        params![
            id,
            status,
            review_state,
            validation_state,
            OffsetDateTime::now_utc().format(&Rfc3339)?,
        ],
    )?;

    if updated == 0 {
        bail!("ticket {id} not found");
    }

    Ok(())
}

pub fn insert_validation_run(
    conn: &Connection,
    validation_run: &ValidationRunRecord,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO validation_run (
            id, ticket_id, command, status, exit_code, evidence_id,
            started_at, finished_at, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            validation_run.id,
            validation_run.ticket_id,
            validation_run.command,
            validation_run.status,
            validation_run.exit_code,
            validation_run.evidence_id,
            validation_run.started_at,
            validation_run.finished_at,
            validation_run.created_at,
        ],
    )?;

    Ok(())
}

pub fn next_validation_run_id(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare("SELECT id FROM validation_run WHERE id LIKE 'VR-%'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix("VR-") else {
            continue;
        };
        if suffix.len() == 6 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    Ok(format!("VR-{:06}", max_suffix + 1))
}

pub fn next_trace_id(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare("SELECT id FROM trace WHERE id LIKE 'TR-%'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix("TR-") else {
            continue;
        };
        if suffix.len() == 6 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    Ok(format!("TR-{:06}", max_suffix + 1))
}

pub fn insert_trace(conn: &Connection, trace: &TraceRecord) -> Result<()> {
    let actions_json = serde_json::to_string(&trace.actions)?;
    let files_read_json = serde_json::to_string(&trace.files_read)?;
    let files_changed_json = serde_json::to_string(&trace.files_changed)?;
    let commands_json = serde_json::to_string(&trace.commands)?;
    let errors_json = serde_json::to_string(&trace.errors)?;
    let decisions_json = serde_json::to_string(&trace.decisions)?;

    conn.execute(
        r#"
        INSERT INTO trace (
            id, ticket_id, actor, event_type, task_summary, intake,
            actions_json, files_read_json, files_changed_json, commands_json,
            errors_json, decisions_json, outcome, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        "#,
        params![
            trace.id,
            trace.ticket_id,
            trace.actor,
            trace.event_type,
            trace.task_summary,
            trace.intake,
            actions_json,
            files_read_json,
            files_changed_json,
            commands_json,
            errors_json,
            decisions_json,
            trace.outcome,
            trace.created_at,
        ],
    )?;

    Ok(())
}

pub fn insert_trace_evidence_links(
    conn: &Connection,
    trace_id: &str,
    evidence_ids: &[String],
    created_at: &str,
) -> Result<()> {
    for evidence_id in evidence_ids {
        conn.execute(
            r#"
            INSERT INTO trace_evidence (trace_id, evidence_id, created_at)
            VALUES (?1, ?2, ?3)
            "#,
            params![trace_id, evidence_id, created_at],
        )?;
    }

    Ok(())
}

pub fn list_traces(conn: &Connection, filters: &TraceListFilters) -> Result<Vec<TraceRecord>> {
    let mut traces = Vec::new();
    let mut stmt = conn.prepare(
        r#"
        SELECT id, ticket_id, actor, event_type, task_summary, intake,
               actions_json, files_read_json, files_changed_json, commands_json,
               errors_json, decisions_json, outcome, created_at
        FROM trace
        WHERE (?1 IS NULL OR ticket_id = ?1)
          AND (?2 IS NULL OR actor = ?2)
          AND (?3 IS NULL OR event_type = ?3)
        ORDER BY created_at ASC, id ASC
        "#,
    )?;

    let rows = stmt.query_map(
        params![filters.ticket_id, filters.actor, filters.event_type],
        trace_from_row,
    )?;
    for row in rows {
        traces.push(with_trace_evidence_ids(conn, row?)?);
    }

    Ok(traces)
}

pub fn get_trace(conn: &Connection, id: &str) -> Result<Option<TraceRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, ticket_id, actor, event_type, task_summary, intake,
               actions_json, files_read_json, files_changed_json, commands_json,
               errors_json, decisions_json, outcome, created_at
        FROM trace
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(with_trace_evidence_ids(conn, trace_from_row(row)?)?)),
        None => Ok(None),
    }
}

pub fn trace_count_for_ticket(conn: &Connection, ticket_id: &str) -> Result<usize> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM trace WHERE ticket_id = ?1",
        [ticket_id],
        |row| row.get(0),
    )?;

    Ok(count as usize)
}

pub fn next_decision_id(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare("SELECT id FROM decision WHERE id LIKE 'DEC-%'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix("DEC-") else {
            continue;
        };
        if suffix.len() == 6 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    Ok(format!("DEC-{:06}", max_suffix + 1))
}

pub fn insert_decision(conn: &Connection, decision: &DecisionRecord) -> Result<()> {
    let context_json = serde_json::to_string(&decision.context)?;
    let decision_json = serde_json::to_string(&decision.decision)?;
    let consequences_json = serde_json::to_string(&decision.consequences)?;
    let ticket_ids_json = serde_json::to_string(&decision.ticket_ids)?;
    let trace_ids_json = serde_json::to_string(&decision.trace_ids)?;
    let doc_paths_json = serde_json::to_string(&decision.doc_paths)?;

    conn.execute(
        r#"
        INSERT INTO decision (
            id, title, status, context_json, decision_json, consequences_json,
            ticket_ids_json, trace_ids_json, doc_paths_json, doc_path,
            verification_outcome, verification_command, verification_note, verified_at,
            created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        "#,
        params![
            decision.id,
            decision.title,
            decision.status,
            context_json,
            decision_json,
            consequences_json,
            ticket_ids_json,
            trace_ids_json,
            doc_paths_json,
            decision.doc_path,
            decision.verification_outcome,
            decision.verification_command,
            decision.verification_note,
            decision.verified_at,
            decision.created_at,
            decision.updated_at,
        ],
    )?;

    Ok(())
}

pub fn list_decisions(
    conn: &Connection,
    filters: &DecisionListFilters,
) -> Result<Vec<DecisionRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, context_json, decision_json, consequences_json,
               ticket_ids_json, trace_ids_json, doc_paths_json, doc_path,
               verification_outcome, verification_command, verification_note, verified_at,
               created_at, updated_at
        FROM decision
        WHERE (?1 IS NULL OR status = ?1)
        ORDER BY created_at ASC, id ASC
        "#,
    )?;

    let rows = stmt.query_map(params![filters.status], decision_from_row)?;
    let mut decisions = Vec::new();
    for row in rows {
        let decision = row?;
        if let Some(ticket_id) = &filters.ticket_id {
            if !decision.ticket_ids.contains(ticket_id) {
                continue;
            }
        }
        if let Some(trace_id) = &filters.trace_id {
            if !decision.trace_ids.contains(trace_id) {
                continue;
            }
        }
        decisions.push(decision);
    }

    Ok(decisions)
}

pub fn get_decision(conn: &Connection, id: &str) -> Result<Option<DecisionRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, context_json, decision_json, consequences_json,
               ticket_ids_json, trace_ids_json, doc_paths_json, doc_path,
               verification_outcome, verification_command, verification_note, verified_at,
               created_at, updated_at
        FROM decision
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(decision_from_row(row)?)),
        None => Ok(None),
    }
}

pub fn update_decision_verification(
    conn: &Connection,
    id: &str,
    outcome: &str,
    command: Option<&str>,
    note: &str,
    verified_at: &str,
) -> Result<()> {
    let updated = conn.execute(
        r#"
        UPDATE decision
        SET verification_outcome = ?2,
            verification_command = ?3,
            verification_note = ?4,
            verified_at = ?5,
            updated_at = ?5
        WHERE id = ?1
        "#,
        params![id, outcome, command, note, verified_at],
    )?;

    if updated == 0 {
        bail!("decision {id} not found");
    }

    Ok(())
}

pub fn next_backlog_id(conn: &Connection) -> Result<String> {
    let mut stmt = conn.prepare("SELECT id FROM backlog WHERE id LIKE 'HB-%'")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut max_suffix = 0_i64;
    for row in rows {
        let id = row?;
        let Some(suffix) = id.strip_prefix("HB-") else {
            continue;
        };
        if suffix.len() == 6 && suffix.chars().all(|char| char.is_ascii_digit()) {
            let number = suffix.parse::<i64>()?;
            max_suffix = max_suffix.max(number);
        }
    }

    Ok(format!("HB-{:06}", max_suffix + 1))
}

pub fn insert_backlog(conn: &Connection, record: &BacklogRecord) -> Result<()> {
    let sources_json = serde_json::to_string(&record.sources)?;
    let impact_json = serde_json::to_string(&record.impact)?;
    let recommendations_json = serde_json::to_string(&record.recommendations)?;
    let ticket_ids_json = serde_json::to_string(&record.ticket_ids)?;
    let trace_ids_json = serde_json::to_string(&record.trace_ids)?;
    let doc_paths_json = serde_json::to_string(&record.doc_paths)?;

    conn.execute(
        r#"
        INSERT INTO backlog (
            id, title, kind, status, sources_json, impact_json, recommendations_json,
            ticket_ids_json, trace_ids_json, doc_paths_json, resolution_note, resolved_at,
            created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        "#,
        params![
            record.id,
            record.title,
            record.kind,
            record.status,
            sources_json,
            impact_json,
            recommendations_json,
            ticket_ids_json,
            trace_ids_json,
            doc_paths_json,
            record.resolution_note,
            record.resolved_at,
            record.created_at,
            record.updated_at,
        ],
    )?;

    Ok(())
}

pub fn list_backlog(conn: &Connection, filters: &BacklogListFilters) -> Result<Vec<BacklogRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, kind, status, sources_json, impact_json, recommendations_json,
               ticket_ids_json, trace_ids_json, doc_paths_json, resolution_note, resolved_at,
               created_at, updated_at
        FROM backlog
        WHERE (?1 IS NULL OR status = ?1)
          AND (?2 IS NULL OR kind = ?2)
        ORDER BY created_at ASC, id ASC
        "#,
    )?;

    let rows = stmt.query_map(params![filters.status, filters.kind], backlog_from_row)?;
    let mut records = Vec::new();
    for row in rows {
        let record = row?;
        if let Some(ticket_id) = &filters.ticket_id {
            if !record.ticket_ids.contains(ticket_id) {
                continue;
            }
        }
        records.push(record);
    }

    Ok(records)
}

pub fn get_backlog(conn: &Connection, id: &str) -> Result<Option<BacklogRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, kind, status, sources_json, impact_json, recommendations_json,
               ticket_ids_json, trace_ids_json, doc_paths_json, resolution_note, resolved_at,
               created_at, updated_at
        FROM backlog
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(backlog_from_row(row)?)),
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

fn evidence_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EvidenceRecord> {
    Ok(EvidenceRecord {
        id: row.get(0)?,
        ticket_id: row.get(1)?,
        evidence_type: row.get(2)?,
        layer: row.get(3)?,
        title: row.get(4)?,
        summary: row.get(5)?,
        command: row.get(6)?,
        artifact_path: row.get(7)?,
        url: row.get(8)?,
        note: row.get(9)?,
        exit_code: row.get(10)?,
        outcome: row.get(11)?,
        created_at: row.get(12)?,
    })
}

fn trace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TraceRecord> {
    Ok(TraceRecord {
        id: row.get(0)?,
        ticket_id: row.get(1)?,
        actor: row.get(2)?,
        event_type: row.get(3)?,
        task_summary: row.get(4)?,
        intake: row.get(5)?,
        actions: json_vec_from_row(row, 6)?,
        files_read: json_vec_from_row(row, 7)?,
        files_changed: json_vec_from_row(row, 8)?,
        commands: json_vec_from_row(row, 9)?,
        errors: json_vec_from_row(row, 10)?,
        decisions: json_vec_from_row(row, 11)?,
        outcome: row.get(12)?,
        evidence_ids: Vec::new(),
        created_at: row.get(13)?,
    })
}

fn json_vec_from_row(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Vec<String>> {
    let value: String = row.get(index)?;
    serde_json::from_str(&value)
        .map_err(|err| rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(err)))
}

fn decision_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DecisionRecord> {
    Ok(DecisionRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        status: row.get(2)?,
        context: json_vec_from_row(row, 3)?,
        decision: json_vec_from_row(row, 4)?,
        consequences: json_vec_from_row(row, 5)?,
        ticket_ids: json_vec_from_row(row, 6)?,
        trace_ids: json_vec_from_row(row, 7)?,
        doc_paths: json_vec_from_row(row, 8)?,
        doc_path: row.get(9)?,
        verification_outcome: row.get(10)?,
        verification_command: row.get(11)?,
        verification_note: row.get(12)?,
        verified_at: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn backlog_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BacklogRecord> {
    Ok(BacklogRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        kind: row.get(2)?,
        status: row.get(3)?,
        sources: json_vec_from_row(row, 4)?,
        impact: json_vec_from_row(row, 5)?,
        recommendations: json_vec_from_row(row, 6)?,
        ticket_ids: json_vec_from_row(row, 7)?,
        trace_ids: json_vec_from_row(row, 8)?,
        doc_paths: json_vec_from_row(row, 9)?,
        resolution_note: row.get(10)?,
        resolved_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn with_trace_evidence_ids(conn: &Connection, mut trace: TraceRecord) -> Result<TraceRecord> {
    let mut stmt = conn.prepare(
        r#"
        SELECT evidence_id
        FROM trace_evidence
        WHERE trace_id = ?1
        ORDER BY created_at ASC, evidence_id ASC
        "#,
    )?;
    let rows = stmt.query_map([trace.id.as_str()], |row| row.get::<_, String>(0))?;
    let mut evidence_ids = Vec::new();
    for row in rows {
        evidence_ids.push(row?);
    }
    trace.evidence_ids = evidence_ids;
    Ok(trace)
}
