import { taskEpic } from "../epics/epics.ts";
import { digest } from "../../model.ts";
import { fail } from "../store/store.ts";

type When = Partial<
  Record<
    | "scopes"
    | "epics"
    | "tracks"
    | "tagsAny"
    | "tagsAll"
    | "tagsNone"
    | "paths",
    string[]
  >
>;
export interface AgentInstruction {
  id: string;
  title: string;
  appliesTo: string[];
  when: When;
  instruction: string;
  enabled: boolean;
  category?: string;
  source: {
    path: string;
    repositoryId: string | null;
    pointer: string;
    hash: string;
  };
}
// Where a rules value came from.
interface InstructionSource {
  path?: string;
  repositoryId?: string | null;
  revision?: string | null;
  value?: unknown;
}
// The snapshot fields the instructions read and write.
interface InstructionData {
  agentInstructions?: AgentInstruction[];
  agentInstructionOverrides?: Record<string, boolean>;
  agentInstructionSource?: unknown;
  [key: string]: unknown;
}
// The task fields a rule's `when` selects on.
interface SelectedTask {
  repositoryId?: string | null;
  scope?: string;
  track?: string;
  path?: string;
  tags?: string[];
  [key: string]: unknown;
}

const AGENT_INSTRUCTION_CATEGORIES = Object.freeze([
  "all",
  "chat",
  "chat.repository",
  "chat.scoped",
  "plan",
  "plan.create",
  "plan.edit",
  "plan.extract",
  "plan.publish",
  "task",
  "task.create",
  "task.create.scoped",
  "task.implement",
  "task.review",
  "task.complete",
  "github",
  "github.issue",
  "github.issue.implement",
  "github.pr",
  "github.pr.review",
]);

const categories = new Set<unknown>(AGENT_INSTRUCTION_CATEGORIES);
export const whenKeys = new Set<keyof When>([
  "scopes",
  "epics",
  "tracks",
  "tagsAny",
  "tagsAll",
  "tagsNone",
  "paths",
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const ruleKeys = new Set([
  "id",
  "title",
  "appliesTo",
  "when",
  "instruction",
  "enabled",
]);

function allowedKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
) {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`Unknown ${label} setting ${key}.`);
}

function stringList(
  value: unknown,
  label: string,
  { required = false } = {},
): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && !value.length))
    fail(
      `${label} must contain ${required ? "one or more" : "a list of"} values.`,
    );
  if (value.length > 100) fail(`${label} contains too many values.`);
  const result = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > 160)
      fail(`${label} values must contain 1–160 characters.`);
    return entry.trim();
  });
  if (new Set(result).size !== result.length)
    fail(`${label} values must be unique.`);
  return result;
}

function normalizeWhen(value: unknown, id: string): When {
  if (value === undefined) return {};
  if (!record(value))
    fail(`Avoozl instruction ${id} when must contain an object.`);
  allowedKeys(value, whenKeys, `Avoozl instruction ${id} when`);
  return Object.fromEntries(
    [...whenKeys]
      .filter((key) => value[key] !== undefined)
      .map((key) => [
        key,
        stringList(value[key], `Avoozl instruction ${id} ${key}`),
      ]),
  );
}

