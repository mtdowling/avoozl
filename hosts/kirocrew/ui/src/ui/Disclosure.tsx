// The one look for anything on the page that opens and shuts: a native
// <summary> or a button with aria-expanded carries DISCLOSURE and starts
// with a DisclosureMark. The mark is a chevron that points right when shut
// and down when open (the open state comes from details[open] or
// aria-expanded, so callers pass no state). The toggle gets a pointer, a
// hover tint on its mark and a focus ring; theme variables only; no turn
// under prefers-reduced-motion. DisclosureStyle renders the rules once per
// page root.
import { ChevronRight } from '../icons.ts'

export const DISCLOSURE = { 'data-disclosure': '' } as const

export const CSS_DisclosureStyle = `[data-disclosure]{cursor:pointer;list-style:none;border-radius:4px}
summary[data-disclosure]::-webkit-details-marker{display:none}
summary[data-disclosure]::marker{content:''}
[data-disclosure-mark]{display:inline-flex;flex:none;align-items:center;color:var(--muted);transition:transform .12s,color .12s}
[aria-expanded=true] [data-disclosure-mark],details[open]>summary [data-disclosure-mark]{transform:rotate(90deg)}
[data-disclosure]:hover [data-disclosure-mark],[data-disclosure]:focus-visible [data-disclosure-mark]{color:var(--accent)}
[data-disclosure]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){[data-disclosure-mark]{transition:none}}`

export function DisclosureStyle() {
  return <style>{CSS_DisclosureStyle}</style>
}

export function DisclosureMark(props: { size?: number }) {
  return (
    <span data-disclosure-mark aria-hidden="true">
      <ChevronRight size={props.size ?? 14} />
    </span>
  )
}
