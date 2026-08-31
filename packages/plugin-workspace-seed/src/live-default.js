export const OPUTE_OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
export const OPUTE_OLLAMA_DEFAULT_MODEL = 'llama3.2'

/**
 * Pick a routable default when the saved/composition selection names a
 * provider this overlay no longer mounts (stock is the llm-deepseek adapter).
 * @param {string[]} providerIds
 * @param {{ provider?: string, model?: string } | null | undefined} current
 * @returns {{ provider: string, model: string } | null}
 */
export function liveDefaultSelection(providerIds, current) {
  const ids = Array.isArray(providerIds) ? providerIds : []
  if (current && ids.includes(current.provider)) return null
  if (ids.includes('openrouter')) {
    return { provider: 'openrouter', model: OPUTE_OPENROUTER_DEFAULT_MODEL }
  }
  if (ids.includes('ollama')) {
    return { provider: 'ollama', model: OPUTE_OLLAMA_DEFAULT_MODEL }
  }
  return null
}
