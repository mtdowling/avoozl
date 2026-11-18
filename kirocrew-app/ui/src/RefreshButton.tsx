// Refresh: an icon whose color shows how old the read is. It reads again when
// its countdown ends, stops counting while the page is hidden, and waits while
// GitHub's rate limit holds calls back. The time left is in the tooltip only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from './icons.ts'
import { countdownText, limitedFor, refreshColor, refreshPeriod, refreshTip } from './refresh-api.ts'
import { type RateView, settingsClient } from './settings-api.ts'
import { useAppApi } from './host.ts'
import { Tooltip } from './ui/Tooltip.tsx'
import { NAV_ICON, SQUARE } from './LeftNav.tsx'

export interface RefreshState {
  refresh: () => void
  busy?: boolean
  left: number
  limited: number
  period: number
  tip: string
}

// The countdown alone: it keeps reading again on its timer wherever its
// button is drawn (a page heading, or the left nav).
export function useRefreshCountdown(workspaceId: string | null, onRefresh: () => void, busy?: boolean): RefreshState {
  const api = useAppApi()
  const settings = useMemo(() => settingsClient(api), [api])
  const [rate, setRate] = useState<RateView | null>(null)
  const [left, setLeft] = useState(60)
  const [now, setNow] = useState(() => Date.now())
  const again = useRef(onRefresh)
  again.current = onRefresh
  const period = refreshPeriod(rate)
  const limited = limitedFor(rate, now)

  const readRate = useCallback(() => {
    if (workspaceId) settings.get(workspaceId).then((s) => setRate(s.rate ?? null), () => {})
  }, [settings, workspaceId])
  useEffect(readRate, [readRate])

  const count = useRef(60)
  const refresh = useCallback(() => {
    again.current()
    count.current = period
    setLeft(period)
    setTimeout(readRate, 1500)
  }, [period, readRate])
  // A new period (the settings landed or changed) never leaves a longer wait.
  useEffect(() => {
    count.current = Math.min(count.current, period)
    setLeft(count.current)
  }, [period])

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setNow(Date.now())
      // The limit holds calls back: nothing new to read until it lifts.
      if (limitedFor(rate, Date.now()) > 0) return
      count.current -= 1
      if (count.current <= 0) refresh()
      else setLeft(count.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [rate, refresh])

  return { refresh, busy, left, limited, period, tip: refreshTip(rate, left, limited) }
}

// The Refresh button: an icon only, never a countdown. Its color moves from
// muted toward red as the cached read ages, and is red while GitHub's limit
// holds; how long until the next read is in the tooltip and its name.
// `look`: the side panel's bare icon, the left nav's 28px square, or a
// square that takes its height from the row it sits in (the page's top line,
// beside Plan a goal).
export function RefreshIcon({ state, look = 'square' }: { state: RefreshState; look?: 'bare' | 'nav' | 'square' }) {
  const { refresh, busy, left, limited, period } = state
  const shown = limited > 0 ? limited : left
  const label = `Refresh, ${limited > 0 ? 'GitHub limit lifts in ' : 'reads again in '}${countdownText(shown, limited > 0)}`
  const age = limited > 0 ? 100 : Math.round(Math.min(1, Math.max(0, 1 - left / period)) * 100)
  const color = refreshColor(age)
  const looks = {
    bare: { attrs: { 'data-pp-icon': '', 'data-bare': '' }, style: { color } },
    nav: { attrs: { 'data-nav-refresh': '' }, style: { ...NAV_ICON, color } },
    square: { attrs: { 'data-refresh-square': '' }, style: { ...SQUARE, color } },
  }[look]
  return (
    <Tooltip text={state.tip}>
      <button type="button" {...looks.attrs} data-refresh data-refresh-age={age} data-limited={limited > 0 ? '' : undefined} onClick={refresh} disabled={busy} aria-label={label} style={looks.style}>
        <RefreshCw size={look === 'bare' ? 13 : 14} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

export function RefreshButton(props: { workspaceId: string | null; onRefresh: () => void; busy?: boolean; bare?: boolean }) {
  const state = useRefreshCountdown(props.workspaceId, props.onRefresh, props.busy)
  return <RefreshIcon state={state} look={props.bare ? 'bare' : 'square'} />
}
