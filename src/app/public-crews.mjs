// Crews on public repositories, layer 2 (Requirement 85.3 and 85.4, design
// §6.14): `avoozl content hook` is a crew agent's preToolUse command. It
// reads one shell call from stdin and, for a write to GitHub, runs content
// rules on the call's text before the call runs. Exit 2 refuses the call and
// names the rule set, rule id and place, never the matched text.
//
// shortcut: it reads the call, not what a script, `python -c` or a build
// tool does when run. Upgrade when Kiro Crew routes crew writes through one
// tool. The audit on the tick (39.2) covers what this cannot see.
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
import { AVOOZL_CREW_LABEL, parseRepository } from "./github.mjs";
import { CREW_LABEL_DEFAULTS } from "./github-policy.mjs";
import { Store } from "./store.mjs";

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

// ---- Layer 3: the audit on the tick (R85.6, R85.7, design §6.14) ---------
// For each public repository in the GitHub policy, the tick reads what
// changed since a per-repository cursor and keeps what a crew wrote: an item
// that carries the crew marker, a pull request from a `crew/` branch, and an
// issue, pull request or comment by the signed-in login on a thread with a
// crew label. Content rules check each. A comment hit is deleted, never
// edited, because GitHub keeps edit history. A pull request or issue hit is
// closed and a crew branch deleted. One stop holds the repository, and each
// pass with a new hit sends one notice. Records keep who, what, when and a
// hash, never the text.
//
// shortcut: pull request review comments are not read, and only the 100 most
// recently updated pull requests are. Upgrade when Kiro Crew routes crew
// writes through one tool.
const MARKER = "kirocrew-crew v=1",
  BRANCH_PREFIX = "crew/",
  CURSORS = "publicCrewAuditCursors",
  FOUND = "publicCrewAudit",
  MAX_SEEN = 500,
  MAX_HITS = 50;
// The audit's cursors: the sign-off reads them to tell the audit is on.
export const AUDIT_CURSORS = CURSORS;
export const FIRST_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const STAYS_REACHABLE =
  "A pull request body, a commit or an edit history can stay reachable on GitHub by its address after deletion; removing it for good needs a request to GitHub.";

const lower = (value) => String(value ?? "").toLowerCase();
const iso = (ms) => new Date(ms).toISOString();
const labelsOf = (item) =>
  (item?.labels || []).map((label) => String(label?.name ?? label));
const marked = (item) => String(item?.body ?? "").includes(MARKER);
const textLines = (target, text) =>
  String(text ?? "")
    .split("\n")
    .map((line, i) => ({ target, line: i + 1, text: line }));

function crewLabel(entry) {
  const own = new Set(
    Object.values(entry?.crewLabels || CREW_LABEL_DEFAULTS).map(lower),
  );
  return (labels) =>
    labels.some((name) => {
      const n = lower(name);
      return own.has(n) || (n.startsWith("crew:") && n !== AVOOZL_CREW_LABEL);
    });
}

// Block findings as {set, rule, place, hash}; the hash is of the matched
// line, so a record can be matched later without keeping the text.
function scan(store, repository, boundary, added) {
  if (!added.length) return { hits: [], unavailable: [] };
  const result = check(store, {
      boundary,
      repository,
      target: "audit",
      added,
    }),
    text = new Map(added.map((l) => [`${l.target}\0${l.line}`, l.text]));
  return {
    hits: result.findings
      .filter((f) => f.action === "block")
      .map((f) => ({
        set: f.set,
        rule: f.rule,
        place: `${f.target}${f.line ? ` line ${f.line}` : ""}`,
        hash: sha256(text.get(`${f.target}\0${f.line}`) ?? ""),
      })),
    unavailable: result.unavailable,
  };
}

