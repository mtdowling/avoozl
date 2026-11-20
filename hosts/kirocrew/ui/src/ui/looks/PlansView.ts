// Looks PlansView reads: theme colors and styles it names, kept in src/ui/ (UC3.3).
import type { CSSProperties } from 'react'

// The state pill: Draft, Approved, Done and the rest, in theme colors.
export const PILL: Record<string, { color: string; background: string }> = {
  approved: { color: 'var(--accent)', background: 'var(--accent-subtle, color-mix(in srgb, var(--accent) 12%, transparent))' },
  done: { color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)' },
  changed: { color: 'var(--warning, #b7791f)', background: 'color-mix(in srgb, var(--warning, #b7791f) 14%, transparent)' },
}

export const cell: CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
