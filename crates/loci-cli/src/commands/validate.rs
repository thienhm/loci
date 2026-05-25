use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, bail, Result};
use rusqlite::TransactionBehavior;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::db::connect_project_db;
use crate::domain::{
    EvidenceRecord, MissingReadinessField, ValidationCommandResult, ValidationInspectionResponse,
    ValidationRunRecord, ValidationRunResponse,
};
use crate::evidence;
use crate::packet;
use crate::paths::find_workspace_root;
use crate::project;
use crate::templates;
use crate::validation;

const CAPTURE_LIMIT: usize = 4000;

pub fn run(id: &str, should_run: bool, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let mut conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let ticket = project::get_ticket(&conn, id)?.ok_or_else(|| anyhow!("ticket {id} not found"))?;
    let declared_commands = read_declared_commands(&root, &ticket)?;

    if !should_run {
        let evidence_count = project::list_evidence_for_ticket(&conn, id)?.len();
        let summary_present = ticket
            .summary_path
            .as_deref()
            .map(|path| root.join(path).is_file())
            .unwrap_or(false);
        let missing = inspection_missing(evidence_count, summary_present, &ticket.validation_state);
        let response = ValidationInspectionResponse {
            ok: true,
            ticket_id: id.to_string(),
            validation_state: ticket.validation_state,
            review_state: ticket.review_state,
            declared_commands,
            evidence_count,
            summary_present,
            ready_for_review: missing.is_empty(),
            missing,
        };

        if json {
            println!("{}", serde_json::to_string(&response)?);
        } else {
            println!(
                "{} validation: {}",
                response.ticket_id, response.validation_state
            );
            for command in &response.declared_commands {
                println!("- {command}");
            }
        }
        return Ok(());
    }

    if declared_commands.is_empty() {
        bail!("no validation commands declared");
    }

    let mut results = Vec::new();
    let mut any_failed = false;

    for command in declared_commands {
        let started_at = OffsetDateTime::now_utc().format(&Rfc3339)?;
        let output = run_declared_command(&root, &command)?;
        let finished_at = OffsetDateTime::now_utc().format(&Rfc3339)?;
        let status = if output.exit_code == Some(0) {
            "passing"
        } else {
            any_failed = true;
            "failing"
        };

        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let evidence_id = project::next_evidence_id(&tx)?;
        let validation_run_id = project::next_validation_run_id(&tx)?;
        let now = OffsetDateTime::now_utc().format(&Rfc3339)?;
        let record = EvidenceRecord {
            id: evidence_id.clone(),
            ticket_id: id.to_string(),
            evidence_type: "command".to_string(),
            layer: None,
            title: format!("Validation command: {command}"),
            summary: Some(output.summary()),
            command: Some(command.clone()),
            artifact_path: None,
            url: None,
            note: None,
            exit_code: output.exit_code.map(i64::from),
            outcome: status.to_string(),
            created_at: now.clone(),
        };
        project::insert_evidence(&tx, &record)?;
        let validation_run = ValidationRunRecord {
            id: validation_run_id,
            ticket_id: id.to_string(),
            command: command.clone(),
            status: status.to_string(),
            exit_code: output.exit_code,
            evidence_id: evidence_id.clone(),
            started_at,
            finished_at,
            created_at: now,
        };
        project::insert_validation_run(&tx, &validation_run)?;
        let validation_state = if any_failed { "failing" } else { "passing" };
        project::update_ticket_validation_state(&tx, id, validation_state)?;
        let evidence_path = packet::relative_ticket_doc_path(id, "evidence.md");
        project::update_ticket_evidence_path(&tx, id, &evidence_path)?;
        let records = project::list_evidence_for_ticket(&tx, id)?;
        let evidence_file = packet::ticket_dir(&root, id).join("evidence.md");
        let previous_evidence = if evidence_file.exists() {
            Some(std::fs::read_to_string(&evidence_file)?)
        } else {
            None
        };
        write_evidence_markdown(&root, id, &records)?;
        if let Err(error) = tx.commit() {
            if let Some(previous) = previous_evidence {
                let _ = std::fs::write(&evidence_file, previous);
            } else {
                let _ = std::fs::remove_file(&evidence_file);
            }
            return Err(error.into());
        }

        results.push(ValidationCommandResult {
            command,
            status: status.to_string(),
            exit_code: output.exit_code,
            evidence_id,
        });
    }

    let validation_state = if any_failed { "failing" } else { "passing" };
    let response = ValidationRunResponse {
        ok: !any_failed,
        ticket_id: id.to_string(),
        validation_state: validation_state.to_string(),
        results,
    };

    if json {
        println!("{}", serde_json::to_string(&response)?);
    } else {
        println!(
            "{} validation: {}",
            response.ticket_id, response.validation_state
        );
    }

    if any_failed {
        bail!("validation failed");
    }

    Ok(())
}

