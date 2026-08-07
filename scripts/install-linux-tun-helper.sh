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
CORE_DST="$HELPER_DST_DIR/aurestream-core"
ASSET_SRC="$ROOT/src-tauri/resources"
ASSET_DST="$HELPER_DST_DIR/resources"
POLICY_DST="/usr/share/polkit-1/actions/com.root.aurestream.policy"
RULE_DST="/etc/polkit-1/rules.d/49-aurestream.rules"

for f in aurestream-tun-helper com.root.aurestream.policy 49-aurestream.rules; do
  if [[ ! -f "$HELPER_SRC/$f" ]]; then
    echo "missing $HELPER_SRC/$f" >&2
    exit 1
  fi
done
for f in geoip.dat geosite.dat; do
  if [[ ! -f "$ASSET_SRC/$f" ]]; then
    echo "missing $ASSET_SRC/$f; run pnpm download-binaries" >&2
    exit 1
  fi
done

if [[ -n "${AURESTREAM_CORE_PATH:-}" ]]; then
  CORE_SRC="$AURESTREAM_CORE_PATH"
else
  CORE_SRC=""
  case "$(uname -m)" in
    x86_64|amd64) CORE_TARGET="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) CORE_TARGET="aarch64-unknown-linux-gnu" ;;
    *) CORE_TARGET="" ;;
  esac
  for candidate in \
    "$ROOT/src-tauri/binaries/aurestream-core-$CORE_TARGET" \
    "$ROOT"/src-tauri/binaries/aurestream-core \
    "$ROOT"/target/release/aurestream-core \
    "$ROOT"/target/debug/aurestream-core
  do
    if [[ -f "$candidate" ]]; then
      CORE_SRC="$candidate"
      break
    fi
  done
fi
if [[ -z "$CORE_SRC" || ! -f "$CORE_SRC" ]]; then
  echo "missing aurestream-core; run pnpm download-binaries or set AURESTREAM_CORE_PATH" >&2
  exit 1
fi

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
run_as_root bash -c '
set -euo pipefail
install -d -m 755 "$1"
install -m 755 "$2" "$3"
install -o root -g root -m 755 "$4" "$5"
install -d -m 755 "$6"
install -m 644 "$7" "$8"
install -d -m 755 "$9"
install -m 644 "${10}" "${11}"
install -d -m 755 "${12}"
install -o root -g root -m 644 "${13}" "${12}/geoip.dat"
install -o root -g root -m 644 "${14}" "${12}/geosite.dat"
"$3" install-orphan-timer 2>/dev/null || true
' _ \
  "$HELPER_DST_DIR" \
  "$HELPER_SRC/aurestream-tun-helper" "$HELPER_DST" \
  "$CORE_SRC" "$CORE_DST" \
  "$(dirname "$POLICY_DST")" "$HELPER_SRC/com.root.aurestream.policy" "$POLICY_DST" \
  "$(dirname "$RULE_DST")" "$HELPER_SRC/49-aurestream.rules" "$RULE_DST" \
  "$ASSET_DST" "$ASSET_SRC/geoip.dat" "$ASSET_SRC/geosite.dat"

echo "OK: helper installed."
echo "  helper : $HELPER_DST"
echo "  core   : $CORE_DST"
echo "  assets : $ASSET_DST"
echo "  policy : $POLICY_DST"
echo "  rules  : $RULE_DST"
echo
echo "Probe with: test -x $HELPER_DST && echo ready"
echo "Uninstall:  pkexec $HELPER_DST uninstall"
