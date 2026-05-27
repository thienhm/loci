use crate::domain::{MissingReadinessField, TicketRecord};
use crate::packet;

pub const SUMMARY_BEGIN: &str = "<!-- LOCI:SUMMARY:BEGIN -->";
pub const SUMMARY_END: &str = "<!-- LOCI:SUMMARY:END -->";

pub fn render_summary_markdown(existing: &str, text: &str) -> String {
    let generated = format!(
        "{SUMMARY_BEGIN}\n## Implementation Summary\n\n{}\n{SUMMARY_END}\n",
        text.trim()
    );

    if let Some((start, end)) = marker_bounds(existing, SUMMARY_BEGIN, SUMMARY_END) {
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

pub fn summary_has_meaningful_content(markdown: &str) -> bool {
    marker_bounds(markdown, SUMMARY_BEGIN, SUMMARY_END)
        .map(|(start, end)| {
            let body_start = start + SUMMARY_BEGIN.len();
            let body_end = end.saturating_sub(SUMMARY_END.len());
            packet::section_has_meaningful_content(
                &markdown[body_start..body_end],
                "Implementation Summary",
            )
        })
        .unwrap_or_else(|| packet::has_meaningful_content(markdown))
}

pub fn evaluate_review(
    ticket: &TicketRecord,
    summary: Option<&str>,
    evidence_count: usize,
    trace_count: usize,
    skip_validation_reason: Option<&str>,
) -> Vec<MissingReadinessField> {
    let mut missing = Vec::new();

    match summary {
        Some(markdown) if summary_has_meaningful_content(markdown) => {}
        _ => missing.push(field("summary.doc", "summary.md is required.")),
    }

    if evidence_count == 0 {
        missing.push(field(
            "evidence.records",
            "At least one evidence record is required.",
        ));
    }

    if trace_count == 0 {
        missing.push(field(
            "trace.records",
            "At least one trace record is required.",
        ));
    }

    let skip_reason = skip_validation_reason
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match (ticket.validation_state.as_str(), skip_reason.is_some()) {
        ("passing", _) => {}
        (_, true) => {}
        _ => missing.push(field(
            "validation.state",
            "Validation must be passing or skipped with an explicit reason.",
        )),
    }

    if !matches!(ticket.status.as_str(), "ready" | "in_progress") {
        missing.push(field(
            "ticket.status",
            "Ticket must be ready or in_progress before review.",
        ));
    }

    missing
}

fn marker_bounds(markdown: &str, begin: &str, end: &str) -> Option<(usize, usize)> {
    let start = markdown.find(begin)?;
    let end_marker_start = markdown[start..].find(end)? + start;
    Some((start, end_marker_start + end.len()))
}

fn field(code: &str, message: &str) -> MissingReadinessField {
    MissingReadinessField {
        code: code.to_string(),
        message: message.to_string(),
    }
}
