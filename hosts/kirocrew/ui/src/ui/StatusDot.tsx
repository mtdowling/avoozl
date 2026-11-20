// A small round state dot: filled in its color, or `hollow` (a ring in it).
// `size` is its width in px; `top` nudges it down to a first line of text and
// keeps it from shrinking.
export function StatusDot(props: { color: string; hollow?: boolean; size?: 7 | 8; top?: boolean }) {
  const size = props.size ?? 8
  return (
    <span
      aria-hidden="true"
      className={props.top ? 'mt-1.5 inline-block flex-none rounded-full' : 'inline-block rounded-full'}
      style={{ width: size, height: size, ...(props.hollow ? { border: `1.5px solid ${props.color}` } : { background: props.color }) }}
    />
  )
}
