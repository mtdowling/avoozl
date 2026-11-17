#!/usr/bin/env node
// Two screenshots' left 340 px side by side, each under a caption, as one
// PNG: node test/browser/side-by-side.mjs <out.png> <left.png> <left caption> <right.png> <right caption>
// AVOOZL_CHROME names the browser.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { findChrome, launch } from './chrome.mjs'

const [out, left, leftCaption, right, rightCaption] = process.argv.slice(2)
if (!rightCaption) {
  console.error('Usage: side-by-side.mjs <out.png> <left.png> <left caption> <right.png> <right caption>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
const esc = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const image = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
const pane = (file, caption) => `<figure><figcaption>${esc(caption)}</figcaption><div class="crop"><img src="${image(file)}"></div></figure>`
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-sbs-'))
const html = path.join(dir, 'index.html')
fs.writeFileSync(
  html,
  `<!doctype html><style>body{margin:0;background:#111;display:flex;gap:16px;padding:16px;font:13px system-ui;color:#ccc}figure{margin:0}figcaption{margin-bottom:8px}.crop{width:340px;height:800px;overflow:hidden}img{display:block}</style>${pane(left, leftCaption)}${pane(right, rightCaption)}`,
)
const browser = await launch(chrome)
try {
  const page = await browser.page()
  await page.open(pathToFileURL(html).href, { width: 732, height: 856 })
  await page.evaluate(`new Promise((r) => setTimeout(r, 300))`)
  await page.screenshot(out)
  console.log(out)
} finally {
  await browser.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
