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
