#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/package-rust-cli.sh --target <triple> --binary <path> --out-dir <dir>

Packages an already-built Rust loci CLI binary into a release archive and updates
<out-dir>/loci-SHA256SUMS.txt.
EOF
}

target=""
binary=""
out_dir=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      target="${2:-}"
      shift 2
      ;;
    --binary)
      binary="${2:-}"
      shift 2
      ;;
    --out-dir)
      out_dir="${2:-}"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$target" ] || [ -z "$binary" ] || [ -z "$out_dir" ]; then
  echo "error: --target, --binary, and --out-dir are required" >&2
  usage >&2
  exit 2
fi

if [ ! -f "$binary" ]; then
  echo "error: binary not found: $binary" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
license_path="$repo_root/LICENSE"
readme_path="$repo_root/README.md"

if [ ! -f "$license_path" ]; then
  echo "error: LICENSE not found at $license_path" >&2
  exit 1
fi

if [ ! -f "$readme_path" ]; then
  echo "error: README.md not found at $readme_path" >&2
  exit 1
fi

case "$target" in
  *windows* | *-msvc)
    expected_name="loci.exe"
    archive_name="loci-$target.zip"
    ;;
  *)
    expected_name="loci"
    archive_name="loci-$target.tar.gz"
    ;;
esac

mkdir -p "$out_dir"
work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

package_dir="$work_dir/loci"
mkdir -p "$package_dir"
cp "$binary" "$package_dir/$expected_name"
chmod 0755 "$package_dir/$expected_name" 2>/dev/null || true
cp "$license_path" "$package_dir/LICENSE"
cp "$readme_path" "$package_dir/README.md"

archive_path="$out_dir/$archive_name"
rm -f "$archive_path"

case "$archive_name" in
  *.zip)
    if command -v zip >/dev/null 2>&1; then
      (
        cd "$work_dir"
        zip -qr "$archive_path" loci
      )
    elif command -v 7z >/dev/null 2>&1; then
      (
        cd "$work_dir"
        7z a -tzip "$archive_path" loci >/dev/null
      )
    else
      echo "error: zip or 7z is required to create Windows archives" >&2
      exit 1
    fi
    ;;
  *.tar.gz)
    tar -C "$work_dir" -czf "$archive_path" loci
    ;;
esac

checksum_file="$out_dir/loci-SHA256SUMS.txt"
checksum_name="$(basename "$archive_path")"
checksum_value=""

if command -v sha256sum >/dev/null 2>&1; then
  checksum_value="$(sha256sum "$archive_path" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  checksum_value="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
else
  echo "error: sha256sum or shasum is required" >&2
  exit 1
fi

tmp_checksum="$checksum_file.tmp"
if [ -f "$checksum_file" ]; then
  grep -v "  $checksum_name\$" "$checksum_file" > "$tmp_checksum" || true
else
  : > "$tmp_checksum"
fi
printf '%s  %s\n' "$checksum_value" "$checksum_name" >> "$tmp_checksum"
sort "$tmp_checksum" > "$checksum_file"
rm -f "$tmp_checksum"

echo "$archive_path"
