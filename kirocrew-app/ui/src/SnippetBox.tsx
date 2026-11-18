// A collapsible snippet: a header with a disclosure arrow and a title that
// both show and hide the body (one button, aria-expanded), and an optional
// action floated to the right of the header. The one shape for any snippet
// a page folds, so none has its own arrow or header.
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from './icons.ts'

export function SnippetBox(props: {
  title: ReactNode
  // Right side of the header: a button or link; it does not toggle.
  action?: ReactNode
  // Open at first (default shut).
  open?: boolean
  onToggle?: (open: boolean) => void
  attr?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(props.open ?? false)
  const body = useId()
  const Chevron = open ? ChevronDown : ChevronRight
  const toggle = () => {
    setOpen(!open)
    props.onToggle?.(!open)
  }
  return (
    <div className="rounded border text-xs" style={{ borderColor: 'var(--border)' }} data-snippet data-open={open ? 'true' : 'false'} {...(props.attr ? { [props.attr]: '' } : {})}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={toggle}
          data-snippet-toggle
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', overflowWrap: 'anywhere' }}
        >
          <Chevron size={13} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0">{props.title}</span>
        </button>
        {props.action && <span className="ml-auto flex-none">{props.action}</span>}
      </div>
      <div id={body} hidden={!open}>
        {open && props.children}
      </div>
    </div>
  )
}
