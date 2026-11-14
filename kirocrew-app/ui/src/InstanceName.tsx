// The install's name on the page: the header badge, and the rename box in
// Settings. The name is display only; renaming never changes the ID.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { InfoTip } from './controls.tsx'
import { NAME_RULE, instanceClient, nameFor, validName, type InstanceView } from './instance-api.ts'
import { errorMessage } from './workspace-api.ts'

// The instance, read again after a rename anywhere on the page.
const CHANGED = 'avoozl:instance-changed'

export function useInstance(workspaceId: string | null): InstanceView | null {
  const api = useAppApi()
  const client = useMemo(() => instanceClient(api), [api])
  const [view, setView] = useState<InstanceView | null>(null)
  const read = useCallback(() => {
    if (workspaceId) client.view(workspaceId).then(setView, () => undefined)
  }, [client, workspaceId])
  useEffect(() => {
    read()
    window.addEventListener(CHANGED, read)
    return () => window.removeEventListener(CHANGED, read)
  }, [read])
  return view
}

export function InstanceBadge(props: { workspaceId: string | null }) {
  const name = nameFor(useInstance(props.workspaceId), 'header')
  if (!name) return null
  return (
    <span data-instance-name className="text-sm text-muted">
      {name}
    </span>
  )
}

export function InstanceRename(props: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => instanceClient(api), [api])
  const view = useInstance(props.workspaceId)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (view) setText(view.name)
  }, [view?.name])
  const dirty = Boolean(view) && text.trim() !== view?.name
  const save = async () => {
    setError(null)
    setSaved(false)
    try {
      await client.rename(props.workspaceId, text.trim())
      setSaved(true)
      window.dispatchEvent(new Event(CHANGED))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <div data-instance-rename className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted">This install is called</span> <span className="font-medium">{view?.name ?? '…'}</span>
        <InfoTip text="The name is for people to read. Markers on GitHub carry a fixed ID instead, so renaming changes nothing there. It never goes to a public repository." label="About the instance name" />
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <Input value={text} maxLength={24} onChange={(event) => (setText(event.target.value), setSaved(false))} style={{ width: '14rem' }} />
        </label>
        <Btn type="button" primary disabled={!dirty || !validName(text)} onClick={() => void save()}>
          Rename
        </Btn>
        {!validName(text) && text && <span className="text-xs text-muted">{NAME_RULE}</span>}
        {saved && <span role="status" className="text-xs text-muted">Renamed.</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
