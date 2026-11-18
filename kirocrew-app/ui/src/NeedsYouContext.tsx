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

const BOX = { borderColor: 'var(--border)' }
const linkButton = { background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left' as const }

// The spec's title; it opens Specs on that spec when a stored plan exists.
export function SpecLink({ spec }: { spec: NonNullable<ItemContext['spec']> }) {
  const open = useOpenSpec()
  if (!spec.planId || !open) return <span data-spec-name>{spec.title}</span>
  return (
    <button type="button" className="underline" style={linkButton} data-spec-link={spec.planId} onClick={() => open(spec.planId!)}>
      {spec.title}
    </button>
  )
}

// The task as id and title; it opens the task view.
export function TaskLink({ task }: { task: { id: string; title: string } }) {
  const drawer = useTaskDrawer()
  return (
    <button type="button" className="underline" style={linkButton} data-task-link={task.id} onClick={() => drawer.openTask(task.id)}>
      {task.id}: {task.title}
    </button>
  )
}

const DIFF_INK: Record<DiffLine['kind'], string | undefined> = { same: undefined, add: 'var(--success, var(--text))', remove: 'var(--danger)' }
const DIFF_MARK: Record<DiffLine['kind'], string> = { same: ' ', add: '+', remove: '−' }

// Task text, old against new, or the text with its file path and lines.
export function TaskText(props: { title: string; context: ItemContext | undefined; note?: boolean }) {
  const evidence = reviewEvidence(props.title, props.context)
  const source = props.context?.source
  if (!evidence) return <Hint as="p" size="xs" flush>Avoozl holds no text for this task.</Hint>
  return (
    <Stack data-task-text gap={1}>
      {source && (
        <code className="text-xs text-muted" data-snippet-head>
          {sourceLine(source)}
        </code>
      )}
      <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs" style={BOX} data-task-text-body={evidence.kind}>
        {evidence.kind === 'diff'
          ? evidence.lines.map((line, i) => (
              <span key={i} data-diff={line.kind} style={{ display: 'block', color: DIFF_INK[line.kind] }}>
                {DIFF_MARK[line.kind]} {line.text}
              </span>
            ))
          : evidence.lines.join('\n')}
      </pre>
      {evidence.kind === 'text' && props.note && <Hint as="p" size="xs" flush>{evidence.note}</Hint>}
    </Stack>
  )
}

// Each task of a review group: its title (opens the task), spec and text.
export function ReviewTaskContext({ task }: { task: ReviewTask }) {
  const drawer = useTaskDrawer()
  return (
    <li className="flex flex-col gap-1 border-t py-2 first:border-t-0" style={BOX} data-review-task={task.id}>
      <span className="flex flex-wrap items-baseline gap-2 text-sm">
        <button type="button" className="font-medium underline" style={linkButton} data-task-link={task.id} onClick={() => drawer.openTask(task.id)}>
          {task.id}: {task.title}
        </button>
        {task.context?.spec && (
          <Hint size="xs">
            Spec: <SpecLink spec={task.context.spec} />
          </Hint>
        )}
      </span>
      <TaskText title={task.title} context={task.context} note />
    </li>
  )
}

function Section(props: { name: string; title: string; children: ReactNode }) {
  return (
    <Stack as="section" gap={1} data-context-section={props.name}>
      <h4 className="m-0 text-xs font-semibold uppercase text-muted">{props.title}</h4>
      {props.children}
    </Stack>
  )
}

const shownValue = (value: string | string[] | null | undefined) => (Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : value ? value : 'empty')

// A GitHub edit: what Avoozl expected and what GitHub has.
export function Values({ item }: { item: ConflictItem }) {
  if (item.expected === undefined && item.actual === undefined) return null
  const block = (label: string, value: ConflictItem['expected']) => (
    <div className="min-w-0">
      <Hint as="div" size="xs">{label}</Hint>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs" style={BOX}>
        {shownValue(value)}
      </pre>
    </div>
  )
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
      {block('Avoozl expected', item.expected)}
      {block(item.changedBy ? `GitHub has (changed by ${item.changedBy})` : 'GitHub has', item.actual)}
    </div>
  )
}

const CONFIDENCE = { low: 'Low', medium: 'Medium', high: 'High' } as const

