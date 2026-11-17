// The brand line under the left nav (and at the bottom of the phone's menu):
// the logo, the instance name and the Avoozl version.
import Logo from './Logo'
import { InstanceBadge, InstanceEdit } from './InstanceName.tsx'

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
      <span className="flex min-w-0 items-baseline gap-1.5" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', lineHeight: '16px' }}>
        <span className="min-w-0 truncate" style={{ fontSize: 12 }}>
          <InstanceBadge workspaceId={props.workspaceId} className="text-muted" />
        </span>
        {props.workspaceId && <InstanceEdit workspaceId={props.workspaceId} />}
        {AVOOZL_VERSION && (
          <span data-avoozl-version className="shrink-0 text-muted" style={{ fontSize: 11 }}>
            v{AVOOZL_VERSION}
          </span>
        )}
      </span>
    </div>
  )
}
