# Loci Rust CLI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Rust CLI, SQLite foundation, visible `loci/` workspace, per-project `.loci/loci.db`, global `~/.loci/registry.db`, and initial `init`, `doctor`, `list`, and `get` commands.

**Architecture:** Add a Rust workspace alongside the existing Bun monorepo. The Rust CLI owns the new Loci-native storage contract while the existing TypeScript CLI remains untouched until a later cutover plan. Markdown files are the collaboration surface, SQLite records are the operational index.

**Tech Stack:** Rust 2021, `clap`, `rusqlite` with bundled SQLite, `serde`, `serde_json`, `toml`, `uuid`, `time`, `tempfile`, `assert_cmd`, `predicates`.

---

## Scope Boundary

This is Plan 1 of the larger Loci-native harness migration. It implements only the foundation:

- Rust CLI crate.
- SQLite migration runner.
- Global registry database.
- Project database.
- Default template pack.
- `loci init`.
- `loci doctor`.
- `loci list --json`.
- `loci get <id> --json`.

It does not implement intake, evidence, traces, decisions, backlog, web dashboard changes, or legacy upgrade. Those need separate plans after this foundation lands.

## File Structure

Create:

- `Cargo.toml` - root Rust workspace for Loci-native CLI crates.
- `crates/loci-cli/Cargo.toml` - Rust CLI crate dependencies and binary metadata.
- `crates/loci-cli/src/main.rs` - binary entrypoint.
- `crates/loci-cli/src/lib.rs` - module exports and testable command runner.
- `crates/loci-cli/src/app.rs` - `clap` command definitions and dispatch.
- `crates/loci-cli/src/domain.rs` - value types for projects, tickets, health checks, and JSON output.
- `crates/loci-cli/src/paths.rs` - path resolution for project root, `loci/`, `.loci/`, and `~/.loci/`.
- `crates/loci-cli/src/db.rs` - SQLite connection, migration runner, and transaction helpers.
- `crates/loci-cli/src/migrations.rs` - embedded SQL migration list.
- `crates/loci-cli/src/registry.rs` - global registry database repository.
- `crates/loci-cli/src/project.rs` - project database repository.
- `crates/loci-cli/src/templates.rs` - built-in default template rendering.
- `crates/loci-cli/src/commands/init.rs` - init command implementation.
- `crates/loci-cli/src/commands/doctor.rs` - doctor command implementation.
- `crates/loci-cli/src/commands/list.rs` - list command implementation.
- `crates/loci-cli/src/commands/get.rs` - get command implementation.
- `crates/loci-cli/src/commands/mod.rs` - command module exports.
- `crates/loci-cli/tests/init_doctor.rs` - integration tests for init and doctor.
- `crates/loci-cli/tests/list_get.rs` - integration tests for list/get JSON.

Modify:

- `tasks/todo.md` - record that the implementation plan was written.

Do not modify in this plan:

- `packages/cli/**`
- `packages/server/**`
- `packages/web/**`
- root `package.json`

The TypeScript CLI cutover gets its own later plan.

## Data Contract

Project workspace:

```text
my-project/
  AGENTS.md
  LOCI.md
  loci/
    project.md
    architecture.md
    validation.md
    guardrails.md
    current-state.md
    glossary.md
    backlog.md
    decisions/
    templates/
    tickets/
  .loci/
    loci.db
    config.toml
```

Global workspace:

```text
~/.loci/
  registry.db
  config.toml
```

Project SQLite v1 tables:

```sql
schema_version(version, applied_at)
project(id, name, prefix, loci_version, created_at, updated_at)
ticket(id, title, status, priority, assignee, labels_json, progress, risk_lane, readiness_state, validation_state, review_state, created_at, updated_at, story_path, design_path, plan_path, validation_path, evidence_path, summary_path, lessons_path, harness_delta_path)
document(id, path, kind, owner_type, owner_id, checksum, last_indexed_at, required, status)
template_pack(id, name, version, applied_at)
```

Global SQLite v1 tables:

```sql
schema_version(version, applied_at)
registered_project(id, name, prefix, path, loci_version, last_seen_at, last_indexed_at, health_status, open_ticket_count, review_ticket_count, validation_failure_count)
global_config(key, value)
```

## Task 1: Scaffold Rust Workspace And CLI Help

**Files:**

- Create: `Cargo.toml`
- Create: `crates/loci-cli/Cargo.toml`
- Create: `crates/loci-cli/src/main.rs`
- Create: `crates/loci-cli/src/lib.rs`
- Create: `crates/loci-cli/src/app.rs`
- Create: `crates/loci-cli/src/commands/mod.rs`
- Create: `crates/loci-cli/tests/cli_help.rs`

- [ ] **Step 1: Write the failing CLI help tests**

Create `crates/loci-cli/tests/cli_help.rs`:

```rust
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
        .stdout(contains("get"));
}

#[test]
fn version_is_reported() {
    let mut cmd = Command::cargo_bin("loci").expect("loci binary exists");

    cmd.arg("--version")
        .assert()
        .success()
        .stdout(contains(env!("CARGO_PKG_VERSION")));
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cargo test -p loci-cli --test cli_help
```

Expected: FAIL because no Cargo workspace or Rust CLI binary exists.

- [ ] **Step 3: Create root Cargo workspace**

Create `Cargo.toml`:

