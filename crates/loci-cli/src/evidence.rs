use crate::domain::EvidenceRecord;

pub const EVIDENCE_BEGIN: &str = "<!-- LOCI:EVIDENCE:BEGIN -->";
pub const EVIDENCE_END: &str = "<!-- LOCI:EVIDENCE:END -->";

pub fn render_evidence_markdown(existing: &str, records: &[EvidenceRecord]) -> String {
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

fn render_generated_section(records: &[EvidenceRecord]) -> String {
    let mut section = String::new();
    section.push_str(EVIDENCE_BEGIN);
    section.push_str("\n## Evidence Index\n\n");

    if records.is_empty() {
        section.push_str("_No evidence recorded._\n");
    } else {
        for record in records {
            section.push_str(&format!(
                "- `{}` [{}] {} - {}",
                record.id, record.evidence_type, record.title, record.outcome
            ));
            if let Some(summary) = record.summary.as_deref().filter(|value| !value.is_empty()) {
                section.push_str(&format!("\n  - Summary: {summary}"));
            }
            if let Some(note) = record.note.as_deref().filter(|value| !value.is_empty()) {
                section.push_str(&format!("\n  - Note: {note}"));
            }
            section.push('\n');
        }
    }

    section.push_str(EVIDENCE_END);
    section.push('\n');
    section
}

fn marker_bounds(markdown: &str) -> Option<(usize, usize)> {
    let start = markdown.find(EVIDENCE_BEGIN)?;
    let end_marker_start = markdown[start..].find(EVIDENCE_END)? + start;
    let end = end_marker_start + EVIDENCE_END.len();
    Some((start, end))
}
