import assert from 'node:assert/strict'
import test from 'node:test'
import { oputeWorkspaceDir } from './workspace-dir.js'

test('explicit OPUTE_HARNESS_WORKSPACE_DIR wins', () => {
  assert.equal(oputeWorkspaceDir({ OPUTE_HARNESS_WORKSPACE_DIR: '/tmp/cell' }), '/tmp/cell')
})

test('defaults under DSH_HOME', () => {
  const dir = oputeWorkspaceDir({ DSH_HOME: '/home/me/.dsh', HOME: '/home/me' })
  assert.equal(dir, '/home/me/.dsh/opute-workspace')
})
