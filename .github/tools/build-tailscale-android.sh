#!/bin/bash
# Build tailscaled for Android (arm + arm64) from official tailscale source.
#
# IMPORTANT: built with GOOS=linux, NOT GOOS=android. GOOS=android builds
# hard-exclude the Linux router — tailscaled fails to start with a real
# TUN ("creating router: unsupported OS android") and can only run
# userspace networking, which Android apps cannot route into. The
# GOOS=linux build gives us the real kernel TUN (tailscale0) + netlink
# router, so apps on the phone reach tailnet IPs directly.
#
# Usage: build-tailscale-android.sh [tailscale-version] [output-dir]
#   tailscale-version  e.g. 1.104.1 (default: latest stable from pkgs.tailscale.com)
#   output-dir         default: dist
#
# No NDK needed: CGO is disabled, producing fully static binaries.
#
# Outputs (in output-dir):
#   tailscaled.arm(.arm64), tailscale.arm(.arm64)
#   tailscale_<version>_arm.tgz, tailscale_<version>_arm64.tgz
#     (each tgz contains `tailscale` (sh wrapper), `tailscale.bin` (CLI)
#      and `tailscaled` (daemon))
set -euo pipefail

TS_VERSION="${1:-}"
OUT_DIR="${2:-dist}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$TS_VERSION" ]; then
  echo "Detecting latest stable tailscale..."
  TS_VERSION=$(curl -s https://pkgs.tailscale.com/stable/ \
    | grep -o 'tailscale_[0-9.]*_arm64\.tgz' | head -1 \
    | sed 's/^tailscale_//; s/_arm64\.tgz$//')
  [ -n "$TS_VERSION" ] || { echo "error: could not detect latest tailscale version"; exit 1; }
fi
echo "Building tailscale v${TS_VERSION} for Android (linux/arm, linux/arm64, static)"

# --- Source ---
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
echo "Downloading tailscale v${TS_VERSION} source..."
curl -sL "https://codeload.github.com/tailscale/tailscale/tar.gz/refs/tags/v${TS_VERSION}" \
  -o "$WORKDIR/src.tar.gz"
mkdir -p "$WORKDIR/src"
tar -xzf "$WORKDIR/src.tar.gz" -C "$WORKDIR/src" --strip-components=1
cd "$WORKDIR/src"

# NOTE: the ssh server feature is omitted (feature tag below) — the module
# does not ship the mock `getent` it needs. `tailscale ssh` client and
# `tailscale up --ssh` advertising remain, the on-device SSH server does not.
# (The old GOOS=android builds also needed taildrop-android-fileops-nil.patch
# for a nil `newFileOps` panic — GOOS=linux compiles fileops_fs.go and has no
# such bug, so no patches are applied anymore.)

export GOFLAGS=-mod=mod
export GOTOOLCHAIN=auto

# Feature omissions copied from anasfanani/tailscale-android-cli scripts/android.sh,
# plus `ssh` (see NOTE above)
TAGS=$(go run ./cmd/featuretags \
  --remove "aws,bird,tap,kube,completion,completion_scripts,wakeonlan,capture,systray,syspolicy,appconnectors,identityfederation,usermetrics,logtail,netlog,linuxdnsfight,tpm,ssh" \
  --add cli)
echo "Build tags: $TAGS"

LDFLAGS="-X tailscale.com/version.longStamp=${TS_VERSION} -X tailscale.com/version.shortStamp=${TS_VERSION} -X tailscale.com/version.gitCommitStamp=v${TS_VERSION} -w -s"
mkdir -p "$SCRIPT_DIR/../../$OUT_DIR"

build_arch() {
  local GOARCH=$1
  echo "Building tailscaled + tailscale CLI for linux/${GOARCH} (static)..."
  if [ "$GOARCH" = "arm" ]; then
    GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 \
      go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
      -o "$SCRIPT_DIR/../../$OUT_DIR/tailscaled.$GOARCH" ./cmd/tailscaled
    GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 \
      go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
      -o "$SCRIPT_DIR/../../$OUT_DIR/tailscale.$GOARCH" ./cmd/tailscale
  else
    GOOS=linux GOARCH="$GOARCH" CGO_ENABLED=0 \
      go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
      -o "$SCRIPT_DIR/../../$OUT_DIR/tailscaled.$GOARCH" ./cmd/tailscaled
    GOOS=linux GOARCH="$GOARCH" CGO_ENABLED=0 \
      go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
      -o "$SCRIPT_DIR/../../$OUT_DIR/tailscale.$GOARCH" ./cmd/tailscale
  fi
  chmod +x "$SCRIPT_DIR/../../$OUT_DIR/tailscaled.$GOARCH" \
           "$SCRIPT_DIR/../../$OUT_DIR/tailscale.$GOARCH"
}

# GOARCH=arm  -> binary suffix .arm
# GOARCH=arm64 -> binary suffix .arm64
build_arch arm
build_arch arm64

cd "$SCRIPT_DIR/../.."
echo "Packaging tgz archives..."
# Each tgz ships THREE files:
#   tailscaled    - the daemon (static, linux GOOS -> real TUN + netlink router)
#   tailscale.bin - the tailscale CLI
#   tailscale     - tiny sh wrapper routing the CLI to the module socket;
#                   the CLI's default socket (/var/run/tailscale/...) does
#                   not exist on Android.
package_arch() {
  local GOARCH=$1
  local STAGE="${OUT_DIR}/stage-${GOARCH}"
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  cp "${OUT_DIR}/tailscaled.$GOARCH" "$STAGE/tailscaled"
  cp "${OUT_DIR}/tailscale.$GOARCH"  "$STAGE/tailscale.bin"
  cat > "$STAGE/tailscale" <<'EOF'
#!/system/bin/sh
# tailscale CLI wrapper: the official CLI defaults to
# /var/run/tailscale/tailscaled.sock, which does not exist on Android.
exec /data/adb/tailscale/bin/tailscale.bin --socket=/data/adb/tailscale/run/tailscaled.sock "$@"
EOF
  chmod 755 "$STAGE/tailscale" "$STAGE/tailscale.bin" "$STAGE/tailscaled"
  tar -czf "${OUT_DIR}/tailscale_${TS_VERSION}_${GOARCH}.tgz" \
    -C "$STAGE" tailscale tailscale.bin tailscaled
  rm -rf "$STAGE"
}
package_arch arm
package_arch arm64

echo "Done:"
ls -lh "${OUT_DIR}"
