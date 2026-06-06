#!/usr/bin/env bash
# Ad-hoc deep sign a local .app bundle so SMJobBless can install the privileged helper.
# Release/CI builds use Developer ID via tauri-action instead.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

APP_PATH="${1:-}"
if [[ -z "$APP_PATH" ]]; then
  echo "Usage: scripts/sign-macos-bundle.sh path/to/aurestream.app" >&2
  exit 1
fi

HELPER="${APP_PATH}/Contents/Library/LaunchServices/com.root.aurestream.helper"
if [[ ! -f "$HELPER" ]]; then
  echo "Error: privileged helper missing at $HELPER" >&2
  echo "Run: pnpm pre-bundle && pnpm tauri build" >&2
  exit 1
fi

echo "Signing helper..."
codesign --force --sign - --identifier com.root.aurestream.helper "$HELPER"
codesign --verify --verbose=2 "$HELPER"

echo "Deep signing app bundle..."
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --verbose=2 "$APP_PATH"

echo "Done: $APP_PATH"
