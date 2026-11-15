// The two homes of a spec in a mirror (RC25.2, design D30.2): `main`, the
// default branch, and `plansBranch`, the orphan branch of private specs.
// One reader reads both into one list. A spec name or task ID found in both
// homes is refused, naming both.
import { execFileSync } from "node:child_process";
import { originRepositorySync } from "./git.mjs";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import {
  CRITIQUE,
  MANIFEST,
  SPECS_DIRECTORY,
  specHash,
  parseSpec,
  specItems,
} from "./spec-plans.mjs";

export const HOMES = Object.freeze(["main", "plansBranch"]);
// Spec folders read at once: 4 folders x 6 files in flight.
const READ_BATCH = 4;
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
  // The spec folders are read in batches, each folder's files together, so a
  // large plans branch takes a few round trips instead of one per file.
  const folders = listing.filter(
      (entry) => entry.type === "dir" && NAME.test(entry.name),
    ),
    read = async (entry) => {
      const base = `.kiro/specs/${entry.name}`,
        names = [...FILES, CRITIQUE],
        texts = await Promise.all(
          names.map(async (file) => decode(await get(`${base}/${file}`))),
        ),
        files = {};
      FILES.forEach((file, index) => {
        if (texts[index] !== undefined) files[file] = texts[index];
      });
      return {
        name: entry.name,
        home: "plansBranch",
        repository: mirror.mirror,
        ref,
        folder: `${base}/`,
        exists: true,
        files,
        hash: specHash(files),
        critique: texts[FILES.length] ?? null,
      };
    },
    specs = [];
  for (let at = 0; at < folders.length; at += READ_BATCH)
    specs.push(
      ...(await Promise.all(folders.slice(at, at + READ_BATCH).map(read))),
    );
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

// A private plans checkout is another view of that home, not a public twin.
// Never infer privacy from the folder name alone: both remote and branch match.
export function locateLocalSpec(spec, mirror, policy) {
  if (!spec.exists || !spec.root || !mirror) return spec;
  if (
    originRepositorySync(spec.root)?.toLowerCase() !==
    mirror.mirror.toLowerCase()
  )
    return { ...spec, home: "main" };
  const git = (...args) =>
    execFileSync("git", ["-C", spec.root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  let branch;
  try {
    branch = git("branch", "--show-current");
  } catch {
    return {
      ...spec,
      home: "plansBranch",
      repository: mirror.mirror,
      ref: mirror.plansBranch,
      approvalBlocked: true,
    };
  }
  const privateSpec = {
    ...spec,
    home: "plansBranch",
    repository: mirror.mirror,
    ref: mirror.plansBranch,
  };
  if (branch === mirror.plansBranch) return privateSpec;
  const related = (ref) => {
    try {
      return Boolean(git("merge-base", "HEAD", ref));
    } catch {
      return false;
    }
  };
  if (
    [
      `refs/heads/${mirror.plansBranch}`,
      `refs/remotes/origin/${mirror.plansBranch}`,
    ].some(related)
  )
    return { ...privateSpec, approvalBlocked: true };
  const entry = Object.values(policy?.repositories || {}).find(
      (value) =>
        value.mirror?.mirror.toLowerCase() === mirror.mirror.toLowerCase(),
    ),
    publicRefs = entry?.baseBranch
      ? [
          `refs/heads/${entry.baseBranch}`,
          `refs/remotes/origin/${entry.baseBranch}`,
        ]
      : [];
  publicRefs.push("refs/remotes/origin/HEAD");
  if (publicRefs.some(related)) return { ...spec, home: "main" };
  // A review/detached branch without a proved public lineage cannot become
  // a route for publishing a private draft to the default code branch.
  return { ...privateSpec, approvalBlocked: true };
}

// The private task IDs a public spec's files name as a dependency. The
// approval commit would publish them, so approval refuses (RC25.9).
// shortcut: the cross edge cannot live in a public spec; record it on the
// private side or leave it out until a mirror-only file exists.
export function privateDependencies(spec, privateSpecs) {
  const privateIds = new Set(privateSpecs.flatMap(taskIds));
  if (!privateIds.size) return [];
  const { proposals } = parseSpec({
    name: spec.name,
    exists: true,
    files: spec.files ?? {},
  });
  return [
    ...new Set(
      proposals.flatMap((proposal) =>
        ["requires", "sequence", "supports"]
          .flatMap((kind) => proposal[kind] || [])
          .filter((id) => privateIds.has(id)),
      ),
    ),
  ];
}
