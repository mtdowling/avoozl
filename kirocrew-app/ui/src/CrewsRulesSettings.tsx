// Issue Radar crews and rules for one repository (radar-coder RC7.6), in the
// app's settings style: titled boxes, plain fields with the default shown,
// advanced values folded away, each inherited value saying where it comes
// from, each mode one radio fold-out, and no model price anywhere. It edits
// one repository's form. Settings › Issue Radar shows each part in its own
// section; Save writes .avoozl.json like every other page.
import { Input } from '@kirocrew/app-sdk/ui'
import { Fold } from './controls.tsx'
import { FieldBox } from './FieldBox.tsx'
import { FieldRow, fieldDescribedBy } from './FieldRow.tsx'
import { RadioFold } from './RadioFold.tsx'
import { SHIP_CHOICES } from './delivery-api.ts'
import { AVOOZL_LABELS, CONFLICT_ACTIONS, CONFLICT_ACTION_TEXT, CONFLICT_DEFAULTS, MERGE_METHODS, MERGE_METHOD_TEXT, OLD_LABEL_NOTE, RADAR_DEFAULTS_SHOWN, rulesMode, valueSource, type RepositoryForm } from './settings-api.ts'

function Line(props: { id: string; label: string; value: string; fallback: string; raw: string; onChange: (value: string) => void; type?: string; unit?: string; help?: string }) {
  const note = valueSource(props.value, props.fallback, props.unit)
  return (
    <FieldRow id={props.id} label={props.label} raw={props.raw} help={props.help} note={<span data-source>{note}</span>}>
      <Input id={props.id} type={props.type} value={props.value} placeholder={props.fallback} aria-describedby={fieldDescribedBy(props.id, { help: props.help, note })} onChange={(event) => props.onChange(event.target.value)} />
    </FieldRow>
  )
}

// The value and setter for one of the seven labels: ready lives in
// managedLabels, the rest in radar.
function labelValue(repository: RepositoryForm, key: (typeof AVOOZL_LABELS)[number]['key']): string {
  return key === 'ready' ? (repository.managedLabels.ready ?? '') : repository[key]
}
function labelChange(repository: RepositoryForm, key: (typeof AVOOZL_LABELS)[number]['key'], value: string): Partial<RepositoryForm> {
  return key === 'ready' ? { managedLabels: { ...repository.managedLabels, ready: value } } : { [key]: value }
}

type Part = { id: string; repository: RepositoryForm; set: (change: Partial<RepositoryForm>) => void }

// What each part does, said once. Conflicts and who merges are on the
// repository's Landing tab (design §4.25); review rules on Settings › Issue Radar.
export const CREW_PART_TEXT = {
  rules: { title: 'Review rules', blurb: 'Text Set up adds to AGENTS.md in a pull request, so crews read it for every issue.' },
  conflicts: {
    title: 'Conflicts',
    blurb: "How Avoozl handles a merge conflict, and how many tries it makes before it asks you. A landing conflict goes back to the task's worker chat; a crew pull request gets one resolver chat that merges the base in.",
  },
  merge: {
    title: 'Who merges',
    blurb: 'How verified work lands here, who merges its pull request, and the merge method. A conflict fix still merges the base into the branch; with squash that merge commit never reaches the base.',
  },
} as const

// The landing block's mode values (landing.mode).
export const LANDING_MODES = ['direct', 'pr', 'train', 'off'] as const

