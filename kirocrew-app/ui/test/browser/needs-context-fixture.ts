// The harness's Needs you items (&needsctx=1): one of each kind that carries
// context, and one with no evidence. Every name is fake. Older pages ignore
// `context`, so the same items draw the "before" shots.
const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
const spec = { planId: 'p_search', name: 'recipe-search', title: 'Recipe search' }
const source = { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 14, lineEnd: 18 }
const next = (id: string, title: string) => ({ id, title })

export const needsContextItems = [
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
    title: 'Review 2 tasks in Recipe search: their design text changed',
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
    kind: 'ready-to-merge',
    id: 'ready-to-merge:search.2',
    taskId: 'search.2',
    title: 'search.2 is ready to merge',
    detail: 'Its checks and reviews pass on 3f9a1c0d2b7e. You merge it on GitHub; Avoozl never merges it.',
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
    kind: 'plan-review',
    id: 'plan-review:p_meals',
    taskId: null,
    plan: 'meal-planner',
    title: 'Review draft meal-planner?',
    detail: "Read this draft on a different model before approval, or skip this revision's review.",
    planReview: { planId: 'p_meals', revisionHash: 'a1b2c3d4e5f6' },
    context: {
      spec: { planId: 'p_meals', name: 'meal-planner', title: 'Meal planner' },
      review: {
        state: 'done',
        current: true,
        reviewerModel: 'reviewer-model',
        found: 5,
        fixed: 1,
        openBySeverity: { blocker: 1, warn: 2, info: 1 },
        summary: {
          text: 'Plans a week of meals from saved recipes and builds one shopping list. The shopping list task has no acceptance check, and two tasks need the same file.',
          revisionHash: 'a1b2c3d4e5f6',
          current: true,
        },
      },
    },
  },
  {
    kind: 'investigation',
    id: 'investigation:search.6',
    taskId: 'search.6',
    title: 'Findings on search.6 need you',
    detail: 'The falsifier says refuted (medium); the worker was high sure. Coding waits.',
    round: 1,
    findings: {
      read: 'The page reads results from a global store.',
      cause: 'The store is not cleared between queries.',
      plan: 'Clear it in the query handler.',
      check: 'Add a test that runs two queries in a row.',
      confidence: 'high',
    },
    reply: { verdict: 'refuted', evidence: 'The store is cleared on route change, so the stale rows come from the parser cache instead.', confidence: 'medium' },
    choices: ['go', 'again', 'stop'],
    openedAt: at(20),
    context: {
      task: next('search.6', 'Search page'),
      spec,
      source: { path: '.kiro/specs/recipe-search/tasks.md', lineStart: 34, lineEnd: 38 },
      unblocks: { total: 0, tasks: [] },
      links: null,
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
    reason: 'tracker-gate',
    id: 'gate:search.8:waiting',
    taskId: 'search.8',
    authority: 'github',
    title: 'Tracker gate search.8 is waiting',
    detail: 'tracker item OPS-12: no detail. Avoozl does not clear a gate; clear it or edit the plan.',
    link: null,
    openedAt: at(600),
  },
]
