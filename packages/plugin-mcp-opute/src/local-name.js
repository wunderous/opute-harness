/** Strip DSH MCP prefix and Opute wire prefix to a catalog local name. */
export function catalogLocalName(toolName) {
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

export const HOST_KERNEL_PUBLIC_PREFIX = /^mcp__h[0-9a-f]{8}__/

export function isHarnessMcpToolName(name) {
  return typeof name === 'string'
    && (name.startsWith('mcp__opute__') || HOST_KERNEL_PUBLIC_PREFIX.test(name))
}
