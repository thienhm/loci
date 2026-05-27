use anyhow::{anyhow, bail, Result};
use serde::Serialize;

use crate::db::connect_project_db;
use crate::domain::TicketRecord;
use crate::paths::find_workspace_root;
use crate::project;

#[derive(Serialize)]
struct DocReadResponse {
    content: String,
}

#[derive(Serialize)]
struct DocWriteResponse {
    ok: bool,
}

pub fn read(id: &str, filename: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;

    let path = known_doc_path(&ticket, filename)?;
    let content = std::fs::read_to_string(root.join(path))?;

    if json {
        println!("{}", serde_json::to_string(&DocReadResponse { content })?);
    } else {
        print!("{content}");
    }

    Ok(())
}

pub fn write(id: &str, filename: &str, content: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;

    let path = known_doc_path(&ticket, filename)?;
    let absolute = root.join(path);
    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(absolute, content)?;

    project::update_ticket_mutable_fields(
        &conn,
        id,
        &ticket.status,
        &ticket.priority,
        ticket.assignee.as_deref(),
        &ticket.labels,
        ticket.progress,
    )?;

    if json {
        println!("{}", serde_json::to_string(&DocWriteResponse { ok: true })?);
    } else {
        println!("Written {filename} for {id}");
    }

    Ok(())
}

fn known_doc_path<'a>(ticket: &'a TicketRecord, filename: &str) -> Result<&'a str> {
    for path in [
        ticket.story_path.as_deref(),
        ticket.design_path.as_deref(),
        ticket.plan_path.as_deref(),
        ticket.validation_path.as_deref(),
        ticket.evidence_path.as_deref(),
        ticket.summary_path.as_deref(),
        ticket.lessons_path.as_deref(),
        ticket.harness_delta_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if std::path::Path::new(path)
            .file_name()
            .map(|name| name.to_string_lossy() == filename)
            .unwrap_or(false)
        {
            return Ok(path);
        }
    }

    bail!(
        "Unknown doc \"{filename}\" for ticket {}. Use one of the known mapped docs for this ticket.",
        ticket.id
    )
}
