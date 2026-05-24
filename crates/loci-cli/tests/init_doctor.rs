use assert_cmd::Command;
use predicates::str::contains;
use rusqlite::Connection;
use std::fs;
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
    assert!(workspace.path().join("loci/decisions").is_dir());
    assert!(workspace.path().join("loci/templates").is_dir());
    assert!(workspace.path().join("loci/tickets").is_dir());
    assert!(workspace.path().join(".loci/loci.db").is_file());
    assert!(workspace.path().join(".loci/config.toml").is_file());
    assert!(home.path().join(".loci/registry.db").is_file());

    let loci_md = fs::read_to_string(workspace.path().join("LOCI.md")).expect("read LOCI.md");
    assert!(loci_md.contains(r#"loci init --name "My App" --prefix APP"#));
}

#[test]
fn init_rejects_one_letter_prefix() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "A"])
        .assert()
        .failure()
        .stderr(contains("prefix must be 2-5 uppercase ASCII letters"));
}

#[test]
fn init_rejects_lowercase_prefix() {
    assert_invalid_prefix("abc");
}

#[test]
fn init_rejects_alphanumeric_prefix() {
    assert_invalid_prefix("A1");
}

#[test]
fn init_rejects_non_ascii_prefix() {
    assert_invalid_prefix("ÅP");
}

#[test]
fn init_fails_when_workspace_is_already_initialized() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut first = Command::cargo_bin("loci").expect("loci binary exists");
    first
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success();

    let mut second = Command::cargo_bin("loci").expect("loci binary exists");
    second
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Other App", "--prefix", "OTH"])
        .assert()
        .failure()
        .stderr(contains("already initialized"));
}

#[test]
fn init_fails_when_only_loci_md_exists() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    fs::write(workspace.path().join("LOCI.md"), "# Existing Loci docs\n").expect("write LOCI.md");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .failure()
        .stderr(contains("already initialized"));
}

#[test]
fn init_fails_when_only_project_md_exists() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    fs::create_dir_all(workspace.path().join("loci")).expect("create loci dir");
    fs::write(
        workspace.path().join("loci/project.md"),
        "# Existing project docs\n",
    )
    .expect("write project.md");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .failure()
        .stderr(contains("already initialized"));
}

#[test]
fn init_writes_parseable_toml_config_for_quoted_name() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "init",
            "--name",
            "Example \"App\" \\ Alpha\nBeta",
            "--prefix",
            "EXA",
        ])
        .assert()
        .success();

    let config = fs::read_to_string(workspace.path().join(".loci/config.toml"))
        .expect("read project config");
    let parsed = toml::from_str::<toml::Value>(&config).expect("parse project config");

    assert_eq!(
        parsed.get("name").and_then(toml::Value::as_str),
        Some("Example \"App\" \\ Alpha\nBeta")
    );
    assert_eq!(
        parsed.get("prefix").and_then(toml::Value::as_str),
        Some("EXA")
    );
}

#[test]
fn init_keeps_project_db_and_registry_identity_consistent() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success();

    let project_conn =
        Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    let registry_conn =
        Connection::open(home.path().join(".loci/registry.db")).expect("open registry db");

    let project: (String, String, String) = project_conn
        .query_row("SELECT id, name, prefix FROM project", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .expect("project row");
    let registry: (String, String, String, String) = registry_conn
        .query_row(
            "SELECT id, name, prefix, path FROM registered_project",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("registry row");

    assert_eq!(project.0, registry.0);
    assert_eq!(project.1, registry.1);
    assert_eq!(project.2, registry.2);
    assert_eq!(
        registry.3,
        workspace
            .path()
            .canonicalize()
            .unwrap()
            .display()
            .to_string()
    );

    let project_count: i64 = project_conn
        .query_row("SELECT COUNT(*) FROM project", [], |row| row.get(0))
        .expect("project count");
    let registry_count: i64 = registry_conn
        .query_row("SELECT COUNT(*) FROM registered_project", [], |row| {
            row.get(0)
        })
        .expect("registry count");
    assert_eq!(project_count, 1);
    assert_eq!(registry_count, 1);
}

#[test]
fn doctor_reports_healthy_after_init() {
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
        .arg("doctor")
        .assert()
        .success()
        .stdout(contains("healthy"));
}

#[test]
fn doctor_json_reports_missing_required_doc() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success();

    std::fs::remove_file(workspace.path().join("loci/validation.md")).expect("remove validation");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["doctor", "--json"])
        .assert()
        .failure()
        .stdout(contains("\"status\":\"Error\""))
        .stdout(contains("validation.md"));
}

#[test]
fn doctor_json_does_not_create_missing_project_db() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    fs::write(workspace.path().join("LOCI.md"), "# Existing Loci docs\n").expect("write LOCI.md");
    fs::create_dir_all(workspace.path().join("loci")).expect("create loci dir");
    fs::write(
        workspace.path().join("loci/project.md"),
        "# Existing project docs\n",
    )
    .expect("write project.md");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["doctor", "--json"])
        .assert()
        .failure()
        .stdout(contains("loci.db"));

    assert!(!workspace.path().join(".loci/loci.db").exists());
}

fn assert_invalid_prefix(prefix: &str) {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", prefix])
        .assert()
        .failure()
        .stderr(contains("prefix must be 2-5 uppercase ASCII letters"));
}

#[test]
fn init_rejects_six_letter_prefix() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");

    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");
    cmd.current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "ABCDEF"])
        .assert()
        .failure()
        .stderr(contains("prefix must be 2-5 uppercase ASCII letters"));
}
