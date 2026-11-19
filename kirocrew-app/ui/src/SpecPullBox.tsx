// A spec pull request's evidence and buttons (Requirement 107.4, 107.5): the
// spec's Proposed change box and the Decisions item share it. It shows what
// the backend adopted and acts only through specPullClient.
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { DiffBlock } from './FlowMemory.tsx'
import { SeverityBadges } from './SeverityBadges.tsx'
import { DangerBtn, TipBtn } from './ui/controls.tsx'
import { safeHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { CHECKS_TEXT, approveWhy, specPullClient, type SpecPull } from './spec-pr-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { PlainInput } from './ui/Plain'
import { DOT } from './ui/looks/SpecPullBox.ts'


export function ChecksDot({ checks }: { checks: SpecPull['checks'] }) {
  if (!checks) return <Hint size="xs">No checks yet</Hint>
  return (
    <Box as="span" css-gap="6" inlineFlex items="center" size="xs" data-pull-checks={checks}>
      <Box aria-hidden="true" as="span" css-width="8" css-height="8" css-border-radius="999" css-background={DOT[checks]} />
      {CHECKS_TEXT[checks]}
    </Box>
  )
}

export function SpecPullBox(props: { pull: SpecPull; workspaceId: string; onApprove: () => void; onChanged: () => void }) {
  const { pull, workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => specPullClient(api), [api])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const why = approveWhy(pull)
  const open = pull.review.openBySeverity ?? {}
  const openCount = Object.values(open).reduce((sum, n) => sum + n, 0)
  const act = async (work: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    try {
      setNote(await work())
      props.onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Box css-gap="12" flex minW0 flexCol size="sm" data-spec-pull={pull.id}>
      <Box css-gap="8" flex flexWrap items="center">
        {safeHref(pull.url) ? (
          <TextLink href={safeHref(pull.url) ?? undefined} target="_blank" rel="noopener noreferrer" data-spec-pull-link>
            {pull.repository} #{pull.number}
          </TextLink>
        ) : (
          <span>
            {pull.repository} #{pull.number}
          </span>
        )}
        <Hint>by {pull.author ?? 'unknown'}</Hint>
        <Badge variant={pull.draft ? undefined : 'success'}>{pull.draft ? 'Draft' : 'Ready'}</Badge>
        <ChecksDot checks={pull.checks} />
      </Box>
      <Box data-spec-pull-changes css-gap="4" flex flexCol>
        <Box as="p" m0 size="xs" weight="medium">{pull.newSpec ? 'New spec: every file is added.' : 'Changes since the approved revision'}</Box>
        {pull.files.length ? (
          <Box as="ul" css-gap="4" m0 flex listNone flexCol p="0">
            {pull.files.map((file) => (
              <li key={file.file}>
                <details>
                  <Box as="summary" cursorPointer size="xs">
                    <code>{file.file}</code> · {file.status} · +{file.added} −{file.removed}
                  </Box>
                  <DiffBlock diff={file.diff} label={`Changes to ${file.file}`} />
                </details>
              </li>
            ))}
          </Box>
        ) : (
          <Hint as="p" size="xs" flush>No spec document differs.</Hint>
        )}
        {pull.tasks.length > 0 && (
          <Hint as="p" size="xs" flush data-spec-pull-tasks>
            Tasks: {pull.tasks.map((task) => `${task.taskId} ${task.change}`).join(', ')}
          </Hint>
        )}
      </Box>
      <Box css-gap="8" flex flexWrap items="center" data-spec-pull-findings>
        <Box as="span" size="xs" weight="medium">Review</Box>
        {pull.review.state === 'not-reviewed' ? (
          <Hint size="xs">Not reviewed yet</Hint>
        ) : openCount ? (
          <SeverityBadges counts={open} label="Open findings by severity" />
        ) : (
          <Hint size="xs">{pull.review.found ? 'No open findings' : 'No findings'}</Hint>
        )}
        {!pull.review.current && pull.review.state !== 'not-reviewed' && <Hint size="xs">(an earlier revision)</Hint>}
      </Box>
      {pull.review.summary && <Hint as="p" size="xs" flush>{pull.review.summary}</Hint>}
      <Box css-gap="8" flex flexWrap items="center" data-spec-pull-actions>
        <TipBtn variant="primary" tooltip={why ?? `Approve exactly this head (${pull.head.slice(0, 7)}). Avoozl merges the pull request when its checks pass.`} disabled={busy || why !== null} onClick={props.onApprove} data-spec-pull-approve>
          Approve
        </TipBtn>
        <TipBtn
          tooltip="Post the open review findings on the pull request as one comment."
          disabled={busy || openCount === 0}
          onClick={() => void act(async () => `Posted ${(await client.requestChanges(workspaceId, pull.id)).posted} findings on #${pull.number}.`)}
          data-spec-pull-changes-request
        >
          Request changes
        </TipBtn>
        <TipBtn tooltip="Close the pull request with a comment that names your reason." disabled={busy} onClick={() => setRejecting(!rejecting)} data-spec-pull-reject>
          Reject
        </TipBtn>
      </Box>
      {rejecting && (
        <Box css-gap="8" flex flexWrap items="center" data-spec-pull-reject-row>
          <Box as="label" size="xs" htmlFor={`reject-${pull.id}`}>
            Reason
          </Box>
          <PlainInput id={`reject-${pull.id}`} value={reason} onChange={(event) => setReason(event.target.value)} css-border-color="border" css-background="bg" css-color="inherit" minW0 flex1 rounded="base" border="all" px="2" py="1" size="sm" />
          <DangerBtn
            label={`Reject ${pull.repository} #${pull.number}`}
            disabled={busy || !reason.trim()}
            confirm={{ title: `Reject #${pull.number}?`, body: `Avoozl comments "${reason.trim()}" and closes the pull request. The draft revision stays.`, action: 'Reject pull request' }}
            onConfirm={() => void act(async () => (await client.reject(workspaceId, pull.id, reason.trim()), `Closed #${pull.number}.`))}
          >
            Reject pull request
          </DangerBtn>
        </Box>
      )}
      {error && (
        <ErrorText role="alert" flush>
          {error}
        </ErrorText>
      )}
      {note && (
        <Hint role="status" as="p" flush>
          {note}
        </Hint>
      )}
    </Box>
  )
}
