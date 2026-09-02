#!/usr/bin/env node
/**
 * Static coexistence proofs. Live CHAT_PASS remains an operator gate against
 * platform.opute.io (does not require this process to be public yet).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const oputeRoot = path.resolve(root, '..', 'opute')
const lockdown = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-tool-lockdown.js')], {
  encoding: 'utf8',
})
if (lockdown.status !== 0) {
  process.stderr.write(lockdown.stdout + lockdown.stderr)
  process.exit(lockdown.status ?? 1)
}

const routerPath = path.join(oputeRoot, 'packages', 'web', 'src', 'router.tsx')
if (!existsSync(routerPath)) {
  console.error(`missing Platform router at ${routerPath}`)
  process.exit(1)
}
const router = readFileSync(routerPath, 'utf8')
if (!router.includes("path: 'chat'") && !router.includes('path: "chat"')) {
  console.error('Platform /chat route missing from router.tsx')
  process.exit(1)
}

const helmValues = readFileSync(
  path.join(oputeRoot, 'deploy', 'helm', 'opute-cell', 'values-platform-opute-io.yaml'),
  'utf8',
)
if (!helmValues.includes('https://harness.opute.io')) {
  console.error('values-platform-opute-io.yaml must list https://harness.opute.io')
  process.exit(1)
}

const tunnel = readFileSync(
  path.join(oputeRoot, 'deploy', 'helm', 'opute-cell', 'cloudflare-tunnel-platform-opute-io.example.yaml'),
  'utf8',
)
if (tunnel.includes('harness.opute.io') || tunnel.includes('127.0.0.1:3080')) {
  console.error('platform tunnel example must not claim the host-local Harness DSH target')
  process.exit(1)
}

const harnessRecipe = readFileSync(path.join(root, 'recipes', 'harness-opute-io.yaml'), 'utf8')
if (!harnessRecipe.includes('hostname:\n    default: harness.opute.io')
  || !harnessRecipe.includes('localTarget:\n    default: http://127.0.0.1:3080')) {
  console.error('Harness recipe must own harness.opute.io to 127.0.0.1:3080')
  process.exit(1)
}

console.log('OPUTE_HARNESS_COEXISTENCE_PASS router=/chat helm=harness.opute.io dedicated-recipe=:3080')

if (process.env.OPUTE_HARNESS_SKIP_PUBLIC_CURL === '1') {
  process.exit(0)
}

const chatUrl = process.env.OPUTE_WEB_URL
  ? `${process.env.OPUTE_WEB_URL.replace(/\/$/, '')}/chat`
  : 'https://platform.opute.io/chat'

const curl = spawnSync('curl', ['-sfL', '-o', '/dev/null', '-w', '%{http_code}', chatUrl], { encoding: 'utf8' })
const code = (curl.stdout || '').trim()
if (curl.status !== 0 || (code !== '200' && code !== '403')) {
  console.error(`platform chat GET ${chatUrl} failed status=${curl.status} http=${code}`)
  console.error('Cloudflare bot challenge may yield 403 from this environment; that is not a /chat deletion.')
  console.error('Operator gate: OPUTE_WEB_URL=https://platform.opute.io bun scripts/validate-chat-host-llm.ts → CHAT_PASS')
  process.exit(1)
}

console.log(`public chat ${chatUrl} http=${code}`)
