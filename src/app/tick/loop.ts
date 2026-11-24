// The server loop: `loop` in this machine's config, never
// in `.avoozl.json`. With no `loop`, the tick reads and caches but starts and
// lands nothing; `avoozl next`, `avoozl land` and every read still answer.
// With it, each pass starts ready work and lands reported work of the kinds
// `loop.run` names, through the functions `avoozl next` and `avoozl land`
// call (readyLeaves, integrateVerified and the landing steps):
//
//   specs   every spec's tasks, and a fix's
//   epics   only the tasks of the specs `loop.epics` names, and of the specs
//           they link
//   issues  labeled issues (labeled-issues.mjs)
//
// `loop.every` ("30s", "1m", "2h") is the least time between two passes.
import path from "node:path";
import { globalAvoozlConfigPath } from "../settings/layered-config.ts";
import { machineFile, writeMachineFile } from "./crews.ts";
import type { Store } from "../store/store.ts";

export const LOOP_KINDS = Object.freeze(["specs", "epics", "issues"]);
export const LOOP_KEYS = Object.freeze(["run", "epics", "every"]);
// What Settings › Autopilot writes when a person turns it on.
export const DEFAULT_LOOP = Object.freeze({ run: ["specs"] });
const EVERY = /^([1-9][0-9]{0,4})(s|m|h)$/;
const UNIT: Record<string, number> = { s: 1000, m: 60 * 1000, h: 3600 * 1000 };
const LAST = "loop.lastPass";

// Check `loop` as a machine file holds it; throws naming the bad field.
export function validateLoop(value: unknown, source = "Avoozl configuration") {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: loop must be an object.`);
  for (const key of Object.keys(value))
    if (!LOOP_KEYS.includes(key))
      throw Error(`${source}: loop.${key} is not a known setting.`);
  const { run, epics, every } = value as {
    run?: unknown;
    epics?: unknown;
    every?: unknown;
  };
  if (
    !Array.isArray(run) ||
    !run.length ||
    new Set(run).size !== run.length ||
    run.some((kind) => !LOOP_KINDS.includes(kind))
  )
    throw Error(
      `${source}: loop.run must list one or more of ${LOOP_KINDS.join(", ")}.`,
    );
  if (
    epics !== undefined &&
    (!Array.isArray(epics) ||
      epics.some((name) => typeof name !== "string" || !name))
  )
    throw Error(`${source}: loop.epics must be a list of spec names.`);
  if (run.includes("epics") && !(epics as string[] | undefined)?.length)
    throw Error(`${source}: loop.run has epics, so loop.epics must name them.`);
  if (every !== undefined && !EVERY.test(String(every)))
    throw Error(`${source}: loop.every must be like 30s, 1m or 2h.`);
}

// This machine's config file: `configDirectory`'s when the caller has one
// (tests, a scoped host), else the one the tick reads.
export const loopFile = (configDirectory: string | null = null) =>
  configDirectory
    ? path.join(configDirectory, "config.json")
    : globalAvoozlConfigPath();

// The raw `loop` this machine's file sets, or null.
export function readMachineLoop(file: string) {
  return machineFile(file).value.loop ?? null;
}

// Write `loop` to this machine's file, or remove it for null. Checked first,
// so a save never leaves a loop the tick refuses.
export function writeMachineLoop(file: string, loop: unknown) {
  if (loop !== null) validateLoop(loop, "This machine's config");
  writeMachineFile(file, (value) => {
    if (loop === null) delete value.loop;
    else value.loop = loop;
  });
  return readMachineLoop(file);
}

// This machine's loop: {run, epics, everyMs}, or null when it sets none or
// its file cannot be read.
export type Loop = { run: Set<string>; epics: Set<string>; everyMs: number };

export function machineLoop(file?: string): Loop | null {
  let value: { run: string[]; epics?: string[]; every?: unknown } | undefined;
  try {
    value = machineFile(file).value.loop as typeof value;
    validateLoop(value);
  } catch {
    return null;
  }
  if (!value) return null;
  const every = EVERY.exec(String(value.every ?? ""));
  return {
    run: new Set(value.run),
    epics: new Set(value.epics ?? []),
    everyMs: every ? Number(every[1]) * UNIT[every[2]] : 0,
  };
}

// Whether a pass is due now; records the pass when it is.
export function loopDue(store: Store, loop: Loop, now = Date.now()) {
  if (now - (store.getMeta<number>(LAST) ?? 0) < loop.everyMs) return false;
  if (loop.everyMs) store.setMeta(LAST, now);
  return true;
}

// Whether `loop` runs `task`. `chain(spec)` lists the spec and every spec
// that links it, outermost last.
export function loopAllows(
  loop: Loop | null,
  task: { labeledIssue?: unknown; planId?: string } | null | undefined,
  chain: (spec: string) => string[] = (spec) => [spec],
) {
  if (!loop) return false;
  if (task?.labeledIssue) return loop.run.has("issues");
  // Every other task, a fix's too, runs with the specs.
  if (loop.run.has("specs")) return true;
  return (
    loop.run.has("epics") &&
    Boolean(task?.planId) &&
    chain(task!.planId!).some((spec) => loop.epics.has(spec))
  );
}
