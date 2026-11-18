import { useState, type ReactNode } from 'react'
import { SmallBtn } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { Hourglass } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import { reviewCounts, shortHash, type PlanReviewSummary as Summary, type RevisionChange } from './plans-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'

export function reviewStateLabel(review?: Summary | null): string {
  if (!review || review.state === 'not-reviewed') return 'Not reviewed'
  if (review.state === 'skipped') return 'Review skipped'
  if (review.state === 'running') return 'Review running'
  return review.current ? 'Reviewed' : 'Reviewed at an older revision'
}

// Kiro Crew's own "AI is working" box (the Projects page's plan banner): a
// rounded box tinted 10% with a 50% border, and a band of the same tint
// sweeping across it for 2 s, ease-in-out. The hue is the theme's --aim, the
// purple Kiro Crew keeps for AI work in every theme. Reduced motion keeps the
// box and stops the sweep.
const WORKING = `
@keyframes avoozl-review-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
[data-review-working] { position: relative; overflow: hidden; border: 1px solid color-mix(in srgb, var(--aim, #7c3aed) 50%, transparent); background: color-mix(in srgb, var(--aim, #7c3aed) 10%, transparent); }
[data-review-working]::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--aim, #7c3aed) 10%, transparent), transparent); animation: avoozl-review-sweep 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { [data-review-working]::before { animation: none; display: none; } }
`

// The in-progress review, announced once politely and drawn as Kiro Crew's
// working box.
// The spec Summary reuses it with its own title and label while the reviewer
// writes the summary.
export function ReviewWorking(props: { model: string | null; title?: string; label?: string }) {
  const label = props.label ?? `Reviewing with ${props.model ?? 'the reviewer model'}…`
  return (
    <div data-review-working role="status" aria-live="polite" aria-label={label} className="rounded-lg px-4 py-3">
      <style>{WORKING}</style>
      <div className="relative flex items-center gap-3">
        <Hourglass size={18} aria-hidden className="shrink-0" style={{ color: 'var(--aim, #7c3aed)' }} />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold" style={{ color: 'var(--aim, #7c3aed)' }} data-plan-review-state>{props.title ?? 'Review running'}</p>
          <Hint as="p" size="xs" flush>{label}</Hint>
        </div>
      </div>
    </div>
  )
}

// The dialog's boxes: a bordered section, the reviewer facts as a two-column
// table, and a tinted note for each caveat.
const BOX = { borderColor: 'var(--border)' }
const ROW_TH = { textAlign: 'left' as const, fontWeight: 600, padding: '2px 12px 2px 0', color: 'var(--text-muted, var(--muted))', whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const }
const ROW_TD = { padding: '2px 0' }
function Note(props: { children: ReactNode }) {
  return (
    <p role="note" data-review-note className="m-0 rounded border px-3 py-2" style={{ borderColor: 'color-mix(in srgb, var(--info, var(--accent)) 40%, transparent)', background: 'color-mix(in srgb, var(--info, var(--accent)) 8%, transparent)' }}>
      {props.children}
    </p>
  )
}

// Both approval dialogs use the same evidence: counts by severity and by
// state and a link to the Review view, where findings are read and decided
// (R104.12). Nothing here closes a finding or controls the Approve button.
// The dialog owns the re-read; this draws what it was given.
export const REVIEW_POLL_MS = 3000

