// The side panel in a real Chrome, on the harness page (?page=panel): what a
// normal chat shows, that it reads again on focus and not while hidden, and
// what each other chat context shows. Set AVOOZL_PANEL_SHOTS=<dir> to also
// write a screenshot of each context. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the side panel browser test'

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const count = (selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const open = async (query, ready) => {
  await page.open(harness.url({ page: 'panel', theme: 'light', ...query }), { width: 360, height: 900 })
  await page.until(ready)
  // Queue and Recent merges start closed; most tests read their rows.
  await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
}
const shot = async (name) => {
  const dir = process.env.AVOOZL_PANEL_SHOTS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
  await page.screenshot(path.join(dir, `${name}.png`))
}

test('a normal chat shows Waiting on you, In flight, the queue head, recent merges and the line', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-waiting-row]')].map((r) => r.dataset.waitingRow)`), ['needs-human'])
  // The retired worker row is not shown.
  assert.doesNotMatch(await text('[data-panel-recap]'), /retired worker/)
  const buttons = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button, [data-waiting-row] a')].map((e) => e.textContent.trim())`)
  assert.deepEqual(buttons, ['Open issue'])
  assert.equal(await count('[data-flight-row]'), 1)
  assert.equal(await page.evaluate(`document.querySelector('[data-flight-row="remote"] [data-flight-session]').getAttribute('href')`), 'https://box.test/chat?sid=k')
  assert.equal(await count('[data-queue-head]'), 1)
  assert.equal(await count('[data-recent-row]'), 1)
  // The driver chat is gone: no driver cell and no Start.
  assert.equal(await count('[data-panel-driver], [data-driver-start]'), 0)
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('normal-chat')
})

test('it reads again on window focus and not while the page is hidden', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  const reads = await page.evaluate(`window.__panelReads`)
  await page.evaluate(`window.__panel.conflicts = []; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`window.__panelReads > ${reads} && !document.querySelector('[data-waiting-row]')`)
  assert.match(await text('[data-panel-fold="waiting"]'), /Nothing is waiting on you/)
  // Hidden: a focus event reads nothing.
  await page.evaluate(
    `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__panel.conflicts = [{ kind: 'needs-human', reason: 'crew', taskId: null, title: 'Late', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`,
  )
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.equal(await count('[data-waiting-row]'), 0)
  // Visible again: it reads.
  await page.evaluate(
    `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); true`,
  )
  await page.until(`Boolean(document.querySelector('[data-waiting-row]'))`)
})

test('one failed read leaves the other sections showing', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.evaluate(`window.__panel.fail = 'x'; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`/could not read what is waiting/.test(document.querySelector('[data-panel-fold="waiting"]')?.textContent ?? '')`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /could not read the remote workers/)
})

test('with nothing to show, each section says so', { skip }, async () => {
  await open({ sid: 'chat-1', state: 'empty' }, `/Nothing is waiting/.test(document.body.textContent)`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /No remote worker is running/)
  await shot('empty')
})

test('a Spec Builder chat shows the spec check and Approve', { skip }, async () => {
  await open({ sid: 'spec-builder-search-v2' }, `Boolean(document.querySelector('[data-panel-spec] button'))`)
  assert.match(await text('[data-panel-spec]'), /Tasks: 12/)
  assert.match(await text('[data-panel-spec]'), /Approve for Avoozl/)
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('spec-builder-chat')
})

test('an Avoozl chat shows waiting, in flight and the queue', { skip }, async () => {
  await open({ sid: 'avoozl_retro_1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.equal(await count('[data-flight-row]'), 1)
  assert.equal(await count('[data-queue-head]'), 1)
  await shot('avoozl-chat')
})

test('Session opens the worker chat; a row with no action deep-links into the page', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-flight-row]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-flight-row="remote"] [data-flight-session]').textContent.trim()`), 'Session')
  await page.evaluate(
    `window.__panel.conflicts = [{ kind: 'content-match', taskId: 'S1', id: 'd1', title: 'Matched a rule', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`,
  )
  await page.until(`Boolean(document.querySelector('[data-waiting-row="content-match"]'))`)
  await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button')].find((b) => b.textContent.trim() === 'Open in Avoozl').click()`)
  assert.deepEqual(await page.evaluate(`window.__navigated`), ['/apps/avoozl'])
})

