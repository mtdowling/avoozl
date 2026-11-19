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
import { entries as content } from "./ops/content.mjs";
import { entries as delivery } from "./ops/delivery.mjs";
import { entries as flow } from "./ops/flow.mjs";
import { entries as github } from "./ops/github.mjs";
import { entries as intake } from "./ops/intake.mjs";
import { entries as plans } from "./ops/plans.mjs";
import { entries as plugins } from "./ops/plugins.mjs";
import { entries as sessions } from "./ops/sessions.mjs";
import { entries as specs } from "./ops/specs.mjs";
import { entries as tasks } from "./ops/tasks.mjs";
import { entries as workspace } from "./ops/workspace.mjs";
import { entries as retro } from "./retro-operations.mjs";
import { entries as triage } from "./triage-operations.mjs";

export const TABLES = {
  content,
  delivery,
  flow,
  github,
  intake,
  plans,
  plugins,
  retro,
  sessions,
  specs,
  tasks,
  triage,
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
