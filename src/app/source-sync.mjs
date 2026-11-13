import fs from "node:fs";
import path from "node:path";
import { readDocument } from "../catalog.mjs";
import {
  blocks,
  digest,
  matchSection,
  planOwned,
  reviewSettled,
} from "../model.mjs";
import { taskSourceRefs } from "../task-identity.mjs";
import { synchronizeAgentInstructions } from "./agent-instructions.mjs";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
} from "./layered-config.mjs";

function policyFilename(rootOrFilename) {
  const selected = path.resolve(rootOrFilename);
  return selected.endsWith(".json")
    ? selected
    : path.join(selected, ".avoozl.json");
}

function readPolicy(filename, repositoryId = null) {
  if (!fs.existsSync(filename)) return null;
  if (
    fs.lstatSync(filename).isSymbolicLink() ||
    !fs.statSync(filename).isFile()
  )
    throw Error(`Avoozl policy must be a regular file: ${filename}`);
  const text = fs.readFileSync(filename, "utf8");
  if (Buffer.byteLength(text) > 512 * 1024)
    throw Error(`Avoozl policy is too large: ${filename}`);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw Error(`Could not parse ${filename}: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`Avoozl policy must contain a JSON object: ${filename}`);
  if (value.version !== 1)
    throw Error(`Unsupported Avoozl policy version: ${filename}`);
  assertSafeConfig(value, `Avoozl policy at ${filename}`);
  assertPortableRepositoryConfig(value, `Avoozl policy at ${filename}`);
  return {
    path: filename,
    repositoryId,
    value,
    text,
    revision: null,
    hash: digest(text),
  };
}

export function configuredRepositoryInstructionSources(
  store,
  { exclude = [] } = {},
) {
  const excluded = new Set(exclude.map((filename) => path.resolve(filename))),
    candidates = store
      .list("projects")
      .filter((project) => project.root)
      .map((project) => ({
        filename: path.join(path.resolve(project.root), ".avoozl.json"),
        repositoryId: project.id,
        primary: false,
      })),
    seen = new Set(),
    sources = [];
  for (const candidate of candidates) {
    const key = path.resolve(candidate.filename);
    if (seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    const source = readPolicy(key, candidate.repositoryId);
    if (source) sources.push({ ...source, primary: candidate.primary });
  }
  return sources;
}

function instructionSources(store, primary) {
  const filename = policyFilename(primary),
    source = readPolicy(filename);
  return [
    ...(source ? [{ ...source, primary: true }] : []),
    ...configuredRepositoryInstructionSources(store, {
      exclude: [filename],
    }),
  ];
}

export function reconcileAgentInstructions(store, rootOrFilename) {
  const sources = instructionSources(store, rootOrFilename),
    sourceRecords = sources.map(({ path, repositoryId, hash, revision }) => ({
      path,
      repositoryId,
      hash,
      revision,
    })),
    hash = digest(JSON.stringify(sourceRecords)),
    current = store.read().agentInstructionSource,
    snapshot = store.getMeta("agentInstructionSourceSnapshot");
  if (current?.hash === hash && snapshot?.hash === hash)
    return { changed: false };
  if (
    !sources.length &&
    !current &&
    !(store.read().agentInstructions || []).length
  )
    return { changed: false };
  store.mutate("Synchronize Avoozl policy from .avoozl.json", (data) => {
    synchronizeAgentInstructions(data, null, {
      sources: sources.map((source) => ({
        value: source.value,
        path: source.path,
        repositoryId: source.repositoryId,
        revision: source.revision,
      })),
    });
    for (const name of Object.keys(data.documents))
      if (path.basename(name).toLowerCase() === "agents.md")
        delete data.documents[name];
    data.agentInstructionSource.hash = hash;
  });
  const primary = sources.find((source) => source.primary) || sources[0];
  store.setMeta("agentInstructionSourceSnapshot", {
    path: primary?.path || policyFilename(rootOrFilename),
    hash,
    revision: primary?.revision || null,
    text: primary?.text || "",
    sources: sources.map(
      ({ path, repositoryId, hash, revision, text, value }) => ({
        path,
        repositoryId,
        hash,
        revision,
        text,
        value,
      }),
    ),
  });
  return {
    changed: true,
    instructions: store.read().agentInstructions?.length || 0,
    removed: !sources.length,
    sources: sources.length,
  };
}

export function reconcileSource(store, root, relative) {
  relative = relative.replaceAll("\\", "/");
  if (path.basename(relative).toLowerCase() === "agents.md") {
    if (!store.read().documents[relative]) return { changed: false };
    store.mutate(
      "Stop indexing repository instructions " + relative,
      (data) => {
        delete data.documents[relative];
      },
    );
    return { changed: true, ignored: true };
  }
  if (
    relative
      .split("/")
      .some((p) =>
        ["native-runtime", "evidence", ".git", "node_modules"].includes(p),
      ) ||
    !relative.endsWith(".md") ||
    path.isAbsolute(relative) ||
    relative.startsWith("..")
  )
    return { changed: false };
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep))
    return { changed: false };
  const previous = store.read().documents[relative];
  if (!fs.existsSync(full)) {
    if (!previous || previous.removed) return { changed: false };
    store.mutate("Review removed source " + relative, (data) => {
      data.documents[relative].removed = true;
      // A task's own section is gone; a document it only cites is not its text.
      for (const task of data.tasks.filter((t) =>
        taskSourceRefs(t).some((r) => r.document === relative),
      )) {
        if (!reviewSettled(data, task)) task.needsReview = true;
        for (const ref of taskSourceRefs(task).filter(
          (r) => r.document === relative,
        ))
          ref.removed = true;
      }
    });
    return { changed: true, removed: true };
  }
  if (fs.lstatSync(full).isSymbolicLink() || !fs.statSync(full).isFile())
    return { changed: false };
  const document = readDocument(root, relative);
  if (previous?.hash === document.hash) return { changed: false };
  store.mutate("Reconcile source " + relative, (data) => {
    document.plan = previous?.plan;
    document.managed = previous?.managed;
    document.lifecycle = previous?.lifecycle || "draft";
    data.documents[relative] = document;
    const after = blocks(document.text),
      before =
        typeof previous?.text === "string" ? blocks(previous.text) : null;
    // Only a task whose own section changed needs review: an edit elsewhere
    // in the document, or to a document it only cites, leaves it alone.
    for (const task of data.tasks.filter((t) =>
      taskSourceRefs(t).some((r) => r.document === relative),
    )) {
      let changed = false;
      for (const ref of taskSourceRefs(task).filter(
        (r) => r.document === relative,
      )) {
        // A plan's own references move with its approval, not with indexing.
        if (planOwned(task, ref)) continue;
        const match = matchSection(ref, before, after);
        changed ||= match.changed;
        if (match.block)
          Object.assign(ref, {
            key: match.block.key,
            lineStart: match.block.lineStart,
            lineEnd: match.block.lineEnd,
            hash: digest(match.block.context),
            checked: match.block.checked,
            removed: false,
          });
        else ref.removed = true;
      }
      if (changed && !reviewSettled(data, task)) task.needsReview = true;
    }
    // New source files and checkboxes are proposals. Approval, not indexing, creates tasks.
  });
  return { changed: true };
}
export function watchSources(store, root, { policyFile } = {}) {
  let timer;
  const dirty = new Set();
  const selectedPolicy = policyFile || path.join(root, ".avoozl.json");
  try {
    reconcileAgentInstructions(store, selectedPolicy);
  } catch (error) {
    store.event(null, "source.error", {
      path: ".avoozl.json",
      message: error.message,
    });
  }
  const watcher = fs.watch(root, { recursive: true }, (_kind, name) => {
    if (!name) return;
    const file = String(name).replaceAll("\\", "/");
    if (
      !file.endsWith(".md") ||
      file
        .split("/")
        .some((p) =>
          ["native-runtime", "evidence", ".git", "node_modules"].includes(p),
        )
    )
      return;
    dirty.add(file);
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const file of dirty) {
        try {
          reconcileSource(store, root, file);
        } catch (error) {
          store.event(null, "source.error", {
            path: file,
            message: error.message,
          });
        }
      }
      dirty.clear();
    }, 350);
  });
  let policySignature = "";
  const checkPolicies = () => {
    const candidates = [
        policyFilename(selectedPolicy),
        ...store
          .list("projects")
          .filter((project) => project.root)
          .map((project) =>
            path.join(path.resolve(project.root), ".avoozl.json"),
          ),
      ],
      signature = candidates
        .map((filename) => {
          try {
            const stat = fs.statSync(filename);
            return `${filename}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
          } catch {
            return filename + ":missing";
          }
        })
        .join("\n");
    if (signature === policySignature) return;
    policySignature = signature;
    try {
      reconcileAgentInstructions(store, selectedPolicy);
    } catch (error) {
      store.event(null, "source.error", {
        path: ".avoozl.json",
        message: error.message,
      });
    }
  };
  checkPolicies();
  const policyTimer = setInterval(checkPolicies, 2000);
  policyTimer.unref?.();
  return () => {
    clearTimeout(timer);
    clearInterval(policyTimer);
    watcher.close();
  };
}
