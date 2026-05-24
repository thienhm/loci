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
