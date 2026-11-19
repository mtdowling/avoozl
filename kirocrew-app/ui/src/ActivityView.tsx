// The Activity tab (design §4.19, R71): who did what in this workspace, from
// the page, the CLI, MCP, GitHub and plugin sync, newest first, 100 rows at a
// time. A task row opens the drawer; a GitHub row opens GitHub in a new tab.
// Rows hold only IDs and Avoozl's own summaries; a row the content rules
// caught says it was redacted.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import { EmptyState } from './ui/EmptyState'
import Badge from './ui/Badge.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { useStoredFilter } from './FilterPanel.tsx'
import { NavSlotFor } from './nav-slot.tsx'
import { RailBlock, RailChips, RailRow, RailStyle } from './NavRail.tsx'
import { ShowMore, ViewHeading } from './ui/controls.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { relativeTime } from './task-api.ts'
import { useRefreshCountdown } from './RefreshButton.tsx'
import { usePublishRefresh } from './page-refresh.tsx'
import { Clock, History, ListFilter, Tag, Users, X } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import {
  ACTIVITY_FILTER_STORE,
  SOURCE_LABELS,
  activityClient,
  filterActive,
  filterChoices,
  githubItem,
  retentionAutosave,
  retentionInput,
  rowTarget,
  type ActivityFilter,
  type ActivityPage,
  type ActivityRow,
} from './activity-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { PlainButton, PlainInput } from './ui/Plain'


function When({ at, now }: { at: string; now: number }) {
  return (
    <Tooltip text={at.replace('T', ' ').slice(0, 19)}>
      <Box as="span" tabularNums>{relativeTime(at, now)}</Box>
    </Tooltip>
  )
}

function Summary({ row }: { row: ActivityRow }) {
  if (row.redacted)
    return (
      <Box as="span" inlineFlex flexWrap items="center" gap="1.5" data-activity-redacted>
        <Badge variant="warning">Redacted</Badge>
        <Hint>{row.summary}</Hint>
      </Box>
    )
  const item = githubItem(row)
  if (item)
    return (
      <Box as="span" css-overflow-wrap="anywhere">
        {item.before}
        <TextLink href={linkHref(item.href)} target="_blank" rel="noopener noreferrer" data-activity-item>
          {item.text}
        </TextLink>
        {item.after}
      </Box>
    )
  return <Box as="span" css-overflow-wrap="anywhere">{row.summary}</Box>
}

// The target: a button that opens the task drawer, or a link that opens
// GitHub in a new tab.
function Target({ row }: { row: ActivityRow }) {
  const drawer = useTaskDrawer()
  const target = rowTarget(row)
  if (!target) return <Hint>{row.targetId ?? ''}</Hint>
  if (target.kind === 'task')
    return (
      <PlainButton type="button" underline onClick={() => drawer.openTask(target.id)} aria-label={`View task ${target.id}`} data-activity-task>
        {target.id}
      </PlainButton>
    )
  return (
    <TextLink href={linkHref(target.href)} target="_blank" rel="noopener noreferrer" data-activity-link>
      {row.targetId ?? 'Open on GitHub'}
    </TextLink>
  )
}

function Table({ rows, now }: { rows: ActivityRow[]; now: number }) {
  return (
    <Box css-overflow-x="auto">
      <Box as="table" css-border-collapse="collapse" wFull size="sm" data-activity-table>
        <thead>
          <tr>
            <Box as="th" css-text-align="left" css-font-weight="500" css-font-size="12" css-color="muted" css-padding="4px-8px" css-border-bottom="1px-solid-border" css-white-space="nowrap">When</Box>
            <Box as="th" css-text-align="left" css-font-weight="500" css-font-size="12" css-color="muted" css-padding="4px-8px" css-border-bottom="1px-solid-border" css-white-space="nowrap">Source</Box>
            <Box as="th" css-text-align="left" css-font-weight="500" css-font-size="12" css-color="muted" css-padding="4px-8px" css-border-bottom="1px-solid-border" css-white-space="nowrap">Who</Box>
            <Box as="th" css-text-align="left" css-font-weight="500" css-font-size="12" css-color="muted" css-padding="4px-8px" css-border-bottom="1px-solid-border" css-white-space="nowrap">What</Box>
            <Box as="th" css-text-align="left" css-font-weight="500" css-font-size="12" css-color="muted" css-padding="4px-8px" css-border-bottom="1px-solid-border" css-white-space="nowrap">Target</Box>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seq} data-activity-row={row.seq}>
              <Box as="td" css-padding="6px-8px" css-border-top="1px-solid-border" css-vertical-align="top" css-white-space="nowrap">
                <When at={row.at} now={now} />
              </Box>
              <Box as="td" css-padding="6px-8px" css-border-top="1px-solid-border" css-vertical-align="top" css-white-space="nowrap">{SOURCE_LABELS[row.source] ?? row.source}</Box>
              <Box as="td" css-padding="6px-8px" css-border-top="1px-solid-border" css-vertical-align="top" css-white-space="nowrap">{row.actor ?? ''}</Box>
              <Box as="td" css-padding="6px-8px" css-border-top="1px-solid-border" css-vertical-align="top" css-min-width="16rem">
                <Summary row={row} />
                <Hint as="div" size="xs">{row.kind}</Hint>
              </Box>
              <Box as="td" css-padding="6px-8px" css-border-top="1px-solid-border" css-vertical-align="top" css-white-space="nowrap">
                <Target row={row} />
              </Box>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  )
}

