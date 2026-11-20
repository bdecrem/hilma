#!/bin/bash
# Moves Ola's settings from the mini to the Studio's ola account (OLA-100). Run it on the iMac, which
# reaches the mini with its key; ssh asks once for the ola account's password on the Studio.
#
#   move-env.sh <ola@studio> [--check]
#
# The files go mini -> pipe -> Studio, mode 600, and are never written anywhere else or printed:
# the only output is each file's name and size. On the Studio, paths in them that name the mini's
# home (/Users/admin/) are changed to the ola account's. --check lists what would move and copies
# nothing. Then the Studio's setup.sh points the gateway at the local model.
#
# What moves: the services' settings and the TLS certificate and key (the public address moves with
# them). What does not: the mini's backup key (the Studio makes its own, README step 9), the
# platform database and the workspaces (staging's made-up data stays on the mini), the per-project
# allowlists.
set -eu
MINI=${OLA_MINI:-admin@100.95.51.98}
STUDIO=${1:-}
FILES="gateway.env frontdesk.env tls.env tunnel.env claude-oauth-token tls"
[ -n "$STUDIO" ] || { echo "usage: move-env.sh <ola@studio> [--check]"; exit 2; }

echo "on the mini ($MINI), in ~/.ola:"
ssh -o BatchMode=yes "$MINI" "cd .ola && for f in $FILES; do [ -e \"\$f\" ] && du -sk \"\$f\" | awk '{print \"  \" \$2 \" (\" \$1 \" KB)\"}' || echo \"  \$f MISSING\"; done"
case " $* " in *" --check "*) echo "(check: nothing copied)"; exit 0 ;; esac

ssh "$STUDIO" 'test "$(whoami)" = ola && ! id -Gn | tr " " "\n" | grep -qx admin' || { echo "$STUDIO is not the standard account ola"; exit 1; }
ssh -o BatchMode=yes "$MINI" "cd .ola && tar -cf - $FILES" |
  ssh "$STUDIO" 'umask 077; mkdir -p ~/.ola && chmod 700 ~/.ola && cd ~/.ola && tar -xpf - &&
    for f in *.env; do sed -i "" "s#/Users/admin/#$HOME/#g" "$f"; chmod 600 "$f"; done &&
    chmod 600 claude-oauth-token && chmod -R go-rwx tls &&
    echo "on the Studio, in ~/.ola:" && ls -ld '"$FILES"' | awk "{print \"  \" \$1 \" \" \$NF}" &&
    printf "  paths still naming /Users/admin: %s\n" "$(cat *.env | grep -c /Users/admin/)"'
echo "Next on the Studio, as ola: ops/studio/setup.sh ola"
