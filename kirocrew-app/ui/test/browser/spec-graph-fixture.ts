// The byte-types spec's graph.view reply for the spec page's Task graph
// (&review=1): one done task, one that just unlocked, two that wait, and one
// spec of another name that must not show.
const task = (id: string, title: string, state: string, complete = false) => ({
  id, title, epic: null, planId: 'byte-types', spec: 'byte-types', phase: { id: 'p1', title: 'Types' }, kind: 'leaf', authority: 'local', route: 'local',
  completion: 'integrated', repository: 'example/recipe-box', status: complete ? 'done' : 'planned', complete, ready: state === 'ready', state, decision: null, issue: null,
})
const edge = (from: string, to: string, satisfied: boolean) => ({ from, to, kind: 'requires', condition: null, blocking: true, satisfied })
export const specGraph = {
  revision: 1,
  epics: [],
  plans: [{ id: 'byte-types', title: 'Byte types', spec: 'byte-types', epic: null, phases: [] }],
  statuses: [{ id: 'planned', label: 'Planned', complete: false }, { id: 'done', label: 'Done', complete: true }],
  repositories: ['example/recipe-box'],
  total: 4,
  tasks: [
    task('1.1', 'Add fixed-width integer types', 'done', true),
    task('1.2', 'Add byte strings', 'ready'),
    task('1.3', 'Convert UTF-8 to byte strings', 'waiting'),
    task('1.4', 'Test that overflow wraps', 'waiting'),
  ],
  edges: [edge('1.1', '1.2', true), edge('1.2', '1.3', false), edge('1.2', '1.4', false)],
}
