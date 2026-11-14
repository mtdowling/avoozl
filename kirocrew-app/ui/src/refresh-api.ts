// The Refresh button's countdown: how long until the page reads again.
// Pure helpers; RefreshButton.tsx holds the timer.
import type { RateView } from './settings-api.ts'

// Used while the cache is off (github.cacheSeconds 0) or not yet read.
export const FALLBACK_SECONDS = 20

const two = (n: number) => String(n).padStart(2, '0')

// `32s` under 100 seconds, `1:40` from there; `18:51` (or `1:02:03`) while
// GitHub's limit holds calls back.
export function countdownText(seconds: number, limited: boolean): string {
  const left = Math.max(0, Math.ceil(seconds))
  if (!limited && left < 100) return `${left}s`
  if (left >= 3600) return `${Math.floor(left / 3600)}:${two(Math.floor((left % 3600) / 60))}:${two(left % 60)}`
  return `${Math.floor(left / 60)}:${two(left % 60)}`
}

// Characters the label may take, so the button keeps one width.
export const countdownWidth = (limited: boolean, period: number): number => (limited || period >= 3600 ? 7 : period < 100 ? 3 : 5)

// Seconds between reads: GitHub's cache time, or the old 20 when it is off.
export const refreshPeriod = (rate: RateView | null | undefined): number => (rate?.cacheSeconds ? rate.cacheSeconds : rate?.cacheSeconds === 0 ? FALLBACK_SECONDS : 60)

// Seconds until the limit lifts, or 0 when GitHub is not limiting us.
export function limitedFor(rate: RateView | null | undefined, now: number): number {
  const until = rate?.limitedUntil ? Date.parse(rate.limitedUntil) : 0
  return until > now ? Math.ceil((until - now) / 1000) : 0
}

// Details live in the tooltip only.
export function refreshTip(rate: RateView | null | undefined, secondsLeft: number, limitedSeconds: number): string {
  if (limitedSeconds > 0)
    return `GitHub's rate limit is reached. Calls resume at ${new Date(Date.now() + limitedSeconds * 1000).toLocaleTimeString()}. Refresh shows what Avoozl last read.`
  const core = rate?.resources?.core
  return [
    `Reads again in ${secondsLeft}s. GitHub answers are kept ${rate?.cacheSeconds ?? 60}s (Settings > GitHub).`,
    core ? `${core.remaining} of ${core.limit} GitHub calls left this hour.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
