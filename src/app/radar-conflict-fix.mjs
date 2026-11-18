import { kirocrewRequest } from "./executors/kirocrew.mjs";
import { kirocrewSession } from "./executors/kirocrew.mjs";
// Avoozl fixes a crew's source conflict (RC28, design D33). Crews never
// resolve a conflict inside source code: they hand the task back with the
// needs-human label and leave the pull request open. The tick turns that into
// one short resolver chat that merges the base into the pull request branch
// (never a rebase, never a force push), runs the drop check, and pushes one
// merge commit to the same branch. Avoozl then checks the push on GitHub, arms
// auto-merge again, clears the labels and posts one comment.
//
// It reads the conflict rows RC5.3's step already holds (no extra list call)
// and reads further only for a conflicting pull request. The steps after a
// good push are each recorded as they land, so a failure is finished on the
// next tick and nothing is written twice.
// shortcut: a person who commits under the crew's own login cannot be told
// from the crew; human commits are commits by another login than the pull
// request's author. Use a commit trailer once Issue Radar writes one.
import { recordActivity } from "./activity-log.mjs";
import { callerSlot } from "./delivery.mjs";
import { linePausedTaskIds } from "./flow.mjs";
import { git } from "./git.mjs";
import { parseMarker } from "./github-marker.mjs";
import { mergeMethodOf } from "./github-policy.mjs";
import { DEFAULT_CONFLICT_ROUNDS } from "./landing-config.mjs";
import { armCrewPull } from "./radar-merge-method.mjs";
import { parseMarkers } from "./radar-claims.mjs";
import { effectiveShip } from "./radar-merge-path.mjs";
import { publicHold } from "./public-signoff.mjs";
import { FINAL_STATUSES, listSessionBindings } from "./session-bindings.mjs";
import { fail } from "./store.mjs";

export const FIX_KIND = "conflict-fix";
export const FIX_ROLE = "conflict-fix";
// Files, git and the repository's checks, plus plans_session (action: conflict_check) and
// plans_session (action: conflict_report) (kirocrew-app/agents/avoozl-conflict-fix.json).
export const FIX_AGENT = "avoozl-conflict-fix";
const KEY = "radarConflictFix";
const MERGE = "radarMerge";
const STEPS = ["arm", "unlabel", "comment"];
const SHA = /^[0-9a-f]{40}$/;
const MAX_FILES = 100;
const MAX_TEXT = 500;

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const labelNames = (item) =>
  (item?.labels || []).map((label) =>
    String(typeof label === "string" ? label : label?.name),
  );
const has = (item, label) =>
  Boolean(label) && labelNames(item).some((name) => same(name, label));
const slotKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

const readState = (store) => ({
  seen: {},
  asked: {},
  held: {},
  ours: [],
  verified: {},
  attempts: {},
  ...(store.getMeta(KEY) || {}),
});
const fixes = (store) =>
  store.list("receipts").filter((receipt) => receipt.kind === FIX_KIND);
const OPEN = new Set(["queued", "finishing"]);

// One repository's conflict handling, with its defaults. `conflicts.maxAttempts`
// is the one count landing also reads; `rounds` is the older
// `landing.conflictRounds` (R87.6).
export const conflictSettings = (settings, rounds) => ({
  onSourceConflict: settings?.conflicts?.onSourceConflict ?? "fix",
  maxAttempts:
    settings?.conflicts?.maxAttempts ?? rounds ?? DEFAULT_CONFLICT_ROUNDS,
});
// A conflict is one pull request at one head commit.
const conflictKey = (repository, pr, head) => `${repository}#${pr}@${head}`;

function openRow(state, key, row, reason, facts, at) {
  state.asked[key] = {
    head: row.head,
    reason,
    repository: row.repository,
    pr: row.number,
    url: row.url,
    issue: facts?.issue ?? null,
    at,
  };
}

