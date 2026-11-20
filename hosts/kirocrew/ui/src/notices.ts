// Browser notices for Needs you (standalone-web SW8). Off until a person turns
// them on with a click; the page then notices each new Needs you item once per
// browser, with its title and no path. No server push, service worker or
// background sync: the page reads Needs you while it is open, as often as the
// page does (60 s, App.tsx).
import { itemKey } from './conflicts-api.ts'

export const NOTICE_INTERVAL_MS = 60_000
export const NOTICES_KEY = 'avoozl-notices'
export const NOTICED_KEY = 'avoozl-noticed'
export const NOTICES_CHANGED = 'avoozl:notices-changed'
const REMEMBER = 500

type Store = Pick<Storage, 'getItem' | 'setItem'>
// A Needs you item as conflicts.view returns it. Many kinds carry no `id`
// (a blocked task, a review), so an item is known by the page's own key.
export interface NeedsYouItem {
  kind?: string
  taskId?: string | null
  field?: string
  slot?: string
  id?: string
  title: string
}

export const noticeKey = (item: NeedsYouItem) => itemKey({ ...item, taskId: item.taskId ?? null })

export const noticesOn = (storage: Store | null) => storage?.getItem(NOTICES_KEY) === 'on'
export function setNotices(storage: Store | null, on: boolean) {
  storage?.setItem(NOTICES_KEY, on ? 'on' : 'off')
}

// The notice's text: the item's title with any file path taken out.
export const noticeText = (title: string) =>
  title
    .replace(/(?:[A-Za-z]:\\|~?\/)[^\s'")]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function noticed(storage: Store | null): string[] | null {
  try {
    const value = JSON.parse(storage?.getItem(NOTICED_KEY) ?? 'null')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

// The items to notice now, and remember them. The first read on a browser only
// records what is already waiting, so turning notices on does not shower the
// backlog; a later read notices each item it has not seen, once.
export function takeNew(storage: Store | null, items: NeedsYouItem[]): NeedsYouItem[] {
  const seen = noticed(storage),
    known = new Set(seen ?? []),
    fresh = seen === null ? [] : items.filter((item) => !known.has(noticeKey(item)))
  const next = [...(seen ?? []), ...items.map(noticeKey).filter((key) => !known.has(key))]
  try {
    storage?.setItem(NOTICED_KEY, JSON.stringify(next.slice(-REMEMBER)))
  } catch {
    // Storage may be full or blocked: the notice is shown, and may repeat.
  }
  return fresh
}
