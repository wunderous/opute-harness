import assert from 'node:assert/strict'
import test from 'node:test'
import { publicToolName } from './public-name.js'

test('qualifies wire names under mcp__opute__', () => {
  assert.equal(publicToolName('host__list_vms'), 'mcp__opute__host__list_vms')
  assert.equal(
    publicToolName('platform__list_managed_vms'),
    'mcp__opute__platform__list_managed_vms',
  )
})
