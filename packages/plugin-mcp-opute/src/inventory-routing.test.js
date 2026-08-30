import assert from 'node:assert/strict'
import test from 'node:test'
import { compactMcpResult, compactPayload } from './compact-result.js'
import { describeCatalogTool } from './describe-tool.js'
import { catalogLocalName } from './local-name.js'
import { shouldRegisterCatalogTool } from './surface.js'

test('catalogLocalName strips DSH and wire prefixes', () => {
  assert.equal(catalogLocalName('mcp__opute__platform__list_managed_vms'), 'list_managed_vms')
  assert.equal(catalogLocalName('incus__lxc_list'), 'lxc_list')
  assert.equal(catalogLocalName('lxc_list'), 'lxc_list')
  assert.equal(catalogLocalName('aggregator__list_agents'), 'list_agents')
  assert.equal(catalogLocalName('mcp__he9e864e9__list_vms'), 'list_vms')
  assert.equal(catalogLocalName('mcp__he9e864e9__e9e864e9_list_vms'), 'list_vms')
  assert.equal(catalogLocalName('e9e864e9_provision_vm'), 'provision_vm')
})

test('shouldRegisterCatalogTool omits Incus CLI and host-only ops', () => {
  assert.equal(shouldRegisterCatalogTool('lxc_list'), false)
  assert.equal(shouldRegisterCatalogTool('incus__lxc_list'), false)
  assert.equal(shouldRegisterCatalogTool('lxc_info'), false)
  assert.equal(shouldRegisterCatalogTool('diagnose_bridge'), false)
  assert.equal(shouldRegisterCatalogTool('platform__list_managed_vms'), true)
  assert.equal(shouldRegisterCatalogTool('aggregator__list_agents'), true)
  assert.equal(shouldRegisterCatalogTool('host__list_vms'), true)
})

test('describeCatalogTool steers "list the vms" to list_managed_vms', () => {
  const managed = describeCatalogTool('platform__list_managed_vms', 'fallback')
  assert.match(managed, /list the vms/)
  assert.match(managed, /Call with \{\}/)
  const agents = describeCatalogTool('aggregator__list_agents')
  assert.match(agents, /not VM names/)
  const live = describeCatalogTool('host__list_vms')
  assert.match(live, /list_managed_vms/)
})

test('compactPayload strips capability catalogs from list_agents', () => {
  const compacted = compactPayload('list_agents', {
    agents: [
      {
        id: 'host-zephyrus-ef47fbbf',
        name: 'zephyrus',
        type: 'host',
        status: 'connected',
        lastSeen: '2026-08-30T06:27:09.755Z',
        providerId: 'incus',
        capabilities: ['list_vms', 'lxc_list'],
        capabilitySummary: { supportedTools: ['list_vms'] },
        capacity: { cpuCount: 8 },
      },
    ],
  })
  assert.deepEqual(compacted, {
    agents: [
      {
        id: 'host-zephyrus-ef47fbbf',
        name: 'zephyrus',
        type: 'host',
        status: 'connected',
        lastSeen: '2026-08-30T06:27:09.755Z',
        providerId: 'incus',
      },
    ],
  })
})

test('compactMcpResult rewrites list_agents JSON content', () => {
  const result = compactMcpResult('aggregator__list_agents', {
    content: [{
      type: 'text',
      text: JSON.stringify({
        agents: [{ id: 'a', name: 'n', status: 'connected', capabilities: ['x'] }],
      }),
    }],
  })
  const parsed = JSON.parse(result.content[0].text)
  assert.deepEqual(parsed.agents[0], { id: 'a', name: 'n', status: 'connected' })
  assert.equal(parsed.agents[0].capabilities, undefined)
})

test('compactPayload keeps identity fields for list_managed_vms', () => {
  const compacted = compactPayload('list_managed_vms', {
    vms: [
      {
        logicalVmId: 'vm-1',
        name: 'web',
        status: 'running',
        hostAgentId: 'host-zephyrus-ef47fbbf',
        providerId: 'incus',
        clusterId: 'cluster-a',
        capabilities: ['lxc_list'],
        nics: [{ name: 'eth0' }],
      },
    ],
  })
  assert.deepEqual(compacted, {
    vms: [
      {
        logicalVmId: 'vm-1',
        name: 'web',
        status: 'running',
        hostAgentId: 'host-zephyrus-ef47fbbf',
        providerId: 'incus',
        clusterId: 'cluster-a',
      },
    ],
  })
})

test('compactPayload flattens durable VM metadata onto card fields', () => {
  const compacted = compactPayload('list_managed_vms', {
    vms: [
      {
        name: 'opute-clean-k3s',
        status: 'running',
        hostAgentId: 'host-zephyrus-ef47fbbf',
        providerId: 'incus',
        capabilities: ['lxc_list'],
        metadata: {
          cpus: 2,
          memory: '2GiB',
          disk: '20GiB',
          ipv4: ['10.10.10.4'],
          k3sInstalled: true,
        },
      },
    ],
  })
  assert.deepEqual(compacted.vms[0], {
    name: 'opute-clean-k3s',
    status: 'running',
    hostAgentId: 'host-zephyrus-ef47fbbf',
    providerId: 'incus',
    cpus: 2,
    memory: '2GiB',
    disk: '20GiB',
    ipv4: ['10.10.10.4'],
    k3sInstalled: true,
  })
  assert.equal(compacted.vms[0].capabilities, undefined)
  assert.equal(compacted.vms[0].metadata, undefined)
})

test('compactPayload keeps identity fields for list_vms and maps instances', () => {
  const compacted = compactPayload('list_vms', {
    vms: [
      {
        name: 'web',
        status: 'running',
        k3sInstalled: true,
        hostId: 'host-zephyrus-ef47fbbf',
        capabilities: ['lxc_info'],
      },
    ],
  })
  assert.deepEqual(compacted, {
    vms: [
      {
        name: 'web',
        status: 'running',
        k3sInstalled: true,
        hostId: 'host-zephyrus-ef47fbbf',
      },
    ],
  })

  const fromInstances = compactPayload('list_vms', {
    instances: [
      {
        name: 'db',
        status: 'stopped',
        hostId: 'host-zephyrus-ef47fbbf',
        config: { limits: { cpu: 2 } },
      },
    ],
  })
  assert.deepEqual(fromInstances, {
    vms: [
      {
        name: 'db',
        status: 'stopped',
        hostId: 'host-zephyrus-ef47fbbf',
      },
    ],
  })
})
