// What plugin children and plugin checks share (plugin-checks D2): the
// JSON-lines reader with its reply cap, and the listener watch over a
// process and everything it started (PK7.5, PK10.11).
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Call `onLine` with each line `stream` writes. A line longer than
// `maxLine` calls `onOverflow` once and reads nothing more.
export function jsonLines(stream, { maxLine, onLine, onOverflow }) {
  let buffer = "",
    over = false;
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk) => {
    if (over) return;
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      onLine(line);
    }
    if (buffer.length > maxLine) {
      over = true;
      onOverflow();
    }
  });
}

const run = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(
      file,
      args,
      { timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    ),
  );

// The children of each pid in `pids`, as {parent: [child]}.
async function childrenOf(pids) {
  const children = new Map();
  if (process.platform === "linux") {
    // /proc/<pid>/stat: "pid (name) state ppid ..."; the name may hold spaces.
    for (const name of fs.readdirSync("/proc"))
      if (/^\d+$/.test(name))
        try {
          const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8"),
            ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
          children.set(ppid, [...(children.get(ppid) ?? []), Number(name)]);
        } catch {}
    return children;
  }
  if (process.platform === "win32") {
    const text = await run(
      process.env.SystemRoot
        ? path.join(
            process.env.SystemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          )
        : "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
      ],
    );
    for (const line of text.split(/\r?\n/)) {
      const [child, parent] = line.trim().split(/\s+/).map(Number);
      if (Number.isInteger(child) && Number.isInteger(parent))
        children.set(parent, [...(children.get(parent) ?? []), child]);
    }
    return children;
  }
  // macOS and the BSDs: pgrep -P, which needs no setuid ps.
  for (const pid of pids) {
    const out = await run("pgrep", ["-P", String(pid)]).catch((error) => {
      // pgrep exits 1 when the process has no children.
      if (error.code === 1) return "";
      throw error;
    });
    children.set(pid, out.split(/\s+/).filter(Boolean).map(Number));
  }
  return children;
}

// `pid` and every process under it. Linux and Windows read the whole
// table once; macOS asks pgrep per process.
export async function processTree(pid) {
  const whole = process.platform === "linux" || process.platform === "win32",
    table = whole ? await childrenOf([]) : null,
    out = [pid];
  for (let i = 0; i < out.length; i++) {
    const children = whole
      ? (table.get(out[i]) ?? [])
      : ((await childrenOf([out[i]])).get(out[i]) ?? []);
    for (const child of children) if (!out.includes(child)) out.push(child);
  }
  return out;
}

// Stop each process, children first.
export function killTree(pids) {
  for (const pid of [...pids].reverse())
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
}

// Every `everyMs`, list the tree under `pid` and ask `checkListeners` for
// each process's listening sockets. The first listener (or a check that
// cannot run, which counts as one) stops the tree and calls `onHit` with
// the reason. Returns stop().
export function watchListeners(
  pid,
  { checkListeners, everyMs = 2000, onHit, gone = () => false },
) {
  let stopped = false,
    timer = null;
  const pass = async () => {
    if (stopped || gone()) return;
    let tree = [pid],
      found = [];
    try {
      tree = await processTree(pid);
      for (const each of tree) {
        if (stopped) return;
        let listening = [];
        try {
          listening = await checkListeners(each);
        } catch (error) {
          // A process that exited between the list and the check is gone,
          // not listening; a check that cannot run fails closed.
          if (error?.code === "ENOENT") continue;
          throw error;
        }
        found.push(...listening);
      }
    } catch (error) {
      found = [`cannot check for listeners: ${error.message}`];
    }
    if (stopped || gone()) return;
    if (found.length) {
      stopped = true;
      killTree(tree);
      onHit(
        `opened a network listener (${found.join(", ")}); checks may not listen.`,
      );
      return;
    }
    timer = setTimeout(pass, everyMs);
  };
  timer = setTimeout(pass, Math.min(everyMs, 500));
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
