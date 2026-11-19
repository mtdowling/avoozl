// The whole-file reader: a large modal over the page that shows one
// workspace Markdown file (document.get) with the plan reader's renderer,
// highlighter and outline, scrolled to the cited lines, which stay marked.
// Esc, Close and a click outside shut it; Tab stays inside while it is
// open; under prefers-reduced-motion nothing slides or fades; on a narrow
// screen it fills the screen. The task drawer opens it for a task's source.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from './host.ts'
import { Markdown } from './ui/Markdown.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { useMedia } from './use-media.ts'
import { PROSE_MEASURE } from './PlansView.tsx'
import { IconBtn, SectionHeading } from './ui/controls.tsx'
import { Copy, FolderOpen } from './icons.ts'
import { outline } from './markdown.ts'
import { registerLanguages } from './highlight.ts'
import { plansClient } from './plans-api.ts'
import { insideWorkspace, lineText, taskClient } from './task-api.ts'
import { markCited } from './CitedFile.tsx'
import { CitedStyle } from './ui/PageStyles'
import { useReveal } from './RepositoriesSettings.tsx'
import { errorMessage, workspaceClient } from './workspace-api.ts'
import { Modal } from './ui/Modal.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

export interface ReaderTarget {
  document: string
  lineStart: number | null
  lineEnd: number | null
}

const PREFIX = 'avoozl-reader'

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

  useEffect(() => {
    let live = true
    if (text !== undefined) setDoc({ text, error: null })
    else
      tasks.document(workspaceId, target.document).then(
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

  // Focus starts on the panel, so the arrow keys scroll it; the shared
  // Modal keeps Tab inside and gives focus back on close.
  useEffect(() => {
    panel.current?.focus()
  }, [])

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

  // Esc, Back, Close and a click outside shut it, this and not the drawer
  // under it.
  return (
    <Modal
      id="avoozl-reader"
      flush
      width="78rem"
      height="90vh"
      title={<code>{target.document}</code>}
      backLabel="Close the file"
      boxRef={panel}
      attrs={{ 'data-document-reader': true }}
      onDismiss={onClose}
      footer={
        <>
          <IconBtn icon={Copy} label="Copy path" tooltip={`Copy ${target.document}`} onClick={() => void copy()} />
          {text === undefined && <IconBtn icon={FolderOpen} label="Reveal in Finder" tooltip="Show this file in Finder" onClick={() => void revealFile()} />}
        </>
      }
    >
      {(line || note) && (
        <Box css-border-color="border" border="b" px="5" py="2">
          {line && (
            <Tooltip text={`Scroll back to ${line.toLowerCase()}`}>
              {(describedBy) => (
                <PlainButton type="button" size="xs" tone="muted" hoverUnderline onClick={toLine} aria-describedby={describedBy}>
                  {line}
                </PlainButton>
              )}
            </Tooltip>
          )}
          {note && (
            <Box role="status" as="p" css-overflow-wrap="anywhere" size="xs" tone="muted">
              {note}
            </Box>
          )}
        </Box>
      )}
      <div
        className="min-h-0 grow"
        style={narrow ? { display: 'flex', flexDirection: 'column', overflowY: 'auto' } : { display: 'grid', gridTemplateColumns: '15rem minmax(0, 1fr)', minHeight: 0 }}
        ref={narrow ? body : undefined}
      >
        {headings.length > 0 &&
          (narrow ? (
            <Box as="details" css-border-color="border" border="b" px="4" py="2" size="sm">
              <Box as="summary" cursorPointer weight="medium">
                Outline
              </Box>
              <Outline headings={headings} onJump={jump} />
            </Box>
          ) : (
            <Box aria-label="File outline" as="nav" css-border-color="border" overflow="y-auto" borderR px="3" py="3" size="sm">
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
                Outline
              </Box>
              <Outline headings={headings} onJump={jump} />
            </Box>
          ))}
        <div
          ref={narrow ? undefined : body}
          className="min-w-0 px-5 py-4"
          style={narrow ? undefined : { overflowY: 'auto', gridColumn: headings.length ? undefined : '1 / -1' }}
          aria-label={`Contents of ${target.document}`}
        >
          {doc.error ? (
            <ErrorText role="alert" size="sm">
              {doc.error}
            </ErrorText>
          ) : doc.text === null ? (
            <Hint as="p" size="sm">
              Reading…
            </Hint>
          ) : (
            <>
              <CitedStyle />
              <Markdown text={doc.text} idPrefix={PREFIX} measure={PROSE_MEASURE} />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Outline(props: { headings: { level: number; text: string; id: string }[]; onJump: (id: string) => void }) {
  return (
    <Box as="ul" mt="1" flex flexCol gap="0.5">
      {props.headings.map((h) => (
        <li key={h.id} className="truncate" style={{ paddingLeft: (h.level - 1) * 12 }}>
          <button type="button" className={`text-left hover:underline ${h.level === 1 ? 'font-medium' : 'text-xs text-muted'}`} onClick={() => props.onJump(h.id)}>
            {h.text}
          </button>
        </li>
      ))}
    </Box>
  )
}
