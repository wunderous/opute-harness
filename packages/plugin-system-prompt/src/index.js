export const name = 'opute-system-prompt'
export const inject = ['systemPrompt']

/** Settings namespace and card key (must match the client slot). */
export const SETTINGS_NAMESPACE = 'opute-system-prompt'

/** Prompt section that carries user-authored instructions. */
export const INSTRUCTIONS_SECTION = 'opute:instructions'

/**
 * Product identity for the complete section. Matches Platform chat so the
 * model names Opute, not the upstream DSH identity this overlay strips.
 * Inventory routing stays in tool descriptions, not here.
 */
export const DEFAULT_INSTRUCTIONS = [
  'You are Opute Assistant, helping manage infrastructure nodes and Kubernetes clusters.',
  'Entity context is not preloaded into these instructions. Retrieve current names, identifiers, relationships, and status through the available discovery/read tools.',
  'Use identifiers exactly as returned by tool results. Do not infer, synthesize, or copy identifiers from examples or static descriptions.',
  'When a dependent tool requires an identifier that is not already present in the conversation, call the relevant discovery tool first and use its returned value.',
].join('\n')

/**
 * Order 0 sits in the deployment-persona slot. `complete: true` makes this
 * the sole system-prompt section so stripped DSH identity/surface rows cannot
 * leak back in. Empty text (user cleared the card) drops at render.
 */
export const INSTRUCTIONS_ORDER = 0

export function normalizeInstructions(value) {
  return typeof value === 'string' ? value : ''
}

/** Composition default is Opute identity; an explicit string (including '') wins. */
export function resolveInstructions(config = {}) {
  return typeof config.instructions === 'string'
    ? config.instructions
    : DEFAULT_INSTRUCTIONS
}

/**
 * Duck-typed schemastery object: callable resolver plus the `type`/`dict`/
 * `toJSON` shape `dsh-settings` describe/redact walks. Avoids importing DSH
 * packages from this out-of-tree plugin (ESM does not see DSH node_modules).
 */
export function instructionsSchema() {
  function schema(value) {
    const source = value && typeof value === 'object' ? value : {}
    return { instructions: resolveInstructions(source) }
  }
  schema.type = 'object'
  schema.dict = { instructions: { type: 'string' } }
  schema.toJSON = () => ({
    type: 'object',
    properties: {
      instructions: { type: 'string', default: DEFAULT_INSTRUCTIONS },
    },
  })
  return schema
}

/**
 * Register the complete instructions section and, when `ctx.settings` exists,
 * layer a user-editable namespace over the composition entry.
 * @param {object} ctx
 * @param {{ instructions?: string }} [config]
 * @param {{ installSettingsSection?: Function, Schema?: object }} [settingsApi]
 */
export function applySystemPrompt(ctx, config = {}, settingsApi) {
  const entry = { instructions: resolveInstructions(config) }
  let current = () => entry

  ctx.effect(() => ctx.systemPrompt.section({
    name: INSTRUCTIONS_SECTION,
    order: INSTRUCTIONS_ORDER,
    complete: true,
    text: () => normalizeInstructions(current().instructions),
  }), 'opute-system-prompt.section()')

  if (typeof settingsApi?.installSettingsSection !== 'function' || !settingsApi.Schema) return

  settingsApi.installSettingsSection(ctx, SETTINGS_NAMESPACE, settingsApi.Schema, entry, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })
}

function attachSettings(ctx, ns, schema, entry, hooks) {
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(ns, schema, { base: entry })
    hooks.setSource(() => scope.get())
    sctx.effect(() => () => {
      hooks.setSource(() => entry)
      hooks.onChange()
    })
    hooks.onChange()
    scope.watch(() => {
      hooks.onChange()
    })
  })
}

/**
 * DSH settings consumer: Settings → Plugins card writes `instructions`.
 * The text function is evaluated at assemble, so a save takes effect on the
 * next model step without re-registering the section.
 */
export function apply(ctx, config) {
  applySystemPrompt(ctx, config, {
    Schema: instructionsSchema(),
    installSettingsSection: attachSettings,
  })
}
