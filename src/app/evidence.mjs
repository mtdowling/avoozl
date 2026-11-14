// The evidence bundle per task (design §4.22, Requirement 76, task 34.2).
//
// One bundle per task under the workspace's `.avoozl/local/evidence/<task>/`
// (never a tracked file): `bundle.json` holds entries {id, kind, at, source,
// text, redacted?, file?}, and attached files sit beside it. Kinds:
// findings, falsifier, decision, review, check, file. Each entry passes the
// secret screen and the content rules (`evidence` boundary) before it is
// saved; a blocked entry is saved redacted, never with the matched text.
//
// Avoozl adds to it as the task runs; the worker attaches screenshots or
// video through plans_report `evidence`. The drawer reads it through
// `task.evidence`, and on GitHub one comment per pull request, found again
// by its marker, holds the text summary and is updated in place.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLISH_RULES,
  check,
  contentBinding,
  secretReason,
} from "./content-rules.mjs";
import { fail } from "./store.mjs";

export const EVIDENCE_KINDS = Object.freeze([
  "findings",
  "falsifier",
  "decision",
  "review",
  "check",
  "file",
  "note",
]);
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const REDACTED = "Redacted by content rules";
const MAX_TEXT = 4000;
const MAX_ENTRIES = 500;
// Image and video types only (R76.2). SVG is left out: it can hold script.
const TYPES = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
});
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const MARKER = (taskId) => `<!-- avoozl:evidence:${taskId} -->`;
const COMMENTS = "evidence.comments";

// The bundle folder, or null when the workspace has no local folder.
export function evidenceFolder(store, taskId) {
  const root = contentBinding(store)?.workspaceRoot;
  if (!root || !SAFE_ID.test(String(taskId)) || taskId.includes(".."))
    return null;
  return path.join(root, ".avoozl", "local", "evidence", taskId);
}

function readBundle(folder) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(folder, "bundle.json"), "utf8"),
    );
    return Array.isArray(value?.entries) ? value : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeBundle(folder, bundle) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, "bundle.json"),
    temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(bundle, null, 1) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

// Whether text may be stored: the secret screen, then the content rules.
function clean(store, text, repository) {
  if (secretReason(text) || PUBLISH_RULES.some((r) => r.pattern.test(text)))
    return false;
  try {
    const result = check(store, {
      boundary: "evidence",
      repository,
      target: "evidence",
      text,
    });
    return !result.findings.length && !result.unavailable.length;
  } catch {
    return false;
  }
}

// Add one entry. Never throws for a write the workspace cannot hold: the
// bundle is a record, and a task does not stop for it. Returns the entry,
// or null when nothing was written.
export function addEvidence(
  store,
  taskId,
  { kind, source, text, key = null, repository = null, at = null },
) {
  if (!EVIDENCE_KINDS.includes(kind)) throw Error(`Unknown evidence ${kind}.`);
  const folder = evidenceFolder(store, taskId);
  if (!folder || store.readOnly) return null;
  try {
    const bundle = readBundle(folder);
    if (key && bundle.entries.some((e) => e.key === key)) return null;
    const value = String(text ?? "")
        .trim()
        .slice(0, MAX_TEXT),
      ok = value ? clean(store, value, repository) : true,
      entry = {
        id: `e${(bundle.last || 0) + 1}`,
        kind,
        at: at || new Date().toISOString(),
        source: String(source || "avoozl").slice(0, 100),
        text: ok ? value : REDACTED,
        ...(ok ? {} : { redacted: true }),
        ...(key ? { key: String(key).slice(0, 300) } : {}),
      };
    bundle.last = (bundle.last || 0) + 1;
    bundle.entries = [...bundle.entries, entry].slice(-MAX_ENTRIES);
    writeBundle(folder, bundle);
    return entry;
  } catch {
    return null;
  }
}