// What the crew wrote since the cursor, as items to check.
async function crewWrites(github, repository, entry, cursor, since, login) {
  const isCrewLabel = crewLabel(entry),
    mine = (item) => login && lower(item?.user?.login) === lower(login),
    issues = await github.issuesSince(repository, since),
    pulls = await github.recentlyUpdatedPullRequests(repository),
    comments = await github.issueCommentsSince(repository, since),
    sameRepo = (pr) =>
      !pr.head?.repo?.full_name ||
      lower(pr.head.repo.full_name) === lower(repository),
    crewBranch = (pr) =>
      sameRepo(pr) && String(pr.head?.ref ?? "").startsWith(BRANCH_PREFIX),
    threads = new Map(),
    items = [];
  for (const issue of issues)
    threads.set(issue.number, {
      crew: isCrewLabel(labelsOf(issue)) || marked(issue),
    });
  for (const pr of pulls) {
    const crew =
      crewBranch(pr) || isCrewLabel(labelsOf(pr)) || marked(pr) || false;
    threads.set(pr.number, { crew: crew || threads.get(pr.number)?.crew });
    if (String(pr.updated_at ?? "") < since) continue;
    if (!(crewBranch(pr) || marked(pr) || (crew && mine(pr)))) continue;
    items.push({
      kind: "pull",
      key: `pull:${pr.number}`,
      number: pr.number,
      state: pr.state,
      branch: crewBranch(pr) ? pr.head.ref : null,
      link: pr.html_url ?? null,
      who: pr.user?.login ?? null,
      when: pr.updated_at ?? null,
      boundary: "github",
      lines: [
        ...textLines(`pull #${pr.number} title`, pr.title),
        ...textLines(`pull #${pr.number} body`, pr.body),
        ...labelsOf(pr).map((name, i) => ({
          target: `pull #${pr.number} label ${i + 1}`,
          line: 1,
          text: name,
        })),
      ],
    });
  }
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (!(marked(issue) || (threads.get(issue.number)?.crew && mine(issue))))
      continue;
    items.push({
      kind: "issue",
      key: `issue:${issue.number}`,
      number: issue.number,
      state: issue.state,
      link: issue.html_url ?? null,
      who: issue.user?.login ?? null,
      when: issue.updated_at ?? null,
      boundary: "github",
      lines: [
        ...textLines(`issue #${issue.number} title`, issue.title),
        ...textLines(`issue #${issue.number} body`, issue.body),
        ...labelsOf(issue).map((name, i) => ({
          target: `issue #${issue.number} label ${i + 1}`,
          line: 1,
          text: name,
        })),
      ],
    });
  }
  for (const comment of comments) {
    const number = Number(
      /\/issues\/(\d+)$/.exec(String(comment.issue_url ?? ""))?.[1],
    );
    if (!(marked(comment) || (threads.get(number)?.crew && mine(comment))))
      continue;
    items.push({
      kind: "comment",
      key: `comment:${comment.id}`,
      id: comment.id,
      number,
      link: comment.html_url ?? null,
      who: comment.user?.login ?? null,
      when: comment.updated_at ?? comment.created_at ?? null,
      boundary: "github",
      lines: textLines(`comment on #${number}`, comment.body),
    });
  }
  // Crew branches: the name, and for a new or moved branch its commits'
  // messages and added lines.
  const refs = await github.branchesUnder(repository, BRANCH_PREFIX),
    branches = {};
  let base = cursor.defaultBranch ?? null;
  for (const ref of refs) {
    const name = String(ref.ref ?? "").replace(/^refs\/heads\//, ""),
      sha = ref.object?.sha ?? null;
    if (!name.startsWith(BRANCH_PREFIX)) continue;
    branches[name] = sha;
    if (cursor.branches?.[name] === sha) continue;
    base ??= (await github.repository(parseRepository(repository)))
      ?.default_branch;
    const previous = cursor.branches?.[name],
      compared = await (previous
        ? github
            .compareCommits(repository, previous, name)
            .catch(() => github.compareCommits(repository, base, name))
        : github.compareCommits(repository, base, name)),
      lines = [
        { target: "ref:1", line: 1, text: name },
        ...(compared?.commits ?? []).flatMap((commit, i) =>
          textLines(`commit:${i + 1}`, commit.commit?.message),
        ),
        ...(compared?.files ?? []).flatMap((file) =>
          patchAdded(file.filename, file.patch),
        ),
      ];
    items.push({
      kind: "branch",
      key: `branch:${name}@${sha}`,
      branch: name,
      sha,
      link: `https://github.com/${repository}/tree/${name.split("/").map(encodeURIComponent).join("/")}`,
      who: compared?.commits?.at(-1)?.author?.login ?? null,
      when: compared?.commits?.at(-1)?.commit?.committer?.date ?? null,
      boundary: "diff",
      lines,
      pulls: pulls.filter(
        (pr) => pr.state === "open" && sameRepo(pr) && pr.head?.ref === name,
      ),
    });
  }
  return { items, branches, defaultBranch: base };
}

// Delete, close and remove what matched. Returns the actions taken.
async function remove(github, repository, item) {
  if (item.kind === "comment") {
    await github.deleteIssueComment(repository, item.id);
    return ["deleted comment"];
  }
  const done = [];
  const close = async (number) => {
    await github.updateIssue(repository, number, { state: "closed" });
    done.push(`closed #${number}`);
  };
  if (item.kind === "issue" || item.kind === "pull") {
    if (item.state !== "closed") await close(item.number);
  } else for (const pr of item.pulls) await close(pr.number);
  if (item.branch) {
    await github.deleteBranch(repository, item.branch);
    done.push(`deleted branch ${item.branch}`);
  }
  return done;
}

