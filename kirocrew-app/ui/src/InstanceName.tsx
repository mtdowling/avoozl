// The install's name on the page: the header badge, and the edit button
// that opens the rename modal. The name is display only; renaming never changes the ID.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { InfoTip } from './controls.tsx'
import { Modal } from './Modal.tsx'
import { Pencil } from './icons.ts'
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

export function InstanceBadge(props: { workspaceId: string | null; className?: string }) {
  const name = nameFor(useInstance(props.workspaceId), 'header')
  if (!name) return null
  return (
    <span data-instance-name className={props.className ?? 'text-sm text-muted'}>
      {name}
    </span>
  )
}

export function InstanceEdit(props: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-instance-edit aria-label="Edit instance name" onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, padding: 0, border: 0, borderRadius: 4, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>
        <Pencil size={12} aria-hidden="true" />
      </button>
      {open && <InstanceModal workspaceId={props.workspaceId} onClose={() => setOpen(false)} />}
    </>
  )
}

function InstanceModal(props: { workspaceId: string; onClose: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => instanceClient(api), [api])
  const view = useInstance(props.workspaceId)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const value = text ?? view?.name ?? ''
  const ok = validName(value)
  const save = async () => {
    if (!ok) return
    setError(null)
    try {
      await client.rename(props.workspaceId, value.trim())
      window.dispatchEvent(new Event(CHANGED))
      props.onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <Modal
      id="avoozl-instance-name"
      title="Instance name"
      width="26rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      onDismiss={props.onClose}
      footer={
        <>
          <Btn type="submit" form="avoozl-instance-form" primary disabled={!ok}>
            Save
          </Btn>
        </>
      }
    >
      <form
        id="avoozl-instance-form"
        data-instance-form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <Input value={value} maxLength={24} aria-invalid={!ok} onChange={(event) => setText(event.target.value)} />
        </label>
        {!ok && value && <span className="text-xs text-danger">{NAME_RULE}</span>}
        <p className="flex items-center gap-2 text-xs text-muted">
          The name is for people to read. It never goes to GitHub.
          <InfoTip text="Markers on GitHub carry a fixed ID instead, so renaming changes nothing there. It never goes to a public repository." label="About the instance name" />
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
