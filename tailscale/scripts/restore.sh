#!/system/bin/sh
# Restore state from a backup tar.gz created by backup.sh.
# Extracts into /data/adb/tailscale.
# Usage: restore.sh [backup-file]

DIR=$(dirname "$(realpath "$0")")
S="$DIR/../settings.sh"
[ -f "$S" ] || S="/data/adb/tailscale/settings.sh"
[ -f "$S" ] && . "$S"
TS_DIR="${TS_DIR:-/data/adb/tailscale}"

FILE="${1:-}"
if [ -z "$FILE" ]; then
  # pick newest backup
  FILE=$(ls -t /sdcard/tailscale-backup-*.tar.gz 2>/dev/null | head -n1)
fi
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "no backup found"; exit 1; }

mkdir -p /data/adb
tar -xzf "$FILE" -C /data/adb
echo "restored $FILE"
