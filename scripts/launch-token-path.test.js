import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLaunchTokenFile } from './launch-token-path.js'

test('resolves the default launch token under the home directory', () => {
  assert.equal(
    resolveLaunchTokenFile(undefined, '/home/tester'),
    '/home/tester/.config/opute/harness-opute-dsh.launch-token',
  )
})

test('expands shell and systemd home path forms', () => {
  assert.equal(resolveLaunchTokenFile('~/.config/opute/token', '/home/tester'), '/home/tester/.config/opute/token')
  assert.equal(resolveLaunchTokenFile('%h/.config/opute/token', '/home/tester'), '/home/tester/.config/opute/token')
})

test('keeps explicit absolute and relative paths unchanged', () => {
  assert.equal(resolveLaunchTokenFile('/var/lib/opute/token', '/home/tester'), '/var/lib/opute/token')
  assert.equal(resolveLaunchTokenFile('tmp/token', '/home/tester'), 'tmp/token')
})
