import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEFAULT_GENERATED_DOCUMENTS_PATH,
  parseToolRetrievalDocumentsSource,
} from './query-variants.js'

test('parse skips a TypeScript generic and reads the assignment object', () => {
  const source = `
/** Generated. */
import type { ToolRetrievalDocumentEnrichment } from '../retrieval/tool-document-enrichment'

export const TOOL_RETRIEVAL_DOCUMENTS: Readonly<Record<string, ToolRetrievalDocumentEnrichment>> = {
  "list_managed_vms": {
    "queryVariants": ["list the vms"]
  }
}
`
  const variants = parseToolRetrievalDocumentsSource(source)
  assert.deepEqual(variants.list_managed_vms, ['list the vms'])
})

test('parse fails open when the assignment object is not JSON', () => {
  const source = 'export const DOCS: Record<string, { x: 1 }> = { notJson: undefined }'
  assert.deepEqual(parseToolRetrievalDocumentsSource(source), {})
})

test('sibling generated documents include "list the vms" when present', () => {
  if (!existsSync(DEFAULT_GENERATED_DOCUMENTS_PATH)) {
    return
  }
  const variants = parseToolRetrievalDocumentsSource(
    readFileSync(DEFAULT_GENERATED_DOCUMENTS_PATH, 'utf8'),
  )
  assert.ok(Array.isArray(variants.list_managed_vms))
  assert.ok(variants.list_managed_vms.includes('list the vms'))
})
