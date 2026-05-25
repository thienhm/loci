use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
pub struct EvidenceRecord {
    pub id: String,
    pub ticket_id: String,
    pub evidence_type: String,
    pub layer: Option<String>,
    pub title: String,
    pub summary: Option<String>,
    pub command: Option<String>,
    pub artifact_path: Option<String>,
    pub url: Option<String>,
    pub note: Option<String>,
    pub exit_code: Option<i64>,
    pub outcome: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TraceRecord {
    pub id: String,
    pub ticket_id: String,
    pub actor: String,
    pub event_type: String,
    pub task_summary: String,
    pub intake: Option<String>,
    pub actions: Vec<String>,
    pub files_read: Vec<String>,
    pub files_changed: Vec<String>,
    pub commands: Vec<String>,
    pub errors: Vec<String>,
    pub decisions: Vec<String>,
    pub outcome: String,
    pub evidence_ids: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TraceListFilters {
    pub ticket_id: Option<String>,
    pub actor: Option<String>,
    pub event_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TicketWithDocs {
    #[serde(flatten)]
    pub ticket: TicketRecord,
    pub docs: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkflowCommandResponse {
    pub ok: bool,
    pub ticket: TicketRecord,
    pub docs: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MissingReadinessField {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReadinessReport {
    pub ready: bool,
    pub missing: Vec<MissingReadinessField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReadyCommandResponse {
    pub ok: bool,
    pub ready: bool,
    pub ticket: TicketRecord,
    pub missing: Vec<MissingReadinessField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationInspectionResponse {
    pub ok: bool,
    pub ticket_id: String,
    pub validation_state: String,
    pub review_state: String,
    pub declared_commands: Vec<String>,
    pub evidence_count: usize,
    pub summary_present: bool,
    pub ready_for_review: bool,
    pub missing: Vec<MissingReadinessField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationCommandResult {
    pub command: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub evidence_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationRunRecord {
    pub id: String,
    pub ticket_id: String,
    pub command: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub evidence_id: String,
    pub started_at: String,
    pub finished_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationRunResponse {
    pub ok: bool,
    pub ticket_id: String,
    pub validation_state: String,
    pub results: Vec<ValidationCommandResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SummaryCommandResponse {
    pub ok: bool,
    pub ticket: TicketRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReviewCommandResponse {
    pub ok: bool,
    pub ready_for_review: bool,
    pub ticket: TicketRecord,
    pub missing: Vec<MissingReadinessField>,
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
