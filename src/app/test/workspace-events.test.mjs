import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { startServer } from "../server.mjs";
import { fixture } from "./fixtures.mjs";

function collectStream(response) {
  let text = "",
    failure;
  const waiters = new Set(),
    settle = () => {
      for (const waiter of waiters) {
        if (!failure && !waiter.predicate(text)) continue;
        waiters.delete(waiter);
        if (failure) waiter.reject(failure);
        else waiter.resolve(text);
      }
    };
  response.setEncoding("utf8");
  response.on("data", (chunk) => {
    text += chunk;
    settle();
  });
  response.on("end", () => {
    failure = Error("Event stream ended before the expected update.");
    settle();
  });
  response.on("error", (error) => {
    failure = error;
    settle();
  });
  return {
    until(predicate) {
      if (failure) return Promise.reject(failure);
      if (predicate(text)) return Promise.resolve(text);
      return new Promise((resolve, reject) => {
        waiters.add({ predicate, resolve, reject });
      });
    },
  };
}

test("workspace event streams announce task-only revisions", async (t) => {
  const { root, store } = fixture(t),
    server = startServer({
      dbPath: store.filename,
      port: 0,
      projectionRoot: path.join(root, "docs"),
    });
  await once(server, "listening");
  const request = http.get({
      hostname: "127.0.0.1",
      port: server.address().port,
      path: "/api/events?compact=true",
      headers: { Accept: "text/event-stream" },
    }),
    [response] = await once(request, "response");
  t.after(
    () =>
      new Promise((resolve) => {
        request.destroy();
        response.destroy();
        server.close(resolve);
      }),
  );
  assert.equal(response.statusCode, 200);
  const events = collectStream(response);
  await events.until((text) => text.includes(": connected"));

  store.mutate("External task update", (data) => {
    data.tasks[0].notes = "Created outside the Canvas view.";
  });
  const message = await events.until((text) =>
    text.includes('"kind":"workspace.revision"'),
  );
  assert.match(message, /"revision":2/);
});
