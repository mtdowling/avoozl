// Looks FocusTree reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { NodeState } from '../../graph-layout.ts'

// Theme variables only (Radar's rule): go is the accent, a hold is warn.
export const COLOR: Record<NodeState, string> = {
  ready: 'var(--accent)',
  running: 'var(--accent)',
  waiting: 'var(--warn, var(--muted))',
  'needs-you': 'var(--danger)',
  done: 'var(--muted-strong, var(--muted))',
  deferred: 'var(--muted)',
  draft: 'var(--muted)',
}
