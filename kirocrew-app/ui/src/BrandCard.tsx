// The brand line under the left nav (and at the bottom of the phone's menu):
// the logo, the instance name and the Avoozl version.
import Logo from './Logo'
import { InstanceBadge } from './InstanceName.tsx'
import { NAV_CARD } from './LeftNav.tsx'

// Set from the root package.json by the build (vite.config.ts); absent when a
// test loads the source directly.
declare const __AVOOZL_VERSION__: string | undefined
export const AVOOZL_VERSION = typeof __AVOOZL_VERSION__ === 'string' ? __AVOOZL_VERSION__ : null

export function BrandCard(props: { workspaceId: string | null; boxed?: boolean }) {
  // A phone's menu keeps its card: the logo, then the name, then the version.
  if (props.boxed)
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
  // The desktop's line, no box, as Issue Radar ends its sidebar: the logo at
  // the left, the instance name and version at the right.
  return (
    <div data-brand-card data-brand-line aria-label="Avoozl" role="group" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 8px', minWidth: 0 }}>
      <Logo size={20} />
      <span className="flex min-w-0 items-baseline gap-1.5" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span className="min-w-0 truncate">
          <InstanceBadge workspaceId={props.workspaceId} />
        </span>
        {AVOOZL_VERSION && (
          <span data-avoozl-version className="shrink-0 text-xs text-muted">
            v{AVOOZL_VERSION}
          </span>
        )}
      </span>
    </div>
  )
}
