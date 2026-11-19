// A task's GitHub links in its Links box (R92.5, R92.9, R92.10, design
// §4.27): branch, pull request, checks, landed commit and issue, from the
// stored link set task.detail returns (scm-links.mjs). No GitHub call. Each
// link opens in a new tab; the worktree path is local text, never a link.
// The Graph opens the same task details, so it shows the same box.
import type { ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { linkHref, safeHref } from './views-api.ts'
import { checksLine, scmLabel, type ScmChecks, type ScmLink, type TaskScmLinks } from './task-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainLink } from './ui/Plain'

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
    <PlainLink href={linkHref(href)} target="_blank" rel="noopener noreferrer" css-overflow-wrap="anywhere" underline>
      {props.children}
    </PlainLink>
  )
}

function Item({ link }: { link: ScmLink }) {
  return <Out to={link.url}>{scmLabel(link)}</Out>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Hint as="dt">{label}</Hint>
      <Box as="dd" minW0 breakWords>
        {children}
      </Box>
    </>
  )
}

export function Checks({ checks }: { checks: ScmChecks }) {
  return (
    <Box as="span" flex items="start" gap="1.5" data-checks-dot={checks.dot}>
      <span
        aria-hidden="true"
        className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full"
        style={checks.dot === 'stale' ? { border: `1.5px solid ${DOT.stale}` } : { background: DOT[checks.dot] }}
      />
      <Tooltip text={`Read for ${checks.head}${checks.current ? '' : '. Not the current head: run them again to see its state.'}`}>
        <Box as="span" minW0>
          <Out to={checks.url}>{checksLine(checks)}</Out>
        </Box>
      </Tooltip>
    </Box>
  )
}

// A row with nothing to show is not drawn; with no rows at all, nothing is.
export function TaskScmLinks({ links }: { links: TaskScmLinks | null | undefined }) {
  const set = links ?? null
  if (!set || !(set.branch || set.worktree || set.pr || set.checks || set.landed || set.issue || set.source)) return null
  return (
    <Box as="dl" css-grid-template-columns="max-content-1fr" grid gapX="3" gapY="1.5" size="sm" data-scm-links>
      {set.branch && (
        <Row label="Branch">
          <Item link={set.branch} />
        </Row>
      )}
      {set.worktree && (
        <Row label="Worktree">
          <Box as="code" css-overflow-wrap="anywhere" size="xs" data-worktree-path>
            {set.worktree.path}
          </Box>{' '}
          <Hint size="xs">on this machine</Hint>
        </Row>
      )}
      {set.pr && (
        <Row label="Pull request">
          <span>
            <Out to={set.pr.url}>{scmLabel(set.pr)}</Out>
            {set.pr.state !== 'unknown' && <Hint size="xs"> · {set.pr.state}</Hint>}
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
    </Box>
  )
}
