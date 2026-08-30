/** Pinned Opute MCP revision. Must match `MCP-Protocol-Version` on every POST. */
export const OPUTE_MCP_PROTOCOL_VERSION = '2026-07-28'

export const MCP_TASKS_EXTENSION_ID = 'io.modelcontextprotocol/tasks'
export const MCP_UI_EXTENSION_ID = 'io.modelcontextprotocol/ui'
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'

export const DEFAULT_CLIENT_NAME = 'opute-harness-mcp'
export const DEFAULT_CLIENT_VERSION = '0.1.0'

/**
 * Canonical Streamable HTTP headers (same contract as
 * `@opute/mcp-shared/streamable-http-client`). Never set `Mcp-Session-Id`.
 * @param {{ token?: string, method?: string, name?: string }} options
 */
export function buildMcpHttpHeaders(options = {}) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': OPUTE_MCP_PROTOCOL_VERSION,
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  if (options.method) headers['Mcp-Method'] = options.method
  if (options.name) headers['Mcp-Name'] = options.name
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  return headers
}

/**
 * Per-request `_meta` envelope. Opute rejects modern POSTs that omit this
 * even when the protocol header is already 2026-07-28.
 */
export function buildModernMcpRequestEnvelope(context = {}) {
  return {
    'io.modelcontextprotocol/protocolVersion': OPUTE_MCP_PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientInfo': {
      name: context.clientName || DEFAULT_CLIENT_NAME,
      version: context.clientVersion || DEFAULT_CLIENT_VERSION,
    },
    'io.modelcontextprotocol/clientCapabilities': {
      extensions: {
        [MCP_TASKS_EXTENSION_ID]: {},
        [MCP_UI_EXTENSION_ID]: {
          mimeTypes: [MCP_APP_MIME_TYPE],
        },
      },
    },
  }
}

export function describeFetchFailure(error) {
  const parts = []
  const seen = new Set()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if (typeof current.message === 'string' && current.message.trim()) {
      parts.push(current.message.trim())
    }
    if (typeof AggregateError !== 'undefined' && current instanceof AggregateError && Array.isArray(current.errors)) {
      for (const inner of current.errors) {
        if (inner && typeof inner.message === 'string' && inner.message.trim()) {
          parts.push(inner.message.trim())
        }
      }
    }
    current = current.cause
  }
  return parts.filter((part, index) => parts.indexOf(part) === index).join(': ')
}

export function mcpTransportError(method, mcpUrl, error) {
  let origin = String(mcpUrl || '')
  try {
    origin = new URL(mcpUrl).origin
  } catch {
    // Keep the raw URL when it is not parseable; never include headers/tokens.
  }
  const detail = describeFetchFailure(error)
  return new Error(`MCP ${method} fetch failed for ${origin}${detail ? `: ${detail}` : ''}`)
}

export function normalizeOputeMcpUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim().replace(/\/$/, '')
  if (!trimmed) return 'http://127.0.0.1:9091/mcp'
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function idsMatch(left, right) {
  if (left === undefined || right === undefined || left === null || right === null) return false
  return String(left) === String(right)
}

/**
 * JSON-RPC result from a parsed object. SSE streams can mix notifications;
 * requireIdMatch skips events that are not this request's response.
 */