const ASK_TEXT = {
  human:
    "Someone other than the crew committed to the branch after the crew's last push, so Avoozl will not merge into it.",
  limit: "Avoozl already tried to fix this conflict.",
  ask: "This repository is set to ask on a source conflict.",
  failed: "The resolver chat could not keep both sides, so it pushed nothing.",
  unchecked:
    "The resolver pushed a commit that did not pass the drop check. Avoozl did not arm it or clear its labels.",
  ended: "The resolver chat ended without a report.",
};
const ASK_TITLE = {
  human: "a person committed to it",
  limit: "Avoozl tried already",
  ask: "this repository asks",
  failed: "both sides could not be kept",
  unchecked: "the push was not checked",
  ended: "the resolver ended",
};

// Arm, labels off, one comment. Each landed step is saved before the next.
async function finish(context, receipt) {
  const { github, store, state, delivery } = context,
    config = store.get("github_repositories", receipt.repository),
    settings = context.policy?.repositories?.[receipt.repository] ?? {};
  for (const step of STEPS) {
    if (receipt.steps.includes(step)) continue;
    if (step === "arm") {
      if (
        effectiveShip(delivery || {}, receipt.repository, settings) ===
        "auto-merge"
      ) {
        const pull = await github.pullRequest(config, receipt.pr);
        if (pull?.node_id)
          await armCrewPull(github, config, pull, mergeMethodOf(settings));
      }
    } else if (step === "unlabel") {
      const conflict = settings.radar?.conflictLabel,
        needsHuman = settings.crewLabels?.needsHuman;
      if (conflict) {
        await github.removeLabel(config, receipt.pr, conflict);
        await github.removeLabel(config, receipt.issue, conflict);
      }
      if (needsHuman)
        await github.removeLabel(config, receipt.issue, needsHuman);
    } else
      await github.createIssueComment(
        config,
        receipt.pr,
        [
          `Avoozl merged \`${receipt.base}\` into this branch to fix a source conflict: ${receipt.commit}.`,
          ...receipt.files.map((file) => `- \`${file.path}\`: ${file.how}`),
          ...(receipt.explained.length
            ? [
                "Lines from the base branch left out on purpose:",
                ...receipt.explained.map(
                  (entry) => `- \`${entry.path}\`: ${entry.why}`,
                ),
              ]
            : []),
        ].join("\n"),
      );
    receipt.steps.push(step);
    store.put("receipts", receipt);
  }
  const at = new Date().toISOString();
  store.put("receipts", { ...receipt, state: "fixed", fixedAt: at });
  markTask(store, receipt.taskId, receipt.commit, receipt.pr, at);
  recordActivity(store, {
    source: "github",
    kind: "conflict.fixed",
    summary: `Conflict fixed by Avoozl on ${receipt.repository}#${receipt.pr} with merge commit ${receipt.commit.slice(0, 12)}.`,
    targetId: `${receipt.repository}#${receipt.issue}`,
    link: `https://github.com/${receipt.repository}/pull/${receipt.pr}`,
    key: `conflict-fixed:${receipt.id}`,
  });
  delete state.asked[`${receipt.repository}#${receipt.pr}`];
}

// Flow counts the task as fix work (RC28.6).
function markTask(store, taskId, commit, pr, at) {
  if (!store.read().tasks.some((task) => task.id === taskId)) return;
  store.mutate(`Conflict fixed by Avoozl on ${taskId}`, (draft) => {
    const row = draft.tasks.find((task) => task.id === taskId);
    row.conflictFixes = [...(row.conflictFixes ?? []), { commit, pr, at }];
  });
}

