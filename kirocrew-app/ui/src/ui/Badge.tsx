import type { ReactNode } from 'react'
import { Badge as HostBadge } from '@kirocrew/app-sdk/ui'

// The host Badge knows five variants: ok, err, warn, aim and muted. Any other
// value, or none, falls through to `warn`, the yellow that means "needs you".
// Every plain badge on the page (wave, state, counts) rendered yellow that
// way. This maps the page's names onto the host's, so only `warning` is yellow.
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'wave'

const HOST: Record<BadgeVariant, { variant: 'ok' | 'err' | 'warn' | 'aim' | 'muted'; className?: string }> = {
  success: { variant: 'ok' },
  warning: { variant: 'warn' },
  danger: { variant: 'err' },
  info: { variant: 'muted', className: 'bg-accent-subtle text-accent' },
  // Kiro's purple: no state uses it, and it reads in light and dark.
  wave: { variant: 'aim' },
}

export function hostBadge(variant?: BadgeVariant) {
  return (variant && HOST[variant]) || { variant: 'muted' as const }
}

// `small`: the metrics of a status chip on Ultra Mode's Board, for a card
// that holds several badges in a row.
const SMALL = 'px-1.5 py-px text-[11px] leading-[14px] tabular-nums'

export default function Badge({ variant, small, children }: { variant?: BadgeVariant; small?: boolean; children?: ReactNode }) {
  const host = hostBadge(variant)
  const className = [host.className, small && SMALL].filter(Boolean).join(' ') || undefined
  return (
    <HostBadge variant={host.variant} className={className}>
      {children}
    </HostBadge>
  )
}
