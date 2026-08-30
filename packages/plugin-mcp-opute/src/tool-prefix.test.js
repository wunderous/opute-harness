import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TOOL_NAME_PREFIX_NAMESPACE,
  catalogNameFromWire,
  hostAgentServerName,
  isPrefixedCatalog,
  toolNamePrefix,
  wireToolName,
} from './tool-prefix.js'

test('toolNamePrefix matches Host Agent golden vector', () => {
  assert.equal(TOOL_NAME_PREFIX_NAMESPACE, '4e03155a-251e-592a-a89b-98a92a34631a')
  assert.equal(toolNamePrefix('host-zephyrus-ef47fbbf'), 'e9e864e9')
  assert.equal(toolNamePrefix('host-zephyrus-ef47fbbf'), toolNamePrefix('host-zephyrus-ef47fbbf'))
  assert.notEqual(toolNamePrefix('host-workstation-e5059700'), 'e9e864e9')
  assert.equal(toolNamePrefix(''), '')
})

test('wire names use a single underscore separator', () => {
  assert.equal(wireToolName('e9e864e9', 'provision_vm'), 'e9e864e9_provision_vm')
  assert.equal(wireToolName('e9e864e9', 'opute.provider.install'), 'e9e864e9_opute.provider.install')
  assert.equal(catalogNameFromWire('e9e864e9', 'e9e864e9_provision_vm'), 'provision_vm')
  assert.equal(catalogNameFromWire('e9e864e9', 'provision_vm'), 'provision_vm')
  assert.equal(hostAgentServerName('e9e864e9'), 'he9e864e9')
  assert.equal(isPrefixedCatalog('e9e864e9', 'e9e864e9_list_vms'), true)
  assert.equal(isPrefixedCatalog('e9e864e9', 'list_vms'), false)
})
