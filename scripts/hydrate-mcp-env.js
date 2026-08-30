import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { normalizeOputeMcpUrl } from '../packages/plugin-mcp-opute/src/protocol.js'

const PUBLIC_MCP_URL = 'https://mcp.opute.io/mcp'
const OPSESS_CACHE_REL = ['tmp', 'dogfood-milestones', 'mcp-bearer.cache.json']

const WANTED_KEYS = new Set([
  'OPUTE_MCP_TOKEN',
  'OPUTE_MCP_AUTH_TOKEN',
  'MCP_AUTH_TOKEN',
  'OPUTE_CPC_TOKEN',
  'OPUTE_MCP_ENDPOINT',
  'OPUTE_MCP_URL',
  'AGENT_URL',
  'OPENROUTER_API_KEY',
  'OPUTE_OPENROUTER_API_KEY',
])

export function parseEnvFile(contents, options = {}) {
  const allowed = options.allKeys ? null : WANTED_KEYS
  const out = {}
  for (const line of String(contents || '').split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq)
    if (allowed && !allowed.has(key)) continue
    let value = trimmed.slice(eq + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value) out[key] = value
  }
  return out
}

function applyIfUnset(env, incoming) {
  for (const [key, value] of Object.entries(incoming)) {
    if (!env[key] && value) env[key] = value
  }
}

export function resolveHostAgentEnvPath(env = process.env, homedir = os.homedir()) {
  const explicit = env.OPUTE_HOST_AGENT_ENV
  if (explicit && existsSync(explicit)) return explicit

  const instances = path.join(homedir, '.config/opute/instances')
  try {
    const listing = execFileSync(
      'systemctl',
      ['--user', 'list-units', '--type=service', '--state=running', '--plain', '--no-legend', 'opute-host-agent@*'],
      { encoding: 'utf8', timeout: 3000 },
    )
    const match = listing.match(/opute-host-agent@([A-Za-z0-9_-]+)/)
    if (match) {
      const filePath = path.join(instances, match[1], 'host-agent.env')
      if (existsSync(filePath)) return filePath
    }
  } catch {
    // systemctl is optional on non-systemd launch hosts.
  }

  if (!existsSync(instances)) return undefined
  const candidates = readdirSync(instances)
    .map((name) => path.join(instances, name, 'host-agent.env'))
    .filter((filePath) => existsSync(filePath))
  return candidates[0]
}

export function isLoopbackMcpUrl(url) {
  try {
    const { hostname } = new URL(url)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  } catch {
    return false
  }
}

/** Host Agent kernel MCP accepts oha_ only. Product bearers must not cross this boundary. */
export function isHostKernelToken(token) {
  const value = String(token || '').trim()
  return value.startsWith('oha_') && !value.startsWith('opha_')
}

function kernelUrlFromInstanceEnv(parsed) {
  const explicit = String(parsed.HOST_MCP_URL || parsed.OPUTE_HOST_MCP_URL || '').trim()
  if (explicit) return normalizeOputeMcpUrl(explicit)
  const port = String(parsed.HOST_MCP_PORT || '').trim() || '3004'
  return `http://127.0.0.1:${port}/mcp`
}

export function parseHostAgentMcpServersEnv(raw) {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : []
    return rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const agentId = String(row.agentId || '').trim()
      const url = String(row.url || '').trim()
      const token = String(row.token || '').trim()
      if (!agentId || !url || !isHostKernelToken(token)) return []
      return [{ agentId, url: normalizeOputeMcpUrl(url), token, source: 'env' }]
    })
  } catch {
    return []
  }
}

export function listLocalHostAgentKernels(options = {}) {
  const homedir = options.homedir || os.homedir()
  const instances = options.instancesDir || path.join(homedir, '.config/opute/instances')
  const found = []
  if (existsSync(instances)) {
    for (const name of readdirSync(instances)) {
      const filePath = path.join(instances, name, 'host-agent.env')
      if (!existsSync(filePath)) continue
      const parsed = parseEnvFile(readFileSync(filePath, 'utf8'), { allKeys: true })
      const agentId = String(parsed.OPUTE_REMOTE_AGENT_ID || '').trim()
      const token = String(parsed.MCP_AUTH_TOKEN || '').trim()
      if (!agentId || !isHostKernelToken(token)) continue
      found.push({
        agentId,
        url: kernelUrlFromInstanceEnv(parsed),
        token,
        source: filePath,
      })
    }
  }
  const extra = parseHostAgentMcpServersEnv(options.env?.OPUTE_HOST_AGENT_MCP_SERVERS || process.env.OPUTE_HOST_AGENT_MCP_SERVERS)
  const byId = new Map()
  for (const row of [...found, ...extra]) {
    byId.set(row.agentId, row)
  }
  return [...byId.values()]
}

