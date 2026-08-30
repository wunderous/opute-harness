/**
 * The harness owns one implicit workspace. Extra DSH registry rows
 * (for example a leftover ~/github folder) steal first-item selection
 * and leave the composer on "Choose workspace" with the picker disabled.
 */
export function extraWorkspaceIds(workspaces, oputeDir) {
  const target = normalizePath(oputeDir)
  return (Array.isArray(workspaces) ? workspaces : [])
    .filter((workspace) => normalizePath(workspace && workspace.path) !== target)
    .map((workspace) => workspace.id)
    .filter(Boolean)
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/u, '')
}
