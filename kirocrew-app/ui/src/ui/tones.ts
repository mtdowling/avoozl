// The theme colors the page's data modules hand to views: a lane's tint, a
// check's dot, a severity's ink. Written here, so views and data modules
// name a tone and the theme variables stay in src/ui/ (UC3.3).
export const TONE = {
  accent: 'var(--accent)',
  border: 'var(--border)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  warnOrAmber: 'var(--warn, #d29922)',
  purpleOrAccent: 'var(--tile-purple, var(--accent))',
  purpleOrAim: 'var(--tile-purple, var(--aim))',
  orangeOrWarning: 'var(--tile-orange, var(--warning))',
} as const

// A lane's background: its tint at 8% over the card, so var(--text) stays
// readable in light and dark themes.
export const laneBackground = (tint: string) => `color-mix(in srgb, ${tint} 8%, var(--card, transparent))`

// An age's color: danger once it reaches 100, else danger mixed into muted
// by the age.
export const ageColor = (age: number) => (age >= 100 ? TONE.danger : `color-mix(in srgb, var(--danger) ${Math.round(Math.max(0, age) * 0.8)}%, var(--muted))`)
