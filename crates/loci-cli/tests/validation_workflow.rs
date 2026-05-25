use assert_cmd::Command;
use predicates::str::contains;
use rusqlite::Connection;
use serde_json::Value;
use tempfile::TempDir;

fn initialized_workspace() -> (TempDir, TempDir) {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success();

    (home, workspace)
}

fn add_packet(home: &TempDir, workspace: &TempDir) {
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Validation packet", "--json"])
        .assert()
        .success();
}

fn add_validation_commands(workspace: &TempDir, commands: &[&str]) {
    let body = commands
        .iter()
        .map(|command| format!("- [ ] {command}"))
        .collect::<Vec<_>>()
        .join("\n");
    let ticket_dir = workspace.path().join("loci/tickets/EXA-001");
    std::fs::create_dir_all(&ticket_dir).expect("ticket dir");
    std::fs::write(
        ticket_dir.join("validation.md"),
        format!("# EXA-001 Validation\n\n## Validation Commands\n\n{body}\n"),
    )
    .expect("validation commands");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    conn.execute(
        "UPDATE ticket SET validation_path = 'loci/tickets/EXA-001/validation.md' WHERE id = 'EXA-001'",
        [],
    )
    .expect("update validation path");
}

fn mark_ticket_in_progress(workspace: &TempDir) {
    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    conn.execute(
        "UPDATE ticket SET status = 'in_progress' WHERE id = 'EXA-001'",
        [],
    )
    .expect("mark ticket in progress");
}

#[test]
fn evidence_add_list_show_updates_db_and_markdown() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "evidence",
            "add",
            "EXA-001",
            "--type",
            "note",
            "--title",
            "Manual check",
            "--summary",
            "Reviewed output",
            "--note",
            "Reviewed output",
            "--outcome",
            "informational",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json evidence add output");
    assert_eq!(value["id"], "EV-000001");
    assert_eq!(value["ticket_id"], "EXA-001");
    assert_eq!(value["evidence_type"], "note");
    assert_eq!(value["title"], "Manual check");
    assert_eq!(value["summary"], "Reviewed output");
    assert_eq!(value["outcome"], "informational");

    let list_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["evidence", "list", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let list: Value = serde_json::from_slice(&list_output).expect("json evidence list output");
    assert_eq!(list.as_array().expect("evidence array").len(), 1);
    assert_eq!(list[0]["id"], "EV-000001");

    let show_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["evidence", "show", "EV-000001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let shown: Value = serde_json::from_slice(&show_output).expect("json evidence show output");
    assert_eq!(shown["id"], "EV-000001");
    assert_eq!(shown["note"], "Reviewed output");

    let evidence_path = workspace.path().join("loci/tickets/EXA-001/evidence.md");
    let evidence_md = std::fs::read_to_string(evidence_path).expect("evidence markdown");
    assert!(evidence_md.contains("<!-- LOCI:EVIDENCE:BEGIN -->"));
    assert!(evidence_md.contains("- `EV-000001` [note] Manual check - informational"));
    assert!(evidence_md.contains("Reviewed output"));

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let evidence_path: String = conn
        .query_row(
            "SELECT evidence_path FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| row.get(0),
        )
        .expect("ticket evidence path");
    assert_eq!(evidence_path, "loci/tickets/EXA-001/evidence.md");
}

#[test]
fn evidence_markdown_preserves_human_notes_on_rerender() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let evidence_path = workspace.path().join("loci/tickets/EXA-001/evidence.md");
    std::fs::write(
        &evidence_path,
        "# EXA-001 Evidence\n\n## Human Notes\n\nKeep this context.\n",
    )
    .expect("seed evidence markdown");

    for title in ["First check", "Second check"] {
        Command::cargo_bin("loci")
            .expect("loci binary exists")
            .current_dir(workspace.path())
            .env("HOME", home.path())
            .args([
                "evidence",
                "add",
                "EXA-001",
                "--type",
                "note",
                "--title",
                title,
                "--outcome",
                "informational",
                "--json",
            ])
            .assert()
            .success();
    }

    let evidence = std::fs::read_to_string(evidence_path).expect("evidence markdown");
    assert!(evidence.contains("## Human Notes\n\nKeep this context."));
    assert_eq!(evidence.matches("<!-- LOCI:EVIDENCE:BEGIN -->").count(), 1);
    assert!(evidence.contains("First check"));
    assert!(evidence.contains("Second check"));
}

