// A spec link set in the shape src/app/tasks/scm-links.ts builds, for the Links
// box tests and shots: an issue, a working branch, three open pull requests
// (checks passed, running, and for an older commit) and a Radar issue.
import type { SpecLinks } from '../../src/plans-api.ts'

const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()

// The links as plan.get sends them, with the plan they belong to.
type Fixture = SpecLinks & { planId: string; spec: string }

const pull = (number: number, task: string, dot: 'pass' | 'pending' | 'stale', minutes: number): Fixture['pulls'][number] => ({
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
    url: `https://github.com/example/meals/pull/${number}/checks`,
  },
})

export const specLinksFixture = (): Fixture => ({
  planId: 'meal-planner',
  spec: 'meal-planner',
  issue: { kind: 'issue', repository: 'example/specs', number: 40, url: 'https://github.com/example/specs/issues/40' },
  workingBranches: [{ kind: 'branch', repository: 'example/meals', ref: 'avoozl/meal-planner/work', url: 'https://github.com/example/meals/tree/avoozl/meal-planner/work' }],
  pulls: [pull(12, 'meal-planner.1.1', 'pass', 4), pull(14, 'meal-planner.1.2', 'pending', 2), pull(15, 'meal-planner.2.1', 'stale', 90)],
  sources: [{ kind: 'issue', repository: 'example/tracker', number: 3, url: 'https://github.com/example/tracker/issues/3' }],
})

export const noLinksFixture = (): Fixture => ({ planId: 'meal-planner', spec: 'meal-planner', issue: null, workingBranches: [], pulls: [], sources: [] })
