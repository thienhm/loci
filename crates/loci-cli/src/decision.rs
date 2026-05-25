use anyhow::{bail, Result};

use crate::domain::DecisionRecord;

pub const EMPTY_TITLE_ERROR: &str = "decision title cannot be empty";
pub const EMPTY_VERIFY_NOTE_ERROR: &str = "decision verification note cannot be empty";
pub const DECISION_BEGIN: &str = "<!-- LOCI:DECISION:BEGIN -->";
pub const DECISION_END: &str = "<!-- LOCI:DECISION:END -->";

pub fn validate_required_text(value: &str, error: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        bail!(error);
    }

    Ok(())
}

pub fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_separator = false;

    for char in title.trim().chars().flat_map(char::to_lowercase) {
        if char.is_ascii_alphanumeric() {
            slug.push(char);
            previous_was_separator = false;
        } else if !previous_was_separator && !slug.is_empty() {
            slug.push('-');
            previous_was_separator = true;
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        "decision".to_string()
    } else {
        slug
    }
}

pub fn doc_path_for(id: &str, title: &str) -> String {
    let suffix = id
        .strip_prefix("DEC-")
        .and_then(|value| value.parse::<u64>().ok())
        .map(|value| format!("{value:04}"))
        .unwrap_or_else(|| id.to_ascii_lowercase());

    format!("loci/decisions/{}-{}.md", suffix, slugify_title(title))
}

pub fn render_decision_markdown(existing: &str, record: &DecisionRecord) -> String {
    let generated = render_generated_section(record);

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

fn render_generated_section(record: &DecisionRecord) -> String {
    let mut section = String::new();
    section.push_str(DECISION_BEGIN);
    section.push_str("\n## Decision\n\n");
    section.push_str(&format!("- ID: `{}`\n", record.id));
    section.push_str(&format!("- Status: `{}`\n", record.status));
    section.push_str(&format!(
        "- Verification: `{}`\n",
        record.verification_outcome
    ));
    push_list(&mut section, "Context", &record.context);
    push_list(&mut section, "Decision", &record.decision);
    push_list(&mut section, "Consequences", &record.consequences);
    push_code_list(&mut section, "Tickets", &record.ticket_ids);
    push_code_list(&mut section, "Traces", &record.trace_ids);
    push_code_list(&mut section, "Docs", &record.doc_paths);
    section.push('\n');
    section.push_str(DECISION_END);
    section.push('\n');
    section
}

fn push_list(section: &mut String, title: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }

    section.push_str(&format!("\n### {title}\n\n"));
    for value in values {
        section.push_str(&format!("- {}\n", value.trim()));
    }
}

fn push_code_list(section: &mut String, title: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }

    section.push_str(&format!("\n### {title}\n\n"));
    for value in values {
        section.push_str(&format!("- `{}`\n", value.trim()));
    }
}

fn marker_bounds(markdown: &str) -> Option<(usize, usize)> {
    let start = markdown.find(DECISION_BEGIN)?;
    let end_marker_start = markdown[start..].find(DECISION_END)? + start;
    let end = end_marker_start + DECISION_END.len();
    Some((start, end))
}
