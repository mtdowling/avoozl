// The content hook: `avoozl content hook` is a pre-tool-use command for any
// agent. It reads one shell call from stdin and, for a write to GitHub or a
// push, runs content rules on the call's text and the lines it would publish
// before the call runs. Exit 2 refuses the call and names the rule set, rule
// id and place, never the matched text.
//
// shortcut: it reads the call, not what a script, `python -c` or a build
// tool does when run. Upgrade when agent writes go through one tool.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  bindContentRules,
  check,
  findingText,
  patchAdded,
  pushLines,
  sha256,
} from "./content-rules.mjs";
import { Store } from "../store/store.mjs";

const MAX_STDIN = 1024 * 1024;
const WRAPPERS = new Set(["env", "command", "time", "sudo", "nohup", "exec"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);
const WRITES = {
  issue: new Set(["create", "comment", "edit"]),
  pr: new Set(["create", "edit", "comment", "review", "merge"]),
};
const GIT_WRITES = new Set(["commit", "tag", "push"]);
// Flags whose next word is a file holding text.
const FILE_FLAGS = new Set(["--body-file", "-F", "--file", "--input"]);
const GIT_VALUE_FLAGS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
]);

// ---------------------------------------------------------------------------
// Shell lines: split into commands and words. A word that comes from an
// expansion ($VAR, $(...), backticks, <(...)) is marked `dynamic`: its text
// is not in the call. A here-document's body is skipped, and the command
// carrying it is marked `heredoc`.

