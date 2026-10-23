#!/system/bin/sh
DIR=$(dirname "$(realpath "$0")")
# shellcheck source=../settings.sh
. "$DIR"/../settings.sh
case "$1" in
    postinstall)
      rm -rf $TS_RUN_DIR && mkdir -p $TS_RUN_DIR
      tailscaled.service restart >> "/dev/null" 2>&1 &
      return 0
    ;;
esac
start_service() {
  if [ ! -f "${TS_MOD_DIR}/disable" ]; then
    tailscaled.service start >> "/dev/null" 2>&1
  fi
}
start_inotifyd() {
  for PID in $(busybox pidof inotifyd); do
    if grep -q "tailscaled.inotify" "/proc/$PID/cmdline"; then
      kill -9 "$PID"
    fi
  done
  echo "${CURRENT_TIME} [Info]: Starting tailscaled inotify service" > "${TS_RUN_LOG_FILE}"
  inotifyd "tailscaled.inotify" "${TS_MOD_DIR}" >> "/dev/null" 2>&1 &
}

module_version=$(busybox awk -F'=' '!/^ *#/ && /version=/ { print $2 }' "$TS_MOD_PROP" 2>/dev/null)
log Info "Tailscale module version : ${module_version}."

# Fix DNS resolution — Android has no /etc/resolv.conf, so Go's DNS
# resolver falls back to [::1]:53 where nothing listens. Without this,
# tailscaled can't resolve controlplane.tailscale.com and every
# connection fails with 'network is unreachable' or 'no DNS fallback'.
TS_RESOLV="${TS_DIR}/resolv.conf"
if [ ! -f "$TS_RESOLV" ] || ! grep -q nameserver "$TS_RESOLV" 2>/dev/null; then
    printf "nameserver 8.8.8.8\nnameserver 8.8.4.4\n" > "$TS_RESOLV"
fi
if ! grep -q nameserver /etc/resolv.conf 2>/dev/null; then
    # /etc is read-only on Android — bind-mount our resolv.conf over it
    mount --bind "$TS_RESOLV" /etc/resolv.conf 2>/dev/null && \
        log Info "DNS: bind-mounted resolv.conf for daemon" || \
        log Warning "DNS: bind-mount failed — daemon may not resolve DNS"
fi

start_service
start_inotifyd