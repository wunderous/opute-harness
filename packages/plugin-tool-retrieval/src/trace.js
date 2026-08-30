import { EMBEDDING_RETRIEVAL_ROOT_LIMIT } from './rank.js'

export const EXECUTION_TRACE_EVENT = 'opute/execution-trace'
export const CONTEXT_PREVIEW_CHARS = 200

function roundScore(score) {
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.round(score * 1000) / 1000
    : score
}

export function namedSizes(entries, previewChars = CONTEXT_PREVIEW_CHARS) {
  if (!Array.isArray(entries)) return []
  return entries.map((entry) => {
    const name = typeof entry?.name === 'string' ? entry.name : ''
    const text = typeof entry?.text === 'string' ? entry.text : ''
    const item = { name, chars: text.length }
    if (text.length > 0) {
      item.preview = text.length > previewChars ? `${text.slice(0, previewChars)}…` : text
    }
    return item
  })
}

/**
 * UI-only assemble diagnostic. Never written back into PromptAssembly sections.
 * Sections/contexts are names + lengths; preview is bounded and expander-only.
 */
export function buildAssembleTrace(input = {}) {
  const query = typeof input.query === 'string' ? input.query : ''
  const catalogCount = Number(input.catalogCount) || 0
  const ranking = input.ranking && typeof input.ranking === 'object' ? input.ranking : {}
  const scores = (Array.isArray(ranking.scores) ? ranking.scores : [])
    .slice(0, EMBEDDING_RETRIEVAL_ROOT_LIMIT)
    .map((entry) => ({
      localToolName: entry.localToolName,
      publicName: entry.publicName,
      score: roundScore(entry.score),
    }))
  const surfaceTools = Array.isArray(ranking.tools)
    ? ranking.tools.map((tool) => tool?.name).filter(Boolean)
    : []
  const sections = namedSizes(input.sections)
  const contexts = namedSizes(input.contexts)
  const rank1 = scores[0]
  return [
    {
      stage: 'retrieval-input',
      label: 'Used last claimed user text as retrieval query',
      detail: query,
      data: { query, catalogCount },
    },
    {
      stage: 'rank-fusion-reranking',
      label: ranking.rankingVersion
        ? `Ranked with ${ranking.rankingVersion}`
        : 'Ranking abstained',
      detail: rank1
        ? `${rank1.publicName} · ${rank1.score}`
        : 'No scored tools',
      data: {
        rankingVersion: ranking.rankingVersion || '',
        candidates: scores,
      },
    },
    {
      stage: 'authorized-tool-selection',
      label: `Exposed ${surfaceTools.length} tools to the model`,
      detail: surfaceTools.join(', '),
      data: {
        surfaceTools,
        catalogCount,
        surfaceCount: surfaceTools.length,
      },
    },
    {
      stage: 'context-injection',
      label: 'Named assemble contexts and sections',
      detail: [
        `${contexts.length} context${contexts.length === 1 ? '' : 's'}`,
        `${sections.length} section${sections.length === 1 ? '' : 's'}`,
      ].join(', '),
      data: { sections, contexts },
    },
  ]
}
