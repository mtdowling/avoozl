// The side panel's "Since you left" recap. Kept free of JSX so node can test
// it directly.
// "4 min ago", "2 h ago", "3 d ago".
export function ago(at: string | null | undefined, now = Date.now()): string {
  const time = at ? Date.parse(at) : NaN
  if (!Number.isFinite(time)) return 'never'
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

// `away` is what the panel kept when the window last lost focus: the time and
// the keys of the rows that waited on you then.
export interface Away {
  at: number
  waitingKeys: string[]
}

export interface Recap {
  since: string
  finished: { taskId: string; title: string; repository: string | null; at: string }[]
  needsYou: { key: string; title: string; label: string }[]
}

// A person who looked away for less than this has nothing to catch up on.
export const AWAY_MIN_MS = 60_000

export const sinceText = (at: number, now: number): string => ago(new Date(at).toISOString(), now)

export function recapSince(
  model: { waiting: { key: string; title: string; label: string }[]; recent: { taskId: string; title: string; repository: string | null; at: string }[] },
  away: Away | null,
  now: number,
): Recap | null {
  if (!away || now - away.at < AWAY_MIN_MS) return null
  const seen = new Set(away.waitingKeys)
  const finished = model.recent.filter((row) => Date.parse(row.at) > away.at)
  const needsYou = model.waiting.filter((row) => !seen.has(row.key)).map(({ key, title, label }) => ({ key, title, label }))
  if (!finished.length && !needsYou.length) return null
  return { since: sinceText(away.at, now), finished, needsYou }
}
