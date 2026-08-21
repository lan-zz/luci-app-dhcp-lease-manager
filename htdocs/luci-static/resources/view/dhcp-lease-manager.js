'use strict';
'require view';
'require ui';
'require fs';

var state = {
	leases: [],
	leaseFile: '',
	staticIps: [],
	search: '',
	filter: 'all',
	busy: false,
	confirmDelete: {}
};

function parseJson(stdout) {
	try {
		return JSON.parse(stdout || '{}');
	} catch (e) {
		return { ok: false, error: _('后端返回了无效 JSON。') };
	}
}

function toolErrorText(err, fallback) {
	var msg = '';

	if (typeof err === 'string')
		msg = err;
	else if (err && err.message)
		msg = err.message;

	if (/permission|access|denied|没有权限|权限/i.test(msg))
		return _('当前登录会话尚未加载本插件 ACL 权限，请退出并重新登录 LuCI 后再试。');

	return msg || fallback;
}

function callTools(args) {
	return fs.exec('/usr/libexec/dhcp-lease-tools', args || []).then(function(res) {
		return {
			code: res && res.code,
			stdout: res && res.stdout ? res.stdout.trim() : '',
			stderr: res && res.stderr ? res.stderr.trim() : ''
		};
	});
}

function loadLeases() {
	return callTools([ 'list' ]).then(function(res) {
		var data = parseJson(res.stdout);
		if (!data.ok)
			return Promise.reject(data.error || res.stderr);

		state.leaseFile = data.lease_file || '';
		state.leases = data.leases || [];
	}).catch(function(err) {
		ui.addNotification(null, E('p', {}, toolErrorText(err, _('读取租约失败。'))), 'danger');
	});
}

function loadStatic() {
	return callTools([ 'static-list' ]).then(function(res) {
		var data = parseJson(res.stdout);
		if (data.ok) {
			state.staticIps = [];
			(data.static_leases || []).forEach(function(s) {
				if (s.ip)
					state.staticIps.push(s.ip);
			});
		}
	}).catch(function() {
		state.staticIps = [];
	});
}

function refresh(notify) {
	state.busy = true;
	Promise.all([ loadLeases(), loadStatic() ]).then(function() {
		state.busy = false;
		update();
		if (notify)
			ui.addNotification(null, E('p', {}, _('已刷新租约列表。')), 'info');
	}).catch(function() {
		state.busy = false;
		update();
	});
}

function deleteLease(lease) {
	if (state.busy)
		return;

	var doDelete = function() {
		state.busy = true;
		update();

		callTools([ 'delete', String(lease.timestamp) ]).then(function(res) {
			var data = parseJson(res.stdout);
			state.busy = false;

			if (!data.ok) {
				ui.addNotification(null, E('p', {}, toolErrorText(data.error || res.stderr, _('删除租约失败。'))), 'danger');
				refresh();
				return;
			}

			ui.addNotification(null, E('p', {}, _('已删除租约：') + (lease.hostname || lease.ip)), 'info');
			refresh();
		}).catch(function(err) {
			state.busy = false;
			ui.addNotification(null, E('p', {}, toolErrorText(err, _('删除租约失败。'))), 'danger');
			refresh();
		});
	};

	if (!ui.showModal) {
		if (window.confirm(_('确定删除该租约？删除后需重启 dnsmasq 生效。')))
			doDelete();
		return;
	}

	ui.showModal(_('删除租约'), [
		E('p', {}, _('确定删除以下租约？')),
		E('p', {}, [
			E('strong', {}, lease.hostname || '-'),
			' — ',
			E('code', {}, lease.ip || '-'),
			' (',
			E('code', {}, lease.mac_upper || lease.mac || '-'),
			')'
		]),
		E('p', { 'class': 'alert-message warning' }, _('删除后请点击「重启 dnsmasq」使变更立即生效。')),
		E('div', { 'class': 'right' }, [
			E('button', {
				'class': 'btn',
				'click': function() { ui.hideModal(); }
			}, _('取消')),
			' ',
			E('button', {
				'class': 'btn cbi-button-negative',
				'click': function() {
					ui.hideModal();
					doDelete();
				}
			}, _('删除'))
		])
	]);
}

