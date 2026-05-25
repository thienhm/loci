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
        .stdout(contains("review"));
}

#[test]
fn version_is_reported() {
    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");

    cmd.arg("--version")
        .assert()
        .success()
        .stdout(contains(env!("CARGO_PKG_VERSION")));
}
