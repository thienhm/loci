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

    (home, workspace)
}

#[test]
fn upgrade_dry_run_reports_pending_template_pack_without_modifying_project() {
    let (home, workspace) = initialized_workspace();
    let config_path = workspace.path().join(".loci/config.toml");
    let project_doc_path = workspace.path().join("loci/project.md");
    let config_before = fs::read_to_string(&config_path).expect("read config");
    let project_doc_before = fs::read_to_string(&project_doc_path).expect("read project doc");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["upgrade", "--dry-run", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let json: Value = serde_json::from_slice(&output).expect("parse upgrade json");
    assert_eq!(json["dry_run"], true);
    assert_eq!(json["schema"]["current_version"], 1);
    assert_eq!(json["template_pack"]["id"], "loci-default");
    assert_eq!(json["template_pack"]["current_version"], "1");
    assert_eq!(json["template_pack"]["target_version"], "1");
    assert!(json["actions"]
        .as_array()
        .expect("actions")
        .iter()
        .any(|action| action["kind"] == "template" && action["status"] == "unchanged"));

    assert_eq!(
        fs::read_to_string(&config_path).expect("read config after dry-run"),
        config_before
    );
    assert_eq!(
        fs::read_to_string(&project_doc_path).expect("read project doc after dry-run"),
        project_doc_before
    );
}

#[test]
fn upgrade_dry_run_reports_missing_docs_as_create_actions() {
    let (home, workspace) = initialized_workspace();
    let glossary_path = workspace.path().join("loci/glossary.md");
    fs::remove_file(&glossary_path).expect("remove glossary");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["upgrade", "--dry-run", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let json: Value = serde_json::from_slice(&output).expect("parse upgrade json");
    assert!(json["actions"]
        .as_array()
        .expect("actions")
        .iter()
        .any(|action| action["kind"] == "template"
            && action["path"] == "loci/glossary.md"
            && action["status"] == "create"));
    assert!(!glossary_path.exists());
}

#[test]
fn upgrade_dry_run_reports_human_edited_docs_as_conflicts() {
    let (home, workspace) = initialized_workspace();
    let guardrails_path = workspace.path().join("loci/guardrails.md");
    fs::write(&guardrails_path, "# Guardrails\n\nHuman edit.\n").expect("edit guardrails");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["upgrade", "--dry-run", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let json: Value = serde_json::from_slice(&output).expect("parse upgrade json");
    assert!(json["actions"]
        .as_array()
        .expect("actions")
        .iter()
        .any(|action| action["kind"] == "template"
            && action["path"] == "loci/guardrails.md"
            && action["status"] == "conflict"));
    assert!(!workspace
        .path()
        .join("loci/guardrails.md.loci-conflict")
        .exists());
}

#[test]
fn upgrade_creates_missing_docs_and_updates_template_pack_state() {
    let (home, workspace) = initialized_workspace();
    let glossary_path = workspace.path().join("loci/glossary.md");
    fs::remove_file(&glossary_path).expect("remove glossary");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("Upgrade complete"))
        .stdout(contains("created 1"));

    assert!(glossary_path.is_file());

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    let version: String = conn
        .query_row(
            "SELECT version FROM template_pack WHERE id = 'loci-default'",
            [],
            |row| row.get(0),
        )
        .expect("template pack version");
    assert_eq!(version, "1");
}

#[test]
fn upgrade_preserves_human_edits_and_writes_conflict_candidate() {
    let (home, workspace) = initialized_workspace();
    let guardrails_path = workspace.path().join("loci/guardrails.md");
    fs::write(&guardrails_path, "# Guardrails\n\nHuman edit.\n").expect("edit guardrails");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("Upgrade complete"))
        .stdout(contains("conflicts 1"));

    assert_eq!(
        fs::read_to_string(&guardrails_path).expect("read guardrails"),
        "# Guardrails\n\nHuman edit.\n"
    );
    assert!(workspace
        .path()
        .join("loci/guardrails.md.loci-conflict")
        .is_file());
}

#[test]
fn upgrade_is_idempotent_after_successful_apply() {
    let (home, workspace) = initialized_workspace();
    let glossary_path = workspace.path().join("loci/glossary.md");
    fs::remove_file(&glossary_path).expect("remove glossary");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("created 1"));

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("created 0"))
        .stdout(contains("updated 0"))
        .stdout(contains("conflicts 0"));

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    let template_pack_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM template_pack WHERE id = 'loci-default'",
            [],
            |row| row.get(0),
        )
        .expect("template pack count");
    assert_eq!(template_pack_count, 1);
}

#[test]
fn upgrade_preserves_existing_conflict_candidate_on_second_run() {
    let (home, workspace) = initialized_workspace();
    let guardrails_path = workspace.path().join("loci/guardrails.md");
    let conflict_path = workspace.path().join("loci/guardrails.md.loci-conflict");
    fs::write(&guardrails_path, "# Guardrails\n\nHuman edit.\n").expect("edit guardrails");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("conflicts 1"));

    fs::write(&conflict_path, "# Candidate\n\nReviewer note.\n").expect("edit conflict candidate");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success()
        .stdout(contains("conflicts 1"));

    assert_eq!(
        fs::read_to_string(&guardrails_path).expect("read guardrails"),
        "# Guardrails\n\nHuman edit.\n"
    );
    assert_eq!(
        fs::read_to_string(&conflict_path).expect("read conflict candidate"),
        "# Candidate\n\nReviewer note.\n"
    );
}

#[test]
fn upgrade_updates_stale_project_version_metadata() {
    let (home, workspace) = initialized_workspace();
    let config_path = workspace.path().join(".loci/config.toml");
    let config = fs::read_to_string(&config_path).expect("read config");
    fs::write(
        &config_path,
        config.replace(env!("CARGO_PKG_VERSION"), "0.1.0"),
    )
    .expect("write stale config");

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    conn.execute("UPDATE project SET loci_version = '0.1.0'", [])
        .expect("stale project db version");
    drop(conn);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .arg("upgrade")
        .assert()
        .success();

    let config = fs::read_to_string(&config_path).expect("read config after upgrade");
    let parsed: toml::Value = toml::from_str(&config).expect("parse config");
    assert_eq!(
        parsed.get("loci_version").and_then(toml::Value::as_str),
        Some(env!("CARGO_PKG_VERSION"))
    );

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open project db");
    let db_version: String = conn
        .query_row("SELECT loci_version FROM project", [], |row| row.get(0))
        .expect("project db version");
    assert_eq!(db_version, env!("CARGO_PKG_VERSION"));
}
