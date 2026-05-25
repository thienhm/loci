use anyhow::{bail, Result};

pub const EMPTY_SUMMARY_ERROR: &str = "trace summary cannot be empty";
pub const EMPTY_ACTOR_ERROR: &str = "trace actor cannot be empty";

pub fn validate_required_text(value: &str, error: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        bail!(error);
    }

    Ok(())
}
