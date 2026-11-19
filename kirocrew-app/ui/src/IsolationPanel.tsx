// Settings > Repository setup > Landing: the Isolation panel. How this
// repository's checks run: in the sandbox (the default, network off), in a
// container, or not sandboxed. It saves on its own with project.configure,
// which only a person may call.
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { FormSection } from './FormSection.tsx'
import { Btn } from './ui/Btn'
import { Box } from './ui/Box'
import { Input } from './ui/Input'
import { SelectField } from './ui/SelectField'
import { Checkbox } from './ui/Checkbox'
import { PlainTextarea } from './ui/Plain'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import { RUN_CHOICES, isolationForm, isolationInput, isolationProblem, type Isolation, type IsolationForm } from './isolation-form.ts'

function Lines(props: { id: string; value: string; onChange: (value: string) => void; mark: string }) {
  return (
    <PlainTextarea
      id={props.id}
      rows={2}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      css-border-color="border"
      css-color="text"
      css-background="card-transparent"
      rounded="base"
      border="all"
      px="2"
      py="1"
      size="sm"
      {...{ [`data-isolation-${props.mark}`]: '' }}
    />
  )
}

export default function IsolationPanel(props: { workspaceId: string; projectId: string; value: Partial<Isolation> | null | undefined }) {
  const api = useAppApi()
  const [saved, setSaved] = useState<IsolationForm>(isolationForm(props.value))
  const [form, setForm] = useState<IsolationForm>(saved)
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const problem = isolationProblem(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const hint = useMemo(() => RUN_CHOICES.find((choice) => choice.value === form.run)?.hint, [form.run])
  const set = (change: Partial<IsolationForm>) => {
    setForm({ ...form, ...change })
    setMessage(null)
  }
  const save = async () => {
    if (problem) return
    setSaving(true)
    try {
      await api.post(COMMAND_PATH, { operation: 'project.configure', input: { id: props.projectId, isolation: isolationInput(form) }, workspaceId: props.workspaceId })
      setSaved(form)
      setMessage({ ok: 'Saved.' })
    } catch (error) {
      setMessage({ error: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }
  const id = `avoozl-isolation-${props.projectId}`
  return (
    <FormSection
      title="Isolation"
      blurb="How Avoozl runs this repository's checks. The network is off unless you turn it on."
      actions={
        <Btn size="sm" disabled={!dirty || Boolean(problem) || saving} onClick={save} data-isolation-save>
          {saving ? 'Saving…' : 'Save isolation'}
        </Btn>
      }
    >
      <Box flex flexCol gap="3" data-isolation>
        <Box as="label" flex flexCol gap="1" size="sm" htmlFor={`${id}-run`}>
          Run checks
          <SelectField id={`${id}-run`} value={form.run} onChange={(event) => set({ run: event.target.value as IsolationForm['run'] })} data-isolation-run>
            {RUN_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </SelectField>
        </Box>
        {hint && (
          <Box as="p" m0 size="xs" tone="muted" data-isolation-hint>
            {hint}
          </Box>
        )}
        {form.run === 'container' && (
          <Box as="label" flex flexCol gap="1" size="sm" htmlFor={`${id}-image`}>
            Image
            <Input id={`${id}-image`} value={form.image} placeholder="node:22" onChange={(event) => set({ image: event.target.value })} data-isolation-image />
          </Box>
        )}
        <Box as="label" flex items="center" gap="2" size="sm">
          <Checkbox checked={form.network === 'on'} onChange={(event) => set({ network: event.target.checked ? 'on' : 'off' })} data-isolation-network />
          Let checks reach the network
        </Box>
        <Box as="label" flex flexCol gap="1" size="sm" htmlFor={`${id}-readable`}>
          Also readable (one absolute path per line)
          <Lines id={`${id}-readable`} value={form.readable} onChange={(readable) => set({ readable })} mark="readable" />
        </Box>
        <Box as="label" flex flexCol gap="1" size="sm" htmlFor={`${id}-writable`}>
          Also writable (one absolute path per line)
          <Lines id={`${id}-writable`} value={form.writable} onChange={(writable) => set({ writable })} mark="writable" />
        </Box>
        <Box as="label" flex flexCol gap="1" size="sm" htmlFor={`${id}-prepare`}>
          Prepare once per worktree, outside isolation
          <Input id={`${id}-prepare`} value={form.prepare} placeholder="npm ci" onChange={(event) => set({ prepare: event.target.value })} data-isolation-prepare />
        </Box>
        {problem && (
          <Box as="p" m0 size="xs" tone="danger" role="alert" data-isolation-problem>
            {problem}
          </Box>
        )}
        {message?.ok && (
          <Box as="p" m0 size="xs" tone="muted" role="status">
            {message.ok}
          </Box>
        )}
        {message?.error && (
          <Box as="p" m0 size="xs" tone="danger" role="alert">
            {message.error}
          </Box>
        )}
      </Box>
    </FormSection>
  )
}
