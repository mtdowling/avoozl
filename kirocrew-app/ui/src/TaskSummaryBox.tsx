// The AI summary on a task's Overview tab, the same pattern as the spec
// summary: the data shows first, the shared purple "AI working" box shows
// while the summary is written, and the text replaces it. The backend caches
// one summary per task by a hash of the inputs, so reopening asks for nothing
// new; the page asks once per hash and then reads the same answer until it
// lands. A failure is a muted line with Retry and never blocks the view.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppApi } from './host.ts'
import { ReviewWorking, REVIEW_POLL_MS } from './PlanReviewSummary.tsx'
import { taskClient, type TaskSummary } from './task-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'

const PROSE_MEASURE = '80ch'

export function TaskSummaryBox(props: { workspaceId: string; id: string; summary: TaskSummary | undefined }) {
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const [now, setNow] = useState<TaskSummary | 'error' | null>(props.summary ?? null)
  // The inputs asked for already, so a re-render never asks twice.
  const asked = useRef<string | null>(null)
  const hash = props.summary?.hash ?? null
  useEffect(() => {
    setNow(props.summary ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, props.summary?.state])
  const ask = (retry: boolean) => {
    tasks.summaryRequest(props.workspaceId, props.id, retry).then(setNow, () => setNow('error'))
  }
  useEffect(() => {
    // An older backend sends no summary: nothing to ask.
    if (!props.summary || props.summary.state !== 'none' || asked.current === props.summary.hash) return
    asked.current = props.summary.hash
    ask(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, props.summary?.state])
  const working = now !== 'error' && now?.state === 'working'
  useEffect(() => {
    if (!working) return
    const timer = setInterval(() => ask(false), REVIEW_POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working])
  if (!props.summary) return null
  const failed = now === 'error' || now?.state === 'failed'
  return (
    <Stack data-task-summary gap={2}>
      {working || (now !== 'error' && now?.state === 'none') ? (
        <ReviewWorking model={null} title="AI working" label="Writing a short summary of this task…" />
      ) : now && now !== 'error' && now.state === 'ready' ? (
        <p className="m-0 text-sm" data-task-summary-text style={{ maxWidth: PROSE_MEASURE }}>
          {now.text}
        </p>
      ) : failed ? (
        <Hint as="p" size="sm" flush data-task-summary-fallback>
          Summary unavailable{' '}
          <button type="button" className="underline underline-offset-2" style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer' }} data-task-summary-retry onClick={() => ask(true)}>
            Retry
          </button>
        </Hint>
      ) : null}
    </Stack>
  )
}
