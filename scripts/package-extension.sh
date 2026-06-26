#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"

VERSION="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$EXTENSION_DIR/manifest.json', 'utf8')).version)")"
PACKAGE_BASENAME="multi-llm-prompt-dispatcher-v${VERSION}"
PACKAGE_PATH="$DIST_DIR/${PACKAGE_BASENAME}.zip"
CHECKSUM_PATH="$PACKAGE_PATH.sha256"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

(
  cd "$EXTENSION_DIR"
  zip -qr "$PACKAGE_PATH" .
)

(
  cd "$DIST_DIR"
  sha256sum "${PACKAGE_BASENAME}.zip" > "${PACKAGE_BASENAME}.zip.sha256"
)

PACKAGE_LIST="$(unzip -Z1 "$PACKAGE_PATH")"

printf '%s\n' "$PACKAGE_LIST" | grep -qx 'manifest.json' || {
  echo "[package-extension] package is missing root manifest.json" >&2
  exit 1
}

if printf '%s\n' "$PACKAGE_LIST" | grep -Eq '(^|/)(\.git|node_modules|dist|docs|scripts|\.github)/'; then
  echo "[package-extension] package contains repository-only files" >&2
  printf '%s\n' "$PACKAGE_LIST" | grep -E '(^|/)(\.git|node_modules|dist|docs|scripts|\.github)/' >&2
  exit 1
fi

echo "[package-extension] wrote ${PACKAGE_PATH}"
echo "[package-extension] wrote ${CHECKSUM_PATH}"
