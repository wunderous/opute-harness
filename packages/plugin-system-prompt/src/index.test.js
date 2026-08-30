import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apply,
  applySystemPrompt,
  INSTRUCTIONS_ORDER,
  INSTRUCTIONS_SECTION,
  SETTINGS_NAMESPACE,
  instructionsSchema,
  normalizeInstructions,
} from './index.js'

test('normalizeInstructions keeps strings and blanks anything else', () => {
  assert.equal(normalizeInstructions('You run Opute.'), 'You run Opute.')
  assert.equal(normalizeInstructions(''), '')
  assert.equal(normalizeInstructions(undefined), '')
  assert.equal(normalizeInstructions(null), '')
})

test('applySystemPrompt registers a complete instructions section', () => {
  const sections = []
  const ctx = {
    effect(dispose) {
      return dispose()
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
  }
  applySystemPrompt(ctx, { instructions: '' })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, INSTRUCTIONS_SECTION)
  assert.equal(sections[0].order, INSTRUCTIONS_ORDER)
  assert.equal(sections[0].complete, true)
  assert.equal(sections[0].text(), '')
})

test('settings source replaces composition text at assemble time', () => {
  let text
  const ctx = {
    effect(dispose) {
      return dispose()
    },
    systemPrompt: {
      section(section) {
        text = section.text
        return () => {}
      },
    },
  }
  let source = () => ({ instructions: '' })
  applySystemPrompt(ctx, { instructions: '' }, {
    Schema: {},
    installSettingsSection(_ctx, ns, _schema, entry, hooks) {
      assert.equal(ns, SETTINGS_NAMESPACE)
      assert.equal(entry.instructions, '')
      source = () => ({ instructions: 'List managed VMs first.' })
      hooks.setSource(() => source())
      hooks.onChange()
    },
  })
  assert.equal(text(), 'List managed VMs first.')
})

test('instructionsSchema resolves strings and serializes for describe()', () => {
  const schema = instructionsSchema()
  assert.deepEqual(schema({ instructions: 'Be terse.' }), { instructions: 'Be terse.' })
  assert.deepEqual(schema({}), { instructions: '' })
  assert.equal(schema.type, 'object')
  assert.equal(schema.toJSON().properties.instructions.type, 'string')
})

test('apply waits for ctx.settings before registering the namespace', () => {
  const injected = []
  const registered = []
  const ctx = {
    effect(dispose) {
      return dispose()
    },
    inject(names, callback) {
      injected.push(names)
      callback({
        settings: {
          register(ns, schema, options) {
            registered.push({ ns, options })
            return {
              get: () => schema(options.base),
              watch: () => () => {},
            }
          },
        },
        effect() {},
      })
    },
    systemPrompt: {
      section() {
        return () => {}
      },
    },
  }
  apply(ctx, { instructions: '' })
  assert.deepEqual(injected, [['settings']])
  assert.equal(registered[0].ns, SETTINGS_NAMESPACE)
  assert.equal(registered[0].options.base.instructions, '')
})

