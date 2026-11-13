import { Btn } from '@kirocrew/app-sdk/ui'
import { TipBtn } from './controls.tsx'
import Badge from './Badge.tsx'

// Shows which plan a view is filtered to, with a way back to every task.
export function PlanChip({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <Badge variant="info">Spec: {label}</Badge>
      {onClear && <TipBtn tooltip="Remove the spec filter" onClick={onClear}>Show all specs</TipBtn>}
    </span>
  )
}
