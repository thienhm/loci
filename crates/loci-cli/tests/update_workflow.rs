use assert_cmd::Command;
use flate2::{write::GzEncoder, Compression};
use predicates::str::contains;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tar::{Builder, Header};
use tempfile::TempDir;

fn current_target() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else {
        panic!("unsupported test target")
    }
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "loci.exe"
    } else {
        "loci"
    }
}

fn archive_name() -> String {
    let extension = if cfg!(windows) { "zip" } else { "tar.gz" };
    format!("loci-{}.{}", current_target(), extension)
}

fn write_release_fixture(
    release_dir: &Path,
    binary_contents: &[u8],
    checksum_override: Option<&str>,
) {
    fs::create_dir_all(release_dir).expect("create release dir");
    let archive = release_dir.join(archive_name());

    #[cfg(windows)]
    {
        write_zip_archive(&archive, binary_contents);
    }

    #[cfg(not(windows))]
    {
        write_tar_archive(&archive, binary_contents);
    }

    let digest = Sha256::digest(fs::read(&archive).expect("read archive"));
    let checksum = checksum_override
        .map(str::to_string)
        .unwrap_or_else(|| format!("{digest:x}"));
    fs::write(
        release_dir.join("loci-SHA256SUMS.txt"),
        format!("{checksum}  {}\n", archive_name()),
    )
    .expect("write checksums");
}

#[cfg(not(windows))]
fn write_tar_archive(path: &Path, binary_contents: &[u8]) {
    let file = fs::File::create(path).expect("create tar.gz");
    let encoder = GzEncoder::new(file, Compression::default());
    let mut archive = Builder::new(encoder);
    append_file(
        &mut archive,
        format!("loci/{}", binary_name()),
        binary_contents,
        0o755,
    );
    append_file(&mut archive, "loci/LICENSE", b"license", 0o644);
    append_file(&mut archive, "loci/README.md", b"readme", 0o644);
    archive.finish().expect("finish archive");
}

#[cfg(not(windows))]
fn append_file(
    builder: &mut Builder<GzEncoder<fs::File>>,
    path: impl AsRef<Path>,
    contents: &[u8],
    mode: u32,
) {
    let mut header = Header::new_gnu();
    header.set_size(contents.len() as u64);
    header.set_mode(mode);
    header.set_cksum();
    builder
        .append_data(&mut header, path, contents)
        .expect("append file");
}

#[cfg(windows)]
fn write_zip_archive(path: &Path, binary_contents: &[u8]) {
    let file = fs::File::create(path).expect("create zip");
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default();
    zip.start_file(format!("loci/{}", binary_name()), options)
        .expect("binary");
    std::io::Write::write_all(&mut zip, binary_contents).expect("write binary");
    zip.start_file("loci/LICENSE", options).expect("license");
    std::io::Write::write_all(&mut zip, b"license").expect("write license");
    zip.start_file("loci/README.md", options).expect("readme");
    std::io::Write::write_all(&mut zip, b"readme").expect("write readme");
    zip.finish().expect("finish zip");
}

fn init_workspace(home: &TempDir, workspace: &TempDir) {
    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args(["init", "--name", "Example App", "--prefix", "EXA"])
        .assert()
        .success();
}

fn snapshot_project_files(workspace: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    [
        ".loci/loci.db",
        ".loci/config.toml",
        "LOCI.md",
        "loci/project.md",
        "loci/architecture.md",
        "loci/validation.md",
    ]
    .into_iter()
    .map(|relative| {
        let path = workspace.join(relative);
        (
            PathBuf::from(relative),
            fs::read(path).expect("read project file"),
        )
    })
    .collect()
}

fn prepend_path_env(bin_dir: &Path) -> String {
    let existing = std::env::var_os("PATH").unwrap_or_default();
    std::env::join_paths(
        std::iter::once(bin_dir.to_path_buf()).chain(std::env::split_paths(&existing)),
    )
    .expect("join PATH")
    .to_string_lossy()
    .into_owned()
}

#[cfg(not(windows))]
fn write_fake_bun(bin_dir: &Path, log_path: &Path, fail_install: bool) {
    fs::create_dir_all(bin_dir).expect("create fake bin");
    let script = format!(
        "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{}'\nif [ \"{}\" = \"true\" ] && [ \"$1\" = \"install\" ]; then exit 42; fi\nexit 0\n",
        log_path.display(),
        fail_install
    );
    let path = bin_dir.join("bun");
    fs::write(&path, script).expect("write fake bun");
    let mut permissions = fs::metadata(&path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&path, permissions).expect("chmod fake bun");
}

#[cfg(windows)]
fn write_fake_bun(bin_dir: &Path, log_path: &Path, fail_install: bool) {
    fs::create_dir_all(bin_dir).expect("create fake bin");
    let script = format!(
        "@echo off\r\necho %*>> \"{}\"\r\nif \"{}\" == \"true\" if \"%1\" == \"install\" exit /b 42\r\nexit /b 0\r\n",
        log_path.display(),
        fail_install
    );
    fs::write(bin_dir.join("bun.cmd"), script).expect("write fake bun");
}

