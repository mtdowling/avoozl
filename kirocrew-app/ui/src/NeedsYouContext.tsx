// The context block of a Needs you item: its spec and task, what is asked and
// why, what answering unblocks, and the evidence Avoozl holds. It comes before
// every button, so nothing is approved without it. Theme variables only.
import type { ReactNode } from 'react'
import { SeverityBadges } from './SeverityBadges.tsx'
import { checkDot } from './dashboard-api.ts'
import { Tooltip } from './ui/Tooltip.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useOpenSpec } from './spec-link.ts'
import { askLine, evidenceOf, specOfItem, reviewEvidence, sourceLine, unblockLine, type DiffLine } from './needs-you-context.ts'
import { whyLine } from './conflicts-api.ts'
import { linkHref, safeHref, type ConflictItem, type ItemContext, type ReviewTask } from './views-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { NeedsContextStyle } from './ui/PageStyles'
import { PlainButton } from './ui/Plain'

// The spec's title; it opens Specs on that spec when a stored plan exists.
export function SpecLink({ spec }: { spec: NonNullable<ItemContext['spec']> }) {
  const open = useOpenSpec()
  if (!spec.planId || !open) return <span data-spec-name>{spec.title}</span>
  return (
    <PlainButton
      type="button"
      css-background="none"
      css-border="0"
      css-padding="0"
      css-color="inherit"
      css-cursor="pointer"
      css-text-align="left"
      underline
      data-spec-link={spec.planId}
      onClick={() => open(spec.planId!)}
    >
      {spec.title}
    </PlainButton>
  )
}

// The task as id and title; it opens the task view.
export function TaskLink({ task }: { task: { id: string; title: string } }) {
  const drawer = useTaskDrawer()
  return (
    <PlainButton
      type="button"
      css-background="none"
      css-border="0"
      css-padding="0"
      css-color="inherit"
      css-cursor="pointer"
      css-text-align="left"
      underline
      data-task-link={task.id}
      onClick={() => drawer.openTask(task.id)}
    >
      {task.id}: {task.title}
    </PlainButton>
  )
}

const DIFF_INK: Record<DiffLine['kind'], string | undefined> = { same: undefined, add: 'var(--success, var(--text))', remove: 'var(--danger)' }
const DIFF_MARK: Record<DiffLine['kind'], string> = { same: ' ', add: '+', remove: '−' }

// Task text, old against new, or the text with its file path and lines.
export function TaskText(props: { title: string; context: ItemContext | undefined; note?: boolean }) {
  const evidence = reviewEvidence(props.title, props.context)
  const source = props.context?.source
  if (!evidence)
    return (
      <Hint as="p" size="xs" flush>
        Avoozl holds no text for this task.
      </Hint>
    )
  return (
    <Stack data-task-text gap={1}>
      {source && (
        <Box as="code" size="xs" tone="muted" data-snippet-head>
          {sourceLine(source)}
        </Box>
      )}
      <Box
        as="pre"
        css-border-color="border"
        m0
        maxH56
        overflow="auto"
        whitespace="pre-wrap"
        breakWords
        rounded="base"
        border="all"
        p="2"
        size="xs"
        data-task-text-body={evidence.kind}
      >
        {evidence.kind === 'diff'
          ? evidence.lines.map((line, i) => (
              <Box key={i} data-diff={line.kind} as="span" css-display="block" css-color={DIFF_INK[line.kind]}>
                {DIFF_MARK[line.kind]} {line.text}
              </Box>
            ))
          : evidence.lines.join('\n')}
      </Box>
      {evidence.kind === 'text' && props.note && (
        <Hint as="p" size="xs" flush>
          {evidence.note}
        </Hint>
      )}
    </Stack>
  )
}

// Each task of a review group: its title (opens the task), spec and text.
export function ReviewTaskContext({ task }: { task: ReviewTask }) {
  const drawer = useTaskDrawer()
  return (
    <Box as="li" css-border-color="border" flex flexCol gap="1" border="t" py="2" firstBorderT0 data-review-task={task.id}>
      <Box as="span" flex flexWrap items="baseline" gap="2" size="sm">
        <PlainButton
          type="button"
          css-background="none"
          css-border="0"
          css-padding="0"
          css-color="inherit"
          css-cursor="pointer"
          css-text-align="left"
          weight="medium"
          underline
          data-task-link={task.id}
          onClick={() => drawer.openTask(task.id)}
        >
          {task.id}: {task.title}
        </PlainButton>
        {task.context?.spec && (
          <Hint size="xs">
            Spec: <SpecLink spec={task.context.spec} />
          </Hint>
        )}
      </Box>
      <TaskText title={task.title} context={task.context} note />
    </Box>
  )
}

