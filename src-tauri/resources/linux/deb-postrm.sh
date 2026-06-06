#!/bin/sh
set -e
rm -f /usr/lib/AureStream/aurestream-tun-helper
rmdir /usr/lib/AureStream 2>/dev/null || true
rm -f /usr/share/polkit-1/actions/com.root.aurestream.policy
rm -f /etc/polkit-1/rules.d/49-aurestream.rules
