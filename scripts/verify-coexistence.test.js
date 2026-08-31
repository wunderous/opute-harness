import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const platformRoot = path.resolve(root, '..', 'opute')

test('verify-coexistence static checks pass when the sibling Platform checkout is available', {
  skip: !existsSync(platformRoot),
}, () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-coexistence.js')], {
    encoding: 'utf8',
    env: { ...process.env, OPUTE_HARNESS_SKIP_PUBLIC_CURL: '1' },
  })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.match(result.stdout, /OPUTE_HARNESS_COEXISTENCE_PASS/)
})
