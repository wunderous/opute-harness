import assert from 'node:assert/strict'
import test from 'node:test'
import { candidateSelections } from './preferred-model.js'

test('prefers a named OpenRouter model over catalog order', () => {
  const [first] = candidateSelections([
    {
      id: 'openrouter',
      models: [
        { id: 'ai21/jamba-large-1.7' },
        { id: 'ibm-granite/granite-4.2-8b' },
      ],
    },
  ])
  assert.equal(first.provider, 'openrouter')
  assert.equal(first.model, 'ibm-granite/granite-4.2-8b')
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
      models: [{ id: 'ibm-granite/granite-4.2-8b', reasoning: { defaultEffort: 'medium' } }],
    },
  ])
  assert.equal(first.reasoningEffort, 'medium')
})
