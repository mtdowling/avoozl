// A titled, bordered box of related fields: a native fieldset whose legend
// is the title, so a screen reader names the group. Used by Settings ›
// Providers.
import type { ReactNode } from 'react'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'

export function FieldBox(props: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <Box data-field-box={props.title} as="fieldset" css-border="1px-solid-border" css-padding="8px-12px-12px" css-margin="0" flex minW0 flexCol gap="2" rounded="lg">
      <Box as="legend" css-padding="0-4px" size="sm" weight="semibold">
        {props.title}
      </Box>
      {props.blurb && (
        <Hint as="p" size="xs">
          {props.blurb}
        </Hint>
      )}
      {props.children}
    </Box>
  )
}
