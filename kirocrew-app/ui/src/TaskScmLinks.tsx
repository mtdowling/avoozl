// A task's GitHub links in its Links box (R92.5, R92.9, R92.10, design
// §4.27): branch, pull request, checks, landed commit and issue, from the
// stored link set task.detail returns (scm-links.mjs). No GitHub call. Each
// link opens in a new tab; the worktree path is local text, never a link.
// The Graph opens the same task details, so it shows the same box.
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { linkHref, safeHref } from './views-api.ts'
import { checksLine, scmLabel, type ScmChecks, type ScmLink, type TaskScmLinks } from './task-api.ts'

const DOT: Record<ScmChecks['dot'], string> = {
  pass: 'var(--ok)',
  fail: 'var(--danger)',
  pending: 'var(--accent)',
  stale: 'var(--muted)',
}

function Out(props: { to: string | null | undefined; children: ReactNode }) {
  const href = safeHref(props.to ?? null)
  if (!href) return <>{props.children}</>
  return (
    <a href={linkHref(href)} target="_blank" rel="noopener noreferrer" className="underline" style={{ overflowWrap: 'anywhere' }}>
      {props.children}
    </a>
  )
}

function Item({ link }: { link: ScmLink }) {
  return <Out to={link.url}>{scmLabel(link)}</Out>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

export function Checks({ checks }: { checks: ScmChecks }) {
  return (
    <span className="flex items-start gap-1.5" data-checks-dot={checks.dot}>
      <span
        aria-hidden="true"
        className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full"
        style={checks.dot === 'stale' ? { border: `1.5px solid ${DOT.stale}` } : { background: DOT[checks.dot] }}
      />
      <Tooltip text={`Read for ${checks.head}${checks.current ? '' : '. Not the current head: run them again to see its state.'}`}>
        <span className="min-w-0">
          <Out to={checks.url}>{checksLine(checks)}</Out>
        </span>
      </Tooltip>
    </span>
  )
}

// A row with nothing to show is not drawn; with no rows at all, nothing is.
export function TaskScmLinks({ links }: { links: TaskScmLinks | null | undefined }) {
  const set = links ?? null
  if (!set || !(set.branch || set.worktree || set.pr || set.checks || set.landed || set.issue || set.source)) return null
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: 'max-content 1fr' }} data-scm-links>
      {set.branch && (
        <Row label="Branch">
          <Item link={set.branch} />
        </Row>
      )}
      {set.worktree && (
        <Row label="Worktree">
          <code className="text-xs" style={{ overflowWrap: 'anywhere' }} data-worktree-path>
            {set.worktree.path}
          </code>{' '}
          <span className="text-xs text-muted">on this machine</span>
        </Row>
      )}
      {set.pr && (
        <Row label="Pull request">
          <span>
            <Out to={set.pr.url}>{scmLabel(set.pr)}</Out>
            {set.pr.state !== 'unknown' && <span className="text-xs text-muted"> · {set.pr.state}</span>}
          </span>
        </Row>
      )}
      {set.checks && (
        <Row label="Checks">
          <Checks checks={set.checks} />
        </Row>
      )}
      {set.landed && (
        <Row label="Landed">
          <Item link={set.landed} />
        </Row>
      )}
      {set.issue && (
        <Row label="Issue">
          <Item link={set.issue} />
        </Row>
      )}
      {set.source && (
        <Row label="Came from">
          <Item link={set.source} />
        </Row>
      )}
    </dl>
  )
}
