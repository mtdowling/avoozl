// The task's steps in its Timeline box (Requirement 106, design 4.35): from
// the task's stored records, drawn as a dotted list with each step's time and
// the wait since the step before. This file only draws what task.detail gives.
import { afterPrevious, clock, type TaskStep } from './task-api.ts'
import { buildMedian } from './radar-flow-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { DOT } from './ui/looks/TaskSteps.ts'


function Step({ steps, index }: { steps: TaskStep[]; index: number }) {
  const step = steps[index],
    wait = afterPrevious(steps, index),
    dot = step.failed ? { border: 'var(--danger)', background: 'var(--danger)' } : DOT[step.state]
  return (
    <Box data-task-step={step.key} data-state={step.state} as="li" flex gap="3" pb="3">
      <span
        aria-hidden="true"
        style={{ flex: '0 0 12px', height: 12, marginTop: 4, borderRadius: 6, border: `2px ${step.state === 'skipped' ? 'dashed' : 'solid'} ${dot.border}`, background: dot.background }}
      />
      <Box as="span" minW0 flex1>
        <Box as="span" flex flexWrap items="baseline" gapX="2">
          <span className="font-medium" style={step.state === 'later' || step.state === 'skipped' ? { color: 'var(--muted)' } : step.failed ? { color: 'var(--danger)' } : undefined}>
            {step.label}
          </span>
          <Hint data-step-time size="xs">
            {step.at ? clock(step.at) : step.state === 'skipped' ? 'Skipped' : step.state === 'now' ? 'In progress' : ''}
          </Hint>
        </Box>
        <Box as="span" block breakWords size="xs" tone="muted">{[step.by && `by ${step.by}`, wait, step.detail].filter(Boolean).join(' · ')}</Box>
        {step.builds && (
          <Box data-step-builds as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 mt="1" flex listNone flexCol gap="1" p="0" size="xs">
            {step.builds.map((group) => (
              <li key={group.phase} data-step-phase={group.phase}>
                <Box as="span" weight="medium">{group.phase}</Box>
                {group.items.map((item, at) => (
                  <span key={at} data-step-build={item.failed ? 'failed' : 'ok'} className="block break-words text-muted" style={item.failed ? { color: 'var(--danger)' } : undefined}>
                    {[item.target, item.start, item.attempt > 1 && `attempt ${item.attempt}`, buildMedian(item.ms), item.failed && 'failed'].filter(Boolean).join(' · ')}
                  </span>
                ))}
              </li>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function TaskSteps({ steps }: { steps: TaskStep[] }) {
  return (
    <Box data-task-steps as="ol" css-margin="0" css-padding="0" css-list-style="none" m0 listNone p="0">
      {steps.map((step, index) => (
        <Step key={step.key} steps={steps} index={index} />
      ))}
    </Box>
  )
}
