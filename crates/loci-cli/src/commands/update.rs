use std::path::PathBuf;

use anyhow::Result;

use crate::update::{self, GithubReleaseSource, LocalReleaseSource, UpdateRequest};

pub fn run(
    version: Option<String>,
    repo: String,
    release_dir: Option<PathBuf>,
    json: bool,
) -> Result<()> {
    let request = UpdateRequest {
        version,
        repo,
        home_dir: update::home_dir()?,
    };

    let report = if let Some(release_dir) = release_dir {
        let source = LocalReleaseSource::new(release_dir);
        update::install(&request, &source)?
    } else {
        let source = GithubReleaseSource::new();
        update::install(&request, &source)?
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!(
            "Updated Loci to {} for {} at {}",
            report.version,
            report.target,
            report.installed_path.display()
        );
    }

    Ok(())
}
