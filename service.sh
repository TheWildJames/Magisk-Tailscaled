#!/system/bin/sh
# Boot script. KernelSU runs this in late_start service AND runs
# boot-completed.sh on boot completed — the daemon start lives there
# (per the KernelSU module guide, boot-completed.sh is the right stage for
# "run after boot finished"). Magisk has no boot-completed stage, so on
# Magisk this script does the boot-completed wait itself.
MODDIR="${0%/*}"
if [ "$KSU" = "true" ]; then
    # KernelSU: boot-completed.sh handles daemon start
    exit 0
fi
# --- Magisk path ---
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

# wait for boot to complete
while [ "$(getprop sys.boot_completed)" != 1 ]; do
    sleep 1
done
# ensure boot has actually completed
sleep 5
# wait for network connectivity
wait_for_network
# start service
/data/adb/tailscale/scripts/start.sh
