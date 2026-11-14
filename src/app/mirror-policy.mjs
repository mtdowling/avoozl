// The per-repository `mirror` setting (RC24.1, RC24.2, design D29.1). Crews
// work a private mirror of a public repository. Validation here is
// deterministic; the one check that needs GitHub is `requireMirrorsPrivate`.
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";

export const FORWARD_MODES = Object.freeze(["off", "nudge", "auto"]);
export const MIRROR_KEYS = Object.freeze([
  "source",
  "mirror",
  "forwardTo",
  "forward",
  "branchPrefix",
  "squash",
  "trustedPersons",
]);
export const MIRROR_DEFAULTS = Object.freeze({
  forwardTo: "source",
  forward: "nudge",
  branchPrefix: "avoozl/",
  squash: true,
});

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PREFIX = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function repositoryName(value, label) {
  if (typeof value !== "string" || !REPOSITORY.test(value))
    fail(`${label} must be an owner/repository name.`);
  return value;
}

// The normalized mirror of one repository entry, or null when it has none.
export function mirrorInput(value, label) {
  if (value === undefined || value === null) return null;
  if (!record(value)) fail(`${label} must contain a JSON object.`);
  for (const key of Object.keys(value))
    if (!MIRROR_KEYS.includes(key)) fail(`Unknown setting ${label}.${key}.`);
  const source = repositoryName(value.source, `${label}.source`),
    mirror = repositoryName(value.mirror, `${label}.mirror`);
  if (source.toLowerCase() === mirror.toLowerCase())
    fail(`${label}.mirror must differ from ${label}.source.`);
  const forwardTo = value.forwardTo ?? MIRROR_DEFAULTS.forwardTo;
  if (forwardTo !== "source") {
    const fork = /^fork:(.+)$/.exec(String(forwardTo))?.[1];
    if (typeof forwardTo !== "string" || !fork || !REPOSITORY.test(fork))
      fail(`${label}.forwardTo must be source or fork:<owner/name>.`);
  }
  const forward = value.forward ?? MIRROR_DEFAULTS.forward;
  if (!FORWARD_MODES.includes(forward))
    fail(`${label}.forward must be off, nudge or auto.`);
  const branchPrefix = value.branchPrefix ?? MIRROR_DEFAULTS.branchPrefix;
  if (
    typeof branchPrefix !== "string" ||
    !BRANCH_PREFIX.test(branchPrefix) ||
    branchPrefix.includes("..") ||
    branchPrefix.includes("//")
  )
    fail(`${label}.branchPrefix must be a plain branch name prefix.`);
  const squash = value.squash ?? MIRROR_DEFAULTS.squash;
  if (typeof squash !== "boolean")
    fail(`${label}.squash must be true or false.`);
  const persons = value.trustedPersons ?? [];
  if (
    !Array.isArray(persons) ||
    persons.some((p) => typeof p !== "string" || !p.trim())
  )
    fail(`${label}.trustedPersons must be a list of logins.`);
  const seen = new Map();
  for (const login of persons)
    if (!seen.has(login.trim().toLowerCase()))
      seen.set(login.trim().toLowerCase(), login.trim());
  const trustedPersons = [...seen.values()];
  if (forward === "auto" && !trustedPersons.length)
    fail(
      `${label}.forward auto needs at least one person in ${label}.trustedPersons.`,
    );
  return {
    source,
    mirror,
    forwardTo,
    forward,
    branchPrefix,
    squash,
    trustedPersons,
  };
}

// Refuse a mirror that is not private. A visibility that cannot be read
// counts as not private (RC24.2, as RC10.1 does for the source).
export async function requireMirrorsPrivate(policy, github) {
  for (const entry of Object.values(policy?.repositories || {})) {
    if (!entry.mirror) continue;
    const id = entry.mirror.mirror;
    let remote = null;
    try {
      if (github?.available?.())
        remote = await github.repository(parseRepository(id));
    } catch {
      remote = null;
    }
    if (!remote)
      fail(
        `The mirror ${id} could not be read, so it counts as not private. Check the name and Avoozl's GitHub access.`,
        409,
      );
    if (remote.private !== true)
      fail(
        `The mirror ${id} is not private. A mirror must be a private repository.`,
        403,
      );
  }
}
