use std::path::{Path, PathBuf};

use anyhow::{bail, Result};
use rusqlite::{Connection, OpenFlags};

use crate::domain::{DoctorReport, HealthCheck, HealthStatus};
use crate::paths::{find_workspace_root, LociPaths};

const REQUIRED_PROJECT_DB_TABLES: [&str; 5] = [
    "schema_version",
    "project",
    "ticket",
    "document",
    "template_pack",
];

pub fn run(json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root =
        find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let paths = LociPaths::new(root.clone(), home_dir()?);

    let report = build_report(&paths)?;
    let has_error = report.status == HealthStatus::Error;

    if json {
        println!("{}", serde_json::to_string(&report)?);
    } else {
        println!("Loci doctor: {}", display_status(&report.status));
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

    require_file(
        &mut checks,
        "agents",
        &paths.workspace_root.join("AGENTS.md"),
        "AGENTS.md exists",
    );
    require_file(
        &mut checks,
        "loci_md",
        &paths.workspace_root.join("LOCI.md"),
        "LOCI.md exists",
    );
    require_file(
        &mut checks,
        "project_doc",
        &paths.visible_loci_dir.join("project.md"),
        "loci/project.md exists",
    );
    require_file(
        &mut checks,
        "architecture_doc",
        &paths.visible_loci_dir.join("architecture.md"),
        "loci/architecture.md exists",
    );
    require_file(
        &mut checks,
        "validation_doc",
        &paths.visible_loci_dir.join("validation.md"),
        "loci/validation.md exists",
    );
    require_file(
        &mut checks,
        "guardrails_doc",
        &paths.visible_loci_dir.join("guardrails.md"),
        "loci/guardrails.md exists",
    );
    check_project_db(&mut checks, &paths.project_db);

    let status = if checks
        .iter()
        .any(|check| check.status == HealthStatus::Error)
    {
        HealthStatus::Error
    } else if checks
        .iter()
        .any(|check| check.status == HealthStatus::Warning)
    {
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

fn check_project_db(checks: &mut Vec<HealthCheck>, path: &Path) {
    if !path.is_file() {
        checks.push(HealthCheck {
            code: "project_db".to_string(),
            status: HealthStatus::Error,
            message: format!("missing {}", display_path(path)),
        });
        return;
    }

    checks.push(HealthCheck {
        code: "project_db".to_string(),
        status: HealthStatus::Healthy,
        message: ".loci/loci.db exists".to_string(),
    });

    match inspect_project_db_schema(path) {
        Ok(()) => checks.push(HealthCheck {
            code: "project_db_schema".to_string(),
            status: HealthStatus::Healthy,
            message: "project database schema has required tables".to_string(),
        }),
        Err(error) => checks.push(HealthCheck {
            code: "project_db_schema".to_string(),
            status: HealthStatus::Error,
            message: format!("project database schema failed: {error}"),
        }),
    }
}

fn inspect_project_db_schema(path: &Path) -> Result<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    let mut missing = Vec::new();
    for table in REQUIRED_PROJECT_DB_TABLES {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM sqlite_master
                WHERE type = 'table' AND name = ?1
            )",
            [table],
            |row| row.get(0),
        )?;

        if !exists {
            missing.push(table);
        }
    }

    if missing.is_empty() {
        Ok(())
    } else {
        bail!("missing required tables: {}", missing.join(", "))
    }
}

fn display_path(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn display_status(status: &HealthStatus) -> &'static str {
    match status {
        HealthStatus::Healthy => "healthy",
        HealthStatus::Warning => "warning",
        HealthStatus::Error => "error",
    }
}

fn home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME is not set"))
}
