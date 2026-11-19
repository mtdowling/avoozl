// CLI commands of one kind: command, help lines and run.
import { batchLine } from "./support.mjs";
import fs from "node:fs";
import { help } from "../command-help.mjs";

export const commands = [
  {
    command: "plan batches",
    help: [
      help(
        "plan",
        "plan batches [--writes]",
        "Draft specs in dependency order; any spec may be approved alone, and a task that waits on a draft spec stays held",
      ),
    ],
    async run({ options, localOrRequest }) {
      // Draft specs in the order they can be approved (plan.approvalBatches).
      const found = await localOrRequest("plan.approvalBatches", {
        writes: options.writes === true,
      });
      if (!found.batches.length) console.log("No draft specs to approve.");
      for (const batch of found.batches) {
        console.log(`Batch ${batch.batch} (${batch.specs.length} specs)`);
        for (const entry of batch.specs) console.log("  " + batchLine(entry));
      }
    },
  },
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
        "plan approve PLAN... [--batch N] [--yes --expect HASHES] [--delegate NAME]",
        "Preview approving exactly these specs; --yes approves all or none (a person, or a delegate a person granted)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const usage =
          "plan approve PLAN... [--batch N] [--yes --expect HASHES] [--delegate NAME]",
        names = positionals.slice(1);
      if (!names.length && options.batch === undefined) need(undefined, usage);
      const listed = await localOrRequest("plan.approvalBatches", {}),
        drafts = listed.batches.flatMap((batch) => batch.specs),
        ids = [];
      if (options.batch !== undefined) {
        const batch = listed.batches[Number(options.batch) - 1];
        if (!/^[1-9][0-9]*$/.test(String(options.batch)) || !batch)
          throw Error(
            `There is no batch ${options.batch}. avoozl plan batches lists ${listed.batches.length}.`,
          );
        ids.push(...batch.specs.map((entry) => entry.id));
      }
      for (const name of names) {
        const entry = drafts.find((e) => e.id === name || e.spec === name);
        if (!entry) throw Error(`${name} is not a draft spec.`);
        if (!ids.includes(entry.id)) ids.push(entry.id);
      }
      const chosen = ids.map((id) => drafts.find((entry) => entry.id === id)),
        short = (entry) => entry.hash.slice(0, 16);
      if (!options.yes) {
        const { selection } = await localOrRequest("plan.approvalBatches", {
          ids,
        });
        console.log("Nothing approved. These specs would be approved:");
        for (const entry of selection.specs)
          console.log("  " + batchLine(entry));
        const tasks = selection.specs.reduce((sum, e) => sum + e.tasks, 0);
        console.log(`${selection.specs.length} specs, ${tasks} tasks.`);
        if (selection.pullRequest)
          console.log(
            `${selection.pullRequest} of these are approved through one approval pull request: --yes opens it, and running the same command again after it merges approves them.`,
          );
        if (selection.missing.length)
          console.log(
            `${selection.waiting} ${selection.waiting === 1 ? "task waits" : "tasks wait"} on draft specs left out of the selection, and ${selection.waiting === 1 ? "starts" : "start"} only once they are approved: ${selection.missing.join(", ")}. Approving the selection does not need them.`,
          );
        for (const failure of selection.failures)
          console.log(
            `Would fail: ${failure.spec || failure.id}: ${failure.error}`,
          );
        const workspace = options.workspace
          ? ` --workspace ${JSON.stringify(options.workspace)}`
          : "";
        const delegate =
          typeof options.delegate === "string"
            ? ` --delegate ${options.delegate}`
            : "";
        console.log("To approve exactly these revisions, run:");
        console.log(
          `  avoozl plan approve ${options.batch !== undefined ? `--batch ${options.batch} ` : ""}${names.join(" ")}${names.length ? " " : ""}--yes --expect ${chosen.map(short).join(",")}${workspace}${delegate}`,
        );
        if (!selection.ok) process.exitCode = 1;
      } else {
        // --expect pins the reviewed revisions: every chosen spec's hash must
        // start with one listed prefix, and nothing else may be chosen. --yes
        // without it would approve whatever the specs say now.
        if (options.expect === undefined || options.expect === true)
          throw Error(
            "--yes needs --expect HASHES from a preview. Run the command without --yes to see them.",
          );
        const expected = String(options.expect).split(",").filter(Boolean);
        if (expected.some((prefix) => !/^[0-9a-f]{16,64}$/.test(prefix)))
          throw Error("--expect takes hash prefixes of 16 or more hex digits.");
        const changed = chosen.filter(
          (entry) => !expected.some((prefix) => entry.hash.startsWith(prefix)),
        );
        if (changed.length || expected.length !== chosen.length)
          throw Error(
            `The specs changed since that preview${changed.length ? `: ${changed.map((e) => e.spec).join(", ")}` : ""}. Nothing approved. Preview again without --yes.`,
          );
        const result = await localOrRequest("plan.approveMany", {
          items: chosen.map((entry) => ({
            id: entry.id,
            expectedHash: entry.hash,
          })),
          ...(typeof options.delegate === "string"
            ? { delegate: options.delegate }
            : {}),
        });
        if (result.pending) {
          console.log(
            "Nothing approved yet. Merge this approval pull request, then run the same command again:",
          );
          for (const pull of result.approvalPullRequests)
            console.log(
              `  https://github.com/${pull.repository}/pull/${pull.number}  (${pull.specs.length} specs)`,
            );
        } else if (result.ok) {
          const by = result.approved[0]?.delegation;
          console.log(
            `Approved ${result.approved.length} specs${by ? ` as delegate ${by.delegate} on behalf of ${by.onBehalfOf}` : ""}:`,
          );
          for (const entry of chosen)
            console.log(
              `  ${entry.spec}  ${short(entry)}  ${entry.tasks} tasks`,
            );
        } else {
          console.log("Nothing approved. These specs failed:");
          for (const failure of result.failures)
            console.log(`  ${failure.spec || failure.id}: ${failure.error}`);
          process.exitCode = 1;
        }
      }
    },
  },
  {
    command: "approval",
    help: [
      help(
        "plan",
        "approval delegates",
        "Who may approve on a person's behalf, and every grant and revocation",
      ),
      help(
        "plan",
        "approval delegate NAME [--on-behalf-of LOGIN] [--note TEXT]",
        "Let NAME (an agent) approve specs on your behalf (a person only)",
      ),
      help(
        "plan",
        "approval revoke NAME",
        "Stop NAME approving on your behalf (a person only)",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Approval delegation (R109): who may approve on a person's behalf.
      const usage =
        "approval delegates | approval delegate NAME [--on-behalf-of LOGIN] [--note TEXT] | approval revoke NAME";
      if (positionals[0] === "delegates") {
        const found = await localOrRequest("approval.delegates", {});
        if (options.json) console.log(JSON.stringify(found, null, 2));
        else if (!found.delegates.length)
          console.log("No approval delegates. Only a person approves.");
        else
          for (const entry of found.delegates)
            console.log(
              `${entry.identity} approves on behalf of ${entry.onBehalfOf} since ${entry.grantedAt}${entry.note ? ` (${entry.note})` : ""}`,
            );
      } else if (positionals[0] === "delegate") {
        const granted = await localOrRequest("approval.delegate.grant", {
          identity: need(positionals[1], usage),
          ...(typeof options["on-behalf-of"] === "string"
            ? { onBehalfOf: options["on-behalf-of"] }
            : {}),
          ...(typeof options.note === "string" ? { note: options.note } : {}),
        });
        console.log(
          `${granted.identity} may approve specs on behalf of ${granted.onBehalfOf}. Revoke with: avoozl approval revoke ${granted.identity}`,
        );
      } else if (positionals[0] === "revoke") {
        const revoked = await localOrRequest("approval.delegate.revoke", {
          identity: need(positionals[1], usage),
        });
        console.log(`${revoked.identity} may no longer approve specs.`);
        for (const pull of revoked.openApprovalPullRequests)
          console.log(
            `  Still open, opened by it: https://github.com/${pull.repository}/pull/${pull.number}`,
          );
      } else need(undefined, usage);
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
        "Publish the spec issue, or its local journal without GitHub",
      ),
      help(
        "plan",
        "spec takeover SPEC",
        "Take over a published spec: write the next driver generation",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      const action = positionals[0];
      if (!["publish", "takeover"].includes(action))
        throw Error("Choose spec publish or spec takeover.");
      const planId = need(
        options.plan || positionals[1],
        action === "takeover"
          ? "spec takeover SPEC"
          : `spec ${action} SPEC [--repository OWNER/REPO]`,
      );
      // Publish the spec issue or local journal (R102.2) and take it over
      // (R102.13): each a person's own act.
      console.log(
        JSON.stringify(
          await localOrRequest(
            `spec.${action}`,
            action === "takeover"
              ? { planId }
              : { planId, repository: options.repository },
          ),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "spec journal",
    help: [
      help(
        "plan",
        "spec journal reanchor SPEC --held ID,... --tail ID [--yes]",
        "Preview, then with --yes restore a held journal; the spec stays held",
      ),
      help(
        "plan",
        "spec journal resume SPEC --tail ID",
        "Resume a spec after its journal was reanchored",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Reanchor a held journal (R102.26): preview, or --yes to write it and
      // hold the spec; then resume it. Each a person's own act.
      const action = positionals[1];
      if (!["reanchor", "resume"].includes(action))
        throw Error("Choose spec journal reanchor or spec journal resume.");
      const planId = need(
          options.plan || positionals[2],
          action === "reanchor"
            ? "spec journal reanchor SPEC --held ID,... --tail ID [--yes]"
            : "spec journal resume SPEC --tail ID",
        ),
        tail = Number(
          need(options.tail, `spec journal ${action} SPEC --tail ID`),
        );
      console.log(
        JSON.stringify(
          await localOrRequest(
            `spec.journal.${action}`,
            action === "reanchor"
              ? {
                  planId,
                  tail,
                  held: String(need(options.held, "--held ID,..."))
                    .split(",")
                    .map((id) => Number(id.trim()))
                    .filter(Boolean),
                  apply: options.yes === true,
                }
              : { planId, tail },
          ),
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