```toml
[workspace]
members = ["crates/loci-cli"]
resolver = "2"

[workspace.package]
edition = "2021"
license = "MIT"
repository = "https://github.com/thienhm/loci"

[workspace.dependencies]
anyhow = "1.0"
assert_cmd = "2.0"
clap = { version = "4.5", features = ["derive"] }
predicates = "3.1"
rusqlite = { version = "0.32", features = ["bundled"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tempfile = "3.14"
time = { version = "0.3", features = ["formatting", "macros"] }
toml = "0.8"
uuid = { version = "1.11", features = ["v4", "serde"] }
```

- [ ] **Step 4: Create Rust CLI crate manifest**

Create `crates/loci-cli/Cargo.toml`:

```toml
[package]
name = "loci-cli"
version = "1.1.0"
edition.workspace = true
license.workspace = true
repository.workspace = true

[[bin]]
name = "loci"
path = "src/main.rs"

[dependencies]
anyhow.workspace = true
clap.workspace = true
rusqlite.workspace = true
serde.workspace = true
serde_json.workspace = true
time.workspace = true
toml.workspace = true
uuid.workspace = true

[dev-dependencies]
assert_cmd.workspace = true
predicates.workspace = true
tempfile.workspace = true
```

- [ ] **Step 5: Create CLI command modules**

Create `crates/loci-cli/src/commands/mod.rs`:

```rust
pub mod doctor;
pub mod get;
pub mod init;
pub mod list;
```

Create temporary command files so the module compiles.

`crates/loci-cli/src/commands/init.rs`:

```rust
use anyhow::Result;

pub fn run() -> Result<()> {
    println!("init is not implemented yet");
    Ok(())
}
```

`crates/loci-cli/src/commands/doctor.rs`:

```rust
use anyhow::Result;

pub fn run(_json: bool) -> Result<()> {
    println!("doctor is not implemented yet");
    Ok(())
}
```

`crates/loci-cli/src/commands/list.rs`:

```rust
use anyhow::Result;

pub fn run(_json: bool) -> Result<()> {
    println!("list is not implemented yet");
    Ok(())
}
```

`crates/loci-cli/src/commands/get.rs`:

```rust
use anyhow::Result;

pub fn run(_id: &str, _json: bool) -> Result<()> {
    println!("get is not implemented yet");
    Ok(())
}
```

- [ ] **Step 6: Create command parser and entrypoints**

Create `crates/loci-cli/src/app.rs`:

```rust
use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::commands;

#[derive(Debug, Parser)]
#[command(
    name = "loci",
    version,
    about = "Local-first harness engineering kit for human and AI-agent collaboration"
)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Initialize a Loci workspace in the current project.
    Init,

    /// Check project harness health.
    Doctor {
        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// List tickets in the current project.
    List {
        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Get one ticket by id.
    Get {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },
}

pub fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init => commands::init::run(),
        Commands::Doctor { json } => commands::doctor::run(json),
        Commands::List { json } => commands::list::run(json),
        Commands::Get { id, json } => commands::get::run(&id, json),
    }
}
```

Create `crates/loci-cli/src/lib.rs`:

```rust
pub mod app;
pub mod commands;

pub use app::run;
```

Create `crates/loci-cli/src/main.rs`:

```rust
fn main() {
    if let Err(error) = loci_cli::run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
```

- [ ] **Step 7: Run the CLI help tests and verify they pass**

Run:

```bash
cargo test -p loci-cli --test cli_help
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add Cargo.toml crates/loci-cli
git commit -m "feat(cli): scaffold Rust Loci CLI"
```

## Task 2: Add Domain Types And Path Resolution

**Files:**

- Create: `crates/loci-cli/src/domain.rs`
- Create: `crates/loci-cli/src/paths.rs`
- Modify: `crates/loci-cli/src/lib.rs`
- Create: `crates/loci-cli/tests/paths.rs`

- [ ] **Step 1: Write failing path tests**

Create `crates/loci-cli/tests/paths.rs`:

```rust
use std::fs;

use loci_cli::paths::{find_workspace_root, LociPaths};
use tempfile::TempDir;

#[test]
fn finds_workspace_root_from_nested_directory() {
    let temp = TempDir::new().expect("tempdir");
    let root = temp.path();
    fs::create_dir_all(root.join(".loci")).expect("create .loci");
    let nested = root.join("src/deep/module");
    fs::create_dir_all(&nested).expect("create nested");

    let found = find_workspace_root(&nested).expect("workspace found");

    assert_eq!(found, root);
}

#[test]
fn returns_none_when_workspace_marker_is_missing() {
    let temp = TempDir::new().expect("tempdir");

    let found = find_workspace_root(temp.path());

    assert!(found.is_none());
}

#[test]
fn paths_use_visible_loci_and_hidden_project_state() {
    let home = TempDir::new().expect("home");
    let root = TempDir::new().expect("workspace");

    let paths = LociPaths::new(root.path().to_path_buf(), home.path().to_path_buf());

    assert_eq!(paths.visible_loci_dir, root.path().join("loci"));
    assert_eq!(paths.project_state_dir, root.path().join(".loci"));
    assert_eq!(paths.project_db, root.path().join(".loci/loci.db"));
    assert_eq!(paths.global_registry_db, home.path().join(".loci/registry.db"));
}
```

- [ ] **Step 2: Run the path tests and verify they fail**

Run:

```bash
cargo test -p loci-cli --test paths
```

Expected: FAIL because `domain` and `paths` modules do not exist.

