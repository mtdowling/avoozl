// The page's one modal. It opens a <dialog> with showModal(), which puts it
// on the browser's top layer: above every z-index on the page and in the
// host, with the page behind it inert. It portals to document.body, so no
// transformed or clipping ancestor (a card, a pane, a drawer) can trap it,
// and its backdrop covers the whole viewport. Esc, Back and a click on the
// backdrop ask `onDismiss`, after a confirm when `unsaved` is set. Tab and
// Shift+Tab stay inside the topmost modal, focus goes back where it was when
// it closes, and the page behind it can't scroll. Full screen on a narrow page.
// Every dialog has Issue Radar's Add crew layout: a fixed header with the
// title and a Close button over a divider, a body that scrolls on its own,
// and a fixed footer (a darker surface, a divider above it) whose buttons sit
// at the right: the dismiss button (Cancel or Close), then the main action.
// There are no side panels: every modal
// is centered, and full screen on a phone.
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useMedia } from './use-media.ts'
import { trapStep } from './focus-trap.ts'
import { APP_ATTR, useBackStep } from './NavHistory.tsx'
import { useConfirm, type ConfirmCopy } from './controls.tsx'
import { X } from './icons.ts'
import { Button } from './Button.tsx'
import type { StepKind } from './nav-history.ts'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
const BACKDROP = 'color-mix(in srgb, var(--bg) 60%, transparent)'
// Radar's dialog: 16px corners, a hairline border, the card surface and a
// large soft shadow; 660px wide at most and 90% of the screen tall.
const BOX = { background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }
const DIVIDER = '1px solid var(--border)'
const MODAL_CSS = `dialog[data-modal]::backdrop{background:transparent}
[data-modal-backdrop]{backdrop-filter:blur(12px)}
[data-modal-close]:hover{background:var(--bg-hover);color:var(--text)}
[data-modal-close]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
@media (prefers-reduced-motion:no-preference){[data-modal-box]{animation:avoozl-modal-in .2s ease}}
@keyframes avoozl-modal-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}`

// The open modals, topmost last; only the topmost takes Tab.
const stack: object[] = []
export const modalOpen = () => stack.length > 0

// The page behind keeps its scroll position and can't move while any is open.
let saved: { html: string; body: string } | null = null
function lockScroll() {
  if (saved) return
  saved = { html: document.documentElement.style.overflow, body: document.body.style.overflow }
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  if (stack.length || !saved) return
  document.documentElement.style.overflow = saved.html
  document.body.style.overflow = saved.body
  saved = null
}

// Where a popup portals: into the modal it belongs to, so it sits above
// that modal; null outside any modal (the popup then uses document.body).
const PortalTarget = createContext<HTMLElement | null>(null)
export const usePortalTarget = () => useContext(PortalTarget)

