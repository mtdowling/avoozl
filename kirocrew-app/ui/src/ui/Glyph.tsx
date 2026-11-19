// An icon with Box's look props (its color, `css-flex-shrink`, a nudge down
// with `css-margin-top`) instead of a className or style from the view.
// `size` is the icon's size, not a text size.
import type { LucideIcon } from 'lucide-react'
import { lookProps, type LookProps } from './Box'

export function Glyph({
  icon: Icon,
  size,
  strokeWidth,
  ...props
}: { icon: LucideIcon; size?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false' } & Omit<LookProps, 'size'>) {
  return <Icon size={size} strokeWidth={strokeWidth} {...lookProps(props)} />
}
