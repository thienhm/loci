use anyhow::Result;

use crate::app::{DecisionStatusArg, DecisionVerificationOutcomeArg};
use crate::decision;

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
    println!("decision add is not implemented yet");
    Ok(())
}

pub fn list(_input: DecisionListInput) -> Result<()> {
    println!("decision list is not implemented yet");
    Ok(())
}

pub fn show(_decision_id: &str, _json: bool) -> Result<()> {
    println!("decision show is not implemented yet");
    Ok(())
}

pub fn verify(_input: DecisionVerifyInput) -> Result<()> {
    println!("decision verify is not implemented yet");
    Ok(())
}
