// Settings > Repositories, the one place repositories are managed: the list
// of added repositories with their row actions, then Add repository in its
// own box. A row joins the workspace's registered checkout
// (repositories.list) with its GitHub settings in .avoozl.json
// (github.repositories, keyed owner/name); either side may be missing.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { DangerBtn, IconBtn, IconLabel, TipBtn, useConfirm } from './controls.tsx'
import { ExternalLink, FolderOpen, Pencil, Plus } from './icons.ts'
import { errorMessage, workspaceClient, type DetectedCheckout, type Repository } from './workspace-api.ts'
import { githubHref, type RepositoryRow } from './repository-rows.ts'
import { Modal } from './Modal.tsx'
import { linkHref } from './views-api.ts'
export { repositoryRows, type RepositoryRow } from './repository-rows.ts'

export const REPOSITORIES_LINE =
  'A repository is a code checkout on this computer. Tasks change its code in their own worktrees and land on its branch. Each workspace keeps its own list.'

// Reveal a folder in Finder through the host's /api/reveal. The host
// answers { copy } when it cannot (a remote browser); then the path goes to
// the clipboard instead.
export function useReveal() {
  const api = useAppApi()
  return useCallback(
    async (folder: string): Promise<string> => {
      try {
        const reply = await api.post<{ ok?: boolean; copy?: string }>('/api/reveal', { path: folder, action: 'reveal' })
        if (!reply?.copy) return `Opened ${folder} in Finder.`
      } catch {
        // Fall through to the clipboard.
      }
      try {
        await navigator.clipboard.writeText(folder)
        return `Finder could not be opened from here, so the folder path was copied: ${folder}`
      } catch {
        return `Finder could not be opened from here. The folder is ${folder}`
      }
    },
    [api],
  )
}

function modeLabel(row: RepositoryRow, mode: string) {
  if (!row.github) return 'Local only'
  if (mode === 'local') return 'Local only mode'
  if (!mode) return 'GitHub, no mode yet'
  return mode === 'plans-repo' ? 'Plans repository mode' : 'Single repository mode'
}