// The tick step. Returns {notify, errors}.
export async function conflictFixStep(
  store,
  github,
  { policy, delivery } = {},
) {
  const notify = [],
    errors = [];
  if (!policy?.mode || !github) return { notify, errors };
  const state = readState(store),
    at = new Date().toISOString(),
    machine = store.getMeta("machineIdentity")?.id,
    context = {
      github,
      store,
      state,
      policy,
      delivery,
    };
  const ask = (key, row, reason, facts) => {
    openRow(state, key, row, reason, facts, at);
    notify.push({
      channel: "decision",
      title: `${row.repository} #${row.number} has a source conflict`,
      text: ASK_TEXT[reason],
      resume: "Choose in Needs you: Resolve myself or Dismiss.",
    });
  };
  // A good push whose follow-up writes stopped half way is finished first;
  // a chat that ended without a report asks.
  const bindings = listSessionBindings(store).filter(
    (binding) => binding.role === FIX_ROLE,
  );
  for (const receipt of fixes(store)) {
    if (receipt.state === "finishing")
      try {
        await finish(context, receipt);
      } catch (error) {
        errors.push(`${receipt.repository} #${receipt.pr}: ${error.message}`);
      }
    else if (receipt.state === "queued") {
      const binding = bindings.find((b) => b.taskId === receipt.id);
      if (binding && FINAL_STATUSES.has(binding.status)) {
        store.put("receipts", { ...receipt, state: "ended", endedAt: at });
        ask(
          `${receipt.repository}#${receipt.pr}`,
          {
            repository: receipt.repository,
            number: receipt.pr,
            head: receipt.head,
            url: receipt.url,
          },
          "ended",
          { issue: receipt.issue },
        );
      }
    }
  }
  store.setMeta(KEY, state);
  return { notify, errors };
}

// The tick's dispatch entries: one resolver chat per queued receipt.
export function conflictFixDispatches(store) {
  const bound = new Set(
    listSessionBindings(store)
      .filter((binding) => binding.role === FIX_ROLE)
      .map((binding) => binding.taskId),
  );
  return fixes(store)
    .filter((receipt) => receipt.state === "queued" && !bound.has(receipt.id))
    .map((receipt) =>
      kirocrewRequest(store, {
        task: receipt.id,
        role: FIX_ROLE,
        // The chat Requirement 91.6 removes: it stays on Kiro Crew.
        executor: "kirocrew",
        attempt: receipt.attempt,
        title: `avoozl:conflict-fix ${receipt.repository}#${receipt.pr}`,
        ...kirocrewSession(null, receipt),
        agent: FIX_AGENT,
        brief: receipt.seed,
      }),
    );
}

// The receipt of the calling chat, from its binding, never from the input.
function ownReceipt(store, caller, tool) {
  const own = callerSlot(caller);
  if (!own)
    fail(
      `${tool} needs the calling session's identity from the Kiro Crew gateway.`,
      403,
    );
  const binding = listSessionBindings(store).find(
      (b) => slotKey(b.slot) === own && b.role === FIX_ROLE,
    ),
    receipt = binding && store.get("receipts", binding.taskId);
  if (receipt?.kind !== FIX_KIND)
    fail(`Only a bound conflict fix chat may call ${tool}.`, 403);
  if (receipt.state !== "queued")
    fail("This conflict fix already has its report.", 409);
  return receipt;
}

function shortText(value, what) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_TEXT ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail(`Write ${what} as one line of 1 to ${MAX_TEXT} characters.`);
  return value.trim();
}

function explainedInput(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200)
    fail("explained must be a list of at most 200 lines.");
  return value.map((entry, index) => ({
    path: shortText(entry?.path, `explained[${index}].path`),
    line: shortText(entry?.line, `explained[${index}].line`),
    why: shortText(entry?.why, `explained[${index}].why`),
  }));
}

const lines = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

