// The seeded chats behind Design a plugin (Settings > Plugins) and Design a
// rule set (Settings > Content rules). Each opens a Kiro Crew chat with the
// app's own skill named and the page's context; the person reads the draft
// before sending it. Kept free of JSX so node can test it directly.

// The guide Plugin guide opens in the full-file reader, bundled into the UI.
export const PLUGIN_GUIDE = 'docs/plugins.md'

export const DESIGN_PLUGIN_TIP = 'Open a chat that helps you plan a plugin and write its files. It approves nothing.'
export const PLUGIN_GUIDE_TIP = `Read ${PLUGIN_GUIDE}: the plugin contract, parts, sources and approval`
export const DESIGN_RULES_TIP =
  'Open a chat that suggests rules for you to paste here and save. What you type there stays in its transcript, so type truly private words straight into the editor.'

const list = (items: string[]) => (items.length ? items.join(', ') : 'none')

export function pluginDesignMessage(context: { supported: number[]; installed: string[] }): string {
  return [
    'Use the avoozl-plugin skill to help me design an Avoozl plugin.',
    'Ask what it is for and which system it talks to, then help me pick its parts, its source (folder, package or git) and whether it applies to this computer only or is shared with the repo.',
    'Then write the plugin folder: avoozl-plugin.json, any pack, the entry module, and a test against a fake host.',
    `This Avoozl supports contract version ${list(context.supported.map(String))}. Plugins already declared here: ${list(context.installed)}.`,
    'Do not approve the plugin or import its pack; I do that in Settings > Plugins.',
  ].join(' ')
}

export function rulesDesignMessage(context: { sets: string[] }): string {
  return [
    'Use the avoozl-rules skill to help me plan an Avoozl content rule set.',
    'Ask what kind of text must stay out, then suggest rule and allow lines, where the set checks, and whether it blocks or reports.',
    'Do not write the terms file or save terms: I paste the lines into Settings > Content rules, check them with Try it, and save there.',
    'Remind me that terms typed in this chat stay in its transcript, so I type truly private words straight into the editor.',
    `Rule sets already here: ${list(context.sets)}.`,
  ].join(' ')
}
