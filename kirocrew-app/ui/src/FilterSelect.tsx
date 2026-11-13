// One labelled filter dropdown with an "All" choice, shared by the Graph and
// Delivery filters so both look and behave the same.
export const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

export function FilterSelect(props: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <label htmlFor={props.id} className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: '13rem' }}>
      <span>{props.label}</span>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded border px-2 py-1 text-sm"
        style={selectStyle}
      >
        <option value="">All</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