function normalizeRule(
  input: unknown,
  source: InstructionSource,
  index: number,
): AgentInstruction {
  if (!record(input))
    fail(`Avoozl instruction ${index + 1} must contain an object.`);
  allowedKeys(input, ruleKeys, `Avoozl instruction ${index + 1}`);
  const id = String(input.id || "").trim();
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(id))
    fail(
      `Invalid Avoozl instruction ID at ${source.path}#/agentInstructions/rules/${index}; use lower-case letters, digits, and dashes.`,
    );
  const appliesTo = stringList(
    input.appliesTo,
    `Avoozl instruction ${id} appliesTo`,
    { required: true },
  );
  for (const category of appliesTo)
    if (!categories.has(category))
      fail(`Unknown Avoozl instruction workflow ${category}.`);
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.trim().length > 160
  )
    fail(`Avoozl instruction ${id} needs a title of 1–160 characters.`);
  if (
    typeof input.instruction !== "string" ||
    !input.instruction.trim() ||
    input.instruction.trim().length > 10000
  )
    fail(`Avoozl instruction ${id} needs 1–10000 characters of guidance.`);
  if (input.enabled !== undefined && typeof input.enabled !== "boolean")
    fail(`Avoozl instruction ${id} enabled must be true or false.`);
  const instruction = input.instruction.trim();
  return {
    id,
    title: input.title.trim(),
    appliesTo,
    when: normalizeWhen(input.when, id),
    instruction,
    enabled: input.enabled !== false,
    source: {
      path: source.path || ".avoozl.json",
      repositoryId: source.repositoryId || null,
      pointer: `/agentInstructions/rules/${index}`,
      hash: digest(JSON.stringify(input)),
    },
  };
}

/**
 * Parse explicit, checked-in Avoozl policy from `.avoozl.json`.
 * AGENTS.md remains repository guidance for agents; Avoozl never interprets it
 * as structured policy.
 */
export function parseAgentInstructions(
  value: unknown,
  {
    path = ".avoozl.json",
    repositoryId = null,
  }: { path?: string; repositoryId?: string | null } = {},
): AgentInstruction[] {
  if (value === undefined || value === null) return [];
  if (
    record(value) &&
    value.agentInstructions !== undefined &&
    !record(value.agentInstructions)
  )
    fail(`agentInstructions in ${path} must contain an object.`);
  if (record(value) && record(value.agentInstructions))
    allowedKeys(
      value.agentInstructions,
      new Set(["rules"]),
      `agentInstructions in ${path}`,
    );
  const rules = Array.isArray(value)
    ? value
    : record(value) && record(value.agentInstructions)
      ? value.agentInstructions.rules
      : undefined;
  if (rules === undefined) return [];
  if (!Array.isArray(rules))
    fail(`agentInstructions.rules in ${path} must contain a list.`);
  if (rules.length > 500)
    fail(`${path} contains too many Avoozl agent instructions.`);
  const normalized = rules.map((rule, index) =>
      normalizeRule(rule, { path, repositoryId }, index),
    ),
    seen = new Set<string>();
  for (const rule of normalized) {
    if (seen.has(rule.id))
      fail(`Duplicate Avoozl instruction ID ${rule.id} in ${path}.`);
    seen.add(rule.id);
  }
  return normalized;
}

export function synchronizeAgentInstructions(
  data: InstructionData,
  value: unknown,
  {
    path = ".avoozl.json",
    repositoryId = null,
    revision = null,
    sources,
  }: InstructionSource & { sources?: InstructionSource[] } = {},
) {
  const entries: InstructionSource[] = sources || [
      {
        value,
        path,
        repositoryId,
        revision,
      },
    ],
    rules: AgentInstruction[] = [],
    seen = new Map<string, string>(),
    sourceRecords: (Required<Omit<InstructionSource, "value">> & {
      hash: string;
      ruleCount: number;
    })[] = [];
  for (const entry of entries) {
    const parsed = parseAgentInstructions(entry.value, entry);
    for (const rule of parsed) {
      const previous = seen.get(rule.id);
      if (previous)
        fail(
          `Duplicate Avoozl instruction ID ${rule.id} in ${previous} and ${rule.source.path}.`,
        );
      seen.set(rule.id, rule.source.path);
      rules.push(rule);
    }
    sourceRecords.push({
      path: entry.path || ".avoozl.json",
      repositoryId: entry.repositoryId || null,
      revision: entry.revision || null,
      hash: digest(JSON.stringify(entry.value || {})),
      ruleCount: parsed.length,
    });
  }
  const overrides = data.agentInstructionOverrides || {};
  data.agentInstructions = rules.map((rule) => ({
    ...rule,
    enabled:
      overrides[rule.id] === undefined
        ? rule.enabled !== false
        : overrides[rule.id] !== false,
  }));
  data.agentInstructionSource = {
    path: sourceRecords[0]?.path || path,
    hash: digest(JSON.stringify(sourceRecords)),
    revision: sourceRecords[0]?.revision || revision,
    synchronizedAt: new Date().toISOString(),
    ruleCount: rules.length,
    sources: sourceRecords,
  };
  return data.agentInstructions;
}

