// `avoozl help`: a one-screen overview grouped by job, with `help GROUP`,
// `help COMMAND` and `help all` rendered from the same table, so every
// command that runs can be reached and none is written down twice.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HELP_GROUPS,
  helpCommands,
  helpPointer,
  helpText,
} from "../cli-help.mjs";
import { COMMANDS } from "../cli-commands.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const CLI = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));

// Every command word the CLI's table runs. `help` is answered by cli.mjs, and
// a retired command runs but is no longer listed.
const dispatched = [
  ...new Set(
    COMMANDS.filter((entry) => entry.help.length).map(
      (entry) => entry.command.split(" ")[0],
    ),
  ),
].filter((command) => command !== "OPERATION");

function cli(...args) {
  const home = temporaryDirectory("avoozl-cli-help-"),
    env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home };
  for (const key of Object.keys(env))
    if (/^AVOOZL(_|$)/.test(key)) delete env[key];
  return spawnSync(process.execPath, [CLI, ...args], {
    env,
    cwd: home,
    encoding: "utf8",
  });
}

const usageLines = (text) =>
  text.split("\n").filter((line) => line.startsWith("  avoozl "));

test("the help holds every command the CLI runs, and no other", () => {
  const held = helpCommands();
  assert.deepEqual(
    dispatched.filter((command) => !held.includes(command)),
    [],
    "add these commands to HELP_GROUPS in cli-help.mjs",
  );
  assert.deepEqual(
    held.filter((command) => !dispatched.includes(command)),
    [],
    "HELP_GROUPS names commands the CLI does not run",
  );
});

test("the overview fits one screen and names every group and command", () => {
  const overview = helpText(),
    lines = overview.split("\n");
  assert.ok(lines.length <= 40, `the overview is ${lines.length} lines`);
  for (const line of lines)
    assert.ok(line.length <= 80, `too wide for a terminal: ${line}`);
  for (const group of HELP_GROUPS)
    assert.match(
      overview,
      new RegExp(`^  ${group.id} +${group.summary}$`, "m"),
    );
  const words = new Set(overview.split(/\s+/));
  for (const command of helpCommands())
    assert.ok(words.has(command), `the overview does not name ${command}`);
  // The commands a new user needs first, each with the one program name.
  for (const first of ["init PATH", "seed", "status", "query", "show", "mcp"])
    assert.match(overview, new RegExp(`^  avoozl ${first}\\b`, "m"));
  assert.match(overview, /avoozl help GROUP/);
  assert.match(overview, /avoozl help COMMAND/);
  assert.match(overview, /avoozl help all/);
});

test("a group, a command and all are full views of the same entries", () => {
  const all = helpText("all");
  for (const group of HELP_GROUPS) {
    const page = helpText(group.id);
    assert.equal(usageLines(page).length, group.entries.length, group.id);
    for (const { usage, about } of group.entries) {
      const first = `  avoozl ${usage.split("\n")[0]}`;
      assert.ok(page.split("\n").includes(first), first);
      assert.ok(all.split("\n").includes(first), first);
      for (const line of about ? about.split("\n") : [])
        assert.ok(page.includes(line), line);
    }
  }
  assert.equal(
    usageLines(all).length,
    HELP_GROUPS.reduce((sum, group) => sum + group.entries.length, 0),
  );
  // A command's page gathers its lines from every group that holds one.
  const flow = helpText("flow");
  assert.match(flow, /avoozl help deliver, avoozl help inspect/);
  assert.equal(usageLines(flow).length, 5);
  assert.ok(usageLines(flow).every((line) => line.startsWith("  avoozl flow")));
  for (const command of helpCommands())
    assert.ok(usageLines(helpText(command)).length >= 1, command);
  // A group named like a command holds all of that command's lines, so
  // `avoozl help setup` and `avoozl help plan` leave nothing out.
  for (const group of HELP_GROUPS.filter(({ id }) =>
    helpCommands().includes(id),
  ))
    for (const other of HELP_GROUPS.filter((g) => g !== group))
      assert.deepEqual(
        other.entries.filter(({ usage }) =>
          usage.split(/\s/)[0].split("|").includes(group.id),
        ),
        [],
        `${group.id} lines belong in the ${group.id} group`,
      );
  assert.equal(helpText("no-such-topic"), null);
});

test("the help and its pointers use one program name", () => {
  const all = helpText("all");
  assert.doesNotMatch(all, /node cli\.mjs|aicommander/);
  for (const line of all.split("\n"))
    if (/^ {2}\S/.test(line)) assert.match(line, /^ {2}avoozl /);
  assert.equal(
    helpPointer("workspace"),
    "Run avoozl help workspace for its usage.",
  );
  assert.equal(helpPointer("no-such"), "Run avoozl help for the commands.");
});

test("the CLI prints each view and points a refusal at the right help", () => {
  for (const args of [[], ["help"], ["--help"], ["-h"]]) {
    const run = cli(...args);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, helpText() + "\n", args.join(" "));
  }
  for (const [args, topic] of [
    [["help", "hooks"], "hooks"],
    [["help", "all"], "all"],
    [["help", "workspace"], "workspace"],
    [["workspace", "--help"], "workspace"],
    [["flow", "stop", "-h"], "flow"],
  ]) {
    const run = cli(...args);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, helpText(topic) + "\n", args.join(" "));
  }
  const unknownTopic = cli("help", "no-such-topic");
  assert.equal(unknownTopic.status, 1);
  assert.equal(
    unknownTopic.stderr,
    "There is no help for no-such-topic. avoozl help lists every command by job.\n",
  );
  // A subcommand the command does not have names that command's help.
  const subcommand = cli("workspace", "no-such-action");
  assert.equal(subcommand.status, 1);
  assert.match(subcommand.stderr, /^Choose workspace list, add, /);
  assert.match(
    subcommand.stderr,
    /\nRun avoozl help workspace for its usage\.\n$/,
  );
  const usage = cli("show");
  assert.equal(usage.status, 1);
  assert.equal(
    usage.stderr,
    "Usage: avoozl show TASK_ID\nRun avoozl help show for its usage.\n",
  );
  // A word that is no command names the overview.
  const unknown = cli("no-such-command");
  assert.equal(unknown.status, 1);
  assert.match(
    unknown.stderr,
    /^no-such-command is not a command\. Run avoozl help for the commands\. /,
  );
});