// Who merges (landing.autoMerge): one radio fold-out, the writer, Avoozl
// and the person for each. Blank is on, or the older delivery.ship.
export function AutoMergeFields({ id, repository, set }: Part) {
  const value = repository.autoMerge === 'off' ? 'manual' : 'auto-merge'
  return (
    <div id={`${id}-auto-merge`} className="flex flex-col gap-1">
      <RadioFold
        name={`${id}-auto-merge`}
        label="Who merges"
        value={value}
        onChange={(ship) => set({ autoMerge: ship === 'manual' ? 'off' : 'on' })}
        sections={SHIP_CHOICES.map((choice) => ({
          key: choice.key,
          title: `${choice.title} (landing.autoMerge: ${choice.key === 'manual' ? 'false' : 'true'})`,
          line: `${choice.line}${!repository.autoMerge && choice.key === 'auto-merge' ? ' Not set on this repository; this is the default.' : ''}`,
          description: (
            <table className="text-sm">
              <tbody>
                {['Writer', 'Avoozl', 'You'].map((who, i) => (
                  <tr key={who}>
                    <th scope="row" className="pr-3 text-left font-medium">
                      {who}
                    </th>
                    <td>{choice.who[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        }))}
      />
      {repository.autoMerge === 'off' && <p className="text-xs text-muted">Briefs tell writers not to turn on auto-merge.</p>}
    </div>
  )
}

export function ReviewRulesFields({ id, repository, set }: Part) {
  return (
    <RadioFold
      name={`${id}-rules-mode`}
      label="Review rules"
      value={rulesMode(repository)}
      onChange={(mode) => set({ reviewRules: mode === 'default' ? '' : 'Say what you skipped or did not check.' })}
      sections={[
        { key: 'default', title: "Use Avoozl's rules", line: "Not set on this repository. Using Avoozl's built-in review rules. Set up shows the exact text before it opens the pull request." },
        {
          key: 'custom',
          title: 'Write your own',
          line: 'Your text replaces the built-in rules. The one-line crew prompt is always added.',
          fields: (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-rules`} className="text-sm font-medium">
                Review rules <span className="text-xs text-muted">radar.reviewRules</span>
              </label>
              <textarea id={`${id}-rules`} rows={6} value={repository.reviewRules} onChange={(event) => set({ reviewRules: event.target.value })} className="min-w-0 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--border)', background: 'transparent', color: 'inherit' }} />
              <span className="text-xs text-muted">{valueSource(repository.reviewRules ? 'your text' : '', "Avoozl's built-in rules")}</span>
            </div>
          ),
        },
      ]}
    />
  )
}

export function ConflictFields({ id, repository, set }: Part) {
  return (
    <div className="flex flex-col gap-3" data-conflicts>
      <div id={`${id}-on-source-conflict`}>
        <RadioFold
          name={`${id}-on-source-conflict`}
          label="On a source conflict"
          value={(repository.onSourceConflict || CONFLICT_DEFAULTS.onSourceConflict) as (typeof CONFLICT_ACTIONS)[number]}
          onChange={(value) => set({ onSourceConflict: value })}
          sections={CONFLICT_ACTIONS.map((action) => ({
            key: action,
            title: action === 'fix' ? 'Fix it (conflicts.onSourceConflict: fix)' : 'Ask me (conflicts.onSourceConflict: ask)',
            line: `${CONFLICT_ACTION_TEXT[action]}.${!repository.onSourceConflict && action === CONFLICT_DEFAULTS.onSourceConflict ? ' Not set on this repository; this is the default.' : ''}`,
          }))}
        />
      </div>
      <Line id={`${id}-max-attempts`} label="Attempts per conflict" raw="conflicts.maxAttempts" type="number" help="After this many, the conflict waits for you. 0 asks you at once." value={repository.maxAttempts} fallback={CONFLICT_DEFAULTS.maxAttempts} onChange={(value) => set({ maxAttempts: value })} />
    </div>
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

export const AVOOZL_LABELS_LINE = "Labels Avoozl reads or writes for its own work. Each must differ from the others and from Issue Radar's labels."

export function AvoozlLabelFields({ id, repository, set, note = true }: Part & { note?: boolean }) {
  return (
    <div className="flex flex-col gap-3" data-avoozl-labels>
      {note && (
        <p className="text-xs text-muted">
          {AVOOZL_LABELS_LINE} {OLD_LABEL_NOTE}
        </p>
      )}
      {AVOOZL_LABELS.map((entry) => (
        <Line
          key={entry.key}
          id={`${id}-label-${entry.key}`}
          label={entry.label}
          raw={entry.raw}
          help={`${entry.job} ${entry.writer}`}
          value={labelValue(repository, entry.key)}
          fallback={RADAR_DEFAULTS_SHOWN[entry.key]}
          onChange={(value) => set(labelChange(repository, entry.key, value))}
        />
      ))}
    </div>
  )
}

export function CrewsRulesSettings(props: Part) {
  return (
    <div className="flex flex-col gap-4" data-crews-rules>
      <FieldBox title="Review rules" blurb={CREW_PART_TEXT.rules.blurb}>
        <ReviewRulesFields {...props} />
      </FieldBox>
      <FieldBox title={CREW_PART_TEXT.conflicts.title} blurb={CREW_PART_TEXT.conflicts.blurb}>
        <ConflictFields {...props} />
      </FieldBox>
      <FieldBox title={CREW_PART_TEXT.merge.title} blurb={CREW_PART_TEXT.merge.blurb}>
        <MergeMethodFields {...props} />
      </FieldBox>
      <Fold title="Avoozl labels" id={`${props.id}-crews-advanced`}>
        <AvoozlLabelFields {...props} />
      </Fold>
    </div>
  )
}
