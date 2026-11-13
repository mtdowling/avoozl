// The task drawer's Files fold (design §8.10): a read-only tree of what the
// task's branch changed, one file's diff, and Open in editor. Nothing here
// writes: the reads are task.files and task.diff.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import Badge from './Badge.tsx'
import { errorMessage } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import { ExternalLink, Folder, GitBranch, RefreshCw } from './icons.ts'
import { IconBtn } from './controls.tsx'
import {
  EDITORS,
  STATUS_LETTER,
  STATUS_VARIANT,
  diffSummary,
  editorHref,
  fileTree,
  filesClient,
  firstChangedLine,
  isText,
  joinPath,
  parseDiff,
  readEditor,
  splitRows,
  statusCounts,
  writeEditor,
  type DiffLine,
  type DiffView,
  type Editor,
  type FileChange,
  type FilesView,
  type TextLine,
  type TreeNode,
} from './files-api.ts'

// A diff longer than this many lines shows its start, then a button.
export const DIFF_LINES = 1500

function pageStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const mono: CSSProperties = { fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: 12, lineHeight: '18px' }
const LINE_BG = {
  add: 'color-mix(in srgb, var(--ok) 16%, transparent)',
  del: 'color-mix(in srgb, var(--danger) 16%, transparent)',
  hunk: 'color-mix(in srgb, var(--accent) 10%, transparent)',
} as const

function StatusBadge({ change }: { change: FileChange }) {
  return (
    <span data-status={change.status}>
      <span aria-hidden="true">
        <Badge variant={STATUS_VARIANT[change.status]}>{STATUS_LETTER[change.status]}</Badge>
      </span>
      <span className="sr-only">{change.status}</span>
    </span>
  )
}

function Counts({ change }: { change: FileChange }) {
  if (change.binary) return <span className="text-xs text-muted">binary</span>
  if (change.additions === null) return null
  return (
    <span className="shrink-0 text-xs" style={mono}>
      <span style={{ color: 'var(--ok)' }}>+{change.additions}</span> <span style={{ color: 'var(--danger)' }}>−{change.deletions}</span>
    </span>
  )
}

function Tree(props: { nodes: TreeNode[]; depth: number; selected: string | null; onPick: (path: string) => void }) {
  return (
    <ul aria-label={props.depth === 0 ? 'Files' : undefined} className="flex flex-col">
      {props.nodes.map((node) =>
        node.file ? (
          <li key={node.path}>
            <button
              type="button"
              aria-current={props.selected === node.path ? 'true' : undefined}
              onClick={() => props.onPick(node.path)}
              className="flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left text-sm"
              style={{ paddingLeft: 4 + props.depth * 14, background: props.selected === node.path ? 'var(--bg-elevated)' : undefined, color: node.change ? 'var(--text)' : 'var(--muted)' }}
              data-file={node.path}
            >
              {node.change ? <StatusBadge change={node.change} /> : <span style={{ width: 18 }} aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">
                {node.name}
                {node.change?.from && <span className="text-xs text-muted"> ← {node.change.from}</span>}
                {node.change?.untracked && <span className="text-xs text-muted"> (not committed)</span>}
              </span>
              {node.change && <Counts change={node.change} />}
            </button>
          </li>
        ) : (
          <li key={node.path}>
            <div className="flex items-center gap-1 px-1 py-0.5 text-sm text-muted" style={{ paddingLeft: 4 + props.depth * 14 }}>
              <Folder size={14} aria-hidden="true" />
              <span className="truncate">{node.name}</span>
            </div>
            <Tree nodes={node.children} depth={props.depth + 1} selected={props.selected} onPick={props.onPick} />
          </li>
        ),
      )}
    </ul>
  )
}

const num = (n: number | null) => (
  <span className="select-none pr-2 text-right text-muted" style={{ display: 'inline-block', minWidth: 36 }}>
    {n ?? ''}
  </span>
)

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div role="group" aria-label="Unified diff" style={mono}>
      {lines.map((line, i) =>
        !isText(line) ? (
          <div key={i} className="text-muted" style={{ whiteSpace: 'pre', background: line.kind === 'hunk' ? LINE_BG.hunk : undefined }}>
            {line.text}
          </div>
        ) : (
          <div key={i} data-line={line.kind} style={{ whiteSpace: 'pre', background: line.kind === 'context' ? undefined : LINE_BG[line.kind] }}>
            {num(line.old)}
            {num(line.new)}
            <span>{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}</span>
            {line.text}
          </div>
        ),
      )}
    </div>
  )
}

