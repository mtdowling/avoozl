// Settings > Repository setup: what one repository row opens. View is a
// read-only dialog of its details. Edit is a dialog with its role and
// settings, Save and Cancel; the settings editor itself comes from the page
// (`settings`), so this file holds no policy logic. A private mirror is one of
// the role choices, with a field naming its public repository.
import { useState, type ReactNode } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { Modal } from './Modal.tsx'
import { FormSection } from './FormSection.tsx'
import MirrorSetup from './MirrorSetup.tsx'
import { selectStyle } from './FilterSelect.tsx'
import { MIRROR_ROLE, MIRROR_ROLE_LABEL, MIRROR_ROLE_LINE, ROLE_OPTIONS, mirrorSourceProblem, type RepositoryEdit, type RepositoryForm } from './settings-api.ts'
import type { RepositoryRow } from './repository-rows.ts'
import { linkHref } from './views-api.ts'

// The role select, with the public repository's field under it for a mirror.
export function RoleChoice(props: {
  id: string
  name: string
  github: string | null
  role: string
  source: string
  onChange: (role: string, source: string) => void
  // Why the role cannot change, when it cannot.
  fixed?: string | null
  // A heading above already says Role: the label is for screen readers only.
  titled?: boolean
}) {
  const { role, source } = props
  const line = role === MIRROR_ROLE ? MIRROR_ROLE_LINE : ROLE_OPTIONS.find((option) => option.value === role)?.line
  const problem = role === MIRROR_ROLE && source.trim() ? mirrorSourceProblem(source, props.github) : null
  return (
    <div className="flex flex-col gap-1.5" data-role-choice>
      <label htmlFor={`${props.id}-role`} className="flex flex-col gap-1 text-sm">
        <span className={props.titled ? 'sr-only' : 'font-medium'}>Role</span>
        <select
          id={`${props.id}-role`}
          value={role}
          disabled={Boolean(props.fixed)}
          onChange={(event) => props.onChange(event.target.value, source)}
          aria-label={`Role of ${props.name}`}
          className="rounded border px-2 py-1 text-sm"
          style={{ ...selectStyle, maxWidth: '24rem' }}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={MIRROR_ROLE} disabled={!props.github}>
            {MIRROR_ROLE_LABEL}
          </option>
        </select>
      </label>
      {(props.fixed || line) && <span className="text-xs text-muted">{props.fixed || line}</span>}
      {role === MIRROR_ROLE && (
        <label htmlFor={`${props.id}-source`} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Public repository</span>
          <Input id={`${props.id}-source`} value={source} placeholder="owner/name" aria-label="Public repository" onChange={(event) => props.onChange(role, event.target.value)} style={{ maxWidth: '24rem' }} />
          {problem && (
            <span role="alert" className="text-xs text-danger">
              {problem}
            </span>
          )}
        </label>
      )}
    </div>
  )
}

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }}>
      {facts.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ViewRepository(props: { row: RepositoryRow; roleText: string; entry: RepositoryForm | null; onClose: () => void; onReveal: (folder: string) => void; githubUrl: string | null }) {
  const { row, entry } = props
  const where: [string, ReactNode][] = [
    ['Role', props.roleText],
    ['Folder', row.folder ?? 'No folder on this computer'],
    ['Tasks land on', <code key="b">{row.branch}</code>],
    ['GitHub', row.github ? (props.githubUrl ? <a href={linkHref(props.githubUrl)} target="_blank" rel="noopener noreferrer" className="underline">{row.github}</a> : row.github) : 'No GitHub remote'],
  ]
  const facts: [string, ReactNode][] = []
  if (entry) {
    facts.push(
      ['Label rules', String(entry.rules.length)],
      ['Required checks', entry.requiredChecks || 'None named'],
      ['Who may start work', entry.allowedActors || (entry.minimumPermission ? `Permission ${entry.minimumPermission} or higher` : 'Default: write')],
      ['Release crews (N)', entry.releaseCapacity || 'Default'],
    )
    if (entry.mirror.source && entry.mirror.mirror) facts.push(['Private mirror', `${entry.mirror.mirror} of ${entry.mirror.source}`])
  }
  return (
    <Modal
      id="avoozl-repo-view"
      title={row.name}
      onDismiss={props.onClose}
      attrs={{ 'data-repository-view': row.key }}
      focusClose
    >
      <FormSection title="Repository">
        <Facts facts={where} />
        {row.folder && (
          <div>
            <Btn type="button" onClick={() => props.onReveal(row.folder!)}>
              Open folder in Finder
            </Btn>
          </div>
        )}
      </FormSection>
      {facts.length > 0 && (
        <FormSection title="Settings">
          <Facts facts={facts} />
        </FormSection>
      )}
    </Modal>
  )
}

export function EditRepository(props: {
  row: RepositoryRow
  workspaceId: string
  // The role now, and the public repository if it is a mirror.
  role: string
  source: string
  // The editor for the repository's settings. It edits `entry` (null: the
  // saved one) and reports changes through `setEntry`.
  settings: (entry: RepositoryForm | null, setEntry: (entry: RepositoryForm) => void) => ReactNode
  // Writes .avoozl.json; the reason it did not, or null.
  onSave: (edit: RepositoryEdit) => Promise<string | null>
  // A mirror setup applied: read the settings again.
  onApplied: () => void
  onClose: () => void
}) {
  const { row } = props
  const [role, setRole] = useState(props.role)
  const [source, setSource] = useState(props.source)
  const [entry, setEntry] = useState<RepositoryForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = role !== props.role || source !== props.source || entry !== null
  const problem = role === MIRROR_ROLE ? mirrorSourceProblem(source, row.github) : null
  const fixed = !row.github ? 'No GitHub remote, so its tasks stay local.' : null
  const save = async () => {
    setBusy(true)
    setError(null)
    const failure = await props.onSave({ entry, role, source: source.trim() }).catch((caught: unknown) => (caught instanceof Error ? caught.message : String(caught)))
    setBusy(false)
    if (failure) setError(failure)
    else props.onClose()
  }
  return (
    <Modal
      id="avoozl-repo-edit"
      title={row.name}
      width="52rem"
      dismissLabel="Cancel"
      onDismiss={props.onClose}
      unsaved={changed && { title: 'Discard your changes?', body: `${row.name} keeps its saved settings.`, action: 'Discard' }}
      attrs={{ 'data-repository-edit': row.key }}
      focusClose
      footer={
        <>
          {error && (
            <span role="alert" className="mr-auto text-sm text-danger" style={{ order: -1 }}>
              {error}
            </span>
          )}
          <Btn type="button" primary disabled={busy || !changed || Boolean(problem)} onClick={() => void save()}>
            Save
          </Btn>
        </>
      }
    >
      <FormSection title="Role">
        <RoleChoice
          id="avoozl-repo-edit"
          name={row.name}
          github={row.github}
          role={role}
          source={source}
          fixed={fixed}
          titled
          onChange={(nextRole, nextSource) => {
            setRole(nextRole)
            setSource(nextSource)
          }}
        />
        {role === MIRROR_ROLE && row.github && !problem && (
          <MirrorSetup workspaceId={props.workspaceId} repository={row.github} source={source} onApplied={props.onApplied} />
        )}
      </FormSection>
      {props.settings(entry, setEntry)}
    </Modal>
  )
}
