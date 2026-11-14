// Forward a merged mirror change to the public repository (RC24.7 to RC24.10,
// RC24.13, RC24.14, design D29.5, D29.6). One squashed commit by the person,
// private text stripped, the leak scan and the instance guard before any push,
// then a normal push and one public pull request. A retry finds the same
// branch and pull request. Nothing here force pushes.
//
// shortcut: private text is stripped by whole lines (any line naming the
// mirror, an issue or pull request number, a trailer of the private kind, an
// HTML comment, or a link to a host other than github.com). Upgrade to
// per-token removal if good public text is lost.
// shortcut: the person's grant is the local `gh` sign-in, and only when it is
// that person's own. A person who is not signed in here gets one row, never
// a shared token.
import { PUBLISH_RULES, check } from "./content-rules.mjs";
import {
  assertNoInstance,
  instanceIdentity,
  recordSeenInstance,
} from "./instance.mjs";
import { forwardGit } from "./mirror-forward-git.mjs";
import { parseRepository } from "./github.mjs";

const INSTANCE_ID = /\binst-[0-9a-f]{12}\b/g;
const PRIVATE_TRAILER =
  /^(?:closes|fixes|resolves|refs?|related[- ]to|issue|task|plan|crew|avoozl-[\w-]+|mirror[\w-]*)\s*:/i;
const OWNER_REF = /(?:^|[\s(])(?:[\w.-]+\/[\w.-]+)?#\d+\b/;
const PULL_LINK = /github\.com\/[^\s/]+\/[^\s/]+\/(?:issues|pull)\/\d+/i;
const LINK = /https?:\/\/([^\s/)>\]]+)/gi;

// Another Avoozl's instance ID in text read from GitHub (RC24.13): remembered
// by shape, never copied anywhere.
export function noteInstances(store, text) {
  for (const id of String(text ?? "").match(INSTANCE_ID) ?? [])
    recordSeenInstance(store, id);
}

export function stripPrivate(text, { mirror }) {
  const name = String(mirror || "").toLowerCase();
  const kept = String(text ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      if (name && lower.includes(name)) return false;
      if (PRIVATE_TRAILER.test(line.trim())) return false;
      if (OWNER_REF.test(line) || PULL_LINK.test(line)) return false;
      for (const [, host] of line.matchAll(LINK))
        if (!/^(?:www\.)?github\.com$/i.test(host)) return false;
      return true;
    });
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const branchFor = (mirror, record) =>
  `${mirror.branchPrefix ?? "avoozl/"}${record.taskId || `change-${String(record.id).slice(0, 8)}`}`;

const blocked = (store, record, reason) => {
  const next = { ...record, state: "blocked", reason };
  store.put("mirror_forward", next);
  return { ok: false, blocked: true, record: next, reason };
};

// What the scan found, as `set/rule` names only.
function scan(store, repository, targets, added) {
  const names = new Set(),
    unavailable = new Set();
  const one = (input) => {
    const result = check(store, { repository, ...input });
    for (const f of result.findings)
      if (f.action !== "report") names.add(`${f.set}/${f.rule}`);
    for (const u of result.unavailable) unavailable.add(u.set);
  };
  for (const [target, text] of Object.entries(targets)) {
    one({ boundary: "github", target, text });
    for (const rule of PUBLISH_RULES)
      if (rule.pattern.test(text)) names.add(`publish/${rule.rule}`);
  }
  one({ boundary: "diff", target: "diff", added });
  for (const line of added)
    for (const rule of PUBLISH_RULES)
      if (rule.pattern.test(line.text)) names.add(`publish/${rule.rule}`);
  return { rules: [...names].sort(), unavailable: [...unavailable].sort() };
}

