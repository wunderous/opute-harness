import assert from 'node:assert/strict'
import test from 'node:test'
import { describeCatalogTool } from '../../plugin-mcp-opute/src/describe-tool.js'
import { loadQueryVariants } from './query-variants.js'
import {
  EMBEDDING_RETRIEVAL_ROOT_LIMIT,
  projectRankedSurface,
  rankCatalogTools,
  TOOL_SELECTION_RANKING_VERSION,
} from './rank.js'

function tool(name, fallback) {
  return { name, description: describeCatalogTool(name, fallback) }
}

const catalog = [
  tool('mcp__opute__lxc_list', 'List Incus CLI instances on one host. Requires hostId. Not VM inventory.'),
  tool('mcp__opute__aggregator__list_agents', 'List connected host agents and heartbeat status. Returns host connectivity, not VM names.'),
  tool('mcp__opute__host__list_vms', 'List live Incus VMs on one already selected host.'),
  tool('mcp__opute__platform__list_managed_vms', 'List all durable virtual machines known to Opute. Call with {}.'),
  tool('mcp__opute__platform__list_managed_clusters', 'List durable managed Kubernetes clusters.'),
  tool('mcp__opute__platform__list_postgresql_databases', 'List PostgreSQL databases.'),
  tool('mcp__opute__get_vm_info', 'Get details for one named Incus instance.'),
  tool('mcp__opute__create_vm', 'Provision a new virtual machine.'),
  tool('mcp__opute__delete_vm', 'Delete a virtual machine.'),
  tool('mcp__opute__start_vm', 'Start a virtual machine.'),
  tool('mcp__opute__stop_vm', 'Stop a virtual machine.'),
  tool('mcp__opute__diagnose_bridge', 'Diagnose the host agent bridge.'),
]

test('ranking version matches Platform fusion identity', () => {
  assert.equal(TOOL_SELECTION_RANKING_VERSION, 'dense-lexical-rank-fusion-v1')
  assert.equal(EMBEDDING_RETRIEVAL_ROOT_LIMIT, 10)
})

test('loads Platform query variants including "list the vms"', () => {
  const variants = loadQueryVariants()
  assert.ok(Array.isArray(variants.list_managed_vms))
  assert.ok(variants.list_managed_vms.includes('list the vms'))
})

test('"list the vms" surfaces list_managed_vms first, not lxc_list or list_agents', () => {
  const ranked = rankCatalogTools(catalog, 'list the vms')
  assert.equal(
    ranked.tools[0].name,
    'mcp__opute__platform__list_managed_vms',
    JSON.stringify(ranked.scores.slice(0, 5), null, 2),
  )
  const names = ranked.tools.map((entry) => entry.name)
  const agentsAt = names.indexOf('mcp__opute__aggregator__list_agents')
  if (agentsAt >= 0) {
    assert.ok(names.indexOf('mcp__opute__platform__list_managed_vms') < agentsAt)
  }
  assert.ok(ranked.tools.length <= EMBEDDING_RETRIEVAL_ROOT_LIMIT)
})

test('projectRankedSurface keeps the bounded mcp set in rank order', () => {
  const projected = projectRankedSurface(catalog, 'list the vms')
  assert.equal(projected[0].name, 'mcp__opute__platform__list_managed_vms')
  assert.ok(projected.length <= EMBEDDING_RETRIEVAL_ROOT_LIMIT)
  assert.ok(!projected.some((entry) => entry.name.includes('lxc_list')))
  assert.ok(!projected.some((entry) => entry.name.includes('diagnose_bridge')))
})

test('empty query leaves the catalog untouched', () => {
  const ranked = rankCatalogTools(catalog, '   ')
  assert.equal(ranked.tools.length, catalog.length)
})