function restartDnsmasq() {
	if (state.busy)
		return;

	var doRestart = function() {
		state.busy = true;
		update();

		callTools([ 'restart' ]).then(function(res) {
			var data = parseJson(res.stdout);
			state.busy = false;

			if (!data.ok) {
				ui.addNotification(null, E('p', {}, toolErrorText(data.error || res.stderr, _('重启 dnsmasq 失败。'))), 'danger');
				update();
				return;
			}

			ui.addNotification(null, E('p', {}, _('dnsmasq 已重启，变更已生效。')), 'info');
			update();
		}).catch(function(err) {
			state.busy = false;
			ui.addNotification(null, E('p', {}, toolErrorText(err, _('重启 dnsmasq 失败。'))), 'danger');
			update();
		});
	};

	if (!ui.showModal) {
		if (window.confirm(_('确定重启 dnsmasq 服务？')) )
			doRestart();
		return;
	}

	ui.showModal(_('重启 dnsmasq'), [
		E('p', {}, _('重启 dnsmasq 服务将使所有租约变更立即生效。')),
		E('p', { 'class': 'alert-message warning' }, _('重启过程中网络可能短暂中断，正在使用本路由器 DHCP 的设备会重新续租。')),
		E('div', { 'class': 'right' }, [
			E('button', {
				'class': 'btn',
				'click': function() { ui.hideModal(); }
			}, _('取消')),
			' ',
			E('button', {
				'class': 'btn cbi-button-action',
				'click': function() {
					ui.hideModal();
					doRestart();
				}
			}, _('重启'))
		])
	]);
}

function cleanExpired() {
	if (state.busy)
		return;

	var doClean = function() {
		state.busy = true;
		update();

		callTools([ 'clean-expired' ]).then(function(res) {
			var data = parseJson(res.stdout);
			state.busy = false;

			if (!data.ok) {
				ui.addNotification(null, E('p', {}, toolErrorText(data.error || res.stderr, _('清理过期租约失败。'))), 'danger');
				update();
				return;
			}

			ui.addNotification(null, E('p', {}, _('已清理过期租约：') + (data.cleaned || 0) + ' 条'), 'info');
			refresh();
		}).catch(function(err) {
			state.busy = false;
			ui.addNotification(null, E('p', {}, toolErrorText(err, _('清理过期租约失败。'))), 'danger');
			update();
		});
	};

	if (!ui.showModal) {
		doClean();
		return;
	}

	ui.showModal(_('清理过期租约'), [
		E('p', {}, _('将从租约文件中移除所有已过期的租约记录。')),
		E('div', { 'class': 'right' }, [
			E('button', {
				'class': 'btn',
				'click': function() { ui.hideModal(); }
			}, _('取消')),
			' ',
			E('button', {
				'class': 'btn cbi-button-action',
				'click': function() {
					ui.hideModal();
					doClean();
				}
			}, _('清理'))
		])
	]);
}

function filteredLeases() {
	var rows = state.leases.filter(function(l) {
		if (state.search) {
			var q = state.search.toLowerCase();
			var hay = (l.mac + ' ' + l.ip + ' ' + l.hostname + ' ' + (l.client_id || '')).toLowerCase();
			if (hay.indexOf(q) === -1)
				return false;
		}
		if (state.filter === 'active')
			return !l.is_expired;
		if (state.filter === 'expired')
			return l.is_expired;
		if (state.filter === 'permanent')
			return l.is_permanent;
		if (state.filter === 'static')
			return state.staticIps.indexOf(l.ip) !== -1;
		return true;
	});
	return rows;
}

function isDarkColor(color) {
	var m = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/);
	if (!m)
		return false;
	if (m[4] != null && Number(m[4]) === 0)
		return false;
	var brightness = Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114;
	return brightness < 128;
}

function pageUsesDarkBackground(viewRoot) {
	var nodes = [];
	var node = viewRoot;
	while (node) {
		nodes.push(node);
		node = node.parentElement;
	}
	nodes.push(document.body);
	nodes.push(document.documentElement);
	for (var i = 0; i < nodes.length; i++) {
		if (!nodes[i])
			continue;
		var color = window.getComputedStyle(nodes[i]).backgroundColor || '';
		if (isDarkColor(color))
			return true;
	}
	return false;
}

function themeClass(viewRoot) {
	return pageUsesDarkBackground(viewRoot) ? ' lm-dark' : '';
}

