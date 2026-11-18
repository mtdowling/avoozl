// A headless Chrome driven over the DevTools protocol on a pipe (fds 3 and
// 4), so no debugging port is opened. Used by the modal tests and the
// screenshot script; no browser package is a dependency.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

// AVOOZL_CHROME names the browser (a Chrome for Testing or
// chrome-headless-shell build works too); else the usual install places.
export function findChrome() {
  const named = process.env.AVOOZL_CHROME
  if (named) return fs.existsSync(named) ? named : null
  return CANDIDATES.find((file) => fs.existsSync(file)) ?? null
}

const windows = process.platform === 'win32'

// Screenshots are never committed. Inside this repository they may only go
// to .avoozl-shots/ (gitignored); anywhere outside it, such as the temp
// folder, is fine.
const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
export function assertShotOutsideGit(file) {
  const full = path.resolve(file)
  const inside = path.relative(REPO, full)
  if (inside.startsWith('..') || path.isAbsolute(inside)) return
  if (inside.split(path.sep)[0] === '.avoozl-shots') return
  throw Error(`Screenshots stay outside git: write ${file} under .avoozl-shots/ or the temp folder.`)
}

// Runs beside the test process. When that process dies, even by SIGKILL or
// a test timeout, it kills the browser and its helpers and removes the
// profile. It exits on its own once the browser is gone while the test
// process lives.
const WATCHDOG = `
const [parent, browser, profile] = process.argv.slice(1)
const alive = (pid) => { try { process.kill(Number(pid), 0); return true } catch (error) { return error.code === 'EPERM' } }
const timer = setInterval(() => {
  const parentAlive = alive(parent)
  if (parentAlive && alive(browser)) return
  clearInterval(timer)
  // The test process is still there and removes the profile when it closes.
  if (parentAlive) process.exit()
  // The browser may already have quit when its pipe closed; its helpers and
  // the profile can still be left.
  try {
    if (process.platform === 'win32') require('node:child_process').spawnSync('taskkill', ['/pid', browser, '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-Number(browser), 'SIGKILL')
  } catch {}
  setTimeout(() => {
    try { require('node:fs').rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {}
    process.exit()
  }, 500)
}, 500)
`

// The browser and its helpers: a process group off Windows, a tree on it.
function killTree(pid) {
  try {
    if (windows) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

export async function launch(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-chrome-'))
  // AVOOZL_CHROME_NO_SANDBOX=1 for a host without a usable sandbox (no
  // unprivileged user namespaces). The page only loads the local harness.
  const noSandbox = process.getuid?.() === 0 || process.env.AVOOZL_CHROME_NO_SANDBOX === '1'
  // No extensions at all. Managed browser policy can force-install
  // extensions even into a fresh profile, and one that starts a native
  // helper app crashes that helper under a sandboxed test run.
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      ...(noSandbox ? ['--no-sandbox'] : []),
    ],
    // Its own process group, so one signal reaches every helper.
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], detached: !windows },
  )
  spawn(process.execPath, ['-e', WATCHDOG, String(process.pid), String(child.pid), profile], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  const onExit = () => killTree(child.pid)
  process.on('exit', onExit)
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  const input = child.stdio[3]
  const output = child.stdio[4]
  let id = 0
  let buffer = Buffer.alloc(0)
  const pending = new Map()
  const listeners = new Set()
  const gone = () => {
    const error = Error(`Chrome exited.\n${stderr}`)
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }
  child.on('exit', gone)
  input.on('error', gone)
  output.on('error', gone)
  output.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (let at = buffer.indexOf(0); at >= 0; at = buffer.indexOf(0)) {
      const message = JSON.parse(buffer.subarray(0, at).toString('utf8'))
      buffer = buffer.subarray(at + 1)
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(Error(`${message.error.message} (${message.error.code})`))
        else resolve(message.result)
      } else for (const listen of listeners) listen(message)
    }
  })
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
      pending.set(message.id, { resolve, reject })
      input.write(JSON.stringify(message) + '\0')
    })
  const once = (method, sessionId) =>
    new Promise((resolve) => {
      const listen = (message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return
        listeners.delete(listen)
        resolve(message.params)
      }
      listeners.add(listen)
    })

  // One page: navigate, size, evaluate, type, click and capture.
  const page = async () => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    await call('Page.enable')
    await call('Runtime.enable')
    const errors = []
    listeners.add((message) => {
      if (message.sessionId !== sessionId) return
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    })
    const evaluate = async (expression) => {
      const reply = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)
      return reply.result.value
    }
    return {
      errors,
      async open(url, { width, height, dark }) {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
        await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
        const loaded = once('Page.loadEventFired', sessionId)
        await call('Page.navigate', { url })
        await loaded
      },
      evaluate,
      // What makes the page scroll sideways: the deepest elements outside a
      // scroll box that run past the window, or whose text spills out, as
      // "tag.class right text" lines. Empty when the page fits.
      overflow: () =>
        evaluate(`(() => {
          const clipped = (el) => { for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible') return true; return false }
          const past = (el) => !clipped(el) && (el.getBoundingClientRect().right > innerWidth + 0.5 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.getBoundingClientRect().left + el.scrollWidth > innerWidth + 0.5))
          const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 3).join('.') : '')
          return [...document.querySelectorAll('body *')].filter((el) => past(el) && ![...el.children].some(past)).slice(0, 5).map((el) => name(el) + ' ' + Math.round(el.getBoundingClientRect().left + el.scrollWidth) + 'px ' + JSON.stringify((el.textContent || '').slice(0, 60)))
        })()`),
      // Waits until `expression` is truthy, up to `ms`.
      async until(expression, ms = 5000) {
        const end = Date.now() + ms
        for (;;) {
          const value = await evaluate(expression)
          if (value) return value
          if (Date.now() > end) throw Error(`Timed out waiting for ${expression}`)
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      },
      // `text` is what the key types; Enter and Space need it to press a button.
      async key(key, code = key, keyCode = 27, text) {
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) })
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
      },
      async hover(x, y) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      },
      async click(x, y) {
        for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      },
      // Press at (x, y), move to (toX, toY) in steps, release there unless
      // `release` is false (then `release()` ends it).
      async drag(x, y, toX, steps = 8, toY = y, button = 'left', release = true) {
        const buttons = { left: 1, right: 2, middle: 4 }[button]
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: 1 })
        for (let i = 1; i <= steps; i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + ((toX - x) * i) / steps, y: y + ((toY - y) * i) / steps, button, buttons })
        if (release) await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button, buttons: 0, clickCount: 1 })
      },
      async release(x, y, button = 'left') {
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
      },
      async doubleClick(x, y) {
        for (const clickCount of [1, 2])
          for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount })
      },
      // A finger tap: pointer events with pointerType touch.
      async tap(x, y) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      },
      async wheel(x, y, deltaY) {
        await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
      },
      // `selector` crops to that element, past the viewport if it is taller.
      async screenshot(file, { selector } = {}) {
        assertShotOutsideGit(file)
        const box = selector
          ? await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
          : null
        if (selector && !box) throw Error(`No ${selector} to capture`)
        const { data } = await call('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 }, captureBeyondViewport: true } : {}) })
        fs.writeFileSync(file, Buffer.from(data, 'base64'))
      },
    }
  }
  const close = async () => {
    try {
      await Promise.race([send('Browser.close'), new Promise((resolve) => setTimeout(resolve, 2000))])
    } catch {
      // Already gone.
    }
    const exited = child.exitCode === null ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve()
    killTree(child.pid)
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    process.off('exit', onExit)
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  return { page, close, pid: child.pid, profile }
}
