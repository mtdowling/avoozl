// The Avoozl mark from kirocrew-app/assets/icon.svg, without its tile, in
// theme colors so it reads in every Kiro Crew theme.
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M8 95 Q50 82 92 95"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path d="M39 36 Q28 28 29 14 Q33 28 43 30 Z M61 36 Q72 28 71 14 Q67 28 57 30 Z" fill="var(--accent)" />
      <path
        fillRule="evenodd"
        fill="var(--text)"
        d="M50 8 L84 84 Q80 92 74 97 L64 70 L36 70 L26 97 Q20 92 16 84 Z M50 24 L62 58 L38 58 Z"
      />
      <path d="M39 45 L49 50 L46 55 Z M61 45 L51 50 L54 55 Z" fill="var(--danger)" />
    </svg>
  )
}
