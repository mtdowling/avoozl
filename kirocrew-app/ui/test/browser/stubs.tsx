// Stand-ins for the host SDK (@kirocrew/app-sdk and its /ui) and lucide-react
// in the modal harness. Card makes a containing block (a transform), as a
// host card or pane may, so a modal that is not portaled shows it.
import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Reply = (body: { operation?: string; input?: unknown }) => unknown
const replies: Record<string, Reply> = {}
// The harness answers these operations; any other call never settles, so a
// dialog stays on its loading line.
export function answer(operation: string, reply: Reply) {
  replies[operation] = reply
}
export const replyFor = (operation: string): Reply | undefined => replies[operation]
const never = () => new Promise<never>(() => undefined)
// A refused call, shaped as the host client rejects: status and raw body.
export class Refusal extends Error {
  status: number
  body: string
  constructor(status: number, body: unknown) {
    super(`Request failed (${status}).`)
    this.status = status
    this.body = JSON.stringify(body)
  }
}
const api = {
  request: never,
  // GET answers are registered as answer('GET <path>', ...).
  get: (path: string) => {
    const reply = replies[`GET ${path}`]
    return reply ? Promise.resolve(reply({})) : never()
  },
  put: never,
  del: never,
  post: (_path: string, body: { operation?: string }) => {
    const reply = replies[body?.operation ?? '']
    if (!reply) return never()
    try {
      return Promise.resolve({ result: reply(body) })
    } catch (error) {
      return Promise.reject(error)
    }
  },
}
export const useAppApi = () => api
export const useNavigate = () => (path: string) => {
  ;((window as unknown as { __navigated?: string[] }).__navigated ??= []).push(path)
}
// A test reads window.__chats to see what a button asked the host to open.
export const useChatLauncher = () => ({
  openChat: (input: unknown) => {
    ;((window as unknown as { __chats?: unknown[] }).__chats ??= []).push(input)
  },
})

export function Icon(props: { size?: number | string; style?: object }) {
  const size = props.size ?? 16
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={props.style}><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" /></svg>
}

export function Card(props: { children?: ReactNode; className?: string; style?: object }) {
  return (
    <div data-stub-card className={`rounded-lg border p-4 ${props.className ?? ''}`} style={{ transform: 'translateZ(0)', background: 'var(--card, var(--bg))', borderColor: 'var(--border)', ...props.style }}>
      {props.children}
    </div>
  )
}
export const CardTitle = (props: { children?: ReactNode }) => <h3 className="font-semibold">{props.children}</h3>
export const PageHeader = (props: { title: ReactNode; subtitle?: string; actions?: ReactNode }) => (
  <header className="flex items-center gap-2">
    {props.title}
    {props.actions}
  </header>
)
export const EmptyState = (props: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 p-4 text-sm" style={{ textAlign: 'center' }}>
    <strong>{props.title}</strong>
    {props.subtitle && <span className="text-muted">{props.subtitle}</span>}
    {props.action}
  </div>
)
export const Badge = (props: { children?: ReactNode }) => <span className="rounded border px-1 text-xs">{props.children}</span>
export const Btn = forwardRef<HTMLButtonElement, Record<string, unknown>>(function Btn({ primary, variant, ...rest }, ref) {
  return <button ref={ref} {...rest} data-primary={primary ? '' : undefined} className={`rounded border px-3 py-1 text-sm ${(rest.className as string) ?? ''}`} />
})
export const Input = forwardRef<HTMLInputElement, Record<string, unknown>>(function Input(props, ref) {
  return <input ref={ref} {...props} className="rounded border px-2 py-1 text-sm" />
})
// Models the host control: with room (80 px a segment) it shows every label; with less
// it shows only the selected label (`compact`), and under 44 px a segment
// a single dropdown button. `collapse={false}`
// (the host prop) keeps the full row. Colors follow the host: inactive text
// is the theme's muted color, the selected one its accent, on the elevated bg.
export function SegmentedControl(props: { segments: { key: string; label: ReactNode }[]; value: string; onChange(key: string): void; ariaLabel?: string; wrap?: boolean | 'hug'; collapse?: boolean; compact?: boolean; layoutId?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'full' | 'compact' | 'dropdown'>(props.compact ? 'compact' : 'full')
  const n = props.segments.length
  useLayoutEffect(() => {
    const measure = () => {
      if (props.compact) return setMode('compact')
      if (props.collapse === false) return setMode('full')
      const width = root.current?.parentElement?.clientWidth ?? 0
      setMode(width >= n * 80 + 16 ? 'full' : width >= n * 44 + 16 ? 'compact' : 'dropdown')
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current?.parentElement) observer.observe(root.current.parentElement)
    return () => observer.disconnect()
  }, [n, props.collapse, props.compact])
  if (mode === 'dropdown') {
    return (
      <div ref={root} className="inline-flex">
        <button type="button" data-collapsed aria-expanded="false" style={{ color: 'var(--accent)', background: 'var(--bg-elevated)' }}>
          {props.segments.find((s) => s.key === props.value)?.label}
        </button>
      </div>
    )
  }
  return (
    <div ref={root} role="tablist" aria-label={props.ariaLabel} className={`flex gap-1 ${props.wrap ? 'flex-wrap' : ''}`} style={{ background: 'var(--bg-elevated)' }}>
      {props.segments.map((s) => {
        const selected = s.key === props.value
        return (
          <button key={s.key} type="button" role="tab" aria-selected={selected} onClick={() => props.onChange(s.key)} className="rounded border px-2 py-1 text-sm" style={{ color: selected ? 'var(--accent)' : 'var(--muted)', background: 'var(--bg-elevated)' }}>
            {mode === 'full' || selected ? s.label : null}
          </button>
        )
      })}
    </div>
  )
}
