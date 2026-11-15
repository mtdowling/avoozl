// The brand card under the left nav (and at the bottom of the phone's menu):
// the logo, then the instance name, then the Avoozl version. Its own box, not
// part of the nav card.
import Logo from './Logo'
import { InstanceBadge } from './InstanceName.tsx'
import { NAV_CARD } from './LeftNav.tsx'

// Set from the root package.json by the build (vite.config.ts); absent when a
// test loads the source directly.
declare const __AVOOZL_VERSION__: string | undefined
export const AVOOZL_VERSION = typeof __AVOOZL_VERSION__ === 'string' ? __AVOOZL_VERSION__ : null

export function BrandCard(props: { workspaceId: string | null }) {
  return (
    <div data-brand-card aria-label="Avoozl" role="group" style={{ ...NAV_CARD, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px' }}>
      <Logo size={28} />
      <InstanceBadge workspaceId={props.workspaceId} />
      {AVOOZL_VERSION && (
        <span data-avoozl-version className="text-xs text-muted">
          Version {AVOOZL_VERSION}
        </span>
      )}
    </div>
  )
}
