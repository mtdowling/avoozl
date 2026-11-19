// The harness's GitHub pages (&triage=1): issues and pull requests with
// the triage agent's results, one item's detail each, and the Triage agent
// page. Every name is fake.
import type { ItemDetail, ItemList, ItemRow, TriageView } from '../../src/github-items-api.ts'

const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
const REPO = 'acme/recipe-box'

const row = (number: number, title: string, extra: Partial<ItemRow> = {}): ItemRow => ({
  repository: REPO,
  number,
  kind: 'issue',
  title,
  author: 'sam',
  state: 'open',
  labels: [],
  assignees: [],
  createdAt: at(number * 90),
  updatedAt: at(number * 20),
  url: `https://github.com/${REPO}/issues/${number}`,
  draft: false,
  counts: null,
  class: null,
  result: null,
  owner: null,
  snoozed: null,
  ...extra,
})

export const issueRows: ItemRow[] = [
  row(142, 'How do I import recipes from a URL?', { labels: ['question'], class: 'question', result: 'done' }),
  row(141, 'Search drops results with accents', { author: 'priya', labels: ['bug'], class: 'bug', result: 'done', assignees: ['owner'] }),
  row(139, 'Add a dark mode to the print view', { class: 'feature', result: 'done', owner: { reason: 'A feature is the owner’s to plan.', kind: 'feature' } }),
  row(137, 'Timer stops when the phone sleeps', {
    author: 'lee',
    class: 'bug',
    result: 'done',
    owner: { reason: 'Fix ready: intake-3f1 lands when you press Integrate.', kind: 'fix-ready' },
  }),
  row(136, 'Shopping list shares the wrong week', { author: 'ana' }),
]

const pull = (number: number, title: string, extra: Partial<ItemRow> = {}): ItemRow =>
  row(number, title, {
    kind: 'pr',
    url: `https://github.com/${REPO}/pull/${number}`,
    counts: { files: 3, additions: 84, deletions: 12, checks: { failed: 0, passed: 6, skipped: 1, pending: 0 } },
    ...extra,
  })

export const pullRows: ItemRow[] = [
  pull(145, 'Cache the ingredient parser', { author: 'priya', class: 'pull-request', result: 'done' }),
  pull(144, 'Rewrite the meal planner', {
    author: 'jo',
    class: 'pull-request',
    result: 'done',
    counts: { files: 31, additions: 1840, deletions: 920, checks: { failed: 2, passed: 4, skipped: 0, pending: 1 } },
    owner: { reason: 'It changes the planner’s storage: a design decision.', kind: 'pull-request' },
  }),
  pull(143, 'Fix a typo in the README', { author: 'kim', counts: { files: 1, additions: 1, deletions: 1, checks: { failed: 0, passed: 6, skipped: 0, pending: 0 } } }),
]

const list = (items: ItemRow[], kind: ItemList['kind']): ItemList => ({
  kind,
  total: items.length,
  items,
  labels: ['bug', 'question'],
  repositories: [REPO],
  ownerQueue: [...issueRows, ...pullRows].filter((item) => item.owner).length,
})

export function listFor(input: { kind?: string; owner?: boolean }): ItemList {
  const items = input.kind === 'pr' ? pullRows : input.kind === 'all' ? [...issueRows, ...pullRows] : issueRows
  return list(input.owner ? items.filter((item) => item.owner) : items, (input.kind as ItemList['kind']) ?? 'issue')
}

const run = (number: number, state: string, cls: string | null, reason: string | null, writes: { kind: string; state: string }[] = [], minutes = 30) => ({
  id: `triage:${REPO}#${number}:1`,
  repository: REPO,
  number,
  kind: [143, 144, 145].includes(number) ? ('pr' as const) : ('issue' as const),
  title: [...issueRows, ...pullRows].find((item) => item.number === number)?.title ?? null,
  url: `https://github.com/${REPO}/issues/${number}`,
  state,
  why: 'new',
  class: cls,
  reason,
  outcome: null,
  writes,
  queuedAt: at(minutes),
  finishedAt: state === 'done' ? at(minutes - 2) : null,
})