function statCard(label, value, tone) {
	return E('div', { 'class': 'lm-card ' + (tone || '') }, [
		E('div', { 'class': 'lm-card-label' }, label),
		E('div', { 'class': 'lm-card-value' }, String(value == null ? '-' : value))
	]);
}

function renderStats() {
	var active = 0, expired = 0, permanent = 0;
	state.leases.forEach(function(l) {
		if (l.is_permanent) permanent++;
		else if (l.is_expired) expired++;
		else active++;
	});

	return E('div', { 'class': 'lm-cards' }, [
		statCard(_('租约总数'), state.leases.length),
		statCard(_('有效租约'), active, 'ok'),
		statCard(_('已过期'), expired, 'warn'),
		statCard(_('永久租约'), permanent),
		statCard(_('静态保留'), state.staticIps.length, 'info')
	]);
}

function renderToolbar() {
	var searchInput = E('input', {
		'id': 'lm-search',
		'class': 'cbi-input-text lm-search',
		'type': 'text',
		'value': state.search,
		'placeholder': _('搜索 MAC / IP / 主机名...'),
		'input': function() {
			state.search = this.value;
			updateTable();
		}
	});

	var filters = [
		[ 'all', _('全部') ],
		[ 'active', _('有效') ],
		[ 'expired', _('已过期') ],
		[ 'permanent', _('永久') ],
		[ 'static', _('静态保留') ]
	];

	return E('div', { 'class': 'lm-toolbar' }, [
		searchInput,
		E('span', { 'class': 'lm-toolbar-sep' }),
		E('div', { 'class': 'lm-filters' }, filters.map(function(item) {
			return E('button', {
				'class': 'btn ' + (state.filter === item[0] ? 'cbi-button-action' : ''),
				'click': function() {
					state.filter = item[0];
					update();
				}
			}, item[1]);
		})),
		E('span', { 'class': 'lm-toolbar-spacer' }),
		E('button', {
			'class': 'btn',
			'click': function() { refresh(true); },
			'disabled': state.busy ? 'disabled' : null
		}, _('刷新')),
		E('button', {
			'class': 'btn cbi-button-negative',
			'click': cleanExpired,
			'disabled': state.busy ? 'disabled' : null
		}, _('清理过期')),
		E('button', {
			'class': 'btn cbi-button-action',
			'click': restartDnsmasq,
			'disabled': state.busy ? 'disabled' : null
		}, _('重启 dnsmasq'))
	]);
}

function updateTable() {
	var tableRoot = document.getElementById('lm-table-root');
	if (!tableRoot)
		return;
	tableRoot.innerHTML = '';
	tableRoot.appendChild(renderTable());
}

function renderTable() {
	var rows = filteredLeases();
	var tbody = rows.length ? rows.map(function(l) {
		var isStatic = state.staticIps.indexOf(l.ip) !== -1;

		return E('tr', { 'class': l.is_expired ? 'lm-row-expired' : '' }, [
			E('td', { 'class': 'mono' }, l.mac_upper || l.mac || '-'),
			E('td', { 'class': 'mono' }, l.ip || '-'),
			E('td', {}, l.hostname || '-'),
			E('td', {}, [
				l.is_permanent ? E('span', { 'class': 'lm-badge lm-badge-perm' }, _('永久')) :
				l.is_expired ? E('span', { 'class': 'lm-badge lm-badge-exp' }, _('已过期')) :
				E('span', { 'class': 'lm-badge lm-badge-ok' }, _('有效')),
				isStatic ? ' ' + E('span', { 'class': 'lm-badge lm-badge-static' }, _('静态保留')) : ''
			]),
			E('td', {}, l.expiry_text || '-'),
			E('td', {}, l.timestamp_str || '-'),
			E('td', {}, (l.client_id && l.client_id !== '*' && l.client_id !== '-') ? E('code', {}, l.client_id) : '-'),
			E('td', { 'class': 'lm-actions' }, [
				E('button', {
					'class': 'btn cbi-button-negative lm-btn-sm',
					'click': function() { deleteLease(l); },
					'disabled': state.busy ? 'disabled' : null
				}, _('删除'))
			])
		]);
	}) : [
		E('tr', {}, [
			E('td', { 'colspan': 8, 'class': 'lm-empty' }, _('没有匹配的租约记录'))
		])
	];

	return E('div', { 'class': 'lm-table-wrap' }, [
		E('table', { 'class': 'table lm-table' }, [
			E('colgroup', {}, [
				E('col', { 'class': 'mac' }),
				E('col', { 'class': 'ip' }),
				E('col', { 'class': 'host' }),
				E('col', { 'class': 'status' }),
				E('col', { 'class': 'expiry' }),
				E('col', { 'class': 'ts' }),
				E('col', { 'class': 'cid' }),
				E('col', { 'class': 'act' })
			]),
			E('thead', {}, E('tr', {}, [
				E('th', {}, _('MAC 地址')),
				E('th', {}, _('IP 地址')),
				E('th', {}, _('主机名')),
				E('th', {}, _('状态')),
				E('th', {}, _('剩余时间')),
				E('th', {}, _('到期时间')),
				E('th', {}, _('Client ID')),
				E('th', {}, _('操作'))
			])),
			E('tbody', {}, tbody)
		])
	]);
}

