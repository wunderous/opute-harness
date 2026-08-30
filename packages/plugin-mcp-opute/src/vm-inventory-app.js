import { MCP_APP_MIME_TYPE } from './protocol.js'

/**
 * Canonical `ui://opute/vm-inventory` MCP App.
 * Keep in sync with opute/packages/shared/src/mcp-app-vm-inventory.ts.
 * Bundled so list_vms / list_managed_vms still host the spec when
 * resources/read fails (timeout, 502, missing resource).
 */
export const VM_INVENTORY_APP_URI = 'ui://opute/vm-inventory'

export const VM_INVENTORY_APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VM inventory</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; background: #161616; color: #e8e8e8; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
    .empty { opacity: 0.7; padding: 12px; }
    .list { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
    .card {
      border: 1px solid #2e2e2e;
      border-radius: 10px;
      background: #1c1c1c;
      padding: 10px 12px;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: capitalize;
      padding: 2px 8px;
      border-radius: 999px;
      background: #393939;
      color: #e8e8e8;
    }
    .badge.running, .badge.ready { background: #0d5c3a; color: #9be7c4; }
    .badge.stopped, .badge.error, .badge.failed { background: #5c2a2a; color: #f0b4b4; }
    .meta {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.72;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }
    .meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  </style>
</head>
<body>
  <div id="root" class="empty">Loading…</div>
  <script>
    (function () {
      var initId = 1
      var ready = false
      var pending = null
      function post(msg) { window.parent.postMessage(msg, '*') }
      function rowsOf(result) {
        var sc = result && result.structuredContent
        var list = sc && (sc.vms || sc.instances || sc.items)
        return Array.isArray(list) ? list : []
      }
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
      }
      function cell(row, keys) {
        var list = Array.isArray(keys) ? keys : [keys]
        for (var i = 0; i < list.length; i++) {
          var value = row && row[list[i]]
          if (value != null && value !== '') return escapeHtml(value)
        }
        return '—'
      }
      function statusClass(status) {
        var value = String(status || '').toLowerCase()
        if (value === 'running' || value === 'ready') return 'badge running'
        if (value === 'stopped' || value === 'error' || value === 'failed') return 'badge stopped'
        return 'badge'
      }
      function render(result) {
        var rows = rowsOf(result)
        var root = document.getElementById('root')
        if (!rows.length) {
          root.className = 'empty'
          root.textContent = 'No VMs'
          return
        }
        var html = '<div class="list">'
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i] || {}
          var status = cell(row, 'status')
          html += '<article class="card"><div class="head"><div class="name">'
            + cell(row, ['name', 'id', 'logicalVmId'])
            + '</div><span class="' + statusClass(row.status) + '">' + status
            + '</span></div><div class="meta"><span>Host '
            + cell(row, ['hostAgentId', 'hostId'])
            + '</span><span>'
            + cell(row, ['clusterId', 'providerId'])
            + '</span></div></article>'
        }
        html += '</div>'
        root.className = ''
        root.innerHTML = html
      }
      window.addEventListener('message', function (event) {
        var data = event.data
        if (!data || data.jsonrpc !== '2.0') return
        if (data.id === initId && data.result) {
          post({ jsonrpc: '2.0', method: 'ui/notifications/initialized' })
          ready = true
          if (pending) render(pending)
          return
        }
        if (data.method === 'ui/notifications/tool-result') {
          if (ready) render(data.params)
          else pending = data.params
        }
      })
      post({
        jsonrpc: '2.0',
        id: initId,
        method: 'ui/initialize',
        params: {
          protocolVersion: '2026-01-26',
          appCapabilities: { availableDisplayModes: ['inline'] },
        },
      })
    })()
  </script>
</body>
</html>
`

export function bundledVmInventoryApp() {
  return {
    resourceUri: VM_INVENTORY_APP_URI,
    html: VM_INVENTORY_APP_HTML,
    mimeType: MCP_APP_MIME_TYPE,
  }
}
