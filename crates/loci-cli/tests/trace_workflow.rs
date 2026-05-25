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