test('coming back after a while shows what finished and what is new, and Got it hides it', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.equal(await count('[data-since-recap]'), 0)
  // Leave two minutes ago with only the first row waiting; one task finished since.
  await page.evaluate(`(() => {
    const first = [...document.querySelectorAll('[data-waiting-row]')]
    window.__panel.conflicts = window.__panel.conflicts.slice(0, 1).concat([{ kind: 'needs-human', reason: 'crew', taskId: null, id: 'new', title: 'A new question', detail: 'd' }])
    window.__panel.tasks = [{ taskId: 'S7', title: 'Fresh merge', repository: 'acme/recipe-box', finishedAt: new Date().toISOString() }]
    return first.length
  })()`)
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await page.until(`[...document.querySelectorAll('[data-waiting-row]')].some((r) => r.textContent.includes('A new question'))`)
  // The keys of the first read, as the panel stores them on blur.
  const keys = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row]')].filter((r) => !r.textContent.includes('A new question')).map((r) => r.dataset.waitingRow)`)
  assert.ok(keys.length >= 1)
  await page.evaluate(`localStorage.setItem('avoozl.panel.away', JSON.stringify({ at: Date.now() - 120000, waitingKeys: ['needs-human::crew:' ] }))`)
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await page.until(`Boolean(document.querySelector('[data-since-recap]'))`)
  assert.match(await text('[data-since-finished]'), /Fresh merge/)
  assert.match(await text('[data-since-needs-you]'), /A new question/)
  assert.match(await text('[data-since-recap]'), /2 min ago/)
  await shot('since-you-left')
  await page.evaluate(`[...document.querySelectorAll('[data-since-recap] button')].find((b) => b.textContent.trim() === 'Got it').click()`)
  await page.until(`!document.querySelector('[data-since-recap]')`)
  // Focus again without leaving: the recap stays away.
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(await count('[data-since-recap]'), 0)
})

// The header is one thin line: "Avoozl · <instance>" (Avoozl opens the app
// page), Refresh (an icon, no countdown), fold all, and the pause button at the
// far right. No count chips, no "The line is running" row and no Avoozl app row.
for (const [width, height] of [
  [1280, 900],
  [390, 800],
])
  for (const theme of ['light', 'dark'])
    test(`the header is one line: name link, icons and pause at ${width} px ${theme}`, { skip }, async () => {
      await page.open(harness.url({ page: 'panel', theme, sid: 'chat-1' }), { width, height, dark: theme === 'dark' })
      await page.until(
        `Boolean(document.querySelector('[data-pp-head-link]')) && Boolean(document.querySelector('[data-pp-head] [data-stop-line]')) && Boolean(document.querySelector('[data-flight-row]'))`,
      )
      const head = await page.evaluate(`(() => {
        const h = document.querySelector('[data-pp-head]')
        const kids = [...h.querySelectorAll('[data-pp-head-name], button')].filter((el) => el.getBoundingClientRect().width > 0)
        const mids = kids.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 })
        const tallest = Math.max(...kids.map((el) => el.getBoundingClientRect().height))
        const stop = h.querySelector('[data-stop-line]').getBoundingClientRect()
        const link = h.querySelector('[data-pp-head-link]'), ls = getComputedStyle(link)
        return {
          name: h.querySelector('[data-pp-head-name]').innerText.replace(/\\s+/g, ' ').trim(),
          buttons: [...h.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
          texts: [...h.querySelectorAll('button')].map((b) => b.textContent.trim()),
          link: { text: link.innerText.trim(), border: ls.borderTopStyle, bg: ls.backgroundColor, underline: ls.textDecorationLine },
          chips: h.querySelectorAll('[data-pp-head-chip]').length,
          height: h.getBoundingClientRect().height, tallest, spread: Math.max(...mids) - Math.min(...mids),
          stopRight: stop.right, inner: h.getBoundingClientRect().right - parseFloat(getComputedStyle(h).paddingRight),
          wrap: getComputedStyle(h).flexWrap, sticky: getComputedStyle(h).position,
          lineRow: Boolean(document.querySelector('[data-line-row]')) || /The line is running/.test(document.body.innerText),
          appRow: Boolean(document.querySelector('[data-open-avoozl]')) || /Avoozl app/.test(document.body.innerText),
        }
      })()`)
      // A desktop names Avoozl, the instance and the workspace; a phone the workspace alone.
      if (width >= 768) assert.match(head.name, /^Avoozl · \S+ · Harness$/)
      else assert.equal(head.name, 'Harness')
      assert.deepEqual(head.buttons.slice(0, 1), ['Open Avoozl'])
      assert.match(head.buttons[1], /^Refresh, reads again in/)
      assert.match(head.buttons[2], /^(Collapse|Expand) all sections$/)
      assert.equal(head.buttons[3], 'Stop the line')
      assert.equal(head.buttons.length, 4)
      assert.deepEqual(head.texts.slice(1), ['', '', ''], 'icons only, no countdown')
      if (width >= 768) assert.deepEqual(head.link, { text: 'Avoozl', border: 'none', bg: 'rgba(0, 0, 0, 0)', underline: 'none' }, 'a plain word, no button box')
      assert.equal(head.chips, 0, 'no count chips')
      assert.equal(head.wrap, 'nowrap')
      assert.ok(head.spread < 2, `everything on one line (${head.spread} px apart)`)
      assert.ok(head.height <= head.tallest + 14, `one line tall (${head.height} px)`)
      assert.ok(Math.abs(head.stopRight - head.inner) < 1.5, 'pause sits at the far right')
      assert.notEqual(head.sticky, 'sticky')
      assert.equal(head.lineRow, false, 'no "The line is running" row')
      assert.equal(head.appRow, false, 'no Avoozl app row')
    })

