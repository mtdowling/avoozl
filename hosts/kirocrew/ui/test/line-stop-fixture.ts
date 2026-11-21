// A whole LineStop for the banner and scope tests: the fields a test does
// not name are an open stop on main with no culprit yet.
import type { LineStop } from '../src/line-api.ts'

export const lineStop = (over: Partial<LineStop>): LineStop => ({
  id: 's',
  repositoryId: 'r',
  check: null,
  branch: 'main',
  culprit: null,
  commit: null,
  range: { from: null, to: 'abc' },
  openedAt: '2026-11-21T00:00:00Z',
  closedAt: null,
  fixTaskId: null,
  runAnyway: null,
  ...over,
})
