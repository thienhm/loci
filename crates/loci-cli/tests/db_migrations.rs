use loci_cli::db::{connect_project_db, connect_registry_db};
use rusqlite::Connection;
use tempfile::TempDir;

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .expect("table existence query")
        == 1
}

#[test]
fn project_database_has_v1_tables() {
    let temp = TempDir::new().expect("tempdir");
    let db_path = temp.path().join(".loci/loci.db");

    let conn = connect_project_db(&db_path).expect("connect project db");

    for table in [
        "schema_version",
        "project",
        "ticket",
        "document",
        "template_pack",
    ] {
        assert!(table_exists(&conn, table), "missing table {table}");
    }
}

#[test]
fn registry_database_has_v1_tables() {
    let temp = TempDir::new().expect("tempdir");
    let db_path = temp.path().join(".loci/registry.db");

    let conn = connect_registry_db(&db_path).expect("connect registry db");

    for table in ["schema_version", "registered_project", "global_config"] {
        assert!(table_exists(&conn, table), "missing table {table}");
    }
}