#[test]
fn update_installs_verified_managed_binary_and_writes_json_metadata() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    let release = TempDir::new().expect("release");
    let fake_bin = TempDir::new().expect("fake bin");
    let log_path = fake_bin.path().join("bun.log");
    init_workspace(&home, &workspace);
    let before = snapshot_project_files(workspace.path());

    write_release_fixture(release.path(), b"managed binary v9", None);
    write_fake_bun(fake_bin.path(), &log_path, false);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("PATH", prepend_path_env(fake_bin.path()))
        .args([
            "update",
            "--release-dir",
            release.path().to_str().expect("release path"),
            "--version",
            "v9.9.9",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json update output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["version"], "v9.9.9");
    assert_eq!(value["target"], current_target());
    assert_eq!(value["wrapper_refresh"]["ok"], true);

    let installed = home.path().join(".loci/bin").join(binary_name());
    assert_eq!(
        fs::read(&installed).expect("read installed binary"),
        b"managed binary v9"
    );

    #[cfg(unix)]
    assert_ne!(
        fs::metadata(&installed)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o111,
        0
    );

    let metadata: Value = serde_json::from_str(
        &fs::read_to_string(home.path().join(".loci/bin/loci.version.json")).expect("metadata"),
    )
    .expect("metadata json");
    assert_eq!(metadata["version"], "v9.9.9");
    assert_eq!(metadata["target"], current_target());

    for (relative, contents) in before {
        assert_eq!(
            fs::read(workspace.path().join(relative)).expect("read after"),
            contents
        );
    }
}

#[test]
fn update_refreshes_global_bun_wrapper_after_managed_binary_install() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    let release = TempDir::new().expect("release");
    let fake_bin = TempDir::new().expect("fake bin");
    let log_path = fake_bin.path().join("bun.log");
    init_workspace(&home, &workspace);
    write_release_fixture(release.path(), b"managed binary v10", None);
    write_fake_bun(fake_bin.path(), &log_path, false);

    let output = Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("PATH", prepend_path_env(fake_bin.path()))
        .args([
            "update",
            "--release-dir",
            release.path().to_str().expect("release path"),
            "--version",
            "v10.0.0",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();

    let value: Value = serde_json::from_slice(&output).expect("json update output");
    assert_eq!(value["ok"], true);
    assert_eq!(value["wrapper_refresh"]["ok"], true);
    assert_eq!(
        value["wrapper_refresh"]["manual_recovery_command"],
        "bun remove -g loci && bun install -g github:thienhm/loci"
    );

    let log = fs::read_to_string(log_path).expect("fake bun log");
    assert!(log.contains("remove -g loci"));
    assert!(log.contains("install -g github:thienhm/loci"));
}

#[test]
fn update_fails_with_recovery_guidance_when_global_bun_wrapper_refresh_fails() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    let release = TempDir::new().expect("release");
    let fake_bin = TempDir::new().expect("fake bin");
    let log_path = fake_bin.path().join("bun.log");
    init_workspace(&home, &workspace);
    write_release_fixture(release.path(), b"managed binary v10", None);
    write_fake_bun(fake_bin.path(), &log_path, true);

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("PATH", prepend_path_env(fake_bin.path()))
        .args([
            "update",
            "--release-dir",
            release.path().to_str().expect("release path"),
            "--version",
            "v10.0.0",
        ])
        .assert()
        .failure()
        .stderr(contains("TypeScript serve/open wrapper refresh failed"))
        .stderr(contains("`loci serve` may still be stale"))
        .stderr(contains(
            "bun remove -g loci && bun install -g github:thienhm/loci",
        ));

    let installed = home.path().join(".loci/bin").join(binary_name());
    assert_eq!(
        fs::read(&installed).expect("read installed binary"),
        b"managed binary v10"
    );
}

#[test]
fn update_aborts_on_checksum_failure_without_replacing_existing_binary() {
    let home = TempDir::new().expect("home");
    let workspace = TempDir::new().expect("workspace");
    let release = TempDir::new().expect("release");
    init_workspace(&home, &workspace);

    let install_dir = home.path().join(".loci/bin");
    fs::create_dir_all(&install_dir).expect("create bin");
    let installed = install_dir.join(binary_name());
    fs::write(&installed, b"old binary").expect("write old binary");

    write_release_fixture(
        release.path(),
        b"new binary",
        Some("0000000000000000000000000000000000000000000000000000000000000000"),
    );

    Command::cargo_bin("loci")
        .expect("loci binary exists")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .args([
            "update",
            "--release-dir",
            release.path().to_str().expect("release path"),
            "--version",
            "v9.9.9",
        ])
        .assert()
        .failure()
        .stderr(contains("checksum mismatch"));

    assert_eq!(fs::read(installed).expect("read installed"), b"old binary");
}