- [ ] **Step 3: Create domain types**

Create `crates/loci-cli/src/domain.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub prefix: String,
    pub loci_version: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegisteredProject {
    pub id: String,
    pub name: String,
    pub prefix: String,
    pub path: String,
    pub loci_version: String,
    pub health_status: String,
    pub open_ticket_count: i64,
    pub review_ticket_count: i64,
    pub validation_failure_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TicketRecord {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub labels: Vec<String>,
    pub progress: i64,
    pub risk_lane: String,
    pub readiness_state: String,
    pub validation_state: String,
    pub review_state: String,
    pub created_at: String,
    pub updated_at: String,
    pub story_path: Option<String>,
    pub design_path: Option<String>,
    pub plan_path: Option<String>,
    pub validation_path: Option<String>,
    pub evidence_path: Option<String>,
    pub summary_path: Option<String>,
    pub lessons_path: Option<String>,
    pub harness_delta_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TicketWithDocs {
    pub ticket: TicketRecord,
    pub docs: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum HealthStatus {
    Healthy,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HealthCheck {
    pub code: String,
    pub status: HealthStatus,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DoctorReport {
    pub project_path: String,
    pub status: HealthStatus,
    pub checks: Vec<HealthCheck>,
}
```

- [ ] **Step 4: Create path helpers**

Create `crates/loci-cli/src/paths.rs`:

```rust
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LociPaths {
    pub workspace_root: PathBuf,
    pub home_dir: PathBuf,
    pub visible_loci_dir: PathBuf,
    pub project_state_dir: PathBuf,
    pub project_db: PathBuf,
    pub project_config: PathBuf,
    pub global_loci_dir: PathBuf,
    pub global_registry_db: PathBuf,
    pub global_config: PathBuf,
}

impl LociPaths {
    pub fn new(workspace_root: PathBuf, home_dir: PathBuf) -> Self {
        let visible_loci_dir = workspace_root.join("loci");
        let project_state_dir = workspace_root.join(".loci");
        let global_loci_dir = home_dir.join(".loci");

        Self {
            project_db: project_state_dir.join("loci.db"),
            project_config: project_state_dir.join("config.toml"),
            global_registry_db: global_loci_dir.join("registry.db"),
            global_config: global_loci_dir.join("config.toml"),
            workspace_root,
            home_dir,
            visible_loci_dir,
            project_state_dir,
            global_loci_dir,
        }
    }
}

pub fn find_workspace_root(start_dir: &Path) -> Option<PathBuf> {
    let mut current = start_dir.to_path_buf();

    loop {
        if current.join(".loci").is_dir() || current.join("loci").is_dir() {
            return Some(current);
        }

        if !current.pop() {
            return None;
        }
    }
}
```

- [ ] **Step 5: Export modules**

Modify `crates/loci-cli/src/lib.rs`:

```rust
pub mod app;
pub mod commands;
pub mod domain;
pub mod paths;

pub use app::run;
```

- [ ] **Step 6: Run path tests and verify they pass**

Run:

```bash
cargo test -p loci-cli --test paths
```

Expected: PASS.

- [ ] **Step 7: Run all Rust tests**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add crates/loci-cli/src/domain.rs crates/loci-cli/src/paths.rs crates/loci-cli/src/lib.rs crates/loci-cli/tests/paths.rs
git commit -m "feat(cli): add Loci path and domain types"
```

## Task 3: Add SQLite Migrations And Repositories

**Files:**

- Create: `crates/loci-cli/src/migrations.rs`
- Create: `crates/loci-cli/src/db.rs`
- Create: `crates/loci-cli/src/registry.rs`
- Create: `crates/loci-cli/src/project.rs`
- Modify: `crates/loci-cli/src/lib.rs`
- Create: `crates/loci-cli/tests/db_migrations.rs`

- [ ] **Step 1: Write failing migration tests**

Create `crates/loci-cli/tests/db_migrations.rs`:

```rust
use loci_cli::db::{connect_project_db, connect_registry_db};
use rusqlite::Connection;
use tempfile::TempDir;

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .expect("table existence query")
        == 1
}

#[test]
fn project_database_has_v1_tables() {
    let temp = TempDir::new().expect("tempdir");
    let db_path = temp.path().join(".loci/loci.db");

    let conn = connect_project_db(&db_path).expect("connect project db");

    for table in ["schema_version", "project", "ticket", "document", "template_pack"] {
        assert!(table_exists(&conn, table), "missing table {table}");
    }
}

#[test]
fn registry_database_has_v1_tables() {
    let temp = TempDir::new().expect("tempdir");
    let db_path = temp.path().join(".loci/registry.db");

    let conn = connect_registry_db(&db_path).expect("connect registry db");

    for table in ["schema_version", "registered_project", "global_config"] {
        assert!(table_exists(&conn, table), "missing table {table}");
    }
}
```

- [ ] **Step 2: Run migration tests and verify they fail**

Run:

```bash
cargo test -p loci-cli --test db_migrations
```

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Add embedded SQL migrations**

Create `crates/loci-cli/src/migrations.rs`:

```rust
pub const PROJECT_MIGRATIONS: &[&str] = &[r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);

CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    loci_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('idea','shaped','ready','in_progress','in_review','done')),
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
    assignee TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]',
    progress INTEGER NOT NULL DEFAULT 0,
    risk_lane TEXT NOT NULL DEFAULT 'normal' CHECK(risk_lane IN ('tiny','normal','high_risk')),
    readiness_state TEXT NOT NULL DEFAULT 'missing',
    validation_state TEXT NOT NULL DEFAULT 'missing',
    review_state TEXT NOT NULL DEFAULT 'not_ready',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    story_path TEXT,
    design_path TEXT,
    plan_path TEXT,
    validation_path TEXT,
    evidence_path TEXT,
    summary_path TEXT,
    lessons_path TEXT,
    harness_delta_path TEXT
);

CREATE TABLE IF NOT EXISTS document (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    owner_type TEXT,
    owner_id TEXT,
    checksum TEXT,
    last_indexed_at TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'present'
);

CREATE TABLE IF NOT EXISTS template_pack (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
"#];

pub const REGISTRY_MIGRATIONS: &[&str] = &[r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);

CREATE TABLE IF NOT EXISTS registered_project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    loci_version TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_indexed_at TEXT,
    health_status TEXT NOT NULL DEFAULT 'warning',
    open_ticket_count INTEGER NOT NULL DEFAULT 0,
    review_ticket_count INTEGER NOT NULL DEFAULT 0,
    validation_failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS global_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#];
```

- [ ] **Step 4: Add database connection and migration runner**

Create `crates/loci-cli/src/db.rs`:

```rust
use std::fs;
use std::path::Path;

use anyhow::Result;
use rusqlite::Connection;

use crate::migrations::{PROJECT_MIGRATIONS, REGISTRY_MIGRATIONS};

pub fn connect_project_db(path: &Path) -> Result<Connection> {
    connect_and_migrate(path, PROJECT_MIGRATIONS)
}

pub fn connect_registry_db(path: &Path) -> Result<Connection> {
    connect_and_migrate(path, REGISTRY_MIGRATIONS)
}

fn connect_and_migrate(path: &Path, migrations: &[&str]) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    for migration in migrations {
        conn.execute_batch(migration)?;
    }

    Ok(conn)
}
```

- [ ] **Step 5: Add repository shells**

Create `crates/loci-cli/src/registry.rs`:

```rust
use anyhow::Result;
use rusqlite::{params, Connection};

use crate::domain::RegisteredProject;

pub fn upsert_registered_project(conn: &Connection, project: &RegisteredProject, path: &str) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO registered_project (
            id, name, prefix, path, loci_version, last_seen_at, health_status,
            open_ticket_count, review_ticket_count, validation_failure_count
        )
        VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6, ?7, ?8, ?9)
        ON CONFLICT(path) DO UPDATE SET
            id = excluded.id,
            name = excluded.name,
            prefix = excluded.prefix,
            loci_version = excluded.loci_version,
            last_seen_at = excluded.last_seen_at,
            health_status = excluded.health_status,
            open_ticket_count = excluded.open_ticket_count,
            review_ticket_count = excluded.review_ticket_count,
            validation_failure_count = excluded.validation_failure_count
        "#,
        params![
            project.id,
            project.name,
            project.prefix,
            path,
            project.loci_version,
            project.health_status,
            project.open_ticket_count,
            project.review_ticket_count,
            project.validation_failure_count
        ],
    )?;

    Ok(())
}
```

Create `crates/loci-cli/src/project.rs`:

```rust
use anyhow::Result;
use rusqlite::{params, Connection};

use crate::domain::{ProjectRecord, TicketRecord};

pub fn insert_project(conn: &Connection, project: &ProjectRecord) -> Result<()> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO project (id, name, prefix, loci_version, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            project.id,
            project.name,
            project.prefix,
            project.loci_version,
            project.created_at,
            project.updated_at
        ],
    )?;

    Ok(())
}

pub fn list_tickets(conn: &Connection) -> Result<Vec<TicketRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, priority, assignee, labels_json, progress, risk_lane,
               readiness_state, validation_state, review_state, created_at, updated_at,
               story_path, design_path, plan_path, validation_path, evidence_path,
               summary_path, lessons_path, harness_delta_path
        FROM ticket
        ORDER BY created_at ASC
        "#,
    )?;

    let rows = stmt.query_map([], ticket_from_row)?;
    let mut tickets = Vec::new();
    for row in rows {
        tickets.push(row?);
    }

    Ok(tickets)
}

pub fn get_ticket(conn: &Connection, id: &str) -> Result<Option<TicketRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, status, priority, assignee, labels_json, progress, risk_lane,
               readiness_state, validation_state, review_state, created_at, updated_at,
               story_path, design_path, plan_path, validation_path, evidence_path,
               summary_path, lessons_path, harness_delta_path
        FROM ticket
        WHERE id = ?1
        "#,
    )?;

    let mut rows = stmt.query([id])?;
    match rows.next()? {
        Some(row) => Ok(Some(ticket_from_row(row)?)),
        None => Ok(None),
    }
}

fn ticket_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TicketRecord> {
    let labels_json: String = row.get(5)?;
    let labels = serde_json::from_str(&labels_json).unwrap_or_default();

    Ok(TicketRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        status: row.get(2)?,
        priority: row.get(3)?,
        assignee: row.get(4)?,
        labels,
        progress: row.get(6)?,
        risk_lane: row.get(7)?,
        readiness_state: row.get(8)?,
        validation_state: row.get(9)?,
        review_state: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        story_path: row.get(13)?,
        design_path: row.get(14)?,
        plan_path: row.get(15)?,
        validation_path: row.get(16)?,
        evidence_path: row.get(17)?,
        summary_path: row.get(18)?,
        lessons_path: row.get(19)?,
        harness_delta_path: row.get(20)?,
    })
}
```

- [ ] **Step 6: Export modules**

Modify `crates/loci-cli/src/lib.rs`:

```rust
pub mod app;
pub mod commands;
pub mod db;
pub mod domain;
pub mod migrations;
pub mod paths;
pub mod project;
pub mod registry;

