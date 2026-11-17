// Crews on public repositories, layer 4 (task 39.3, design §6.14, R85.1,
// R85.2, R85.8, R85.10): the checklist, the person-only sign-off and its
// lapse. Temporary folders and fake terms only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { principalAllows } from "../app-backend.mjs";
import { cliRefusal, mcpRefusal } from "../mcp-policy.mjs";
import {
  AUDIT_FRESH_MS,
  NO_RULES,
  PUBLIC_HELD,
  checklist,
  publicCrewsView,
  publicHold,
  signOff,
} from "../public-signoff.mjs";
import { fixture } from "./fixtures.mjs";
import {
  FAKE_SET,
  auditRan,
  crewHome,
  fakeRuleSet,
} from "./public-signoff-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "example/public";
const POLICY = { repositories: { [REPO]: {} } };

function ready(t) {
  const { store } = fixture(t);
  store.put("github_repositories", { id: REPO, private: false });
  const root = fakeRuleSet(store);
  auditRan(store, REPO);
  return { store, root, home: crewHome() };
}
const failing = (list) =>
  list.items.filter((item) => !item.ok).map((item) => item.key);
const sign = (store, home, extra = {}) =>
  signOff(
    store,
    POLICY,
    { repository: REPO, complete: true, home, ...extra },
    { by: "pat", now: Date.parse("2026-11-17T10:00:00Z") },
  );

test("a complete checklist passes; each item fails alone with its reason", (t) => {
  const { store, root, home } = ready(t);
  assert.deepEqual(failing(checklist(store, REPO, { home })), []);

  assert.deepEqual(failing(checklist(store, REPO, {})), ["home", "hook"]);
  assert.deepEqual(failing(checklist(store, REPO, { home: "relative" })), [
    "home",
    "hook",
  ]);

  const dirty = crewHome();
  fs.mkdirSync(path.join(dirty, "steering"));
  fs.writeFileSync(path.join(dirty, "steering", "rules.md"), "x");
  const list = checklist(store, REPO, { home: dirty });
  assert.deepEqual(failing(list), ["home"]);
  assert.match(list.items[0].line, /steering/);

  assert.deepEqual(
    failing(checklist(store, REPO, { home: crewHome({ hook: null }) })),
    ["hook"],
  );
  assert.deepEqual(
    failing(checklist(store, REPO, { home: crewHome({ hook: "echo hi" }) })),
    ["hook"],
  );
  assert.deepEqual(failing(checklist(store, REPO, { home, agent: "other" })), [
    "hook",
  ]);

  auditRan(store, REPO, Date.now() - AUDIT_FRESH_MS - 1000);
  assert.deepEqual(failing(checklist(store, REPO, { home })), ["audit"]);
  auditRan(store, REPO);

  // A covering set whose terms file is gone is unavailable: no banner.
  const terms = path.join(
    root,
    ".avoozl",
    "local",
    "content-rules",
    `${FAKE_SET}.txt`,
  );
  fs.rmSync(terms);
  const missing = checklist(store, REPO, { home });
  assert.deepEqual(failing(missing), ["rules"]);
  assert.equal(missing.banner, null);
});

test("no covering rule set shows the banner and keeps sign-off closed (R85.10)", (t) => {
  const { store } = fixture(t);
  store.put("github_repositories", { id: REPO, private: false });
  auditRan(store, REPO);
  const home = crewHome();
  const list = checklist(store, REPO, { home });
  assert.equal(list.banner, NO_RULES);
  assert.deepEqual(failing(list), ["rules"]);
  assert.throws(() => sign(store, home), { status: 409 });
  const [row] = publicCrewsView(store, POLICY);
  assert.equal(row.banner, NO_RULES);
  assert.equal(row.ready, false);
});

test("the sign-off records who, when and a hash, and is refused while an item fails", (t) => {
  const { store, home } = ready(t);
  assert.equal(publicHold(store, REPO), PUBLIC_HELD);
  assert.throws(
    () => sign(store, null),
    (error) => error.status === 409 && /Crew home/.test(error.message),
  );
  assert.throws(() => sign(store, home, { agent: "bad name!" }), {
    status: 400,
  });
  assert.throws(
    () => signOff(store, POLICY, { repository: "x/y", complete: true }),
    { status: 404 },
  );
  const record = sign(store, home);
  assert.equal(record.by, "pat");
  assert.equal(record.at, "2026-11-17T10:00:00.000Z");
  assert.match(record.hash, /^[0-9a-f]{64}$/);
  assert.equal(publicHold(store, REPO), null);
  // No term or path text is kept in the record, only the home and a hash.
  assert.ok(
    !JSON.stringify(store.getMeta("publicSignoff")).includes("zorblat"),
  );
  // A private repository is never held.
  store.put("github_repositories", { id: "example/private", private: true });
  assert.equal(publicHold(store, "example/private"), null);
});

test("the sign-off lapses when any hashed item changes, and withdraw holds again", (t) => {
  const changes = {
    hook: ({ home }) =>
      fs.writeFileSync(
        path.join(home, "agents", "avoozl-crew.json"),
        JSON.stringify({
          hooks: {
            preToolUse: [
              { matcher: "execute_bash", command: "avoozl content hook" },
            ],
          },
        }),
      ),
    home: ({ home }) => {
      fs.mkdirSync(path.join(home, "memory"));
      fs.writeFileSync(path.join(home, "memory", "note.md"), "x");
    },
    rules: ({ root }) =>
      fs.writeFileSync(
        path.join(root, ".avoozl", "local", "content-rules", `${FAKE_SET}.txt`),
        "canary: zorblatcanary\nother: quuxfake\n",
      ),
    audit: ({ store }) =>
      auditRan(store, REPO, Date.now() - AUDIT_FRESH_MS - 1000),
  };
  for (const [name, change] of Object.entries(changes)) {
    const w = ready(t);
    sign(w.store, w.home);
    assert.equal(publicHold(w.store, REPO), null, name);
    change(w);
    assert.equal(publicHold(w.store, REPO), PUBLIC_HELD, name);
    const [row] = publicCrewsView(w.store, POLICY);
    assert.equal(row.lapsed, true, name);
    assert.equal(row.signedOff, null, name);
  }
  const w = ready(t);
  sign(w.store, w.home);
  signOff(w.store, POLICY, { repository: REPO, complete: false });
  assert.equal(publicHold(w.store, REPO), PUBLIC_HELD);
  assert.equal(publicCrewsView(w.store, POLICY)[0].lapsed, false);
  // A record from before the checklist (no hash) is not current.
  w.store.setMeta("publicSignoff", { [REPO]: { complete: true } });
  assert.equal(publicHold(w.store, REPO), PUBLIC_HELD);
});

test("only a person signs off: agents, app tokens, MCP and agent CLIs are refused", () => {
  for (const name of ["publiccrews.signoff", "radar.signoff"]) {
    for (const kind of ["app-token", "agent-tool", "none"])
      assert.equal(principalAllows({ kind }, name), false, `${name} ${kind}`);
    assert.equal(principalAllows({ kind: "owner-session" }, name), true);
    assert.match(mcpRefusal(name, {}), /Only a person signs off/);
    assert.ok(
      cliRefusal(
        name,
        {},
        { env: { KIROCREW_SPAWNED: "1", KIRO_SESSION_ID: "s" } },
      ),
      name,
    );
  }
});
