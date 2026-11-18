// Takes the nav footer and the open modal in the full app shell, desktop and
// phone, light and dark. Run from kirocrew-app/ui with AVOOZL_CHROME set:
//   node ../../docs/evidence/instance-name-modal/shoot.mjs
import { buildHarness } from '../../../kirocrew-app/ui/test/browser/build.mjs'
import { findChrome, launch } from '../../../kirocrew-app/ui/test/browser/chrome.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Outside git: <repo>/.avoozl-shots/instance-name-modal.
const out = fileURLToPath(new URL('../../../.avoozl-shots/instance-name-modal', import.meta.url))
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness()
const browser = await launch(findChrome())
const page = await browser.page()
const MODAL = `document.querySelector('[data-modal="avoozl-instance-name"]')`
for (const dark of [false, true])
  for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 390, 800]]) {
    const tag = `${name}-${dark ? 'dark' : 'light'}`
    await page.open(harness.url({ page: 'app', radar: '1', theme: dark ? 'dark' : 'light' }), { width, height, dark })
    let scope = '[data-left-nav] '
    if (width < 768) {
      await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
      await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      scope = '[data-top-rail-footer] '
    }
    await page.until(`Boolean(document.querySelector('${scope}[data-instance-edit]'))`)
    await page.evaluate(`document.querySelector('${scope}[data-instance-edit]').scrollIntoView()`)
    await page.screenshot(path.join(out, `${tag}-footer.png`))
    await page.evaluate(`document.querySelector('${scope}[data-instance-edit]').click()`)
    await page.until(`Boolean(${MODAL})`)
    await page.screenshot(path.join(out, `${tag}-modal.png`))
    await page.evaluate(`(() => { const i = ${MODAL}.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'bad/name'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await page.until(`${MODAL}.innerText.includes('1 to 24 letters')`)
    await page.screenshot(path.join(out, `${tag}-invalid.png`))
  }
await browser.close()
harness.remove()
