use anyhow::{anyhow, bail, Result};

use crate::db::connect_project_db;
use crate::paths::find_workspace_root;
use crate::project;

#[derive(Debug)]
pub struct PatchInput {
    pub id: String,
    pub assignee: Option<String>,
    pub clear_assignee: bool,
    pub progress: Option<i64>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub json: bool,
}

pub fn run(input: PatchInput) -> Result<()> {
    if input.assignee.is_none()
        && !input.clear_assignee
        && input.progress.is_none()
        && input.priority.is_none()
        && input.labels.is_none()
    {
        bail!("no fields to update. Use --assignee, --progress, --priority, or --labels.");
    }

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let mut ticket = project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} not found", input.id))?;

    if input.clear_assignee {
        ticket.assignee = None;
    } else if let Some(assignee) = input.assignee {
        ticket.assignee = Some(assignee);
    }

    if let Some(progress) = input.progress {
        if !(0..=100).contains(&progress) {
            bail!("invalid progress {progress}. Expected a value between 0 and 100.");
        }
        ticket.progress = progress;
    }

    if let Some(priority) = input.priority {
        if !matches!(priority.as_str(), "low" | "medium" | "high") {
            bail!("invalid priority \"{priority}\". Expected low, medium, or high.");
        }
        ticket.priority = priority;
    }

    if let Some(labels) = input.labels {
        ticket.labels = labels;
    }

    project::update_ticket_mutable_fields(
        &conn,
        &input.id,
        &ticket.status,
        &ticket.priority,
        ticket.assignee.as_deref(),
        &ticket.labels,
        ticket.progress,
    )?;

    let updated = project::get_ticket(&conn, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} not found", input.id))?;

    if input.json {
        println!("{}", serde_json::to_string(&updated)?);
    } else {
        println!("Updated {}", input.id);
    }

    Ok(())
}
