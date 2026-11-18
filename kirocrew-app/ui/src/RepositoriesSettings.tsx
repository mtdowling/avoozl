// Settings > Repositories, the one place repositories are managed: the list
// of added repositories (name, role badge, View, Edit and Remove), then Add
// repository in its own box. A row joins the workspace's registered checkout
// (repositories.list) with its GitHub settings in .avoozl.json
// (github.repositories, keyed owner/name); either side may be missing.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { MIRROR_ROLE, mirrorSourceProblem, roleFromMode, type RepositoryForm } from './settings-api.ts'
import { DangerBtn, IconBtn, IconLabel, TipBtn, type ConfirmCopy } from './controls.tsx'
import { Eye, Pencil, Plus, Trash2, Workflow } from './icons.ts'
import { RoleChoice } from './RepositoryModals.tsx'
import { errorMessage, workspaceClient, type DetectedCheckout } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import ListItem from './ListItem.tsx'
import { githubHref, repositoryFacts, type RepositoryRow } from './repository-rows.ts'
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

export function RepositoryList(props: {
  rows: RepositoryRow[]
  // The role badge's text; a role is changed in Edit, never in the list.
  roleText: (row: RepositoryRow) => string
  // The saved settings of a row, and the public repository a private mirror copies.
  entryOf: (row: RepositoryRow) => RepositoryForm | null
  mirrorOf: (row: RepositoryRow) => string
  busy: boolean
  onView: (row: RepositoryRow) => void
  onEdit: (row: RepositoryRow) => void
  onRemove: (row: RepositoryRow) => void
  onSetup: (row: RepositoryRow) => void
  // Why Set up GitHub and import specs cannot start now, or null.
  setupBlocked: string | null
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
      {props.rows.map((row) => (
        <ListItem
          key={row.key}
          attrs={{ 'data-repository-row': row.key }}
          title={
            <>
              <span className="min-w-0 truncate font-medium">{row.name}</span>
              <span data-role-badge>
                <Badge>{props.roleText(row)}</Badge>
              </span>
              {githubHref(row.github) ? (
                <a href={linkHref(githubHref(row.github)!)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-xs underline" data-github-link>
                  {row.github}
                </a>
              ) : (
                <span className="text-xs text-muted" data-github-link>
                  {row.github ?? 'Local only'}
                </span>
              )}
            </>
          }
          facts={repositoryFacts(row, props.entryOf(row), props.mirrorOf(row))}
          actions={
            <>
              {row.checkout && (
                <IconBtn icon={Workflow} label={`Set up GitHub and import specs for ${row.name}`} tooltip={props.setupBlocked ?? 'Set up GitHub and import specs'} disabled={Boolean(props.setupBlocked)} onClick={() => props.onSetup(row)} />
              )}
              <IconBtn icon={Eye} label={`View ${row.name}`} tooltip="View details" onClick={() => props.onView(row)} />
              <IconBtn icon={Pencil} label={`Edit ${row.name}`} tooltip={row.githubOnly ? 'GitHub only: add its checkout to edit it' : 'Edit'} disabled={row.githubOnly} onClick={() => props.onEdit(row)} />
              {!row.githubOnly && (
                <DangerBtn icon={Trash2} label={`Remove ${row.name}`} tooltip="Remove" disabled={props.busy} confirm={removeCopy(row)} onConfirm={() => props.onRemove(row)}>
                  {null}
                </DangerBtn>
              )}
            </>
          }
        />
      ))}
    </ul>
  )
}

// What the Are you sure? dialog says before a row goes.
export function removeCopy(row: RepositoryRow): ConfirmCopy {
  return row.checkout
    ? {
        title: 'Are you sure?',
        body: `Remove ${row.name} from this workspace? Avoozl stops using ${row.folder ?? 'this checkout'}: tasks that name ${row.checkout.id} wait until it is added again, and its entry leaves .avoozl.json. The folder${row.github ? `, the GitHub repository ${row.github}` : ''} and your specs are not touched. Avoozl refuses while a run or lock still uses it.`,
        action: 'Remove',
      }
    : {
        title: 'Are you sure?',
        body: `Remove ${row.name} from this workspace? Its GitHub settings (label rules, managed labels, checks and who counts) leave .avoozl.json. GitHub itself is not changed.`,
        action: 'Remove',
      }
}

// Add repository: pick the folder, then confirm what Avoozl found in it.
// What the person chose for the new repository's role, handed to the page to save.
export interface AddedRole {
  // The added checkout's folder, for the set-up that follows.
  folder: string
  github: string | null
  branch: string
  role: string
  source: string
  // False when the role is the one its mode already gives: nothing to save.
  changed: boolean
}

export function AddRepository(props: { workspaceId: string; mode: string; disabled: string | null; onAdded: (id: string, added: AddedRole) => void }) {
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const [folder, setFolder] = useState('')
  const [found, setFound] = useState<DetectedCheckout | null>(null)
  const [id, setId] = useState('')
  const [branch, setBranch] = useState('')
  const [role, setRole] = useState('local')
  const [source, setSource] = useState('')
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
      setRole(roleFromMode(props.mode, next.github, ''))
      setSource('')
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
      const given = roleFromMode(props.mode, found.github, '')
      setFolder('')
      setFound(null)
      props.onAdded(saved.id, { folder: found.root, github: found.github, branch: branch.trim() || found.baseBranch, role, source: source.trim(), changed: Boolean(found.github) && (role !== given || role === MIRROR_ROLE) })
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
            </dl>
            <RoleChoice
              id="avoozl-repo-add"
              name={found.root}
              github={found.github}
              role={role}
              source={source}
              fixed={found.github ? null : 'No GitHub remote, so its tasks stay local.'}
              onChange={(nextRole, nextSource) => {
                setRole(nextRole)
                setSource(nextSource)
              }}
            />
            <span className="flex flex-wrap items-end gap-3">
              <label htmlFor="avoozl-repo-id" className="flex flex-col gap-1 text-sm">
                <span>Short ID</span>
                <Input id="avoozl-repo-id" value={id} placeholder="my-service" onChange={(event) => setId(event.target.value)} />
              </label>
              <label htmlFor="avoozl-repo-branch" className="flex flex-col gap-1 text-sm">
                <span>Branch tasks land on</span>
                <Input id="avoozl-repo-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
              </label>
              <Btn primary onClick={() => void add()} disabled={busy || !id.trim() || Boolean(props.disabled) || (role === MIRROR_ROLE && Boolean(mirrorSourceProblem(source, found.github)))}>
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
