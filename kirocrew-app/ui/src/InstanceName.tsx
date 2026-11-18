// The install's name on the page: the read-only header badge, and the nickname
// field in Settings > This computer. Renaming never changes the ID.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { FieldRow, fieldDescribedBy } from './FieldRow.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { NAME_RULE, instanceClient, nameFor, validName, type InstanceView } from './instance-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Stack } from './ui/Stack'

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

// Settings > Workspaces > This computer: the one place the name is changed.
// An in-place field with the shared field row and Save bar.
export function InstanceNickname(props: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => instanceClient(api), [api])
  const view = useInstance(props.workspaceId)
  const [text, setText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const saved = view?.name ?? ''
  const value = text ?? saved
  const dirty = text !== null && text.trim() !== saved
  const valid = validName(value)
  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      await client.rename(props.workspaceId, value.trim())
      window.dispatchEvent(new Event(CHANGED))
      setText(null)
      setOk('Saved.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack data-instance-nickname gap={2}>
      <FieldRow
        id="avoozl-instance-nickname"
        label="Nickname"
        width="md"
        help="The name people read for this computer. It never goes to GitHub."
        note={!valid && value ? NAME_RULE : undefined}
      >
        <Input
          id="avoozl-instance-nickname"
          value={value}
          maxLength={24}
          aria-invalid={!valid}
          aria-describedby={fieldDescribedBy('avoozl-instance-nickname', { help: true, note: !valid && value })}
          onChange={(event) => {
            setText(event.target.value)
            setOk(null)
          }}
        />
      </FieldRow>
      <SaveFooter
        dirty={dirty}
        saving={saving}
        problem={valid ? null : NAME_RULE}
        error={error}
        ok={ok}
        onSave={() => void save()}
        onDiscard={() => {
          setText(null)
          setError(null)
        }}
      />
    </Stack>
  )
}
