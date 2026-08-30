/**
 * MCP Apps SEP-1865 host-side JSON-RPC. The nested sandbox proxy (outer iframe)
 * relays these messages to the inner `text/html;profile=mcp-app` document.
 */

export function isJsonRpc(value) {
  return Boolean(value) && typeof value === 'object' && value.jsonrpc === '2.0'
}

/**
 * @param {unknown} data
 * @param {{
 *   resource: { html: string, sandbox?: string, csp?: string, allow?: string },
 *   initializeResult?: Record<string, unknown>,
 *   toolInput?: unknown,
 *   toolResult?: unknown,
 * }} ctx
 * @returns {object[]}
 */
export function handleMcpAppHostMessage(data, ctx) {
  if (!isJsonRpc(data)) return []
  if (data.method === 'ui/notifications/sandbox-proxy-ready') {
    return [{
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: ctx.resource,
    }]
  }
  if (data.method === 'ui/initialize' && data.id !== undefined && data.id !== null) {
    return [{
      jsonrpc: '2.0',
      id: data.id,
      result: ctx.initializeResult || {
        protocolVersion: '2026-01-26',
        hostCapabilities: {},
      },
    }]
  }
  if (data.method === 'ui/notifications/initialized') {
    return [
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-input',
        params: ctx.toolInput ?? {},
      },
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: ctx.toolResult ?? { content: [] },
      },
    ]
  }
  return []
}

export function callToolResultFromPayload(payload, content) {
  const structured = payload && typeof payload === 'object' && payload.structuredContent
    && typeof payload.structuredContent === 'object'
    ? payload.structuredContent
    : (payload && typeof payload === 'object' && (payload.vms || payload.instances || payload.items)
      ? payload
      : {})
  return {
    content: Array.isArray(content) && content.length > 0
      ? content
      : [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: false,
  }
}

export function mcpAppFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  const app = meta.mcpApp
  if (!app || typeof app !== 'object') return null
  if (typeof app.html !== 'string' || app.html.length === 0) return null
  return app
}

/**
 * VM inventory always has a hostable MCP App. Live presentationMeta wins;
 * otherwise the bundled spec HTML still mounts the iframe.
 */
export function vmInventoryAppFromMeta(meta, bundled) {
  return mcpAppFromMeta(meta) || bundled || null
}
