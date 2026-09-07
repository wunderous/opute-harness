import { createQueryStore } from './query.js'
import { registerOputeTraceProjection } from './projection.js'
import {
  EMBEDDING_RETRIEVAL_ROOT_LIMIT,
  projectRankedSurfaceDetail,
  TOOL_SELECTION_RANKING_VERSION,
} from './rank.js'
import { buildAssembleTrace, EXECUTION_TRACE_EVENT } from './trace.js'

export const name = 'opute-tool-retrieval'
export const inject = ['systemPrompt']

export { rankCatalogTools, projectRankedSurface, projectRankedSurfaceDetail, TOOL_SELECTION_RANKING_VERSION } from './rank.js'
export { buildAssembleTrace, EXECUTION_TRACE_EVENT } from './trace.js'
export { applyOputeTrace, oputeTraceDefinition, OPUTE_TRACE_KEY } from './projection.js'

/**
 * Keep the normal ten-tool surface, with a smaller operator-selected bound
 * for constrained validation models. Values outside the ranked bound fail
 * closed instead of silently restoring the full catalog.
 */
export function resolveToolSurfaceLimit(value = process.env.OPUTE_HARNESS_TOOL_LIMIT) {
  if (value === undefined || value.trim() === '') return EMBEDDING_RETRIEVAL_ROOT_LIMIT
  const limit = Number(value)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > EMBEDDING_RETRIEVAL_ROOT_LIMIT) {
    throw new Error(
      `OPUTE_HARNESS_TOOL_LIMIT must be an integer from 1 to ${EMBEDDING_RETRIEVAL_ROOT_LIMIT}`,
    )
  }
  return limit
}

function emitAssembleTrace(ctx, agent, store, payload) {
  const session = agent?.session
  if (!session || typeof session.append !== 'function') return
  const turn = store.turnFor(agent)
  // One log-only append per stage so Trajectory can identity each row by seq.
  // A single blob collapses to one context node (previewContent is first block).
  for (const event of buildAssembleTrace(payload)) {
    try {
      session.append(EXECUTION_TRACE_EVENT, { turn, events: [event] })
    } catch (error) {
      ctx.logger?.warn?.(`opute-tool-retrieval: execution-trace append failed: ${String(error)}`)
      break
    }
  }
}

/**
 * DSH analog of Platform dense+lexical retrieval.
 *
 * The agent loop claims inbox messages, then assembles the prompt, then runs
 * `agent/pre-step`. Capture the query on `agent/inbox/claimed` so assemble
 * can project a top-N authorized surface before the model sees 200 MCP tools.
 * Rank-1 is order only; DSH keeps toolChoice auto.
 *
 * Assemble diagnostics go to `opute/execution-trace` (UI-only). They must not
 * be written back into PromptAssembly sections.
 */
export function apply(ctx) {
  const store = createQueryStore()
  const surfaceLimit = resolveToolSurfaceLimit()

  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    store.remember(agent, message, turn)
  })

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    // Live assembleContextFor sets both; typed AssembleContext only has scope.
    const agent = context?.agent ?? context?.scope
    const query = store.queryFor(agent)
    if (!query) return assembled
    try {
      const detail = projectRankedSurfaceDetail(assembled.tools, query, { limit: surfaceLimit })
      emitAssembleTrace(ctx, agent, store, {
        query,
        catalogCount: detail.catalogCount,
        ranking: detail.ranking,
        sections: assembled.sections,
        contexts: assembled.contexts,
      })
      return {
        ...assembled,
        tools: detail.tools,
      }
    } catch (error) {
      ctx.logger?.warn?.(`opute-tool-retrieval: ranking failed, using full catalog: ${String(error)}`)
      return assembled
    }
  }, { prepend: true })

  if (typeof ctx.inject === 'function') {
    ctx.inject(['sessionProjections'], (scope) => {
      registerOputeTraceProjection(scope)
    })
  }

  ctx.logger?.info?.(`opute-tool-retrieval: ${TOOL_SELECTION_RANKING_VERSION} surface on system-prompt/assemble`)
}
