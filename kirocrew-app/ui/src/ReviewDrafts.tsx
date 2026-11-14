// Review drafts on the Dashboard (RC20.6): every draft review Avoozl made from
// the review label, filtered by repository and state, and the GitHub search
// that finds the pull requests whose drafts wait on people. Read only: the
// person edits and submits each draft on GitHub. Nothing shows without a draft.
import { useCallback, useMemo, useState } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge, { type BadgeVariant } from './Badge.tsx'
import { SectionHeading } from './controls.tsx'
import { FilterSelect } from './FilterSelect.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { DRAFT_STATE_TEXT, releaseClient, type DraftState } from './release-api.ts'

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
      <Card className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeading title="Review drafts" className="mb-0" />
        <p className="text-xs text-muted">Draft reviews Avoozl made when someone added the review label. Each one waits on GitHub, seen only by that person, until they submit it.</p>
        {(value?.searches ?? []).map((search) => (
          <div key={search.label} data-draft-search className="flex flex-wrap items-center gap-2 text-sm" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span>On GitHub:</span>
            <a href={search.url} target="_blank" rel="noreferrer">
              <code>{search.query}</code>
            </a>
            <Btn type="button" onClick={() => void copy(search.query)}>
              {copied === search.query ? 'Copied' : 'Copy'}
            </Btn>
          </div>
        ))}
        <div className="flex flex-wrap gap-3" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <FilterSelect id="review-drafts-repository" label="Repository" value={repository} options={repositories.map((name) => ({ value: name, label: name }))} onChange={setRepository} />
          <FilterSelect id="review-drafts-state" label="State" value={state} options={states.map((name) => ({ value: name, label: DRAFT_STATE_TEXT[name] }))} onChange={setState} />
        </div>
        {shown.map((item) => (
          <div key={item.id} data-review-draft={item.state} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
            <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="font-medium" style={{ overflowWrap: 'anywhere' }}>
              {item.repository} #{item.number}
            </a>
            <Badge variant={VARIANT[item.state] ?? 'info'}>{DRAFT_STATE_TEXT[item.state]}</Badge>
            <span className="text-muted" style={{ overflowWrap: 'anywhere' }}>
              {item.title} · for {item.reviewer}
              {item.state === 'stale' && item.headSha && item.staleHead ? ` · reviews ${item.headSha.slice(0, 7)}, now at ${item.staleHead.slice(0, 7)}` : ''}
            </span>
            {item.chat && (
              <a href={item.chat} className="text-xs">
                Open chat
              </a>
            )}
          </div>
        ))}
        {!shown.length && <p className="text-sm text-muted">No draft matches these filters.</p>}
      </Card>
    </div>
  )
}
