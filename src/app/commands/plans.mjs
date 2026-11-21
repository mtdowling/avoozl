// CLI commands of one kind: command, help lines and run.
import fs from "node:fs";
import { help } from "../cli/command-help.mjs";

export const commands = [
  {
    command: "plan approve",
    help: [
      help(
        "plan",
        "plan approve PLAN [--yes --expect HASH]",
        "Preview approving a draft spec in a checkout here; --yes commits it to main as you (a person only). A spec on GitHub is approved by merging its pull request",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const usage = "plan approve PLAN [--yes --expect HASH]",
        preview = await localOrRequest("plan.preview", {
          id: need(positionals[1], usage),
        }),
        name = preview.planId,
        short = String(preview.reviewedHash).slice(0, 16);
      if (!options.yes) {
        const workspace = options.workspace
          ? ` --workspace ${JSON.stringify(options.workspace)}`
          : "";
        console.log(
          `Nothing approved. Approving ${name} at ${short} makes one commit on main, authored by you. To approve exactly this revision, run:`,
        );
        console.log(
          `  avoozl plan approve ${positionals[1]} --yes --expect ${short}${workspace}`,
        );
        return;
      }
      // --expect pins the reviewed revision: --yes without it would approve
      // whatever the spec says now.
      if (
        typeof options.expect !== "string" ||
        !/^[0-9a-f]{16,64}$/.test(options.expect)
      )
        throw Error(
          "--yes needs --expect HASH (16 or more hex digits) from a preview. Run the command without --yes to see it.",
        );
      if (!String(preview.reviewedHash).startsWith(options.expect))
        throw Error(
          `${name} changed since that preview. Nothing approved. Preview again without --yes.`,
        );
      const result = await localOrRequest("plan.approve", {
        id: preview.planId,
        expectedHash: preview.reviewedHash,
        expectedRevision: preview.expectedRevision,
      });
      console.log(
        `Approved ${name} at ${short}${result.evidence ? `. ${result.evidence}` : "."}`,
      );
    },
  },
  {
    command: "planning",
    help: [
      help(
        "plan",
        "planning publish PLAN_ID",
        "Open a private planning pull request",
      ),
      help(
        "plan",
        "planning reconcile",
        "Project tasks from merged planning PRs",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const action = positionals[0];
      if (action === "publish")
        console.log(
          JSON.stringify(
            await localOrRequest("planning.publish", {
              planId: need(
                options.plan || positionals[1],
                "planning publish PLAN_ID",
              ),
            }),
            null,
            2,
          ),
        );
      else if (action === "reconcile")
        console.log(
          JSON.stringify(await localOrRequest("planning.reconcile"), null, 2),
        );
      else throw Error("Choose planning publish or reconcile.");
    },
  },
  {
    command: "spec",
    help: [
      help(
        "plan",
        "spec lint [SPEC]",
        "Lint one spec, or every spec, as approval does",
      ),
      help(
        "plan",
        "spec publish SPEC [--repository OWNER/REPO]",
        "Make the GitHub issues: the spec's issue and its epic's",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      if (positionals[0] === "lint") {
        const { specs } = await localOrRequest(
          "spec.lint",
          positionals[1] ? { spec: positionals[1] } : {},
        );
        let failed = false;
        for (const spec of specs) {
          console.log(
            `${spec.name}: ${spec.counts.error} errors, ${spec.counts.warning} warnings`,
          );
          for (const d of spec.diagnostics)
            console.log(
              `  ${d.severity} ${d.code} ${d.file}:${d.lineStart} ${d.message}`,
            );
          if (spec.counts.error) failed = true;
        }
        if (failed) process.exitCode = 1;
        return;
      }
      if (positionals[0] !== "publish")
        throw Error("Choose spec lint or spec publish.");
      const planId = need(
        options.plan || positionals[1],
        "spec publish SPEC [--repository OWNER/REPO]",
      );
      // Make the GitHub issues (R102.2): a person's own act.
      console.log(
        JSON.stringify(
          await localOrRequest("spec.publish", {
            planId,
            repository: options.repository,
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "intake",
    help: [
      help(
        "plan",
        "intake [list] [--source ID] [--kind KIND] [--state open|closed] [--untriaged]",
        "Incoming items",
      ),
      help(
        "plan",
        "intake view SOURCE ID",
        "One incoming item, its route and history",
      ),
      help(
        "plan",
        "intake submit --source ID --file ITEMS.json",
        "Send 1-100 items to an mcp intake source",
      ),
      help(
        "plan",
        "intake sources",
        "Declared intake sources and their read state",
      ),
      help(
        "plan",
        "intake deliver|plan SOURCE ID",
        "Deliver this or Plan this on an item (a person only)",
      ),
      help(
        "plan",
        "intake confirm SOURCE ID --hash H",
        "Confirm an item's changed text, H from intake view (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Incoming items (design §4.12). `submit` reads a JSON list of items for
      // an mcp source; `deliver` and `plan` are a person's Deliver this and
      // Plan this.
      const [action = "list", source, id] = positionals,
        calls = {
          list: () => [
            "intake.list",
            {
              ...(options.source ? { source: options.source } : {}),
              ...(options.kind ? { kind: options.kind } : {}),
              ...(options.state ? { state: options.state } : {}),
              ...(options.untriaged ? { untriaged: true } : {}),
            },
          ],
          view: () => ["intake.view", { source, id }],
          submit: () => [
            "intake.submit",
            {
              source: options.source,
              items: JSON.parse(
                fs.readFileSync(
                  need(
                    options.file,
                    "intake submit --source ID --file ITEMS.json",
                  ),
                  "utf8",
                ),
              ),
            },
          ],
          sources: () => ["intake.sources", {}],
          deliver: () => ["intake.deliver", { source, id }],
          plan: () => ["intake.plan", { source, id }],
          confirm: () => ["intake.confirm", { source, id, hash: options.hash }],
        };
      if (!calls[action])
        throw Error(
          "Choose intake list, view, submit, sources, deliver, plan or confirm.",
        );
      if (["view", "deliver", "plan", "confirm"].includes(action))
        need(source && id, `intake ${action} SOURCE ID`);
      console.log(
        JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
      );
    },
  },
];
