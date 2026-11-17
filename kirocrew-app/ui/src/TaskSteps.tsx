// The task's steps in its Timeline box (Requirement 106, design 4.35): from
// the task's stored records, drawn as a dotted list with each step's time and
// the wait since the step before. This file only draws what task.detail gives.
import { afterPrevious, clock, type TaskStep } from './task-api.ts'
import { buildMedian } from './radar-flow-api.ts'

const DOT: Record<TaskStep['state'], { border: string; background: string }> = {
  done: { border: 'var(--ok)', background: 'var(--ok)' },
  now: { border: 'var(--accent)', background: 'var(--accent)' },
  later: { border: 'var(--border)', background: 'transparent' },
  skipped: { border: 'var(--border)', background: 'transparent' },
}

function Step({ steps, index }: { steps: TaskStep[]; index: number }) {
  const step = steps[index],
    wait = afterPrevious(steps, index),
    dot = step.failed ? { border: 'var(--danger)', background: 'var(--danger)' } : DOT[step.state]
  return (
    <li data-task-step={step.key} data-state={step.state} className="flex gap-3 pb-3">
      <span
        aria-hidden="true"
        style={{ flex: '0 0 12px', height: 12, marginTop: 4, borderRadius: 6, border: `2px ${step.state === 'skipped' ? 'dashed' : 'solid'} ${dot.border}`, background: dot.background }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium" style={step.state === 'later' || step.state === 'skipped' ? { color: 'var(--muted)' } : step.failed ? { color: 'var(--danger)' } : undefined}>
            {step.label}
          </span>
          <span data-step-time className="text-xs text-muted">
            {step.at ? clock(step.at) : step.state === 'skipped' ? 'Skipped' : step.state === 'now' ? 'In progress' : ''}
          </span>
        </span>
        <span className="block break-words text-xs text-muted">{[step.by && `by ${step.by}`, wait, step.detail].filter(Boolean).join(' · ')}</span>
        {step.builds && (
          <ul data-step-builds className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-xs" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {step.builds.map((group) => (
              <li key={group.phase} data-step-phase={group.phase}>
                <span className="font-medium">{group.phase}</span>
                {group.items.map((item, at) => (
                  <span key={at} data-step-build={item.failed ? 'failed' : 'ok'} className="block break-words text-muted" style={item.failed ? { color: 'var(--danger)' } : undefined}>
                    {[item.target, item.start, item.attempt > 1 && `attempt ${item.attempt}`, buildMedian(item.ms), item.failed && 'failed'].filter(Boolean).join(' · ')}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </span>
    </li>
  )
}

export function TaskSteps({ steps }: { steps: TaskStep[] }) {
  return (
    <ol data-task-steps className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {steps.map((step, index) => (
        <Step key={step.key} steps={steps} index={index} />
      ))}
    </ol>
  )
}
