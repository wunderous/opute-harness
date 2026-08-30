import assert from 'node:assert/strict'
import test from 'node:test'
import { describeCatalogTool } from '../../plugin-mcp-opute/src/describe-tool.js'
import { buildAssembleTrace, namedSizes } from './trace.js'
import { projectRankedSurfaceDetail } from './rank.js'

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

test('namedSizes keeps names and lengths, not full prompt text', () => {
  const long = 'x'.repeat(250)
  const sizes = namedSizes([{ name: 'deployment:persona', text: long }])
  assert.equal(sizes[0].name, 'deployment:persona')
  assert.equal(sizes[0].chars, 250)
  assert.ok(sizes[0].preview.endsWith('…'))
  assert.ok(sizes[0].preview.length < 250)
  assert.ok(!JSON.stringify(sizes).includes(long))
})

test('"list the vms" assemble trace ranks list_managed_vms and reports section sizes', () => {
  const detail = projectRankedSurfaceDetail(catalog, 'list the vms')
  const events = buildAssembleTrace({
    query: 'list the vms',
    catalogCount: detail.catalogCount,
    ranking: detail.ranking,
    sections: [{ name: 'deployment:persona', text: '' }],
    contexts: [{ name: 'runtime:snapshot', text: 'Current runtime context.' }],
  })
  assert.equal(detail.ranking.tools[0].name, 'mcp__opute__platform__list_managed_vms')
  assert.ok(detail.catalogCount > detail.ranking.tools.length)

  assert.equal(events[0].stage, 'retrieval-input')
  assert.equal(events[0].data.query, 'list the vms')
  assert.equal(events[1].stage, 'rank-fusion-reranking')
  assert.equal(events[1].data.candidates[0].publicName, 'mcp__opute__platform__list_managed_vms')
  assert.equal(events[2].stage, 'authorized-tool-selection')
  assert.ok(events[2].data.catalogCount > events[2].data.surfaceCount)
  assert.equal(events[3].stage, 'context-injection')
  assert.deepEqual(events[3].data.sections.map((entry) => ({ name: entry.name, chars: entry.chars })), [
    { name: 'deployment:persona', chars: 0 },
  ])
  assert.equal(events[3].data.sections[0].text, undefined)
})
