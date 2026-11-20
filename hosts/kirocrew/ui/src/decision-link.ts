// A notice's link to one decision (direct-links D3):
// `/apps/avoozl?workspace=W&decision=D`. The page reads it once when it
// opens, picks the workspace, opens Needs you and selects that row. The
// reference grants nothing; conflicts.view resolves it. Kept free of JSX so
// node can test it.

export interface DecisionLink {
  workspace: string | null
  decision: string
}

// The same grammars the backend checks (src/app/direct-links.mjs).
const DECISION = /^[A-Za-z0-9_-]{8,64}$/
const WORKSPACE = /^[a-z][a-z0-9-]{0,60}$/

export function parseDecisionLink(search: string): DecisionLink | null {
  const query = new URLSearchParams(search)
  const decision = query.get('decision')
  const workspace = query.get('workspace')
  if (!decision || !DECISION.test(decision)) return null
  if (workspace !== null && !WORKSPACE.test(workspace)) return null
  return { workspace, decision }
}

// The address without the link, once the person leaves the linked row.
export function withoutDecisionLink(search: string): string {
  const query = new URLSearchParams(search)
  query.delete('decision')
  query.delete('workspace')
  const rest = query.toString()
  return rest ? `?${rest}` : ''
}

// What the page says when the linked decision is not open.
export function closedLine(target: { state: string; taskId?: string | null; newer?: boolean }): string {
  if (target.state === 'unknown') return 'This link names no decision this workspace knows. It may be from another workspace, or its record was cleared.'
  const task = target.taskId ? ` on ${target.taskId}` : ''
  if (target.newer) return `This decision${task} is closed. A newer one may be waiting in Needs you.`
  return `This decision${task} is closed or no longer needs you.`
}
