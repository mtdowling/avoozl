// Fake data for the GitHub sign-in screens (plugin-credentials pc-4.3):
// &signin=1 on ?page=app (Settings › GitHub › GitHub calls), ?page=intake
// (Settings › Plugins with two plugins that claim one owner) and ?page=needs
// (a Needs you row whose Create labels opens the high-risk confirm).
import { answer, replyFor } from './stubs.tsx'

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

export function answerSignIn(page: string | null) {
  if (page === 'app') {
    const base = (replyFor('github.settings.get')?.({}) ?? {}) as Record<string, unknown>
    answer('github.settings.get', () => ({
      ...base,
      rate: {
        ...(base.rate as object),
        signIns: [
          {
            host: 'github.com',
            provider: 'acme-github',
            owners: ['acme', 'acme-labs'],
            state: 'approved',
            login: 'acme-bot[bot]',
            person: 'acme-dev',
            granted: 'per-job',
            broader: [],
            expiresAt: later(41),
          },
          { host: 'github.com', provider: 'gh', owners: 'other', state: 'approved', login: 'acme-dev', person: 'acme-dev', granted: 'all', broader: [], expiresAt: null },
        ],
        byLogin: {
          'acme-bot[bot]': { calls: 112, notModified: 51, cached: 130 },
          'acme-dev': { calls: 41, notModified: 10, cached: 5 },
        },
      },
    }))
  }
  if (page === 'intake') {
    const row = (id: string, owners: string[]) => ({
      id,
      source: 'machine',
      version: '2.1.0',
      contract: 1,
      provides: ['credentials'],
      kinds: ['credentials'],
      capabilities: {},
      hash: 'sha256:4f80e65fdd02',
      state: 'approved',
      reason: null,
      health: null,
      approval: { version: '2.1.0', hash: 'sha256:4f80e65fdd02', approvedAt: '2026-11-19T12:00:00Z' },
      credentials: { hosts: ['github.com'], owners },
    })
    answer('plugins.list', () => ({ supportedContracts: [1], plugins: [row('acme-github', ['acme', 'acme-labs']), row('acme-github-two', ['acme'])], credentialsPick: {} }))
  }
  if (page === 'needs') {
    answer('conflicts.view', () => ({
      revision: 1,
      items: [
        {
          kind: 'needs-human',
          reason: 'crew',
          id: 'github-labels:acme/api',
          key: 'labels',
          taskId: null,
          title: 'acme/api lacks label avoozl:spec',
          detail: 'Avoozl never makes a label as part of other work. Create it here, or on GitHub, and the waiting issue goes out on the next tick.',
          since: '2026-11-19T12:00:00Z',
          actions: [
            {
              label: 'Create labels',
              operation: 'github.labels.create',
              input: { repository: 'acme/api' },
              confirm: [
                {
                  job: 'repo-setup',
                  target: 'acme/api',
                  action: 'Create the labels avoozl:spec',
                  risk: 'high',
                  permissionsText: 'administration: write, issues: write, metadata: read',
                  permissionsHash: 'a'.repeat(64),
                },
              ],
            },
          ],
        },
      ],
    }))
  }
}
