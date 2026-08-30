import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_GENERATED_DOCUMENTS_PATH = path.resolve(
  here,
  '../../../../opute/packages/shared/src/generated/tool-retrieval-documents.ts',
)

function bundledVariants() {
  const bundled = path.join(here, 'query-variants.json')
  if (!existsSync(bundled)) return {}
  return JSON.parse(readFileSync(bundled, 'utf8'))
}

/**
 * The generated documents file is a TS export of one JSON object. Parse from
 * the assignment `= {`, not the first `{` — that brace is the TypeScript
 * `Record<string, …>` generic. Fail open to `{}` so ranking keeps the bundled
 * JSON. Do not regex-match inner `"generator": {` blocks as tool names.
 */
export function parseToolRetrievalDocumentsSource(source) {
  const assign = source.search(/=\s*\{/)
  if (assign < 0) return {}
  const start = source.indexOf('{', assign)
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try {
    const parsed = JSON.parse(source.slice(start, end + 1))
    const variants = {}
    for (const [name, entry] of Object.entries(parsed)) {
      if (!entry || !Array.isArray(entry.queryVariants)) continue
      const cleaned = entry.queryVariants.filter((variant) => typeof variant === 'string')
      if (cleaned.length > 0) variants[name] = cleaned
    }
    return variants
  } catch {
    return {}
  }
}

export function loadQueryVariants(options = {}) {
  const bundled = bundledVariants()
  const generated = options.generatedPath || DEFAULT_GENERATED_DOCUMENTS_PATH
  if (!existsSync(generated)) return bundled
  return { ...bundled, ...parseToolRetrievalDocumentsSource(readFileSync(generated, 'utf8')) }
}
