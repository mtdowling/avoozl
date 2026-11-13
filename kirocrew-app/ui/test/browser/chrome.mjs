// A headless Chrome driven over the DevTools protocol on a pipe (fds 3 and
// 4), so no debugging port is opened. Used by the modal tests and the
// screenshot script; no browser package is a dependency.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

// AVOOZL_CHROME names the browser; else the usual install places.
export function findChrome() {
  const named = process.env.AVOOZL_CHROME
  if (named) return fs.existsSync(named) ? named : null
  return CANDIDATES.find((file) => fs.existsSync(file)) ?? null
}

export async function launch(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-chrome-'))
  // AVOOZL_CHROME_NO_SANDBOX=1 for a host without a usable sandbox (no
  // unprivileged user namespaces). The page only loads the local harness.
  const noSandbox = process.getuid?.() === 0 || process.env.AVOOZL_CHROME_NO_SANDBOX === '1'
  const child = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--remote-debugging-pipe', `--user-data-dir=${profile}`, ...(noSandbox ? ['--no-sandbox'] : [])],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  )
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
      async key(key, code = key, keyCode = 27) {
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode })
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
      },
      async click(x, y) {
        for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      },
      async wheel(x, y, deltaY) {
        await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
      },
      async screenshot(file) {
        const { data } = await call('Page.captureScreenshot', { format: 'png' })
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
    child.kill()
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  return { page, close }
}
