use loci_cli::db::{connect_project_db, connect_registry_db};
use loci_cli::project::list_tickets;
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

#[test]
fn list_tickets_errors_on_malformed_labels_json() {
    let temp = TempDir::new().expect("tempdir");
    let db_path = temp.path().join(".loci/loci.db");
    let conn = connect_project_db(&db_path).expect("connect project db");

    conn.execute(
        r#"
        INSERT INTO ticket (
            id, title, status, priority, labels_json, created_at, updated_at
        )
        VALUES ('LCI-001', 'Bad labels', 'ready', 'medium', 'not-json', '2026-05-24T00:00:00Z', '2026-05-24T00:00:00Z')
        "#,
        [],
    )
    .expect("insert ticket");

    assert!(
        list_tickets(&conn).is_err(),
        "malformed labels_json should return an error"
    );
}
