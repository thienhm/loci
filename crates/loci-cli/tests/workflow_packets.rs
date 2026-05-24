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

fn add_packet(home: &TempDir, workspace: &TempDir) -> Value {
    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Workflow packet", "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    serde_json::from_slice(&output).expect("json add output")
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

#[test]
fn add_fails_when_next_story_packet_already_exists_without_db_row() {
    let (home, workspace) = initialized_workspace();
    let orphan_dir = workspace.path().join("loci/tickets/EXA-001");
    std::fs::create_dir_all(&orphan_dir).expect("orphan packet dir");
    std::fs::write(orphan_dir.join("story.md"), "# EXA-001 Orphan story\n").expect("orphan story");

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["add", "Real packet", "--json"])
        .assert()
        .failure()
        .stderr(contains("story packet already exists"));

    let conn = Connection::open(workspace.path().join(".loci/loci.db")).expect("open db");
    let row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ticket", [], |row| row.get(0))
        .expect("ticket row count");
    assert_eq!(row_count, 0);
}

#[test]
fn shape_json_updates_story_validation_and_preserves_human_notes() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let story_path = workspace.path().join("loci/tickets/EXA-001/story.md");
    std::fs::write(
        &story_path,
        "# EXA-001 Workflow packet\n\n## Human Notes\n\nKeep this paragraph.\n",
    )
    .expect("overwrite story");

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "shape",
            "EXA-001",
            "--intent",
            "Build the first executable packet loop.",
            "--scope",
            "Add add, shape, plan, and ready commands.",
            "--out-of-scope",
            "Do not implement evidence or traces.",
            "--context",
            "docs/superpowers/specs/2026-05-23-loci-native-harness-design.md",
            "--acceptance",
            "Ready refuses incomplete packets.",
            "--risk-lane",
            "normal",
            "--validation",
            "rtk cargo test -p loci-cli",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json shape output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["ticket"]["status"], "shaped");
    assert_eq!(value["ticket"]["risk_lane"], "normal");
    assert_eq!(value["docs"]["story.md"], "loci/tickets/EXA-001/story.md");
    assert_eq!(
        value["docs"]["validation.md"],
        "loci/tickets/EXA-001/validation.md"
    );

    let story = std::fs::read_to_string(&story_path).expect("story packet");
    assert!(story.contains("## Human Notes\n\nKeep this paragraph."));
    assert!(story.contains("## Intent\n\nBuild the first executable packet loop."));
    assert!(story.contains("## Acceptance Criteria\n\n- [ ] Ready refuses incomplete packets."));

    let validation_path = workspace.path().join("loci/tickets/EXA-001/validation.md");
    let validation = std::fs::read_to_string(&validation_path).expect("validation packet");
    assert!(validation.contains("## Validation Requirements"));
    assert!(validation.contains("- [ ] rtk cargo test -p loci-cli"));
}

#[test]
fn plan_json_writes_checkable_steps_without_marking_ready() {
    let (home, workspace) = initialized_workspace();
    add_packet(&home, &workspace);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "plan",
            "EXA-001",
            "--step",
            "Write failing workflow packet tests.",
            "--step",
            "Implement packet commands.",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json plan output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["ticket"]["status"], "idea");
    assert_eq!(value["ticket"]["plan_path"], "loci/tickets/EXA-001/plan.md");

    let plan_path = workspace.path().join("loci/tickets/EXA-001/plan.md");
    let plan = std::fs::read_to_string(&plan_path).expect("plan packet");
    assert!(plan.contains("- [ ] Write failing workflow packet tests."));
    assert!(plan.contains("- [ ] Implement packet commands."));
}
