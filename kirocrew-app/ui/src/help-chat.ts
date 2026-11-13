// The seeded chat behind "Ask for help" (AskForHelp.tsx): one message that
// names the page, its current settings and the guide to read. The chat may
// propose values; it saves nothing, so the page's own Save stays the only
// write. Any settings or setup page can use it. Free of JSX so node can
// test it directly.

export const HELP_LABEL = 'Ask for help'
export const HELP_TIP = 'Open a Kiro Crew chat that knows this page and its settings. It can suggest values; you save them here.'

// The guide for Settings › Budgets, Prices and Providers.
export const COSTS_SKILL = 'avoozl-costs'
export const COSTS_DOCS = 'skills/avoozl-costs/SKILL.md'

export interface HelpContext {
  // The page as the person sees it: "Settings > Budgets".
  page: string
  // What the page is for, in one plain line.
  purpose: string
  // The page's current values, as JSON-safe data. No secrets.
  settings: unknown
  // Where the guide is: a skill name and its file.
  skill: string
  docs: string
  // What the person presses to save: "Save" or "Save avoozl".
  save?: string
}

export function helpMessage(context: HelpContext): string {
  return [
    `Help me set up Avoozl's ${context.page}. ${context.purpose}`,
    `First read the ${context.skill} skill (${context.docs} in the Avoozl app); it explains every field and its default.`,
    `These are the page's current settings, as JSON:\n${JSON.stringify(context.settings ?? {}, null, 2)}`,
    'Ask me what I want in plain words, then propose values for each field, each with a short reason, and say which fields to leave blank so the default applies.',
    `Do not edit any file or save settings yourself: I type your values into ${context.page} and press ${context.save ?? 'Save'} there.`,
  ].join('\n\n')
}
