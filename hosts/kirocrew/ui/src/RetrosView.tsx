// The Retros pill (design §4.11, §4.18; moved out of Flow 2026-11-17): every
// retro, newest first, with its scope, time, model and the settings and plan
// changes it proposed, each with Approve and Reject (FlowMemory.tsx). Writes
// are Run a retro now, Run again, and the decisions. The retro's settings
// stay in Settings > Flow.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Card } from './ui/Card'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { IconLabel, SectionHeading, ViewHeading, useConfirm } from './ui/controls.tsx'
import { Play } from './icons.ts'
import { ProposalCard } from './FlowMemory.tsx'
import { STAGE_LABELS, flowClient, proposalText, type Proposal, type Retro } from './flow-api.ts'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

// "retro-3" reads as "Retro 3".
export const retroName = (retro: Retro) => `Retro ${retro.n}`

// Where a retro looked: the repository its bottleneck named, else everything.
export const retroScope = (retro: Retro) => retro.bottleneck?.repository ?? 'All repositories'

const STATE_BADGE = { running: 'info', done: undefined, failed: 'danger' } as const

function RetroCard({ retro, busy, onDecide, again }: { retro: Retro; busy: boolean; onDecide: (p: Proposal, d: 'approve' | 'reject') => void; again: ReactNode }) {
  const bottleneck = retro.bottleneck ? (STAGE_LABELS[retro.bottleneck.stage as keyof typeof STAGE_LABELS] ?? retro.bottleneck.stage) : null
  return (
    <Box as="li" css-border-color="border" flex flexCol gap="1.5" border="t" pt="3" firstBorderT0 firstPt0 data-retro={retro.id}>
      <Box as="span" flex flexWrap items="center" gap="2" size="sm" weight="semibold">
        {retroName(retro)}
        {retro.state !== 'done' && <Badge variant={STATE_BADGE[retro.state]}>{retro.state}</Badge>}
        {bottleneck && (
          <Hint as="span" weight="normal">
            bottleneck {bottleneck}
          </Hint>
        )}
      </Box>
      <Hint as="dl" css-display="flex" css-flex-wrap="wrap" css-column-gap="16" css-row-gap="2" m0 size="xs" data-retro-facts>
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
      </Hint>
      {retro.triggers.length > 0 && <Hint size="xs">Started by {retro.triggers.map((t) => t.detail).join('; ')}.</Hint>}
      {retro.state === 'running' && <Hint size="sm">Running since {relativeTime(retro.startedAt, Date.now())}.</Hint>}
      {retro.state === 'failed' && (
        <Box as="span" flex flexWrap items="center" gap="3" size="sm" tone="danger" data-retro-failed={retro.failure ?? 'unknown'}>
          Failed: {retro.error}
          {again}
        </Box>
      )}
      {retro.bottleneck && <Hint size="xs">{retro.bottleneck.evidence}</Hint>}
      {retro.proposals.length > 0 ? (
        <Stack as="ul" gap={2} aria-label={`Proposals from ${retroName(retro)}`}>
          {retro.proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} busy={busy} onDecide={onDecide} />
          ))}
        </Stack>
      ) : (
        retro.state === 'done' && <Hint size="xs">No proposals.</Hint>
      )}
      {retro.dropped?.length > 0 && <Hint size="xs">Dropped: {retro.dropped.map((d) => `${d.key ?? `proposal ${d.index + 1}`} (${d.reason})`).join('; ')}</Hint>}
    </Box>
  )
}

export function RetrosView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const confirm = useConfirm()
  const load = useCallback((id: string) => client.view(id, {}), [client])
  const { value: view, error, busy, reload } = useRead(workspaceId, load)
  const [queued, setQueued] = useState(false)
  const [acting, setActing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const act = async (run: () => Promise<unknown>, queue = false) => {
    if (!workspaceId) return
    setActing(true)
    setMessage(null)
    try {
      await run()
      if (queue) setQueued(true)
      await reload()
    } catch (caught) {
      setMessage(errorMessage(caught))
    } finally {
      setActing(false)
    }
  }
  const decide = (retro: Retro, p: Proposal, decision: 'approve' | 'reject') =>
    act(async () => {
      let confirmRemoval = false
      if (decision === 'approve' && p.removesCheck) {
        confirmRemoval = await confirm({
          title: 'Approve removing a check?',
          body: `${proposalText(p)} removes a review role or a declared check, so fewer things are checked before work lands.`,
          action: 'Remove the check',
        })
        if (!confirmRemoval) return
      }
      // Only a settings change is checked against the file's hash.
      const expectedHash = p.type === 'settings' ? (await client.settings(workspaceId!)).hash : undefined
      await client.decide(workspaceId!, {
        retroId: retro.id,
        proposalId: p.id,
        decision,
        ...(expectedHash ? { expectedHash } : {}),
        ...(confirmRemoval ? { confirmRemoval: true } : {}),
      })
    })
  const retros = view?.retros ?? []
  const running = retros.some((r) => r.state === 'running')
  return (
    <Box aria-labelledby="avoozl-retros-title" as="section" flex flexCol gap="3.5">
      <ViewHeading id="avoozl-retros-title" view="retros">
        Retros
      </ViewHeading>
      <Hint as="p" size="sm">
        A review that finds the biggest slowdown and proposes settings or spec changes. Nothing changes until you approve it. Newest first.
      </Hint>
      <Card flex flexCol gap="3" data-retros-list>
        <SectionHeading
          title="All retros"
          actions={
            <IconLabel
              icon={Play}
              disabled={running || queued}
              tooltip="Start a retro at the next tick instead of waiting for its trigger"
              onClick={() => void act(() => client.startRetro(workspaceId!), true)}
            >
              {queued ? 'Starts at the next tick' : 'Run a retro now'}
            </IconLabel>
          }
        />
        {(error || message) && (
          <ErrorText role="alert" size="sm">
            {error ?? message}
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
                busy={acting}
                onDecide={(p, decision) => void decide(retro, p, decision)}
                again={
                  <IconLabel
                    icon={Play}
                    disabled={running || queued}
                    tooltip="Queue the same triggers again; a new retro starts at the next tick"
                    onClick={() => void act(() => client.runRetroAgain(workspaceId!, retro.id), true)}
                  >
                    Run again
                  </IconLabel>
                }
              />
            ))}
          </Stack>
        )}
      </Card>
    </Box>
  )
}
