// What a write will do, as a small pill: create (green), change (accent) or
// keep (muted). Setup and Onboard's write lists both use it.
const TONES: Record<string, { color: string; borderColor: string }> = {
  create: { color: 'var(--ok)', borderColor: 'var(--ok)' },
  change: { color: 'var(--accent)', borderColor: 'var(--accent)' },
  keep: { color: 'var(--muted)', borderColor: 'var(--border)' },
}

export function WriteBadge({ kind }: { kind: string }) {
  return (
    <span className="rounded-full border px-1.5 text-[10px] font-semibold" style={TONES[kind] ?? TONES.keep}>
      {kind}
    </span>
  )
}
