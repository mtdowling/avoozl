// In flight's claim branches and lanes (simplify §D13, §D22.3). A claim row
// shows its task, holder, head commit and age, with the pull request and
// check chips from delivery.view; a lane row shows its role, state and task,
// and opens its chat or copies its attach command.
import { useCallback, useMemo, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { CopyAttach, FlightChips } from './InFlight.tsx'
import { sessionHref } from './task-api.ts'
import { linkHref, viewsClient, type ClaimRow, type LaneRow, type TaskLinks } from './views-api.ts'
import { useRead } from './useRead.ts'
import { SectionHeading, ShowMore, TaskTitleLink, usePages } from './ui/controls.tsx'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainLink } from './ui/Plain'

// A section's list, or its error, loading or empty line.
function Section<T>(props: {
  id: string
  title: string
  rows: T[] | null
  error: string | null
  empty: string
  render: (row: T) => ReactNode
  mark: string
  pages: ReturnType<typeof usePages>
}) {
  const { rows, pages } = props
  return (
    <Box as="section" aria-labelledby={props.id} flex flexCol gap="1.5" {...{ [`data-in-flight-${props.mark}`]: '' }}>
      <SectionHeading id={props.id} title={`${props.title} (${rows ? rows.length : 0})`} />
      {props.error ? (
        <Hint as="p" size="sm" role="alert">
          {props.error}
        </Hint>
      ) : !rows ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : rows.length === 0 ? (
        <Hint as="p" size="sm">
          {props.empty}
        </Hint>
      ) : (
        <>
          <Box as="ul" m0 listNone p="0">
            {pages.take(props.mark, rows).map(props.render)}
          </Box>
          <ShowMore {...pages.more(props.mark, rows.length)} />
        </>
      )}
    </Box>
  )
}

function Row(props: { children: ReactNode; mark: string }) {
  return (
    <Box as="li" css-border-color="border" flex flexWrap items="start" gap="2" border="t" py="2" firstBorderT0 {...{ [`data-${props.mark}-row`]: '' }}>
      {props.children}
    </Box>
  )
}

const age = (hours: number | null) => (hours === null ? 'age unknown' : hours < 1 ? 'under an hour old' : `${hours} h old`)

function ClaimItem({ claim, links }: { claim: ClaimRow; links: TaskLinks | null }) {
  const title = claim.title ?? claim.task
  return (
    <Row mark="claim">
      <Box as="span" css-flex="0-0-7.5rem">
        <Badge variant={claim.stale ? 'warning' : undefined}>{claim.stale ? 'Stale' : 'Claimed'}</Badge>
      </Box>
      <Box as="span" css-flex-basis="12rem" minW0 flex1>
        <TaskTitleLink id={claim.task} title={title} weight="medium" />{' '}
        <Hint size="xs">
          {claim.task} · {claim.spec}
        </Hint>
        <Hint size="xs" block>
          {claim.holder} · {claim.repository} · head {claim.head ? claim.head.slice(0, 7) : 'unknown'} · {age(claim.ageHours)}
        </Hint>
        {links && <FlightChips links={links} title={title} />}
      </Box>
    </Row>
  )
}

function LaneItem({ lane }: { lane: LaneRow }) {
  const chat = lane.harness === 'kirocrew' && lane.slot && lane.state !== 'paused'
  return (
    <Row mark="lane">
      <Box as="span" css-flex="0-0-7.5rem">
        <Badge>{lane.role === 'worker' ? 'Worker' : lane.role === 'reviewer' ? 'Reviewer' : `Reviewer · ${lane.role}`}</Badge>
      </Box>
      <Box as="span" css-flex-basis="12rem" minW0 flex1>
        <Box as="span" weight="medium">
          {lane.lane}
        </Box>{' '}
        <Hint size="xs">
          {lane.harness ?? 'no harness'} · {lane.state}
        </Hint>
        <Hint size="xs" block>
          {lane.task ? `Task ${lane.task}` : 'No task'}
          {lane.state === 'paused' && lane.open ? ` · ${lane.open}` : ''}
        </Hint>
      </Box>
      <Box as="span" css-flex="0-0-11rem" flex items="center" justify="end" gap="1.5">
        {chat && lane.slot ? (
          <PlainLink
            href={linkHref(sessionHref({ slot: lane.slot, link: null }))}
            css-text-decoration="underline"
            size="sm"
            data-lane-open
            aria-label={`Open the chat of lane ${lane.lane}`}
          >
            Open
          </PlainLink>
        ) : lane.harness !== 'kirocrew' && lane.open && lane.state !== 'paused' ? (
          <CopyAttach command={lane.open} title={`lane ${lane.lane}`} />
        ) : null}
      </Box>
    </Row>
  )
}

// The claim branches the last claims read saw, across repositories.
export function InFlightClaims({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const pages = usePages(workspaceId ?? '')
  const load = useCallback(
    async (id: string) => {
      const [claims, delivery] = await Promise.all([views.claims(id), views.delivery(id)])
      return { claims, links: new Map(delivery.map((item) => [item.id, item.links ?? null])) }
    },
    [views],
  )
  const { value, error } = useRead(workspaceId, load)
  return (
    <Section
      id="avoozl-in-flight-claims"
      title="Claims"
      mark="claims"
      pages={pages}
      rows={value?.claims ?? null}
      error={error}
      empty="No claim branch is open."
      render={(claim) => <ClaimItem key={`${claim.repository}:${claim.branch}`} claim={claim} links={value?.links.get(claim.task) ?? null} />}
    />
  )
}

// This machine's lanes.
export function InFlightLanes({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const pages = usePages(workspaceId ?? '')
  const load = useCallback((id: string) => views.lanes(id), [views])
  const { value, error } = useRead(workspaceId, load)
  return (
    <Section
      id="avoozl-in-flight-lanes"
      title="Lanes"
      mark="lanes"
      pages={pages}
      rows={value ?? null}
      error={error}
      empty="This machine has no lanes. Turn on Autopilot in Settings to add them."
      render={(lane) => <LaneItem key={lane.lane} lane={lane} />}
    />
  )
}
