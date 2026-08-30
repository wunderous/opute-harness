import { catalogLocalName, isHarnessMcpToolName } from '../../plugin-mcp-opute/src/local-name.js'
import { shouldRegisterCatalogTool } from '../../plugin-mcp-opute/src/surface.js'
import { loadQueryVariants } from './query-variants.js'
import {
  hasRetrievalTokenSequence,
  retrievalSignalTokens,
  retrievalTokens,
} from './retrieval-tokens.js'

/** Same fusion identity as `opute/packages/shared/src/retrieval/evidence-providers.ts`. */
export const TOOL_SELECTION_RANKING_VERSION = 'dense-lexical-rank-fusion-v1'
export const LEXICAL_RERANK_WEIGHT = 0.25
/** Same bound as Platform `DEFAULT_SURFACE_POLICY.limit` / `EMBEDDING_RETRIEVAL_ROOT_LIMIT`. */
export const EMBEDDING_RETRIEVAL_ROOT_LIMIT = 10

const DEFAULT_STATIC_EMBEDDING_DIMENSIONS = 256

function stableTokenHash(token) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Same hash-vector as `defaultStaticToolEmbeddingVector` in tool-embeddings.ts. */
export function defaultStaticToolEmbeddingVector(text) {
  const vector = Array.from({ length: DEFAULT_STATIC_EMBEDDING_DIMENSIONS }, () => 0)
  const tokens = retrievalSignalTokens(retrievalTokens(text))
  for (const token of tokens) {
    vector[stableTokenHash(token) % DEFAULT_STATIC_EMBEDDING_DIMENSIONS] += 1
  }
  for (let index = 1; index < tokens.length; index += 1) {
    const bigram = `${tokens[index - 1]}\u001f${tokens[index]}`
    vector[stableTokenHash(bigram) % DEFAULT_STATIC_EMBEDDING_DIMENSIONS] += 0.5
  }
  if (tokens.length === 0) vector[0] = 1
  return vector
}

export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector.map(() => 0)
  }
  return vector.map((value) => value / magnitude)
}

export function exactCosineSimilarity(left, right) {
  if (left.length !== right.length || left.length === 0) return -1
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
}

function queryTokensFor(query) {
  const tokens = [...new Set(retrievalSignalTokens(retrievalTokens(query)))]
  return { tokens, set: new Set(tokens) }
}

const viewTokenCache = new WeakMap()

function documentTokensForView(view) {
  const cached = viewTokenCache.get(view)
  if (cached) return cached
  const tokens = [...new Set(retrievalSignalTokens(retrievalTokens(view.text)))]
  viewTokenCache.set(view, tokens)
  return tokens
}

function scoreViewsAgainstQueryTokens(queryTokens, views) {
  if (queryTokens.tokens.length === 0) return 0
  let best = 0
  for (const view of views) {
    const documentTokens = documentTokensForView(view)
    let overlap = 0
    for (const token of documentTokens) {
      if (queryTokens.set.has(token)) overlap += 1
    }
    const coverage = overlap / queryTokens.tokens.length
    const precision = overlap / Math.max(1, documentTokens.length)
    const exactSequence = hasRetrievalTokenSequence(documentTokens, queryTokens.tokens)
    best = Math.max(best, exactSequence ? 1 : coverage * 0.75 + precision * 0.25)
  }
  return best
}

export function fuseDenseAndLexicalScores(denseScores, lexicalScores, lexicalWeight = LEXICAL_RERANK_WEIGHT) {
  const lexicalByTool = new Map(lexicalScores.map((entry) => [entry.localToolName, entry.score]))
  return denseScores.map((dense) => ({
    localToolName: dense.localToolName,
    score: dense.score + lexicalWeight * (lexicalByTool.get(dense.localToolName) ?? 0),
  }))
}

