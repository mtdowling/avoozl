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
  assert.deepEqual(
    result.nativeSetup.templates.map((template) => template.id),
    ["github-issue-to-pr", "github-pr-reviewer", "github-repo-monitor"],
  );
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
  assert.equal(result.nativeSetup.templates.length, 3);
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
    relationship: "standalone-bypass",
    satisfiesAvoozlIntake: false,
    warning:
      "This automation launches and acts outside Avoozl's authorization and acceptance lifecycle. Do not treat it as Avoozl-controlled issue intake.",
    createsAutomation: false,
    createsDraft: false,
    requiresUserReview: true,
  });
  assert.deepEqual(
    automations.setup({
      templateId: "github-pr-reviewer",
      repository: "example/code",
      baseBranch: "trunk",
    }).prefill,
    {
      repository: "example/code",
      repositories: ["example/code"],
      ref: "trunk",
    },
  );
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

test("recommends reviewed native setup without inventing a privileged Avoozl callback", () => {
  const automations = new OpenHandsAutomations({
      fetch: () => {
        throw new Error("recommendations must not make an API request");
      },
    }),
    result = automations.recommendations({
      repositories: [
        {
          id: "example/code",
          enabled: true,
          private: true,
          projectId: "code",
          project: { baseBranch: "trunk" },
        },
        {
          id: "example/public",
          enabled: true,
          visibility: "public",
          projectId: "public",
        },
      ],
    });

  assert.equal(result.ownership.continuousGitHubOwner, "openhands-automations");
  assert.equal(result.ownership.authorizationAndExecutionOwner, "avoozl");
  assert.equal(result.ownership.reconciliationOperation, "queue.sync");
  assert.equal(result.ownership.directIngest.available, true);
  assert.match(
    result.ownership.directIngest.reason,
    /deterministic OpenHands watcher/,
  );
  assert.deepEqual(result.ownership.directIngest.safeFutureContract.permits, [
    "submit authenticated GitHub event snapshots",
  ]);
  assert.ok(
    result.ownership.directIngest.safeFutureContract.denies.includes(
      "launch conversations",
    ),
  );
  const privateRepository = result.repositories[0];
  assert.equal(privateRepository.eligible, true);
  assert.equal(privateRepository.controlPlane.state, "missing");
  assert.equal(privateRepository.controlPlane.handoff, null);
  assert.deepEqual(
    privateRepository.recommendations.map((item) => item.role),
    ["pull-request-review"],
  );
  assert.deepEqual(
    privateRepository.relatedAutomations.map((item) => item.role),
    ["issue-implementation", "pull-request-review", "comment-response"],
  );
  assert.deepEqual(privateRepository.recommendations[0].handoff.prefill, {
    repository: "example/code",
    repositories: ["example/code"],
    ref: "trunk",
  });
  assert.ok(
    privateRepository.relatedAutomations.every(
      (item) =>
        item.satisfiesAvoozlIntake === false &&
        item.handoff.action === "navigate" &&
        item.handoff.requiresUserReview === true &&
        item.handoff.createsAutomation === false &&
        item.handoff.createsDraft === false,
    ),
  );
  assert.equal(result.repositories[1].eligible, true);
  assert.equal(result.repositories[1].controlPlane.state, "missing");
  assert.equal(result.repositories[1].controlPlane.available, true);
  assert.match(result.repositories[1].controlPlane.reason, /observation-only/);
  assert.deepEqual(result.repositories[1].recommendations, []);
  assert.deepEqual(result.repositories[1].relatedAutomations, []);
  assert.match(result.repositories[1].reason, /eligible for observation-only/);
});

