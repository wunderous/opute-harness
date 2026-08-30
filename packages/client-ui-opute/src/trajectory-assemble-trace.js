export const EXECUTION_TRACE_EVENT = 'opute/execution-trace'
export const ASSEMBLE_TRACE_KIND = 'opute-assemble-trace'
export const ASSEMBLE_TRACE_PLUGIN = 'opute-tool-retrieval'

const STAGE_FORMS = {
  'retrieval-input': 'recall',
  'rank-fusion-reranking': 'catalog',
  'authorized-tool-selection': 'catalog',
  'context-injection': 'snapshot',
}

export function contextFormForStage(stage) {
  return STAGE_FORMS[stage] || 'notice'
}

export function formatTraceEventText(event) {
  if (!event || typeof event !== 'object') return ''
  const lines = []
  if (typeof event.stage === 'string' && event.stage) lines.push(event.stage)
  if (typeof event.label === 'string' && event.label) lines.push(event.label)
  if (typeof event.detail === 'string' && event.detail) lines.push(event.detail)
  return lines.join('\n')
}

export function stagesFromTraceData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return []
  return data.events.filter((entry) => entry && typeof entry === 'object')
}

/**
 * Project one log-only assemble diagnostic onto a Trajectory context node.
 * Ranking stays off the chat surface and out of PromptAssembly.
 */
export function buildAssembleTraceContextNode(sessionEvent) {
  const data = sessionEvent?.data && typeof sessionEvent.data === 'object'
    ? sessionEvent.data
    : {}
  const stages = stagesFromTraceData(data)
  const first = stages[0] || {}
  const stage = typeof first.stage === 'string' ? first.stage : ''
  return {
    kind: 'context',
    seq: sessionEvent.seq,
    time: sessionEvent.time,
    content: stages.map((entry) => ({ type: 'text', text: formatTraceEventText(entry) })),
    source: {
      kind: 'plugin',
      plugin: ASSEMBLE_TRACE_PLUGIN,
      ...(stage ? { stage } : {}),
    },
    provenance: {
      role: 'inject',
      label: stage || ASSEMBLE_TRACE_PLUGIN,
    },
    form: contextFormForStage(stage),
  }
}

export function trajectoryAssembleTraceViewNode(context) {
  if (!context?.state || context.state.kind !== 'context') return null
  if (!Array.isArray(context.state.content) || context.state.content.length === 0) return null
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'trajectory',
    anchorSeq: context.state.seq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data: { kind: 'node', node: context.state },
  }
}

export function oputeAssembleTraceDefinition() {
  return {
    kind: ASSEMBLE_TRACE_KIND,
    target: 'trajectory',
    match(event) {
      return event.type === EXECUTION_TRACE_EVENT
        ? { id: String(event.seq), role: 'start' }
        : null
    },
    start(_context, match) {
      return buildAssembleTraceContextNode(match.event)
    },
    update(context) {
      return context.state
    },
    buildViewNode: trajectoryAssembleTraceViewNode,
  }
}