export function isHostScopedMcpToken(token) {
  const value = String(token || '')
  return value.startsWith('oha_') || value.startsWith('opit_') || value.startsWith('opha_')
}

export function isProductMcpToken(value) {
  if (typeof value !== 'string' || value.length < 8 || value === 'dev-token') return false
  if (isHostScopedMcpToken(value)) return false
  return value.startsWith('opsess_')
    || value.startsWith('opat_')
    || value.length >= 20
}

function productTokenFrom(env) {
  for (const key of ['OPUTE_MCP_TOKEN', 'OPUTE_MCP_AUTH_TOKEN', 'OPUTE_CPC_TOKEN', 'MCP_AUTH_TOKEN']) {
    const value = env[key]
    if (isProductMcpToken(value)) return value
  }
  return ''
}

export function readOpsessCache(oputeRoot) {
  if (!oputeRoot) return ''
  const cachePath = path.join(oputeRoot, ...OPSESS_CACHE_REL)
  if (!existsSync(cachePath)) return ''
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf8'))
    const token = typeof raw.token === 'string' ? raw.token.trim() : ''
    return isProductMcpToken(token) ? token : ''
  } catch {
    return ''
  }
}

/**
 * Host-scoped bearers (`oha_` / `opit_` / `opha_`) are not product MCP tokens.
 * list_managed_vms requires opsess_/opat_/CPC.
 */
export function hydrateHarnessMcpEnv(env, options = {}) {
  const root = options.root
  if (root) {
    const siblingEnv = path.join(root, '..', 'opute', '.env')
    if (existsSync(siblingEnv)) {
      applyIfUnset(env, parseEnvFile(readFileSync(siblingEnv, 'utf8')))
    }
  }

  const hostAgentEnv = options.hostAgentEnvPath || resolveHostAgentEnvPath(env, options.homedir)
  if (hostAgentEnv && existsSync(hostAgentEnv)) {
    applyIfUnset(env, parseEnvFile(readFileSync(hostAgentEnv, 'utf8')))
  }

  if (!env.OPUTE_MCP_ENDPOINT && env.OPUTE_MCP_URL) {
    env.OPUTE_MCP_ENDPOINT = normalizeOputeMcpUrl(env.OPUTE_MCP_URL)
  }
  if (!env.OPUTE_MCP_ENDPOINT && env.AGENT_URL) {
    env.OPUTE_MCP_ENDPOINT = normalizeOputeMcpUrl(env.AGENT_URL)
  }
  env.OPUTE_MCP_ENDPOINT = normalizeOputeMcpUrl(env.OPUTE_MCP_ENDPOINT || 'http://127.0.0.1:9091/mcp')

  const oputeRoot = options.oputeRoot || (root ? path.join(root, '..', 'opute') : undefined)
  // Host Agent env MCP_AUTH_TOKEN is oha_/opit_/opha_ — public product tools/call
  // rejects those. Prefer opsess_/opat_/CPC, including the dogfood opsess cache.
  if (!isProductMcpToken(env.OPUTE_MCP_TOKEN)) {
    env.OPUTE_MCP_TOKEN = productTokenFrom(env) || readOpsessCache(oputeRoot) || ''
  }
  if (!env.OPUTE_MCP_TOKEN && isLoopbackMcpUrl(env.OPUTE_MCP_ENDPOINT)) {
    env.OPUTE_MCP_TOKEN = 'dev-token'
  }

  if (!env.OPENROUTER_API_KEY && env.OPUTE_OPENROUTER_API_KEY) {
    env.OPENROUTER_API_KEY = env.OPUTE_OPENROUTER_API_KEY
  }

  return env
}

export function loopbackPortOpen(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

/**
 * If launch defaulted to loopback MCP and nothing is listening, use the
 * kubernetes public edge. An explicit OPUTE_MCP_ENDPOINT is never rewritten.
 */
export async function preferPublicMcpIfLoopbackDown(env, options = {}) {
  if (options.explicitEndpoint) return env
  if (env.OPUTE_MCP_ENDPOINT_LOCKED === '1') return env
  if (!isLoopbackMcpUrl(env.OPUTE_MCP_ENDPOINT)) return env
  const probe = options.probeLoopback || loopbackPortOpen
  const listening = await probe(9091, '127.0.0.1')
  if (listening) return env
  if (!isProductMcpToken(env.OPUTE_MCP_TOKEN)) {
    env.OPUTE_MCP_TOKEN = productTokenFrom(env) || readOpsessCache(options.oputeRoot) || env.OPUTE_MCP_TOKEN
  }
  if (!isProductMcpToken(env.OPUTE_MCP_TOKEN)) return env
  env.OPUTE_MCP_ENDPOINT = PUBLIC_MCP_URL
  return env
}
