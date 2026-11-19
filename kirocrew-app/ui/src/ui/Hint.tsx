// Muted text: a note, a label, a count, a column head. It is a Box in the
// theme's muted color, so it takes Box's props for weight and layout, and a
// `size`, but not a color or a font size of its own: every muted line on the
// page is a Hint, and a new look for hints is an edit here (D1). `flush`
// drops the browser's margin, `block` makes a span a block. The element is a
// span unless `as` names another.
import { forwardRef } from 'react'
import { Box, type BoxProps } from './Box'

// The named sizes are Kiro Crew's type scale, drawn as its classes. A size in
// pixels is drawn as an inline font size: Kiro Crew's text-[11px] classes set
// nothing else, and the page tests' stylesheet has none of them.
const PX = { '9': 9, '10': 10, '11': 11, '12': 12, '12.5': 12.5, '13': 13 } as const
type Named = 'xs' | 'sm' | 'base' | 'lg'

export type HintProps = Omit<BoxProps, 'tone' | 'css-color' | 'css-font-size' | 'size'> & {
  size?: Named | keyof typeof PX
  flush?: boolean
}

export const Hint = forwardRef<HTMLElement, HintProps>(function Hint({ as = 'span', flush, m0, size, ...rest }, ref) {
  const px = size && size in PX ? PX[size as keyof typeof PX] : undefined
  return <Box ref={ref} as={as} m0={flush || m0} tone="muted" size={px ? undefined : (size as Named | undefined)} css-font-size={px} {...rest} />
})
