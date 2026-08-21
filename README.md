# luci-app-dhcp-lease-manager

**OpenWrt / iStoreOS LuCI 插件 — DHCP 租约管理**

在 LuCI Web 界面查看、删除、清理 dnsmasq 的 DHCP 租约，无需 SSH 到路由器手动改 `/tmp/dhcp.leases`。

OpenWrt 官方 LuCI 只有「查看租约」功能，删除一条租约必须 SSH 上去手动 `sed -i` + 重启 dnsmasq。本插件把这个常见操作做进了 Web 界面。

---

## ✨ 功能特性

| 功能 | 说明 |
|---|---|
| 📋 **租约列表** | 显示 MAC、IP、主机名、到期时间、剩余时长、Client ID |
| 🗑️ **单条删除** | 每行带「删除」按钮，按时间戳精确删除 |
| 🧹 **一键清理过期** | 移除所有已过期租约（保留永久租约） |
| 🔄 **重启 dnsmasq** | Web 界面一键重启，使变更立即生效 |
| 🏷️ **静态保留标注** | 自动对比 `/etc/config/dhcp`，标注哪些 IP 已配置静态保留 |
| 🔍 **搜索 / 筛选** | 按 MAC / IP / 主机名搜索；按状态筛选（有效 / 已过期 / 永久 / 静态） |
| 🌙 **暗黑模式** | 自动适配 LuCI 暗黑主题 |
| 📊 **统计** | 显示总数 / 有效 / 过期 / 永久数量 |

---

## 📦 安装

### 方式 A：opkg 安装 ipk（推荐）

把 `luci-app-dhcp-lease-manager_1.0.0_all.ipk` 上传到路由器 `/tmp/` 后：

```sh
opkg install /tmp/luci-app-dhcp-lease-manager_1.0.0_all.ipk
rm -f /tmp/luci-indexcache && rm -rf /tmp/luci-modulecache && /etc/init.d/rpcd restart
```

浏览器 **Ctrl+Shift+R** 强制刷新，进入「服务 → DHCP 租约管理」。

> 未来 OpenWrt 25.x（apk 包管理器）可使用 `luci-app-dhcp-lease-manager-1.0.0-r1.apk`：
> ```sh
> apk add --allow-untrusted /tmp/luci-app-dhcp-lease-manager-1.0.0-r1.apk
> ```

### 方式 B：scp 直接部署（免打包）

```sh
scp -r root/usr/libexec/dhcp-lease-tools root@192.168.1.1:/usr/libexec/
scp -r root/usr/share/luci root@192.168.1.1:/usr/share/
scp -r htdocs/luci-static root@192.168.1.1:/www/

ssh root@192.168.1.1 "chmod 0755 /usr/libexec/dhcp-lease-tools && \
  rm -f /tmp/luci-indexcache && rm -rf /tmp/luci-modulecache && /etc/init.d/rpcd restart"
```

---

## 🛠️ 后端命令

后端 shell 工具位于 `/usr/libexec/dhcp-lease-tools`，支持子命令：

| 子命令 | 作用 |
|---|---|
| `list` | 列出所有租约（JSON） |
| `delete <timestamp>` | 按时间戳删除单条租约 |
| `delete-ip <ip>` | 按 IP 删除单条租约 |
| `static-list` | 列出静态保留（JSON） |
| `clean-expired` | 清理所有已过期租约 |
| `restart` | 重启 dnsmasq |
| `count` | 返回租约统计（总数/有效/过期/永久） |

---

## 📁 项目结构

```
luci-app-dhcp-lease-manager/
├── Makefile                                        # OpenWrt 包定义
├── README.md
├── LICENSE                                         # MIT
├── .gitignore
├── htdocs/luci-static/resources/view/
│   └── dhcp-lease-manager.js                       # 前端 LuCI JS 视图
└── root/
    ├── usr/libexec/dhcp-lease-tools                 # 后端 shell 工具
    └── usr/share/
        ├── luci/menu.d/luci-app-dhcp-lease-manager.json   # 菜单挂载
        └── rpcd/acl.d/luci-app-dhcp-lease-manager.json    # ACL 权限
```

---

## 🔧 兼容性

- **架构**：`all`（纯脚本 + JS，无二进制编译）
- **OpenWrt ≥ 23.05**（ucode / 纯 JS view 架构）
- **iStoreOS**（基于 OpenWrt 23.05+ 的魔改）
- 已测试：iStoreOS 24.10.8（RK3568 / aarch64）

---

## 📝 使用场景

- 换主板 / 换网卡导致 MAC 变化，静态地址分配改了新 MAC 后，客户端仍拿旧 IP → 删旧租约 + 重启 dnsmasq
- 想立刻释放某个 IP 给别的设备用，不想等租约到期
- 路由器长期不重启，租约列表堆了一堆离线设备的过期记录，想清理
- 不想每次都 SSH 上去敲 `sed -i` + `/etc/init.d/dnsmasq restart`

---

## ⚠️ 注意事项

- 删除租约后必须**重启 dnsmasq** 才生效（插件已集成「重启」按钮）
- 静态地址分配请在 **网络 → DHCP/DNS → 静态地址分配** 配置，本插件只读不改
- 修改静态分配后客户端仍拿旧 IP 时：删除旧租约 → 重启 dnsmasq → 客户端 `ipconfig /release && ipconfig /renew`（或断开重连 WiFi）
- 租约文件位于 `/tmp/`（RAM），路由器重启会清空，属正常行为

---

## 📜 License

[MIT](LICENSE)
