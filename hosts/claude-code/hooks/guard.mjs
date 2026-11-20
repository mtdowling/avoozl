#!/usr/bin/env node
// The person-only guard this package installs as a pre-tool hook
// (machine-server MS11.3): it refuses the agent's own shell call to an
// `avoozl` command only a person may run, and lets every other call through.
// It is a speed bump, not a wall (R95.7): code running as the same user can
// reach the same command another way. The commands it refuses are in
// person-only.json beside it, written by `npm run build:hosts`.
//
// Input: the hook's JSON on stdin ({tool_name, tool_input: {command}}).
// Exit 2 with a reason on stderr refuses the call; exit 0 allows it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PERSON_ONLY = JSON.parse(
  fs.readFileSync(path.join(here, "person-only.json"), "utf8"),
);

// The words after each `avoozl` (or `avoozl.mjs`, `cli.mjs`) in a shell line.
export function avoozlCalls(line) {
  const words = String(line)
    .split(/[\s;&|()`]+/)
    .map((word) => word.replace(/^['"]|['"]$/g, ""));
  const calls = [];
  words.forEach((word, index) => {
    if (/(^|\/)(avoozl|avoozl\.mjs|cli\.mjs)$/.test(word))
      calls.push(words.slice(index + 1).filter((w) => !w.startsWith("-")));
  });
  return calls;
}

export function refusal(input, personOnly = PERSON_ONLY) {
  const command =
    input?.tool_input?.command ?? input?.tool_input?.cmd ?? input?.command;
  if (typeof command !== "string") return null;
  for (const words of avoozlCalls(command))
    for (const prefix of personOnly)
      if (prefix.every((word, index) => words[index] === word))
        return `avoozl ${prefix.join(" ")} is for the person, not an agent. Tell the person the exact command, and let them run it at their own prompt.`;
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => {
    let input = null;
    try {
      input = JSON.parse(text);
    } catch {
      process.exit(0);
    }
    const reason = refusal(input);
    if (reason) {
      process.stderr.write(reason + "\n");
      process.exit(2);
    }
    process.exit(0);
  });
}
