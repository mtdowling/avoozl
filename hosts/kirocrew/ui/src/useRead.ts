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
  // A reply the backend answered from its last read while it reads GitHub
  // again says `refreshing`; read once more shortly to show the new one.
  const refreshing = Boolean((value as { refreshing?: unknown } | null)?.refreshing)
  useEffect(() => {
    if (!refreshing) return
    const timer = setTimeout(() => void reload(), REFRESH_AGAIN_MS)
    return () => clearTimeout(timer)
  }, [value, refreshing, reload])
  return { value, error, busy, reload }
}

export const REFRESH_AGAIN_MS = 3000
