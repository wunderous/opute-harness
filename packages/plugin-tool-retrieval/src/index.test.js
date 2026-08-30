import assert from 'node:assert/strict'
import test from 'node:test'
import { textFromUserMessage } from './query.js'
import { apply } from './index.js'
import { describeCatalogTool } from '../../plugin-mcp-opute/src/describe-tool.js'
import { EMBEDDING_RETRIEVAL_ROOT_LIMIT } from './rank.js'

test('textFromUserMessage ignores tool-result turns', () => {
  assert.equal(textFromUserMessage({
    source: { kind: 'tool' },
    content: [{ type: 'text', text: 'not a user query' }],
  }), '')
  assert.equal(textFromUserMessage({
    content: [{ type: 'text', text: 'list the vms' }],
  }), 'list the vms')
})

test('assemble projects the ranked surface after inbox claim', async () => {
  const appended = []
  const agent = {
    session: {
      append(type, data) {
        appended.push({ type, data })
      },
    },
  }
  let claimed
  let assemble
  const ctx = {
    logger: { info() {}, warn() {} },
    on(name, handler, options) {
      if (name === 'agent/inbox/claimed') claimed = handler
      if (name === 'system-prompt/assemble') {
        assert.equal(options?.prepend, true)
        assemble = handler
      }
    },
  }
  apply(ctx)
  claimed({ agent, message: { content: [{ type: 'text', text: 'list the vms' }] }, turn: 3 })
  const catalog = [
    { name: 'mcp__opute__lxc_list', description: describeCatalogTool('mcp__opute__lxc_list', 'Incus CLI list.') },
    { name: 'mcp__opute__aggregator__list_agents', description: describeCatalogTool('mcp__opute__aggregator__list_agents', 'Host agents.') },
    { name: 'mcp__opute__platform__list_managed_vms', description: describeCatalogTool('mcp__opute__platform__list_managed_vms', 'Durable VMs.') },
    { name: 'mcp__opute__host__list_vms', description: describeCatalogTool('mcp__opute__host__list_vms', 'Live VMs.') },
    { name: 'mcp__opute__create_vm', description: 'Create a VM.' },
    { name: 'mcp__opute__delete_vm', description: 'Delete a VM.' },
    { name: 'mcp__opute__start_vm', description: 'Start a VM.' },
    { name: 'mcp__opute__stop_vm', description: 'Stop a VM.' },
    { name: 'mcp__opute__get_vm_info', description: 'One VM details.' },
    { name: 'mcp__opute__diagnose_bridge', description: 'Bridge diagnostics.' },
    { name: 'mcp__opute__list_pods', description: 'List Kubernetes pods.' },
    { name: 'mcp__opute__list_namespaces', description: 'List Kubernetes namespaces.' },
  ]
  const persona = { name: 'deployment:persona', text: '' }
  const assembled = await assemble({}, { agent }, async () => ({
    sections: [persona],
    contexts: [],
    tools: catalog,
    variables: {},
  }))
  assert.equal(assembled.tools[0].name, 'mcp__opute__platform__list_managed_vms')
  assert.ok(assembled.tools.length <= EMBEDDING_RETRIEVAL_ROOT_LIMIT)
  assert.ok(!assembled.tools.some((tool) => tool.name.includes('lxc_list')))
  assert.equal(assembled.sections[0].text, persona.text)
  assert.equal(appended.length, 4)
  assert.equal(appended[0].type, 'opute/execution-trace')
  assert.equal(appended[0].data.turn, 3)
  assert.equal(appended[0].data.events[0].stage, 'retrieval-input')
  assert.equal(appended[0].data.events[0].data.query, 'list the vms')
  assert.equal(appended[1].data.events[0].stage, 'rank-fusion-reranking')
  assert.equal(
    appended[1].data.events[0].data.candidates[0].publicName,
    'mcp__opute__platform__list_managed_vms',
  )
  assert.equal(appended[2].data.events[0].stage, 'authorized-tool-selection')
  assert.equal(appended[3].data.events[0].stage, 'context-injection')

  const viaScope = await assemble({}, { scope: agent }, async () => ({
    sections: [persona],
    contexts: [],
    tools: catalog,
    variables: {},
  }))
  assert.equal(viaScope.tools[0].name, 'mcp__opute__platform__list_managed_vms')
  assert.equal(viaScope.sections[0].text, persona.text)
})

test('assemble without a claimed query does not shrink the catalog', async () => {
  let assemble
  apply({
    logger: { info() {}, warn() {} },
    on(name, handler) {
      if (name === 'system-prompt/assemble') assemble = handler
    },
  })
  const tools = [
    { name: 'mcp__opute__lxc_list', description: 'CLI' },
    { name: 'mcp__opute__platform__list_managed_vms', description: 'VMs' },
  ]
  const assembled = await assemble({}, {}, async () => ({ tools }))
  assert.equal(assembled.tools.length, 2)
})
