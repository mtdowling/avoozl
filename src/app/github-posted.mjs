// What an agent or Avoozl's own automation posts to GitHub as comments,
// reviews, review line comments and pull request bodies. Each `@login`
// mention is broken with a zero-width space after the `@`, so a post never
// notifies anyone, and each post ends with a hidden marker. Code spans,
// fences and HTML comments are left as written. A comment that carries the
// marker is Avoozl's own text: no intake, responder or trigger path starts or
// resumes work from it. A person's own write goes out as written.
import { AsyncLocalStorage } from "node:async_hooks";

export const POSTED = "<!-- avoozl:posted -->";

const ZWSP = "​";
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// Text Markdown leaves as written: an HTML comment or a code span.
const VERBATIM = /<!--[\s\S]*?-->|(`+)[\s\S]*?\1/g;
// An `@` that starts a mention: not inside a word (an email address) and
// followed by a login's first character.
const MENTION = /(^|[^\w@/.​])@(?=[A-Za-z0-9])/g;

const defuseProse = (text) => {
  let out = "",
    at = 0;
  for (const match of text.matchAll(VERBATIM)) {
    out += text.slice(at, match.index).replace(MENTION, `$1@${ZWSP}`);
    out += match[0];
    at = match.index + match[0].length;
  }
  return out + text.slice(at).replace(MENTION, `$1@${ZWSP}`);
};

// `text` with every mention outside code and HTML comments broken.
export function defuseMentions(text) {
  const out = [];
  let prose = [],
    fence = null;
  const flush = () => {
    if (prose.length) out.push(defuseProse(prose.join("\n")));
    prose = [];
  };
  for (const line of String(text).split("\n")) {
    const open = FENCE.exec(line)?.[1];
    if (fence) {
      out.push(line);
      if (open && open[0] === fence[0] && open.length >= fence.length)
        fence = null;
    } else if (open) {
      flush();
      fence = open;
      out.push(line);
    } else prose.push(line);
  }
  flush();
  return out.join("\n");
}

export const isPosted = (body) => String(body ?? "").includes(POSTED);

// The text as Avoozl posts it: mentions broken, the marker at the end once.
export function postedText(text) {
  const defused = defuseMentions(String(text ?? ""));
  if (isPosted(defused)) return defused;
  return defused.trim()
    ? `${defused.replace(/\s+$/, "")}\n\n${POSTED}`
    : POSTED;
}

// Who the current operation writes for: "person", "agent", "avoozl" (the
// tick) or "unknown". Operations.execute sets it around each operation.
const actors = new AsyncLocalStorage();
export const asActor = (actor, run) => actors.run(actor, run);
export const currentActor = () => actors.getStore() ?? null;
// Whether a post goes out as written: only for a person. An unknown actor is
// marked.
export const personPosting = () => currentActor() === "person";
