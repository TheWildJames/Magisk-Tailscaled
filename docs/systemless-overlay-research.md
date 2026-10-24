# Systemless Overlay Research — KernelSU/Magisk `system/` Directory

## Question
How does the `system/` directory in a Magisk/KernelSU module work, and can we use it to provide `/etc/resolv.conf` without remounting `/system`?

## Findings

### 1. How the Overlay Works
- Magisk and KernelSU both support a `system/` directory inside the module.
- At boot (post-fs-data), the module manager bind-mounts files from `$MODDIR/system/` onto the corresponding paths in `/system/`.
- For example, `$MODDIR/system/etc/resolv.conf` is bind-mounted over `/system/etc/resolv.conf`.
- This is a **systemless** modification — the actual `/system` partition is never touched.
- The overlay persists across reboots and is removed when the module is uninstalled.

### 2. KernelSU Specifics
- KernelSU uses the same overlay mechanism as Magisk (compatible format).
- KernelSU's `system` overlay is applied during `post-fs-data` phase.
- Files must have correct SELinux contexts. KernelSU handles this automatically for files in the `system/` directory.
- The overlay is applied before `service.sh` runs, so `/system/etc/resolv.conf` is available when the daemon starts.

### 3. /etc/resolv.conf on Android
- `/etc` is a symlink to `/system/etc` on most Android ROMs.
- `/system/etc/resolv.conf` may or may not exist. If it doesn't, the overlay creates it.
- Android's `netd` does NOT read `/etc/resolv.conf` — it uses the DnsResolver Binder API.
- However, GOOS=linux binaries (like tailscaled) DO read `/etc/resolv.conf` via Go's resolver.
- So the overlay provides DNS for tailscaled and other Linux binaries, but not for Android apps (which use netd).

### 4. SELinux Contexts
- Files in the `system/` overlay need `u:object_r:system_file:s0` context.
- Magisk/KernelSU automatically sets this context during overlay application.
- If manually creating files, use: `chcon u:object_r:system_file:s0 /system/etc/resolv.conf`

### 5. Reboot Survival
- The overlay is re-applied on every boot by the module manager.
- The file content comes from the module's `system/` directory (which is in the module's storage, not /system).
- Updating the module replaces the file content.

### 6. Limitations
- Some ROMs (especially those with dm-verity + AVB) may reject the overlay if SELinux is in enforcing mode and contexts are wrong.
- The overlay only works for files that exist in the module's `system/` directory at install time.
- Dynamic changes (like netenv.sh updating resolv.conf at runtime) still require writing to the overlaid path.

### 7. Current Implementation Status
- `system/etc/resolv.conf` exists in the repo (created in v2.8.6.0).
- It contains static nameservers (8.8.8.8, 8.8.4.4).
- At runtime, netenv.sh overwrites it with the active network's resolvers.
- The systemless overlay provides the initial file; netenv.sh keeps it updated.

### 8. Recommendation
- Keep the systemless overlay for the initial file.
- Keep the remount fallback in netenv.sh for devices where the overlay doesn't work.
- Add `|| true` to all remount attempts to prevent `set -e` failures.
- Test on multiple ROMs to verify overlay works.

## Sources
1. Magisk module guide: https://topjohnwu.github.io/Magisk/guides.html
2. KernelSU module documentation: https://kernelsu.org/guide/module.html
3. Android SELinux: https://source.android.com/docs/security/features/selinux
4. Magisk systemless overlay: https://github.com/topjohnwu/Magisk/blob/master/docs/guides.md
5. KernelSU system overlay: https://github.com/tiann/KernelSU/blob/main/docs/guide/module.md
