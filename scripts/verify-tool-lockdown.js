#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const composition = readFileSync(
  path.join(root, 'packages', 'bundle-opute-web', 'presets', 'opute', 'agent.cordis.yml'),
  'utf8',
)
const bundlePatch = readFileSync(
  path.join(root, 'packages', 'bundle-opute-web', 'cordis.patch.yml'),
  'utf8',
)

const forbidden = [
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-str-replace-editor',
]

const hits = forbidden.filter((name) => composition.includes(name) || bundlePatch.includes(`name: '${name}'`))
if (hits.length > 0) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: host tools present:', hits.join(', '))
  process.exit(1)
}

if (!bundlePatch.includes('includeShippedRoot: false')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: shipped coding presets must stay off')
  process.exit(1)
}

if (!bundlePatch.includes('default: opute')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: default preset must be opute')
  process.exit(1)
}

const sourcePatch = readFileSync(
  path.join(root, 'packages', 'bundle-opute-web', 'cordis.source.patch.yml'),
  'utf8',
)

const promptProse = [
  'Opute Assistant',
  'You are an AI agent powered by DeepSeek Harness',
  'DeepSeek Harness implementation checkout',
  'DeepSeek Harness Web GUI',
  'When you successfully create or modify files',
  'You are a coding agent powered by',
]
for (const [label, text] of [['preset', composition], ['bundle', bundlePatch], ['source', sourcePatch]]) {
  const leaked = promptProse.filter((fragment) => text.includes(fragment))
  if (leaked.length > 0) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} must ship no system-prompt prose: ${leaked.join(', ')}`)
    process.exit(1)
  }
}
if (composition.includes("name: '@deepseek-ai/dsh-persona'") || composition.includes('id: persona')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: opute preset must not mount a complete dsh-persona (settings plugin owns instructions)')
  process.exit(1)
}
for (const [label, text] of [['bundle', bundlePatch], ['source', sourcePatch]]) {
  if (!/includeHarnessIdentity: false/.test(text) || !/includeRuntimeContext: false/.test(text) || !/persona: ''/.test(text)) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} system-prompt must disable identity, runtime context, and persona`)
    process.exit(1)
  }
  if (!/id: web-runtime[\s\S]*?surfaceContext: false/.test(text)) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} web-runtime must set surfaceContext: false`)
    process.exit(1)
  }
  if (!text.includes('opute-system-prompt')) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} overlay must mount opute-system-prompt`)
    process.exit(1)
  }
}

if (!bundlePatch.includes('id: directory-picker') || !bundlePatch.includes('disabled: true')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: directory-picker must be disabled')
  process.exit(1)
}

for (const id of ['directory-picker', 'ui-workspace', 'file-reference-local', 'ui-deliverables']) {
  if (!bundlePatch.includes(`id: ${id}`) || !sourcePatch.includes(`id: ${id}`)) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${id} must be disabled in both patches`)
    process.exit(1)
  }
}

if (!bundlePatch.includes('opute-workspace-seed') || !sourcePatch.includes('opute-workspace-seed')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: implicit workspace seed row missing')
  process.exit(1)
}

const uiClient = readFileSync(
  path.join(root, 'packages', 'client-ui-opute', 'lib', 'client.js'),
  'utf8',
)
if (!uiClient.includes('provideRoot') || !uiClient.includes('hooks: { workspaces: workspaces.list }')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must publish useWorkspaces so conversation can mount')
  process.exit(1)
}
if (/exports\.inject = \[[^\]]*uiConversation/.test(uiClient)) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must not hard-require uiConversation (it provides uiWorkspace first)')
  process.exit(1)
}
if (!uiClient.includes("inject(['uiConversation']")) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must defer uiConversation.events.register until that service exists')
  process.exit(1)
}

for (const [label, text] of [['bundle', bundlePatch], ['source', sourcePatch]]) {
  if (!text.includes('id: llm-deepseek') || !/id: llm-deepseek\n\s+disabled: true/.test(text)) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: llm-deepseek must be disabled in ${label} patch`)
    process.exit(1)
  }
  if (!text.includes('id: llm-pi-ai') || !text.includes('openrouter:') || !text.includes('ollama:')) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} patch must default llm-pi-ai to OpenRouter and Ollama`)
    process.exit(1)
  }
  if (!text.includes('id: agent-default-model') || !text.includes('provider: openrouter')) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} patch must default agent-default-model to OpenRouter`)
    process.exit(1)
  }
}

