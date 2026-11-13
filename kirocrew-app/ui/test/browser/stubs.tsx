// Stand-ins for the host SDK (@kirocrew/app-sdk and its /ui) and lucide-react
// in the modal harness. Card makes a containing block (a transform), as a
// host card or pane may, so a modal that is not portaled shows it.
import { forwardRef, type ReactNode } from 'react'

type Reply = (body: { operation?: string; input?: unknown }) => unknown
const replies: Record<string, Reply> = {}
// The harness answers these operations; any other call never settles, so a
// dialog stays on its loading line.
export function answer(operation: string, reply: Reply) {
  replies[operation] = reply
}
const never = () => new Promise<never>(() => undefined)
// A reply that throws rejects the call, as the SDK does: {status, body}.
const settle = (reply: Reply, body: { operation?: string; input?: unknown }, wrap: boolean) => {
  try {
    const value = reply(body)
    return Promise.resolve(wrap ? { result: value } : value)
  } catch (error) {
    return Promise.reject(error)
  }
}
const api = {
  request: never,
  // GET answers are keyed `GET <path>`.
  get: (path: string) => {
    const reply = replies[`GET ${path}`]
    return reply ? settle(reply, {}, false) : never()
  },
  put: never,
  del: never,
  post: (_path: string, body: { operation?: string }) => {
    const reply = replies[body?.operation ?? '']
    return reply ? settle(reply, body, true) : never()
  },
}
export const useAppApi = () => api
export const useNavigate = () => () => undefined
export const useChatLauncher = () => ({ openChat: () => undefined })

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
  <div>
    {props.title}
    {props.subtitle}
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
export function SegmentedControl(props: { segments: { key: string; label: ReactNode }[]; value: string; onChange(key: string): void; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={props.ariaLabel} className="flex gap-1">
      {props.segments.map((s) => (
        <button key={s.key} type="button" role="tab" aria-selected={s.key === props.value} onClick={() => props.onChange(s.key)} className="rounded border px-2 py-1 text-sm">
          {s.label}
        </button>
      ))}
    </div>
  )
}
