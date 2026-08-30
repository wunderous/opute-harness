import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMcpHttpHeaders,
  buildModernMcpRequestEnvelope,
  describeFetchFailure,
  mcpTransportError,
  oputeMcpJsonRpc,
  OPUTE_MCP_PROTOCOL_VERSION,
  takeCompleteSseBlocks,
} from './protocol.js'

test('headers pin 2026-07-28 and never include a session id', () => {
  const headers = buildMcpHttpHeaders({ token: 't', method: 'tools/list' })
  assert.equal(headers['MCP-Protocol-Version'], '2026-07-28')
  assert.equal(headers['Mcp-Method'], 'tools/list')
  assert.equal(headers.Authorization, 'Bearer t')
  assert.equal(headers['Mcp-Session-Id'], undefined)
})

test('envelope advertises the Tasks and UI extensions', () => {
  const envelope = buildModernMcpRequestEnvelope({ clientName: 'test', clientVersion: '1' })
  assert.equal(envelope['io.modelcontextprotocol/protocolVersion'], OPUTE_MCP_PROTOCOL_VERSION)
  assert.deepEqual(envelope['io.modelcontextprotocol/clientCapabilities'], {
    extensions: {
      'io.modelcontextprotocol/tasks': {},
      'io.modelcontextprotocol/ui': {
        mimeTypes: ['text/html;profile=mcp-app'],
      },
    },
  })
})

test('json-rpc POST refuses initialize and sends _meta + Mcp-Method', async () => {
  const seen = []
  await assert.rejects(
    () => oputeMcpJsonRpc({ mcpUrl: 'http://127.0.0.1:9/mcp', fetch: () => {} }, { method: 'initialize' }),
    /refuses initialize/,
  )

  await oputeMcpJsonRpc({
    mcpUrl: 'http://127.0.0.1:9/mcp',
    token: 'tok',
    clientName: 'test',
    clientVersion: '1',
    async fetch(url, init) {
      seen.push({ url, init })
      return {
        ok: true,
        async json() {
          return { jsonrpc: '2.0', id: '1', result: { tools: [] } }
        },
      }
    },
  }, { method: 'tools/list' })

  assert.equal(seen.length, 1)
  assert.equal(seen[0].init.headers['Mcp-Method'], 'tools/list')
  assert.equal(seen[0].init.headers['MCP-Protocol-Version'], '2026-07-28')
  assert.equal(seen[0].init.headers['Mcp-Session-Id'], undefined)
  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.method, 'tools/list')
  assert.ok(body.params._meta['io.modelcontextprotocol/protocolVersion'])
  assert.notEqual(body.method, 'initialize')
})

test('transport errors unwrap undici fetch failed + ECONNREFUSED', async () => {
  const refused = new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:9091') })
  assert.match(describeFetchFailure(refused), /ECONNREFUSED/)
  await assert.rejects(
    () => oputeMcpJsonRpc({
      mcpUrl: 'http://127.0.0.1:9091/mcp',
      async fetch() { throw refused },
    }, { method: 'tools/call' }),
    /MCP tools\/call fetch failed for http:\/\/127.0.0.1:9091: fetch failed: connect ECONNREFUSED/,
  )
  assert.match(
    mcpTransportError('tools/list', 'https://mcp.opute.io/mcp', refused).message,
    /https:\/\/mcp\.opute\.io/,
  )
})

test('takeCompleteSseBlocks leaves a partial event in the remainder', () => {
  const { blocks, rest } = takeCompleteSseBlocks('data: {"a":1}\n\ndata: {"b":')
  assert.deepEqual(blocks, ['data: {"a":1}'])
  assert.equal(rest, 'data: {"b":')
})

test('tools/call finishes when Streamable HTTP SSE stays open after the result', async () => {
  const encoder = new TextEncoder()
  let jsonCalled = false
  let cancelled = false
  const result = await Promise.race([
    oputeMcpJsonRpc({
      mcpUrl: 'http://127.0.0.1:9/mcp',
      token: 'tok',
      async fetch(_url, init) {
        const requestId = JSON.parse(init.body).id
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } })}\n\n`,
            ))
            controller.enqueue(encoder.encode(
              `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { content: [{ type: 'text', text: 'vms' }] } })}\n\n`,
            ))
          },
          cancel() {
            cancelled = true
          },
        })
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: stream,
          async json() {
            jsonCalled = true
            throw new Error('json() waits for SSE EOF and must not be used')
          },
        }
      },
    }, { method: 'tools/call' }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SSE tools/call waited for the stream to close')), 250)
    }),
  ])
  assert.equal(jsonCalled, false)
  assert.equal(cancelled, true)
  assert.deepEqual(result, { content: [{ type: 'text', text: 'vms' }] })
})

test('tools/call finishes when JSON body stays open after the result', async () => {
  const encoder = new TextEncoder()
  let jsonCalled = false
  const result = await Promise.race([
    oputeMcpJsonRpc({
      mcpUrl: 'http://127.0.0.1:9/mcp',
      async fetch(_url, init) {
        const requestId = JSON.parse(init.body).id
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { ok: true } }),
            ))
          },
        })
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          body: stream,
          async json() {
            jsonCalled = true
            throw new Error('json() waits for EOF and must not be used')
          },
        }
      },
    }, { method: 'tools/call' }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('JSON tools/call waited for the stream to close')), 250)
    }),
  ])
  assert.equal(jsonCalled, false)
  assert.deepEqual(result, { ok: true })
})

test('tools/call finishes from an SSE data line that never gets a blank delimiter', async () => {
  const encoder = new TextEncoder()
  const result = await Promise.race([
    oputeMcpJsonRpc({
      mcpUrl: 'http://127.0.0.1:9/mcp',
      async fetch(_url, init) {
        const requestId = JSON.parse(init.body).id
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ jsonrpc: '2.0', id: requestId, result: { vms: 1 } })}`,
            ))
          },
        })
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: stream,
        }
      },
    }, { method: 'tools/call' }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('unterminated SSE waited for EOF')), 250)
    }),
  ])
  assert.deepEqual(result, { vms: 1 })
})

test('tools/call surfaces a JSON-RPC error from an SSE event', async () => {
  const encoder = new TextEncoder()
  await assert.rejects(
    () => oputeMcpJsonRpc({
      mcpUrl: 'http://127.0.0.1:9/mcp',
      async fetch(_url, init) {
        const requestId = JSON.parse(init.body).id
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ jsonrpc: '2.0', id: requestId, error: { message: 'host unreachable' } })}\n\n`,
            ))
          },
        })
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream; charset=utf-8' }),
          body: stream,
        }
      },
    }, { method: 'tools/call' }),
    /host unreachable/,
  )
})
