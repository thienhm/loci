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
