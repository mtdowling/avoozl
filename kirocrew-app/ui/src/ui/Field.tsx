// The one field row of every Settings page and settings dialog: the label
// with its "(required)" or "(optional)" marker, the control, one help line,
// one line for what a blank or unset value means, then the raw
// `.avoozl.json` key. The help and default lines are always shown (they work
// on touch, unlike a hover tooltip) and the control names them in
// aria-describedby (fieldDescribedBy). A width limits the control only, so a
// narrow number box never squeezes its label or help into a thin column.
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import type { FieldRule } from '../settings-api.ts'
import { Hint } from './Hint'
import { Switch } from './Switch'
import { Box, type LookProps } from './Box'
import { PlainButton } from './Plain'

export const FIELD_WIDTH = { sm: '9rem', md: '18rem', lg: '28rem' } as const
export type FieldWidth = keyof typeof FIELD_WIDTH

// "(required)" or "(optional)" in plain muted text, with the condition a
// requirement holds under. Never red or bold: a missing value says so when
// you save, not before.
export function Marker({ rule }: { rule?: FieldRule }) {
  if (!rule) return null
  return rule.required ? (
    <Hint size="xs" data-marker="required">
      (required{rule.when ? ` ${rule.when}` : ''})
    </Hint>
  ) : (
    <Hint size="xs" data-marker="optional">
      (optional)
    </Hint>
  )
}

// A `.avoozl.json` key: small and muted, breaking only after a dot.
export function RawKey({ name }: { name: string }) {
  const parts = name.split('.')
  return (
    <Tooltip text=".avoozl.json key">
      <Box as="code" css-overflow-wrap="break-word" css-opacity="0.8" size="11" tone="muted" data-raw-key>
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
      </Box>
    </Tooltip>
  )
}

// One muted help line, with the id a control names in aria-describedby.
export function FieldHelp({ id, children, kind = 'help' }: { id?: string; children: ReactNode; kind?: 'help' | 'default' }) {
  return (
    <Hint id={id} size="xs" data-field-help={kind === 'help' ? '' : undefined} data-field-default={kind === 'default' ? '' : undefined}>
      {children}
    </Hint>
  )
}

// The ids a field's control names in aria-describedby, or undefined.
export function fieldDescribedBy(id: string, parts: { help?: ReactNode; note?: ReactNode; rule?: FieldRule }): string | undefined {
  const ids = [parts.help ? `${id}-help` : null, parts.note || parts.rule?.blank ? `${id}-default` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

// A field row on its own (stacked) or lined up with its neighbors in a
// FieldGrid's subgrid rows (aligned).
const STACKED = { 'css-display': 'flex', 'css-flex-direction': 'column', 'css-gap': 4 } as const satisfies LookProps
const ALIGNED = {
  'css-display': 'grid',
  'css-grid-row': 'span 4',
  'css-grid-template-rows': 'subgrid',
  'css-row-gap': 4,
  'css-align-content': 'start',
} as const satisfies LookProps

export function Field(props: {
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
  // Set when the value differs from the default: shows a small button that
  // puts the default back. `defaultText` names it, for example "5".
  onReset?: () => void
  defaultText?: string
  children: ReactNode
}) {
  const note = props.note ?? props.rule?.blank
  const control = (
    <Box css-display="flex" css-min-width="0" css-max-width={props.width ? (FIELD_WIDTH[props.width as FieldWidth] ?? props.width) : undefined} css-flex-direction="column">
      {props.children}
    </Box>
  )
  const label = (
    <Box htmlFor={props.id} as="label" css-column-gap="8" css-row-gap="2" css-align-content="flex-start" css-align-self="start" flex flexWrap items="baseline" data-field-label>
      <Box as="span" weight="medium">
        {props.label}
      </Box>
      <Marker rule={props.rule} />
    </Box>
  )
  const lines = (
    <Box as="span" css-gap="2" flex flexCol>
      {props.help && <FieldHelp id={`${props.id}-help`}>{props.help}</FieldHelp>}
      {note && (
        <FieldHelp id={`${props.id}-default`} kind="default">
          {note}
        </FieldHelp>
      )}
    </Box>
  )
  return (
    <Box minW0 size="sm" data-field-row={props.id} {...props.attrs} {...(props.align ? ALIGNED : STACKED)}>
      {label}
      {control}
      {lines}
      {props.onReset && (
        <PlainButton type="button" css-color="accent" self="start" size="xs" underline onClick={props.onReset} data-field-reset={props.id}>
          Reset to default{props.defaultText ? ` (${props.defaultText})` : ''}
        </PlainButton>
      )}
      {props.raw ? <RawKey name={props.raw} /> : props.align ? <span /> : null}
    </Box>
  )
}

// A checkbox setting: the box, its label, then the help line and raw key
// under the label, in the same order and style as a Field.
export function CheckRow(props: { id?: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; raw?: string; help?: ReactNode; disabled?: boolean }) {
  return (
    <Switch
      id={props.id}
      label={typeof props.label === 'string' ? props.label : 'Option'}
      align="start"
      size="sm"
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
      data-check-row={props.raw ?? ''}
    >
      <Box as="span" css-gap="2" flex minW0 flexCol>
        <span>{props.label}</span>
        {props.help && <FieldHelp>{props.help}</FieldHelp>}
        {props.raw && <RawKey name={props.raw} />}
      </Box>
    </Switch>
  )
}

// Fields on a grid: as many columns as fit, each at least `min`.
export function FieldGrid({ children, min = '13rem', align, group }: { children: ReactNode; min?: string; align?: boolean; group?: string }) {
  return (
    <Box
      data-field-grid
      data-flow-group={group}
      css-display="grid"
      css-column-gap="16"
      css-row-gap={align ? '4' : '12'}
      css-grid-template-columns={`repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`}
      css-align-items="start"
    >
      {children}
    </Box>
  )
}
