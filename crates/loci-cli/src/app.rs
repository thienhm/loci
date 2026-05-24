use anyhow::Result;
use clap::{Parser, Subcommand, ValueEnum};

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

        /// Risk lane for the shaped work.
        #[arg(long, value_enum, default_value = "normal")]
        risk_lane: RiskLaneArg,

        /// Emit machine-readable JSON.
        #[arg(long)]
        json: bool,
    },

    /// Plan a shaped workflow packet.
    Plan {
        /// Ticket id, for example LCI-001.
        id: String,

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
            risk_lane,
            json,
        } => commands::shape::run(&id, risk_lane, json),
        Commands::Plan { id, json } => commands::plan::run(&id, json),
        Commands::Ready { id, json } => commands::ready::run(&id, json),
        Commands::Init { name, prefix } => commands::init::run(&name, &prefix),
        Commands::Doctor { json } => commands::doctor::run(json),
        Commands::List { json } => commands::list::run(json),
        Commands::Get { id, json } => commands::get::run(&id, json),
    }
}