export function PlanReviewSummary(props: { review?: Summary | null; onStart?: () => Promise<unknown>; reviewHref?: string | null; onOpenReview?: () => void }) {
  const review = props.review
  const href = linkHref(props.reviewHref)
  const [queued, setQueued] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const start = async () => {
    setStarting(true)
    setError(null)
    try { await props.onStart?.(); setQueued(true) }
    catch (caught) { setError(errorMessage(caught)) }
    finally { setStarting(false) }
  }
  return (
    <div data-plan-review className="flex min-w-0 flex-col gap-2 text-sm" style={{ overflowWrap: 'anywhere' }}>
      {(review?.revisionHash || review?.note || review?.unproven || (review?.canReviewAnyway && props.onStart)) && (
        <section data-review-reviewer className="flex flex-col gap-2 rounded border p-3" style={BOX}>
          {review?.revisionHash && (
            <table className="text-sm" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><th scope="row" style={ROW_TH}>Reviewer</th><td style={ROW_TD}>{review.reviewerModel ?? 'not set'}</td></tr>
                <tr><th scope="row" style={ROW_TH}>Revision</th><td style={ROW_TD}><Tooltip text={review.revisionHash}><code>{shortHash(review.revisionHash)}</code></Tooltip>{!review.current && <Hint> · older revision</Hint>}</td></tr>
                <tr><th scope="row" style={ROW_TH}>Writer</th><td style={ROW_TD}>{review.writerModel ?? 'unknown'}</td></tr>
              </tbody>
            </table>
          )}
          {review?.unproven && <Note>The reviewer and writer were not proven to use different models.</Note>}
          {review?.note && <Note>{review.note}</Note>}
          {review?.canReviewAnyway && props.onStart && (
            <Note>
              <span className="flex flex-col items-start gap-1">
                {review.capped ? 'The round limit is reached for this revision. Review anyway runs one more round.' : 'Reviewing anyway records that the models were not proven different.'}
                <SmallBtn disabled={starting || queued} onClick={() => void start()} attrs={{ 'data-review-anyway': true }}>Review anyway</SmallBtn>
              </span>
            </Note>
          )}
        </section>
      )}
      <section data-review-status className="flex flex-col gap-2 rounded border p-3" style={BOX}>
        {review?.state === 'running' ? <ReviewWorking model={review.reviewerModel} /> : <p className="m-0 font-medium" data-plan-review-state>{reviewStateLabel(review)}</p>}
        {queued && <p role="status" className="m-0">Review queued for this revision.</p>}
        <p className="m-0" data-review-counts>{reviewCounts(review)}</p>
        {review?.revisionHash && (href || props.onOpenReview) && (
          href
            ? <a href={linkHref(href)} className="self-start underline" data-open-review onClick={(event) => { if (!props.onOpenReview) return; event.preventDefault(); props.onOpenReview() }}>Open review</a>
            : <button type="button" className="self-start underline" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }} data-open-review onClick={props.onOpenReview}>Open review</button>
        )}
      </section>
      {error && <ErrorText role="alert" flush>{error}</ErrorText>}
    </div>
  )
}

// What moved while the dialog was open: both hashes, each changed file with
// lines added and removed, and findings the new revision fixed or moved.
export function RevisionChanged(props: { change: RevisionChange }) {
  const { change } = props
  return (
    <section role="status" data-revision-moved className="flex flex-col gap-1 rounded border p-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--info, var(--accent)) 40%, transparent)', background: 'color-mix(in srgb, var(--info, var(--accent)) 8%, transparent)', overflowWrap: 'anywhere' }}>
      <p className="m-0 font-medium">Changed while open: <Tooltip text={change.from}><code>{shortHash(change.from)}</code></Tooltip> → <Tooltip text={change.to}><code>{shortHash(change.to)}</code></Tooltip></p>
      {change.files.length > 0 && (
        <ul className="m-0 flex flex-col pl-5" style={{ listStyle: 'disc' }} data-revision-moved-files>
          {change.files.map((file) => <li key={file.file}><code>{file.file}</code> <span style={file.added ? { color: 'var(--success, var(--text))' } : undefined}>+{file.added}</span> <span style={file.removed ? { color: 'var(--danger)' } : undefined}>−{file.removed}</span></li>)}
        </ul>
      )}
      {change.fixed.length > 0 && <p className="m-0" data-revision-moved-fixed>Now fixed: {change.fixed.map((finding) => finding.claim).join(' · ')}</p>}
      {change.moved.length > 0 && <p className="m-0" data-revision-moved-anchors>Moved or removed: {change.moved.map((finding) => finding.claim).join(' · ')}</p>}
      <Hint as="p" flush>Approve now applies to <code>{shortHash(change.to)}</code>. Press it again to approve this revision.</Hint>
    </section>
  )
}
