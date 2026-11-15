// The two homes of a spec in a mirror (RC25.2, design D30.2): `main`, the
// default branch, and `plansBranch`, the orphan branch of private specs.
// One reader reads both into one list. A spec name or task ID found in both
// homes is refused, naming both.
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import {
  CRITIQUE,
  MANIFEST,
  SPECS_DIRECTORY,
  specHash,
  specItems,
} from "./spec-plans.mjs";

export const HOMES = Object.freeze(["main", "plansBranch"]);
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const FILES = [
  "requirements.md",
  "bugfix.md",
  "design.md",
  "tasks.md",
  MANIFEST,
];
const decode = (entry) =>
  entry && typeof entry.content === "string"
    ? Buffer.from(entry.content, entry.encoding || "base64").toString("utf8")
    : undefined;

// The first mirror a repository entry names, or null.
export function mirrorOf(policy) {
  for (const entry of Object.values(policy?.repositories || {}))
    if (entry.mirror) return entry.mirror;
  return null;
}

// Where a new spec starts: private when a mirror is set (RC25.2).
export const newSpecHome = (policy) =>
  mirrorOf(policy) ? "plansBranch" : "main";

// Every spec folder on the plans branch, read through the contents API as
// the same shape readSpecFolder gives. A missing branch or folder reads as
// none; any other failure throws, so a tick never mistakes it for "no specs".
// shortcut: up to six contents reads per spec on every tick; cache by branch
// head when a mirror holds many private specs.
export async function readPrivateSpecs(github, mirror) {
  const repository = parseRepository(mirror.mirror),
    ref = mirror.plansBranch,
    get = async (file) => {
      try {
        return await github.contents(repository, file, ref);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    listing = await get(SPECS_DIRECTORY.split("\\").join("/"));
  if (!Array.isArray(listing)) return [];
  const specs = [];
  for (const entry of listing) {
    if (entry.type !== "dir" || !NAME.test(entry.name)) continue;
    const base = `.kiro/specs/${entry.name}`,
      files = {};
    for (const file of FILES) {
      const text = decode(await get(`${base}/${file}`));
      if (text !== undefined) files[file] = text;
    }
    specs.push({
      name: entry.name,
      folder: `${base}/`,
      exists: true,
      files,
      hash: specHash(files),
      critique: decode(await get(`${base}/${CRITIQUE}`)) ?? null,
    });
  }
  return specs.sort((a, b) => a.name.localeCompare(b.name));
}

const taskIds = (spec) =>
  spec.files["tasks.md"] === undefined
    ? []
    : specItems(spec.name, spec.files["tasks.md"])
        .map((item) => item.id)
        .filter(Boolean);

// One list from both homes. Each entry is `{home, spec}`. A name or task ID in
// both homes leaves both specs out and adds one error naming both homes.
export function mergeHomes(publicSpecs, privateSpecs) {
  const errors = [],
    refused = new Set(),
    publicIds = new Map();
  for (const spec of publicSpecs)
    for (const id of taskIds(spec)) publicIds.set(id, spec.name);
  for (const spec of privateSpecs) {
    const twin = publicSpecs.find((other) => other.name === spec.name);
    if (twin) {
      errors.push(
        `Spec ${spec.name} exists in both homes: the default branch (main) and the plans branch (plansBranch). Rename one.`,
      );
      refused.add(twin).add(spec);
      continue;
    }
    for (const id of taskIds(spec))
      if (publicIds.has(id)) {
        errors.push(
          `Task ${id} is in spec ${publicIds.get(id)} on main and in spec ${spec.name} on plansBranch. Task IDs must be unique across both homes.`,
        );
        refused
          .add(publicSpecs.find((other) => other.name === publicIds.get(id)))
          .add(spec);
        break;
      }
  }
  const tag = (home) => (spec) => ({ home, spec });
  return {
    specs: [
      ...publicSpecs.filter((spec) => !refused.has(spec)).map(tag("main")),
      ...privateSpecs
        .filter((spec) => !refused.has(spec))
        .map(tag("plansBranch")),
    ],
    errors,
  };
}

export function requireHome(home) {
  if (!HOMES.includes(home)) fail("A spec home is main or plansBranch.");
  return home;
}
