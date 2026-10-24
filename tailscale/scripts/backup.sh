#!/system/bin/sh
# State backup for magisk-tailscaled.
# Tars $TS_DIR excluding binaries (bin/*) and runtime/logs (run/*)
# to /sdcard/tailscale-backup-<timestamp>.tar.gz.

DIR=$(dirname "$(realpath "$0")")
S="$DIR/../settings.sh"
[ -f "$S" ] || S="/data/adb/tailscale/settings.sh"
[ -f "$S" ] && . "$S"
TS_DIR="${TS_DIR:-/data/adb/tailscale}"

TS=$(date +%s)
OUT="/sdcard/tailscale-backup-${TS}.tar.gz"

cd /data/adb || exit 1
tar -czf "$OUT" \
  --exclude="tailscale/bin" \
  --exclude="tailscale/bin/*" \
  --exclude="tailscale/run" \
  --exclude="tailscale/run/*" \
  tailscale

echo "$OUT"
