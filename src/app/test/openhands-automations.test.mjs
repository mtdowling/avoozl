import test from "node:test";
import assert from "node:assert/strict";
import { Operations } from "../operations.mjs";
import { OpenHandsAutomations } from "../openhands-automations.mjs";
import { fixture } from "./fixtures.mjs";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("reports live native OpenHands automation capabilities without exposing credentials", async () => {
  const calls = [],
    automations = new OpenHandsAutomations({
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        return response({
          features: ["agentProfiles", "automationDrafts"],
        });
      },
    });

  const result = await automations.capabilities();

  assert.equal(result.available, true);
  assert.equal(result.endpoint, "http://127.0.0.1:38400");
  assert.equal(result.nativeSetup.templates[0].id, "github-issue-to-pr");
  assert.equal(
    result.nativeSetup.templates[0].path,
    "/automations/new/github-issue-to-pr",
  );
  assert.equal(result.installation.directInstall, false);
  assert.equal(JSON.stringify(result).includes("session-secret"), false);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      ([, options]) =>
        options.headers["X-Session-API-Key"] === "session-secret" &&
        options.method === undefined,
    ),
  );
});

test("discovers a loopback automation service advertised by Agent Canvas", async () => {
  const calls = [],
    automations = new OpenHandsAutomations({
      settings: () => ({
        host: "http://127.0.0.1:38100",
        apiKey: "secret",
      }),
      fetch: async (url) => {
        calls.push(url);
        if (url === "http://127.0.0.1:38100/api/automation/health")
          return response({ detail: "Not found" }, 404);
        if (url === "http://127.0.0.1:38100/server_info")
          return response({
            runtime_services: JSON.stringify({
              services: {
                automation: {
                  url_from_agent: "http://localhost:18001",
                },
              },
            }),
          });
        if (url.endsWith("/health")) return response({ status: "ok" });
        return response({ features: [] });
      },
    });

  const result = await automations.capabilities();

  assert.equal(result.available, true);
  assert.equal(result.endpoint, "http://localhost:18001");
  assert.deepEqual(calls, [
    "http://127.0.0.1:38100/api/automation/health",
    "http://127.0.0.1:38100/server_info",
    "http://localhost:18001/api/automation/health",
    "http://localhost:18001/api/automation/v1/capabilities",
  ]);
});

test("fails closed when no local automation service is advertised", async () => {
  const automations = new OpenHandsAutomations({
    settings: () => ({
      host: "http://127.0.0.1:38100",
      apiKey: "secret",
    }),
    fetch: async (url) =>
      url.endsWith("/server_info")
        ? response({ version: "1.61.0" })
        : response({}, 404),
  });

  const result = await automations.capabilities();

  assert.equal(result.available, false);
  assert.match(result.reason, /does not advertise an Automation service/);
  assert.equal(result.nativeSetup.templates.length, 1);
});

test("setup returns only a reviewed native navigation handoff", () => {
  const automations = new OpenHandsAutomations({
    fetch: () => {
      throw new Error("setup must not make an API request");
    },
  });

  assert.deepEqual(automations.setup({ templateId: "github-issue-to-pr" }), {
    action: "navigate",
    surface: "openhands",
    path: "/automations/new/github-issue-to-pr",
    template: {
      id: "github-issue-to-pr",
      name: "GitHub issue to PR",
      description:
        "Implement ready GitHub issues, address pull request feedback, and publish tested changes for review.",
      version: "1.2.3",
      estimatedSetupMinutes: 4,
      path: "/automations/new/github-issue-to-pr",
      requiresUserInput: true,
    },
    createsAutomation: false,
    requiresUserReview: true,
  });
  assert.throws(
    () =>
      automations.setup({
        templateId: "github-issue-to-pr",
        prompt: "Run arbitrary instructions",
      }),
    /Arbitrary prompts/,
  );
  assert.throws(
    () => automations.setup({ templateId: "unknown" }),
    /supported pinned/,
  );
});

test("operations and client contract expose the explicit automation actions", async (t) => {
  const { store } = fixture(t);
  const calls = [],
    openhandsAutomations = {
      async capabilities() {
        calls.push(["capabilities"]);
        return { available: true };
      },
      setup(input) {
        calls.push(["setup", input]);
        return {
          action: "navigate",
          path: "/automations/new/" + input.templateId,
        };
      },
    },
    ops = new Operations(store, { openhandsAutomations });

  assert.deepEqual(await ops.execute("openhands.automations.capabilities"), {
    available: true,
  });
  assert.deepEqual(
    await ops.execute("openhands.automations.setup", {
      templateId: "github-issue-to-pr",
    }),
    {
      action: "navigate",
      path: "/automations/new/github-issue-to-pr",
    },
  );
  const description = await ops.execute("client.describe");
  assert.ok(
    description.operations.includes("openhands.automations.capabilities"),
  );
  assert.ok(description.operations.includes("openhands.automations.setup"));
  assert.deepEqual(calls, [
    ["capabilities"],
    ["setup", { templateId: "github-issue-to-pr" }],
  ]);
});
