import { useState, type ReactNode } from 'react'
import { SmallBtn } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { Hourglass } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import { reviewCounts, shortHash, type PlanReviewSummary as Summary, type RevisionChange } from './plans-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { WorkingStyle } from './ui/PageStyles'
import { PlainButton, PlainLink } from './ui/Plain'
import { Glyph } from './ui/Glyph'

export function reviewStateLabel(review?: Summary | null): string {
  if (!review || review.state === 'not-reviewed') return 'Not reviewed'
  if (review.state === 'skipped') return 'Review skipped'
  if (review.state === 'running') return 'Review running'
  return review.current ? 'Reviewed' : 'Reviewed at an older revision'
}

// The in-progress review, announced once politely and drawn as Kiro Crew's
// working box.
// The spec Summary reuses it with its own title and label while the reviewer
// writes the summary.
export function ReviewWorking(props: { model: string | null; title?: string; label?: string }) {
  const label = props.label ?? `Reviewing with ${props.model ?? 'the reviewer model'}…`
  return (
    <Box data-review-working role="status" aria-live="polite" aria-label={label} rounded="lg" px="4" py="3">
      <WorkingStyle />
      <Box relative flex items="center" gap="3">
        <Glyph icon={Hourglass} size={18} aria-hidden css-color="aim-7c3aed" shrink0 />
        <Box minW0 flex1>
          <Box as="p" css-color="aim-7c3aed" m0 weight="semibold" data-plan-review-state>
            {props.title ?? 'Review running'}
          </Box>
          <Hint as="p" size="xs" flush>
            {label}
          </Hint>
        </Box>
      </Box>
    </Box>
  )
}

