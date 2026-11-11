import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAgentRouting,
  openHandsRoutingAvailability,
  selectAgentRoute,
} from "../agent-routing.mjs";
import { updateConversationSettings } from "../conversation-settings.mjs";
import { RunManager } from "../manager.mjs";
import { fixture } from "./fixtures.mjs";

const policy = {
  enabled: true,
  fallback: {
    agentProfile: "balanced-agent",
    model: "balanced-model",
  },
  rules: [
    {
      id: "low-context",
      priority: 100,
      contextRemainingAtMost: 20,
      agentProfile: "handoff-agent",
      model: "compact-model",
    },
    {
      id: "high-risk-runtime",
      priority: 50,
      categories: ["task.implement"],
      scopes: ["runtime"],
      risks: ["high"],
      agentProfile: "careful-agent",
      model: "deep-model",
    },
  ],
};

test("routing deterministically prefers the highest-priority matching rule", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: {
      mode: "implement",
      context: {},
      contextRemainingPercent: 55,
    },
    task: {
      scope: "runtime",
      tags: ["risk:high"],
    },
  });

  assert.equal(decision.source, "policy-rule");
  assert.equal(decision.ruleId, "high-risk-runtime");
  assert.equal(decision.selected.agentProfile, "careful-agent");
  assert.equal(decision.selected.model, "deep-model");
  assert.equal(decision.signals.contextTelemetry, "reported");
});

test("unknown remaining context never guesses or matches a threshold rule", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: { mode: "ask", context: {} },
  });

  assert.equal(decision.source, "policy-fallback");
  assert.equal(decision.ruleId, null);
  assert.equal(decision.signals.contextRemainingPercent, null);
  assert.equal(decision.signals.contextTelemetry, "unavailable");
  assert.equal(decision.selected.model, "balanced-model");
});

test("reported low remaining context can choose a handoff route", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: {
      mode: "ask",
      context: {},
      contextRemainingPercent: 12,
    },
  });

  assert.equal(decision.ruleId, "low-context");
  assert.equal(decision.selected.agentProfile, "handoff-agent");
  assert.equal(decision.selected.model, "compact-model");
});

test("explicit agent and model choices override routing policy", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: {
      mode: "implement",
      context: {},
      agentProfile: "operator-agent",
      model: "operator-model",
      contextRemainingPercent: 5,
    },
    task: { scope: "runtime", tags: ["risk:high"] },
  });

  assert.equal(decision.source, "explicit-override");
  assert.equal(decision.selected.agentProfile, "operator-agent");
  assert.equal(decision.selected.model, "operator-model");
});

test("routing skips rules whose agent profile is absent from OpenHands", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: {
      mode: "implement",
      context: {},
      contextRemainingPercent: 55,
    },
    task: { scope: "runtime", tags: ["risk:high"] },
    availability: openHandsRoutingAvailability({
      profiles: [{ id: "balanced-agent", name: "Balanced" }],
    }),
  });

  assert.equal(decision.source, "policy-fallback");
  assert.deepEqual(decision.rejectedRuleIds, ["high-risk-runtime"]);
  assert.equal(decision.selected.agentProfile, "balanced-agent");
  assert.equal(decision.availability.state, "profile-confirmed");
});

test("routing does not silently select an unavailable fallback profile", () => {
  const decision = selectAgentRoute({
    settings: policy,
    input: { mode: "ask", context: {} },
    availability: openHandsRoutingAvailability({
      profiles: [{ id: "other-agent", name: "Other" }],
    }),
  });

  assert.equal(decision.source, "openhands-default");
  assert.equal(decision.selected.agentProfile, null);
  assert.equal(decision.selected.model, null);
});

test("routing policy validation fails closed on ambiguous configuration", () => {
  assert.throws(
    () =>
      normalizeAgentRouting({
        enabled: true,
        rules: [{ id: "empty-route" }],
      }),
    /must choose an agent profile or model/,
  );
  assert.throws(
    () =>
      normalizeAgentRouting({
        enabled: true,
        unexpected: true,
      }),
    /Unknown conversation routing setting unexpected/,
  );
});

test("managed runs record and apply their routing decision", async (t) => {
  const { root, store } = fixture(t);
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    worktreeRoot: root + "/worktrees",
    checks: [],
  });
  updateConversationSettings(store, {
    routing: {
      enabled: true,
      fallback: {},
      rules: [
        {
          id: "catalog-task",
          categories: ["task.create"],
          scopes: ["catalog"],
          agentProfile: "routed-agent",
          model: "routed-model",
        },
      ],
    },
  });
  let started;
  const manager = new RunManager(store, {
    routingCatalog: async () => ({
      profiles: [{ id: "routed-agent", name: "Routed agent" }],
    }),
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          started = options;
          emit("session", { providerSessionId: "routed-conversation" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());

  const run = await manager.start({
    id: "run-routing-policy",
    taskId: "sample-task",
    provider: "openhands",
    projectId: "fixture",
    mode: "ask",
    prompt: "Define follow-up work.",
    context: { conversationPurpose: "new-task", scoped: false },
  });

  assert.equal(run.agentProfile, "routed-agent");
  assert.equal(run.model, "routed-model");
  assert.equal(run.routingDecision.ruleId, "catalog-task");
  assert.equal(run.routingDecision.signals.contextTelemetry, "unavailable");
  assert.equal(run.routingDecision.availability.state, "confirmed-on-start");
  assert.equal(started.agentProfile, "routed-agent");
  assert.equal(started.model, "routed-model");
});