export function detailFor(input: { number?: number }): ItemDetail {
  const number = input.number ?? 142
  const base = [...issueRows, ...pullRows].find((item) => item.number === number) ?? issueRows[0]
  const pr = base.kind === 'pr'
  return {
    repository: REPO,
    kind: base.kind,
    number,
    title: base.title,
    body: pr
      ? 'The parser ran on every keystroke. This keeps its result per line.\n\n```js\nconst parsed = cache.get(line) ?? parse(line)\n```'
      : 'I have a recipe on a blog. Is there a way to bring it in without typing it?',
    url: base.url,
    state: 'open',
    author: base.author,
    firstTime: number === 142,
    labels: base.labels,
    assignees: base.assignees,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    timeline: [
      { kind: 'IssueComment', at: at(25), by: 'avoozl-bot', body: pr ? 'Looks right. One note on line 12.' : 'Use **Import from URL** in the Add menu. See docs/import.md.' },
      { kind: 'IssueComment', at: at(10), by: base.author, body: 'Thanks!' },
    ],
    ...(pr
      ? {
          merged: false,
          draft: false,
          base: 'main',
          branch: 'cache-parser',
          head: 'a1b2c3d',
          counts: base.counts ?? undefined,
          reviewers: [{ login: 'owner', state: 'REQUESTED' }],
          files: ['src/parser.ts', 'src/parser.test.ts', 'src/cache.ts'],
        }
      : {}),
    triage: {
      class: base.class,
      reason: pr ? 'A small change to the parser with a test.' : 'Asks how to import a recipe; the docs cover it.',
      owner: base.owner,
      suggested: pr ? [] : ['import'],
      draft: null,
      asked: null,
      note: null,
      runs: [run(number, 'done', base.class, 'Answered from docs/import.md.', [{ kind: pr ? 'review' : 'answer', state: 'sent' }])],
      result: 'done',
    },
    actions: pr ? ['review', 'approve', 'requestChanges', 'comment', 'close', 'labels'] : ['fix', 'spec', 'again', 'assign', 'labels', 'snooze', 'close'],
    history: [],
  }
}

export const triageView: TriageView = {
  stopAll: null,
  repositories: [
    {
      repository: REPO,
      on: true,
      paused: false,
      hold: null,
      cap: 50,
      left: 43,
      used: 7,
      settings: { agent: 'on', existing: 'skip', dailyRuns: 50, fullReviewMaxLines: 300, labels: 'suggest', reviews: 'post' },
    },
    {
      repository: 'acme/recipe-api',
      on: false,
      paused: false,
      hold: null,
      cap: 50,
      left: 50,
      used: 0,
      settings: { agent: 'off', existing: 'skip', dailyRuns: 50, fullReviewMaxLines: 300, labels: 'suggest', reviews: 'post' },
    },
  ],
  inProgress: [run(136, 'running', null, null, [], 2)],
  runs: [
    run(136, 'running', null, null, [], 2),
    run(145, 'done', 'pull-request', 'A small change to the parser with a test.', [{ kind: 'review', state: 'sent' }], 20),
    run(144, 'done', 'pull-request', 'A large rewrite; reviewed in part.', [{ kind: 'review', state: 'sent' }], 40),
    run(142, 'done', 'question', 'Answered from docs/import.md.', [{ kind: 'answer', state: 'sent' }], 60),
    run(141, 'done', 'bug', 'Reproduced with tests/search-accents.test.ts.', [{ kind: 'fix', state: 'sent' }], 90),
    run(139, 'done', 'feature', 'Wants a new print theme.', [], 120),
    run(137, 'done', 'bug', 'Reproduced; the author is not a collaborator.', [{ kind: 'fix', state: 'sent' }], 150),
  ],
  days: [
    { day: new Date().toISOString().slice(0, 10), runs: 7, byClass: { question: 1, bug: 2, feature: 1, 'pull-request': 2 }, byState: { done: 6, running: 1 } },
    { day: new Date(Date.now() - 86400000).toISOString().slice(0, 10), runs: 4, byClass: { question: 2, bug: 1, unclear: 1 }, byState: { done: 4 } },
  ],
  calls: { day: new Date().toISOString().slice(0, 10), rest: 41, notModified: 36, graphql: 9, writes: 6 },
  rate: { limit: 5000, remaining: 4870, resetAt: at(-40) },
  ownerQueue: 3,
}
