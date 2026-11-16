// Dashboards › Lanes: what runs in each lane now, this Mac first, then each
// remote host. One row per live chat: its task, its stage (the chat's role
// and its last status) and how long it has been in that status. Built from
// the reads Home already makes (delivery.view, remote.view); no new read.
import { useCallback, useMemo } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { viewsClient } from './views-api.ts'
import { summarize, type InFlight } from './dashboard-api.ts'
import { duration } from './task-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { SectionHeading, ViewHeading } from './controls.tsx'

export const THIS_MAC = 'This Mac'

// Lanes by host: this Mac's chats, then each remote host's, by name.
export function lanesByHost(rows: InFlight[]): { host: string; rows: InFlight[] }[] {
  const hosts = new Map<string, InFlight[]>()
  for (const row of rows) {
    const host = row.remote?.host ?? THIS_MAC
    if (!hosts.has(host)) hosts.set(host, [])
    hosts.get(host)!.push(row)
  }
  return [...hosts]
    .map(([host, list]) => ({ host, rows: list }))
    .sort((a, b) => Number(b.host === THIS_MAC) - Number(a.host === THIS_MAC) || a.host.localeCompare(b.host))
}

export const stageOf = (row: InFlight) => [row.role, row.status].filter(Boolean).join(' · ') || 'running'

export default function LanesView(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const drawer = useTaskDrawer()
  const load = useCallback(
    async (id: string) => {
      const [delivery, remote] = await Promise.all([views.delivery(id), views.remote(id).then((r) => r.workers, () => [])])
      return summarize({ graph: null, delivery, conflicts: null, plans: null, remote, limit: Infinity }).inFlight
    },
    [views],
  )
  const { value, error } = useRead(props.workspaceId, load)
  const now = Date.now()
  const lanes = value ? lanesByHost(value) : []
  return (
    <section aria-labelledby="avoozl-lanes-title" className="flex flex-col gap-3.5" data-lanes>
      <ViewHeading id="avoozl-lanes-title" view="lanes">
        Lanes
      </ViewHeading>
      <p className="text-xs text-muted" data-lanes-missing>
        Lane numbers and per-stage start times are not recorded yet; time is since the chat's last status change.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!value ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : lanes.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Nothing runs in any lane now.</p>
        </Card>
      ) : (
        lanes.map((lane) => (
          <Card key={lane.host}>
            <SectionHeading level={3} title={`${lane.host} (${lane.rows.length})`} className="mb-2" />
            <ul className="flex flex-col" data-lane-host={lane.host}>
              {lane.rows.map((row) => (
                <li key={row.slot} data-lane-row className="flex min-w-0 items-center gap-3 border-t py-1.5 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => drawer.openTask(row.taskId)}>
                    {row.title}
                  </button>
                  <span className="shrink-0 text-xs text-muted" data-lane-stage>
                    {stageOf(row)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted" data-lane-time>
                    {duration(row.lastAt, now) || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </section>
  )
}
