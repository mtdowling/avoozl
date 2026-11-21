// Design a plugin, Plugin guide, Design a rule set and Content rules guide: the seeded chats name
// the app's skills, the rules chat writes no terms, and each button is wired
// to them with its tooltip.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CONTENT_RULES_GUIDE,
  CONTENT_RULES_GUIDE_TIP,
  DESIGN_PLUGIN_TIP,
  DESIGN_RULES_TIP,
  PLUGIN_GUIDE,
  PLUGIN_GUIDE_TIP,
  pluginDesignMessage,
  rulesDesignMessage,
} from '../src/design-chat.ts'

const src = new URL('../src/', import.meta.url)
const source = (name) => readFileSync(new URL(name, src), 'utf8')
const repo = new URL('../../../../', import.meta.url)
const app = JSON.parse(readFileSync(new URL('hosts/kirocrew/app.json', repo), 'utf8'))

test('each design chat names a skill the app ships', () => {
  const plugin = pluginDesignMessage({ supported: [1], installed: ['fake-intake'] })
  const rules = rulesDesignMessage({ sets: ['team-terms'] })
  for (const [message, name] of [
    [plugin, 'avoozl-plugin'],
    [rules, 'avoozl-rules'],
  ]) {
    assert.match(message, new RegExp(`Use the ${name} skill`))
    assert.ok(app.skills.includes(`skills/${name}`), name)
  }
  assert.match(plugin, /contract version 1\./)
  assert.match(plugin, /declared here: fake-intake\./)
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
  for (const [tip, doc] of [
    [PLUGIN_GUIDE_TIP, PLUGIN_GUIDE],
    [CONTENT_RULES_GUIDE_TIP, CONTENT_RULES_GUIDE],
  ]) {
    assert.ok(tip.includes(doc), doc)
    assert.ok(existsSync(new URL(doc, repo)), doc)
  }
})

test('Settings > Plugins opens the plugin chat and the guide in the full-file reader', () => {
  const view = source('PluginsSettings.tsx')
  assert.match(view, /<IconLabel icon=\{MessagesSquare\} tooltip=\{DESIGN_PLUGIN_TIP\} onClick=\{design\}>\s*Design a plugin/)
  assert.match(view, /openChat\(\{\s*message: pluginDesignMessage\(/)
  assert.match(view, /autoSend: false/)
  assert.match(view, /import pluginGuide from '\.\.\/\.\.\/\.\.\/\.\.\/docs\/plugins\.md\?raw'/)
  assert.match(view, /<GuideButton [^>]*document=\{PLUGIN_GUIDE\} text=\{pluginGuide\} tooltip=\{PLUGIN_GUIDE_TIP\} label="Plugin guide"/)
  // The guide button opens the bundled text in the full-file reader.
  const button = source('GuideButton.tsx')
  assert.match(button, /<IconLabel icon=\{BookOpen\} tooltip=\{tooltip\} onClick=\{\(\) => setOpen\(true\)\}>/)
  assert.match(button, /\{open \? <DocumentReader [^>]*target=\{\{ document, [^>]*text=\{text\}/)
  // A bundled file has no folder to reveal.
  const reader = source('DocumentReader.tsx')
  assert.match(reader, /if \(text !== undefined\) setDoc\(\{ text, error: null \}\)/)
  assert.match(reader, /\{text === undefined && <IconBtn icon=\{FolderOpen\}/)
})

test('Settings > Content rules opens the rules chat and the guide in the full-file reader', () => {
  const view = source('ContentRulesSettings.tsx')
  assert.match(view, /<IconLabel icon=\{MessagesSquare\} tooltip=\{DESIGN_RULES_TIP\} onClick=\{design\}>\s*Design a rule set/)
  assert.match(view, /openChat\(\{ message: rulesDesignMessage\(\{ sets: /)
  assert.match(view, /autoSend: false/)
  assert.match(view, /import rulesGuide from '\.\.\/\.\.\/\.\.\/\.\.\/docs\/content-rules\.md\?raw'/)
  assert.match(view, /<GuideButton [^>]*document=\{CONTENT_RULES_GUIDE\} text=\{rulesGuide\} tooltip=\{CONTENT_RULES_GUIDE_TIP\} label="Content rules guide"/)
})
