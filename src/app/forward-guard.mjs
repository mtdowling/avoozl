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

const TRAILER = /^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9-]+:\s|^Cc:\s/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MARKER = /<!--|\bavoozl[:-][\w-]+/i;
const MIRROR_LINK = /\/(?:issues|pull)\/\d+|(?:^|[\s(])#\d+\b/;

// The last paragraph of a commit message when every line is a trailer.
export function hasTrailer(message) {
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
export function forwardGuard(change, { mirror, identity, sets } = {}) {
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
