use assert_cmd::Command;
use predicates::str::contains;
use tempfile::TempDir;

#[test]
fn init_creates_loci_workspace_and_registry() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success()
        .stdout(contains("Initialized Loci workspace"));

    assert!(workspace.path().join("AGENTS.md").is_file());
    assert!(workspace.path().join("LOCI.md").is_file());
    assert!(workspace.path().join("loci/project.md").is_file());
    assert!(workspace.path().join("loci/architecture.md").is_file());
    assert!(workspace.path().join("loci/validation.md").is_file());
    assert!(workspace.path().join("loci/tickets").is_dir());
    assert!(workspace.path().join(".loci/loci.db").is_file());
    assert!(workspace.path().join(".loci/config.toml").is_file());
    assert!(home.path().join(".loci/registry.db").is_file());
}
