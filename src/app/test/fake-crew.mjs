// A test-only stand-in for Kiro Crew's sessions (proof P27). Each tick's
// dispatch becomes a bound session, as tick.py's open_session would make it,
// and `play` runs each open session's script: a writer commits in its
// worktree and reports, the checks role reports check results, a reviewer
// reports a verdict. Scripts are keyed `<alias>:<role>:<attempt>` (or
// `<alias>:<role>` for every attempt); "hold" leaves a session open and
// unplayed. No Kiro Crew, network, or real workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function commitIn(worktree, file, text, message) {
  fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
  fs.writeFileSync(path.join(worktree, file), text);
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", message);
  return git(worktree, "rev-parse", "HEAD");
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

export function fakeCrew(
  ops,
  { aliases = {}, scripts = {}, defaults, visible = () => true },
) {
  const sessions = [],
    roster = [],
    name = (taskId) => aliases[taskId] ?? taskId;
  let opened = 0;
  const report = (session, input) =>
    ops.execute(
      "session.report",
      { kind: "done", taskId: session.task, ...input },
      undefined,
      as(session.slot),
    );
  const context = (session) => ({
    session,
    report: (input) => report(session, input),
    // A report the session tries first and Avoozl refuses in-session.
    refused: (input, pattern) =>
      assert.rejects(report(session, input), pattern),
    worktree: async () =>
      (await ops.execute("worktree.prepare", { taskId: session.task })).path,
  });
  const crew = {
    sessions,
    // The cron's tick with every open session in its roster; each dispatch
    // is opened and bound before the next tick, as tick.py does.
    async tick() {
      const result = await ops.execute("workspace.tick", {
        sessions: roster
          .filter((slot) => visible(slot, sessions.find((s) => s.slot === slot)))
          .map((target) => ({ target, status: "idle" })),
      });
      for (const d of result.dispatch) {
        const slot = `s${++opened}-${name(d.task)}-${d.role}-${d.attempt}`;
        await ops.execute("session.bind", {
          taskId: d.task,
          slot,
          role: d.role,
          attempt: d.attempt,
          source: "tick",
          title: d.title,
          ...(d.model ? { model: d.model } : {}),
          ...(d.commit ? { commit: d.commit } : {}),
          // Placement (§4.10), as tick.py binds it.
          ...(d.agent ? { agent: d.agent } : {}),
          ...(d.crew ? { crew: d.crew } : {}),
          ...(d.placement ? { placement: d.placement } : {}),
          ...(d.sessionReason ? { sessionReason: d.sessionReason } : {}),
        });
        roster.push(slot);
        sessions.push({ ...d, slot, alias: name(d.task), state: "open" });
      }
      return result;
    },
    script(session) {
      const { alias, role, attempt } = session;
      return (
        scripts[`${alias}:${role}:${attempt}`] ??
        scripts[`${alias}:${role}`] ??
        defaults(role)
      );
    },
    // Play every open session, in the order it opened, unless its script holds.
    async play(filter = () => true) {
      const played = [];
      for (const session of sessions) {
        if (session.state !== "open" || !filter(session)) continue;
        const script = crew.script(session);
        if (script === "hold") continue;
        session.result = await script(context(session));
        session.state = "done";
        played.push(session);
      }
      return played;
    },
    find: (alias, role, attempt) =>
      sessions.find(
        (s) =>
          s.alias === alias &&
          s.role === role &&
          (attempt === undefined || s.attempt === attempt),
      ),
  };
  return crew;
}
