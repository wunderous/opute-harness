export const name = 'opute-tool-lockdown'
export const inject = ['tools']

const BLOCKED = new Set([
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
])

function isBlockedHostTool(name) {
  const lower = String(name).toLowerCase()
  if (BLOCKED.has(lower)) {
    return true
  }
  return [...BLOCKED].some((blocked) => lower.startsWith(`${blocked}_`))
}

/** Deny local shell/fs tools if a preset reintroduces them. MCP tools stay allowed. */
export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (isBlockedHostTool(exec.name)) {
      return {
        kind: 'deny',
        reason: `Opute harness disables host tool "${exec.name}"`,
      }
    }
    return next()
  })
}
