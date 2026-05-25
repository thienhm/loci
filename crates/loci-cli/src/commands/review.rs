use anyhow::{anyhow, bail, Result};

use crate::db::connect_project_db;
use crate::domain::{ReviewCommandResponse, TicketRecord};
use crate::paths::find_workspace_root;
use crate::project;
use crate::review;

pub fn run(id: &str, skip_validation: Option<&str>, json: bool) -> Result<()> {
    if skip_validation.is_some_and(|reason| reason.trim().is_empty()) {
        bail!("skip validation reason cannot be empty");
    }

    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let summary = read_summary(&root, &ticket)?;
    let evidence_count = project::list_evidence_for_ticket(&conn, id)?.len();
    let missing =
        review::evaluate_review(&ticket, summary.as_deref(), evidence_count, skip_validation);

    if !missing.is_empty() {
        let response = ReviewCommandResponse {
            ok: false,
            ready_for_review: false,
            ticket,
            missing,
        };
        if json {
            println!("{}", serde_json::to_string(&response)?);
        } else {
            println!("{id} is not ready for review");
        }
        bail!("review gates failed");
    }

    let validation_state = skip_validation.map(|_| "skipped");
    project::update_ticket_review_state(&conn, id, "in_review", "ready", validation_state)?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let response = ReviewCommandResponse {
        ok: true,
        ready_for_review: true,
        ticket,
        missing: Vec::new(),
    };

    if json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!("{id} is ready for review");
    }

    Ok(())
}

fn read_summary(root: &std::path::Path, ticket: &TicketRecord) -> Result<Option<String>> {
    let Some(path) = ticket.summary_path.as_deref() else {
        return Ok(None);
    };
    let path = root.join(path);
    if path.is_file() {
        Ok(Some(std::fs::read_to_string(path)?))
    } else {
        Ok(None)
    }
}
