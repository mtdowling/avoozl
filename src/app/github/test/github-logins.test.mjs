// plugin-credentials pc-4.1 and pc-4.2: the token login and the person
// login are kept apart, and limits, pacing and the answer cache are per
// token login.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../../store/store.mjs";
import { GitHubClient, personOf } from "../github.mjs";
import { RateState, readRate } from "../github-rate.mjs";
import { WritePacer } from "../github-pacer.mjs";
import { withJob } from "../github-jobs.mjs";
import { credentialsNeedsYou, recordNoPerson } from "../github-credentials.mjs";
import {
  credentialsMachine,
  fixedCredentials,
} from "../../test/github-credentials.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

function workspace(t) {
  const root = temporaryDirectory("avoozl-logins-"),
    store = new Store(path.join(root, "w.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  return store;
}

test("with a plugin, currentUser is the reply's login with no GET /user, and personLogin its person", async (t) => {
  const m = credentialsMachine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials(),
    seen = [];
  t.after(() => credentials.close());
  const github = new GitHubClient({
    credentials,
    apiUrl: "https://api.example.test",
    fetch: async (url) => {
      seen.push(String(url));
      return new Response("{}");
    },
  });
  await withJob("check-in", async () => {
    assert.deepEqual(await github.currentUser("acme/api"), {
      login: "acme-bot[bot]",
    });
    assert.equal(await github.personLogin("acme/api"), "acme-dev");
    assert.equal(await personOf(github, "acme/api"), "acme-dev");
  });
  assert.deepEqual(seen, []);
  // gh and env: both are the GET /user login.
  const env = m.credentials({ AVOOZL_GITHUB_TOKEN: "env-token" }),
    built = new GitHubClient({ credentials: env, fetch: async () => null });
  await withJob("check-in", async () => {
    assert.equal((await built.currentUser("octo/tools")).login, "env-person");
    assert.equal(await built.personLogin("octo/tools"), "env-person");
  });
});

test("a provider that names no person makes person steps wait with one Needs you row", async (t) => {
  const store = workspace(t),
    m = credentialsMachine({ plugins: [{ config: { person: "" } }] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  const github = new GitHubClient({ credentials, fetch: async () => null });
  github.onNoPerson = (provider, owner) =>
    recordNoPerson(store, { provider, owner });
  await withJob("check-in", async () => {
    assert.equal(await github.personLogin("acme/api"), null);
    assert.equal(await github.personLogin("acme/web"), null);
  });
  const rows = credentialsNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /names no person/);
});

test("a login equal to the person's own changes no approval or grant decision", async () => {
  // Rights and approvals read the person login only; a lying token login
  // is shown and counted, never trusted.
  const github = new GitHubClient({
    credentials: fixedCredentials("t", "mtdowling", { person: "acme-dev" }),
    fetch: async () => null,
  });
  await withJob("check-in", async () =>
    assert.equal(await personOf(github, "acme/api"), "acme-dev"),
  );
});

test("a primary limit on one login holds its calls and not another's", (t) => {
  const store = workspace(t),
    rate = new RateState(store);
  rate.limit({
    resource: "core",
    until: Date.now() + 600_000,
    reason: "primary",
    login: "acme-bot[bot]",
  });
  assert.ok(rate.held("core", "acme-bot[bot]"));
  assert.equal(rate.held("core", "mtdowling"), null);
  // Another process sees the same per-login entries.
  const other = new RateState(store);
  other.observe(
    "core",
    { limit: 5000, remaining: 4000, resetAtMs: Date.now() + 3600_000 },
    "mtdowling",
  );
  other.flush();
  const stored = readRate(store);
  assert.ok(stored.logins["acme-bot[bot]"].pause);
  assert.equal(stored.logins.mtdowling.resources.core.remaining, 4000);
  assert.equal(stored.pause, null, "the workspace is not held");
});

test("pacer windows count one login's writes", async (t) => {
  const store = workspace(t),
    pacer = new WritePacer(store, {
      limits: () => ({ perMinute: 1, perHour: 10 }),
      sleep: async () => {},
    });
  await pacer.run(
    { method: "POST", pathname: "/x", login: "a" },
    async () => 1,
  );
  // a's next write waits; b's goes at once.
  assert.equal(pacer.history(Date.now(), "a").length, 1);
  assert.equal(pacer.history(Date.now(), "b").length, 0);
  assert.equal(
    await pacer.run(
      { method: "POST", pathname: "/x", login: "b" },
      async () => 2,
    ),
    2,
  );
});

test("a new token for the same login reads the cached answers", async (t) => {
  const store = workspace(t);
  let n = 0;
  const calls = [],
    credentials = {
      ...fixedCredentials(),
      async token(input) {
        n += 1;
        return {
          ...(await fixedCredentials(`t${n}`).token(input)),
          login: "same",
        };
      },
    },
    github = new GitHubClient({
      credentials,
      apiUrl: "https://api.example.test",
      fetch: async (url) => {
        calls.push(String(url));
        return new Response('{"id":1}', { headers: { etag: '"a"' } });
      },
    }).bind(store, { cacheSeconds: () => 60 });
  await withJob("check-in", async () => {
    await github.repository("o/r");
    await github.repository("o/r");
  });
  assert.equal(n, 2, "two tokens");
  assert.equal(calls.length, 1, "one call: the second token read the cache");
});
