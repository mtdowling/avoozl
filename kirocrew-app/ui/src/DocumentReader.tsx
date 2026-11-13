// The whole-file reader: a large modal over the page that shows one
// workspace Markdown file (document.get) with the plan reader's renderer,
// highlighter and outline, scrolled to the cited lines, which stay marked.
// Esc, Close and a click outside shut it; Tab stays inside while it is
// open; under prefers-reduced-motion nothing slides or fades; on a narrow
// screen it fills the screen. The task drawer opens it for a task's source.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppApi } from '@kirocrew/app-sdk'
import { Markdown } from './Markdown.tsx'
import { Tooltip } from './Tooltip.tsx'
import { useMedia } from './TaskDrawer.tsx'
import { PROSE_MEASURE } from './PlansView.tsx'
import { IconBtn, IconLabel, SectionHeading } from './controls.tsx'
import { Copy, FolderOpen, X } from './icons.ts'
import { outline } from './markdown.ts'
import { registerLanguages } from './highlight.ts'
import { plansClient } from './plans-api.ts'
import { insideWorkspace, lineText, taskClient } from './task-api.ts'
import { CITED_STYLE, markCited } from './CitedFile.tsx'
import { useReveal } from './RepositoriesSettings.tsx'
import { errorMessage, workspaceClient } from './workspace-api.ts'
import { APP_ATTR, useBackStep } from './NavHistory.tsx'

export interface ReaderTarget {
  document: string
  lineStart: number | null
  lineEnd: number | null
}

const PREFIX = 'avoozl-reader'
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

