// The Workflow map: lanes of step cards drawn from one
// repository's settings. Display only; a value jumps to the field that sets
// it. No animation, theme variables only, cards wrap down to 320 px.
import { useMemo, type ReactNode } from 'react'
import { Card } from './ui/Card'
import type { RepositoryForm } from './settings-api.ts'
import { WHO_COLOR, WHO_TEXT, buildWorkflowMap, fieldSelector, type Card as StepCard, type Jump, type Lane, type StepTag, type Value } from './workflow-map.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'
import { Glyph } from './ui/Glyph'
import Badge, { type BadgeVariant } from './ui/Badge.tsx'
import { ChevronRight } from './icons.ts'

export const WORKFLOW_BLURB = 'How work flows through this repository, read from its saved settings. A value in a card opens the field that sets it.'

// Focus the input a jump names: open any closed fold around it, scroll to it.
// False when the input is not on the page (its sub-tab is not open yet).
export function focusField(id: string, jump: Jump): boolean {
  const field = document.querySelector<HTMLElement>(fieldSelector(id, jump.field))
  if (!field) return false
  for (let node = field.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true
  field.scrollIntoView({ block: 'center' })
  field.focus()
  return true
}

const SOURCE_TEXT = { set: '', default: ' (default)', placeholder: ' (planned name, no setting yet)' } as const

// A value or row that opens the field that sets it: a plain underlined button.
function JumpButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <PlainButton
      type="button"
      css-color="inherit"
      css-background="none"
      css-border="0"
      css-padding="0"
      css-cursor="pointer"
      css-overflow-wrap="anywhere"
      css-text-align="start"
      underline
      onClick={onClick}
    >
      {children}
    </PlainButton>
  )
}

// A Labels table cell: top aligned, a hairline above each row.
function LabelCell({ color, nowrap, children }: { color?: string; nowrap?: boolean; children: ReactNode }) {
  return (
    <Box as="td" css-padding-inline-end="0.5rem" css-border-top="1px-solid-border" css-color={color} py="1" alignTop whitespace={nowrap ? 'nowrap' : undefined}>
      {children}
    </Box>
  )
}

function ValueLine({ value, onJump }: { value: Value; onJump?: (jump: Jump) => void }) {
  return (
    <Box as="span" data-value={value.label} data-source={value.source}>
      <Hint>{value.label}: </Hint>
      {value.jump && onJump ? (
        <JumpButton onClick={() => onJump(value.jump!)}>
          <code>{value.text}</code>
        </JumpButton>
      ) : (
        <Box as="code" css-overflow-wrap="anywhere">
          {value.text}
        </Box>
      )}
      <Hint>{SOURCE_TEXT[value.source]}</Hint>
      {value.elsewhere && <Hint> (set in {value.elsewhere})</Hint>}
    </Box>
  )
}

// A status tag's badge: tested against fakes reads as info, built but not
// yet seen working live as a caution, not built as muted.
const TAG_BADGE: Record<StepTag, BadgeVariant | undefined> = { 'fake-tested': 'info', 'not proven live': 'warning', 'not built': undefined }

// A small, uppercase box title, like the page's small section headings.
function StepTitle({ children }: { children: string }) {
  return (
    <Box as="span" css-color="text-strong-text" css-line-height="1.25" block size="11" weight="semibold" uppercase trackingWide>
      {children}
    </Box>
  )
}

// One step box. Its left edge is the color of who does it; the chevron in the
// gap before it points from the step before, also at the start of a wrapped row.
function Step({ card, off, first, onJump }: { card: StepCard; off: boolean; first: boolean; onJump?: (jump: Jump) => void }) {
  const muted = off || Boolean(card.muted)
  return (
    <Box
      as="li"
      css-position="relative"
      css-border-color="border"
      css-border-inline-start-color={WHO_COLOR[card.who]}
      css-border-inline-start-width="3"
      css-background="card-transparent"
      css-opacity={muted ? '0.6' : '1'}
      css-padding="6px-8px"
      flex
      minW0
      flexCol
      gap="1"
      rounded="md"
      border="all"
      size="11"
      css-line-height="16px"
      data-step={card.key}
      data-who={card.who}
      data-muted={muted ? 'true' : undefined}
    >
      {!first && (
        <Box as="span" aria-hidden="true" css-position="absolute" css-left={-15} css-top="50%" css-transform="translateY-50%" flex>
          <Glyph icon={ChevronRight} size={14} css-color="muted" />
        </Box>
      )}
      <Box as="span" flex flexWrap items="center" gapX="2" gapY="0.5" minW0>
        <Box as="span" css-color={WHO_COLOR[card.who]} weight="medium" data-who-tag>
          {WHO_TEXT[card.who]}
        </Box>
        {card.tag && (
          <Box as="span" css-margin-left="auto" css-flex-shrink="0" whitespace="nowrap" data-status-tag>
            <Badge variant={TAG_BADGE[card.tag]}>{card.tag}</Badge>
          </Box>
        )}
      </Box>
      <StepTitle>{card.title}</StepTitle>
      <Hint>{card.text}</Hint>
      {card.values.length > 0 && (
        <Box as="span" flex flexCol gap="0.5" css-padding-top="2">
          {card.values.map((value) => (
            <ValueLine key={value.label} value={value} onJump={onJump} />
          ))}
        </Box>
      )}
      {card.muted && (
        <Box as="span" data-reason>
          Off: {card.muted}
        </Box>
      )}
    </Box>
  )
}

