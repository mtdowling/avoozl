// The operations of the triage agent and the GitHub pages (triage-agent
// TA1, TA5, TA6, TA8). Operations.execute hands every `triage.*` and
// `items.*` call here with itself, so they share its store, GitHub client
// and settings file.
import { fail } from "./store.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";
import { itemsAct, itemsDetail, itemsList } from "./github-pages.mjs";
import {
  TRIAGE_DEFAULTS,
  controlTriage,
  settleOwner,
  submitTriage,
  triageView,
} from "./triage.mjs";

export const TRIAGE_OPERATIONS = Object.freeze({
  observe: ["items.list", "items.detail", "triage.view"],
  person: [
    "items.act",
    "triage.pause",
    "triage.resume",
    "triage.stop",
    "triage.start",
    "triage.owner.done",
    "triage.settings",
  ],
  session: ["triage.submit"],
});

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

export async function triageOperation(ops, name, input = {}, context = {}) {
  const store = ops.store,
    person = !context.caller && !context.mcp,
    policy = () => readGitHubPolicyOrNull(ops.workspaceRoot);
  if (TRIAGE_OPERATIONS.person.includes(name) && !person)
    fail("Only a person does this, from the Avoozl page.", 403);
  switch (name) {
    case "items.list":
      return itemsList(store, input, { login: await login(ops.github) });
    case "items.detail":
      return itemsDetail(store, ops.github, input);
    case "items.act":
      return itemsAct(store, ops.github, input, {
        policy: policy(),
        workspaceRoot: ops.workspaceRoot,
        actor: ops.operator,
        login: await login(ops.github),
        person,
      });
    case "triage.view":
      return triageView(store, policy(), ops.github);
    case "triage.submit":
      return submitTriage(store, input, context.caller);
    case "triage.pause":
    case "triage.resume":
    case "triage.stop":
    case "triage.start":
      return controlTriage(
        store,
        policy(),
        name.slice("triage.".length),
        input,
      );
    case "triage.owner.done":
      settleOwner(store, input);
      return { repository: input.repository, number: input.number };
    case "triage.settings":
      return saveSettings(ops, input);
    default:
      fail(`Unknown operation ${name}.`, 404);
  }
}