// The drop check (D33.1), in one worktree. HEAD must be a merge commit whose
// first parent is `head`. For each file changed on both sides since the merge
// base, every non-blank line the base side added must be in HEAD's copy,
// unless `explained` names it. Returns {ok, commit, missing: [{path, line}]}.
export async function dropCheck({ cwd, head, explained = [] }) {
  const parents = (await git(cwd, ["rev-list", "--parents", "-n", "1", "HEAD"]))
    .split(/\s+/)
    .slice(1);
  if (parents.length !== 2 || parents[0] !== head)
    fail(
      `HEAD must be a merge commit whose first parent is ${head}. Commit the merge first.`,
      409,
    );
  const commit = await git(cwd, ["rev-parse", "HEAD"]),
    baseTip = parents[1],
    mergeBase = await git(cwd, ["merge-base", head, baseTip]),
    changed = async (to) =>
      new Set(
        lines(await git(cwd, ["diff", "--name-only", mergeBase, to])).slice(
          0,
          5000,
        ),
      ),
    ours = await changed(head),
    theirs = await changed(baseTip),
    both = [...theirs].filter((file) => ours.has(file)).slice(0, MAX_FILES),
    missing = [];
  for (const file of both) {
    const added = (
        await git(cwd, ["diff", "-U0", mergeBase, baseTip, "--", file])
      )
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1).trim())
        .filter(Boolean),
      kept = new Set(
        lines(await git(cwd, ["show", `HEAD:${file}`]).catch(() => "")),
      );
    for (const line of new Set(added))
      if (
        !kept.has(line) &&
        !explained.some(
          (entry) => entry.path === file && entry.line.trim() === line,
        )
      )
        missing.push({ path: file, line });
  }
  return { ok: missing.length === 0, commit, files: both, missing };
}

// `conflictfix.check` (plans_session (action: conflict_check)): the bound chat's drop check.
export async function checkConflictFix(store, input = {}, caller) {
  const receipt = ownReceipt(store, caller, "plans_session (action: conflict_check)");
  for (const key of Object.keys(input || {}))
    if (!["cwd", "explained"].includes(key))
      fail(
        `plans_session (action: conflict_check) takes only cwd and explained; ${key} is not allowed.`,
      );
  if (
    typeof input.cwd !== "string" ||
    (!input.cwd.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(input.cwd))
  )
    fail("Name the worktree folder as an absolute path in cwd.");
  const explained = explainedInput(input.explained),
    result = await dropCheck({
      cwd: input.cwd,
      head: receipt.head,
      explained,
    });
  store.put("receipts", {
    ...receipt,
    check: {
      commit: result.commit,
      ok: result.ok,
      explained,
      files: result.files,
      at: new Date().toISOString(),
    },
  });
  return {
    ok: result.ok,
    commit: result.commit,
    files: result.files,
    missing: result.missing.slice(0, 200),
    next: result.ok
      ? `Push with git push origin HEAD:refs/heads/${receipt.branch}, then call plans_session (action: conflict_report).`
      : "Put each missing line back, or explain why it goes, and check again. Do not push.",
  };
}

