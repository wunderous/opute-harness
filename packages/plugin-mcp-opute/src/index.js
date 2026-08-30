import { registerOputeMcpTools } from './bridge.js'
import { attachHostAgentKernels, listEnrolledHostIds } from './host-kernels.js'
import { normalizeOputeMcpUrl } from './protocol.js'

export const name = 'mcp-opute'
export const inject = ['tools']

export { publicToolName } from './public-name.js'
export { oputeMcpJsonRpc, normalizeOputeMcpUrl } from './protocol.js'
export { toolNamePrefix } from './tool-prefix.js'

function resolveToken() {
  return process.env.OPUTE_MCP_TOKEN
    || process.env.MCP_AUTH_TOKEN
    || process.env.OPUTE_CPC_TOKEN
    || ''
}

/**
 * 2026-07-28 Streamable HTTP bridge. Stock dsh-mcp-client uses SDK v1
 * `Client.connect()` / `initialize`, which Opute rejects; this plugin lists
 * and calls tools with the modern `_meta` envelope instead.
 */
export async function apply(ctx) {
  const endpoint = normalizeOputeMcpUrl(process.env.OPUTE_MCP_ENDPOINT || 'http://127.0.0.1:9091/mcp')
  const token = resolveToken()
  const required = process.env.OPUTE_HARNESS_REQUIRE_MCP === '1'
  if (required && !token) {
    throw new Error('OPUTE_HARNESS_REQUIRE_MCP=1 requires OPUTE_MCP_TOKEN')
  }
  if (required && !/^https?:\/\//.test(endpoint)) {
    throw new Error(`OPUTE_MCP_ENDPOINT is not an http(s) URL: ${endpoint}`)
  }

  const context = {
    mcpUrl: endpoint,
    token,
    clientName: 'opute-harness-mcp',
    clientVersion: '0.1.0',
  }

  let disposers = []
  let lastError
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const registered = await registerOputeMcpTools(ctx, context)
      disposers = registered.disposers
      const omittedNote = registered.omitted ? ` (omitted ${registered.omitted} CLI/host-only)` : ''
      const skippedNote = registered.skipped ? ` (skipped ${registered.skipped})` : ''
      ctx.logger?.info?.(`mcp-opute: registered ${registered.count} tools from ${endpoint}`)
      console.info(`mcp-opute: registered ${registered.count} tools from ${endpoint}${omittedNote}${skippedNote}`)
      lastError = undefined
      break
    } catch (error) {
      lastError = error
      ctx.logger?.warn?.(`mcp-opute: tools/list attempt ${attempt + 1}/5 failed: ${String(error)}`)
      console.warn(`mcp-opute: tools/list attempt ${attempt + 1}/5 failed: ${String(error)}`)
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  if (lastError) {
    ctx.logger?.error?.(`mcp-opute: 2026-07-28 tools/list failed: ${String(lastError)}`)
    console.error(`mcp-opute: 2026-07-28 tools/list failed: ${String(lastError)}`)
    if (required) throw lastError
  }

  let enrolledHostIds = []
  if (!lastError) {
    enrolledHostIds = await listEnrolledHostIds(context)
  }
  try {
    const kernels = await attachHostAgentKernels(ctx, {
      required: false,
      enrolledHostIds,
    })
    disposers.push(...kernels.disposers)
  } catch (error) {
    ctx.logger?.warn?.(`mcp-opute: host kernel attach failed: ${String(error)}`)
    console.warn(`mcp-opute: host kernel attach failed: ${String(error)}`)
    if (required) throw error
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'mcp-opute: tools')
}
