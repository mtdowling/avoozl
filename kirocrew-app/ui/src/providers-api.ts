// Provider health types the Providers view reads (design §4.20, R72). The
// backend (src/app/flow/provider-health.mjs) judges health. The Switch model
// button and dialog are gone: local workers are retired and Radar crews pick
// their own model, so the page moves no running chat to another model.

export type Level = 'ok' | 'low' | 'out'

// One provider's health, read live (§4.20): the one line that says how much is used.
export interface ProviderFact {
  provider: string
  level: Level
  percent: number | null
  credits: number
  tokens: number
  limit: { credits?: number; tokens?: number } | null
  why: string | null
  line: string
}
