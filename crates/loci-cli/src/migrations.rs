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

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL CHECK(evidence_type IN ('command','screenshot','log','manual_check','test_report','link','note')),
    layer TEXT CHECK(layer IN ('unit','integration','e2e','ui','accessibility','performance','security','logs_audit','manual','release')),
    title TEXT NOT NULL,
    summary TEXT,
    command TEXT,
    artifact_path TEXT,
    url TEXT,
    note TEXT,
    exit_code INTEGER,
    outcome TEXT NOT NULL CHECK(outcome IN ('passing','failing','partial','skipped','informational')),
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES ticket(id)
);

CREATE TABLE IF NOT EXISTS validation_run (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('passing','failing')),
    exit_code INTEGER,
    evidence_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES ticket(id),
    FOREIGN KEY(evidence_id) REFERENCES evidence(id)
);

CREATE TABLE IF NOT EXISTS trace (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('intake','plan','action','command','error','decision','validation','evidence','summary','review','handoff','note')),
    task_summary TEXT NOT NULL,
    intake TEXT,
    actions_json TEXT NOT NULL DEFAULT '[]',
    files_read_json TEXT NOT NULL DEFAULT '[]',
    files_changed_json TEXT NOT NULL DEFAULT '[]',
    commands_json TEXT NOT NULL DEFAULT '[]',
    errors_json TEXT NOT NULL DEFAULT '[]',
    decisions_json TEXT NOT NULL DEFAULT '[]',
    outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','partial','blocked','informational')),
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES ticket(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_ticket_id ON trace(ticket_id);
CREATE INDEX IF NOT EXISTS idx_trace_actor ON trace(actor);
CREATE INDEX IF NOT EXISTS idx_trace_event_type ON trace(event_type);
CREATE INDEX IF NOT EXISTS idx_trace_created_at ON trace(created_at);

CREATE TABLE IF NOT EXISTS trace_evidence (
    trace_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(trace_id, evidence_id),
    FOREIGN KEY(trace_id) REFERENCES trace(id),
    FOREIGN KEY(evidence_id) REFERENCES evidence(id)
);

CREATE TABLE IF NOT EXISTS decision (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('proposed','accepted','superseded')),
    context_json TEXT NOT NULL DEFAULT '[]',
    decision_json TEXT NOT NULL DEFAULT '[]',
    consequences_json TEXT NOT NULL DEFAULT '[]',
    ticket_ids_json TEXT NOT NULL DEFAULT '[]',
    trace_ids_json TEXT NOT NULL DEFAULT '[]',
    doc_paths_json TEXT NOT NULL DEFAULT '[]',
    doc_path TEXT NOT NULL UNIQUE,
    verification_outcome TEXT NOT NULL DEFAULT 'pending' CHECK(verification_outcome IN ('pending','passing','failing','skipped')),
    verification_command TEXT,
    verification_note TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_status ON decision(status);
CREATE INDEX IF NOT EXISTS idx_decision_created_at ON decision(created_at);

CREATE TABLE IF NOT EXISTS backlog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('missing_doc','stale_validation','agent_friction','design_gap','ownership_gap','architecture_gap')),
    status TEXT NOT NULL CHECK(status IN ('open','accepted','resolved')),
    sources_json TEXT NOT NULL DEFAULT '[]',
    impact_json TEXT NOT NULL DEFAULT '[]',
    recommendations_json TEXT NOT NULL DEFAULT '[]',
    ticket_ids_json TEXT NOT NULL DEFAULT '[]',
    trace_ids_json TEXT NOT NULL DEFAULT '[]',
    doc_paths_json TEXT NOT NULL DEFAULT '[]',
    resolution_note TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_kind ON backlog(kind);
CREATE INDEX IF NOT EXISTS idx_backlog_status ON backlog(status);
CREATE INDEX IF NOT EXISTS idx_backlog_created_at ON backlog(created_at);

CREATE TABLE IF NOT EXISTS ticket_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('upload', 'legacy_import')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES ticket(id),
    UNIQUE(ticket_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_ticket_file_ticket_id ON ticket_file(ticket_id);
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
