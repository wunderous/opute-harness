import { compactMcpResult } from './compact-result.js'
import { describeCatalogTool } from './describe-tool.js'
import { catalogLocalName } from './local-name.js'
import { MCP_APP_MIME_TYPE, oputeMcpJsonRpc } from './protocol.js'
import { publicToolName } from './public-name.js'
import { shouldRegisterCatalogTool } from './surface.js'
import { bundledVmInventoryApp, VM_INVENTORY_APP_URI } from './vm-inventory-app.js'

const DEFAULT_TOOL_TIMEOUT_MS = 120_000
const TASK_POLL_TIMEOUT_MS = 180_000

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function projectArgumentsToSchema(args, schema) {
  if (!isRecord(args) || !isRecord(schema) || schema.type !== 'object' || schema.additionalProperties !== false) {
    return args
  }
  const properties = isRecord(schema.properties) ? new Set(Object.keys(schema.properties)) : new Set()
  return Object.fromEntries(Object.entries(args).filter(([key]) => properties.has(key)))
}

function isWorkingTask(value) {
  if (!isRecord(value)) return false
  if (typeof value.taskId !== 'string') return false
  const status = typeof value.status === 'string' ? value.status : 'working'
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return false
  return value.resultType === 'task' || status.length > 0
}

function extractText(content, rawName) {
  if (!Array.isArray(content) || content.length === 0) {
    return `(${rawName} returned no model-visible content)`
  }
  const parts = []
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join('\n') : JSON.stringify(content)
}

function toCanonicalValue(result, rawName) {
  if (Array.isArray(result?.content) && result.content.length > 0) {
    return {
      content: result.content,
      ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
    }
  }
  if (isRecord(result?.structuredContent)) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.structuredContent) }],
      structuredContent: result.structuredContent,
    }
  }
  if (isRecord(result) && !Array.isArray(result.content)) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  }
  return {
    content: [{ type: 'text', text: extractText(result?.content, rawName) }],
  }
}

export async function listOputeMcpTools(context) {
  const tools = []
  let cursor
  do {
    const result = await oputeMcpJsonRpc(context, {
      method: 'tools/list',
      params: cursor ? { cursor } : {},
      timeoutMs: 30_000,
    })
    const page = Array.isArray(result?.tools) ? result.tools : []
    for (const tool of page) tools.push(tool)
    cursor = typeof result?.nextCursor === 'string' && result.nextCursor.length > 0
      ? result.nextCursor
      : undefined
  } while (cursor)
  return tools
}

async function waitForTaskResult(context, task, signal) {
  const deadline = Date.now() + TASK_POLL_TIMEOUT_MS
  let pollIntervalMs = typeof task.pollIntervalMs === 'number' && task.pollIntervalMs > 0
    ? task.pollIntervalMs
    : 1000
  let taskId = task.taskId
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error(`MCP task ${taskId} was cancelled`)
    const remaining = Math.max(1, deadline - Date.now())
    const snapshot = await oputeMcpJsonRpc(context, {
      method: 'tasks/get',
      params: { taskId },
      mcpName: taskId,
      timeoutMs: Math.min(30_000, remaining),
      signal,
    })
    const status = typeof snapshot.status === 'string' ? snapshot.status : 'working'
    if (typeof snapshot.pollIntervalMs === 'number' && snapshot.pollIntervalMs > 0) {
      pollIntervalMs = snapshot.pollIntervalMs
    }
    if (status === 'completed') {
      if (isRecord(snapshot.result)) return snapshot.result
      throw new Error(`MCP task ${taskId} completed without an inline result`)
    }
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`MCP task ${taskId} ended with status ${status}`)
    }
    if (status === 'input_required') {
      throw new Error(`MCP task ${taskId} requires input via tasks/update`)
    }
    const sleepMs = Math.min(pollIntervalMs, Math.max(0, deadline - Date.now()))
    if (sleepMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, sleepMs)
        if (!signal) return
        const onAbort = () => {
          clearTimeout(timer)
          reject(new Error(`MCP task ${taskId} was cancelled`))
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }
  }
  throw new Error(`MCP task ${taskId} did not complete within ${TASK_POLL_TIMEOUT_MS}ms`)
}

export async function callOputeMcpTool(context, rawName, args, signal) {
  const result = await oputeMcpJsonRpc(context, {
    method: 'tools/call',
    params: {
      name: rawName,
      arguments: args && typeof args === 'object' ? args : {},
    },
    mcpName: rawName,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    signal,
  })
  if (isRecord(result) && result.resultType === 'task' && result.status === 'completed' && isRecord(result.result)) {
    return result.result
  }
  if (isWorkingTask(result)) {
    return waitForTaskResult(context, result, signal)
  }
  if (isRecord(result) && (result.status === 'failed' || result.status === 'cancelled') && result.taskId) {
    throw new Error(`MCP task ${result.taskId} ended with status ${result.status}`)
  }
  return result
}

