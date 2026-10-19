## v2.5.0.0

- ce59c72 WebUI v3: bindhosts-style rewrite — Material components, one-exec poll, tap-safe rendering
- **WebUI v3** — rebuilt after bindhosts' proven layout (WTFPL, github.com/bindhosts/bindhosts): header + bottom bar (Home / Devices / More), Material web components (real `md-switch` etc., vendored prebuilt bundle — no build tooling in CI), slide-up logs terminal, M3 dialogs + snackbar, follows the manager's theme.
- **Fixes the slowness and dead touches:** one combined root-shell exec per poll instead of 4+; DOM/peer list only rebuilt when values actually change; events delegated on stable parents so a re-render can't swallow a tap. Polling pauses while dialogs are open.
- Login flow as in v2.4.0.1: auth URL auto-appears with Open in browser / Copy; manual Log in button; no auto-login execs. `tailscale set` flags verified against v1.104.1.
- Tested headless (mock connected / mock logged-out / no-bridge): all states render with zero console errors.

## v2.4.0.1

- **WebUI: login flow fixed.** The auth URL the daemon generates while you're logged out now appears automatically as a clickable link (with Open in browser / Copy) — previously it was generated but thrown away, so the switch sat off with no path forward.
- **WebUI: distinct "logged out" switch state.** When tailscaled is running but you're not logged in, the switch thumb glows amber and reads "tailscaled service is running — log in to connect" — no longer identical to the service-stopped look that contradicted the action button's "service running" report.

## v2.4.0.0

- **Fixed: `tailscaled` failed to start** (`--statedir (or at least --state) is required`). Our binaries are built from official tailscale source, which has no Android default paths (upstream's fork baked them in). The daemon now gets everything explicitly: `--tun=userspace-networking --statedir=/data/adb/tailscale --socket=/data/adb/tailscale/run/tailscaled.sock --port=41641`.
- **Ships the `tailscale` CLI** — previously no release contained the CLI binary at all (upstream used a multicall daemon). Each release tgz now contains `tailscaled` (daemon), `tailscale.bin` (CLI) and `tailscale` (small wrapper pointing the CLI at the module socket).
- State file lives at `/data/adb/tailscale/tailscaled.state` — preserved across module updates.
- Verified end-to-end on official v1.104.1 source: daemon stays up, userspace mode active, CLI `status --json` and `login` URL flow both work.

## v2.3.0.1

- d87d257 WebUI: harden boot against blank screen on KernelSU Next WebView

## v2.3.0.0

- **WebUI v2** — complete rewrite of `webroot/index.html` as a 3-page app: **Devices** (VPN toggle, login button, device info, peer list with tap-to-ping, health warnings), **Settings** (accept DNS, accept routes, advertise as exit node, LAN access, exit-node picker, logout), **Logs** (daemon + service logs).
- Always-render design (bindhosts-style): the page renders even when the KernelSU JS bridge is missing or late, with a retry banner — no more "open from KernelSU Manager" dead screen.
- Manual login button — no more auto-spawning `tailscale login` execs on every poll.
- Module description in KernelSU Manager now tracks VPN state (`⚡ VPN connected` / `⛔ VPN disconnected`), same format as the service writer.
- `action.sh`: removed `jq` dependency (not present on Android) — backend state parsed with grep/sed.

## v2.2.0.0

- Added KernelSU **WebUI** (`webroot/index.html`): status dashboard, connect/disconnect toggle, tailnet device list, login URL flow, logout, daemon log viewer. Opens via the WebUI button in KernelSU Manager / MMRL.
- Added **Action button** (`action.sh`): tap in KernelSU Manager to toggle Tailscale fully on/off (daemon start/stop + `tailscale up`/`down`); on first use it prints and opens a login URL.
- Tested against KernelSU's `ksu.exec` JS bridge (async callback + legacy sync fallback).

## v2.1.0.0

- Updated bundled tailscale binaries: 1.98.8 → 1.104.1 (built for Android from official tailscale v1.104.1 source: NDK cgo, feature-omitted slim build)
- `tailscale_1.104.1_<arch>.tgz` binaries are attached to releases, the lightweight zip now downloads them from this repo at install time
- CI (`.github/workflows/release.yml`) now builds the Android binaries itself (Go + NDK) instead of depending on `anasfanani/tailscale-android-cli` releases
- All updater JSONs, `module.prop` and download links point to TheWildJames/Magisk-Tailscaled
- Fork of [anasfanani/Magisk-Tailscaled](https://github.com/anasfanani/Magisk-Tailscaled) v2.0.0.1

## v2.0.0.1

- 429e1b0 build: fix version bump and add pre-release for build version
- 75834b4 fix: path order

## v2.0.0.0

### ⚠️ Important Notice
This build may be unstable. Please test thoroughly and report any issues you encounter.

**Exit Node Warning**: Using exit nodes may cause battery drain. Not recommended for 24/7 use.

**Testing Your Connection**:
- Check IP: https://browserleaks.com/ip
- Check DNS leaks: https://browserleaks.com/dns

### Major Rewrite
This is a complete rewrite of the module with significant improvements.

### What's New
- **Better DNS handling** - Improved DNS configuration and compatibility
- **SSH support** - Enhanced SSH functionality
- **Exit node support** - Better exit node handling
- **Hotspot client support** - Works with Android hotspot clients
- **VPN compatibility** - Can now run alongside other VPN apps
- **Root & Non-root mode** - Works in both root and non-root environments

### Technical Changes
- Removed all wrapper scripts for better performance
- Now uses tailscaled binaries from [tailscale-android-cli](https://github.com/anasfanani/tailscale-android-cli)
- Simplified module structure
- Improved stability and reliability

### Breaking Changes
This is a major version update. Please backup your configuration before upgrading.
