use anyhow::Result;

use crate::db::connect_project_db;
use crate::paths::find_workspace_root;
use crate::project;

pub fn run(json: bool) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let root =
        find_workspace_root(&cwd).ok_or_else(|| anyhow::anyhow!("not inside a Loci workspace"))?;
    let conn = connect_project_db(&root.join(".loci/loci.db"))?;
    let tickets = project::list_tickets(&conn)?;

    if json {
        println!("{}", serde_json::to_string(&tickets)?);
    } else if tickets.is_empty() {
        println!("No tickets yet.");
    } else {
        for ticket in tickets {
            println!("{} [{}] {}", ticket.id, ticket.status, ticket.title);
        }
    }

    Ok(())
}
