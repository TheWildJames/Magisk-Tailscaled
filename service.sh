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
# wait for boot to complete
while [ "$(getprop sys.boot_completed)" != 1 ]; do
    sleep 1
done
# ensure boot has actually completed & network is ready
sleep 5
# start service
/data/adb/tailscale/scripts/start.sh
