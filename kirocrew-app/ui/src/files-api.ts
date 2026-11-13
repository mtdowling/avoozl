// The task drawer's Files fold (design §8.10): what a task's branch changed,
// one file's diff, and Open in editor links. The reads are task.files and
// task.diff; everything else here is pure so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'

export interface FileChange {
  path: string
  from: string | null
  status: ChangeStatus
  additions: number | null
  deletions: number | null
  binary: boolean
  untracked?: boolean
}

export interface FilesView {
  taskId: string
  // worktree: its own checkout on this machine; branch: only its branch;
  // none: nothing to read here.
  mode: 'worktree' | 'branch' | 'none'
  branch: string
  remote: boolean
  github: string | null
  worktree: string | null
  base: string | null
  head: string | null
  files: FileChange[]
  totals: { files: number; additions: number; deletions: number } | null
  truncated: boolean
  all: { paths: string[]; truncated: boolean } | null
}

export interface DiffView {
  path: string
  status: ChangeStatus | 'unchanged'
  from: string | null
  additions: number | null
  deletions: number | null
  binary: boolean
  tooLarge: boolean
  link?: boolean
  bytes?: number | null
  diff: string
}

export function filesClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    files: (workspaceId: string, taskId: string, all = false) => run<FilesView>('task.files', { taskId, ...(all ? { all: true } : {}) }, workspaceId),
    diff: (workspaceId: string, taskId: string, path: string) => run<DiffView>('task.diff', { taskId, path }, workspaceId),
  }
}

// One letter per status, as Git and most editors show it.
export const STATUS_LETTER: Record<ChangeStatus, string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C' }
export const STATUS_VARIANT = { added: 'success', modified: 'info', deleted: 'danger', renamed: 'wave', copied: 'wave' } as const

