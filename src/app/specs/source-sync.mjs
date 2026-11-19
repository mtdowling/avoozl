import fs from "node:fs";
import path from "node:path";
import { readDocument } from "../../catalog.mjs";
import {
  blocks,
  digest,
  matchSection,
  planOwned,
  reviewSettled,
} from "../../model.mjs";
import { taskSourceRefs } from "../../task-identity.mjs";

import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
} from "../settings/layered-config.mjs";

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
      .list("repositories")
      .filter((repository) => repository.root)
      .map((repository) => ({
        filename: path.join(path.resolve(repository.root), ".avoozl.json"),
        repositoryId: repository.id,
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