export function parseShell(input) {
  const s = String(input ?? "").replace(/\\\r?\n/g, ""),
    commands = [],
    pending = [];
  let words = [],
    cur = null,
    heredoc = false,
    i = 0;
  const word = () => (cur ??= { text: "", dynamic: false }),
    endWord = () => {
      if (cur) words.push(cur);
      cur = null;
    },
    endCommand = () => {
      endWord();
      if (words.length || heredoc) commands.push({ words, heredoc });
      words = [];
      heredoc = false;
    };
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      const end = s.indexOf("'", i + 1),
        stop = end < 0 ? s.length : end;
      word().text += s.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '"') {
      word();
      i += 1;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && '"\\$`'.includes(s[i + 1] ?? "")) {
          cur.text += s[i + 1];
          i += 2;
          continue;
        }
        if (
          s[i] === "`" ||
          (s[i] === "$" && /[A-Za-z_{(0-9@*#?!$'-]/.test(s[i + 1] ?? ""))
        )
          cur.dynamic = true;
        cur.text += s[i];
        i += 1;
      }
      i += 1;
    } else if (c === "\\") {
      word().text += s[i + 1] ?? "";
      i += 2;
    } else if (
      c === "`" ||
      (c === "$" && /[A-Za-z_{('0-9@*#?!$-]/.test(s[i + 1] ?? ""))
    ) {
      word().dynamic = true;
      cur.text += c;
      i += 1;
    } else if (c === "<" && s[i + 1] === "(") {
      word().dynamic = true;
      cur.text += c;
      i += 1;
    } else if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<") {
      endWord();
      heredoc = true;
      i += s[i + 2] === "-" ? 3 : 2;
      while (s[i] === " " || s[i] === "\t") i += 1;
      let delimiter = "";
      while (i < s.length && !/[\s;&|<>]/.test(s[i])) {
        if (s[i] !== "'" && s[i] !== '"' && s[i] !== "\\") delimiter += s[i];
        i += 1;
      }
      pending.push(delimiter);
    } else if (c === "\n") {
      endCommand();
      i += 1;
      while (pending.length) {
        const delimiter = pending.shift();
        while (i < s.length) {
          const end = s.indexOf("\n", i),
            stop = end < 0 ? s.length : end,
            line = s.slice(i, stop).trim();
          i = stop + 1;
          if (line === delimiter) break;
        }
      }
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i += 1;
    } else if (c === ";" || c === "|" || c === "&") {
      if (c === "&" && /[<>]/.test(s[i - 1] ?? "")) {
        word().text += c;
      } else endCommand();
      i += 1;
    } else if (c === "#" && !cur) {
      while (i < s.length && s[i] !== "\n") i += 1;
    } else {
      word().text += c;
      i += 1;
    }
  }
  endCommand();
  return commands;
}

// One command with leading assignments and wrappers removed. A readable
// `sh -c "..."` string is parsed again; `cd DIR` moves the folder the later
// commands run in.
function* flatten(commands, cwd) {
  let at = cwd;
  for (const { words, heredoc } of commands) {
    let list = [...words];
    while (list.length) {
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(list[0].text)) list.shift();
      else if (WRAPPERS.has(path.basename(list[0].text))) list.shift();
      else break;
    }
    if (!list.length) continue;
    const name = path.basename(list[0].text);
    if (name === "cd" && list[1] && !list[1].dynamic) {
      at = path.resolve(at, list[1].text);
      continue;
    }
    if (SHELLS.has(name)) {
      const dash = list.findIndex((w) => /^-[A-Za-z]*c$/.test(w.text)),
        inner = dash > 0 ? list[dash + 1] : null;
      if (inner && !inner.dynamic) {
        yield* flatten(parseShell(inner.text), at);
        continue;
      }
    }
    yield { words: list, heredoc, cwd: at };
  }
}

// ---------------------------------------------------------------------------
// What a call writes. Every argument word of a write command is scanned (the
// text, labels, branch and remote names alike), so no flag table can miss a
// place text goes. Files named by a body or message file flag are read.

function classify(words) {
  const program = path.basename(words[0].text),
    first = words[1]?.text,
    second = words[2]?.text;
  if (program === "git") {
    let i = 1;
    while (i < words.length && words[i].text.startsWith("-"))
      i += GIT_VALUE_FLAGS.has(words[i].text) ? 2 : 1;
    const sub = words[i]?.text;
    return GIT_WRITES.has(sub) ? { kind: "git", sub, at: i } : null;
  }
  if (program !== "gh") return null;
  if (first === "api") {
    const texts = words.slice(2).map((w) => w.text),
      method = texts.findIndex((t) => /^(-X|--method)(=|$)/.test(t)),
      value =
        method < 0
          ? null
          : texts[method].includes("=")
            ? texts[method].split("=")[1]
            : texts[method + 1],
      fields = texts.some((t) =>
        /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(t),
      );
    return fields || (value && value.toUpperCase() !== "GET")
      ? { kind: "api" }
      : null;
  }
  return WRITES[first]?.has(second) ? { kind: first, sub: second } : null;
}

const repositoryFrom = (words, cwd) => {
  const flag = words.findIndex((w) => /^(-R|--repo)(=|$)/.test(w.text));
  if (flag >= 0) {
    const w = words[flag].text;
    return w.includes("=") ? w.split("=")[1] : words[flag + 1]?.text;
  }
  const api = words.find((w) => /^\/?repos\/[^/]+\/[^/]+/.test(w.text));
  if (api)
    return api.text
      .replace(/^\/?repos\//, "")
      .split("/")
      .slice(0, 2)
      .join("/");
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(url)?.[1];
  } catch {
    return null;
  }
};

const git = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

// The base a push or pull request is measured against: the merge base of
// `head` with the first remote branch that exists.
function baseFor(cwd, head, remote, branches) {
  for (const name of [...branches, "HEAD", "main", "master"].filter(Boolean))
    try {
      return git(cwd, ["merge-base", head, `refs/remotes/${remote}/${name}`]);
    } catch {}
  throw Error("no remote branch to measure the commits against");
}

// {texts, outgoing, refusals} for one write command.
function writeOf(command, kind) {
  const { words, cwd } = command,
    refusals = [],
    texts = [],
    note = (reason) => refusals.push(reason),
    label = `${kind.kind === "git" ? "git" : "gh"} ${kind.sub ?? kind.kind}`;
  if (command.heredoc)
    note(
      `${label} takes text from a here-document, which the hook cannot read. Write the text to a file and pass the file.`,
    );
  words.forEach((w, i) => {
    if (i === 0) return;
    if (w.dynamic)
      note(
        `Argument ${i} of ${label} comes from a shell expansion, so its text cannot be read. Write the text to a file and pass the file.`,
      );
    w.text
      .split("\n")
      .forEach((text, n) =>
        texts.push({ target: `arg:${i}`, line: n + 1, text }),
      );
  });
  words.forEach((w, i) => {
    let file = null;
    const eq = /^(--[a-z-]+|-F)=(.*)$/.exec(w.text);
    if (eq && FILE_FLAGS.has(eq[1])) file = eq[2];
    else if (
      FILE_FLAGS.has(w.text) &&
      !(kind.kind === "api" && w.text === "-F")
    )
      file = words[i + 1]?.text ?? "";
    else if (kind.kind === "api" && /^(-F|--field)$/.test(w.text)) {
      const field = /^[^=]*=@(.+)$/.exec(words[i + 1]?.text ?? "");
      file = field?.[1] ?? null;
    }
    if (file === null) return;
    if (file === "-" || file === "")
      return note(
        `${label} reads its text from stdin, which the hook cannot read. Write the text to a file and pass the file.`,
      );
    try {
      fs.readFileSync(path.resolve(cwd, file), "utf8")
        .split("\n")
        .forEach((text, n) =>
          texts.push({
            target: `file:${path.basename(file)}`,
            line: n + 1,
            text,
          }),
        );
    } catch {
      note(
        `${label} names a file the hook cannot read (${path.basename(file)}).`,
      );
    }
  });
  return { texts, refusals, label };
}

// Commit messages and added lines a `git push` or `gh pr create` publishes.
function outgoingLines(command, kind) {
  const { words, cwd } = command,
    at = kind.at ?? 1,
    args = words.slice(at + 1).map((w) => w.text);
  let root = cwd;
  const topLevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  root = topLevel;
  if (kind.kind === "git") {
    if (args.some((a) => ["--all", "--mirror", "--tags"].includes(a)))
      throw Error(
        "git push with --all, --mirror or --tags names no single branch",
      );
    const positional = args.filter((a) => !a.startsWith("-")),
      remote = positional[0] ?? "origin",
      specs = positional.slice(1),
      current = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      pushes = specs.length
        ? specs.map((spec) => {
            const [src, dst = src] = spec.replace(/^\+/, "").split(":");
            return { src, dst: dst.replace(/^refs\/heads\//, "") };
          })
        : [{ src: "HEAD", dst: current }];
    return pushes
      .filter((p) => p.src)
      .flatMap((p) =>
        pushLines(root, baseFor(root, p.src, remote, [p.dst]), p.src, [p.dst]),
      );
  }
  const value = (names) => {
      const i = args.findIndex((a) =>
        names.some((n) => a === n || a.startsWith(`${n}=`)),
      );
      if (i < 0) return null;
      return args[i].includes("=") ? args[i].split("=")[1] : args[i + 1];
    },
    head = value(["--head", "-H"]) ?? "HEAD",
    base = value(["--base", "-B"]);
  const local = head === "HEAD" ? "HEAD" : head.split(":").pop();
  let ref = local;
  try {
    git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    ref = `refs/remotes/origin/${local}`;
  }
  return pushLines(root, baseFor(root, ref, "origin", [base]), ref, [local]);
}

// scanCall(store, {command, cwd}): {ok, refusals: [text]}. Never the matched
// text.
export function scanCall(store, { command, cwd = process.cwd() }) {
  const refusals = [],
    found = [];
  for (const one of flatten(parseShell(command), cwd)) {
    const kind = classify(one.words);
    if (!kind) continue;
    const { texts, refusals: problems, label } = writeOf(one, kind);
    refusals.push(...problems);
    let outgoing = [];
    if (
      kind.kind === "git"
        ? kind.sub === "push"
        : kind.kind === "pr" && kind.sub === "create"
    )
      try {
        outgoing = outgoingLines(one, kind);
      } catch (error) {
        refusals.push(
          `${label}: the hook cannot read the commits it would publish (${String(error.message).split("\n")[0].slice(0, 120)}).`,
        );
      }
    found.push({
      repository: repositoryFrom(one.words, one.cwd),
      texts,
      outgoing,
    });
  }
  for (const { repository, texts, outgoing } of found)
    for (const [boundary, added] of [
      ["github", texts],
      ["diff", outgoing],
    ]) {
      if (!added.length) continue;
      const result = check(store, {
        boundary,
        repository,
        target: "call",
        added,
      });
      for (const f of result.findings)
        if (f.action === "block")
          refusals.push(`Content rules refused this call: ${findingText(f)}.`);
      for (const u of result.unavailable)
        refusals.push(
          `Content rule set ${u.set} is unavailable (${u.reason}), so the call cannot be checked.`,
        );
    }
  return { ok: refusals.length === 0, refusals: [...new Set(refusals)] };
}

// The hook: `stdin` is the event JSON. {code, stderr}; code 2 refuses.
// A call it cannot read or check is refused, never passed.
export function contentHook({
  stdin,
  dbPath,
  workspaceRoot,
  pluginSettingsFile = null,
  configFile,
  cwd = process.cwd(),
}) {
  let event;
  try {
    event = JSON.parse(String(stdin || "{}").slice(0, MAX_STDIN));
  } catch {
    return {
      code: 2,
      stderr: "Content hook refused: the event is not JSON.\n",
    };
  }
  const command = event?.tool_input?.command;
  if (typeof command !== "string") return { code: 0, stderr: "" };
  let store;
  try {
    store = new Store(dbPath);
    bindContentRules(store, {
      workspaceRoot,
      pluginSettingsFile,
      ...(configFile ? { configFile } : {}),
    });
    const result = scanCall(store, {
      command,
      cwd: path.isAbsolute(event.cwd ?? "") ? event.cwd : cwd,
    });
    return result.ok
      ? { code: 0, stderr: "" }
      : { code: 2, stderr: result.refusals.join("\n") + "\n" };
  } catch {
    return {
      code: 2,
      stderr: "Content hook refused: it could not check this call.\n",
    };
  } finally {
    store?.close();
  }
}
