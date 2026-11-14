import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRetroRule,
  retroView,
  undoRetroRule,
  withRetroBlock,
  withoutRetroBlock,
} from "../radar-retro-rules.mjs";

// rc-8.5, fake GitHub only. All data is made up.
const REPO = "o/r";
function store() {
  const meta = {};
  return {
    getMeta: (k) => meta[k],
    setMeta: (k, v) => (meta[k] = v),
  };
}
function github(files = { "AGENTS.md": "# Rules\n" }) {
  const calls = [];
  return {
    calls,
    files,
    async request(method, url, { body } = {}) {
      calls.push(`${method} ${url}`);
      if (url.includes("/git/ref/heads/")) return { object: { sha: "base1" } };
      if (url.endsWith("/git/refs")) return {};
      if (method === "GET" && url.includes("/contents/")) {
        const path = url.split("/contents/")[1];
        if (!(path in files))
          throw Object.assign(new Error("nf"), { status: 404 });
        return {
          sha: `s-${path}`,
          content: Buffer.from(files[path]).toString("base64"),
        };
      }
      if (method === "PUT") {
        files[`${url.split("/contents/")[1]}@${body.branch}`] = Buffer.from(
          body.content,
          "base64",
        ).toString();
        return {};
      }
      if (url.endsWith("/pulls")) return { number: 70 + calls.length };
      throw new Error(`unexpected ${method} ${url}`);
    },
  };
}

test("applying an AGENTS.md rule opens a pull request on its own branch", async () => {
  const s = store(),
    gh = github();
  const out = await applyRetroRule(
    s,
    gh,
    { repository: REPO, target: "agents", text: "Run lint first." },
    { now: 1000 },
  );
  assert.equal(out.written, true);
  assert.ok(out.pr > 0);
  assert.ok(gh.calls.some((c) => c.startsWith("POST") && c.endsWith("/pulls")));
  const branch = Object.keys(gh.files).find((k) => k.startsWith("AGENTS.md@"));
  assert.match(branch, /@avoozl\/retro-/);
  assert.match(gh.files[branch], /^# Rules\n\n<!-- avoozl:retro/);
  assert.match(gh.files[branch], /Run lint first\./);
  assert.ok(
    !gh.calls.some((c) => /heads\/main$/.test(c) && c.startsWith("PUT")),
  );
});

test("a steering rule needs a steering path", async () => {
  const s = store(),
    gh = github({});
  await assert.rejects(
    applyRetroRule(s, gh, {
      repository: REPO,
      target: "steering",
      text: "x",
      file: "../x.md",
    }),
    /steering file/,
  );
  const out = await applyRetroRule(s, gh, {
    repository: REPO,
    target: "steering",
    text: "Be brief.",
    file: ".kiro/steering/crew.md",
  });
  assert.equal(out.written, true);
  assert.equal(
    gh.calls.some((c) => c.includes("AGENTS.md")),
    false,
  );
});

test("the prompt target writes nothing to GitHub or Radar", async () => {
  const s = store(),
    gh = github();
  const out = await applyRetroRule(s, gh, {
    repository: REPO,
    target: "prompt",
    text: "Skip docs-only issues.",
  });
  assert.equal(out.written, false);
  assert.equal(out.copy, "Skip docs-only issues.");
  assert.deepEqual(gh.calls, []);
});

test("a content rule blocks the pull request before any write", async () => {
  const s = store(),
    gh = github();
  await assert.rejects(
    applyRetroRule(
      s,
      gh,
      { repository: REPO, target: "agents", text: "bad" },
      { check: () => ["names/secret"] },
    ),
    /content rule blocks/,
  );
  assert.deepEqual(
    gh.calls.filter((c) => c.startsWith("POST") || c.startsWith("PUT")),
    [],
  );
  assert.deepEqual(s.getMeta("radarRetro") ?? [], []);
});

test("the check runs after N finished issues and offers an undo", async () => {
  const s = store(),
    gh = github();
  const t0 = Date.parse("2026-11-09T08:00:00Z");
  await applyRetroRule(
    s,
    gh,
    { repository: REPO, target: "agents", text: "Rule.", checkAfter: 3 },
    { now: t0 },
  );
  const at = (m) => new Date(t0 + m * 60000).toISOString();
  const rows = [
    { repository: REPO, merged: at(-10) },
    { repository: REPO, merged: at(5) },
    { repository: REPO, merged: at(9) },
    { repository: "o/other", merged: at(9) },
  ];
  let [view] = retroView(s, rows);
  assert.equal(view.since, 2);
  assert.equal(view.due, false);
  assert.equal(view.undo, null);
  [view] = retroView(s, [...rows, { repository: REPO, merged: at(20) }]);
  assert.equal(view.since, 3);
  assert.equal(view.due, true);
  assert.match(view.undo.offer, /Undo AGENTS\.md/);
  // The rule's pull request is merged: main now holds the block.
  gh.files["AGENTS.md"] =
    gh.files[Object.keys(gh.files).find((k) => k.startsWith("AGENTS.md@"))];
  const out = await undoRetroRule(s, gh, view.id);
  assert.ok(out.undoPr > 0);
  const undone = Object.keys(gh.files).find((k) => k.includes("retro-undo"));
  assert.doesNotMatch(gh.files[undone], /avoozl:retro/);
  assert.equal(retroView(s, rows)[0].undone, true);
});

test("the block adds and removes cleanly", () => {
  const text = withRetroBlock("# A\n", "r1", "Do it.");
  assert.equal(withoutRetroBlock(text, "r1").trim(), "# A");
});
