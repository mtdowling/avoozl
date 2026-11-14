// Parts of Settings that exist so the page is complete before their logic is:
// the empty labeled slot (Mirror), the Adopt and Create setup
// buttons, and the banner for a repository still on the retired worker.
// Each slot is a box with a name and one line, so whoever fills it replaces
// the box's body and leaves its place alone.
import { useCallback, useMemo, type ReactNode } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { InfoTip, SectionHeading } from './controls.tsx'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { RETIRED_LINE, retiredCoders } from './nav-api.ts'
import { settingsClient, toForm, defaultCoder } from './settings-api.ts'

function Slot(props: { id: string; title: string; line: string; children?: ReactNode }) {
  return (
    <div data-slot={props.id} className="flex flex-col gap-1 rounded-lg border p-3" style={{ borderColor: 'var(--border)', borderStyle: 'dashed' }}>
      <SectionHeading level={4} title={props.title} className="mb-0" meta={<span className="text-xs text-muted">Empty slot</span>} />
      <p className="text-sm text-muted">{props.line}</p>
      {props.children}
    </div>
  )
}

export const MirrorSlot = () => (
  <Slot id="mirror" title="Mirror" line="Reserved for the repository mirror. Specified separately." />
)

const SOON = 'Not wired yet. It turns on when the setup check for Issue Radar crews lands.'

// Adopt reads what a repository already has and keeps it; Create writes what
// is missing. Both wait for the setup logic, so both are present and off.
export function SetupActions() {
  return (
    <div data-setup-actions className="flex flex-wrap items-center gap-2">
      {[
        ['Adopt existing setup', 'Read the labels, Project and crew values this repository already has, and use them as they are. Changes nothing on GitHub.'],
        ['Create setup', 'Create the labels and Project fields a repository needs, after showing each change. Writes nothing until you confirm.'],
      ].map(([label, about]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Tooltip text={SOON}>
            <Btn type="button" disabled aria-disabled="true" data-setup-action={label}>
              {label}
            </Btn>
          </Tooltip>
          <InfoTip text={about} label={`About ${label}`} />
        </span>
      ))}
    </div>
  )
}

// A Settings banner for repositories whose coder is the retired worker.
export function RetiredBanner(props: { workspaceId: string | null; onOpen: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => settingsClient(api), [api])
  const load = useCallback((id: string) => client.get(id), [client])
  const { value } = useRead(props.workspaceId, load)
  if (!value) return null
  const form = toForm(value.github)
  const names = retiredCoders(form.repositories, defaultCoder(form.mode))
  if (!names.length) return null
  return (
    <div
      role="status"
      data-retired-banner
      className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
      style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, var(--card, transparent))' }}
    >
      <span className="min-w-0 flex-1">
        <span className="font-medium">{RETIRED_LINE}</span>
        <span className="block text-xs text-muted">Still on the worker: {names.join(', ')}.</span>
      </span>
      <Btn type="button" onClick={props.onOpen}>
        Open Repository setup
      </Btn>
    </div>
  )
}
