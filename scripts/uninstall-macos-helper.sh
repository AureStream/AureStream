#!/usr/bin/env bash
# Remove the macOS privileged helper and stop any helper-managed sing-box.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[uninstall-helper] macOS only, skip"
  exit 0
fi

LABEL="com.root.aurestream.helper"
HELPER="/Library/PrivilegedHelperTools/${LABEL}"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"

echo "[uninstall-helper] removing launchd job and blessed files (admin password required)..."
# NOTE: never run `launchctl disable` here — it writes a PERSISTENT disabled
# override that survives reinstall, causing SMJobBless to install a helper that
# launchd refuses to start ("installed but unresponsive"). bootout + rm is enough.
osascript -e "do shell script \"launchctl bootout system/${LABEL} 2>/dev/null; rm -f '${PLIST}' '${HELPER}'\" with administrator privileges"

if [[ -e "$HELPER" || -e "$PLIST" ]]; then
  echo "[uninstall-helper] ERROR: helper files still present" >&2
  exit 1
fi

echo "[uninstall-helper] done. Reinstall via AureStream when switching to TUN mode."
