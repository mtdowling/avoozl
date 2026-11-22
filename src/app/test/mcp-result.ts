// Test helper: MCP answers read with run-time checks, since their result
// shapes come from a union the tests cannot name.
import assert from "node:assert/strict";
import type { handleMcp } from "../mcp/mcp.ts";

// A tool call's result, for the fields tests read.
export interface ToolResult {
  isError?: boolean;
  content: { type?: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

// The value at `keys` under `value`, failing the test where a step is not
// an object.
export function at(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    assert.ok(current && typeof current === "object", `no ${key} here`);
    current = Reflect.get(current, key);
  }
  return current;
}

// The tool result a JSON-RPC answer carries, failing the test when it has
// none.
export function answerResult(answer: unknown): ToolResult {
  const result = at(answer, "result");
  assert.ok(
    result && typeof result === "object" && "content" in result,
    "the answer is a tool result",
  );
  const content: unknown = result.content;
  assert.ok(Array.isArray(content), "its content is a list");
  return { ...result, content };
}

// The tool result in handleMcp's response.
export const toolResult = (response: Awaited<ReturnType<typeof handleMcp>>) =>
  answerResult(response.body);
