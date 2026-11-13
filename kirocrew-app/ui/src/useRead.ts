import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './workspace-api.ts'

// Load one read-only view for the selected workspace, again on `reload()`.
export function useRead<T>(workspaceId: string | null, load: (id: string) => Promise<T>) {
  const [value, setValue] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    if (!workspaceId) return
    setBusy(true)
    setError(null)
    try {
      setValue(await load(workspaceId))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [workspaceId, load])
  useEffect(() => {
    setValue(null)
    void reload()
  }, [reload])
  return { value, error, busy, reload }
}
