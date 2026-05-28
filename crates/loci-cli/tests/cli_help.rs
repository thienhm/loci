use assert_cmd::Command;
use predicates::str::contains;

#[test]
fn help_mentions_core_commands() {
    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");

    cmd.arg("--help")
        .assert()
        .success()
        .stdout(contains("Local-first harness engineering kit"))
        .stdout(contains("init"))
        .stdout(contains("doctor"))
        .stdout(contains("list"))
        .stdout(contains("get"))
        .stdout(contains("add"))
        .stdout(contains("shape"))
        .stdout(contains("plan"))
        .stdout(contains("ready"))
        .stdout(contains("validate"))
        .stdout(contains("evidence"))
        .stdout(contains("trace"))
        .stdout(contains("decision"))
        .stdout(contains("backlog"))
        .stdout(contains("summary"))
        .stdout(contains("review"))
        .stdout(contains("upgrade"))
        .stdout(contains("update"));
}

#[test]
fn help_describes_workflow_and_update_boundaries() {
    let mut top_level = Command::cargo_bin("loci").expect("loci binary exists");
    top_level
        .arg("--help")
        .assert()
        .success()
        .stdout(contains("Create a workflow packet for new work"))
        .stdout(contains("Clarify a workflow packet's intent"))
        .stdout(contains("Add checkable implementation steps"))
        .stdout(contains(
            "Move a ticket to in_review after proof gates pass",
        ))
        .stdout(contains(
            "Upgrade project data, SQLite state, and built-in template docs",
        ))
        .stdout(contains("Install or replace the managed Loci tool binary"));

    let mut upgrade = Command::cargo_bin("loci").expect("loci binary exists");
    upgrade
        .args(["upgrade", "--help"])
        .assert()
        .success()
        .stdout(contains(
            "Upgrade project data, SQLite state, and built-in template docs",
        ))
        .stdout(contains(
            "Report pending project-data changes without modifying files or database state",
        ));

    let mut update = Command::cargo_bin("loci").expect("loci binary exists");
    update
        .args(["update", "--help"])
        .assert()
        .success()
        .stdout(contains("Install or replace the managed Loci tool binary"))
        .stdout(contains(
            "Release tag to install, for example v1.2.3. Defaults to latest",
        ));
}

#[test]
fn version_is_reported() {
    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");

    cmd.arg("--version")
        .assert()
        .success()
        .stdout(contains(env!("CARGO_PKG_VERSION")));
}
