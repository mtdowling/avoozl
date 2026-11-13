import { Btn } from '@kirocrew/app-sdk/ui'
import { TipBtn } from './controls.tsx'
import Badge from './Badge.tsx'

// Shows which plan a view is filtered to, with a way back to every task.
export function PlanChip({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <Badge variant="info">Plan: {label}</Badge>
      {onClear && <TipBtn tooltip="Remove the plan filter" onClick={onClear}>Show all plans</TipBtn>}
    </span>
  )
}
