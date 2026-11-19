// The Issues and Pull requests pages (triage-agent TA8, design §D8): one
// list-detail layout. The list reads Avoozl's stored rows (no GitHub call);
// the detail is one cached query; each action is one write through
// Avoozl's client. Needs you › From the agent is the same page filtered to
// the owner queue (TA5.2).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { ListDetailLayout } from './ListDetailLayout.tsx'
import { FilterPanel } from './FilterPanel.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import { ShowMore, ViewHeading, usePages, useConfirm } from './ui/controls.tsx'
import { Box } from './ui/Box'
import { Btn } from './ui/Btn'
import { Hint } from './ui/Hint'
import { ErrorText } from './ui/ErrorText'
import { Stack } from './ui/Stack'
import Badge from './ui/Badge.tsx'
import { Markdown } from './ui/Markdown.tsx'
import { PlainButton, PlainTextarea } from './ui/Plain'
import { SelectField } from './ui/SelectField'
import { Input } from './ui/Input'
import { TextLink } from './ui/TextLink'
import { safeHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import {
  ACTIONS,
  CLASS_LABELS,
  RESULT_LABELS,
  ageOf,
  agentLine,
  changeLine,
  checksLine,
  itemKey,
  itemsClient,
  type ItemDetail,
  type ItemKind,
  type ItemList,
  type ItemRow,
  type ListFilter,
} from './github-items-api.ts'

const TITLES: Record<ItemKind | 'all', string> = { issue: 'Issues', pr: 'Pull requests', all: 'From the agent' }

function ItemListRow(props: { row: ItemRow; focused: boolean; onFocus: () => void }) {
  const { row } = props
  return (
    <Box as="li" css-border-color="border" border="t" firstBorderT0 data-item-row={itemKey(row)}>
      <PlainButton
        type="button"
        aria-current={props.focused ? 'true' : undefined}
        onClick={props.onFocus}
        css-background={props.focused ? 'accent-subtle-bg-elevated' : 'none'}
        css-border="0"
        css-border-radius="6"
        css-color="inherit"
        css-cursor="pointer"
        flex
        minW0
        flexCol
        items="stretch"
        gap="0.5"
        px="1"
        py="1.5"
        align="left"
        css-text-align="left"
        css-width="100%"
      >
        <Box as="span" flex minW0 items="center" gap="2">
          <Hint as="span" shrink0 size="xs">
            #{row.number}
          </Hint>
          <Box as="span" minW0 flex1 truncate size="sm" weight="medium">
            {row.title}
          </Box>
          <Hint as="span" shrink0 size="xs">
            {ageOf(row.updatedAt)}
          </Hint>
        </Box>
        <Hint as="span" flex flexWrap items="center" gap="1" size="xs">
          <span>{row.author ?? 'unknown'}</span>
          {row.kind === 'pr' && row.counts && (
            <>
              <span>· {changeLine(row.counts)}</span>
              <span data-row-checks>· {checksLine(row.counts.checks)}</span>
            </>
          )}
          {row.labels.slice(0, 4).map((label) => (
            <Badge key={label} variant="info">
              {label}
            </Badge>
          ))}
        </Hint>
        <Box as="span" truncate size="xs" tone={row.owner ? 'danger' : 'muted'} data-row-agent>
          {agentLine(row)}
        </Box>
      </PlainButton>
    </Box>
  )
}

// An action that needs text first opens this box.
const NEEDS_TEXT = new Set(['answer', 'comment', 'requestChanges', 'editReview', 'labels', 'close'])

function ActionBar(props: { detail: ItemDetail; busy: boolean; onAct: (action: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const { detail } = props
  const confirm = useConfirm()
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [reason, setReason] = useState('completed')
  const start = (action: string) => {
    setOpen(action)
    setText(action === 'answer' || action === 'editReview' ? (detail.triage.draft?.body ?? '') : '')
  }
  const press = async (action: string) => {
    if (action === 'reviewAsSpec' || !NEEDS_TEXT.has(action)) {
      if (action === 'approve' && !(await confirm({ title: `Approve #${detail.number}?`, body: 'It is approved as you, on GitHub.', action: 'Approve' }))) return
      if (action === 'snooze') return props.onAct(action, { until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
      return props.onAct(action)
    }
    start(action)
  }
  const send = async () => {
    if (!open) return
    const extra: Record<string, unknown> =
      open === 'labels'
        ? {
            add: text
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s && !s.startsWith('-')),
            remove: text
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.startsWith('-'))
              .map((s) => s.slice(1).trim()),
          }
        : open === 'close'
          ? { reason, ...(text.trim() ? { body: text.trim() } : {}) }
          : { body: text }
    await props.onAct(open, extra)
    setOpen(null)
  }
  return (
    <Stack gap={2} data-item-actions>
      <Box flex flexWrap items="center" gap="2">
        {detail.actions.map((action) => (
          <Btn
            key={action}
            type="button"
            primary={(action === 'fix' && detail.kind === 'issue') || action === 'review'}
            disabled={props.busy}
            onClick={() => void press(action)}
            title={ACTIONS[action]?.tip}
            data-item-action={action}
          >
            {ACTIONS[action]?.label ?? action}
          </Btn>
        ))}
        {detail.url && safeHref(detail.url) && (
          <TextLink href={safeHref(detail.url) ?? undefined} target="_blank" rel="noreferrer">
            Open on GitHub
          </TextLink>
        )}
      </Box>
      {open && (
        <Stack gap={2} data-item-composer={open}>
          {open === 'close' && detail.kind === 'issue' && (
            <SelectField value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Close reason">
              <option value="completed">Completed</option>
              <option value="not_planned">Not planned</option>
            </SelectField>
          )}
          {open === 'labels' ? (
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="bug, -question (a minus removes)" aria-label="Labels" />
          ) : open !== 'close' ? (
            <PlainTextarea
              rows={6}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={ACTIONS[open]?.label}
              css-border-color="border"
              css-color="text"
              css-background="card-transparent"
              rounded="base"
              border="all"
              px="2"
              py="1"
              size="sm"
            />
          ) : null}
          <Box flex gap="2">
            <Btn type="button" primary disabled={props.busy} onClick={() => void send()}>
              {open === 'close' ? 'Close it' : open === 'labels' ? 'Save labels' : 'Post'}
            </Btn>
            <Btn type="button" onClick={() => setOpen(null)}>
              Cancel
            </Btn>
          </Box>
        </Stack>
      )}
    </Stack>
  )
}

function Fact(props: { label: string; children: React.ReactNode }) {
  return (
    <Box flex flexWrap items="baseline" gap="2" size="sm">
      <Hint as="span" weight="medium">
        {props.label}
      </Hint>
      <Box as="span" minW0>
        {props.children}
      </Box>
    </Box>
  )
}

function ItemDetailPane(props: { detail: ItemDetail; busy: boolean; onAct: (action: string, extra?: Record<string, unknown>) => Promise<void> }) {
  const { detail } = props
  const triage = detail.triage
  const comments = detail.timeline.filter((entry) => entry.body !== undefined).slice(-10)
  return (
    <Stack gap={3} data-item-detail={`${detail.repository}#${detail.number}`}>
      <Hint as="div" flex flexWrap items="center" gap="2" size="sm">
        <span>
          {detail.repository} #{detail.number}
        </span>
        <Badge variant={detail.state === 'open' ? 'success' : 'info'}>{detail.merged ? 'Merged' : detail.state === 'open' ? 'Open' : 'Closed'}</Badge>
        <span>by {detail.author ?? 'unknown'}</span>
        {detail.firstTime && <Badge variant="wave">First-time contributor</Badge>}
      </Hint>
      <Box css-border-color="border" border="all" css-border-radius="8" p="3" data-item-agent>
        <Stack gap={1}>
          <Box weight="semibold" size="sm">
            Triage agent
          </Box>
          <Box size="sm">
            {triage.class ? (
              <>
                <Badge variant="info">{CLASS_LABELS[triage.class] ?? triage.class}</Badge> {triage.reason}
              </>
            ) : (
              'Not looked at yet.'
            )}
          </Box>
          {triage.owner && (
            <Box size="sm" tone="danger" data-item-owner>
              Needs you: {triage.owner.reason}
            </Box>
          )}
          {triage.note && <Hint size="xs">{triage.note}</Hint>}
          {triage.runs.slice(0, 3).map((run) => (
            <Hint key={run.id} size="xs">
              Run {run.id.split(':').at(-1)}: {RESULT_LABELS[run.state] ?? run.state}
              {run.writes.length ? ` · wrote ${run.writes.map((w) => `${w.kind} (${w.state})`).join(', ')}` : ''}
            </Hint>
          ))}
        </Stack>
      </Box>
      <ActionBar detail={detail} busy={props.busy} onAct={props.onAct} />
      {detail.kind === 'pr' && detail.counts && (
        <Stack gap={1} data-item-pull>
          <Fact label="Changes">{changeLine(detail.counts)}</Fact>
          <Fact label="Checks">{checksLine(detail.counts.checks)}</Fact>
          <Fact label="Branches">
            {detail.branch} → {detail.base}
          </Fact>
          <Fact label="Reviewers">{detail.reviewers?.length ? detail.reviewers.map((r) => `${r.login} (${r.state.toLowerCase().replace('_', ' ')})`).join(', ') : 'None'}</Fact>
        </Stack>
      )}
      <Stack gap={1}>
        <Fact label="Assignees">{detail.assignees.length ? detail.assignees.join(', ') : 'None'}</Fact>
        <Fact label="Labels">
          <Box as="span" flex flexWrap gap="1">
            {detail.labels.map((label) => (
              <Badge key={label} variant="info">
                {label}
              </Badge>
            ))}
            {triage.suggested
              .filter((label) => !detail.labels.includes(label))
              .map((label) => (
                <PlainButton
                  key={label}
                  type="button"
                  title={`Add ${label}, as the agent suggests`}
                  onClick={() => void props.onAct('labels', { add: [label] })}
                  css-border="0"
                  css-background="none"
                  css-cursor="pointer"
                  css-padding="0"
                  data-suggested-label={label}
                >
                  <Badge variant="warning">+ {label}</Badge>
                </PlainButton>
              ))}
            {!detail.labels.length && !triage.suggested.length && <span>None</span>}
          </Box>
        </Fact>
      </Stack>
      <Box css-border-color="border" border="t" pt="2" size="sm" minW0 css-overflow-x="auto" css-overflow-wrap="anywhere" data-item-body>
        {detail.body.trim() ? <Markdown text={detail.body} idPrefix={`item-${detail.number}`} /> : <Hint size="sm">No description.</Hint>}
      </Box>
      {comments.length > 0 && (
        <Stack gap={2} data-item-timeline>
          <Box weight="semibold" size="sm">
            Recent comments
          </Box>
          {comments.map((entry, index) => (
            <Box key={index} css-border-color="border" border="all" css-border-radius="8" p="2" size="sm" minW0 css-overflow-x="auto" css-overflow-wrap="anywhere">
              <Hint size="xs">
                {entry.by ?? 'unknown'} · {ageOf(entry.at)} ago
              </Hint>
              <Markdown text={entry.body ?? ''} idPrefix={`comment-${detail.number}-${index}`} />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

export default function GitHubItemsView(props: { workspaceId: string | null; kind: ItemKind | 'all'; ownerOnly?: boolean; embedded?: boolean }) {
  const api = useAppApi()
  const client = useMemo(() => itemsClient(api), [api])
  const { workspaceId, kind, ownerOnly } = props
  const [filter, setFilter] = useState<ListFilter>({ state: 'open', sort: 'updated' })
  const [list, setList] = useState<ItemList | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pages = usePages(`${kind}:${JSON.stringify(filter)}`)
  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      setList(await client.list(workspaceId, kind, { ...filter, ...(ownerOnly ? { owner: true } : {}) }))
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [client, workspaceId, kind, filter, ownerOnly])
  useEffect(() => {
    void load()
  }, [load])
  const current = list?.items.find((row) => itemKey(row) === focus) ?? null
  useEffect(() => {
    if (!workspaceId || !current) return setDetail(null)
    let live = true
    client.detail(workspaceId, current.repository, current.number).then(
      (value) => live && setDetail(value),
      (caught: unknown) => live && setError(errorMessage(caught)),
    )
    return () => {
      live = false
    }
  }, [client, workspaceId, current?.repository, current?.number, current?.updatedAt])
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!workspaceId || !current) return
    setBusy(true)
    setNotice(null)
    try {
      if (action === 'reviewAsSpec') await client.adoptSpec(workspaceId, current.repository, current.number)
      else await client.act(workspaceId, current.repository, current.number, action, extra)
      setNotice(`${ACTIONS[action]?.label ?? action}: done.`)
      await load()
      setDetail(await client.detail(workspaceId, current.repository, current.number))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const setField = (change: Partial<ListFilter>) => setFilter((now) => ({ ...now, ...change }))
  const items = list?.items ?? []
  const shown = pages.take('items', items)
  const title = TITLES[kind]
  return (
    <Box aria-label={title} as="section" flex hFull minH0 flexCol gap="2" data-items-view={kind}>
      {!props.embedded && (
        <ViewHeading id={`avoozl-items-${kind}`} view="github" actions={workspaceId && <RefreshButton workspaceId={workspaceId} onRefresh={() => void load()} busy={busy} />}>
          {title}
        </ViewHeading>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {notice && (
        <Hint role="status" as="p" size="sm">
          {notice}
        </Hint>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">
          Choose a workspace in the header.
        </Hint>
      ) : list === null ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : (
        <ListDetailLayout
          id={`items-${kind}`}
          backLabel={title}
          detailTitle={current?.title ?? ''}
          onBack={() => setFocus(null)}
          list={
            <Stack gap={2} data-items-list-pane>
              <FilterPanel
                folded
                id={`avoozl-items-${kind}`}
                label={`Filter ${title.toLowerCase()}`}
                active={Boolean(filter.q || filter.label || filter.repository || filter.mine || filter.assigned || filter.review || filter.owner || filter.state !== 'open')}
                onClear={() => setFilter({ state: 'open', sort: 'updated' })}
                fields={[
                  { kind: 'search', key: 'q', label: 'Search', value: filter.q ?? '', placeholder: 'Title, body or #number', onChange: (q) => setField({ q }), primary: true },
                  {
                    kind: 'select',
                    key: 'state',
                    label: 'State',
                    value: filter.state ?? 'open',
                    options: [
                      { value: 'open', label: 'Open' },
                      { value: 'closed', label: 'Closed' },
                      { value: 'all', label: 'All' },
                    ],
                    onChange: (state) => setField({ state: state as ListFilter['state'] }),
                  },
                  {
                    kind: 'select',
                    key: 'sort',
                    label: 'Sort',
                    value: filter.sort ?? 'updated',
                    options: [
                      { value: 'updated', label: 'Last update' },
                      { value: 'number', label: 'Number' },
                    ],
                    onChange: (sort) => setField({ sort: sort as ListFilter['sort'] }),
                  },
                  {
                    kind: 'select',
                    key: 'repository',
                    label: 'Repository',
                    value: filter.repository ?? '',
                    options: [{ value: '', label: 'All' }, ...list.repositories.map((value) => ({ value, label: value }))],
                    onChange: (repository) => setField({ repository: repository || undefined }),
                  },
                  {
                    kind: 'select',
                    key: 'label',
                    label: 'Label',
                    value: filter.label ?? '',
                    options: [{ value: '', label: 'All' }, ...list.labels.map((value) => ({ value, label: value }))],
                    onChange: (label) => setField({ label: label || undefined }),
                  },
                  ...(ownerOnly
                    ? []
                    : [
                        {
                          kind: 'check' as const,
                          key: 'owner',
                          label: `Needs you (${list.ownerQueue})`,
                          checked: Boolean(filter.owner),
                          onChange: (owner: boolean) => setField({ owner }),
                        },
                      ]),
                  { kind: 'check', key: 'mine', label: 'Authored by me', checked: Boolean(filter.mine), onChange: (mine) => setField({ mine }) },
                  { kind: 'check', key: 'assigned', label: 'Assigned to me', checked: Boolean(filter.assigned), onChange: (assigned) => setField({ assigned }) },
                  ...(kind === 'pr'
                    ? [{ kind: 'check' as const, key: 'review', label: 'Review requested', checked: Boolean(filter.review), onChange: (review: boolean) => setField({ review }) }]
                    : []),
                ]}
              >
                <Hint role="status" size="xs" data-items-count>
                  {list.total} {list.total === 1 ? 'item' : 'items'}
                </Hint>
                {props.embedded && (
                  <Box as="span" ml="auto">
                    <RefreshButton workspaceId={workspaceId} onRefresh={() => void load()} busy={busy} />
                  </Box>
                )}
              </FilterPanel>
              <Box as="ul" m0 flex listNone flexCol p="0" data-items-list>
                {shown.map((row) => (
                  <ItemListRow key={itemKey(row)} row={row} focused={focus === itemKey(row)} onFocus={() => setFocus(itemKey(row))} />
                ))}
              </Box>
              <ShowMore {...pages.more('items', items.length)} />
              {items.length === 0 && (
                <Hint as="p" size="sm" data-items-empty>
                  {ownerOnly
                    ? 'Nothing from the triage agent waits on you.'
                    : 'No item matches these filters. Avoozl lists the issues and pull requests it has read from repositories the triage agent is on for.'}
                </Hint>
              )}
            </Stack>
          }
          detail={current ? detail ? <ItemDetailPane detail={detail} busy={busy} onAct={act} /> : <Hint size="sm">Loading…</Hint> : null}
        />
      )}
    </Box>
  )
}
