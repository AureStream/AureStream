#!/bin/sh
set -e
chmod 755 /usr/lib/AureStream/aurestream-tun-helper
# Arm periodic orphan cleanup (removes helper if main app package is gone).
if [ -x /usr/lib/AureStream/aurestream-tun-helper ]; then
  /usr/lib/AureStream/aurestream-tun-helper install-orphan-timer 2>/dev/null || true
fi
