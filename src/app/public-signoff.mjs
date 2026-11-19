// Crews on public repositories, layer 4 (Requirement 85.1, 85.2, 85.8,
// 85.10, design §6.14): a person signs off a checklist for each public
// repository before Avoozl hands it work. The checklist is the crew home,
// the content hook on the crew's agent, the rule sets that cover the
// repository, and the audit being on. The sign-off keeps who, when and a
// hash of those items, and lapses when the hash changes. Release and arming
// (RC10.1, design D12) and Send to Issue Radar (`untriaged.handoff`) all
// read `publicHold`.
//
// shortcut: the audit counts as on when the tick audited the repository in
// the last AUDIT_FRESH_MS; a stopped tick lapses the sign-off. Upgrade when
// the audit has its own setting.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { covers, resolveSets, sha256 } from "./content-rules.mjs";
import { AUDIT_CURSORS } from "./public-crews.mjs";
import { fail } from "./store.mjs";

const SIGNOFF_KEY = "publicSignoff";
export const DEFAULT_AGENT = "avoozl-crew";
export const AUDIT_FRESH_MS = 10 * 60 * 1000;
export const PUBLIC_HELD =
  "This repository is public, or its visibility could not be read, and its public sign-off is not complete, so nothing is released.";
export const NO_RULES =
  "No content rule set covers this public repository, so sign-off stays closed. Add one in Settings › Content rules.";
// What a home holds that would put the owner's context in front of a crew.
const INJECTED = [
  "steering",
  "memory",
  path.join("crew", "memory"),
  path.join("crew", "workspace", "memory"),
  "notes",
  "AGENTS.md",
];
const SHELL_MATCHERS = new Set(["*", "execute_bash", "shell", "@builtin"]);
const AGENT_NAME = /^[A-Za-z0-9._-]{1,64}$/;

const nonEmpty = (file) => {
  try {
    const stat = fs.statSync(file);
    return stat.isDirectory() ? fs.readdirSync(file).length > 0 : true;
  } catch {
    return false;
  }
};

const publicRepository = (store, id) =>
  store.get("github_repositories", id)?.private !== true;

// Item 1: the crew home (R85.2).
function homeItem(home) {
  const item = (ok, line) => ({
    key: "home",
    label: "Crew home",
    ok,
    line,
    hash: ok ? sha256(`home\0${path.resolve(home)}`) : null,
  });
  if (!home) return item(false, "Name the crew's own KIRO_HOME folder.");
  if (!path.isAbsolute(home)) return item(false, "Use an absolute path.");
  let stat = null;
  try {
    stat = fs.statSync(home);
  } catch {}
  if (!stat?.isDirectory()) return item(false, "The folder does not exist.");
  if (path.resolve(home) === path.resolve(os.homedir(), ".kiro"))
    return item(false, "This is your own Kiro home, not a crew home.");
  const found = INJECTED.filter((name) => nonEmpty(path.join(home, name)));
  if (found.length)
    return item(
      false,
      `It holds ${found.join(", ")}: no steering, memory or notes of yours may be in a crew home.`,
    );
  return item(true, "No steering, memory or notes. Injected context only.");
}

// Item 2: the content hook on the crew's agent, by its hash (R85.3).
function hookItem(home, agent) {
  const item = (ok, line, hash = null) => ({
    key: "hook",
    label: "Content hook",
    ok,
    line,
    hash,
  });
  if (!home || !path.isAbsolute(home))
    return item(false, "Needs the crew home first.");
  const file = path.join(home, "agents", `${agent}.json`);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return item(false, `No readable agent file agents/${agent}.json.`);
  }
  const hooks = config?.hooks?.preToolUse;
  const entry = (Array.isArray(hooks) ? hooks : []).find(
    (hook) =>
      typeof hook?.command === "string" &&
      /\bcontent\s+hook\b/.test(hook.command) &&
      (hook.matcher === undefined || SHELL_MATCHERS.has(hook.matcher)),
  );
  if (!entry)
    return item(
      false,
      `${agent} has no preToolUse hook that runs \`avoozl content hook\` on shell calls.`,
    );
  const hash = sha256(
    `hook\0${agent}\0${entry.matcher ?? ""}\0${entry.command}`,
  );
  return item(true, `${agent} runs the hook (${hash.slice(0, 12)}).`, hash);
}

// Item 3: the rule sets covering the repository's GitHub writes and diffs
// (R85.10). Every set must be available.
function rulesItem(store, repository) {
  const item = (ok, line, hash = null, sets = []) => ({
    key: "rules",
    label: "Content rule sets",
    ok,
    line,
    hash,
    sets,
  });
  let resolved;
  try {
    resolved = resolveSets(store).sets;
  } catch {
    resolved = [];
  }
  const applying = resolved.filter(
    (set) =>
      covers(set, "github", repository) && covers(set, "diff", repository),
  );
  if (!applying.length)
    return item(false, "No rule set covers this repository.");
  const missing = applying.filter((set) => !set.available);
  if (missing.length)
    return item(
      false,
      `${missing.map((set) => `${set.id} is unavailable (${set.reason})`).join("; ")}.`,
      null,
      applying.map((set) => set.id),
    );
  const hash = sha256(
    JSON.stringify(
      applying
        .map((set) => [
          set.id,
          set.action,
          set.boundaries ?? null,
          set.repositories ?? null,
          set.version ?? null,
          set.rules,
        ])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    ),
  );
  return item(
    true,
    `${applying.map((set) => set.id).join(", ")} cover it.`,
    hash,
    applying.map((set) => set.id),
  );
}

