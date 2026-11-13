// The page's one modal. It opens a <dialog> with showModal(), which puts it
// on the browser's top layer: above every z-index on the page and in the
// host, with the page behind it inert. It portals to document.body, so no
// transformed or clipping ancestor (a card, a pane, a drawer) can trap it,
// and its backdrop covers the whole viewport. Esc, Back and a click on the
// backdrop ask `onDismiss`, after a confirm when `unsaved` is set. Tab and
// Shift+Tab stay inside the topmost modal, focus goes back where it was when
// it closes, and the page behind it can't scroll. Full screen on a narrow page.
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useMedia } from './use-media.ts'
import { trapStep } from './focus-trap.ts'
import { APP_ATTR, useBackStep } from './NavHistory.tsx'
import { useConfirm, type ConfirmCopy } from './controls.tsx'
import type { StepKind } from './nav-history.ts'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
const BACKDROP = 'color-mix(in srgb, var(--text) 30%, transparent)'
const BOX = { background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }

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
  // With a title: a heading, a body that scrolls and a footer kept in view.
  title?: ReactNode
  footer?: ReactNode
  // The box's width and height, each capped by the viewport. `plain` drops
  // the padding for a box that lays itself out (the file viewer).
  width?: string
  height?: string
  plain?: boolean
  role?: 'dialog' | 'alertdialog'
  labelledBy?: string
  describedBy?: string
  // Esc, Back and a click outside ask this first; Cancel buttons don't.
  unsaved?: ConfirmCopy | null | false
  backLabel?: string
  kind?: StepKind
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
  useBackStep(props.kind ?? 'modal', true, props.backLabel ?? 'Close the dialog', dismiss)
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
    ;(box.current?.querySelector<HTMLElement>(FOCUSABLE) ?? box.current)?.focus()
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

  const sections = props.title !== undefined
  const size = narrow
    ? { width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }
    : sections || props.height
      ? { width: `min(${props.width ?? '64rem'}, 94vw)`, height: `min(${props.height ?? '52rem'}, 90vh)`, borderRadius: 10 }
      : { width: `min(${props.width ?? '36rem'}, 94vw)`, maxHeight: '88vh', borderRadius: 10 }
  const layout = sections || props.plain ? 'relative flex flex-col overflow-hidden border shadow-lg outline-none' : 'relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none'
  return createPortal(
    <dialog
      ref={dialog}
      role={props.role}
      aria-modal="true"
      aria-labelledby={props.labelledBy ?? `${props.id}-title`}
      aria-describedby={props.describedBy}
      data-modal={props.id}
      data-modal-size={narrow ? 'full' : sections ? 'large' : 'box'}
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
      <style>{'dialog[data-modal]::backdrop{background:transparent}'}</style>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div aria-hidden="true" data-modal-backdrop onClick={dismiss} style={{ position: 'absolute', inset: 0, background: BACKDROP }} />
        <div
          ref={(el) => {
            box.current = el
            if (props.boxRef) props.boxRef.current = el
          }}
          data-modal-box
          tabIndex={-1}
          className={layout}
          style={{ ...BOX, ...size, boxSizing: 'border-box', overscrollBehavior: 'contain' }}
        >
          <PortalTarget.Provider value={target}>
            {sections ? (
              <>
                <h3 id={`${props.id}-title`} className="border-b px-4 py-3 text-lg font-semibold" style={{ borderColor: 'var(--border)' }}>
                  {props.title}
                </h3>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
                {props.footer && (
                  <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                    {props.footer}
                  </div>
                )}
              </>
            ) : (
              props.children
            )}
          </PortalTarget.Provider>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