export function Modal(props: {
  id: string
  onDismiss: () => void
  children: ReactNode
  // The header's title, and the footer's buttons (Cancel, then the primary
  // one at the far right).
  title: ReactNode
  // The footer's own actions; the dismiss button is always added after them.
  footer?: ReactNode
  // The dismiss button's label: 'Cancel' in a modal that edits or confirms,
  // 'Close' in one that only shows. The footer's main action is a
  // variant="primary" (or "danger") Button and sits at the far right.
  dismissLabel?: 'Close' | 'Cancel'
  // Focus starts on Close (a safe button beside a red one).
  focusClose?: boolean
  // The box's largest width, and a fixed height when the content wants one;
  // each is capped by the viewport.
  width?: string
  height?: string
  // The body has no padding and does not scroll: its content lays itself out
  // (the file viewer's outline and text).
  flush?: boolean
  role?: 'dialog' | 'alertdialog'
  labelledBy?: string
  describedBy?: string
  // Esc, Back and a click outside ask this first; Cancel buttons don't.
  unsaved?: ConfirmCopy | null | false
  backLabel?: string
  kind?: StepKind
  // What browser Back does; Esc and Close still call onDismiss.
  onBack?: () => void
  boxRef?: RefObject<HTMLDivElement | null>
  attrs?: Record<string, string | number | boolean | undefined>
}) {
  const ask = useConfirm()
  const narrow = useMedia('(max-width: 767px)')
  const dialog = useRef<HTMLDialogElement>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const latest = useRef(props)
  latest.current = props
  const asking = useRef(false)
  const dismiss = useCallback(() => {
    const { unsaved, onDismiss } = latest.current
    if (!unsaved) return onDismiss()
    if (asking.current) return
    asking.current = true
    void ask(unsaved).then((yes) => {
      asking.current = false
      if (yes) latest.current.onDismiss()
    })
  }, [ask])
  useBackStep(props.kind ?? 'modal', true, props.backLabel ?? 'Close the dialog', () => (latest.current.onBack ?? dismiss)(), dismiss)
  useLayoutEffect(() => {
    const el = dialog.current
    if (!el) return
    const me = {}
    const before = document.activeElement as HTMLElement | null
    if (!el.open) el.showModal()
    stack.push(me)
    lockScroll()
    setTarget(el)
    // The first control; the dialog's own effects may move it after.
    // A Close button is first in the DOM; focus starts on the first field.
    // A control marked data-autofocus goes first (a footer's safe button,
    // so a red Remove beside it is never the one Enter presses).
    ;(box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current?.querySelector<HTMLElement>(`:is(${FOCUSABLE}):not([data-modal-close])`) ?? box.current)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || stack.at(-1) !== me || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null || item === document.activeElement)
      const next = trapStep(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey)
      if (next < 0) return
      event.preventDefault()
      items[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
      unlockScroll()
      if (el.open) el.close()
      if (before?.isConnected) before.focus()
    }
  }, [])

  const size = narrow
    ? { width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0, border: 'none' }
    : { width: `min(${props.width ?? '41.25rem'}, calc(100vw - 4rem))`, ...(props.height ? { height: `min(${props.height}, 90vh)` } : { maxHeight: '90vh' }), borderRadius: 16 }
  return createPortal(
    <dialog
      ref={dialog}
      role={props.role}
      aria-modal="true"
      aria-labelledby={props.labelledBy ?? `${props.id}-title`}
      aria-describedby={props.describedBy}
      data-modal={props.id}
      data-modal-size={narrow ? 'full' : 'box'}
      {...{ [APP_ATTR]: '' }}
      {...props.attrs}
      // Esc is the page's Back history's (NavHistory.tsx); never let the
      // browser close the dialog behind React's back.
      onCancel={(event) => {
        event.preventDefault()
        dismiss()
      }}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0, border: 'none', background: 'transparent', overflow: 'hidden', color: 'var(--text)' }}
    >
      <style>{MODAL_CSS}</style>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div aria-hidden="true" data-modal-backdrop onClick={dismiss} style={{ position: 'absolute', inset: 0, background: BACKDROP }} />
        <div
          ref={(el) => {
            box.current = el
            if (props.boxRef) props.boxRef.current = el
          }}
          data-modal-box
          tabIndex={-1}
          className="relative flex flex-col overflow-hidden border outline-none"
          style={{ ...BOX, ...size, boxSizing: 'border-box', overscrollBehavior: 'contain' }}
        >
          <PortalTarget.Provider value={target}>
            <div data-modal-header style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 12, padding: '12px 48px 12px 20px', borderBottom: DIVIDER }}>
              <h2 id={`${props.id}-title`} style={{ margin: 0, minWidth: 0, flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-strong, var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {props.title}
              </h2>
            </div>
            <button type="button" data-modal-close aria-label="Close" onClick={dismiss} style={{ position: 'absolute', top: 12, right: 16, width: 28, height: 28, padding: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
              <X size={16} aria-hidden="true" />
            </button>
            <div data-modal-body style={{ minHeight: 0, flex: 1, ...(props.flush ? { overflow: 'hidden', padding: 0, gap: 0 } : { overflowX: 'hidden', overflowY: 'auto', padding: '16px 20px', gap: 12 }), display: 'flex', flexDirection: 'column' }}>
              {props.children}
            </div>
            <div data-modal-footer style={{ display: 'flex', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: DIVIDER, background: 'var(--bg-accent, var(--bg-elevated))' }}>
              <Button type="button" data-modal-footer-close data-autofocus={props.focusClose ? true : undefined} onClick={dismiss}>
                {props.dismissLabel ?? 'Close'}
              </Button>
              {props.footer}
            </div>
          </PortalTarget.Provider>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
