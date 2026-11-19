// A stepped walkthrough with bigger text and a picture per step: Back,
// Next, dots, and arrow keys. One shared component; each caller passes its
// steps as data. The step change is announced to screen readers, and the
// slide is dropped under reduced motion.
import { useState, type ReactNode } from 'react'
import { Btn } from './ui/Btn'
import { ArrowLeft, ArrowRight } from './icons.ts'
import { ICON } from './ui/controls.tsx'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { WalkStyle } from './ui/PageStyles'
import { PlainButton } from './ui/Plain'

export interface WalkStep {
  title: string
  text: string
  picture: ReactNode
  // Short points under the text: where you can watch or step in.
  points?: string[]
}

export function Walkthrough(props: { id: string; label: string; steps: WalkStep[]; onClose?: () => void }) {
  const [at, setAt] = useState(0)
  const step = props.steps[at]
  const last = props.steps.length - 1
  const go = (next: number) => setAt(Math.max(0, Math.min(last, next)))
  return (
    <Box
      aria-roledescription="walkthrough"
      aria-label={props.label}
      data-walkthrough={props.id}
      as="section"
      css-border-color="border"
      css-background="card"
      flex
      flexCol
      gap="3"
      rounded="lg"
      border="all"
      p="4"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(at + 1)
        else if (event.key === 'ArrowLeft') go(at - 1)
        else if (event.key === 'Escape' && props.onClose) props.onClose()
        else return
        event.preventDefault()
      }}
    >
      <WalkStyle />
      <Box key={at} data-walk-slide css-grid-template-columns="repeat-auto-fit-minmax-min-100%-260px-1fr" grid items="center" gap="4">
        <Box css-background="bg-elevated-transparent" rounded="md" p="3" aria-hidden="true">
          {step.picture}
        </Box>
        <Stack gap={2} aria-live="polite">
          <Hint as="p" size="xs">
            Step {at + 1} of {props.steps.length}
          </Hint>
          <Box as="h4" size="lg" weight="semibold">
            {step.title}
          </Box>
          <Box as="p" size="base">
            {step.text}
          </Box>
          {step.points && (
            <Box as="ul" css-list-style="disc" flex flexCol gap="1" pl="5" size="sm">
              {step.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </Box>
          )}
        </Stack>
      </Box>
      <Row gap={3}>
        <Btn type="button" onClick={() => go(at - 1)} disabled={at === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={ICON} aria-hidden="true" />
          Back
        </Btn>
        <Box flex items="center" gap="1.5" role="group" aria-label="Steps">
          {props.steps.map((s, i) => (
            <PlainButton
              key={s.title}
              type="button"
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === at ? 'step' : undefined}
              onClick={() => go(i)}
              css-width="9"
              css-height="9"
              css-background={i === at ? 'accent' : 'border'}
              rounded="full"
            />
          ))}
        </Box>
        {at < last ? (
          <Btn type="button" primary onClick={() => go(at + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Next
            <ArrowRight size={ICON} aria-hidden="true" />
          </Btn>
        ) : (
          props.onClose && (
            <Btn type="button" primary onClick={props.onClose}>
              Done
            </Btn>
          )
        )}
      </Row>
    </Box>
  )
}

// A small left-to-right flow of labeled boxes for a step's picture. The
// `on` box is the one the step is about.
export function Flow(props: { boxes: string[]; on?: number; note?: string }) {
  return (
    <Stack gap={2}>
      <Box flex flexWrap items="center" gap="1.5">
        {props.boxes.map((box, i) => (
          <Box key={box} as="span" inlineFlex items="center" gap="1.5">
            {i > 0 && <ArrowRight size={14} style={{ color: 'var(--muted)' }} />}
            <span
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{
                border: `${i === props.on ? 2 : 1}px solid ${i === props.on ? 'var(--accent)' : 'var(--border)'}`,
                background: i === props.on ? 'color-mix(in srgb, var(--accent) 12%, var(--card))' : 'var(--card)',
                color: 'var(--text)',
              }}
            >
              {box}
            </span>
          </Box>
        ))}
      </Box>
      {props.note && (
        <Box as="span" size="11" tone="muted">
          {props.note}
        </Box>
      )}
    </Stack>
  )
}
