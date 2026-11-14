// The Workflow map (radar-coder RC22): lanes of step cards drawn from one
// repository's settings. Display only; a value jumps to the field that sets
// it. No animation, theme variables only, cards wrap down to 320 px.
import { Fragment, useCallback, useMemo } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { COMMAND_PATH } from './workspace-api.ts'
import type { DeliverySettings } from './delivery-api.ts'
import type { RepositoryForm } from './settings-api.ts'
import { WHO_COLOR, WHO_TEXT, buildWorkflowMap, fieldSelector, type Card as StepCard, type Jump, type Lane, type Value } from './workflow-map.ts'

export const WORKFLOW_BLURB =
  "How work flows through this repository, read from its saved settings. A value in a card opens the field that sets it."

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

function ValueLine({ value, onJump }: { value: Value; onJump?: (jump: Jump) => void }) {
  return (
    <span className="text-xs" data-value={value.label} data-source={value.source}>
      <span className="text-muted">{value.label}: </span>
      {value.jump && onJump ? (
        <button type="button" className="underline" style={{ color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', overflowWrap: 'anywhere', textAlign: 'start' }} onClick={() => onJump(value.jump!)}>
          <code>{value.text}</code>
        </button>
      ) : (
        <code style={{ overflowWrap: 'anywhere' }}>{value.text}</code>
      )}
      <span className="text-muted">{SOURCE_TEXT[value.source]}</span>
      {value.elsewhere && <span className="text-muted"> (set in {value.elsewhere})</span>}
    </span>
  )
}

function Step({ card, off, onJump }: { card: StepCard; off: boolean; onJump?: (jump: Jump) => void }) {
  const muted = off || Boolean(card.muted)
  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded border p-2 text-sm"
      style={{ borderColor: 'var(--border)', borderInlineStartColor: WHO_COLOR[card.who], borderInlineStartWidth: 4, background: 'var(--card, transparent)', opacity: muted ? 0.65 : 1, flex: '1 1 11rem', maxWidth: '16rem' }}
      data-step={card.key}
      data-who={card.who}
      data-muted={muted ? 'true' : undefined}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-xs font-semibold" style={{ color: WHO_COLOR[card.who] }} data-who-tag>
          {WHO_TEXT[card.who]}
        </span>
        {card.tag && (
          <span className="rounded border px-1 text-[11px] text-muted" style={{ borderColor: 'var(--border)' }} data-status-tag>
            {card.tag}
          </span>
        )}
      </span>
      <span className="font-medium">{card.title}</span>
      <span className="text-xs text-muted">{card.text}</span>
      {card.values.map((value) => (
        <ValueLine key={value.label} value={value} onJump={onJump} />
      ))}
      {card.muted && (
        <span className="text-xs" data-reason>
          Off: {card.muted}
        </span>
      )}
    </li>
  )
}

function LaneRow({ lane, onJump }: { lane: Lane; onJump?: (jump: Jump) => void }) {
  return (
    <section aria-label={`${lane.title} lane`} className="flex flex-col gap-1.5" data-lane={lane.key} data-lane-off={lane.muted ? 'true' : undefined}>
      <h5 className="text-sm font-semibold">{lane.title}</h5>
      {lane.muted && (
        <p className="text-xs text-muted" data-reason>
          Off: {lane.muted}
        </p>
      )}
      <ol className="m-0 flex list-none flex-wrap items-stretch gap-1.5 p-0">
        {lane.cards.map((card, index) => (
          <Fragment key={card.key}>
            {index > 0 && (
              <li aria-hidden="true" className="self-center text-muted">
                →
              </li>
            )}
            <Step card={card} off={Boolean(lane.muted)} onJump={onJump} />
          </Fragment>
        ))}
      </ol>
    </section>
  )
}

export default function WorkflowMap(props: {
  workspaceId: string
  mode: string
  repository: RepositoryForm
  planningRepository?: string
  onJump?: (jump: Jump) => void
}) {
  const api = useAppApi()
  const load = useCallback(
    () => api.post<{ result: DeliverySettings }>(COMMAND_PATH, { operation: 'delivery.settings.get', input: {}, workspaceId: props.workspaceId }).then((reply) => reply.result),
    [api, props.workspaceId],
  )
  const { value: delivery } = useRead<DeliverySettings>(props.workspaceId, load)
  const ship = delivery?.delivery.ship ?? (delivery ? 'auto-merge' : null)
  const map = useMemo(
    () => buildWorkflowMap({ mode: props.mode, repository: props.repository, ship, planningRepository: props.planningRepository }),
    [props.mode, props.repository, ship, props.planningRepository],
  )
  return (
    <div className="flex flex-col gap-3" data-workflow-map>
      <p className="text-xs text-muted" data-workflow-blurb>
        {WORKFLOW_BLURB}
      </p>
      {map.lanes.map((lane) => (
        <LaneRow key={lane.key} lane={lane} onJump={props.onJump} />
      ))}
      {map.note && (
        <p className="text-xs text-muted" data-workflow-note>
          {map.note}
        </p>
      )}
      {map.labels.length > 0 && (
        <Card>
          <div className="overflow-x-auto" data-labels-table>
            <table className="w-full text-left text-xs">
              <caption className="pb-1 text-left text-sm font-semibold">Labels</caption>
              <thead>
                <tr className="text-muted">
                  <th className="pe-2 font-normal">Label</th>
                  <th className="pe-2 font-normal">Name</th>
                  <th className="pe-2 font-normal">Written by</th>
                  <th className="font-normal">Setting</th>
                </tr>
              </thead>
              <tbody>
                {map.labels.map((row) => (
                  <tr key={row.key} data-label-row={row.key}>
                    <td className="pe-2 align-top">{row.label}</td>
                    <td className="pe-2 align-top">
                      <code style={{ overflowWrap: 'anywhere' }}>{row.name}</code>
                      <span className="text-muted">{SOURCE_TEXT[row.source]}</span>
                    </td>
                    <td className="pe-2 align-top" style={{ color: WHO_COLOR[row.writer] }}>
                      {WHO_TEXT[row.writer]}
                    </td>
                    <td className="align-top">
                      {row.jump && props.onJump ? (
                        <button type="button" className="underline" style={{ color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => props.onJump!(row.jump!)}>
                          Open setting
                        </button>
                      ) : (
                        <span className="text-muted">{row.source === 'placeholder' ? 'not built yet' : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
