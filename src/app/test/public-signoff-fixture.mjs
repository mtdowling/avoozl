// A complete public crew checklist in temporary folders, for tests that need
// a current sign-off (R85.8). Fake terms only; nothing here is a real name.
import fs from "node:fs";
import path from "node:path";
import { bindContentRules, contentBinding } from "../content-rules.mjs";
import { AUDIT_CURSORS } from "../public-crews.mjs";
import { DEFAULT_AGENT, signOff } from "../public-signoff.mjs";
import { temporaryDirectory } from "./temporary.mjs";

export const FAKE_SET = "fake-terms";
export const HOOK_COMMAND = "avoozl content hook --workspace /fake/workspace";

// A crew home with one agent that runs the content hook.
export function crewHome({ agent = DEFAULT_AGENT, hook = HOOK_COMMAND } = {}) {
  const home = temporaryDirectory("avoozl-crew-home-");
  fs.mkdirSync(path.join(home, "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(home, "agents", `${agent}.json`),
    JSON.stringify({
      name: agent,
      hooks: hook ? { preToolUse: [{ matcher: "*", command: hook }] } : {},
    }),
  );
  return home;
}

// One fake rule set in the workspace content rules are bound to (binding
// one when there is none).
export function fakeRuleSet(store) {
  let root = contentBinding(store)?.workspaceRoot;
  if (!root) {
    root = temporaryDirectory("avoozl-rules-");
    bindContentRules(store, {
      workspaceRoot: root,
      configFile: path.join(root, "config", "config.json"),
    });
  }
  const file = path.join(root, ".avoozl.json");
  let config = { version: 1 };
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const sets = config.contentRules?.sets ?? [];
  if (!sets.some((set) => set.id === FAKE_SET))
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...config,
        contentRules: {
          ...config.contentRules,
          sets: [...sets, { id: FAKE_SET }],
        },
      }),
    );
  const dir = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${FAKE_SET}.txt`), "canary: zorblatcanary\n");
  return root;
}

// The tick's audit cursor, as if the tick had just audited the repository.
export function auditRan(store, repository, now = Date.now()) {
  store.setMeta(AUDIT_CURSORS, {
    ...(store.getMeta(AUDIT_CURSORS) ?? {}),
    [repository]: { since: new Date(now).toISOString() },
  });
}

// Every item met and a sign-off recorded. Returns the crew home.
export function signedOff(store, repository) {
  fakeRuleSet(store);
  auditRan(store, repository);
  const home = crewHome();
  signOff(
    store,
    { repositories: { [repository]: {} } },
    { repository, complete: true, home },
    { by: "tester" },
  );
  return home;
}
