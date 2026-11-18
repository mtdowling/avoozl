import { Tooltip } from './ui/Tooltip.tsx'
import { SelectField } from './ui/SelectField'

// One labelled filter dropdown with an "All" choice, shared by the Graph and
// Delivery filters so both look and behave the same.
export const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

// The label column of an inline filter: wide enough for a one-word label.
export const INLINE_LABEL = '4rem'

export function FilterSelect(props: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  // Shown greyed out, with why in a tooltip. The why is not printed under
  // the field, so the row of filters stays lined up.
  disabled?: boolean
  hint?: string
  // The label and its dropdown on one line, the label in a fixed column, so
  // a stack of these lines up both (the left nav's filters).
  inline?: boolean
}) {
  const select = (describedBy?: string) => (
    <SelectField
      id={props.id}
      value={props.value}
      disabled={props.disabled}
      aria-describedby={describedBy}
      onChange={(event) => props.onChange(event.target.value)} look="field" fill={props.inline} dim={props.disabled}
      // A disabled control takes no pointer events, so the tooltip's anchor
      // around it still hears the hover.
      {...(props.inline ? { 'data-filter-select': '' } : {})}
    >
      <option value="">All</option>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  )
  if (props.inline)
    return (
      <label htmlFor={props.id} data-filter-line className="min-w-0 text-sm" style={{ display: 'grid', gridTemplateColumns: `${INLINE_LABEL} minmax(0, 1fr)`, alignItems: 'center', columnGap: 8 }}>
        <span data-filter-label style={{ overflowWrap: 'anywhere' }}>{props.label}</span>
        {props.hint ? <Tooltip text={props.hint} display="block">{(describedBy) => select(describedBy)}</Tooltip> : select()}
      </label>
    )
  return (
    <label htmlFor={props.id} className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: '13rem' }}>
      <span>{props.label}</span>
      {props.hint ? <Tooltip text={props.hint} display="block">{(describedBy) => select(describedBy)}</Tooltip> : select()}
    </label>
  )
}
