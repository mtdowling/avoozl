// An error line in the theme's danger color. `size` is `sm` (the default for a
// paragraph) or `xs`; the element is a paragraph unless `as` names a span.
import type { ComponentProps, ElementType } from 'react'

export type ErrorTextProps = Omit<ComponentProps<'p'>, 'className' | 'style' | 'ref'> & {
  as?: 'p' | 'span' | 'div'
  size?: 'xs' | 'sm'
  flush?: boolean
}

export function ErrorText({ as = 'p', size, flush, ...rest }: ErrorTextProps) {
  const Tag = as as ElementType
  return <Tag className={[flush && 'm-0', size && `text-${size}`, 'text-danger'].filter(Boolean).join(' ')} {...rest} />
}