export function jsonRpcResultFromPayload(payload, method, requestId, requireIdMatch = false) {
  if (!isRecord(payload)) return { kind: 'ignore' }
  const idOk = !requireIdMatch || payload.id === undefined || idsMatch(payload.id, requestId)
  if (payload.error && idOk) {
    const message = isRecord(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message
      : `MCP ${method} failed`
    return { kind: 'error', message }
  }
  if ('result' in payload && idOk) {
    return { kind: 'result', result: payload.result }
  }
  return { kind: 'ignore' }
}

function isEventStreamResponse(response) {
  const contentType = typeof response?.headers?.get === 'function'
    ? String(response.headers.get('content-type') || '')
    : ''
  return contentType.toLowerCase().includes('text/event-stream')
}

/**
 * Split complete SSE blocks off a buffer. Streamable HTTP may keep the
 * connection open after the JSON-RPC result, so callers must not wait for EOF.
 */
export function takeCompleteSseBlocks(buffer) {
  const blocks = []
  let rest = String(buffer || '')
  while (true) {
    const match = /\r?\n\r?\n/.exec(rest)
    if (!match) break
    const end = match.index + match[0].length
    blocks.push(rest.slice(0, match.index))
    rest = rest.slice(end)
  }
  return { blocks, rest }
}

export function parseSseBlock(block) {
  const dataLines = []
  for (const rawLine of String(block || '').split(/\r?\n/)) {
    if (rawLine.startsWith('data:')) {
      dataLines.push(rawLine.slice(5).replace(/^ /, ''))
    }
  }
  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function applyParsedPayload(payload, method, requestId, requireIdMatch = false) {
  const parsed = jsonRpcResultFromPayload(payload, method, requestId, requireIdMatch)
  if (parsed.kind === 'error') throw new Error(parsed.message)
  if (parsed.kind === 'result') return parsed.result
  return undefined
}

function looksLikeSse(buffer) {
  const trimmed = String(buffer || '').trimStart()
  return trimmed.startsWith('event:') || trimmed.startsWith('data:') || trimmed.startsWith(':')
}

/** First complete `{...}` object, even when the stream continues after it. */
export function parseLeadingJsonObject(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function extractResultFromBuffer(buffer, method, requestId) {
  const { blocks, rest } = takeCompleteSseBlocks(buffer)
  for (const block of [...blocks, rest]) {
    const fromBlock = applyParsedPayload(parseSseBlock(block), method, requestId, false)
    if (fromBlock !== undefined) return fromBlock
  }
  for (const line of String(buffer || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const fromLine = applyParsedPayload(parseLeadingJsonObject(line.slice(5)), method, requestId, false)
    if (fromLine !== undefined) return fromLine
  }
  if (!looksLikeSse(buffer)) {
    const fromJson = applyParsedPayload(parseLeadingJsonObject(buffer), method, requestId, false)
    if (fromJson !== undefined) return fromJson
  }
  return undefined
}

async function readOpenBodyJsonRpcResult(response, method, requestId) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const found = extractResultFromBuffer(buffer, method, requestId)
      if (found !== undefined) return found
      if (done) break
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Body cancel is best-effort once the JSON-RPC result is in hand.
    }
  }
  throw new Error(`MCP ${method} stream ended without a JSON-RPC result`)
}

async function readJsonRpcResult(response, method, requestId) {
  if (response.body && typeof response.body.getReader === 'function') {
    return readOpenBodyJsonRpcResult(response, method, requestId)
  }
  if (isEventStreamResponse(response)) {
    const text = await response.text()
    const found = extractResultFromBuffer(`${text}\n\n`, method, requestId)
    if (found !== undefined) return found
    throw new Error(`MCP ${method} SSE stream ended without a JSON-RPC result`)
  }
  const payload = await response.json()
  const found = applyParsedPayload(payload, method, requestId, false)
  if (found !== undefined) return found
  throw new Error(`MCP ${method} returned an invalid JSON-RPC payload`)
}

/**
 * One stateless JSON-RPC POST. Does not send `initialize` and does not store
 * a session id — Opute `2026-07-28` rejects both.
 * @param {object} context
 * @param {{ method: string, params?: Record<string, unknown>, mcpName?: string, timeoutMs?: number, signal?: AbortSignal }} request
 */
export async function oputeMcpJsonRpc(context, request) {
  const method = request.method
  if (method === 'initialize' || method === 'notifications/initialized') {
    throw new Error(`opute-harness MCP client refuses ${method} (2026-07-28 is stateless)`)
  }
  const params = { ...(request.params || {}) }
  const envelope = buildModernMcpRequestEnvelope(context)
  const extraMeta = params._meta && typeof params._meta === 'object' && !Array.isArray(params._meta)
    ? params._meta
    : {}
  params._meta = { ...envelope, ...extraMeta }

  const requestId = crypto.randomUUID()
  const body = {
    jsonrpc: '2.0',
    id: requestId,
    method,
    params,
  }

  const timeoutMs = request.timeoutMs
  const signals = []
  if (request.signal) signals.push(request.signal)
  if (timeoutMs && timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs))
  const signal = signals.length === 0
    ? undefined
    : signals.length === 1
      ? signals[0]
      : AbortSignal.any(signals)

  const fetchImpl = context.fetch || globalThis.fetch
  let response
  try {
    response = await fetchImpl(context.mcpUrl, {
      method: 'POST',
      headers: buildMcpHttpHeaders({
        token: context.token,
        method,
        ...(request.mcpName ? { name: request.mcpName } : {}),
      }),
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    throw mcpTransportError(method, context.mcpUrl, error)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`MCP HTTP ${response.status} for ${method}${detail ? `: ${detail.slice(0, 240)}` : ''}`)
  }

  return readJsonRpcResult(response, method, requestId)
}
