/**
 * Parse a DSH `tool.call.toolview` block into inventory rows.
 * Settled nodes are ToolResultNode: `{ kind: 'tool-result', content: ContentBlock[] }`.
 * They do not have `output` or `result.output` — those guesses yield "No rows"
 * while the model still sees the compacted JSON and reprints a markdown table.
 */

export function textFromContentBlocks(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

export function parsePayload(block) {
  if (!block || typeof block !== 'object') return null
  let raw = ''
  if (typeof block.output === 'string') raw = block.output
  else if (Array.isArray(block.content)) raw = textFromContentBlocks(block.content)
  else if (block.result && Array.isArray(block.result.content)) {
    raw = textFromContentBlocks(block.result.content)
  } else if (block.result && typeof block.result.output === 'string') {
    raw = block.result.output
  }
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { text: raw }
  }
}

function listFromObject(payload) {
  if (!payload || typeof payload !== 'object') return null
  const list = payload.vms
    || payload.clusters
    || payload.databases
    || payload.items
    || payload.results
    || payload.instances
  return Array.isArray(list) ? list : null
}

export function rowsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return []
  const direct = listFromObject(payload)
  if (direct) return direct.slice(0, 24).map(formatRow)
  if (payload.structuredContent && typeof payload.structuredContent === 'object') {
    const nested = rowsFromPayload(payload.structuredContent)
    if (nested.length > 0) return nested
  }
  if (Array.isArray(payload.content)) {
    const innerRaw = textFromContentBlocks(payload.content)
    if (innerRaw) {
      try {
        return rowsFromPayload(JSON.parse(innerRaw))
      } catch {
        return []
      }
    }
  }
  return []
}

function formatRow(item) {
  if (!item || typeof item !== 'object') return String(item)
  const name = item.name || item.id || item.vmName || item.clusterId || item.logicalVmId
  if (!name) return JSON.stringify(item)
  if (typeof item.status === 'string' && item.status) return `${name} · ${item.status}`
  return String(name)
}

export function isRunningToolBlock(block) {
  if (!block || typeof block !== 'object') return false
  // DSH ToolCallBlock is running XOR settled; settled is `'kind' in block`.
  return !('kind' in block)
}
