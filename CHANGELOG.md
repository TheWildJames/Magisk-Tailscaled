## v2.7.0.0

- **Update check uses the WebView's built-in `fetch()`** — same pattern bindhosts uses. No longer needs curl/wget installed on the device to check for updates.
- **Falls back to shell curl/wget** if `fetch()` is blocked by the WebView.
- **If nothing works**, offers to open the GitHub releases page in your browser so you can download the zip manually.
- **Download also falls back** — curl first, then wget.

## v2.6.9.0

- **Update check works without curl** — tries curl, then wget, then busybox wget, then toybox wget. If none are available, offers to open the GitHub releases page in your browser so you can download the zip manually.
- **Download also falls back** — curl first, then wget, with a clear error if both are missing.

## v2.6.8.0

- **Update check now shows what went wrong** — if `curl` returns empty or non-JSON output, the prompt shows the actual response instead of a generic "Failed to parse update info". Removed `2>/dev/null` so errors aren't hidden.
- **Note:** `raw.githubusercontent.com` CDN may take a few minutes to reflect newly pushed versions. If you just updated, the update.json URL may still show the old version until the CDN cache clears.

## v2.6.7.0

- **Redesigned main screen around a single button** — removed the switch from the home page entirely. One primary button shows "Log in" when not logged in, "Connect" when stopped, "Disconnect" when running. Tapping the status card does the same thing.
- **No more dual loading circles** — one small spinner spins next to the main button during any action. No full-screen overlay, no second spinner.
- **Login button shows right away** — when not logged in, the main button says "Log in" and the login URL appears directly below it with Open/Copy buttons. No separate login box.
- **Status badge** — "Connected" / "Log in required" / "Not connected" chip next to the title.

## v2.6.6.0

- **Manual update button** — "Check for update" in the More page fetches update.json from GitHub and compares against your installed versionCode. If a newer release exists, it shows the version + changelog and a "Download" button that pulls the zip to /sdcard/Download/ via curl. The panel auto-checks on boot and stays silent when you're already current.
- **Update panel** — dismissible, shows the new version number, with Download/Dismiss buttons and an inline spinner while downloading.

## v2.6.5.0

- **Redesigned main UI around the switch** — the main toggle is now the primary action on the home page, not a big tap button. The switch sits prominently at the top of the status card with the status text below it.
- **No full-screen loading circle** — removed the busy overlay entirely. Loading state shows only inline: a small spinner next to the switch + the action text ("Starting…", "Stopping…", etc.) right under it.
- **Switch shows busy state** — when any root action is in flight, the switch gets a `busy` class (dimmed, pointer-events disabled) and the inline spinner spins next to it. The UI never looks frozen because `setTimeout(..., 0)` yields to the browser before `ksu.exec` runs.
- **Clean status card** — rounded surface container, larger "Tailscale" title, subtitle that shows connected/stopped state, inline busy row below.

## v2.6.4.0

- **No more frozen UI on start/stop** — the root cause was `ksu.exec(cmd)` being SYNCHRONOUS per the KernelSU-Next API docs: it blocks the WebView UI thread until the command finishes, so the busy overlay never had a chance to paint. Fixed two ways:
  1. Removed the sync fallback in `exec()` — if the callback bridge form fails, it reports an error instead of blocking on `ksu.exec(cmd)`.
  2. Every long exec (start, stop, restart, logout, exit node, settings, boot toggle) is now wrapped in `setTimeout(..., 0)` so the browser paints the busy overlay **before** `ksu.exec` runs. You see the spinner + "Starting…" immediately on tap, not after the command finishes.
- **All 7 action functions yield to the browser** before their root exec: toggleVPN, startLogin, setPref, setExitNode, restartService, confirmLogout, toggleBoot.

## v2.6.3.0

- **Start button actually works** — the `main-switch` toggle (Material switch in shadow DOM) never bubbled its click to `status-box`, so tapping the top toggle looked like it did nothing. It now has its own click handler wired to start/stop, so tapping the switch actually toggles the VPN.
- **No more "frozen" feel** — a full-screen dimming overlay with a large spinning circle + exact action text ("Starting…", "Stopping…", "Logging out…", "Applying settings…") covers the screen the instant you tap any action, before the root command runs. The old subtle linear progress bar alone was too easy to miss.
- **Header cleaned up** — smaller top bar, proper title weight, bottom divider, cleaner version text.

## v2.6.1.0

- **Login no longer looks frozen** — `startLogin()` shows the progress bar + "Generating login URL…" text immediately on tap, instead of a 20s snackbar that could expire before `tailscale login` finished. The menu stays responsive (buttons disabled with clear "working" feedback) until the auth URL is ready.
- Note: the browser login page itself loads at the speed of your network / the Tailscale control plane — that part isn't in the module's control.

## v2.6.0.0

- **WebUI: follows the manager's exact theme** — imports `colors.css`/`insets.css` from the manager's MUI host (KSU-Next/Magisk-on-KSU/MMRL), so the UI picks up your manager's Monet palette and real status/nav-bar insets instead of static guesses; falls back to its own M3 palette when served without one.
- **Adaptive polling** — 4s while an action is in flight or state just changed, 15s when idle, never while the page is hidden or a dialog is open; instant re-sync when you come back to the page (pageshow/focus/visibility).
- **Android back button works** (MMRL WebUI X): back closes the log terminal first, then returns to Home, then exits — via `webroot/config.json` (`backInterceptor: javascript`) which now ships in the zip (the `*.json` exclude was previously eating it).
- **Dialog lockout** — with a dialog open, touches/scroll behind it are blocked (Tricky-Addon pattern), so a stray tap can't flip a switch underneath.
- **Settings & service**: Start-tailscaled-on-boot toggle (`NOBOOT` marker checked by `service.sh`), daemon health warnings surfaced on Home, in-flight progress bar, action button `pgrep` now matches the daemon binary's cmdline (not the service script's).
- Synced with a survey of the ecosystem's best WebUIs (Tricky-Addon, zygisk-detach, bindhosts, zygisk-next): canonical bridge exec wrapper, batched shell work, guarded DOM updates, no per-render event rebinding.

## v2.5.1.0

- 501dead Fix daemon panic on login: taildrop newFileOps nil on headless Android + honest WebUI crash state
- **Fixed: daemon crashed the moment login completed.** v1.104.1's taildrop extension calls a nil `newFileOps` on headless Android builds (upstream bug — the file-ops provider only exists behind `!android` build tags or the official app's cgo). We now carry a patch in the build that disables Taildrop (non-functional headless anyway) instead of SIGSEGV-ing after successful login.
- **Fixed: UI limbo after a daemon crash** — the poll's `pgrep` matched the `tailscaled.service` script's own cmdline, so a dead daemon still showed "Not logged in" with every field "—". Liveness now comes from `status --json` itself: a crashed daemon shows "Service stopped — tap to start", and tapping restarts it.

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
