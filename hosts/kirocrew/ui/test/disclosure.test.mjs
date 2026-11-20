// Every part of the page that opens and shuts uses the one disclosure
// (src/ui/Disclosure.tsx): its toggle carries data-disclosure and starts
// with the chevron mark. In the source, no view draws its own arrow or
// turn. In a real Chrome, on every nav page of the app harness, each
// <summary> and each in-page aria-expanded toggle uses it, and the mark
// turns when it opens. The browser part is skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { harnessPage } from './browser/harness-page.mjs'

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const files = fs.readdirSync(src, { recursive: true }).filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))

test('no view draws its own disclosure arrow or turn', () => {
  const own = []
  for (const file of files) {
    if (file === path.join('ui', 'Disclosure.tsx')) continue
    const text = fs.readFileSync(path.join(src, file), 'utf8')
    for (const [pattern, what] of [
      [/rotate\(90deg\)|rotate-90deg/, 'a turned chevron'],
      [/ChevronDown\s*:\s*ChevronRight|ChevronRight\s*:\s*ChevronDown/, 'a swapped chevron'],
      // A table's sort arrow (▲ ▼) is not a disclosure; a shut arrow is.
      [/[▸▹▶]/, 'a text arrow'],
    ])
      if (pattern.test(text)) own.push(`${file}: ${what}`)
    // Each summary is the shared toggle.
    for (const match of text.matchAll(/<(?:summary|\w+ as="summary")\b[^>]*>/g)) if (!match[0].includes('DISCLOSURE')) own.push(`${file}: ${match[0]}`)
  }
  assert.deepEqual(own, [])
})

const state = harnessPage('disclosure')
const skip = state.skip

// Toggles that open a menu, a list box or the phone menu are not
// disclosures: they have their own look (aria-haspopup, a combobox, the
// rail and top bar buttons, the folder browser, the graph's group labels).
const AUDIT = `(() => {
  const menu = '[aria-haspopup], [role=combobox], [data-top-rail-bar], [data-rail-icon], [data-folder-browse], svg *'
  const bad = []
  const name = (el) => el.outerHTML.slice(0, 120)
  for (const el of document.querySelectorAll('summary')) if (!el.matches('[data-disclosure]') || !el.querySelector('[data-disclosure-mark]')) bad.push(name(el))
  for (const el of document.querySelectorAll('[aria-expanded]')) {
    if (el.matches(menu)) continue
    if (!el.querySelector('[data-disclosure-mark]') || !(el.matches('[data-disclosure]') || el.matches('[data-nav-head]'))) bad.push(name(el))
  }
  return { bad, seen: document.querySelectorAll('summary, [aria-expanded]').length }
})()`

const settle = () => state.page.evaluate('new Promise((r) => setTimeout(r, 300))')

test('every nav page uses the shared disclosure for each toggle', { skip, timeout: 120000 }, async () => {
  const { page, harness } = state
  await page.open(harness.url({ page: 'app', theme: 'light', roles: 'single', ghfull: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await settle()
  const heads = await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-head]')].map((b) => b.textContent.trim())`)
  assert.ok(heads.length >= 4, `nav heads: ${heads}`)
  const bad = new Set()
  let pages = 0
  let seen = 0
  const audit = async (where) => {
    const result = await page.evaluate(AUDIT)
    for (const el of result.bad) bad.add(`${where}: ${el}`)
    seen += result.seen
    pages++
  }
  for (const head of heads) {
    await page.evaluate(
      `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.trim() === ${JSON.stringify(head)}); if (b && !b.hasAttribute('data-open')) b.click() })()`,
    )
    await settle()
    await audit(head)
    const items = await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-children] [data-nav-item]')].map((b) => b.textContent.trim())`)
    for (const item of items) {
      await page.evaluate(
        `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-children] [data-nav-item]')].find((x) => x.textContent.trim() === ${JSON.stringify(item)}); if (b) b.click() })()`,
      )
      await settle()
      await audit(`${head} > ${item}`)
    }
  }
  assert.ok(pages > heads.length, `walked ${pages} pages`)
  assert.ok(seen > 0, 'saw toggles')
  assert.deepEqual([...bad], [])
})

test('How rules work shows a chevron that turns when it opens', { skip, timeout: 60000 }, async () => {
  const { page, harness } = state
  await page.open(harness.url({ page: 'app', theme: 'dark', roles: 'single', ghfull: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await settle()
  await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings'))?.click()`)
  await settle()
  await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-item]')].find((x) => x.textContent.trim() === 'Content rules')?.click()`)
  await page.until(`Boolean(document.querySelector('[data-rules-help]'))`)
  const look = () =>
    page.evaluate(`(() => {
      const summary = document.querySelector('[data-rules-help] > summary')
      const mark = summary.querySelector('[data-disclosure-mark]')
      return { cursor: getComputedStyle(summary).cursor, transform: getComputedStyle(mark).transform, tab: summary.tabIndex }
    })()`)
  const shut = await look()
  assert.equal(shut.cursor, 'pointer')
  assert.equal(shut.transform, 'none')
  await page.evaluate(`document.querySelector('[data-rules-help] > summary').click()`)
  await settle()
  assert.notEqual((await look()).transform, 'none', 'the open chevron points down')
})
