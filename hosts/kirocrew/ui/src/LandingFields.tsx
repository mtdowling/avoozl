// Conflicts, who merges (landing.pr) and the merge method for one repository, in the
// app's settings style: plain fields with the default shown, each inherited
// value saying where it comes from, and each mode one radio fold-out. It
// edits one repository's form on its Landing tab; Save writes .avoozl.json
// like every other page.
import { Input } from './ui/Input'
import { Field, fieldDescribedBy } from './ui/Field.tsx'
import { RadioFold } from './ui/RadioFold.tsx'
import { CONFLICT_DEFAULTS, MERGE_METHODS, MERGE_METHOD_TEXT, PR_MODES, PR_MODE_TEXT, valueSource, type RepositoryForm } from './settings-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

function Line(props: { id: string; label: string; value: string; fallback: string; raw: string; onChange: (value: string) => void; type?: string; unit?: string; help?: string }) {
  const note = valueSource(props.value, props.fallback, props.unit)
  return (
    <Field id={props.id} label={props.label} raw={props.raw} help={props.help} note={<span data-source>{note}</span>}>
      <Input
        id={props.id}
        type={props.type}
        value={props.value}
        placeholder={props.fallback}
        aria-describedby={fieldDescribedBy(props.id, { help: props.help, note })}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  )
}

type Part = { id: string; repository: RepositoryForm; set: (change: Partial<RepositoryForm>) => void }

// What each part does, said once (design §4.25).
export const LANDING_PART_TEXT = {
  conflicts: {
    title: 'Conflicts',
    blurb: "How many times a landing conflict goes back to the task's worker chat before Avoozl asks you.",
  },
  merge: {
    title: 'Who merges',
    blurb: 'How verified work lands here, and who merges its pull request.',
  },
} as const

// The landing block's mode values (landing.mode).
export const LANDING_MODES = ['direct', 'pr', 'off'] as const

export function ConflictFields({ id, repository, set }: Part) {
  return (
    <Stack gap={3} data-conflicts>
      <Line
        id={`${id}-max-attempts`}
        label="Attempts per conflict"
        raw="conflicts.maxAttempts"
        type="number"
        help="After this many, the conflict waits for you. 0 asks you at once."
        value={repository.maxAttempts}
        fallback={CONFLICT_DEFAULTS.maxAttempts}
        onChange={(value) => set({ maxAttempts: value })}
      />
    </Stack>
  )
}

// How pull requests open and who merges them (landing.pr), for pr landing:
// one line per choice. Unset uses the workspace's landing.pr (Settings ›
// Delivery), else draft.
export function PrModeFields({ id, repository, set }: Part) {
  const own = (PR_MODES as readonly string[]).includes(repository.prMode) ? (repository.prMode as (typeof PR_MODES)[number]) : null
  return (
    <Stack id={`${id}-pr-mode`} gap={1}>
      <RadioFold
        name={`${id}-pr-mode`}
        label="Who merges"
        value={own ?? 'workspace'}
        onChange={(value) => set({ prMode: value === 'workspace' ? '' : value })}
        sections={[
          { key: 'workspace', title: "The workspace's setting", line: "Not set on this repository: uses the workspace's landing.pr, set in Settings › Autopilot." },
          ...PR_MODES.map((mode) => ({ key: mode, title: `${PR_MODE_TEXT[mode].title} (landing.pr: ${mode})`, line: PR_MODE_TEXT[mode].line })),
        ]}
      />
      {repository.prMode && !own && (
        <ErrorText role="alert" size="xs">
          .avoozl.json has landing.pr "{repository.prMode}", which Avoozl does not accept. Pick one above and save.
        </ErrorText>
      )}
    </Stack>
  )
}

export function MergeMethodFields({ id, repository, set }: Part) {
  return (
    <div id={`${id}-merge-method`}>
      <RadioFold
        name={`${id}-merge-method`}
        label="Merge method"
        value={(repository.mergeMethod || 'squash') as (typeof MERGE_METHODS)[number]}
        onChange={(value) => set({ mergeMethod: value })}
        sections={MERGE_METHODS.map((method) => ({
          key: method,
          title: `${MERGE_METHOD_TEXT[method].title} (landing.method: ${method})`,
          line: `${MERGE_METHOD_TEXT[method].line}${!repository.mergeMethod && method === 'squash' ? ' Not set on this repository; this is the default.' : ''}`,
        }))}
      />
    </div>
  )
}
