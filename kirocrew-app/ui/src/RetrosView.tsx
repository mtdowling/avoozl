// The Retros pill (design §4.11, §4.18; moved out of Flow 2026-11-17): two
// pages the left nav lists. Retros shows every retro, newest first, with its
// scope, time, model and the proposals it made. Proposals shows every
// proposal with its diff and evidence, and Approve, Reject, Revert and
// rebase (FlowMemory.tsx). Each retro links to each of its proposals, and
// each proposal links back. Writes are the same ones Flow had: Run a retro
// now, and the decisions. The retro's settings stay in Settings > Flow.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import Badge from './Badge.tsx'
import { IconLabel, SectionHeading, ViewHeading } from './controls.tsx'
import { CirclePlus, Play } from './icons.ts'
import { CopyAttach } from './DashboardView.tsx'
import { ProposalsView, useScrollTo } from './FlowMemory.tsx'
import { STAGE_LABELS, flowClient, proposalText, type Proposal, type Retro } from './flow-api.ts'
import type { RetrosPage } from './nav-api.ts'
import { relativeTime } from './task-api.ts'
import { linkHref } from './views-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'

// A retro or proposal another page linked to.
export interface RetroTarget {
  page: RetrosPage
  retro: string
  proposal?: string
}

// "retro-3" reads as "Retro 3".
export const retroName = (retro: Retro) => `Retro ${retro.n}`

// Where a retro looked: the repository its bottleneck named, else everything.
export const retroScope = (retro: Retro) => retro.bottleneck?.repository ?? 'All repositories'

const STATE_BADGE = { running: 'info', done: undefined, failed: 'danger' } as const

