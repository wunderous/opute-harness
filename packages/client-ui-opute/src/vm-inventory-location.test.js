import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OPUTE_VM_INVENTORY_KIND,
  oputeVmInventoryLocationData,
} from './vm-inventory-location.js'

test('location data key equals the conversation Definition kind', () => {
  const data = oputeVmInventoryLocationData({
    turn: 1,
    vms: [{ name: 'opute-clean-k3s' }],
  })
  assert.equal(data.key, OPUTE_VM_INVENTORY_KIND)
  assert.equal(data.key, 'opute-vm-inventory')
  assert.equal(data.kind, 'turn')
  assert.equal(data.turn, 1)
})

test('publishes nothing until at least one VM row exists', () => {
  assert.equal(oputeVmInventoryLocationData({ turn: 1, vms: [] }), null)
})
