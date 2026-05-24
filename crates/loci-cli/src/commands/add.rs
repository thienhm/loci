use anyhow::{anyhow, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::PriorityArg;
use crate::db::connect_project_db;
use crate::domain::TicketRecord;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub fn run(title: &str, priority: PriorityArg, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let project_record = project::get_project(&tx)?;
    let id = project::next_ticket_id(&tx, &project_record.prefix)?;
    let story_path = packet::relative_ticket_doc_path(&id, "story.md");
    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;

    let ticket = TicketRecord {
        id: id.clone(),
        title: title.to_string(),
        status: "idea".to_string(),
        priority: priority.as_str().to_string(),
        assignee: None,
        labels: Vec::new(),
        progress: 0,
        risk_lane: "normal".to_string(),
        readiness_state: "missing".to_string(),
        validation_state: "missing".to_string(),
        review_state: "not_ready".to_string(),
        created_at: now.clone(),
        updated_at: now,
        story_path: Some(story_path.clone()),
        design_path: None,
        plan_path: None,
        validation_path: None,
        evidence_path: None,
        summary_path: None,
        lessons_path: None,
        harness_delta_path: None,
    };

    let story_file = packet::ticket_dir(&root, &id).join("story.md");
    project::insert_ticket(&tx, &ticket)?;
    packet::write_new(&story_file, &templates::story_packet_md(&id, title))?;
    if let Err(error) = tx.commit() {
        let _ = std::fs::remove_file(&story_file);
        return Err(error.into());
    }

    if json {
        println!("{}", serde_json::to_string(&ticket)?);
    } else {
        println!("Created {} at {}", ticket.id, story_path);
    }

    Ok(())
}