function SplitDiff({ lines }: { lines: DiffLine[] }) {
  const rows = useMemo(() => splitRows(lines), [lines])
  const side = (line: TextLine | null, which: 'left' | 'right') => (
    <div style={{ whiteSpace: 'pre', overflow: 'hidden', background: line && line.kind !== 'context' ? LINE_BG[line.kind] : undefined }}>
      {line ? (
        <>
          {num(which === 'left' ? line.old : line.new)}
          {line.text}
        </>
      ) : (
        ' '
      )}
    </div>
  )
  return (
    <div role="group" aria-label="Side-by-side diff" style={mono}>
      {rows.map((row, i) =>
        row.kind === 'pair' ? (
          <div key={i} data-split-row style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 1 }}>
            {side(row.left, 'left')}
            {side(row.right, 'right')}
          </div>
        ) : (
          <div key={i} className="text-muted" style={{ whiteSpace: 'pre', background: row.kind === 'hunk' ? LINE_BG.hunk : undefined }}>
            {row.text}
          </div>
        ),
      )}
    </div>
  )
}

function Toggle(props: { label: string; options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  return (
    <span role="group" aria-label={props.label} className="inline-flex overflow-hidden rounded border" style={{ borderColor: 'var(--border)' }}>
      {props.options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={props.value === option.key}
          onClick={() => props.onChange(option.key)}
          className="px-2 py-0.5 text-xs"
          style={props.value === option.key ? { background: 'var(--accent)', color: 'var(--bg)' } : { color: 'var(--text)' }}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}

function Diff(props: { diff: DiffView; layout: 'unified' | 'split' }) {
  const [full, setFull] = useState(false)
  const lines = useMemo(() => parseDiff(props.diff.diff), [props.diff.diff])
  const note = diffSummary(props.diff)
  if (note)
    return (
      <p className="text-sm text-muted" data-diff-summary>
        {note}
      </p>
    )
  const shown = full ? lines : lines.slice(0, DIFF_LINES)
  return (
    <div data-diff className="flex flex-col gap-1">
      <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--border)', background: 'var(--card, var(--bg))' }}>
        {props.layout === 'split' ? <SplitDiff lines={shown} /> : <UnifiedDiff lines={shown} />}
      </div>
      {shown.length < lines.length && (
        <button type="button" className="self-start text-xs underline" onClick={() => setFull(true)}>
          Show the other {lines.length - shown.length} lines
        </button>
      )}
    </div>
  )
}

// The Files fold's body. `active` is false until the fold first opens, so a
// closed fold reads nothing.
export function TaskFiles(props: { workspaceId: string; taskId: string; active: boolean }) {
  const api = useAppApi()
  const client = useMemo(() => filesClient(api), [api])
  const [view, setView] = useState<FilesView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string; view: DiffView | null; error: string | null } | null>(null)
  const [layout, setLayout] = useState<'unified' | 'split'>('unified')
  const [editor, setEditor] = useState<Editor>(() => readEditor(pageStorage()))
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!props.active) return
    let live = true
    setError(null)
    client.files(props.workspaceId, props.taskId, showAll).then(
      (next) => live && setView(next),
      (caught) => live && setError(errorMessage(caught)),
    )
    return () => {
      live = false
    }
  }, [client, props.workspaceId, props.taskId, props.active, showAll, reload])

  useEffect(() => {
    setPicked(null)
    setDiff(null)
    setView(null)
    setShowAll(false)
  }, [props.taskId])

  const pick = (path: string) => {
    setPicked(path)
    setDiff({ path, view: null, error: null })
    client.diff(props.workspaceId, props.taskId, path).then(
      (next) => setDiff((at) => (at?.path === path ? { path, view: next, error: null } : at)),
      (caught) => setDiff((at) => (at?.path === path ? { path, view: null, error: errorMessage(caught) } : at)),
    )
  }

  const tree = useMemo(() => (view ? fileTree(showAll && view.all ? view.all.paths : [], view.files) : []), [view, showAll])
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!view) return <p className="text-sm text-muted">Reading the task&apos;s branch…</p>

  const github = safeHref(view.github) && view.github
  // Open in editor needs the files on this machine: the task's own worktree.
  const local = view.mode === 'worktree' && !view.remote && view.worktree
  const branchLink = github && (
    <a href={safeHref(github)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline" data-github-branch>
      <GitBranch size={14} aria-hidden="true" />
      {view.branch} on GitHub
    </a>
  )
  if (view.mode === 'none')
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted">{view.remote ? 'This task runs on another machine. Its files are not here.' : 'No worktree or branch for this task on this machine yet.'}</p>
        {branchLink}
      </div>
    )
  const pickedChange = view.files.find((f) => f.path === picked) ?? null
  const diffLines = diff?.view ? parseDiff(diff.view.diff) : []
  // The shown file on disk, at its first changed line; a deleted file has none.
  const fileTarget = local && picked && pickedChange?.status !== 'deleted' ? { path: joinPath(view.worktree!, picked), line: firstChangedLine(diffLines) } : null
  const fileHref = fileTarget && editorHref(editor, fileTarget.path, fileTarget.line)
  return (
    <div className="flex flex-col gap-3" data-task-files>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span data-files-totals>
          {view.totals ? (
            <>
              {view.totals.files} {view.totals.files === 1 ? 'file' : 'files'} changed
              {view.totals.files > 0 && (
                <>
                  {' '}
                  · <span style={{ color: 'var(--ok)' }}>+{view.totals.additions}</span> <span style={{ color: 'var(--danger)' }}>−{view.totals.deletions}</span>
                </>
              )}
            </>
          ) : (
            'Too many changes to list.'
          )}
        </span>
        {view.files.length > 0 && <span className="text-xs text-muted">{statusCounts(view.files)}</span>}
        <span className="flex-1" />
        <IconBtn icon={RefreshCw} label="Read the files again" onClick={() => setReload((n) => n + 1)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">{view.mode === 'worktree' ? 'Its worktree' : `Its branch ${view.branch}`} against where it left its base.</span>
        {local ? (
          <a href={editorHref(editor, view.worktree!)!} className="inline-flex items-center gap-1 underline" data-open-worktree>
            <ExternalLink size={14} aria-hidden="true" />
            Open worktree in {EDITORS.find((e) => e.key === editor)!.label}
          </a>
        ) : (
          branchLink
        )}
        {local && (
          <label className="inline-flex items-center gap-1">
            Editor
            <select
              value={editor}
              onChange={(event) => {
                const next = event.target.value as Editor
                setEditor(next)
                writeEditor(pageStorage(), next)
              }}
              className="rounded border px-1 py-0.5 text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--card, var(--bg))', color: 'var(--text)' }}
            >
              {EDITORS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Show all files
        </label>
      </div>
      {tree.length === 0 ? (
        <p className="text-sm text-muted">This task has not changed any files yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded border p-1" style={{ borderColor: 'var(--border)' }}>
          <Tree nodes={tree} depth={0} selected={picked} onPick={pick} />
        </div>
      )}
      {(view.truncated || view.all?.truncated) && <p className="text-xs text-muted">Only the first files are listed.</p>}
      {diff && (
        <section aria-label={`Diff of ${diff.path}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="min-w-0 flex-1 text-sm font-semibold" style={{ ...mono, overflowWrap: 'anywhere' }}>
              {diff.path}
            </h4>
            <Toggle
              label="Diff layout"
              options={[
                { key: 'unified', label: 'Unified' },
                { key: 'split', label: 'Split' },
              ]}
              value={layout}
              onChange={(key) => setLayout(key as 'unified' | 'split')}
            />
            {fileHref && (
              <a href={editorHref(editor, fileTarget!.path, fileTarget!.line)!} className="inline-flex items-center gap-1 text-xs underline" data-open-file>
                <ExternalLink size={14} aria-hidden="true" />
                Open in {EDITORS.find((e) => e.key === editor)!.label}
              </a>
            )}
          </div>
          {diff.error ? (
            <p role="alert" className="text-sm text-danger">
              {diff.error}
            </p>
          ) : diff.view ? (
            <Diff diff={diff.view} layout={layout} />
          ) : (
            <p className="text-sm text-muted">Reading the diff…</p>
          )}
        </section>
      )}
    </div>
  )
}
