use anyhow::{anyhow, Result};
use rusqlite::params;

use crate::db::connect_project_db;
use crate::paths::find_workspace_root;

pub fn run(id: &str, json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root = find_workspace_root(&cwd).ok_or_else(|| anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;

    let exists: Option<String> = conn
        .query_row("SELECT id FROM ticket WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .ok();
    if exists.is_none() {
        return Err(anyhow!("ticket {id} not found"));
    }

    let mut stmt = conn.prepare(
        "SELECT filename FROM ticket_file WHERE ticket_id = ?1 ORDER BY filename COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map(params![id], |row| row.get::<_, String>(0))?;
    let mut attachments = Vec::new();
    for row in rows {
        attachments.push(row?);
    }

    if json {
        println!("{}", serde_json::json!({ "attachments": attachments }));
    } else if attachments.is_empty() {
        println!("No attachments for {id}.");
    } else {
        println!("Attachments for {id}:");
        for attachment in attachments {
            println!("  {attachment}");
        }
    }

    Ok(())
}
