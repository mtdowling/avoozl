// Issue Radar crews and rules for one repository (radar-coder RC7.6), in the
// app's settings style: titled boxes, plain fields with the default shown,
// advanced values folded away, each inherited value saying where it comes
// from, each mode one radio fold-out, and no model price anywhere. It edits
// the repository form inside the repository dialog; Save writes
// .avoozl.json like every other tab.
import { Input } from '@kirocrew/app-sdk/ui'
import { Fold } from './controls.tsx'
import { FieldBox } from './FieldBox.tsx'
import { RadioFold } from './RadioFold.tsx'
import { AVOOZL_LABELS, OLD_LABEL_NOTE, RADAR_DEFAULTS_SHOWN, rulesMode, valueSource, type RepositoryForm } from './settings-api.ts'

function Line(props: { id: string; label: string; value: string; fallback: string; raw: string; onChange: (value: string) => void; type?: string; unit?: string; help?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label} <span className="text-xs text-muted">{props.raw}</span>
      </label>
      {props.help && (
        <span id={`${props.id}-help`} className="text-xs text-muted">
          {props.help}
        </span>
      )}
      <Input id={props.id} type={props.type} value={props.value} placeholder={props.fallback} aria-describedby={`${props.id}-source${props.help ? ` ${props.id}-help` : ''}`} onChange={(event) => props.onChange(event.target.value)} />
      <span id={`${props.id}-source`} className="text-xs text-muted" data-source>
        {valueSource(props.value, props.fallback, props.unit)}
      </span>
    </div>
  )
}

// The value and setter for one of the six labels: ready lives in
// managedLabels, the rest in radar.
function labelValue(repository: RepositoryForm, key: (typeof AVOOZL_LABELS)[number]['key']): string {
  return key === 'ready' ? (repository.managedLabels.ready ?? '') : repository[key]
}
function labelChange(repository: RepositoryForm, key: (typeof AVOOZL_LABELS)[number]['key'], value: string): Partial<RepositoryForm> {
  return key === 'ready' ? { managedLabels: { ...repository.managedLabels, ready: value } } : { [key]: value }
}

export function CrewsRulesSettings(props: { id: string; repository: RepositoryForm; set: (change: Partial<RepositoryForm>) => void }) {
  const { id, repository, set } = props
  return (
    <div className="flex flex-col gap-4" data-crews-rules>
      <FieldBox title="Review rules" blurb="Text Set up adds to AGENTS.md in a pull request, so crews read it for every issue.">
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
      </FieldBox>
      <Fold title="Avoozl labels" id={`${id}-crews-advanced`}>
        <div className="flex flex-col gap-3" data-avoozl-labels>
          <p className="text-xs text-muted">Labels Avoozl reads or writes for its own work. Each must differ from the others and from Issue Radar's labels. {OLD_LABEL_NOTE}</p>
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
      </Fold>
    </div>
  )
}
