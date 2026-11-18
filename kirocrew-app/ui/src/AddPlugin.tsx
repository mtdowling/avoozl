// Settings > Plugins > Add plugin, in four steps styled like Set up GitHub:
// Where from, What, Applies to, Review and approve. Nothing is declared
// before step 3's button and nothing runs before step 4's approval. Cancel
// is on every step; on step 4 it also removes the entry step 3 declared.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import {
  addInput,
  applyPreview,
  CONTRACT_HINT,
  CONTRACT_LABEL,
  canApprove,
  emptyPluginForm,
  locationOf,
  partTitles,
  PLUGIN_SOURCES,
  PLUGIN_STEPS,
  pluginsClient,
  previewInput,
  previewProblem,
  publicWarning,
  sharedBlocked,
  stateLabel,
  type PackPreview,
  type PluginForm,
  type PluginPreview,
  type PluginRow,
} from './plugins-api.ts'
import { PackChanges } from './PackImport.tsx'
import { errorMessage } from './workspace-api.ts'
import { IconLabel } from './ui/controls.tsx'
import { PairedCard } from './ui/PairedCards.tsx'
import { FormSection } from './FormSection.tsx'
import { RadioFold } from './ui/RadioFold.tsx'
import { Folder, GitBranch, Laptop, Package, Plus, Users } from './icons.ts'
import { Facts, Parts } from './PluginsSettings.tsx'
import { Modal } from './ui/Modal.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { SelectField } from './ui/SelectField'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

type Client = ReturnType<typeof pluginsClient>

const SOURCE_ICONS = { path: Folder, package: Package, git: GitBranch } as const

function Field(props: { label: string; marker?: 'required' | 'optional'; raw?: string; hint?: string; children: ReactNode }) {
  return (
    <Box as="label" flex flexCol gap="1" size="sm">
      <span>
        {props.label} {props.marker && <Hint size="xs">({props.marker})</Hint>}
      </span>
      {props.children}
      {props.hint && <Hint size="xs">{props.hint}</Hint>}
      {props.raw && <Box as="code" size="11" tone="muted">{props.raw}</Box>}
    </Box>
  )
}

type Change = { target: { value: string } }

// Step 1: one radio fold-out section per source. Opening one picks it;
// what was typed in the others stays until Cancel.
function SourceFields({ form, set }: { form: PluginForm; set: (patch: Partial<PluginForm>) => void }) {
  const fields: Record<PluginForm['where'], ReactNode> = {
    path: (
      <Field label="Folder" marker="required" raw="path" hint="Absolute, or relative to this computer’s Avoozl settings. A shared plugin uses a path inside the repository.">
        <Input value={form.path} placeholder="~/plugins/example-tracker" onChange={(e: Change) => set({ path: e.target.value })} />
      </Field>
    ),
    package: (
      <Box css-grid-template-columns="minmax-0-2fr-minmax-6rem-1fr" grid gap="2">
        <Field label="Package name" marker="required" raw="package">
          <Input value={form.package} placeholder="@example/avoozl-tracker" onChange={(e: Change) => set({ package: e.target.value })} />
        </Field>
        <Field label="Version" marker="optional" hint="Checked against what is installed.">
          <Input value={form.version} placeholder="1.2.0" onChange={(e: Change) => set({ version: e.target.value })} />
        </Field>
      </Box>
    ),
    git: (
      <Stack gap={2}>
        <Field label="Git URL or repository path" marker="required" raw="git">
          <Input value={form.git} placeholder="https://git.example.com/team/plugin.git" onChange={(e: Change) => set({ git: e.target.value })} />
        </Field>
        <Box css-grid-template-columns="minmax-0-1fr-minmax-0-1fr" grid gap="2">
          <Field label="Tag, branch or commit" marker="required" raw="ref">
            <Input value={form.ref} placeholder="v1.0.0" onChange={(e: Change) => set({ ref: e.target.value })} />
          </Field>
          <Field label="Folder in the repository" marker="optional" raw="subdir">
            <Input value={form.subdir} placeholder="plugin" onChange={(e: Change) => set({ subdir: e.target.value })} />
          </Field>
        </Box>
        <Hint as="p" size="xs">Next finds the exact commit this names. Add fetches only that commit, with hooks off and nothing installed.</Hint>
      </Stack>
    ),
  }
  return (
    <div data-plugin-sources>
      <RadioFold
        name="avoozl-plugin-source"
        label="Where from"
        value={form.where}
        onChange={(where) => set({ where })}
        sections={PLUGIN_SOURCES.map((source) => ({
          key: source.key,
          title: source.title,
          line: source.line,
          icon: SOURCE_ICONS[source.key],
          fields: fields[source.key],
        }))}
      />
    </div>
  )
}

