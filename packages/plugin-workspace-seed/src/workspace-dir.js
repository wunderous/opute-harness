import os from 'node:os'
import path from 'node:path'

/** Directory registered as the single implicit Opute workspace. */
export function oputeWorkspaceDir(env = process.env) {
  if (env.OPUTE_HARNESS_WORKSPACE_DIR) return env.OPUTE_HARNESS_WORKSPACE_DIR
  const home = env.DSH_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.dsh')
  return path.join(home, 'opute-workspace')
}