function Section(props: { name: string; title: string; children: ReactNode }) {
  return (
    <Stack as="section" gap={1} data-context-section={props.name}>
      <Box as="h4" m0 size="xs" weight="semibold" uppercase tone="muted">
        {props.title}
      </Box>
      {props.children}
    </Stack>
  )
}

const shownValue = (value: string | string[] | null | undefined) => (Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : value ? value : 'empty')

// A GitHub edit: what Avoozl expected and what GitHub has.
export function Values({ item }: { item: ConflictItem }) {
  if (item.expected === undefined && item.actual === undefined) return null
  const block = (label: string, value: ConflictItem['expected']) => (
    <Box minW0>
      <Hint as="div" size="xs">
        {label}
      </Hint>
      <Box as="pre" css-border-color="border" mt="1" maxH40 overflow="auto" whitespace="pre-wrap" breakWords rounded="base" border="all" p="2" size="xs">
        {shownValue(value)}
      </Box>
    </Box>
  )
  return (
    <Box css-grid-template-columns="repeat-auto-fit-minmax-min-100%-16rem-1fr" grid gap="2">
      {block('Avoozl expected', item.expected)}
      {block(item.changedBy ? `GitHub has (changed by ${item.changedBy})` : 'GitHub has', item.actual)}
    </Box>
  )
}

const CONFIDENCE = { low: 'Low', medium: 'Medium', high: 'High' } as const

// A worker's findings and the falsifier's reply.
export function InvestigationEvidence({ item }: { item: ConflictItem }) {
  const f = item.findings
  const row = (label: string, value: string) => (
    <Box minW0>
      <Hint as="dt" size="xs">
        {label}
      </Hint>
      <Box as="dd" m0 whitespace="pre-wrap" breakWords size="sm">
        {value}
      </Box>
    </Box>
  )
  return (
    <Stack gap={2}>
      {f && (
        <Box as="dl" css-grid-template-columns="repeat-auto-fit-minmax-min-100%-16rem-1fr" m0 grid gap="2">
          {row('Read', f.read)}
          {row('Cause or approach', f.cause)}
          {row('Planned change', f.plan)}
          {row('How it is checked', f.check)}
          {row('Worker is sure', CONFIDENCE[f.confidence])}
        </Box>
      )}
      {item.reply && (
        <Box css-border-color="border" rounded="base" border="all" p="2" size="sm">
          <Hint as="div" size="xs">
            Falsifier: {item.reply.verdict === 'refuted' ? 'refuted' : 'stands'}, {CONFIDENCE[item.reply.confidence].toLowerCase()} confidence
          </Hint>
          <Box as="p" mt="1" whitespace="pre-wrap" breakWords>
            {item.reply.evidence}
          </Box>
        </Box>
      )}
    </Stack>
  )
}