if (!uiClient.includes('watchUnroutableModel') || !uiClient.includes('routable !== false')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must remap sessions whose model provider is not mounted')
  process.exit(1)
}

if (!uiClient.includes('Array.isArray(block.content)') || !uiClient.includes("'kind' in block")) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: inventory card must read DSH ToolResultNode.content')
  process.exit(1)
}
if (!uiClient.includes('data-opute-vm-card')
  || !uiClient.includes('OputeVmSummaryCard')
  || !uiClient.includes('chat-vm-')
  || !uiClient.includes('conversation.chat.turnTail')
  || !uiClient.includes("key: 'opute-vm-inventory'")
  || !uiClient.includes("get('opute-vm-inventory')")
  || !uiClient.includes('isOputeWorkspaceItem')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: inventory card must render Platform VM cards in the turn tail')
  process.exit(1)
}

const liveDefault = readFileSync(
  path.join(root, 'packages', 'plugin-workspace-seed', 'src', 'live-default.js'),
  'utf8',
)
const workspaceSeed = readFileSync(
  path.join(root, 'packages', 'plugin-workspace-seed', 'src', 'index.js'),
  'utf8',
)
if (!workspaceSeed.includes('liveDefaultSelection') || !workspaceSeed.includes('saveSelection')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: workspace-seed must rewrite an unroutable agent default')
  process.exit(1)
}
if (!workspaceSeed.includes('extraWorkspaceIds') || !workspaceSeed.includes('delete(id)')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: workspace-seed must drop extra DSH workspaces')
  process.exit(1)
}
if (!liveDefault.includes('openrouter') || !liveDefault.includes('anthropic/claude-haiku-4.5')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: live default must prefer OpenRouter claude-haiku-4.5')
  process.exit(1)
}

if (!bundlePatch.includes("id: mcp-opute")
  || /name:\s*'@deepseek-ai\/dsh-mcp-client'/.test(sourcePatch)
  || /name:\s*'@deepseek-ai\/dsh-mcp-client'/.test(bundlePatch)) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must be the 2026-07-28 plugin, not dsh-mcp-client')
  process.exit(1)
}
const launch = readFileSync(path.join(root, 'scripts', 'launch-opute-web.js'), 'utf8')
if (!launch.includes('hydrateHarnessMcpEnv') || !launch.includes('preferPublicMcpIfLoopbackDown')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: launch must hydrate MCP from Host Agent env and fail over from dead :9091')
  process.exit(1)
}
if (!sourcePatch.includes('plugin-mcp-opute/src/index.js') && !sourcePatch.includes('@opute/dsh-plugin-mcp-opute')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: source patch must load plugin-mcp-opute')
  process.exit(1)
}
if (!bundlePatch.includes('opute-tool-retrieval') || !sourcePatch.includes('plugin-tool-retrieval/src/index.js')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: both patches must load plugin-tool-retrieval')
  process.exit(1)
}

const retrievalRank = readFileSync(
  path.join(root, 'packages', 'plugin-tool-retrieval', 'src', 'rank.js'),
  'utf8',
)
if (!retrievalRank.includes('dense-lexical-rank-fusion-v1') || !retrievalRank.includes('LEXICAL_RERANK_WEIGHT = 0.25')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: tool-retrieval must use Platform dense-lexical fusion')
  process.exit(1)
}
const retrievalPlugin = readFileSync(
  path.join(root, 'packages', 'plugin-tool-retrieval', 'src', 'index.js'),
  'utf8',
)
const retrievalTrace = readFileSync(
  path.join(root, 'packages', 'plugin-tool-retrieval', 'src', 'trace.js'),
  'utf8',
)
if (!retrievalPlugin.includes('buildAssembleTrace') || !retrievalPlugin.includes('EXECUTION_TRACE_EVENT')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: tool-retrieval must emit an assemble execution trace')
  process.exit(1)
}
if (!retrievalTrace.includes("'opute/execution-trace'") || !retrievalTrace.includes('context-injection')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: assemble trace must name opute/execution-trace and context-injection')
  process.exit(1)
}
if (!uiClient.includes("conversation.session.header.utilities") || !uiClient.includes('opute-execution-trace')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must inject Execution Trace on session header utilities')
  process.exit(1)
}
if (!uiClient.includes("settings.plugin.item")
  || !uiClient.includes('opute-system-prompt')
  || !uiClient.includes("inject(['settingsScope']")) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must contribute a Settings → Plugins card for opute-system-prompt')
  process.exit(1)
}

