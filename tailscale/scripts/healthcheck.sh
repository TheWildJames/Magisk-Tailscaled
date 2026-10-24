#!/system/bin/sh
# healthcheck.sh — daemon auto-recovery.
# Checks if tailscaled is alive; restarts it (and re-runs netenv) if dead.
# Intended to run every 60s via the watch loop in netenv.sh or a cron job.

DIR=$(dirname "$(realpath "$0")")
S="$DIR/../settings.sh"
[ -f "$S" ] || S="/data/adb/tailscale/settings.sh"
. "$S"

if busybox pgrep -f "tailscaled" >/dev/null 2>&1; then
    exit 0
fi

log Warning "tailscaled is not running — restarting"
"${TS_DIR}/scripts/netenv.sh" 2>/dev/null || true
"${TS_DIR}/scripts/tailscaled.service" start 2>/dev/null || true
log Info "healthcheck: restart attempted"
