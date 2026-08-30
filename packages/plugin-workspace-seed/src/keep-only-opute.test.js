import assert from 'node:assert/strict'
import test from 'node:test'
import { extraWorkspaceIds } from './keep-only-opute.js'

test('keeps the implicit Opute directory and drops other registry rows', () => {
  assert.deepEqual(
    extraWorkspaceIds([
      { id: 'opute', path: '/home/me/.dsh/opute-workspace', title: 'Opute' },
      { id: 'github', path: '/home/me/github', title: 'github' },
    ], '/home/me/.dsh/opute-workspace'),
    ['github'],
  )
})

test('treats trailing slashes as the same directory', () => {
  assert.deepEqual(
    extraWorkspaceIds(
      [{ id: 'opute', path: '/home/me/.dsh/opute-workspace/' }],
      '/home/me/.dsh/opute-workspace',
    ),
    [],
  )
})
