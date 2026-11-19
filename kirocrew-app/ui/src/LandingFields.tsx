// Conflicts, who merges and the merge method for one repository, in the
// app's settings style: plain fields with the default shown, each inherited
// value saying where it comes from, and each mode one radio fold-out. It
// edits one repository's form on its Landing tab; Save writes .avoozl.json
// like every other page.
import { Input } from './ui/Input'
import { Field, fieldDescribedBy } from './ui/Field.tsx'
import { RadioFold } from './ui/RadioFold.tsx'
import { SHIP_CHOICES } from './delivery-api.ts'
import { CONFLICT_DEFAULTS, MERGE_METHODS, MERGE_METHOD_TEXT, valueSource, type RepositoryForm } from './settings-api.ts'
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
    blurb: 'How verified work lands here, who merges its pull request, and the merge method.',
  },
} as const

// The landing block's mode values (landing.mode).
export const LANDING_MODES = ['direct', 'pr', 'off'] as const

// Who merges (landing.autoMerge): one radio fold-out, the writer, Avoozl
// and the person for each. Blank is on. A value Avoozl does not accept says so.
export function AutoMergeFields({ id, repository, set }: Part) {
  const own = repository.autoMerge === 'off' ? 'manual' : repository.autoMerge === 'on' ? 'auto-merge' : null
  const value = own ?? 'auto-merge'
  const unknown = repository.autoMerge && !own ? repository.autoMerge : null
  return (
    <Stack id={`${id}-auto-merge`} gap={1}>
      <RadioFold
        name={`${id}-auto-merge`}
        label="Who merges"
        value={value}
        onChange={(ship) => set({ autoMerge: ship === 'manual' ? 'off' : 'on' })}
        sections={SHIP_CHOICES.map((choice) => ({
          key: choice.key,
          title: `${choice.title} (landing.autoMerge: ${choice.key === 'manual' ? 'false' : 'true'})`,
          line: `${choice.line}${!repository.autoMerge && choice.key === value ? ' Not set on this repository; this is the default.' : ''}`,
          description: (
            <Box as="table" size="sm">
              <tbody>
                {['Writer', 'Avoozl', 'You'].map((who, i) => (
                  <tr key={who}>
                    <Box scope="row" as="th" pr="3" align="left" weight="medium">
                      {who}
                    </Box>
                    <td>{choice.who[i]}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          ),
        }))}
      />
      {value === 'manual' && (
        <Hint as="p" size="xs">
          Briefs tell writers not to turn on auto-merge.
        </Hint>
      )}
      {unknown && (
        <ErrorText role="alert" size="xs" data-ship-unknown>
          .avoozl.json has landing.autoMerge "{unknown}", which Avoozl does not accept. Pick one above and save.
        </ErrorText>
      )}
    </Stack>
  )
}

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