test("reports active, draft, and missing native automation coverage read-only", async () => {
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
        if (url.endsWith("/capabilities"))
          return response({ features: ["automationDrafts"] });
        if (url.includes("/drafts?"))
          return response({
            drafts: [
              {
                id: "draft-reviewer",
                source_automation_id: "github-pr-reviewer",
                draft: { repos: ["example/code"] },
              },
            ],
            total: 1,
          });
        if (url.includes("/api/automation/v1?"))
          return response({
            automations: [
              {
                id: "automation-issue",
                name: "Implement issues",
                state: "ACTIVE",
                preset_metadata: {
                  template: {
                    id: "github-issue-to-pr",
                    config: { repos: ["example/code"] },
                  },
                },
              },
            ],
            total: 1,
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    result = await automations.coverage({
      repositories: [
        {
          id: "example/code",
          enabled: true,
          private: true,
          projectId: "code",
          project: { baseBranch: "main" },
        },
      ],
    });

  assert.equal(result.available, true);
  assert.equal(result.state, "missing-control-plane-intake");
  assert.equal(result.repositories[0].controlPlane.state, "missing");
  assert.deepEqual(
    result.repositories[0].coverage.map(({ role, state }) => [role, state]),
    [
      ["issue-implementation", "active"],
      ["pull-request-review", "draft"],
      ["comment-response", "recommended"],
    ],
  );
  assert.equal(result.installed[0].id, "automation-issue");
  assert.equal(result.drafts[0].id, "draft-reviewer");
  assert.ok(
    calls.every(
      ([, options]) =>
        options.method === undefined &&
        options.headers["X-Session-API-Key"] === "session-secret",
    ),
  );
});

test("preflights the deterministic intake artifact for inactive installation", async (t) => {
  const { root } = fixture(t),
    calls = [],
    automations = new OpenHandsAutomations({
      artifactHome: root,
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities"))
          return response({ features: ["automationDrafts"] });
        if (url.includes("/plugin-spec/preflight?"))
          return response({
            manifest: {
              name: "avoozl",
              entrypoint: { runner: "script" },
            },
            resolved_ref: "abc123",
          });
        if (url.endsWith("/api/settings/secrets"))
          return response({
            secrets: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN" }],
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    result = await automations.intakePreflight({
      repositories: [
        {
          id: "example/code",
          enabled: true,
          private: true,
          projectId: "code",
        },
      ],
      intake: {
        callbackPath: "/api/github-intake",
        callbackUrl: "http://127.0.0.1:9428/api/github-intake",
        canMint: true,
        issueAuthorization: false,
      },
    });

  assert.equal(result.id, "avoozl-github-intake");
  assert.equal(result.version, "1.3.2");
  assert.equal(result.readyToPrepare, true);
  assert.equal(result.readyToPrepareDraft, false);
  assert.equal(result.createsAutomation, true);
  assert.equal(result.createsDraft, false);
  assert.equal(result.enablesAutomation, false);
  assert.equal(result.prerequisites.artifact.status, "ready");
  assert.equal(result.prerequisites.artifact.deterministic, true);
  assert.equal(result.prerequisites.artifact.launchesAgents, false);
  assert.equal(result.prerequisites.artifact.mutatesGitHub, false);
  assert.equal(result.prerequisites.pluginSpec.status, "ready");
  assert.equal(result.prerequisites.pluginSpec.resolvedRef, "abc123");
  assert.equal(result.prerequisites.lifecycle.mode, "installed-inactive");
  assert.match(
    result.prerequisites.lifecycle.reason,
    /installs the idempotent watcher as INACTIVE/,
  );
  assert.equal(result.prerequisites.callback.status, "ready");
  assert.equal(result.prerequisites.credential.minted, false);
  assert.equal(result.prerequisites.credential.status, "available");
  assert.equal(result.prerequisites.githubCredential.status, "configured");
  assert.ok(
    calls.every(
      ([, options]) =>
        (!options.method || options.method === "GET") &&
        options.headers["X-Session-API-Key"] === "session-secret",
    ),
  );
});

test("prepares an idempotent inactive watcher and saves only its scoped token", async (t) => {
  const { root } = fixture(t),
    calls = [],
    automations = new OpenHandsAutomations({
      artifactHome: root,
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities")) return response({ features: [] });
        if (url.includes("/api/automation/v1?"))
          return response({ automations: [], total: 0 });
        if (
          url.endsWith("/api/settings/secrets") &&
          (!options.method || options.method === "GET")
        )
          return response({
            secrets: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN" }],
          });
        if (url.endsWith("/api/settings/secrets") && options.method === "PUT")
          return response({ name: "AVOOZL_GITHUB_INTAKE_TEST" });
        if (
          url.endsWith("/api/automation/v1/plugin-spec") &&
          options.method === "POST"
        )
          return response(
            {
              id: "intake-1",
              name: "Avoozl GitHub intake · example/code",
              state: "INACTIVE",
              enabled: false,
            },
            201,
          );
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    result = await automations.prepareIntake({
      repository: "example/code",
      workspaceId: "workspace-1",
      callbackUrl: "http://127.0.0.1:9428/api/github-intake",
      capability: {
        id: "cap-1",
        repository: "example/code",
        state: "active",
        suggestedSecretName: "AVOOZL_GITHUB_INTAKE_TEST",
      },
      capabilityToken: "avoozl_intake_returned_once",
      assignee: "worker",
    });

  assert.equal(result.repository, "example/code");
  assert.equal(result.created, true);
  assert.equal(result.automation.enabled, false);
  assert.equal(result.detailPath, "/automations/intake-1");
  const secretRequest = calls.find(
      ([url, options]) =>
        url.endsWith("/api/settings/secrets") && options.method === "PUT",
    ),
    installRequest = calls.find(
      ([url, options]) =>
        url.endsWith("/api/automation/v1/plugin-spec") &&
        options.method === "POST",
    );
  assert.deepEqual(JSON.parse(secretRequest[1].body), {
    name: "AVOOZL_GITHUB_INTAKE_TEST",
    value: "avoozl_intake_returned_once",
    description: "Avoozl ingest-only capability for example/code",
  });
  const installed = JSON.parse(installRequest[1].body);
  assert.equal(installed.enabled, false);
  assert.equal(installed.state, "INACTIVE");
  assert.equal(installed.trigger.type, "cron");
  assert.match(installed.template.id, /^avoozl-github-intake-/);
  assert.equal(installed.config.repositories[0], "example/code");
  assert.equal(installed.config.mode, "authorization");
  assert.equal(installed.config.repository_private, true);
  assert.equal(installed.plugin.repo_path, "avoozl");
  assert.ok(installed.plugin.source.startsWith(root));
  assert.doesNotMatch(JSON.stringify(result), /returned_once/);
});

test("prepares public repositories with an observation-only watcher", async (t) => {
  const { root } = fixture(t),
    calls = [],
    automations = new OpenHandsAutomations({
      artifactHome: root,
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities")) return response({ features: [] });
        if (url.includes("/api/automation/v1?"))
          return response({ automations: [], total: 0 });
        if (
          url.endsWith("/api/settings/secrets") &&
          (!options.method || options.method === "GET")
        )
          return response({
            secrets: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN" }],
          });
        if (url.endsWith("/api/settings/secrets") && options.method === "PUT")
          return response({ name: "AVOOZL_GITHUB_INTAKE_PUBLIC" });
        if (
          url.endsWith("/api/automation/v1/plugin-spec") &&
          options.method === "POST"
        )
          return response({
            id: "intake-public",
            state: "INACTIVE",
            enabled: false,
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    });
  await automations.prepareIntake({
    repository: "example/public",
    workspaceId: "workspace-1",
    callbackUrl: "http://127.0.0.1:9428/api/github-intake",
    capability: {
      id: "cap-public",
      repository: "example/public",
      repositoryPrivate: false,
      mode: "observation-only",
      state: "active",
      suggestedSecretName: "AVOOZL_GITHUB_INTAKE_PUBLIC",
    },
    capabilityToken: "avoozl_intake_public_once",
    assignee: "must-not-be-used",
    readyLabel: "must-not-be-used",
  });
  const install = calls.find(
      ([url, options]) =>
        url.endsWith("/api/automation/v1/plugin-spec") &&
        options.method === "POST",
    ),
    config = JSON.parse(install[1].body).config;
  assert.equal(config.mode, "observation-only");
  assert.equal(config.repository_private, false);
  assert.equal("assignee" in config, false);
  assert.equal("ready_label" in config, false);
});

test("fails closed when OpenHands activates a watcher prepared as inactive", async (t) => {
  const { root } = fixture(t),
    calls = [],
    automations = new OpenHandsAutomations({
      artifactHome: root,
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities")) return response({ features: [] });
        if (url.includes("/api/automation/v1?"))
          return response({ automations: [], total: 0 });
        if (
          url.endsWith("/api/settings/secrets") &&
          (!options.method || options.method === "GET")
        )
          return response({
            secrets: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN" }],
          });
        if (url.endsWith("/api/settings/secrets") && options.method === "PUT")
          return response({ name: "AVOOZL_GITHUB_INTAKE_TEST" });
        if (
          url.endsWith("/api/automation/v1/plugin-spec") &&
          options.method === "POST"
        )
          return response(
            {
              id: "intake-1",
              name: "Avoozl GitHub intake · example/code",
              state: "ACTIVE",
              enabled: true,
            },
            201,
          );
        if (
          url.endsWith("/api/automation/v1/intake-1") &&
          options.method === "PATCH"
        )
          return response({
            id: "intake-1",
            state: "INACTIVE",
            enabled: false,
          });
        if (
          url.endsWith("/api/settings/secrets/AVOOZL_GITHUB_INTAKE_TEST") &&
          options.method === "DELETE"
        )
          return response({});
        throw new Error(`Unexpected request: ${url}`);
      },
    });

  await assert.rejects(
    automations.prepareIntake({
      repository: "example/code",
      workspaceId: "workspace-1",
      callbackUrl: "http://127.0.0.1:9428/api/github-intake",
      capability: {
        id: "cap-1",
        repository: "example/code",
        state: "active",
        suggestedSecretName: "AVOOZL_GITHUB_INTAKE_TEST",
      },
      capabilityToken: "avoozl_intake_returned_once",
      assignee: "worker",
    }),
    /unexpectedly enabled/,
  );
  assert.ok(
    calls.some(
      ([url, options]) =>
        url.endsWith("/api/automation/v1/intake-1") &&
        options.method === "PATCH" &&
        JSON.parse(options.body).state === "INACTIVE",
    ),
  );
  assert.ok(
    calls.some(
      ([url, options]) =>
        url.endsWith("/api/settings/secrets/AVOOZL_GITHUB_INTAKE_TEST") &&
        options.method === "DELETE",
    ),
  );
});

test("activation revalidates the watcher's private enabled repository before PATCH", async (t) => {
  const scenarios = [
    {
      name: "disabled",
      repository: { enabled: false, private: true, visibility: "private" },
      message: /Enable this private monitored repository/,
      githubPrivate: true,
      expectedGitHubReads: 0,
    },
    {
      name: "made public",
      repository: { enabled: true, private: true, visibility: "private" },
      message: /must remain private/,
      githubPrivate: false,
      expectedGitHubReads: 1,
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const { store } = fixture(t),
        calls = [],
        githubReads = [],
        github = {
          available: () => true,
          async repository(repository) {
            githubReads.push(repository.id);
            return {
              node_id: "repo-node",
              full_name: repository.id,
              private: scenario.githubPrivate,
            };
          },
        },
        openhandsAutomations = new OpenHandsAutomations({
          settings: () => ({
            host: "http://127.0.0.1:38100",
            automationHost: "http://127.0.0.1:38400",
            apiKey: "session-secret",
          }),
          fetch: async (url, options) => {
            calls.push([url, options]);
            if (url.endsWith("/health")) return response({ status: "ok" });
            if (url.endsWith("/capabilities"))
              return response({ features: [] });
            if (
              url.endsWith("/api/automation/v1/intake-1") &&
              (!options.method || options.method === "GET")
            )
              return response({
                id: "intake-1",
                name: "Avoozl GitHub intake · example/code",
                state: "INACTIVE",
                enabled: false,
                plugin_spec: {
                  plugin: { repo_path: "avoozl" },
                  config: {
                    repositories: ["example/code"],
                    mode: "observation-only",
                  },
                },
              });
            if (
              url.endsWith("/api/automation/v1/intake-1") &&
              options.method === "PATCH"
            )
              return response({
                id: "intake-1",
                state: "ACTIVE",
                enabled: true,
              });
            throw new Error(`Unexpected request: ${url}`);
          },
        }),
        ops = new Operations(store, { github, openhandsAutomations });
      store.put("github_queue_repositories", {
        id: "example/code",
        owner: "example",
        repo: "code",
        nodeId: "repo-node",
        projectId: "code",
        ...scenario.repository,
      });

      await assert.rejects(
        ops.execute("openhands.automations.intake.state", {
          id: "intake-1",
          enabled: true,
        }),
        scenario.message,
      );
      assert.equal(githubReads.length, scenario.expectedGitHubReads);
      assert.equal(
        calls.some(([, options]) => options.method === "PATCH"),
        false,
      );
    });
  }
});

test("activation permits a public observation-only watcher", async (t) => {
  const { store } = fixture(t),
    calls = [],
    github = {
      available: () => true,
      async repository(repository) {
        return {
          node_id: "public-node",
          full_name: repository.id,
          private: false,
        };
      },
    },
    openhandsAutomations = new OpenHandsAutomations({
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities")) return response({ features: [] });
        if (
          url.endsWith("/api/automation/v1/intake-public") &&
          (!options.method || options.method === "GET")
        )
          return response({
            id: "intake-public",
            state: "INACTIVE",
            enabled: false,
            plugin_spec: {
              plugin: { repo_path: "avoozl" },
              config: {
                repositories: ["example/public"],
                mode: "observation-only",
              },
            },
          });
        if (
          url.endsWith("/api/automation/v1/intake-public") &&
          options.method === "PATCH"
        )
          return response({
            id: "intake-public",
            state: "ACTIVE",
            enabled: true,
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    ops = new Operations(store, { github, openhandsAutomations });
  store.put("github_queue_repositories", {
    id: "example/public",
    owner: "example",
    repo: "public",
    nodeId: "public-node",
    projectId: "code",
    enabled: true,
    private: false,
    visibility: "public",
  });
  const result = await ops.execute("openhands.automations.intake.state", {
    id: "intake-public",
    enabled: true,
  });
  assert.equal(result.enabled, true);
  assert.equal(
    calls.some(
      ([url, options]) =>
        url.endsWith("/api/automation/v1/intake-public") &&
        options.method === "PATCH",
    ),
    true,
  );
});

test("repairs an installed watcher by rotating its saved secret and disabling it for review", async (t) => {
  const { root } = fixture(t),
    calls = [],
    existing = {
      id: "intake-1",
      name: "Avoozl GitHub intake · example/code",
      state: "ACTIVE",
      enabled: true,
      template: {
        id: "avoozl-github-intake-workspace-1-example-code",
        config: { repository: "example/code" },
      },
      plugin_spec: {
        config: { repositories: ["example/code"] },
      },
    },
    automations = new OpenHandsAutomations({
      artifactHome: root,
      settings: () => ({
        host: "http://127.0.0.1:38100",
        automationHost: "http://127.0.0.1:38400",
        apiKey: "session-secret",
      }),
      fetch: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/health")) return response({ status: "ok" });
        if (url.endsWith("/capabilities")) return response({ features: [] });
        if (url.includes("/api/automation/v1?"))
          return response({ automations: [existing], total: 1 });
        if (
          url.endsWith("/api/settings/secrets") &&
          (!options.method || options.method === "GET")
        )
          return response({
            secrets: [
              { name: "GITHUB_PERSONAL_ACCESS_TOKEN" },
              { name: "AVOOZL_GITHUB_INTAKE_TEST" },
            ],
          });
        if (url.endsWith("/api/settings/secrets") && options.method === "PUT")
          return response({ name: "AVOOZL_GITHUB_INTAKE_TEST" });
        if (
          url.endsWith("/api/automation/v1/intake-1") &&
          options.method === "PATCH"
        )
          return response({
            ...existing,
            state: "INACTIVE",
            enabled: false,
          });
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    result = await automations.prepareIntake({
      repository: "example/code",
      workspaceId: "workspace-1",
      callbackUrl: "http://127.0.0.1:9428/api/github-intake",
      capability: {
        id: "cap-2",
        repository: "example/code",
        state: "active",
        suggestedSecretName: "AVOOZL_GITHUB_INTAKE_TEST",
      },
      capabilityToken: "avoozl_intake_rotated_once",
      assignee: "worker",
      repair: true,
    });

  assert.equal(result.created, false);
  assert.equal(result.repaired, true);
  assert.equal(result.automation.enabled, false);
  const repairRequest = calls.find(
    ([url, options]) =>
      url.endsWith("/api/automation/v1/intake-1") && options.method === "PATCH",
  );
  assert.equal(JSON.parse(repairRequest[1].body).state, "INACTIVE");
  assert.equal(
    JSON.parse(repairRequest[1].body).config.ingest_secret_name,
    "AVOOZL_GITHUB_INTAKE_TEST",
  );
  assert.doesNotMatch(JSON.stringify(result), /rotated_once/);
});

test("repository connection provisioning prepares and enables the intake watcher", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    calls = [];
  ops.execute = async (name, input) => {
    calls.push([name, input]);
    if (name === "openhands.automations.intake.prepare")
      return {
        created: true,
        automation: { id: "intake-1", enabled: false },
      };
    if (name === "openhands.automations.intake.state")
      return { id: "intake-1", enabled: true };
    throw new Error(`Unexpected operation: ${name}`);
  };

  const result = await ops.provisionGitHubIntake("example/code");

  assert.equal(result.state, "active");
  assert.deepEqual(calls, [
    ["openhands.automations.intake.prepare", { repository: "example/code" }],
    ["openhands.automations.intake.state", { id: "intake-1", enabled: true }],
  ]);
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
      recommendations(input) {
        calls.push(["recommendations", input]);
        return { repositories: input.repositories };
      },
      async coverage(input) {
        calls.push(["coverage", input]);
        return { available: true, repositories: input.repositories };
      },
      async intakePreflight(input) {
        calls.push(["intakePreflight", input]);
        return { readyToPrepareDraft: false };
      },
    },
    ops = new Operations(store, { openhandsAutomations });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    worktreeRoot: "/tmp/worktrees",
    baseBranch: "trunk",
    checks: [],
  });
  store.put("github_queue_repositories", {
    id: "example/code",
    owner: "example",
    repo: "code",
    private: true,
    visibility: "private",
    enabled: true,
    includeIssues: true,
    includePullRequests: true,
    projectId: "code",
  });

  assert.deepEqual(await ops.execute("openhands.automations.capabilities"), {
    available: true,
  });
  assert.deepEqual(await ops.execute("openhands.automations.recommendations"), {
    repositories: [
      {
        id: "example/code",
        owner: "example",
        repo: "code",
        private: true,
        visibility: "private",
        enabled: true,
        includeIssues: true,
        includePullRequests: true,
        projectId: "code",
        project: {
          id: "code",
          root: "/tmp/code",
          worktreeRoot: "/tmp/worktrees",
          baseBranch: "trunk",
          checks: [],
        },
      },
    ],
  });
  assert.equal(
    (await ops.execute("openhands.automations.coverage")).available,
    true,
  );
  assert.equal(
    (await ops.execute("openhands.automations.intake.preflight"))
      .readyToPrepareDraft,
    false,
  );
  assert.deepEqual(
    await ops.execute("openhands.automations.setup", {
      templateId: "github-issue-to-pr",
      repository: "example/code",
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
  assert.ok(
    description.operations.includes("openhands.automations.recommendations"),
  );
  assert.ok(description.operations.includes("openhands.automations.coverage"));
  assert.ok(
    description.operations.includes("openhands.automations.intake.preflight"),
  );
  assert.ok(
    description.operations.includes("openhands.automations.intake.prepare"),
  );
  assert.ok(
    description.operations.includes("openhands.automations.intake.state"),
  );
  assert.ok(description.operations.includes("openhands.automations.setup"));
  assert.deepEqual(
    calls.map(([name]) => name),
    ["capabilities", "recommendations", "coverage", "intakePreflight", "setup"],
  );
  assert.deepEqual(calls.at(-1), [
    "setup",
    {
      templateId: "github-issue-to-pr",
      repository: "example/code",
      baseBranch: "trunk",
    },
  ]);
});
