import { mkdir } from 'node:fs/promises'
import { extraWorkspaceIds } from './keep-only-opute.js'
import { liveDefaultSelection } from './live-default.js'
import { oputeWorkspaceDir } from './workspace-dir.js'

export const name = 'opute-workspace-seed'
export const inject = ['workspaceRegistry', 'agentDefaultModel', 'llm']

/**
 * DSH sessions are keyed by a workspace directory. Opute has no user-facing
 * folder; this row creates one implicit path so New Chat works with the
 * directory picker disabled.
 */
export async function apply(ctx) {
  const dir = oputeWorkspaceDir()
  await mkdir(dir, { recursive: true })
  const opute = await ctx.workspaceRegistry.create(dir, 'Opute')
  const extras = extraWorkspaceIds(ctx.workspaceRegistry.list(), opute.path)
  for (const id of extras) await ctx.workspaceRegistry.delete(id)

  // Settings.yaml can keep an llm-deepseek default after that adapter is disabled.
  // The composition overlay loses to that user layer, so rewrite it here.
  const next = liveDefaultSelection(
    ctx.llm.listProviders().map((provider) => provider.id),
    ctx.agentDefaultModel.currentSelection(),
  )
  if (next) await ctx.agentDefaultModel.saveSelection(next)
}
