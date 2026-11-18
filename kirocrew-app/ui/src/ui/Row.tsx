// A row of items with a gap from the page's scale. It wraps unless `wrap` is
// false. `align` is where the items sit across the row: `center` (the
// default), `start` or `end`. The element is a div unless `as` names one.
import type { ComponentProps, ElementType } from 'react'
import { GAP, type Gap } from './Stack'

export type RowProps = Omit<ComponentProps<'div'>, 'className' | 'style' | 'ref'> & {
  as?: 'div' | 'section' | 'ul' | 'ol' | 'header' | 'footer' | 'span'
  gap?: Gap
  wrap?: boolean
  align?: 'center' | 'start' | 'end'
}

const ALIGN = { center: 'items-center', start: '', end: 'items-end' } as const

export function Row({ as = 'div', gap = 0, wrap = true, align = 'center', ...rest }: RowProps) {
  const Tag = as as ElementType
  return <Tag className={['flex', wrap && 'flex-wrap', ALIGN[align], GAP[gap]].filter(Boolean).join(' ')} {...rest} />
}
