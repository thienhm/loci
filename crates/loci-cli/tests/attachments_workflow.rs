use assert_cmd::Command;
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
fn attachments_lists_sqlite_ticket_files() {
    let (home, workspace) = initialized_workspace();

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    conn.execute(
        "INSERT INTO ticket_file (ticket_id, filename, relative_path, mime_type, size_bytes, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        (
            "EXA-001",
            "design.png",
            "loci/tickets/EXA-001/files/design.png",
            "image/png",
            42_i64,
            "upload",
            "2026-05-27T00:00:00Z",
            "2026-05-27T00:00:00Z",
        ),
    )
    .expect("insert ticket file");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["attachments", "EXA-001", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("attachments json output");
    assert_eq!(value["attachments"], serde_json::json!(["design.png"]));
}

#[test]
fn attachments_fails_for_missing_ticket() {
    let (home, workspace) = initialized_workspace();

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["attachments", "EXA-999", "--json"])
        .assert()
        .failure();
}
