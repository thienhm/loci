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
