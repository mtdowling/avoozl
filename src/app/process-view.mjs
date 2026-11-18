// What In flight shows for a `process` session (R98.1, design §4.28): the
// supervisor's status, the tail of the child's log, its cost when the
// harness definition says where to read it, and an attach command a person
// copies. Read-only: it opens the supervisor's database and the log files
// and changes nothing. Log text is data, shown as text, never followed.
import fs from "node:fs";
import {
  childRecord,
  openSupervisorDatabase,
  supervisorPaths,
} from "./supervisor.mjs";
import {
  fillHarnessArgv,
  loadHarnessDefinition,
} from "./harness-definitions.mjs";

const TAIL_BYTES = 16 * 1024;
const TAIL_LINES = 20;
const TAIL_CHARS = 2000;
// shortcut: cost reads at most the log's last 1 MB; a CLI that writes more
// between its cost lines undercounts. Read the whole file if one does.
const COST_BYTES = 1024 * 1024;

function readTail(file, bytes) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    // A cut at the front may split a line; drop that partial line.
    const text = buffer.toString("utf8");
    return length < size ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Terminal escapes and control characters off, tabs and newlines kept.
const plain = (text) =>
  text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

// The last lines of a log, at most TAIL_LINES lines and TAIL_CHARS
// characters, or null when the file cannot be read.
export function logTail(file) {
  if (!file) return null;
  const text = readTail(file, TAIL_BYTES);
  if (text === null) return null;
  const lines = plain(text).replace(/\n+$/, "").split("\n").slice(-TAIL_LINES);
  const tail = lines.join("\n");
  return tail.length > TAIL_CHARS ? tail.slice(-TAIL_CHARS) : tail;
}

// The session's cost in USD from its definition's `cost` (R94.1), or null.
// `output`: each JSON line of the log holding the field as a number, summed
// over the session's runs, or with `per: "session"` the last one, since that
// CLI reports the session's running total. `file`: the named file holds a
// JSON number.
export function sessionCost(row, definition) {
  const cost = definition?.cost;
  if (!cost) return null;
  if (cost.from === "file") {
    let file;
    try {
      [file] = fillHarnessArgv([cost.path], placeholderValues(row));
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return null;
    }
  }
  const text = row.log_file ? readTail(row.log_file, COST_BYTES) : null;
  if (!text) return null;
  let total = null;
  for (const line of text.split("\n")) {
    const start = line.indexOf("{");
    if (start < 0 || !line.includes(cost.field)) continue;
    let value;
    try {
      value = JSON.parse(line.slice(start))?.[cost.field];
    } catch {
      continue;
    }
    if (Number.isFinite(value) && value >= 0)
      total = cost.per === "session" ? value : (total ?? 0) + value;
  }
  return total;
}

// The model that served the session, from its definition's `servedModel`
// (NK5.2), or null. The last JSON line of the log that holds the field: a
// model name, or an object with exactly one model as its key (Claude Code's
// `modelUsage`). Two models, or none, prove nothing.
export function sessionServedModel(row, definition) {
  const field = definition?.servedModel?.field;
  const text =
    field && row.log_file ? readTail(row.log_file, COST_BYTES) : null;
  if (!text) return null;
  let model = null;
  for (const line of text.split("\n")) {
    const start = line.indexOf("{");
    if (start < 0 || !line.includes(field)) continue;
    let value;
    try {
      value = JSON.parse(line.slice(start))?.[field];
    } catch {
      continue;
    }
    const keys =
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value)
        : null;
    const named =
      typeof value === "string" ? value : keys?.length === 1 ? keys[0] : null;
    model =
      named && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(named)
        ? named
        : null;
  }
  return model;
}

const placeholderValues = (row) => ({
  ...JSON.parse(row.placeholder_values || "{}"),
  worktree: row.worktree,
  session: row.session_id,
  session_uuid: row.session_id.slice("process-".length),
});

// One argument quoted for the person's shell: POSIX single quotes, or
// PowerShell's on Windows. Plain words stay as they are.
export function shellQuote(value, platform = process.platform) {
  if (/^[A-Za-z0-9_./:=@+,-]+$/.test(value)) return value;
  return platform === "win32"
    ? `'${value.replace(/'/g, "''")}'`
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

// The command a person runs to join the session: the definition's `attach`
// argv in the worktree, else a follow of the child's log.
export function attachCommand(row, definition, platform = process.platform) {
  const quote = (list) =>
    list.map((item) => shellQuote(item, platform)).join(" ");
  if (definition?.attach) {
    try {
      const argv = fillHarnessArgv(definition.attach, placeholderValues(row));
      return platform === "win32"
        ? `Set-Location ${quote([row.worktree])}; ${quote(argv)}`
        : `cd ${quote([row.worktree])} && ${quote(argv)}`;
    } catch {
      // A placeholder with no value: follow the log instead.
    }
  }
  if (!row.log_file) return null;
  return platform === "win32"
    ? `Get-Content -Wait -Tail ${TAIL_LINES} ${quote([row.log_file])}`
    : `tail -n ${TAIL_LINES} -f ${quote([row.log_file])}`;
}

// The In flight details of each named `process` session, by slot. A
// session the supervisor has no record of is left out; an unreadable
// database gives an empty map, so the view still loads.
export function processSessionDetails(
  slots,
  { stateDirectory, configDirectory, platform = process.platform },
) {
  const details = new Map();
  if (!slots.length) return details;
  // No supervisor has run here: nothing to read, and nothing is created.
  if (!fs.existsSync(supervisorPaths(stateDirectory).database)) return details;
  let db;
  try {
    db = openSupervisorDatabase(stateDirectory);
  } catch {
    return details;
  }
  const definitions = new Map();
  const definitionOf = (name) => {
    if (!definitions.has(name))
      try {
        definitions.set(name, loadHarnessDefinition({ configDirectory, name }));
      } catch {
        // Unapproved or missing: no cost, and attach follows the log.
        definitions.set(name, null);
      }
    return definitions.get(name);
  };
  try {
    for (const slot of slots) {
      const row = childRecord(db, slot);
      if (!row) continue;
      const definition = definitionOf(row.harness);
      details.set(slot, {
        harness: row.harness,
        state: row.state,
        exitCode: row.exit_code ?? null,
        run: row.runs ?? 0,
        logTail: logTail(row.log_file),
        cost: sessionCost(row, definition),
        attach: attachCommand(row, definition, platform),
      });
    }
  } finally {
    db.close();
  }
  return details;
}
