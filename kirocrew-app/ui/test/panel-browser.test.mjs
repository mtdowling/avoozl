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
  assert.equal(await page.evaluate(`document.querySelector('[data-head-needs]').getAttribute('aria-label')`), 'Needs me: 2')
  assert.equal(await page.evaluate(`document.querySelector('[data-head-flight]').getAttribute('aria-label')`), 'In flight: 3')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-waiting-row]')].map((r) => r.dataset.waitingRow)`), ['needs-human', 'github-conflict'])
  // The retired worker row is not shown.
  assert.doesNotMatch(await text('[data-panel-recap]'), /retired worker/)
  const buttons = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button, [data-waiting-row] a')].map((e) => e.textContent.trim())`)
  assert.deepEqual(buttons, ['Open issue', "Keep Avoozl's", "Keep GitHub's"])
  assert.equal(await count('[data-flight-row]'), 3)
  assert.equal(await page.evaluate(`document.querySelector('[data-flight-row="radar"] a[href^="/chat"]').getAttribute('href')`), '/chat?sid=crew-abc')
  assert.equal(await count('[data-queue-head]'), 1)
  assert.equal(await count('[data-recent-row]'), 1)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver] [data-driver-start]').getAttribute('aria-label')`), 'Start a driver session')
  assert.match(await page.evaluate(`document.querySelector('[data-panel-driver] [data-sc-title]').innerText`), /^Driver: not started/)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.panelDriver`), 'none')
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('normal-chat')
})

test('Keep Avoozl\'s writes the choice and reads again', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button')].find((b) => b.textContent.trim() === "Keep Avoozl's").click()`)
  await page.until(`window.__panelCalls.length === 1`)
  assert.deepEqual(await page.evaluate(`window.__panelCalls[0]`), { taskId: 'S8', field: 'title', choice: 'desired' })
})

test('it reads again on window focus and not while the page is hidden', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  const reads = await page.evaluate(`window.__panelReads`)
  await page.evaluate(`window.__panel.conflicts = []; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`window.__panelReads > ${reads} && !document.querySelector('[data-waiting-row]')`)
  assert.match(await text('[data-panel-fold="waiting"]'), /Nothing is waiting on you/)
  // Hidden: a focus event reads nothing.
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__panel.conflicts = [{ kind: 'needs-human', reason: 'crew', taskId: null, title: 'Late', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`)
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.equal(await count('[data-waiting-row]'), 0)
  // Visible again: it reads.
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); true`)
  await page.until(`Boolean(document.querySelector('[data-waiting-row]'))`)
})

test('one failed read leaves the other sections showing', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.evaluate(`window.__panel.fail = 'x'; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`/could not read what is waiting/.test(document.querySelector('[data-panel-fold="waiting"]')?.textContent ?? '')`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /could not read the crews/)
})

test('with nothing to show, each section says so', { skip }, async () => {
  await open({ sid: 'chat-1', state: 'empty' }, `/Nothing is waiting/.test(document.body.textContent)`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /No crew has a claim/)
  assert.equal(await page.evaluate(`document.querySelector('[data-head-needs]').getAttribute('aria-label')`), 'Needs me: 0')
  // A zero stays in the row, muted: the hand is no longer yellow.
  assert.equal(await page.evaluate(`document.querySelector('[data-head-needs]').hasAttribute('data-zero') && getComputedStyle(document.querySelector('[data-head-needs] [data-pp-hand]')).color === (() => { const t = document.createElement('i'); t.style.color = 'var(--muted)'; document.querySelector('[data-pp]').append(t); const c = getComputedStyle(t).color; t.remove(); return c })()`), true)
  assert.equal(await page.evaluate(`document.querySelector('[data-head-flight]').getAttribute('aria-label')`), 'In flight: 0')
  await shot('empty')
})

test('a Spec Builder chat shows the spec check and Approve', { skip }, async () => {
  await open({ sid: 'spec-builder-search-v2' }, `Boolean(document.querySelector('[data-panel-spec] button'))`)
  assert.match(await text('[data-panel-spec]'), /Tasks: 12/)
  assert.match(await text('[data-panel-spec]'), /Approve for Avoozl/)
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('spec-builder-chat')
})

