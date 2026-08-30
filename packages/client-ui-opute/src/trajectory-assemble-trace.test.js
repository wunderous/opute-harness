import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSEMBLE_TRACE_KIND,
  EXECUTION_TRACE_EVENT,
  buildAssembleTraceContextNode,
  formatTraceEventText,
  oputeAssembleTraceDefinition,
  trajectoryAssembleTraceViewNode,
} from './trajectory-assemble-trace.js'

const rankingEvent = {
  type: EXECUTION_TRACE_EVENT,
  seq: 12,
  time: 1_700_000_000_000,
  data: {
    turn: 3,
    events: [{
      stage: 'rank-fusion-reranking',
      label: 'Ranked with dense-lexical-rank-fusion-v1',
      detail: 'mcp__opute__platform__list_managed_vms · 0.82',
      data: { rankingVersion: 'dense-lexical-rank-fusion-v1' },
    }],
  },
}

test('each assemble stage becomes a Trajectory context node', () => {
  const node = buildAssembleTraceContextNode(rankingEvent)
  assert.equal(node.kind, 'context')
  assert.equal(node.seq, 12)
  assert.equal(node.form, 'catalog')
  assert.equal(node.provenance.role, 'inject')
  assert.equal(node.provenance.label, 'rank-fusion-reranking')
  assert.equal(node.source.kind, 'plugin')
  assert.equal(node.source.plugin, 'opute-tool-retrieval')
  assert.equal(node.content[0].type, 'text')
  assert.match(node.content[0].text, /rank-fusion-reranking/)
  assert.match(node.content[0].text, /dense-lexical-rank-fusion-v1/)
  assert.match(node.content[0].text, /list_managed_vms/)
})

test('a legacy multi-stage append still projects every stage into content', () => {
  const node = buildAssembleTraceContextNode({
    type: EXECUTION_TRACE_EVENT,
    seq: 4,
    time: 1,
    data: {
      turn: 1,
      events: [
        { stage: 'retrieval-input', label: 'Used last claimed user text as retrieval query', detail: 'list the vms' },
        { stage: 'context-injection', label: 'Named assemble contexts and sections', detail: '1 context, 1 section' },
      ],
    },
  })
  assert.equal(node.content.length, 2)
  assert.equal(node.form, 'recall')
  assert.match(node.content[1].text, /context-injection/)
})

test('definition matches only assemble traces and targets Trajectory', () => {
  const definition = oputeAssembleTraceDefinition()
  assert.equal(definition.kind, ASSEMBLE_TRACE_KIND)
  assert.equal(definition.target, 'trajectory')
  assert.deepEqual(definition.match(rankingEvent), { id: '12', role: 'start' })
  assert.equal(definition.match({ type: 'user/message', seq: 1, data: {} }), null)
  const state = definition.start({}, { event: rankingEvent })
  const view = trajectoryAssembleTraceViewNode({
    key: 'trace:12',
    kind: ASSEMBLE_TRACE_KIND,
    id: '12',
    start: { location: { kind: 'turn', turn: 3 } },
    state,
  })
  assert.equal(view.target, 'trajectory')
  assert.equal(view.data.kind, 'node')
  assert.equal(view.data.node.kind, 'context')
  assert.equal(view.anchorSeq, 12)
  assert.equal(view.location.kind, 'turn')
})

test('empty assemble traces do not publish a Trajectory row', () => {
  assert.equal(formatTraceEventText({}), '')
  const view = trajectoryAssembleTraceViewNode({
    key: 'trace:1',
    kind: ASSEMBLE_TRACE_KIND,
    id: '1',
    state: buildAssembleTraceContextNode({
      type: EXECUTION_TRACE_EVENT,
      seq: 1,
      time: 1,
      data: { turn: 1, events: [] },
    }),
  })
  assert.equal(view, null)
})
