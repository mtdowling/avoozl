// Which server answers this page: Kiro Crew's app backend or the standalone page's,
// read once from the workspace list.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { workspaceClient } from './workspace-api.ts'

export function useHostKind(): 'kirocrew' | 'standalone' | undefined {
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const [host, setHost] = useState<'kirocrew' | 'standalone' | undefined>(undefined)
  useEffect(() => {
    let live = true
    client.list().then(
      (list) => live && setHost(list.host),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client])
  return host
}
