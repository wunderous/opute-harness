export const name = 'opute-system-prompt'
export const inject = ['systemPrompt']

/** Settings namespace and card key (must match the client slot). */
export const SETTINGS_NAMESPACE = 'opute-system-prompt'

/** Prompt section that carries user-authored instructions. */
export const INSTRUCTIONS_SECTION = 'opute:instructions'

/**
 * Order 0 sits in the deployment-persona slot. `complete: true` makes this
 * the sole system-prompt section so stripped DSH identity/surface rows cannot
 * leak back in. Empty text drops at render.
 */
export const INSTRUCTIONS_ORDER = 0

export function normalizeInstructions(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Duck-typed schemastery object: callable resolver plus the `type`/`dict`/
 * `toJSON` shape `dsh-settings` describe/redact walks. Avoids importing DSH
 * packages from this out-of-tree plugin (ESM does not see DSH node_modules).
 */
export function instructionsSchema() {
  function schema(value) {
    const source = value && typeof value === 'object' ? value : {}
    return { instructions: normalizeInstructions(source.instructions) }
  }
  schema.type = 'object'
  schema.dict = { instructions: { type: 'string' } }
  schema.toJSON = () => ({
    type: 'object',
    properties: {
      instructions: { type: 'string', default: '' },
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
  const entry = { instructions: normalizeInstructions(config.instructions) }
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
