#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hydrateHarnessMcpEnv, preferPublicMcpIfLoopbackDown } from './hydrate-mcp-env.js'
import { resolveLaunchTokenFile } from './launch-token-path.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const presetRoot = path.join(root, 'packages', 'bundle-opute-web', 'presets')
const patch = path.join(root, 'packages', 'bundle-opute-web', 'cordis.source.patch.yml')
const dshRoot = process.env.DSH_ROOT
  ? path.resolve(process.env.DSH_ROOT)
  : path.resolve(root, '..', 'deepseek-harness')
const launchTokenFile = resolveLaunchTokenFile(process.env.OPUTE_HARNESS_LAUNCH_TOKEN_FILE, homedir())

process.env.OPUTE_HARNESS_PRESET_ROOT ??= presetRoot
const explicitEndpoint = Boolean(process.env.OPUTE_MCP_ENDPOINT)
hydrateHarnessMcpEnv(process.env, { root })
await preferPublicMcpIfLoopbackDown(process.env, {
  explicitEndpoint,
  oputeRoot: path.join(root, '..', 'opute'),
})
console.info(`opute-web: MCP ${process.env.OPUTE_MCP_ENDPOINT}`)

const oputeModules = path.join(root, 'node_modules')
process.env.NODE_PATH = [oputeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)

const port = process.env.OPUTE_HARNESS_PORT || '3080'
const extra = process.argv.slice(2)
const defaultArgs = [
  'web',
  '--patch',
  patch,
  '--no-open',
  '--port',
  port,
  '--trusted-host',
  'harness.opute.io',
]
const dshArgs = extra[0] === 'web' || extra[0] === '--profile' || extra.includes('--help')
  ? extra
  : [...defaultArgs, ...extra]

const { cmd, args, cwd } = resolveDshCommand(dshArgs)
const child = spawn(cmd, args, {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
  cwd,
  shell: process.platform === 'win32' && !cmd.endsWith('node') && !cmd.endsWith('node.exe'),
})
let stdoutBuf = ''
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  stdoutBuf += String(chunk)
  if (stdoutBuf.length > 16_384) stdoutBuf = stdoutBuf.slice(-8_192)
  writeLaunchTokenFromOutput(stdoutBuf)
})
child.on('exit', (code) => process.exit(code ?? 1))

function writeLaunchTokenFromOutput(text) {
  const match = /dsh web: (https?:\/\/[^\s]+)/.exec(text)
  if (!match) return
  let token = ''
  try {
    token = new URL(match[1]).searchParams.get('token') || ''
  } catch {
    return
  }
  if (!token) return
  mkdirSync(path.dirname(launchTokenFile), { recursive: true, mode: 0o700 })
  writeFileSync(launchTokenFile, token, { mode: 0o600 })
}

/**
 * Prefer the sibling DSH source CLI (`pnpm dsh` / tsx bin) so `dsh web` is the
 * profile that actually mounts the GUI. Custom `opute-web` alone is dsh-base.
 * @param {string[]} forwarded
 */
function resolveDshCommand(forwarded) {
  if (process.env.DSH_BIN) {
    return { cmd: process.env.DSH_BIN, args: forwarded, cwd: root }
  }
  const binTs = path.join(dshRoot, 'apps', 'cli', 'src', 'bin.ts')
  if (existsSync(binTs)) {
    return {
      cmd: process.execPath,
      args: ['--import', 'tsx/esm', binTs, ...forwarded],
      cwd: dshRoot,
    }
  }
  return { cmd: 'dsh', args: forwarded, cwd: root }
}