// A worker's attachments (R76.1, R76.2): `[{kind: "file", path, note?}]`
// or `[{kind: "note", text}]`. Checked in full before anything is copied,
// so a refused list writes nothing.
export function evidenceInput(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 10)
    fail("Attach evidence as a list of 1–10 entries.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      fail("Each evidence entry is an object.");
    if (entry.kind === "note") {
      if (
        typeof entry.text !== "string" ||
        !entry.text.trim() ||
        entry.text.length > MAX_TEXT ||
        Object.keys(entry).some((k) => !["kind", "text"].includes(k))
      )
        fail(
          `A note is {kind: "note", text} of at most ${MAX_TEXT} characters.`,
        );
      return { kind: "note", text: entry.text.trim() };
    }
    if (
      entry.kind !== "file" ||
      typeof entry.path !== "string" ||
      !path.isAbsolute(entry.path) ||
      Object.keys(entry).some((k) => !["kind", "path", "note"].includes(k)) ||
      (entry.note !== undefined &&
        (typeof entry.note !== "string" || entry.note.length > 500))
    )
      fail(
        'A file is {kind: "file", path: "<absolute path>", note?} with a note of at most 500 characters.',
      );
    const type = TYPES[path.extname(entry.path).toLowerCase()];
    if (!type)
      fail(
        `Attach an image or video (${Object.keys(TYPES).join(", ")}): ${path.basename(entry.path)} is neither.`,
      );
    let stat;
    try {
      stat = fs.statSync(entry.path);
    } catch {
      fail(`Cannot read ${path.basename(entry.path)}.`, 404);
    }
    if (!stat.isFile()) fail(`${path.basename(entry.path)} is not a file.`);
    if (stat.size > MAX_FILE_BYTES)
      fail(
        `${path.basename(entry.path)} is ${Math.ceil(stat.size / 1048576)} MB; attach at most 20 MB.`,
        413,
      );
    return {
      kind: "file",
      path: entry.path,
      type,
      size: stat.size,
      ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    };
  });
}

// Copy checked attachments into the bundle, each as one `file` entry.
export function attachEvidence(store, taskId, entries, { source, repository }) {
  const folder = evidenceFolder(store, taskId),
    added = [];
  if (!folder || !entries?.length) return added;
  for (const entry of entries) {
    if (entry.kind === "note") {
      const note = addEvidence(store, taskId, {
        kind: "note",
        source,
        text: entry.text,
        repository,
      });
      if (note) added.push(note);
      continue;
    }
    const base = path
        .basename(entry.path)
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .slice(-80),
      bytes = fs.readFileSync(entry.path),
      sha256 = createHash("sha256").update(bytes).digest("hex"),
      name = `${sha256.slice(0, 12)}-${base}`;
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(folder, name), bytes, { mode: 0o600 });
    const made = addEvidence(store, taskId, {
      kind: "file",
      source,
      text: entry.note || base,
      key: `file:${sha256}`,
      repository,
    });
    if (!made) continue;
    // The file's own fields, set after the text passed its screen.
    const bundle = readBundle(folder);
    bundle.entries = bundle.entries.map((e) =>
      e.id === made.id
        ? { ...e, file: { name, type: entry.type, size: entry.size, sha256 } }
        : e,
    );
    writeBundle(folder, bundle);
    added.push({
      ...made,
      file: { name, type: entry.type, size: entry.size, sha256 },
    });
  }
  return added;
}

// task.evidence: the bundle, newest first (R76.3); with `file`, that one
// attachment as base64 for the drawer.
export function taskEvidence(store, input = {}) {
  const taskId = input.taskId,
    folder = evidenceFolder(store, taskId);
  if (!folder) return { taskId, entries: [] };
  const bundle = readBundle(folder);
  if (input.file !== undefined) {
    const entry = bundle.entries.find((e) => e.file?.name === input.file);
    if (!entry) fail("That evidence file is not in this task's bundle.", 404);
    const bytes = fs.readFileSync(path.join(folder, entry.file.name));
    return {
      taskId,
      file: entry.file,
      base64: bytes.toString("base64"),
    };
  }
  return {
    taskId,
    entries: [...bundle.entries].reverse().map(({ key, ...entry }) => entry),
  };
}

