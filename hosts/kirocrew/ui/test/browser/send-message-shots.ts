#!/usr/bin/env node
// Full-app screenshots of Send message on a `process` session (task 50.2) on
// fake data (harness ?page=app&process=1), desktop (1280) and phone (390),
// light and dark: <out>/send-<width>-<theme>.png. When the row has a Send
// message button, the shot shows a message just queued; on a build without
// it (a before shot), the row as it is.
//
//   node test/browser/send-message-shots.mjs <out dir>
import path from 'node:path'
import { startShots } from './shots.ts'

const { out, harness, browser } = await startShots('send-message-shots.mjs <out dir>')
const row = `[...document.querySelectorAll('[data-in-flight-row]')].find((r) => r.querySelector('[data-process-status]'))`
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', process: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
      await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 2`, 30000)
      if (await page.evaluate(`Boolean(${row}.querySelector('button[aria-label^="Send message"]'))`)) {
        await page.evaluate(`${row}.querySelector('button[aria-label^="Send message"]').click()`)
        await page.until(`Boolean(${row}.querySelector('[data-send-message] textarea'))`, 5000)
        await page.evaluate(`(() => {
          const area = ${row}.querySelector('[data-send-message] textarea')
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'Also cover the empty pantry.')
          area.dispatchEvent(new Event('input', { bubbles: true }))
        })()`)
        await page.until(`!${row}.querySelector('[data-send-submit]').disabled`, 5000)
        await page.evaluate(`${row}.querySelector('[data-send-submit]').click()`)
        await page.until(`${row}.querySelector('[data-send-state]').dataset.sendState === 'queued'`, 5000)
      }
      await page.evaluate(`[...document.querySelectorAll('h2, h3, [data-section-title]')].find((h) => h.textContent.startsWith('In flight ('))?.scrollIntoView({ block: 'start' })`)
      // The form sits low in the In flight card, which scrolls on its own.
      await page.evaluate(`document.querySelector('[data-send-message]')?.scrollIntoView({ block: 'nearest' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const file = path.join(out, `send-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}