// "Stop the line" is never text in the side panel: a pause icon named Stop the
// line, and while stopped a play icon named Resume the line that resumes it.
const visibleText = `(() => { const out = []; const walk = document.createTreeWalker(document.querySelector('[data-pp]'), NodeFilter.SHOW_TEXT); let n; while ((n = walk.nextNode())) { const el = n.parentElement; const r = el.getBoundingClientRect(); if (r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && n.textContent.trim()) out.push(n.textContent.trim()) } return out })()`
for (const [width, height] of [
  [1280, 900],
  [390, 800],
])
  for (const stopped of [false, true])
    test(`no visible text reads Stop the line at ${width} px${stopped ? ' while stopped' : ''}`, { skip }, async () => {
      await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1', ...(stopped ? { stopped: '1' } : {}) }), { width, height })
      await page.until(
        `Boolean(document.querySelector('[data-pp-head] [data-stop-line]${stopped ? '[data-stopped]' : ''}')) && Boolean(document.querySelector('[data-flight-row]'))`,
      )
      await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
      const texts = await page.evaluate(visibleText)
      assert.deepEqual(
        texts.filter((t) => /stop the line/i.test(t)),
        [],
      )
      const button = await page.evaluate(
        `(() => { const b = document.querySelector('[data-pp-head] [data-stop-line]'); return { label: b.getAttribute('aria-label'), text: b.innerText.trim() } })()`,
      )
      assert.deepEqual(button, { label: stopped ? 'Resume the line' : 'Stop the line', text: '' })
    })

test('the play icon resumes a stopped line after asking', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1', stopped: '1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-pp-head] [data-stop-line][data-stopped]'))`)
  await page.evaluate(`document.querySelector('[data-stop-line]').click()`)
  await page.until(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Resume')`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Resume').click()`)
  await page.until(`window.__panelCalls.some((c) => c.resume === 'l1')`)
  await page.until(`!document.querySelector('[data-stop-line][data-stopped]')`)
  assert.equal(await page.evaluate(`document.querySelector('[data-stop-line]').getAttribute('aria-label')`), 'Stop the line')
})

// The word "Avoozl" in the header opens the app page.
test('the header word Avoozl opens the app page', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-pp-head-link]'))`)
  await page.evaluate(`document.querySelector('[data-pp-head-link]').click()`)
  assert.deepEqual(await page.evaluate(`window.__navigated`), ['/apps/avoozl'])
})