// `conflictfix.report` (plans_session (action: conflict_report)): the bound chat's one result.
export async function reportConflictFix(
  store,
  github,
  options,
  input = {},
  caller,
) {
  const receipt = ownReceipt(store, caller, "plans_session (action: conflict_report)"),
    state = readState(store),
    at = new Date().toISOString(),
    key = `${receipt.repository}#${receipt.pr}`,
    row = {
      repository: receipt.repository,
      number: receipt.pr,
      head: receipt.head,
      url: receipt.url,
    };
  for (const name of Object.keys(input || {}))
    if (!["ok", "commit", "files", "reason"].includes(name))
      fail(
        `plans_session (action: conflict_report) takes only ok, commit, files and reason; ${name} is not allowed.`,
      );
  if (input.ok !== true) {
    const reason = shortText(input.reason, "the reason");
    store.put("receipts", { ...receipt, state: "failed", reason, endedAt: at });
    openRow(state, key, row, "failed", receipt, at);
    store.setMeta(KEY, state);
    recordActivity(store, {
      source: "github",
      kind: "conflict.fix-failed",
      summary: `The resolver could not fix the conflict on ${key}; it pushed nothing.`,
      targetId: key,
      link: receipt.url,
      key: `conflict-fix-failed:${receipt.id}`,
    });
    return { state: "failed" };
  }
  if (!SHA.test(String(input.commit)))
    fail("commit must be the full merge commit SHA.");
  if (
    !Array.isArray(input.files) ||
    !input.files.length ||
    input.files.length > MAX_FILES
  )
    fail(`files must list 1 to ${MAX_FILES} conflicted files.`);
  const files = input.files.map((file, index) => ({
      path: shortText(file?.path, `files[${index}].path`),
      how: shortText(file?.how, `files[${index}].how`),
    })),
    config = store.get("github_repositories", receipt.repository),
    pull = await github.pullRequest(config, receipt.pr),
    pushed = await github.commit(config, input.commit).catch(() => null),
    parents = (pushed?.parents ?? []).map((parent) => parent.sha);
  if (pull?.head?.sha !== input.commit)
    fail(
      `The pull request's head is not ${input.commit}. Push the merge commit to ${receipt.branch} first.`,
      409,
    );
  const checked =
    receipt.check?.ok === true &&
    receipt.check.commit === input.commit &&
    parents.length === 2 &&
    parents[0] === receipt.head;
  state.ours = [...state.ours, input.commit].slice(-500);
  if (!checked) {
    store.put("receipts", {
      ...receipt,
      state: "unchecked",
      commit: input.commit,
      files,
      endedAt: at,
    });
    openRow(
      state,
      key,
      { ...row, head: input.commit },
      "unchecked",
      receipt,
      at,
    );
    store.setMeta(KEY, state);
    return { state: "unchecked" };
  }
  const finishing = {
    ...receipt,
    state: "finishing",
    commit: input.commit,
    files,
    explained: receipt.check.explained ?? [],
    steps: [],
  };
  store.put("receipts", finishing);
  store.setMeta(KEY, state);
  const context = {
    github,
    store,
    state,
    policy: options.policy,
    delivery: options.delivery,
  };
  try {
    await finish(context, finishing);
  } catch {
    // The next tick finishes it.
  }
  store.setMeta(KEY, state);
  return { state: store.get("receipts", receipt.id).state };
}

// Needs you: one row per pull request the step asked about.
export function conflictFixNeedsYou(store) {
  return Object.entries(store.getMeta(KEY)?.asked ?? {}).map(([key, row]) => ({
    kind: "needs-human",
    reason: "conflict-fix",
    id: `conflict-fix:${key}`,
    taskId: null,
    authority: "github",
    pullRequest: row.pr,
    repository: row.repository,
    link: row.url,
    title: `${row.repository} #${row.pr} has a source conflict (${ASK_TITLE[row.reason]})`,
    detail: ASK_TEXT[row.reason],
    conflictFix: {
      repository: row.repository,
      pullRequest: row.pr,
      actions: ["resolve", "dismiss"],
    },
    openedAt: row.at,
  }));
}

// Fixes of one pull request, for Trace.
export function conflictFixesOf(store, repository, pr) {
  return fixes(store)
    .filter(
      (receipt) =>
        receipt.state === "fixed" &&
        receipt.repository === repository &&
        receipt.pr === pr,
    )
    .map((receipt) => ({ commit: receipt.commit, at: receipt.fixedAt }));
}

// The person's choice on one row: Resolve myself or Dismiss. Either ends the
// row until the pull request's head changes.
export function decideConflictFix(store, input = {}) {
  const key = `${input.repository}#${input.pullRequest}`,
    state = readState(store),
    asked = state.asked[key];
  if (!["resolve", "dismiss"].includes(input.action))
    fail("Choose resolve or dismiss.");
  if (!asked) fail("No source conflict is waiting on that pull request.", 404);
  state.held[key] = { head: asked.head, action: input.action };
  delete state.asked[key];
  store.setMeta(KEY, state);
  recordActivity(store, {
    source: "local",
    kind: `conflict.${input.action}`,
    summary: `Source conflict on ${key}: ${input.action === "resolve" ? "you resolve it yourself" : "dismissed"}.`,
    targetId: key,
  });
  return { repository: input.repository, pullRequest: input.pullRequest };
}
