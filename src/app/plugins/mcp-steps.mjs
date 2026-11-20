// MCP steps (plugin-checks D13, PK10): a fixed program of tool calls on a
// local stdio MCP server, which Avoozl runs itself with no model in the
// loop. The manifest fixes every tool, argument name and the order (start,
// poll, result); replies only fill the task id and the answer. The server
// is a child of the check runner, started for one check and stopped after
// it, with the check environment basics plus its mapping's `env` names.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkEnvironment, git } from "../git/git.mjs";
import { outputTail } from "../delivery/verify.mjs";
import { listeningSockets } from "./plugins.mjs";
import { jsonLines, watchListeners } from "./child-io.mjs";

const PROTOCOL = "2025-06-18";
const CALL_MS = 60_000;
const MAX_LINE = 4 * 1024 * 1024;
const MAX_FILE = 65536;

// One string with `{name}` placeholders replaced; a name with no value is
// refused, so a step never runs with a hole in it.
export function fillText(text, values) {
  return String(text).replace(/\{([a-z_]+)\}/g, (_whole, name) => {
    if (values[name] === undefined)
      throw Error(`{${name}} has no value for this run`);
    return values[name];
  });
}

// The value at a `$.key[0]` path, or undefined.
export function readPath(value, at) {
  let current = value;
  for (const [, key, index] of String(at)
    .slice(1)
    .matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]/g)) {
    if (current === null || typeof current !== "object") return undefined;
    current = key !== undefined ? current[key] : current[Number(index)];
  }
  return current;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A tool reply's JSON: its structuredContent, else the first text item
// parsed, else undefined.
export function replyValue(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = (result?.content ?? []).find((item) => item?.type === "text");
  if (typeof text?.text !== "string") return undefined;
  try {
    return JSON.parse(text.text);
  } catch {
    return undefined;
  }
}

// Fill a step's arguments: placeholders inside strings only, keys never.
export function fillArgs(value, values, readFile) {
  if (typeof value === "string")
    return fillText(
      value.replace(/\{file:([^{}]+)\}/g, (_, name) => readFile(name)),
      values,
    );
  if (Array.isArray(value))
    return value.map((item) => fillArgs(item, values, readFile));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        fillArgs(child, values, readFile),
      ]),
    );
  return value;
}

// A JSON-RPC client over the server's stdio.
function client(child) {
  let next = 1,
    broken = null;
  const pending = new Map(),
    fail = (reason) => {
      broken ||= reason;
      for (const waiting of pending.values()) {
        clearTimeout(waiting.timer);
        waiting.reject(Error(broken));
      }
      pending.clear();
    };
  child.on("exit", (code, signal) =>
    fail(`the server exited (${code ?? signal ?? "unknown"})`),
  );
  child.on("error", (error) =>
    fail(`the server did not start: ${error.message}`),
  );
  child.stdin.on("error", () => {});
  jsonLines(child.stdout, {
    maxLine: MAX_LINE,
    onOverflow: () => {
      fail("the server sent a reply over 4 MB");
      child.kill("SIGKILL");
    },
    onLine: (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const waiting = pending.get(message?.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error)
        waiting.reject(
          Object.assign(
            Error(
              `MCP error: ${String(message.error.message ?? "").slice(0, 200)}`,
            ),
            { mcp: true },
          ),
        );
      else waiting.resolve(message.result);
    },
  });
  return {
    get broken() {
      return broken;
    },
    fail,
    notify(method, params) {
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
      );
    },
    request(method, params, ms = CALL_MS) {
      if (broken) return Promise.reject(Error(broken));
      const id = next++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(`${method} took over ${Math.round(ms / 1000)} s`));
        }, ms);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      });
    },
  };
}

const notRun = (why) => ({ exitCode: null, notRun: why.slice(0, 300) });
const failed = (why, extra = {}) => ({
  exitCode: 1,
  tail: outputTail(why),
  ...extra,
});

