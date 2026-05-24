use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

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

pub fn upsert_section(markdown: &str, heading: &str, body: &str) -> String {
    if section_has_meaningful_content(markdown, heading) {
        return markdown.to_string();
    }

    let mut updated = markdown.trim_end().to_string();
    if !updated.is_empty() {
        updated.push_str("\n\n");
    }
    updated.push_str("## ");
    updated.push_str(heading);
    updated.push_str("\n\n");
    updated.push_str(body.trim());
    updated.push('\n');
    updated
}

pub fn section_has_meaningful_content(markdown: &str, heading: &str) -> bool {
    let marker = format!("## {heading}");
    let mut in_section = false;
    let mut body = String::new();

    for line in markdown.lines() {
        if line.trim() == marker {
            in_section = true;
            continue;
        }

        if in_section && line.starts_with("## ") {
            break;
        }

        if in_section {
            body.push_str(line);
            body.push('\n');
        }
    }

    in_section && has_meaningful_content(&body)
}

pub fn has_meaningful_content(body: &str) -> bool {
    let stripped = strip_html_comments(body);
    let meaningful_lines: Vec<&str> = stripped
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches("- [ ]")
                .trim_start_matches("- [x]")
                .trim_start_matches("- [X]")
                .trim_start_matches('-')
                .trim()
                .trim_matches('_')
                .trim()
        })
        .filter(|line| !line.is_empty())
        .collect();

    if meaningful_lines.is_empty() {
        return false;
    }

    meaningful_lines.iter().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower != "todo"
            && lower != "tbd"
            && !lower.starts_with("describe ")
            && !lower.starts_with("describe the ")
    })
}

fn strip_html_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;

    loop {
        let Some(start) = rest.find("<!--") else {
            output.push_str(rest);
            break;
        };
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 4..];
        let Some(end) = after_start.find("-->") else {
            break;
        };
        rest = &after_start[end + 3..];
    }

    output
}

pub fn write_new(path: &Path, content: &str) -> Result<()> {
    if path.exists() {
        bail!("story packet already exists at {}", path.display());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(content.as_bytes())?;
    Ok(())
}