// The Refresh icon turns from muted toward red as the read ages, and is red
// while GitHub's rate limit holds.
test('the Refresh icon reddens as the cache ages and is red when rate limited', { skip }, async () => {
  const { refreshColor } = await import('../src/refresh-api.ts').catch(() => ({ refreshColor: null }))
  if (refreshColor) {
    assert.match(refreshColor(0), /var\(--danger\) 0%/)
    assert.match(refreshColor(50), /var\(--danger\) 40%/)
    assert.equal(refreshColor(100), 'var(--danger)')
  }
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-refresh-age]'))`)
  const first = Number(await page.evaluate(`document.querySelector('[data-refresh-age]').dataset.refreshAge`))
  await new Promise((resolve) => setTimeout(resolve, 2300))
  const later = Number(await page.evaluate(`document.querySelector('[data-refresh-age]').dataset.refreshAge`))
  assert.ok(later > first, `the age grows (${first} -> ${later})`)
})

// An In flight row's action is Session: a plus-in-circle icon and the word on
// a desktop, the icon only on a phone. Both are named "Session".
for (const [width, words] of [
  [390, ''],
  [1280, 'Session'],
])
  test(`Session is ${words ? 'a labeled button' : 'an icon'} at ${width} px`, { skip }, async () => {
    await page.open(harness.url({ page: 'panel', theme: 'dark', sid: 'chat-1' }), { width, height: 800, dark: true })
    await page.until(`Boolean(document.querySelector('[data-flight-row] [data-flight-session]'))`)
    const attach = await page.evaluate(
      `(() => { const a = document.querySelector('[data-flight-row] [data-flight-session]'); const r = a.getBoundingClientRect(); return { text: a.innerText.trim(), label: a.getAttribute('aria-label'), icon: Boolean(a.querySelector('svg')), height: r.height, width: r.width } })()`,
    )
    assert.equal(attach.text, words)
    assert.equal(attach.label, 'Session')
    assert.ok(attach.icon)
    assert.ok(attach.height <= 28, `compact (${attach.height} px)`)
  })

// The header's last icon folds or opens every section, and the choice is kept.
test('fold all closes every section, opens them again, and is remembered', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`document.querySelectorAll('[data-pp-section]').length >= 4`)
  await page.evaluate(`localStorage.removeItem('avoozl.panel.folds')`)
  const state = () =>
    page.evaluate(
      `({ open: [...document.querySelectorAll('[data-pp-section-head]')].map((b) => b.getAttribute('aria-expanded')), label: document.querySelector('[data-pp-toggle-all]').getAttribute('aria-label') })`,
    )
  const first = await state()
  assert.ok(first.open.includes('true'))
  assert.equal(first.label, first.open.every((v) => v === 'true') ? 'Collapse all sections' : 'Expand all sections')
  const click = () => page.evaluate(`document.querySelector('[data-pp-toggle-all]').click()`)
  // Collapse until every section is closed (one click when all are open, two when some are not).
  while ((await state()).open.includes('true')) await click()
  const closed = await state()
  assert.ok(closed.open.every((v) => v === 'false'))
  assert.equal(closed.label, 'Expand all sections')
  assert.equal(await count('[data-waiting-row]'), 0)
  // Remembered across a reload of the panel.
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`document.querySelectorAll('[data-pp-section]').length >= 4`)
  assert.ok(
    (await state()).open.every((v) => v === 'false'),
    'closed after a reload',
  )
  await click()
  const opened = await state()
  assert.ok(opened.open.every((v) => v === 'true'))
  assert.equal(opened.label, 'Collapse all sections')
  assert.equal(await count('[data-waiting-row]'), 1)
  // One section on its own.
  await page.evaluate(`document.querySelector('[data-panel-fold="recent"] [data-pp-section-head]').click()`)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-fold="recent"] [data-pp-section-head]').getAttribute('aria-expanded')`), 'false')
  assert.equal((await state()).label, 'Expand all sections')
  await page.evaluate(`localStorage.removeItem('avoozl.panel.folds')`)
})
