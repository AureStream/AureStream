#!/usr/bin/env bash
# Remove the SMJobBless privileged helper left after deleting AureStream.app.
# Usage: ./scripts/uninstall-macos-tun-helper.sh
set -euo pipefail

LABEL="com.root.aurestream.helper"
HELPER="/Library/PrivilegedHelperTools/${LABEL}"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"

if [[ ! -e "$HELPER" && ! -e "$PLIST" ]]; then
  echo "Helper not installed — nothing to do."
  exit 0
fi

echo "This will remove ${LABEL} (requires admin password)."
osascript -e "do shell script \"launchctl bootout system/${LABEL} 2>/dev/null; rm -f '${PLIST}' '${HELPER}'; echo removed\" with administrator privileges"
echo "Done."
