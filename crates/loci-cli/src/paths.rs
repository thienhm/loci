use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LociPaths {
    pub workspace_root: PathBuf,
    pub home_dir: PathBuf,
    pub visible_loci_dir: PathBuf,
    pub project_state_dir: PathBuf,
    pub project_db: PathBuf,
    pub project_config: PathBuf,
    pub global_loci_dir: PathBuf,
    pub global_registry_db: PathBuf,
    pub global_config: PathBuf,
}

impl LociPaths {
    pub fn new(workspace_root: PathBuf, home_dir: PathBuf) -> Self {
        let visible_loci_dir = workspace_root.join("loci");
        let project_state_dir = workspace_root.join(".loci");
        let global_loci_dir = home_dir.join(".loci");

        Self {
            project_db: project_state_dir.join("loci.db"),
            project_config: project_state_dir.join("config.toml"),
            global_registry_db: global_loci_dir.join("registry.db"),
            global_config: global_loci_dir.join("config.toml"),
            workspace_root,
            home_dir,
            visible_loci_dir,
            project_state_dir,
            global_loci_dir,
        }
    }
}

pub fn find_workspace_root(start_dir: &Path) -> Option<PathBuf> {
    let mut current = start_dir.to_path_buf();

    loop {
        if current.join(".loci").is_dir() || current.join("loci").is_dir() {
            return Some(current);
        }

        if !current.pop() {
            return None;
        }
    }
}
