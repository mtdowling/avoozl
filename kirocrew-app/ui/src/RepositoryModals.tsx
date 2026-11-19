// Settings > Repository setup: what one repository row opens. View is a
// read-only dialog of its details. Edit is a dialog of tabs (repo-edit-tabs.ts)
// holding every setting, with one Save and Cancel for all of them; the
// settings editor itself comes from the page (`settings`), so this file holds
// no policy logic. A private mirror is one of the role choices, its public
// repository named on the Mirror tab.
import { useState, type ReactNode } from 'react'
import { Tabs, TabPanel } from './ui/Tabs.tsx'
import { EDIT_TABS, dirtyTabs, errorTabs, type EditTab } from './repo-edit-tabs.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import { Modal } from './ui/Modal.tsx'
import { FieldGroup } from './ui/FieldGroup.tsx'
import MirrorSetup from './MirrorSetup.tsx'
import { MIRROR_ROLE, MIRROR_ROLE_LABEL, MIRROR_ROLE_LINE, ROLE_OPTIONS, mirrorSourceProblem, type RepositoryEdit, type RepositoryForm } from './settings-api.ts'
import type { RepositoryRow } from './repository-rows.ts'
import { linkHref } from './views-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { TextLink } from './ui/TextLink'
import { SelectField } from './ui/SelectField'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

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
  // false: the public repository's field is elsewhere (Edit's Mirror tab).
  withSource?: boolean
}) {
  const { role, source } = props
  const line = role === MIRROR_ROLE ? MIRROR_ROLE_LINE : ROLE_OPTIONS.find((option) => option.value === role)?.line
  const problem = role === MIRROR_ROLE && source.trim() ? mirrorSourceProblem(source, props.github) : null
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
          onChange={(event) => props.onChange(event.target.value, source)}
          aria-label={`Role of ${props.name}`}
          look="field"
          maxWidth="24rem"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={MIRROR_ROLE} disabled={!props.github}>
            {MIRROR_ROLE_LABEL}
          </option>
        </SelectField>
      </Box>
      {(props.fixed || line) && <Hint size="xs">{props.fixed || line}</Hint>}
      {role === MIRROR_ROLE && props.withSource !== false && (
        <Box htmlFor={`${props.id}-source`} as="label" flex flexCol gap="1" size="sm">
          <Box as="span" weight="medium">
            Public repository
          </Box>
          <Input
            id={`${props.id}-source`}
            value={source}
            placeholder="owner/name"
            aria-label="Public repository"
            onChange={(event) => props.onChange(role, event.target.value)}
            css-max-width="24rem"
          />
          {problem && (
            <ErrorText role="alert" as="span" size="xs">
              {problem}
            </ErrorText>
          )}
        </Box>
      )}
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
      ['Label rules', String(entry.rules.length)],
      ['Required checks', entry.requiredChecks || 'None named'],
      ['Who may start work', entry.allowedActors || (entry.minimumPermission ? `Permission ${entry.minimumPermission} or higher` : 'Default: write')],
      ['Release crews (N)', entry.releaseCapacity || 'Default'],
    )
    if (entry.mirror.source && entry.mirror.mirror) facts.push(['Private mirror', `${entry.mirror.mirror} of ${entry.mirror.source}`])
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
// the open tab's part. General and Mirror (with a GitHub remote) always show;
// the dialog adds its own role and public-repository parts above the page's.
export interface EditSettings {
  tabs: readonly EditTab[]
  body: ReactNode
}

export function EditRepository(props: {
  row: RepositoryRow
  workspaceId: string
  // The role now, and the public repository if it is a mirror.
  role: string
  source: string
  // The saved entry, for the unsaved-changes dots.
  saved: RepositoryForm | null
  // The editor for the repository's settings, on `tab`. It edits `entry`
  // (null: the saved one) and reports changes through `setEntry`.
  settings: (view: { entry: RepositoryForm | null; setEntry: (entry: RepositoryForm) => void; tab: EditTab; setTab: (tab: EditTab) => void }) => EditSettings
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
  const [tab, setTab] = useState<EditTab>('general')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = role !== props.role || source !== props.source || entry !== null
  const mirror = role === MIRROR_ROLE
  const problem = mirror ? mirrorSourceProblem(source, row.github) : null
  const fixed = !row.github ? 'No GitHub remote, so its tasks stay local.' : null
  const settings = props.settings({ entry, setEntry, tab, setTab })
  const shown = EDIT_TABS.filter((t) => t.key === 'general' || (t.key === 'mirror' ? Boolean(row.github) : settings.tabs.includes(t.key)))
  const dirty = dirtyTabs({ saved: props.saved, entry, roleChanged: role !== props.role, sourceChanged: source !== props.source })
  const errors = errorTabs(entry, problem)
  const save = async () => {
    setBusy(true)
    setError(null)
    const failure = await props.onSave({ entry, role, source: source.trim() }).catch((caught: unknown) => (caught instanceof Error ? caught.message : String(caught)))
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
          <Btn type="button" primary disabled={busy || !changed || Boolean(problem)} onClick={() => void save()}>
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
            <RoleChoice
              id={id}
              name={row.name}
              github={row.github}
              role={role}
              source={source}
              fixed={fixed}
              titled
              withSource={false}
              onChange={(nextRole) => setRole(nextRole)}
            />
            {mirror && (
              <Box as="p" size="xs">
                <PlainButton type="button" underline onClick={() => setTab('mirror')}>
                  Name its public repository on the Mirror tab
                </PlainButton>
              </Box>
            )}
            <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1" size="sm" data-repository-folder>
              <Hint as="dt">Folder</Hint>
              <Box as="dd" css-overflow-wrap="anywhere" minW0>
                {row.folder ? <code>{row.folder}</code> : 'No folder on this computer'}
              </Box>
            </Box>
          </FieldGroup>
        )}
        {tab === 'mirror' &&
          (mirror ? (
            <FieldGroup title="Public repository" blurb="This repository is a private copy of a public one. Crews work here, in private.">
              <Box htmlFor={`${id}-source`} as="label" flex flexCol gap="1" size="sm">
                <Box as="span" srOnly>
                  Public repository
                </Box>
                <Input
                  id={`${id}-source`}
                  value={source}
                  placeholder="owner/name"
                  aria-label="Public repository"
                  onChange={(event) => setSource(event.target.value)}
                  css-max-width="24rem"
                />
                {problem && (
                  <ErrorText role="alert" as="span" size="xs">
                    {problem}
                  </ErrorText>
                )}
              </Box>
              {row.github && !problem && <MirrorSetup workspaceId={props.workspaceId} repository={row.github} source={source} onApplied={props.onApplied} />}
            </FieldGroup>
          ) : (
            <FieldGroup title="Set up a mirror" blurb="Make this repository a private copy of a public one, so crews work in private.">
              <div>
                <Btn type="button" onClick={() => setRole(MIRROR_ROLE)}>
                  Set up mirror
                </Btn>
              </div>
            </FieldGroup>
          ))}
        {tab === 'mirror' && mirror ? null : settings.body}
      </TabPanel>
    </Modal>
  )
}
