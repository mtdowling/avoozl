// A large modal dialog: a title, a body that scrolls, and a footer that
// stays in view. Esc and a click outside ask `onDismiss`, which decides
// whether to close. Tab and Shift+Tab stay inside while it is open, and
// focus goes back where it was when it closes. Full screen on a narrow page.
import { useEffect, useRef, type ReactNode } from 'react'
import { useMedia } from './TaskDrawer.tsx'
import { trapStep } from './focus-trap.ts'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function Modal(props: { id: string; title: ReactNode; onDismiss: () => void; footer: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const narrow = useMedia('(max-width: 767px)')
  const dismiss = useRef(props.onDismiss)
  dismiss.current = props.onDismiss
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      // The page's confirm dialog sits above this one and handles its keys.
      if (document.querySelector('[data-confirm-dialog]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss.current()
        return
      }
      if (event.key !== 'Tab' || !box.current) return
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      const next = trapStep(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey)
      if (next < 0) return
      event.preventDefault()
      items[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [])
  return (
    <div className="fixed inset-0" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden="true" className="absolute inset-0" onClick={() => dismiss.current()} style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${props.id}-title`}
        data-modal={props.id}
        data-modal-size={narrow ? 'full' : 'large'}
        className="relative flex flex-col border shadow-lg"
        style={{
          width: narrow ? '100vw' : 'min(64rem, 94vw)',
          height: narrow ? '100vh' : 'min(52rem, 90vh)',
          borderRadius: narrow ? 0 : 10,
          background: 'var(--card, var(--bg))',
          color: 'var(--text)',
          borderColor: 'var(--border)',
        }}
      >
        <h3 id={`${props.id}-title`} className="border-b px-4 py-3 text-lg font-semibold" style={{ borderColor: 'var(--border)' }}>
          {props.title}
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          {props.footer}
        </div>
      </div>
    </div>
  )
}
