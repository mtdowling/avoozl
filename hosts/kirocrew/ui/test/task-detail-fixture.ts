// A whole TaskDetail for the drawer tests: what a test does not name is a
// planned local leaf with no plan, links, delivery, conflicts or timeline.
import type { TaskDetail } from '../src/task-api.ts'

type Over = Partial<Omit<TaskDetail, 'task'>> & { task?: Partial<TaskDetail['task']> }

export function taskDetail(over: Over = {}): TaskDetail {
  const { task, ...rest } = over
  return {
    revision: 1,
    task: {
      id: 't',
      title: 'T',
      summary: '',
      acceptance: [],
      checks: [],
      epic: null,
      epicTitle: null,
      kind: 'leaf',
      authority: 'local',
      route: 'local',
      completion: 'integrated',
      repository: null,
      status: 'planned',
      state: null,
      ready: false,
      needsReview: false,
      decision: null,
      owner: null,
      issue: null,
      wave: 0,
      context: '',
      ...task,
    },
    plan: null,
    locked: null,
    waitsOn: [],
    blocks: [],
    delivery: null,
    conflicts: [],
    timeline: [],
    ...rest,
  }
}
