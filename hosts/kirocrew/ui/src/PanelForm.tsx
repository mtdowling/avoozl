// A Settings panel that saves on its own (Isolation, Spec issues): its form,
// whether it changed since the last save, and the Saved or error line.
import { useState } from 'react'
import { useAppApi } from './host.ts'
import { Box } from './ui/Box'
import { Hint } from './ui/Hint'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'

type Message = { ok?: string; error?: string } | null

// `input` turns the form into repository.configure's input, after `id`.
export function usePanelForm<F>(props: { workspaceId: string; repositoryId: string; initial: F; input: (form: F) => Record<string, unknown> }) {
  const api = useAppApi()
  const [saved, setSaved] = useState<F>(props.initial)
  const [form, setForm] = useState<F>(saved)
  const [message, setMessage] = useState<Message>(null)
  const [saving, setSaving] = useState(false)
  const set = (change: Partial<F>) => {
    setForm({ ...form, ...change })
    setMessage(null)
  }
  const save = async () => {
    setSaving(true)
    try {
      await api.post(COMMAND_PATH, { operation: 'repository.configure', input: { id: props.repositoryId, ...props.input(form) }, workspaceId: props.workspaceId })
      setSaved(form)
      setMessage({ ok: 'Saved.' })
    } catch (error) {
      setMessage({ error: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }
  return { form, set, save, saving, message, dirty: JSON.stringify(form) !== JSON.stringify(saved) }
}

export function PanelMessage({ message }: { message: Message }) {
  return (
    <>
      {message?.ok && (
        <Hint as="p" m0 size="xs" role="status">
          {message.ok}
        </Hint>
      )}
      {message?.error && (
        <Box as="p" m0 size="xs" tone="danger" role="alert">
          {message.error}
        </Box>
      )}
    </>
  )
}
