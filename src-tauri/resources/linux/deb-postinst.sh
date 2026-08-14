#!/bin/sh
set -e
chmod 755 /usr/lib/AureStream/aurestream-tun-helper
if [ -x /usr/lib/AureStream/aurestream-tun-helper ]; then
  /usr/lib/AureStream/aurestream-tun-helper install-units 2>/dev/null || true
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload 2>/dev/null || true
  systemctl enable --now aurestream-tun.socket 2>/dev/null || true
fi
