// The protections a forward passes before anything is pushed (RC26.5, design
// D31.2). `forwardGuard` runs them in order, path policy (5.1), leak scan
// (5.2), metadata scrub (5.3), and returns the first block. A later one does
// not run on a result an earlier one blocked (RC26.6). Every function here is
// pure: the caller reads the commit and the files, and this file only judges.
// A block names a rule and a place, never the matched text.
//
// shortcut: the steering rule matches any path segment named `steering`;
// a differently named steering folder needs `forwardExclude`.
import { scanForward } from "./forward-scan.mjs";
import { forwardMaxFileBytesOf } from "./mirror-policy.mjs";

// `*` is any run inside one folder, `**` any run across folders, a trailing
// `/` a whole folder. A pattern with none of these is one exact path.
export function globToRegex(pattern) {
  const source = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${source}${pattern.endsWith("/") ? ".*" : ""}$`);
}

const matches = (patterns, file) =>
  (patterns ?? []).some((pattern) => globToRegex(pattern).test(file));

// The paths a `forwardAllow` list lets through.
export const allowedPaths = (paths, mirror) =>
  paths.filter((file) => matches(mirror?.forwardAllow, file));

// The rule that keeps one path off the public repository, or null.
function pathRule(file, mirror) {
  const parts = file.split("/"),
    plans = mirror?.plansBranch;
  if (parts.includes(".kiro")) return "path-kiro";
  if (parts.at(-1).toLowerCase() === "agents.md") return "path-agents";
  if (parts.slice(0, -1).includes("steering")) return "path-steering";
  if (plans && (file === plans || file.startsWith(`${plans}/`)))
    return "path-plans-branch";
  if (matches(mirror?.forwardExclude, file)) return "path-excluded";
  return null;
}

// Protection 5.1. An excluded path blocks; it is never dropped quietly.
export function pathBlocks(paths, mirror) {
  const blocks = [];
  paths.forEach((file, index) => {
    if (matches(mirror?.forwardAllow, file)) return;
    const rule = pathRule(file, mirror);
    if (rule) blocks.push({ rule, place: `file ${index + 1}` });
  });
  return blocks;
}

// Protection 5.2, plans-branch rules (RC25.6c): the plans branch name, a
// private spec's folder or any path under it, or a commit of the plans branch
// in any path, message, branch name, title or body blocks the forward. `plans`
// is {specNames, taskIds, commits}: the private spec folder names, their task
// IDs and the commit IDs read from the plans branch. A bare spec name or task
// ID blocks too, as a whole word. A block names the rule and place only.
// shortcut: a short private spec name blocks any text holding it as a word;
// a purely numeric task ID (1.1) is not matched, rename the spec's tasks.
// shortcut: only the commits the caller lists are matched (the plans branch
// head); an older one cannot reach a forward, whose clone never fetched it.
export function plansBlocks(change, mirror, plans = {}) {
  const name = mirror?.plansBranch,
    blocks = [],
    block = (rule, place) => blocks.push({ rule, place });
  if (!name) return blocks;
  const folders = (plans.specNames ?? []).map((spec) => `.kiro/specs/${spec}`),
    commits = (plans.commits ?? []).map((id) => id.toLowerCase()),
    words = [
      ...(plans.specNames ?? []),
      ...(plans.taskIds ?? []).filter((id) => !/^[\d.]+$/.test(id)),
    ].map(
      (word) =>
        new RegExp(
          `(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
          "i",
        ),
    ),
    texts = [
      ...change.paths.map((file, index) => [`file ${index + 1}`, file]),
      ["commit message", change.message],
      ["branch name", change.branch],
      ["title", change.title],
      ["body", change.body],
    ];
  for (const [place, text] of texts) {
    const lower = String(text ?? "").toLowerCase();
    if (lower.includes(name.toLowerCase())) block("plans-branch-name", place);
    if (folders.some((folder) => lower.includes(folder.toLowerCase())))
      block("plans-spec-path", place);
    else if (words.some((word) => word.test(lower))) block("plans-name", place);
    if (
      commits.some((id) =>
        [...lower.matchAll(/\b[0-9a-f]{7,40}\b/g)].some((hit) =>
          id.startsWith(hit[0]),
        ),
      )
    )
      block("plans-commit", place);
  }
  return blocks;
}

