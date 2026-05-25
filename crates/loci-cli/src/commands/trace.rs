use anyhow::{bail, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::{TraceEventTypeArg, TraceOutcomeArg};
use crate::db::connect_project_db;
use crate::domain::TraceListFilters;
use crate::domain::TraceRecord;
use crate::paths::find_workspace_root;
use crate::project;
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
    tx.commit()?;

    if input.json {
        println!("{}", serde_json::to_string(&record)?);
    } else {
        println!("Recorded {} for {}", record.id, record.ticket_id);
    }

    Ok(())
}

pub fn list(input: TraceListInput) -> Result<()> {
    let _filters = TraceListFilters {
        ticket_id: input.ticket,
        actor: input.actor,
        event_type: input
            .event_type
            .map(|event_type| event_type.as_str().to_string()),
    };
    let _ = input.json;

    bail!("trace list is not implemented yet")
}

pub fn show(trace_id: &str, json: bool) -> Result<()> {
    let _ = (trace_id, json);

    bail!("trace show is not implemented yet")
}
