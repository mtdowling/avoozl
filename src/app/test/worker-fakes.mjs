// Fake executors that follow a brief to its end and record how they finished.
// The chat reads the report instruction in the brief; the child writes the
// result file the brief names, and Avoozl's own reader (readChildResult)
// reads it back. Neither runs a model.
import fs from "node:fs";
import path from "node:path";
import { readChildResult, RESULT_FILE } from "../supervisor.mjs";

// The way a chat finishes, read from its brief: the command-line report with
// a token, a runner-machine report, a plans_report call, or "report done".
const CHAT_FINISH = [
  [/runner report (\S+) done --token (\S+)/, "cli"],
  [/runner report (\S+) --state done/, "machine"],
  [/plans_report with \{"input": \{"taskId": "([^"]+)", "kind": "done"/, "mcp"],
  [/plans_report for that task with kind "done"/, "mcp"],
  [/report done again/, "message"],
];

// A fake Kiro Crew chat. Returns { via, taskId } or { problem }.
export function fakeChat(brief) {
  for (const [pattern, via] of CHAT_FINISH) {
    const match = pattern.exec(brief);
    if (match) return { via, state: "done", taskId: match[1] ?? null };
  }
  return { problem: "The brief names no way to finish." };
}

// A fake `process` child. It writes the done result the brief shows, in
// `worktree`, and returns what Avoozl reads from it.
export function fakeChild(brief, worktree) {
  const shown = /(\{"state": "done", "text": "<[^>]*>"\})/.exec(brief);
  if (!shown) return { problem: "The brief names no result file." };
  fs.mkdirSync(path.join(worktree, path.dirname(RESULT_FILE)), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(worktree, RESULT_FILE),
    shown[1].replace(/<[^>]*>/, "fake work"),
  );
  return readChildResult(worktree);
}

// Run `brief` on the fake of `executor`. Returns the recorded result.
export const fakeExecutor = (executor, brief, worktree) =>
  executor === "process" ? fakeChild(brief, worktree) : fakeChat(brief);
