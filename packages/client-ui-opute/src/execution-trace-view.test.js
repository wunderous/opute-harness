import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_TRACE_TITLE, executionTraceSummary, traceEventLabels } from './execution-trace-view.js'

test('empty projection is an obvious missing-trace state', () => {
  const summary = executionTraceSummary(undefined)
  assert.equal(summary.empty, true)
  assert.equal(summary.title, EMPTY_TRACE_TITLE)
  assert.deepEqual(traceEventLabels(undefined), [])
})

test('latest turn expander lists event labels', () => {
  const snapshot = {
    latestTurn: 2,
    turns: {
      1: { events: [{ label: 'stale' }] },
      2: {
        events: [
          { stage: 'retrieval-input', label: 'Used last claimed user text as retrieval query' },
          { stage: 'rank-fusion-reranking', label: 'Ranked with dense-lexical-rank-fusion-v1' },
          { stage: 'authorized-tool-selection', label: 'Exposed 10 tools to the model' },
        ],
      },
    },
  }
  const summary = executionTraceSummary(snapshot)
  assert.equal(summary.empty, false)
  assert.equal(summary.eventCount, 3)
  assert.match(summary.title, /Execution Trace · 3 events/)
  assert.deepEqual(traceEventLabels(snapshot), [
    'Used last claimed user text as retrieval query',
    'Ranked with dense-lexical-rank-fusion-v1',
    'Exposed 10 tools to the model',
  ])
})