function resourceUriFromTool(tool) {
  const meta = isRecord(tool?._meta) ? tool._meta : {}
  const ui = isRecord(meta.ui) ? meta.ui : {}
  if (typeof ui.resourceUri === 'string' && ui.resourceUri.startsWith('ui://')) {
    return ui.resourceUri
  }
  const local = catalogLocalName(typeof tool?.name === 'string' ? tool.name : '')
  if (local === 'list_vms' || local === 'list_managed_vms') {
    return VM_INVENTORY_APP_URI
  }
  return ''
}

async function readMcpAppResource(context, uri) {
  const result = await oputeMcpJsonRpc(context, {
    method: 'resources/read',
    params: { uri },
    timeoutMs: 15_000,
  })
  const content = Array.isArray(result?.contents) ? result.contents[0] : null
  if (!isRecord(content) || typeof content.text !== 'string' || content.text.length === 0) {
    return null
  }
  const mimeType = typeof content.mimeType === 'string' ? content.mimeType : MCP_APP_MIME_TYPE
  if (!mimeType.includes('mcp-app') && mimeType !== 'text/html') {
    return null
  }
  return {
    resourceUri: typeof content.uri === 'string' && content.uri.length > 0 ? content.uri : uri,
    html: content.text,
    mimeType,
  }
}

function resolveAppResource(uri, prefetched) {
  if (prefetched && typeof prefetched.html === 'string' && prefetched.html.length > 0) {
    return prefetched
  }
  if (uri === VM_INVENTORY_APP_URI) return bundledVmInventoryApp()
  return null
}

async function prefetchMcpAppResources(context, tools, logger) {
  const byUri = new Map()
  for (const tool of tools) {
    const uri = resourceUriFromTool(tool)
    if (!uri || byUri.has(uri)) continue
    byUri.set(uri, null)
  }
  await Promise.all([...byUri.keys()].map(async (uri) => {
    try {
      byUri.set(uri, await readMcpAppResource(context, uri))
    } catch (error) {
      logger?.warn?.(`mcp-opute: resources/read ${uri} failed: ${String(error)}`)
      byUri.set(uri, null)
    }
  }))
  return byUri
}

function createDefinition(context, tool, appResource, options = {}) {
  const rawName = tool.name
  const publicRawName = typeof options.publicRawName === 'function'
    ? options.publicRawName(rawName)
    : (options.publicRawName || rawName)
  const describeName = typeof options.describeName === 'function'
    ? options.describeName(rawName)
    : (options.describeName || publicRawName)
  const publicName = publicToolName(publicRawName, options.serverName)
  const parameters = isRecord(tool.inputSchema) ? tool.inputSchema : { type: 'object', properties: {} }
  return {
    name: publicName,
    // Keep the schema name and description tied together. Small/open models
    // sometimes substitute a remembered namespace for an MCP tool name when
    // the description only explains the operation. Stating the emitted name
    // makes the public contract self-describing without registering retired
    // aliases or silently rewriting model calls.
    description: `Call the exact tool name ${publicName}. ${describeCatalogTool(describeName, typeof tool.description === 'string' ? tool.description : '')}`,
    parameters,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    output: {
      schema: {
        type: 'object',
        properties: {
          content: { type: 'array', items: {} },
          structuredContent: {},
        },
        required: ['content'],
        additionalProperties: true,
      },
      render(_args, value) {
        return [{ type: 'text', text: extractText(value?.content, rawName) }]
      },
      // HTML stays off the model transcript. DSH cards read block.meta.
      ...(appResource ? {
        presentationMeta() {
          return { mcpApp: appResource }
        },
      } : {}),
    },
    async execute(args, exec) {
      const argsObj = typeof args === 'object' && args !== null ? args : {}
      const result = await callOputeMcpTool(
        context,
        rawName,
        projectArgumentsToSchema(argsObj, parameters),
        exec?.signal,
      )
      if (result?.isError === true) {
        throw new Error(extractText(result.content, rawName))
      }
      return toCanonicalValue(compactMcpResult(rawName, result), rawName)
    },
  }
}

/**
 * List Opute tools over 2026-07-28 Streamable HTTP and register them on DSH
 * as `mcp__opute__*` (or `mcp__h{prefix}__*` for a Host Agent kernel).
 */
export async function registerOputeMcpTools(ctx, context, options = {}) {
  const tools = Array.isArray(options.tools) ? options.tools : await listOputeMcpTools(context)
  const appResources = await prefetchMcpAppResources(context, tools, ctx.logger)
  const disposers = []
  let skipped = 0
  let omitted = 0
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string' || tool.name.length === 0) continue
    const local = catalogLocalName(
      typeof options.publicRawName === 'function' ? options.publicRawName(tool.name) : tool.name,
    )
    if (!shouldRegisterCatalogTool(local || tool.name)) {
      omitted += 1
      continue
    }
    try {
      const uri = resourceUriFromTool({ ...tool, name: local || tool.name })
      const appResource = resolveAppResource(uri, uri ? appResources.get(uri) : null)
      disposers.push(ctx.tools.register(createDefinition(context, tool, appResource || undefined, options)))
    } catch (error) {
      skipped += 1
      ctx.logger?.warn?.(`mcp-opute: skipped tool "${tool.name}": ${String(error)}`)
    }
  }
  return { disposers, count: disposers.length, skipped, omitted }
}