// The retro's chat: a Kiro Crew link, or for a `process` session the log tail
// and the attach command (50.1). A retro with no recorded chat says so.
function RetroChat({ retro }: { retro: Retro }) {
  const chat = retro.chat
  if (!chat) return <span className="text-xs text-muted" data-retro-chat="none">No chat was recorded for this retro.</span>
  const name = retroName(retro)
  return (
    <span className="flex flex-col gap-1 text-xs" data-retro-chat={chat.executor}>
      <span className="flex flex-wrap items-center gap-3">
        {chat.link ? (
          <a href={linkHref(chat.link)} className="underline" aria-label={`Open the chat for ${name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CirclePlus size={14} aria-hidden="true" />
            Open chat
          </a>
        ) : chat.process?.attach ? (
          <CopyAttach command={chat.process.attach} title={name} />
        ) : (
          <span className="text-muted">No attach command</span>
        )}
        <span className="text-muted">
          {chat.executor === 'process' ? `process${chat.harness ? ` · ${chat.harness}` : ''}` : 'Kiro Crew chat'}
          {chat.status ? ` · ${chat.status}` : ''}
        </span>
      </span>
      {chat.executor === 'process' && (
        <pre
          data-retro-log
          className="m-0 rounded border p-1.5"
          tabIndex={0}
          aria-label={`Log tail for ${name}`}
          style={{ borderColor: 'var(--border)', maxHeight: '7.5em', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
        >
          {chat.process?.logTail || 'No output yet.'}
        </pre>
      )}
    </span>
  )
}

function RetroCard({ retro, linked, onOpen, again }: { retro: Retro; linked: boolean; onOpen: (proposal: string) => void; again: ReactNode }) {
  const bottleneck = retro.bottleneck ? STAGE_LABELS[retro.bottleneck.stage as keyof typeof STAGE_LABELS] ?? retro.bottleneck.stage : null
  return (
    <li
      className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--border)', ...(linked ? { boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 6, padding: 8 } : {}) }}
      data-retro={retro.id}
      data-linked={linked || undefined}
    >
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {retroName(retro)}
        {retro.state !== 'done' && <Badge variant={STATE_BADGE[retro.state]}>{retro.state}</Badge>}
        {bottleneck && <span className="font-normal text-muted">bottleneck {bottleneck}</span>}
      </span>
      <dl className="m-0 text-xs text-muted" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 2 }} data-retro-facts>
        <div style={{ display: 'flex', gap: 4 }}>
          <dt>Scope</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }}>{retroScope(retro)}</dd>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <dt>Time</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }} title={retro.startedAt}>
            {relativeTime(retro.startedAt, Date.now())}
          </dd>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <dt>Model</dt>
          <dd style={{ margin: 0, color: 'var(--text)' }}>{retro.model ?? 'not recorded'}</dd>
        </div>
      </dl>
      {retro.triggers.length > 0 && <span className="text-xs text-muted">Started by {retro.triggers.map((t) => t.detail).join('; ')}.</span>}
      {retro.state === 'running' && <span className="text-sm text-muted">Running since {relativeTime(retro.startedAt, Date.now())}.</span>}
      {retro.state === 'failed' && (
        <span className="flex flex-wrap items-center gap-3 text-sm text-danger" data-retro-failed={retro.failure ?? 'unknown'}>
          Failed: {retro.error}
          {again}
        </span>
      )}
      <RetroChat retro={retro} />
      {retro.bottleneck && <span className="text-xs text-muted">{retro.bottleneck.evidence}</span>}
      {retro.proposals.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label={`Proposals from ${retroName(retro)}`}>
          {retro.proposals.map((p: Proposal) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm" data-retro-proposal={`${retro.id}:${p.id}`}>
              <button type="button" className="min-w-0 text-left underline" style={{ overflowWrap: 'anywhere' }} onClick={() => onOpen(p.id)}>
                {proposalText(p)}
              </button>
              <Badge variant={p.status === 'open' ? 'warning' : undefined}>{p.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        retro.state === 'done' && <span className="text-xs text-muted">No proposals.</span>
      )}
      {retro.dropped?.length > 0 && (
        <span className="text-xs text-muted">Dropped: {retro.dropped.map((d) => `${d.key ?? `proposal ${d.index + 1}`} (${d.reason})`).join('; ')}</span>
      )}
    </li>
  )
}

function RetrosList({ workspaceId, target, onOpen, onSeen }: { workspaceId: string | null; target: RetroTarget | null; onOpen: (target: RetroTarget) => void; onSeen: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const load = useCallback((id: string) => client.view(id, {}), [client])
  const { value: view, error, busy, reload } = useRead(workspaceId, load)
  const [queued, setQueued] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  useScrollTo(target ? `[data-retro="${target.retro}"]` : null, Boolean(view), onSeen)
  const start = async () => {
    if (!workspaceId) return
    try {
      await client.startRetro(workspaceId)
      setQueued(true)
      void reload()
    } catch (caught) {
      setStartError(errorMessage(caught))
    }
  }
  const again = async (id: string) => {
    if (!workspaceId) return
    try {
      await client.runRetroAgain(workspaceId, id)
      setQueued(true)
      void reload()
    } catch (caught) {
      setStartError(errorMessage(caught))
    }
  }
  const retros = view?.retros ?? []
  const running = retros.some((r) => r.state === 'running')
  return (
    <Card className="flex flex-col gap-3" data-retros-list>
      <SectionHeading
        title="All retros"
        actions={
          <IconLabel icon={Play} disabled={running || queued} tooltip="Start a retro at the next tick instead of waiting for its trigger" onClick={() => void start()}>
            {queued ? 'Starts at the next tick' : 'Run a retro now'}
          </IconLabel>
        }
      />
      {(error || startError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? startError}
        </p>
      )}
      {!view ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : !retros.length ? (
        <p className="text-sm text-muted">A retro runs after 10 finished tasks.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {retros.map((retro) => (
            <RetroCard key={retro.id} retro={retro} linked={target?.retro === retro.id} onOpen={(proposal) => onOpen({ page: 'proposals', retro: retro.id, proposal })}
              again={
                <IconLabel icon={Play} disabled={running || queued} tooltip="Queue the same triggers again; a new retro starts at the next tick" onClick={() => void again(retro.id)}>
                  Run again
                </IconLabel>
              }
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

// `page` is picked in the left nav; this shows only that one. `target` is a
// retro or proposal a link named: the page scrolls to it and marks it.
export function RetrosView({ workspaceId, page, target, onOpen }: { workspaceId: string | null; page: RetrosPage; target: RetroTarget | null; onOpen: (target: RetroTarget | null) => void }) {
  const here = target?.page === page ? target : null
  return (
    <section aria-labelledby="avoozl-retros-title" className="flex flex-col gap-3.5">
      <ViewHeading id="avoozl-retros-title" view="retros">
        {page === 'proposals' ? 'Proposals' : 'Retros'}
      </ViewHeading>
      <p className="text-sm text-muted">
        {page === 'proposals' ? 'What retros proposed to change. Nothing changes until you approve it.' : 'A review that finds the biggest slowdown and proposes changes. Newest first.'}
      </p>
      {page === 'proposals' ? (
        <ProposalsView
          workspaceId={workspaceId}
          target={here}
          onOpenRetro={(retro) => onOpen({ page: 'retros', retro })}
          onSeen={() => onOpen(null)}
        />
      ) : (
        <RetrosList workspaceId={workspaceId} target={here} onOpen={(next) => onOpen(next)} onSeen={() => onOpen(null)} />
      )}
    </section>
  )
}
