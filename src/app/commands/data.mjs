// CLI commands of one kind: command, help lines and run.
import { Store, privateFile } from "../store/store.mjs";
import { RETIRED_LANDING, generate } from "./support.mjs";
import fs from "node:fs";
import path from "node:path";
import { help } from "../cli/command-help.mjs";

function runBackup({
  options,
  dbPath,
  requireDatabase,
  requireLocalMaintenancePath,
}) {
  requireLocalMaintenancePath("Backup");
  requireDatabase();
  if (!options.output) throw Error("Choose --output for the SQLite backup.");
  const store = new Store(dbPath);
  try {
    const target = path.resolve(options.output);
    // Created 0600 first: VACUUM INTO accepts an empty file.
    if (!fs.existsSync(target)) privateFile(target);
    store.db.prepare("VACUUM INTO ?").run(target);
    privateFile(target);
    console.log("SQLite backup saved.");
  } finally {
    store.close();
  }
}

export const commands = [
  {
    command: "backup",
    help: [
      help(
        "data",
        "backup --workspace PATH --output FILE",
        "Local-only; registered IDs are refused",
      ),
    ],
    run: runBackup,
  },
  {
    command: "integrator",
    help: [],
    run({}) {
      console.log(RETIRED_LANDING);
    },
  },
  {
    command: "generate",
    help: [help("data", "generate --workspace PATH", "Reindex Markdown")],
    run({ config }) {
      console.log(JSON.stringify(generate(config).stats, null, 2));
    },
  },
  {
    command: "OPERATION",
    help: [
      help(
        "data",
        "OPERATION --json JSON [--revision N] --workspace PATH",
        "Run any application operation by name",
      ),
      help("data", "OPERATION --input FILE --workspace PATH", ""),
    ],
    async run({
      options,
      command,
      dbPath,
      input,
      useServer,
      localOrRequest,
      helpPointer,
    }) {
      if (!useServer() && !fs.existsSync(dbPath))
        throw Error(
          `${command} is not a command. ${helpPointer(command)} Operations need a workspace: avoozl init PATH, then use --workspace PATH.`,
        );
      try {
        console.log(
          JSON.stringify(
            await localOrRequest(
              command,
              input(),
              options.revision ? Number(options.revision) : undefined,
            ),
            null,
            2,
          ),
        );
      } catch (error) {
        if (!/^Unknown operation /.test(error.message)) throw error;
        throw Error(
          `Unknown command or operation ${command}. ${helpPointer(command)}`,
        );
      }
    },
  },
];
