import assert from 'node:assert/strict'
import test from 'node:test'
import { isRunningToolBlock, parsePayload, rowsFromPayload } from './inventory-payload.js'

const vms = [
  { name: 'opute-dev-cnpg', status: 'running' },
  { name: 'opute-clean-k3s', status: 'running' },
]

test('reads DSH ToolResultNode content blocks, not output', () => {
  const payload = parsePayload({
    kind: 'tool-result',
    content: [{ type: 'text', text: JSON.stringify({ vms }) }],
  })
  assert.deepEqual(rowsFromPayload(payload), [
    'opute-dev-cnpg · running',
    'opute-clean-k3s · running',
  ])
})

test('unwraps the MCP execute envelope { content, structuredContent }', () => {
  const payload = parsePayload({
    kind: 'tool-result',
    content: [{
      type: 'text',
      text: JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({ vms }) }],
        structuredContent: { vms },
      }),
    }],
  })
  assert.deepEqual(rowsFromPayload(payload).length, 2)
})

test('does not treat a settled result as empty when output is absent', () => {
  const payload = parsePayload({
    kind: 'tool-result',
    call: { name: 'mcp__opute__platform__list_managed_vms', argsRaw: '{}' },
    content: [{ type: 'text', text: JSON.stringify({ vms }) }],
  })
  assert.notEqual(payload, null)
  assert.ok(rowsFromPayload(payload).length > 0)
})

test('running call has no content yet', () => {
  assert.equal(isRunningToolBlock({
    callId: 'c1',
    name: 'mcp__opute__platform__list_managed_vms',
    argsRaw: '{}',
    turn: 1,
    step: 1,
    time: 1,
    subCalls: [],
  }), true)
  assert.equal(isRunningToolBlock({
    kind: 'tool-result',
    content: [{ type: 'text', text: '{}' }],
  }), false)
})

test('settled nodes are identified by kind, matching DSH toolRowModel', () => {
  assert.equal(isRunningToolBlock({
    kind: 'tool-result',
    callId: 'c1',
    content: [],
  }), false)
})
