// The phone's detail pane, from Kiro Crew's list-detail pattern: a sticky row
// that holds the Back control and, once the big title has scrolled away, the
// title in small type. Back is the only way out of the pane, so it is
// a normal compact button. On a desktop this renders its children and nothing else.
import type { ReactNode } from 'react'
import { ArrowLeft } from './icons.ts'
import { LAYER } from './layers.ts'
import { usePhone } from './list-detail.ts'
import { useTitleScrolledOut } from './use-title-scrolled-out.ts'

export function ListDetailBack(props: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      data-list-detail-back
      onClick={props.onBack}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '2px 8px', marginLeft: -4, background: 'none', border: 0, borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {props.label}
    </button>
  )
}

// The sticky row alone, for a page that draws its own big title: pass that
// title's `titleRef` (useTitleScrolledOut) and `scrolledOut`.
export function DetailBar(props: { backLabel: string; onBack: () => void; title: string; scrolledOut: boolean; actions?: ReactNode }) {
  return (
    <div data-detail-bar style={{ position: 'sticky', top: 0, zIndex: LAYER.sticky, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)' }}>
      <ListDetailBack label={props.backLabel} onBack={props.onBack} />
      <span
        aria-hidden="true"
        data-detail-echo
        style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 600, opacity: props.scrolledOut ? 1 : 0, transition: 'opacity 150ms' }}
      >
        {props.title}
      </span>
      {props.actions}
    </div>
  )
}

export function DetailPane(props: { backLabel: string; onBack: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const phone = usePhone()
  const { scrolledOut, titleRef } = useTitleScrolledOut()
  if (!phone) return <>{props.children}</>
  return (
    <div data-detail-pane>
      <DetailBar backLabel={props.backLabel} onBack={props.onBack} title={props.title} scrolledOut={scrolledOut} actions={props.actions} />
      <h2 ref={titleRef} data-detail-title style={{ margin: '4px 0 12px', fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>
        {props.title}
      </h2>
      {props.children}
    </div>
  )
}
