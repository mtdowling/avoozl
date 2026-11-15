// A "More" button that opens a small panel of extra controls under it. On a
// phone the header and page headings keep one thin row by moving their extra
// buttons here. The panel stays mounted while open, so a control in it can
// open its own dialog; a tap outside, Esc, or a plain menu item closes it.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ellipsis } from './icons.ts'
import { LAYER } from './layers.ts'

export function MoreMenu(props: { label: string; children: ReactNode; attrs?: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      // A dialog opened from the menu sits in the top layer, inside this root.
      if (root.current && !root.current.contains(target)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 0 }} {...props.attrs}>
      <button
        type="button"
        aria-label={props.label}
        aria-expanded={open}
        aria-haspopup="true"
        data-more-button
        onClick={() => setOpen(!open)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: open ? 'var(--bg-hover, var(--bg-elevated))' : 'transparent', color: 'var(--text)', cursor: 'pointer' }}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          data-more-panel
          // A click on a plain item (one that opens nothing) closes the menu.
          onClick={(event) => {
            const item = (event.target as Element).closest('button, a')
            if (item && !item.hasAttribute('aria-haspopup') && !item.closest('[data-keep-menu]')) setOpen(false)
          }}
          style={{ position: 'absolute', top: '100%', right: 0, zIndex: LAYER.popover, marginTop: 4, minWidth: 220, maxWidth: 'calc(100vw - 24px)', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, var(--bg-elevated))', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
        >
          {props.children}
        </div>
      )}
    </div>
  )
}
