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
        .args(["add", "Decision packet", "--json"])
        .assert()
        .success();
}

fn project_db(workspace: &TempDir) -> std::path::PathBuf {
    workspace.path().join(".loci/loci.db")
}

fn sqlite_table_exists(workspace: &TempDir, table_name: &str) -> bool {
    let conn = Connection::open(project_db(workspace)).expect("open project db");
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table_name],
        |row| row.get::<_, bool>(0),
    )
    .expect("table exists query")
}

fn add_trace(home: &TempDir, workspace: &TempDir) -> String {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Prepared manual trace contract",
            "--actor",
            "agent:codex",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let trace: Value = serde_json::from_slice(&output).expect("trace add json");
    trace["id"].as_str().expect("trace id").to_string()
}

fn add_decision(
    home: &TempDir,
    workspace: &TempDir,
    title: &str,
    status: &str,
    trace_id: &str,
) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "decision",
            "add",
            "--title",
            title,
            "--status",
            status,
            "--decision",
            "Use manual trace recording first.",
            "--ticket",
            "EXA-001",
            "--trace",
            trace_id,
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("decision add json")
}

fn assert_single_decision_filter(
    home: &TempDir,
    workspace: &TempDir,
    args: &[&str],
    expected_id: &str,
) {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(args)
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let decisions: Value = serde_json::from_slice(&output).expect("decision list json");
    let records = decisions.as_array().expect("decision array");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["id"], expected_id);
}

fn add_backlog_item(home: &TempDir, workspace: &TempDir, trace_id: &str) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "backlog",
            "add",
            "--title",
            "Document trace evidence linking rules",
            "--kind",
            "missing-doc",
            "--source",
            "LCI-047 implementation handoff",
            "--impact",
            "Agents may forget evidence links can be attached to traces.",
            "--recommendation",
            "Add the rule to LOCI.md during the upgrade slice.",
            "--ticket",
            "EXA-001",
            "--trace",
            trace_id,
            "--doc",
            "LOCI.md",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("backlog add json")
}

#[test]
fn decision_and_backlog_add_require_meaningful_titles() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "decision",
            "add",
            "--title",
            "",
            "--decision",
            "Use manual traces first",
        ])
        .assert()
        .failure()
        .stderr(contains("decision title cannot be empty"));

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "add", "--title", "", "--kind", "missing-doc"])
        .assert()
        .failure()
        .stderr(contains("backlog title cannot be empty"));
}

#[test]
fn init_creates_decision_table() {
    let (_home, workspace) = initialized_workspace();

    assert!(sqlite_table_exists(&workspace, "decision"));
}

#[test]
fn init_creates_backlog_table() {
    let (_home, workspace) = initialized_workspace();

    assert!(sqlite_table_exists(&workspace, "backlog"));
}

#[test]
fn decision_add_creates_sqlite_record_and_markdown() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "decision",
            "add",
            "--title",
            "Manual traces before automatic instrumentation",
            "--status",
            "accepted",
            "--context",
            "LCI-047 needed a stable trace contract before automation.",
            "--decision",
            "Implement manual trace recording first.",
            "--consequence",
            "Validation and review gates can link to trace IDs later.",
            "--ticket",
            "EXA-001",
            "--trace",
            &trace_id,
            "--doc",
            "docs/superpowers/plans/2026-05-25-operational-trace-records.md",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let decision: Value = serde_json::from_slice(&output).expect("decision add json");

    assert_eq!(decision["id"], "DEC-000001");
    assert_eq!(decision["status"], "accepted");
    assert_eq!(decision["verification_outcome"], "pending");
    assert_eq!(
        decision["doc_path"],
        "loci/decisions/0001-manual-traces-before-automatic-instrumentation.md"
    );

    let conn = Connection::open(project_db(&workspace)).expect("open project db");
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM decision WHERE id = 'DEC-000001'",
            [],
            |row| row.get(0),
        )
        .expect("decision row count");
    assert_eq!(count, 1);

    let markdown_path = workspace.path().join(
        decision["doc_path"]
            .as_str()
            .expect("decision doc path string"),
    );
    let markdown = std::fs::read_to_string(markdown_path).expect("decision markdown");
    assert!(markdown.contains("<!-- LOCI:DECISION:BEGIN -->"));
    assert!(markdown.contains("## Decision"));
    assert!(markdown.contains("Implement manual trace recording first."));

    let list_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["decision", "list", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let decisions: Value = serde_json::from_slice(&list_output).expect("decision list json");
    assert_eq!(decisions.as_array().expect("decision array").len(), 1);
    assert_eq!(decisions[0]["id"], "DEC-000001");

    let show_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["decision", "show", "DEC-000001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let shown: Value = serde_json::from_slice(&show_output).expect("decision show json");
    assert_eq!(shown["id"], "DEC-000001");
    assert_eq!(
        shown["decision"][0],
        "Implement manual trace recording first."
    );

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["decision", "show", "DEC-999999", "--json"])
        .assert()
        .failure()
        .stderr(contains("decision DEC-999999 not found"));
}

