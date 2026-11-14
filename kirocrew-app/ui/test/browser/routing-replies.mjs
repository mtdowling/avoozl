// Settings › Routing's replies from a real backend: a temporary workspace
// per state, then routing.view and routing.preview run through Operations.
// `repo` is an Avoozl checkout (this one by default; an older one for the
// out-of-date backend). A refused call is kept as {error, status} so the
// harness refuses it the same way. Fake names only; nothing leaves the
// temporary folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const PROMPT = { enabled: true, prompt: 'Tests go remote. Everything else stays local.' }

// The states the page must draw (workspace .avoozl.json, machine routing).
export const STATES = {
  blank: { tracked: {}, machine: null },
  empty: { tracked: { version: 1 }, machine: null },
  // Keys removed with PR #33, still in an owner's tracked file.
  'old-keys': {
    tracked: { version: 1, routing: { rules: [{ id: 'pin', on: 'local' }], pick: { preset: 'balanced' }, router: { enabled: true } }, providers: { lowPercent: 70 } },
    machine: null,
  },
  on: { tracked: { version: 1 }, machine: PROMPT },
}

export async function routingReplies(states = Object.keys(STATES), { repo = HERE } = {}) {
  const load = (file) => import(pathToFileURL(path.join(repo, 'src/app', file)).href)
  const [{ Operations }, { Store }, { snapshot }] = await Promise.all([load('operations.mjs'), load('store.mjs'), load('test/fixtures.mjs')])
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-routing-ui-'))
  const before = process.env.XDG_CONFIG_HOME
  const out = {}
  try {
    for (const name of states) {
      const state = STATES[name]
      const root = path.join(tmp, name),
        xdg = path.join(root, 'xdg'),
        machine = path.join(xdg, 'avoozl', 'config.json')
      fs.mkdirSync(path.dirname(machine), { recursive: true })
      if (state.machine) fs.writeFileSync(machine, JSON.stringify({ version: 1, routing: state.machine }))
      fs.writeFileSync(path.join(root, '.avoozl.json'), JSON.stringify(state.tracked))
      process.env.XDG_CONFIG_HOME = xdg
      const store = new Store(path.join(root, 'workspace.sqlite'))
      try {
        store.importSnapshot(snapshot())
        const ops = new Operations(store, { workspaceRoot: root, placement: { localReading: () => ({ source: 'node', measuredAt: new Date().toISOString(), memFreeGb: 8, diskFreeGb: 80, loadPerCpu: 0.2 }) } })
        out[name] = {}
        for (const operation of ['routing.view', 'routing.preview'])
          try {
            out[name][operation] = { result: await ops.execute(operation, {}) }
          } catch (error) {
            out[name][operation] = { error: error.message, status: error.status ?? 500 }
          }
      } finally {
        store.close()
      }
    }
  } finally {
    if (before === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = before
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return out
}

// A classic script that sets window.__ROUTING for the harness.
export const routingScript = (replies) => `window.__ROUTING = ${JSON.stringify(replies)};`
