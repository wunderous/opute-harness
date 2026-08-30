import { catalogLocalName } from './local-name.js'

/**
 * Purpose / when-not-to-use / examples copied from Platform
 * CHAT_TOOL_DESCRIPTIONS for the inventory homonyms. Do not also dump this
 * into the system prompt — that masks whether ranking and MCP descriptions
 * actually steer the model.
 */
const DESCRIPTIONS = {
  list_managed_vms: {
    purpose: 'List all durable virtual machines known to Opute across all onboarded Host Agents, using each VM\'s stable logical UUID. This is the tool for "list the vms", "list my vms", and "show my virtual machines". Call with {}.',
    whenNotToUse: 'Do not use for live provider state on one host; use mcp__opute__host__list_vms with {}.',
    examples: ['list the vms', 'list my vms', 'list all durable vms'],
  },
  list_vms: {
    purpose: 'List live Incus virtual machines and system containers on the Host Agent that owns this catalog entry. Call with {}. Do not pass a host agent id.',
    whenNotToUse: 'Do not use for a global "list the vms" request; that is mcp__opute__platform__list_managed_vms with {}.',
    examples: ['list all vms on host', 'list the live vms on this host'],
  },
  list_agents: {
    purpose: 'List connected host agents and heartbeat status. Returns host connectivity (id, name, type, status), not VM names.',
    whenNotToUse: 'Do not use for VM, cluster, or database inventory. "list the vms" is mcp__opute__platform__list_managed_vms with {}.',
    examples: ['list host agents', 'which hosts are connected'],
  },
  lxc_list: {
    purpose: 'Incus CLI on one host. Requires explicit hostId. Not VM inventory.',
    whenNotToUse: 'Do not use for "list the vms". Use mcp__opute__platform__list_managed_vms with {}.',
    examples: [],
  },
}

function formatDescription(entry, fallback) {
  if (!entry) return fallback
  const examples = entry.examples.length > 0
    ? ` Examples: ${entry.examples.map((example) => `"${example}"`).join('; ')}.`
    : ''
  return `${entry.purpose} When not to use: ${entry.whenNotToUse}.${examples}`
}

export function describeCatalogTool(rawName, fallback = '') {
  const local = catalogLocalName(rawName)
  const fallbackText = typeof fallback === 'string' ? fallback : ''
  return formatDescription(DESCRIPTIONS[local], fallbackText)
}
