// Counts of open review findings by severity, as small colored badges:
// blocker red, warn yellow, info grey, the same theme colors as the finding
// borders (review-view.ts). A zero count shows nothing.
import { SEVERITIES, SEVERITY_INK, SEVERITY_LABEL, type FindingSeverity } from './review-view.ts'
import { Box } from './ui/Box'

export function SeverityBadges(props: { counts?: Partial<Record<FindingSeverity, number>> | Record<string, number> | null; label?: string }) {
  const shown = SEVERITIES.filter((s) => (props.counts?.[s] ?? 0) > 0)
  if (!shown.length) return null
  return (
    <Box
      data-severity-badges
      as="span"
      css-display="inline-flex"
      css-flex-wrap="wrap"
      css-align-items="center"
      css-gap="6"
      inlineFlex
      flexWrap
      items="center"
      aria-label={props.label}
    >
      {shown.map((s) => (
        <span
          key={s}
          data-severity-badge={s}
          className="text-xs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: '18px',
            color: SEVERITY_INK[s],
            border: `1px solid color-mix(in srgb, ${SEVERITY_INK[s]} 55%, transparent)`,
            background: `color-mix(in srgb, ${SEVERITY_INK[s]} 10%, transparent)`,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {props.counts?.[s]} {SEVERITY_LABEL[s].toLowerCase()}
        </span>
      ))}
    </Box>
  )
}
