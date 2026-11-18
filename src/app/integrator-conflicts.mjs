// Conflicts in an integrator train (landing-trains LT6, design D8). A
// conflict while stacking a member is settled only by a rule the repository
// declares in `conflicts.mechanical`: `union` (append both sides),
// `regenerate` (take the member's side and run a command that rewrites the
// file, such as a lockfile) or `format` (accept two sides that differ only in
// whitespace). The rule's `verify` must pass before the file is staged; a
// failed one leaves the file unstaged and the conflict semantic. Any other
// conflict is semantic: that member is dropped, the rest of the train goes on,
// and the member's worker chat gets the files and the earlier boundary
// through `sendConflictBack`, counted against the repository's `conflicts.maxAttempts`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandEvidence, git } from "./git.mjs";
import { landGit } from "./integrator-stack.mjs";
import { sendConflictBack } from "./landing-conflicts.mjs";
import { globMatch } from "./path-glob.mjs";

const TABLE = "landing_queue";

// The rules in force: `landing.unionPaths` as `union` rules, then the
// declared mechanical rules.
export const mechanicalRules = (config, settings) => [
  ...(config?.landing?.unionPaths ?? []).map((file) => ({
    paths: [file],
    strategy: "union",
  })),
  ...(settings?.conflicts?.mechanical ?? []),
];

const fill = (argv, file) => argv.map((a) => a.replaceAll("{file}", file));

// One side of a conflicted path from the index: 1 base, 2 ours (the stack),
// 3 theirs (the member's commit).
async function stage(dir, n, file) {
  try {
    return await git(dir, ["show", `:${n}:${file}`]);
  } catch {
    return "";
  }
}

const withTemp = async (fn) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-resolve-"));
  try {
    return await fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

// Both sides appended, as `git merge-file --union`. Written, not staged.
async function unionText(dir, file) {
  return withTemp(async (tmp) => {
    const names = ["ours", "base", "theirs"].map((n) => path.join(tmp, n)),
      texts = [
        await stage(dir, 2, file),
        await stage(dir, 1, file),
        await stage(dir, 3, file),
      ];
    names.forEach((name, i) =>
      fs.writeFileSync(name, texts[i] ? texts[i] + "\n" : ""),
    );
    const merged = await git(dir, ["merge-file", "-p", "--union", ...names]);
    return merged ? merged + "\n" : "";
  });
}

// Applies one rule's strategy to one file in the landing worktree. Returns
// true when the file now holds the resolution (not yet verified or staged).
async function apply(rule, { dir, file, run, timeoutMs }) {
  const target = path.join(dir, file);
  if (rule.strategy === "union") {
    fs.writeFileSync(target, await unionText(dir, file));
    return true;
  }
  if (rule.strategy === "regenerate") {
    await landGit(dir, ["checkout", "--theirs", "--", file]);
    const result = await run(dir, fill(rule.command, file), { timeoutMs });
    return result.exitCode === 0;
  }
  // format: both sides, formatted when a command is declared, must be equal
  // apart from whitespace.
  const sides = [];
  for (const n of [2, 3]) {
    fs.writeFileSync(target, await stage(dir, n, file));
    if (rule.command) {
      const result = await run(dir, fill(rule.command, file), { timeoutMs });
      if (result.exitCode !== 0) return false;
    }
    sides.push(fs.readFileSync(target, "utf8"));
  }
  const same = (s) => s.replace(/\s+/g, " ").trim();
  if (same(sides[0]) !== same(sides[1])) return false;
  fs.writeFileSync(target, sides[0]);
  return true;
}

const hasMarkers = (dir, file) =>
  /^(<<<<<<<|>>>>>>>)( |$)/m.test(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );

// The resolver `stackMembers` calls on a conflicted replay. `cheap` is the
// target's cheap checks, the default `verify`. Returns true when every file
// was resolved by a rule and verified; the files are then staged. On any
// failure nothing is staged.
//
// With `chat` (the integrator resolver chat, integrator-resolver.mjs), a file
// whose rule failed is put back in conflict and offered to the chat; the file
// still has to pass its `verify` and hold no conflict markers. A file no rule
// covers is never offered: the whole conflict is semantic.
export function mechanicalResolver({
  rules,
  cheap = [],
  timeoutMs,
  run = commandEvidence,
  chat = null,
}) {
  return async ({ dir, files, member }) => {
    if (!rules.length) return false;
    const picked = [];
    for (const file of files) {
      const rule = rules.find((r) => r.paths.some((g) => globMatch(g, file)));
      if (!rule) return false;
      picked.push({ file, rule });
    }
    // Each rule's own verify runs on its file; the cheap checks run once for
    // the files whose rule names none.
    const verifies = async ({ file, rule }) =>
      !rule.verify ||
      (await run(dir, fill(rule.verify, file), { timeoutMs })).exitCode === 0;
    const failed = [];
    for (const one of picked)
      if (
        !(await apply(one.rule, { dir, file: one.file, run, timeoutMs })) ||
        !(await verifies(one))
      )
        failed.push(one);
    if (failed.length) {
      if (!chat) return false;
      for (const { file } of failed)
        await landGit(dir, ["checkout", "--merge", "--", file]);
      const finished = await chat({
        dir,
        files: failed.map((f) => f.file),
        rules: Object.fromEntries(failed.map((f) => [f.file, f.rule])),
        member,
      });
      if (!finished) return false;
      for (const one of failed)
        if (hasMarkers(dir, one.file) || !(await verifies(one))) return false;
    }
    const needCheap = picked.some(({ rule }) => !rule.verify);
    if (needCheap)
      for (const argv of cheap) {
        const result = await run(dir, argv, { timeoutMs });
        if (result.exitCode !== 0) return false;
      }
    for (const { file } of picked) await landGit(dir, ["add", "--", file]);
    return true;
  };
}

// Sends a dropped member back to its task (LT6.5). The entry leaves the
// queue as `returned` once a worker chat takes it, else `ejected` with a
// Needs you notice (the delivery goes to a decision). Returns
// {messages, notify}.
export function returnConflicted(
  store,
  { entry, files, against, baseHead, rounds, now = Date.now() },
) {
  const current = store.get(TABLE, entry.id) ?? entry,
    given = { ...current, files, baseHead, against },
    sent = sendConflictBack(
      store,
      { state: "conflict", entry: given },
      { rounds, now },
    );
  store.put(TABLE, {
    ...current,
    state: sent.messages.length ? "returned" : "ejected",
    train: null,
    reason: `conflict in ${files.slice(0, 5).join(", ")}`,
    files,
    finishedAt: new Date(now).toISOString(),
  });
  return sent;
}
