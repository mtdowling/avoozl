// Looks GraphView reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { NodeState } from '../../graph-layout.ts'

// Theme variables only, so the drawing follows light and dark mode.
export const STATE_COLOR: Record<NodeState, string> = {
  ready: 'var(--accent)',
  running: 'var(--tile-purple, var(--aim))',
  waiting: 'var(--border)',
  'needs-you': 'var(--danger)',
  done: 'var(--ok)',
  deferred: 'var(--muted)',
  draft: 'var(--muted)',
}
