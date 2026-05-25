use anyhow::{bail, Result};

use crate::domain::TraceRecord;

pub const EMPTY_SUMMARY_ERROR: &str = "trace summary cannot be empty";
pub const EMPTY_ACTOR_ERROR: &str = "trace actor cannot be empty";
pub const TRACE_BEGIN: &str = "<!-- LOCI:TRACE:BEGIN -->";
pub const TRACE_END: &str = "<!-- LOCI:TRACE:END -->";

pub fn validate_required_text(value: &str, error: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        bail!(error);
    }

    Ok(())
}

pub fn render_trace_markdown(existing: &str, records: &[TraceRecord]) -> String {
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

fn render_generated_section(records: &[TraceRecord]) -> String {
    let mut section = String::new();
    section.push_str(TRACE_BEGIN);
    section.push_str("\n## Operational Trace\n\n");

    if records.is_empty() {
        section.push_str("_No trace records._\n");
    } else {
        for record in records {
            section.push_str(&format!(
                "- `{}` [{}] {} - {} - {}",
                record.id, record.event_type, record.actor, record.outcome, record.task_summary
            ));
            push_list(&mut section, "Files read", &record.files_read);
            push_list(&mut section, "Files changed", &record.files_changed);
            push_list(&mut section, "Commands", &record.commands);
            push_list(&mut section, "Evidence", &record.evidence_ids);
            section.push('\n');
        }
    }

    section.push_str(TRACE_END);
    section.push('\n');
    section
}

fn push_list(section: &mut String, label: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }
    let rendered = values
        .iter()
        .map(|value| format!("`{value}`"))
        .collect::<Vec<_>>()
        .join(", ");
    section.push_str(&format!("\n  - {label}: {rendered}"));
}

fn marker_bounds(markdown: &str) -> Option<(usize, usize)> {
    let start = markdown.find(TRACE_BEGIN)?;
    let end_marker_start = markdown[start..].find(TRACE_END)? + start;
    let end = end_marker_start + TRACE_END.len();
    Some((start, end))
}
