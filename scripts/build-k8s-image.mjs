#!/usr/bin/env node
/**
 * Build the K3s Harness image from the two sibling repositories without
 * copying local credentials or transient run evidence into the image.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = path.resolve(root, '..', 'deepseek-harness')
const runtime = process.env.CONTAINER_RUNTIME || 'podman'
const image = process.env.OPUTE_K8S_IMAGE || 'localhost/opute-harness:k3s'
const contextParent = mkdtempSync(path.join(tmpdir(), 'opute-k8s-context-'))
const context = path.join(contextParent, 'context')

function shouldCopy(relative) {
  if (!relative) return true
  const parts = relative.split(path.sep)
  if (parts.some(part => ['.git', 'tmp', '.cache', '.pnpm-store'].includes(part))) return false
  const basename = parts.at(-1) || ''
  return !(/^\.env(?:\.|$)/u.test(basename)
    || /\.(?:token|pem|key|secret)$/iu.test(basename))
}

function copyRepository(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    force: true,
    // Keep pnpm links as links.  The Dockerfile rewrites any absolute
    // developer-checkout targets after COPY without traversing link cycles.
    dereference: false,
    filter: sourcePath => shouldCopy(path.relative(source, sourcePath)),
  })
}

try {
  copyRepository(root, path.join(context, 'opute-harness'))
  copyRepository(dshRoot, path.join(context, 'deepseek-harness'))
  cpSync(path.join(root, 'deploy', 'Dockerfile.k8s'), path.join(context, 'Dockerfile.k8s'))
  writeFileSync(path.join(context, '.dockerignore'), [
    '.git',
    '**/.git',
    '**/tmp',
    '**/.cache',
    '**/.pnpm-store',
    '**/.env',
    '**/.env.*',
    '**/*.token',
    '**/*.pem',
    '**/*.key',
    '**/*.secret',
  ].join('\n') + '\n')

  const args = ['build']
  if (runtime === 'podman') args.push('--format=oci')
  args.push('--tag', image, '--file', path.join(context, 'Dockerfile.k8s'), context)
  const result = spawnSync(runtime, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  rmSync(contextParent, { recursive: true, force: true })
}
