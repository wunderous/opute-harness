import assert from 'node:assert/strict'
import test from 'node:test'
import {
  liveDefaultSelection,
  OPUTE_OLLAMA_DEFAULT_MODEL,
  OPUTE_OPENROUTER_DEFAULT_MODEL,
} from './live-default.js'

test('keeps a selection whose provider is still mounted', () => {
  assert.equal(
    liveDefaultSelection(['openrouter', 'ollama'], { provider: 'openrouter', model: 'openai/gpt-4o' }),
    null,
  )
})

test('rewrites an official DeepSeek default onto OpenRouter', () => {
  assert.deepEqual(
    liveDefaultSelection(['openrouter', 'ollama'], { provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    { provider: 'openrouter', model: OPUTE_OPENROUTER_DEFAULT_MODEL },
  )
})

test('falls back to Ollama when OpenRouter is absent', () => {
  assert.deepEqual(
    liveDefaultSelection(['ollama'], { provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    { provider: 'ollama', model: OPUTE_OLLAMA_DEFAULT_MODEL },
  )
})

test('returns null when no live provider exists', () => {
  assert.equal(liveDefaultSelection([], { provider: 'deepseek-official', model: 'x' }), null)
})