// "2 added, 3 modified, 1 deleted": the changed files counted by status.
export function statusCounts(files: FileChange[]): string {
  const order: ChangeStatus[] = ['added', 'modified', 'deleted', 'renamed', 'copied']
  return order
    .map((status) => [status, files.filter((f) => f.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`)
    .join(', ')
}

export interface TreeNode {
  name: string
  path: string
  // Set on a file; a folder has children instead.
  change: FileChange | null
  file: boolean
  children: TreeNode[]
}

// The paths as a folder tree, folders first then files, each by name. A
// folder with a single folder inside reads as one row ("src/app").
export function fileTree(paths: string[], changes: FileChange[] = []): TreeNode[] {
  const byPath = new Map(changes.map((c) => [c.path, c]))
  const root: TreeNode = { name: '', path: '', change: null, file: false, children: [] }
  for (const full of new Set([...paths, ...changes.map((c) => c.path)])) {
    const parts = full.split('/')
    let at = root
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const file = i === parts.length - 1
      let next = at.children.find((c) => c.name === name && c.file === file)
      if (!next) {
        next = { name, path, change: file ? (byPath.get(full) ?? null) : null, file, children: [] }
        at.children.push(next)
      }
      at = next
    })
  }
  const tidy = (node: TreeNode): TreeNode => {
    let children = node.children.map(tidy)
    children.sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name))
    if (!node.file && node.path && children.length === 1 && !children[0].file)
      return { ...children[0], name: `${node.name}/${children[0].name}` }
    return { ...node, children }
  }
  return tidy(root).children
}

export type TextLine = { kind: 'add' | 'del' | 'context'; text: string; old: number | null; new: number | null }
export type NoteLine = { kind: 'meta' | 'hunk'; text: string }
export type DiffLine = NoteLine | TextLine
export const isText = (line: DiffLine | SplitRow): line is TextLine => line.kind === 'add' || line.kind === 'del' || line.kind === 'context'

// A unified diff as lines with their old and new line numbers. Header lines
// before the first hunk are meta; "\ No newline" notes are meta too.
export function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldLine = 0,
    newLine = 0,
    inHunk = false
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  for (const line of lines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      out.push({ kind: 'hunk', text: line })
    } else if (!inHunk || line.startsWith('\\') || line.startsWith('diff --git ')) {
      if (line.startsWith('diff --git ')) inHunk = false
      out.push({ kind: 'meta', text: line })
    } else if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1), old: null, new: newLine++ })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1), old: oldLine++, new: null })
    else out.push({ kind: 'context', text: line.slice(1), old: oldLine++, new: newLine++ })
  }
  return out
}

export type SplitRow = NoteLine | { kind: 'pair'; left: TextLine | null; right: TextLine | null }

// Side-by-side rows: a run of removed lines sits beside the added lines
// that follow it; context shows on both sides.
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: TextLine[] = [],
    adds: TextLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ kind: 'pair', left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const line of lines) {
    if (!isText(line)) {
      flush()
      rows.push(line)
    } else if (line.kind === 'del') {
      if (adds.length) flush()
      dels.push(line)
    } else if (line.kind === 'add') adds.push(line)
    else {
      flush()
      rows.push({ kind: 'pair', left: line, right: line })
    }
  }
  flush()
  return rows
}

// Open in editor: the editor's URL for a folder or file on this machine,
// e.g. kiro://file/home/me/wt/src/a.ts:12 or vscode://file/C:/wt/a.ts.
export type Editor = 'kiro' | 'vscode'
export const EDITORS: { key: Editor; label: string }[] = [
  { key: 'kiro', label: 'Kiro' },
  { key: 'vscode', label: 'VS Code' },
]

export function joinPath(root: string, relative: string): string {
  const sep = /^[A-Za-z]:\\/.test(root) || (root.includes('\\') && !root.includes('/')) ? '\\' : '/'
  return root.replace(/[\\/]+$/, '') + sep + relative.split('/').join(sep)
}

export function editorHref(editor: Editor, absolute: string, line?: number | null): string | null {
  if (!absolute) return null
  const forward = absolute.replace(/\\/g, '/')
  // Only an absolute POSIX or drive path; anything else is not on disk here.
  if (!forward.startsWith('/') && !/^[A-Za-z]:\//.test(forward)) return null
  const encoded = forward
    .replace(/^\/+/, '')
    .split('/')
    .map((part, i) => (i === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join('/')
  return `${editor === 'vscode' ? 'vscode' : 'kiro'}://file/${encoded}${line ? `:${line}` : ''}`
}

// The first changed line of a diff, so Open in editor lands on it.
export function firstChangedLine(lines: DiffLine[]): number | null {
  for (const line of lines) if (isText(line) && line.kind !== 'context') return line.new ?? line.old
  return null
}

// The chosen editor, kept in the page's storage; Kiro unless set.
const EDITOR_KEY = 'avoozl.editor'
export function readEditor(storage: Pick<Storage, 'getItem'> | null): Editor {
  try {
    return storage?.getItem(EDITOR_KEY) === 'vscode' ? 'vscode' : 'kiro'
  } catch {
    return 'kiro'
  }
}
export function writeEditor(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, editor: Editor): void {
  try {
    if (editor === 'kiro') storage?.removeItem(EDITOR_KEY)
    else storage?.setItem(EDITOR_KEY, editor)
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

// What a diff that is not drawn says instead.
export function diffSummary(diff: DiffView): string | null {
  const counts = diff.additions !== null && diff.deletions !== null ? ` (+${diff.additions} −${diff.deletions})` : ''
  if (diff.link) return 'A link. Not followed or shown.'
  if (diff.binary) return 'Binary file. Not shown.'
  if (diff.tooLarge) return `Too large to show here${counts}${diff.bytes ? `, ${Math.round(diff.bytes / 1024)} KB` : ''}. Open it in your editor.`
  if (diff.status === 'unchanged') return 'This task did not change this file.'
  if (diff.status === 'deleted' && !diff.diff) return 'Deleted.'
  if (!diff.diff) return 'No text changes.'
  return null
}
