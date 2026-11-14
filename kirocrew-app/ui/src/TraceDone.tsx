// Trace's Done work (experience proposal, Trace mockup): the pull requests
// GitHub says merged, newest first, who did each one, and a link to its Trace.
// It answers what a delivery list used to, so nothing separate is kept. In the
// demo the sample's crew machines (useDemoFixtures) are named too. Read only.
import { useCallback, useMemo } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import { SectionHeading } from './controls.tsx'
import { useDemoFixtures } from './Demo.tsx'
import { RefreshCw } from './icons.ts'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { clock, type TraceTarget } from './trace-api.ts'
import { epicsClient, whoLine, type DoneRow } from './epics-api.ts'
import { linkHref } from './views-api.ts'

function Row({ row, machine, onPick }: { row: DoneRow; machine: string | null; onPick?: (target: TraceTarget) => void }) {
  const pr = linkHref(row.prUrl),
    issue = linkHref(row.url)
  return (
    <li data-done-row={row.taskId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
      <span className="min-w-0 flex-1" style={{ flex: '1 1 240px', overflowWrap: 'anywhere' }}>
        <span className="font-medium">{row.title}</span> <span className="text-xs text-muted">{row.taskId}</span>
        <span data-done-who className="block text-xs text-muted">
          {whoLine(row, machine)}
        </span>
      </span>
      <span data-done-time className="text-xs text-muted">
        Merged {clock(row.mergedAt)}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 text-sm">
        {pr && (
          <a href={linkHref(row.prUrl)} target="_blank" rel="noreferrer" className="underline">
            PR #{row.pr}
          </a>
        )}
        {issue && (
          <a href={linkHref(row.url)} target="_blank" rel="noreferrer" className="underline">
            Issue #{row.issue}
          </a>
        )}
        {onPick && (
          <Btn type="button" aria-label={`Trace of ${row.title}`} onClick={() => onPick({ repository: row.repository, number: row.issue })}>
            Trace
          </Btn>
        )}
      </span>
    </li>
  )
}

export default function TraceDone(props: { workspaceId: string | null; onPick?: (target: TraceTarget) => void; onOpenEpics?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => epicsClient(api), [api])
  const load = useCallback((id: string) => client.done(id), [client])
  const { value, error, busy, reload } = useRead(props.workspaceId, load)
  const fixtures = useDemoFixtures()
  const machineOf = (row: DoneRow) => fixtures?.recentMerges.find((merge) => merge.pr === row.pr)?.machine ?? null
  return (
    <section data-trace-done aria-labelledby="avoozl-done-title" className="flex flex-col gap-2">
      <SectionHeading
        id="avoozl-done-title"
        level={3}
        title="Done work"
        blurb="Pull requests GitHub says merged for tasks of an approved spec, newest first."
        actions={
          <Btn type="button" onClick={() => void reload()} disabled={busy} aria-label="Refresh done work">
            <RefreshCw size={14} aria-hidden="true" />
          </Btn>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!value && !error && <p className="text-sm text-muted">Reading merges…</p>}
      {value && !value.rows.length && (
        <Card>
          <div data-done-empty className="flex flex-col items-start gap-2 p-1">
            <p className="m-0 font-medium">Nothing has merged yet</p>
            <p className="m-0 text-sm text-muted">Merged work shows here once a crew's pull request for an approved spec lands. Approve a spec and let a crew build it.</p>
            {props.onOpenEpics && (
              <Btn type="button" onClick={props.onOpenEpics}>
                Open Epics
              </Btn>
            )}
          </div>
        </Card>
      )}
      {value && value.rows.length > 0 && (
        <ul className="m-0 list-none p-0">
          {value.rows.map((row) => (
            <Row key={row.taskId} row={row} machine={machineOf(row)} onPick={props.onPick} />
          ))}
        </ul>
      )}
    </section>
  )
}
