// The page's one layout and text element. A view writes what an element is
// (`as`) and what varies on it (a gap, a size, a tone) as props from the
// fixed scales in box.json; Box turns them into Kiro Crew's classes, so the
// class names are written here and nowhere else (UC2.3). It takes no
// `className` or `style`. A prop is added to box.json in the change that
// needs it, after checking Kiro Crew's stylesheet has the class (the test in
// ui-box.test.mjs holds that).
import { createElement, forwardRef, type HTMLAttributes, type ReactNode, type Ref, type TdHTMLAttributes } from 'react'
import table from './box.json'

type Flags = keyof typeof table.flags
type Scales = { [K in keyof typeof table.scales]: keyof (typeof table.scales)[K] }

export type BoxTag =
  | 'div' | 'span' | 'p' | 'ul' | 'ol' | 'li' | 'section' | 'header' | 'footer' | 'nav' | 'article' | 'aside' | 'main' | 'figure'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'dl' | 'dt' | 'dd' | 'code' | 'pre' | 'strong' | 'em' | 'small' | 'label'
  | 'table' | 'thead' | 'tbody' | 'tr' | 'td' | 'th' | 'details' | 'summary' | 'fieldset' | 'legend'

export type BoxProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> &
  Pick<TdHTMLAttributes<HTMLElement>, 'colSpan' | 'rowSpan' | 'scope'> & { htmlFor?: string; open?: boolean; children?: ReactNode; as?: BoxTag } & { [K in Flags]?: boolean } & { [K in keyof Scales]?: Scales[K] }

const FLAGS = table.flags as Record<string, string>
const SCALES = table.scales as Record<string, Record<string, string>>

export const Box = forwardRef<HTMLElement, BoxProps>(function Box({ as = 'div', ...props }, ref) {
  const classes: string[] = []
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key in FLAGS) {
      if (value) classes.push(FLAGS[key])
    } else if (key in SCALES) {
      const cls = SCALES[key][String(value)]
      if (cls) classes.push(cls)
    } else rest[key] = value
  }
  return createElement(as, { ...rest, className: classes.join(' ') || undefined, ref: ref as Ref<HTMLElement> })
})
