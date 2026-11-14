// The Settings banner for a repository still on the retired worker.
import { useCallback, useMemo } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { RETIRED_LINE, retiredCoders } from './nav-api.ts'
import { settingsClient, toForm, defaultCoder } from './settings-api.ts'

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
