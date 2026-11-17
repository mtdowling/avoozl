// Settings > Repositories rows, kept free of JSX so node can test them.
import type { Repository } from './workspace-api.ts'
import type { RepositoryForm } from './settings-api.ts'

export interface RepositoryRow {
  key: string
  name: string
  // The registered checkout, if any.
  checkout: Repository | null
  // Index into the form's GitHub repositories, if it has GitHub settings.
  policy: number
  github: string | null
  folder: string | null
  branch: string
  // The planning repository of the workspace has no checkout here and no entry:
  // only its name is stored (R105.5).
  githubOnly?: boolean
}

// One row per registered checkout, then one per GitHub-only settings entry
// (a planning repository with no checkout here, say).
export function repositoryRows(checkouts: Repository[], policies: RepositoryForm[], planning = ''): RepositoryRow[] {
  const used = new Set<number>()
  const rows: RepositoryRow[] = checkouts.map((checkout) => {
    const policy = checkout.github ? policies.findIndex((p) => p.name.trim() === checkout.github) : -1
    if (policy >= 0) used.add(policy)
    return {
      key: `checkout:${checkout.id}`,
      name: checkout.name || checkout.id,
      checkout,
      policy,
      github: checkout.github,
      folder: checkout.localCheckout,
      branch: (policy >= 0 && policies[policy].baseBranch) || checkout.baseBranch,
    }
  })
  policies.forEach((policy, index) => {
    if (used.has(index)) return
    rows.push({
      key: `policy:${index}`,
      name: policy.name || 'New repository',
      checkout: null,
      policy: index,
      github: /^[\w.-]+\/[\w.-]+$/.test(policy.name.trim()) ? policy.name.trim() : null,
      folder: null,
      branch: policy.baseBranch || 'main',
    })
  })
  const named = planning.trim()
  if (named && !rows.some((row) => row.github?.toLowerCase() === named.toLowerCase()))
    rows.push({ key: `planning:${named}`, name: named, checkout: null, policy: -1, github: named, folder: null, branch: 'main', githubOnly: true })
  return rows
}

export const githubHref = (github: string | null) => (github && /^[\w.-]+\/[\w.-]+$/.test(github) ? `https://github.com/${github}` : null)
