// Ask for help (design §8.9): chat.context with purpose "help" seeds a chat
// with the page, section, its words, its settings and a docs pointer, and
// tells the chat not to save anything.
import assert from "node:assert/strict";
import test from "node:test";
import { helpMessage } from "../page-views.mjs";

test("the help seed names the page, its settings and the docs, and saves nothing", () => {
  const message = helpMessage({
    purpose: "help",
    help: {
      page: "Settings › Delivery",
      section: "Delivery is off",
      says: "The tick starts no ready task.\nTurn it on.",
      settings: [
        { key: "delivery", value: "not set" },
        { key: "delivery.concurrency", value: 3 },
        { key: "", value: "dropped" },
      ],
      docs: "README.md, section Delivery",
    },
  });
  assert.match(message, /^Context from the Avoozl page\./);
  assert.match(message, /Do not save or change any setting, write any file/);
  assert.match(message, /- Page: Settings › Delivery/);
  assert.match(message, /- Section: Delivery is off/);
  assert.match(
    message,
    /- It says: The tick starts no ready task\. Turn it on\./,
  );
  assert.match(message, /- delivery: not set\n- delivery\.concurrency: 3\n/);
  assert.doesNotMatch(message, /dropped/);
  assert.match(message, /## Docs\n- README\.md, section Delivery$/);
  // Junk input still makes a seed.
  assert.match(helpMessage({ help: [] }), /- Page: Avoozl[\s\S]*- None\./);
});
