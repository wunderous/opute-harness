import { callOputeMcpTool, listOputeMcpTools, registerOputeMcpTools } from './bridge.js'
import { catalogLocalName } from './local-name.js'
import { shouldRegisterCatalogTool } from './surface.js'
import { catalogNameFromWire, hostAgentServerName, isPrefixedCatalog, toolNamePrefix } from './tool-prefix.js'
import { publicToolName } from './public-name.js'
import { listLocalHostAgentKernels } from '../../../scripts/hydrate-mcp-env.js'

function healthUrlFromMcp(mcpUrl) {
  return String(mcpUrl || '').replace(/\/mcp\/?$/, '/health')
}

function agentIdsFromListAgentsResult(result) {
  const payload = result?.structuredContent && typeof result.structuredContent === 'object'
    ? result.structuredContent
    : result
  const agents = Array.isArray(payload?.agents) ? payload.agents : []
  return agents
    .filter((row) => row && (row.type === 'host' || !row.type) && typeof row.id === 'string')
    .map((row) => row.id.trim())
    .filter(Boolean)
}

export async function listEnrolledHostIds(context) {
  for (const name of ['aggregator__list_agents', 'list_agents']) {
    try {
      const result = await callOputeMcpTool(context, name, {})
      const ids = agentIdsFromListAgentsResult(result)
      if (ids.length > 0) return ids
    } catch {
      // Platform row may omit list_agents; local kernels still attach.
    }
  }
  return []
}

async function readKernelHealth(kernel, fetchImpl) {
  const fetchFn = fetchImpl || kernel.fetch || globalThis.fetch
  const response = await fetchFn(healthUrlFromMcp(kernel.url), { method: 'GET' })
  if (!response?.ok) return null
  const payload = await response.json()
  if (!payload || typeof payload !== 'object') return null
  return payload
}

function prefixFromHealthOrId(health, agentId) {
  const advertised = typeof health?.mcpToolNamePrefix === 'string' ? health.mcpToolNamePrefix.trim() : ''
  if (/^[0-9a-f]{8}$/.test(advertised)) return advertised
  return toolNamePrefix(agentId)
}

export async function attachHostAgentKernels(ctx, options = {}) {
  const required = options.required === true
  const fetchImpl = options.fetch
  const kernels = options.kernels || listLocalHostAgentKernels({ env: options.env || process.env })
  const selected = kernels

  const disposers = []
  let attached = 0
  const skipped = []
  for (const kernel of selected) {
    try {
      const health = await readKernelHealth(kernel, fetchImpl)
      const agentId = String(health?.agentId || kernel.agentId || '').trim()
      const prefix = prefixFromHealthOrId(health, agentId)
      if (!agentId || !prefix) {
        skipped.push({ agentId: kernel.agentId, reason: 'missing-identity' })
        continue
      }
      const context = {
        mcpUrl: kernel.url,
        token: kernel.token,
        fetch: fetchImpl || kernel.fetch,
        clientName: `opute-harness-host-${prefix}`,
        clientVersion: '0.1.0',
      }
      const tools = await listOputeMcpTools(context)
      const prefixed = tools.filter((tool) => typeof tool?.name === 'string' && isPrefixedCatalog(prefix, tool.name))
      if (prefixed.length === 0) {
        skipped.push({ agentId, reason: 'unprefixed-catalog' })
        if (required) {
          throw new Error(`Host Agent ${agentId} at ${kernel.url} did not advertise prefixed tool names`)
        }
        ctx.logger?.warn?.(`mcp-opute: skip unprefixed kernel ${agentId}`)
        console.warn(`mcp-opute: skip unprefixed kernel ${agentId}`)
        continue
      }
      const serverName = hostAgentServerName(prefix)
      const registered = await registerOputeMcpTools(ctx, context, {
        serverName,
        tools: prefixed,
        publicRawName(wireName) {
          return catalogNameFromWire(prefix, wireName)
        },
        describeName(wireName) {
          return catalogLocalName(catalogNameFromWire(prefix, wireName)) || catalogNameFromWire(prefix, wireName)
        },
      })
      disposers.push(...registered.disposers)
      attached += 1
      ctx.logger?.info?.(`mcp-opute: attached kernel ${agentId} as ${serverName} (${registered.count} tools)`)
      console.info(`mcp-opute: attached kernel ${agentId} as mcp__${serverName}__* (${registered.count} tools)`)
    } catch (error) {
      skipped.push({ agentId: kernel.agentId, reason: String(error) })
      ctx.logger?.warn?.(`mcp-opute: kernel ${kernel.agentId} attach failed: ${String(error)}`)
      console.warn(`mcp-opute: kernel ${kernel.agentId} attach failed: ${String(error)}`)
      if (required) throw error
    }
  }
  return { disposers, attached, skipped, publicExample: attached > 0 ? publicToolName('list_vms', hostAgentServerName(toolNamePrefix(selected[0]?.agentId))) : '' }
}
