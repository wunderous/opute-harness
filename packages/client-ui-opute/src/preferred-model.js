export const OPENROUTER_PREFERRED = [
  'ibm-granite/granite-4.2-8b',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'deepseek/deepseek-chat',
]

export const OLLAMA_PREFERRED = ['llama3.2', 'qwen2.5', 'mistral']

function selectionOf(provider, model) {
  const sel = { provider, model: model.id }
  if (model.reasoning && model.reasoning.defaultEffort) {
    sel.reasoningEffort = model.reasoning.defaultEffort
  }
  return sel
}

function groupModel(group, modelId) {
  if (!group || !Array.isArray(group.models)) return null
  const model = group.models.find((entry) => entry.id === modelId)
  return model ? selectionOf(group.id, model) : null
}

function firstModel(group) {
  if (!group || !group.models || !group.models[0]) return null
  return selectionOf(group.id, group.models[0])
}

/**
 * Ordered live routes for a session whose current provider is not mounted.
 * OpenRouter first, then Ollama, then any remaining advertised group.
 * @param {readonly { id: string, models: readonly { id: string, reasoning?: { defaultEffort?: string } }[] }[]} groups
 */
export function candidateSelections(groups) {
  const list = Array.isArray(groups) ? groups : []
  const byId = Object.fromEntries(list.map((group) => [group.id, group]))
  const out = []
  const seen = new Set()
  const add = (sel) => {
    if (!sel) return
    const key = `${sel.provider}\0${sel.model}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(sel)
  }
  const openrouter = byId.openrouter
  if (openrouter) {
    for (const id of OPENROUTER_PREFERRED) add(groupModel(openrouter, id))
    add(firstModel(openrouter))
  }
  const ollama = byId.ollama
  if (ollama) {
    for (const id of OLLAMA_PREFERRED) add(groupModel(ollama, id))
    add(firstModel(ollama))
  }
  for (const group of list) add(firstModel(group))
  return out
}
