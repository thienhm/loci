use anyhow::{anyhow, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::app::{EvidenceOutcomeArg, EvidenceTypeArg, ValidationLayerArg};
use crate::db::connect_project_db;
use crate::domain::EvidenceRecord;
use crate::evidence;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;

pub struct EvidenceAddInput {
    pub id: String,
    pub evidence_type: EvidenceTypeArg,
    pub title: String,
    pub summary: Option<String>,
    pub layer: Option<ValidationLayerArg>,
    pub command: Option<String>,
    pub path: Option<String>,
    pub url: Option<String>,
    pub note: Option<String>,
    pub outcome: Option<EvidenceOutcomeArg>,
    pub json: bool,
}

pub fn add(input: EvidenceAddInput) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    project::get_ticket(&tx, &input.id)?
        .ok_or_else(|| anyhow!("ticket {} does not exist", input.id))?;

    let id = project::next_evidence_id(&tx)?;
    let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let record = EvidenceRecord {
        id,
        ticket_id: input.id.clone(),
        evidence_type: input.evidence_type.as_str().to_string(),
        layer: input.layer.map(|layer| layer.as_str().to_string()),
        title: input.title,
        summary: input.summary,
        command: input.command,
        artifact_path: input.path,
        url: input.url,
        note: input.note,
        exit_code: None,
        outcome: input
            .outcome
            .map(|outcome| outcome.as_str().to_string())
            .unwrap_or_else(|| "informational".to_string()),
        created_at: now,
    };

    project::insert_evidence(&tx, &record)?;
    let evidence_path = packet::relative_ticket_doc_path(&input.id, "evidence.md");
    project::update_ticket_evidence_path(&tx, &input.id, &evidence_path)?;
    let records = project::list_evidence_for_ticket(&tx, &input.id)?;

    let evidence_file = packet::ticket_dir(&root, &input.id).join("evidence.md");
    let previous_evidence = if evidence_file.exists() {
        Some(std::fs::read_to_string(&evidence_file)?)
    } else {
        None
    };
    let existing = previous_evidence
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| templates::evidence_packet_md(&input.id));
    let updated = evidence::render_evidence_markdown(&existing, &records);
    if let Some(parent) = evidence_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&evidence_file, updated)?;

    if let Err(error) = tx.commit() {
        if let Some(previous) = previous_evidence {
            let _ = std::fs::write(&evidence_file, previous);
        } else {
            let _ = std::fs::remove_file(&evidence_file);
        }
        return Err(error.into());
    }

    if input.json {
        println!("{}", serde_json::to_string(&record)?);
    } else {
        println!("Recorded {} for {}", record.id, record.ticket_id);
    }

    Ok(())
}

pub fn list(_id: &str, _json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    project::get_ticket(&conn, _id)?.ok_or_else(|| anyhow!("ticket {_id} does not exist"))?;
    let records = project::list_evidence_for_ticket(&conn, _id)?;

    if _json {
        println!("{}", serde_json::to_string(&records)?);
    } else if records.is_empty() {
        println!("No evidence recorded for {_id}");
    } else {
        for record in records {
            println!(
                "{} [{}] {} - {}",
                record.id, record.evidence_type, record.title, record.outcome
            );
        }
    }

    Ok(())
}

pub fn show(_evidence_id: &str, _json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let record = project::get_evidence(&conn, _evidence_id)?
        .ok_or_else(|| anyhow!("evidence {_evidence_id} not found"))?;

    if _json {
        println!("{}", serde_json::to_string(&record)?);
    } else {
        println!(
            "{} [{}] {} - {}",
            record.id, record.evidence_type, record.title, record.outcome
        );
        if let Some(summary) = record.summary {
            println!("{summary}");
        }
    }

    Ok(())
}
