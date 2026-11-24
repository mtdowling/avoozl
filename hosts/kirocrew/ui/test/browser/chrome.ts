// A headless Chrome driven over the DevTools protocol on a pipe (fds 3 and
// 4), so no debugging port is opened. Used by the modal tests and the
// screenshot script; no browser package is a dependency.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { Harness, HarnessOptions } from './build.ts'

export type { Harness }

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
export function findChrome(): string | null {
  const named = process.env.AVOOZL_CHROME
  if (named) return fs.existsSync(named) ? named : null
  return CANDIDATES.find((file) => fs.existsSync(file)) ?? null
}

// The browser for a screenshot script, which cannot run without one.
export function needChrome(): string {
  const chrome = findChrome()
  if (!chrome) throw Error('No Chrome found; set AVOOZL_CHROME.')
  return chrome
}

const windows = process.platform === 'win32'

// Screenshots are never committed. Inside this repository they may only go
// to .avoozl-shots/ (gitignored); anywhere outside it, such as the temp
// folder, is fine.
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url))
export function assertShotOutsideGit(file: string) {
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
function killTree(pid: number | undefined) {
  if (pid === undefined) return
  try {
    if (windows) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

// One DevTools protocol message: a reply (id) or an event (method).
type Message = {
  id?: number
  method?: string
  sessionId?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message: string; code: number }
}
type Exception = { exceptionDetails?: { text: string; exception?: { description?: string } } }
type ConsoleCall = { type: string; args: { value?: unknown; description?: string }[] }
type Params = Record<string, unknown>

export async function launch(chrome: string) {
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
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  // stdio 3 and 4 are the pipes asked for above.
  const input = child.stdio[3] as Writable
  const output = child.stdio[4] as Readable
  let id = 0
  let buffer = Buffer.alloc(0)
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const listeners = new Set<(message: Message) => void>()
  const gone = () => {
    const error = Error(`Chrome exited.\n${stderr}`)
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }
  child.on('exit', gone)
  input.on('error', gone)
  output.on('error', gone)
  output.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (let at = buffer.indexOf(0); at >= 0; at = buffer.indexOf(0)) {
      const message: Message = JSON.parse(buffer.subarray(0, at).toString('utf8'))
      buffer = buffer.subarray(at + 1)
      const waiting = message.id ? pending.get(message.id) : undefined
      if (message.id && waiting) {
        pending.delete(message.id)
        if (message.error) waiting.reject(Error(`${message.error.message} (${message.error.code})`))
        else waiting.resolve(message.result)
      } else for (const listen of listeners) listen(message)
    }
  })
  // T is what the method replies with: the protocol is not typed here, so
  // the caller names the part it reads.
  const send = <T = unknown>(method: string, params: Params = {}, sessionId?: string) =>
    new Promise<T>((resolve, reject) => {
      const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
      pending.set(message.id, { resolve: (value) => resolve(value as T), reject })
      input.write(JSON.stringify(message) + '\0')
    })
  const once = (method: string, sessionId: string) =>
    new Promise<Message['params']>((resolve) => {
      const listen = (message: Message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return
        listeners.delete(listen)
        resolve(message.params)
      }
      listeners.add(listen)
    })

  // One page: navigate, size, evaluate, type, click and capture.
  const page = async () => {
    const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    const call = <T = unknown>(method: string, params?: Params) => send<T>(method, params, sessionId)
    await call('Page.enable')
    await call('Runtime.enable')
    const errors: string[] = []
    // console.error and console.warn calls, for a page that must log none.
    const consoleErrors: string[] = []
    listeners.add((message) => {
      if (message.sessionId !== sessionId) return
      if (message.method === 'Runtime.exceptionThrown') {
        const { exceptionDetails } = message.params as Exception
        errors.push(exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? '')
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const { type, args } = message.params as ConsoleCall
        if (['error', 'warning'].includes(type)) consoleErrors.push(args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
      }
    })
    // T is what `expression` returns in the page; the caller names it.
    const evaluate = async <T = unknown>(expression: string): Promise<T> => {
      const reply = await call<Exception & { result: { value: T } }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text)
      return reply.result.value
    }
    return {
      errors,
      consoleErrors,
      // Runs `source` in every document before its own scripts, from the next
      // navigation on (a listener that must see the page's first events).
      onNewDocument: (source: string) => call('Page.addScriptToEvaluateOnNewDocument', { source }),
      // `scale` is the device pixel ratio: 2 for the docs' screenshots.
      async open(url: string, { width, height, dark, scale = 1 }: { width: number; height: number; dark?: boolean; scale?: number }) {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
        await call('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
            { name: 'prefers-reduced-motion', value: 'reduce' },
          ],
        })
        const loaded = once('Page.loadEventFired', sessionId)
        await call('Page.navigate', { url })
        await loaded
      },
      async reload() {
        const loaded = once('Page.loadEventFired', sessionId)
        await call('Page.reload')
        await loaded
      },
      evaluate,
      // What makes the page scroll sideways: the deepest elements outside a
      // scroll box that run past the window, or whose text spills out, as
      // "tag.class right text" lines. Empty when the page fits.
      overflow: () =>
        evaluate<string[]>(`(() => {
          const clipped = (el) => { for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible') return true; return false }
          const past = (el) => !clipped(el) && (el.getBoundingClientRect().right > innerWidth + 0.5 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.getBoundingClientRect().left + el.scrollWidth > innerWidth + 0.5))
          const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 3).join('.') : '')
          return [...document.querySelectorAll('body *')].filter((el) => past(el) && ![...el.children].some(past)).slice(0, 5).map((el) => name(el) + ' ' + Math.round(el.getBoundingClientRect().left + el.scrollWidth) + 'px ' + JSON.stringify((el.textContent || '').slice(0, 60)))
        })()`),
      // Waits until `expression` is truthy, up to `ms`.
      async until<T = unknown>(expression: string, ms = 5000): Promise<T> {
        const end = Date.now() + ms
        for (;;) {
          const value = await evaluate<T>(expression)
          if (value) return value
          if (Date.now() > end) throw Error(`Timed out waiting for ${expression}`)
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      },
      // `text` is what the key types; Enter and Space need it to press a button.
      async key(key: string, code = key, keyCode = 27, text?: string) {
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) })
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
      },
      async hover(x: number, y: number) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      },
      async click(x: number, y: number) {
        for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      },
      // Press at (x, y), move to (toX, toY) in steps, release there unless
      // `release` is false (then `release()` ends it).
      async drag(x: number, y: number, toX: number, steps = 8, toY = y, button: 'left' | 'right' | 'middle' = 'left', release = true) {
        const buttons = { left: 1, right: 2, middle: 4 }[button]
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: 1 })
        for (let i = 1; i <= steps; i++)
          await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + ((toX - x) * i) / steps, y: y + ((toY - y) * i) / steps, button, buttons })
        if (release) await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button, buttons: 0, clickCount: 1 })
      },
      async release(x: number, y: number, button = 'left') {
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
      },
      async doubleClick(x: number, y: number) {
        for (const clickCount of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount })
      },
      // A finger tap: pointer events with pointerType touch.
      async tap(x: number, y: number) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      },
      async wheel(x: number, y: number, deltaY: number) {
        await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
      },
      // `selector` crops to that element, past the viewport if it is taller.
      async screenshot(file: string, { selector }: { selector?: string } = {}) {
        assertShotOutsideGit(file)
        const box = selector
          ? await evaluate<{ x: number; y: number; width: number; height: number } | undefined>(
              `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`,
            )
          : null
        if (selector && !box) throw Error(`No ${selector} to capture`)
        const { data } = await call<{ data: string }>('Page.captureScreenshot', { format: 'png', ...(box ? { clip: { ...box, scale: 1 }, captureBeyondViewport: true } : {}) })
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

export type Browser = Awaited<ReturnType<typeof launch>>
export type Page = Awaited<ReturnType<Browser['page']>>

// One harness and one browser page for a test file's tests.
export async function startChrome(chrome: string, options: HarnessOptions = {}) {
  const { buildHarness } = await import('./build.ts')
  const harness = await buildHarness(options),
    browser = await launch(chrome)
  return { harness, browser, page: await browser.page() }
}

export async function stopChrome(browser: Browser | undefined, harness: Harness | undefined) {
  await browser?.close()
  harness?.remove()
}
