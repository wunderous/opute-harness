import assert from 'node:assert/strict'
import test from 'node:test'
import { toVmCardModel, vmItemsFromPayload } from './vm-card-model.js'

test('maps managed VM identity onto the Platform card fields', () => {
  const items = vmItemsFromPayload({
    vms: [{
      logicalVmId: 'vm-1',
      name: 'opute-clean-k3s',
      status: 'running',
      hostAgentId: 'host-zephyrus-ef47fbbf',
      providerId: 'incus',
      clusterId: 'cluster-a',
      k3sInstalled: true,
      cpus: 2,
      memory: '2GiB',
      ipv4: ['10.0.0.4'],
    }],
  })
  const card = toVmCardModel(items[0])
  assert.equal(card.name, 'opute-clean-k3s')
  assert.equal(card.status, 'running')
  assert.equal(card.statusVariant, 'secondary')
  assert.equal(card.hostLabel, 'host-zephyrus-ef47fbbf')
  assert.equal(card.providerId, 'incus')
  assert.equal(card.k3sInstalled, true)
  assert.deepEqual(card.ipv4, ['10.0.0.4'])
  assert.equal(card.cardKey, 'vm-1')
})

test('duplicate display names still get distinct card keys', () => {
  const a = toVmCardModel({
    logicalVmId: 'ca941b36-4095-453a-ac7f-db87b5c5d57d',
    name: 'opute-clean-k3s',
    hostAgentId: 'host-zephyrus-ef47fbbf',
  })
  const b = toVmCardModel({
    logicalVmId: '9876bf77-1c4f-4559-b122-7f8b3e94a1f5',
    name: 'opute-clean-k3s',
    hostAgentId: 'agent-cluster-yj5z083j',
  })
  assert.equal(a.name, b.name)
  assert.notEqual(a.cardKey, b.cardKey)
})

test('unwraps nested structuredContent and hostId', () => {
  const items = vmItemsFromPayload({
    structuredContent: {
      instances: [{ name: 'web', status: 'stopped', hostId: 'host-1' }],
    },
  })
  const card = toVmCardModel(items[0])
  assert.equal(card.name, 'web')
  assert.equal(card.hostLabel, 'host-1')
  assert.equal(card.statusVariant, 'outline')
})

test('reads live stats from durable metadata', () => {
  const card = toVmCardModel({
    name: 'opute-clean-k3s',
    status: 'running',
    hostAgentId: 'host-zephyrus-ef47fbbf',
    providerId: 'incus',
    metadata: {
      cpus: 2,
      memory: '2GiB',
      disk: '20GiB',
      ipv4: ['10.10.10.4'],
      k3sInstalled: true,
      agentReady: true,
    },
  })
  assert.equal(card.cpus, 2)
  assert.equal(card.memory, '2GiB')
  assert.equal(card.disk, '20GiB')
  assert.deepEqual(card.ipv4, ['10.10.10.4'])
  assert.equal(card.k3sInstalled, true)
  assert.equal(card.agentReady, true)
})
