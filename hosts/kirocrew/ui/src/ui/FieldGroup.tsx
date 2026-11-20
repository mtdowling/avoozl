// One group of fields in a form or modal: a heading, then its fields, with
// no box around it. Every group after the first among its siblings starts
// with a top border in the theme's border color and padding under it, so the
// first group has no line. Used by every modal or form that groups fields:
// repository View and Edit, workspace Edit and the Add plugin review. A
// group inside a group takes level 4.
import type { ReactNode } from 'react'
import { SectionHeading } from './controls.tsx'
import { Box } from './Box'
import { Hint } from './Hint'
import { FormSectionStyle } from './PageStyles'

// `boxed` draws the group as a titled, bordered box instead: a native
// fieldset whose legend is the title, so a screen reader names the group.
export function FieldGroup(props: { title: ReactNode; blurb?: ReactNode; meta?: ReactNode; actions?: ReactNode; level?: 3 | 4; boxed?: boolean; children?: ReactNode }) {
  if (props.boxed)
    return (
      <Box
        data-field-box={typeof props.title === 'string' ? props.title : ''}
        as="fieldset"
        css-border="1px-solid-border"
        css-padding="8px-12px-12px"
        css-margin="0"
        flex
        minW0
        flexCol
        gap="2"
        rounded="lg"
      >
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
  return (
    <Box data-form-section={typeof props.title === 'string' ? props.title : ''} as="section" flex minW0 flexCol gap="2.5">
      <FormSectionStyle />
      <SectionHeading level={props.level ?? 3} title={props.title} blurb={props.blurb} meta={props.meta} actions={props.actions} />
      {props.children}
    </Box>
  )
}