pub use app::run;
```

- [ ] **Step 7: Run migration tests and verify they pass**

Run:

```bash
cargo test -p loci-cli --test db_migrations
```

Expected: PASS.

- [ ] **Step 8: Run all Rust tests**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add crates/loci-cli/src crates/loci-cli/tests/db_migrations.rs
git commit -m "feat(cli): add SQLite durable layer"
```

## Task 4: Implement Template Pack And `loci init`

**Files:**

- Create: `crates/loci-cli/src/templates.rs`
- Modify: `crates/loci-cli/src/commands/init.rs`
- Modify: `crates/loci-cli/src/lib.rs`
- Create: `crates/loci-cli/tests/init_doctor.rs`

- [ ] **Step 1: Write failing init tests**

Create `crates/loci-cli/tests/init_doctor.rs`:

```rust
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
```

- [ ] **Step 2: Run init test and verify it fails**

Run:

```bash
cargo test -p loci-cli --test init_doctor init_creates_loci_workspace_and_registry
```

Expected: FAIL because `init` does not accept `--name` / `--prefix` or create files.

- [ ] **Step 3: Add init arguments to CLI parser**

Modify the `Init` variant in `crates/loci-cli/src/app.rs`:

```rust
    /// Initialize a Loci workspace in the current project.
    Init {
        /// Project display name.
        #[arg(long)]
        name: String,

        /// Project ticket prefix, for example LCI.
        #[arg(long)]
        prefix: String,
    },
```

Modify dispatch:

```rust
        Commands::Init { name, prefix } => commands::init::run(&name, &prefix),
```

- [ ] **Step 4: Add template renderer**

Create `crates/loci-cli/src/templates.rs`:

```rust
use crate::domain::ProjectRecord;

pub const DEFAULT_TEMPLATE_PACK_ID: &str = "loci-default";
pub const DEFAULT_TEMPLATE_PACK_VERSION: &str = "1";

pub fn agents_md() -> String {
    r#"# Agent Instructions

Before working in this repo:

1. Read `LOCI.md`.
2. Run `loci doctor`.
3. For ticket work, run `loci get <ticket-id> --json`.
4. Read linked docs under `loci/`.
5. Record validation evidence before moving work to review.

<!-- LOCI:BEGIN -->
Loci manages the workflow instructions in `LOCI.md`.
<!-- LOCI:END -->
"#
    .to_string()
}

pub fn loci_md(project: &ProjectRecord) -> String {
    format!(
        r#"# Loci Operating Guide

<!-- LOCI:BEGIN -->
Project: {name}
Prefix: {prefix}

## Start Here

1. Run `loci doctor`.
2. For ticket work, run `loci get <ticket-id> --json`.
3. Read linked docs in `loci/tickets/<ticket-id>/`.
4. Do not move work to `in_review` without evidence and trace records.
5. Do not move work to `done` without human confirmation.

## Core Commands

```bash
loci init
loci doctor
loci list --json
loci get <ticket-id> --json
```

## Required Docs

- `loci/project.md`
- `loci/architecture.md`
- `loci/validation.md`
- `loci/guardrails.md`
- `loci/current-state.md`
- `loci/glossary.md`
<!-- LOCI:END -->
"#,
        name = project.name,
        prefix = project.prefix
    )
}

pub fn project_md(project: &ProjectRecord) -> String {
    format!(
        r#"# Project

## Name

{name}

## Ticket Prefix

{prefix}

## Problem

Describe the problem this project solves.

## Target Users

Describe who this project serves.

## Core Workflow

Describe the primary workflow.
"#,
        name = project.name,
        prefix = project.prefix
    )
}

pub fn architecture_md() -> &'static str {
    "# Architecture\n\n## Overview\n\nDescribe the current architecture.\n\n## Boundaries\n\nDescribe module boundaries and ownership rules.\n"
}

pub fn validation_md() -> &'static str {
    "# Validation\n\n## Always Run\n\nList default validation commands.\n\n## Evidence Rules\n\nRecord evidence before review.\n"
}

pub fn guardrails_md() -> &'static str {
    "# Guardrails\n\n- Do not move tickets to done without human confirmation.\n- Do not skip validation silently.\n- Do not broaden scope without updating the story packet.\n"
}

pub fn current_state_md() -> &'static str {
    "# Current State\n\n## Works\n\n## Next\n\n## Blocked\n"
}

pub fn glossary_md() -> &'static str {
    "# Glossary\n\nAdd domain terms that agents should understand.\n"
}

pub fn backlog_md() -> &'static str {
    "# Harness Backlog\n\nCapture missing docs, validation gaps, and repeated agent friction.\n"
}
```

- [ ] **Step 5: Export templates**

Modify `crates/loci-cli/src/lib.rs`:

```rust
pub mod app;
pub mod commands;
pub mod db;
pub mod domain;
pub mod migrations;
pub mod paths;
pub mod project;
pub mod registry;
pub mod templates;

pub use app::run;
```

