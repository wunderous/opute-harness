import { catalogLocalName } from './local-name.js'

/**
 * Host-ops tools Platform chat keeps off the model surface even when MCP
 * lists them. DSH has no retrieval ranker, so omitting them here is the
 * harness analog of CHAT_HOST_ONLY_TOOL_NAMES.
 */
export const HARNESS_HOST_ONLY_LOCAL_NAMES = new Set([
  'get_host_health',
  'delete_host_agent',
  'diagnose_bridge',
  'recover_bridge',
])

/**
 * DSH injects every registered tool into the native tool list. Incus CLI
 * (`lxc_*`) is provider implementation, not product inventory; MCP Host now
 * withholds it from `tools/list`. Keep omitting here as fail-closed in case
 * a catalog refresh races or an older host still advertises the CLI.
 */
export function shouldRegisterCatalogTool(rawName) {
  const local = catalogLocalName(rawName)
  if (!local) return false
  if (local === 'lxc_list' || local.startsWith('lxc_')) return false
  if (HARNESS_HOST_ONLY_LOCAL_NAMES.has(local)) return false
  return true
}
