// A spec pull request as a Decisions item (Requirement 107.5): the same box
// the spec's Overview shows, and the one Approve dialog every spec uses.
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { ApproveSpecDialog } from './PlansView.tsx'
import { SpecPullBox } from './SpecPullBox.tsx'
import { plansClient, type SpecPlan } from './plans-api.ts'
import type { SpecPull } from './spec-pr-api.ts'
import { errorMessage } from './workspace-api.ts'
import { ErrorText } from './ui/ErrorText'

export function SpecPullDecision(props: { pull: SpecPull; workspaceId: string; onChanged: () => void }) {
  const { pull, workspaceId } = props
  const api = useAppApi()
  const plans = useMemo(() => plansClient(api), [api])
  const [plan, setPlan] = useState<SpecPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setError(null)
    try {
      setPlan(await plans.get(workspaceId, pull.planId))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <>
      <SpecPullBox pull={pull} workspaceId={workspaceId} onApprove={() => void open()} onChanged={props.onChanged} />
      {error && (
        <ErrorText role="alert" flush>
          {error}
        </ErrorText>
      )}
      {plan && (
        <ApproveSpecDialog
          workspaceId={workspaceId}
          plan={plan}
          client={plans}
          onDone={() => {
            setPlan(null)
            props.onChanged()
          }}
        />
      )}
    </>
  )
}