// Narrow screens: one stacked row per entry, same parts.
function Stack({ rows, now }: { rows: ActivityRow[]; now: number }) {
  return (
    <Box as="ul" flex flexCol data-activity-stack>
      {rows.map((row) => (
        <Box key={row.seq} as="li" css-border-color="border" flex flexCol gap="1" border="t" py="2" size="sm" firstBorderT0 data-activity-row={row.seq}>
          <Summary row={row} />
          <Hint size="xs">
            <When at={row.at} now={now} /> · {SOURCE_LABELS[row.source] ?? row.source}
            {row.actor ? ` · ${row.actor}` : ''} · {row.kind}
          </Hint>
          <Box as="span" size="xs">
            <Target row={row} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

// Keep activity: how many days rows stay. It saves by itself after a pause
// and at once on blur or Enter; the tick deletes older rows.
function KeepActivity({ workspaceId, onSaved }: { workspaceId: string; onSaved: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => activityClient(api), [api])
  const [defaultDays, setDefaultDays] = useState(30)
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const hash = useRef<string | null>(null)
  const savedText = useRef('')
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const shown = (read: { retentionDays: number; default: number }) => (read.retentionDays === read.default ? '' : String(read.retentionDays))
  const auto = useRef<ReturnType<typeof retentionAutosave> | null>(null)
  const load = useCallback(async () => {
    try {
      const read = await client.settings(workspaceId)
      hash.current = read.hash
      setDefaultDays(read.default)
      const value = shown(read)
      savedText.current = value
      auto.current?.reset(value)
      setText(value)
      setLoaded(true)
      return true
    } catch (caught) {
      setNote({ ok: false, text: errorMessage(caught) })
      return false
    }
  }, [client, workspaceId])
  if (!auto.current) {
    auto.current = retentionAutosave({
      save: (days) => {
        const sent = days === null ? '' : String(days)
        setNote({ ok: true, text: 'Saving…' })
        client
          .saveSettings(workspaceId, days, hash.current)
          .then((saved) => {
            hash.current = saved.hash
            savedText.current = sent
            setNote({ ok: true, text: 'Saved' })
            onSavedRef.current()
          })
          .catch(async (caught) => {
            auto.current?.reset(savedText.current)
            if ((caught as { status?: unknown })?.status === 409 && (await load())) setNote({ ok: false, text: 'Changed elsewhere. Showing the saved value.' })
            else setNote({ ok: false, text: errorMessage(caught) })
          })
      },
    })
  }
  useEffect(() => {
    setLoaded(false)
    void load()
    return () => auto.current?.cancel()
  }, [load])
  const parsed = retentionInput(text)
  return (
    // One row under the Keep activity header, lined up with the rail's
    // search box: the days, the word, and a quiet status; errors under it.
    <Box data-activity-keep data-section="Keep activity" flex flexCol gap="1">
      <Row gap={2} wrap={false}>
        <Box htmlFor="avoozl-activity-keep" as="label" srOnly>
          Keep activity (days)
        </Box>
        <Tooltip text="Saved to .avoozl.json. Each tick deletes rows older than this. Blank uses the default.">
          <PlainInput
            id="avoozl-activity-keep"
            type="number"
            min={1}
            max={365}
            value={text}
            disabled={!loaded}
            placeholder={String(defaultDays)}
            onChange={(event) => {
              setText(event.target.value)
              setNote(null)
              auto.current?.change(event.target.value)
            }}
            onBlur={() => auto.current?.flush(text)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') auto.current?.flush(text)
            }}
            aria-invalid={parsed.error ? true : undefined}
            aria-describedby={parsed.error ? 'avoozl-activity-keep-error' : undefined}
            css-width="4.5rem" css-box-sizing="border-box" css-font-size="13" css-padding="4px-8px" css-border-radius="6" css-background="bg" css-color="text" css-border="1px-solid-border"
          />
        </Tooltip>
        <Box as="span" css-font-size="13" css-color="muted">days</Box>
        {note && !parsed.error && (
          <Box role={note.ok ? 'status' : 'alert'} as="span" ml="auto" size="xs" tone={note.ok ? 'muted' : 'danger'}>
            {note.text}
          </Box>
        )}
      </Row>
      {parsed.error && (
        <ErrorText id="avoozl-activity-keep-error" role="alert" size="xs">
          {parsed.error}
        </ErrorText>
      )}
    </Box>
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
  usePublishRefresh(useRefreshCountdown(workspaceId, () => void load(), busy || !workspaceId))
  const choices = filterChoices(page, filter)
  const setField = (change: Partial<ActivityFilter>) => setFilter({ ...filter, ...change })
  const rows = page?.items ?? []

  return (
    <Box aria-labelledby="avoozl-activity-title" as="section" flex flexCol gap="3.5">
      {/* Refresh, with its countdown, sits on the top line beside the pause
          icon, as on Home (page-refresh.tsx). */}
      <ViewHeading id="avoozl-activity-title" view="activity">
        Activity
      </ViewHeading>
      <Hint as="p" size="sm">
        What people, sessions, GitHub and plugins did in this workspace. Rows hold IDs and short summaries only; a row the content rules caught is kept as redacted.
      </Hint>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {/* The filters and Keep activity sit in the left nav under the open
          Activity section (nav-slot.tsx), as rows and chips like the Specs
          rail (NavRail.tsx): no dropdowns. The count stays here. */}
      <NavSlotFor section="activity">
        <div role="search" aria-label="Filter activity" data-nav-filters="avoozl-activity" data-filter-panel="avoozl-activity" data-rail>
          <RailStyle />
          <RailBlock
            first
            id="source"
            icon={ListFilter}
            title="Source"
            action={
              filterActive(filter) && (
                <PlainButton type="button" data-rail-icon onClick={() => setFilter({})} css-gap="2" css-align-items="center" css-font-size="12">
                  <X size={11} aria-hidden="true" /> Clear
                </PlainButton>
              )
            }
          >
            <RailRow label="All" active={!filter.source} onClick={() => setField({ source: undefined })} attrs={{ 'data-rail-source': '' }} />
            {choices.sources.map((item) => (
              <RailRow
                key={item.value}
                label={item.label}
                active={filter.source === item.value}
                onClick={() => setField({ source: filter.source === item.value ? undefined : item.value })}
                attrs={{ 'data-rail-source': item.value }}
                trail={<Box as="span" css-font-size="12" css-font-variant-numeric="tabular-nums" css-opacity="0.7">{item.count}</Box>}
              />
            ))}
          </RailBlock>
          <RailChips id="kinds" icon={Tag} title="Kinds" noun="kind" items={choices.kinds} picked={filter.kind} onPick={(kind) => setField({ kind })} />
          <RailChips id="people" icon={Users} title="Who" noun="name" items={choices.actors} picked={filter.actor} onPick={(actor) => setField({ actor })} />
          {workspaceId && (
            <RailBlock id="keep" icon={Clock} title="Keep activity">
              <KeepActivity workspaceId={workspaceId} onSaved={() => void load()} />
            </RailBlock>
          )}
        </div>
      </NavSlotFor>
      <Hint role="status" as="p" size="xs" data-filter-status>
        {page ? `${page.total} ${page.total === 1 ? 'entry' : 'entries'}${filterActive(filter) ? ' match' : ''} · kept ${page.retentionDays} days` : busy ? 'Loading…' : 'Not loaded'}
        {filterActive(filter) && (
          <>
            {' · '}
            <PlainButton type="button" underline onClick={() => setFilter({})} data-filter-clear-inline>
              Clear filters
            </PlainButton>
          </>
        )}
      </Hint>
      {page && rows.length === 0 ? (
        // In a box with a background, so the empty page reads as one block.
        <Box data-activity-empty css-border-color="border" css-background="bg-elevated-card" rounded="lg" border="all">
          <EmptyState
            icon={<History size={36} aria-hidden="true" />}
            title={filterActive(filter) ? 'No activity matches these filters' : 'No activity yet'}
            subtitle={filterActive(filter) ? 'Clear the filters to see every entry.' : 'Starting work, stopping the line, approving and saving settings show here, and so do the closes, board moves and labels the tick reads.'}
          />
        </Box>
      ) : narrow ? (
        <Stack rows={rows} now={now} />
      ) : (
        <Table rows={rows} now={now} />
      )}
      {page && <ShowMore left={page.total - rows.length} onMore={() => void more()} />}
    </Box>
  )
}
