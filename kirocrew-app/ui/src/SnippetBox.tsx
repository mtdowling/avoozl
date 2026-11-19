// A collapsible snippet: a header with a disclosure arrow and a title that
// both show and hide the body (one button, aria-expanded), and an optional
// action floated to the right of the header. The one shape for any snippet
// a page folds, so none has its own arrow or header.
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from './icons.ts'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'
import { TONE } from './ui/tones.ts'
import { Glyph } from './ui/Glyph'

export function SnippetBox(props: {
  title: ReactNode
  // Right side of the header: a button or link; it does not toggle.
  action?: ReactNode
  // Open at first (default shut).
  open?: boolean
  onToggle?: (open: boolean) => void
  attr?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(props.open ?? false)
  const body = useId()
  const Chevron = open ? ChevronDown : ChevronRight
  const toggle = () => {
    setOpen(!open)
    props.onToggle?.(!open)
  }
  return (
    <Box css-border-color="border" rounded="base" border="all" size="xs" data-snippet data-open={open ? 'true' : 'false'} {...(props.attr ? { [props.attr]: '' } : {})}>
      <Box flex flexWrap items="center" gap="2" px="2" py="1">
        <PlainButton
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={toggle}
          data-snippet-toggle
          css-background="none"
          css-border="0"
          css-padding="0"
          css-color="inherit"
          css-font="inherit"
          css-cursor="pointer"
          css-overflow-wrap="anywhere"
          flex
          minW0
          flex1
          items="center"
          gap="1.5"
          align="left"
        >
          <Glyph icon={Chevron} size={13} aria-hidden="true" shrink0 />
          <Box as="span" minW0>
            {props.title}
          </Box>
        </PlainButton>
        {props.action && (
          <Box as="span" ml="auto" flexNone>
            {props.action}
          </Box>
        )}
      </Box>
      <div id={body} hidden={!open}>
        {open && props.children}
      </div>
    </Box>
  )
}
