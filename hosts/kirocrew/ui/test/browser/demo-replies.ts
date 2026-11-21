// The Demo mode page's replies, from the real sample: build it in a temp
// folder (src/app/test/demo-fixture.ts), run every operation the page names through the
// demo gate, and keep each read's result and each change's preview. The
// harness (?page=demo) answers the sample's calls from them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoOperations, installDemo } from '../../../../../src/app/test/demo-fixture.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

// Every 'a.b' operation name the page's sources send.
function pageOperations() {
  const names = new Set<string>()
  for (const file of fs.readdirSync(src).filter((name) => /\.tsx?$/.test(name)))
    for (const match of fs.readFileSync(path.join(src, file), 'utf8').matchAll(/'([a-z]+(?:\.[a-zA-Z]+)+)'/g)) names.add(match[1])
  return [...names].filter((name) => !name.startsWith('demo.') && !name.startsWith('workspaces.') && !/\.(tsx?|mjs|json|md)$/.test(name))
}

// `plan` lays `with` over one spec's plan.get (the Links box shots).
export async function demoReplies({ plan }: { plan?: { id: string; with: Record<string, unknown> } } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-demo-ui-'))
  const { root } = await installDemo(path.join(tmp, 'demo'))
  const demo = demoOperations(root)
  const replies: Record<string, unknown> = {},
    previews: Record<string, string> = {}
  try {
    for (const name of pageOperations()) {
      try {
        replies[name] = await demo.execute(name, {}, undefined)
      } catch (error) {
        // The demo gate refuses a change with its preview sentence.
        const refusal = error as { demo?: unknown; message?: string }
        if (refusal.demo) previews[name] = String(refusal.message)
      }
    }
    // A task's drawer, opened from the Graph.
    replies['task.detail'] = await demo.execute('task.detail', { id: 'recipe-import.2.1' }, undefined)
    // One spec's plan.get, with fields laid over it (the Links box shots).
    if (plan) {
      replies['plan.get'] = { ...((await demo.execute('plan.get', { id: plan.id }, undefined)) as Record<string, unknown>), ...plan.with }
      replies['plan.preview'] = await demo.execute('plan.preview', { id: plan.id }, undefined)
    }
  } finally {
    demo.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return { replies, previews }
}

// The classic script the harness loads before the page.
export const demoScript = (value: unknown) => `window.__DEMO = ${JSON.stringify(value)};`