// forwardRecord(store, github, id, {policy, person, push, git, grant, now})
// Returns {ok, record, ...}. `push: false` prepares and scans only (nudge).
export async function forwardRecord(
  store,
  github,
  id,
  {
    policy,
    person,
    push = true,
    git = forwardGit(),
    grant = defaultGrant(github),
    now = new Date().toISOString(),
  } = {},
) {
  const record = store.get("mirror_forward", id);
  if (!record) return { ok: false, reason: "No such mirror change." };
  const mirror = policy?.repositories?.[record.repository]?.mirror;
  if (!mirror || mirror.forward === "off")
    return { ok: false, record, reason: "Forwarding is off for this mirror." };
  // One record, one pull request: a second press finds the first.
  if (record.publicPr) return { ok: true, record, again: true };
  if (!["to_forward", "blocked"].includes(record.state))
    return { ok: false, record, reason: `Already ${record.state}.` };
  if (!person) return { ok: false, record, reason: "Name the person." };
  if (
    mirror.forward === "auto" &&
    !(mirror.trustedPersons ?? []).some(
      (login) => login.toLowerCase() === person.toLowerCase(),
    )
  )
    return {
      ok: false,
      record,
      reason: `${person} is not in the trusted persons for ${record.repository}.`,
    };
  const token = push ? await grant(person) : null;
  if (push && !token)
    return blocked(
      store,
      record,
      `Avoozl has no sign-in for ${person}, so it cannot forward as them. Sign in as ${person} and try again.`,
    );
  const identity = instanceIdentity(store),
    pull = await github.pullRequest(mirror.mirror, record.mirrorPr);
  // Another Avoozl's marker in the mirror pull request (RC24.13).
  noteInstances(store, pull?.body);
  noteInstances(store, pull?.title);
  const rawTitle = String(pull?.title ?? "").trim() || "Update",
    rawBody = String(pull?.body ?? "");
  try {
    for (const text of [rawTitle, rawBody]) assertNoInstance(text, identity);
  } catch {
    return blocked(
      store,
      record,
      "The mirror pull request text carries an Avoozl instance name or ID. Remove it there; nothing was pushed.",
    );
  }
  const title = stripPrivate(rawTitle, mirror) || "Update",
    body = [stripPrivate(rawBody, mirror), `Contributed by @${person}.`]
      .filter(Boolean)
      .join("\n\n"),
    message = `${title}\n\n${stripPrivate(rawBody, mirror)}`.trim(),
    branch = branchFor(mirror, record);
  try {
    for (const text of [title, body, message, branch])
      assertNoInstance(text, identity);
  } catch {
    return blocked(
      store,
      record,
      "The public text carries an Avoozl instance name or ID. Nothing was pushed.",
    );
  }
  const forwardTo = mirror.forwardTo?.startsWith("fork:")
      ? mirror.forwardTo.slice(5)
      : mirror.source,
    base = (await github.repository(parseRepository(mirror.source)))
      ?.default_branch;
  if (!base)
    return {
      ok: false,
      record,
      reason: "The default branch could not be read.",
    };
  let prepared;
  try {
    prepared = await git.prepare({
      source: mirror.source,
      mirror: mirror.mirror,
      base,
      mergeSha: record.id,
      author: { name: person, email: `${person}@users.noreply.github.com` },
      message,
      branch,
      date: record.mirrorMergedAt,
      token,
    });
  } catch (error) {
    if (!error.conflict) throw error;
    return {
      ok: false,
      conflict: true,
      paths: error.paths,
      record,
      reason: "The change does not apply to the public repository yet.",
    };
  }
  try {
    const result = scan(
      store,
      record.repository,
      {
        "commit-message": message,
        "branch-name": branch,
        "pull-request-title": title,
        "pull-request-body": body,
      },
      prepared.added,
    );
    if (result.rules.length || result.unavailable.length)
      return blocked(
        store,
        record,
        result.rules.length
          ? `The leak scan blocked this forward (${result.rules.join(", ")}). Nothing was pushed.`
          : `The leak scan could not run (${result.unavailable.join(", ")}). Nothing was pushed.`,
      );
    if (!push) {
      const ready = {
        ...record,
        state: "to_forward",
        scanClean: true,
        reason:
          "Merged in the mirror, scan clean, ready for the public repository.",
      };
      store.put("mirror_forward", ready);
      return { ok: true, ready: true, record: ready };
    }
    const [owner] = forwardTo.split("/"),
      head = forwardTo === mirror.source ? branch : `${owner}:${branch}`,
      existing = (
        await github.listPullRequests(mirror.source, {
          state: "all",
          head: `${owner}:${branch}`,
        })
      )?.[0];
    let number = existing?.number;
    if (!number) {
      await git.push({ ...prepared, forwardTo, branch, token });
      const created = await github.createPullRequest(mirror.source, {
        title,
        body,
        head,
        base,
      });
      number = created.number;
    }
    const next = {
      ...record,
      state: "public_open",
      reason: "Forwarded; waiting on the public pull request.",
      scanClean: true,
      forwardedAt: now,
      publicPrAt: now,
      forwardBranch: branch,
      publicPr: number,
      forwardedBy: person,
    };
    store.put("mirror_forward", next);
    return { ok: true, record: next };
  } finally {
    git.cleanup(prepared);
  }
}

// The signed-in `gh` user's token, only for that same person.
export function defaultGrant(github) {
  return async (person) => {
    if (!github?.signedIn?.()) return null;
    const me = await github.currentUser();
    return me?.login?.toLowerCase() === person.toLowerCase()
      ? github.token
      : null;
  };
}

// The tick step. `nudge`: prepare and scan once, so the row can say "ready".
// `auto`: forward as the approver when the approver is trusted.
export async function mirrorForwardRunStep(
  store,
  github,
  { policy, ...options } = {},
) {
  const errors = [];
  for (const record of store.list("mirror_forward")) {
    const mirror = policy?.repositories?.[record.repository]?.mirror;
    if (!mirror || record.state !== "to_forward") continue;
    try {
      if (mirror.forward === "auto") {
        if (record.approver)
          await forwardRecord(store, github, record.id, {
            policy,
            person: record.approver,
            ...options,
          });
      } else if (
        mirror.forward === "nudge" &&
        !record.scanClean &&
        record.approver
      ) {
        await forwardRecord(store, github, record.id, {
          policy,
          person: record.approver,
          push: false,
          ...options,
        });
      }
    } catch (error) {
      errors.push(`Forward of #${record.mirrorPr} failed: ${error.message}`);
    }
  }
  return { errors };
}