export function toggleAgentInstruction(
  data: InstructionData,
  id: string,
  enabled: unknown,
) {
  const rule = (data.agentInstructions || []).find((item) => item.id === id);
  if (!rule) fail("Agent instruction not found.", 404);
  data.agentInstructionOverrides ??= {};
  data.agentInstructionOverrides[id] = Boolean(enabled);
  rule.enabled = Boolean(enabled);
  return rule;
}

function inheritedCategories(category: unknown) {
  const parts = String(category || "all").split("."),
    result = ["all"];
  for (let index = 1; index <= parts.length; index++)
    result.push(parts.slice(0, index).join("."));
  return new Set(result);
}

function includesOrAll(selected: string[] | undefined, value: unknown) {
  return !selected?.length || selected.includes(value as string);
}

function selectorMatches(
  rule: AgentInstruction,
  task: SelectedTask | null | undefined,
  data: InstructionData,
) {
  const when: When = rule.when || {};
  if (
    rule.source?.repositoryId &&
    rule.source.repositoryId !== task?.repositoryId
  )
    return false;
  if (
    !includesOrAll(when.scopes, task?.scope) ||
    // An epic spans plans: a task's is its plan's (Requirement 59.2).
    !includesOrAll(when.epics, taskEpic(data, task)) ||
    !includesOrAll(when.tracks, task?.track)
  )
    return false;
  if (
    when.paths?.length &&
    !when.paths.some((pattern) => {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\0")
        .replace(/\*/g, "[^/]*")
        .replace(/\0/g, ".*");
      return new RegExp(`^${escaped}$`).test(task?.path || "");
    })
  )
    return false;
  const tags = new Set(task?.tags || []);
  if (when.tagsAny?.length && !when.tagsAny.some((tag) => tags.has(tag)))
    return false;
  if (when.tagsAll?.length && !when.tagsAll.every((tag) => tags.has(tag)))
    return false;
  if (when.tagsNone?.some((tag) => tags.has(tag))) return false;
  return true;
}

export function matchingAgentInstructions(
  data: InstructionData,
  category: unknown,
  task?: SelectedTask | null,
) {
  const inherited = inheritedCategories(category);
  return (data.agentInstructions || []).filter(
    (rule) =>
      rule.enabled !== false &&
      (rule.appliesTo || [rule.category || "all"]).some((appliesTo) =>
        inherited.has(appliesTo),
      ) &&
      selectorMatches(rule, task, data),
  );
}

export function workflowCategory(run: {
  mode?: string;
  planId?: string;
  context?: Record<string, unknown> | null;
}) {
  const explicit = run.context?.workflowCategory;
  if (categories.has(explicit)) return explicit as string;
  if (run.mode === "plan")
    return run.context?.planId || run.planId ? "plan.edit" : "plan.create";
  if (run.mode === "implement")
    return run.context?.review ? "task.review" : "task.implement";
  if (run.context?.conversationPurpose === "review") return "task.review";
  if (run.context?.conversationPurpose === "new-task")
    return run.context?.scoped === false ? "task.create" : "task.create.scoped";
  if (run.context?.conversationPurpose === "repository-chat")
    return run.context?.scoped === false ? "chat.repository" : "chat.scoped";
  if (run.context?.conversationPurpose === "issue-implement")
    return "github.issue.implement";
  if (run.context?.conversationPurpose === "pull-request-review")
    return "github.pr.review";
  return "chat";
}
