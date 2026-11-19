// The two homes of a spec in a mirror (RC25.2, design D30.2): `main`, the
// default branch, and `plansBranch`, the orphan branch of private specs.
// One reader reads both into one list. A spec name or task ID found in both
// homes is refused, naming both.
import { execFileSync } from "node:child_process";
import { originRepositorySync } from "./git.mjs";

import { repoFilesOf } from "./repo-files.mjs";
import { hasFactsBlocks } from "./spec-legacy.mjs";
import {
  CRITIQUE,
  MANIFEST,
  SPECS_DIRECTORY,
  specHash,
  parseSpec,
  specItems,
} from "./spec-plans.mjs";

const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const FILES = [
  "requirements.md",
  "bugfix.md",
  "design.md",
  "tasks.md",
  MANIFEST,
];

// The first mirror a repository entry names, or null.
export function mirrorOf(policy) {
  for (const entry of Object.values(policy?.repositories || {}))
    if (entry.mirror) return entry.mirror;
  return null;
}

// Every spec folder on the plans branch, in the shape readSpecFolder gives.
// The files come from `files` (a RepoFiles: a git cache, or one tree listing
// and batched GraphQL reads), at `head` when the caller knows it. A missing
// branch or folder reads as none; any other failure throws, so a tick never
// mistakes it for "no specs".
export async function readPrivateSpecs(source, mirror, head = null) {
  const files = repoFilesOf(source),
    ref = mirror.plansBranch,
    names = [...FILES, CRITIQUE],
    specsRoot = `${SPECS_DIRECTORY.split("\\").join("/")}/`,
    { files: found } = await files.readAt(mirror.mirror, head || ref, {
      prefix: specsRoot,
      want: (file) => {
        const [name, ...rest] = file.slice(specsRoot.length).split("/");
        return NAME.test(name) && names.includes(rest.join("/"));
      },
    }),
    folders = new Map();
  for (const [file, text] of found) {
    const [name, ...rest] = file.slice(specsRoot.length).split("/");
    if (!folders.has(name)) folders.set(name, new Map());
    folders.get(name).set(rest.join("/"), text);
  }
  return [...folders]
    .map(([name, texts]) => {
      const base = `${specsRoot}${name}`,
        read = {};
      for (const file of FILES)
        if (file !== MANIFEST && texts.has(file)) read[file] = texts.get(file);
      return {
        // Not read and not hashed: lint says to delete it.
        ...(texts.has(MANIFEST) ? { leftover: true } : {}),
        ...(hasFactsBlocks(read["tasks.md"]) ? { factsBlocks: true } : {}),
        name,
        home: "plansBranch",
        repository: mirror.mirror,
        ref,
        folder: `${base}/`,
        exists: true,
        files: read,
        hash: specHash(read),
        critique: texts.get(CRITIQUE) ?? null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
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