// The pull request comment's text (R76.4): the summary only, newest first,
// no attached files. The marker finds it again.
export function evidenceSummary(taskId, entries) {
  const lines = [
    MARKER(taskId),
    "### Evidence",
    "",
    "What this change found, decided and checked, newest first.",
    "",
  ];
  for (const e of [...entries].reverse().slice(0, 30)) {
    const text = e.text.replace(/\s+/g, " ").slice(0, 300);
    lines.push(
      `- **${e.kind}** (${e.at.slice(0, 16).replace("T", " ")} UTC)${e.kind === "file" && e.file ? ` ${e.file.type}, ${Math.ceil(e.file.size / 1024)} KB, kept with the task:` : ":"} ${text}`,
    );
  }
  return lines.join("\n");
}

// The tick's step: one comment per open pull request of a task with a
// bundle, created once and updated in place when the bundle changes. The
// write goes through the guarded client, so the content rules check it at
// the `github` boundary. A leak of the planning repository is not posted.
export async function evidenceCommentStep(
  store,
  github,
  { leak = () => null } = {},
) {
  const notify = [];
  if (!github?.createIssueComment) return { notify };
  const posted = store.getMeta(COMMENTS) || {};
  let rows;
  try {
    rows = store.list("pr_feedback");
  } catch {
    return { notify };
  }
  let changed = false;
  for (const row of rows) {
    if (!row.pull?.number || !row.repository) continue;
    const folder = evidenceFolder(store, row.taskId);
    if (!folder) continue;
    const { entries } = readBundle(folder);
    if (!entries.length) continue;
    const body = evidenceSummary(row.taskId, entries),
      hash = createHash("sha256").update(body).digest("hex"),
      key = `${row.repository}#${row.pull.number}`,
      seen = posted[row.taskId];
    if (seen?.key === key && seen.hash === hash) continue;
    if (leak(body)) continue;
    try {
      let id = seen?.key === key ? seen.id : null;
      if (!id && github.listIssueComments) {
        const comments = await github.listIssueComments(
          row.repository,
          row.pull.number,
        );
        id =
          (comments || []).find((c) =>
            String(c.body || "").startsWith(MARKER(row.taskId)),
          )?.id ?? null;
      }
      const result = id
        ? await github.updateIssueComment(row.repository, id, body)
        : await github.createIssueComment(
            row.repository,
            row.pull.number,
            body,
          );
      posted[row.taskId] = { key, id: id ?? result?.id ?? null, hash };
      changed = true;
    } catch (error) {
      if (!error.contentBlocked)
        notify.push({
          channel: "failure",
          task: row.taskId,
          title: `Avoozl could not update ${row.taskId}'s evidence comment`,
          text: error.message,
        });
    }
  }
  if (changed) store.setMeta(COMMENTS, posted);
  return { notify };
}

// The driver export (R76.5): each task's bundle with its files.
export function exportEvidence(store, taskIds) {
  const out = {};
  for (const id of taskIds) {
    const folder = evidenceFolder(store, id);
    if (!folder) continue;
    const bundle = readBundle(folder);
    if (!bundle.entries.length) continue;
    const files = {};
    for (const e of bundle.entries)
      if (e.file?.name)
        try {
          files[e.file.name] = fs
            .readFileSync(path.join(folder, e.file.name))
            .toString("base64");
        } catch {}
    out[id] = { bundle, files };
  }
  return out;
}

// On take-over: a bundle this machine lacks comes over whole.
export function importEvidence(store, value) {
  if (!value || typeof value !== "object") return;
  for (const [id, { bundle, files } = {}] of Object.entries(value)) {
    const folder = evidenceFolder(store, id);
    if (!folder || !Array.isArray(bundle?.entries)) continue;
    if (readBundle(folder).entries.length) continue;
    for (const [name, base64] of Object.entries(files || {}))
      if (/^[0-9a-f]{12}-[A-Za-z0-9._-]{1,80}$/.test(name)) {
        fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
        fs.writeFileSync(
          path.join(folder, name),
          Buffer.from(String(base64), "base64"),
          { mode: 0o600 },
        );
      }
    writeBundle(folder, bundle);
  }
}
