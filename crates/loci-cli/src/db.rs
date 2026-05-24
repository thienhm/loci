use std::fs;
use std::path::Path;

use anyhow::Result;
use rusqlite::Connection;

use crate::migrations::{PROJECT_MIGRATIONS, REGISTRY_MIGRATIONS};

pub fn connect_project_db(path: &Path) -> Result<Connection> {
    connect_and_migrate(path, PROJECT_MIGRATIONS)
}

pub fn connect_registry_db(path: &Path) -> Result<Connection> {
    connect_and_migrate(path, REGISTRY_MIGRATIONS)
}

fn connect_and_migrate(path: &Path, migrations: &[&str]) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    for migration in migrations {
        conn.execute_batch(migration)?;
    }

    Ok(conn)
}
