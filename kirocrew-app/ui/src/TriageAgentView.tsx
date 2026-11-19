// The Triage agent page (triage-agent TA6, TA10.7): what the agent is
// doing and has done, each repository's cap and Pause, Stop all, and the
// GitHub calls triage used today. Turning the agent on for a repository
// asks whether it takes the open items already there (TA1.1).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { RefreshButton } from './RefreshButton.tsx'
import { ViewHeading, useConfirm } from './ui/controls.tsx'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { Stack } from './ui/Stack'
import Badge from './ui/Badge.tsx'
import { TextLink } from './ui/TextLink'
import { safeHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { CLASS_LABELS, RESULT_LABELS, ageOf, callsLine, itemsClient, type RunView, type TriageView } from './github-items-api.ts'

function RunRow(props: { run: RunView }) {
  const { run } = props
  const href = run.url ? safeHref(run.url) : null
  return (
    <Box as="li" css-border-color="border" border="t" firstBorderT0 py="1.5" flex flexCol gap="0.5" data-triage-run={run.id}>
      <Box as="span" flex minW0 items="center" gap="2" size="sm">
        <Badge variant={run.state === 'failed' || run.state === 'held' ? 'warning' : run.state === 'done' ? 'success' : 'info'}>{RESULT_LABELS[run.state] ?? run.state}</Badge>
        <Box as="span" shrink0 tone="muted" size="xs">
          {run.repository}#{run.number}
        </Box>
        <Box as="span" minW0 flex1 truncate weight="medium">
          {href ? (
            <TextLink href={href} target="_blank" rel="noreferrer">
              {run.title ?? 'Untitled'}
            </TextLink>
          ) : (
            (run.title ?? 'Untitled')
          )}
        </Box>
        <Box as="span" shrink0 tone="muted" size="xs">
          {ageOf(run.queuedAt)}
        </Box>
      </Box>
      <Box as="span" size="xs" tone="muted">
        {run.class ? `${CLASS_LABELS[run.class] ?? run.class}: ` : ''}
        {run.reason ?? (run.why === 'new' ? 'A new item.' : run.why === 'answered' ? 'The author answered.' : 'A person asked.')}
      </Box>
      {run.writes.length > 0 && (
        <Box as="span" size="xs" tone="muted" data-triage-writes>
          Writes: {run.writes.map((write) => `${write.kind} ${write.state}${write.reason ? ` (${write.reason})` : ''}`).join(', ')}
        </Box>
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
  const [asking, setAsking] = useState<string | null>(null)
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
  return (
    <Box aria-labelledby="avoozl-triage-title" as="section" flex flexCol gap="3" data-triage-view>
      <ViewHeading
        id="avoozl-triage-title"
        view="github"
        actions={
          workspaceId && (
            <Box as="span" flex items="center" gap="2">
              <Btn type="button" disabled={busy || !view} onClick={() => void stopAll()} data-triage-stop-all>
                {view?.stopAll ? 'Start again' : 'Stop all'}
              </Btn>
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
                <Badge variant={repo.on ? (repo.hold ? 'warning' : 'success') : 'info'}>{repo.on ? (repo.paused ? 'Paused' : repo.hold ? 'Held' : 'On') : 'Off'}</Badge>
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
                    <Btn type="button" disabled={busy} onClick={() => void run(() => client.settings(workspaceId, repo.repository, { agent: 'off' }))}>
                      Turn off
                    </Btn>
                  </>
                ) : asking === repo.repository ? (
                  <Box as="span" flex flexWrap items="center" gap="2" data-triage-ask>
                    <span>Take the open items already there?</span>
                    <Btn
                      type="button"
                      primary
                      disabled={busy}
                      onClick={() => void run(async () => (await client.settings(workspaceId, repo.repository, { agent: 'on', existing: 'take' }), setAsking(null)))}
                    >
                      Take them
                    </Btn>
                    <Btn
                      type="button"
                      disabled={busy}
                      onClick={() => void run(async () => (await client.settings(workspaceId, repo.repository, { agent: 'on', existing: 'skip' }), setAsking(null)))}
                    >
                      Only new ones
                    </Btn>
                  </Box>
                ) : (
                  <Btn type="button" disabled={busy} onClick={() => setAsking(repo.repository)}>
                    Turn on
                  </Btn>
                )}
                {repo.hold && repo.on && (
                  <Box as="span" size="xs" tone="muted" css-flex-basis="100%">
                    {repo.hold}
                  </Box>
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
              <Hint size="sm">No run yet. Turn the agent on for a repository to start.</Hint>
            )}
          </Stack>
        </>
      )}
    </Box>
  )
}
