use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Cursor, Read};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{anyhow, bail, Context, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tar::Archive;
use zip::ZipArchive;

const CHECKSUMS_ASSET: &str = "loci-SHA256SUMS.txt";
pub const WRAPPER_REFRESH_MANUAL_COMMAND: &str =
    "bun remove -g loci && bun install -g github:thienhm/loci";

#[derive(Debug, Clone)]
pub struct UpdateRequest {
    pub version: Option<String>,
    pub repo: String,
    pub home_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateReport {
    pub ok: bool,
    pub version: String,
    pub target: String,
    pub archive: String,
    pub installed_path: PathBuf,
    pub metadata_path: PathBuf,
    pub checksum: String,
    pub wrapper_refresh: WrapperRefreshReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WrapperRefreshReport {
    pub ok: bool,
    pub package: String,
    pub manual_recovery_command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VersionMetadata {
    pub version: String,
    pub target: String,
    pub archive: String,
    pub installed_path: PathBuf,
    pub checksum: String,
}

pub trait ReleaseSource {
    fn read_asset(&self, repo: &str, version: Option<&str>, asset_name: &str) -> Result<Vec<u8>>;
}

#[derive(Debug, Clone)]
pub struct LocalReleaseSource {
    release_dir: PathBuf,
}

impl LocalReleaseSource {
    pub fn new(release_dir: PathBuf) -> Self {
        Self { release_dir }
    }
}

impl ReleaseSource for LocalReleaseSource {
    fn read_asset(&self, _repo: &str, _version: Option<&str>, asset_name: &str) -> Result<Vec<u8>> {
        fs::read(self.release_dir.join(asset_name))
            .with_context(|| format!("read release asset {asset_name}"))
    }
}

#[derive(Debug, Clone, Default)]
pub struct GithubReleaseSource;

impl GithubReleaseSource {
    pub fn new() -> Self {
        Self
    }
}

impl ReleaseSource for GithubReleaseSource {
    fn read_asset(&self, repo: &str, version: Option<&str>, asset_name: &str) -> Result<Vec<u8>> {
        let url = match version {
            Some(version) => {
                format!("https://github.com/{repo}/releases/download/{version}/{asset_name}")
            }
            None => format!("https://github.com/{repo}/releases/latest/download/{asset_name}"),
        };

        let response = reqwest::blocking::Client::new()
            .get(&url)
            .header(reqwest::header::USER_AGENT, "loci-update")
            .send()
            .with_context(|| format!("download {url}"))?;

        if !response.status().is_success() {
            bail!("download {url} failed with {}", response.status());
        }

        Ok(response
            .bytes()
            .with_context(|| format!("read response body from {url}"))?
            .to_vec())
    }
}

pub fn install(request: &UpdateRequest, source: &impl ReleaseSource) -> Result<UpdateReport> {
    let target = current_target()?;
    let archive_name = asset_name_for_target(target)?;
    let version = request
        .version
        .clone()
        .unwrap_or_else(|| "latest".to_string());

    let checksums =
        source.read_asset(&request.repo, request.version.as_deref(), CHECKSUMS_ASSET)?;
    let manifest = parse_checksum_manifest(&String::from_utf8(checksums)?)?;
    let expected_checksum = manifest
        .get(archive_name)
        .ok_or_else(|| anyhow!("checksum manifest missing {archive_name}"))?;

    let archive_bytes =
        source.read_asset(&request.repo, request.version.as_deref(), archive_name)?;
    let actual_checksum = sha256_hex(&archive_bytes);
    if &actual_checksum != expected_checksum {
        bail!(
            "checksum mismatch for {archive_name}: expected {expected_checksum}, got {actual_checksum}"
        );
    }

    let extracted_binary = extract_binary_from_archive(&archive_bytes, archive_name)?;
    let install_dir = managed_bin_dir(&request.home_dir);
    let installed_path = install_dir.join(binary_name());
    let metadata_path = install_dir.join("loci.version.json");

    fs::create_dir_all(&install_dir).context("create managed Loci bin directory")?;
    install_binary(&installed_path, &extracted_binary)?;

    let metadata = VersionMetadata {
        version: version.clone(),
        target: target.to_string(),
        archive: archive_name.to_string(),
        installed_path: installed_path.clone(),
        checksum: actual_checksum.clone(),
    };
    fs::write(&metadata_path, serde_json::to_vec_pretty(&metadata)?)
        .context("write managed Loci version metadata")?;

    let wrapper_refresh = refresh_typescript_wrapper()?;

    Ok(UpdateReport {
        ok: true,
        version,
        target: target.to_string(),
        archive: archive_name.to_string(),
        installed_path,
        metadata_path,
        checksum: actual_checksum,
        wrapper_refresh,
    })
}

pub fn refresh_typescript_wrapper() -> Result<WrapperRefreshReport> {
    let _ = Command::new("bun")
        .args(["remove", "-g", "loci"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    let status = Command::new("bun")
        .args(["install", "-g", "github:thienhm/loci"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .with_context(|| {
            format!(
                "TypeScript serve/open wrapper refresh failed. `loci serve` may still be stale. Run `{}` to refresh the wrapper manually",
                WRAPPER_REFRESH_MANUAL_COMMAND
            )
        })?;

    if !status.success() {
        bail!(
            "TypeScript serve/open wrapper refresh failed with exit code {}. `loci serve` may still be stale. Run `{}` to refresh the wrapper manually.",
            status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string()),
            WRAPPER_REFRESH_MANUAL_COMMAND
        );
    }

    Ok(WrapperRefreshReport {
        ok: true,
        package: "github:thienhm/loci".to_string(),
        manual_recovery_command: WRAPPER_REFRESH_MANUAL_COMMAND.to_string(),
    })
}

pub fn home_dir() -> Result<PathBuf> {
    if cfg!(windows) {
        env::var_os("USERPROFILE")
            .or_else(|| env::var_os("HOME"))
            .map(PathBuf::from)
            .ok_or_else(|| anyhow!("USERPROFILE is required to update the managed Loci binary"))
    } else {
        env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| anyhow!("HOME is required to update the managed Loci binary"))
    }
}

pub fn managed_bin_dir(home_dir: &Path) -> PathBuf {
    home_dir.join(".loci").join("bin")
}

pub fn current_target() -> Result<&'static str> {
    target_for(env::consts::OS, env::consts::ARCH)
}

pub fn target_for(os: &str, arch: &str) -> Result<&'static str> {
    match (os, arch) {
        ("macos", "aarch64") => Ok("aarch64-apple-darwin"),
        ("macos", "x86_64") => Ok("x86_64-apple-darwin"),
        ("linux", "x86_64") => Ok("x86_64-unknown-linux-gnu"),
        ("linux", "aarch64") => Ok("aarch64-unknown-linux-gnu"),
        ("windows", "x86_64") => Ok("x86_64-pc-windows-msvc"),
        _ => bail!("unsupported platform {os}/{arch}"),
    }
}

pub fn asset_name_for_target(target: &str) -> Result<&'static str> {
    match target {
        "aarch64-apple-darwin" => Ok("loci-aarch64-apple-darwin.tar.gz"),
        "x86_64-apple-darwin" => Ok("loci-x86_64-apple-darwin.tar.gz"),
        "x86_64-unknown-linux-gnu" => Ok("loci-x86_64-unknown-linux-gnu.tar.gz"),
        "aarch64-unknown-linux-gnu" => Ok("loci-aarch64-unknown-linux-gnu.tar.gz"),
        "x86_64-pc-windows-msvc" => Ok("loci-x86_64-pc-windows-msvc.zip"),
        _ => bail!("unsupported release target {target}"),
    }
}

pub fn parse_checksum_manifest(contents: &str) -> Result<HashMap<String, String>> {
    let mut checksums = HashMap::new();

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let mut parts = line.split_whitespace();
        let checksum = parts
            .next()
            .ok_or_else(|| anyhow!("invalid checksum manifest line: {line}"))?;
        let filename = parts
            .next()
            .ok_or_else(|| anyhow!("invalid checksum manifest line: {line}"))?;

        if checksum.len() != 64
            || !checksum
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            bail!("invalid SHA-256 checksum for {filename}");
        }

        checksums.insert(
            filename.trim_start_matches('*').to_string(),
            checksum.to_string(),
        );
    }

    Ok(checksums)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

fn extract_binary_from_archive(archive_bytes: &[u8], archive_name: &str) -> Result<Vec<u8>> {
    if archive_name.ends_with(".tar.gz") {
        extract_binary_from_tar_gz(archive_bytes)
    } else if archive_name.ends_with(".zip") {
        extract_binary_from_zip(archive_bytes)
    } else {
        bail!("unsupported archive format {archive_name}");
    }
}

fn extract_binary_from_tar_gz(archive_bytes: &[u8]) -> Result<Vec<u8>> {
    let decoder = GzDecoder::new(Cursor::new(archive_bytes));
    let mut archive = Archive::new(decoder);
    let wanted = PathBuf::from("loci").join(binary_name());

    for entry in archive.entries().context("read tar entries")? {
        let mut entry = entry.context("read tar entry")?;
        let path = entry.path().context("read tar entry path")?.to_path_buf();
        if path == wanted {
            let mut binary = Vec::new();
            entry
                .read_to_end(&mut binary)
                .context("read binary from tar archive")?;
            return Ok(binary);
        }
    }

    bail!("archive is missing {}", wanted.display());
}

fn extract_binary_from_zip(archive_bytes: &[u8]) -> Result<Vec<u8>> {
    let mut archive = ZipArchive::new(Cursor::new(archive_bytes)).context("read zip archive")?;
    let wanted = format!("loci/{}", binary_name());
    let mut file = archive
        .by_name(&wanted)
        .with_context(|| format!("archive is missing {wanted}"))?;
    let mut binary = Vec::new();
    file.read_to_end(&mut binary)
        .context("read binary from zip archive")?;
    Ok(binary)
}

fn install_binary(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, bytes).context("write temporary Loci binary")?;

    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(&tmp_path)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&tmp_path, permissions)?;
    }

    if cfg!(windows) && path.exists() {
        fs::remove_file(path).context("remove previous managed Loci binary")?;
    }
    fs::rename(&tmp_path, path).context("replace managed Loci binary")?;
    Ok(())
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "loci.exe"
    } else {
        "loci"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_detection_maps_supported_platforms() {
        assert_eq!(
            target_for("macos", "aarch64").expect("target"),
            "aarch64-apple-darwin"
        );
        assert_eq!(
            target_for("linux", "x86_64").expect("target"),
            "x86_64-unknown-linux-gnu"
        );
        assert_eq!(
            target_for("windows", "x86_64").expect("target"),
            "x86_64-pc-windows-msvc"
        );
    }

    #[test]
    fn asset_names_follow_release_contract() {
        assert_eq!(
            asset_name_for_target("aarch64-apple-darwin").expect("asset"),
            "loci-aarch64-apple-darwin.tar.gz"
        );
        assert_eq!(
            asset_name_for_target("x86_64-pc-windows-msvc").expect("asset"),
            "loci-x86_64-pc-windows-msvc.zip"
        );
    }

    #[test]
    fn checksum_manifest_accepts_coreutils_and_shasum_formats() {
        let manifest = parse_checksum_manifest(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  loci-a.tar.gz\n\
             bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb *loci-b.zip\n",
        )
        .expect("manifest");

        assert_eq!(
            manifest.get("loci-a.tar.gz").expect("checksum"),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        assert_eq!(
            manifest.get("loci-b.zip").expect("checksum"),
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        );
    }
}