function WhatStep(props: { form: PluginForm; preview: PluginPreview; supported: number[]; set: (patch: Partial<PluginForm>) => void; problem: string | null }) {
  const { form, preview, set } = props
  const fromManifest = preview.contract !== undefined
  const capabilities = preview.capabilities
    ? Object.entries(preview.capabilities)
        .map(([k, v]) => `${k}: ${v.length ? v.join(', ') : 'none'}`)
        .join('; ') || 'none'
    : undefined
  const facts: [string, string | undefined][] = [
    ['Source', `${PLUGIN_SOURCES.find((x) => x.key === form.where)?.title}: ${locationOf(form)}${form.where === 'git' ? ` at ${form.ref}` : ''}`],
    ['Commit found', preview.commit],
    ['Version', preview.version],
    ['Parts', preview.provides || preview.kinds ? partTitles(preview).join(', ') : undefined],
    ['Pack', preview.pack ? (preview.pack.description ?? 'Settings only') + ` (${Object.keys(preview.pack.settings).join(', ')})` : undefined],
    ['Capabilities', capabilities],
  ]
  return (
    <Box flex flexCol gap="3" size="sm" data-plugin-what>
      <Box as="dl" css-grid-template-columns="auto-1fr" grid gapX="3" gapY="1" size="xs">
        {facts
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <Box key={label} contents>
              <Hint as="dt">{label}</Hint>
              <Box as="dd" breakAll>
                <code>{v}</code>
              </Box>
            </Box>
          ))}
      </Box>
      <Field label="Id" marker="required" raw="id" hint={preview.id ? 'From the plugin’s own avoozl-plugin.json.' : 'It must match the id in the plugin’s avoozl-plugin.json. Add checks it.'}>
        <Input value={form.id} disabled={Boolean(preview.id)} placeholder="example-tracker" onChange={(e: Change) => set({ id: e.target.value })} />
      </Field>
      <Field label={CONTRACT_LABEL} marker="required" raw="contract" hint={fromManifest ? `From the plugin’s own avoozl-plugin.json. ${CONTRACT_HINT}` : CONTRACT_HINT}>
        {fromManifest ? (
          <Box css-max-width="8rem">
            <Input value={form.contract} disabled data-contract-from-manifest />
          </Box>
        ) : (
          <SelectField value={form.contract} onChange={(e) => set({ contract: e.target.value })} look="field" maxWidth="8rem">
            {props.supported.map((value) => (
              <option key={value} value={String(value)}>
                {value}
              </option>
            ))}
          </SelectField>
        )}
      </Field>
      <Field label="Config (JSON)" marker="optional" raw="config" hint="Credentials never go here: name an environment variable with a key ending in Env.">
        <Input value={form.config} onChange={(e: Change) => set({ config: e.target.value })} placeholder='{"tokenEnv": "EXAMPLE_TOKEN"}' />
      </Field>
      {props.problem && (
        <ErrorText role="alert" size="sm">
          {props.problem}
        </ErrorText>
      )}
    </Box>
  )
}

