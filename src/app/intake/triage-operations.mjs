// The operations of the triage agent and the GitHub pages (triage-agent
// TA1, TA5, TA6, TA8). Handlers run with the Operations instance as `this`,
// so they share its store, GitHub client and settings file.
import { fail } from "../store/store.mjs";
import { notOnMcp, person, routed } from "../api/operation-policy.mjs";
import { readGitHubPolicyOrNull } from "../github/github-policy.mjs";
import { itemsAct, itemsDetail, itemsList } from "../github/github-pages.mjs";
import { listHarnessDefinitions } from "../executors/harness-definitions.mjs";
import { triageBlock } from "../plugins/plugins.mjs";
import { KIROCREW_HARNESS } from "../settings/chat-models.mjs";
import {
  TRIAGE_DEFAULTS,
  TRIAGE_LABELS,
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

// `triage.settings` {repository, existing?, dailyRuns?, fullReviewMaxLines?,
// labels?, reviews?}: the repository's triage block in `.avoozl.json`. It
// never turns the agent on or off: Set up triage (`triage.setup`) is the one
// way on, and `triage.off` the way off (TA12).
function saveSettings(ops, input, extra = {}) {
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
    if (name !== "agent" && input[name] !== undefined)
      triage[name] = input[name];
  Object.assign(triage, extra);
  github.repositories = { ...github.repositories, [key]: { ...entry, triage } };
  file.updateGitHubSettings({ github, expectedHash: current.hash });
  ops.cachePolicy = null;
  ops.configuration?.reload();
  return { repository: key, triage };
}

const policy = (ops) => readGitHubPolicyOrNull(ops.workspaceRoot);
const block = (ops) => triageBlock(ops.pluginOptions);
const control = (verb) =>
  function ({ input }) {
    return controlTriage(this.store, policy(this), verb, input);
  };
// Set up triage and Turn off are a person's, in the app or the CLI: the
// MCP policy refuses them, and so does the handler for a bound caller.
const personOnly = (context, what) => {
  if (context.caller || context.mcp)
    fail(`Only a person ${what}, in the Avoozl app or CLI.`, 403);
};

// The harnesses Set up triage offers the triage role: its repository's
// executor (auto), a Kiro Crew chat, or a harness approved on this machine.
const harnessChoices = (ops) => [
  "auto",
  KIROCREW_HARNESS,
  ...listHarnessDefinitions(ops.configDirectory)
    .filter((definition) => definition.approved)
    .map((definition) => definition.name),
];

// `triage.setup` {repository} previews: the defaults, the labels the
// repository has and lacks, and the harnesses. With {confirm, existing,
// dailyRuns?, fullReviewMaxLines?, harness?, labels?} it makes each named
// label the repository lacks, saves the triage role's harness, and turns
// the agent on. A plugin's block refuses it (TA12.3).
async function setupTriage(ops, input) {
  const found = block(ops);
  if (found)
    fail(
      `Triage is blocked on this machine by plugin ${found.plugin}: ${found.reason}`,
      403,
    );
  const repository = Object.keys(policy(ops)?.repositories || {}).find(
    (entry) => lower(entry) === lower(input.repository),
  );
  if (!repository)
    fail(`${input.repository} is not a registered repository.`, 404);
  let have = null,
    labelsError = null;
  if (!ops.github?.available?.()) labelsError = "GitHub is not signed in.";
  else
    try {
      have = new Set(
        (await ops.github.listLabels(repository)).map((l) => lower(l.name)),
      );
    } catch (error) {
      labelsError = `GitHub could not be read: ${error.message}`;
    }
  const labels = TRIAGE_LABELS.map((label) => ({
    ...label,
    exists: have ? have.has(lower(label.name)) : null,
  }));
  const harnesses = harnessChoices(ops);
  if (!input.confirm)
    return {
      repository,
      defaults: TRIAGE_DEFAULTS,
      labels,
      labelsError,
      harnesses,
      harness:
        ops.settingsFile().readModelSettings().roles?.triage?.harness ?? "auto",
    };
  if (!["take", "skip"].includes(input.existing))
    fail(
      "Say whether the agent takes the open items already there (take) or only new ones (skip).",
    );
  const make = input.createLabels ?? [];
  if (
    !Array.isArray(make) ||
    make.some((name) => !TRIAGE_LABELS.some((label) => label.name === name))
  )
    fail(
      `createLabels must be names from ${TRIAGE_LABELS.map((l) => l.name).join(", ")}.`,
    );
  const harness = input.harness ?? "auto";
  if (!harnesses.includes(harness))
    fail(`Harness must be one of ${harnesses.join(", ")}.`);
  const missing = labels.filter(
    (label) => make.includes(label.name) && label.exists !== true,
  );
  if (missing.length && !have)
    fail(`Labels cannot be made: ${labelsError}`, 409);
  // The settings first, so a value .avoozl.json refuses makes no label;
  // a label GitHub refuses leaves the agent on, and Set up again retries.
  const models = ops.settingsFile(),
    file = models.readFile(),
    roles = structuredClone(file.value?.roles || {});
  if (harness === "auto") delete roles.triage;
  else roles.triage = { harness };
  const { existing, dailyRuns, fullReviewMaxLines } = input,
    saved = saveSettings(
      ops,
      { repository, existing, dailyRuns, fullReviewMaxLines },
      { agent: "on" },
    );
  if (JSON.stringify(roles) !== JSON.stringify(file.value?.roles || {}))
    models.updateModelSettings({
      roles,
      expectedHash: models.readFile().hash,
    });
  const created = [];
  for (const { name, color, description } of missing) {
    await ops.github.ensureLabel(repository, { name, color, description });
    created.push(name);
  }
  return { ...saved, created, harness };
}

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
      return triageView(
        this.store,
        policy(this),
        this.github,
        Date.now(),
        block(this),
      );
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
      if (input.agent !== undefined)
        fail(
          "Set up triage on the Triage agent page (or avoozl triage setup) turns the agent on; Turn off (avoozl triage off) turns it off.",
        );
      return saveSettings(this, input);
    },
  },
  // Set up triage (TA12.2): the only way the agent goes on.
  {
    name: "triage.setup",
    class: "protect",
    policy: person("Only a person sets up the triage agent."),
    handler({ input, context }) {
      personOnly(context, "sets up the triage agent");
      return setupTriage(this, input);
    },
  },
  // Turn off (TA12.4): one step, and every label stays as it is.
  {
    name: "triage.off",
    class: "protect",
    policy: person("Only a person turns the triage agent off."),
    handler({ input, context }) {
      personOnly(context, "turns the triage agent off");
      return saveSettings(this, input, { agent: "off" });
    },
  },
];
