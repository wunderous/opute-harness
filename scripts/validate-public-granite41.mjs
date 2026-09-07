#!/usr/bin/env node
/**
 * Public, read-only acceptance for the exact IBM Granite 4.1 8B route.
 *
 * The probe uses the hosted Harness entry point, selects the OpenRouter route,
 * asks for one inventory read, and records the correlated model/tool/session
 * evidence without persisting credentials.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = process.env.DSH_ROOT
  ? path.resolve(process.env.DSH_ROOT)
  : path.resolve(root, '..', 'deepseek-harness')
const wsPath = path.join(dshRoot, 'node_modules', '.pnpm', 'ws@8.21.0', 'node_modules', 'ws', 'wrapper.mjs')
if (!existsSync(wsPath)) throw new Error(`missing WebSocket client at ${wsPath}`)
const { default: WebSocket } = await import(pathToFileURL(wsPath).href)

const originRaw = process.env.HARNESS_URL || 'https://harness.opute.io'
const origin = originRaw.endsWith('/') ? originRaw.slice(0, -1) : originRaw
const provider = 'openrouter'
const model = 'ibm-granite/granite-4.1-8b'
const expectedTool = 'platform__list_managed_vms'
const prompt = 'Call the exact tool mcp__opute__platform__list_managed_vms once with the empty JSON object {}. Do not answer until that tool returns. Then report each returned VM name, status, and owning host; use only returned tool data and say when a field is unavailable.'
const requestedSessionId = `granite41-validation-${randomUUID()}`
const state = {
  accepted: false,
  sessionId: requestedSessionId,
  catalog: undefined,
  routes: [],
  eventTypes: [],
  traces: [],
  toolCalls: [],
  toolResults: [],
  assistantChunks: [],
  assistantMessages: [],
  turnEnds: [],
  errors: [],
}

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function safe(value, depth = 0) {
  if (depth > 7) return '[TRUNCATED]'
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 1600) return `${value.slice(0, 1600)}...[TRUNCATED]`
    return value
  }
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safe(item, depth + 1))
  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if (/(token|secret|password|cookie|authorization|bearer|api[-_]?key)/iu.test(key)) out[key] = '[REDACTED]'
    else out[key] = safe(child, depth + 1)
  }
  return out
}

function findRoute(value, depth = 0) {
  if (depth > 8 || !isObject(value)) return undefined
  if (!Array.isArray(value)) {
    const route = {
      provider: typeof value.provider === 'string' ? value.provider : undefined,
      model: typeof value.model === 'string' ? value.model : undefined,
    }
    if (route.provider || route.model) return route
    for (const child of Object.values(value)) {
      const found = findRoute(child, depth + 1)
      if (found) return found
    }
  } else {
    for (const child of value) {
      const found = findRoute(child, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

function textFrom(value, key = '', depth = 0) {
  if (depth > 8 || value === null || value === undefined) return ''
  if (typeof value === 'string') return ['text', 'delta', 'content', 'message'].includes(key) ? value : ''
  if (Array.isArray(value)) return value.map(item => textFrom(item, key, depth + 1)).join('')
  if (!isObject(value)) return ''
  return Object.entries(value).map(([childKey, child]) => textFrom(child, childKey, depth + 1)).join('')
}

function eventPayload(event) {
  return isObject(event.data) ? event.data : event
}

function eventId(event) {
  const payload = eventPayload(event)
  for (const key of ['seq', 'id', 'callId', 'toolCallId']) {
    if (typeof payload[key] === 'string' || typeof payload[key] === 'number') return String(payload[key])
  }
  return JSON.stringify(safe(payload))
}

function findCallId(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findCallId(child, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (!isObject(value)) return undefined
  for (const key of ['callId', 'toolCallId']) {
    if (typeof value[key] === 'string') return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findCallId(child, depth + 1)
    if (found) return found
  }
  return undefined
}

function findToolName(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findToolName(child, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (!isObject(value)) return undefined
  for (const key of ['toolName', 'name']) {
    if (typeof value[key] === 'string') return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findToolName(child, depth + 1)
    if (found) return found
  }
  return undefined
}

const seenEvents = new Set()
function collect(value, depth = 0) {
  if (depth > 16 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collect(item, depth + 1)
    return
  }
  if (!isObject(value)) return
  const rawType = typeof value.type === 'string' ? value.type : ''
  const nested = rawType === 'event' && isObject(value.event) ? value.event : undefined
  const event = nested || value
  const type = typeof event.type === 'string' ? event.type : rawType
  if (type) {
    const key = `${type}:${eventId(event)}`
    if (seenEvents.has(key)) return
    seenEvents.add(key)
    if (!state.eventTypes.includes(type)) state.eventTypes.push(type)
    const payload = eventPayload(event)
    if (type === 'request/header') state.routes.push(findRoute(event) || safe(payload))
    if (type === 'tool/call') {
      state.toolCalls.push({
        ...safe(payload),
        __callId: findCallId(payload),
        __toolName: findToolName(payload),
      })
    }
    if (type === 'tool/result') {
      state.toolResults.push({
        ...safe(payload),
        __callId: findCallId(payload),
        __toolName: findToolName(payload),
        __hasVmInventory: containsVmRows(payload),
      })
    }
    if (type === 'assistant/chunk') state.assistantChunks.push(textFrom(payload))
    if (type === 'assistant/message') state.assistantMessages.push(textFrom(payload))
    if (type === 'turn/end') state.turnEnds.push(safe(event))
    if (type === 'error' || type.endsWith('/error')) state.errors.push(safe(payload))
    if (isObject(payload.reason) && payload.reason.kind === 'error') state.errors.push(safe(payload))
    if (type === 'opute/execution-trace') state.traces.push(safe(event))
  }
  for (const [key, child] of Object.entries(value)) {
    if (['records', 'events', 'value', 'event', 'data', 'payload'].includes(key)) collect(child, depth + 1)
  }
}

function modelCatalogSummary(value) {
  const groups = Array.isArray(value?.groups) ? value.groups : []
  return {
    default: value?.default ?? null,
    routableProviders: Array.isArray(value?.routableProviders) ? value.routableProviders : [],
    groups: groups.map(group => ({
      id: group?.id ?? null,
      models: Array.isArray(group?.models)
        ? group.models.map(item => item?.id).filter(item => typeof item === 'string')
        : [],
    })),
    failures: Array.isArray(value?.failures) ? value.failures : [],
  }
}

function modelsForProvider(value, providerId) {
  const group = Array.isArray(value?.groups)
    ? value.groups.find(group => group?.id === providerId)
    : undefined
  return Array.isArray(group?.models)
    ? group.models.map(item => item?.id).filter(item => typeof item === 'string')
    : []
}

function nestedField(value, keys, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return undefined
  if (isObject(value)) {
    for (const key of keys) if (typeof value[key] === 'string') return value[key]
    for (const child of Object.values(value)) {
      const found = nestedField(child, keys, depth + 1)
      if (found) return found
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const found = nestedField(child, keys, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

function containsVmRows(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return false
  if (typeof value === 'string') return /["']vms["']\s*:/u.test(value)
  if (Array.isArray(value)) return value.some(item => containsVmRows(item, depth + 1))
  if (!isObject(value)) return false
  if (Array.isArray(value.vms)) return true
  return Object.values(value).some(child => containsVmRows(child, depth + 1))
}

let cookie = ''
async function authenticate() {
  const response = await fetch(`${origin}/__dsh/hosted-entry`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status !== 303) throw new Error(`hosted-entry HTTP ${response.status}`)
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('hosted-entry did not issue a cookie')
  cookie = setCookie.split(';', 1)[0]
}

async function rpc(method, args) {
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
    signal: AbortSignal.timeout(60_000),
  })
  const bodyText = await response.text()
  let body
  try { body = JSON.parse(bodyText) } catch { throw new Error(`${method} returned non-JSON HTTP ${response.status}`) }
  if (!response.ok || body?.result?.ok !== true) throw new Error(`${method} RPC/HTTP failure ${response.status}`)
  return body.result.value
}

function follow(sessionId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace(/^http/u, 'ws')}/api/remote.mux`, { headers: { cookie } })
    const streamId = `granite41-follow-${randomUUID()}`
    let settled = false
    let turnFinished = false
    let finishTimer
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(finishTimer)
      try { socket.close() } catch {}
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error('follow timed out after 180s')), 180_000)
    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'open',
        streamId,
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId }, maxMessages: 400 } } },
      }))
    })
    socket.on('message', raw => {
      let frame
      try { frame = JSON.parse(String(raw)) } catch { return }
      if (!frame || frame.streamId !== streamId) return
      if (frame.type === 'error') {
        state.errors.push({ stream: safe(frame.error) })
        finish(new Error('follow stream error'))
        return
      }
      if (frame.type === 'item') {
        collect(frame.value)
        if (state.turnEnds.length > 0 || JSON.stringify(frame.value).includes('"type":"turn/end"')) {
          turnFinished = true
          finishTimer ||= setTimeout(() => finish(), 750)
        }
      }
      if (frame.type === 'end' && !turnFinished) finish(new Error('follow ended before turn/end'))
    })
    socket.on('error', () => finish(new Error('follow websocket error')))
    socket.on('close', () => {
      if (!settled && !turnFinished) finish(new Error('follow closed before turn/end'))
    })
  })
}

function idOf(value) { return value?.__callId || findCallId(value) || nestedField(value, ['id']) }
function nameOf(value) { return value?.__toolName || findToolName(value) }

async function run() {
  await authenticate()
  state.catalog = modelCatalogSummary(await rpc('session/modelCatalog', {}))
  const openRouterModels = modelsForProvider(state.catalog, provider)
  if (!openRouterModels.includes(model)) {
    throw new Error('exact Granite model is absent from the OpenRouter catalog')
  }
  const localModelGroups = state.catalog.groups
    .filter(group => group.id !== provider)
    .filter(group => group.models.includes(model))
    .map(group => group.id)
  if (localModelGroups.length > 0) {
    throw new Error(`exact Granite model is exposed by non-OpenRouter catalog route(s): ${localModelGroups.join(', ')}`)
  }
  if (state.catalog.default?.provider !== provider) {
    throw new Error(`public catalog default provider is ${state.catalog.default?.provider || '<missing>'}, expected OpenRouter`)
  }
  const created = await rpc('session/create', { request: { sessionId: requestedSessionId, agentPreset: 'opute', maxTokens: 64 } })
  state.sessionId = typeof created?.sessionId === 'string' ? created.sessionId : requestedSessionId
  await rpc('session/selectModel', { request: { sessionId: state.sessionId, provider, model } })
  const followPromise = follow(state.sessionId)
  const receipt = await rpc('session/prompt', { request: {
    requestId: randomUUID(),
    sessionId: state.sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: prompt }],
  } })
  state.accepted = receipt?.accepted === true || typeof receipt?.messageId === 'string'
  await followPromise

  const exactModelHeader = state.routes.some(route => route?.provider === provider && route?.model === model)
  const completed = state.turnEnds.some(end => end?.data?.reason?.kind === 'completed' || end?.reason?.kind === 'completed')
  const expectedCalls = state.toolCalls.filter(call => nameOf(call)?.includes(expectedTool))
  const expectedCallIds = new Set(expectedCalls.map(call => idOf(call)).filter(Boolean))
  const expectedResults = state.toolResults.filter(result => {
    const resultName = nameOf(result)
    return resultName?.includes(expectedTool) || (idOf(result) && expectedCallIds.has(idOf(result)))
  })
  const correlatedToolResult = expectedCalls.some(call => {
    const callId = idOf(call)
    const callName = nameOf(call)
    return expectedResults.some(result => {
      const resultId = idOf(result)
      const resultName = nameOf(result)
      return (callId && resultId && callId === resultId)
        || (!resultId && callName && resultName && callName === resultName)
    })
  })
  const resultHasVmInventory = expectedResults.some(result => result.__hasVmInventory === true || containsVmRows(result))
  const assistantText = (state.assistantMessages.at(-1) || state.assistantChunks.join('')).trim()
  const assistantMentionsInventory = /vm|virtual machine|host|status|running|stopped|unavailable|opute/iu.test(assistantText)
  const summary = {
    status: state.accepted && exactModelHeader && completed && assistantText.length > 0
      && state.errors.length === 0 && expectedCalls.length > 0 && expectedResults.length > 0
      && correlatedToolResult && resultHasVmInventory && assistantMentionsInventory ? 'PASS' : 'BLOCKED',
    accepted: state.accepted,
    exactModelHeader,
    selected: { provider, model },
    sessionId: state.sessionId,
    expectedTool,
    eventTypes: state.eventTypes,
    routes: state.routes,
    toolCallCount: state.toolCalls.length,
    toolResultCount: state.toolResults.length,
    expectedToolCallCount: expectedCalls.length,
    expectedToolResultCount: expectedResults.length,
    correlatedToolResult,
    resultHasVmInventory,
    assistantMentionsInventory,
    assistantText: assistantText.slice(0, 8000),
    turnEnds: state.turnEnds,
    errors: state.errors,
    traces: state.traces.slice(-12),
    catalog: state.catalog,
    toolCalls: state.toolCalls.slice(-8),
    toolResults: state.toolResults.slice(-8),
  }
  const outDir = path.join(root, '..', 'opute', 'tmp', 'public-harness-granite')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(safe(summary), null, 2)}\n`)
  console.log(JSON.stringify(safe(summary), null, 2))
  if (summary.status !== 'PASS') process.exitCode = 2
}

run().catch(error => {
  const outDir = path.join(root, '..', 'opute', 'tmp', 'public-harness-granite')
  mkdirSync(outDir, { recursive: true })
  const failure = { status: 'BLOCKED', error: String(error), selected: { provider, model }, prompt }
  writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(safe(failure), null, 2)}\n`)
  console.error(`PUBLIC_GRANITE41_BLOCKED: ${String(error)}`)
  process.exitCode = 2
})