struct CommandOutput {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

impl CommandOutput {
    fn summary(&self) -> String {
        let mut summary = String::new();
        summary.push_str(&format!("exit_code: {:?}\n", self.exit_code));
        if !self.stdout.is_empty() {
            summary.push_str("\nstdout:\n");
            summary.push_str(&truncate(&self.stdout));
        }
        if !self.stderr.is_empty() {
            summary.push_str("\nstderr:\n");
            summary.push_str(&truncate(&self.stderr));
        }
        summary
    }
}

fn read_declared_commands(
    root: &Path,
    ticket: &crate::domain::TicketRecord,
) -> Result<Vec<String>> {
    let project_validation = read_optional(root.join("loci/validation.md"))?;
    let ticket_validation = ticket
        .validation_path
        .as_deref()
        .map(|path| read_optional(root.join(path)))
        .transpose()?
        .flatten();

    Ok(validation::declared_commands(
        project_validation.as_deref(),
        ticket_validation.as_deref(),
    ))
}

fn read_optional(path: PathBuf) -> Result<Option<String>> {
    if path.is_file() {
        Ok(Some(std::fs::read_to_string(path)?))
    } else {
        Ok(None)
    }
}

fn inspection_missing(
    evidence_count: usize,
    summary_present: bool,
    validation_state: &str,
) -> Vec<MissingReadinessField> {
    let mut missing = Vec::new();
    if evidence_count == 0 {
        missing.push(MissingReadinessField {
            code: "evidence.records".to_string(),
            message: "At least one evidence record is required.".to_string(),
        });
    }
    if !summary_present {
        missing.push(MissingReadinessField {
            code: "summary.doc".to_string(),
            message: "summary.md is required.".to_string(),
        });
    }
    if validation_state != "passing" {
        missing.push(MissingReadinessField {
            code: "validation.state".to_string(),
            message: "Validation must be passing or skipped with an explicit reason.".to_string(),
        });
    }
    missing
}

fn run_declared_command(root: &Path, command: &str) -> Result<CommandOutput> {
    if has_shell_metacharacter(command) {
        return Ok(CommandOutput {
            exit_code: None,
            stdout: String::new(),
            stderr: format!("validation command uses unsupported shell syntax: {command}"),
        });
    }
    let mut parts = command.split_whitespace();
    let program = parts
        .next()
        .ok_or_else(|| anyhow!("validation command is empty"))?;
    let output = Command::new(program).args(parts).current_dir(root).output();

    let output = match output {
        Ok(output) => output,
        Err(error) => {
            return Ok(CommandOutput {
                exit_code: None,
                stdout: String::new(),
                stderr: format!("failed to run validation command `{command}`: {error}"),
            });
        }
    };

    Ok(CommandOutput {
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn write_evidence_markdown(root: &Path, id: &str, records: &[EvidenceRecord]) -> Result<()> {
    let evidence_file = packet::ticket_dir(root, id).join("evidence.md");
    let existing = if evidence_file.exists() {
        std::fs::read_to_string(&evidence_file)?
    } else {
        templates::evidence_packet_md(id)
    };
    let updated = evidence::render_evidence_markdown(&existing, records);
    if let Some(parent) = evidence_file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(evidence_file, updated)?;
    Ok(())
}

fn has_shell_metacharacter(command: &str) -> bool {
    command
        .chars()
        .any(|char| matches!(char, '|' | '&' | ';' | '<' | '>' | '$' | '`'))
}

fn truncate(value: &str) -> String {
    if value.len() <= CAPTURE_LIMIT {
        return value.to_string();
    }
    let truncated: String = value.chars().take(CAPTURE_LIMIT).collect();
    format!("{truncated}...")
}
