// The audit of what landed on the public repository (RC26.5.6, design D31.2
// row 6). Each tick compares what the source shows with the receipt of each
// forward. The public pull request's head commit is the receipt's commit when
// nothing changed: that hash holds the tree, the author and the one parent,
// so a match needs no further call. A different head is read in full (the
// files and authors since the base) and every difference is named. A ref
// named for the plans branch or the mirror is read at most once per
// `refsEveryMs`. A difference opens one Needs you row and one Stop the line
// for the repository; only a person resumes it. Findings name a rule and a
// place, never text.
//
// shortcut: the head comes from the public pull request poll, so a forward
// branch with no open pull request is not read; the first 300 files of a
// comparison are all GitHub returns.
import { pathBlocks } from "./forward-guard.mjs";
import { parseRepository } from "./github.mjs";

const REFS = "forwardAuditRefs",
  FOUND = "forwardAudit";
const REFS_EVERY_MS = 10 * 60 * 1000;

// The differences between the receipt and the compared head.
function differences(receipt, mirror, compared) {
  const found = [],
    files = (compared?.files ?? []).map((file) => file.filename),
    known = new Set(receipt.paths ?? []);
  files.forEach((file, index) => {
    if (!known.has(file))
      found.push({ rule: "audit-extra-file", place: `file ${index + 1}` });
  });
  for (const block of pathBlocks(files, mirror))
    found.push({ ...block, rule: `audit-${block.rule}` });
  const commits = compared?.commits ?? [];
  if (commits.length > 1)
    found.push({ rule: "audit-extra-commit", place: "branch" });
  commits.forEach((commit, index) => {
    const login = commit.author?.login ?? commit.commit?.author?.name;
    if (
      String(login ?? "").toLowerCase() !== String(receipt.person).toLowerCase()
    )
      found.push({ rule: "audit-author", place: `commit ${index + 1}` });
  });
  return found;
}

// One stop for the repository, opened once; the row reads it back.
function raise(store, repository, source, findings, now) {
  const at = new Date(now).toISOString(),
    all = { ...(store.getMeta(FOUND) ?? {}) },
    open = all[repository] && store.get("flow_stops", all[repository].stopId);
  if (open && !open.closedAt) {
    all[repository] = {
      ...all[repository],
      findings: [...all[repository].findings, ...findings].slice(0, 50),
    };
  } else {
    const stopId = `stop:forward-audit:${repository}:${Date.parse(at)}`;
    store.put("flow_stops", {
      id: stopId,
      manual: true,
      by: { kind: "system", name: "forward audit" },
      reason: `The forward audit found a difference on ${source}.`,
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
    all[repository] = { at, source, stopId, findings: findings.slice(0, 50) };
  }
  store.setMeta(FOUND, all);
}

// The tick step. Returns {errors}.
export async function mirrorForwardAuditStep(
  store,
  github,
  { policy, now = Date.now(), refsEveryMs = REFS_EVERY_MS } = {},
) {
  const errors = [],
    seen = { ...(store.getMeta(REFS) ?? {}) };
  let refsChanged = false;
  for (const [repository, entry] of Object.entries(
    policy?.repositories ?? {},
  )) {
    const mirror = entry.mirror;
    if (!mirror || !github) continue;
    const records = store
      .list("mirror_forward")
      .filter((r) => r.repository === repository && r.receipt && r.publicHead);
    for (const record of records) {
      if (record.audit || record.publicHead === record.receipt.commit) continue;
      try {
        const base = (await github.repository(parseRepository(mirror.source)))
            ?.default_branch,
          compared = await github
            .compareCommits(mirror.source, base, record.publicHead)
            .catch(() => null),
          found = differences(record.receipt, mirror, compared);
        // A head that is not the receipt's commit is a difference even when
        // the comparison cannot name it.
        if (!found.length)
          found.push({ rule: "audit-head-changed", place: "branch" });
        store.put("mirror_forward", {
          ...record,
          audit: { at: new Date(now).toISOString(), findings: found },
        });
        raise(store, repository, mirror.source, found, now);
      } catch (error) {
        errors.push(
          `Audit of public pull request #${record.publicPr} failed: ${error.message}`,
        );
      }
    }
    if (!records.length || now - (seen[repository] ?? 0) < refsEveryMs)
      continue;
    seen[repository] = now;
    refsChanged = true;
    const names = [mirror.plansBranch, mirror.mirror.split("/")[1]].filter(
      Boolean,
    );
    for (const name of names)
      try {
        if (await github.branch(mirror.source, name))
          raise(
            store,
            repository,
            mirror.source,
            [{ rule: "audit-forbidden-ref", place: "ref" }],
            now,
          );
      } catch (error) {
        if (error.status !== 404)
          errors.push(
            `Audit of refs on ${mirror.source} failed: ${error.message}`,
          );
      }
  }
  if (refsChanged) store.setMeta(REFS, seen);
  return { errors };
}

// Waiting on you: one row per repository while its audit stop is open.
export function forwardAuditRows(store) {
  return Object.entries(store.getMeta(FOUND) ?? {})
    .filter(([, found]) => {
      const stop = store.get("flow_stops", found.stopId);
      return stop && !stop.closedAt;
    })
    .map(([repository, found]) => ({
      kind: "needs-human",
      reason: "forward-audit",
      id: `forward-audit:${repository}`,
      taskId: null,
      authority: "github",
      title: `Forwarding is stopped for ${repository}`,
      detail: `The audit found a difference on ${found.source}: ${[...new Set(found.findings.map((f) => `${f.rule} (${f.place})`))].join(", ")}. Check the public repository, then resume the stop.`,
      openedAt: found.at,
    }));
}
