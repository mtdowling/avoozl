import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SmallBtn } from './controls.tsx'
import { Tooltip } from './Tooltip.tsx'
import { Hourglass } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { shortHash, type PlanReviewSummary as Summary, type ReviewDisposition } from './plans-api.ts'

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
export function ReviewWorking(props: { model: string | null }) {
  const label = `Reviewing with ${props.model ?? 'the reviewer model'}…`
  return (
    <div data-review-working role="status" aria-live="polite" aria-label={label} className="rounded-lg px-4 py-3">
      <style>{WORKING}</style>
      <div className="relative flex items-center gap-3">
        <Hourglass size={18} aria-hidden className="shrink-0" style={{ color: 'var(--aim, #7c3aed)' }} />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold" style={{ color: 'var(--aim, #7c3aed)' }} data-plan-review-state>Review running</p>
          <p className="m-0 text-xs text-muted">{label}</p>
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

// Both approval dialogs use the same evidence. Closing a finding is separate
// from approving a plan and never controls the Approve button.
export const REVIEW_POLL_MS = 3000

export function PlanReviewSummary(props: { review?: Summary | null; onStart?: () => Promise<unknown>; onRefresh?: () => Promise<Summary | null>; onClose: (id: string, disposition: ReviewDisposition) => Promise<Summary | null> }) {
  const [review, setReview] = useState(props.review)
  const [queued, setQueued] = useState(false)
  const [starting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    setError(null)
    try { await props.onStart?.(); setQueued(true) }
    catch (caught) { setError(errorMessage(caught)) }
    finally { setStarting(false) }
  }
  const [closing, setClosing] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, ReviewDisposition>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setReview(props.review), [props.review])
  // A running review settles in Avoozl's own store; re-read it (no GitHub
  // call) until it leaves running, and swap the findings in place.
  const running = review?.state === 'running'
  const refresh = useRef(props.onRefresh)
  refresh.current = props.onRefresh
  useEffect(() => {
    if (!running) return
    let live = true
    const timer = setInterval(() => {
      refresh.current?.().then((next) => { if (live && next) setReview(next) }).catch(() => undefined)
    }, REVIEW_POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [running])
  const close = async (id: string) => {
    setClosing(id)
    setError(null)
    try { setReview(await props.onClose(id, choices[id] ?? 'resolved')) }
    catch (caught) { setError(errorMessage(caught)) }
    finally { setClosing(null) }
  }
  return (
    <div data-plan-review className="flex min-w-0 flex-col gap-2 text-sm" style={{ overflowWrap: 'anywhere' }}>
      {(review?.revisionHash || review?.note || review?.unproven || (review?.canReviewAnyway && props.onStart)) && (
        <section data-review-reviewer className="flex flex-col gap-2 rounded border p-3" style={BOX}>
          {review?.revisionHash && (
            <table className="text-sm" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><th scope="row" style={ROW_TH}>Reviewer</th><td style={ROW_TD}>{review.reviewerModel ?? 'not set'}</td></tr>
                <tr><th scope="row" style={ROW_TH}>Revision</th><td style={ROW_TD}><Tooltip text={review.revisionHash}><code>{shortHash(review.revisionHash)}</code></Tooltip>{!review.current && <span className="text-muted"> · older revision</span>}</td></tr>
                <tr><th scope="row" style={ROW_TH}>Writer</th><td style={ROW_TD}>{review.writerModel ?? 'unknown'}</td></tr>
              </tbody>
            </table>
          )}
          {review?.unproven && <Note>The reviewer and writer were not proven to use different models.</Note>}
          {review?.note && <Note>{review.note}</Note>}
          {review?.canReviewAnyway && props.onStart && (
            <Note>
              <span className="flex flex-col items-start gap-1">
                Reviewing anyway records that the models were not proven different.
                <SmallBtn disabled={starting || queued} onClick={() => void start()} attrs={{ 'data-review-anyway': true }}>Review anyway</SmallBtn>
              </span>
            </Note>
          )}
        </section>
      )}
      <section data-review-status className="flex flex-col gap-2 rounded border p-3" style={BOX}>
        {review?.state === 'running' ? <ReviewWorking model={review.reviewerModel} /> : <p className="m-0 font-medium" data-plan-review-state>{reviewStateLabel(review)}</p>}
        {queued && <p role="status" className="m-0">Review queued for this revision.</p>}
        <p className="m-0" data-review-counts>{review?.found ?? 0} found · {review?.fixed ?? 0} fixed · {review?.forYou ?? 0} for you</p>
      </section>
      {(review?.open ?? []).map((finding) => (
        <article key={finding.id} data-review-finding={finding.id} className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <p className="m-0 text-xs text-muted"><code>{finding.file}:{finding.line}</code> · {finding.kind} · {finding.severity}{!finding.current && ' · older revision'}</p>
          <p className="m-0 font-medium">{finding.claim}</p>
          <p className="m-0 whitespace-pre-wrap text-muted">Evidence: {finding.evidence}</p>
          <p className="m-0 whitespace-pre-wrap">
            {finding.answer ? <>Planner: {finding.answer.action === 'fixed' ? <>Fixed in <code>{shortHash(finding.answer.revisionHash)}</code>.</> : 'Answered.'} {finding.answer.text}</> : 'Planner has not answered.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`Close finding ${finding.id} as`} value={choices[finding.id] ?? 'resolved'} onChange={(event) => setChoices({ ...choices, [finding.id]: event.target.value as ReviewDisposition })}>
              <option value="resolved">Resolved</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="deferred">Deferred</option>
            </select>
            <SmallBtn disabled={closing !== null} onClick={() => void close(finding.id)} attrs={{ 'data-close-review': finding.id }}>Close finding</SmallBtn>
          </div>
        </article>
      ))}
      {error && <p role="alert" className="m-0 text-danger">{error}</p>}
    </div>
  )
}
