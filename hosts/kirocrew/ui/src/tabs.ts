// The logic of the shared tab bar (Tabs.tsx), kept free of JSX and the DOM
// so node can test it.

// The tab a key moves to in a tab bar (WAI-ARIA tabs): arrows wrap, Home
// and End jump. Null for any other key.
export function tabKey(key: string, tabs: readonly string[], current: string): string | null {
  const at = Math.max(0, tabs.indexOf(current))
  if (!tabs.length) return null
  if (key === 'ArrowRight') return tabs[(at + 1) % tabs.length]
  if (key === 'ArrowLeft') return tabs[(at - 1 + tabs.length) % tabs.length]
  if (key === 'Home') return tabs[0]
  if (key === 'End') return tabs[tabs.length - 1]
  return null
}

// The tab a page address names (?<param>=<key>), or null when it names
// none or one the bar does not have.
export function readTab<T extends string>(search: string, param: string, keys: readonly T[]): T | null {
  const value = new URLSearchParams(search).get(param)
  return value !== null && (keys as readonly string[]).includes(value) ? (value as T) : null
}

// The address of one tab: ?<param>=<key>, so a pasted link opens it.
export const tabLink = (param: string, key: string) => `?${new URLSearchParams({ [param]: key })}`

// Which tabs hold unsaved changes: a tab is dirty when any of its keys
// differs between the form and the saved form.
export function dirtyTabs<F extends object, T extends string>(form: F, saved: F, keys: Record<T, readonly (keyof F)[]>): Set<T> {
  const out = new Set<T>()
  for (const tab of Object.keys(keys) as T[]) if (keys[tab].some((key) => JSON.stringify(form[key]) !== JSON.stringify(saved[key]))) out.add(tab)
  return out
}

// The spec page's tabs in the address: the spec id plus tab=T, and the
// Overview is the spec id alone.
export interface SpecPlace {
  plan: string
  tab: string
}
const validSpecPlace = (value: unknown): SpecPlace | null => {
  const place = value as Partial<SpecPlace> | null
  if (!place || typeof place.plan !== 'string' || !place.plan) return null
  if (typeof place.tab !== 'string') return null
  if (place.tab !== 'overview' && (!/^[\w./-]{1,64}$/.test(place.tab) || place.tab.includes('..'))) return null
  return { plan: place.plan, tab: place.tab }
}
export function specTabLink(plan: string, tab: string): string {
  const query = new URLSearchParams({ plan })
  if (tab !== 'overview') query.set('tab', tab)
  return '?' + query.toString()
}
export function parseSpecTab(search: string): SpecPlace | null {
  const query = new URLSearchParams(search)
  const plan = query.get('plan'),
    tab = query.get('tab') ?? 'overview'
  return validSpecPlace({ plan, tab })
}

// The last spec and its inner tab, per workspace. The address remains the
// shareable source of truth when present; this restores the place only when
// the host returns to Avoozl at its bare app address.
export const SPEC_PLACE_KEY = 'avoozl.spec-place'

function readSpecPlaces(storage: Pick<Storage, 'getItem'> | null): Record<string, unknown> {
  try {
    const value = JSON.parse(storage?.getItem(SPEC_PLACE_KEY) ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function readSpecPlace(storage: Pick<Storage, 'getItem'> | null, workspaceId: string): SpecPlace | null {
  return validSpecPlace(readSpecPlaces(storage)[workspaceId])
}

export function writeSpecPlace(storage: Pick<Storage, 'getItem' | 'setItem'> | null, workspaceId: string, place: SpecPlace | null): void {
  try {
    const places = readSpecPlaces(storage)
    if (place) places[workspaceId] = place
    else delete places[workspaceId]
    storage?.setItem(SPEC_PLACE_KEY, JSON.stringify(places))
  } catch {
    // Storage may be full or blocked; the address still keeps the place.
  }
}

// A spec file's text as the page renders it: Markdown as is, a JSON file as
// a JSON code block.
export const renderText = (file: string, text: string) => (file.endsWith('.json') ? '```json\n' + text + '\n```' : text)
