import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyOputeTrace,
  emptyOputeTrace,
  EXECUTION_TRACE_EVENT,
  oputeTraceDefinition,
  passthroughSchema,
  registerOputeTraceProjection,
} from './projection.js'

test('oputeTrace fold concatenates stages on the same turn', () => {
  const first = applyOputeTrace(emptyOputeTrace(), {
    type: EXECUTION_TRACE_EVENT,
    data: { turn: 1, events: [{ stage: 'retrieval-input', label: 'one' }] },
  })
  const second = applyOputeTrace(first, {
    type: EXECUTION_TRACE_EVENT,
    data: { turn: 1, events: [{ stage: 'rank-fusion-reranking', label: 'two' }] },
  })
  assert.equal(second.latestTurn, 1)
  assert.equal(second.turns['1'].events.length, 2)
  assert.equal(second.turns['1'].events[0].label, 'one')
  assert.equal(second.turns['1'].events[1].label, 'two')

  const nextTurn = applyOputeTrace(second, {
    type: EXECUTION_TRACE_EVENT,
    data: { turn: 2, events: [{ stage: 'retrieval-input', label: 'later' }] },
  })
  assert.equal(nextTurn.latestTurn, 2)
  assert.equal(nextTurn.turns['1'].events.length, 2)
  assert.equal(nextTurn.turns['2'].events[0].label, 'later')
})

test('unrelated events keep the same state reference', () => {
  const state = emptyOputeTrace()
  assert.equal(applyOputeTrace(state, { type: 'turn/start', data: { turn: 1 } }), state)
})

test('passthrough schema parse returns the value', () => {
  const value = { turns: {}, latestTurn: 0 }
  assert.equal(passthroughSchema().parse(value), value)
})

test('registerOputeTraceProjection no-ops without a registry', () => {
  assert.equal(registerOputeTraceProjection({}), false)
  let registered
  assert.equal(registerOputeTraceProjection({
    sessionProjections: {
      register(definition) {
        registered = definition
      },
    },
  }), true)
  assert.equal(registered.key, oputeTraceDefinition().key)
})