- [ ] **Step 6: Implement init**

Replace `crates/loci-cli/src/commands/init.rs`:

```rust
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Result};
use rusqlite::params;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::db::{connect_project_db, connect_registry_db};
use crate::domain::{ProjectRecord, RegisteredProject};
use crate::paths::LociPaths;
use crate::project::insert_project;
use crate::registry::upsert_registered_project;
use crate::templates;

pub fn run(name: &str, prefix: &str) -> Result<()> {
    if !is_valid_prefix(prefix) {
        bail!("prefix must be 2-5 uppercase ASCII letters");
    }

    let cwd = std::env::current_dir()?;
    let home = home_dir()?;
    let paths = LociPaths::new(cwd.clone(), home);

    fs::create_dir_all(paths.visible_loci_dir.join("decisions"))?;
    fs::create_dir_all(paths.visible_loci_dir.join("templates"))?;
    fs::create_dir_all(paths.visible_loci_dir.join("tickets"))?;
    fs::create_dir_all(&paths.project_state_dir)?;

    let now = now_string();
    let project = ProjectRecord {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        prefix: prefix.to_string(),
        loci_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    write_if_missing(cwd.join("AGENTS.md"), &templates::agents_md())?;
    write_if_missing(cwd.join("LOCI.md"), &templates::loci_md(&project))?;
    write_if_missing(paths.visible_loci_dir.join("project.md"), &templates::project_md(&project))?;
    write_if_missing(paths.visible_loci_dir.join("architecture.md"), templates::architecture_md())?;
    write_if_missing(paths.visible_loci_dir.join("validation.md"), templates::validation_md())?;
    write_if_missing(paths.visible_loci_dir.join("guardrails.md"), templates::guardrails_md())?;
    write_if_missing(paths.visible_loci_dir.join("current-state.md"), templates::current_state_md())?;
    write_if_missing(paths.visible_loci_dir.join("glossary.md"), templates::glossary_md())?;
    write_if_missing(paths.visible_loci_dir.join("backlog.md"), templates::backlog_md())?;

    fs::write(
        &paths.project_config,
        format!(
            "project_id = \"{}\"\nname = \"{}\"\nprefix = \"{}\"\nloci_version = \"{}\"\n",
            project.id, project.name, project.prefix, project.loci_version
        ),
    )?;

    let project_conn = connect_project_db(&paths.project_db)?;
    insert_project(&project_conn, &project)?;
    project_conn.execute(
        "INSERT OR REPLACE INTO template_pack (id, name, version, applied_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            templates::DEFAULT_TEMPLATE_PACK_ID,
            "Loci Default",
            templates::DEFAULT_TEMPLATE_PACK_VERSION,
            now
        ],
    )?;

    let registry_conn = connect_registry_db(&paths.global_registry_db)?;
    let registered = RegisteredProject {
        id: project.id.clone(),
        name: project.name.clone(),
        prefix: project.prefix.clone(),
        path: cwd.to_string_lossy().to_string(),
        loci_version: project.loci_version.clone(),
        health_status: "warning".to_string(),
        open_ticket_count: 0,
        review_ticket_count: 0,
        validation_failure_count: 0,
    };
    upsert_registered_project(&registry_conn, &registered, &cwd.to_string_lossy())?;

    println!("Initialized Loci workspace");
    println!("Project: {}", project.name);
    println!("Prefix: {}", project.prefix);

    Ok(())
}

fn is_valid_prefix(prefix: &str) -> bool {
    (2..=5).contains(&prefix.len()) && prefix.chars().all(|c| c.is_ascii_uppercase())
}

fn write_if_missing(path: PathBuf, content: &str) -> Result<()> {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, content)?;
    }
    Ok(())
}

fn home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME is not set"))
}

fn now_string() -> String {
    OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .expect("format current time")
}
```

- [ ] **Step 7: Run init test and verify it passes**

Run:

```bash
cargo test -p loci-cli --test init_doctor init_creates_loci_workspace_and_registry
```

Expected: PASS.

- [ ] **Step 8: Run all Rust tests**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add crates/loci-cli/src crates/loci-cli/tests/init_doctor.rs
git commit -m "feat(cli): initialize Loci harness workspace"
```

## Task 5: Implement `loci doctor`

**Files:**

- Modify: `crates/loci-cli/src/commands/doctor.rs`
- Modify: `crates/loci-cli/tests/init_doctor.rs`

- [ ] **Step 1: Add failing doctor tests**

Append to `crates/loci-cli/tests/init_doctor.rs`:

```rust
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
```

- [ ] **Step 2: Run doctor tests and verify they fail**

Run:

```bash
cargo test -p loci-cli --test init_doctor doctor_
```

Expected: FAIL because doctor is still a placeholder.

- [ ] **Step 3: Implement doctor checks**

Replace `crates/loci-cli/src/commands/doctor.rs`:

```rust
use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::db::connect_project_db;
use crate::domain::{DoctorReport, HealthCheck, HealthStatus};
use crate::paths::{find_workspace_root, LociPaths};

pub fn run(json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let paths = LociPaths::new(root.clone(), home_dir()?);

    let report = build_report(&paths)?;
    let has_error = report.status == HealthStatus::Error;

    if json {
        println!("{}", serde_json::to_string(&report)?);
    } else {
        println!("Loci doctor: {:?}", report.status);
        for check in &report.checks {
            println!("- {:?}: {}", check.status, check.message);
        }
    }

    if has_error {
        bail!("Loci workspace has errors");
    }

    Ok(())
}