// A worker's findings and the falsifier's reply.
export function InvestigationEvidence({ item }: { item: ConflictItem }) {
  const f = item.findings
  const row = (label: string, value: string) => (
    <div className="min-w-0">
      <Hint as="dt" size="xs">{label}</Hint>
      <dd className="m-0 whitespace-pre-wrap break-words text-sm">{value}</dd>
    </div>
  )
  return (
    <Stack gap={2}>
      {f && (
        <dl className="m-0 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
          {row('Read', f.read)}
          {row('Cause or approach', f.cause)}
          {row('Planned change', f.plan)}
          {row('How it is checked', f.check)}
          {row('Worker is sure', CONFIDENCE[f.confidence])}
        </dl>
      )}
      {item.reply && (
        <div className="rounded border p-2 text-sm" style={BOX}>
          <Hint as="div" size="xs">
            Falsifier: {item.reply.verdict === 'refuted' ? 'refuted' : 'stands'}, {CONFIDENCE[item.reply.confidence].toLowerCase()} confidence
          </Hint>
          <p className="mt-1 whitespace-pre-wrap break-words">{item.reply.evidence}</p>
        </div>
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
        <ul className="m-0 flex list-none flex-col p-0" data-review-tasks>
          {(item.tasks ?? []).map((task) => (
            <ReviewTaskContext key={task.id} task={task} />
          ))}
        </ul>
      )}
      {kinds.includes('summary') && context?.review && (
        <div className="flex flex-col gap-1 text-sm" data-review-summary>
          {context.review.summary ? (
            <p className="m-0" data-ai-summary>
              {context.review.summary.text}
              {!context.review.summary.current && <Hint size="xs"> (written for an older revision)</Hint>}
            </p>
          ) : (
            <Hint as="p" flush>No AI summary is stored for this draft yet.</Hint>
          )}
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {context.review.state === 'not-reviewed' ? 'Not reviewed yet' : `${context.review.found} found, ${context.review.fixed} fixed`}
            <SeverityBadges counts={context.review.openBySeverity} label="Open review findings" />
          </span>
        </div>
      )}
      {kinds.includes('text') && context?.text && <TaskText title={context.task?.title ?? item.title} context={context} />}
      {kinds.includes('links') && context?.links && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-context-links>
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
        </div>
      )}
      {kinds.includes('checks') && context?.failedChecks && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" data-failed-checks>
          {context.failedChecks.checks.map((check) => (
            <li key={check.name} className="flex min-w-0 flex-col">
              <span>
                Failed check <strong>{check.name}</strong>
                {check.conclusion ? ` (${check.conclusion})` : ''}
                {context.failedChecks!.commit ? ` on ${context.failedChecks!.commit.slice(0, 7)}` : ''}
              </span>
              {check.firstError ? (
                <code className="break-words text-xs" data-first-error>
                  {check.firstError}
                </code>
              ) : (
                <Hint size="xs">The check gave no error line.</Hint>
              )}
            </li>
          ))}
        </ul>
      )}
      {kinds.includes('content') && (
        <p className="m-0 text-sm" data-content-evidence>
          Rule set {item.set ?? 'unknown'}
          {item.rules?.length ? `, rule ${item.rules.join(', ')}` : ''}
          {item.target ? `, ${item.target}` : ''}
          {item.line ? `, line ${item.line}` : ''}
          {item.boundary ? ` (${item.boundary})` : ''}. The matched text is not stored here.
        </p>
      )}
      {kinds.includes('resource') && <p className="m-0 text-sm">Runs: {item.runs!.join(', ')}</p>}
      {kinds.includes('escalation') && item.escalation && (
        <div className="flex flex-col gap-1 text-sm" data-escalation-evidence>
          <p className="m-0">An Issue Radar crew added “{item.escalation.label}”{item.escalation.scope ? ` (${item.escalation.scope})` : ''}.</p>
          {item.escalation.draft && (
            <ul className="m-0 pl-5" style={{ listStyle: 'disc' }}>
              {item.escalation.draft.acceptance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
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
    <div className="flex flex-col gap-3 rounded border p-3" style={BOX} data-needs-context={item.kind}>
      <style>{'[data-needs-context] :is(dl,dd,h4,p,ul){margin:0}[data-needs-context] dd{margin-left:0}'}</style>
      <dl className="m-0 grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: 'auto 1fr' }} data-context-where>
        <Hint as="dt" size="xs">Spec</Hint>
        <dd className="m-0 min-w-0" style={{ overflowWrap: 'anywhere' }}>
          {spec ? <SpecLink spec={spec} /> : <Hint>Not part of a spec</Hint>}
        </dd>
        {task && (
          <>
            <Hint as="dt" size="xs">Task</Hint>
            <dd className="m-0 min-w-0" style={{ overflowWrap: 'anywhere' }}>
              <TaskLink task={task} />
            </dd>
          </>
        )}
        {context?.source && item.kind !== 'review' && (
          <>
            <Hint as="dt" size="xs">Source</Hint>
            <dd className="m-0 min-w-0">
              <Tooltip text="Where the task is written in the spec">
                <code className="text-xs">{sourceLine(context.source)}</code>
              </Tooltip>
            </dd>
          </>
        )}
      </dl>
      <Section name="asked" title="What is asked, and why">
        <p className="m-0 text-sm font-medium">{askLine(item)}</p>
        <Hint as="p" size="sm" flush data-context-why>
          {whyLine(item)}
        </Hint>
      </Section>
      {unblock && (
        <Section name="unblocks" title="What it unblocks">
          <p className="m-0 text-sm">{unblock}</p>
        </Section>
      )}
      <Section name="evidence" title="Evidence">
        <Evidence item={item} />
      </Section>
    </div>
  )
}
