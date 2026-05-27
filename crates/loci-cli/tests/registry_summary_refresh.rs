use assert_cmd::Command;
use rusqlite::Connection;
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

fn registry_counts(home: &TempDir) -> (i64, i64, i64) {
    let conn = Connection::open(home.path().join(".loci/registry.db")).expect("open registry db");
    conn.query_row(
        "SELECT open_ticket_count, review_ticket_count, validation_failure_count FROM registered_project LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .expect("read registry counts")
}

#[test]
fn registry_counts_refresh_after_add_status_and_validate_mutations() {
    let (home, workspace) = initialized_workspace();
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Registry refresh packet", "--json"])
        .assert()
        .success();

    assert_eq!(registry_counts(&home), (1, 0, 0));

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["status", "EXA-001", "in_review", "--json"])
        .assert()
        .success();

    assert_eq!(registry_counts(&home), (1, 1, 0));

    std::fs::create_dir_all(workspace.path().join("loci/tickets/EXA-001")).expect("ticket dir");
    std::fs::write(
        workspace.path().join("loci/tickets/EXA-001/validation.md"),
        "# EXA-001 Validation\n\n## Validation Commands\n\n- [ ] false\n",
    )
    .expect("write validation doc");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    conn.execute(
        "UPDATE ticket SET validation_path = 'loci/tickets/EXA-001/validation.md' WHERE id = 'EXA-001'",
        [],
    )
    .expect("set validation path");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["validate", "EXA-001", "--run", "--json"])
        .assert()
        .failure();

    assert_eq!(registry_counts(&home), (1, 1, 1));
}
