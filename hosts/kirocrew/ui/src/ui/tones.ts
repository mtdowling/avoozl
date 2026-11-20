// The theme colors the page's data modules hand to views: a lane's tint, a
// check's dot, a severity's ink. Written here, so views and data modules
// name a tone and the theme variables stay in src/ui/ (UC3.3).
export const TONE = {
  accent: 'var(--accent)',
  infoOrAccent: 'var(--info, var(--accent))',
  border: 'var(--border)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  warnOrAmber: 'var(--warn, #d29922)',
  purpleOrAccent: 'var(--tile-purple, var(--accent))',
  purpleOrAim: 'var(--tile-purple, var(--aim))',
  orangeOrWarning: 'var(--tile-orange, var(--warning))',
  bg: 'var(--bg)',
  text: 'var(--text)',
  successOrGreen: 'var(--success, #1a7f37)',
  mutedStrongMuted: 'var(--muted-strong, var(--muted))',
  hairline: '1px solid var(--border)',
  bgElevated: 'var(--bg-elevated)',
  successText: 'var(--success, var(--text))',
  bgHover: 'var(--bg-hover)',
  okBar: 'linear-gradient(90deg, color-mix(in srgb, var(--ok) 70%, var(--card)), var(--ok))',
  textStrongText: 'var(--text-strong, var(--text))',
  cardBg: 'var(--card, var(--bg))',
  mixOk16pctTransparent: 'color-mix(in srgb, var(--ok) 16%, transparent)',
  mixDanger16pctTransparent: 'color-mix(in srgb, var(--danger) 16%, transparent)',
  mixAccent10pctTransparent: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  cardTransparent: 'var(--card, transparent)',
  mixAccent12pctCard: 'color-mix(in srgb, var(--accent) 12%, var(--card))',
  card: 'var(--card)',
} as const

// An age's color: danger once it reaches 100, else danger mixed into muted
// by the age.
export const ageColor = (age: number) => (age >= 100 ? TONE.danger : `color-mix(in srgb, var(--danger) ${Math.round(Math.max(0, age) * 0.8)}%, var(--muted))`)

// Soft pill colors, by place in a list: Kiro Crew's tile colors at a light
// tint, the full mix while picked (the left nav's filter chips).
const TILES = ['purple', 'blue', 'green', 'orange', 'teal', 'pink', 'indigo', 'red']
export const tileTint = (at: number, picked: boolean) => `color-mix(in srgb, var(--tile-${TILES[at % TILES.length]}) ${picked ? 45 : 16}%, transparent)`
