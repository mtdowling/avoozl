// CLI commands of one kind: command, help lines and run.
import { Store, privateFile } from "../store/store.mjs";
import { RETIRED_LANDING, generate } from "./support.mjs";
import fs from "node:fs";
import path from "node:path";
import { help } from "../cli/command-help.mjs";

function runBackup({
  options,
  command,
  dbPath,
  requireDatabase,
  requireLocalMaintenancePath,
}) {
  requireLocalMaintenancePath(command === "backup" ? "Backup" : "Export");
  requireDatabase();
  const store = new Store(dbPath);
  try {
    if (command === "backup") {
      if (!options.output)
        throw Error("Choose --output for the SQLite backup.");
      const target = path.resolve(options.output);
      // Created 0600 first: VACUUM INTO accepts an empty file.
      if (!fs.existsSync(target)) privateFile(target);
      store.db.prepare("VACUUM INTO ?").run(target);
      privateFile(target);
      console.log("SQLite backup saved.");
    } else {
      const value = JSON.stringify(store.read(), null, 2) + "\n";
      if (options.output) {
        privateFile(options.output);
        fs.writeFileSync(options.output, value);
      } else process.stdout.write(value);
    }
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
    command: "export",
    help: [
      help(
        "data",
        "export --workspace PATH [--output FILE]",
        "Local-only; registered IDs are refused",
      ),
    ],
    run: runBackup,
  },
  {
    command: "import",
    help: [
      help(
        "data",
        "import SNAPSHOT.json --workspace PATH [--dry-run]",
        "Local-only; registered IDs are refused",
      ),
    ],
    run({
      options,
      positionals,
      dbPath,
      requireLocalMaintenancePath,
      localOperations,
      need,
    }) {
      requireLocalMaintenancePath("Import");
      const snapshot = JSON.parse(
        fs.readFileSync(
          need(
            positionals[0],
            "import SNAPSHOT.json --workspace PATH [--dry-run]",
          ),
          "utf8",
        ),
      );
      const store = new Store(dbPath);
      try {
        console.log(
          JSON.stringify(
            localOperations(store).importSnapshot(snapshot, {
              final: options.final,
              dryRun: options["dry-run"],
            }),
            null,
            2,
          ),
        );
      } finally {
        store.close();
      }
    },
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
