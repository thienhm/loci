use loci_cli::validation;

#[test]
fn declared_commands_extracts_open_checklist_items_from_exact_sections() {
    let project_validation = r#"
# Project Validation

## Validation Commands

This prose is not a checklist item.
- [ ] rtk cargo test -p loci-cli
- [x] rtk cargo clippy -p loci-cli
- [X] rtk cargo fmt --check
- [ ] TODO
- [ ] TBD

```
- [ ] rtk cargo test --inside-code-block
```

- [ ] rtk cargo test \
  -p loci-cli
- [ ] rtk cargo test -p loci-cli
- [ ] rtk cargo test --all

## Validation Requirements

- [ ] rtk cargo test --wrong-section
"#;

    let ticket_validation = r#"
## Validation Commands

- [ ] rtk cargo test --all
- [ ] rtk cargo test --ticket

### Validation Commands

- [ ] rtk cargo test --wrong-depth

## validation commands

- [ ] rtk cargo test --wrong-case
"#;

    assert_eq!(
        validation::declared_commands(Some(project_validation), Some(ticket_validation)),
        vec![
            "rtk cargo test -p loci-cli",
            "rtk cargo test --all",
            "rtk cargo test --ticket",
        ]
    );
}

#[test]
fn declared_commands_handles_missing_documents() {
    assert!(validation::declared_commands(None, None).is_empty());
}

#[test]
fn declared_commands_ignores_unsupported_sections() {
    let project_validation = r#"
## Validation Requirements

- [ ] rtk cargo test --requirements

### Validation Commands

- [ ] rtk cargo test --nested

## Validation Commands Extra

- [ ] rtk cargo test --extra
"#;

    assert!(validation::declared_commands(Some(project_validation), None).is_empty());
}
