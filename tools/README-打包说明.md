# luci-app-dhcp-lease-manager 打包说明

本插件支持两种包格式，适配不同 OpenWrt 版本：

| 格式 | 扩展名 | 包管理器 | 适用系统 | 文件 |
|------|--------|----------|----------|------|
| IPK | `.ipk` | opkg | OpenWrt ≤ 24.x（含 iStoreOS 24.10） | `luci-app-dhcp-lease-manager_1.0.0_all.ipk` |
| APKv3 | `.apk` | apk-tools 3.x | OpenWrt 25.x+ | `luci-app-dhcp-lease-manager-1.0.0-r1.apk` |

输出目录：`tools/dist/`

## 重新打包

### IPK（Python 3，无需额外依赖）

```powershell
python tools\build_ipk.py
```

脚本逻辑：
1. 收集插件文件：`root/` → 文件系统根目录；`htdocs/` → `/www/`
2. 生成 `control`（含 Package/Version/Depends/Architecture=all）和 `postinst`（清 LuCI 缓存）
3. 打包成 GNU ar 格式：`debian-binary`(2.0) + `control.tar.gz` + `data.tar.gz`

### APK（需 WSL + apk-tools v3）

```powershell
wsl -d Ubuntu-22.04 -- bash -lc "cd /mnt/c/Users/lan-zz/.qclaw/workspace && bash tools/build_apk.sh"
```

依赖：`sbin/apk.static`（apk-tools 3.0.7 静态二进制，来自 Alpine edge，
下载：`https://dl-cdn.alpinelinux.org/alpine/edge/main/x86_64/apk-tools-static-3.0.7-r0.apk`，
解压出 `sbin/apk.static`）。若已删除，重新下载解压即可。

脚本逻辑（严格模仿 OpenWrt `include/package-pack.mk` 的官方调用）：
```sh
apk.static mkpkg \
  --info "name:luci-app-dhcp-lease-manager" \
  --info "version:1.0.0-r1" \
  --info "arch:noarch" \
  --info "description:..." \
  --info "license:Apache-2.0" \
  --info "origin:luci-app-dhcp-lease-manager" \
  --info "maintainer:..." \
  --info "url:..." \
  --info "depends:luci-base" \
  --script "post-install:<脚本路径(在files树外)>" \
  --files "<文件树根>" \
  --output "....apk"
```

关键点：
- `LUCI_PKGARCH=all` 在 apk 体系映射为 `arch:noarch`
- post-install 脚本必须放在 `--files` 树**之外**，否则会泄露进 data 段
- 版本号格式：OpenWrt 惯例 `<ver>-r<release>`（如 `1.0.0-r1`）

## 验证方法

```sh
# APK：官方 apk-tools 校验
apk.static verify --allow-untrusted luci-app-dhcp-lease-manager-1.0.0-r1.apk   # → OK

# IPK：检查 ar 结构 + control 内容
tar -tf luci-app-dhcp-lease-manager_1.0.0_all.ipk   # 应列出 debian-binary/control.tar.gz/data.tar.gz
# 解出 control.tar.gz 后 tar -tzf 应看到 control + postinst
```

## 安装

### iStoreOS 24.10（当前，opkg）

```sh
# 传到路由器后：
opkg install /tmp/luci-app-dhcp-lease-manager_1.0.0_all.ipk
rm -f /tmp/luci-indexcache && rm -rf /tmp/luci-modulecache && /etc/init.d/rpcd restart
```

### 未来 OpenWrt 25.x（apk）

```sh
apk add /tmp/luci-app-dhcp-lease-manager-1.0.0-r1.apk
```

## 已知问题/备注

- APKv3 是 Alpine ADB 二进制容器格式（`ADBd` 魔数 + Deflate），**不能手写**，必须用 apk-tools 3.x 的 `mkpkg` 生成
- 本包未签名（`--sign` 未启用），安装时需 `--allow-untrusted` 或仓库配置信任
- 包内文件均安装到绝对路径，卸载后无残留配置（无 uci-defaults）
