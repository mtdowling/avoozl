import { Tooltip } from './Tooltip.tsx'

// One labelled filter dropdown with an "All" choice, shared by the Graph and
// Delivery filters so both look and behave the same.
export const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

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
}) {
  const select = (describedBy?: string) => (
    <select
      id={props.id}
      value={props.value}
      disabled={props.disabled}
      aria-describedby={describedBy}
      onChange={(event) => props.onChange(event.target.value)}
      className="rounded border px-2 py-1 text-sm"
      // A disabled control takes no pointer events, so the tooltip's anchor
      // around it still hears the hover.
      style={{ ...selectStyle, ...(props.disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : {}) }}
    >
      <option value="">All</option>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
  return (
    <label htmlFor={props.id} className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: '13rem' }}>
      <span>{props.label}</span>
      {props.hint ? <Tooltip text={props.hint} display="block">{(describedBy) => select(describedBy)}</Tooltip> : select()}
    </label>
  )
}
