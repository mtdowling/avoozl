// Settings > Repository setup: what one repository row opens. View is a
// read-only dialog of its details. Edit is a dialog of tabs (repo-edit-tabs.ts)
// holding every setting, with one Save and Cancel for all of them; the
// settings editor itself comes from the page (`settings`), so this file holds
// no policy logic.
import { useState, type ReactNode } from 'react'
import { Tabs, TabPanel } from './ui/Tabs.tsx'
import { EDIT_TABS, dirtyTabs, errorTabs, type EditTab } from './repo-edit-tabs.ts'
import { Btn } from './ui/Btn'
import { Modal } from './ui/Modal.tsx'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { ROLE_OPTIONS, type RepositoryEdit, type RepositoryForm } from './settings-api.ts'
import type { RepositoryRow } from './repository-rows.ts'
import { linkHref } from './views-api.ts'
import { Hint } from './ui/Hint'
import { TextLink } from './ui/TextLink'
import { SelectField } from './ui/SelectField'
import { Box } from './ui/Box'

// The role select and what the chosen role means.
export function RoleChoice(props: {
  id: string
  name: string
  role: string
  onChange: (role: string) => void
  // Why the role cannot change, when it cannot.
  fixed?: string | null
  // A heading above already says Role: the label is for screen readers only.
  titled?: boolean
}) {
  const { role } = props
  const line = ROLE_OPTIONS.find((option) => option.value === role)?.line
  return (
    <Box flex flexCol gap="1.5" data-role-choice>
      <Box htmlFor={`${props.id}-role`} as="label" flex flexCol gap="1" size="sm">
        <Box as="span" srOnly={props.titled} weight={props.titled ? undefined : 'medium'}>
          Role
        </Box>
        <SelectField
          id={`${props.id}-role`}
          value={role}
          disabled={Boolean(props.fixed)}
          onChange={(event) => props.onChange(event.target.value)}
          aria-label={`Role of ${props.name}`}
          look="field"
          maxWidth="24rem"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </Box>
      {(props.fixed || line) && <Hint size="xs">{props.fixed || line}</Hint>}
    </Box>
  )
}

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1.5" size="sm">
      {facts.map(([label, value]) => (
        <Box key={label} css-display="contents">
          <Hint as="dt">{label}</Hint>
          <Box as="dd" css-overflow-wrap="anywhere" minW0>
            {value}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export function ViewRepository(props: {
  row: RepositoryRow
  roleText: string
  entry: RepositoryForm | null
  onClose: () => void
  onReveal: (folder: string) => void
  githubUrl: string | null
}) {
  const { row, entry } = props
  const where: [string, ReactNode][] = [
    ['Role', props.roleText],
    ['Folder', row.folder ?? 'No folder on this computer'],
    ['Tasks land on', <code key="b">{row.branch}</code>],
    [
      'GitHub',
      row.github ? (
        props.githubUrl ? (
          <TextLink href={linkHref(props.githubUrl)} target="_blank" rel="noopener noreferrer">
            {row.github}
          </TextLink>
        ) : (
          row.github
        )
      ) : (
        'No GitHub remote'
      ),
    ],
  ]
  const facts: [string, ReactNode][] = []
  if (entry) {
    facts.push(
      ['Required checks', entry.requiredChecks || 'None named'],
      ['Who may start work', entry.allowedActors || (entry.minimumPermission ? `Permission ${entry.minimumPermission} or higher` : 'Default: write')],
    )
  }
  return (
    <Modal id="avoozl-repo-view" title={row.name} onDismiss={props.onClose} attrs={{ 'data-repository-view': row.key }} focusClose>
      <FieldGroup title="Repository">
        <Facts facts={where} />
        {row.folder && (
          <div>
            <Btn type="button" onClick={() => props.onReveal(row.folder!)}>
              Open folder in Finder
            </Btn>
          </div>
        )}
      </FieldGroup>
      {facts.length > 0 && (
        <FieldGroup title="Settings">
          <Facts facts={facts} />
        </FieldGroup>
      )}
    </Modal>
  )
}

// What the page puts in the Edit dialog: which tabs its settings fill, and
// the open tab's part. General always shows; the dialog adds its own role
// part above the page's.
export interface EditSettings {
  tabs: readonly EditTab[]
  body: ReactNode
}

export function EditRepository(props: {
  row: RepositoryRow
  // The role now.
  role: string
  // The saved entry, for the unsaved-changes dots.
  saved: RepositoryForm | null
  // The editor for the repository's settings, on `tab`. It edits `entry`
  // (null: the saved one) and reports changes through `setEntry`.
  settings: (view: { entry: RepositoryForm | null; setEntry: (entry: RepositoryForm) => void; tab: EditTab; setTab: (tab: EditTab) => void }) => EditSettings
  // Writes .avoozl.json; the reason it did not, or null.
  onSave: (edit: RepositoryEdit) => Promise<string | null>
  onClose: () => void
}) {
  const { row } = props
  const [role, setRole] = useState(props.role)
  const [entry, setEntry] = useState<RepositoryForm | null>(null)
  const [tab, setTab] = useState<EditTab>('general')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = role !== props.role || entry !== null
  const fixed = !row.github ? 'No GitHub remote, so its tasks stay local.' : null
  const settings = props.settings({ entry, setEntry, tab, setTab })
  const shown = EDIT_TABS.filter((t) => t.key === 'general' || settings.tabs.includes(t.key))
  const dirty = dirtyTabs({ saved: props.saved, entry, roleChanged: role !== props.role })
  const errors = errorTabs(entry)
  const save = async () => {
    setBusy(true)
    setError(null)
    const failure = await props.onSave({ entry, role }).catch((caught: unknown) => (caught instanceof Error ? caught.message : String(caught)))
    setBusy(false)
    if (failure) setError(failure)
    else props.onClose()
  }
  const id = 'avoozl-repo-edit'
  // Only the tab bar and the open tab's panel sit between title and footer.
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
            <Box role="alert" as="span" css-order={-1} mrAuto size="sm" tone="danger">
              {error}
            </Box>
          )}
          <Btn type="button" primary disabled={busy || !changed} onClick={() => void save()}>
            Save
          </Btn>
        </>
      }
    >
      <Tabs
        id={`${id}-tabs`}
        label={`Settings of ${row.name}`}
        tabs={shown.map((t) => ({ key: t.key, label: t.label, dirty: dirty.has(t.key), error: errors.has(t.key) }))}
        current={tab}
        onPick={setTab}
      />
      <TabPanel id={`${id}-tabs`} current={tab}>
        {tab === 'general' && (
          <FieldGroup title="Role">
            <RoleChoice id={id} name={row.name} role={role} fixed={fixed} titled onChange={setRole} />
            <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1" size="sm" data-repository-folder>
              <Hint as="dt">Folder</Hint>
              <Box as="dd" css-overflow-wrap="anywhere" minW0>
                {row.folder ? <code>{row.folder}</code> : 'No folder on this computer'}
              </Box>
            </Box>
          </FieldGroup>
        )}
        {settings.body}
      </TabPanel>
    </Modal>
  )
}
