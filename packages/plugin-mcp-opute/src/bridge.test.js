import assert from 'node:assert/strict'
import test from 'node:test'
import { callOputeMcpTool, listOputeMcpTools, registerOputeMcpTools } from './bridge.js'

function jsonResponse(result) {
  return {
    ok: true,
    async json() {
      return { jsonrpc: '2.0', id: '1', result }
    },
  }
}

test('lists tools without sending initialize', async () => {
  const methods = []
  const tools = await listOputeMcpTools({
    mcpUrl: 'http://127.0.0.1:9/mcp',
    token: 't',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      methods.push(body.method)
      return jsonResponse({
        tools: [{ name: 'platform__list_managed_vms', description: 'Durable VMs', inputSchema: { type: 'object' } }],
      })
    },
  })
  assert.deepEqual(methods, ['tools/list'])
  assert.equal(tools[0].name, 'platform__list_managed_vms')
})

test('polls tasks/get when tools/call returns a working task', async () => {
  const methods = []
  let gets = 0
  const result = await callOputeMcpTool({
    mcpUrl: 'http://127.0.0.1:9/mcp',
    token: 't',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      methods.push(body.method)
      if (body.method === 'tools/call') {
        return jsonResponse({
          resultType: 'task',
          taskId: 'task-1',
          status: 'working',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          ttlMs: 60_000,
          pollIntervalMs: 1,
        })
      }
      gets += 1
      if (gets === 1) {
        return jsonResponse({
          resultType: 'complete',
          taskId: 'task-1',
          status: 'working',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          ttlMs: 60_000,
          pollIntervalMs: 1,
        })
      }
      return jsonResponse({
        resultType: 'complete',
        taskId: 'task-1',
        status: 'completed',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        ttlMs: 60_000,
        result: {
          content: [{ type: 'text', text: '{"vms":[{"name":"real-vm"}]}' }],
        },
      })
    },
  }, 'host__list_vms', {})
  assert.ok(methods.includes('tools/call'))
  assert.ok(methods.includes('tasks/get'))
  assert.ok(!methods.includes('initialize'))
  assert.equal(result.content[0].text, '{"vms":[{"name":"real-vm"}]}')
})

test('registers mcp__opute__* names on the DSH tool runtime', async () => {
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
  const { count, omitted } = await registerOputeMcpTools(ctx, {
    mcpUrl: 'http://127.0.0.1:9/mcp',
    async fetch() {
      return jsonResponse({
        tools: [
          { name: 'lxc_list', description: 'List LXC', inputSchema: { type: 'object' } },
          { name: 'incus__lxc_list', description: 'List Incus', inputSchema: { type: 'object' } },
          { name: 'diagnose_bridge', description: 'Diagnose', inputSchema: { type: 'object' } },
          { name: 'aggregator__list_agents', description: 'Host agents', inputSchema: { type: 'object' } },
          { name: 'host__list_vms', description: 'Live VMs', inputSchema: { type: 'object' } },
          { name: 'platform__list_managed_vms', description: 'Managed VMs', inputSchema: { type: 'object' } },
        ],
      })
    },
  })
  assert.equal(count, 3)
  assert.equal(omitted, 3)
  assert.deepEqual(registered.map((definition) => definition.name), [
    'mcp__opute__aggregator__list_agents',
    'mcp__opute__host__list_vms',
    'mcp__opute__platform__list_managed_vms',
  ])
  const agents = registered.find((definition) => definition.name === 'mcp__opute__aggregator__list_agents')
  assert.match(agents.description, /Call the exact tool name mcp__opute__aggregator__list_agents/)
  assert.match(agents.description, /using the exact model-facing tool name mcp__opute__aggregator__list_agents/)
  const managed = registered.find((definition) => definition.name === 'mcp__opute__platform__list_managed_vms')
  assert.match(managed.description, /list the vms/)
  assert.match(managed.description, /Call with \{\}/)
})

test('projects undeclared arguments from strict MCP object schemas', async () => {
  const calls = []
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
  await registerOputeMcpTools(ctx, {
    mcpUrl: 'http://127.0.0.1:9/mcp',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      calls.push(body)
      if (body.method === 'tools/list') {
        return jsonResponse({
          tools: [{
            name: 'platform__list_managed_vms',
            description: 'Managed VMs',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          }],
        })
      }
      return jsonResponse({ content: [{ type: 'text', text: '{"vms":[]}' }] })
    },
  })

  await registered[0].execute({ hostId: null, ignored: true })
  const toolCall = calls.find((call) => call.method === 'tools/call')
  assert.deepEqual(toolCall.params.arguments, {})
})