#[test]
fn evidence_show_missing_record_fails() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["evidence", "show", "EV-999999", "--json"])
        .assert()
        .failure()
        .stderr(contains("evidence EV-999999 not found"));
}

#[test]
fn evidence_add_invalid_type_fails_without_insert() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "evidence",
            "add",
            "EXA-001",
            "--type",
            "unsupported",
            "--title",
            "Bad evidence",
            "--outcome",
            "informational",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("invalid value"));

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM evidence", [], |row| row.get(0))
        .expect("evidence count");
    assert_eq!(count, 0);
}

#[test]
fn validate_json_inspects_declared_commands_without_recording_evidence() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    add_validation_commands(&workspace, &["rtk cargo test -p loci-cli"]);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json validate output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["ticket_id"], "EXA-001");
    assert_eq!(value["validation_state"], "missing");
    assert_eq!(value["declared_commands"][0], "rtk cargo test -p loci-cli");
    assert_eq!(value["evidence_count"], 0);
    assert_eq!(value["ready_for_review"], false);

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM evidence", [], |row| row.get(0))
        .expect("evidence count");
    assert_eq!(count, 0);
}

#[test]
fn validate_run_requires_declared_commands() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .failure()
        .stderr(contains("no validation commands declared"));
}

#[test]
fn validate_run_records_passing_command_evidence_and_updates_state() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    add_validation_commands(&workspace, &["/bin/echo validation-ok"]);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json validate run output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["validation_state"], "passing");
    assert_eq!(value["results"][0]["command"], "/bin/echo validation-ok");
    assert_eq!(value["results"][0]["status"], "passing");
    assert_eq!(value["results"][0]["exit_code"], 0);
    assert_eq!(value["results"][0]["evidence_id"], "EV-000001");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let state: String = conn
        .query_row(
            "SELECT validation_state FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| row.get(0),
        )
        .expect("validation state");
    assert_eq!(state, "passing");
    let evidence_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM evidence", [], |row| row.get(0))
        .expect("evidence count");
    assert_eq!(evidence_count, 1);
}

#[test]
fn validate_run_records_failing_command_and_exits_nonzero() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    add_validation_commands(&workspace, &["/usr/bin/false"]);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json validate run output");
    assert_eq!(value["ok"], false);
    assert_eq!(value["validation_state"], "failing");
    assert_eq!(value["results"][0]["status"], "failing");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let state: String = conn
        .query_row(
            "SELECT validation_state FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| row.get(0),
        )
        .expect("validation state");
    assert_eq!(state, "failing");
}

#[test]
fn validate_run_records_unspawnable_declared_command_as_failing() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    add_validation_commands(&workspace, &["/definitely/not/a/real/command"]);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json validate run output");
    assert_eq!(value["ok"], false);
    assert_eq!(value["validation_state"], "failing");
    assert_eq!(
        value["results"][0]["command"],
        "/definitely/not/a/real/command"
    );
    assert_eq!(value["results"][0]["status"], "failing");
    assert_eq!(value["results"][0]["evidence_id"], "EV-000001");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let state: String = conn
        .query_row(
            "SELECT validation_state FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| row.get(0),
        )
        .expect("validation state");
    assert_eq!(state, "failing");
}

