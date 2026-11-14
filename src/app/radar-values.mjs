// The values only the owner can enter in Issue Radar (RC7.2, RC7.3, design
// D9): one list with what each value controls, and a re-read that ticks what
// Radar's own read confirms. Avoozl does not write any of them. Pure: the
// read arrives as data (`read`), from the grant when there is one.
import { CREW_AGENT, crewAgentCheck } from "./crew-agent.mjs";
import {
  CREW_LABEL_DEFAULTS,
  ISSUE_RADAR_PATH,
  READY_LABEL_DEFAULT,
} from "./github-policy.mjs";
import { CREW_PROMPT } from "./radar-crew-prompt.mjs";
import { CLAIM_TTL_HOURS } from "./radar-claims.mjs";

// A crew's name when the pack names none: stable, from the repository.
const crewNameFor = (repository) =>
  `avoozl-${String(repository).split("/").pop()}`;

// `crew` is what a team pack proposes ({name, models}); either may be absent.
export function radarValues({ repository, settings = {}, crew = {} }) {
  const ready = settings.managedLabels?.ready ?? READY_LABEL_DEFAULT,
    needsHuman =
      settings.crewLabels?.needsHuman ?? CREW_LABEL_DEFAULTS.needsHuman;
  return [
    {
      id: "repository",
      label: "Repository to connect",
      value: repository,
      controls: "Which repository's issues the crew can read and change.",
    },
    {
      id: "crew-name",
      label: "Crew name",
      value: crew.name || crewNameFor(repository),
      controls: "How the crew shows in Issue Radar. Any name works.",
    },
    {
      id: "agent",
      label: "Agent",
      value: CREW_AGENT,
      controls: "The agent that gives the crew Avoozl's tools and checks.",
    },
    {
      id: "model",
      label: "Model",
      value: crew.models?.[0] || "auto",
      controls: "The model the crew codes with. Pick the one your team uses.",
    },
    {
      id: "scope",
      label: "Label scope",
      value: ready,
      controls: "The crew takes only issues that carry this label.",
    },
    {
      id: "needs-human",
      label: "Needs-human label",
      value: needsHuman,
      controls: "The label a crew puts on an issue when it needs a person.",
    },
    {
      id: "claim-limit",
      label: "Claim time limit (hours)",
      value: String(CLAIM_TTL_HOURS),
      controls:
        "How long a crew may hold an issue before Radar treats the claim as stale.",
    },
    {
      id: "prompt",
      label: "Additional prompt",
      value: CREW_PROMPT,
      controls:
        "Tells the crew to run the check on each issue before it builds.",
    },
  ];
}

// How Radar's read states each value, by id. A field Radar's read lacks is
// "cannot verify", never a guess.
function crewOf(read, values) {
  const name = values.find((v) => v.id === "crew-name").value;
  const crews = Array.isArray(read?.crews) ? read.crews : [];
  return (
    crews.find((crew) => crew?.name === name) ??
    crews.find((crew) => crew?.agent === CREW_AGENT) ??
    null
  );
}

const same = (a, b) =>
  typeof a === "string" &&
  a.trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase();

export function radarReread(values, read, reason = null) {
  const grant = Boolean(read) && typeof read === "object";
  const link = ISSUE_RADAR_PATH;
  if (!grant)
    return {
      grant: false,
      link,
      items: values.map((item) => ({
        ...item,
        status: "cannot-verify",
        note: `${reason || "Avoozl cannot read Issue Radar here."} Tick it when you have done it.`,
      })),
    };
  const crew = crewOf(read, values),
    agents = crewAgentCheck({
      list: read.agents,
      crews: read.crews,
    });
  const verdict = {
    repository: () =>
      Array.isArray(read.connected)
        ? read.connected.some((name) => same(name, values[0].value))
        : null,
    "crew-name": () => (Array.isArray(read.crews) ? Boolean(crew) : null),
    agent: () =>
      crew?.agent !== undefined
        ? crew.agent === CREW_AGENT
        : agents.state === "not-verified"
          ? null
          : agents.state === "present",
    model: () => {
      const wanted = values.find((v) => v.id === "model").value;
      return wanted === "auto" || crew?.model === undefined
        ? null
        : same(crew.model, wanted);
    },
    // Radar's crew list gives the labels a crew watches; an empty list
    // means every open issue, which is not the ready label.
    scope: () =>
      !Array.isArray(crew?.labels)
        ? null
        : crew.labels.some((label) =>
            same(label, values.find((v) => v.id === "scope").value),
          ),
    // Radar keeps this label per repository, not per crew.
    "needs-human": () => {
      const shown = read.needsHumanLabel ?? crew?.needsHumanLabel;
      return shown == null
        ? null
        : same(shown, values.find((v) => v.id === "needs-human").value);
    },
    "claim-limit": () =>
      crew?.claimTtlHours === undefined
        ? null
        : Number(crew.claimTtlHours) === CLAIM_TTL_HOURS,
    prompt: () =>
      crew?.prompt === undefined ? null : crew.prompt.trim() === CREW_PROMPT,
  };
  return {
    grant: true,
    link,
    items: values.map((item) => {
      const ok = verdict[item.id]();
      return {
        ...item,
        status: ok === null ? "cannot-verify" : ok ? "ok" : "differs",
        note:
          ok === null
            ? "Issue Radar's read does not show this one. Tick it yourself."
            : ok
              ? "Issue Radar shows this value."
              : "Issue Radar shows something else. Copy the value and enter it.",
      };
    }),
  };
}
