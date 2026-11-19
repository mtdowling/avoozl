// The one footer of a Settings page that edits in place: it appears only
// when something changed (or a save just failed or finished), sticks to the
// bottom of the page's scroll area, and holds Save and Discard. Each page
// owns its own values; this only draws the bar.
import { Btn } from './ui/Btn'
import { LAYER } from './layers.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'


export function SaveFooter(props: {
  dirty: boolean
  saving?: boolean
  // Why Save cannot run yet, shown beside the buttons; it also turns Save off.
  problem?: string | null
  // A failed save, or a note after a good one.
  error?: string | null
  ok?: string | null
  note?: string
  onSave: () => void
  onDiscard: () => void
}) {
  if (!props.dirty && !props.error && !props.ok) return null
  return (
    <Box
      data-save-footer
      role="group"
      aria-label="Save changes"
      css-position="sticky" css-bottom="0" css-z-index={LAYER.raised} css-padding="10px-0" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-justify-content="flex-end" css-gap="12" css-background="bg-accent-bg-elevated" css-border-top="1px-solid-border"
    >
      <Box as="span" css-margin-right="auto" size="xs" tone="muted">
        {props.dirty ? 'Unsaved changes. ' : ''}
        {props.note ?? ''}
      </Box>
      {props.problem && props.dirty && (
        <ErrorText role="alert" as="span" size="sm" data-save-problem>
          {props.problem}
        </ErrorText>
      )}
      {props.error && (
        <ErrorText role="alert" as="span" size="sm" data-save-error>
          {props.error}
        </ErrorText>
      )}
      {props.ok && !props.dirty && (
        <Hint role="status" size="sm" data-save-ok>
          {props.ok}
        </Hint>
      )}
      {props.dirty && (
        <Box as="span" css-flex-shrink="0" flex gap="2">
          <Btn type="button" disabled={props.saving} onClick={props.onDiscard} data-discard>
            Discard
          </Btn>
          <Btn type="button" primary disabled={props.saving || Boolean(props.problem)} onClick={props.onSave} data-save>
            {props.saving ? 'Saving…' : 'Save'}
          </Btn>
        </Box>
      )}
    </Box>
  )
}
