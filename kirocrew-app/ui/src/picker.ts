// The searchable picker's pure parts (design §8.9, R73): matching on ID,
// title and spec, and what each key does. Picker.tsx draws it.
export interface PickItem {
  id: string
  title: string
  spec?: string | null
  state?: string | null
}

// At most this many results render; the rest are counted.
export const MAX_SHOWN = 50

export interface PickIndex {
  items: PickItem[]
  ids: string[]
  text: string[]
}

// Built once per item list, so a key press does no lower-casing per item.
export function pickIndex(items: PickItem[]): PickIndex {
  return {
    items,
    ids: items.map((item) => item.id.toLowerCase()),
    text: items.map((item) => `${item.id}\n${item.title}\n${item.spec ?? ''}`.toLowerCase()),
  }
}

// Items whose ID, title or spec holds the query, ignoring case. An ID that
// starts with it sorts first; otherwise the list order is kept. One pass.
export function pickMatches(index: PickIndex, query: string, limit = MAX_SHOWN): { shown: PickItem[]; total: number } {
  const q = query.trim().toLowerCase()
  if (!q) return { shown: index.items.slice(0, limit), total: index.items.length }
  const first: PickItem[] = [],
    rest: PickItem[] = []
  let total = 0
  for (let i = 0; i < index.items.length; i++) {
    if (!index.text[i].includes(q)) continue
    total += 1
    if (index.ids[i].startsWith(q)) {
      if (first.length < limit) first.push(index.items[i])
    } else if (rest.length < limit) rest.push(index.items[i])
  }
  return { shown: [...first, ...rest].slice(0, limit), total }
}

// What one key does to an open or closed list of `count` results.
export interface PickState {
  open: boolean
  active: number
}
export type PickAction = { kind: 'move'; state: PickState } | { kind: 'pick'; index: number } | { kind: 'close' } | { kind: 'clear' } | { kind: 'none' }

export function pickKey(state: PickState, key: string, count: number): PickAction {
  const last = count - 1
  if (key === 'ArrowDown')
    return { kind: 'move', state: { open: true, active: !state.open ? 0 : Math.min(last, state.active + 1) } }
  if (key === 'ArrowUp')
    return { kind: 'move', state: { open: true, active: !state.open ? last : Math.max(0, state.active - 1) } }
  if (key === 'Home' && state.open) return { kind: 'move', state: { open: true, active: 0 } }
  if (key === 'End' && state.open) return { kind: 'move', state: { open: true, active: last } }
  if (key === 'Enter') return state.open && state.active >= 0 && state.active < count ? { kind: 'pick', index: state.active } : { kind: 'none' }
  // Esc closes the list; a second Esc clears the text.
  if (key === 'Escape') return state.open ? { kind: 'close' } : { kind: 'clear' }
  return { kind: 'none' }
}

// Filter choices ({value, label}) as picker items: the label is the title.
export const optionItems = (options: { value: string; label: string }[]): PickItem[] =>
  options.map((o) => ({ id: o.value, title: o.label }))

export const pickLabel = (item: PickItem) => (item.title && item.title !== item.id ? `${item.id}: ${item.title}` : item.id)
