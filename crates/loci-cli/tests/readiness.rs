use std::collections::BTreeMap;

use loci_cli::domain::TicketRecord;
use loci_cli::readiness;

fn ticket() -> TicketRecord {
    TicketRecord {
        id: "EXA-001".to_string(),
        title: "Workflow packet".to_string(),
        status: "shaped".to_string(),
        priority: "medium".to_string(),
        assignee: None,
        labels: Vec::new(),
        progress: 0,
        risk_lane: "normal".to_string(),
        readiness_state: "missing".to_string(),
        validation_state: "missing".to_string(),
        review_state: "not_ready".to_string(),
        created_at: "2026-05-24T00:00:00Z".to_string(),
        updated_at: "2026-05-24T00:00:00Z".to_string(),
        story_path: Some("loci/tickets/EXA-001/story.md".to_string()),
        design_path: None,
        plan_path: Some("loci/tickets/EXA-001/plan.md".to_string()),
        validation_path: Some("loci/tickets/EXA-001/validation.md".to_string()),
        evidence_path: None,
        summary_path: None,
        lessons_path: None,
        harness_delta_path: None,
    }
}

#[test]
fn complete_packet_is_ready() {
    let ticket = ticket();
    let docs = BTreeMap::from([
        (
            "story.md".to_string(),
            r#"# EXA-001 Workflow packet

## Intent

Ship the first readiness gate.

## Scope

- Evaluate packet story docs.

## Out of Scope

- Do not execute validation commands.

## Context Links

- docs/readiness.md

## Acceptance Criteria

- [ ] Complete packets can move to ready.

## Risk Lane

normal
"#
            .to_string(),
        ),
        (
            "validation.md".to_string(),
            "# EXA-001 Validation\n\n## Validation Requirements\n\n- [ ] rtk cargo test -p loci-cli\n"
                .to_string(),
        ),
        (
            "plan.md".to_string(),
            "# EXA-001 Plan\n\n## Implementation Steps\n\n- [ ] Write tests first.\n".to_string(),
        ),
    ]);

    let report = readiness::evaluate_readiness(&ticket, &docs);

    assert!(report.ready);
    assert!(report.missing.is_empty());
}

#[test]
fn placeholder_sections_are_reported_missing() {
    let ticket = ticket();
    let docs = BTreeMap::from([
        (
            "story.md".to_string(),
            r#"# EXA-001 Workflow packet

## Intent

TODO

## Scope

- TBD

## Out of Scope

- Do not execute validation commands.

## Context Links

- docs/readiness.md

## Acceptance Criteria

- [ ] Complete packets can move to ready.

## Risk Lane

normal
"#
            .to_string(),
        ),
        (
            "validation.md".to_string(),
            "# EXA-001 Validation\n\n## Validation Requirements\n\nTODO\n".to_string(),
        ),
        (
            "plan.md".to_string(),
            "# EXA-001 Plan\n\n## Implementation Steps\n\nWrite tests first.\n".to_string(),
        ),
    ]);

    let report = readiness::evaluate_readiness(&ticket, &docs);
    let missing_codes: Vec<&str> = report
        .missing
        .iter()
        .map(|field| field.code.as_str())
        .collect();

    assert!(!report.ready);
    assert!(missing_codes.contains(&"story.intent"));
    assert!(missing_codes.contains(&"story.scope"));
    assert!(missing_codes.contains(&"validation.requirements"));
    assert!(missing_codes.contains(&"plan.steps"));
}

#[test]
fn high_risk_requires_design_doc() {
    let mut ticket = ticket();
    ticket.risk_lane = "high_risk".to_string();
    ticket.design_path = Some("loci/tickets/EXA-001/design.md".to_string());

    let docs = BTreeMap::from([
        (
            "story.md".to_string(),
            r#"# EXA-001 Workflow packet

## Intent

Ship the first readiness gate.

## Scope

- Evaluate packet story docs.

## Out of Scope

- Do not execute validation commands.

## Context Links

- docs/readiness.md

## Acceptance Criteria

- [ ] Complete packets can move to ready.

## Risk Lane

high_risk
"#
            .to_string(),
        ),
        (
            "validation.md".to_string(),
            "# EXA-001 Validation\n\n## Validation Requirements\n\n- [ ] rtk cargo test -p loci-cli\n"
                .to_string(),
        ),
        (
            "plan.md".to_string(),
            "# EXA-001 Plan\n\n## Implementation Steps\n\n- [ ] Write tests first.\n".to_string(),
        ),
    ]);

    let report = readiness::evaluate_readiness(&ticket, &docs);
    let missing_codes: Vec<&str> = report
        .missing
        .iter()
        .map(|field| field.code.as_str())
        .collect();

    assert!(!report.ready);
    assert!(missing_codes.contains(&"design.doc"));
}
