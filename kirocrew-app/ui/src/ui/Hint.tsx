// Muted text: a note, a label, a count. `size` is the type size (`xs`, `sm`, or
// the surrounding size), `flush` drops the browser's margin, `block` makes a
// span a block. The element is a span unless `as` names another.
import type { ComponentProps, ElementType } from 'react'

type HintTag = 'span' | 'p' | 'div' | 'dt' | 'dd' | 'li' | 'small'

export type HintProps = Omit<ComponentProps<'span'>, 'className' | 'style' | 'ref'> & {
  as?: HintTag
  size?: 'xs' | 'sm'
  flush?: boolean
  block?: boolean
}

export function hintClass({ size, flush, block }: Pick<HintProps, 'size' | 'flush' | 'block'>) {
  return [block && 'block', flush && 'm-0', size && `text-${size}`, 'text-muted'].filter(Boolean).join(' ')
}

export function Hint({ as, size, flush, block, ...rest }: HintProps) {
  const Tag: ElementType = as ?? 'span'
  return <Tag className={hintClass({ size, flush, block })} {...rest} />
}
