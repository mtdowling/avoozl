// In flight's sessions (simplify §D13): one row per live worker or review
// session, with its task, model, machine, pull request and branch chips, and
// for a `process` child its log tail, Send message and Attach.
import { useCallback, useMemo, useRef, useState } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { checkDot, processLine, summarize, type InFlight } from './dashboard-api.ts'
import { attemptAction, duration, relativeTime } from './task-api.ts'
import { AttemptLink } from './WorkerLink.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { plansClient } from './plans-api.ts'
import { linkHref, viewsClient, type TaskLinks } from './views-api.ts'
import { useRead } from './useRead.ts'
import { IconBtn, SectionHeading, ShowMore, SmallBtn, TaskTitleLink, usePages } from './ui/controls.tsx'
import { Check, Copy, DetailsIcon, GitBranch, MessageSquare } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainLink, PlainTextarea } from './ui/Plain'
import { Glyph } from './ui/Glyph'

const ROLE_LABEL: Record<string, string> = { worker: 'Worker', checks: 'Checks' }
const roleLabel = (row: InFlight) => ROLE_LABEL[row.role] ?? (row.role === 'worker' ? 'Worker' : `Reviewer · ${row.role}`)

// Copy a `process` session's attach command (R98.1). The command shows in
// the tooltip, so a person reads what they copy.
export function CopyAttach({ command, title }: { command: string; title: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip text={command}>
      {(describedBy) => (
        <Btn
          type="button"
          aria-label={`Copy the attach command for ${title}`}
          aria-describedby={describedBy}
          data-copy-attach
          css-display="inline-flex"
          css-align-items="center"
          css-gap="4"
          css-padding="3px-6px"
          css-min-height="0"
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              },
              () => setCopied(false),
            )
          }
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copied' : 'Attach'}
        </Btn>
      )}
    </Tooltip>
  )
}

// In flight's `PR #N` chip with its check dot, and the branch chip (R92.6).
// Both open GitHub in a new tab (R92.9).
export function FlightChips({ links, title }: { links: TaskLinks; title: string }) {
  const pr = links.pr && linkHref(links.pr.url),
    branch = links.branch && linkHref(links.branch.url)
  if (!pr && !branch) return null
  const dot = checkDot(links.checks)
  return (
    // contain: inline-size keeps the chips out of the row's min-content, so a
    // long branch name shrinks instead of widening the card on a phone.
    <Box data-in-flight-links as="span" css-min-width="0" css-contain="inline-size" mt="1" flex items="center" gap="1" size="xs">
      {pr && links.pr && (
        // The PR chip never shrinks; the branch chip gives way.
        <Box as="span" css-display="inline-flex" css-flex="0-0-auto">
          <Tooltip text={dot.label}>
            <PlainLink
              data-pr-chip
              href={linkHref(links.pr.url)}
              target="_blank"
              rel="noopener noreferrer"
              css-display="inline-flex"
              css-align-items="center"
              css-gap="4"
              css-max-width="100%"
              css-min-width="0"
              css-padding="0-6px"
              css-border="1px-solid-border"
              css-border-radius="999"
              css-color="text"
              css-line-height="18px"
              css-text-decoration="none"
              aria-label={`Pull request ${links.pr.number} for ${title}${links.pr.state === 'open' || links.pr.state === 'unknown' ? '' : `, ${links.pr.state}`}. ${dot.label}`}
            >
              <Box
                data-check-dot={dot.dot}
                aria-hidden="true"
                as="i"
                css-display="block"
                css-flex="0-0-auto"
                css-width="8"
                css-height="8"
                css-border-radius="999"
                css-background={dot.color}
              />
              PR #{links.pr.number}
              {links.pr.state === 'merged' || links.pr.state === 'closed' ? <Hint>{links.pr.state}</Hint> : null}
            </PlainLink>
          </Tooltip>
        </Box>
      )}
      {branch && links.branch && (
        <Tooltip text={links.branch.ref}>
          <PlainLink
            data-branch-chip
            href={linkHref(links.branch.url)}
            target="_blank"
            rel="noopener noreferrer"
            css-display="inline-flex"
            css-align-items="center"
            css-gap="4"
            css-max-width="100%"
            css-min-width="0"
            css-padding="0-6px"
            css-border="1px-solid-border"
            css-border-radius="999"
            css-color="text"
            css-line-height="18px"
            css-text-decoration="none"
            aria-label={`Branch ${links.branch.ref} for ${title}`}
          >
            <Glyph icon={GitBranch} size={12} aria-hidden="true" css-flex="0-0-auto" />
            <Box as="span" css-min-width="0" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">
              {links.branch.ref}
            </Box>
          </PlainLink>
        </Tooltip>
      )}
    </Box>
  )
}

