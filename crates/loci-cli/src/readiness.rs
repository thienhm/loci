use std::collections::BTreeMap;

use crate::domain::{MissingReadinessField, ReadinessReport, TicketRecord};
use crate::packet;

pub fn evaluate_readiness(
    ticket: &TicketRecord,
    docs: &BTreeMap<String, String>,
) -> ReadinessReport {
    let mut missing = Vec::new();

    match docs.get("story.md") {
        Some(story) => {
            require_section(
                &mut missing,
                story,
                "Intent",
                "story.intent",
                "Story intent is missing.",
            );
            require_section(
                &mut missing,
                story,
                "Scope",
                "story.scope",
                "Story scope is missing.",
            );
            require_section(
                &mut missing,
                story,
                "Out of Scope",
                "story.out_of_scope",
                "Story out-of-scope section is missing.",
            );
            require_section(
                &mut missing,
                story,
                "Context Links",
                "story.context_links",
                "Story context links are missing.",
            );
            require_section(
                &mut missing,
                story,
                "Acceptance Criteria",
                "story.acceptance_criteria",
                "Story acceptance criteria are missing.",
            );
            require_section(
                &mut missing,
                story,
                "Risk Lane",
                "story.risk_lane",
                "Story risk lane is missing.",
            );
        }
        None => missing.push(field("story.doc", "story.md is missing.")),
    }

    match docs.get("validation.md") {
        Some(validation) => require_section(
            &mut missing,
            validation,
            "Validation Requirements",
            "validation.requirements",
            "Validation requirements are missing.",
        ),
        None => missing.push(field("validation.doc", "validation.md is missing.")),
    }

    match docs.get("plan.md") {
        Some(plan) if packet::has_checkable_step(plan) => {}
        Some(_) => missing.push(field("plan.steps", "Plan has no checkable steps.")),
        None => missing.push(field("plan.steps", "Plan has no checkable steps.")),
    }

    if ticket.risk_lane == "high_risk" {
        match docs.get("design.md") {
            Some(design) if packet::has_meaningful_content(design) => {}
            _ => missing.push(field("design.doc", "High-risk packets require design.md.")),
        }
    }

    ReadinessReport {
        ready: missing.is_empty(),
        missing,
    }
}

fn require_section(
    missing: &mut Vec<MissingReadinessField>,
    markdown: &str,
    heading: &str,
    code: &str,
    message: &str,
) {
    if !packet::section_has_meaningful_content(markdown, heading) {
        missing.push(field(code, message));
    }
}

fn field(code: &str, message: &str) -> MissingReadinessField {
    MissingReadinessField {
        code: code.to_string(),
        message: message.to_string(),
    }
}
