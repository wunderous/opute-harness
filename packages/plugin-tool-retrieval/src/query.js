export function textFromUserMessage(message) {
  if (message?.source?.kind === 'tool') return ''
  if (!Array.isArray(message?.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text.trim())
    }
  }
  return parts.join('\n').trim()
}

export function createQueryStore() {
  const queries = new WeakMap()
  const turns = new WeakMap()
  return {
    remember(agent, message, turn) {
      const text = textFromUserMessage(message)
      if (!agent || !text) return
      queries.set(agent, text)
      if (typeof turn === 'number' && Number.isFinite(turn)) turns.set(agent, turn)
    },
    queryFor(agent) {
      return agent ? (queries.get(agent) || '') : ''
    },
    turnFor(agent) {
      return agent && turns.has(agent) ? turns.get(agent) : 0
    },
  }
}
