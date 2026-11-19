// The harness's busy Landing queue (&landing=1): two bases and every hold
// reason the page draws. Every name is fake.
import type { LandingItem, LandingQueue } from '../../src/landing-queue-api.ts'

const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
const pr = (n: number) => ({ kind: 'pull', repository: 'acme/recipe-box', number: n, url: `https://github.com/acme/recipe-box/pull/${n}`, state: 'open' })
const branch = (ref: string) => ({ kind: 'branch', repository: 'acme/recipe-box', ref, url: `https://github.com/acme/recipe-box/tree/${ref}` })
const checks = (dot: string) => ({ state: dot === 'stale' ? 'pass' : dot, dot, current: dot !== 'stale', ageMs: 4 * 60000, url: null })
const item = (key: string, title: string, extra: Partial<LandingItem>): LandingItem => ({
  key,
  tasks: [{ id: key, title }],
  commit: null,
  pr: null,
  branch: null,
  checks: null,
  position: null,
  since: at(30),
  waitedMinutes: 30,
  hold: { kind: 'next', text: 'Next to land.' },
  ...extra,
})

export const landingFixture: LandingQueue = {
  readAt: at(0),
  bases: [
    {
      key: 'recipe-box\u0000main',
      projectId: 'recipe-box',
      repository: 'acme/recipe-box',
      base: 'main',
      landing: 'pr',
      items: [
        item('photos', 'Load recipe photos lazily on the list', { position: 1, pr: pr(41), branch: branch('task/photos'), checks: checks('pending'), since: at(12), hold: { kind: 'review', text: 'Review missing on this head.' } }),
        item('export', 'Add a shopping list export', { position: 2, pr: pr(42), branch: branch('task/export'), checks: checks('pass'), since: at(9), hold: { kind: 'behind', text: 'Behind 1 portion.' } }),
        item('units', 'Convert units in the ingredient list', { position: 3, pr: pr(43), branch: branch('task/units'), checks: checks('stale'), since: at(4), hold: { kind: 'behind', text: 'Behind 2 portions.' } }),
        item('search', 'Search recipes by ingredient', { pr: pr(39), branch: branch('task/search'), checks: checks('fail'), since: at(55), hold: { kind: 'conflict', text: 'Conflict round 1: back with the worker.' } }),
        item('tags', 'Tag recipes by meal', { pr: pr(38), branch: branch('task/tags'), checks: checks('fail'), since: at(70), hold: { kind: 'failing', text: 'Checks failed round 2: back with the worker.' } }),
        item('ci', 'Cache the build in CI', { branch: branch('task/ci'), since: at(90), hold: { kind: 'path', text: 'Path hold: touches protected paths: .github/workflows/ci.yml.' } }),
      ],
    },
    {
      key: 'meal-planner\u0000release/2',
      projectId: 'meal-planner',
      repository: 'acme/meal-planner',
      base: 'release/2',
      landing: 'direct',
      items: [
        item('week', 'Plan a week of meals', { position: 1, since: at(3), hold: { kind: 'stopped', text: 'Line stopped: flaky base.' } }),
        item('leftovers', 'Suggest meals from leftovers', { position: 2, since: at(2), hold: { kind: 'stopped', text: 'Line stopped: flaky base.' } }),
      ],
    },
    {
      key: 'recipe-box\u0000core-dev',
      projectId: 'recipe-box',
      repository: 'acme/recipe-box',
      base: 'core-dev',
      landing: 'direct',
      testing: { members: ['sync', 'scale', 'labels'], step: 'bisect', since: at(6) },
      size: { limit: 3, fixed: false, failureRate: 0.2, results: 20 },
      last: [
        { at: at(14), size: 4, landed: 3, culprits: 1, seconds: 412, outcome: 'partly landed' },
        { at: at(35), size: 2, landed: 2, culprits: 0, seconds: 118, outcome: 'landed' },
        { at: at(80), size: 1, landed: 0, culprits: 1, seconds: 64, outcome: 'culprit sent back' },
      ],
      items: [
        item('sync', 'Sync the pantry list', { position: 1, since: at(68), waitedMinutes: 68, hold: { kind: 'next', text: 'Next to land.' } }),
        item('scale', 'Scale a recipe by servings', { position: 2, since: at(17), waitedMinutes: 17, hold: { kind: 'behind', text: 'Behind 1 portion.' } }),
        item('labels', 'Print recipe labels', { position: 3, since: at(11), waitedMinutes: 11, hold: { kind: 'behind', text: 'Behind 2 portions.' } }),
        item('import', 'Import recipes from a file', { position: 4, since: at(2), waitedMinutes: 2, hold: { kind: 'behind', text: 'Behind 3 portions.' } }),
      ],
    },
  ],
}
