#!/system/bin/sh
# KernelSU: executed on boot completed (per the KernelSU module guide).
# Boot has finished and the network is up — the right time to start the
# daemon. Magisk has no boot-completed stage; service.sh covers that case.
#
# WebUI boot toggle: skip daemon start when the user disabled autostart
if [ -e /data/adb/tailscale/NOBOOT ]; then
    exit 0
fi
# let the network settle after BOOT_COMPLETED
sleep 5
# start service
/data/adb/tailscale/scripts/start.sh