const TRAILER = /^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9-]+:\s|^Cc:\s/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MARKER = /<!--|\bavoozl[:-][\w-]+/i;
const MIRROR_LINK = /\/(?:issues|pull)\/\d+|(?:^|[\s(])#\d+\b/;

// The last paragraph of a commit message when every line is a trailer.
function hasTrailer(message) {
  const paragraphs = String(message ?? "")
    .trim()
    .split(/\n\s*\n/);
  if (paragraphs.length < 2) return false;
  const last = paragraphs.at(-1).split("\n");
  return last.every((line) => TRAILER.test(line));
}

// The message without a trailing trailer paragraph.
export function dropTrailers(message) {
  const text = String(message ?? "").trim();
  if (!hasTrailer(text)) return text;
  return text.replace(/\n\s*\n[^\n]*(?:\n[^\n]*)*$/, "").trim();
}

// Protection 5.3. `meta` is the commit as git has it: {parents, author,
// committer, message}, each person {name, email}. `expect` is {base, person,
// email, mirror, sha}: the source base the one parent must be, the person
// who forwards, and the mirror name and mirror merge commit the text must
// not carry. `texts` are the commit message, title and body.
export function metadataBlocks(meta, expect, texts) {
  const blocks = [],
    block = (rule, place) => blocks.push({ rule, place });
  if (meta.parents.length !== 1 || meta.parents[0] !== expect.base)
    block("metadata-history", "commit");
  for (const [who, place] of [
    [meta.author, "author"],
    [meta.committer, "committer"],
  ])
    if (who.name !== expect.person || who.email !== expect.email)
      block("metadata-author", place);
  if (hasTrailer(meta.message)) block("metadata-trailer", "commit message");
  const mirror = String(expect.mirror ?? "").toLowerCase(),
    sha = String(expect.sha ?? "").toLowerCase();
  for (const [place, text] of Object.entries(texts)) {
    const lower = String(text ?? "").toLowerCase();
    if (
      (String(text ?? "").match(EMAIL) ?? []).some(
        (email) => email.toLowerCase() !== expect.email.toLowerCase(),
      )
    )
      block("metadata-email", place);
    if (MARKER.test(text ?? "")) block("metadata-marker", place);
    if (
      MIRROR_LINK.test(text ?? "") ||
      (mirror && lower.includes(mirror)) ||
      (sha && lower.includes(sha.slice(0, 7)))
    )
      block("metadata-mirror-link", place);
  }
  return blocks;
}

// forwardGuard(change, policy): {ok} or {ok: false, protection, blocks}.
// change: {paths, files, message, branch, title, body, meta, expect}.
// policy: {mirror, identity, sets}. `sets(change)` is the configured rule
// sets' answer, {rules: [names], unavailable: [set ids]}; with none given the
// built-in rules alone run. Any error blocks: this fails closed.
export function forwardGuard(change, { mirror, identity, sets, plans } = {}) {
  const fail = (protection, blocks) => ({ ok: false, protection, blocks });
  try {
    const paths = pathBlocks(change.paths, mirror);
    if (paths.length) return fail("path policy", paths);
    const scan = scanForward(change, {
      terms: "",
      identity,
      maxFileBytes: forwardMaxFileBytesOf(mirror),
      allow: allowedPaths(change.paths, mirror),
    });
    const found = sets?.(change) ?? { rules: [], unavailable: [] },
      leaks = [
        ...scan.blocks,
        ...plansBlocks(change, mirror, plans),
        ...found.rules.map((rule) => ({ rule, place: "content" })),
        ...found.unavailable.map((id) => ({
          rule: "rules-unavailable",
          place: id,
        })),
      ];
    if (leaks.length) return fail("leak scan", leaks);
    const texts = {
        "commit message": change.meta.message,
        title: change.title,
        body: change.body,
      },
      scrub = metadataBlocks(change.meta, change.expect, texts);
    if (scrub.length) return fail("metadata scrub", scrub);
    return { ok: true, blocks: [] };
  } catch {
    return fail("forward guard", [{ rule: "guard-error", place: "guard" }]);
  }
}

// One sentence for a Needs you row: the protection and each rule with its
// place. Never the text that matched.
export const blockReason = ({ protection, blocks }) =>
  `The ${protection} blocked this forward (${blocks
    .map((b) => (b.place === "content" ? b.rule : `${b.rule} in ${b.place}`))
    .join(", ")}). Nothing was pushed.`;

// An open Stop the line that covers this repository stops every forward, in
// every mode (RC26.5.7). It covers a stop for everything and a stop for the
// repository. Returns the stop's reason, or null.
// shortcut: a stop for one spec or one task does not stop forwarding; pull a
// repository or all stop for that.
export function forwardStop(store, repository) {
  const stop = store
    .list("flow_stops")
    .filter((s) => !s.closedAt)
    .find((s) => s.scope === "all" || s.projectId === repository);
  return stop ? String(stop.reason || "A stop the line is open.") : null;
}

// What is wrong with the arguments of one push to the public repository, or
// null (RC26.5.5): exactly one branch refspec, written out in full, to a
// branch that is not protected, and none of the flags that push many refs.
export function pushProblem(args, { forbid = [] } = {}) {
  const at = args.indexOf("push");
  if (at < 0) return null;
  const rest = args.slice(at + 1);
  const flags = rest.filter((arg) => arg.startsWith("-") && arg !== "-q");
  if (flags.length) return "push flags";
  const [, ...refspecs] = rest.filter((arg) => arg !== "-q");
  if (refspecs.length !== 1) return "one refspec";
  const match = /^refs\/heads\/([^:*+\s]+):refs\/heads\/([^:*+\s]+)$/.exec(
    refspecs[0],
  );
  if (!match || match[1] !== match[2]) return "an explicit refspec";
  if (forbid.includes(match[2])) return "a protected branch";
  return null;
}