#[test]
fn summary_writes_summary_doc_and_preserves_human_notes() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let summary_path = workspace.path().join("loci/tickets/EXA-001/summary.md");
    std::fs::write(
        &summary_path,
        "# EXA-001 Summary\n\n## Human Notes\n\nKeep this summary context.\n",
    )
    .expect("seed summary");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json summary output");
    assert_eq!(value["ok"], true);
    assert_eq!(
        value["ticket"]["summary_path"],
        "loci/tickets/EXA-001/summary.md"
    );

    let summary = std::fs::read_to_string(summary_path).expect("summary markdown");
    assert!(summary.contains("## Human Notes\n\nKeep this summary context."));
    assert!(summary.contains("<!-- LOCI:SUMMARY:BEGIN -->"));
    assert!(summary.contains("Implemented validation workflow."));
}

#[test]
fn review_fails_when_summary_is_missing() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    add_validation_commands(&workspace, &["/bin/echo validation-ok"]);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "evidence",
            "add",
            "EXA-001",
            "--type",
            "note",
            "--title",
            "Manual check",
            "--outcome",
            "informational",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "review",
            "EXA-001",
            "--skip-validation",
            "Docs only",
            "--json",
        ])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], false);
    assert_eq!(value["missing"][0]["code"], "summary.doc");
}

#[test]
fn review_fails_when_evidence_is_missing() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "review",
            "EXA-001",
            "--skip-validation",
            "Docs only",
            "--json",
        ])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], false);
    assert_eq!(value["missing"][0]["code"], "evidence.records");
}

#[test]
fn review_fails_when_validation_is_missing_without_skip_reason() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "evidence",
            "add",
            "EXA-001",
            "--type",
            "note",
            "--title",
            "Manual check",
            "--outcome",
            "informational",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["review", "EXA-001", "--json"])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], false);
    assert_eq!(value["missing"][0]["code"], "validation.state");
}

#[test]
fn review_with_skip_validation_requires_non_empty_reason() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["review", "EXA-001", "--skip-validation", "", "--json"])
        .assert()
        .failure()
        .stderr(contains("skip validation reason cannot be empty"));
}

#[test]
fn review_success_moves_ticket_to_in_review() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    add_validation_commands(&workspace, &["/bin/echo validation-ok"]);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .success();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["review", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["ready_for_review"], true);
    assert_eq!(value["ticket"]["status"], "in_review");
    assert_eq!(value["ticket"]["review_state"], "ready");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let status: String = conn
        .query_row(
            "SELECT status FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| row.get(0),
        )
        .expect("ticket status");
    assert_eq!(status, "in_review");
}

#[test]
fn review_skip_validation_reason_allows_failing_validation() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    add_validation_commands(&workspace, &["/usr/bin/false"]);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .failure();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "review",
            "EXA-001",
            "--skip-validation",
            "Known local failure documented in evidence",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["ticket"]["status"], "in_review");
    assert_eq!(value["ticket"]["validation_state"], "skipped");
}

#[test]
fn review_fails_when_ticket_has_not_reached_workable_lifecycle() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    add_validation_commands(&workspace, &["/bin/echo validation-ok"]);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .success();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "summary",
            "EXA-001",
            "--text",
            "Implemented validation workflow.",
            "--json",
        ])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["review", "EXA-001", "--json"])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], false);
    assert!(value["missing"]
        .as_array()
        .expect("missing")
        .iter()
        .any(|field| field["code"] == "ticket.status"));
}

#[test]
fn review_fails_when_summary_text_is_empty() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    mark_ticket_in_progress(&workspace);
    add_validation_commands(&workspace, &["/bin/echo validation-ok"]);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .success();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["summary", "EXA-001", "--text", "", "--json"])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["review", "EXA-001", "--json"])
        .assert()
        .failure()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json review output");
    assert_eq!(value["ok"], false);
    assert!(value["missing"]
        .as_array()
        .expect("missing")
        .iter()
        .any(|field| field["code"] == "summary.doc"));
}
