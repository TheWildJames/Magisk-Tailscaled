#!/system/bin/sh
# KernelSU: executed on boot completed (per the KernelSU module guide).
# Boot has finished and the network is up — the right time to start the
# daemon. Magisk has no boot-completed stage; service.sh covers that case.
#
# WebUI boot toggle: skip daemon start when the user disabled autostart
if [ -e /data/adb/tailscale/NOBOOT ]; then
    exit 0
fi

# Wait for network connectivity (WiFi/cellular) before starting the daemon.
# Without this, tailscaled starts before the interface is up and caches
# "network unreachable" — every connection to controlplane fails until
# the daemon is manually restarted.
wait_for_network() {
    local max=60 i=0
    while [ "$i" -lt "$max" ]; do
        if [ -n "$(ip route show default 2>/dev/null)" ]; then
            return 0
        fi
        sleep 2
        i=$((i + 1))
    done
    # timeout: start anyway — the daemon may pick up the network later
    return 0
}

# let the network settle after BOOT_COMPLETED
sleep 5
# wait for network connectivity
wait_for_network
# start service
/data/adb/tailscale/scripts/start.sh
