// Synthetic screenshot fixtures only; never contacts a workspace or gateway.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const output = process.argv[2], hostCss = process.env.AVOOZL_CAPTURE_HOST_CSS
if (!output || !hostCss) throw Error('Provide an output directory and AVOOZL_CAPTURE_HOST_CSS pointing to the installed host stylesheet.')
fs.mkdirSync(output, { recursive: true })
const harness = await buildHarness({ hostCss, entry: fileURLToPath(new URL('./ci-flow.tsx', import.meta.url)) })
const browser = await launch(findChrome())
try {
  const page = await browser.page()
  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) for (const screen of ['flow', 'settings']) {
    await page.open(harness.url({ screen, theme }), { width, height: 900, dark: theme === 'dark' })
    await page.until(screen === 'settings' ? `Boolean(document.querySelector('[data-flow-settings]'))` : `document.body.textContent.includes('No timing yet')`)
    const file = path.join(output, `${screen}-${width}-${theme}.png`)
    await page.screenshot(file, { selector: '[data-ci-screenshot]' })
    const detail = screen === 'settings' ? '[data-ci-settings]' : '[data-flow-ci]'
    if (await page.evaluate(`Boolean(document.querySelector('${detail}'))`)) await page.screenshot(file.replace('.png', '-detail.png'), { selector: detail })
    if (await page.evaluate('document.documentElement.scrollWidth > innerWidth')) throw Error(`Horizontal overflow at ${screen} ${width} ${theme}`)
    if (page.errors.length) throw Error(page.errors.join('\n'))
  }
} finally {
  await browser.close()
  harness.remove()
}
