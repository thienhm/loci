use std::collections::BTreeMap;

use anyhow::{anyhow, Result};

use crate::app::RiskLaneArg;
use crate::db::connect_project_db;
use crate::domain::WorkflowCommandResponse;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub struct ShapeInput {
    pub id: String,
    pub intent: Vec<String>,
    pub scope: Vec<String>,
    pub out_of_scope: Vec<String>,
    pub context: Vec<String>,
    pub acceptance: Vec<String>,
    pub risk_lane: RiskLaneArg,
    pub validation: Vec<String>,
    pub json: bool,
}

pub fn run(input: ShapeInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} does not exist", input.id))?;

    let ticket_dir = packet::ticket_dir(&root, &input.id);
    std::fs::create_dir_all(&ticket_dir)?;

    let story_path = packet::relative_ticket_doc_path(&input.id, "story.md");
    let validation_path = packet::relative_ticket_doc_path(&input.id, "validation.md");

    let story_file = ticket_dir.join("story.md");
    let mut story = if story_file.exists() {
        std::fs::read_to_string(&story_file)?
    } else {
        templates::story_packet_md(&input.id, &ticket.title)
    };
    story = packet::upsert_section(&story, "Intent", &paragraph(&input.intent));
    story = packet::upsert_section(&story, "Scope", &bullets(&input.scope));
    story = packet::upsert_section(&story, "Out of Scope", &bullets(&input.out_of_scope));
    story = packet::upsert_section(&story, "Context Links", &bullets(&input.context));
    story = packet::upsert_section(&story, "Acceptance Criteria", &checklist(&input.acceptance));
    story = packet::set_section(&story, "Risk Lane", input.risk_lane.as_str());
    std::fs::write(&story_file, story)?;

    let validation_file = ticket_dir.join("validation.md");
    let validation_body = checklist(&input.validation);
    let validation = if validation_file.exists() {
        let existing = std::fs::read_to_string(&validation_file)?;
        packet::upsert_section(&existing, "Validation Requirements", &validation_body)
    } else {
        templates::validation_packet_md(&input.id, &input.validation)
    };
    std::fs::write(&validation_file, validation)?;

    project::update_ticket_packet_paths_and_state(
        &conn,
        &input.id,
        Some("shaped"),
        Some(input.risk_lane.as_str()),
        Some(&story_path),
        None,
        Some(&validation_path),
    )?;
    let ticket = project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} does not exist", input.id))?;

    let mut docs = BTreeMap::new();
    docs.insert("story.md".to_string(), story_path);
    docs.insert("validation.md".to_string(), validation_path);
    let response = WorkflowCommandResponse {
        ok: true,
        ticket,
        docs,
    };

    if input.json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!("Shaped {}", response.ticket.id);
    }

    Ok(())
}

fn paragraph(items: &[String]) -> String {
    items
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn bullets(items: &[String]) -> String {
    items
        .iter()
        .map(|item| format!("- {}", item.trim()))
        .collect::<Vec<_>>()
        .join("\n")
}

fn checklist(items: &[String]) -> String {
    templates::checklist(items)
}
