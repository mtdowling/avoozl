#!/usr/bin/env node
// Proof P64, retro stage (design §4.30, R100). Runs on the scratch store
// that scripts/proof-p64-live.mjs filled, and makes no GitHub call.
//
//   node scripts/proof-p64-retro.mjs <root> start   start the retro; writes
//        retro-brief.txt and retro-prompt.md (the retro role prompt)
//   node scripts/proof-p64-retro.mjs <root> reply   record retro-reply.txt,
//        the retro chat's answer, and print what was kept and dropped
import fs from "node:fs";
import path from "node:path";
import {
  recordRetroReply,
  retroPrompt,
  retroStep,
} from "../src/app/flow/flow-retro.mjs";
import { Store } from "../src/app/store/store.mjs";

const [rootArg, mode, repository = "mtdowling/avoozl"] = process.argv.slice(2);
if (!rootArg || !["start", "reply"].includes(mode)) {
  console.error("Use: proof-p64-retro.mjs <root> start|reply [owner/repo]");
  process.exit(2);
}
const root = path.resolve(rootArg),
  store = new Store(path.join(root, ".avoozl", "local", "workspace.sqlite")),
  config = JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"));
try {
  if (mode === "start") {
    const out = retroStep(store, config, {
      repository,
      ciRepositories: [repository],
      ciConfig: config,
    });
    const retro = store.list("flow_retros").at(-1);
    console.log(
      JSON.stringify(
        { started: out.retro, triggers: retro?.triggers ?? [] },
        null,
        2,
      ),
    );
    if (out.dispatch[0]) {
      fs.writeFileSync(
        path.join(root, "retro-brief.txt"),
        out.dispatch[0].brief,
      );
      fs.writeFileSync(path.join(root, "retro-prompt.md"), retroPrompt() || "");
    }
  } else {
    const retro = store.list("flow_retros").at(-1),
      text = fs.readFileSync(path.join(root, "retro-reply.txt"), "utf8"),
      { retro: done } = recordRetroReply(store, retro.id, text);
    console.log(
      JSON.stringify(
        {
          state: done.state,
          error: done.error ?? null,
          proposals: done.proposals,
          dropped: done.dropped,
        },
        null,
        2,
      ),
    );
  }
} finally {
  store.close();
}
