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

export async function launchChrome({ url, profileDir, port = 0 } = {}) {
  const dir =
    profileDir || fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-chrome-"));
  const chosen = port || 9000 + Math.floor(Math.random() * 20000);
  const proc = spawn(
    CHROME,
    [
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
      buttons: 0,
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
    for (const type of ["keyDown", "keyUp"])
      await this.send("Input.dispatchKeyEvent", {
        type: type === "keyDown" && text ? "keyDown" : type,
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
    await this.press("F1");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await this.type(name);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await this.press("Enter");
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
