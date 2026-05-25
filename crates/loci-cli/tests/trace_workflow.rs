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
        .args(["add", "Trace packet", "--json"])
        .assert()
        .success();
}

fn project_db(workspace: &TempDir) -> std::path::PathBuf {
    workspace.path().join(".loci/loci.db")
}

fn trace_add_json(home: &TempDir, workspace: &TempDir) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Read ticket context",
            "--actor",
            "agent:codex",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("trace add json")
}

fn trace_add_full_json(home: &TempDir, workspace: &TempDir) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Implemented validation parser",
            "--actor",
            "agent:codex",
            "--type",
            "decision",
            "--intake",
            "spec_slice",
            "--action",
            "Read validation workflow tests",
            "--file-read",
            "crates/loci-cli/src/app.rs",
            "--file-changed",
            "crates/loci-cli/src/app.rs",
            "--command",
            "rtk cargo test -p loci-cli --test trace_workflow",
            "--error",
            "Initial trace list test failed",
            "--decision",
            "Manual traces first",
            "--outcome",
            "partial",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("full trace add json")
}

fn add_evidence(home: &TempDir, workspace: &TempDir, ticket_id: &str) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "evidence",
            "add",
            ticket_id,
            "--type",
            "note",
            "--title",
            "Manual check",
            "--outcome",
            "informational",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("evidence add json")
}

#[test]
fn trace_add_requires_meaningful_summary_and_actor() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "",
            "--actor",
            "agent:codex",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("trace summary cannot be empty"));

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Read ticket context",
            "--actor",
            "",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("trace actor cannot be empty"));
}

#[test]
fn init_creates_trace_tables() {
    let (_home, workspace) = initialized_workspace();
    let conn = Connection::open(project_db(&workspace)).expect("project db opens");

    let trace_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'trace'",
            [],
            |row| row.get(0),
        )
        .expect("trace table query");
    let trace_evidence_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'trace_evidence'",
            [],
            |row| row.get(0),
        )
        .expect("trace_evidence table query");

    assert_eq!(trace_count, 1);
    assert_eq!(trace_evidence_count, 1);
}

#[test]
fn trace_add_records_informational_action_with_empty_repeated_fields() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let trace = trace_add_json(&home, &workspace);

    assert_eq!(trace["id"], "TR-000001");
    assert_eq!(trace["ticket_id"], "EXA-001");
    assert_eq!(trace["actor"], "agent:codex");
    assert_eq!(trace["event_type"], "action");
    assert_eq!(trace["task_summary"], "Read ticket context");
    assert_eq!(trace["outcome"], "informational");
    assert_eq!(trace["actions"], Value::Array(vec![]));
    assert_eq!(trace["files_read"], Value::Array(vec![]));
    assert_eq!(trace["files_changed"], Value::Array(vec![]));
    assert_eq!(trace["commands"], Value::Array(vec![]));
    assert_eq!(trace["errors"], Value::Array(vec![]));
    assert_eq!(trace["decisions"], Value::Array(vec![]));
    assert_eq!(trace["evidence_ids"], Value::Array(vec![]));
}

#[test]
fn trace_add_stores_empty_repeated_fields_as_json_arrays() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    trace_add_json(&home, &workspace);

    let conn = Connection::open(project_db(&workspace)).expect("project db opens");
    let row = conn
        .query_row(
            r#"
            SELECT actions_json, files_read_json, files_changed_json, commands_json,
                   errors_json, decisions_json
            FROM trace
            WHERE id = 'TR-000001'
            "#,
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .expect("trace row");

    assert_eq!(row, (
        "[]".to_string(),
        "[]".to_string(),
        "[]".to_string(),
        "[]".to_string(),
        "[]".to_string(),
        "[]".to_string(),
    ));
}

#[test]
fn trace_add_without_evidence_leaves_trace_evidence_empty() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    trace_add_json(&home, &workspace);

    let conn = Connection::open(project_db(&workspace)).expect("project db opens");
    let link_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM trace_evidence", [], |row| row.get(0))
        .expect("trace evidence count");

    assert_eq!(link_count, 0);
}