// `text` shows a file bundled with the app (the Plugin guide) instead of
// reading a workspace file; it has no folder to reveal.
export function DocumentReader(props: { workspaceId: string; target: ReaderTarget; onClose: () => void; text?: string }) {
  const { workspaceId, target, onClose, text } = props
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const reveal = useReveal()
  const narrow = useMedia('(max-width: 767px)')
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const [doc, setDoc] = useState<{ text: string | null; error: string | null }>({ text: null, error: null })
  const [note, setNote] = useState<string | null>(null)
  const [, setGrammars] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let live = true
    if (text !== undefined) setDoc({ text, error: null })
    else tasks.document(workspaceId, target.document).then(
      (value) => live && setDoc({ text: value.text, error: null }),
      (caught: unknown) => live && setDoc({ text: null, error: errorMessage(caught) }),
    )
    // The workspace's extra grammars, as the Plans tab loads them.
    plansClient(api)
      .languages(workspaceId)
      .then(
        (result) => {
          registerLanguages(result.languages)
          if (live) setGrammars((n) => n + 1)
        },
        () => undefined,
      )
    return () => {
      live = false
    }
  }, [api, tasks, workspaceId, target.document, text])

  // Scroll to the cited lines and mark them for good (CitedFile's mark),
  // the same blocks the drawer marks. Under reduced motion the jump is
  // instant.
  const toLine = useCallback(() => {
    const root = body.current
    if (!root || !target.lineStart) return
    markCited(root, target.lineStart, target.lineEnd, still)
  }, [target.lineStart, target.lineEnd, still])
  useEffect(() => {
    if (doc.text === null) return
    const frame = requestAnimationFrame(toLine)
    return () => cancelAnimationFrame(frame)
  }, [doc.text, toLine])

  // Focus moves in on open and back on close; Esc and Back close this, not
  // the drawer under it; Tab and Shift+Tab wrap inside.
  useBackStep('modal', true, 'Close the file', onClose)
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return event.preventDefault()
      const first = items[0],
        last = items[items.length - 1],
        at = document.activeElement
      if (event.shiftKey && (at === first || at === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (at === last || !panel.current.contains(at))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      returnTo.current?.focus?.()
    }
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(target.document)
      setNote(`Copied ${target.document}.`)
    } catch {
      setNote(`Could not copy. The path is ${target.document}`)
    }
  }
  const revealFile = async () => {
    if (!insideWorkspace(target.document)) return setNote('This path is outside the workspace, so it is not opened.')
    try {
      const list = await workspaceClient(api).list()
      const root = list.items.find((w) => w.id === workspaceId)?.root
      if (!root) return setNote('The workspace folder is not known here.')
      setNote(await reveal(`${root.replace(/\/$/, '')}/${target.document}`))
    } catch (caught) {
      setNote(errorMessage(caught))
    }
  }

  const headings = doc.text ? outline(doc.text, PREFIX, 3) : []
  const line = lineText(target)
  const jump = (id: string) => panel.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' })

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-document-reader {...{ [APP_ATTR]: '' }}>
      <div aria-hidden="true" data-reader-backdrop className="absolute inset-0" onClick={onClose} style={{ background: 'color-mix(in srgb, var(--text) 35%, transparent)' }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avoozl-reader-title"
        tabIndex={-1}
        className={`relative flex flex-col overflow-hidden border shadow-lg outline-none ${narrow ? '' : 'rounded-lg'}`}
        style={{
          width: narrow ? '100vw' : 'min(78rem, 94vw)',
          height: narrow ? '100vh' : '90vh',
          background: 'var(--card, var(--bg))',
          color: 'var(--text)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <SectionHeading
            id="avoozl-reader-title"
            title={<code>{target.document}</code>}
            actions={
              <>
                <IconBtn icon={Copy} label="Copy path" tooltip={`Copy ${target.document}`} onClick={() => void copy()} />
                {text === undefined && <IconBtn icon={FolderOpen} label="Reveal in Finder" tooltip="Show this file in Finder" onClick={() => void revealFile()} />}
                <IconLabel icon={X} onClick={onClose} aria-label="Close the file">
                  Close
                </IconLabel>
              </>
            }
            blurb={
              line && (
                <Tooltip text={`Scroll back to ${line.toLowerCase()}`}>
                  {(describedBy) => (
                    <button type="button" className="text-xs text-muted hover:underline" onClick={toLine} aria-describedby={describedBy}>
                      {line}
                    </button>
                  )}
                </Tooltip>
              )
            }
          />
          {note && (
            <p role="status" className="mt-1 text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
              {note}
            </p>
          )}
        </div>
        <div
          className="min-h-0 grow"
          style={narrow ? { display: 'flex', flexDirection: 'column', overflowY: 'auto' } : { display: 'grid', gridTemplateColumns: '15rem minmax(0, 1fr)', minHeight: 0 }}
          ref={narrow ? body : undefined}
        >
          {headings.length > 0 &&
            (narrow ? (
              <details className="border-b px-4 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                <summary className="cursor-pointer font-medium">Outline</summary>
                <Outline headings={headings} onJump={jump} />
              </details>
            ) : (
              <nav aria-label="File outline" className="overflow-y-auto border-r px-3 py-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Outline</h4>
                <Outline headings={headings} onJump={jump} />
              </nav>
            ))}
          <div
            ref={narrow ? undefined : body}
            className="min-w-0 px-5 py-4"
            style={narrow ? undefined : { overflowY: 'auto', gridColumn: headings.length ? undefined : '1 / -1' }}
            aria-label={`Contents of ${target.document}`}
          >
            {doc.error ? (
              <p role="alert" className="text-sm text-danger">
                {doc.error}
              </p>
            ) : doc.text === null ? (
              <p className="text-sm text-muted">Reading…</p>
            ) : (
              <>
                <style>{CITED_STYLE}</style>
                <Markdown text={doc.text} idPrefix={PREFIX} measure={PROSE_MEASURE} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Outline(props: { headings: { level: number; text: string; id: string }[]; onJump: (id: string) => void }) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {props.headings.map((h) => (
        <li key={h.id} className="truncate" style={{ paddingLeft: (h.level - 1) * 12 }}>
          <button type="button" className={`text-left hover:underline ${h.level === 1 ? 'font-medium' : 'text-xs text-muted'}`} onClick={() => props.onJump(h.id)}>
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  )
}
