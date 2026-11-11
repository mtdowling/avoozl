import assert from "node:assert/strict";
import test from "node:test";
import {
  openHandsConversationPath,
  resolveSessionRun,
} from "./web/session-navigation.ts";

test("existing OpenHands runs navigate directly to their native Canvas conversation", async () => {
  let loads = 0;
  const run = await resolveSessionRun({
    id: "run-existing",
    initial: {
      id: "run-existing",
      provider: "openhands",
      providerSessionId: "conversation/with spaces",
      state: "running",
    },
    load: async () => {
      loads++;
      throw new Error("should not load");
    },
    delay: async () => {},
  });
  assert.equal(loads, 0);
  assert.equal(
    openHandsConversationPath(run),
    "/conversations/conversation%2Fwith%20spaces",
  );
});

test("new OpenHands runs wait for the provider conversation instead of opening a missing session", async () => {
  let loads = 0;
  const run = await resolveSessionRun({
    id: "run-starting",
    initial: {
      id: "run-starting",
      provider: "openhands",
      state: "starting",
    },
    load: async () => {
      loads++;
      return loads < 3
        ? {
            id: "run-starting",
            provider: "openhands",
            state: "starting",
          }
        : {
            id: "run-starting",
            provider: "openhands",
            providerSessionId: "conversation-ready",
            state: "running",
          };
    },
    delay: async () => {},
  });
  assert.equal(loads, 3);
  assert.equal(
    openHandsConversationPath(run),
    "/conversations/conversation-ready",
  );
});

test("non-OpenHands and unbound runs never fabricate a Canvas conversation path", () => {
  assert.equal(
    openHandsConversationPath({
      id: "external-claude",
      provider: "claude",
      providerSessionId: "claude-session",
    }),
    null,
  );
  assert.equal(
    openHandsConversationPath({
      id: "starting",
      provider: "openhands",
      state: "starting",
    }),
    null,
  );
});
