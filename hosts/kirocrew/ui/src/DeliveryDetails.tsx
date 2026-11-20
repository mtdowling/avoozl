import { useState } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { DangerBtn, TipBtn } from './ui/controls.tsx'
import { safeHref, scalarFields, verdictLabel, type DeliveryItem, type ReviewRound } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { TextLink } from './ui/TextLink'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

// A delivery's record, shared by the Delivery cards and the task drawer:
// runs, integration, pull requests, reviews, evidence, Project notes, and
// the dismiss-and-retry form.
function Link({ text }: { text: string }) {
  const href = safeHref(text)
  return href ? (
    <TextLink href={linkHref(href)} target="_blank" rel="noreferrer">
      {text}
    </TextLink>
  ) : (
    <Box as="code" breakAll>
      {text}
    </Box>
  )
}

function Records({ label, records }: { label: string; records: Record<string, unknown>[] }) {
  if (!records.length) return null
  return (
    <Box mt="2" size="xs">
      <Box as="span" weight="medium">
        {label}
      </Box>
      <Box as="ul" mt="1" flex flexCol gap="1">
        {records.map((record, i) => (
          <Hint key={i} as="li">
            {scalarFields(record)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')}
          </Hint>
        ))}
      </Box>
    </Box>
  )
}

// Review rounds: per subject commit, each role's verdict and findings.
function Rounds({ rounds }: { rounds: ReviewRound[] }) {
  if (!rounds.length) return null
  return (
    <Box mt="2" size="xs">
      <Box as="span" weight="medium">
        Review rounds
      </Box>
      <Box as="ul" mt="1" flex flexCol gap="2">
        {rounds.map((round, i) => (
          <li key={`${round.commit}-${i}`}>
            <code>{round.commit?.slice(0, 12) ?? 'unknown commit'}</code>
            {round.current ? ' (current)' : ' (stale)'}
            <Box as="ul" ml="3" mt="1" flex flexCol gap="1">
              {round.verdicts.map((verdict) => (
                <li key={`${verdict.role}-${verdict.attempt}`}>
                  {verdict.link ? <TextLink href={linkHref(verdict.link)}>{verdictLabel(verdict)}</TextLink> : verdictLabel(verdict)}
                  {verdict.cause && <Hint> · {verdict.cause}</Hint>}
                  {verdict.findings.length > 0 && (
                    <Box as="ul" ml="3" mt="1" flex flexCol gap="1">
                      {verdict.findings.map((finding) => (
                        <li key={finding.ref}>
                          <Badge variant={finding.state === 'open' ? 'danger' : 'success'}>{finding.state}</Badge> <code>{finding.ref}</code> {finding.kind} ·{' '}
                          {finding.paths.join(', ')}: <Hint>{finding.text}</Hint>
                        </li>
                      ))}
                    </Box>
                  )}
                </li>
              ))}
            </Box>
          </li>
        ))}
      </Box>
    </Box>
  )
}

// Open review findings a person may dismiss with a reason, then retry.
function openFindings(item: DeliveryItem) {
  return (item.rounds ?? []).filter((round) => round.current).flatMap((round) => round.verdicts.flatMap((verdict) => verdict.findings.filter((f) => f.state === 'open')))
}

export type Act = (call: () => Promise<unknown>) => void

export function RetryForm({ item, busy, onRetry }: { item: DeliveryItem; busy: boolean; onRetry: (dismiss: { finding: string; reason: string }[]) => void }) {
  const findings = openFindings(item)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  if (!findings.length) return null
  return (
    <Box mt="2" flex flexCol gap="1.5" size="xs">
      <Box as="span" weight="medium">
        Dismiss findings, then retry
      </Box>
      {findings.map((finding) => (
        <Switch
          key={finding.ref}
          label={`Dismiss ${finding.ref}`}
          align="start"
          gap={1.5}
          checked={picked.has(finding.ref)}
          onChange={(on) => {
            const next = new Set(picked)
            if (on) next.add(finding.ref)
            else next.delete(finding.ref)
            setPicked(next)
          }}
        >
          <span>
            <code>{finding.ref}</code> {finding.kind}: <Hint>{finding.text}</Hint>
          </span>
        </Switch>
      ))}
      <Box htmlFor={`dismiss-${item.id}`} as="label" flex flexCol gap="1">
        <span>Why they do not apply</span>
        <Input id={`dismiss-${item.id}`} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Box>
      <div>
        <DangerBtn
          disabled={busy || !picked.size || !reason.trim()}
          confirm={{
            title: `Dismiss ${picked.size} ${picked.size === 1 ? 'finding' : 'findings'} and retry?`,
            body: 'The dismissed findings no longer block this delivery, with your reason recorded. A new attempt starts.',
            action: 'Dismiss and retry',
          }}
          onConfirm={() => onRetry([...picked].map((finding) => ({ finding, reason: reason.trim() })))}
        >
          Dismiss {picked.size || ''} and retry
        </DangerBtn>
      </div>
    </Box>
  )
}

export function ItemDetails({ item }: { item: DeliveryItem }) {
  return (
    <Box css-border-color="border" mt="2" border="t" pt="2">
      <Box flex flexWrap gap="1.5">
        <Badge variant={item.complete ? 'success' : 'info'}>{item.status ?? 'no status'}</Badge>
        {item.repository && <Badge>{item.repository}</Badge>}
      </Box>
      {item.integration && (
        <Box as="p" mt="2" size="xs">
          Integrated <code>{item.integration.commit?.slice(0, 12) ?? 'unknown commit'}</code>
          {item.integration.branch ? ` on ${item.integration.branch}` : ''}
        </Box>
      )}
      {item.pullRequests.length > 0 && (
        <Box as="ul" mt="2" flex flexCol gap="1" size="xs">
          {item.pullRequests.map((pull, i) => {
            const href = safeHref(pull.url)
            const label = `PR ${pull.number ? `#${pull.number}` : ''}${pull.merged ? ' (merged)' : ''}`
            return (
              <li key={i}>
                {href ? (
                  <TextLink href={linkHref(href)} target="_blank" rel="noreferrer">
                    {label}
                  </TextLink>
                ) : (
                  label
                )}
              </li>
            )
          })}
        </Box>
      )}
      {item.evidence.length > 0 && (
        <Box mt="2" size="xs">
          <Box as="span" weight="medium">
            Evidence
          </Box>
          <Box as="ul" mt="1" flex flexCol gap="1">
            {item.evidence.map((entry, i) => (
              <li key={entry.id ?? i}>
                {entry.text ? <Link text={entry.text} /> : (entry.kind ?? 'record')}
                {entry.exitCode !== undefined && entry.exitCode !== null && <Hint> · exit {entry.exitCode}</Hint>}
                {entry.commit && <Hint> · {entry.commit.slice(0, 12)}</Hint>}
              </li>
            ))}
          </Box>
        </Box>
      )}
      <Rounds rounds={item.rounds ?? []} />
      <Records label="Deliveries" records={item.deliveries} />
      <Records label="Worktrees" records={item.worktrees} />
    </Box>
  )
}
