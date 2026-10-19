#!/bin/bash
# Build tailscaled for Android (arm + arm64) from official tailscale source.
#
# Usage: build-tailscale-android.sh [tailscale-version] [output-dir]
#   tailscale-version  e.g. 1.104.1 (default: latest stable from pkgs.tailscale.com)
#   output-dir         default: dist
#
# Environment:
#   ANDROID_NDK_PATH  path to NDK toolchain bin dir
#                     (…/toolchains/llvm/prebuilt/linux-x86_64/bin).
#                     If unset, NDK r27c is downloaded to /tmp.
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
echo "Building tailscale v${TS_VERSION} for Android (arm, arm64)"

# --- NDK ---
if [ -z "${ANDROID_NDK_PATH:-}" ]; then
  NDK_VERSION=r27c
  NDK_DIR="/tmp/android-ndk-${NDK_VERSION}-linux"
  ANDROID_NDK_PATH="${NDK_DIR}/toolchains/llvm/prebuilt/linux-x86_64/bin"
  if [ ! -d "$ANDROID_NDK_PATH" ]; then
    echo "Downloading Android NDK ${NDK_VERSION}..."
    curl -#L "https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip" -o /tmp/android-ndk.zip
    unzip -q /tmp/android-ndk.zip -d /tmp
    rm -f /tmp/android-ndk.zip
  fi
fi
[ -x "${ANDROID_NDK_PATH}/aarch64-linux-android21-clang" ] \
  || { echo "error: NDK clang not found under ${ANDROID_NDK_PATH}"; exit 1; }
export PATH="${ANDROID_NDK_PATH}:${PATH}"

# --- Source ---
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
echo "Downloading tailscale v${TS_VERSION} source..."
curl -sL "https://codeload.github.com/tailscale/tailscale/tar.gz/refs/tags/v${TS_VERSION}" \
  -o "$WORKDIR/src.tar.gz"
mkdir -p "$WORKDIR/src"
tar -xzf "$WORKDIR/src.tar.gz" -C "$WORKDIR/src" --strip-components=1
cd "$WORKDIR/src"

# Carried patches (target: v1.104.x — drop once the fix lands upstream).
# taildrop-android-fileops-nil.patch: upstream bug — on headless GOOS=android
# builds `newFileOps` is never assigned (fileops_fs.go is !android; the
# official Android app injects SAF FileOps via cgo). First successful login
# hits the nil func var in onChangeProfile (ext.go:181) and the daemon
# panics: "invalid memory address or nil pointer dereference" right after
# authRoutine-success. The guard disables Taildrop (already non-functional
# headless) instead of crashing.
PATCHES_DIR="$SCRIPT_DIR/patches"
if [ -d "$PATCHES_DIR" ]; then
  for p in "$PATCHES_DIR"/*.patch; do
    echo "Applying patch: $(basename "$p")"
    patch -p1 --no-backup-if-mismatch < "$p"
  done
fi

# NOTE: the ssh server feature is omitted on Android (official tailscale
# excludes ssh/tailssh on android via `linux && !android`; the module does
# not ship the mock `getent` it needs either). `tailscale ssh` client and
# `tailscale up --ssh` advertising remain, the on-device SSH server does not.

export GOFLAGS=-mod=mod
export GOTOOLCHAIN=auto

# Feature omissions copied from anasfanani/tailscale-android-cli scripts/android.sh,
# plus `ssh` (see NOTE above — ssh/tailssh is android-excluded upstream)
TAGS=$(GOOS= GOARCH= go run ./cmd/featuretags \
  --remove "aws,bird,tap,kube,completion,completion_scripts,wakeonlan,capture,systray,syspolicy,appconnectors,identityfederation,usermetrics,logtail,netlog,linuxdnsfight,tpm,ssh" \
  --add cli)
echo "Build tags: $TAGS"

LDFLAGS="-X tailscale.com/version.longStamp=${TS_VERSION} -X tailscale.com/version.shortStamp=${TS_VERSION} -X tailscale.com/version.gitCommitStamp=v${TS_VERSION} -w -s"
mkdir -p "$SCRIPT_DIR/../../$OUT_DIR"

build_arch() {
  local GOARCH=$1 CC=$2
  echo "Building tailscaled + tailscale CLI for ${GOARCH}..."
  GOOS=android GOARCH=$GOARCH CGO_ENABLED=1 CC=$CC CXX="${CC}++" \
    go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
    -o "$SCRIPT_DIR/../../$OUT_DIR/tailscaled.$GOARCH" ./cmd/tailscaled
  GOOS=android GOARCH=$GOARCH CGO_ENABLED=1 CC=$CC CXX="${CC}++" \
    go build -tags="$TAGS" -ldflags="$LDFLAGS" -trimpath \
    -o "$SCRIPT_DIR/../../$OUT_DIR/tailscale.$GOARCH" ./cmd/tailscale
  chmod +x "$SCRIPT_DIR/../../$OUT_DIR/tailscaled.$GOARCH" \
           "$SCRIPT_DIR/../../$OUT_DIR/tailscale.$GOARCH"
}

# GOARCH=arm  -> binary suffix .arm,  NDK clang armv7a
# GOARCH=arm64 -> binary suffix .arm64, NDK clang aarch64
build_arch arm  armv7a-linux-androideabi21-clang
build_arch arm64 aarch64-linux-android21-clang

cd "$SCRIPT_DIR/../.."
echo "Packaging tgz archives..."
# Each tgz ships THREE files:
#   tailscaled    - the daemon. Official tailscale source has NO Android
#                   default paths (upstream anasfanani fork baked them in),
#                   so settings.sh passes --statedir/--socket explicitly.
#   tailscale.bin - the tailscale CLI (official source, no multicall).
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
