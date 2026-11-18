// A collapsible snippet: a bordered box whose header holds a disclosure
// arrow and a title in one button (aria-expanded), and one action floated
// right. Clicking the arrow or the title shows or hides the body. The task
// drawer's source lines use it; other short excerpts that fold should too.
import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from './icons.ts'
import { ICON } from './controls.tsx'

export function SnippetHeader(props: { title: ReactNode; open: boolean; onToggle: () => void; controls: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1" data-snippet-header>
      <button
        type="button"
        aria-expanded={props.open}
        aria-controls={props.controls}
        onClick={props.onToggle}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
        data-snippet-toggle
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none', transform: props.open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
          <ChevronRight size={ICON} />
        </span>
        <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
          {props.title}
        </span>
      </button>
      {props.action && <span className="ml-auto flex-none">{props.action}</span>}
    </div>
  )
}

export function SnippetFold(props: { title: ReactNode; action?: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; children: ReactNode; attrs?: Record<string, string> }) {
  const [open, setOpen] = useState(props.open ?? true)
  const body = useId()
  const toggle = () => {
    setOpen(!open)
    props.onToggle?.(!open)
  }
  return (
    <div className="rounded border text-xs" style={{ borderColor: 'var(--border)' }} data-snippet data-open={open ? 'true' : 'false'} {...props.attrs}>
      <SnippetHeader title={props.title} open={open} onToggle={toggle} controls={body} action={props.action} />
      <div id={body} hidden={!open} className="border-t" style={{ borderColor: 'var(--border)' }}>
        {props.children}
      </div>
    </div>
  )
}

// Numbered lines from a file, the cited ones marked (CitedFile's look).
export function ExcerptLines(props: { rows: { number: number; text: string; hit: boolean }[]; label: string }) {
  return (
    <div role="group" aria-label={props.label} className="overflow-x-auto py-1" data-excerpt-lines style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
      {props.rows.map((row) => (
        <div
          key={row.number}
          className="flex gap-3 px-2"
          data-line-number={row.number}
          data-cited={row.hit ? 'true' : undefined}
          style={row.hit ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
        >
          <span aria-hidden="true" className="flex-none select-none text-right text-muted" style={{ minWidth: '3ch' }}>
            {row.number}
          </span>
          <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.text}</span>
        </div>
      ))}
    </div>
  )
}