// Run one MCP step. `context`: {root, commit, base, values, timeoutMs,
// mcpId (a task id from before a restart), onMcpId(id), onBroken(reason),
// checkListeners, secondMs (tests shorten a second)}. Returns a result
// entry {exitCode, tail?, notRun?, durationMs}.
export async function runMcpStep(check, context) {
  const started = Date.now(),
    step = check.mcp,
    second = context.secondMs ?? 1000,
    deadline = started + (context.timeoutMs ?? 1_200_000),
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-mcp-")),
    values = { ...context.values };
  let child = null,
    stopWatch = () => {},
    violation = null,
    exited = false;
  const done = (result) => ({ ...result, durationMs: Date.now() - started });
  try {
    if (/\{diff_path\}/.test(JSON.stringify(step))) {
      if (!values.base || !values.commit)
        return done(notRun("{diff_path} needs the change's base and commit"));
      const file = path.join(scratch, "change.diff");
      fs.writeFileSync(
        file,
        await git(context.root, ["diff", values.base, values.commit]),
      );
      values.diff_path = file;
    }
    const readFile = (name) =>
      fs
        .readFileSync(path.join(check.plugin.folder, name), "utf8")
        .slice(0, MAX_FILE);
    const [command, ...args] = check.mapping.command;
    child = spawn(command, args, {
      cwd: scratch,
      env: checkEnvironment(process.env, check.mapping.env ?? []),
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    child.on("exit", () => {
      exited = true;
      stopWatch();
    });
    const rpc = client(child);
    if (child.pid)
      stopWatch = watchListeners(child.pid, {
        checkListeners: context.checkListeners ?? listeningSockets,
        gone: () => exited,
        onHit: (reason) => {
          violation = `the MCP server ${reason}`;
          rpc.fail(violation);
        },
      });
    let reported = false;
    const broken = () => {
      if (!violation) return null;
      if (!reported) context.onBroken?.(violation);
      reported = true;
      return failed(violation, { violation });
    };
    try {
      await rpc.request("initialize", {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "avoozl", version: "1" },
      });
      rpc.notify("notifications/initialized", {});
      const tools = new Set();
      let cursor;
      for (let page = 0; page < 20; page++) {
        const listed = await rpc.request(
          "tools/list",
          cursor ? { cursor } : {},
        );
        for (const tool of listed?.tools ?? []) tools.add(tool?.name);
        cursor = listed?.nextCursor;
        if (!cursor) break;
      }
      const missing = [step.start.tool, step.poll?.tool]
        .filter(Boolean)
        .filter((tool) => !tools.has(tool));
      if (missing.length)
        return done(
          notRun(`server ${step.server} lists no tool ${missing.join(", ")}`),
        );
    } catch (error) {
      return done(
        broken() ?? notRun(`server ${step.server}: ${error.message}`),
      );
    }
    const call = async (tool, args) => {
      const result = await rpc.request(
        "tools/call",
        { name: tool, arguments: fillArgs(args ?? {}, values, readFile) },
        Math.max(1, Math.min(CALL_MS, deadline - Date.now())),
      );
      if (result?.isError) {
        const text = replyValue(result);
        throw Object.assign(
          Error(
            `MCP error from ${tool}${typeof text === "string" ? `: ${text}` : ""}`,
          ),
          { mcp: true },
        );
      }
      const value = replyValue(result);
      if (value === undefined)
        throw Object.assign(Error(`${tool} replied with no JSON`), {
          mcp: true,
        });
      return value;
    };
    try {
      let last;
      if (context.mcpId !== undefined && context.mcpId !== null) {
        values.id = String(context.mcpId);
      } else {
        last = await call(step.start.tool, step.start.args);
        if (step.start.id !== undefined) {
          const id = readPath(last, step.start.id);
          if (id === undefined || id === null || typeof id === "object")
            return done(
              failed(`${step.start.tool} gave no id at ${step.start.id}`),
            );
          values.id = String(id);
          context.onMcpId?.(values.id);
        }
      }
      if (step.poll) {
        const every = (step.poll.everySeconds ?? 30) * second;
        for (;;) {
          const wait = Math.min(every, deadline - Date.now());
          if (wait <= 0)
            return done(
              failed(
                `timed out after ${Math.round((Date.now() - started) / 1000)} s waiting for ${step.poll.tool}`,
              ),
            );
          await new Promise((resolve) => setTimeout(resolve, wait));
          if (violation) return done(broken());
          last = await call(step.poll.tool, step.poll.args);
          const state = readPath(last, step.poll.until.path);
          if (step.poll.until.in.some((value) => same(value, state))) break;
        }
      }
      const verdict = readPath(last, step.result.path),
        text =
          step.result.text !== undefined
            ? readPath(last, step.result.text)
            : undefined,
        tail =
          text === undefined
            ? ""
            : outputTail(
                typeof text === "string" ? text : JSON.stringify(text),
              );
      if (verdict === undefined)
        return done(failed(`the reply has no value at ${step.result.path}`));
      const passed = step.result.pass.some((value) => same(value, verdict));
      return done({ exitCode: passed ? 0 : 1, ...(tail ? { tail } : {}) });
    } catch (error) {
      if (broken()) return done(broken());
      // The check's own timeout cut the call short.
      if (Date.now() >= deadline - 5)
        return done(
          failed(
            `timed out after ${Math.round((Date.now() - started) / 1000)} s`,
          ),
        );
      return done(failed(error.message));
    }
  } finally {
    stopWatch();
    // The server must be gone before its working folder goes: Windows
    // keeps a running process's folder locked.
    if (child && !exited) {
      const gone = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGKILL");
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
    }
    fs.rmSync(scratch, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
