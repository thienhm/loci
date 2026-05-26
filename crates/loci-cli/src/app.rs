use anyhow::Result;
use clap::{Args, Parser, Subcommand, ValueEnum};

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
    /// Create a new workflow packet.
    Add {
        /// Ticket title.
        title: String,

        /// Ticket priority.
        #[arg(long, value_enum, default_value = "medium")]
        priority: PriorityArg,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Shape a workflow packet.
    Shape {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Desired outcome for the workflow packet.
        #[arg(long)]
        intent: Vec<String>,

        /// Work included in this packet.
        #[arg(long)]
        scope: Vec<String>,

        /// Work excluded from this packet.
        #[arg(long = "out-of-scope")]
        out_of_scope: Vec<String>,

        /// Context document or reference link.
        #[arg(long)]
        context: Vec<String>,

        /// Acceptance criterion.
        #[arg(long)]
        acceptance: Vec<String>,

        /// Risk lane for the shaped work.
        #[arg(long, value_enum, default_value = "normal")]
        risk_lane: RiskLaneArg,

        /// Validation command or requirement.
        #[arg(long)]
        validation: Vec<String>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Plan a shaped workflow packet.
    Plan {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Checkable implementation step.
        #[arg(long)]
        step: Vec<String>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Check whether a workflow packet is ready.
    Ready {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Inspect or run declared validation commands.
    Validate {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Run declared validation commands.
        #[arg(long)]
        run: bool,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Record and inspect validation evidence.
    Evidence {
        #[command(subcommand)]
        command: EvidenceCommands,
    },

    /// Record and inspect operational traces.
    Trace {
        #[command(subcommand)]
        command: TraceCommands,
    },

    /// Record and inspect project decisions.
    Decision {
        #[command(subcommand)]
        command: DecisionCommands,
    },

    /// Record and inspect harness backlog items.
    Backlog {
        #[command(subcommand)]
        command: BacklogCommands,
    },

    /// Write a review summary.
    Summary {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Summary text.
        #[arg(long)]
        text: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Move a ticket to review when proof gates pass.
    Review {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Explicit reason for skipping validation.
        #[arg(long)]
        skip_validation: Option<String>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Upgrade project data and built-in template docs.
    Upgrade {
        /// Report pending changes without modifying files or database state.
        #[arg(long)]
        dry_run: bool,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Initialize a Loci workspace in the current project.
    Init {
        /// Project display name.
        #[arg(long)]
        name: String,

        /// Project ticket prefix, for example LCI.
        #[arg(long)]
        prefix: String,
    },

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

#[derive(Debug, Subcommand)]
pub enum TraceCommands {
    /// Add an operational trace record.
    Add(Box<TraceAddArgs>),

    /// List operational trace records.
    List {
        /// Ticket id, for example LCI-001.
        #[arg(long)]
        ticket: Option<String>,

        /// Trace actor, for example agent:codex.
        #[arg(long)]
        actor: Option<String>,

        /// Trace event type.
        #[arg(long = "type", value_enum)]
        event_type: Option<TraceEventTypeArg>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Show one operational trace record.
    Show {
        /// Trace id, for example TR-000001.
        trace_id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, Args)]
pub struct TraceAddArgs {
    /// Ticket id, for example LCI-001.
    pub id: String,

    /// Trace task summary.
    #[arg(long)]
    pub summary: String,

    /// Trace actor, for example agent:codex.
    #[arg(long)]
    pub actor: String,

    /// Trace event type.
    #[arg(long = "type", value_enum, default_value = "action")]
    pub event_type: TraceEventTypeArg,

    /// Intake context.
    #[arg(long)]
    pub intake: Option<String>,

    /// Action taken.
    #[arg(long)]
    pub action: Vec<String>,

    /// File read while working.
    #[arg(long = "file-read")]
    pub file_read: Vec<String>,

    /// File changed while working.
    #[arg(long = "file-changed")]
    pub file_changed: Vec<String>,

    /// Command run while working.
    #[arg(long)]
    pub command: Vec<String>,

    /// Error encountered while working.
    #[arg(long)]
    pub error: Vec<String>,

    /// Decision made while working.
    #[arg(long)]
    pub decision: Vec<String>,

    /// Trace outcome.
    #[arg(long, value_enum, default_value = "informational")]
    pub outcome: TraceOutcomeArg,

    /// Evidence id linked to the trace.
    #[arg(long)]
    pub evidence: Vec<String>,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Subcommand)]
pub enum DecisionCommands {
    /// Add a project decision record.
    Add(Box<DecisionAddArgs>),

    /// List project decision records.
    List {
        /// Ticket id, for example LCI-001.
        #[arg(long)]
        ticket: Option<String>,

        /// Trace id, for example TR-000001.
        #[arg(long)]
        trace: Option<String>,

        /// Decision status.
        #[arg(long, value_enum)]
        status: Option<DecisionStatusArg>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Show one project decision record.
    Show {
        /// Decision id, for example DEC-000001.
        decision_id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Verify a project decision record.
    Verify(Box<DecisionVerifyArgs>),
}

#[derive(Debug, Args)]
pub struct DecisionAddArgs {
    /// Decision title.
    #[arg(long)]
    pub title: String,

    /// Decision status.
    #[arg(long, value_enum, default_value = "accepted")]
    pub status: DecisionStatusArg,

    /// Decision context.
    #[arg(long)]
    pub context: Vec<String>,

    /// Decision text.
    #[arg(long)]
    pub decision: Vec<String>,

    /// Decision consequence.
    #[arg(long)]
    pub consequence: Vec<String>,

    /// Linked ticket id.
    #[arg(long)]
    pub ticket: Vec<String>,

    /// Linked trace id.
    #[arg(long)]
    pub trace: Vec<String>,

    /// Linked document path.
    #[arg(long)]
    pub doc: Vec<String>,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct DecisionVerifyArgs {
    /// Decision id, for example DEC-000001.
    pub decision_id: String,

    /// Verification outcome.
    #[arg(long, value_enum)]
    pub outcome: DecisionVerificationOutcomeArg,

    /// Verification command.
    #[arg(long)]
    pub command: Option<String>,

    /// Verification note.
    #[arg(long)]
    pub note: String,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Subcommand)]
pub enum BacklogCommands {
    /// Add a harness backlog item.
    Add(Box<BacklogAddArgs>),

    /// List harness backlog items.
    List {
        /// Backlog status.
        #[arg(long, value_enum)]
        status: Option<BacklogStatusArg>,

        /// Backlog kind.
        #[arg(long, value_enum)]
        kind: Option<BacklogKindArg>,

        /// Ticket id, for example LCI-001.
        #[arg(long)]
        ticket: Option<String>,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Show one harness backlog item.
    Show {
        /// Backlog item id, for example HB-000001.
        backlog_id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Update a harness backlog item status.
    Status(Box<BacklogStatusArgs>),
}

#[derive(Debug, Args)]
pub struct BacklogAddArgs {
    /// Backlog item title.
    #[arg(long)]
    pub title: String,

    /// Backlog item kind.
    #[arg(long, value_enum)]
    pub kind: BacklogKindArg,

    /// Backlog item status.
    #[arg(long, value_enum, default_value = "open")]
    pub status: BacklogStatusArg,

    /// Backlog source.
    #[arg(long)]
    pub source: Vec<String>,

    /// Backlog impact.
    #[arg(long)]
    pub impact: Vec<String>,

    /// Backlog recommendation.
    #[arg(long)]
    pub recommendation: Vec<String>,

    /// Linked ticket id.
    #[arg(long)]
    pub ticket: Vec<String>,

    /// Linked trace id.
    #[arg(long)]
    pub trace: Vec<String>,

    /// Linked document path.
    #[arg(long)]
    pub doc: Vec<String>,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct BacklogStatusArgs {
    /// Backlog item id, for example HB-000001.
    pub backlog_id: String,

    /// New backlog status.
    #[arg(value_enum)]
    pub status: BacklogStatusArg,

    /// Status note.
    #[arg(long)]
    pub note: Option<String>,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Subcommand)]
pub enum EvidenceCommands {
    /// Add an evidence record.
    Add(Box<EvidenceAddArgs>),

    /// List evidence records for a ticket.
    List {
        /// Ticket id, for example LCI-001.
        id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Show one evidence record.
    Show {
        /// Evidence id, for example EV-000001.
        evidence_id: String,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, Args)]
pub struct EvidenceAddArgs {
    /// Ticket id, for example LCI-001.
    pub id: String,

    /// Evidence type.
    #[arg(long = "type", value_enum)]
    pub evidence_type: EvidenceTypeArg,

    /// Evidence title.
    #[arg(long)]
    pub title: String,

    /// Short evidence summary.
    #[arg(long)]
    pub summary: Option<String>,

    /// Validation layer.
    #[arg(long, value_enum)]
    pub layer: Option<ValidationLayerArg>,

    /// Command that produced the evidence.
    #[arg(long)]
    pub command: Option<String>,

    /// Artifact path.
    #[arg(long)]
    pub path: Option<String>,

    /// Artifact URL.
    #[arg(long)]
    pub url: Option<String>,

    /// Evidence note.
    #[arg(long)]
    pub note: Option<String>,

    /// Evidence outcome.
    #[arg(long, value_enum)]
    pub outcome: Option<EvidenceOutcomeArg>,

    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
}

#[derive(Clone, Debug, ValueEnum)]
pub enum PriorityArg {
    Low,
    Medium,
    High,
}

impl PriorityArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum RiskLaneArg {
    Tiny,
    Normal,
    #[value(name = "high-risk", alias = "high_risk")]
    HighRisk,
}

impl RiskLaneArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tiny => "tiny",
            Self::Normal => "normal",
            Self::HighRisk => "high_risk",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum EvidenceTypeArg {
    Command,
    Screenshot,
    Log,
    #[value(name = "manual-check", alias = "manual_check")]
    ManualCheck,
    #[value(name = "test-report", alias = "test_report")]
    TestReport,
    Link,
    Note,
}

impl EvidenceTypeArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Command => "command",
            Self::Screenshot => "screenshot",
            Self::Log => "log",
            Self::ManualCheck => "manual_check",
            Self::TestReport => "test_report",
            Self::Link => "link",
            Self::Note => "note",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum ValidationLayerArg {
    Unit,
    Integration,
    E2e,
    Ui,
    Accessibility,
    Performance,
    Security,
    #[value(name = "logs-audit", alias = "logs_audit")]
    LogsAudit,
    Manual,
    Release,
}

impl ValidationLayerArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unit => "unit",
            Self::Integration => "integration",
            Self::E2e => "e2e",
            Self::Ui => "ui",
            Self::Accessibility => "accessibility",
            Self::Performance => "performance",
            Self::Security => "security",
            Self::LogsAudit => "logs_audit",
            Self::Manual => "manual",
            Self::Release => "release",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum EvidenceOutcomeArg {
    Passing,
    Failing,
    Partial,
    Skipped,
    Informational,
}

impl EvidenceOutcomeArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Passing => "passing",
            Self::Failing => "failing",
            Self::Partial => "partial",
            Self::Skipped => "skipped",
            Self::Informational => "informational",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum DecisionStatusArg {
    Proposed,
    Accepted,
    Superseded,
}

impl DecisionStatusArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Proposed => "proposed",
            Self::Accepted => "accepted",
            Self::Superseded => "superseded",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum DecisionVerificationOutcomeArg {
    Passing,
    Failing,
    Skipped,
}

impl DecisionVerificationOutcomeArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Passing => "passing",
            Self::Failing => "failing",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum BacklogKindArg {
    #[value(name = "missing-doc", alias = "missing_doc")]
    MissingDoc,
    #[value(name = "stale-validation", alias = "stale_validation")]
    StaleValidation,
    #[value(name = "agent-friction", alias = "agent_friction")]
    AgentFriction,
    #[value(name = "design-gap", alias = "design_gap")]
    DesignGap,
    #[value(name = "ownership-gap", alias = "ownership_gap")]
    OwnershipGap,
    #[value(name = "architecture-gap", alias = "architecture_gap")]
    ArchitectureGap,
}

impl BacklogKindArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MissingDoc => "missing_doc",
            Self::StaleValidation => "stale_validation",
            Self::AgentFriction => "agent_friction",
            Self::DesignGap => "design_gap",
            Self::OwnershipGap => "ownership_gap",
            Self::ArchitectureGap => "architecture_gap",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum BacklogStatusArg {
    Open,
    Accepted,
    Resolved,
}

impl BacklogStatusArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Accepted => "accepted",
            Self::Resolved => "resolved",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum TraceEventTypeArg {
    Intake,
    Plan,
    Action,
    Command,
    Error,
    Decision,
    Validation,
    Evidence,
    Summary,
    Review,
    Handoff,
    Note,
}

impl TraceEventTypeArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Intake => "intake",
            Self::Plan => "plan",
            Self::Action => "action",
            Self::Command => "command",
            Self::Error => "error",
            Self::Decision => "decision",
            Self::Validation => "validation",
            Self::Evidence => "evidence",
            Self::Summary => "summary",
            Self::Review => "review",
            Self::Handoff => "handoff",
            Self::Note => "note",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
pub enum TraceOutcomeArg {
    Success,
    Failure,
    Partial,
    Blocked,
    Informational,
}

impl TraceOutcomeArg {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Failure => "failure",
            Self::Partial => "partial",
            Self::Blocked => "blocked",
            Self::Informational => "informational",
        }
    }
}

pub fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Add {
            title,
            priority,
            json,
        } => commands::add::run(&title, priority, json),
        Commands::Shape {
            id,
            intent,
            scope,
            out_of_scope,
            context,
            acceptance,
            risk_lane,
            validation,
            json,
        } => commands::shape::run(commands::shape::ShapeInput {
            id,
            intent,
            scope,
            out_of_scope,
            context,
            acceptance,
            risk_lane,
            validation,
            json,
        }),
        Commands::Plan { id, step, json } => commands::plan::run(commands::plan::PlanInput {
            id,
            steps: step,
            json,
        }),
        Commands::Ready { id, json } => commands::ready::run(&id, json),
        Commands::Validate { id, run, json } => commands::validate::run(&id, run, json),
        Commands::Evidence { command } => match command {
            EvidenceCommands::Add(input) => {
                commands::evidence::add(commands::evidence::EvidenceAddInput {
                    id: input.id,
                    evidence_type: input.evidence_type,
                    title: input.title,
                    summary: input.summary,
                    layer: input.layer,
                    command: input.command,
                    path: input.path,
                    url: input.url,
                    note: input.note,
                    outcome: input.outcome,
                    json: input.json,
                })
            }
            EvidenceCommands::List { id, json } => commands::evidence::list(&id, json),
            EvidenceCommands::Show { evidence_id, json } => {
                commands::evidence::show(&evidence_id, json)
            }
        },
        Commands::Trace { command } => match command {
            TraceCommands::Add(input) => commands::trace::add(commands::trace::TraceAddInput {
                id: input.id,
                summary: input.summary,
                actor: input.actor,
                event_type: input.event_type,
                intake: input.intake,
                actions: input.action,
                files_read: input.file_read,
                files_changed: input.file_changed,
                commands: input.command,
                errors: input.error,
                decisions: input.decision,
                outcome: input.outcome,
                evidence_ids: input.evidence,
                json: input.json,
            }),
            TraceCommands::List {
                ticket,
                actor,
                event_type,
                json,
            } => commands::trace::list(commands::trace::TraceListInput {
                ticket,
                actor,
                event_type,
                json,
            }),
            TraceCommands::Show { trace_id, json } => commands::trace::show(&trace_id, json),
        },
        Commands::Decision { command } => match command {
            DecisionCommands::Add(input) => {
                commands::decision::add(commands::decision::DecisionAddInput {
                    title: input.title,
                    status: input.status,
                    context: input.context,
                    decisions: input.decision,
                    consequences: input.consequence,
                    ticket_ids: input.ticket,
                    trace_ids: input.trace,
                    doc_paths: input.doc,
                    json: input.json,
                })
            }
            DecisionCommands::List {
                ticket,
                trace,
                status,
                json,
            } => commands::decision::list(commands::decision::DecisionListInput {
                ticket_id: ticket,
                trace_id: trace,
                status,
                json,
            }),
            DecisionCommands::Show { decision_id, json } => {
                commands::decision::show(&decision_id, json)
            }
            DecisionCommands::Verify(input) => {
                commands::decision::verify(commands::decision::DecisionVerifyInput {
                    decision_id: input.decision_id,
                    outcome: input.outcome,
                    command: input.command,
                    note: input.note,
                    json: input.json,
                })
            }
        },
        Commands::Backlog { command } => match command {
            BacklogCommands::Add(input) => {
                commands::backlog::add(commands::backlog::BacklogAddInput {
                    title: input.title,
                    kind: input.kind,
                    status: input.status,
                    sources: input.source,
                    impact: input.impact,
                    recommendations: input.recommendation,
                    ticket_ids: input.ticket,
                    trace_ids: input.trace,
                    doc_paths: input.doc,
                    json: input.json,
                })
            }
            BacklogCommands::List {
                status,
                kind,
                ticket,
                json,
            } => commands::backlog::list(commands::backlog::BacklogListInput {
                status,
                kind,
                ticket_id: ticket,
                json,
            }),
            BacklogCommands::Show { backlog_id, json } => {
                commands::backlog::show(&backlog_id, json)
            }
            BacklogCommands::Status(input) => {
                commands::backlog::status(commands::backlog::BacklogStatusInput {
                    backlog_id: input.backlog_id,
                    status: input.status,
                    note: input.note,
                    json: input.json,
                })
            }
        },
        Commands::Summary { id, text, json } => commands::summary::run(&id, &text, json),
        Commands::Review {
            id,
            skip_validation,
            json,
        } => commands::review::run(&id, skip_validation.as_deref(), json),
        Commands::Upgrade { dry_run, json } => commands::upgrade::run(dry_run, json),
        Commands::Init { name, prefix } => commands::init::run(&name, &prefix),
        Commands::Doctor { json } => commands::doctor::run(json),
        Commands::List { json } => commands::list::run(json),
        Commands::Get { id, json } => commands::get::run(&id, json),
    }
}
