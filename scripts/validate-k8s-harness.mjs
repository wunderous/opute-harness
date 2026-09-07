#!/usr/bin/env node
/**
 * Read-only validation for the in-cluster Harness deployment.
 *
 * Run this with kubectl configured for the target K3s API.  It deliberately
 * checks the live object graph rather than treating a rendered YAML file as
 * deployment evidence.
 */
import { spawnSync } from 'node:child_process'

const namespace = process.env.OPUTE_HARNESS_K8S_NAMESPACE || 'opute-harness'
const deploymentName = process.env.OPUTE_HARNESS_K8S_DEPLOYMENT || 'harness-dsh'
const kubectl = process.env.KUBECTL_BIN || 'kubectl'

function kubectlJson(args) {
  const result = spawnSync(kubectl, [...args, '-o', 'json'], { encoding: 'utf8' })
  if (result.error) throw new Error(`kubectl unavailable: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim().replace(/\s+/gu, ' ')
    throw new Error(`kubectl ${args.join(' ')} failed: ${detail.slice(0, 500)}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`kubectl ${args.join(' ')} returned invalid JSON: ${error.message}`)
  }
}

function readyNodeNames(nodes) {
  return (nodes.items || [])
    .filter(node => (node.status?.conditions || []).some(condition => condition.type === 'Ready' && condition.status === 'True'))
    .map(node => node.metadata?.name)
    .filter(name => typeof name === 'string')
}

function envValue(container, name) {
  return (container.env || []).find(item => item.name === name)?.value
}

function podReady(pod) {
  return pod.status?.phase === 'Running'
    && (pod.status?.conditions || []).some(condition => condition.type === 'Ready' && condition.status === 'True')
}

function fail(message) {
  console.error(`K8S_HARNESS_BLOCKED: ${message}`)
  process.exitCode = 2
}

try {
  const nodes = kubectlJson(['get', 'nodes'])
  const readyNodes = readyNodeNames(nodes)
  if (readyNodes.length < 2) throw new Error(`expected at least two Ready nodes, got ${readyNodes.length}`)

  const deployment = kubectlJson(['get', 'deployment', deploymentName, '-n', namespace])
  const template = deployment.spec?.template?.spec
  const containers = template?.containers || []
  const dsh = containers.find(container => container.name === 'dsh')
  const cloudflared = containers.find(container => container.name === 'cloudflared')
  if (!dsh || !cloudflared) throw new Error('deployment must contain dsh and cloudflared containers')
  if (template.hostNetwork === true) throw new Error('deployment must not use hostNetwork for a local model proxy')
  if (envValue(dsh, 'OPUTE_MCP_ENDPOINT') !== 'https://mcp.opute.io/mcp') throw new Error('dsh MCP endpoint is not the public product endpoint')
  if (!dsh.env?.some(item => item.name === 'OPUTE_MCP_TOKEN' && item.valueFrom?.secretKeyRef?.name === 'opute-harness-mcp')) {
    throw new Error('dsh MCP token must come from the Kubernetes Secret')
  }
  if (!dsh.env?.some(item => item.name === 'OPENROUTER_API_KEY'
    && item.valueFrom?.secretKeyRef?.name === 'opute-harness-openrouter'
    && item.valueFrom?.secretKeyRef?.key === 'apiKey')) {
    throw new Error('dsh OpenRouter key must come from the opute-harness-openrouter Kubernetes Secret')
  }
  if (dsh.env?.some(item => item.name === 'OLLAMA_BASE_URL')) {
    throw new Error('dsh must not configure a local Ollama model endpoint')
  }
  if (!cloudflared.args?.includes('/etc/cloudflared/token')) throw new Error('cloudflared must read its token from the Kubernetes Secret volume')
  if (deployment.status?.availableReplicas < 1) throw new Error('deployment has no available replica')

  const service = kubectlJson(['get', 'service', deploymentName, '-n', namespace])
  if (service.spec?.selector?.['app.kubernetes.io/name'] !== deploymentName) throw new Error('service selector does not target the Harness deployment')
  if (!service.spec?.ports?.some(port => port.port === 3080 && port.targetPort === 3080)) throw new Error('service does not expose HTTP port 3080')

  const pods = kubectlJson(['get', 'pods', '-n', namespace, '-l', `app.kubernetes.io/name=${deploymentName}`])
  const readyPods = (pods.items || []).filter(podReady)
  if (readyPods.length < 1) throw new Error('no Ready Harness pod')
  const podNodes = [...new Set(readyPods.map(pod => pod.spec?.nodeName).filter(Boolean))]

  console.log(JSON.stringify({
    status: 'PASS',
    namespace,
    deployment: deploymentName,
    readyNodes,
    availableReplicas: deployment.status?.availableReplicas || 0,
    readyPods: readyPods.length,
    podNodes,
    tunnel: 'cloudflared-sidecar',
    modelProvider: 'openrouter',
    model: 'ibm-granite/granite-4.2-8b',
  }, null, 2))
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
