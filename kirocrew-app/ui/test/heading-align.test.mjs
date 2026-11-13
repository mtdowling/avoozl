// Heading rows measured in a real browser: each title's vertical center
// against the buttons on its line. Needs a page that serves the app (a
// screenshot harness with stand-ins for the host SDK, whose tab buttons
// carry data-seg) and a headless Chrome:
//
//   AVOOZL_UI_URL=http://127.0.0.1:8962 AVOOZL_CHROME=/path/to/chrome node --test test/heading-align.test.mjs
//
// Without both it is skipped, like the host CSS check.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const url = process.env.AVOOZL_UI_URL
const chrome = process.env.AVOOZL_CHROME
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// For each visible heading, the buttons in its row on the same line, and
// the largest distance between their centers and the heading's.
const MEASURE = `(() => {
  const out = []
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const h of document.querySelectorAll('h2, h3, h4')) {
    if (!shown(h)) continue
    const hr = h.getBoundingClientRect()
    let row = h.parentElement, line = null
    for (let i = 0; i < 4 && row && !line; i++, row = row.parentElement) {
      const cs = getComputedStyle(row)
      if (!cs.display.includes('flex') || cs.flexDirection.startsWith('column')) continue
      const same = [...row.querySelectorAll('button, [role=radio]')].filter((b) => !h.contains(b) && shown(b)).filter((b) => {
        const r = b.getBoundingClientRect()
        return r.top < hr.bottom && r.bottom > hr.top
      })
      if (same.length) line = same
    }
    if (!line) continue
    const center = hr.top + hr.height / 2
    const worst = Math.max(...line.map((b) => { const r = b.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - center) }))
    out.push({ title: h.textContent.trim().slice(0, 40), worst })
  }
  return JSON.stringify(out)
})()`

test('heading titles and their buttons share one vertical center', { timeout: 120000 }, async (t) => {
  if (!url || !chrome) return t.skip('set AVOOZL_UI_URL and AVOOZL_CHROME')
  const port = 9400 + Math.floor(Math.random() * 400)
  const profile = mkdtempSync(path.join(tmpdir(), 'avoozl-align-'))
  const proc = spawn(chrome, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--headless', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  t.after(() => proc.kill('SIGKILL'))
  let targets = []
  for (let i = 0; i < 50 && !targets.length; i++) {
    try {
      targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((x) => x.type === 'page')
    } catch {}
    if (!targets.length) await sleep(200)
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve))
  t.after(() => ws.close())
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id)
  })
  const send = (method, params = {}) => new Promise((resolve) => (pending.set(++id, resolve), ws.send(JSON.stringify({ id, method, params }))))
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
  const off = []
  let measured = 0
  for (const width of [375, 768, 1280])
    for (const tab of ['flow', 'plans', 'conflicts', 'delivery']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 3400, deviceScaleFactor: 1, mobile: false })
      await send('Page.navigate', { url: `${url}/index.html?theme=light` })
      await sleep(1200)
      await evaluate(`document.querySelector('[data-seg=${tab}]')?.click()`)
      await sleep(900)
      for (const row of JSON.parse((await evaluate(MEASURE)) ?? '[]')) {
        measured += 1
        if (row.worst > 1) off.push(`${tab} at ${width}px: "${row.title}" is ${row.worst.toFixed(1)}px off its buttons`)
      }
    }
  assert.ok(measured > 0, 'found heading rows with buttons')
  assert.deepEqual(off, [])
})
