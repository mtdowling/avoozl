// ?page=app&inline=1: a small stateful backend for the Settings pages that
// edit in place (Delivery, Content rules, Plugins, Repository setup
// and Flow). Each update changes what the next get returns and moves the
// hash on, so a test can edit a field, Save and read the page back. Every
// write is recorded in window.__writes as { operation, input, workspaceId }.
import { answer } from './stubs.tsx'

type Body = { operation?: string; input?: Record<string, unknown>; workspaceId?: string }
const hashOf = (n: number) => `h${n}`

export function installInlineFixture() {
  const writes: Body[] = ((window as unknown as { __writes: Body[] }).__writes = [])
  let revision = 1
  const hash = () => hashOf(revision)
  const write = (body: unknown) => {
    writes.push(body as Body)
    revision += 1
  }
  const stale = (body: Body) => {
    const given = (body.input as { expectedHash?: string | null } | undefined)?.expectedHash
    if (given !== hash()) throw new Error(`Stale: expected ${hash()}, got ${given}`)
  }

  // Delivery
  let delivery: Record<string, unknown> = { ship: 'manual', feedbackRounds: 3 }
  answer('delivery.settings.get', () => ({ hash: hash(), on: true, delivery }))
  answer('delivery.settings.update', (body) => {
    stale(body)
    delivery = (body.input as { delivery: Record<string, unknown> }).delivery
    write(body)
    return { hash: hash(), on: true, delivery }
  })
  answer('GET /api/models', () => ({ models: [] }))

  // Flow
  let flow: Record<string, unknown> = {}
  let instructions = ''
  const flowSettings = () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: hash(),
    flow,
    repositories: {},
    instructions,
    retroPrompt: 'Review saved timings and propose one change.',
    ciClassGlobs: { docs: ['docs/', '**/*.md'], other: ['*.lock'] },
  })
  answer('flow.settings.get', () => flowSettings())
  answer('flow.settings.update', (body) => {
    stale(body)
    flow = (body.input as { flow: Record<string, unknown> }).flow
    write(body)
    return flowSettings()
  })
  answer('flow.instructions.update', (body) => {
    instructions = String((body.input as { instructions?: string }).instructions ?? '')
    writes.push(body)
    return {}
  })
  answer('flow.proposals', () => ({ proposals: [], dropped: [], prompts: [], notes: [], available: false }))

  // Repository setup
  let github: Record<string, unknown> = { mode: 'single-repo', repositories: { 'acme/recipe-box': { baseBranch: 'main' } } }
  const githubSettings = () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: hash(),
    github,
    effective: null,
    error: null,
    crews: [],
    choices: {
      modes: ['local', 'plans-repo', 'single-repo'],
      authorities: [],
      coders: ['issue-radar', 'remote'],
      permissions: [],
      actions: [],
      fields: [],
      statusValues: [],
      managedLabels: [],
      crewLabels: [],
    },
  })
  answer('github.settings.get', () => githubSettings())
  answer('github.settings.validate', () => ({ valid: true, error: null }))
  answer('github.settings.update', (body) => {
    stale(body)
    github = (body.input as { github: Record<string, unknown> }).github
    write(body)
    return githubSettings()
  })
  answer('repositories.list', () => ({ items: [{ id: 'recipe-box', name: 'recipe-box', localCheckout: '/w/recipe-box', github: 'acme/recipe-box', baseBranch: 'main' }] }))

  // Content rules
  let sets: Record<string, unknown>[] = [{ id: 'codenames', action: 'block', source: 'file', boundaries: ['plan', 'github'] }]
  let terms = 'zebra: zebra falcon\n'
  const contentRules = () => ({
    error: null,
    configHash: hash(),
    mode: 'single-repo',
    builtins: [{ id: 'secrets', appliesAt: 'Every write' }],
    choices: { repositories: ['recipe-box'], plugins: [] },
    sets: sets.map((set) => ({ ...set, available: true, ruleCount: 1 })),
  })
  answer('content.rules', () => contentRules())
  answer('content.sets.update', (body) => {
    stale(body)
    sets = (body.input as { sets: Record<string, unknown>[] }).sets
    write(body)
    return contentRules()
  })
  answer('content.terms.get', (body) => ({ id: (body.input as { id: string }).id, file: '~/.avoozl/codenames.terms', from: 'machine', editable: true, exists: true, text: terms }))
  answer('content.terms.update', (body) => {
    terms = String((body.input as { text?: string }).text ?? '')
    writes.push(body)
    return { id: String((body.input as { id: string }).id), rules: terms.split('\n').filter(Boolean).length, saved: true }
  })

  // Plugins
  let disabled = false
  const plugins = () => ({
    supportedContracts: [1],
    routes: [],
    plugins: [{ id: 'team-pack', source: 'repository', version: '1.0.0', contract: 1, kinds: [], state: disabled ? 'disabled' : 'approved', reason: null, health: null }],
  })
  answer('plugins.list', () => plugins())
  answer('plugin.disable', (body) => {
    disabled = Boolean((body.input as { disabled?: boolean }).disabled)
    writes.push(body)
    return plugins().plugins[0]
  })
  answer('intake.sources', () => ({ sources: [] }))
}
