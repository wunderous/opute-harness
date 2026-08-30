export const OPUTE_TRACE_KEY = 'oputeTrace'
export const EXECUTION_TRACE_EVENT = 'opute/execution-trace'

export function emptyOputeTrace() {
  return { turns: {}, latestTurn: 0 }
}

export function passthroughSchema() {
  return {
    parse(value) {
      return value
    },
  }
}

export function applyOputeTrace(state, event) {
  if (!event || event.type !== EXECUTION_TRACE_EVENT) return state
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  const turn = Number(data.turn)
  const incoming = Array.isArray(data.events) ? data.events : []
  const nextTurn = Number.isFinite(turn) ? turn : 0
  const key = String(nextTurn)
  const previous = state.turns[key]
  // One append per assemble stage (Trajectory identities by seq). Concatenate
  // so the header expander still lists the whole pipeline for this turn.
  const events = previous && Array.isArray(previous.events)
    ? previous.events.concat(incoming)
    : incoming
  return {
    turns: { ...state.turns, [key]: { events } },
    latestTurn: nextTurn,
  }
}

export function oputeTraceDefinition() {
  return {
    key: OPUTE_TRACE_KEY,
    stateSchema: passthroughSchema(),
    init: () => emptyOputeTrace(),
    apply: applyOputeTrace,
    wire: {
      viewSchema: passthroughSchema(),
      view: (state) => state,
    },
    stateVersion: 1,
  }
}

export function registerOputeTraceProjection(ctx) {
  const registry = ctx?.sessionProjections
  if (!registry || typeof registry.register !== 'function') return false
  registry.register(oputeTraceDefinition())
  return true
}