function Evidence({ item }: { item: ConflictItem }) {
  const kinds = evidenceOf(item)
  const context = item.context
  const link = safeHref(item.link ?? null)
  return (
    <>
      {kinds.includes('values') && <Values item={item} />}
      {kinds.includes('investigation') && <InvestigationEvidence item={item} />}
      {kinds.includes('review') && (
        <Box as="ul" m0 flex listNone flexCol p="0" data-review-tasks>
          {(item.tasks ?? []).map((task) => (
            <ReviewTaskContext key={task.id} task={task} />
          ))}
        </Box>
      )}
      {kinds.includes('summary') && context?.review && (
        <Box flex flexCol gap="1" size="sm" data-review-summary>
          {context.review.summary ? (
            <Box as="p" m0 data-ai-summary>
              {context.review.summary.text}
              {!context.review.summary.current && <Hint size="xs"> (written for an older revision)</Hint>}
            </Box>
          ) : (
            <Hint as="p" flush>
              No AI summary is stored for this draft yet.
            </Hint>
          )}
          <Box as="span" flex flexWrap items="center" gap="2" size="xs" tone="muted">
            {context.review.state === 'not-reviewed' ? 'Not reviewed yet' : `${context.review.found} found, ${context.review.fixed} fixed`}
            <SeverityBadges counts={context.review.openBySeverity} label="Open review findings" />
          </Box>
        </Box>
      )}
      {kinds.includes('text') && context?.text && <TaskText title={context.task?.title ?? item.title} context={context} />}
      {kinds.includes('links') && context?.links && (
        <Box flex flexWrap items="center" gapX="3" gapY="1" size="sm" data-context-links>
          {context.links.pr && (
            <TextLink href={linkHref(context.links.pr.url)} target="_blank" rel="noopener noreferrer" data-pr-chip>
              Pull request #{context.links.pr.number}
              {context.links.pr.state === 'open' || context.links.pr.state === 'unknown' ? '' : ` (${context.links.pr.state})`}
            </TextLink>
          )}
          {context.links.branch && (
            <TextLink href={linkHref(context.links.branch.url)} target="_blank" rel="noopener noreferrer" data-branch-chip>
              Branch {context.links.branch.ref}
            </TextLink>
          )}
          {context.links.checks && <Hint>{checkDot(context.links.checks).label}</Hint>}
        </Box>
      )}
      {kinds.includes('checks') && context?.failedChecks && (
        <Stack gap={1} data-failed-checks>
          {context.failedChecks.checks.map((check) => (
            <Stack key={check.name}>
              <span>
                Failed check <strong>{check.name}</strong>
                {check.conclusion ? ` (${check.conclusion})` : ''}
                {context.failedChecks!.commit ? ` on ${context.failedChecks!.commit.slice(0, 7)}` : ''}
              </span>
              {check.firstError ? <code data-first-error>{check.firstError}</code> : <Hint size="xs">The check gave no error line.</Hint>}
            </Stack>
          ))}
        </Stack>
      )}
      {kinds.includes('content') && (
        <Box as="p" m0 size="sm" data-content-evidence>
          Rule set {item.set ?? 'unknown'}
          {item.rules?.length ? `, rule ${item.rules.join(', ')}` : ''}
          {item.target ? `, ${item.target}` : ''}
          {item.line ? `, line ${item.line}` : ''}
          {item.boundary ? ` (${item.boundary})` : ''}. The matched text is not stored here.
        </Box>
      )}
      {kinds.includes('escalation') && item.escalation && (
        <Box flex flexCol gap="1" size="sm" data-escalation-evidence>
          <Box as="p" m0>
            An Issue Radar crew added “{item.escalation.label}”{item.escalation.scope ? ` (${item.escalation.scope})` : ''}.
          </Box>
          {item.escalation.draft && (
            <Box as="ul" css-list-style="disc" m0 pl="5">
              {item.escalation.draft.acceptance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </Box>
          )}
        </Box>
      )}
      {kinds.length === 0 && (
        <Hint as="p" size="sm" flush data-no-evidence>
          Avoozl holds no more detail for this item than the reason above.
          {link ? (
            <>
              {' '}
              Look at{' '}
              <TextLink href={linkHref(link)} target="_blank" rel="noreferrer">
                the source
              </TextLink>
              .
            </>
          ) : (
            item.taskId && ' Open the task for its history.'
          )}
        </Hint>
      )}
    </>
  )
}

// The block itself. `data-needs-context` marks it for the tests: a Resolve
// card never renders without it.
export function ItemContextBlock({ item, plan }: { item: ConflictItem; plan?: string | null }) {
  const context = item.context
  const task = context?.task ?? (item.taskId ? { id: item.taskId, title: item.title } : null)
  const spec = specOfItem(item) ?? (plan ? { planId: null, name: plan, title: plan } : null)
  const unblock = unblockLine(item)
  return (
    <Box css-border-color="border" flex flexCol gap="3" rounded="base" border="all" p="3" data-needs-context={item.kind}>
      <NeedsContextStyle />
      <Box as="dl" css-grid-template-columns="auto-1fr" m0 grid gapX="3" gapY="1" size="sm" data-context-where>
        <Hint as="dt" size="xs">
          Spec
        </Hint>
        <Box as="dd" css-overflow-wrap="anywhere" m0 minW0>
          {spec ? <SpecLink spec={spec} /> : <Hint>Not part of a spec</Hint>}
        </Box>
        {task && (
          <>
            <Hint as="dt" size="xs">
              Task
            </Hint>
            <Box as="dd" css-overflow-wrap="anywhere" m0 minW0>
              <TaskLink task={task} />
            </Box>
          </>
        )}
        {context?.source && item.kind !== 'review' && (
          <>
            <Hint as="dt" size="xs">
              Source
            </Hint>
            <Box as="dd" m0 minW0>
              <Tooltip text="Where the task is written in the spec">
                <Box as="code" size="xs">
                  {sourceLine(context.source)}
                </Box>
              </Tooltip>
            </Box>
          </>
        )}
      </Box>
      <Section name="asked" title="What is asked, and why">
        <Box as="p" m0 size="sm" weight="medium">
          {askLine(item)}
        </Box>
        <Hint as="p" size="sm" flush data-context-why>
          {whyLine(item)}
        </Hint>
      </Section>
      {unblock && (
        <Section name="unblocks" title="What it unblocks">
          <Box as="p" m0 size="sm">
            {unblock}
          </Box>
        </Section>
      )}
      <Section name="evidence" title="Evidence">
        <Evidence item={item} />
      </Section>
    </Box>
  )
}
