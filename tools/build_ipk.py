#!/usr/bin/env python3
"""Build OpenWrt .ipk package (opkg format) — gzip-wrapped-tar variant.

IMPORTANT: opkg's libarchive-based parser reads ar member names with
trailing spaces intact, so a plain GNU ar archive with names like
"control.tar.gz  " (padded to 16 chars) does NOT match opkg's
strcmp(path, "control.tar.gz") in find_inner() -> "Malformed package file".

The format that actually works on OpenWrt (used by the OpenWrt build
system / luci authors) is:  gzip( tar( debian-binary, data.tar.gz,
control.tar.gz ) ), where the inner tar stores exact member names.

Usage: python build_ipk.py
Output: dist/luci-app-dhcp-lease-manager_1.0.0_all.ipk
"""
import io
import os
import gzip
import tarfile
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')
SRC = os.path.join(ROOT, '..', 'luci-app-dhcp-lease-manager')  # plugin source

PKG = {
    'name': 'luci-app-dhcp-lease-manager',
    'version': '1.0.0',
    'release': '1',
    'arch': 'all',
    'maintainer': 'QClaw Assistant',
    'license': 'Apache-2.0',
    'section': 'luci',
    'depends': 'luci-base',
    'title': 'LuCI support for DHCP Lease Manager',
    'description': 'View and delete DHCP leases, restart dnsmasq.',
}

# Files to package: (install_path, source_path, mode)
def collect_files(src_root):
    files = []
    # root/ -> filesystem root
    root_dir = os.path.join(src_root, 'root')
    if os.path.isdir(root_dir):
        for dirpath, dirnames, filenames in os.walk(root_dir):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root_dir).replace('\\', '/')
                files.append(('/' + rel, full, None))
    # htdocs/ -> /www/
    htdocs = os.path.join(src_root, 'htdocs')
    if os.path.isdir(htdocs):
        for dirpath, dirnames, filenames in os.walk(htdocs):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, htdocs).replace('\\', '/')
                files.append(('/www/' + rel, full, None))
    return files

def control_text(pkg):
    desc = pkg['description'].replace('\n', ' ')
    lines = [
        f"Package: {pkg['name']}",
        f"Version: {pkg['version']}-r{pkg['release']}",
        f"Depends: {pkg['depends']}",
        f"Provides: ",
        f"Source: https://github.com/example/luci-app-dhcp-lease-manager",
        f"License: {pkg['license']}",
        f"Section: {pkg['section']}",
        f"Status: unknown ok not-installed",
        f"Architecture: {pkg['arch']}",
        f"Installed-Size: 50",
        f"Description: {desc}",
        f"Maintainer: {pkg['maintainer']}",
        "",
    ]
    return '\n'.join(lines)

def postinst_text():
    return """#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
	rm -f /tmp/luci-indexcache 2>/dev/null
	rm -rf /tmp/luci-modulecache 2>/dev/null
}
exit 0
"""

def make_tar_gz(members):
    """members: list of (tar_name, data_bytes, mode)"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz', format=tarfile.GNU_FORMAT) as tf:
        for name, data, mode in members:
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            ti.mtime = int(time.time())
            ti.mode = mode if mode else 0o755 if name.endswith(('postinst', 'postrm', 'preinst', 'prerm')) else 0o644
            ti.uid = 0
            ti.gid = 0
            tf.addfile(ti, io.BytesIO(data))
    return buf.getvalue()

def main():
    os.makedirs(DIST, exist_ok=True)
    files = collect_files(SRC)
    if not files:
        print('ERROR: no files found in source tree')
        return 1

    # data.tar.gz
    data_members = []
    for install_path, src_path, mode in files:
        with open(src_path, 'rb') as f:
            data = f.read()
        tar_name = install_path.lstrip('/')
        m = mode
        if m is None:
            m = 0o755 if install_path.endswith('dhcp-lease-tools') else 0o644
        data_members.append((tar_name, data, m))
    data_tgz = make_tar_gz(data_members)

    # control.tar.gz
    control_members = [
        ('control', control_text(PKG).encode('utf-8'), 0o644),
        ('postinst', postinst_text().encode('utf-8'), 0o755),
    ]
    control_tgz = make_tar_gz(control_members)

    # Outer archive: gzip( tar( debian-binary, data.tar.gz, control.tar.gz ) )
    # Member order matches the OpenWrt build system (ipkg-build).
    outer_buf = io.BytesIO()
    with tarfile.open(fileobj=outer_buf, mode='w', format=tarfile.GNU_FORMAT) as tf:
        for name, data, mode in [
            ('./debian-binary', b'2.0\n', 0o644),
            ('./data.tar.gz', data_tgz, 0o644),
            ('./control.tar.gz', control_tgz, 0o644),
        ]:
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            ti.mtime = int(time.time())
            ti.mode = mode
            ti.uid = 0
            ti.gid = 0
            tf.addfile(ti, io.BytesIO(data))

    # gzip the outer tar (matches ipkg-build: gzip -9n)
    outer_tar = outer_buf.getvalue()
    out_data = gzip.compress(outer_tar, compresslevel=9, mtime=0)

    out_path = os.path.join(DIST, f"{PKG['name']}_{PKG['version']}_all.ipk")
    with open(out_path, 'wb') as f:
        f.write(out_data)
    print(f'OK: {out_path} ({len(out_data)} bytes, gzip-wrapped tar)')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
