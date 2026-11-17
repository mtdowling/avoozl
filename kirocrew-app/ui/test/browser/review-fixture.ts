// A fake plan.review.view reply and decide handler, shared by the Review
// view test page and the full-app harness. Fake models only.
import type { FindingAction, ReviewFinding, ReviewViewData } from '../../src/review-view.ts'

const H = 'c0ffee12'.repeat(8),
  H0 = 'aaaa1111'.repeat(8)
const finding = (id: string, severity: ReviewFinding['severity'], state: ReviewFinding['state'], file: string, line: number, claim: string, extra: Partial<ReviewFinding> = {}): ReviewFinding => ({
  id,
  roundId: 'round-1',
  revisionHash: H0,
  severity,
  category: 'gap',
  state,
  quote: claim,
  anchor: { file, lineStart: line, lineEnd: line + 1 },
  decisions: [],
  claim,
  evidence: 'Compared the requirement with the task list at the reviewed revision.',
  answer: null,
  ...extra,
})

export function reviewFixture(): { data: ReviewViewData; decide: (input: { id: string; action: FindingAction; note?: string; revisionHash: string }) => void } {
  const data: ReviewViewData = {
    planId: 'byte-types',
    spec: 'byte-types',
    revisionHash: H,
    current: true,
    files: {
      'requirements.md': [
        '# Requirements',
        '',
        '## Requirement 1: Byte types',
        '',
        'The runtime SHALL offer fixed-width byte types.',
        '',
        '1. A byte value SHALL hold 0 to 255.',
        '2. Overflow SHALL wrap.',
      ].join('\n'),
      'design.md': ['# Design', '', 'The loader reads `bytes.toml` once at start.', '', '## Layout', '', 'Bytes pack into words of eight.'].join('\n'),
      'tasks.md': ['# Tasks', '', '- [ ] 1.1 Add the byte type', '- [ ] 1.2 Wrap on overflow'].join('\n'),
    },
    rounds: [
      {
        id: 'round-1',
        pass: 1,
        round: 1,
        state: 'done',
        revisionHash: H0,
        reviewerModel: 'fake-reviewer',
        note: null,
        reviewChat: { href: '/chat?sid=reviewer-1', closed: false },
        plannerChat: { href: null, closed: true },
      },
    ],
    findings: [
      finding('f-blocker', 'blocker', 'for you', 'requirements.md', 7, 'Overflow has no test that can show it wraps.', { category: 'untestable' }),
      finding('f-warn', 'warn', 'fixed', 'requirements.md', 5, 'No task covers signed bytes.', {
        answer: { action: 'fixed', revisionHash: H, text: 'Added task 1.3.', at: '2026-11-16T10:00:00Z' },
      }),
      finding('f-info', 'info', 'rejected', 'design.md', 3, 'bytes.toml is not in the repository.', {
        category: 'wrong-reference',
        decisions: [{ action: 'reject', by: 'Owner', at: '2026-11-16T11:00:00Z', revisionHash: H, note: 'Created at install.' }],
      }),
      finding('f-moved', 'warn', 'for you', 'design.md', 9, 'The layout section names no word size.', {
        anchor: { file: 'design.md', lineStart: 9, lineEnd: 9, moved: true, revisionHash: H0 },
        answer: { action: 'answered', text: 'Eight is the word size.', at: '2026-11-16T10:00:00Z' },
      }),
    ],
    bySeverity: { blocker: 1, warn: 2, info: 1 },
    byState: { 'for you': 2, fixed: 1, rejected: 1 },
  }
  const closing: Record<string, ReviewFinding['state']> = { accept: 'accepted', reject: 'rejected', defer: 'deferred', resolve: 'resolved', reopen: 'for you' }
  const decide = (input: { id: string; action: FindingAction; note?: string; revisionHash: string }) => {
    const f = data.findings.find((x) => x.id === input.id)
    if (!f) throw new Error('Review finding not found.')
    f.decisions = [...f.decisions, { action: input.action, by: 'Owner', at: new Date().toISOString(), revisionHash: input.revisionHash, note: input.note ?? '' }]
    f.state = closing[input.action]
  }
  return { data, decide }
}