// Send message on a `process` session (R98.2): the text is queued as a
// `send`; the supervisor resumes the child with it when its run ends.
function SendMessage({ title, onSend, onClose }: { title: string; onSend: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'queued' } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const send = async () => {
    setState({ kind: 'sending' })
    try {
      await onSend(text)
      setText('')
      setState({ kind: 'queued' })
    } catch (error) {
      setState({ kind: 'error', message: errorMessage(error) })
    }
  }
  return (
    <Box
      data-send-message
      as="form"
      mt="1"
      flex
      flexCol
      gap="1"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <PlainTextarea
        aria-label={`Message for ${title}`}
        css-border-color="border"
        css-background="bg"
        css-color="text"
        css-min-height="3.5em"
        rounded="base"
        border="all"
        p="1.5"
        size="sm"
        maxLength={8000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Box as="span" flex flexWrap items="center" gap="1.5">
        <SmallBtn primary disabled={!text.trim() || state.kind === 'sending'} attrs={{ type: 'submit', 'data-send-submit': true }}>
          {state.kind === 'sending' ? 'Sending…' : 'Send'}
        </SmallBtn>
        <SmallBtn onClick={onClose}>Close</SmallBtn>
        <Hint role="status" size="xs" data-send-state={state.kind}>
          {state.kind === 'queued' ? 'Queued; it goes in when the run ends.' : state.kind === 'error' ? state.message : ''}
        </Hint>
      </Box>
    </Box>
  )
}

export function InFlightRow({
  row,
  now,
  onInfo,
  onSend,
  workspaceId = null,
}: {
  row: InFlight
  now: number
  onInfo: () => void
  onSend?: (text: string) => Promise<void>
  workspaceId?: string | null
}) {
  const [writing, setWriting] = useState(false)
  const logRef = useRef<HTMLElement | null>(null)
  const child = row.session.executor === 'process' ? (row.session.process ?? null) : null,
    processRow = row.session.executor === 'process',
    machine = attemptAction(row.session).machine
  return (
    <Box data-in-flight-row as="li" css-border-color="border" flex flexWrap items="start" gap="2" border="t" py="2" firstBorderT0>
      {/* Fixed columns, so every row's title and actions start at the same x. */}
      <Box data-in-flight-role as="span" css-flex="0-0-7.5rem">
        <Badge>{roleLabel(row)}</Badge>
      </Box>
      <Box as="span" css-flex-basis="12rem" minW0 flex1>
        <TaskTitleLink id={row.taskId} title={row.title} weight="medium" />{' '}
        <Hint size="xs">
          {row.taskId}
          {row.epic ? ` · ${row.epic}` : ''} · attempt {row.attempt}
        </Hint>{' '}
        {row.focus && (
          <Hint size="xs" block>
            {row.focus}
          </Hint>
        )}
        {processRow ? (
          <Hint size="xs" block data-process-status>
            {child ? processLine(child) : 'process · no supervisor record'} · {row.model ?? 'model not named'} · on {machine} · running {duration(row.startedAt, now)}
          </Hint>
        ) : (
          <Hint size="xs" block>
            {row.session.agent ? `${row.session.agent} / ` : ''}
            {row.model ?? 'model not named'} · on {machine}
            {row.starting ? '' : ` · running ${duration(row.startedAt, now)}`} ·{' '}
            {row.session.crewUnreachable ? 'crew unreachable' : row.starting ? 'waiting for worker chat' : (row.status ?? 'not observed')} {relativeTime(row.lastAt, now)}
          </Hint>
        )}
        {row.links && <FlightChips links={row.links} title={row.title} />}
        {processRow && (
          // column-reverse keeps the newest line in view without a scroll effect.
          <Box
            data-process-log
            ref={(element: HTMLElement | null) => {
              logRef.current = element
            }}
            as="span"
            css-border-color="border"
            css-max-height="7.5em"
            css-overflow="auto"
            css-display="flex"
            css-flex-direction="column-reverse"
            mt="1"
            block
            rounded="base"
            border="all"
            size="xs"
            tabIndex={0}
            aria-label={`Log tail for ${row.title}`}
          >
            <Box as="pre" css-white-space="pre-wrap" css-overflow-wrap="anywhere" css-font-family="font-mono-ui-monospace-monospace" m0 p="1.5">
              {child?.logTail || 'No output yet.'}
            </Box>
          </Box>
        )}
        {processRow && writing && onSend && <SendMessage title={row.title} onSend={onSend} onClose={() => setWriting(false)} />}
      </Box>
      <Box data-in-flight-actions as="span" css-flex="0-0-11rem" flex items="center" justify="end" gap="1.5">
        <IconBtn icon={DetailsIcon} label={`Details for ${row.title}`} tooltip="Open the task drawer" onClick={onInfo} />
        {processRow && onSend && (
          <IconBtn icon={MessageSquare} label={`Send message to the ${row.role} for ${row.title}`} tooltip="Send message" onClick={() => setWriting((open) => !open)} />
        )}
        {processRow ? (
          <>
            <SmallBtn onClick={() => logRef.current?.focus()} attrs={{ 'aria-label': `View worker log for ${row.title}` }}>
              View worker log
            </SmallBtn>
            {child?.attach ? <CopyAttach command={child.attach} title={row.title} /> : null}
          </>
        ) : row.starting ? (
          <Hint size="xs" data-attempt-waiting>
            Waiting for worker chat
          </Hint>
        ) : (
          <AttemptLink session={row.session} title={row.title} />
        )}
      </Box>
    </Box>
  )
}

// The live sessions, read with the graph, delivery, conflicts and plans the
// summary needs. A failed read shows as not loaded.
export default function InFlightSessions({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const plans = useMemo(() => plansClient(api), [api])
  const drawer = useTaskDrawer()
  const pages = usePages(workspaceId ?? '')
  const load = useCallback(
    async (id: string) => {
      const [graph, delivery, conflicts, stored] = await Promise.all([views.graph(id), views.delivery(id), views.conflicts(id), plans.stored(id)])
      return summarize({ graph, delivery, conflicts, plans: stored, limit: Infinity })
    },
    [views, plans],
  )
  const { value: summary, error } = useRead(workspaceId, load)
  const now = Date.now()
  return (
    <Box as="section" aria-labelledby="avoozl-in-flight-sessions" flex flexCol gap="1.5" data-in-flight-sessions>
      <SectionHeading id="avoozl-in-flight-sessions" title={`Sessions (${summary ? summary.inFlight.length : 0})`} />
      {error ? (
        <Hint as="p" size="sm" role="alert">
          {error}
        </Hint>
      ) : !summary ? (
        <Hint as="p" size="sm">
          Loading…
        </Hint>
      ) : summary.inFlight.length === 0 ? (
        <Hint as="p" size="sm">
          No chat is working right now.
        </Hint>
      ) : (
        <>
          <Box as="ul" m0 listNone p="0">
            {pages.take('flight', summary.inFlight).map((row) => (
              <InFlightRow
                key={row.slot}
                row={row}
                now={now}
                workspaceId={workspaceId}
                onInfo={() => drawer.openTask(row.taskId)}
                onSend={
                  workspaceId && row.session.executor === 'process'
                    ? async (text) => {
                        await views.sendSession(workspaceId, row.slot, text)
                      }
                    : undefined
                }
              />
            ))}
          </Box>
          <ShowMore {...pages.more('flight', summary.inFlight.length)} />
        </>
      )}
    </Box>
  )
}
