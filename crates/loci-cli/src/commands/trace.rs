use anyhow::{anyhow, bail, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::{TraceEventTypeArg, TraceOutcomeArg};
use crate::db::connect_project_db;
use crate::domain::TraceListFilters;
use crate::domain::TraceRecord;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;
use crate::trace;

pub struct TraceAddInput {
    pub id: String,
    pub summary: String,
    pub actor: String,
    pub event_type: TraceEventTypeArg,
    pub intake: Option<String>,
    pub actions: Vec<String>,
    pub files_read: Vec<String>,
    pub files_changed: Vec<String>,
    pub commands: Vec<String>,
    pub errors: Vec<String>,
    pub decisions: Vec<String>,
    pub outcome: TraceOutcomeArg,
    pub evidence_ids: Vec<String>,
    pub json: bool,
}

pub struct TraceListInput {
    pub ticket: Option<String>,
    pub actor: Option<String>,
    pub event_type: Option<TraceEventTypeArg>,
    pub json: bool,
}

pub fn add(input: TraceAddInput) -> Result<()> {
    trace::validate_required_text(&input.summary, trace::EMPTY_SUMMARY_ERROR)?;
    trace::validate_required_text(&input.actor, trace::EMPTY_ACTOR_ERROR)?;

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    project::get_ticket(&tx, &input.id)?
        .ok_or_else(|| anyhow::anyhow!("ticket {} does not exist", input.id))?;

    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let record = TraceRecord {
        id: project::next_trace_id(&tx)?,
        ticket_id: input.id,
        actor: input.actor,
        event_type: input.event_type.as_str().to_string(),
        task_summary: input.summary,
        intake: input.intake,
        actions: input.actions,
        files_read: input.files_read,
        files_changed: input.files_changed,
        commands: input.commands,
        errors: input.errors,
        decisions: input.decisions,
        outcome: input.outcome.as_str().to_string(),
        evidence_ids: input.evidence_ids,
        created_at: now.clone(),
    };

    project::insert_trace(&tx, &record)?;
    project::insert_trace_evidence_links(&tx, &record.id, &record.evidence_ids, &now)?;
    let records = project::list_traces(
        &tx,
        &TraceListFilters {
            ticket_id: Some(record.ticket_id.clone()),
            actor: None,
            event_type: None,
        },
    )?;

    let trace_file = crate::packet::ticket_dir(&root, &record.ticket_id).join("trace.md");
    let previous_trace = if trace_file.exists() {
        Some(std::fs::read_to_string(&trace_file)?)
    } else {
        None
    };
    let existing = previous_trace
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::trace_packet_md(&record.ticket_id));
    let updated = trace::render_trace_markdown(&existing, &records);
    if let Some(parent) = trace_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&trace_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_trace {
            let _ = std::fs::write(&trace_file, previous);
        } else {
            let _ = std::fs::remove_file(&trace_file);
        }
        return Err(error.into());
    }

    if input.json {
        println!("{}", serde_json::to_string(&record)?);
    } else {
        println!("Recorded {} for {}", record.id, record.ticket_id);
    }

    Ok(())
}

pub fn list(input: TraceListInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let filters = TraceListFilters {
        ticket_id: input.ticket,
        actor: input.actor,
        event_type: input
            .event_type
            .map(|event_type| event_type.as_str().to_string()),
    };
    let records = project::list_traces(&conn, &filters)?;

    if input.json {
        println!("{}", serde_json::to_string(&records)?);
    } else if records.is_empty() {
        println!("No trace records");
    } else {
        for record in records {
            println!(
                "{} [{}] {} {} - {} - {}",
                record.id,
                record.event_type,
                record.ticket_id,
                record.actor,
                record.outcome,
                record.task_summary
            );
        }
    }

    Ok(())
}

pub fn show(trace_id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let record =
        project::get_trace(&conn, trace_id)?.ok_or_else(|| anyhow!("trace {trace_id} not found"))?;

    if json {
        println!("{}", serde_json::to_string(&record)?);
    } else {
        println!(
            "{} [{}] {} {} - {} - {}",
            record.id,
            record.event_type,
            record.ticket_id,
            record.actor,
            record.outcome,
            record.task_summary
        );
    }

    Ok(())
}
