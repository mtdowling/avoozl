// Design a plugin, Plugin guide and Design a rule set: the seeded chats name
// the app's skills, the rules chat writes no terms, and each button is wired
// to them with its tooltip.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DESIGN_PLUGIN_TIP,
  DESIGN_RULES_TIP,
  PLUGIN_GUIDE,
  PLUGIN_GUIDE_TIP,
  pluginDesignMessage,
  rulesDesignMessage,
} from '../src/design-chat.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const repo = new URL('../../../', import.meta.url)
const app = JSON.parse(readFileSync(new URL('kirocrew-app/app.json', repo), 'utf8'))

test('each design chat names a skill the app ships', () => {
  const plugin = pluginDesignMessage({ supported: [1], installed: ['fake-route'] })
  const rules = rulesDesignMessage({ sets: ['team-terms'] })
  for (const [message, name] of [
    [plugin, 'avoozl-plugin'],
    [rules, 'avoozl-rules'],
  ]) {
    assert.match(message, new RegExp(`Use the ${name} skill`))
    assert.ok(app.skills.includes(`skills/${name}`), name)
  }
  assert.match(plugin, /contract version 1\./)
  assert.match(plugin, /declared here: fake-route\./)
  assert.match(plugin, /Do not approve the plugin or import its pack/)
  assert.match(pluginDesignMessage({ supported: [], installed: [] }), /declared here: none\./)
  assert.match(rules, /Do not write the terms file or save terms/)
  assert.match(rules, /stay in its transcript/)
  assert.match(rules, /already here: team-terms\./)
})

test('the tooltips say what each button does, and the rules one warns about the transcript', () => {
  assert.match(DESIGN_PLUGIN_TIP, /chat/)
  assert.match(DESIGN_RULES_TIP, /stays in its transcript/)
  assert.match(DESIGN_RULES_TIP, /straight into the editor/)
  assert.ok(PLUGIN_GUIDE_TIP.includes(PLUGIN_GUIDE))
  assert.ok(existsSync(new URL(PLUGIN_GUIDE, repo)), PLUGIN_GUIDE)
})

test('Settings > Plugins opens the plugin chat and the guide in the full-file reader', () => {
  const view = source('PluginsSettings.tsx')
  assert.match(view, /<IconLabel icon=\{MessagesSquare\} tooltip=\{DESIGN_PLUGIN_TIP\} onClick=\{design\}>\s*Design a plugin/)
  assert.match(view, /openChat\(\{\s*message: pluginDesignMessage\(/)
  assert.match(view, /autoSend: false/)
  assert.match(view, /<IconLabel icon=\{BookOpen\} tooltip=\{PLUGIN_GUIDE_TIP\} onClick=\{\(\) => setGuide\(true\)\}>\s*Plugin guide/)
  assert.match(view, /import pluginGuide from '\.\.\/\.\.\/\.\.\/docs\/plugins\.md\?raw'/)
  assert.match(view, /<DocumentReader [^>]*document: PLUGIN_GUIDE[^>]*text=\{pluginGuide\}/)
  // A bundled file has no folder to reveal.
  const reader = source('DocumentReader.tsx')
  assert.match(reader, /if \(text !== undefined\) setDoc\(\{ text, error: null \}\)/)
  assert.match(reader, /\{text === undefined && <IconBtn icon=\{FolderOpen\}/)
})

test('Settings > Content rules opens the rules chat', () => {
  const view = source('ContentRulesSettings.tsx')
  assert.match(view, /<IconLabel icon=\{MessagesSquare\} tooltip=\{DESIGN_RULES_TIP\} onClick=\{design\}>\s*Design a rule set/)
  assert.match(view, /openChat\(\{ message: rulesDesignMessage\(\{ sets: /)
  assert.match(view, /autoSend: false/)
})
