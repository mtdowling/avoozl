// One group of fields in a form or modal: a heading, then its fields, with
// no box around it. Every group after the first among its siblings starts
// with a top border in the theme's border color and padding under it, so the
// first group has no line. Used by every modal or form that groups fields:
// repository View and Edit, workspace Edit and the Add plugin review. A
// group inside a group takes level 4.
import type { ReactNode } from 'react'
import { SectionHeading } from './ui/controls.tsx'
import { Box } from './ui/Box'
import { FormSectionStyle } from './ui/PageStyles'

export function FormSection(props: { title: ReactNode; blurb?: ReactNode; meta?: ReactNode; actions?: ReactNode; level?: 3 | 4; children?: ReactNode }) {
  return (
    <Box data-form-section={typeof props.title === 'string' ? props.title : ''} as="section" flex minW0 flexCol gap="2.5">
      <FormSectionStyle />
      <SectionHeading level={props.level ?? 3} title={props.title} blurb={props.blurb} meta={props.meta} actions={props.actions} />
      {props.children}
    </Box>
  )
}
