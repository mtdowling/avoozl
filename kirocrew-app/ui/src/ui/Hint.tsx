// Muted text: a note, a label, a count, a column head. It is a Box in the
// theme's muted color, so it takes Box's props for size, weight and layout,
// but not a color of its own: every muted line on the page is a Hint, and a
// new look for hints is an edit here (D1). `flush` drops the browser's margin,
// `block` makes a span a block. The element is a span unless `as` names
// another.
import { forwardRef } from 'react'
import { Box, type BoxProps } from './Box'

export type HintProps = Omit<BoxProps, 'tone' | 'css-color'> & {
  flush?: boolean
}

export const Hint = forwardRef<HTMLElement, HintProps>(function Hint({ as = 'span', flush, m0, ...rest }, ref) {
  return <Box ref={ref} as={as} m0={flush || m0} tone="muted" {...rest} />
})
