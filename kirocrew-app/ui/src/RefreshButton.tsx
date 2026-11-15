// Refresh with its countdown inline: [↻ 32s]. It reads again at 0, stops
// counting while the page is hidden, and shows [↻ 18:51] while GitHub's
// rate limit holds calls back. Details are in the tooltip.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconLabel } from './controls.tsx'
import { RefreshCw } from './icons.ts'
import { countdownText, countdownWidth, limitedFor, refreshPeriod, refreshTip } from './refresh-api.ts'
import { type RateView, settingsClient } from './settings-api.ts'
import { useAppApi } from './host.ts'

export interface RefreshState {
  refresh: () => void
  busy?: boolean
  left: number
  limited: number
  period: number
  tip: string
}

// The countdown alone: it keeps reading again on its timer wherever its
// button is drawn (a page heading, or the header's More menu).
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

export function RefreshControl({ state }: { state: RefreshState }) {
  const { refresh, busy, left, limited, period } = state
  const shown = limited > 0 ? limited : left
  return (
    <IconLabel
      icon={RefreshCw}
      onClick={refresh}
      disabled={busy}
      tooltip={state.tip}
      aria-label={`Refresh, ${limited > 0 ? 'GitHub limit lifts in ' : 'reads again in '}${countdownText(shown, limited > 0)}`}
    >
      <span style={{ display: 'inline-block', minWidth: `${countdownWidth(limited > 0, period)}ch`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{countdownText(shown, limited > 0)}</span>
    </IconLabel>
  )
}

export function RefreshButton(props: { workspaceId: string | null; onRefresh: () => void; busy?: boolean }) {
  return <RefreshControl state={useRefreshCountdown(props.workspaceId, props.onRefresh, props.busy)} />
}
