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

#[test]
fn add_json_creates_idea_ticket_and_story_packet() {
    let (home, workspace) = initialized_workspace();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "add",
            "First workflow packet",
            "--priority",
            "high",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json add output");
    assert_eq!(value["id"], "EXA-001");
    assert_eq!(value["title"], "First workflow packet");
    assert_eq!(value["status"], "idea");
    assert_eq!(value["priority"], "high");
    assert_eq!(value["risk_lane"], "normal");
    assert_eq!(value["readiness_state"], "missing");
    assert_eq!(value["story_path"], "loci/tickets/EXA-001/story.md");

    let story_path = workspace.path().join("loci/tickets/EXA-001/story.md");
    let story = std::fs::read_to_string(&story_path).expect("story packet");
    assert!(story.contains("# EXA-001 First workflow packet"));
    assert!(story.contains("## Intent"));

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let row_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM ticket WHERE id = 'EXA-001' AND title = 'First workflow packet'",
            [],
            |row| row.get(0),
        )
        .expect("ticket row count");
    assert_eq!(row_count, 1);
}

#[test]
fn add_human_output_mentions_created_ticket() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Human visible packet"])
        .assert()
        .success()
        .stdout(contains("Created EXA-001"));
}
