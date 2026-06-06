#!/usr/bin/env bash
# Deep ad-hoc sign the built .app so SMJobBless can install the privileged helper.
# For Developer ID releases, set APPLE_SIGNING_IDENTITY and run sync-smjobbless-reqs first.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  # Prefer the newest release bundle under src-tauri/target.
  TARGET="$(find "$ROOT/src-tauri/target" -path '*/release/bundle/macos/*.app' -maxdepth 6 2>/dev/null | head -1 || true)"
fi

if [[ -z "$TARGET" || ! -d "$TARGET" ]]; then
  echo "[post-sign] No .app bundle found; skip (pass path as first arg)" >&2
  exit 0
fi

IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
if [[ -z "$IDENTITY" ]]; then
  IDENTITY="-"
fi
HELPER="$TARGET/Contents/Library/LaunchServices/com.root.aurestream.helper"

if [[ ! -f "$HELPER" ]]; then
  echo "[post-sign] Helper missing in bundle: $HELPER" >&2
  exit 1
fi

echo "[post-sign] Signing helper with identity: $IDENTITY"
if [[ "$IDENTITY" == "-" ]]; then
  codesign --force --sign - --identifier com.root.aurestream.helper "$HELPER"
else
  codesign --force --sign "$IDENTITY" --identifier com.root.aurestream.helper --options runtime --timestamp "$HELPER"
fi
codesign --verify --verbose=2 "$HELPER"

echo "[post-sign] Deep signing app: $TARGET"
if [[ "$IDENTITY" == "-" ]]; then
  codesign --force --deep --sign - "$TARGET"
else
  codesign --force --deep --sign "$IDENTITY" --options runtime --timestamp "$TARGET"
fi
codesign --verify --deep --verbose=2 "$TARGET"

echo "[post-sign] Done"