function ScopeStep(props: { form: PluginForm; set: (patch: Partial<PluginForm>) => void; confirmPublic: boolean; setConfirmPublic: (v: boolean) => void }) {
  const { form } = props
  const blocked = sharedBlocked(form)
  const shared =
    form.where === 'git'
      ? 'Written to .avoozl.json. Each computer fetches the commit with Update, then approves it.'
      : form.where === 'package'
        ? 'Written to .avoozl.json. Each computer installs the package, then approves it.'
        : 'Written to .avoozl.json. Each computer approves it for itself.'
  const detail = (line: string, when: string, limits: string) => (
    <Box flex flexCol gap="1" size="sm">
      <p>{line}</p>
      <Hint as="p" size="xs">Use it when {when}</Hint>
      <Hint as="p" size="xs">{limits}</Hint>
    </Box>
  )
  return (
    <Box flex flexCol gap="3" size="sm" data-plugin-scope>
      <RadioFold
        name="avoozl-plugin-scope"
        label="Applies to"
        value={form.scope}
        onChange={(scope) => {
          props.set({ scope })
          props.setConfirmPublic(false)
        }}
        sections={[
          {
            key: 'machine',
            icon: Laptop,
            title: 'This computer only',
            line: 'Saved in this computer’s Avoozl settings. Nothing goes into the repository.',
            description: detail(
              'Only this computer runs it, after you approve it here.',
              'you are trying it, or its name is private.',
              'Others on the repository do not see it or run it.',
            ),
          },
          {
            key: 'repository',
            icon: Users,
            title: 'Shared with the repo',
            line: shared,
            disabled: blocked,
            description: detail(
              'Everyone who works in the repository gets the entry; each computer still approves it for itself.',
              'everyone on the repository should run it.',
              'A folder must be a path inside the repository, written relative to it.',
            ),
            fields: (
              <Switch label="Publish it in .avoozl.json" align="start" size="sm" checked={props.confirmPublic} onChange={props.setConfirmPublic}>
                <span>
                  Publish it in .avoozl.json
                  <Hint size="xs" block>Anyone who can read the repository sees this plugin’s id, source and config.</Hint>
                </span>
              </Switch>
            ),
          },
        ]}
      />
    </Box>
  )
}

