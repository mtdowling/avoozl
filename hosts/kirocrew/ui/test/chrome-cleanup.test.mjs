// The test browser dies with the process that started it, even when that
// process is killed outright (a test timeout or SIGKILL). Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { test } from 'node:test'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the browser cleanup test'
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
const until = async (check, ms) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) return false
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return true
}

test('a killed test process takes its browser and profile with it', { skip }, async () => {
  const helper = new URL('./browser/chrome.mjs', import.meta.url).href
  const script = `const { launch } = await import(${JSON.stringify(helper)}); const b = await launch(${JSON.stringify(chrome)}); await b.page(); console.log(JSON.stringify({ pid: b.pid, profile: b.profile })); setInterval(() => {}, 1000)`
  const parent = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  const line = await new Promise((resolve, reject) => {
    let out = ''
    parent.stdout.on('data', (chunk) => {
      out += chunk
      if (out.includes('\n')) resolve(out.split('\n')[0])
    })
    parent.on('exit', () => reject(Error('the parent exited before the browser started')))
  })
  const { pid, profile } = JSON.parse(line)
  assert.ok(alive(pid), 'the browser is running')
  parent.kill('SIGKILL')
  assert.ok(await until(() => !alive(pid), 30000), 'the browser exits after its parent is killed')
  assert.ok(await until(() => !fs.existsSync(profile), 10000), 'the profile is removed')
})

test('close stops the browser and removes its profile', { skip }, async () => {
  const browser = await launch(chrome)
  await browser.page()
  await browser.close()
  assert.ok(await until(() => !alive(browser.pid), 5000), 'the browser is gone after close')
  assert.equal(fs.existsSync(browser.profile), false)
})
