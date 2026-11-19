// Setup target and source access in one preview (task 42.2).
import test from "node:test";
import assert from "node:assert/strict";
import { previewAccess, applyAccess } from "../setup-access.mjs";

const wanted = {
  target: "acme/app",
  base: "main",
  roots: { code: "/work/app", plans: "/work/plans" },
  sources: {
    "me/app": { url: "https://example.com/me/app.git", parent: "acme/app" },
  },
};
const roles = { "acme/app": "read", "me/app": "write" };
const github = {
  asked: [],
  permission: async (repository, login) => ({
    permission: roles[repository] ?? "none",
    login,
  }),
};

test("setup previews roots, target, fork and separate push and merge access", async () => {
  const preview = await previewAccess(github, {
    wanted,
    current: null,
    login: "me",
  });
  assert.deepEqual(
    preview.changes.map((change) => change.key),
    ["target", "base", "roots.code", "roots.plans", "sources.me/app"],
  );
  assert.deepEqual(preview.access, [
    { repository: "acme/app", kind: "target", role: "read", merge: false },
    { repository: "me/app", kind: "source", role: "write", push: true },
  ]);
  assert.equal(preview.message, null);
  assert.ok(!JSON.stringify(preview).match(/label|project|issue/i));
});

test("a retry with nothing to change says so and writes nothing", async () => {
  const preview = await previewAccess(github, {
    wanted,
    current: structuredClone(wanted),
    login: "me",
  });
  assert.equal(preview.message, "Nothing to change");
  let writes = 0;
  const result = await applyAccess(preview, () => writes++);
  assert.deepEqual(result, { written: false, message: "Nothing to change" });
  assert.equal(writes, 0);
});

test("a changed base writes once, with the new settings", async () => {
  const preview = await previewAccess(github, {
    wanted: { ...wanted, base: "dev" },
    current: wanted,
    login: "me",
  });
  assert.deepEqual(preview.changes, [
    { key: "base", before: "main", after: "dev" },
  ]);
  const seen = [];
  await applyAccess(preview, (settings) => seen.push(settings));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].base, "dev");
});

test("a source without a fetch location is refused", async () => {
  await assert.rejects(
    previewAccess(github, {
      wanted: { ...wanted, sources: { "me/app": {} } },
      current: null,
      login: "me",
    }),
    /fetch location/,
  );
});
