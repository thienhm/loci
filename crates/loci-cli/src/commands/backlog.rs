use anyhow::Result;

use crate::app::{BacklogKindArg, BacklogStatusArg};
use crate::backlog;

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
    println!("backlog add is not implemented yet");
    Ok(())
}

pub fn list(_input: BacklogListInput) -> Result<()> {
    println!("backlog list is not implemented yet");
    Ok(())
}

pub fn show(_backlog_id: &str, _json: bool) -> Result<()> {
    println!("backlog show is not implemented yet");
    Ok(())
}

pub fn status(_input: BacklogStatusInput) -> Result<()> {
    println!("backlog status is not implemented yet");
    Ok(())
}
