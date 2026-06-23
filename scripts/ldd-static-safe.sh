#!/bin/bash
# linuxdeploy wraps ldd to discover shared-library dependencies for every ELF
# in the AppDir.  Go binaries built with CGO_ENABLED=0 are statically linked;
# ldd exits 1 on those, and linuxdeploy's C++ runtime throws std::runtime_error
# instead of handling it gracefully.
#
# This wrapper runs the real ldd and, on failure, prints the "not a dynamic
# executable" message that glibc's ldd would emit for a static binary, then
# exits 0 so linuxdeploy can move on.
set -euo pipefail

REAL_LDD="/usr/bin/ldd.real"

# If we haven't saved the real ldd yet, do it now.
if [[ ! -x "$REAL_LDD" ]]; then
    # The real ldd might already be us (re-entry guard).  If /usr/bin/ldd is
    # this script, the original is still available at /usr/bin/ldd.orig.
    if [[ -x /usr/bin/ldd.orig ]]; then
        REAL_LDD=/usr/bin/ldd.orig
    else
        echo "ERROR: real ldd not found at $REAL_LDD or /usr/bin/ldd.orig" >&2
        exit 1
    fi
fi

output=$("$REAL_LDD" "$@" 2>&1) && echo "$output" && exit 0

# ldd failed (exit ≠ 0) — typically a static binary or unsupported arch.
echo -e "\tnot a dynamic executable"
exit 0
