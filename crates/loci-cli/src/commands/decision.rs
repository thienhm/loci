use anyhow::{anyhow, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::{DecisionStatusArg, DecisionVerificationOutcomeArg};
use crate::db::connect_project_db;
use crate::decision;
use crate::domain::{DecisionListFilters, DecisionRecord};
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub struct DecisionAddInput {
    pub title: String,
    pub status: DecisionStatusArg,
    pub context: Vec<String>,
    pub decisions: Vec<String>,
    pub consequences: Vec<String>,
    pub ticket_ids: Vec<String>,
    pub trace_ids: Vec<String>,
    pub doc_paths: Vec<String>,
    pub json: bool,
}

pub struct DecisionListInput {
    pub ticket_id: Option<String>,
    pub trace_id: Option<String>,
    pub status: Option<DecisionStatusArg>,
    pub json: bool,
}

pub struct DecisionVerifyInput {
    pub decision_id: String,
    pub outcome: DecisionVerificationOutcomeArg,
    pub command: Option<String>,
    pub note: String,
    pub json: bool,
}

pub fn add(input: DecisionAddInput) -> Result<()> {
    decision::validate_required_text(&input.title, decision::EMPTY_TITLE_ERROR)?;

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    validate_ticket_links(&tx, &input.ticket_ids)?;
    validate_trace_links(&tx, &input.trace_ids)?;

    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let id = project::next_decision_id(&tx)?;
    let doc_path = decision::doc_path_for(&id, &input.title);
    let record = DecisionRecord {
        id,
        title: input.title,
        status: input.status.as_str().to_string(),
        context: input.context,
        decision: input.decisions,
        consequences: input.consequences,
        ticket_ids: input.ticket_ids,
        trace_ids: input.trace_ids,
        doc_paths: input.doc_paths,
        doc_path,
        verification_outcome: "pending".to_string(),
        verification_command: None,
        verification_note: None,
        verified_at: None,
        created_at: now.clone(),
        updated_at: now,
    };

    project::insert_decision(&tx, &record)?;

    let decision_file = root.join(&record.doc_path);
    let previous_decision = if decision_file.exists() {
        Some(std::fs::read_to_string(&decision_file)?)
    } else {
        None
    };
    let existing = previous_decision
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::decision_record_md(&record.id, &record.title));
    let updated = decision::render_decision_markdown(&existing, &record);
    if let Some(parent) = decision_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&decision_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_decision {
            let _ = std::fs::write(&decision_file, previous);
        } else {
            let _ = std::fs::remove_file(&decision_file);
        }
        return Err(error.into());
    }

    print_record(&record, input.json)?;
    Ok(())
}

pub fn list(input: DecisionListInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let filters = DecisionListFilters {
        ticket_id: input.ticket_id,
        trace_id: input.trace_id,
        status: input.status.map(|status| status.as_str().to_string()),
    };
    let records = project::list_decisions(&conn, &filters)?;

    if input.json {
        println!("{}", serde_json::to_string(&records)?);
    } else if records.is_empty() {
        println!("No decision records");
    } else {
        for record in records {
            print_compact_record(&record);
        }
    }

    Ok(())
}

pub fn show(decision_id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let record = project::get_decision(&conn, decision_id)?
        .ok_or_else(|| anyhow!("decision {decision_id} not found"))?;

    print_record(&record, json)?;
    Ok(())
}

pub fn verify(input: DecisionVerifyInput) -> Result<()> {
    decision::validate_required_text(&input.note, decision::EMPTY_VERIFY_NOTE_ERROR)?;

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let verified_at = OffsetDateTime::now_utc().format(&Rfc3339)?;

    project::update_decision_verification(
        &tx,
        &input.decision_id,
        input.outcome.as_str(),
        input.command.as_deref(),
        &input.note,
        &verified_at,
    )?;
    let record = project::get_decision(&tx, &input.decision_id)?
        .ok_or_else(|| anyhow!("decision {} not found", input.decision_id))?;

    let decision_file = root.join(&record.doc_path);
    let previous_decision = if decision_file.exists() {
        Some(std::fs::read_to_string(&decision_file)?)
    } else {
        None
    };
    let existing = previous_decision
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::decision_record_md(&record.id, &record.title));
    let updated = decision::render_decision_markdown(&existing, &record);
    if let Some(parent) = decision_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&decision_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_decision {
            let _ = std::fs::write(&decision_file, previous);
        } else {
            let _ = std::fs::remove_file(&decision_file);
        }
        return Err(error.into());
    }

    print_record(&record, input.json)?;
    Ok(())
}

fn validate_ticket_links(conn: &rusqlite::Connection, ticket_ids: &[String]) -> Result<()> {
    for ticket_id in ticket_ids {
        project::get_ticket(conn, ticket_id)?
            .ok_or_else(|| anyhow!("ticket {ticket_id} does not exist"))?;
    }

    Ok(())
}

fn validate_trace_links(conn: &rusqlite::Connection, trace_ids: &[String]) -> Result<()> {
    for trace_id in trace_ids {
        project::get_trace(conn, trace_id)?.ok_or_else(|| anyhow!("trace {trace_id} not found"))?;
    }

    Ok(())
}

fn print_record(record: &DecisionRecord, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string(record)?);
    } else {
        print_compact_record(record);
    }

    Ok(())
}

fn print_compact_record(record: &DecisionRecord) {
    println!(
        "{} [{}] {} - {}",
        record.id, record.status, record.verification_outcome, record.title
    );
}
