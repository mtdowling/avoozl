// CLI commands of one kind: command, help lines and run.
import fs from "node:fs";
import { help } from "../cli/command-help.mjs";

export const commands = [
  {
    command: "plan review",
    help: [
      help(
        "plan",
        "plan review SPEC [--start] [--json]",
        "A spec's review findings: severity, state and anchor",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const value = await localOrRequest("plan.review.get", {
        spec: need(positionals[1], "plan review SPEC [--start] [--json]"),
      });
      if (options.start) {
        const result = await localOrRequest("plan.review.decide", {
          planId: value.planId,
          revisionHash: value.revisionHash,
          action: "review",
          unproven: !value.writerModel,
        });
        if (result.existing) value.start = result;
        else value.queued = result;
      }
      if (options.json) console.log(JSON.stringify(value, null, 2));
      else {
        console.log(
          `${value.spec} at ${value.revisionHash}: ${value.queued ? "Review queued" : value.start?.existing ? value.start.state : value.review?.current ? value.review.state : "Not reviewed at this revision"}`,
        );
        if (value.review?.current && value.review.note)
          console.log(value.review.note);
        for (const finding of value.findings) {
          const { anchor } = finding,
            lines =
              anchor.lineStart === anchor.lineEnd
                ? anchor.lineStart
                : `${anchor.lineStart}-${anchor.lineEnd}`,
            where = `${anchor.file}:${lines}${anchor.moved ? " (moved or removed)" : ""}`;
          console.log(
            `${finding.id} ${where} ${finding.severity} ${finding.findingState} ${finding.category}: ${finding.statement}\n  Evidence: ${finding.evidence}${finding.answer ? "\n  Planner: " + finding.answer.action + " " + finding.answer.text : ""}`,
          );
        }
      }
    },
  },
  {
    command: "plan finding",
    help: [
      help(
        "plan",
        "plan finding ID accept|reject|defer|resolve|reopen [--note TEXT] [--revision HASH]",
        "Decide one review finding; reject needs --note (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // A person's action on one review finding (R104.5), at the spec's
      // current revision unless --revision names another stored one.
      const usage =
        "plan finding ID accept|reject|defer|resolve|reopen [--note TEXT] [--revision HASH]";
      const result = await localOrRequest("plan.review.finding.decide", {
        id: need(positionals[1], usage),
        action: need(positionals[2], usage),
        ...(typeof options.note === "string" ? { note: options.note } : {}),
        ...(typeof options.revision === "string"
          ? { revisionHash: options.revision }
          : {}),
      });
      const last = result.decisions.at(-1);
      console.log(
        `${result.id}: ${last.action} by ${last.by} at ${last.revisionHash}`,
      );
    },
  },
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
    command: "plan delete",
    help: [
      help(
        "plan",
        "plan delete PLAN_OR_SPEC [--yes] [--retire] [--delete-spec-folder]",
        "Preview a plan delete; --yes deletes (a person only). --retire is for an approved plan",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const id = need(
          positionals[1],
          "plan delete PLAN_ID_OR_SPEC_NAME [--yes] [--retire] [--delete-spec-folder]",
        ),
        preview = await localOrRequest("plan.delete.preview", { id });
      if (!options.yes) {
        console.log(JSON.stringify(preview, null, 2));
        console.error("Nothing changed. Add --yes to delete this plan.");
      } else
        console.log(
          JSON.stringify(
            await localOrRequest("plan.delete", {
              id: preview.id,
              retire: options.retire === true,
              deleteSpecFolder: options["delete-spec-folder"] === true,
            }),
            null,
            2,
          ),
        );
    },
  },
  {
    command: "plan restore",
    help: [
      help(
        "plan",
        "plan restore PLAN_ID",
        "Bring a deleted plan back (a person only)",
      ),
    ],
    async run({ positionals, localOrRequest, need }) {
      console.log(
        JSON.stringify(
          await localOrRequest("plan.restore", {
            id: need(positionals[1], "plan restore PLAN_ID"),
          }),
          null,
          2,
        ),
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
        "spec publish SPEC [--repository OWNER/REPO]",
        "Make the GitHub issues: the spec's issue and its epic's",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      if (positionals[0] !== "publish") throw Error("Choose spec publish.");
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
    command: "gap-report",
    help: [
      help(
        "plan",
        "gap-report preview|accept SPEC (--path FILE | --issue OWNER/REPO#N)",
        "Turn a gap report into proposed tasks in the sub-specs of a parent spec",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // An external gap report becomes proposed tasks in a parent spec's
      // sub-specs. `preview` shows the table and the proposals; `accept` adds
      // them as draft work (a person only).
      const action = positionals[0];
      if (!["preview", "accept"].includes(action))
        throw Error(
          "Usage: avoozl gap-report preview|accept PARENT_SPEC (--path FILE | --issue OWNER/REPO#N)",
        );
      const input = {
        parent: need(positionals[1], "gap-report " + action + " PARENT_SPEC"),
        ...(options.path ? { path: options.path } : {}),
        ...(options.issue ? { issue: options.issue } : {}),
      };
      if (action === "preview") {
        const found = await localOrRequest("gap.preview", input);
        console.log(found.table);
        console.log(
          found.proposals.length
            ? "\n" +
                found.proposals
                  .map((p) => `${p.spec}:${p.id}  ${p.title}`)
                  .join("\n")
            : "\nNo failing cell, so no proposed task.",
        );
      } else
        console.log(
          JSON.stringify(await localOrRequest("gap.accept", input), null, 2),
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