// One stop for the repository, opened once and kept until a person resumes.
function raise(store, repository, records, now) {
  const at = iso(now),
    all = { ...(store.getMeta(FOUND) ?? {}) },
    open = all[repository] && store.get("flow_stops", all[repository].stopId);
  if (open && !open.closedAt) {
    all[repository] = {
      ...all[repository],
      records: [...all[repository].records, ...records].slice(-MAX_HITS),
    };
  } else {
    const stopId = `stop:public-crew-audit:${repository}:${Date.parse(at)}`;
    store.put("flow_stops", {
      id: stopId,
      manual: true,
      by: { kind: "system", name: "public crew audit" },
      reason: `The public crew audit found a content rule match on ${repository}.`,
      scope: "repo",
      projectId: repository,
      planId: null,
      spec: null,
      taskId: null,
      check: null,
      culprit: null,
      fixTaskId: null,
      openedAt: at,
      closedAt: null,
      runAnyway: null,
    });
    all[repository] = { at, stopId, records: records.slice(-MAX_HITS) };
  }
  store.setMeta(FOUND, all);
}

const hitText = (r) =>
  `${r.set} rule ${r.rule} at ${r.place} (${r.link ?? r.what})`;

// The tick step: {notify, errors}. A repository whose read, check or removal
// failed keeps its cursor, so the next tick reads it again.
export async function publicCrewAudit(
  store,
  github,
  { policy, now = Date.now() } = {},
) {
  const notify = [],
    errors = [];
  if (!github?.available?.()) return { notify, errors };
  const repositories = Object.entries(policy?.repositories ?? {}).filter(
    ([id]) => store.get("github_repositories", id)?.private === false,
  );
  if (!repositories.length) return { notify, errors };
  let login = null;
  try {
    login = (await github.currentUser())?.login ?? null;
  } catch {
    // Without a login only the marker and the branch prefix find crew writes.
  }
  for (const [repository, entry] of repositories) {
    const cursors = store.getMeta(CURSORS) ?? {},
      cursor = cursors[repository] ?? {},
      since = cursor.since ?? iso(now - FIRST_LOOKBACK_MS),
      seen = new Set(cursor.seen ?? []),
      records = [];
    let ok = true;
    try {
      const found = await crewWrites(
        github,
        repository,
        entry,
        cursor,
        since,
        login,
      );
      for (const item of found.items) {
        if (seen.has(item.key)) continue;
        const { hits, unavailable } = scan(
          store,
          repository,
          item.boundary,
          item.lines,
        );
        if (unavailable.length) {
          ok = false;
          errors.push(
            `${repository}: content rule set ${unavailable.map((u) => `${u.set} (${u.reason})`).join(", ")} is unavailable, so the audit could not check it.`,
          );
          break;
        }
        if (!hits.length) continue;
        let actions = [],
          error = null;
        try {
          actions = await remove(github, repository, item);
          seen.add(item.key);
        } catch (failure) {
          ok = false;
          error = failure.message;
          errors.push(
            `${repository}: the audit could not remove ${item.link ?? item.key}: ${failure.message}`,
          );
        }
        for (const hit of hits)
          records.push({
            ...hit,
            what: item.key,
            link: item.link,
            who: item.who,
            when: item.when,
            foundAt: iso(now),
            actions,
            ...(error ? { error } : {}),
          });
      }
      if (ok)
        store.setMeta(CURSORS, {
          ...cursors,
          [repository]: {
            since: iso(now),
            branches: found.branches,
            defaultBranch: found.defaultBranch,
            seen: [...seen].slice(-MAX_SEEN),
          },
        });
    } catch (failure) {
      errors.push(`${repository}: the audit failed: ${failure.message}`);
    }
    if (!records.length) continue;
    raise(store, repository, records, now);
    notify.push({
      channel: "failure",
      title: `A public crew's write on ${repository} matched content rules`,
      text: `${[...new Set(records.map(hitText))].join("; ")}. Avoozl removed it and stopped the line for ${repository}. ${STAYS_REACHABLE}`,
      resume:
        "Check what was removed, then press Resume on the Dashboard banner.",
    });
  }
  return { notify, errors };
}

// Needs you: one row per repository while its audit stop is open.
export function publicCrewAuditRows(store) {
  return Object.entries(store.getMeta(FOUND) ?? {})
    .filter(([, found]) => {
      const stop = store.get("flow_stops", found.stopId);
      return stop && !stop.closedAt;
    })
    .map(([repository, found]) => ({
      kind: "needs-human",
      reason: "public-crew-audit",
      id: `public-crew-audit:${repository}`,
      taskId: null,
      authority: "github",
      link: found.records.find((r) => r.link)?.link ?? null,
      title: `A public crew's write on ${repository} matched content rules`,
      detail: `${[...new Set(found.records.map(hitText))].join("; ")}. Avoozl removed what it could and stopped the line. ${STAYS_REACHABLE}`,
      openedAt: found.at,
    }));
}
