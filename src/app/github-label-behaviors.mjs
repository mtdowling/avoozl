const BEHAVIOR_NAMES = ["ready", "blocked", "review", "quarantined"];

export const DEFAULT_GITHUB_LABEL_BEHAVIORS = Object.freeze({
  ready: Object.freeze(["avoozl:ready"]),
  blocked: Object.freeze(["avoozl:blocked"]),
  review: Object.freeze(["avoozl:review"]),
  quarantined: Object.freeze(["avoozl:quarantined"]),
});

function labelList(value, behavior) {
  const values =
    value === undefined
      ? undefined
      : Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : null;
  if (values === null)
    throw new Error(`GitHub ${behavior} labels must be a string or array.`);
  if (values === undefined) return undefined;
  if (values.some((label) => typeof label !== "string"))
    throw new Error(`GitHub ${behavior} labels must contain only strings.`);
  return [
    ...new Map(
      values
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => [label.toLocaleLowerCase(), label]),
    ).values(),
  ];
}

export function normalizeGitHubLabelBehaviors(value, fallback) {
  if (
    value !== undefined &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    throw new Error("GitHub label behaviors must contain a JSON object.");
  const source = value || {},
    base = fallback || DEFAULT_GITHUB_LABEL_BEHAVIORS;
  for (const name of Object.keys(source))
    if (!BEHAVIOR_NAMES.includes(name))
      throw new Error(`Unknown GitHub label behavior ${name}.`);
  return Object.fromEntries(
    BEHAVIOR_NAMES.map((name) => [
      name,
      labelList(source[name], name) ??
        labelList(base?.[name], name) ?? [
          ...DEFAULT_GITHUB_LABEL_BEHAVIORS[name],
        ],
    ]),
  );
}

export function normalizedGitHubLabelStates(
  labels,
  behaviors = DEFAULT_GITHUB_LABEL_BEHAVIORS,
) {
  const names = new Set(
    (labels || [])
      .filter((label) => typeof label === "string")
      .map((label) => label.trim().toLocaleLowerCase()),
  );
  return ["quarantined", "blocked", "review", "ready"].filter((behavior) =>
    (behaviors[behavior] || []).some((label) =>
      names.has(label.toLocaleLowerCase()),
    ),
  );
}

export function primaryGitHubLabelState(labels, behaviors) {
  return normalizedGitHubLabelStates(labels, behaviors)[0] || "unclassified";
}
