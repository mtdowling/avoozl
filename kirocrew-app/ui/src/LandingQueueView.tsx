// Dashboards › Landing queue (Requirement 92.7, design §4.27, task 44.5):
// one card per target base: who waits and why, the merge batch under test,
// the last merge batches and the size limit (Requirement MB7). Reads landing.queue, which comes from Avoozl's store only, so
// Refresh redraws without a GitHub call. Rows take the full width at 390 px.
import { useCallback, useMemo } from 'react'
import { Card } from './ui/Card'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { duration } from './task-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { SectionHeading, ViewHeading } from './ui/controls.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import Badge from './ui/Badge.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { safeHref } from './views-api.ts'
import {
  baseTitle,
  batchTime,
  holdVariant,
  holdWord,
  itemCount,
  itemLinks,
  landingNote,
  landingQueueClient,
  sizeLine,
  testingLine,
  type FinishedBatch,
  type LandingBase,
  type LandingItem,
} from './landing-queue-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainButton, PlainLink } from './ui/Plain'
import { DOT } from './ui/looks/LandingQueueView.ts'

const DOT_TEXT: Record<string, string> = { pass: 'Checks passed', fail: 'Checks failed', pending: 'Checks running', stale: 'Checks are for an older head' }

function CheckDot(props: { checks: LandingItem['checks'] }) {
  const dot = props.checks?.dot
  if (!dot) return null
  const age = props.checks?.ageMs == null ? '' : `, read ${duration(new Date(Date.now() - props.checks.ageMs).toISOString())} ago`
  const text = `${DOT_TEXT[dot] ?? dot}${age}`
  return (
    <Tooltip text={text}>
      <span
        data-check-dot={dot}
        role="img"
        aria-label={text}
        className="inline-block shrink-0 rounded-full"
        style={{ width: 8, height: 8, background: DOT[dot] ?? 'var(--muted)' }}
      />
    </Tooltip>
  )
}

function Row(props: { item: LandingItem; now: number }) {
  const { item } = props
  const drawer = useTaskDrawer()
  const links = itemLinks(item)
  const first = item.tasks[0]
  return (
    <Box data-landing-row={item.key} data-hold={item.hold.kind} as="li" css-border-color="border" flex wFull minW0 flexCol gap="1" border="t" py="2" size="sm" firstBorderT0>
      <Box flex minW0 items="center" gap="2">
        <Box as="span" w6 shrink0 size="xs" tabularNums tone="muted" data-landing-position>
          {item.position ?? '—'}
        </Box>
        {first ? (
          <PlainButton type="button" minW0 flex1 truncate align="left" underline onClick={() => drawer.openTask(first.id)} aria-label={item.tasks.map((t) => t.title).join(', ')}>
            {first.title}
            {item.tasks.length > 1 ? ` +${item.tasks.length - 1}` : ''}
          </PlainButton>
        ) : (
          <Box as="span" minW0 flex1 truncate>
            {item.key}
          </Box>
        )}
        <Box as="span" shrink0>
          <Badge variant={holdVariant(item.hold.kind)}>{holdWord(item.hold.kind)}</Badge>
        </Box>
      </Box>
      <Box flex minW0 flexWrap items="center" gapX="3" gapY="1" pl="8" size="xs" tone="muted">
        <Box as="span" minW0 data-landing-hold>
          {item.hold.text}
        </Box>
        {links.map((link) => (
          <PlainLink
            key={link.key}
            href={safeHref(link.href) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            inlineFlex
            minW0
            items="center"
            gap="1"
            underline
            data-landing-link={link.key}
          >
            {link.key === 'pr' && <CheckDot checks={item.checks} />}
            <Box as="span" css-max-width="16rem" truncate>
              {link.label}
            </Box>
          </PlainLink>
        ))}
        {!item.pr && item.checks && <CheckDot checks={item.checks} />}
        {item.since && (
          <Box as="span" tabularNums>
            waiting {duration(item.since, props.now)}
          </Box>
        )}
      </Box>
    </Box>
  )
}

const OUTCOME_VARIANT = { landed: 'success', 'partly landed': 'warning', 'culprit sent back': 'danger' } as const

function LastBatch(props: { batch: FinishedBatch; now: number }) {
  const { batch } = props
  return (
    <Box as="li" flex minW0 flexWrap items="center" gapX="3" gapY="1" size="xs" tone="muted" data-landing-last={batch.outcome}>
      <Box as="span" shrink0>
        <Badge variant={OUTCOME_VARIANT[batch.outcome]}>{batch.outcome}</Badge>
      </Box>
      <Box as="span" tabularNums>
        {batch.size} {batch.size === 1 ? 'member' : 'members'}
      </Box>
      {batch.seconds != null && (
        <Box as="span" tabularNums>
          {batchTime(batch.seconds)}
        </Box>
      )}
      <Box as="span" tabularNums>
        {duration(batch.at, props.now)} ago
      </Box>
    </Box>
  )
}

// What a base that lands directly adds to its waiting list: the batch being
// tested, the last batches and the size limit.
function MergeBatches(props: { base: LandingBase; now: number }) {
  const { base } = props
  if (!base.size) return null
  return (
    <Box flex flexCol gap="2" mb="2" data-landing-batches>
      <Hint as="p" size="xs" data-landing-size>
        {sizeLine(base.size)}
      </Hint>
      <Box as="p" size="xs" tone="muted" data-landing-testing>
        {base.testing ? `Testing: ${testingLine(base.testing)}.` : 'Testing: no merge batch right now.'}
      </Box>
      {base.last && base.last.length > 0 && (
        <Box flex flexCol gap="1">
          <SectionHeading level={4} title="Last merge batches" />
          <Box as="ul" flex flexCol gap="1">
            {base.last.map((batch) => (
              <LastBatch key={batch.at} batch={batch} now={props.now} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default function LandingQueueView(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => landingQueueClient(api), [api])
  const load = useCallback((id: string) => client.read(id), [client])
  const { value, error, busy, reload } = useRead(props.workspaceId, load)
  const now = Date.now()
  return (
    <Box aria-labelledby="avoozl-landing-title" as="section" flex flexCol gap="3.5" data-landing-queue>
      <ViewHeading
        id="avoozl-landing-title"
        view="landing"
        meta={value ? `${itemCount(value)} waiting` : undefined}
        actions={props.workspaceId && <RefreshButton workspaceId={props.workspaceId} onRefresh={() => void reload()} busy={busy} />}
      >
        Landing queue
      </ViewHeading>
      <Hint as="p" size="xs">
        What waits to land on each base, in landing order, and why; the merge batch being tested; the last merge batches; and the size limit. Read from Avoozl's own records;
        Refresh does not call GitHub.
      </Hint>
      {error && (
        <Box role="alert" as="p" css-color="danger" size="sm">
          {error}
        </Box>
      )}
      {!value ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : value.bases.length === 0 ? (
        <Card>
          <Hint as="p" size="sm" data-landing-empty>
            Nothing waits to land.
          </Hint>
        </Card>
      ) : (
        value.bases.map((base) => (
          <Card key={base.key}>
            <div data-landing-base={base.key}>
              <SectionHeading level={3} title={`${baseTitle(base)} (${base.items.length})`} meta={landingNote(base)} className="mb-1" />
              <MergeBatches base={base} now={now} />
              {base.size && <SectionHeading level={4} title={`Waiting (${base.items.length})`} />}
              <Box as="ul" flex wFull flexCol>
                {base.items.map((item) => (
                  <Row key={item.key} item={item} now={now} />
                ))}
              </Box>
            </div>
          </Card>
        ))
      )}
    </Box>
  )
}
