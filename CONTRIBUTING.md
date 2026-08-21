# 贡献指南

感谢你对 luci-app-dhcp-lease-manager 的兴趣！

## 开发环境

- OpenWrt ≥ 23.05 或 iStoreOS（基于 OpenWrt 23.05+）
- LuCI 纯 JS view 架构（非旧版 Lua CBI）
- 不需要 OpenWrt buildroot 即可测试：scp 部署到路由器即可

## 代码规范

- **shell 脚本**：POSIX sh 兼容（busybox ash），`set -u`、`set -f`，所有变量加引号
- **JS**：LuCI 官方 view 风格，`'use strict'` 开头，`'require ui'` 等依赖声明在文件顶部
- **文件编码**：UTF-8 无 BOM，**LF 换行**（不要 CRLF，已在 `.gitattributes` 强制）
- **JSON**：2 空格缩进

## 提交 PR 前检查清单

- [ ] 本地 `sh -n root/usr/libexec/dhcp-lease-tools` 语法检查通过
- [ ] `node --check htdocs/luci-static/resources/view/dhcp-lease-manager.js` 语法检查通过
- [ ] 在路由器上实测过 list/delete/clean-expired/restart 各功能
- [ ] 暗黑模式下界面正常
- [ ] commit message 清晰，说明变更原因

## 测试方法

```sh
# 部署到路由器测试
scp -r root/usr/libexec/dhcp-lease-tools root@ROUTER:/usr/libexec/
scp -r htdocs/luci-static/resources/view/dhcp-lease-manager.js root@ROUTER:/www/luci-static/resources/view/
ssh root@ROUTER "chmod +x /usr/libexec/dhcp-lease-tools && rm -f /tmp/luci-indexcache && /etc/init.d/rpcd restart"
```

## 打包（可选）

如果你改了代码后需要重新打包 ipk/apk：

```sh
# 在仓库同级目录有 tools/build_ipk.py 和 tools/build_apk.sh
python tools/build_ipk.py
bash tools/build_apk.sh
```

## License

提交的代码默认以 MIT License 发布。
