use std::fs;

use loci_cli::paths::{find_workspace_root, LociPaths};
use tempfile::TempDir;

#[test]
fn finds_workspace_root_from_nested_directory() {
    let temp = TempDir::new().expect("tempdir");
    let root = temp.path();
    fs::create_dir_all(root.join(".loci")).expect("create .loci");
    let nested = root.join("src/deep/module");
    fs::create_dir_all(&nested).expect("create nested");

    let found = find_workspace_root(&nested).expect("workspace found");

    assert_eq!(found, root);
}

#[test]
fn returns_none_when_workspace_marker_is_missing() {
    let temp = TempDir::new().expect("tempdir");

    let found = find_workspace_root(temp.path());

    assert!(found.is_none());
}

#[test]
fn paths_use_visible_loci_and_hidden_project_state() {
    let home = TempDir::new().expect("home");
    let root = TempDir::new().expect("workspace");

    let paths = LociPaths::new(root.path().to_path_buf(), home.path().to_path_buf());

    assert_eq!(paths.visible_loci_dir, root.path().join("loci"));
    assert_eq!(paths.project_state_dir, root.path().join(".loci"));
    assert_eq!(paths.project_db, root.path().join(".loci/loci.db"));
    assert_eq!(paths.global_registry_db, home.path().join(".loci/registry.db"));
}
