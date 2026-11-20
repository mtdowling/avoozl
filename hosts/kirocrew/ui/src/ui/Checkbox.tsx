// A native checkbox. Kiro Crew's `Toggle` is a switch (a div with role
// "switch") with no label element, id or form value, and the page's
// checkboxes sit inside labels, select rows and confirm lines, so the page
// keeps a native checkbox here (UC1.3) and draws it in one place. `drop` is
// how far, in pixels, it sits below its line's top so it lines up with the
// first line of wrapped text. A ref reaches the input (a select-all box sets
// `indeterminate` through it).
import { forwardRef, type ComponentProps } from 'react'

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type' | 'className' | 'style' | 'ref'> & { drop?: 2 | 3 | 4 }

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ drop, ...rest }, ref) {
  return <input ref={ref} type="checkbox" style={drop ? { marginTop: drop } : undefined} {...rest} />
})
