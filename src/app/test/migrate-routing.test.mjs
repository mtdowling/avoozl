// The one-time routing migration (scripts/migrate-routing.mjs): old rules,
// presets and router settings become prompt lines; running it twice
// changes nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { migrate } from "../../../scripts/migrate-routing.mjs";
import { validateRouting, validateTrackedRouting } from "../placement.mjs";
import { providersInput } from "../provider-health.mjs";

const OLD = {
  version: 1,
  crews: { local: { chatLimit: 2 } },
  routing: {
    rules: [
      { id: "compliance", when: { labels: ["compliance"] }, keepLocal: true },
      {
        id: "win",
        when: { kinds: ["test"] },
        on: "any",
        requireTags: ["os:windows"],
        session: { model: "model-a" },
      },
    ],
    pick: { preset: "spread-out" },
    router: { enabled: true, model: "model-r", instructions: "Prefer box." },
  },
  providers: { lowPercent: 70, fallback: ["model-b"], groups: {} },
};

test("a machine file's old routing becomes one prompt it can load", () => {
  const { value, changed, dropped } = migrate(OLD, { tracked: false });
  assert.equal(changed, true);
  assert.equal(value.routing.enabled, true);
  assert.equal(value.routing.model, "model-r");
  const lines = value.routing.prompt.split("\n");
  assert.equal(lines[0], "Prefer box.");
  assert.ok(lines.some((l) => /labels compliance: keep it on local/.test(l)));
  assert.ok(
    lines.some((l) => /only on a crew tagged os:windows; use model-a/.test(l)),
  );
  assert.ok(lines.some((l) => /Spread tasks across crews/.test(l)));
  assert.ok(dropped.includes("providers.fallback"));
  assert.ok(dropped.includes("providers.groups"));
  assert.deepEqual(value.providers, { lowPercent: 70 });
  assert.deepEqual(value.crews, OLD.crews);
  validateRouting(value.routing, { tracked: false });
  providersInput(value.providers);
  assert.equal(migrate(value, { tracked: false }).changed, false, "idempotent");
});

test("a tracked file loses its old keys and prints the lines instead", () => {
  const tracked = {
    version: 1,
    routing: OLD.routing,
    projects: { app: { routing: { rules: [{ id: "r", on: "local" }] } } },
  };
  const { value, lines } = migrate(tracked, { tracked: true });
  assert.equal(value.routing, undefined);
  assert.equal(value.projects.app.routing, undefined);
  assert.ok(lines.some((l) => l.startsWith("- In repository app: ")));
  validateTrackedRouting(value);
});
