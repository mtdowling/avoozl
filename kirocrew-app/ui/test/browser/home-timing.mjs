#!/usr/bin/env node
// Times Home on a real workspace. Each operation Home sends runs once on a
// copy of the workspace (in this process, GitHub fetches refused and
// counted), then the page (harness ?page=app) gets those replies, each after
// the time it took plus one host round trip (HOP_MS, default 50), and
// GITHUB_MS (default 400) for each GitHub call it would have made. Prints
// when the page shell, Home's first card and every reply landed, and the
// GitHub calls per operation.
//
//   node test/browser/home-timing.mjs <copy of a workspace root>
//
// Point it at a copy: opening a workspace may write to its database.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [root] = process.argv.slice(2)
if (!root) {
  console.error('Usage: home-timing.mjs <copy of a workspace root>')
  process.exit(2)
}
const HOP = Number(process.env.HOP_MS ?? 50),
  GITHUB = Number(process.env.GITHUB_MS ?? 400)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const load = (file) => import(pathToFileURL(path.join(repo, file)).href)
const { workspaceConfig } = await load('src/app/config.mjs')
const { Store } = await load('src/app/store.mjs')
const { Operations } = await load('src/app/operations.mjs')

let fetches = 0
globalThis.fetch = async () => {
  fetches += 1
  throw new TypeError('home-timing makes no GitHub call')
}
const config = workspaceConfig({ workspace: root, env: { ...process.env, AVOOZL_WORKSPACE: root } })
const store = new Store(config.dbPath)
const ops = new Operations(store, { operator: config.operator, workspaceRoot: config.workspaceRoot, plansRoot: config.plansRoot, workspaceName: config.name })
const HOME = [
  ['instance.view', {}],
  ['flow.view', { window: '10' }],
  ['graph.view', {}],
  ['delivery.view', {}],
  ['conflicts.view', {}],
  ['plan.list', { limit: 100 }],
  ['radar.crews', {}],
  ['repositories.list', {}],
  ['github.settings.get', {}],
  ['untriaged.view', {}],
  ['radar.releasequeue', {}],
  ['radar.armed', {}],
  ['gate.list', {}],
  ['integration.view', {}],
  ['review.drafts', {}],
  ['remote.view', {}],
]
const replay = { 'workspaces.list': { result: { defaultWorkspace: 'w', items: [{ id: 'w', name: config.name, root: '/w', enabled: true, state: 'ready', served: true }] }, ms: HOP } }
const github = {}
for (const [name, input] of HOME) {
  const before = fetches,
    start = performance.now()
  let result = null
  try {
    result = await ops.execute(name, input)
  } catch {}
  const calls = fetches - before
  github[name] = calls
  replay[name] = { result, ms: Math.round(performance.now() - start) + HOP + calls * GITHUB }
}
store.close()

const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
const harness = await buildHarness({ scripts: { 'replay.js': `window.__REPLAY = ${JSON.stringify(replay)};` } })
const browser = await launch(chrome)
try {
  const page = await browser.page()
  await page.open(harness.url({ page: 'app', theme: 'light' }), { width: 1280, height: 800 })
  const times = await page.evaluate(`new Promise((resolve) => {
    const t = {}
    const tick = () => {
      const now = Math.round(performance.now())
      if (!t.shell && document.querySelector('[data-shell-main] [data-avoozl-pane]')) t.shell = now
      if (!t.firstCard && /Needs you \\(\\d+\\)/.test(document.body.textContent)) t.firstCard = now
      if (t.firstCard && !window.__pending && window.__lastReply && now - window.__lastReply > 300) return resolve({ ...t, allReplies: Math.round(window.__lastReply), ops: window.__ops.length })
      if (now > 30000) return resolve({ ...t, timedOut: true })
      requestAnimationFrame(tick)
    }
    tick()
  })`)
  console.log(JSON.stringify({ hopMs: HOP, githubMs: GITHUB, times, githubCalls: github, replyMs: Object.fromEntries(Object.entries(replay).map(([k, v]) => [k, v.ms])) }, null, 2))
} finally {
  await browser.close()
  harness.remove()
}
