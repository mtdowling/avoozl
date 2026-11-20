// A vertical stack with a gap from the page's scale: 0 to 4 steps of Kiro
// Crew's spacing (0.25 rem each). The element is a div unless `as` names one.
import type { ComponentProps, ElementType } from 'react'

export type Gap = 0 | 1 | 2 | 3 | 4

// Whole class names, so the stylesheet scan and Kiro Crew's own stylesheet both see them.
export const GAP: Record<Gap, string> = { 0: '', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4' }

export type StackProps = Omit<ComponentProps<'div'>, 'className' | 'style' | 'ref'> & {
  as?: 'div' | 'section' | 'ul' | 'ol' | 'li' | 'header' | 'footer' | 'form' | 'span'
  gap?: Gap
}

export function Stack({ as = 'div', gap = 0, ...rest }: StackProps) {
  const Tag = as as ElementType
  return <Tag className={['flex flex-col', GAP[gap]].filter(Boolean).join(' ')} {...rest} />
}