#[test]
fn decision_list_filters_by_ticket_trace_and_status() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);
    let decision = add_decision(
        &home,
        &workspace,
        "Manual traces before automatic instrumentation",
        "accepted",
        &trace_id,
    );
    let decision_id = decision["id"].as_str().expect("decision id");

    assert_single_decision_filter(
        &home,
        &workspace,
        &["decision", "list", "--ticket", "EXA-001", "--json"],
        decision_id,
    );
    assert_single_decision_filter(
        &home,
        &workspace,
        &["decision", "list", "--trace", &trace_id, "--json"],
        decision_id,
    );
    assert_single_decision_filter(
        &home,
        &workspace,
        &["decision", "list", "--status", "accepted", "--json"],
        decision_id,
    );

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["decision", "list", "--status", "proposed", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let decisions: Value = serde_json::from_slice(&output).expect("decision list json");
    assert!(decisions.as_array().expect("decision array").is_empty());
}

#[test]
fn decision_verify_updates_record_and_markdown_preserving_human_notes() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);
    let decision = add_decision(
        &home,
        &workspace,
        "Manual traces before automatic instrumentation",
        "accepted",
        &trace_id,
    );
    let doc_path = workspace
        .path()
        .join(decision["doc_path"].as_str().expect("decision doc path"));
    let markdown = std::fs::read_to_string(&doc_path).expect("decision markdown");
    std::fs::write(
        &doc_path,
        format!(
            "{}\n## Human Notes\n\nThis context stays owned by people.\n",
            markdown.trim_end()
        ),
    )
    .expect("append human notes");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "decision",
            "verify",
            "DEC-000001",
            "--outcome",
            "passing",
            "--command",
            "rtk cargo test -p loci-cli",
            "--note",
            "Still matches implemented behavior.",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let verified: Value = serde_json::from_slice(&output).expect("decision verify json");

    assert_eq!(verified["verification_outcome"], "passing");
    assert_eq!(
        verified["verification_command"],
        "rtk cargo test -p loci-cli"
    );
    assert_eq!(
        verified["verification_note"],
        "Still matches implemented behavior."
    );
    assert!(verified["verified_at"].as_str().expect("verified_at").len() > 10);

    let markdown = std::fs::read_to_string(&doc_path).expect("verified decision markdown");
    assert!(markdown.contains("- Verification: `passing`"));
    assert!(markdown.contains("- Command: `rtk cargo test -p loci-cli`"));
    assert!(markdown.contains("- Note: Still matches implemented behavior."));
    assert!(markdown.contains("## Human Notes"));
    assert!(markdown.contains("This context stays owned by people."));
}

#[test]
fn decision_verify_requires_meaningful_note() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);
    add_decision(
        &home,
        &workspace,
        "Manual traces before automatic instrumentation",
        "accepted",
        &trace_id,
    );

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "decision",
            "verify",
            "DEC-000001",
            "--outcome",
            "passing",
            "--note",
            "",
        ])
        .assert()
        .failure()
        .stderr(contains("decision verification note cannot be empty"));
}

