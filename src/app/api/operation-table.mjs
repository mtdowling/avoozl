// Every operation, from one table per feature. An entry is
// {name, class, policy, handler}:
//   class    how much authority it needs (the app backend's action-level
//            authorization): `observe` reads only; `draft`, `execute`,
//            `protect` and `incident` change state.
//   policy   its MCP rule (operation-policy.mjs): routed, person or notOnMcp.
//   handler  called with the Operations instance as `this` and
//            {name, input, expectedRevision, context}.
// The dispatcher, the class lookup and the MCP policy (mcp-policy.mjs) read
// this table; a new operation is one entry in one feature module. An
// operation with no entry is refused by name.
import { entries as content } from "../ops/content.ts";
import { entries as context } from "../ops/context.ts";
import { entries as delivery } from "../ops/delivery.ts";
import { entries as flow } from "../ops/flow.ts";
import { entries as github } from "../ops/github.ts";
import { entries as insights } from "../ops/insights.ts";
import { entries as intake } from "../ops/intake.ts";
import { entries as plans } from "../ops/plans.ts";
import { entries as plugins } from "../ops/plugins.ts";
import { entries as sessions } from "../ops/sessions.ts";
import { entries as specs } from "../ops/specs.ts";
import { entries as tasks } from "../ops/tasks.ts";
import { entries as telemetry } from "../ops/telemetry.ts";
import { entries as workspace } from "../ops/workspace.ts";

export const TABLES = {
  content,
  context,
  delivery,
  flow,
  github,
  insights,
  intake,
  plans,
  plugins,
  sessions,
  specs,
  tasks,
  telemetry,
  workspace,
};

export const OPERATIONS = new Map();
for (const [feature, table] of Object.entries(TABLES))
  for (const entry of table) {
    if (OPERATIONS.has(entry.name))
      throw Error(`Operation ${entry.name} is registered twice (${feature}).`);
    OPERATIONS.set(entry.name, entry);
  }

export const classifyOperation = (name) => OPERATIONS.get(name)?.class ?? null;
