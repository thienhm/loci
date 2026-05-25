use anyhow::{bail, Result};

pub const EMPTY_TITLE_ERROR: &str = "decision title cannot be empty";

pub fn validate_required_text(value: &str, error: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        bail!(error);
    }

    Ok(())
}
