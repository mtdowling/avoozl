// Looks TaskScmLinks reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { ScmChecks } from '../../task-api.ts'

export const DOT: Record<ScmChecks['dot'], string> = {
  pass: 'var(--ok)',
  fail: 'var(--danger)',
  pending: 'var(--accent)',
  stale: 'var(--muted)',
}