// Item 4: the audit on the tick (R85.6) is running for the repository.
function auditItem(store, repository, now) {
  const since = Date.parse(store.getMeta(AUDIT_CURSORS)?.[repository]?.since);
  const ok = Number.isFinite(since) && now - since <= AUDIT_FRESH_MS;
  return {
    key: "audit",
    label: "Audit on the tick",
    ok,
    line: ok
      ? "The tick audits this repository."
      : "The tick has not audited this repository in the last 10 minutes. Turn the tick on and connect GitHub.",
    hash: ok ? sha256("audit\0on") : null,
  };
}

// The checklist for one repository with a crew home and agent, now.
export function checklist(
  store,
  repository,
  { home = null, agent = DEFAULT_AGENT } = {},
  now = Date.now(),
) {
  const items = [
    homeItem(home),
    hookItem(home, agent),
    rulesItem(store, repository),
    auditItem(store, repository, now),
  ];
  const ok = items.every((item) => item.ok);
  return {
    items,
    ok,
    hash: ok
      ? sha256(items.map((item) => `${item.key}:${item.hash}`).join("\n"))
      : null,
    banner: items[2].ok || items[2].sets.length ? null : NO_RULES,
  };
}

const records = (store) => store.getMeta(SIGNOFF_KEY) ?? {};

// The sign-off for one repository with whether it is still current.
function signoffState(store, repository, now = Date.now()) {
  const record = records(store)[repository] ?? null,
    current = record?.complete === true && typeof record.hash === "string",
    list = checklist(store, repository, record ?? {}, now);
  return {
    record,
    checklist: list,
    current: current && list.hash === record.hash,
    lapsed: current && list.hash !== record.hash,
  };
}

// null when release and handoff may run, else the sentence that says why not.
export function publicHold(store, repositoryId, now = Date.now()) {
  if (!publicRepository(store, repositoryId)) return null;
  try {
    return signoffState(store, repositoryId, now).current ? null : PUBLIC_HELD;
  } catch {
    return PUBLIC_HELD;
  }
}

// `publiccrews.signoff`: a person signs off, or withdraws, one repository's
// checklist. The operation is person-only (mcp-policy.mjs, app-backend.mjs).
export function signOff(
  store,
  policy,
  input,
  { by = "", now = Date.now() } = {},
) {
  const repository = input?.repository;
  if (!repository || typeof repository !== "string")
    fail("Name the repository.", 400);
  if (!policy?.repositories?.[repository])
    fail(`${repository} is not a registered repository.`, 404);
  if (typeof input.complete !== "boolean")
    fail("Say whether the sign-off is complete.", 400);
  const all = { ...records(store) };
  if (!input.complete) {
    const { hash, ...kept } = all[repository] ?? {};
    all[repository] = { ...kept, complete: false };
    store.setMeta(SIGNOFF_KEY, all);
    return { repository, complete: false };
  }
  const agent = input.agent ?? all[repository]?.agent ?? DEFAULT_AGENT,
    home = input.home ?? all[repository]?.home ?? null;
  if (typeof agent !== "string" || !AGENT_NAME.test(agent))
    fail("Name the crew's agent with letters, digits, dots and dashes.", 400);
  if (home !== null && typeof home !== "string")
    fail("Name the crew home as a path.", 400);
  const list = checklist(store, repository, { home, agent }, now);
  if (!list.ok)
    fail(
      `The checklist is not complete: ${list.items
        .filter((item) => !item.ok)
        .map((item) => `${item.label}: ${item.line}`)
        .join(" ")}`,
      409,
    );
  all[repository] = {
    complete: true,
    by: by || "owner",
    at: new Date(now).toISOString(),
    hash: list.hash,
    home,
    agent,
  };
  store.setMeta(SIGNOFF_KEY, all);
  return { repository, complete: true, ...all[repository] };
}

// The Public crews card: one row per registered public repository.
export function publicCrewsView(store, policy, now = Date.now()) {
  return Object.keys(policy?.repositories ?? {})
    .filter((id) => publicRepository(store, id))
    .sort()
    .map((repository) => {
      const state = signoffState(store, repository, now),
        visibility = store.get("github_repositories", repository)?.private;
      return {
        repository,
        visibility: visibility === false ? "public" : "unknown",
        home: state.record?.home ?? null,
        agent: state.record?.agent ?? DEFAULT_AGENT,
        signedOff: state.current
          ? { by: state.record.by, at: state.record.at }
          : null,
        lapsed: state.lapsed,
        banner: state.checklist.banner,
        items: state.checklist.items.map(({ key, label, ok, line }) => ({
          key,
          label,
          ok,
          line,
        })),
        ready: state.checklist.ok,
      };
    });
}
