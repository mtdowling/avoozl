// The Activity tab (design §4.19, R71): who did what in this workspace, from
// the page, the CLI, MCP, GitHub and plugin sync, newest first, 100 rows at a
// time. A task row opens the drawer; a GitHub row opens GitHub in a new tab.
// Rows hold only IDs and Avoozl's own summaries; a row the content rules
// caught says it was redacted.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import { Card, EmptyState } from '@kirocrew/app-sdk/ui'
import { Section } from './SettingsView.tsx'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { FilterPanel, useStoredFilter } from './FilterPanel.tsx'
import { IconLabel, ShowMore, TipBtn, ViewHeading } from './controls.tsx'
import { selectStyle } from './FilterSelect.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { relativeTime } from './task-api.ts'
import { History, RefreshCw } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import {
  ACTIVITY_FILTER_STORE,
  SOURCE_LABELS,
  activityClient,
  filterActive,
  filterOptions,
  retentionInput,
  rowTarget,
  type ActivityFilter,
  type ActivityPage,
  type ActivityRow,
  type ActivitySettings,
} from './activity-api.ts'

const HEAD: CSSProperties = { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--muted)', padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const CELL: CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'top' }

function When({ at, now }: { at: string; now: number }) {
  return (
    <Tooltip text={at.replace('T', ' ').slice(0, 19)}>
      <span className="tabular-nums">{relativeTime(at, now)}</span>
    </Tooltip>
  )
}

function Summary({ row }: { row: ActivityRow }) {
  if (row.redacted)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5" data-activity-redacted>
        <Badge variant="warning">Redacted</Badge>
        <span className="text-muted">{row.summary}</span>
      </span>
    )
  return <span style={{ overflowWrap: 'anywhere' }}>{row.summary}</span>
}

// The target: a button that opens the task drawer, or a link that opens
// GitHub in a new tab.
function Target({ row }: { row: ActivityRow }) {
  const drawer = useTaskDrawer()
  const target = rowTarget(row)
  if (!target) return <span className="text-muted">{row.targetId ?? ''}</span>
  if (target.kind === 'task')
    return (
      <button type="button" className="underline" onClick={() => drawer.openTask(target.id)} aria-label={`View task ${target.id}`} data-activity-task>
        {target.id}
      </button>
    )
  return (
    <a href={linkHref(target.href)} target="_blank" rel="noopener noreferrer" className="underline" data-activity-link>
      {row.targetId ?? 'Open on GitHub'}
    </a>
  )
}

function Table({ rows, now }: { rows: ActivityRow[]; now: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }} data-activity-table>
        <thead>
          <tr>
            <th style={HEAD}>When</th>
            <th style={HEAD}>Source</th>
            <th style={HEAD}>Who</th>
            <th style={HEAD}>What</th>
            <th style={HEAD}>Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seq} data-activity-row={row.seq}>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <When at={row.at} now={now} />
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{SOURCE_LABELS[row.source] ?? row.source}</td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{row.actor ?? ''}</td>
              <td style={{ ...CELL, minWidth: '16rem' }}>
                <Summary row={row} />
                <div className="text-xs text-muted">{row.kind}</div>
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <Target row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Narrow screens: one stacked row per entry, same parts.
function Stack({ rows, now }: { rows: ActivityRow[]; now: number }) {
  return (
    <ul className="flex flex-col" data-activity-stack>
      {rows.map((row) => (
        <li key={row.seq} className="flex flex-col gap-1 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }} data-activity-row={row.seq}>
          <Summary row={row} />
          <span className="text-xs text-muted">
            <When at={row.at} now={now} /> · {SOURCE_LABELS[row.source] ?? row.source}
            {row.actor ? ` · ${row.actor}` : ''} · {row.kind}
          </span>
          <span className="text-xs">
            <Target row={row} />
          </span>
        </li>
      ))}
    </ul>
  )
}

