// The operations of the triage agent and the GitHub pages (triage-agent
// TA1, TA5, TA6, TA8). Handlers run with the Operations instance as `this`,
// so they share its store, GitHub client and settings file.
import { fail } from "./store.mjs";
import { notOnMcp, person, routed } from "./operation-policy.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";
import { itemsAct, itemsDetail, itemsList } from "./github-pages.mjs";
import {
  TRIAGE_DEFAULTS,
  controlTriage,
  settleOwner,
  submitTriage,
  triageView,
} from "./triage.mjs";

const lower = (value) => String(value ?? "").toLowerCase();

async function login(github) {
  try {
    return (await github?.currentUser?.())?.login ?? null;
  } catch {
    return null;
  }
}

// `triage.settings` {repository, agent?, existing?, dailyRuns?,
// fullReviewMaxLines?, labels?, reviews?}: the repository's triage block in
// `.avoozl.json`. Turning the agent on names `existing` (TA1.1).
function saveSettings(ops, input) {
  const file = ops.settingsFile(),
    current = file.readGitHubSettings(),
    github = structuredClone(current.github),
    key = Object.keys(github.repositories || {}).find(
      (entry) => lower(entry) === lower(input.repository),
    );
  if (!key) fail(`${input.repository} is not a registered repository.`, 404);
  const entry = github.repositories[key],
    triage = { ...(entry.triage || {}) };
  for (const name of Object.keys(TRIAGE_DEFAULTS))
    if (input[name] !== undefined) triage[name] = input[name];
  if (input.agent === "on" && entry.triage?.agent !== "on" && !input.existing)
    fail(
      "Say whether the agent takes the open items already there (take) or only new ones (skip).",
    );
  github.repositories = { ...github.repositories, [key]: { ...entry, triage } };
  file.updateGitHubSettings({ github, expectedHash: current.hash });
  ops.cachePolicy = null;
  ops.configuration?.reload();
  return { repository: key, triage };
}

const policy = (ops) => readGitHubPolicyOrNull(ops.workspaceRoot);
const control = (verb) =>
  function ({ input }) {
    return controlTriage(this.store, policy(this), verb, input);
  };

const reads =
  "The GitHub pages' reads; the triage agent's session gets its snapshot instead.";

export const entries = [
  {
    name: "items.list",
    class: "observe",
    policy: notOnMcp(reads),
    async handler({ input }) {
      return itemsList(this.store, input, { login: await login(this.github) });
    },
  },
  {
    name: "items.detail",
    class: "observe",
    policy: notOnMcp(reads),
    handler({ input }) {
      return itemsDetail(this.store, this.github, input);
    },
  },
  {
    name: "triage.view",
    class: "observe",
    policy: notOnMcp(reads),
    handler() {
      return triageView(this.store, policy(this), this.github);
    },
  },
  {
    name: "triage.submit",
    class: "execute",
    policy: routed,
    handler({ input, context }) {
      return submitTriage(this.store, input, context.caller);
    },
  },
  {
    name: "items.act",
    class: "protect",
    policy: person(
      "Only a person acts on an issue or pull request: approve, request changes, close, label or comment.",
    ),
    async handler({ input, context }) {
      return itemsAct(this.store, this.github, input, {
        policy: policy(this),
        workspaceRoot: this.workspaceRoot,
        actor: this.operator,
        login: await login(this.github),
        person: !context.caller && !context.mcp,
      });
    },
  },
  {
    name: "triage.pause",
    class: "protect",
    policy: person("Only a person pauses the triage agent."),
    handler: control("pause"),
  },
  {
    name: "triage.resume",
    class: "protect",
    policy: person("Only a person resumes the triage agent."),
    handler: control("resume"),
  },
  {
    name: "triage.stop",
    class: "protect",
    policy: person("Only a person stops the triage agent."),
    handler: control("stop"),
  },
  {
    name: "triage.start",
    class: "protect",
    policy: person("Only a person starts the triage agent again."),
    handler: control("start"),
  },
  {
    name: "triage.owner.done",
    class: "protect",
    policy: person("Only a person settles an owner queue item."),
    handler({ input }) {
      settleOwner(this.store, input);
      return { repository: input.repository, number: input.number };
    },
  },
  {
    name: "triage.settings",
    class: "protect",
    policy: person("Only a person changes the triage agent's settings."),
    handler({ input }) {
      return saveSettings(this, input);
    },
  },
];
