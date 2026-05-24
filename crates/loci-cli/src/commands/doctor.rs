use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::db::connect_project_db;
use crate::domain::{DoctorReport, HealthCheck, HealthStatus};
use crate::paths::{find_workspace_root, LociPaths};

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
    require_file(
        &mut checks,
        "project_db",
        &paths.project_db,
        ".loci/loci.db exists",
    );

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
