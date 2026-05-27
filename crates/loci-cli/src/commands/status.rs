use anyhow::{anyhow, bail, Result};

use crate::db::connect_project_db;
use crate::paths::find_workspace_root;
use crate::project;

pub fn run(id: &str, status: &str, json: bool) -> Result<()> {
    let normalized = normalize_status(status)?;

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;

    project::update_ticket_mutable_fields(
        &conn,
        id,
        normalized,
        &ticket.priority,
        ticket.assignee.as_deref(),
        &ticket.labels,
        ticket.progress,
    )?;

    let updated =
        project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;

    if json {
        println!("{}", serde_json::to_string(&updated)?);
    } else {
        println!("Updated {}: {} -> {}", id, ticket.status, updated.status);
    }

    Ok(())
}

fn normalize_status(status: &str) -> Result<&str> {
    match status {
        "todo" => Ok("idea"),
        "idea" | "shaped" | "ready" | "in_progress" | "in_review" | "done" => Ok(status),
        _ => bail!("invalid status \"{status}\". Expected todo, idea, shaped, ready, in_progress, in_review, or done."),
    }
}
