import { kirocrewConfiguration } from "../executors/kirocrew.ts";
// A test-only stand-in for Kiro Crew's sessions (proof P27). Each tick's
// dispatch becomes a bound session, as tick.py's open_session would make it,
// and `play` runs each open session's script: a writer commits in its
// worktree and reports, a verifier (a bar that needs judgment) reports check
// results and a verdict, a reviewer reports a verdict. Check runs a tick
// queues are run right after it, as the app backend runs them. Scripts are keyed `<alias>:<role>:<attempt>` (or
// `<alias>:<role>` for every attempt); "hold" leaves a session open and
// unplayed. No Kiro Crew, network, or real workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Operations } from "../api/operations.ts";
import { checkRuns, drainCheckRuns } from "../delivery/check-runs.ts";

// One dispatch the tick asked for, as these sessions read it.
export interface Dispatch {
  executor: string;
  task: string;
  role: string;
  attempt: number;
  title?: string;
  model?: string;
  commit?: string;
  agent?: string;
  crew?: string;
  sessionReason?: string;
  [key: string]: unknown;
}
// A session this crew opened: its dispatch, slot, alias and what it did.
export interface CrewSession extends Dispatch {
  slot: string;
  alias: string;
  state: string;
  result?: unknown;
}
// What a session's script gets to act with.
export interface SessionContext {
  session: CrewSession;
  report: (input: Record<string, unknown>) => Promise<unknown>;
  refused: (
    input: Record<string, unknown>,
    pattern: RegExp | ((error: Error) => boolean),
  ) => Promise<void>;
  worktree: () => Promise<string>;
}
export type Script = "hold" | ((context: SessionContext) => unknown);

export function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function commitIn(
  worktree: string,
  file: string,
  text: string,
  message: string,
) {
  fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
  fs.writeFileSync(path.join(worktree, file), text);
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", message);
  return git(worktree, "rev-parse", "HEAD");
}

const as = (slot: string) => ({ caller: { sessionKey: "dashboard:" + slot } });

export function fakeCrew(
  ops: Operations,
  {
    aliases = {},
    scripts = {},
    defaults,
    visible = () => true,
  }: {
    aliases?: Record<string, string>;
    scripts?: Record<string, Script>;
    defaults: (role: string) => Script;
    visible?: (slot: string, session: CrewSession | undefined) => boolean;
  },
) {
  const sessions: CrewSession[] = [],
    roster: string[] = [],
    name = (taskId: string) => aliases[taskId] ?? taskId;
  let opened = 0;
  const report = (session: CrewSession, input: Record<string, unknown>) =>
    ops.execute(
      "session.report",
      { kind: "done", taskId: session.task, ...input },
      undefined,
      as(session.slot),
    );
  const context = (session: CrewSession): SessionContext => ({
    session,
    report: (input) => report(session, input),
    // A report the session tries first and Avoozl refuses in-session.
    refused: (input, pattern) =>
      assert.rejects(report(session, input), pattern),
    worktree: async () =>
      (
        await ops.execute<{ path: string }>("worktree.prepare", {
          taskId: session.task,
        })
      ).path,
  });
  const crew = {
    sessions,
    // The cron's tick with every open session in its roster; each dispatch
    // is opened and bound before the next tick, as tick.py does.
    async tick() {
      const result = await ops.execute<{ dispatch: Dispatch[] }>(
        "workspace.tick",
        {
          sessions: roster
            .filter((slot) =>
              visible(
                slot,
                sessions.find((s) => s.slot === slot),
              ),
            )
            .map((target) => ({ target, status: "idle" })),
        },
      );
      for (const request of result.dispatch) {
        if (request.executor !== "kirocrew") continue;
        const d: Dispatch = {
          ...request,
          ...kirocrewConfiguration(ops.store, request),
        };
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
          // As tick.py binds it.
          ...(d.agent ? { agent: d.agent } : {}),
          ...(d.crew ? { crew: d.crew } : {}),
          ...(d.sessionReason ? { sessionReason: d.sessionReason } : {}),
        });
        roster.push(slot);
        sessions.push({ ...d, slot, alias: name(d.task), state: "open" });
      }
      // The app backend runs the check runs this tick queued (§5.2 Checks);
      // a `<alias>:checks` script of "hold" keeps a task's runs queued.
      const held = checkRuns(ops.store).filter(
        (r) =>
          r.state === "queued" &&
          scripts[`${name(r.taskId ?? "")}:checks`] === "hold",
      );
      for (const r of held)
        ops.store.put("flow_records", { ...r, state: "held" });
      await drainCheckRuns(ops.store);
      for (const r of held) ops.store.put("flow_records", r);
      return result;
    },
    script(session: CrewSession): Script {
      const { alias, role, attempt } = session;
      return (
        scripts[`${alias}:${role}:${attempt}`] ??
        scripts[`${alias}:${role}`] ??
        defaults(role)
      );
    },
    // Play every open session, in the order it opened, unless its script holds.
    async play(filter: (session: CrewSession) => boolean = () => true) {
      const played: CrewSession[] = [];
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
    find: (alias: string, role: string, attempt?: number) =>
      sessions.find(
        (s) =>
          s.alias === alias &&
          s.role === role &&
          (attempt === undefined || s.attempt === attempt),
      ),
  };
  return crew;
}
