// The MCP broker (epic-context EC7, D6): one Unix socket per session,
// outside every sandbox, served by that session's own broker process
// (context-broker-main.mjs). A relay (context-relay.mjs)
// connects with the session's token and an alias; the broker checks both,
// starts the real server on that connection with the check environment
// basics plus the mapping's `env` names, in a scratch folder, and pipes
// JSON-RPC lines both ways. It reads only each request's method and tool
// name, and each reply's size and error, for the session's evidence; never
// an argument or a reply. A server that opens a listener is stopped and its
// plugin marked broken (PK7.5).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { checkEnvironment } from "../git/git.ts";
import { jsonLines, watchListeners } from "../plugins/child-io.ts";
import { listeningSockets } from "../plugins/plugins.ts";

const MAX_LINE = 4 * 1024 * 1024;
const HELLO_MS = 5000;

// One tool call, for the session's evidence.
export interface BrokerCall {
  session: string;
  alias: string;
  tool: string;
  at: string;
  ms: number;
  bytes: number;
  error?: string;
}

// A server that opened a listener.
export interface BrokerViolation {
  session: string;
  alias: string;
  plugin: string | null;
  reason: string;
}

// One server a session may start, by its alias.
interface BrokerServer {
  command: string[];
  env?: string[];
  plugin?: string | null;
}

// One open session: its socket folder, servers, token and connections.
interface SessionState {
  folder: string;
  servers: Record<string, BrokerServer>;
  token: string;
  sockets: Set<net.Socket>;
  server: net.Server;
}

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// `onCall(entry)` gets {session, alias, tool, at, ms, bytes, error?} for
// each tool call. `onViolation({session, alias, plugin, reason})` gets a
// server that listens. `checkListeners` and `listenerMs` are tests' knobs.
export function createBroker({
  onCall = () => {},
  onViolation = () => {},
  checkListeners = listeningSockets,
  listenerMs = 2000,
}: {
  onCall?: (entry: BrokerCall) => void;
  onViolation?: (violation: BrokerViolation) => void;
  checkListeners?: (pid: number) => Promise<string[]>;
  listenerMs?: number;
} = {}) {
  const sessions = new Map<string, SessionState>();

  const serve = (session: string, state: SessionState, socket: net.Socket) => {
    let child: ChildProcessByStdio<Writable, Readable, null> | null = null,
      exited = false,
      stopWatch = () => {};
    const pending = new Map<
      unknown,
      { tool: string; at: number; bytes: number }
    >();
    const end = () => {
      stopWatch();
      if (child && !exited) child.kill("SIGKILL");
      socket.destroy();
      state.sockets.delete(socket);
    };
    state.sockets.add(socket);
    socket.on("error", end);
    socket.on("close", end);
    const timer = setTimeout(end, HELLO_MS);
    let hello = false;
    jsonLines(socket, {
      maxLine: MAX_LINE,
      onOverflow: end,
      onLine: (line: string) => {
        if (!hello) {
          clearTimeout(timer);
          let value: { alias?: string; token?: unknown } | null;
          try {
            value = JSON.parse(line);
          } catch {
            return end();
          }
          const server = state.servers[String(value?.alias)];
          if (
            typeof value?.token !== "string" ||
            !same(value.token, state.token) ||
            !server
          )
            return end();
          hello = true;
          start(String(value?.alias), server);
          return;
        }
        // The method and tool name only, for the record.
        try {
          const message = JSON.parse(line);
          if (message?.method === "tools/call" && message.id !== undefined)
            pending.set(message.id, {
              tool: String(message.params?.name ?? "").slice(0, 128),
              at: Date.now(),
              bytes: line.length,
            });
        } catch {}
        child?.stdin.write(line + "\n");
      },
    });

    function start(alias: string, server: BrokerServer) {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-mcp-"));
      const [program, ...args] = server.command;
      const started = spawn(program, args, {
        cwd: scratch,
        env: checkEnvironment(process.env, server.env ?? []),
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
      child = started;
      started.on("error", end);
      started.on("exit", () => {
        exited = true;
        stopWatch();
        fs.rmSync(scratch, { recursive: true, force: true });
        socket.end();
      });
      started.stdin.on("error", () => {});
      if (started.pid)
        stopWatch = watchListeners(started.pid, {
          checkListeners,
          everyMs: listenerMs,
          gone: () => exited,
          onHit: (reason: string) => {
            onViolation({
              session,
              alias,
              plugin: server.plugin ?? null,
              reason: `the MCP server ${alias} ${reason}`,
            });
            end();
          },
        });
      jsonLines(started.stdout, {
        maxLine: MAX_LINE,
        onOverflow: end,
        onLine: (line: string) => {
          try {
            const message = JSON.parse(line),
              call = pending.get(message?.id);
            if (call && (message.result !== undefined || message.error)) {
              pending.delete(message.id);
              onCall({
                session,
                alias,
                tool: call.tool,
                at: new Date(call.at).toISOString(),
                ms: Date.now() - call.at,
                bytes: call.bytes + line.length,
                ...(message.error
                  ? { error: String(message.error.code ?? "error") }
                  : message.result?.isError
                    ? { error: "tool" }
                    : {}),
              });
            }
          } catch {}
          socket.write(line + "\n");
        },
      });
    }
  };

  const close = (session: string) => {
    const state = sessions.get(session);
    if (!state) return;
    sessions.delete(session);
    for (const socket of state.sockets) socket.destroy();
    state.server.close();
    fs.rmSync(state.folder, { recursive: true, force: true });
  };

  return {
    // Listen for `session`; `servers` maps each alias it was given to
    // {command, env, plugin?}. Returns {socket, token}. A session opened
    // before (a resume) is closed first, so its token changes. `socket` and
    // `token` may be given, the socket in a `0700` folder of its own.
    open({
      session,
      servers,
      socket,
      token,
    }: {
      session: string;
      servers: Record<string, BrokerServer>;
      socket?: string;
      token?: string;
    }) {
      close(session);
      const folder = socket
        ? path.dirname(socket)
        : fs.mkdtempSync(path.join(os.tmpdir(), "avz-"));
      socket ??= path.join(folder, "mcp.sock");
      fs.chmodSync(folder, 0o700);
      const state: SessionState = {
        folder,
        servers: { ...servers },
        token: token ?? randomBytes(24).toString("hex"),
        sockets: new Set(),
        server: net.createServer(),
      };
      state.server.on("connection", (client) => serve(session, state, client));
      state.server.listen(socket);
      try {
        fs.chmodSync(socket, 0o600);
      } catch {}
      sessions.set(session, state);
      return { socket, token: state.token };
    },
    close,
    closeAll: () => [...sessions.keys()].forEach(close),
    has: (session: string) => sessions.has(session),
  };
}
