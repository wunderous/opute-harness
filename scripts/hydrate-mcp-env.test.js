import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hydrateHarnessMcpEnv, isHostKernelToken, isHostScopedMcpToken, isLoopbackMcpUrl, listLocalHostAgentKernels, parseEnvFile, parseHostAgentMcpServersEnv, preferPublicMcpIfLoopbackDown } from './hydrate-mcp-env.js'

test('parseEnvFile keeps only MCP/OpenRouter keys', () => {
  const parsed = parseEnvFile([
    'MCP_AUTH_TOKEN=cell-token',
    'OPUTE_MCP_URL=https://mcp.opute.io',
    'SECRET_OTHER=nope',
    '# MCP_AUTH_TOKEN=ignored',
  ].join('\n'))
  assert.equal(parsed.MCP_AUTH_TOKEN, 'cell-token')
  assert.equal(parsed.OPUTE_MCP_URL, 'https://mcp.opute.io')
  assert.equal(parsed.SECRET_OTHER, undefined)
})

test('hydrates public MCP URL and token from Host Agent env', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-env-'))
  const hostAgentEnvPath = path.join(dir, 'host-agent.env')
  writeFileSync(hostAgentEnvPath, [
    'OPUTE_MCP_URL=https://mcp.opute.io',
    'MCP_AUTH_TOKEN=cell-token-36charsxxxxxxxxxxxxxx',
  ].join('\n'))
  const env = hydrateHarnessMcpEnv({}, { hostAgentEnvPath, root: dir })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'https://mcp.opute.io/mcp')
  assert.equal(env.OPUTE_MCP_TOKEN, 'cell-token-36charsxxxxxxxxxxxxxx')
})

test('does not invent dev-token for the public MCP origin', () => {
  const env = hydrateHarnessMcpEnv({
    OPUTE_MCP_ENDPOINT: 'https://mcp.opute.io/mcp',
  }, { hostAgentEnvPath: '/no/such/host-agent.env', root: tmpdir() })
  assert.equal(env.OPUTE_MCP_TOKEN, '')
  assert.equal(isLoopbackMcpUrl('https://mcp.opute.io/mcp'), false)
})

test('falls back to mcp.opute.io when loopback 9091 is down and a cell token exists', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-public-'))
  const env = hydrateHarnessMcpEnv({
    MCP_AUTH_TOKEN: 'cell-token-36charsxxxxxxxxxxxxxx',
  }, { hostAgentEnvPath: path.join(dir, 'missing.env'), root: dir })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
  await preferPublicMcpIfLoopbackDown(env, { probeLoopback: async () => false })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'https://mcp.opute.io/mcp')
})

test('loopback MCP still defaults to the local-dev token and stays there', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-loopback-'))
  const env = hydrateHarnessMcpEnv({}, { hostAgentEnvPath: path.join(dir, 'missing.env'), root: dir })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
  assert.equal(env.OPUTE_MCP_TOKEN, 'dev-token')
  await preferPublicMcpIfLoopbackDown(env, { probeLoopback: async () => false })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
})

test('explicit loopback endpoint is not rewritten', async () => {
  const env = { OPUTE_MCP_ENDPOINT: 'http://127.0.0.1:9091/mcp', OPUTE_MCP_TOKEN: 'cell-token' }
  await preferPublicMcpIfLoopbackDown(env, { explicitEndpoint: true, probeLoopback: async () => false })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
})

test('host-scoped tokens are not treated as public product bearers', async () => {
  assert.equal(isHostScopedMcpToken('oha_local-host'), true)
  assert.equal(isHostScopedMcpToken('opha_product-host'), true)
  assert.equal(isHostScopedMcpToken('opsess_user-session'), false)
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-host-token-'))
  const env = hydrateHarnessMcpEnv({
    MCP_AUTH_TOKEN: 'oha_TFuSxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  }, { hostAgentEnvPath: path.join(dir, 'missing.env'), root: dir, oputeRoot: dir })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
  assert.equal(env.OPUTE_MCP_TOKEN, 'dev-token')
  await preferPublicMcpIfLoopbackDown(env, { probeLoopback: async () => false, oputeRoot: dir })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'http://127.0.0.1:9091/mcp')
})

test('opsess cache fails over to mcp.opute.io when :9091 is down', async () => {
  const oputeRoot = mkdtempSync(path.join(tmpdir(), 'opute-harness-opsess-'))
  const cacheDir = path.join(oputeRoot, 'tmp', 'dogfood-milestones')
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(path.join(cacheDir, 'mcp-bearer.cache.json'), JSON.stringify({
    token: 'opsess_cachedproducttokenxxxxxxxxxxxxxxxxx',
    at: new Date().toISOString(),
  }))
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-opsess-root-'))
  const env = hydrateHarnessMcpEnv({
    MCP_AUTH_TOKEN: 'oha_TFuSxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  }, { hostAgentEnvPath: path.join(dir, 'missing.env'), root: dir, oputeRoot })
  assert.equal(env.OPUTE_MCP_TOKEN.startsWith('opsess_'), true)
  await preferPublicMcpIfLoopbackDown(env, { probeLoopback: async () => false, oputeRoot })
  assert.equal(env.OPUTE_MCP_ENDPOINT, 'https://mcp.opute.io/mcp')
})

test('lists local host-agent kernels from instance env files and JSON', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opute-harness-kernels-'))
  const left = path.join(dir, 'host-zephyrus-ef47fbbf')
  const right = path.join(dir, 'host-workstation-e5059700')
  mkdirSync(left)
  mkdirSync(right)
  writeFileSync(path.join(left, 'host-agent.env'), [
    'OPUTE_REMOTE_AGENT_ID=host-zephyrus-ef47fbbf',
    'MCP_AUTH_TOKEN=oha_left-token',
    'HOST_MCP_PORT=3004',
  ].join('\n'))
  writeFileSync(path.join(right, 'host-agent.env'), [
    'OPUTE_REMOTE_AGENT_ID=host-workstation-e5059700',
    'MCP_AUTH_TOKEN=opsess_not-a-kernel',
    'HOST_MCP_PORT=3014',
  ].join('\n'))
  const kernels = listLocalHostAgentKernels({
    instancesDir: dir,
    env: {
      OPUTE_HOST_AGENT_MCP_SERVERS: JSON.stringify([
        { agentId: 'host-remote-1', url: 'http://10.0.0.8:3004/mcp', token: 'oha_remote' },
        { agentId: 'host-bad', url: 'http://10.0.0.9:3004/mcp', token: 'opsess_nope' },
      ]),
    },
  })
  assert.equal(isHostKernelToken('oha_left-token'), true)
  assert.equal(isHostKernelToken('opsess_user'), false)
  assert.equal(isHostKernelToken('opha_product'), false)
  assert.deepEqual(kernels.map((row) => row.agentId).sort(), ['host-remote-1', 'host-zephyrus-ef47fbbf'])
  assert.equal(parseHostAgentMcpServersEnv('not-json').length, 0)
})
