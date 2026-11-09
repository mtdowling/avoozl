import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { fixture } from "./fixtures.mjs";
import { startAgentHost } from "../agent-host.mjs";
import { RemoteManager } from "../remote-manager.mjs";
import { startServer } from "../server.mjs";
import { git } from "../git.mjs";

test("web reload preserves agent session, pending approval, subagent ownership and event cursor", async (t) => {
  const { root, store } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(repo, "initial.txt"), "fixture");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Prepare fixture"]);
  let adapterClosed = false,
    answered = false,
    emit;
  const factory = (options) => ({
    async start() {
      emit = options.emit;
      emit("session", { providerSessionId: "persistent-session" });
      options.onRequest({
        providerRequestId: "approval-id",
        kind: "approval",
        method: "Fixture",
        payload: { command: "fixture check" },
      });
    },
    async answer() {
      answered = true;
      return { accepted: true };
    },
    async close() {
      adapterClosed = true;
    },
  });
  const manifestPath = path.join(root, "host.json"),
    host = startAgentHost({
      dbPath: store.filename,
      manifestPath,
      factories: { codex: factory },
    });
  const servers = [host];
  t.after(async () => {
    for (const server of servers.reverse())
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
  });
  await once(host, "listening");
  const remote = new RemoteManager(manifestPath),
    web1 = startServer({
      dbPath: store.filename,
      port: 0,
      projectionRoot: path.join(root, "docs"),
      manager: remote,
    });
  servers.push(web1);
  await once(web1, "listening");
  const ops = web1.workspace.ops;
  await ops.execute("project.configure", { id: "fixture", root: repo });
  const { run } = await ops.execute("intent.submit", {
    action: "ask",
    prompt: "Inspect the fixture.",
    context: { selected: "sample-task" },
    submissionId: "reload-proof-intent",
    runId: "run-reload",
    projectId: "fixture",
    provider: "codex",
  });
  assert.equal(run.state, "waiting-approval");
  const cursor = store.db.prepare("SELECT MAX(seq) seq FROM events").get().seq;
  await new Promise((resolve) => {
    web1.once("close", resolve);
    web1.drain();
  });
  assert.equal(adapterClosed, false);
  assert.equal(
    host.agentHost.store.get("runs", run.id).providerSessionId,
    "persistent-session",
  );
  emit("message", { text: "Work continued while the UI restarted." });
  const web2 = startServer({
    dbPath: store.filename,
    port: 0,
    projectionRoot: path.join(root, "docs"),
    manager: remote,
  });
  servers.push(web2);
  await once(web2, "listening");
  const response = await fetch(
    "http://127.0.0.1:" +
      web2.address().port +
      "/api/events?run=" +
      run.id +
      "&after=" +
      cursor,
  );
  const replay = await response.json();
  assert.ok(
    replay.events.some(
      (e) => e.text === "Work continued while the UI restarted.",
    ),
  );
  const request = host.agentHost.store
    .list("requests")
    .find((r) => r.runId === run.id);
  await web2.workspace.ops.execute("run.answer", {
    id: request.id,
    decision: "allow",
  });
  assert.equal(answered, true);
  assert.equal(adapterClosed, false);
  assert.equal(store.read().tasks[0].status, "planned");
  assert.ok(fs.readFileSync(run.handoffPath, "utf8").includes("reconnect"));
});
