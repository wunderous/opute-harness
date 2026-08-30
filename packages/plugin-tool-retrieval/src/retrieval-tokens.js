/**
 * Same normalization as `opute/packages/shared/src/retrieval/retrieval-tokens.ts`.
 * Ranking is a DSH overlay; this file must not drift from that contract.
 */

const RETRIEVAL_STOP_WORDS = new Set([
  'a', 'an', 'all', 'and', 'for', 'from', 'in', 'is', 'my', 'of', 'on', 'please',
  'show', 'the', 'to', 'what', 'which', 'with', 'you',
])

function canonicalToken(token) {
  switch (token) {
    case 'db':
    case 'dbs':
    case 'database':
    case 'databases':
      return 'database'
    case 'vm':
    case 'vms':
    case 'virtual':
    case 'machine':
    case 'machines':
      return 'vm'
    case 'agent':
    case 'agents':
      return 'agent'
    case 'cluster':
    case 'clusters':
      return 'cluster'
    case 'namespace':
    case 'namespaces':
      return 'namespace'
    default:
      return token
  }
}

export function normalizeRetrievalText(userText) {
  return userText
    .replace(/__/g, ' ')
    .toLowerCase()
    .replace(/\bvirtual\s+machines?\b/g, 'vm')
    .replace(/\bv\s+m\s+s\b/g, 'vms')
    .replace(/\bv\s+ms\b/g, 'vms')
    .replace(/\bvm\s+s\b/g, 'vms')
}

export function retrievalTokens(userText) {
  return normalizeRetrievalText(userText)
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalToken)
}

export function retrievalSignalTokens(tokens) {
  return tokens.filter((token) => !RETRIEVAL_STOP_WORDS.has(token))
}

export function hasRetrievalTokenSequence(tokens, sequence) {
  const normalized = sequence.map(canonicalToken)
  for (let start = 0; start <= tokens.length - normalized.length; start += 1) {
    if (normalized.every((token, offset) => tokens[start + offset] === token)) {
      return true
    }
  }
  return false
}