function AddPluginDialog(props: { workspaceId: string; client: Client; supported: number[]; onClose: (note?: string) => void; onChanged: () => Promise<unknown> }) {
  const { workspaceId, client, onClose, onChanged } = props
  const supported = props.supported.length ? props.supported : [1]
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<PluginForm>(emptyPluginForm())
  const [preview, setPreview] = useState<PluginPreview | null>(null)
  const [added, setAdded] = useState<PluginRow | null>(null)
  // The pack preview the review step shows; import comes after approval.
  const [pack, setPack] = useState<PackPreview | null>(null)
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<PluginForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setError(null)
  }
  const cancel = useCallback(() => {
    if (!added?.id) return onClose('Cancelled. Nothing was declared.')
    const id = added.id
    void client
      .remove(workspaceId, id)
      .then(() => onChanged())
      .finally(() => onClose(`Cancelled. ${id} was removed again; nothing ran.`))
  }, [added, client, workspaceId, onClose, onChanged])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('summary, input:not([disabled]), button')?.focus()
  }, [step])
  const call = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const look = () =>
    call(async () => {
      if (!locationOf(form)) throw Error(form.where === 'path' ? 'Name the plugin folder.' : form.where === 'git' ? 'Give the git URL.' : 'Name the package.')
      if (form.where === 'git' && !form.ref.trim()) throw Error('Give a tag, branch or commit.')
      const found = await client.preview(workspaceId, previewInput(form))
      if (found.error) throw Error(found.error)
      setPreview(found)
      setForm((current) => applyPreview(current, found))
      setStep(1)
    })
  const add = () =>
    call(async () => {
      const checked = addInput(form, confirmPublic)
      if (!checked.input) throw Error(checked.error ?? 'Check the form.')
      try {
        const row = await client.add(workspaceId, checked.input)
        setAdded(row)
        if (row.pack && row.id) setPack(await client.packPreview(workspaceId, row.id).catch(() => null))
      } catch (caught) {
        const warning = publicWarning(caught)
        throw warning ? Error(`${warning} Tick the box to share it anyway.`) : caught
      }
      await onChanged()
      setStep(3)
    })
  const approve = () =>
    call(async () => {
      if (!added) return
      await client.approve(workspaceId, added)
      await onChanged()
      onClose(`Approved ${added.id} version ${added.version}.`)
    })
  const problem = step === 1 ? previewProblem(form, preview, supported) : null
  return (
    // Esc, Back and a click outside do what Cancel does, asking first once
    // something was entered or added.
    <Modal
      id="avoozl-plugin"
      width="40rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-plugin-line"
      boxRef={box}
      attrs={{ 'data-plugin-dialog': step }}
      unsaved={(Boolean(added) || step > 0 || JSON.stringify(form) !== JSON.stringify(emptyPluginForm())) && { title: 'Stop adding this plugin?', body: added ? `${added.id} is removed again. Nothing ran.` : 'What you entered is lost.', action: 'Stop' }}
      title={PLUGIN_STEPS[step][0]}
      onDismiss={cancel}
      footer={
        <>
          {(step === 1 || step === 2) && (
            <Btn type="button" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 0 && (
            <Btn type="button" primary onClick={() => void look()} disabled={busy}>
              {form.where === 'git' ? 'Find the commit' : 'Next'}
            </Btn>
          )}
          {step === 1 && (
            <Btn
              type="button"
              primary
              disabled={busy || Boolean(problem)}
              onClick={() => {
                const checked = addInput(form)
                if (checked.error) return setError(checked.error)
                setStep(2)
              }}
            >
              Next
            </Btn>
          )}
          {step === 2 && (
            <Btn type="button" primary onClick={() => void add()} disabled={busy || (form.scope === 'repository' && !confirmPublic)}>
              {form.where === 'git' ? 'Fetch and review' : 'Add and review'}
            </Btn>
          )}
          {step === 3 && added && canApprove(added) && (
            <Btn type="button" primary onClick={() => void approve()} disabled={busy}>
              Approve version {added.version}
              {added.commit ? ` at ${added.commit.slice(0, 12)}` : ''}
            </Btn>
          )}
          {step === 3 && added && !canApprove(added) && (
            <Btn type="button" primary onClick={() => onClose(`Added ${added.id}. It can't be approved yet: ${added.reason ?? stateLabel(added).label}.`)}>
              Keep it unapproved
            </Btn>
          )}
        </>
      }
    >
      <Box as="ol" flex flexWrap gap="2" size="xs" aria-label="Steps">
        {PLUGIN_STEPS.map(([title], i) => (
          <li key={title} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold' : 'text-muted'}>
            {i + 1}. {title}
          </li>
        ))}
      </Box>
      <div>
        <Hint id="avoozl-plugin-line" as="p" size="sm">
          {PLUGIN_STEPS[step][1]}
        </Hint>
      </div>
      {step === 0 && <SourceFields form={form} set={set} />}
      {step === 1 && preview && <WhatStep form={form} preview={preview} supported={supported} set={set} problem={problem} />}
      {step === 2 && <ScopeStep form={form} set={set} confirmPublic={confirmPublic} setConfirmPublic={setConfirmPublic} />}
      {step === 3 && added && (
        <Box flex flexCol gap="3" size="sm" data-plugin-review>
          <FormSection title={added.id} meta={<Badge variant={stateLabel(added).attention ? 'warning' : undefined}>{stateLabel(added).label}</Badge>}>
            {added.reason && <Hint as="p" size="xs">{added.reason}</Hint>}
            <Parts row={added} />
            <Facts row={added} />
          </FormSection>
          {pack && (
            <FormSection title="Settings pack" blurb="After you approve, import these from the plugin’s card. Nothing is imported now.">
              <PackChanges preview={pack} />
            </FormSection>
          )}
          <Hint as="p" size="xs">Cancel removes the entry just added. Nothing has run.</Hint>
        </Box>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Modal>
  )
}

// The box beside the plugin list: what a plugin is, the four steps, and the button.
export default function AddPlugin(props: { workspaceId: string; client: Client; supported: number[]; onChanged: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const close = useCallback((text?: string) => {
    setOpen(false)
    setNote(text ?? null)
  }, [])
  return (
    <PairedCard title="Add plugin" label="Add plugin" grow={2} minWidth="18rem">
      <Hint as="p" size="xs">Four steps. Nothing runs or imports until you approve its exact version.</Hint>
      <Box as="ol" mt="2" flex flexCol gap="1" size="xs">
        {PLUGIN_STEPS.map(([title, line], i) => (
          <Box key={title} as="li" flex gap="2">
            <Box as="span" weight="semibold">{i + 1}.</Box>
            <span>
              {title}
              <Hint block>{line}</Hint>
            </span>
          </Box>
        ))}
      </Box>
      <Box mt="3">
        <IconLabel
          icon={Plus}
          primary
          onClick={() => {
            setNote(null)
            setOpen(true)
          }}
        >
          Add plugin
        </IconLabel>
      </Box>
      {note && (
        <Box as="p" mt="2" size="xs" tone="muted" role="status">
          {note}
        </Box>
      )}
      {open && <AddPluginDialog workspaceId={props.workspaceId} client={props.client} supported={props.supported} onChanged={props.onChanged} onClose={close} />}
    </PairedCard>
  )
}
