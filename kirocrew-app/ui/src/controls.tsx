// Small controls every view shares: icon buttons, the confirm step every
// destructive action takes, a collapsible section, and "Ask in a chat".
// The host ships no accordion, collapsible or confirm component the page
// can use (its exports are Badge, Btn, Card, CardTitle, Clickable,
// EmptyState, Input, Modal, SegmentedControl and a few more, with untyped
// props), so these use native elements and inline styles.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useAppApi, useChatLauncher } from '@kirocrew/app-sdk'
import { Btn } from '@kirocrew/app-sdk/ui'
import { ChevronRight, VIEW_ICONS, type LucideIcon } from './icons.ts'
import { chatClient, type ChatSeed } from './chat-api.ts'
import { errorMessage } from './workspace-api.ts'
import { moreLabel, visibleCount } from './paging.ts'
import { Tooltip } from './Tooltip.tsx'

export const ICON = 14

// Danger: the theme's danger color, readable in light and dark.
export const dangerStyle: CSSProperties = { color: 'var(--danger)', borderColor: 'var(--danger)' }
const dangerFill: CSSProperties = { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }

const row: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 }

// A button with an icon before its text. `tooltip` says what it does when
// the word alone doesn't.
export function IconLabel(props: {
  icon: LucideIcon
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tooltip?: string
  primary?: boolean
  style?: CSSProperties
  'aria-label'?: string
}) {
  const Icon = props.icon
  return (
    <Tooltip text={props.tooltip}>
      {(describedBy) => (
        <Btn
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          primary={props.primary}
          aria-label={props['aria-label']}
          aria-describedby={describedBy}
          style={{ ...row, ...props.style }}
        >
          <Icon size={ICON} aria-hidden="true" />
          {props.children}
        </Btn>
      )}
    </Tooltip>
  )
}

// An icon-only button: the label is its accessible name and its tooltip.
// A separate `tooltip` text is also wired as its description.
export function IconBtn(props: {
  icon: LucideIcon
  label: string
  tooltip?: string
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
}) {
  const Icon = props.icon
  return (
    <Tooltip text={props.tooltip ?? props.label}>
      {(describedBy) => (
        <Btn
          type="button"
          aria-label={props.label}
          aria-describedby={props.tooltip && props.tooltip !== props.label ? describedBy : undefined}
          onClick={props.onClick}
          disabled={props.disabled}
          style={{ ...row, padding: '4px 6px', ...props.style }}
        >
          <Icon size={ICON} aria-hidden="true" />
        </Btn>
      )}
    </Tooltip>
  )
}

// What a confirm step says: the thing, what happens, and the red button's
// label (a verb, e.g. "Remove").
export interface ConfirmCopy {
  title: string
  body: string
  action: string
}

type Ask = (copy: ConfirmCopy) => Promise<boolean>
const ConfirmContext = createContext<Ask>(async () => false)
export const useConfirm = () => useContext(ConfirmContext)

