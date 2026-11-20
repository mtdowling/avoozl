// Set up triage (triage-agent TA12.2): the one way the triage agent goes on
// for a repository. It asks which repository, whether to take the open
// items already there, the daily cap, the review size, the harness and the
// labels to make, shows what it will do, and only then makes the labels and
// turns the agent on. Repository onboarding asks none of this.
import { useEffect, useState } from 'react'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { Stack } from './ui/Stack'
import { Checkbox } from './ui/Checkbox'
import { Field } from './ui/Field'
import { Input } from './ui/Input'
import { SelectField } from './ui/SelectField'
import { errorMessage } from './workspace-api.ts'
import type { TriageSetupPreview, itemsClient } from './github-items-api.ts'
import { permissionsLine } from './settings-api.ts'

const HARNESS_LABEL: Record<string, string> = { auto: "The repository's executor", kirocrew: 'A Kiro Crew chat' }

export function TriageSetup(props: {
  workspaceId: string
  client: ReturnType<typeof itemsClient>
  repositories: string[]
  repository?: string | null
  onDone: () => void
  onCancel: () => void
}) {
  const { workspaceId, client } = props
  const [repository, setRepository] = useState(props.repository ?? props.repositories[0] ?? '')
  const [preview, setPreview] = useState<TriageSetupPreview | null>(null)
  const [existing, setExisting] = useState<'take' | 'skip'>('skip')
  const [dailyRuns, setDailyRuns] = useState('')
  const [reviewLines, setReviewLines] = useState('')
  const [harness, setHarness] = useState('auto')
  const [make, setMake] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!repository) return
    let live = true
    setPreview(null)
    client
      .setupPreview(workspaceId, repository)
      .then((read) => {
        if (!live) return
        setPreview(read)
        setDailyRuns(String(read.defaults.dailyRuns))
        setReviewLines(String(read.defaults.fullReviewMaxLines))
        setHarness(read.harness)
        setMake(read.labels.filter((label) => label.exists === false).map((label) => label.name))
        setError(null)
      })
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, repository])
  const toMake = preview?.labels.filter((label) => label.exists === false && make.includes(label.name)) ?? []
  const apply = async () => {
    setBusy(true)
    try {
      // Turn triage on is the Allow for the labels listed above (PC13.3).
      const steps = (preview?.writes ?? []).filter((write) => toMake.some((label) => label.name === write.label)),
        allow = steps.length ? (await client.allow(workspaceId, steps)).grants : []
      await client.setup(workspaceId, repository, {
        allow,
        existing,
        dailyRuns: Number(dailyRuns),
        fullReviewMaxLines: Number(reviewLines),
        harness,
        createLabels: toMake.map((label) => label.name),
      })
      props.onDone()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Box as="section" aria-label="Set up triage" css-border-color="border" border="all" css-border-radius="8" p="3" flex flexCol gap="3" size="sm" data-triage-setup>
      <Box weight="semibold">Set up triage</Box>
      <Field id="triage-setup-repository" label="Repository" help="The agent reads new issues and pull requests here.">
        <SelectField id="triage-setup-repository" value={repository} onChange={(event) => setRepository(event.target.value)} disabled={busy} data-triage-setup-repository>
          {props.repositories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
      </Field>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {!preview ? (
        !error && <Hint>Reading {repository}…</Hint>
      ) : (
        <>
          <Box as="fieldset" flex flexCol gap="1" data-triage-setup-existing>
            <Box as="legend" weight="medium" mb="1">
              Items already open
            </Box>
            <Box as="label" flex items="center" gap="2">
              <input type="radio" name="triage-existing" checked={existing === 'skip'} onChange={() => setExisting('skip')} /> Only new ones
            </Box>
            <Box as="label" flex items="center" gap="2">
              <input type="radio" name="triage-existing" checked={existing === 'take'} onChange={() => setExisting('take')} /> Take the open items too
            </Box>
          </Box>
          <Box flex flexWrap gap="3">
            <Field id="triage-setup-daily" label="Runs a day" raw="triage.dailyRuns" help="Past it, new items wait for the next day." width="sm">
              <Input id="triage-setup-daily" type="number" min={1} max={1000} value={dailyRuns} onChange={(event) => setDailyRuns(event.target.value)} />
            </Field>
            <Field id="triage-setup-lines" label="Full review up to" raw="triage.fullReviewMaxLines" help="Changed lines; a bigger pull request gets a partial review." width="sm">
              <Input id="triage-setup-lines" type="number" min={1} max={100000} value={reviewLines} onChange={(event) => setReviewLines(event.target.value)} />
            </Field>
            <Field id="triage-setup-harness" label="Runs on" raw="roles.triage.harness" help="Where each triage run's session runs." width="md">
              <SelectField id="triage-setup-harness" value={harness} onChange={(event) => setHarness(event.target.value)}>
                {preview.harnesses.map((name) => (
                  <option key={name} value={name}>
                    {HARNESS_LABEL[name] ?? name}
                  </option>
                ))}
              </SelectField>
            </Field>
          </Box>
          <Stack gap={1} data-triage-setup-labels>
            <Box weight="medium">Labels</Box>
            <Hint size="xs">The agent adds only labels the repository has. Pick the ones Avoozl makes now.</Hint>
            {preview.labelsError && <Hint size="xs">{preview.labelsError} No label is made.</Hint>}
            {preview.labels.map((label) => (
              <Box as="label" key={label.name} flex items="center" gap="2" data-triage-setup-label={label.name}>
                <Checkbox
                  checked={label.exists === true || make.includes(label.name)}
                  disabled={label.exists !== false || busy}
                  onChange={(event) => setMake(event.target.checked ? [...make, label.name] : make.filter((name) => name !== label.name))}
                />
                <Box as="span" css-background={`#${label.color}`} css-border-radius={999} css-width={10} css-height={10} shrink0 aria-hidden />
                <span>{label.name}</span>
                <Hint as="span" size="xs">
                  {label.exists === true ? 'already there' : label.exists === null ? 'unknown' : label.description}
                </Hint>
              </Box>
            ))}
          </Stack>
          <Hint data-triage-setup-summary>
            Avoozl will{' '}
            {toMake.length ? `make ${toMake.length} label${toMake.length === 1 ? '' : 's'} (${toMake.map((label) => label.name).join(', ')}) in ${repository}, then ` : ''}turn the
            triage agent on there.
          </Hint>
          {toMake.length > 0 && (preview.writes ?? []).length > 0 && (
            <Hint size="xs" data-setup-permissions>
              {permissionsLine((preview.writes ?? [])[0])}
            </Hint>
          )}
          <Box flex flexWrap gap="2">
            <Btn type="button" primary disabled={busy} onClick={() => void apply()} data-triage-setup-apply>
              {busy ? 'Turning on…' : 'Turn triage on'}
            </Btn>
            <Btn type="button" disabled={busy} onClick={props.onCancel}>
              Cancel
            </Btn>
          </Box>
        </>
      )}
    </Box>
  )
}
