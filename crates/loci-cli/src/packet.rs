use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

pub fn ticket_dir(root: &Path, id: &str) -> PathBuf {
    root.join("loci").join("tickets").join(id)
}

pub fn relative_ticket_doc_path(id: &str, filename: &str) -> String {
    format!("loci/tickets/{id}/{filename}")
}

pub fn write_if_missing(path: &Path, content: &str) -> Result<()> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(path, content)?;
    Ok(())
}
