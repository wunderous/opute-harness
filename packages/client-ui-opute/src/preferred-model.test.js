import assert from 'node:assert/strict'
import test from 'node:test'
import { candidateSelections } from './preferred-model.js'

test('prefers a named OpenRouter model over catalog order', () => {
  const [first] = candidateSelections([
    {
      id: 'openrouter',
      models: [
        { id: 'ai21/jamba-large-1.7' },
        { id: 'anthropic/claude-haiku-4.5' },
      ],
    },
  ])
  assert.equal(first.provider, 'openrouter')
  assert.equal(first.model, 'anthropic/claude-haiku-4.5')
})

test('falls through to Ollama when OpenRouter is missing', () => {
  const [first] = candidateSelections([
    { id: 'ollama', models: [{ id: 'mistral' }, { id: 'llama3.2' }] },
  ])
  assert.equal(first.provider, 'ollama')
  assert.equal(first.model, 'llama3.2')
})

test('copies the advertised default effort', () => {
  const [first] = candidateSelections([
    {
      id: 'openrouter',
      models: [{ id: 'anthropic/claude-haiku-4.5', reasoning: { defaultEffort: 'medium' } }],
    },
  ])
  assert.equal(first.reasoningEffort, 'medium')
})
