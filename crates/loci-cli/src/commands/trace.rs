use anyhow::{bail, Result};

use crate::app::{TraceEventTypeArg, TraceOutcomeArg};
use crate::domain::TraceListFilters;
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

    let _ = (
        input.id,
        input.event_type.as_str(),
        input.intake,
        input.actions,
        input.files_read,
        input.files_changed,
        input.commands,
        input.errors,
        input.decisions,
        input.outcome.as_str(),
        input.evidence_ids,
        input.json,
    );

    bail!("trace add is not implemented yet")
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