// Keep activity: how many days rows stay. A person saves it; the tick
// deletes older rows.
function KeepActivity({ workspaceId, onSaved }: { workspaceId: string; onSaved: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => activityClient(api), [api])
  const [settings, setSettings] = useState<ActivitySettings | null>(null)
  const [text, setText] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    try {
      const read = await client.settings(workspaceId)
      setSettings(read)
      setText(read.retentionDays === read.default ? '' : String(read.retentionDays))
    } catch (caught) {
      setNote({ ok: false, text: errorMessage(caught) })
    }
  }, [client, workspaceId])
  useEffect(() => {
    void load()
  }, [load])
  const parsed = retentionInput(text)
  const save = async () => {
    if (!settings || parsed.error) return
    setSaving(true)
    setNote(null)
    try {
      const saved = await client.saveSettings(workspaceId, parsed.days, settings.hash)
      setSettings(saved)
      setNote({ ok: true, text: `Saved. Activity is kept ${saved.retentionDays} days.` })
      onSaved()
    } catch (caught) {
      setNote({ ok: false, text: errorMessage(caught) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card className="mt-4">
    <Section level="card" title="Keep activity" blurb="Saved to .avoozl.json. Each tick deletes rows older than this.">
      <div className="flex flex-col gap-2" data-activity-keep>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor="avoozl-activity-keep" className="flex flex-col gap-1 text-sm">
          <span>Days (optional)</span>
          <input
            id="avoozl-activity-keep"
            type="number"
            min={1}
            max={365}
            value={text}
            placeholder={String(settings?.default ?? 30)}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={parsed.error ? true : undefined}
            aria-describedby={parsed.error ? 'avoozl-activity-keep-error' : undefined}
            className="rounded border px-2 py-1 text-sm"
            style={{ ...selectStyle, width: '6rem' }}
          />
        </label>
        <TipBtn primary tooltip="Save how many days activity is kept" onClick={() => void save()} disabled={!settings || saving || Boolean(parsed.error)}>
          Save
        </TipBtn>
      </div>
      {parsed.error && (
        <p id="avoozl-activity-keep-error" role="alert" className="text-xs text-danger">
          {parsed.error}
        </p>
      )}
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={`text-xs ${note.ok ? 'text-muted' : 'text-danger'}`}>
          {note.text}
        </p>
      )}
      </div>
    </Section>
    </Card>
  )
}

export default function ActivityView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => activityClient(api), [api])
  const [filter, setFilter] = useStoredFilter<ActivityFilter>(workspaceId, ACTIVITY_FILTER_STORE)
  const [page, setPage] = useState<ActivityPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const narrow = useMedia('(max-width: 767px)')
  const now = Date.now()
  const key = JSON.stringify(filter)

  // The first 100 rows for this filter; Show more adds the next 100.
  const load = useCallback(async () => {
    if (!workspaceId) return
    setBusy(true)
    setError(null)
    try {
      setPage(await client.list(workspaceId, JSON.parse(key) as ActivityFilter))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [client, workspaceId, key])
  useEffect(() => {
    setPage(null)
    void load()
  }, [load])
  const more = async () => {
    if (!workspaceId || !page) return
    setBusy(true)
    try {
      const next = await client.list(workspaceId, filter, page.items.length)
      setPage({ ...next, items: [...page.items, ...next.items.filter((row) => !page.items.some((had) => had.seq === row.seq))] })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const options = filterOptions(page, filter)
  const setField = (change: Partial<ActivityFilter>) => setFilter({ ...filter, ...change })
  const rows = page?.items ?? []

  return (
    <section aria-labelledby="avoozl-activity-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-activity-title"
        view="activity"
        actions={
          <IconLabel icon={RefreshCw} onClick={() => void load()} disabled={busy || !workspaceId} tooltip="Read the activity log again">
            Refresh
          </IconLabel>
        }
      >
        Activity
      </ViewHeading>
      <p className="text-sm text-muted">
        What people, sessions, GitHub and plugins did in this workspace. Rows hold IDs and short summaries only; a row the content rules caught is kept as redacted.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <FilterPanel
        id="avoozl-activity"
        label="Filter activity"
        active={filterActive(filter)}
        onClear={() => setFilter({})}
        fields={[
          { kind: 'select', key: 'source', label: 'Source', value: filter.source ?? '', options: options.sources, onChange: (source) => setField({ source: source || undefined }) },
          { kind: 'select', key: 'kind', label: 'Kind', value: filter.kind ?? '', options: options.kinds, onChange: (kind) => setField({ kind: kind || undefined }) },
          { kind: 'select', key: 'actor', label: 'Who', value: filter.actor ?? '', options: options.actors, onChange: (actor) => setField({ actor: actor || undefined }) },
        ]}
      >
        <p role="status" className="text-xs text-muted">
          {page ? `${page.total} ${page.total === 1 ? 'entry' : 'entries'}${filterActive(filter) ? ' match' : ''} · kept ${page.retentionDays} days` : busy ? 'Loading…' : 'Not loaded'}
        </p>
      </FilterPanel>
      {page && rows.length === 0 ? (
        <EmptyState
          icon={<History size={36} aria-hidden="true" />}
          title={filterActive(filter) ? 'No activity matches these filters' : 'No activity yet'}
          subtitle={filterActive(filter) ? 'Clear the filters to see every entry.' : 'Starting work, stopping the line, approving and saving settings show here, and so do the closes, board moves and labels the tick reads.'}
        />
      ) : narrow ? (
        <Stack rows={rows} now={now} />
      ) : (
        <Table rows={rows} now={now} />
      )}
      {page && <ShowMore left={page.total - rows.length} onMore={() => void more()} />}
      {workspaceId && <KeepActivity workspaceId={workspaceId} onSaved={() => void load()} />}
    </section>
  )
}
