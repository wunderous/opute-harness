export const OPUTE_TRACE_KEY = 'oputeTrace'
export const EMPTY_TRACE_TITLE = 'No assemble trace this session'

export function latestTraceFromProjection(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const turn = snapshot.latestTurn
  const turns = snapshot.turns && typeof snapshot.turns === 'object' ? snapshot.turns : null
  if (!turns) return null
  const entry = turns[String(turn)] ?? turns[turn]
  if (!entry || !Array.isArray(entry.events)) return null
  return { turn, events: entry.events }
}

export function executionTraceSummary(snapshot) {
  const latest = latestTraceFromProjection(snapshot)
  if (!latest || latest.events.length === 0) {
    return {
      empty: true,
      title: EMPTY_TRACE_TITLE,
      eventCount: 0,
      events: [],
      turn: 0,
    }
  }
  return {
    empty: false,
    title: `Execution Trace · ${latest.events.length} event${latest.events.length === 1 ? '' : 's'}`,
    eventCount: latest.events.length,
    events: latest.events,
    turn: latest.turn,
  }
}

export function traceEventLabels(snapshot) {
  return executionTraceSummary(snapshot).events.map((event) => event.label)
}
