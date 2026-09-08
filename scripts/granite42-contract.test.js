import assert from 'node:assert/strict'
import test from 'node:test'

import { GRANITE42_SURFACES, resolveGranite42Surface } from './granite42-contract.js'

test('Granite 4.2 acceptance defaults to the public DSH namespace', () => {
  assert.deepEqual(resolveGranite42Surface(), {
    name: 'public',
    ...GRANITE42_SURFACES.public,
  })
})

test('Granite 4.2 acceptance has an explicit local Bridge surface', () => {
  assert.deepEqual(resolveGranite42Surface('local-bridge'), {
    name: 'local-bridge',
    expectedTool: 'mcp__opute__list_managed_vms',
    promptTool: 'mcp__opute__list_managed_vms',
  })
})

test('Granite 4.2 acceptance rejects an unregistered surface', () => {
  assert.throws(
    () => resolveGranite42Surface('arbitrary'),
    /HARNESS_GRANITE42_SURFACE must be one of: public, local-bridge/,
  )
})
