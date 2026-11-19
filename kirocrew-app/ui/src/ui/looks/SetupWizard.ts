// Looks SetupWizard reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { CSSProperties } from 'react'

export const BADGE_STYLE: Record<string, CSSProperties> = {
  create: { color: 'var(--ok)', borderColor: 'var(--ok)' },
  change: { color: 'var(--accent)', borderColor: 'var(--accent)' },
  keep: { color: 'var(--muted)', borderColor: 'var(--border)' },
}
