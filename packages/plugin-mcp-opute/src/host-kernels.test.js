import assert from 'node:assert/strict'
import test from 'node:test'
import { attachHostAgentKernels } from './host-kernels.js'
import { publicToolName } from './public-name.js'

function jsonResponse(result) {
  return {
    ok: true,
    async json() {
      return { jsonrpc: '2.0', id: '1', result }
    },
  }
}

test('attaches a prefix-on kernel as mcp__h{prefix}__*', async () => {
  const registered = []
  const ctx = {
    logger: { warn() {}, info() {}, error() {} },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
  }
  const agentId = 'host-zephyrus-ef47fbbf'
  const prefix = 'e9e864e9'
  const result = await attachHostAgentKernels(ctx, {
    kernels: [{
      agentId,
      url: 'http://127.0.0.1:3004/mcp',
      token: 'oha_test-token',
    }],
    async fetch(url, init) {
      if (String(url).endsWith('/health') && (!init || init.method === 'GET')) {
        return { ok: true, async json() { return { ok: true, agentId, mcpToolNamePrefix: prefix } } }
      }
      const body = JSON.parse(init.body)
      if (body.method === 'tools/list') {
        return jsonResponse({
          tools: [
            { name: `${prefix}_list_vms`, description: 'Live VMs', inputSchema: { type: 'object' } },
            { name: `${prefix}_diagnose_bridge`, description: 'Diagnose', inputSchema: { type: 'object' } },
            { name: 'provision_vm', description: 'unprefixed leak', inputSchema: { type: 'object' } },
          ],
        })
      }
      throw new Error(`unexpected ${body.method}`)
    },
  })
  assert.equal(result.attached, 1)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, publicToolName('list_vms', `h${prefix}`))
  assert.equal(registered[0].name, 'mcp__he9e864e9__list_vms')
})

test('skips kernels that still advertise unprefixed tools/list', async () => {
  const ctx = {
    logger: { warn() {}, info() {}, error() {} },
    tools: { register() { return () => {} } },
  }
  const result = await attachHostAgentKernels(ctx, {
    kernels: [{
      agentId: 'host-zephyrus-ef47fbbf',
      url: 'http://127.0.0.1:3004/mcp',
      token: 'oha_test-token',
    }],
    async fetch(url, init) {
      if (String(url).endsWith('/health')) {
        return { ok: true, async json() { return { ok: true, agentId: 'host-zephyrus-ef47fbbf' } } }
      }
      return jsonResponse({ tools: [{ name: 'list_vms', inputSchema: { type: 'object' } }] })
    },
  })
  assert.equal(result.attached, 0)
  assert.equal(result.skipped[0].reason, 'unprefixed-catalog')
})
