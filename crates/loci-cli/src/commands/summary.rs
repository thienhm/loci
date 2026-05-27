use anyhow::{anyhow, Result};

use crate::db::connect_project_db;
use crate::domain::SummaryCommandResponse;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::review;
use crate::templates;

pub fn run(id: &str, text: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;

    let summary_path = packet::relative_ticket_doc_path(id, "summary.md");
    let summary_file = packet::ticket_dir(&root, id).join("summary.md");
    let existing = if summary_file.exists() {
        std::fs::read_to_string(&summary_file)?
    } else {
        templates::summary_packet_md(id)
    };
    let updated = review::render_summary_markdown(&existing, text);
    if let Some(parent) = summary_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&summary_file, updated)?;

    project::update_ticket_summary_path(&conn, id, &summary_path)?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let response = SummaryCommandResponse { ok: true, ticket };

    if json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!("Updated summary for {}", response.ticket.id);
    }

    Ok(())
}
