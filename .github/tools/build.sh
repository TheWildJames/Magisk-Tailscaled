#!/bin/bash
set -e

VERSION="${1:-$(grep '^version=' module.prop | cut -d'=' -f2)}"
DIST_DIR="dist"
BIN_DIR="tailscale/bin"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Latest stable tailscale (e.g. 1.104.1); override with TS_VERSION env
TS_VERSION="${TS_VERSION:-$(curl -s https://pkgs.tailscale.com/stable/ \
  | grep -o 'tailscale_[0-9.]*_arm64\.tgz' | head -1 \
  | sed 's/^tailscale_//; s/_arm64\.tgz$//')}"
[ -n "$TS_VERSION" ] || { echo "error: could not detect latest tailscale version"; exit 1; }

get_latest_release() {
  curl -s "https://api.github.com/repos/$1/releases/latest" | grep '"browser_download_url"' | grep "$2" | sed 's/.*"browser_download_url": "\([^"]*\)".*/\1/'
}

echo "Building Magisk-Tailscaled ${VERSION} (tailscale ${TS_VERSION})"
echo "========================================"

mkdir -p "$BIN_DIR" "$DIST_DIR"

echo "Building Android tailscaled binaries from source..."
"$TOOLS_DIR/build-tailscale-android.sh" "$TS_VERSION" "$DIST_DIR"

echo "Extracting binaries into ${BIN_DIR}..."
tar -xzf "$DIST_DIR/tailscale_${TS_VERSION}_arm.tgz" -C "$BIN_DIR"
mv "$BIN_DIR/tailscaled" "$BIN_DIR/tailscaled-arm"
tar -xzf "$DIST_DIR/tailscale_${TS_VERSION}_arm64.tgz" -C "$BIN_DIR"
mv "$BIN_DIR/tailscaled" "$BIN_DIR/tailscaled-arm64"

for ARCH in arm arm64; do
  case $ARCH in
    arm) F_ARCH=armv7a ;;
    arm64) F_ARCH=aarch64 ;;
  esac
  echo "- Downloading jq for ${ARCH}..."
  URL=$(get_latest_release "theshoqanebi/jq-build-for-android" "jq-${F_ARCH}-linux-android")
  curl -#L "$URL" -o "$BIN_DIR/jq-$ARCH"
done

echo ""
echo "Creating zip without binaries..."
zip -9 -r "${DIST_DIR}/Magisk-Tailscaled-${VERSION}.zip" . -x "*.git*" "dist/*" "*.zip" "*.json" "*.md" "tailscale/bin/*" ".shellcheckrc" >/dev/null

echo "Creating zip with binaries..."
zip -9 -r "${DIST_DIR}/Magisk-Tailscaled-${VERSION}-full.zip" . -x "*.git*" "dist/*" "*.zip" "*.json" "*.md" ".shellcheckrc" >/dev/null

rm -f "$BIN_DIR"/*

echo ""
echo "Build completed successfully!"
echo "========================================"
ls -lh "${DIST_DIR}/"
echo "========================================"
echo "Created: ${DIST_DIR}/Magisk-Tailscaled-${VERSION}.zip (no binaries - downloads on install)"
echo "Created: ${DIST_DIR}/Magisk-Tailscaled-${VERSION}-full.zip (includes all binaries)"