function renderLeaseFileInfo() {
	if (!state.leaseFile)
		return E('div', { 'class': 'lm-note' }, _('未找到租约文件（/tmp/dhcp.leases）。'));

	return E('div', { 'class': 'lm-note' }, [
		_('租约文件：'),
		E('code', {}, state.leaseFile),
		' ',
		_('共'),
		' ',
		E('strong', {}, String(state.leases.length)),
		' ',
		_('条记录')
	]);
}

function renderContent(viewRoot) {
	var dark = themeClass(viewRoot);

	return E('div', { 'class': 'lm' + dark }, [
		E('style', {}, [
			'.lm{--lm-panel:#fff;--lm-panel-soft:#f8fafc;--lm-border:#dfe5ec;--lm-text:#344054;--lm-title:#1f1b4d;--lm-muted:#667085;--lm-ok:#137a3a;--lm-ok-bg:#dcfce7;--lm-ok-text:#166534;--lm-warn:#9a3412;--lm-warn-bg:#ffedd5;--lm-warn-text:#92400e;--lm-static:#1d4ed8;--lm-static-bg:#dbeafe;--lm-static-text:#1e40af;--lm-perm:#475467;--lm-perm-bg:#e5e7eb;--lm-perm-text:#374151;--lm-link:#6F67E0;--lm-shadow:0 1px 2px rgba(0,0,0,.04);--lm-danger:#dc2626;--lm-danger-bg:#fee2e2;--lm-danger-text:#b91c1c;max-width:1280px;margin:0 auto;color:var(--lm-text)}' +
			'.lm.lm-dark{--lm-panel:rgba(255,255,255,.18);--lm-panel-soft:rgba(255,255,255,.24);--lm-border:rgba(255,255,255,.16);--lm-text:#e5e7eb;--lm-title:#f4f2ff;--lm-muted:#c2c8d6;--lm-ok:#86efac;--lm-ok-bg:rgba(34,197,94,.28);--lm-ok-text:#dcfce7;--lm-warn:#fdba74;--lm-warn-bg:rgba(249,115,22,.30);--lm-warn-text:#fed7aa;--lm-static:#93c5fd;--lm-static-bg:rgba(59,130,246,.25);--lm-static-text:#bfdbfe;--lm-perm:#d1d5db;--lm-perm-bg:rgba(209,213,219,.22);--lm-perm-text:#f3f4f6;--lm-link:#bba7ff;--lm-shadow:0 8px 20px rgba(0,0,0,.2);--lm-danger:#fca5a5;--lm-danger-bg:rgba(239,68,68,.25);--lm-danger-text:#fecaca}' +
			'.lm-hero{width:100%;margin:0 0 14px}.lm-title{width:100%;box-sizing:border-box;background:var(--lm-panel);border-radius:6px;box-shadow:var(--lm-shadow);padding:14px 18px}.lm-title h2{margin:0;font-size:24px;color:var(--lm-title)}' +
			'.lm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}.lm-card{border:1px solid var(--lm-border);background:var(--lm-panel);border-radius:8px;padding:14px 16px;box-shadow:var(--lm-shadow)}.lm-card-label{color:var(--lm-muted);font-size:12px}.lm-card-value{font-size:24px;font-weight:700;margin-top:6px;color:var(--lm-title)}.lm-card.ok .lm-card-value{color:var(--lm-ok)}.lm-card.warn .lm-card-value{color:var(--lm-warn)}.lm-card.info .lm-card-value{color:var(--lm-static)}' +
			'.lm-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;border:1px solid var(--lm-border);border-radius:8px;background:var(--lm-panel);padding:12px;margin-bottom:12px}.lm-toolbar input{box-sizing:border-box;background:var(--lm-panel)!important;border-color:var(--lm-border)!important;color:var(--lm-text)!important}.lm-toolbar input::placeholder{color:var(--lm-muted)}.lm-search{width:220px;min-width:180px;height:36px}.lm-toolbar-sep{width:1px;height:24px;background:var(--lm-border)}.lm-filters{display:flex;gap:6px;flex-wrap:wrap}.lm-filters .btn:not(.cbi-button-action){background:var(--lm-panel-soft);border-color:var(--lm-border);color:var(--lm-text)}.lm-toolbar-spacer{flex:1}' +
			'.lm-table-wrap{border:1px solid var(--lm-border);border-radius:8px;background:var(--lm-panel);overflow:auto;box-shadow:var(--lm-shadow)}.lm-table{margin:0;min-width:1080px;table-layout:fixed;color:var(--lm-text)}' +
			'.lm-table col.mac{width:170px}.lm-table col.ip{width:130px}.lm-table col.host{width:150px}.lm-table col.status{width:130px}.lm-table col.expiry{width:110px}.lm-table col.ts{width:160px}.lm-table col.cid{width:150px}.lm-table col.act{width:80px}' +
			'.lm-table th{white-space:nowrap;background:var(--lm-panel-soft)!important;text-align:left;color:var(--lm-title);border-color:var(--lm-border)!important}.lm-table td{vertical-align:middle;overflow:hidden;text-overflow:ellipsis;background:var(--lm-panel)!important;color:var(--lm-text);border-color:var(--lm-border)!important}' +
			'.lm-table td:nth-child(1),.lm-table td:nth-child(2),.lm-table td:nth-child(5),.lm-table td:nth-child(6),.lm-table td:nth-child(7){white-space:nowrap}' +
			'.lm-row-expired td{opacity:.6}.lm-row-expired .lm-badge{opacity:1}' +
			'.lm-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;margin-right:4px}.lm-badge-ok{background:var(--lm-ok-bg);color:var(--lm-ok-text)}.lm-badge-exp{background:var(--lm-warn-bg);color:var(--lm-warn-text)}.lm-badge-perm{background:var(--lm-perm-bg);color:var(--lm-perm-text)}.lm-badge-static{background:var(--lm-static-bg);color:var(--lm-static-text)}' +
			'.lm-actions{text-align:center}.lm-btn-sm{min-width:64px;padding:3px 10px;height:auto;font-size:12px}' +
			'.lm-empty{text-align:center;color:var(--lm-muted);padding:28px!important}.lm-note{color:var(--lm-muted);margin:10px 2px;font-size:13px}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
			'.lm-busy{opacity:.5;pointer-events:none}' +
			'@media(max-width:700px){.lm-search{width:100%}.lm-toolbar-sep{display:none}.lm-toolbar-spacer{display:none}.lm-filters{width:100%}}'
		].join('')),
		E('div', { 'class': 'lm-hero' }, [
			E('div', { 'class': 'lm-title' }, [
				E('h2', {}, _('DHCP 租约管理'))
			])
		]),
		renderStats(),
		renderToolbar(),
		renderLeaseFileInfo(),
		E('div', { 'id': 'lm-table-root', 'class': state.busy ? 'lm-busy' : '' }, [
			renderTable()
		]),
		E('div', { 'class': 'lm-note', 'style': 'margin-top:14px' }, [
			_('提示：修改 DHCP 静态分配后，如果客户端仍获取到旧 IP，请删除对应的旧租约记录并重启 dnsmasq，然后在客户端重新连接 WiFi 或执行 ipconfig /renew。')
		])
	]);
}

function update() {
	var root = document.getElementById('lm-view-root');
	if (!root)
		return;
	root.innerHTML = '';
	root.appendChild(renderContent(root));
}

return view.extend({
	load: function() {
		return refresh();
	},

	render: function() {
		var root = E('div', { 'id': 'lm-view-root' });
		update();
		return root;
	},

	handleReset: null,
	handleSaveApply: null,
	handleSave: null
});
