import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogLocalNameFromHarnessTool,
  INVENTORY_SLOT_KEYS,
} from './local-tool-name.js'

test('strips DSH mcp__opute__ and Opute wire prefixes', () => {
  assert.equal(catalogLocalNameFromHarnessTool('list_vms'), 'list_vms')
  assert.equal(
    catalogLocalNameFromHarnessTool('mcp__opute__list_vms'),
    'list_vms',
  )
  assert.equal(
    catalogLocalNameFromHarnessTool('mcp__opute__host__list_vms'),
    'list_vms',
  )
  assert.equal(
    catalogLocalNameFromHarnessTool('mcp__opute__platform__list_managed_vms'),
    'list_managed_vms',
  )
  assert.equal(
    catalogLocalNameFromHarnessTool('mcp__opute__platform__list_managed_clusters'),
    'list_managed_clusters',
  )
  assert.equal(
    catalogLocalNameFromHarnessTool('mcp__he9e864e9__list_vms'),
    'list_vms',
  )
})

test('inventory slot keys cover local, namespaced, and wire forms', () => {
  assert.ok(INVENTORY_SLOT_KEYS.includes('list_vms'))
  assert.ok(INVENTORY_SLOT_KEYS.includes('mcp__opute__host__list_vms'))
  assert.ok(INVENTORY_SLOT_KEYS.includes('mcp__opute__platform__list_managed_vms'))
  assert.ok(INVENTORY_SLOT_KEYS.includes('mcp__opute__platform__list_postgresql_databases'))
})