export function RepositoryList(props: {
  rows: RepositoryRow[]
  mode: string
  busy: boolean
  dirty: boolean
  onEdit: (key: string) => void
  onRemove: (row: RepositoryRow) => void
  onReveal: (folder: string) => void
  onAdd: () => void
}) {
  if (!props.rows.length)
    return (
      <div className="flex flex-col items-start gap-2 py-2" data-repositories-empty>
        <p className="text-sm">No repositories yet.</p>
        <p className="text-sm text-muted">{REPOSITORIES_LINE}</p>
        <IconLabel icon={Plus} primary onClick={props.onAdd}>
          Add repository
        </IconLabel>
      </div>
    )
  return (
    <ul className="flex flex-col" aria-label="Added repositories" data-repository-list>
      {props.rows.map((row) => {
        const href = githubHref(row.github)
        return (
          <li
            key={row.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 first:border-t-0"
            style={{ borderColor: 'var(--border)' }}
            data-repository-row={row.key}
          >
            <div className="min-w-0" style={{ flex: '1 1 18rem' }}>
              <span className="font-medium">{row.name}</span>
              <span className="block truncate text-xs text-muted">
                {row.folder ?? 'No folder on this computer'} · lands on <code>{row.branch}</code>
                {row.github ? ` · ${row.github}` : ''}
              </span>
            </div>
            <Badge>{modeLabel(row, props.mode)}</Badge>
            <span className="flex items-center gap-1.5">
              <IconLabel icon={Pencil} tooltip={`Change ${row.name}'s settings in a dialog`} aria-label={`Edit ${row.name}`} onClick={() => props.onEdit(row.key)}>
                Edit
              </IconLabel>
              {row.folder && <IconBtn icon={FolderOpen} label={`Open ${row.name} in Finder`} onClick={() => props.onReveal(row.folder!)} />}
              {href && <GitHubLink href={linkHref(href)} name={row.name} />}
              <DangerBtn
                label={`Remove ${row.name}`}
                tooltip={
                  props.dirty
                    ? 'Save or discard your changes first'
                    : row.checkout
                      ? 'Stop Avoozl using this checkout. The folder and GitHub stay.'
                      : 'Drop its GitHub settings from .avoozl.json when you save'
                }
                disabled={props.busy || (props.dirty && Boolean(row.checkout))}
                confirm={
                  row.checkout
                    ? {
                        title: `Remove ${row.name} from this workspace?`,
                        body: `Avoozl stops using ${row.folder ?? 'this checkout'}: tasks that name ${row.checkout.id} wait until it is added again, and its entry leaves .avoozl.json. The folder${row.github ? `, the GitHub repository ${row.github}` : ''} and your specs are not touched. Avoozl refuses while a run or lock still uses it.`,
                        action: 'Remove',
                      }
                    : {
                        title: `Remove ${row.name}'s GitHub settings?`,
                        body: 'Its label rules, managed labels, checks and who counts leave .avoozl.json when you save. GitHub is not changed.',
                        action: 'Remove',
                      }
                }
                onConfirm={() => props.onRemove(row)}
              >
                Remove
              </DangerBtn>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Edit for one repository: its settings in a large modal. Save writes
// through the shared Save; Cancel, Esc and a click outside put the form
// back, asking first when something was edited.
export function RepositoryDialog(props: {
  name: string
  edited: boolean
  missing: string | null
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
  children: ReactNode
}) {
  const ask = useConfirm()
  const discard = {
    title: `Discard your changes to ${props.name}?`,
    body: 'Every edit in this dialog is lost. .avoozl.json stays as it is.',
    action: 'Discard changes',
  }
  // Cancel asks too; Esc, Back and a click outside ask through the Modal.
  const dismiss = () => (props.edited ? void ask(discard).then((yes) => yes && props.onDiscard()) : props.onDiscard())
  return (
    <Modal
      id="avoozl-repo-edit"
      title={props.name}
      unsaved={props.edited && discard}
      onDismiss={props.onDiscard}
      footer={
        (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(props.error || (props.edited && props.missing)) && (
              <span role="alert" className="mr-auto text-sm text-danger" data-modal-error>
                {props.error ?? props.missing}
              </span>
            )}
            {!props.error && !props.missing && props.edited && <span className="mr-auto text-xs text-muted">Unsaved changes</span>}
            <Btn type="button" onClick={dismiss}>
              Cancel
            </Btn>
            <Btn type="button" primary onClick={props.onSave} disabled={props.saving || !props.edited}>
              Save
            </Btn>
          </div>
        )
      }
    >
      {props.children}
    </Modal>
  )
}

function GitHubLink({ href, name }: { href: string | undefined; name: string }) {
  return (
    <TipLink href={linkHref(href)} tip="Open on GitHub">
      <ExternalLink size={14} aria-hidden="true" />
      <span className="sr-only">Open {name} on GitHub</span>
    </TipLink>
  )
}

function TipLink(props: { href: string | undefined; tip: string; children: ReactNode }) {
  // A link styled like the icon buttons, with the shared tooltip.
  return (
    <Tooltip text={props.tip}>
      <a
        href={linkHref(props.href)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded border"
        style={{ padding: '5px 7px', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {props.children}
      </a>
    </Tooltip>
  )
}


// Add repository: pick the folder, then confirm what Avoozl found in it.
export function AddRepository(props: { workspaceId: string; mode: string; disabled: string | null; onAdded: (id: string) => void }) {
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const [folder, setFolder] = useState('')
  const [found, setFound] = useState<DetectedCheckout | null>(null)
  const [id, setId] = useState('')
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setFound(null)
    setError(null)
  }, [folder])
  const detect = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await client.detectRepository(props.workspaceId, folder.trim())
      setFound(next)
      setId(next.id ?? '')
      setBranch(next.baseBranch)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const add = async () => {
    if (!found) return
    setBusy(true)
    setError(null)
    try {
      const saved = await client.registerRepository(props.workspaceId, { id: id.trim(), localCheckout: found.root, baseBranch: branch.trim() || found.baseBranch })
      setFolder('')
      setFound(null)
      props.onAdded(saved.id)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="avoozl-repo-add" className="flex flex-col gap-3" data-add-repository>
      <div>
        <h3 id="avoozl-repo-add" className="text-base font-semibold">
          Add repository
        </h3>
        <p className="mt-1 text-sm text-muted">Point at a Git checkout on this computer; Avoozl reads its branch and GitHub remote for you.</p>
      </div>
      <ol className="flex flex-col gap-3" style={{ maxWidth: '40rem' }}>
        <li className="flex flex-col gap-1.5" data-step="folder">
          <span className="text-sm font-medium">1. Pick the folder</span>
          <span className="text-xs text-muted">The checkout&apos;s folder, as an absolute path. Any folder inside it works too.</span>
          <span className="flex flex-wrap items-end gap-2">
            <label htmlFor="avoozl-repo-folder" className="sr-only">
              Folder
            </label>
            <Input id="avoozl-repo-folder" value={folder} placeholder="/path/to/my-service" onChange={(event) => setFolder(event.target.value)} style={{ minWidth: '18rem' }} />
            <TipBtn tooltip="Read the folder's branch and GitHub remote. Changes nothing." onClick={() => void detect()} disabled={busy || !folder.trim() || Boolean(props.disabled)}>
              Check folder
            </TipBtn>
          </span>
        </li>
        {found && (
          <li className="flex flex-col gap-2" data-step="confirm">
            <span className="text-sm font-medium">2. Confirm what Avoozl found</span>
            <span className="text-xs text-muted">Tasks land on the branch below. Change it if tasks should land elsewhere.</span>
            <dl className="grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
              <dt className="text-muted">Folder</dt>
              <dd className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
                {found.root}
              </dd>
              <dt className="text-muted">GitHub remote</dt>
              <dd>{found.github ?? (found.remote ? `${found.remote} is not on GitHub` : 'None: a local-only repository')}</dd>
              <dt className="text-muted">Mode</dt>
              <dd>{found.github ? (props.mode && props.mode !== 'local' ? `This workspace's ${props.mode} mode` : 'No GitHub mode set yet (Settings › Where tasks live)') : 'Local only'}</dd>
            </dl>
            <span className="flex flex-wrap items-end gap-3">
              <label htmlFor="avoozl-repo-id" className="flex flex-col gap-1 text-sm">
                <span>Short ID</span>
                <Input id="avoozl-repo-id" value={id} placeholder="my-service" onChange={(event) => setId(event.target.value)} />
              </label>
              <label htmlFor="avoozl-repo-branch" className="flex flex-col gap-1 text-sm">
                <span>Branch tasks land on</span>
                <Input id="avoozl-repo-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
              </label>
              <Btn primary onClick={() => void add()} disabled={busy || !id.trim() || Boolean(props.disabled)}>
                Add repository
              </Btn>
            </span>
          </li>
        )}
      </ol>
      {props.disabled && <p className="text-xs text-muted">{props.disabled}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
