use anyhow::{anyhow, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::{BacklogKindArg, BacklogStatusArg};
use crate::backlog;
use crate::db::connect_project_db;
use crate::domain::{BacklogListFilters, BacklogRecord};
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub struct BacklogAddInput {
    pub title: String,
    pub kind: BacklogKindArg,
    pub status: BacklogStatusArg,
    pub sources: Vec<String>,
    pub impact: Vec<String>,
    pub recommendations: Vec<String>,
    pub ticket_ids: Vec<String>,
    pub trace_ids: Vec<String>,
    pub doc_paths: Vec<String>,
    pub json: bool,
}

pub struct BacklogListInput {
    pub status: Option<BacklogStatusArg>,
    pub kind: Option<BacklogKindArg>,
    pub ticket_id: Option<String>,
    pub json: bool,
}

pub struct BacklogStatusInput {
    pub backlog_id: String,
    pub status: BacklogStatusArg,
    pub note: Option<String>,
    pub json: bool,
}

pub fn add(input: BacklogAddInput) -> Result<()> {
    backlog::validate_required_text(&input.title, backlog::EMPTY_TITLE_ERROR)?;

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    validate_ticket_links(&tx, &input.ticket_ids)?;
    validate_trace_links(&tx, &input.trace_ids)?;

    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let record = BacklogRecord {
        id: project::next_backlog_id(&tx)?,
        title: input.title,
        kind: input.kind.as_str().to_string(),
        status: input.status.as_str().to_string(),
        sources: input.sources,
        impact: input.impact,
        recommendations: input.recommendations,
        ticket_ids: input.ticket_ids,
        trace_ids: input.trace_ids,
        doc_paths: input.doc_paths,
        resolution_note: None,
        resolved_at: None,
        created_at: now.clone(),
        updated_at: now,
    };

    project::insert_backlog(&tx, &record)?;
    let records = project::list_backlog(&tx, &BacklogListFilters::default())?;

    let backlog_file = root.join("loci/backlog.md");
    let previous_backlog = if backlog_file.exists() {
        Some(std::fs::read_to_string(&backlog_file)?)
    } else {
        None
    };
    let existing = previous_backlog
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::backlog_md().to_string());
    let updated = backlog::render_backlog_markdown(&existing, &records);
    if let Some(parent) = backlog_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&backlog_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_backlog {
            let _ = std::fs::write(&backlog_file, previous);
        } else {
            let _ = std::fs::remove_file(&backlog_file);
        }
        return Err(error.into());
    }

    print_record(&record, input.json)?;
    Ok(())
}

pub fn list(input: BacklogListInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let filters = BacklogListFilters {
        status: input.status.map(|status| status.as_str().to_string()),
        kind: input.kind.map(|kind| kind.as_str().to_string()),
        ticket_id: input.ticket_id,
    };
    let records = project::list_backlog(&conn, &filters)?;

    if input.json {
        println!("{}", serde_json::to_string(&records)?);
    } else if records.is_empty() {
        println!("No backlog items");
    } else {
        for record in records {
            print_compact_record(&record);
        }
    }

    Ok(())
}

pub fn show(backlog_id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let record = project::get_backlog(&conn, backlog_id)?
        .ok_or_else(|| anyhow!("backlog item {backlog_id} not found"))?;

    print_record(&record, json)?;
    Ok(())
}

pub fn status(input: BacklogStatusInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let status = input.status.as_str();
    let resolved_at = if matches!(input.status, BacklogStatusArg::Resolved) {
        Some(now.as_str())
    } else {
        None
    };

    project::update_backlog_status(
        &tx,
        &input.backlog_id,
        status,
        input.note.as_deref(),
        resolved_at,
        &now,
    )?;
    let record = project::get_backlog(&tx, &input.backlog_id)?
        .ok_or_else(|| anyhow!("backlog item {} not found", input.backlog_id))?;
    let records = project::list_backlog(&tx, &BacklogListFilters::default())?;

    let backlog_file = root.join("loci/backlog.md");
    let previous_backlog = if backlog_file.exists() {
        Some(std::fs::read_to_string(&backlog_file)?)
    } else {
        None
    };
    let existing = previous_backlog
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::backlog_md().to_string());
    let updated = backlog::render_backlog_markdown(&existing, &records);
    if let Some(parent) = backlog_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&backlog_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_backlog {
            let _ = std::fs::write(&backlog_file, previous);
        } else {
            let _ = std::fs::remove_file(&backlog_file);
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

fn print_record(record: &BacklogRecord, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string(record)?);
    } else {
        print_compact_record(record);
    }

    Ok(())
}

fn print_compact_record(record: &BacklogRecord) {
    println!(
        "{} [{}] {} - {}",
        record.id, record.status, record.kind, record.title
    );
}
