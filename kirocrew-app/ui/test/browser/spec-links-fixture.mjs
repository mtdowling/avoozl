// A spec link set in the shape src/app/tasks/scm-links.mjs builds, for the Links
// box tests and shots: an issue, a working branch, three open pull requests
// (checks passed, running, and for an older commit) and a Radar issue.
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString()
const pull = (number, task, dot, minutes) => ({
  kind: 'pull',
  repository: 'example/meals',
  number,
  url: `https://github.com/example/meals/pull/${number}`,
  state: 'open',
  task,
  checks: {
    state: dot === 'stale' ? 'pass' : dot,
    dot,
    head: 'a'.repeat(40),
    readAt: ago(minutes),
    ageMs: minutes * 60000,
    current: dot !== 'stale',
    source: 'pull-request',
    url: `https://github.com/example/meals/pull/${number}/checks`,
  },
})

export const specLinksFixture = () => ({
  planId: 'meal-planner',
  spec: 'meal-planner',
  issue: { kind: 'issue', repository: 'example/specs', number: 40, url: 'https://github.com/example/specs/issues/40' },
  journal: { kind: 'journal', home: 'github' },
  workingBranches: [{ kind: 'branch', repository: 'example/meals', ref: 'avoozl/meal-planner/work', url: 'https://github.com/example/meals/tree/avoozl/meal-planner/work' }],
  pulls: [pull(12, 'meal-planner.1.1', 'pass', 4), pull(14, 'meal-planner.1.2', 'pending', 2), pull(15, 'meal-planner.2.1', 'stale', 90)],
  sources: [{ kind: 'issue', repository: 'example/tracker', number: 3, url: 'https://github.com/example/tracker/issues/3' }],
})

export const noLinksFixture = () => ({ planId: 'meal-planner', spec: 'meal-planner', issue: null, journal: null, workingBranches: [], pulls: [], sources: [] })