export function viewsForCatalogTool(tool, variantsByLocal) {
  const local = catalogLocalName(tool.name)
  const description = typeof tool.description === 'string' ? tool.description : ''
  // Negative-use prose ("do not use for list the vms") must not become a
  // retrieval view; that is why Platform keeps whenNotToUse off the
  // canonical embedding document.
  const purpose = description.split(/\s*When not to use:/i)[0].trim()
  const views = [{
    localToolName: local,
    text: `${local}. ${purpose}`.trim(),
    kind: 'canonical',
  }]
  const fromFile = variantsByLocal.get(local) ?? []
  const examplesSection = description.split(/Examples:/i)[1] || ''
  const fromExamples = [...examplesSection.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  const seen = new Set()
  for (const variant of [...fromFile, ...fromExamples]) {
    if (!variant || seen.has(variant)) continue
    seen.add(variant)
    // Index the variant independently so a short user phrase is not diluted
    // by the capability name — same reason Platform keeps one view per variant.
    views.push({
      localToolName: local,
      text: variant,
      kind: 'enriched',
    })
    views.push({
      localToolName: local,
      text: `${local}: ${variant}`,
      kind: 'enriched',
    })
  }
  return views
}

/**
 * Rank DSH tool schemas with Platform dense+lexical fusion.
 * Rank-1 is advisory order only; the caller keeps toolChoice auto.
 */
export function rankCatalogTools(tools, query, options = {}) {
  const limit = Math.max(1, options.limit ?? EMBEDDING_RETRIEVAL_ROOT_LIMIT)
  const variantsByLocal = options.variantsByLocal
    ?? new Map(Object.entries(options.variants ?? loadQueryVariants()))
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed || !Array.isArray(tools) || tools.length === 0) {
    return { tools: tools ?? [], scores: [], rankingVersion: TOOL_SELECTION_RANKING_VERSION }
  }

  const queryVector = normalizeVector(defaultStaticToolEmbeddingVector(trimmed))
  const queryTokens = queryTokensFor(trimmed)
  const denseScores = []
  const lexicalScores = []

  for (const tool of tools) {
    const local = catalogLocalName(tool.name)
    const views = viewsForCatalogTool(tool, variantsByLocal)
    let dense = -1
    for (const view of views) {
      const viewVector = normalizeVector(defaultStaticToolEmbeddingVector(view.text))
      dense = Math.max(dense, exactCosineSimilarity(queryVector, viewVector))
    }
    denseScores.push({
      localToolName: local,
      publicName: tool.name,
      score: dense,
      tool,
      exactView: views.some((view) => view.text.trim().toLowerCase() === trimmed.toLowerCase()),
    })
    lexicalScores.push({ localToolName: tool.name, score: scoreViewsAgainstQueryTokens(queryTokens, views) })
  }

  const fused = fuseDenseAndLexicalScores(
    denseScores.map((entry) => ({ localToolName: entry.publicName, score: entry.score })),
    lexicalScores,
  )
  const fusedByPublic = new Map(fused.map((entry) => [entry.localToolName, entry.score]))
  // Stopword collapse makes "list the vms" and "list vms" the same hash vector.
  // Prefer an exact document-view phrase (generated queryVariants) on a tie;
  // that is ranking evidence, not a tool-choice command.
  const ranked = [...denseScores]
    .map((entry) => ({
      ...entry,
      score: fusedByPublic.get(entry.publicName) ?? entry.score,
    }))
    .sort((left, right) => right.score - left.score
      || Number(right.exactView) - Number(left.exactView)
      || left.publicName.localeCompare(right.publicName))

  const surface = ranked.slice(0, limit)
  return {
    tools: surface.map((entry) => entry.tool),
    scores: surface.map((entry) => ({
      localToolName: entry.localToolName,
      publicName: entry.publicName,
      score: entry.score,
    })),
    rankingVersion: TOOL_SELECTION_RANKING_VERSION,
  }
}

export function projectRankedSurfaceDetail(tools, query, options = {}) {
  const catalogCount = Array.isArray(tools) ? tools.length : 0
  const mcp = []
  const other = []
  for (const tool of tools ?? []) {
    if (typeof tool?.name !== 'string' || !isHarnessMcpToolName(tool.name)) {
      other.push(tool)
      continue
    }
    if (!shouldRegisterCatalogTool(tool.name)) continue
    mcp.push(tool)
  }
  if (mcp.length === 0) {
    return {
      tools: other,
      ranking: { tools: [], scores: [], rankingVersion: TOOL_SELECTION_RANKING_VERSION },
      catalogCount,
    }
  }
  const ranking = rankCatalogTools(mcp, query, options)
  return {
    tools: [...ranking.tools, ...other],
    ranking,
    catalogCount,
  }
}

export function projectRankedSurface(tools, query, options = {}) {
  return projectRankedSurfaceDetail(tools, query, options).tools
}
