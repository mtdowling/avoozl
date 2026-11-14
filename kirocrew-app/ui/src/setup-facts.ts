// The repository facts Home's empty states need: how many repositories the
// workspace has, and how many of them an Issue Radar crew codes. Reads the
// registered checkouts and the GitHub settings once, with the other reads.
import { useCallback, useMemo } from 'react'
import { useAppApi } from './host.ts'
import { settingsClient, toForm, defaultCoder } from './settings-api.ts'
import { repositoryRows } from './repository-rows.ts'
import { workspaceClient } from './workspace-api.ts'
import { useRead } from './useRead.ts'

export function useSetupFacts(workspaceId: string | null): { repositories: number; radarRepositories: number } {
  const api = useAppApi()
  const settings = useMemo(() => settingsClient(api), [api])
  const workspaces = useMemo(() => workspaceClient(api), [api])
  const load = useCallback(
    async (id: string) => {
      const [checkouts, policy] = await Promise.all([workspaces.repositories(id).catch(() => []), settings.get(id).catch(() => null)])
      const form = policy ? toForm(policy.github) : null
      const rows = repositoryRows(checkouts, form?.repositories ?? [])
      const mode = form?.mode ?? ''
      const radar = (form?.repositories ?? []).filter((r) => (r.coder || defaultCoder(mode)) === 'issue-radar').length
      return { repositories: rows.length, radarRepositories: radar }
    },
    [settings, workspaces],
  )
  const { value } = useRead(workspaceId, load)
  // Until the read lands, claim nothing is missing.
  return value ?? { repositories: 1, radarRepositories: 0 }
}
