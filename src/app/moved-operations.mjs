const MANUAL_PATH =
  "Crew Mode was removed. Take a task by hand with avoozl claim TASK, and finish it from its worktree with avoozl runner report TASK done.";

export function movedCommand(command, options = {}) {
  if (command === "report") return MANUAL_PATH;
  if (command === "claim" && options.slot !== undefined) return MANUAL_PATH;
  if (command === "next" && options.hook) return MANUAL_PATH;
  return null;
}
