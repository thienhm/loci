use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{anyhow, bail, Result};

use crate::db::connect_project_db;
use crate::domain::{ReadyCommandResponse, TicketRecord};
use crate::paths::find_workspace_root;
use crate::project;
use crate::readiness;

pub fn run(id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let docs = read_docs(&root, &ticket)?;
    let report = readiness::evaluate_readiness(&ticket, &docs);

    if !report.ready {
        let response = ReadyCommandResponse {
            ok: false,
            ready: false,
            ticket,
            missing: report.missing,
        };
        if json {
            println!("{}", serde_json::to_string(&response)?);
        } else {
            println!("{} is not ready:", response.ticket.id);
            for field in &response.missing {
                println!("- {}: {}", field.code, field.message);
            }
        }
        bail!("workflow packet is not ready");
    }

    project::update_ticket_readiness(&conn, id, "ready", "ready")?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let response = ReadyCommandResponse {
        ok: true,
        ready: true,
        ticket,
        missing: Vec::new(),
    };

    if json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!("{} is ready", response.ticket.id);
    }

    Ok(())
}

fn read_docs(root: &Path, ticket: &TicketRecord) -> Result<BTreeMap<String, String>> {
    let mut docs = BTreeMap::new();

    for path in doc_paths(ticket) {
        let absolute_path = root.join(path);
        if absolute_path.is_file() {
            let filename = absolute_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string());
            docs.insert(filename, std::fs::read_to_string(absolute_path)?);
        }
    }

    Ok(docs)
}

fn doc_paths(ticket: &TicketRecord) -> impl Iterator<Item = &str> {
    [
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
}
