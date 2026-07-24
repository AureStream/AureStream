#!/bin/sh
set -e
# Only remove on package removal/purge.
# On upgrade Debian runs old postrm AFTER unpacking the new package;
# unconditional rm would delete the freshly installed helper and break postinst.
case "$1" in
    remove|purge)
        rm -f /usr/lib/AureStream/aurestream-tun-helper
        rmdir /usr/lib/AureStream 2>/dev/null || true
        rm -f /usr/share/polkit-1/actions/com.root.aurestream.policy
        rm -f /etc/polkit-1/rules.d/49-aurestream.rules
        ;;
esac
