/** Strip DSH MCP prefix and Opute wire prefix to a catalog local name. */
export function catalogLocalNameFromHarnessTool(toolName) {
  if (typeof toolName !== 'string' || toolName.length === 0) {
    return ''
  }
  let name = toolName
  const hostKernel = name.match(/^mcp__h([0-9a-f]{8})__(.+)$/)
  if (hostKernel) {
    name = hostKernel[2]
    const prefix = hostKernel[1]
    if (name.startsWith(`${prefix}_`)) {
      name = name.slice(prefix.length + 1)
    }
  }
  if (name.startsWith('mcp__opute__')) {
    name = name.slice('mcp__opute__'.length)
  }
  const wire = name.match(/^(?:platform|incus|k3s|aggregator|db|task-ledger|platform-agent|host)__(.+)$/)
  if (wire) {
    return wire[1]
  }
  const prefixed = name.match(/^([0-9a-f]{8})_(.+)$/)
  if (prefixed) {
    return prefixed[2]
  }
  return name
}

export const INVENTORY_LOCAL_NAMES = [
  'list_vms',
  'list_managed_vms',
  'list_managed_clusters',
  'list_postgresql_databases',
]

export const INVENTORY_SLOT_KEYS = [
  ...INVENTORY_LOCAL_NAMES,
  ...INVENTORY_LOCAL_NAMES.map((local) => `mcp__opute__${local}`),
  'mcp__opute__host__list_vms',
  'mcp__opute__incus__list_vms',
  'mcp__opute__platform__list_managed_vms',
  'mcp__opute__platform__list_managed_clusters',
  'mcp__opute__platform__list_postgresql_databases',
]

export const OPUTE_MCP_TOOL_PREFIX = 'mcp__opute__'

export const BLOCKED_HOST_TOOL_NAMES = [
  'bash',
  'pwsh',
  'powershell',
  'read_file',
  'write_file',
  'str_replace',
  'str_replace_based_edit_tool',
  'glob',
  'grep',
  'list_dir',
]