test('a crew chat shows its claim, rail and links', { skip }, async () => {
  await open({ sid: 'crew-abc' }, `Boolean(document.querySelector('[data-panel-crew] [data-rail]'))`)
  assert.match(await text('[data-panel-crew]'), /acme\/recipe-box#52 Index builder: CI, PR #57/)
  assert.equal(await count('[data-rail-step]'), 5)
  assert.match(await text('[data-panel-crew]'), /PR #57/)
  await shot('crew-chat')
})

test('an Avoozl chat shows the driver view with waiting, in flight and the queue', { skip }, async () => {
  await open({ sid: 'avoozl_driver_1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.equal(await count('[data-panel-driver]'), 1)
  assert.equal(await count('[data-flight-row]'), 3)
  assert.equal(await count('[data-queue-head]'), 1)
  await shot('avoozl-chat')
})

const driverButtons = `[...document.querySelectorAll('[data-panel-driver] a, [data-panel-driver] button')].map((e) => e.getAttribute('aria-label')).filter((label) => label !== 'Recheck')`

test('a driver session that checked in shows a link and no Start', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'running' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'running'`)
  assert.deepEqual(await page.evaluate(driverButtons), ['Open driver session'])
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver] a').getAttribute('href')`), '/chat?sid=chat-7-1')
  assert.match(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.tip`), /Last seen 5 min ago/)
  await shot('driver-running')
})

test('a quiet driver keeps its link and offers a new one', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'idle' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'idle'`)
  assert.deepEqual(await page.evaluate(driverButtons), ['Open driver session', 'Start a new driver session'])
})

test('an unreadable driver offers no Start, so a second one is never opened by mistake', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'unknown' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'unknown'`)
  assert.deepEqual(await page.evaluate(driverButtons), [])
})

test('Start opens the avoozl-driver agent with its first message and nothing else', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-driver-start]'))`)
  assert.equal(await page.evaluate(`(window.__chats ?? []).length`), 0)
  await page.evaluate(`document.querySelector('[data-driver-start]').click()`)
  const chats = await page.evaluate(`window.__chats`)
  assert.equal(chats.length, 1)
  assert.equal(chats[0].agent, 'avoozl-driver')
  assert.equal(chats[0].autoSend, true)
  assert.match(chats[0].message, /do not merge/i)
})

test('the driver chat itself shows the driver, waiting and in flight views', { skip }, async () => {
  await open({ sid: 'chat-7-1', driver: 'running' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-kind]')?.dataset.panelKind === 'avoozl'`)
  assert.equal(await count('[data-flight-row]'), 3)
})

test('Session opens the crew chat; a row with no action deep-links into the page', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-flight-row]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-flight-row="radar"] a[href^="/chat"]').textContent.trim()`), 'Session')
  await page.evaluate(`window.__panel.conflicts = [{ kind: 'content-match', taskId: 'S1', id: 'd1', title: 'Matched a rule', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`)
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

