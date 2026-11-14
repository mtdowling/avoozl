// The leak scan of a forward (RC26.5.2, design D31.2). A forward is a change
// that leaves a private mirror for a public repository, so this scan fails
// closed: input it cannot read, rules it cannot parse and any error are a
// block, never a pass. It runs on every added file name and file, the commit
// message, the branch name, the title and the body.
//
// Private terms come from the caller's terms file text (content-rules.mjs
// format); this file names no private term. A finding names a rule and a
// place and never the matched text.
// shortcut: synchronous regexes without the worker time limit content-rules
// uses for outside rules; add it when terms can come from a plugin.
import {
  PUBLISH_RULES,
  decode,
  matchLine,
  parseTerms,
} from "./content-rules.mjs";
import { stripInstance } from "./instance.mjs";

export const DEFAULT_FORWARD_MAX_FILE_BYTES = 1_000_000;

const rule = (category, name, pattern) => ({ category, rule: name, pattern });
const BUILT_IN = [
  ...PUBLISH_RULES,
  rule(
    "host",
    "private-host",
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  ),
  rule(
    "host",
    "internal-host",
    /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|corp|intranet|lan)\b/i,
  ),
  rule(
    "account",
    "account-id",
    /(?<![\d.-])\d{12}(?![\d.])|\barn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:\d{12}:/i,
  ),
  rule(
    "secret",
    "assigned-secret",
    /\b(?:password|passwd|secret|api[_-]?key|token)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  ),
];
// A ticket ID such as PROJ-1234. Standards and formats that look like one
// are skipped; a real hit on a skipped prefix is a limit of this rule.
const TICKET = /\b([A-Z][A-Z0-9]{1,9})-\d{2,}\b/g;
const NOT_TICKETS = new Set(
  "SHA UTF ISO RFC CVE CWE AES MD RSA TLS SSL UTC IPV GPL MIT BSD EC ES X".split(
    " ",
  ),
);
const ticketIn = (line) =>
  [...line.matchAll(TICKET)].some((match) => !NOT_TICKETS.has(match[1]));

const MAX_BLOCKS = 50;

function rulesFor(terms) {
  if (typeof terms !== "string")
    throw Error("The private terms could not be read.");
  return [...BUILT_IN.map((r) => ({ ...r, allow: [] })), ...parseTerms(terms)];
}

// The rule names that hit one line, raw and decoded.
function hitsOnLine(line, rules) {
  const hits = new Set();
  for (const text of new Set([line, decode(line)])) {
    for (const found of matchLine(text, rules)) hits.add(found.rule);
    if (ticketIn(text)) hits.add("ticket-id");
  }
  return hits;
}

const isBinary = (bytes) => bytes.subarray(0, 8000).includes(0);

// { ok, blocks: [{rule, place}] } for a change:
// { files: [{path, content: string | Buffer}], message, branch, title, body }.
// A place counts files from 1, so a path that holds a term is not repeated.
// Options: terms (text, required), maxFileBytes, allow (paths that may be
// binary or large), identity ({id, name} of this instance).
export function scanForward(change, options = {}) {
  const blocks = [];
  const block = (name, place) => {
    if (
      blocks.length < MAX_BLOCKS &&
      !blocks.some((b) => b.rule === name && b.place === place)
    )
      blocks.push({ rule: name, place });
  };
  try {
    const { terms, identity, allow = [] } = options;
    const max = options.maxFileBytes ?? DEFAULT_FORWARD_MAX_FILE_BYTES;
    if (!Number.isInteger(max) || max < 1)
      throw Error("The size limit is not a positive number.");
    if (!Array.isArray(allow)) throw Error("The allowlist is not a list.");
    const rules = rulesFor(terms);
    const scanText = (text, place, { lines = false } = {}) => {
      if (typeof text !== "string") throw Error(`${place} is not text.`);
      if (stripInstance(text, identity) !== text) block("instance", place);
      text.split("\n").forEach((line, index) => {
        for (const name of hitsOnLine(line, rules))
          block(name, lines ? `${place} line ${index + 1}` : place);
      });
    };
    if (!change || typeof change !== "object" || !Array.isArray(change.files))
      throw Error("The change has no file list.");
    for (const [index, file] of change.files.entries()) {
      if (!file || typeof file.path !== "string" || !file.path)
        throw Error("A file has no path.");
      scanText(file.path, `file ${index + 1} name`);
      const bytes =
        typeof file.content === "string"
          ? Buffer.from(file.content)
          : file.content;
      if (!(bytes instanceof Uint8Array))
        throw Error(`File ${index + 1} has no content.`);
      const place = `file ${index + 1}`;
      const allowed = allow.includes(file.path);
      if (isBinary(bytes)) {
        if (!allowed) block("binary-file", place);
        continue;
      }
      if (bytes.length > max && !allowed) block("over-size", place);
      scanText(Buffer.from(bytes).toString("utf8"), place, { lines: true });
    }
    scanText(change.message, "commit message");
    scanText(change.branch, "branch name");
    scanText(change.title, "title");
    scanText(change.body, "body");
  } catch {
    // A failure never says why: the reason could carry the text it read.
    return { ok: false, blocks: [{ rule: "scan-error", place: "scan" }] };
  }
  return { ok: blocks.length === 0, blocks };
}
