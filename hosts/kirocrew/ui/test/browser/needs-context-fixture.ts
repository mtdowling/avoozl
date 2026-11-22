// The harness's Needs you items (&needsctx=1): one of each kind that carries
// context, and one with no evidence. Every name is fake. Older pages ignore
// `context`, so the same items draw the "before" shots.
import type { ConflictItem } from '../../src/views-api.ts'

const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
const spec = { planId: 'p_search', name: 'recipe-search', title: 'Recipe search' }
const source = { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 14, lineEnd: 18 }
const next = (id: string, title: string) => ({ id, title })

export const needsContextItems: ConflictItem[] = [
  {
    kind: 'decision',
    taskId: 'search.3',
    title: 'Index builder',
    detail: 'Store the index as one JSON file or one file per recipe?',
    openedAt: at(95),
    context: {
      task: next('search.3', 'Index builder'),
      spec,
      source,
      text: {
        summary: 'Build the search index from the recipe folder.',
        acceptance: ['Index is rebuilt when a recipe changes.', 'Search returns results in under 200 ms for 5,000 recipes.'],
      },
      prior: null,
      unblocks: { total: 3, tasks: [next('search.4', 'Query parser'), next('search.5', 'Result ranking'), next('search.6', 'Search page')] },
      links: null,
    },
  },
  {
    kind: 'review',
    id: 'review:plan:p_search',
    taskId: null,
    plan: 'Recipe search',
    title: '2 tasks in Recipe search changed: check them',
    detail: 'Each is new, or its own text in the plan changed since it was last reviewed. None starts until you mark it reviewed.',
    tasks: [
      {
        id: 'search.4',
        title: 'Query parser',
        status: 'planned',
        context: {
          task: next('search.4', 'Query parser'),
          spec,
          source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 20, lineEnd: 24 },
          text: {
            summary: 'Parse quoted phrases and minus terms.',
            acceptance: ['"low sugar" matches the phrase.', '-nuts drops recipes that list nuts.', 'Empty queries return no results.'],
          },
          prior: { title: 'Query parser', summary: 'Parse quoted phrases.', acceptance: ['"low sugar" matches the phrase.', 'Empty queries return no results.'] },
        },
      },
      {
        id: 'search.7',
        title: 'Search history',
        status: 'planned',
        context: {
          task: next('search.7', 'Search history'),
          spec,
          source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 40, lineEnd: 43 },
          text: { summary: 'Keep the last 20 searches per person.', acceptance: ['History is stored on this machine only.'] },
          prior: null,
        },
      },
    ],
  },
  {
    kind: 'needs-human',
    reason: 'pr-merge',
    id: 'pr-merge:recipe-box:main:search.2',
    taskId: 'search.2',
    authority: 'avoozl',
    title: 'Pull request #57 is ready to merge',
    detail: 'Its checks and reviews passed on this exact head. Merge it on GitHub, or press Merge here. Avoozl never merges it on its own.',
    repositoryId: 'recipe-box',
    repository: 'acme/recipe-box',
    base: 'main',
    key: 'search.2',
    commit: '3f9a1c0d2b7e4a6c8e0f2a4c6e8a0c2e4f6a8b0c',
    link: 'https://github.com/acme/recipe-box/pull/57',
    pullRequest: 57,
    openedAt: at(40),
    context: {
      task: next('search.2', 'Folder watcher'),
      spec,
      source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 8, lineEnd: 11 },
      text: { summary: 'Watch the recipe folder for changes.', acceptance: ['A new file shows up in the index within 2 seconds.'] },
      unblocks: { total: 1, tasks: [next('search.3', 'Index builder')] },
      links: {
        branch: { ref: 'task/folder-watcher', url: 'https://github.com/acme/recipe-box/tree/task/folder-watcher' },
        pr: { number: 57, url: 'https://github.com/acme/recipe-box/pull/57', state: 'open' },
        checks: { state: 'pass', dot: 'pass', head: '3f9a1c0d2b7e', ageMs: 240000, current: true, url: null },
      },
    },
  },
  {
    kind: 'stale-session',
    taskId: 'search.9',
    title: 'Saved searches',
    detail: 'worker session chat-91 is gone.',
    slot: 'chat-91',
    link: null,
    deliveryState: 'decision',
    openedAt: at(15),
    context: {
      task: next('search.9', 'Saved searches'),
      spec,
      source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 46, lineEnd: 49 },
      unblocks: { total: 0, tasks: [] },
      links: null,
      failedChecks: { commit: '9c1e2a7b4d3f', checks: [{ name: 'test (ubuntu-latest)', conclusion: 'failure', firstError: 'Error: expected 3 saved searches, got 2' }] },
    },
  },
  {
    kind: 'needs-human',
    reason: 'blocked',
    id: 'needs-human:search.8:blocked',
    taskId: 'search.8',
    authority: 'local',
    title: 'search.8 is blocked',
    detail: 'Marked blocked by hand. Nothing starts until you unblock it.',
    link: null,
    openedAt: at(600),
  },
  {
    kind: 'needs-human',
    reason: 'manual-ready',
    taskId: 'search.review-ranking',
    title: 'Review result ranking execution brief',
    detail: 'Review its approval criteria and referenced material, then Mark done in its drawer.',
    context: {
      task: next('search.review-ranking', 'Review result ranking execution brief'),
      spec,
      source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 30, lineEnd: 32 },
      text: {
        summary: null,
        acceptance: ['The ranking behavior, tests, rollback, and writable paths are approved.'],
      },
      referenceMaterial: [
        {
          kind: 'design',
          ref: '§D3',
          path: '.kiro/specs/recipe-search/design.md',
          lineStart: 18,
          lineEnd: 22,
          text: '## D3. Result ranking\n\nRank exact title matches before ingredient matches.',
        },
      ],
      unblocks: { total: 1, tasks: [next('search.5', 'Result ranking')] },
      links: null,
    },
  },
  {
    kind: 'needs-human',
    reason: 'draft-pr',
    id: 'draft-pr:recipe-box:main:search.4',
    taskId: 'search.4',
    authority: 'avoozl',
    title: 'Draft pull request #58 waits for you',
    detail:
      'This repository opens pull requests as drafts (landing.pr: draft). Mark it ready for review on GitHub, or press Approve here. A person merges it once its checks pass.',
    repositoryId: 'recipe-box',
    repository: 'acme/recipe-box',
    base: 'main',
    key: 'search.4',
    pullRequest: 58,
    link: 'https://github.com/acme/recipe-box/pull/58',
    openedAt: at(20),
  },
]
