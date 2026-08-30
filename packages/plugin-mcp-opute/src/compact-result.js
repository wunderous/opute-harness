import { catalogLocalName } from './local-name.js'

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Identity + card fields the model may keep for chaining. Matches Platform
 * MODEL_OUTPUT_ROW_FIELDS so a list_agents dump cannot pollute the next turn
 * with capability arrays. VM rows keep the stats VmSummaryCard renders.
 */
const VM_CARD_FIELDS = [
  'logicalVmId',
  'name',
  'id',
  'status',
  'state',
  'hostAgentId',
  'hostId',
  'providerId',
  'clusterId',
  'kind',
  'cpus',
  'memory',
  'disk',
  'ipv4',
  'osRelease',
  'release',
  'k3sInstalled',
  'agentReady',
]

const ROW_SPECS = {
  list_agents: { key: 'agents', fields: ['id', 'name', 'type', 'status', 'lastSeen', 'providerId'] },
  list_vms: { key: 'vms', fields: VM_CARD_FIELDS },
  list_managed_vms: { key: 'vms', fields: VM_CARD_FIELDS },
}

function pickRow(row, fields) {
  if (!isRecord(row)) return undefined
  const compacted = {}
  for (const field of fields) {
    const value = row[field]
    if (value !== undefined && value !== null && value !== '') {
      compacted[field] = value
    }
  }
  return compacted
}

function extractJsonPayload(result) {
  if (isRecord(result?.structuredContent)) return result.structuredContent
  const content = result?.content
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') continue
    const trimmed = block.text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  return null
}

function rowsForSpec(payload, spec) {
  if (Array.isArray(payload)) return payload
  if (isRecord(payload) && Array.isArray(payload[spec.key])) return payload[spec.key]
  if (isRecord(payload) && spec.key === 'vms' && Array.isArray(payload.instances)) {
    return payload.instances
  }
  return null
}

function flattenVmRow(row) {
  if (!isRecord(row)) return undefined
  const meta = isRecord(row.metadata) ? row.metadata : {}
  const additional = isRecord(row.additionalInfo) ? row.additionalInfo : {}
  return pickRow({ ...additional, ...meta, ...row }, VM_CARD_FIELDS)
}

export function compactPayload(localName, payload) {
  const spec = ROW_SPECS[localName]
  if (!spec) return payload
  const rows = rowsForSpec(payload, spec)
  if (!rows) return payload
  const mapper = spec.key === 'vms' ? flattenVmRow : (row) => pickRow(row, spec.fields)
  return { [spec.key]: rows.map(mapper).filter(Boolean) }
}

/**
 * Rewrite MCP tool results before they enter the next model turn.
 * list_agents otherwise returns full capability catalogs (~100 tools each).
 */
export function compactMcpResult(rawName, result) {
  const local = catalogLocalName(rawName)
  if (!ROW_SPECS[local] || !isRecord(result)) return result
  const payload = extractJsonPayload(result)
  if (payload == null) return result
  const compacted = compactPayload(local, payload)
  if (compacted === payload) return result
  return {
    ...result,
    structuredContent: compacted,
    content: [{ type: 'text', text: JSON.stringify(compacted) }],
  }
}
