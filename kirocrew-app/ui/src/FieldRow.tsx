// The one field row of every Settings page and settings dialog: the label
// with its "(required)" or "(optional)" marker, the control, one help line,
// one line for what a blank or unset value means, then the raw
// `.avoozl.json` key. The help and default lines are always shown (they work
// on touch, unlike a hover tooltip) and the control names them in
// aria-describedby (fieldDescribedBy). A width limits the control only, so a
// narrow number box never squeezes its label or help into a thin column.
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import type { FieldRule } from './settings-api.ts'

export const FIELD_WIDTH = { sm: '9rem', md: '18rem', lg: '28rem' } as const
export type FieldWidth = keyof typeof FIELD_WIDTH

// "(required)" or "(optional)" in plain muted text, with the condition a
// requirement holds under. Never red or bold: a missing value says so when
// you save, not before.
export function Marker({ rule }: { rule?: FieldRule }) {
  if (!rule) return null
  return rule.required ? (
    <span className="text-xs text-muted" data-marker="required">
      (required{rule.when ? ` ${rule.when}` : ''})
    </span>
  ) : (
    <span className="text-xs text-muted" data-marker="optional">
      (optional)
    </span>
  )
}

// A `.avoozl.json` key: small and muted, breaking only after a dot.
export function RawKey({ name }: { name: string }) {
  const parts = name.split('.')
  return (
    <Tooltip text=".avoozl.json key">
      <code className="text-[11px] text-muted" data-raw-key style={{ overflowWrap: 'break-word', opacity: 0.8 }}>
        {parts.map((part, at) => (
          <span key={at}>
            {at > 0 && (
              <>
                .<wbr />
              </>
            )}
            {part}
          </span>
        ))}
      </code>
    </Tooltip>
  )
}

// One muted help line, with the id a control names in aria-describedby.
export function FieldHelp({ id, children, kind = 'help' }: { id?: string; children: ReactNode; kind?: 'help' | 'default' }) {
  return (
    <span id={id} className="text-xs text-muted" data-field-help={kind === 'help' ? '' : undefined} data-field-default={kind === 'default' ? '' : undefined}>
      {children}
    </span>
  )
}

// The ids a field's control names in aria-describedby, or undefined.
export function fieldDescribedBy(id: string, parts: { help?: ReactNode; note?: ReactNode; rule?: FieldRule }): string | undefined {
  const ids = [parts.help ? `${id}-help` : null, parts.note || parts.rule?.blank ? `${id}-default` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function FieldRow(props: {
  id: string
  label: ReactNode
  raw?: string
  rule?: FieldRule
  // What the field does.
  help?: ReactNode
  // What a blank or unset value means; defaults to the rule's blank line.
  note?: ReactNode
  width?: FieldWidth | string
  // In a FieldGrid with `align`, rows join the grid's rows (subgrid), so the
  // labels, controls and lines of fields side by side start on one line.
  align?: boolean
  attrs?: Record<string, string | boolean>
  children: ReactNode
}) {
  const note = props.note ?? props.rule?.blank
  const control = <div style={{ display: 'flex', minWidth: 0, maxWidth: props.width ? (FIELD_WIDTH[props.width as FieldWidth] ?? props.width) : undefined, flexDirection: 'column' }}>{props.children}</div>
  const label = (
    <label htmlFor={props.id} className="flex flex-wrap items-baseline" style={{ columnGap: 8, rowGap: 2, alignContent: 'flex-start', alignSelf: 'start' }} data-field-label>
      <span className="font-medium">{props.label}</span>
      <Marker rule={props.rule} />
    </label>
  )
  const lines = (
    <span className="flex flex-col" style={{ gap: 2 }}>
      {props.help && <FieldHelp id={`${props.id}-help`}>{props.help}</FieldHelp>}
      {note && (
        <FieldHelp id={`${props.id}-default`} kind="default">
          {note}
        </FieldHelp>
      )}
    </span>
  )
  return (
    <div
      className="min-w-0 text-sm"
      data-field-row={props.id}
      {...props.attrs}
      style={props.align ? { display: 'grid', gridRow: 'span 4', gridTemplateRows: 'subgrid', rowGap: 4, alignContent: 'start' } : { display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {label}
      {control}
      {lines}
      {props.raw ? <RawKey name={props.raw} /> : props.align ? <span /> : null}
    </div>
  )
}

// A checkbox setting: the box, its label, then the help line and raw key
// under the label, in the same order and style as a FieldRow.
export function CheckRow(props: { id?: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; raw?: string; help?: ReactNode; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm" style={{ opacity: props.disabled ? 0.6 : 1 }} data-check-row={props.raw ?? ''}>
      <input id={props.id} type="checkbox" className="mt-1" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="flex min-w-0 flex-col" style={{ gap: 2 }}>
        <span>{props.label}</span>
        {props.help && <FieldHelp>{props.help}</FieldHelp>}
        {props.raw && <RawKey name={props.raw} />}
      </span>
    </label>
  )
}

// Fields on a grid: as many columns as fit, each at least `min`.
export function FieldGrid({ children, min = '13rem', align, group }: { children: ReactNode; min?: string; align?: boolean; group?: string }) {
  return (
    <div data-field-grid data-flow-group={group} style={{ display: 'grid', columnGap: 16, rowGap: align ? 4 : 12, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`, alignItems: 'start' }}>
      {children}
    </div>
  )
}