test('prefetches MCP App HTML into presentationMeta, not execute content', async () => {
  const registered = []
  const methods = []
  const ctx = {
    logger: { warn() {}, info() {}, error() {} },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
  }
  await registerOputeMcpTools(ctx, {
    mcpUrl: 'http://127.0.0.1:9/mcp',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      methods.push(body.method)
      if (body.method === 'tools/list') {
        return jsonResponse({
          tools: [{
            name: 'host__list_vms',
            description: 'Live VMs',
            inputSchema: { type: 'object' },
            _meta: { ui: { resourceUri: 'ui://opute/vm-inventory', visibility: ['model', 'app'] } },
          }],
        })
      }
      if (body.method === 'resources/read') {
        assert.equal(body.params.uri, 'ui://opute/vm-inventory')
        return jsonResponse({
          contents: [{
            uri: 'ui://opute/vm-inventory',
            mimeType: 'text/html;profile=mcp-app',
            text: '<!DOCTYPE html><html><body>ui/initialize</body></html>',
          }],
        })
      }
      return jsonResponse({
        content: [{ type: 'text', text: JSON.stringify({ vms: [{ name: 'a', status: 'running' }] }) }],
        structuredContent: { vms: [{ name: 'a', status: 'running' }] },
      })
    },
  })
  assert.ok(methods.includes('resources/read'))
  assert.ok(!methods.includes('initialize'))
  const meta = registered[0].output.presentationMeta({}, { content: [{ type: 'text', text: '{}' }] })
  assert.equal(meta.mcpApp.resourceUri, 'ui://opute/vm-inventory')
  assert.match(meta.mcpApp.html, /ui\/initialize/)
  const value = await registered[0].execute({})
  assert.equal(JSON.stringify(value).includes('<!DOCTYPE'), false)
  const rendered = registered[0].output.render({}, value)
  assert.equal(rendered[0].text.includes('<!DOCTYPE'), false)
})

test('bundles vm-inventory MCP App HTML when resources/read fails', async () => {
  const registered = []
  const warnings = []
  const ctx = {
    logger: { warn(message) { warnings.push(String(message)) }, info() {}, error() {} },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
  }
  await registerOputeMcpTools(ctx, {
    mcpUrl: 'http://127.0.0.1:9/mcp',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      if (body.method === 'tools/list') {
        return jsonResponse({
          tools: [{
            name: 'platform__list_managed_vms',
            description: 'Managed VMs',
            inputSchema: { type: 'object' },
          }],
        })
      }
      if (body.method === 'resources/read') {
        throw new Error('502 Bad Gateway')
      }
      return jsonResponse({ content: [{ type: 'text', text: '{}' }] })
    },
  })
  const meta = registered[0].output.presentationMeta({}, { content: [{ type: 'text', text: '{}' }] })
  assert.equal(meta.mcpApp.resourceUri, 'ui://opute/vm-inventory')
  assert.match(meta.mcpApp.html, /ui\/initialize/)
  assert.match(meta.mcpApp.html, /class="card"/)
  assert.match(warnings.join('\n'), /resources\/read ui:\/\/opute\/vm-inventory failed/)
})

test('execute compacts list_agents observations before the next turn', async () => {
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
  await registerOputeMcpTools(ctx, {
    mcpUrl: 'http://127.0.0.1:9/mcp',
    async fetch(_url, init) {
      const body = JSON.parse(init.body)
      if (body.method === 'tools/list') {
        return jsonResponse({
          tools: [{ name: 'aggregator__list_agents', description: 'Agents', inputSchema: { type: 'object' } }],
        })
      }
      return jsonResponse({
        content: [{
          type: 'text',
          text: JSON.stringify({
            agents: [{
              id: 'host-1',
              name: 'zephyrus',
              status: 'connected',
              capabilities: ['list_vms', 'lxc_list'],
            }],
          }),
        }],
      })
    },
  })
  const value = await registered[0].execute({})
  const parsed = JSON.parse(value.content[0].text)
  assert.deepEqual(parsed.agents[0], { id: 'host-1', name: 'zephyrus', status: 'connected' })
})
