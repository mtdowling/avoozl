// The one footer of a Settings page that edits in place: it appears only
// when something changed (or a save just failed or finished), sticks to the
// bottom of the page's scroll area, and holds Save and Discard. Each page
// owns its own values; this only draws the bar.
import { Btn } from '@kirocrew/app-sdk/ui'
import { LAYER } from './layers.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'

const SURFACE = 'var(--bg-accent, var(--bg-elevated))'

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
    <div
      data-save-footer
      role="group"
      aria-label="Save changes"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: LAYER.raised,
        padding: '10px 0',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        background: SURFACE,
        borderTop: '1px solid var(--border)',
      }}
    >
      <span className="text-xs text-muted" style={{ marginRight: 'auto' }}>
        {props.dirty ? 'Unsaved changes. ' : ''}
        {props.note ?? ''}
      </span>
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
        <span className="flex gap-2" style={{ flexShrink: 0 }}>
          <Btn type="button" disabled={props.saving} onClick={props.onDiscard} data-discard>
            Discard
          </Btn>
          <Btn type="button" primary disabled={props.saving || Boolean(props.problem)} onClick={props.onSave} data-save>
            {props.saving ? 'Saving…' : 'Save'}
          </Btn>
        </span>
      )}
    </div>
  )
}
