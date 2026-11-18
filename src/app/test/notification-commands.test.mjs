// Command and webhook sinks (without-kirocrew nk-6.2, NK7.2 to NK7.5): set
// only in the machine file, run without a shell, https or loopback only, and
// a small payload with a link that is not a Kiro Crew path.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { machineSinks } from "../headless-tick.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import {
  noticeLink,
  sinkPayload,
  sinkPushers,
  validateNotifications,
} from "../notification-sinks.mjs";
import { deliverNotifications, queueNotifications } from "../notifications.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { Store } from "../store.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const machine = (root, value) => {
  const config = path.join(root, "config");
  fs.mkdirSync(path.join(config, "avoozl"), { recursive: true });
  fs.writeFileSync(
    path.join(config, "avoozl", "config.json"),
    JSON.stringify({ version: 1, ...value }),
  );
  return { XDG_CONFIG_HOME: config };
};

test("notifications.sinks in .avoozl.json is refused, naming the machine file", () => {
  const root = temporaryDirectory("avoozl-sinks-repo-"),
    env = machine(root, {});
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      notifications: { sinks: [{ kind: "command", argv: ["true"] }] },
    }),
  );
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot: root, env, home: root }),
    (error) =>
      /notifications is set in .*\.avoozl\.json/.test(error.message) &&
      error.message.includes(path.join(env.XDG_CONFIG_HOME, "avoozl")),
  );
});

test("a webhook to plain http on another host is refused when the configuration loads", () => {
  const root = temporaryDirectory("avoozl-sinks-load-");
  const secret = "http://hooks.example.test/topic-s3cr3t";
  const env = machine(root, {
    notifications: { sinks: [{ kind: "webhook", url: secret }] },
  });
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot: root, env, home: root }),
    (error) =>
      /must be https/.test(error.message) && !error.message.includes("s3cr3t"),
  );
  for (const url of [
    "https://hooks.example.test/x",
    "http://127.0.0.1:8080/x",
    "http://localhost/x",
  ])
    assert.equal(
      validateNotifications({ sinks: [{ kind: "webhook", url }] }).sinks[0].url,
      new URL(url).href,
    );
  assert.throws(
    () =>
      validateNotifications({
        sinks: [{ kind: "command", argv: "notify-send hi" }],
      }),
    /shell string/,
  );
});

test("a title with shell characters reaches the command as one argument", async (t) => {
  const { store } = fixture(t),
    root = temporaryDirectory("avoozl-sinks-cmd-"),
    out = path.join(root, "args.json"),
    script = path.join(root, "record.mjs");
  fs.writeFileSync(
    script,
    `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`,
  );
  const title = 'Decide $(touch pwned) "a" && echo `x`; rm -rf ~';
  queueNotifications(store, [
    { channel: "decision", task: "a", title, text: "Synthetic." },
  ]);
  const { sinks } = validateNotifications({
    sinks: [{ kind: "command", argv: [process.execPath, script] }],
  });
  const result = await deliverNotifications(store, sinkPushers(sinks));
  assert.equal(result.sinks[0].sent, 1, JSON.stringify(result));
  const [args] = fs
    .readFileSync(out, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(args.length, 2);
  assert.equal(args[0], title);
  assert.equal(fs.existsSync(path.join(root, "pwned")), false);
  assert.equal(fs.existsSync("pwned"), false);
  assert.deepEqual(Object.keys(JSON.parse(args[1])).sort(), [
    "at",
    "channel",
    "id",
    "link",
    "title",
  ]);
});

test("the payload holds only channel, title, ID, time and link, and no Kiro Crew path", async (t) => {
  const { store } = fixture(t);
  queueNotifications(store, [
    {
      channel: "failure",
      task: "b",
      slot: "dashboard:chat-1",
      title: "Task b failed",
      text: "The file /home/someone/secret.txt and the brief text.",
      resume: "Open the chat.",
    },
  ]);
  const seen = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      seen.push(JSON.parse(body));
      response.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { sinks } = validateNotifications({
    sinks: [
      {
        kind: "webhook",
        url: `http://127.0.0.1:${server.address().port}/hook`,
      },
    ],
  });
  await deliverNotifications(store, sinkPushers(sinks));
  assert.equal(seen.length, 1);
  const [payload] = seen;
  assert.deepEqual(Object.keys(payload).sort(), [
    "at",
    "channel",
    "id",
    "link",
    "title",
  ]);
  assert.equal(payload.channel, "failure");
  assert.equal(payload.id, "b");
  assert.equal(payload.title, "Task b failed");
  assert.doesNotMatch(JSON.stringify(payload), /secret|brief|\/chat|chat-1/);
  // The page's address with the page on; the show command with it off.
  assert.equal(payload.link, "avoozl show b");
  assert.equal(
    noticeLink("b", "http://127.0.0.1:9428/"),
    "http://127.0.0.1:9428/?task=b",
  );
});

test("a webhook that fails names the sink, never its URL", async (t) => {
  const { store } = fixture(t);
  queueNotifications(store, [
    { channel: "decision", task: "a", title: "Decide a", text: "x" },
  ]);
  const { sinks } = validateNotifications({
    sinks: [
      {
        id: "phone",
        kind: "webhook",
        url: "https://hooks.example.test/s3cr3t",
      },
    ],
  });
  const result = await deliverNotifications(
    store,
    sinkPushers(sinks, {
      request: async () => {
        throw Error("connect ECONNREFUSED https://hooks.example.test/s3cr3t");
      },
    }),
  );
  assert.equal(
    result.sinks[0].error,
    "webhook sink phone could not be reached",
  );
  assert.doesNotMatch(
    JSON.stringify(store.getMeta("notifications.sink.phone")),
    /s3cr3t/,
  );
});

test("a title that matches a content rule is held back", (t) => {
  const root = temporaryDirectory("avoozl-sinks-rules-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets: [{ id: "private" }] } }),
  );
  fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "content-rules", "private.txt"),
    "codename: Bluebird\n",
  );
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  const row = { task: "a", queuedAt: "2026-11-18T00:00:00.000Z" };
  const held = sinkPayload(
    { channel: "decision", title: "Decide the Bluebird launch" },
    row,
    { store },
  );
  assert.doesNotMatch(held.title, /Bluebird/);
  assert.match(held.title, /held by a content rule/);
  assert.equal(held.id, "a");
  const plain = sinkPayload({ channel: "decision", title: "Decide a" }, row, {
    store,
  });
  assert.equal(plain.title, "Decide a");
});

test("the headless tick reads its sinks from the machine file", () => {
  const root = temporaryDirectory("avoozl-sinks-machine-"),
    file = path.join(root, "config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      notifications: {
        sinks: [
          { id: "log", kind: "command", argv: ["true"] },
          { kind: "webhook", url: "https://hooks.example.test/x" },
        ],
      },
    }),
  );
  assert.deepEqual(
    machineSinks(file).map((sink) => sink.id),
    ["log", "webhook-2"],
  );
  assert.deepEqual(machineSinks(path.join(root, "none.json")), []);
});
