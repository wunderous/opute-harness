import assert from 'node:assert/strict'
import test from 'node:test'
import { bundledVmInventoryApp } from '../../plugin-mcp-opute/src/vm-inventory-app.js'
import {
  callToolResultFromPayload,
  handleMcpAppHostMessage,
  mcpAppFromMeta,
  vmInventoryAppFromMeta,
} from './mcp-app-host.js'

test('sandbox-proxy-ready is answered with the app HTML', () => {
  const replies = handleMcpAppHostMessage(
    { jsonrpc: '2.0', method: 'ui/notifications/sandbox-proxy-ready' },
    { resource: { html: '<main>app</main>', sandbox: 'allow-scripts allow-forms' } },
  )
  assert.equal(replies[0].method, 'ui/notifications/sandbox-resource-ready')
  assert.equal(replies[0].params.html, '<main>app</main>')
})

test('ui/initialize then initialized delivers CallToolResult', () => {
  const init = handleMcpAppHostMessage(
    { jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: { protocolVersion: '2026-01-26' } },
    { resource: { html: '' }, initializeResult: { protocolVersion: '2026-01-26', hostCapabilities: {} } },
  )
  assert.equal(init[0].id, 1)
  assert.equal(init[0].result.protocolVersion, '2026-01-26')

  const vms = [{ name: 'opute-dev-cnpg', status: 'running' }]
  const after = handleMcpAppHostMessage(
    { jsonrpc: '2.0', method: 'ui/notifications/initialized' },
    {
      resource: { html: '' },
      toolInput: {},
      toolResult: callToolResultFromPayload({ vms }, [{ type: 'text', text: JSON.stringify({ vms }) }]),
    },
  )
  assert.equal(after[0].method, 'ui/notifications/tool-input')
  assert.equal(after[1].method, 'ui/notifications/tool-result')
  assert.deepEqual(after[1].params.structuredContent, { vms })
})

test('mcpApp HTML lives on presentation meta, not model text', () => {
  assert.equal(mcpAppFromMeta({ mcpApp: { html: '<html></html>', resourceUri: 'ui://opute/vm-inventory' } }).resourceUri, 'ui://opute/vm-inventory')
  assert.equal(mcpAppFromMeta({}), null)
  assert.equal(mcpAppFromMeta({ mcpApp: { html: '' } }), null)
})

test('VM inventory falls back to bundled MCP App HTML when meta is empty', () => {
  const bundled = bundledVmInventoryApp()
  const fromMeta = vmInventoryAppFromMeta({ mcpApp: { html: '<main>live</main>' } }, bundled)
  assert.equal(fromMeta.html, '<main>live</main>')
  const fallback = vmInventoryAppFromMeta({}, bundled)
  assert.equal(fallback.resourceUri, 'ui://opute/vm-inventory')
  assert.match(fallback.html, /ui\/initialize/)
  assert.match(fallback.html, /class="card"/)
})