#[test]
fn trace_add_full_shape_writes_trace_markdown() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let trace = trace_add_full_json(&home, &workspace);

    assert_eq!(trace["id"], "TR-000001");
    assert_eq!(trace["event_type"], "decision");
    assert_eq!(trace["intake"], "spec_slice");
    assert_eq!(trace["actions"][0], "Read validation workflow tests");
    assert_eq!(trace["files_read"][0], "crates/loci-cli/src/app.rs");
    assert_eq!(trace["files_changed"][0], "crates/loci-cli/src/app.rs");
    assert_eq!(
        trace["commands"][0],
        "rtk cargo test -p loci-cli --test trace_workflow"
    );
    assert_eq!(trace["errors"][0], "Initial trace list test failed");
    assert_eq!(trace["decisions"][0], "Manual traces first");
    assert_eq!(trace["outcome"], "partial");

    let trace_path = workspace.path().join("loci/tickets/EXA-001/trace.md");
    let trace_md = std::fs::read_to_string(trace_path).expect("trace markdown");
    assert!(trace_md.contains("<!-- LOCI:TRACE:BEGIN -->"));
    assert!(trace_md.contains("- `TR-000001` [decision] agent:codex - partial - Implemented validation parser"));
    assert!(trace_md.contains("Files read: `crates/loci-cli/src/app.rs`"));
    assert!(trace_md.contains("Files changed: `crates/loci-cli/src/app.rs`"));
    assert!(trace_md.contains("Commands: `rtk cargo test -p loci-cli --test trace_workflow`"));
}

#[test]
fn trace_markdown_preserves_human_notes_on_rerender() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let trace_path = workspace.path().join("loci/tickets/EXA-001/trace.md");
    std::fs::write(
        &trace_path,
        "# EXA-001 Trace\n\n## Human Notes\n\nKeep this trace context.\n",
    )
    .expect("seed trace markdown");

    trace_add_json(&home, &workspace);
    trace_add_full_json(&home, &workspace);

    let trace_md = std::fs::read_to_string(trace_path).expect("trace markdown");
    assert!(trace_md.contains("## Human Notes\n\nKeep this trace context."));
    assert_eq!(trace_md.matches("<!-- LOCI:TRACE:BEGIN -->").count(), 1);
    assert!(trace_md.contains("Read ticket context"));
    assert!(trace_md.contains("Implemented validation parser"));
}

#[test]
fn trace_list_filters_by_ticket_actor_and_type() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    trace_add_json(&home, &workspace);
    trace_add_full_json(&home, &workspace);

    let by_ticket = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["trace", "list", "--ticket", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let traces: Value = serde_json::from_slice(&by_ticket).expect("trace list json");
    assert_eq!(traces.as_array().expect("trace array").len(), 2);

    let by_actor = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["trace", "list", "--actor", "agent:codex", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let traces: Value = serde_json::from_slice(&by_actor).expect("trace list by actor");
    assert_eq!(traces.as_array().expect("trace array").len(), 2);

    let by_type = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["trace", "list", "--type", "decision", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let traces: Value = serde_json::from_slice(&by_type).expect("trace list by type");
    assert_eq!(traces.as_array().expect("trace array").len(), 1);
    assert_eq!(traces[0]["id"], "TR-000002");
}

#[test]
fn trace_show_returns_one_record_or_fails_when_missing() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    trace_add_json(&home, &workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["trace", "show", "TR-000001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let trace: Value = serde_json::from_slice(&output).expect("trace show json");
    assert_eq!(trace["id"], "TR-000001");
    assert_eq!(trace["task_summary"], "Read ticket context");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["trace", "show", "TR-999999", "--json"])
        .assert()
        .failure()
        .stderr(contains("trace TR-999999 not found"));
}

#[test]
fn trace_add_links_same_ticket_evidence() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    let evidence = add_evidence(&home, &workspace, "EXA-001");
    assert_eq!(evidence["id"], "EV-000001");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Recorded proof",
            "--actor",
            "agent:codex",
            "--evidence",
            "EV-000001",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let trace: Value = serde_json::from_slice(&output).expect("trace add json");
    assert_eq!(trace["evidence_ids"][0], "EV-000001");

    let conn = Connection::open(project_db(&workspace)).expect("project db opens");
    let link_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM trace_evidence", [], |row| row.get(0))
        .expect("trace evidence count");
    assert_eq!(link_count, 1);
}

#[test]
fn trace_add_rejects_missing_evidence_link() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-001",
            "--summary",
            "Recorded proof",
            "--actor",
            "agent:codex",
            "--evidence",
            "EV-999999",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("evidence EV-999999 not found"));
}

#[test]
fn trace_add_rejects_cross_ticket_evidence_link() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Other packet", "--json"])
        .assert()
        .success();
    let evidence = add_evidence(&home, &workspace, "EXA-001");
    assert_eq!(evidence["id"], "EV-000001");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "trace",
            "add",
            "EXA-002",
            "--summary",
            "Recorded proof",
            "--actor",
            "agent:codex",
            "--evidence",
            "EV-000001",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("evidence EV-000001 does not belong to EXA-002"));
}
