use anyhow::{bail, Result};

use crate::domain::BacklogRecord;

pub const EMPTY_TITLE_ERROR: &str = "backlog title cannot be empty";
pub const BACKLOG_BEGIN: &str = "<!-- LOCI:BACKLOG:BEGIN -->";
pub const BACKLOG_END: &str = "<!-- LOCI:BACKLOG:END -->";

pub fn validate_required_text(value: &str, error: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        bail!(error);
    }

    Ok(())
}

pub fn render_backlog_markdown(existing: &str, records: &[BacklogRecord]) -> String {
    let generated = render_generated_section(records);

    if let Some((start, end)) = marker_bounds(existing) {
        let mut updated = String::new();
        updated.push_str(existing[..start].trim_end());
        if !updated.is_empty() {
            updated.push_str("\n\n");
        }
        updated.push_str(&generated);
        if end < existing.len() {
            updated.push_str("\n\n");
            updated.push_str(existing[end..].trim_start());
        }
        return updated;
    }

    let mut updated = existing.trim_end().to_string();
    if !updated.is_empty() {
        updated.push_str("\n\n");
    }
    updated.push_str(&generated);
    updated
}

fn render_generated_section(records: &[BacklogRecord]) -> String {
    let mut section = String::new();
    section.push_str(BACKLOG_BEGIN);
    section.push_str("\n## Harness Backlog Index\n\n");

    if records.is_empty() {
        section.push_str("_No harness backlog items recorded._\n");
    } else {
        for record in records {
            section.push_str(&format!(
                "- `{}` [{}] {} - {}",
                record.id, record.status, record.kind, record.title
            ));
            push_list(&mut section, "Sources", &record.sources);
            push_list(&mut section, "Impact", &record.impact);
            push_list(&mut section, "Recommendations", &record.recommendations);
            push_refs(&mut section, "Tickets", &record.ticket_ids);
            push_refs(&mut section, "Traces", &record.trace_ids);
            push_refs(&mut section, "Docs", &record.doc_paths);
            if let Some(note) = record.resolution_note.as_deref() {
                section.push_str(&format!("\n  - Resolution: {}", note.trim()));
            }
            if let Some(resolved_at) = record.resolved_at.as_deref() {
                section.push_str(&format!("\n  - Resolved At: `{}`", resolved_at.trim()));
            }
            section.push('\n');
        }
    }

    section.push_str(BACKLOG_END);
    section.push('\n');
    section
}

fn push_list(section: &mut String, label: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }

    let rendered = values
        .iter()
        .map(|value| value.trim())
        .collect::<Vec<_>>()
        .join("; ");
    section.push_str(&format!("\n  - {label}: {rendered}"));
}

fn push_refs(section: &mut String, label: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }

    let rendered = values
        .iter()
        .map(|value| format!("`{}`", value.trim()))
        .collect::<Vec<_>>()
        .join(", ");
    section.push_str(&format!("\n  - {label}: {rendered}"));
}

fn marker_bounds(markdown: &str) -> Option<(usize, usize)> {
    let start = markdown.find(BACKLOG_BEGIN)?;
    let end_marker_start = markdown[start..].find(BACKLOG_END)? + start;
    let end = end_marker_start + BACKLOG_END.len();
    Some((start, end))
}
