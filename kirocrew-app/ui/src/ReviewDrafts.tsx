// Review drafts on the Dashboard (RC20.6): every draft review Avoozl made from
// the review label, filtered by repository and state, and the GitHub search
// that finds the pull requests whose drafts wait on people. Read only: the
// person edits and submits each draft on GitHub. Nothing shows without a draft.
import { useCallback, useMemo, useState } from 'react'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge, { type BadgeVariant } from './ui/Badge.tsx'
import { SectionHeading } from './ui/controls.tsx'
import { FilterSelect } from './FilterSelect.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { DRAFT_STATE_TEXT, releaseClient, type DraftState } from './release-api.ts'
import { linkHref } from './views-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { PlainLink } from './ui/Plain'

const VARIANT: Partial<Record<DraftState, BadgeVariant>> = { waiting: 'warning', stale: 'danger', submitted: 'success', chat: 'info', queued: 'info' }

export default function ReviewDrafts(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => releaseClient(api), [api])
  const load = useCallback((id: string) => client.drafts(id), [client])
  const { value } = useRead(props.workspaceId, load)
  const [repository, setRepository] = useState('')
  const [state, setState] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const items = value?.items ?? []
  if (!items.length) return null
  const repositories = [...new Set(items.map((item) => item.repository))].sort()
  const states = [...new Set(items.map((item) => item.state))]
  const shown = items.filter((item) => (!repository || item.repository === repository) && (!state || item.state === state))
  const copy = async (query: string) => {
    try {
      await navigator.clipboard.writeText(query)
      setCopied(query)
    } catch {
      setCopied(null)
    }
  }
  return (
    <div data-review-drafts>
      <Card css-display="flex" css-flex-direction="column" css-gap="8" flex flexCol gap="2">
        <SectionHeading title="Review drafts" className="mb-0" />
        <Hint as="p" size="xs">Draft reviews Avoozl made when someone added the review label. Each one waits on GitHub, seen only by that person, until they submit it.</Hint>
        {(value?.searches ?? []).map((search) => (
          <Box key={search.label} data-draft-search css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8" flex flexWrap items="center" gap="2" size="sm">
            <span>On GitHub:</span>
            <a href={linkHref(search.url)} target="_blank" rel="noreferrer">
              <code>{search.query}</code>
            </a>
            <Btn type="button" onClick={() => void copy(search.query)}>
              {copied === search.query ? 'Copied' : 'Copy'}
            </Btn>
          </Box>
        ))}
        <Box css-display="flex" css-flex-wrap="wrap" css-gap="12" flex flexWrap gap="3">
          <FilterSelect id="review-drafts-repository" label="Repository" value={repository} options={repositories.map((name) => ({ value: name, label: name }))} onChange={setRepository} />
          <FilterSelect id="review-drafts-state" label="State" value={state} options={states.map((name) => ({ value: name, label: DRAFT_STATE_TEXT[name] }))} onChange={setState} />
        </Box>
        {shown.map((item) => (
          <Box key={item.id} data-review-draft={item.state} css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-gap="4px-12px" flex flexWrap items="baseline" gapX="3" gapY="1" size="sm">
            <PlainLink href={linkHref(item.url)} target="_blank" rel="noreferrer" css-overflow-wrap="anywhere" weight="medium">
              {item.repository} #{item.number}
            </PlainLink>
            <Badge variant={VARIANT[item.state] ?? 'info'}>{DRAFT_STATE_TEXT[item.state]}</Badge>
            <Box as="span" css-overflow-wrap="anywhere" tone="muted">
              {item.title} · for {item.reviewer}
              {item.state === 'stale' && item.headSha && item.staleHead ? ` · reviews ${item.headSha.slice(0, 7)}, now at ${item.staleHead.slice(0, 7)}` : ''}
            </Box>
            {item.chat && (
              <PlainLink href={linkHref(item.chat)} size="xs">
                Open chat
              </PlainLink>
            )}
          </Box>
        ))}
        {!shown.length && <Hint as="p" size="sm">No draft matches these filters.</Hint>}
      </Card>
    </div>
  )
}
