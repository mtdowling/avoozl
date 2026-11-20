// A retro proposal with its evidence, Approve and Reject (design §4.18),
// shown under the retro that made it, and the diff block Specs also uses.
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { diffLines, directionText, pdcaText, proposalText, type Proposal } from './flow-api.ts'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Box } from './ui/Box'
import { TONE } from './ui/tones.ts'

const LINE = { add: TONE.successOrGreen, del: TONE.danger, hunk: TONE.muted, same: TONE.text } as const

export function DiffBlock({ diff, label }: { diff: string | undefined; label: string }) {
  const lines = diffLines(diff)
  if (!lines.length) return null
  return (
    <Box
      aria-label={label}
      as="pre"
      css-border-color="border"
      css-white-space="pre-wrap"
      css-overflow-wrap="anywhere"
      css-margin="0"
      maxH64
      overflow="auto"
      rounded="base"
      border="all"
      p="2"
      size="xs"
      data-diff
    >
      {lines.map((line, i) => (
        <Box key={i} as="span" css-display="block" css-color={LINE[line.kind]}>
          {line.text || ' '}
        </Box>
      ))}
    </Box>
  )
}

export function ProposalCard({ proposal, busy, onDecide }: { proposal: Proposal; busy: boolean; onDecide: (p: Proposal, d: 'approve' | 'reject') => void }) {
  const pdca = pdcaText(proposal)
  return (
    <Box as="li" css-border-color="border" flex flexCol gap="1.5" border="t" pt="2" firstBorderT0 firstPt0 size="sm" data-proposal={proposal.id}>
      <Box as="span" css-overflow-wrap="anywhere" flex flexWrap items="center" gap="2">
        <Badge>{proposal.type}</Badge>
        <Box as="code" size="xs">
          {proposalText(proposal)}
        </Box>
        <Hint>{directionText(proposal)}</Hint>
        {proposal.removesCheck && <Badge variant="warning">removes a check</Badge>}
        {proposal.revertOf && <Badge>revert</Badge>}
      </Box>
      <Hint as="span" css-overflow-wrap="anywhere" size="xs">
        Evidence: {proposal.evidence}
      </Hint>
      {proposal.status !== 'open' ? (
        <Box as="span" size="xs">
          {proposal.status === 'approved' ? 'Approved' : `Rejected${proposal.reason ? `: ${proposal.reason}` : ''}`}
          {pdca ? ` · ${pdca}` : ''}
        </Box>
      ) : (
        <Row gap={2} align="start">
          <Btn type="button" disabled={busy} onClick={() => onDecide(proposal, 'reject')}>
            Reject
          </Btn>
          <Btn type="button" primary disabled={busy} onClick={() => onDecide(proposal, 'approve')}>
            Approve
          </Btn>
        </Row>
      )}
    </Box>
  )
}
