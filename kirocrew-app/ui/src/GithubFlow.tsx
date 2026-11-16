// Flow from GitHub data (RC8.4): the stage waits of finished Issue Radar
// issues, from GitHub's own times. The numbers come from the backend; this
// draws them. Hidden until a Radar repository has been read once.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { SectionHeading } from './controls.tsx'
import { useRead } from './useRead.ts'
import { buildMedian, buildsLine, costliestLine, flowRows, githubFlowClient, span, summaryLine } from './radar-flow-api.ts'

export default function GithubFlow({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => githubFlowClient(api), [api])
  // Read again changes `presses`, which makes the next read ask GitHub.
  const [presses, setPresses] = useState(0)
  const load = useCallback((id: string) => client.read(id, presses > 0), [client, presses])
  const { value: view, error, busy } = useRead(workspaceId, load)
  if (!view || (!view.repositories.length && !error)) return null
  const rows = flowRows(view),
    widest = Math.max(1, ...(view.median ?? [0]))
  return (
    <Card className="flex flex-col gap-2">
      <div data-github-flow className="flex flex-col gap-2">
        <SectionHeading title="From GitHub" />
        <p className="text-sm text-muted">{summaryLine(view)}. Times are GitHub's.</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((row, index) => (
            <li key={row.name} data-flow-stage={row.name} className="flex flex-wrap items-center gap-2 text-sm">
              <span style={{ flex: '0 0 9rem' }}>{row.name}</span>
              <span
                aria-hidden="true"
                style={{
                  flex: '1 1 6rem',
                  height: 8,
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--muted) 15%, transparent)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    borderRadius: 4,
                    width: `${(100 * (view.median?.[index] ?? 0)) / widest}%`,
                    background: row.slowest ? 'var(--accent)' : 'var(--muted)',
                  }}
                />
              </span>
              <span className="tabular-nums">{row.median}</span>
              {row.slowest && <Badge variant="warning">Slowest</Badge>}
            </li>
          ))}
        </ul>
        {view.builds && view.builds.count > 0 && (
          <div data-flow-builds className="flex flex-col gap-1">
            <h3 className="m-0 text-sm font-semibold">Builds</h3>
            <p className="text-xs text-muted">{buildsLine(view.builds)}. From every build record of each merged pull request.</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-flow-build-prs style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.builds.recent.map((row) => (
                <li key={`${row.repository}-${row.pr}`} data-flow-build-pr={row.pr} className="flex flex-wrap items-center gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                  <span>{row.repository ? `${row.repository} ` : ''}#{row.pr}</span>
                  <span className="tabular-nums">{buildMedian(row.totalMs)}</span>
                  <span data-flow-costliest className="text-muted">
                    costliest {costliestLine(row)}
                  </span>
                  {row.failedMs > 0 && <Badge variant="danger">{buildMedian(row.failedMs)} failed</Badge>}
                </li>
              ))}
            </ul>
            <p className="m-0 text-xs text-muted">Median per phase, target and start, without failed attempts.</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.builds.byPhase.map((row) => (
                <li key={`${row.phase}-${row.target}-${row.start}`} data-flow-build={row.phase} className="flex flex-wrap gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                  <span>{row.phase}</span>
                  <span>{row.target}</span>
                  <span className="text-muted">{row.start}</span>
                  <span className="tabular-nums">{buildMedian(row.medianMs)}</span>
                  <span className="text-muted">{row.count} {row.count === 1 ? 'build' : 'builds'}</span>
                </li>
              ))}
            </ul>
            {view.builds.byInstance.length > 1 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" data-flow-instances style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {view.builds.byInstance.map((row) => (
                  <li key={row.instance ?? 'none'} className="flex flex-wrap gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                    <span>{row.name ?? row.instance ?? 'No instance'}</span>
                    <span className="tabular-nums">{buildMedian(row.medianMs)}</span>
                    <span className="text-muted">{row.count} {row.count === 1 ? 'pull request' : 'pull requests'}, {span(row.totalMs)} in all</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {view.skipped.length > 0 && <p className="text-xs text-muted">Left out for a missing or unordered time: {view.skipped.map((s) => `#${s.number}`).join(', ')}.</p>}
        {[...view.errors.map((e) => `${e.repository}: ${e.error}`), ...(error ? [error] : [])].map((text) => (
          <p key={text} role="alert" className="text-xs text-danger">
            {text}
          </p>
        ))}
        <p className="flex items-center gap-2 text-xs text-muted">
          {view.readAt ? `Read ${span(Date.now() - Date.parse(view.readAt))} ago.` : ''}
          <Btn type="button" disabled={busy} onClick={() => setPresses((n) => n + 1)}>
            {busy ? 'Reading…' : 'Read again'}
          </Btn>
        </p>
      </div>
    </Card>
  )
}
