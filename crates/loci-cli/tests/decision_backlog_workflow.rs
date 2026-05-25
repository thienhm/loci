use assert_cmd::Command;
use predicates::str::contains;
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
