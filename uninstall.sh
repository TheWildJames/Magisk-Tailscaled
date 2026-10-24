#!/system/bin/sh
# Clean up old .bak files older than 7 days before removal
find /data/adb/tailscale -type f -name '*.bak*' -mtime +7 -delete 2>/dev/null || true
rm -rf /data/adb/tailscale
SERVICE_DIR="/data/adb/service.d"
if [ -f "$SERVICE_DIR/tailscaled_service.sh" ]; then
    rm -f "$SERVICE_DIR/tailscaled_service.sh"
fi