#[test]
fn backlog_add_creates_sqlite_record_and_renders_backlog_md() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);

    let item = add_backlog_item(&home, &workspace, &trace_id);

    assert_eq!(item["id"], "HB-000001");
    assert_eq!(item["kind"], "missing_doc");
    assert_eq!(item["status"], "open");

    let conn = Connection::open(project_db(&workspace)).expect("open project db");
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM backlog WHERE id = 'HB-000001'",
            [],
            |row| row.get(0),
        )
        .expect("backlog row count");
    assert_eq!(count, 1);

    let markdown =
        std::fs::read_to_string(workspace.path().join("loci/backlog.md")).expect("backlog md");
    assert!(markdown.contains("<!-- LOCI:BACKLOG:BEGIN -->"));
    assert!(
        markdown.contains("`HB-000001` [open] missing_doc - Document trace evidence linking rules")
    );

    let list_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "list", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let items: Value = serde_json::from_slice(&list_output).expect("backlog list json");
    assert_eq!(items.as_array().expect("backlog array").len(), 1);
    assert_eq!(items[0]["id"], "HB-000001");

    let show_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "show", "HB-000001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let shown: Value = serde_json::from_slice(&show_output).expect("backlog show json");
    assert_eq!(shown["id"], "HB-000001");
    assert_eq!(shown["sources"][0], "LCI-047 implementation handoff");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "show", "HB-999999", "--json"])
        .assert()
        .failure()
        .stderr(contains("backlog item HB-999999 not found"));

    let backlog_path = workspace.path().join("loci/backlog.md");
    let markdown = std::fs::read_to_string(&backlog_path).expect("backlog markdown");
    std::fs::write(
        &backlog_path,
        format!(
            "{}\n## Human Notes\n\nKeep this backlog note.\n",
            markdown.trim_end()
        ),
    )
    .expect("append human backlog notes");

    let second = add_backlog_item(&home, &workspace, &trace_id);
    assert_eq!(second["id"], "HB-000002");

    let updated = std::fs::read_to_string(backlog_path).expect("rerendered backlog markdown");
    assert!(updated.contains("`HB-000002` [open] missing_doc"));
    assert!(updated.contains("## Human Notes"));
    assert!(updated.contains("Keep this backlog note."));
}

#[test]
fn backlog_list_filters_by_status_kind_and_ticket() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);
    let item = add_backlog_item(&home, &workspace, &trace_id);
    let expected_id = item["id"].as_str().expect("backlog id");

    for args in [
        vec!["backlog", "list", "--status", "open", "--json"],
        vec!["backlog", "list", "--kind", "missing-doc", "--json"],
        vec!["backlog", "list", "--ticket", "EXA-001", "--json"],
    ] {
        let output = Command::cargo_bin("loci")
            .expect("loci binary exists")
            .current_dir(workspace.path())
            .env("HOME", home.path())
            .args(args)
            .assert()
            .success()
            .get_output()
            .stdout
            .clone();
        let items: Value = serde_json::from_slice(&output).expect("backlog list json");
        let records = items.as_array().expect("backlog array");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0]["id"], expected_id);
    }

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "list", "--status", "resolved", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let items: Value = serde_json::from_slice(&output).expect("backlog list json");
    assert!(items.as_array().expect("backlog array").is_empty());
}

#[test]
fn backlog_status_resolves_item_and_preserves_human_notes() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_id = add_trace(&home, &workspace);
    add_backlog_item(&home, &workspace, &trace_id);

    let backlog_path = workspace.path().join("loci/backlog.md");
    let markdown = std::fs::read_to_string(&backlog_path).expect("backlog markdown");
    std::fs::write(
        &backlog_path,
        format!(
            "{}\n## Human Notes\n\nKeep this backlog note.\n",
            markdown.trim_end()
        ),
    )
    .expect("append human backlog notes");

    let resolved_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "backlog",
            "status",
            "HB-000001",
            "resolved",
            "--note",
            "Added to generated LOCI.md rules.",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let resolved: Value = serde_json::from_slice(&resolved_output).expect("backlog status json");
    assert_eq!(resolved["id"], "HB-000001");
    assert_eq!(resolved["status"], "resolved");
    assert_eq!(
        resolved["resolution_note"],
        "Added to generated LOCI.md rules."
    );
    assert!(resolved["resolved_at"].as_str().is_some());

    let updated = std::fs::read_to_string(&backlog_path).expect("resolved backlog markdown");
    assert!(updated.contains("`HB-000001` [resolved] missing_doc"));
    assert!(updated.contains("## Human Notes"));
    assert!(updated.contains("Keep this backlog note."));
    assert!(updated.contains("Added to generated LOCI.md rules."));

    let reopened_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["backlog", "status", "HB-000001", "open", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let reopened: Value = serde_json::from_slice(&reopened_output).expect("backlog reopen json");
    assert_eq!(reopened["status"], "open");
    assert!(reopened["resolved_at"].is_null());
    assert_eq!(
        reopened["resolution_note"],
        "Added to generated LOCI.md rules."
    );
}