// One confirm dialog for the page. Esc and Cancel say no; focus starts on
// Cancel, so Enter alone never confirms.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmCopy & { resolve: (yes: boolean) => void }) | null>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const ask = useCallback<Ask>((copy) => new Promise((resolve) => setPending({ ...copy, resolve })), [])
  const answer = (yes: boolean) => {
    pending?.resolve(yes)
    setPending(null)
  }
  useEffect(() => {
    if (!pending) return
    cancel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        answer(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <div className="fixed inset-0" style={{ zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            onClick={() => answer(false)}
            style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="avoozl-confirm-title"
            aria-describedby="avoozl-confirm-body"
            data-confirm-dialog
            className="relative rounded-lg border p-4 shadow-lg"
            style={{ width: 'min(28rem, 92vw)', background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }}
          >
            <h3 id="avoozl-confirm-title" className="text-base font-semibold">
              {pending.title}
            </h3>
            <p id="avoozl-confirm-body" className="mt-2 text-sm text-muted">
              {pending.body}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn ref={cancel} type="button" onClick={() => answer(false)}>
                Cancel
              </Btn>
              <Btn type="button" data-danger onClick={() => answer(true)} style={dangerFill}>
                {pending.action}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

// A destructive button. It always asks first; `onConfirm` runs only on yes.
export function DangerBtn(props: {
  confirm: ConfirmCopy
  onConfirm: () => void
  children: ReactNode
  icon?: LucideIcon
  disabled?: boolean
  label?: string
  tooltip?: string
  primary?: boolean
}) {
  const ask = useConfirm()
  const Icon = props.icon
  return (
    <Tooltip text={props.tooltip ?? props.label}>
      {(describedBy) => (
        <Btn
          type="button"
          data-danger
          aria-label={props.label}
          aria-describedby={props.tooltip ? describedBy : undefined}
          disabled={props.disabled}
          onClick={() => void ask(props.confirm).then((yes) => yes && props.onConfirm())}
          style={{ ...row, ...dangerStyle }}
        >
          {Icon && <Icon size={ICON} aria-hidden="true" />}
          {props.children}
        </Btn>
      )}
    </Tooltip>
  )
}

// When a fold in a group opens, close the others in that group. Browsers
// that support <details name> already did; this covers webviews that don't.
export function closeOthers(opened: { open: boolean }, group: Iterable<{ open: boolean }>) {
  if (!opened.open) return
  for (const other of group) if (other !== opened && other.open) other.open = false
}

// A collapsible section: native <details>, styled like a host card header.
// Folds that share a `group` are exclusive: opening one closes the rest.
// Give each accordion its own group name so separate ones don't interfere.
export function Fold(props: { title: ReactNode; open?: boolean; children: ReactNode; id?: string; group?: string; onToggle?: (open: boolean) => void }) {
  const [open, setOpen] = useState(props.open ?? false)
  const { group } = props
  return (
    <details
      open={open}
      name={group}
      onToggle={(event) => {
        const el = event.currentTarget as HTMLDetailsElement
        setOpen(el.open)
        props.onToggle?.(el.open)
        if (group) closeOthers(el, el.ownerDocument.querySelectorAll<HTMLDetailsElement>(`details[data-fold-group="${CSS.escape(group)}"]`))
      }}
      className="border-t"
      style={{ borderColor: 'var(--border)' }}
      data-fold={props.id}
      data-fold-group={group}
    >
      <summary className="flex items-center gap-2 py-2 text-sm font-semibold" style={{ cursor: 'pointer', listStyle: 'none' }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
          <ChevronRight size={ICON} />
        </span>
        {props.title}
      </summary>
      <div className="pb-3">{props.children}</div>
    </details>
  )
}

// A row of picture-less radio cards: a title, one line, and optional "Use
// it when" text. Arrow keys move the choice, as in the Who codes picker.
export function ChoiceCards<K extends string>(props: {
  id: string
  label: string
  value: K
  onChange: (value: K) => void
  cards: { key: K; title: string; line: string; when?: string; icon?: LucideIcon; disabled?: string }[]
}) {
  const live = props.cards.filter((c) => !c.disabled)
  return (
    <div role="radiogroup" aria-label={props.label} className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
      {props.cards.map((card) => {
        const selected = card.key === props.value
        const Icon = card.icon
        return (
          <div
            key={card.key}
            id={`${props.id}-${card.key}`}
            role="radio"
            aria-checked={selected}
            aria-disabled={card.disabled ? true : undefined}
            tabIndex={selected ? 0 : -1}
            data-choice={card.key}
            onClick={() => !card.disabled && props.onChange(card.key)}
            onKeyDown={(event) => {
              const at = live.indexOf(card)
              const next =
                event.key === 'ArrowRight' || event.key === 'ArrowDown'
                  ? live[(at + 1) % live.length]
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    ? live[(at - 1 + live.length) % live.length]
                    : event.key === ' ' || event.key === 'Enter'
                      ? card
                      : null
              if (!next || next.disabled) return
              event.preventDefault()
              props.onChange(next.key)
              document.getElementById(`${props.id}-${next.key}`)?.focus()
            }}
            className="flex flex-col gap-1 rounded-lg"
            style={{
              cursor: card.disabled ? 'not-allowed' : 'pointer',
              opacity: card.disabled ? 0.6 : 1,
              border: `${selected ? 2 : 1}px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              padding: selected ? 9 : 10,
              background: selected ? 'color-mix(in srgb, var(--accent) 5%, var(--card))' : 'var(--card)',
            }}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {Icon && <Icon size={ICON} aria-hidden="true" style={{ color: 'var(--muted)' }} />}
              {card.title}
            </span>
            <span className="text-xs">{card.line}</span>
            {card.when && <span className="text-xs text-muted">Use it when {card.when}</span>}
            {card.disabled && <span className="text-xs text-muted">{card.disabled}</span>}
          </div>
        )
      })}
    </div>
  )
}

// "Ask in a chat": the backend builds the seed from everything it knows
// (chat.context), and the host opens a new Kiro Crew chat with it.
export function useAskChat(workspaceId: string | null) {
  const api = useAppApi()
  const chats = useMemo(() => chatClient(api), [api])
  const { openChat } = useChatLauncher()
  const [error, setError] = useState<string | null>(null)
  const ask = useCallback(
    async (seed: ChatSeed) => {
      if (!workspaceId) return
      setError(null)
      try {
        const { message } = await chats.context(workspaceId, seed)
        openChat({ message, autoSend: true })
      } catch (caught) {
        setError(errorMessage(caught))
      }
    },
    [chats, openChat, workspaceId],
  )
  return { ask, error }
}

// Paging for every long list: each list (by id) shows its first PAGE rows
// and grows by PAGE a click. A new `reset` (a filter change) starts every
// list over at its first PAGE.
export function usePages(reset: string) {
  const [state, setState] = useState<{ reset: string; pages: Record<string, number> }>({ reset, pages: {} })
  const pages = state.reset === reset ? state.pages : {}
  const count = (id: string, total: number) => visibleCount(pages[id] ?? 1, total)
  return {
    take: <T,>(id: string, items: T[]) => items.slice(0, count(id, items.length)),
    more: (id: string, total: number) => ({
      left: total - count(id, total),
      onMore: () => setState({ reset, pages: { ...pages, [id]: (pages[id] ?? 1) + 1 } }),
    }),
  }
}

// The one "Show 100 more (N left)" button.
export function ShowMore(props: { left: number; onMore: () => void }) {
  if (props.left <= 0) return null
  return (
    <button type="button" className="mt-2 text-xs underline" onClick={props.onMore} data-show-more>
      {moreLabel(props.left)}
    </button>
  )
}

// A host Btn with the page's Tooltip, for text buttons whose word alone
// doesn't say what happens.
export function TipBtn({ tooltip, ...rest }: { tooltip?: string | null; children?: ReactNode } & Record<string, unknown>) {
  return <Tooltip text={tooltip}>{(describedBy) => <Btn {...rest} aria-describedby={describedBy} />}</Tooltip>
}

// A top-level view's page heading: its icon, then its word. The icon is the
// same one its nav tab shows, sized to the text and hidden from readers.
export function ViewHeading(props: { id: string; view: keyof typeof VIEW_ICONS; children: ReactNode; className?: string }) {
  const Icon = VIEW_ICONS[props.view]
  return (
    <h2 id={props.id} className={props.className ?? 'flex items-center gap-2 text-lg font-semibold'}>
      <Icon size={18} aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {props.children}
    </h2>
  )
}

// The nav tab label: the view's icon, then its word.
export function ViewLabel(props: { view: keyof typeof VIEW_ICONS; children: ReactNode }) {
  const Icon = VIEW_ICONS[props.view]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={ICON} aria-hidden="true" style={{ flexShrink: 0 }} />
      {props.children}
    </span>
  )
}
