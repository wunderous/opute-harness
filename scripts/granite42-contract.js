/**
 * Exact tool names used by the Granite 4.2 acceptance probe.
 *
 * The public Harness surface is backed by the DSH platform namespace. A local
 * Harness pointed directly at Platform Bridge exposes the same capability
 * without that namespace. Keep both surfaces explicit so a local probe cannot
 * silently accept an arbitrary tool name.
 */
export const GRANITE42_SURFACES = Object.freeze({
  public: Object.freeze({
    expectedTool: 'mcp__opute__platform__list_managed_vms',
    promptTool: 'mcp__opute__platform__list_managed_vms',
  }),
  'local-bridge': Object.freeze({
    expectedTool: 'mcp__opute__list_managed_vms',
    promptTool: 'mcp__opute__list_managed_vms',
  }),
})

export function resolveGranite42Surface(value = 'public') {
  const name = String(value).trim()
  if (!Object.hasOwn(GRANITE42_SURFACES, name)) {
    throw new Error(
      `HARNESS_GRANITE42_SURFACE must be one of: ${Object.keys(GRANITE42_SURFACES).join(', ')}`,
    )
  }
  return { name, ...GRANITE42_SURFACES[name] }
}
