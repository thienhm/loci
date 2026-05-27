#!/usr/bin/env bash

set -euo pipefail

REPO="${LOCI_REPO:-thienhm/loci}"
VERSION="${1:-latest}"
INSTALL_DIR="${LOCI_INSTALL_DIR:-$HOME/.loci/bin}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd tar

if command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD="sha256sum"
else
  echo "Missing checksum tool: shasum or sha256sum" >&2
  exit 1
fi

os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)
    target="aarch64-apple-darwin"
    ;;
  Linux/x86_64)
    target="x86_64-unknown-linux-gnu"
    ;;
  Linux/aarch64)
    target="aarch64-unknown-linux-gnu"
    ;;
  *)
    echo "Unsupported platform: $os $arch" >&2
    exit 1
    ;;
esac

if [[ "$VERSION" == "latest" ]]; then
  release_api="https://api.github.com/repos/$REPO/releases/latest"
else
  release_api="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

echo "Resolving release metadata from $release_api ..."
release_json="$TMP_DIR/release.json"
curl -fsSL "$release_api" -o "$release_json"

tag_name="$(grep -m1 '"tag_name":' "$release_json" | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')"
if [[ -z "$tag_name" ]]; then
  echo "Could not resolve release tag." >&2
  exit 1
fi

asset="loci-$target.tar.gz"
base_url="https://github.com/$REPO/releases/download/$tag_name"
asset_url="$base_url/$asset"
checksums_url="$base_url/loci-SHA256SUMS.txt"

echo "Downloading $asset ..."
curl -fsSL "$asset_url" -o "$TMP_DIR/$asset"
curl -fsSL "$checksums_url" -o "$TMP_DIR/loci-SHA256SUMS.txt"

expected="$(grep " $asset$" "$TMP_DIR/loci-SHA256SUMS.txt" | awk '{print $1}')"
if [[ -z "$expected" ]]; then
  echo "Checksum entry for $asset not found." >&2
  exit 1
fi

actual="$($SHA_CMD "$TMP_DIR/$asset" | awk '{print $1}')"
if [[ "$actual" != "$expected" ]]; then
  echo "Checksum verification failed for $asset" >&2
  echo "Expected: $expected" >&2
  echo "Actual:   $actual" >&2
  exit 1
fi

echo "Installing to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP_DIR/$asset" -C "$TMP_DIR"
install -m 0755 "$TMP_DIR/loci/loci" "$INSTALL_DIR/loci"

echo "Installed: $INSTALL_DIR/loci"
echo "Version:"
"$INSTALL_DIR/loci" --version
