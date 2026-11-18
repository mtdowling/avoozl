// Dashboards › Landing queue (Requirement 92.7, design §4.27, task 44.5):
// one card per target base, its items in landing order, and why each one is
// held. Reads landing.queue, which comes from Avoozl's store only, so
// Refresh redraws without a GitHub call. Rows take the full width at 390 px.
import { useCallback, useMemo } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { duration } from './task-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { SectionHeading, ViewHeading } from './controls.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { safeHref } from './views-api.ts'
import { baseTitle, holdVariant, holdWord, itemCount, itemLinks, landingNote, landingQueueClient, queueLine, type LandingItem } from './landing-queue-api.ts'

const DOT: Record<string, string> = { pass: 'var(--ok)', fail: 'var(--danger)', pending: 'var(--warn, var(--accent))', stale: 'var(--muted)' }
const DOT_TEXT: Record<string, string> = { pass: 'Checks passed', fail: 'Checks failed', pending: 'Checks running', stale: 'Checks are for an older head' }

function CheckDot(props: { checks: LandingItem['checks'] }) {
  const dot = props.checks?.dot
  if (!dot) return null
  const age = props.checks?.ageMs == null ? '' : `, read ${duration(new Date(Date.now() - props.checks.ageMs).toISOString())} ago`
  const text = `${DOT_TEXT[dot] ?? dot}${age}`
  return (
    <Tooltip text={text}>
      <span data-check-dot={dot} role="img" aria-label={text} className="inline-block shrink-0 rounded-full" style={{ width: 8, height: 8, background: DOT[dot] ?? 'var(--muted)' }} />
    </Tooltip>
  )
}

function Row(props: { item: LandingItem; now: number }) {
  const { item } = props
  const drawer = useTaskDrawer()
  const links = itemLinks(item)
  const first = item.tasks[0]
  return (
    <li data-landing-row={item.key} data-hold={item.hold.kind} className="flex w-full min-w-0 flex-col gap-1 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-xs tabular-nums text-muted" data-landing-position>
          {item.position ?? '—'}
        </span>
        {first ? (
          <button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => drawer.openTask(first.id)} aria-label={item.tasks.map((t) => t.title).join(', ')}>
            {first.title}
            {item.tasks.length > 1 ? ` +${item.tasks.length - 1}` : ''}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate">{item.key}</span>
        )}
        <span className="shrink-0">
          <Badge variant={holdVariant(item.hold.kind)}>{holdWord(item.hold.kind)}</Badge>
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs text-muted">
        <span className="min-w-0" data-landing-hold>
          {item.hold.text}
        </span>
        {links.map((link) => (
          <a key={link.key} href={safeHref(link.href) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 underline" data-landing-link={link.key}>
            {link.key === 'pr' && <CheckDot checks={item.checks} />}
            <span className="truncate" style={{ maxWidth: '16rem' }}>
              {link.label}
            </span>
          </a>
        ))}
        {!item.pr && item.checks && <CheckDot checks={item.checks} />}
        {item.since && <span className="tabular-nums">{duration(item.since, props.now)}</span>}
      </div>
    </li>
  )
}

export default function LandingQueueView(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => landingQueueClient(api), [api])
  const load = useCallback((id: string) => client.read(id), [client])
  const { value, error, busy, reload } = useRead(props.workspaceId, load)
  const now = Date.now()
  return (
    <section aria-labelledby="avoozl-landing-title" className="flex flex-col gap-3.5" data-landing-queue>
      <ViewHeading
        id="avoozl-landing-title"
        view="landing"
        meta={value ? `${itemCount(value)} waiting` : undefined}
        actions={props.workspaceId && <RefreshButton workspaceId={props.workspaceId} onRefresh={() => void reload()} busy={busy} />}
      >
        Landing queue
      </ViewHeading>
      <p className="text-xs text-muted">What waits to land on each base, in landing order, and why. Read from Avoozl's own records; Refresh does not call GitHub.</p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {!value ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : value.bases.length === 0 ? (
        <Card>
          <p className="text-sm text-muted" data-landing-empty>
            Nothing waits to land.
          </p>
        </Card>
      ) : (
        value.bases.map((base) => (
          <Card key={base.key}>
            <div data-landing-base={base.key}>
              <SectionHeading level={3} title={`${baseTitle(base)} (${base.items.length})`} meta={landingNote(base)} className="mb-1" />
              {queueLine(base) && (
                <p className="mb-1 text-xs text-muted" data-landing-queue-line>
                  {queueLine(base)}
                </p>
              )}
              <ul className="flex w-full flex-col">
                {base.items.map((item) => (
                  <Row key={item.key} item={item} now={now} />
                ))}
              </ul>
            </div>
          </Card>
        ))
      )}
    </section>
  )
}