function LaneRow({ lane, onJump }: { lane: Lane; onJump?: (jump: Jump) => void }) {
  return (
    <Box aria-label={`${lane.title} lane`} as="section" flex flexCol gap="1.5" data-lane={lane.key} data-lane-off={lane.muted ? 'true' : undefined}>
      <Box as="h5" m0 flex items="center" gap="2" size="sm" weight="semibold">
        {lane.title}
        {lane.muted && <Badge>Off</Badge>}
      </Box>
      {lane.muted && (
        <Hint as="p" size="xs" flush data-reason>
          {lane.muted}
        </Hint>
      )}
      <Box as="ol" m0 grid listNone css-grid-template-columns="repeat-auto-fill-minmax-min-100%-9rem-1fr" css-column-gap="16" css-row-gap="8" css-padding-left="16" items="stretch">
        {lane.cards.map((card, index) => (
          <Step key={card.key} card={card} first={index === 0} off={Boolean(lane.muted)} onJump={onJump} />
        ))}
      </Box>
    </Box>
  )
}

export default function WorkflowMap(props: { workspaceId: string; mode: string; repository: RepositoryForm; planningRepository?: string; onJump?: (jump: Jump) => void }) {
  const map = useMemo(
    () => buildWorkflowMap({ mode: props.mode, repository: props.repository, planningRepository: props.planningRepository }),
    [props.mode, props.repository, props.planningRepository],
  )
  return (
    <Stack gap={4} data-workflow-map>
      <Hint as="p" size="xs" data-workflow-blurb>
        {WORKFLOW_BLURB}
      </Hint>
      {map.lanes.map((lane) => (
        <LaneRow key={lane.key} lane={lane} onJump={props.onJump} />
      ))}
      {map.note && (
        <Hint as="p" size="xs" data-workflow-note>
          {map.note}
        </Hint>
      )}
      {map.labels.length > 0 && (
        <Card>
          <Box css-overflow-x="auto" overflow="x-auto" data-labels-table>
            <Box as="table" align="left" size="xs" css-border-collapse="collapse">
              <Box as="caption" pb="2" align="left" size="sm" weight="semibold">
                Labels
              </Box>
              <thead>
                <tr>
                  {['Label', 'Name', 'Written by', 'Setting'].map((head) => (
                    <Hint as="th" key={head} css-padding-inline-end="0.5rem" pb="1" size="11" weight="semibold" uppercase trackingWide whitespace="nowrap">
                      {head}
                    </Hint>
                  ))}
                </tr>
              </thead>
              <tbody>
                {map.labels.map((row) => (
                  <tr key={row.key} data-label-row={row.key}>
                    <LabelCell>{row.label}</LabelCell>
                    <LabelCell>
                      <Box as="code" css-overflow-wrap="anywhere">
                        {row.name}
                      </Box>
                      <Hint>{SOURCE_TEXT[row.source]}</Hint>
                    </LabelCell>
                    <LabelCell color={WHO_COLOR[row.writer]} nowrap>
                      {WHO_TEXT[row.writer]}
                    </LabelCell>
                    <LabelCell nowrap>
                      {row.jump && props.onJump ? (
                        <JumpButton onClick={() => props.onJump!(row.jump!)}>Open setting</JumpButton>
                      ) : (
                        <Hint>{row.source === 'placeholder' ? 'not built yet' : '—'}</Hint>
                      )}
                    </LabelCell>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        </Card>
      )}
    </Stack>
  )
}
