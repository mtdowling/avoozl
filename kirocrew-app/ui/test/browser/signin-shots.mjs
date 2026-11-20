#!/usr/bin/env node
// Screenshots of the GitHub sign-in screens (plugin-credentials pc-4.3) on
// fake data (signin-fixture.ts): Settings › GitHub › GitHub calls with the
// sign-in lines and calls by login, Settings › Plugins with a credentials
// plugin's host line and Use this one, and the high-risk confirm. Desktop
// (1280 px) and phone (390 px), light and dark: <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/signin-shots.mjs <out dir>
import { saveShot, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('signin-shots.mjs <out dir>')
// Clicks the first element under `selector` whose text starts with `text`.
const tap = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return Boolean(b) })()`
const settingsGitHub = (phone) => [
  ...(phone ? [`document.querySelector('[data-top-rail-bar]')?.click()`] : []),
  tap(`${phone ? '[data-top-rail-list]' : '[data-left-nav]'} [data-nav-head]`, 'Settings'),
  tap(`${phone ? '[data-top-rail-list]' : '[data-left-nav]'} [data-nav-item]`, 'GitHub'),
  tap('button, [role=tab]', 'GitHub calls'),
]
const SHOTS = [
  ['signin-github-calls', { page: 'app', basic: '1', roles: 'plans' }, settingsGitHub],
  ['signin-plugins', { page: 'intake' }, () => []],
  ['signin-confirm', { page: 'needs' }, () => [tap('button', 'Needs you'), tap('button', 'Create labels')]],
]
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 500))')
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, params, steps] of SHOTS) {
        await page.open(harness.url({ ...params, signin: '1', theme }), { width, height: 900, dark: theme === 'dark' })
        await settle()
        for (const step of steps(width < 768)) {
          await page.evaluate(step)
          await settle()
        }
        await saveShot(page, out, name, width, theme)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}
