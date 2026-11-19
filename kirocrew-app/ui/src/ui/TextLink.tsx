// A link drawn as underlined text. It takes the anchor's own props, but no
// `className` or `style`.
import type { ComponentProps } from 'react'

export type TextLinkProps = Omit<ComponentProps<'a'>, 'className' | 'style' | 'ref'>

export function TextLink(props: TextLinkProps) {
  return <a className="underline" {...props} />
}
