import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { crewRead, readCrews } from "../crew-reader.mjs";
import { crewSnapshot, listCrews } from "../crews.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const store = () =>
  new Store(path.join(temporaryDirectory("avoozl-reader-"), "w.sqlite"));
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("without a gateway client nothing is read", async () => {
  assert.equal(await readCrews(store(), null), null);
});

test("an app token is refused: no snapshot, the refusal is recorded", async () => {
  const s = store();
  const result = await readCrews(s, {
    call: async () => reply(403, { error: "owner-only", code: "owner_only" }),
  });
  assert.deepEqual(
    { ok: result.ok, status: result.status, code: result.code },
    { ok: false, status: 403, code: "owner_only" },
  );
  assert.equal(crewRead(s).code, "owner_only");
  assert.equal(crewSnapshot(s) ?? null, null);
  assert.deepEqual(
    listCrews({ snapshot: crewSnapshot(s) }).map((c) => c.id),
    ["local"],
  );
});

test("a thrown call records unreachable", async () => {
  const s = store();
  const result = await readCrews(s, {
    call: async () => {
      throw Error("down");
    },
  });
  assert.equal(result.code, "unreachable");
});

test("a granted read records crews and their headroom", async () => {
  const s = store();
  const now = new Date().toISOString();
  const calls = [];
  const result = await readCrews(s, {
    call: async (route) => {
      calls.push(route);
      if (route === "/api/instances")
        return reply(200, {
          instances: [
            { id: "box-1", name: "Box", status: { state: "connected" } },
            { id: "box-2", name: "Off", status: { state: "disconnected" } },
            { id: "local", name: "bad" },
          ],
        });
      if (route.includes("box-1"))
        return reply(200, {
          mem_free_gb: 20,
          disk_free_gb: 50,
          load_per_cpu: 0.1,
          cpu_count: 8,
          measured_at: now,
        });
      return reply(404, {});
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "/api/instances",
    "/api/instances/box-1/proxy/api/chat/headroom",
    "/api/instances/box-2/proxy/api/chat/headroom",
  ]);
  const crews = listCrews({ snapshot: crewSnapshot(s) }).filter(
    (c) => c.id !== "local",
  );
  assert.deepEqual(
    crews.map((c) => [c.id, c.available, c.why]),
    [
      ["box-1", true, null],
      ["box-2", false, "crew unreachable"],
    ],
  );
});
