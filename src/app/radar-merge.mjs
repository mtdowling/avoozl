// Arming auto-merge on crew pull requests (RC5.2, RC5.8, design D7). Per
// Issue Radar repository whose ship mode is `auto-merge` and whose merge path
// is ready, the tick arms GitHub's merge-commit auto-merge on an open,
// non-draft pull request from a branch of the same repository, whose author
// passes the actor check and which closes a marked issue of this workspace.
// Each such issue is verified once per marker hash first. Avoozl never merges
// and never uses an admin path: GitHub merges when its own rules pass.
import { createHash } from "node:crypto";
import { actorAllowed } from "./github-policy.mjs";
import { parseMarker } from "./github-marker.mjs";
import { parseProvenance } from "./github-provenance.mjs";
import { mergePath } from "./radar-merge-path.mjs";
import { verifyIssue } from "./verify-issue.mjs";

const KEY = "radarMerge";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// `{armed: {"repo#pr": time}, verified: {"repo#issue": {hash, ok}}, notified:
// [keys]}`. shortcut: lists only grow, a few bytes per pull request and issue;
// prune when a workspace has thousands.
const readState = (store) => ({
  armed: {},
  verified: {},
  notified: [],
  ...(store.getMeta(KEY) || {}),
});

const markerHash = (marker) =>
  createHash("sha256").update(JSON.stringify(marker)).digest("hex");

export async function armCrewPullRequests(
  store,
  github,
  { policy, delivery, identity, verify = verifyIssue },
) {
  const notify = [],
    machine = store.getMeta("machineIdentity")?.id,
    state = readState(store);
  let changed = false;
  for (const [id, repository] of Object.entries(policy?.repositories || {})) {
    const ship = delivery?.repositories?.[id]?.ship ?? delivery?.ship;
    if (repository.coder !== "issue-radar" || ship !== "auto-merge") continue;
    const config = store.get("github_repositories", id);
    if (!machine || !config || config.activeMachine !== machine) continue;
    const pulls = (
      await github.listPullRequests(config, { state: "open" })
    ).filter(
      (pull) =>
        pull.state === "open" &&
        !pull.draft &&
        !pull.auto_merge &&
        pull.node_id &&
        pull.user?.login &&
        pull.head?.repo?.full_name &&
        same(pull.head.repo.full_name, id) &&
        same(pull.base?.repo?.full_name, id) &&
        !state.armed[`${id}#${pull.number}`],
    );
    if (!pulls.length) continue;
    // Never arm where GitHub would merge at once or refuse.
    if (!(await mergePath(github, id, repository, { delivery })).ready)
      continue;
    // The marked open issues of this workspace, and the pull requests that
    // GitHub says close each.
    const closing = new Map();
    for (const issue of await github.listIssues(config, { state: "open" })) {
      const managed = parseMarker(issue.body),
        { marker } = parseProvenance(issue.body);
      if (!marker || !managed || managed.namespace !== identity?.namespace)
        continue;
      for (const node of await github.closingPullRequests(config, issue.number))
        if (
          node.state === "OPEN" &&
          !node.merged &&
          same(node.repository?.nameWithOwner, id)
        ) {
          const list = closing.get(node.number) || [];
          list.push({ number: issue.number, hash: markerHash(marker) });
          closing.set(node.number, list);
        }
    }
    const permissions = new Map();
    for (const pull of pulls) {
      const marked = closing.get(pull.number);
      if (!marked?.length) continue;
      const login = pull.user.login;
      if (!permissions.has(login))
        permissions.set(
          login,
          (await github.permission(config, login))?.permission,
        );
      if (!actorAllowed(repository, login, permissions.get(login)).allowed)
        continue;
      let ok = true;
      for (const issue of marked) {
        const key = `${id}#${issue.number}`,
          known = state.verified[key];
        if (known?.hash === issue.hash) {
          ok &&= known.ok;
          continue;
        }
        const result = await verify(key);
        // A check that could not run is no verdict: try again next tick.
        if (!result.ok && result.couldNotRun) {
          ok = false;
          continue;
        }
        state.verified[key] = { hash: issue.hash, ok: result.ok };
        changed = true;
        if (!result.ok) {
          ok = false;
          const note = `${key}:${issue.hash}`;
          if (!state.notified.includes(note)) {
            state.notified.push(note);
            notify.push({
              channel: "decision",
              title: `Issue #${issue.number} does not verify`,
              text: `Pull request #${pull.number} closes issue #${issue.number} in ${id}, but "avoozl verify-issue ${key}" fails: ${result.checks
                .filter((check) => check.status === "fail")
                .map((check) => check.name)
                .join(", ")}. Nothing was armed.`,
              resume: "Fix the issue's marker; the next tick checks it again.",
            });
          }
        }
        ok &&= result.ok;
      }
      if (!ok) continue;
      try {
        await github.armAutoMerge(config, pull.node_id, "MERGE");
        state.armed[`${id}#${pull.number}`] = new Date().toISOString();
        changed = true;
      } catch (error) {
        // Tried again next tick; the person hears of it once.
        const note = `arm:${id}#${pull.number}`;
        if (!state.notified.includes(note)) {
          state.notified.push(note);
          changed = true;
          notify.push({
            channel: "failure",
            title: `Avoozl could not arm auto-merge on #${pull.number}`,
            text: `${id}: ${error.message}`,
          });
        }
      }
    }
  }
  if (changed) store.setMeta(KEY, state);
  return { notify };
}

// The tick's wrapper: a failure is reported, not thrown.
export async function mergeStep(store, github, options) {
  try {
    return {
      status: "ok",
      ...(await armCrewPullRequests(store, github, options)),
    };
  } catch (error) {
    return { status: "error", error: error.message, notify: [] };
  }
}
