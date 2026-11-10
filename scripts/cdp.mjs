#!/usr/bin/env node
// A very small Chrome DevTools Protocol client, used to drive the real editor
// UI in the clicked-control check.
//
// The point of that check is that a human-visible control was clicked, not
// that a backend call was made. Driving Chrome's own input and the editor's
// own DOM keeps that property while making the check repeatable: the same
// buttons are pressed every run, and nothing is dispatched to the facade.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

const CHROME =
  process.env.CHROME_BINARY ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Also used for the desktop editor, which is Electron and accepts the same
// debugging port. `args` then replaces the browser-only flags.
export async function launchChrome({
  url,
  profileDir,
  port = 0,
  binary,
  args,
} = {}) {
  const dir =
    profileDir || fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-chrome-"));
  const chosen = port || 9000 + Math.floor(Math.random() * 20000);
  const proc = spawn(
    binary || CHROME,
    args
      ? ["--remote-debugging-port=" + chosen, ...args]
      : [
          "--remote-debugging-port=" + chosen,
          "--user-data-dir=" + dir,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-timer-throttling",
          "--window-size=1500,1000",
          url || "about:blank",
        ],
    // Detached so the browser survives the process that started it: the check
    // that drives it is re-run while the editor stays open.
    { stdio: ["ignore", "ignore", "ignore"], detached: true },
  );
  proc.unref();
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch("http://127.0.0.1:" + chosen + "/json/version");
      if (res.ok) break;
    } catch {}
    if (Date.now() > deadline) throw Error("Chrome did not expose a debugger.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { proc, port: chosen, profileDir: dir };
}

export async function attach(port, match = () => true) {
  const deadline = Date.now() + 30000;
  for (;;) {
    const targets = await (
      await fetch("http://127.0.0.1:" + port + "/json/list")
    ).json();
    const target = targets.find(
      (t) => t.type === "page" && t.webSocketDebuggerUrl && match(t),
    );
    if (target) return new CdpSession(target.webSocketDebuggerUrl);
    if (Date.now() > deadline) throw Error("No matching page target.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export class CdpSession {
  constructor(url) {
    this.ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (data) => {
      const message = JSON.parse(data);
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async navigate(url) {
    await this.send("Page.enable");
    await this.send("Page.navigate", { url });
  }
  // Runs statements in the page, with no result marshalling. Used to install
  // page-side helpers, which `eval` then calls as expressions.
  async exec(source) {
    const result = await this.send("Runtime.evaluate", {
      expression: source,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
  }
  // Evaluates in the page and returns a JSON value.
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression:
        "(() => { try { return JSON.stringify(" +
        expression +
        ") ?? 'null'; } catch (error) { return JSON.stringify({ cdpError: String(error) }); } })()",
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    const value = result.result?.value;
    return value === undefined ? undefined : JSON.parse(value);
  }
  async waitFor(expression, { timeoutMs = 30000, label } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await this.eval(expression).catch(() => null);
      if (value) return value;
      if (Date.now() > deadline)
        throw Error("timed out waiting for " + (label || expression));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  // A real mouse press at the element's own centre, rather than a synthetic
  // DOM click: the editor's lists and buttons respond to pointer input, and a
  // dispatched event would not prove the visible control works.
  async clickCentre(box) {
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      // The desktop application's Electron build rejects a move without an
      // explicit button, and the rejection was easy to mistake for a click
      // that landed on nothing.
      button: "none",
      buttons: 0,
      clickCount: 0,
    });
    for (const type of ["mousePressed", "mouseReleased"])
      await this.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    return { x, y };
  }
  // Keyboard input, for the command palette: the editor's own commands are
  // the least brittle way to reach a view, and a hidden view has no control
  // to click.
  async press(key, { code, modifiers = 0, text } = {}) {
    // A key without text is a raw key down: the desktop application ignores a
    // plain `keyDown` for Enter and the palette simply stays open.
    for (const type of [text ? "keyDown" : "rawKeyDown", "keyUp"])
      await this.send("Input.dispatchKeyEvent", {
        type,
        key,
        code: code || key,
        windowsVirtualKeyCode: VIRTUAL_KEYS[key] || 0,
        nativeVirtualKeyCode: VIRTUAL_KEYS[key] || 0,
        modifiers,
        ...(type === "keyDown" && text ? { text } : {}),
      });
  }
  async type(value) {
    for (const character of value)
      await this.send("Input.insertText", { text: character });
  }
  // Runs an editor command through the palette, by name, as a user would.
  async command(name, { settleMs = 1500 } = {}) {
    // An unfocused window ignores the keystroke, which is how a palette ends
    // up closed while text is still being typed somewhere.
    await this.send("Page.bringToFront").catch(() => {});
    const paletteOpen = () =>
      this.eval(
        "(() => { const n = document.querySelector('.quick-input-widget'); if (!n) return false; const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(n).display !== 'none'; })()",
      ).catch(() => false);
    let open = false;
    for (let attempt = 0; attempt < 3 && !open; attempt++) {
      await this.press("F1");
      await new Promise((resolve) => setTimeout(resolve, 800));
      open = await paletteOpen();
    }
    // Never type without the palette focused. Text typed blind goes to
    // whatever has focus — in one run that was a chat input, which submitted a
    // partial command as a prompt and started an agent nobody asked for.
    if (!open)
      throw Error(
        "The command palette did not open, so " +
          JSON.stringify(name) +
          " was not typed. Refusing to send keystrokes to an unknown focus.",
      );
    await this.type(name);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    // Click the entry whose label is the command asked for, rather than the
    // first row: the palette puts recently used commands first, so the first
    // row is routinely a different command that then runs silently. This is
    // also why Enter is not used — the desktop application does not act on a
    // dispatched Enter, and a palette left open looks exactly like a command
    // that ran and did nothing.
    const row = await this.eval(
      "(() => { const wanted = " +
        JSON.stringify(name) +
        "; const rows = [...document.querySelectorAll('.quick-input-list .monaco-list-row')]; const match = rows.find((n) => (n.textContent || '').trim().startsWith(wanted)); const n = match; if (!n) return null; const b = n.getBoundingClientRect(); return b.width > 0 ? { x: b.x, y: b.y, width: b.width, height: b.height } : null; })()",
    ).catch(() => null);
    if (row) await this.clickCentre(row);
    else await this.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
  async close() {
    try {
      this.ws.close();
    } catch {}
  }
}

// A page-side helper, injected once, that finds a visible element by its text
// and returns its bounding box.
export const FINDER = `
globalThis.__avoozlFind = (text, selector) => {
  const nodes = [...document.querySelectorAll(selector || '*')];
  for (const node of nodes) {
    const own = (node.textContent || '').trim();
    const label = node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title') || '');
    if (!own.includes(text) && !String(label).includes(text)) continue;
    if (node.querySelector && [...node.querySelectorAll(selector || '*')].some(child => (child.textContent || '').trim().includes(text))) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    return { x: box.x, y: box.y, width: box.width, height: box.height, text: own.slice(0, 120), label: String(label).slice(0, 120) };
  }
  return null;
};
globalThis.__avoozlTexts = (selector) =>
  [...document.querySelectorAll(selector)]
    .map((node) => ({
      text: (node.textContent || '').trim().slice(0, 140),
      label: node.getAttribute('aria-label') || '',
      visible: node.getBoundingClientRect().width > 0,
    }))
    .filter((entry) => entry.text || entry.label);
true
`;

const VIRTUAL_KEYS = {
  Enter: 13,
  Escape: 27,
  Tab: 9,
  F1: 112,
  ArrowDown: 40,
  ArrowUp: 38,
};
