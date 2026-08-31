import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  BRANDED_COPY,
  DSH_PRODUCT_TITLES,
  OPUTE_MARK_PATH,
  OPUTE_PRODUCT_TITLE,
  oputeFaviconHref,
  oputeFaviconSvg,
  replaceBrandedCopy,
  rewriteProductTitle,
} from './brand.js'

test('rewriteProductTitle replaces DSH product suffixes', () => {
  assert.equal(rewriteProductTitle('DeepSeek Harness'), 'Opute')
  assert.equal(rewriteProductTitle('DSH Local Build'), 'Opute')
  assert.equal(rewriteProductTitle('DSH 本地构建'), 'Opute')
  assert.equal(rewriteProductTitle('New chat — DeepSeek Harness'), 'New chat — Opute')
  assert.equal(rewriteProductTitle('New chat — DSH Local Build'), 'New chat — Opute')
  assert.equal(rewriteProductTitle('Opute'), 'Opute')
  assert.equal(rewriteProductTitle('deepseek/deepseek-chat'), 'deepseek/deepseek-chat')
})

test('replaceBrandedCopy rewrites chrome copy and leaves model ids', () => {
  assert.equal(replaceBrandedCopy('Into the Unknown'), 'Opute')
  assert.equal(replaceBrandedCopy('探索未至之境'), 'Opute')
  assert.equal(
    replaceBrandedCopy('You are an AI agent powered by DeepSeek Harness.'),
    'You are an AI agent powered by Opute.',
  )
  assert.equal(replaceBrandedCopy('deepseek/deepseek-chat'), 'deepseek/deepseek-chat')
  assert.equal(BRANDED_COPY.length > 0, true)
  assert.equal(DSH_PRODUCT_TITLES.includes('DeepSeek Harness'), true)
})

test('favicon is an Opute house mark with a dark-mode fill', () => {
  const svg = oputeFaviconSvg()
  assert.equal(svg.includes(OPUTE_MARK_PATH), true)
  assert.equal(svg.includes('prefers-color-scheme: dark'), true)
  assert.equal(oputeFaviconHref().startsWith('data:image/svg+xml,'), true)
  assert.equal(OPUTE_PRODUCT_TITLE, 'Opute')
})

test('lib/client.js keeps the brand overlay in sync', () => {
  const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js'), 'utf8')
  assert.equal(client.includes(OPUTE_MARK_PATH), true)
  assert.equal(client.includes("data-opute-brand-mark"), true)
  assert.equal(client.includes("data-opute-brand-name"), true)
  assert.equal(client.includes('applyOputeChrome'), true)
  assert.equal(client.includes("id: 'welcome-notice'"), true)
  assert.equal(client.includes("id: 'deepseek-official'"), true)
})
