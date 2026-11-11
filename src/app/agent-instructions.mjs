import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

export const AGENT_INSTRUCTION_CATEGORIES = Object.freeze([
  "all",
  "chat",
  "chat.project",
  "chat.scoped",
  "plan",
  "plan.create",
  "plan.edit",
  "plan.review",
  "task",
  "task.create",
  "task.create.scoped",
  "task.implement",
  "task.review",
]);

const categories = new Set(AGENT_INSTRUCTION_CATEGORIES);
const selectors = new Set(["all", "scope", "epic", "track", "tag"]);

function plain(value) {
  return String(value || "")
    .trim()
    .replace(/^`|`$/g, "");
}

function heading(line) {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  return match ? { level: match[1].length, title: match[2].trim() } : null;
}

function section(lines, title, after = 0, minimumLevel = 0) {
  const start = lines.findIndex((line, index) => {
    const item = index >= after ? heading(line) : null;
    return (
      item &&
      item.level > minimumLevel &&
      item.title.toLowerCase() === title.toLowerCase()
    );
  });
  if (start < 0) return null;
  const startHeading = heading(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const item = heading(lines[index]);
    if (item && item.level <= startHeading.level) {
      end = index;
      break;
    }
  }
  return { start, end, level: startHeading.level };
}

function normalizeRule(input, source) {
  const id = plain(input.id);
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(id))
    fail(
      `Invalid Avoozl instruction ID${source.line ? ` on line ${source.line}` : ""}; use lower-case letters, digits, and dashes.`,
    );
  const category = plain(input.category || "all");
  if (!categories.has(category))
    fail(`Unknown Avoozl instruction category ${category}.`);
  const filter = plain(input.filter || "all");
  let selector = { kind: "all" };
  if (filter !== "all") {
    const separator = filter.indexOf(":"),
      kind = separator < 0 ? "" : filter.slice(0, separator).trim(),
      value = separator < 0 ? "" : filter.slice(separator + 1).trim();
    if (!selectors.has(kind) || kind === "all" || !value || value.length > 160)
      fail(
        `Invalid filter for Avoozl instruction ${id}; use all, scope:value, epic:value, track:value, or tag:value.`,
      );
    selector = { kind, value };
  }
  const title = plain(input.title);
  if (!title || title.length > 160)
    fail(`Avoozl instruction ${id} needs a title of 1–160 characters.`);
  const instruction = String(input.instruction || "").trim();
  if (!instruction || instruction.length > 10000)
    fail(`Avoozl instruction ${id} needs 1–10000 characters of guidance.`);
  return {
    id,
    title,
    category,
    selector,
    instruction,
    source: {
      path: source.path || "AGENTS.md",
      line: source.line,
      hash: digest(instruction),
    },
  };
}

/**
 * Parse the committed, human-readable policy below:
 *
 * ## Avoozl
 * ### Agent instructions
 * #### Record required cleanup
 * - ID: `record-required-cleanup`
 * - Applies to: `task.implement`
 * - Filter: `all`
 *
 * Propose clearly required follow-up work instead of only mentioning it.
 */
export function parseAgentInstructions(text, { path = "AGENTS.md" } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 512 * 1024)
    fail("AGENTS.md is too large to use as Avoozl policy.");
  const lines = text.replaceAll("\r\n", "\n").split("\n"),
    avoozl = section(lines, "Avoozl"),
    instructions = avoozl
      ? section(lines, "Agent instructions", avoozl.start + 1, avoozl.level)
      : null;
  if (!instructions || instructions.start >= avoozl.end) return [];
  instructions.end = Math.min(instructions.end, avoozl.end);
  const starts = [];
  for (let index = instructions.start + 1; index < instructions.end; index++) {
    const item = heading(lines[index]);
    if (item && item.level === instructions.level + 1)
      starts.push({ index, title: item.title });
  }
  if (starts.length > 500)
    fail("AGENTS.md contains too many Avoozl agent instructions.");
  const rules = starts.map((start, ruleIndex) => {
      const end = starts[ruleIndex + 1]?.index || instructions.end,
        metadata = {},
        body = [];
      for (let index = start.index + 1; index < end; index++) {
        const match = lines[index].match(
          /^\s*[-*]\s+(ID|Applies to|Category|Filter)\s*:\s*(.*?)\s*$/i,
        );
        if (!match) {
          body.push(lines[index]);
          continue;
        }
        const key = match[1].toLowerCase();
        metadata[
          key === "applies to" || key === "category" ? "category" : key
        ] = match[2];
      }
      return normalizeRule(
        {
          ...metadata,
          title: start.title,
          instruction: body.join("\n").trim(),
        },
        { path, line: start.index + 1 },
      );
    }),
    seen = new Set();
  for (const rule of rules) {
    if (seen.has(rule.id))
      fail(`Duplicate Avoozl instruction ID ${rule.id} in AGENTS.md.`);
    seen.add(rule.id);
  }
  return rules;
}

export function synchronizeAgentInstructions(
  data,
  text,
  { path = "AGENTS.md", revision = null } = {},
) {
  const rules = parseAgentInstructions(text, { path }),
    overrides = data.agentInstructionOverrides || {};
  data.agentInstructions = rules.map((rule) => ({
    ...rule,
    enabled: overrides[rule.id] !== false,
  }));
  data.agentInstructionSource = {
    path,
    hash: digest(text),
    revision,
    synchronizedAt: new Date().toISOString(),
    ruleCount: rules.length,
  };
  return data.agentInstructions;
}

export function toggleAgentInstruction(data, id, enabled) {
  const rule = (data.agentInstructions || []).find((item) => item.id === id);
  if (!rule) fail("Agent instruction not found.", 404);
  data.agentInstructionOverrides ??= {};
  data.agentInstructionOverrides[id] = Boolean(enabled);
  rule.enabled = Boolean(enabled);
  return rule;
}

function inheritedCategories(category) {
  const parts = String(category || "all").split("."),
    result = ["all"];
  for (let index = 1; index <= parts.length; index++)
    result.push(parts.slice(0, index).join("."));
  return new Set(result);
}

function selectorMatches(rule, task) {
  const selector = rule.selector || { kind: "all" };
  if (selector.kind === "all") return true;
  if (!task) return false;
  if (selector.kind === "tag") return task.tags?.includes(selector.value);
  return task[selector.kind] === selector.value;
}

export function matchingAgentInstructions(data, category, task) {
  const inherited = inheritedCategories(category);
  return (data.agentInstructions || []).filter(
    (rule) =>
      rule.enabled !== false &&
      inherited.has(rule.category) &&
      selectorMatches(rule, task),
  );
}

export function workflowCategory(run) {
  const explicit = run.context?.workflowCategory;
  if (categories.has(explicit)) return explicit;
  if (run.review?.planId || run.review?.pipelineId) return "plan.review";
  if (run.mode === "plan")
    return run.context?.planId || run.planId ? "plan.edit" : "plan.create";
  if (run.mode === "implement")
    return run.context?.review ? "task.review" : "task.implement";
  if (run.context?.conversationPurpose === "new-task")
    return run.context?.scoped === false ? "task.create" : "task.create.scoped";
  if (run.context?.conversationPurpose === "project-chat")
    return run.context?.scoped === false ? "chat.project" : "chat.scoped";
  return "chat";
}
