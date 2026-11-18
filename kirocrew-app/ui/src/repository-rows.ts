// Settings > Repositories rows, kept free of JSX so node can test them.
import type { Repository } from './workspace-api.ts'
import type { RepositoryForm } from './settings-api.ts'
import type { ListFact } from './ListItem.tsx'

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

// The labels a rule's search line asks for (label:a, label:"b c", label:x,y);
// a -label: term excludes, so it is not a trigger.
export function ruleLabels(match: string): string[] {
  const found: string[] = []
  for (const term of match.matchAll(/(?<![-\w])label:("[^"]*"|\S+)/g))
    for (const part of term[1].startsWith('"') ? [term[1].slice(1, -1)] : term[1].split(',')) if (part && !found.includes(part)) found.push(part)
  return found
}

// What a row shows under its title: every fact the View dialog shows, in
// the list's order. A fact with no value is left blank and not rendered.
export function repositoryFacts(row: RepositoryRow, entry: RepositoryForm | null, mirrorSource = ''): ListFact[] {
  const harness = row.checkout?.harness
  const landing = row.checkout?.landing
  return [
    { label: 'Folder', value: row.folder, mono: true, truncate: true },
    { label: 'Tasks land on', value: row.checkout || entry ? `${row.branch}${landing ? ` (${landing})` : ''}` : '', mono: true },
    { label: 'Harness', value: harness },
    { label: 'Trigger labels', chips: (entry?.rules ?? []).flatMap((rule) => ruleLabels(rule.match)).filter((label, at, all) => all.indexOf(label) === at) },
    { label: 'Triage labels', chips: entry?.untriaged.triageLabels },
    { label: 'Merge', value: entry?.mergeMethod },
    { label: 'Checks', value: entry?.requiredChecks, mono: true, truncate: true },
    { label: 'Who may start work', value: entry?.allowedActors || (entry?.minimumPermission ? `permission ${entry.minimumPermission} or higher` : ''), truncate: true },
    { label: 'Release crews', value: entry?.releaseCapacity },
    { label: 'Mirror of', value: mirrorSource, mono: true },
  ]
}
