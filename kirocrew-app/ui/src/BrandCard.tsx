// The brand line under the left nav (and at the bottom of the phone's menu):
// the logo, the instance name and the Avoozl version.
import Logo from './Logo'
import { InstanceBadge } from './InstanceName.tsx'
import { Box } from './ui/Box'

// Set from the root package.json by the build (vite.config.ts); absent when a
// test loads the source directly.
declare const __AVOOZL_VERSION__: string | undefined
export const AVOOZL_VERSION = typeof __AVOOZL_VERSION__ === 'string' ? __AVOOZL_VERSION__ : null

export function BrandCard(props: { workspaceId: string | null; boxed?: boolean }) {
  // The brand row, desktop and phone alike: one line, no box, as Issue Radar
  // ends its sidebar. The logo at the left, the name and version at the
  // right, in Kiro Crew's caption size (12px name, 11px version).
  return (
    <div data-brand-card data-brand-line aria-label="Avoozl" role="group" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: props.boxed ? '4px 4px' : '4px 4px 4px 8px', minWidth: 0, flexShrink: 0 }}>
      <Logo size={16} />
      <Box as="span" css-margin-left="auto" css-white-space="nowrap" css-overflow="hidden" css-line-height="16px" flex minW0 items="baseline" gap="1.5">
        <Box as="span" css-font-size="12" minW0 truncate>
          <InstanceBadge workspaceId={props.workspaceId} className="text-muted" />
        </Box>
        {AVOOZL_VERSION && (
          <Box data-avoozl-version as="span" css-font-size="11" shrink0 tone="muted">
            v{AVOOZL_VERSION}
          </Box>
        )}
      </Box>
    </div>
  )
}
