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

    set_section(markdown, heading, body)
}

pub fn set_section(markdown: &str, heading: &str, body: &str) -> String {
    let rendered = render_section(heading, body);

    if let Some((section_start, _body_start, section_end)) = section_bounds(markdown, heading) {
        let mut updated = String::with_capacity(markdown.len() + rendered.len());
        updated.push_str(markdown[..section_start].trim_end());
        if !updated.is_empty() {
            updated.push_str("\n\n");
        }
        updated.push_str(&rendered);
        if section_end < markdown.len() {
            updated.push_str("\n\n");
            updated.push_str(markdown[section_end..].trim_start());
        }
        return updated;
    }

    let mut updated = markdown.trim_end().to_string();
    if !updated.is_empty() {
        updated.push_str("\n\n");
    }
    updated.push_str(&rendered);
    updated
}

pub fn section_has_meaningful_content(markdown: &str, heading: &str) -> bool {
    section_bounds(markdown, heading)
        .map(|(_section_start, body_start, section_end)| {
            has_meaningful_content(&markdown[body_start..section_end])
        })
        .unwrap_or(false)
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

pub fn has_checkable_step(markdown: &str) -> bool {
    markdown.lines().any(|line| {
        let trimmed = line.trim_start();
        ["- [ ]", "- [x]", "- [X]"].iter().any(|marker| {
            trimmed.starts_with(marker) && has_meaningful_content(&trimmed[marker.len()..])
        })
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

fn render_section(heading: &str, body: &str) -> String {
    format!("## {heading}\n\n{}\n", body.trim())
}

fn section_bounds(markdown: &str, heading: &str) -> Option<(usize, usize, usize)> {
    let marker = format!("## {heading}");
    let mut section_start = None;
    let mut body_start = None;

    for (line_start, line) in line_spans(markdown) {
        if section_start.is_some() && line.trim_start().starts_with("## ") {
            return Some((section_start?, body_start?, line_start));
        }

        if line.trim() == marker {
            section_start = Some(line_start);
            body_start = Some(line_start + line.len());
        }
    }

    section_start.map(|start| (start, body_start.unwrap_or(markdown.len()), markdown.len()))
}

fn line_spans(markdown: &str) -> impl Iterator<Item = (usize, &str)> {
    let mut offset = 0;
    markdown.split_inclusive('\n').map(move |line| {
        let current = offset;
        offset += line.len();
        (current, line)
    })
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
