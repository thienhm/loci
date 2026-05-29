# Rust CLI Release Artifacts

GitHub Releases for tagged versions build and attach platform-specific Rust CLI archives. These artifacts package the `crates/loci-cli` binary named `loci` with root `LICENSE` and `README.md` material.

The release archives remain Rust-binary artifacts only. During the TypeScript fallback transition, `loci update` installs one of these archives and also refreshes the global Bun package that still provides `loci serve` and `loci open`.

## Artifact Names

| Platform target | Archive |
| --- | --- |
| Apple Silicon macOS | `loci-aarch64-apple-darwin.tar.gz` |
| Intel macOS | `loci-x86_64-apple-darwin.tar.gz` |
| x64 Linux | `loci-x86_64-unknown-linux-gnu.tar.gz` |
| Arm64 Linux | `loci-aarch64-unknown-linux-gnu.tar.gz` |
| x64 Windows | `loci-x86_64-pc-windows-msvc.zip` |

Each release also includes `loci-SHA256SUMS.txt` with SHA-256 checksums for every archive.

## Archive Contents

Unix archives contain:

```text
loci/
  loci
  LICENSE
  README.md
```

Windows archives contain:

```text
loci/
  loci.exe
  LICENSE
  README.md
```

Release jobs smoke-test the built binary with `loci --help`, package the archive, extract the packaged archive, and smoke-test the packaged binary again before uploading artifacts.
