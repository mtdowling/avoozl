// Real-looking intake data for the harness's ?page=intake: GitHub, two
// plugin poll sources and one MCP source. One healthy (GitHub), one
// erroring (tickets), one off (ops, its plugin is disabled) and one never
// read (nightly, no item yet).
import { answer } from './stubs.tsx'

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const plugin = (id: string, state: string, capabilities: string[], extra = {}) => ({
  id,
  source: 'machine',
  version: '1.2.0',
  contract: 1,
  provides: ['tracker'],
  kinds: ['node'],
  capabilities: { tracker: capabilities },
  hash: 'sha256:9f2c4e1a7b3d',
  state,
  reason: state === 'disabled' ? 'Disabled on this machine.' : null,
  health: state === 'approved' ? { state: 'ok', reason: null } : null,
  ...extra,
})

export const PLUGINS = [
  plugin('ticket-tracker', 'approved', ['poll', 'actor'], { health: { state: 'unavailable', reason: 'poll failed: 401 Unauthorized' } }),
  plugin('ops-queue', 'disabled', ['poll']),
]

export const SOURCES = [
  {
    id: 'tickets',
    scope: 'machine',
    entry: { via: 'plugin:ticket-tracker', repository: 'example/web', labelFields: ['component', 'priority'], assigneeField: 'owner', minimumPermission: 'triage' },
    error: null,
    state: { cursor: '2026-11-13T19:02:11Z#4411', readAt: ago(190), error: 'Plugin ticket-tracker poll failed: 401 Unauthorized', more: false },
    items: { total: 42, untriaged: 7, lastAt: ago(195) },
  },
  {
    id: 'ops',
    scope: 'repository',
    entry: { via: 'plugin:ops-queue', repository: 'example/api', allowedActors: ['sam', 'riley'] },
    error: null,
    state: { cursor: 'page-18', readAt: ago(60 * 24 * 3), error: null, more: false },
    items: { total: 12, untriaged: 0, lastAt: ago(60 * 24 * 3) },
  },
  {
    id: 'nightly',
    scope: 'machine',
    entry: { via: 'mcp', repository: 'example/web' },
    error: null,
    state: null,
    items: { total: 0, untriaged: 0, lastAt: null },
  },
]

export const GITHUB = { mode: 'single-repo', repositories: [{ repository: 'example/web', checkedAt: ago(4), error: null, items: { total: 18, untriaged: 3, lastAt: ago(30) } }] }

const REPOSITORIES = [
  { id: 'web', github: 'example/web' },
  { id: 'api', github: 'example/api' },
]

// `empty` answers with no source at all, for the empty state.
export function answerIntake(empty: boolean) {
  answer('plugins.list', () => ({ supportedContracts: [1], routes: [], plugins: empty ? [] : PLUGINS }))
  answer('intake.sources', () => ({ sources: empty ? [] : SOURCES, github: empty ? { mode: null, repositories: [] } : GITHUB }))
  answer('repositories.list', () => ({ items: REPOSITORIES }))
}
