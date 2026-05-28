#!/usr/bin/env bash
#
# Sign the prebuilt AureStream privileged helper with a signing identity.
# For local development with no Developer ID certificates, we use ad-hoc signing ("-").
# The embedded Info.plist / Launchd.plist sections must already be
# present — scripts/build-helper.sh takes care of that.
#
# Usage:
#   scripts/sign-helper.sh [path-to-helper-binary] [signing-identity]
#
# Defaults to src-tauri/target/helper/com.root.aurestream.helper and ad-hoc signature.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HELPER_BIN="${1:-$REPO_ROOT/src-tauri/target/helper/com.root.aurestream.helper}"
# Use ad-hoc signing "-" if no identity is specified or available
SIGNING_IDENTITY="${2:--}"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "sign-helper.sh: macOS only, skipping" >&2
    exit 0
fi

if [[ ! -f "$HELPER_BIN" ]]; then
    echo "sign-helper.sh: helper binary not found at $HELPER_BIN" >&2
    echo "  run scripts/build-helper.sh first" >&2
    exit 1
fi

echo "Signing helper with identity: $SIGNING_IDENTITY"

# For ad-hoc signing, we don't need options runtime and timestamp (which require Apple certs)
if [[ "$SIGNING_IDENTITY" == "-" ]]; then
    codesign \
        --force \
        --sign "$SIGNING_IDENTITY" \
        --identifier "com.root.aurestream.helper" \
        "$HELPER_BIN"
else
    codesign \
        --force \
        --sign "$SIGNING_IDENTITY" \
        --identifier "com.root.aurestream.helper" \
        --options runtime \
        --timestamp \
        "$HELPER_BIN"
fi

echo "Signed helper: $HELPER_BIN"

codesign --verify --verbose=2 "$HELPER_BIN"
echo "Signature verified successfully"
