import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRequiredMcpCatalog } from './index.js'

test('required MCP mode rejects an empty registered catalog', () => {
  assert.throws(
    () => assertRequiredMcpCatalog({ count: 0 }, 'https://mcp.opute.io/mcp'),
    /requires a non-empty MCP catalog/,
  )
})

test('required MCP mode accepts a non-empty registered catalog', () => {
  assert.doesNotThrow(() => assertRequiredMcpCatalog({ count: 1 }, 'https://mcp.opute.io/mcp'))
})
