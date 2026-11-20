// GitHub web links, built from a validated owner/name and a validated
// number, SHA, branch or login, never from a URL or free text. Each builder
// returns null for a value that fails, so the caller shows plain text.

const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const SHA = /^[0-9a-f]{7,40}$/
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const BRANCH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/
const BASE = 'https://github.com'

export type GithubRef = { kind: 'repo' } | { kind: 'pull' | 'issue' | 'checks'; number: number } | { kind: 'commit'; sha: string } | { kind: 'branch'; ref: string }

export const githubRepository = (value: string | null | undefined) =>
  typeof value === 'string' && REPOSITORY.test(value) && !value.split('/').some((part) => part === '.' || part === '..') ? value : null

const branchOk = (ref: string) => BRANCH.test(ref) && !ref.includes('..') && !ref.includes('//') && !ref.endsWith('/') && !ref.endsWith('.lock')

// A page on GitHub for `repository`, or null.
export function githubUrl(repository: string | null | undefined, ref: GithubRef = { kind: 'repo' }): string | null {
  const name = githubRepository(repository)
  if (!name) return null
  const root = `${BASE}/${name}`
  switch (ref.kind) {
    case 'repo':
      return root
    case 'pull':
    case 'issue':
    case 'checks':
      if (!Number.isSafeInteger(ref.number) || ref.number < 1) return null
      return `${root}/${ref.kind === 'issue' ? 'issues' : 'pull'}/${ref.number}${ref.kind === 'checks' ? '/checks' : ''}`
    case 'commit':
      return SHA.test(ref.sha) ? `${root}/commit/${ref.sha}` : null
    case 'branch':
      return branchOk(ref.ref) ? `${root}/tree/${ref.ref.split('/').map(encodeURIComponent).join('/')}` : null
  }
}

// A person's GitHub profile, or null.
export const githubUserUrl = (login: string | null | undefined) => (typeof login === 'string' && LOGIN.test(login) ? `${BASE}/${login}` : null)

// A stored link read back as a pull request or issue of a known repository:
// the parts are taken from the URL and the URL is built again, so only a
// repository in `known` links.
export function githubItemOf(link: string | null | undefined, known: string[]): { repository: string; kind: 'pull' | 'issue'; number: number } | null {
  const found = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(pull|issues)\/(\d+)\/?$/.exec(link ?? '')
  const repository = found && knownRepository(found[1], known)
  return repository && found ? { repository, kind: found[2] === 'pull' ? 'pull' : 'issue', number: Number(found[3]) } : null
}

// `name` as spelled in `known`, matched without case, or null.
export const knownRepository = (name: string, known: string[]) => known.find((entry) => entry.toLowerCase() === name.toLowerCase()) ?? null
