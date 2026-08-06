#!/usr/bin/env bash
# Install AureStream Linux TUN helper for local development (pkexec + polkit).
# Production installs come from the deb/rpm package (see tauri.conf.json linux.bundle).
#
# Usage:
#   ./scripts/install-linux-tun-helper.sh
#   sudo ./scripts/install-linux-tun-helper.sh   # non-interactive if already root
#
# Override source tree:
#   AURESTREAM_ROOT=/path/to/repo ./scripts/install-linux-tun-helper.sh
set -euo pipefail

ROOT="${AURESTREAM_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
HELPER_SRC="$ROOT/crates/aurestream-platform-tun/linux-helper"
HELPER_DST_DIR="/usr/lib/AureStream"
HELPER_DST="$HELPER_DST_DIR/aurestream-tun-helper"
POLICY_DST="/usr/share/polkit-1/actions/com.root.aurestream.policy"
RULE_DST="/etc/polkit-1/rules.d/49-aurestream.rules"

for f in aurestream-tun-helper com.root.aurestream.policy 49-aurestream.rules; do
  if [[ ! -f "$HELPER_SRC/$f" ]]; then
    echo "missing $HELPER_SRC/$f" >&2
    exit 1
  fi
done

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v pkexec >/dev/null 2>&1; then
    pkexec "$@"
  else
    sudo "$@"
  fi
}

echo "Installing AureStream TUN helper → $HELPER_DST"
run_as_root bash -c "
set -euo pipefail
install -d -m 755 '$HELPER_DST_DIR'
install -m 755 '$HELPER_SRC/aurestream-tun-helper' '$HELPER_DST'
install -d -m 755 '$(dirname "$POLICY_DST")'
install -m 644 '$HELPER_SRC/com.root.aurestream.policy' '$POLICY_DST'
install -d -m 755 '$(dirname "$RULE_DST")'
install -m 644 '$HELPER_SRC/49-aurestream.rules' '$RULE_DST'
'$HELPER_DST' install-orphan-timer 2>/dev/null || true
"

echo "OK: helper installed."
echo "  helper : $HELPER_DST"
echo "  policy : $POLICY_DST"
echo "  rules  : $RULE_DST"
echo
echo "Probe with: test -x $HELPER_DST && echo ready"
echo "Uninstall:  pkexec $HELPER_DST uninstall"
