import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('verify-tool-lockdown exits 0', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-tool-lockdown.js')], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.match(result.stdout, /OPUTE_HARNESS_LOCKDOWN_PASS/)
})
