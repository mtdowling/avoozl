// The Retros pill (design §4.11, §4.18; moved out of Flow 2026-11-17): two
// pages the left nav lists. Retros shows every retro, newest first, with its
// scope, time, model and the proposals it made. Proposals shows every
// proposal with its diff and evidence, and Approve, Reject, Revert and
// rebase (FlowMemory.tsx). Each retro links to each of its proposals, and
// each proposal links back. Writes are the same ones Flow had: Run a retro
// now, and the decisions. The retro's settings stay in Settings > Flow.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Card } from './ui/Card'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { IconLabel, SectionHeading, ViewHeading } from './ui/controls.tsx'
import { CirclePlus, Play } from './icons.ts'
import { CopyAttach } from './DashboardView.tsx'
import { ProposalsView, useScrollTo } from './FlowMemory.tsx'
import { STAGE_LABELS, flowClient, proposalText, type Proposal, type Retro } from './flow-api.ts'
import type { RetrosPage } from './nav-api.ts'
import { relativeTime } from './task-api.ts'
import { linkHref } from './views-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainButton, PlainLink } from './ui/Plain'

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
  if (!chat)
    return (
      <Hint size="xs" data-retro-chat="none">
        No chat was recorded for this retro.
      </Hint>
    )
  const name = retroName(retro)
  return (
    <Box as="span" flex flexCol gap="1" size="xs" data-retro-chat={chat.executor}>
      <Row as="span" gap={3}>
        {chat.link ? (
          <PlainLink href={linkHref(chat.link)} css-display="inline-flex" css-align-items="center" css-gap="4" underline aria-label={`Open the chat for ${name}`}>
            <CirclePlus size={14} aria-hidden="true" />
            Open chat
          </PlainLink>
        ) : chat.process?.attach ? (
          <CopyAttach command={chat.process.attach} title={name} />
        ) : (
          <Hint>No attach command</Hint>
        )}
        <Hint>
          {chat.executor === 'process' ? `process${chat.harness ? ` · ${chat.harness}` : ''}` : 'Kiro Crew chat'}
          {chat.status ? ` · ${chat.status}` : ''}
        </Hint>
      </Row>
      {chat.executor === 'process' && (
        <Box
          data-retro-log
          as="pre"
          css-border-color="border"
          css-max-height="7.5em"
          css-overflow="auto"
          css-white-space="pre-wrap"
          css-overflow-wrap="anywhere"
          css-font-family="font-mono-ui-monospace-monospace"
          m0
          rounded="base"
          border="all"
          p="1.5"
          tabIndex={0}
          aria-label={`Log tail for ${name}`}
        >
          {chat.process?.logTail || 'No output yet.'}
        </Box>
      )}
    </Box>
  )
}

function RetroCard({ retro, linked, onOpen, again }: { retro: Retro; linked: boolean; onOpen: (proposal: string) => void; again: ReactNode }) {
  const bottleneck = retro.bottleneck ? (STAGE_LABELS[retro.bottleneck.stage as keyof typeof STAGE_LABELS] ?? retro.bottleneck.stage) : null
  return (
    <Box
      as="li"
      css-border-color="border"
      css-box-shadow={linked ? 'inset-0-0-0-2px-accent' : undefined}
      css-border-radius={linked ? '6' : undefined}
      css-padding={linked ? '8' : undefined}
      flex
      flexCol
      gap="1.5"
      border="t"
      pt="3"
      firstBorderT0
      firstPt0
      data-retro={retro.id}
      data-linked={linked || undefined}
    >
      <Box as="span" flex flexWrap items="center" gap="2" size="sm" weight="semibold">
        {retroName(retro)}
        {retro.state !== 'done' && <Badge variant={STATE_BADGE[retro.state]}>{retro.state}</Badge>}
        {bottleneck && (
          <Box as="span" weight="normal" tone="muted">
            bottleneck {bottleneck}
          </Box>
        )}
      </Box>
      <Box as="dl" css-display="flex" css-flex-wrap="wrap" css-column-gap="16" css-row-gap="2" m0 size="xs" tone="muted" data-retro-facts>
        <Box css-display="flex" css-gap="4">
          <dt>Scope</dt>
          <Box as="dd" css-margin="0" css-color="text">
            {retroScope(retro)}
          </Box>
        </Box>
        <Box css-display="flex" css-gap="4">
          <dt>Time</dt>
          <Box as="dd" css-margin="0" css-color="text" title={retro.startedAt}>
            {relativeTime(retro.startedAt, Date.now())}
          </Box>
        </Box>
        <Box css-display="flex" css-gap="4">
          <dt>Model</dt>
          <Box as="dd" css-margin="0" css-color="text">
            {retro.model ?? 'not recorded'}
          </Box>
        </Box>
      </Box>
      {retro.triggers.length > 0 && <Hint size="xs">Started by {retro.triggers.map((t) => t.detail).join('; ')}.</Hint>}
      {retro.state === 'running' && <Hint size="sm">Running since {relativeTime(retro.startedAt, Date.now())}.</Hint>}
      {retro.state === 'failed' && (
        <Box as="span" flex flexWrap items="center" gap="3" size="sm" tone="danger" data-retro-failed={retro.failure ?? 'unknown'}>
          Failed: {retro.error}
          {again}
        </Box>
      )}
      <RetroChat retro={retro} />
      {retro.bottleneck && <Hint size="xs">{retro.bottleneck.evidence}</Hint>}
      {retro.proposals.length > 0 ? (
        <Stack as="ul" gap={1} aria-label={`Proposals from ${retroName(retro)}`}>
          {retro.proposals.map((p: Proposal) => (
            <Box key={p.id} as="li" flex flexWrap items="center" gap="2" size="sm" data-retro-proposal={`${retro.id}:${p.id}`}>
              <PlainButton type="button" css-overflow-wrap="anywhere" minW0 align="left" underline onClick={() => onOpen(p.id)}>
                {proposalText(p)}
              </PlainButton>
              <Badge variant={p.status === 'open' ? 'warning' : undefined}>{p.status}</Badge>
            </Box>
          ))}
        </Stack>
      ) : (
        retro.state === 'done' && <Hint size="xs">No proposals.</Hint>
      )}
      {retro.dropped?.length > 0 && <Hint size="xs">Dropped: {retro.dropped.map((d) => `${d.key ?? `proposal ${d.index + 1}`} (${d.reason})`).join('; ')}</Hint>}
    </Box>
  )
}

