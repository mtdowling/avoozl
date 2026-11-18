// The repository facts Home's empty states need: how many repositories the
// workspace has. Reads the registered checkouts and the GitHub settings once,
// with the other reads.
import { useCallback, useMemo } from 'react'
import { useAppApi } from './host.ts'
import { settingsClient, toForm } from './settings-api.ts'
import { repositoryRows } from './repository-rows.ts'
import { workspaceClient } from './workspace-api.ts'
import { useRead } from './useRead.ts'

export function useSetupFacts(workspaceId: string | null): { repositories: number } {
  const api = useAppApi()
  const settings = useMemo(() => settingsClient(api), [api])
  const workspaces = useMemo(() => workspaceClient(api), [api])
  const load = useCallback(
    async (id: string) => {
      const [checkouts, policy] = await Promise.all([workspaces.repositories(id).catch(() => []), settings.get(id).catch(() => null)])
      const form = policy ? toForm(policy.github) : null
      const rows = repositoryRows(checkouts, form?.repositories ?? [])
      return { repositories: rows.length }
    },
    [settings, workspaces],
  )
  const { value } = useRead(workspaceId, load)
  // Until the read lands, claim nothing is missing.
  return value ?? { repositories: 1 }
}
