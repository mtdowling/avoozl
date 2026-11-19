// The Triage agent page (triage-agent TA6, TA10.7, TA12): what the agent is
// doing and has done, each repository's cap and Pause, Stop all, and the
// GitHub calls triage used today. Until a repository has the agent on the
// page is one Set up triage button, the only way the agent goes on; a
// plugin's block shows its reason in place of that button.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { RefreshButton } from './RefreshButton.tsx'
import { ViewHeading, useConfirm } from './ui/controls.tsx'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { EmptyState } from './ui/EmptyState'
import { Stack } from './ui/Stack'
import Badge from './ui/Badge.tsx'
import { TextLink } from './ui/TextLink'
import { TriageSetup } from './TriageSetup.tsx'
import { safeHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { CLASS_LABELS, RESULT_LABELS, ageOf, callsLine, itemsClient, type RunView, type TriageRepository, type TriageView } from './github-items-api.ts'

function RunRow(props: { run: RunView }) {
  const { run } = props
  return (
    <Box as="li" css-border-color="border" border="t" firstBorderT0 py="1.5" flex flexCol gap="0.5" data-triage-run={run.id}>
      <Box as="span" flex minW0 items="center" gap="2" size="sm">
        <Badge variant={run.state === 'failed' || run.state === 'held' ? 'warning' : run.state === 'done' ? 'success' : 'info'}>{RESULT_LABELS[run.state] ?? run.state}</Badge>
        <Hint as="span" shrink0 size="xs">
          {run.repository}#{run.number}
        </Hint>
        <Box as="span" minW0 flex1 truncate weight="medium">
          {run.url && safeHref(run.url) ? (
            <TextLink href={safeHref(run.url) ?? undefined} target="_blank" rel="noreferrer">
              {run.title ?? 'Untitled'}
            </TextLink>
          ) : (
            (run.title ?? 'Untitled')
          )}
        </Box>
        <Hint as="span" shrink0 size="xs">
          {ageOf(run.queuedAt)}
        </Hint>
      </Box>
      <Hint as="span" size="xs">
        {run.class ? `${CLASS_LABELS[run.class] ?? run.class}: ` : ''}
        {run.reason ?? (run.why === 'new' ? 'A new item.' : run.why === 'answered' ? 'The author answered.' : 'A person asked.')}
      </Hint>
      {run.writes.length > 0 && (
        <Hint as="span" size="xs" data-triage-writes>
          Writes: {run.writes.map((write) => `${write.kind} ${write.state}${write.reason ? ` (${write.reason})` : ''}`).join(', ')}
        </Hint>
      )}
    </Box>
  )
}

export default function TriageAgentView(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => itemsClient(api), [api])
  const confirm = useConfirm()
  const { workspaceId } = props
  const [view, setView] = useState<TriageView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ repository: string | null } | null>(null)
  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      setView(await client.view(workspaceId))
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [client, workspaceId])
  useEffect(() => {
    void load()
  }, [load])
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const stopAll = async () => {
    if (!workspaceId) return
    if (
      !view?.stopAll &&
      !(await confirm({ title: 'Stop the triage agent everywhere?', body: 'No new run starts. A running session finishes, and its writes are held for you.', action: 'Stop all' }))
    )
      return
    await run(() => client.control(workspaceId, view?.stopAll ? 'start' : 'stop'))
  }
  // Set up once: a repository has the agent on, or runs from before.
  const configured = Boolean(view && (view.repositories.some((repo) => repo.settings.agent === 'on') || view.runs.length))
  const blockedOn = (repo: TriageRepository) => Boolean(view?.blocked) && repo.settings.agent === 'on'
  return (
    <Box aria-labelledby="avoozl-triage-title" as="section" flex flexCol gap="3" data-triage-view>
      <ViewHeading
        id="avoozl-triage-title"
        view="github"
        actions={
          workspaceId && (
            <Box as="span" flex items="center" gap="2">
              {configured && !view?.blocked && (
                <Btn type="button" disabled={busy || !view} onClick={() => void stopAll()} data-triage-stop-all>
                  {view?.stopAll ? 'Start again' : 'Stop all'}
                </Btn>
              )}
              <RefreshButton workspaceId={workspaceId} onRefresh={() => void load()} busy={busy} />
            </Box>
          )
        }
      >
        Triage agent
      </ViewHeading>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">
          Choose a workspace in the header.
        </Hint>
      ) : !view ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : (
        <>
          {view.stopAll && (
            <Box role="status" size="sm" tone="danger" data-triage-stopped>
              Stop all is on since {ageOf(view.stopAll)} ago. No new run starts; finished runs hold their writes for you.
            </Box>
          )}
          {view.blocked && (
            <Box role="status" css-border-color="border" border="all" css-border-radius="8" p="3" size="sm" flex flexCol gap="1" data-triage-blocked>
              <Box weight="semibold">Triage is blocked on this machine</Box>
              <span>{view.blocked.reason}</span>
              <Hint size="xs">Set by plugin {view.blocked.plugin}. Avoozl starts no triage run here while it is approved.</Hint>
            </Box>
          )}
          {setup && (
            <TriageSetup
              workspaceId={workspaceId}
              client={client}
              repositories={view.repositories.map((repo) => repo.repository)}
              repository={setup.repository}
              onCancel={() => setSetup(null)}
              onDone={() => (setSetup(null), void load())}
            />
          )}
          {!configured && !view.blocked && !setup && (
            <Box css-border-color="border" css-border-style="dashed" rounded="lg" border="all" p="3" data-triage-empty>
              <EmptyState
                title="Triage is off"
                subtitle="The triage agent reads new issues and pull requests in a repository you pick, and answers, reproduces, reviews or hands each one to you. Nothing about it is set up until you choose to."
                action={
                  view.repositories.length ? (
                    <Btn type="button" primary onClick={() => setSetup({ repository: null })} data-triage-setup-start>
                      Set up triage
                    </Btn>
                  ) : (
                    <Hint size="sm">Register a GitHub repository first.</Hint>
                  )
                }
              />
            </Box>
          )}
          {(configured || view.blocked) && (
            <>
              <Stack gap={2} data-triage-repositories>
                <Box weight="semibold" size="sm">
                  Repositories
                </Box>
                {view.repositories.length === 0 && <Hint size="sm">No GitHub repository is registered.</Hint>}
                {view.repositories.map((repo) => (
                  <Box
                    key={repo.repository}
                    css-border-color="border"
                    border="all"
                    css-border-radius="8"
                    p="2"
                    flex
                    flexWrap
                    items="center"
                    gap="2"
                    size="sm"
                    data-triage-repository={repo.repository}
                  >
                    <Box as="span" weight="medium" minW0 flex1 truncate>
                      {repo.repository}
                    </Box>
                    <Badge variant={repo.on ? (repo.hold ? 'warning' : 'success') : blockedOn(repo) ? 'warning' : 'info'}>
                      {repo.on ? (repo.paused ? 'Paused' : repo.hold ? 'Held' : 'On') : blockedOn(repo) ? 'Blocked' : 'Off'}
                    </Badge>
                    {repo.on && (
                      <Hint size="xs">
                        {repo.left} of {repo.cap} runs left today
                      </Hint>
                    )}
                    {repo.on ? (
                      <>
                        <Btn type="button" disabled={busy} onClick={() => void run(() => client.control(workspaceId, repo.paused ? 'resume' : 'pause', repo.repository))}>
                          {repo.paused ? 'Resume' : 'Pause'}
                        </Btn>
                        <Btn type="button" disabled={busy} onClick={() => void run(() => client.off(workspaceId, repo.repository))} data-triage-off>
                          Turn off
                        </Btn>
                      </>
                    ) : blockedOn(repo) ? (
                      <Btn type="button" disabled={busy} onClick={() => void run(() => client.off(workspaceId, repo.repository))} data-triage-off>
                        Turn off
                      </Btn>
                    ) : (
                      !view.blocked && (
                        <Btn type="button" disabled={busy || Boolean(setup)} onClick={() => setSetup({ repository: repo.repository })} data-triage-setup-open={repo.repository}>
                          Set up
                        </Btn>
                      )
                    )}
                    {repo.hold && repo.on && (
                      <Hint as="span" size="xs" css-flex-basis="100%">
                        {repo.hold}
                      </Hint>
                    )}
                  </Box>
                ))}
              </Stack>
              <Box size="sm" data-triage-calls>
                <Box as="span" weight="semibold">
                  GitHub calls today:{' '}
                </Box>
                {callsLine(view.calls)}
                {view.rate && (
                  <Hint as="span" size="xs">
                    {' '}
                    · {view.rate.remaining} of {view.rate.limit} left this hour
                  </Hint>
                )}
              </Box>
              <Stack gap={1} data-triage-in-progress>
                <Box weight="semibold" size="sm">
                  In progress ({view.inProgress.length})
                </Box>
                {view.inProgress.length ? (
                  <Box as="ul" m0 listNone p="0" flex flexCol>
                    {view.inProgress.map((entry) => (
                      <RunRow key={entry.id} run={entry} />
                    ))}
                  </Box>
                ) : (
                  <Hint size="sm">No run is going now.</Hint>
                )}
              </Stack>
              {view.days.length > 0 && (
                <Stack gap={1} data-triage-days>
                  <Box weight="semibold" size="sm">
                    By day
                  </Box>
                  {view.days.map((day) => (
                    <Box key={day.day} size="sm" flex flexWrap gap="2">
                      <Box as="span" weight="medium">
                        {day.day}
                      </Box>
                      <span>
                        {day.runs} {day.runs === 1 ? 'run' : 'runs'}
                      </span>
                      <Hint as="span" size="xs">
                        {Object.entries(day.byClass)
                          .map(([name, count]) => `${count} ${CLASS_LABELS[name]?.toLowerCase() ?? name}`)
                          .join(', ')}
                        {Object.keys(day.byClass).length ? ' · ' : ''}
                        {Object.entries(day.byState)
                          .map(([name, count]) => `${count} ${RESULT_LABELS[name]?.toLowerCase() ?? name}`)
                          .join(', ')}
                      </Hint>
                    </Box>
                  ))}
                </Stack>
              )}
              <Stack gap={1} data-triage-runs>
                <Box weight="semibold" size="sm">
                  Every run
                </Box>
                {view.runs.length ? (
                  <Box as="ul" m0 listNone p="0" flex flexCol>
                    {view.runs.map((entry) => (
                      <RunRow key={entry.id} run={entry} />
                    ))}
                  </Box>
                ) : (
                  <Hint size="sm">No run yet.</Hint>
                )}
              </Stack>
            </>
          )}
        </>
      )}
    </Box>
  )
}
