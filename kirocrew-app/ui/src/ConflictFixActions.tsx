// The two choices on a source conflict Avoozl could not fix, or was told to
// ask about (RC28.3): Resolve myself and Dismiss. Each calls
// `conflictfix.decide`; the page holds no logic of its own.
import { Check, X } from './icons.ts'
import { DangerBtn, IconLabel } from './ui/controls.tsx'
import type { ConflictItem } from './views-api.ts'
import { Row } from './ui/Row'

type Fix = NonNullable<ConflictItem['conflictFix']>
type Action = Fix['actions'][number]

const DONE: Record<Action, string> = {
  resolve: 'Left to you. Avoozl does nothing more until the pull request changes.',
  dismiss: 'Dismissed until the pull request changes.',
}

export function ConflictFixActions(props: { fix: Fix; busy: boolean; onDecide: (action: Action, text: string) => void }) {
  const { fix, busy } = props
  return (
    <Row gap={2} data-conflict-fix-actions>
      {fix.actions.includes('resolve') && (
        <IconLabel
          icon={Check}
          tooltip="You fix the conflict on the branch yourself. Avoozl stops watching this conflict."
          disabled={busy}
          onClick={() => props.onDecide('resolve', DONE.resolve)}
        >
          Resolve myself
        </IconLabel>
      )}
      {fix.actions.includes('dismiss') && (
        <DangerBtn
          icon={X}
          tooltip="Hide this row until the pull request changes"
          disabled={busy}
          confirm={{ title: `Dismiss the conflict on #${fix.pullRequest}?`, body: 'Avoozl stops asking about this conflict until the pull request changes.', action: 'Dismiss' }}
          onConfirm={() => props.onDecide('dismiss', DONE.dismiss)}
        >
          Dismiss
        </DangerBtn>
      )}
    </Row>
  )
}
