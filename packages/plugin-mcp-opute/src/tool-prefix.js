import { createHash } from 'node:crypto'

/** DNS namespace UUID bytes (`6ba7b810-9dad-11d1-80b4-00c04fd430c8`). */
const DNS_NAMESPACE = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')

/** UUID v5(DNS, "opute.host-agent.mcp-tool-prefix") — must match Go `ToolNamePrefixNamespace`. */
export const TOOL_NAME_PREFIX_NAMESPACE = '4e03155a-251e-592a-a89b-98a92a34631a'

function uuidV5Bytes(namespaceBytes, name) {
  const hash = createHash('sha1')
  hash.update(namespaceBytes)
  hash.update(name)
  const bytes = Buffer.from(hash.digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

const TOOL_PREFIX_NAMESPACE_BYTES = uuidV5Bytes(DNS_NAMESPACE, 'opute.host-agent.mcp-tool-prefix')

/** 8-hex MCP wire prefix derived solely from OPUTE_REMOTE_AGENT_ID. */
export function toolNamePrefix(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return ''
  return uuidV5Bytes(TOOL_PREFIX_NAMESPACE_BYTES, id).toString('hex').slice(0, 8)
}

export function wireToolName(prefix, catalogName) {
  const p = String(prefix || '').trim()
  const name = String(catalogName || '').trim()
  if (!p || !name) return name
  return `${p}_${name}`
}

export function catalogNameFromWire(prefix, wireName) {
  const p = String(prefix || '').trim()
  const name = String(wireName || '').trim()
  if (!p) return name
  const marker = `${p}_`
  return name.startsWith(marker) ? name.slice(marker.length) : name
}

export function hostAgentServerName(prefix) {
  return `h${String(prefix || '').trim()}`
}

export function isPrefixedCatalog(prefix, wireName) {
  const p = String(prefix || '').trim()
  const name = String(wireName || '').trim()
  return Boolean(p) && name.startsWith(`${p}_`) && name.length > p.length + 1
}
