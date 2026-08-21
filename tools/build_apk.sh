#!/usr/bin/env bash
# Build OpenWrt 25.x .apk package (APKv3/ADB format) using apk-tools v3 static binary.
#
# Usage: bash build_apk.sh
# Requires: apk.static (apk-tools v3) at ../../sbin/apk.static or APK_TOOLS env
# Output: dist/luci-app-dhcp-lease-manager-1.0.0-r1.apk
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$WORKSPACE/luci-app-dhcp-lease-manager"
DIST="$SCRIPT_DIR/dist"

NAME="luci-app-dhcp-lease-manager"
VERSION="1.0.0-r1"
ARCH="noarch"   # OpenWrt maps LUCI_PKGARCH=all -> noarch for apk

APK_TOOLS="${APK_TOOLS:-$WORKSPACE/sbin/apk.static}"

if [ ! -x "$APK_TOOLS" ]; then
	echo "ERROR: apk.static not found at $APK_TOOLS" >&2
	exit 1
fi

mkdir -p "$DIST"

# Build a fake install root: layout all files as they would appear on target.
STAGE="$(mktemp -d)"
SCRIPT_DIR_TMP="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$SCRIPT_DIR_TMP"' EXIT

copy_tree() {
	local src_root="$1"
	local dst_root="$2"
	if [ ! -d "$src_root" ]; then
		return 0
	fi
	mkdir -p "$dst_root"
	(cd "$src_root" && tar cf - .) | (cd "$dst_root" && tar xf -)
}

copy_tree "$SRC/root" "$STAGE"
copy_tree "$SRC/htdocs" "$STAGE/www"

# Ensure script is executable
chmod 0755 "$STAGE/usr/libexec/dhcp-lease-tools"

# Post-install script (clear LuCI cache). apk runs this with $IPKG_INSTROOT set during image build.
# NOTE: script MUST live outside the --files tree, otherwise it gets packed into data too.
POSTINST="$SCRIPT_DIR_TMP/post-install"
cat > "$POSTINST" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
	rm -f /tmp/luci-indexcache 2>/dev/null
	rm -rf /tmp/luci-modulecache 2>/dev/null
}
exit 0
EOF
chmod 0755 "$POSTINST"

OUT="$DIST/${NAME}-${VERSION}.apk"

# Mimic OpenWrt's apk mkpkg invocation from include/package-pack.mk
"$APK_TOOLS" mkpkg \
	--info "name:${NAME}" \
	--info "version:${VERSION}" \
	--info "arch:${ARCH}" \
	--info "description:View and delete DHCP leases, restart dnsmasq." \
	--info "license:Apache-2.0" \
	--info "origin:luci-app-dhcp-lease-manager" \
	--info "maintainer:QClaw Assistant" \
	--info "url:https://github.com/example/luci-app-dhcp-lease-manager" \
	--info "depends:luci-base" \
	--script "post-install:$POSTINST" \
	--files "$STAGE" \
	--output "$OUT"

echo "OK: $OUT ($(stat -c%s "$OUT") bytes)"
