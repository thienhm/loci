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
