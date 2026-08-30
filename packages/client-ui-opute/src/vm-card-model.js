/**
 * Map a list_vms / list_managed_vms payload onto the fields VmSummaryCard
 * shows in platform.opute.io/chat. DSH has no InfrastructureContext, so the
 * card is a snapshot of the tool result (no live merge, no detail-route Link).
 */

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function listFromPayload(payload) {
  if (!isRecord(payload)) return []
  const list = payload.vms || payload.instances || payload.items
  if (Array.isArray(list)) return list
  if (isRecord(payload.structuredContent)) return listFromPayload(payload.structuredContent)
  return []
}

export function vmItemsFromPayload(payload) {
  return listFromPayload(payload).filter(isRecord).slice(0, 24)
}

export function sortSummaryIps(ipv4) {
  if (!Array.isArray(ipv4)) return typeof ipv4 === 'string' && ipv4 ? [ipv4] : []
  return ipv4.filter((item) => typeof item === 'string' && item.length > 0)
}

export function getSummaryStatusVariant(status) {
  switch (String(status || '').toLowerCase()) {
    case 'running':
    case 'ready':
    case 'connected':
      return 'secondary'
    case 'error':
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

function firstDefined(sources, keys) {
  for (const source of sources) {
    if (!isRecord(source)) continue
    for (const key of keys) {
      const value = source[key]
      if (value !== undefined && value !== null && value !== '') return value
    }
  }
  return undefined
}

export function toVmCardModel(item) {
  if (!isRecord(item)) return null
  const meta = isRecord(item.metadata) ? item.metadata : {}
  const additional = isRecord(item.additionalInfo) ? item.additionalInfo : {}
  const sources = [item, meta, additional]
  const name = firstDefined(sources, ['name', 'id', 'logicalVmId', 'vmName'])
  if (!name) return null
  const status = firstDefined(sources, ['status', 'state']) || 'unknown'
  const hostLabel = firstDefined(sources, ['hostAgentId', 'hostId']) || ''
  const identity = firstDefined(sources, ['logicalVmId', 'id'])
  return {
    name: String(name),
    cardKey: String(identity || `${name}:${hostLabel}`),
    status: String(status),
    providerId: String(firstDefined(sources, ['providerId']) || 'incus'),
    hostLabel,
    kind: firstDefined(sources, ['kind']) || 'vm',
    cpus: firstDefined(sources, ['cpus']),
    memory: firstDefined(sources, ['memory']),
    disk: firstDefined(sources, ['disk']),
    ipv4: sortSummaryIps(firstDefined(sources, ['ipv4'])),
    osRelease: firstDefined(sources, ['osRelease', 'release']) || '',
    k3sInstalled: firstDefined(sources, ['k3sInstalled']) === true,
    agentReady: firstDefined(sources, ['agentReady']),
    statusVariant: getSummaryStatusVariant(status),
  }
}
