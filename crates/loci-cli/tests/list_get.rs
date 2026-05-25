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

fn seed_ticket(workspace: &TempDir) {
    let db_path = workspace.path().join(".loci/loci.db");
    let conn = Connection::open(db_path).expect("open db");
    conn.execute(
        r#"
        INSERT INTO ticket (
            id, title, status, priority, labels_json, progress, risk_lane,
            readiness_state, validation_state, review_state, created_at, updated_at,
            story_path
        )
        VALUES (
            'EXA-001', 'First story', 'idea', 'medium', '["harness"]', 0, 'normal',
            'missing', 'missing', 'not_ready', '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z', 'loci/tickets/EXA-001/story.md'
        )
        "#,
        [],
    )
    .expect("insert ticket");

    let ticket_dir = workspace.path().join("loci/tickets/EXA-001");
    std::fs::create_dir_all(&ticket_dir).expect("ticket dir");
    std::fs::write(ticket_dir.join("story.md"), "# Story\n\nFirst story body.").expect("story");
}

#[test]
fn list_json_returns_tickets() {
    let (home, workspace) = initialized_workspace();
    seed_ticket(&workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["list", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json list output");
    assert_eq!(value[0]["id"], "EXA-001");
    assert_eq!(value[0]["title"], "First story");
}

#[test]
fn get_json_returns_ticket_and_docs() {
    let (home, workspace) = initialized_workspace();
    seed_ticket(&workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["get", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json get output");
    assert_eq!(value["id"], "EXA-001");
    assert_eq!(value["title"], "First story");
    assert_eq!(value["docs"]["story.md"], "# Story\n\nFirst story body.");
    assert!(value.get("ticket").is_none());
}

#[test]
fn get_json_returns_workflow_packet_docs() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Workflow packet", "--json"])
        .assert()
        .success();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["plan", "EXA-001", "--step", "Write tests.", "--json"])
        .assert()
        .success();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["get", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json get output");
    assert_eq!(value["id"], "EXA-001");
    assert!(value["docs"]["story.md"]
        .as_str()
        .unwrap()
        .contains("Workflow packet"));
    assert!(value["docs"]["plan.md"]
        .as_str()
        .unwrap()
        .contains("- [ ] Write tests."));
}

#[test]
fn list_human_output_mentions_empty_workspace() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("list")
        .assert()
        .success()
        .stdout(contains("No tickets yet."));
}
