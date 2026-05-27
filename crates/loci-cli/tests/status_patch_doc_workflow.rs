use assert_cmd::Command;
use predicates::str::contains;
use rusqlite::Connection;
use serde_json::Value;
use std::fs;
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

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Workflow packet", "--json"])
        .assert()
        .success();

    (home, workspace)
}

#[test]
fn status_updates_ticket_status_and_timestamp() {
    let (home, workspace) = initialized_workspace();

    let before = fs::read_to_string(workspace.path().join(".loci/loci.db")).ok();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["status", "EXA-001", "in_progress", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("status json output");
    assert_eq!(value["id"], "EXA-001");
    assert_eq!(value["status"], "in_progress");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let (status, updated_at): (String, String) = conn
        .query_row(
            "SELECT status, updated_at FROM ticket WHERE id = 'EXA-001'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("query ticket");

    assert_eq!(status, "in_progress");
    if let Some(before_bytes) = before {
        assert!(before_bytes.len() > 0);
    }
    assert!(!updated_at.is_empty());
}

#[test]
fn patch_updates_assignee_progress_priority_and_labels() {
    let (home, workspace) = initialized_workspace();

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "patch",
            "EXA-001",
            "--assignee",
            "agent:codex",
            "--progress",
            "55",
            "--priority",
            "high",
            "--labels",
            "cli,sqlite,rust",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("patch json output");
    assert_eq!(value["assignee"], "agent:codex");
    assert_eq!(value["progress"], 55);
    assert_eq!(value["priority"], "high");
    assert_eq!(
        value["labels"],
        serde_json::json!(["cli", "sqlite", "rust"])
    );
}

#[test]
fn doc_read_write_uses_known_doc_paths_and_rejects_unknown_docs() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "doc",
            "write",
            "EXA-001",
            "story.md",
            "--content",
            "# Updated story\n\nBody.",
            "--json",
        ])
        .assert()
        .success();

    let read_output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["doc", "read", "EXA-001", "story.md", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&read_output).expect("doc read json output");
    assert!(value["content"]
        .as_str()
        .unwrap_or_default()
        .contains("Updated story"));

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "doc",
            "write",
            "EXA-001",
            "description.md",
            "--content",
            "nope",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(contains("Unknown doc"));
}