fn build_report(paths: &LociPaths) -> Result<DoctorReport> {
    let mut checks = Vec::new();

    require_file(&mut checks, "agents", &paths.workspace_root.join("AGENTS.md"), "AGENTS.md exists");
    require_file(&mut checks, "loci_md", &paths.workspace_root.join("LOCI.md"), "LOCI.md exists");
    require_file(&mut checks, "project_doc", &paths.visible_loci_dir.join("project.md"), "loci/project.md exists");
    require_file(&mut checks, "architecture_doc", &paths.visible_loci_dir.join("architecture.md"), "loci/architecture.md exists");
    require_file(&mut checks, "validation_doc", &paths.visible_loci_dir.join("validation.md"), "loci/validation.md exists");
    require_file(&mut checks, "guardrails_doc", &paths.visible_loci_dir.join("guardrails.md"), "loci/guardrails.md exists");
    require_file(&mut checks, "project_db", &paths.project_db, ".loci/loci.db exists");

    match connect_project_db(&paths.project_db) {
        Ok(_) => checks.push(HealthCheck {
            code: "project_db_schema".to_string(),
            status: HealthStatus::Healthy,
            message: "project database schema is current".to_string(),
        }),
        Err(error) => checks.push(HealthCheck {
            code: "project_db_schema".to_string(),
            status: HealthStatus::Error,
            message: format!("project database schema failed: {error}"),
        }),
    }

    let status = if checks.iter().any(|check| check.status == HealthStatus::Error) {
        HealthStatus::Error
    } else if checks.iter().any(|check| check.status == HealthStatus::Warning) {
        HealthStatus::Warning
    } else {
        HealthStatus::Healthy
    };

    Ok(DoctorReport {
        project_path: paths.workspace_root.to_string_lossy().to_string(),
        status,
        checks,
    })
}

fn require_file(checks: &mut Vec<HealthCheck>, code: &str, path: &Path, ok_message: &str) {
    if path.is_file() {
        checks.push(HealthCheck {
            code: code.to_string(),
            status: HealthStatus::Healthy,
            message: ok_message.to_string(),
        });
    } else {
        checks.push(HealthCheck {
            code: code.to_string(),
            status: HealthStatus::Error,
            message: format!("missing {}", display_path(path)),
        });
    }
}

fn display_path(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME is not set"))
}
```

- [ ] **Step 4: Run doctor tests and verify they pass**

Run:

```bash
cargo test -p loci-cli --test init_doctor doctor_
```

Expected: PASS.

- [ ] **Step 5: Run all Rust tests**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add crates/loci-cli/src/commands/doctor.rs crates/loci-cli/tests/init_doctor.rs
git commit -m "feat(cli): add Loci doctor checks"
```

## Task 6: Implement `loci list --json` And `loci get --json`

**Files:**

- Modify: `crates/loci-cli/src/commands/list.rs`
- Modify: `crates/loci-cli/src/commands/get.rs`
- Create: `crates/loci-cli/tests/list_get.rs`

- [ ] **Step 1: Write failing list/get tests**

Create `crates/loci-cli/tests/list_get.rs`:

```rust
use assert_cmd::Command;
use predicates::str::contains;
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

fn seed_ticket(workspace: &TempDir) {
    let db_path = workspace.path().join(".loci/loci.db");
    let conn = Connection::open(db_path).expect("open db");
    conn.execute(
        r#"
        INSERT INTO ticket (
            id, title, status, priority, labels_json, progress, risk_lane,
            readiness_state, validation_state, review_state, created_at, updated_at,
            story_path
        )
        VALUES (
            'EXA-001', 'First story', 'idea', 'medium', '["harness"]', 0, 'normal',
            'missing', 'missing', 'not_ready', '2026-01-01T00:00:00Z',
            '2026-01-01T00:00:00Z', 'loci/tickets/EXA-001/story.md'
        )
        "#,
        [],
    )
    .expect("insert ticket");

    let ticket_dir = workspace.path().join("loci/tickets/EXA-001");
    std::fs::create_dir_all(&ticket_dir).expect("ticket dir");
    std::fs::write(ticket_dir.join("story.md"), "# Story\n\nFirst story body.").expect("story");
}

#[test]
fn list_json_returns_tickets() {
    let (home, workspace) = initialized_workspace();
    seed_ticket(&workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["list", "--json"])
        .assert()
        .success()
        .stdout(contains("\"id\":\"EXA-001\""))
        .stdout(contains("\"title\":\"First story\""));
}

#[test]
fn get_json_returns_ticket_and_docs() {
    let (home, workspace) = initialized_workspace();
    seed_ticket(&workspace);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["get", "EXA-001", "--json"])
        .assert()
        .success()
        .stdout(contains("\"id\":\"EXA-001\""))
        .stdout(contains("First story body"));
}
```

- [ ] **Step 2: Run list/get tests and verify they fail**

Run:

```bash
cargo test -p loci-cli --test list_get
```

Expected: FAIL because list/get are placeholders.

- [ ] **Step 3: Implement list command**

Replace `crates/loci-cli/src/commands/list.rs`:

```rust
use std::path::PathBuf;

use anyhow::Result;

use crate::db::connect_project_db;
use crate::paths::{find_workspace_root, LociPaths};
use crate::project::list_tickets;

pub fn run(json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let paths = LociPaths::new(root, home_dir()?);
    let conn = connect_project_db(&paths.project_db)?;
    let tickets = list_tickets(&conn)?;

    if json {
        println!("{}", serde_json::to_string(&tickets)?);
    } else if tickets.is_empty() {
        println!("No tickets");
    } else {
        for ticket in tickets {
            println!("{} [{}] {}", ticket.id, ticket.status, ticket.title);
        }
    }

    Ok(())
}

fn home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME is not set"))
}
```

- [ ] **Step 4: Implement get command**

Replace `crates/loci-cli/src/commands/get.rs`:

```rust
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Result};

use crate::db::connect_project_db;
use crate::domain::{TicketRecord, TicketWithDocs};
use crate::paths::{find_workspace_root, LociPaths};
use crate::project::get_ticket;

pub fn run(id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let paths = LociPaths::new(root.clone(), home_dir()?);
    let conn = connect_project_db(&paths.project_db)?;
    let ticket = get_ticket(&conn, id)?.ok_or_else(|| anyhow::anyhow!("ticket {id} not found"))?;
    let docs = read_ticket_docs(&root, &ticket)?;
    let payload = TicketWithDocs { ticket, docs };

    if json {
        println!("{}", serde_json::to_string(&payload)?);
    } else {
        println!("{} [{}] {}", payload.ticket.id, payload.ticket.status, payload.ticket.title);
        for path in payload.docs.keys() {
            println!("- {path}");
        }
    }

    Ok(())
}

fn read_ticket_docs(root: &std::path::Path, ticket: &TicketRecord) -> Result<BTreeMap<String, String>> {
    let mut docs = BTreeMap::new();
    let paths = [
        ticket.story_path.as_ref(),
        ticket.design_path.as_ref(),
        ticket.plan_path.as_ref(),
        ticket.validation_path.as_ref(),
        ticket.evidence_path.as_ref(),
        ticket.summary_path.as_ref(),
        ticket.lessons_path.as_ref(),
        ticket.harness_delta_path.as_ref(),
    ];

    for maybe_path in paths.into_iter().flatten() {
        let path = root.join(maybe_path);
        if path.is_file() {
            docs.insert(maybe_path.to_string(), fs::read_to_string(path)?);
        }
    }

    Ok(docs)
}

fn home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME is not set"))
}
```

- [ ] **Step 5: Run list/get tests and verify they pass**

Run:

```bash
cargo test -p loci-cli --test list_get
```

Expected: PASS.

- [ ] **Step 6: Run all Rust tests**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add crates/loci-cli/src/commands/list.rs crates/loci-cli/src/commands/get.rs crates/loci-cli/tests/list_get.rs
git commit -m "feat(cli): read Loci tickets from SQLite"
```

## Task 7: Document Foundation Status And Validate Existing Repo

**Files:**

- Modify: `docs/superpowers/specs/2026-05-23-loci-native-harness-design.md` only if implementation reveals a design correction.
- Modify: `LCI-044` ticket docs through Loci CLI/MCP only if implementation reveals a planning correction.

- [ ] **Step 1: Run Rust test suite**

Run:

```bash
cargo test -p loci-cli
```

Expected: PASS.

- [ ] **Step 2: Run existing Bun tests**

Run:

```bash
bun test --cwd packages/cli
```

Expected: PASS. This proves the existing TypeScript CLI still works after adding the Rust workspace.

- [ ] **Step 3: Run current project doctor smoke check**

From a temporary directory, run:

```bash
cargo run -p loci-cli -- init --name "Smoke App" --prefix SMK
cargo run -p loci-cli -- doctor
cargo run -p loci-cli -- list --json
```

Expected:

- `init` prints `Initialized Loci workspace`.
- `doctor` exits 0 and prints healthy checks.
- `list --json` prints `[]`.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked.

- [ ] **Step 5: Commit any final documentation correction**

If no documentation correction is needed, skip this step.

If a correction is needed, run:

```bash
git add docs/superpowers/specs/2026-05-23-loci-native-harness-design.md
git commit -m "docs: clarify Rust CLI foundation behavior"
```

## Plan Self-Review

Spec coverage:

- Rust CLI foundation: Tasks 1-2.
- SQLite project DB and global registry DB: Task 3.
- Visible `loci/` docs and generated `AGENTS.md` / `LOCI.md`: Task 4.
- Top-level `loci init` and `loci doctor`: Tasks 4-5.
- Initial `list` and `get` JSON commands for agents: Task 6.
- Validation before handoff: Task 7.

Known gaps intentionally deferred to later plans:

- `loci add`, `shape`, `plan`, `ready`, `validate`, `evidence`, `trace`, `intake`, `decision`, `backlog`.
- Legacy upgrade from `.loci/tickets` JSON storage.
- Web dashboard integration.
- Release/update packaging and TypeScript CLI cutover.

Placeholder scan:

- This plan intentionally avoids placeholder phrases and vague deferred-work steps.
- Every task includes concrete file paths, commands, and expected outcomes.

Type consistency:

- `ProjectRecord`, `TicketRecord`, `RegisteredProject`, `DoctorReport`, `HealthCheck`, and `HealthStatus` are defined before use.
- `connect_project_db`, `connect_registry_db`, `list_tickets`, and `get_ticket` are defined before command tasks depend on them.
