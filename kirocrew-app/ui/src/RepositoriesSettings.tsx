// Settings > Repositories, the one place repositories are managed: the list
// of added repositories (name, role badge, View, Edit and Remove), and Add
// repository, which opens a guided dialog. A row joins the workspace's registered checkout
// (repositories.list) with its GitHub settings in .avoozl.json
// (github.repositories, keyed owner/name); either side may be missing.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { MIRROR_ROLE, MIRROR_ROLE_LABEL, MIRROR_ROLE_LINE, ROLE_OPTIONS, mirrorSourceProblem, roleFromMode, type RepositoryForm } from './settings-api.ts'
import { DangerBtn, IconBtn, IconLabel, type ConfirmCopy } from './ui/controls.tsx'
import { Eye, Pencil, Plus, Trash2, Workflow } from './icons.ts'
import { RoleChoice } from './RepositoryModals.tsx'
import { errorMessage, workspaceClient, type DetectedCheckout } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import ListItem from './ListItem.tsx'
import { githubHref, repositoryFacts, type RepositoryRow } from './repository-rows.ts'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainButton, PlainLink } from './ui/Plain'
import { Modal } from './ui/Modal.tsx'
import { FolderField } from './FolderPicker.tsx'
import { holdsSpecs } from './onboarding-api.ts'
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
  // Why Add repository cannot open now, or null.
  addBlocked: string | null
}) {
  if (!props.rows.length)
    return (
      <Box flex flexCol items="start" gap="2" py="2" data-repositories-empty>
        <Box as="p" size="sm">
          No repositories yet.
        </Box>
        <span data-add-repository-open>
          <IconLabel icon={Plus} primary onClick={props.onAdd} disabled={Boolean(props.addBlocked)} tooltip={props.addBlocked ?? undefined}>
            Add repository
          </IconLabel>
        </span>
      </Box>
    )
  return (
    <Stack as="ul" aria-label="Added repositories" data-repository-list>
      {props.rows.map((row) => (
        <ListItem
          key={row.key}
          attrs={{ 'data-repository-row': row.key }}
          title={
            <>
              <Box as="span" minW0 truncate weight="medium">
                {row.name}
              </Box>
              <span data-role-badge>
                <Badge>{props.roleText(row)}</Badge>
              </span>
              {/* A checkout with no GitHub remote: its role badge already says Local only. */}
              {githubHref(row.github) ? (
                <PlainLink href={linkHref(githubHref(row.github)!)} target="_blank" rel="noopener noreferrer" minW0 truncate size="xs" underline data-github-link>
                  {row.github}
                </PlainLink>
              ) : (
                row.github && (
                  <Hint size="xs" data-github-link>
                    {row.github}
                  </Hint>
                )
              )}
            </>
          }
          facts={repositoryFacts(row, props.entryOf(row), props.mirrorOf(row))}
          actions={
            <>
              {row.checkout && (
                <IconBtn
                  icon={Workflow}
                  label={`Set up GitHub and import specs for ${row.name}`}
                  tooltip={props.setupBlocked ?? 'Set up GitHub and import specs'}
                  disabled={Boolean(props.setupBlocked)}
                  onClick={() => props.onSetup(row)}
                />
              )}
              <IconBtn icon={Eye} label={`View ${row.name}`} tooltip="View details" onClick={() => props.onView(row)} />
              <IconBtn
                icon={Pencil}
                label={`Edit ${row.name}`}
                tooltip={row.githubOnly ? 'GitHub only: add its checkout to edit it' : 'Edit'}
                disabled={row.githubOnly}
                onClick={() => props.onEdit(row)}
              />
              {!row.githubOnly && (
                <DangerBtn icon={Trash2} label={`Remove ${row.name}`} tooltip="Remove" disabled={props.busy} confirm={removeCopy(row)} onConfirm={() => props.onRemove(row)}>
                  {null}
                </DangerBtn>
              )}
            </>
          }
        />
      ))}
    </Stack>
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

// Add repository: a guided dialog. Pick the folder; Avoozl reads it and
// guesses what kind of repository it is (Local only, Code repository,
// Planning repository, Code and planning, or a private mirror) and why. Yes
// adds it as that; No opens the full form in the same dialog.
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

type AddStep = 'folder' | 'guess' | 'form'

// The kind's name and its one line, for the guess.
export function kindCopy(role: string, source: string): { label: string; line: string } {
  if (role === MIRROR_ROLE) return { label: source ? `Private mirror of ${source}` : MIRROR_ROLE_LABEL, line: MIRROR_ROLE_LINE }
  const option = ROLE_OPTIONS.find((item) => item.value === role) ?? ROLE_OPTIONS[0]
  return { label: option.label, line: option.line }
}

// `planningTaken`: another checkout is already the one specs are read from.
export function AddRepositoryModal(props: { workspaceId: string; mode: string; planningTaken: boolean; onClose: () => void; onAdded: (id: string, added: AddedRole) => void }) {
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const [step, setStep] = useState<AddStep>('folder')
  const [folder, setFolder] = useState('')
  const [found, setFound] = useState<DetectedCheckout | null>(null)
  const [id, setId] = useState('')
  const [branch, setBranch] = useState('')
  const [role, setRole] = useState('local')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detect = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await client.detectRepository(props.workspaceId, folder.trim())
      setFound(next)
      setId(next.id ?? '')
      setBranch(next.baseBranch)
      setRole(next.kind.role)
      setSource(next.kind.source)
      setStep('guess')
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
      const landing = branch.trim() || found.baseBranch
      // The checkout specs are read from, as Set up would add it.
      const planning = holdsSpecs(props.mode, role === 'planning', found.kind.specs, props.planningTaken)
      const saved = await client.registerRepository(props.workspaceId, { id: id.trim(), localCheckout: found.root, baseBranch: landing, planning })
      const given = roleFromMode(props.mode, found.github, '')
      props.onAdded(saved.id, {
        folder: found.root,
        github: found.github,
        branch: landing,
        role,
        source: source.trim(),
        changed: Boolean(found.github) && (role !== given || role === MIRROR_ROLE),
      })
      props.onClose()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }
  const blocked = busy || !id.trim() || (role === MIRROR_ROLE && Boolean(mirrorSourceProblem(source, found?.github ?? null)))
  const footer =
    step === 'folder' ? (
      <Btn type="button" primary disabled={busy || !folder.trim()} onClick={() => void detect()}>
        {busy ? 'Reading the folder…' : 'Check folder'}
      </Btn>
    ) : step === 'guess' ? (
      <>
        <Btn type="button" onClick={() => setStep('form')} data-add-not-right>
          No, let me choose
        </Btn>
        <Btn type="button" primary disabled={blocked} onClick={() => void add()} data-add-confirm>
          Yes, add it
        </Btn>
      </>
    ) : (
      <Btn type="button" primary disabled={blocked} onClick={() => void add()} data-add-confirm>
        Add repository
      </Btn>
    )
  return (
    <Modal
      id="avoozl-repo-add"
      title="Add repository"
      dismissLabel="Cancel"
      onDismiss={props.onClose}
      attrs={{ 'data-add-repository': step }}
      footer={
        <>
          {error && (
            <Box role="alert" as="span" css-order={-1} mrAuto size="sm" tone="danger">
              {error}
            </Box>
          )}
          {footer}
        </>
      }
    >
      {step === 'folder' && (
        <Stack gap={2} data-step="folder">
          <Box as="p" size="sm">
            Pick a Git checkout on this computer. Avoozl reads it and suggests what kind of repository it is. Nothing is changed until you add it.
          </Box>
          <FolderField id="avoozl-repo-folder" label="Folder" value={folder} placeholder="~/projects/my-service" client={client} onChange={setFolder} />
        </Stack>
      )}
      {step !== 'folder' && found && (
        <Stack gap={3}>
          <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1" size="sm" data-add-found>
            <Hint as="dt">Folder</Hint>
            <Box as="dd" css-overflow-wrap="anywhere" minW0>
              <code>{found.root}</code>
            </Box>
            <Hint as="dt">GitHub</Hint>
            <dd>{found.github ?? (found.remote ? `${found.remote} is not on GitHub` : 'No GitHub remote')}</dd>
            {step === 'guess' && (
              <>
                <Hint as="dt">Tasks land on</Hint>
                <dd>
                  <code>{branch}</code>
                </dd>
              </>
            )}
          </Box>
          {step === 'guess' ? <KindGuess found={found} role={role} source={source} /> : null}
          {step === 'form' && (
            <Box data-step="form">
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
            </Box>
          )}
          {(step === 'form' || !found.id) && (
            <Row as="span" gap={3} align="end">
              <Box htmlFor="avoozl-repo-id" as="label" flex flexCol gap="1" size="sm">
                <span>Short ID</span>
                <Input id="avoozl-repo-id" value={id} placeholder="my-service" onChange={(event) => setId(event.target.value)} />
              </Box>
              {step === 'form' && (
                <Box htmlFor="avoozl-repo-branch" as="label" flex flexCol gap="1" size="sm">
                  <span>Branch tasks land on</span>
                  <Input id="avoozl-repo-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
                </Box>
              )}
            </Row>
          )}
          {step === 'form' && (
            <Box as="p" size="xs">
              <PlainButton type="button" underline onClick={() => setStep('guess')}>
                Back to the suggestion
              </PlainButton>
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  )
}

// What Avoozl thinks the folder is, why, and the question.
function KindGuess(props: { found: DetectedCheckout; role: string; source: string }) {
  const { label, line } = kindCopy(props.role, props.source)
  return (
    <Box css-background="bg-elevated-transparent" rounded="md" p="3" flex flexCol gap="2" data-step="guess" data-guess={props.role}>
      <div>
        <Hint size="xs">It looks like</Hint>
        <Box as="p" size="base" weight="semibold" data-guess-label>
          {label}
        </Box>
        <Hint as="p" size="xs">
          {line}
        </Hint>
      </div>
      {props.found.kind.reasons.length > 0 && (
        <Box as="ul" css-list-style="disc" flex flexCol gap="0.5" pl="4" size="xs" data-guess-reasons>
          {props.found.kind.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </Box>
      )}
      <Box as="p" size="sm" weight="medium">
        Is this right?
      </Box>
    </Box>
  )
}