// The header is one thin line: "Avoozl · <instance>", Refresh (an icon, no
// countdown), fold all, "2 needs you" and "3 in flight", and the pause button at
// the far right. Desktop chips show their words; a phone shows icons and counts.
// No "The line is running" row is left. Open Avoozl stays in the driver section.
for (const [width, height] of [[1280, 900], [390, 800]])
  for (const theme of ['light', 'dark'])
    test(`the header is one line: name, icons, chips and pause at ${width} px ${theme}`, { skip }, async () => {
      await page.open(harness.url({ page: 'panel', theme, sid: 'chat-1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-head-needs]')) && Boolean(document.querySelector('[data-pp-head] [data-stop-line]'))`)
      const head = await page.evaluate(`(() => {
        const h = document.querySelector('[data-pp-head]')
        const kids = [...h.querySelectorAll('[data-pp-head-name], button')]
        const mids = kids.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 })
        const tallest = Math.max(...kids.map((el) => el.getBoundingClientRect().height))
        const stop = h.querySelector('[data-stop-line]').getBoundingClientRect()
        const right = Math.max(...kids.filter((el) => !el.closest('[data-panel-line]')).map((el) => el.getBoundingClientRect().right))
        return {
          name: h.querySelector('[data-pp-head-name]').textContent.trim(),
          buttons: [...h.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
          mutedWords: [...h.querySelectorAll('[data-pp-head-chip]')].every((c) => { const m = (() => { const t = document.createElement('i'); t.style.color = 'var(--muted)'; document.querySelector('[data-pp]').append(t); const c = getComputedStyle(t).color; t.remove(); return c })(); return getComputedStyle(c).color === m && getComputedStyle(c.querySelector('[data-pp-head-chip-count]')).color === m }),
          flat: [...h.querySelectorAll('[data-pp-head-chip]')].every((c) => getComputedStyle(c).borderTopStyle === 'none' && getComputedStyle(c).backgroundColor === 'rgba(0, 0, 0, 0)'),
          texts: [...h.querySelectorAll('button')].map((b) => b.textContent.trim()),
          chips: [...h.querySelectorAll('[data-pp-head-chip]')].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()),
          height: h.getBoundingClientRect().height, tallest, spread: Math.max(...mids) - Math.min(...mids),
          stopRight: stop.right, stopLeft: stop.left, right, inner: h.getBoundingClientRect().right - parseFloat(getComputedStyle(h).paddingRight),
          wrap: getComputedStyle(h).flexWrap, sticky: getComputedStyle(h).position,
          lineRow: Boolean(document.querySelector('[data-line-row]')) || /The line is running/.test(document.body.innerText),
          open: document.querySelector('[data-open-avoozl]').textContent.trim(),
        }
      })()`)
      assert.match(head.name, /^Avoozl · \S/)
      assert.equal(head.buttons.length, 5)
      assert.match(head.buttons[0], /^Refresh, reads again in/)
      assert.match(head.buttons[1], /^(Collapse|Expand) all sections$/)
      assert.deepEqual(head.buttons.slice(2), ['Needs me: 2', 'In flight: 3', 'Stop the line'])
      assert.deepEqual([head.texts[0], head.texts[1], head.texts[4]], ['', '', ''], 'icons only, no countdown')
      assert.deepEqual(head.chips, width > 640 ? ['Needs me 2', 'In flight 3'] : ['2', '3'])
      assert.ok(head.flat, 'chips sit flat: no box, no fill')
      assert.ok(head.mutedWords, 'the words and counts are muted')
      assert.equal(head.wrap, 'nowrap')
      assert.ok(head.spread < 2, `everything on one line (${head.spread} px apart)`)
      assert.ok(head.height <= head.tallest + 14, `one line tall (${head.height} px)`)
      assert.ok(Math.abs(head.stopRight - head.inner) < 1.5 && head.stopLeft > head.right, 'pause sits at the far right')
      assert.notEqual(head.sticky, 'sticky')
      assert.equal(head.lineRow, false, 'no "The line is running" row')
      assert.equal(head.open, 'Open Avoozl')
    })

// A header chip opens its section and scrolls to it.
test('a header chip opens its section', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-head-flight]'))`)
  await page.evaluate(`localStorage.setItem('avoozl.panel.folds', JSON.stringify({ 'in-flight': false }))`)
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-head-flight]'))`)
  assert.equal(await count('[data-flight-row]'), 0)
  await page.evaluate(`document.querySelector('[data-head-flight]').click()`)
  await page.until(`document.querySelectorAll('[data-flight-row]').length === 3`)
  await page.evaluate(`localStorage.removeItem('avoozl.panel.folds')`)
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
for (const [width, words] of [[390, ''], [1280, 'Session']])
  test(`Session is ${words ? 'a labeled button' : 'an icon'} at ${width} px`, { skip }, async () => {
    await page.open(harness.url({ page: 'panel', theme: 'dark', sid: 'chat-1' }), { width, height: 800, dark: true })
    await page.until(`Boolean(document.querySelector('[data-flight-row] a[href^="/chat"]'))`)
    const attach = await page.evaluate(`(() => { const a = document.querySelector('[data-flight-row] a[href^="/chat"]'); const r = a.getBoundingClientRect(); return { text: a.innerText.trim(), label: a.getAttribute('aria-label'), icon: Boolean(a.querySelector('svg')), height: r.height, width: r.width } })()`)
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
  const state = () => page.evaluate(`({ open: [...document.querySelectorAll('[data-pp-section-head]')].map((b) => b.getAttribute('aria-expanded')), label: document.querySelector('[data-pp-toggle-all]').getAttribute('aria-label') })`)
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
  assert.ok((await state()).open.every((v) => v === 'false'), 'closed after a reload')
  await click()
  const opened = await state()
  assert.ok(opened.open.every((v) => v === 'true'))
  assert.equal(opened.label, 'Collapse all sections')
  assert.equal(await count('[data-waiting-row]'), 2)
  // One section on its own.
  await page.evaluate(`document.querySelector('[data-panel-fold="recent"] [data-pp-section-head]').click()`)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-fold="recent"] [data-pp-section-head]').getAttribute('aria-expanded')`), 'false')
  assert.equal((await state()).label, 'Expand all sections')
  await page.evaluate(`localStorage.removeItem('avoozl.panel.folds')`)
})

// The driver line names its workspace. In a chat that is another workspace's
// driver, the panel reads that workspace, not the one the app page last
// showed; in any other chat it says which workspace has a driver.
test('a Nupp driver chat\'s panel reads Nupp and shows it running', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-nupp', driver: 'nupp' }), { width: 390, height: 800 })
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'running'`)
  assert.match(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.tip`), /Workspace: Nupp\./)
  assert.equal(await count('[data-driver-elsewhere]'), 0)
})

test('another chat: "No driver for Harness. Nupp has one: Open", with the workspace name', { skip }, async () => {
  await page.open(harness.url({ page: 'panel', theme: 'light', sid: 'chat-1', driver: 'nupp' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-driver-elsewhere]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.panelDriver`), 'none')
  assert.match(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.tip`), /Workspace: Harness\. No driver for Harness\. Nupp has one:/)
  assert.equal(await page.evaluate(`document.querySelector('[data-driver-elsewhere]').getAttribute('aria-label')`), "Open Nupp's driver")
  assert.equal(await page.evaluate(`document.querySelector('[data-driver-elsewhere]').getAttribute('href')`), '/chat?sid=chat-nupp')
})