function RetrosList({
  workspaceId,
  target,
  onOpen,
  onSeen,
}: {
  workspaceId: string | null
  target: RetroTarget | null
  onOpen: (target: RetroTarget) => void
  onSeen: () => void
}) {
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
    <Card flex flexCol gap="3" data-retros-list>
      <SectionHeading
        title="All retros"
        actions={
          <IconLabel icon={Play} disabled={running || queued} tooltip="Start a retro at the next tick instead of waiting for its trigger" onClick={() => void start()}>
            {queued ? 'Starts at the next tick' : 'Run a retro now'}
          </IconLabel>
        }
      />
      {(error || startError) && (
        <ErrorText role="alert" size="sm">
          {error ?? startError}
        </ErrorText>
      )}
      {!view ? (
        <Hint as="p" size="sm">
          {busy ? 'Loading…' : 'Not loaded'}
        </Hint>
      ) : !retros.length ? (
        <Hint as="p" size="sm">
          A retro runs after 10 finished tasks.
        </Hint>
      ) : (
        <Stack as="ul" gap={3}>
          {retros.map((retro) => (
            <RetroCard
              key={retro.id}
              retro={retro}
              linked={target?.retro === retro.id}
              onOpen={(proposal) => onOpen({ page: 'proposals', retro: retro.id, proposal })}
              again={
                <IconLabel
                  icon={Play}
                  disabled={running || queued}
                  tooltip="Queue the same triggers again; a new retro starts at the next tick"
                  onClick={() => void again(retro.id)}
                >
                  Run again
                </IconLabel>
              }
            />
          ))}
        </Stack>
      )}
    </Card>
  )
}

// `page` is picked in the left nav; this shows only that one. `target` is a
// retro or proposal a link named: the page scrolls to it and marks it.
export function RetrosView({
  workspaceId,
  page,
  target,
  onOpen,
}: {
  workspaceId: string | null
  page: RetrosPage
  target: RetroTarget | null
  onOpen: (target: RetroTarget | null) => void
}) {
  const here = target?.page === page ? target : null
  return (
    <Box aria-labelledby="avoozl-retros-title" as="section" flex flexCol gap="3.5">
      <ViewHeading id="avoozl-retros-title" view="retros">
        {page === 'proposals' ? 'Proposals' : 'Retros'}
      </ViewHeading>
      <Hint as="p" size="sm">
        {page === 'proposals'
          ? 'What retros proposed to change. Nothing changes until you approve it.'
          : 'A review that finds the biggest slowdown and proposes changes. Newest first.'}
      </Hint>
      {page === 'proposals' ? (
        <ProposalsView workspaceId={workspaceId} target={here} onOpenRetro={(retro) => onOpen({ page: 'retros', retro })} onSeen={() => onOpen(null)} />
      ) : (
        <RetrosList workspaceId={workspaceId} target={here} onOpen={(next) => onOpen(next)} onSeen={() => onOpen(null)} />
      )}
    </Box>
  )
}