const systemPromptPlugin = readFileSync(
  path.join(root, 'packages', 'plugin-system-prompt', 'src', 'index.js'),
  'utf8',
)
if (!systemPromptPlugin.includes('complete: true')
  || !systemPromptPlugin.includes('opute:instructions')
  || !systemPromptPlugin.includes('installSettingsSection')
  || !systemPromptPlugin.includes("SETTINGS_NAMESPACE = 'opute-system-prompt'")) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: opute-system-prompt must register a complete instructions section on a settings namespace')
  process.exit(1)
}
if (!bundlePatch.includes('opute-system-prompt') || !sourcePatch.includes('plugin-system-prompt/src/index.js')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: both patches must load plugin-system-prompt')
  process.exit(1)
}
if (!uiClient.includes("target: 'trajectory'")
  || !uiClient.includes('opute-assemble-trace')
  || !uiClient.includes('opute/execution-trace')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: ui-opute must fold assemble traces into Trajectory context rows')
  process.exit(1)
}
if (!retrievalPlugin.includes('events: [event]') || !retrievalPlugin.includes('buildAssembleTrace(payload)')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: tool-retrieval must append one execution-trace event per assemble stage')
  process.exit(1)
}

const mcpPlugin = readFileSync(
  path.join(root, 'packages', 'plugin-mcp-opute', 'src', 'index.js'),
  'utf8',
)
const mcpProtocol = readFileSync(
  path.join(root, 'packages', 'plugin-mcp-opute', 'src', 'protocol.js'),
  'utf8',
)
if (!mcpProtocol.includes('2026-07-28') || !mcpProtocol.includes("method === 'initialize'")) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must pin 2026-07-28 and refuse initialize')
  process.exit(1)
}
if (!mcpProtocol.includes('io.modelcontextprotocol/ui') || !mcpProtocol.includes('text/html;profile=mcp-app')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must advertise the MCP Apps UI extension')
  process.exit(1)
}
if (!mcpPlugin.includes('registerOputeMcpTools')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must register Opute tools on DSH')
  process.exit(1)
}
const mcpBridge = readFileSync(
  path.join(root, 'packages', 'plugin-mcp-opute', 'src', 'bridge.js'),
  'utf8',
)
if (!mcpBridge.includes("method: 'resources/read'") || !mcpBridge.includes('presentationMeta')
  || !mcpBridge.includes('bundledVmInventoryApp')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must prefetch ui:// HTML into presentationMeta and bundle vm-inventory')
  process.exit(1)
}
if (mcpPlugin.includes('contributeInventoryGuidance') || mcpPlugin.includes('systemPrompt')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: mcp-opute must not inject inventory routing onto systemPrompt')
  process.exit(1)
}

const describeTool = readFileSync(
  path.join(root, 'packages', 'plugin-mcp-opute', 'src', 'describe-tool.js'),
  'utf8',
)
if (!describeTool.includes('mcp__opute__platform__list_managed_vms')
  || !describeTool.includes('list the vms')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: tool descriptions must steer list-VMs without a system-prompt dump')
  process.exit(1)
}
for (const [label, text] of [['bundle', bundlePatch], ['source', sourcePatch], ['preset', composition]]) {
  if (text.includes('mcp__opute__platform__list_managed_vms') || text.includes('lxc_list')) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} persona must not duplicate inventory routing`)
    process.exit(1)
  }
}

if (!composition.includes('compaction-basic')
  || !composition.includes('command-compact')
  || !composition.includes('tool-result-pruner')) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: opute preset must mount compaction-basic, command-compact, and tool-result-pruner')
  process.exit(1)
}
if (!/isolate:\n\s+compaction: true\n\s+toolResultPruner: true/.test(composition)) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: opute preset must isolate compaction with toolResultPruner')
  process.exit(1)
}
if (!/id: compaction-basic[\s\S]*?auto: false/.test(composition)) {
  console.error('OPUTE_HARNESS_LOCKDOWN_FAIL: compaction-basic must keep auto: false for 4B')
  process.exit(1)
}
for (const [label, text] of [['bundle', bundlePatch], ['source', sourcePatch]]) {
  if (text.includes('id: compaction-basic') || text.includes('id: command-compact') || text.includes('id: tool-result-pruner')) {
    console.error(`OPUTE_HARNESS_LOCKDOWN_FAIL: ${label} overlay must not declare host-plane compaction ids`)
    process.exit(1)
  }
}

console.log('OPUTE_HARNESS_LOCKDOWN_PASS')
