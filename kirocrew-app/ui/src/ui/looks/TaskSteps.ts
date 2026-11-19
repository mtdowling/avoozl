// Looks TaskSteps reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { TaskStep } from '../../task-api.ts'

export const DOT: Record<TaskStep['state'], { border: string; background: string }> = {
  done: { border: 'var(--ok)', background: 'var(--ok)' },
  now: { border: 'var(--accent)', background: 'var(--accent)' },
  later: { border: 'var(--border)', background: 'transparent' },
  skipped: { border: 'var(--border)', background: 'transparent' },
}
