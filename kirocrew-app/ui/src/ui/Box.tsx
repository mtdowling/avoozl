// The page's one layout and text element. A view writes what an element is
// (`as`) and what varies on it as props from the fixed tables in box.json:
// `flags` and `scales` become Kiro Crew's classes (`flexCol`, `gap="2"`,
// `size="xs"`), and `styles` become the one inline style the element needs
// (`css-overflow-wrap="anywhere"`, `css-border-color="border"`), each value
// named in the table, so class names, CSS values and theme variables are
// written here and nowhere else (UC2.3). It takes no `className` or `style`.
// A value is added to box.json in the change that needs it; a class must be
// in Kiro Crew's stylesheet (ui-box.test.mjs holds that).
import { createElement, forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, type TdHTMLAttributes } from 'react'
import table from './box.json'

type Flags = keyof typeof table.flags
type Scales = { [K in keyof typeof table.scales]: keyof (typeof table.scales)[K] }
type Free = (typeof table.free)[number]
type Styles = { [K in keyof typeof table.styles as `css-${K}`]?: K extends Free ? keyof (typeof table.styles)[K] | number | (string & {}) : keyof (typeof table.styles)[K] } & {
  [K in Free as K extends keyof typeof table.styles ? never : `css-${K}`]?: number | string
}

export type BoxTag =
  | 'div' | 'span' | 'p' | 'ul' | 'ol' | 'li' | 'section' | 'header' | 'footer' | 'nav' | 'article' | 'aside' | 'main' | 'figure'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'dl' | 'dt' | 'dd' | 'code' | 'pre' | 'strong' | 'em' | 'small' | 'label'
  | 'table' | 'thead' | 'tbody' | 'tr' | 'td' | 'th' | 'details' | 'summary' | 'fieldset' | 'legend'

export type BoxProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> &
  Pick<TdHTMLAttributes<HTMLElement>, 'colSpan' | 'rowSpan' | 'scope'> & { htmlFor?: string; open?: boolean; children?: ReactNode; as?: BoxTag } & { [K in Flags]?: boolean } & { [K in keyof Scales]?: Scales[K] } & Styles

const FLAGS = table.flags as Record<string, string>
const SCALES = table.scales as Record<string, Record<string, string>>
const STYLES = table.styles as Record<string, Record<string, string | number>>
// Geometry a view computes from data (a bar's width, a row's indent, a
// layer's z-index), and a color it reads from a tone map in src/ui/, is passed
// as the value itself; every other style value is named in the table. A view
// can't write a theme variable itself: raw-style.test.mjs counts them.
const FREE = new Set<string>(table.free)
const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

// Splits look props from the element's own: the look becomes className and
// style, the rest pass through. Shared by Box and the Plain* parts.
export function lookProps<T extends object>(props: T): Record<string, unknown> {
  const classes: string[] = []
  const style: Record<string, string | number> = {}
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key in FLAGS) {
      if (value) classes.push(FLAGS[key])
    } else if (key in SCALES) {
      const cls = SCALES[key][String(value)]
      if (cls) classes.push(cls)
    } else if (key.startsWith('css-') && (key.slice(4) in STYLES || FREE.has(key.slice(4)))) {
      const name = key.slice(4)
      const css = STYLES[name]?.[String(value)] ?? (FREE.has(name) && (typeof value === 'number' || typeof value === 'string') ? value : undefined)
      if (css !== undefined) style[camel(name)] = css
    } else rest[key] = value
  }
  if (classes.length) rest.className = classes.join(' ')
  if (Object.keys(style).length) rest.style = style as CSSProperties
  return rest
}

export type LookProps = { [K in Flags]?: boolean } & { [K in keyof Scales]?: Scales[K] } & Styles

export const Box = forwardRef<HTMLElement, BoxProps>(function Box({ as = 'div', ...props }, ref) {
  return createElement(as, { ...lookProps(props), ref: ref as Ref<HTMLElement> })
})
