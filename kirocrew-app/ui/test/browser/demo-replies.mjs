// The Demo mode page's replies, from the real sample: build it in a temp
// folder (src/app/demo.mjs), run every operation the page names through the
// demo gate, and keep each read's result and each change's preview. The
// harness (?page=demo) answers the sample's calls from them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoOperations, installDemo } from '../../../../src/app/demo.mjs'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

// Every 'a.b' operation name the page's sources send.
function pageOperations() {
  const names = new Set()
  for (const file of fs.readdirSync(src).filter((name) => /\.tsx?$/.test(name)))
    for (const match of fs.readFileSync(path.join(src, file), 'utf8').matchAll(/'([a-z]+(?:\.[a-zA-Z]+)+)'/g)) names.add(match[1])
  return [...names].filter((name) => !name.startsWith('demo.') && !name.startsWith('workspaces.') && !/\.(tsx?|mjs|json|md)$/.test(name))
}

export async function demoReplies() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-demo-ui-'))
  const { root } = await installDemo(path.join(tmp, 'demo'))
  const demo = demoOperations(root)
  const replies = {},
    previews = {}
  try {
    for (const name of pageOperations()) {
      try {
        replies[name] = await demo.execute(name, {})
      } catch (error) {
        if (error.demo) previews[name] = error.message
      }
    }
    // The tour opens one task's drawer.
    replies['task.detail'] = await demo.execute('task.detail', { id: 'recipe-import.2.1' })
  } finally {
    demo.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return { replies, previews }
}

// The classic script the harness loads before the page.
export const demoScript = (value) => `window.__DEMO = ${JSON.stringify(value)};`