function Note(props: { children: ReactNode }) {
  return (
    <Box
      role="note"
      data-review-note
      as="p"
      css-border-color="mix-info-accent-40%-transparent"
      css-background="mix-info-accent-8%-transparent"
      m0
      rounded="base"
      border="all"
      px="3"
      py="2"
    >
      {props.children}
    </Box>
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
    try {
      await props.onStart?.()
      setQueued(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setStarting(false)
    }
  }
  return (
    <Box data-plan-review css-overflow-wrap="anywhere" flex minW0 flexCol gap="2" size="sm">
      {(review?.revisionHash || review?.note || review?.unproven || (review?.canReviewAnyway && props.onStart)) && (
        <Box data-review-reviewer as="section" css-border-color="border" flex flexCol gap="2" rounded="base" border="all" p="3">
          {review?.revisionHash && (
            <Box as="table" css-border-collapse="collapse" size="sm">
              <tbody>
                <tr>
                  <Hint scope="row" as="th" css-text-align="left" css-font-weight="600" css-padding="2px-12px-2px-0" css-white-space="nowrap" css-vertical-align="top">
                    Reviewer
                  </Hint>
                  <Box as="td" css-padding="2px-0">
                    {review.reviewerModel ?? 'not set'}
                  </Box>
                </tr>
                <tr>
                  <Hint scope="row" as="th" css-text-align="left" css-font-weight="600" css-padding="2px-12px-2px-0" css-white-space="nowrap" css-vertical-align="top">
                    Revision
                  </Hint>
                  <Box as="td" css-padding="2px-0">
                    <Tooltip text={review.revisionHash}>
                      <code>{shortHash(review.revisionHash)}</code>
                    </Tooltip>
                    {!review.current && <Hint> · older revision</Hint>}
                  </Box>
                </tr>
                <tr>
                  <Hint scope="row" as="th" css-text-align="left" css-font-weight="600" css-padding="2px-12px-2px-0" css-white-space="nowrap" css-vertical-align="top">
                    Writer
                  </Hint>
                  <Box as="td" css-padding="2px-0">
                    {review.writerModel ?? 'unknown'}
                  </Box>
                </tr>
              </tbody>
            </Box>
          )}
          {review?.unproven && <Note>The reviewer and writer were not proven to use different models.</Note>}
          {review?.note && <Note>{review.note}</Note>}
          {review?.canReviewAnyway && props.onStart && (
            <Note>
              <Box as="span" flex flexCol items="start" gap="1">
                {review.capped
                  ? 'The round limit is reached for this revision. Review anyway runs one more round.'
                  : 'Reviewing anyway records that the models were not proven different.'}
                <SmallBtn disabled={starting || queued} onClick={() => void start()} attrs={{ 'data-review-anyway': true }}>
                  Review anyway
                </SmallBtn>
              </Box>
            </Note>
          )}
        </Box>
      )}
      <Box data-review-status as="section" css-border-color="border" flex flexCol gap="2" rounded="base" border="all" p="3">
        {review?.state === 'running' ? (
          <ReviewWorking model={review.reviewerModel} />
        ) : (
          <Box as="p" m0 weight="medium" data-plan-review-state>
            {reviewStateLabel(review)}
          </Box>
        )}
        {queued && (
          <Box role="status" as="p" m0>
            Review queued for this revision.
          </Box>
        )}
        <Box as="p" m0 data-review-counts>
          {reviewCounts(review)}
        </Box>
        {review?.revisionHash &&
          (href || props.onOpenReview) &&
          (href ? (
            <PlainLink
              href={linkHref(href)}
              self="start"
              underline
              data-open-review
              onClick={(event) => {
                if (!props.onOpenReview) return
                event.preventDefault()
                props.onOpenReview()
              }}
            >
              Open review
            </PlainLink>
          ) : (
            <PlainButton
              type="button"
              css-background="none"
              css-border="0"
              css-padding="0"
              css-color="inherit"
              css-cursor="pointer"
              self="start"
              underline
              data-open-review
              onClick={props.onOpenReview}
            >
              Open review
            </PlainButton>
          ))}
      </Box>
      {error && (
        <ErrorText role="alert" flush>
          {error}
        </ErrorText>
      )}
    </Box>
  )
}

// What moved while the dialog was open: both hashes, each changed file with
// lines added and removed, and findings the new revision fixed or moved.
export function RevisionChanged(props: { change: RevisionChange }) {
  const { change } = props
  return (
    <Box
      role="status"
      data-revision-moved
      as="section"
      css-border-color="mix-info-accent-40%-transparent"
      css-background="mix-info-accent-8%-transparent"
      css-overflow-wrap="anywhere"
      flex
      flexCol
      gap="1"
      rounded="base"
      border="all"
      p="3"
      size="sm"
    >
      <Box as="p" m0 weight="medium">
        Changed while open:{' '}
        <Tooltip text={change.from}>
          <code>{shortHash(change.from)}</code>
        </Tooltip>{' '}
        →{' '}
        <Tooltip text={change.to}>
          <code>{shortHash(change.to)}</code>
        </Tooltip>
      </Box>
      {change.files.length > 0 && (
        <Box as="ul" css-list-style="disc" m0 flex flexCol pl="5" data-revision-moved-files>
          {change.files.map((file) => (
            <li key={file.file}>
              <code>{file.file}</code>{' '}
              <Box as="span" css-color={file.added ? 'success-text' : undefined}>
                +{file.added}
              </Box>{' '}
              <Box as="span" css-color={file.removed ? 'danger' : undefined}>
                −{file.removed}
              </Box>
            </li>
          ))}
        </Box>
      )}
      {change.fixed.length > 0 && (
        <Box as="p" m0 data-revision-moved-fixed>
          Now fixed: {change.fixed.map((finding) => finding.claim).join(' · ')}
        </Box>
      )}
      {change.moved.length > 0 && (
        <Box as="p" m0 data-revision-moved-anchors>
          Moved or removed: {change.moved.map((finding) => finding.claim).join(' · ')}
        </Box>
      )}
      <Hint as="p" flush>
        Approve now applies to <code>{shortHash(change.to)}</code>. Press it again to approve this revision.
      </Hint>
    </Box>
  )
}
