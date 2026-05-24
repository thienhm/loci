use std::collections::BTreeMap;

use anyhow::{anyhow, Result};

use crate::db::connect_project_db;
use crate::domain::WorkflowCommandResponse;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub struct PlanInput {
    pub id: String,
    pub steps: Vec<String>,
    pub json: bool,
}

pub fn run(input: PlanInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} does not exist", input.id))?;

    let ticket_dir = packet::ticket_dir(&root, &input.id);
    std::fs::create_dir_all(&ticket_dir)?;

    let plan_path = packet::relative_ticket_doc_path(&input.id, "plan.md");
    let plan_file = ticket_dir.join("plan.md");
    let plan_body = templates::checklist(&input.steps);
    let plan = if plan_file.exists() {
        let existing = std::fs::read_to_string(&plan_file)?;
        packet::set_section(&existing, "Implementation Steps", &plan_body)
    } else {
        templates::plan_packet_md(&input.id, &input.steps)
    };
    std::fs::write(&plan_file, plan)?;

    project::update_ticket_packet_paths_and_state(
        &conn,
        &input.id,
        None,
        None,
        None,
        Some(&plan_path),
        None,
    )?;
    let ticket = project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} does not exist", input.id))?;

    let mut docs = BTreeMap::new();
    docs.insert("plan.md".to_string(), plan_path);
    let response = WorkflowCommandResponse {
        ok: true,
        ticket,
        docs,
    };

    if input.json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!("Planned {}", response.ticket.id);
    }

    Ok(())
}
