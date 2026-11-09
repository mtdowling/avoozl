import fs from "node:fs";
import path from "node:path";
import { readDocument } from "../catalog.mjs";
import { blocks, digest } from "../model.mjs";
import { taskSourceRefs } from "../task-identity.mjs";
export function reconcileSource(store, root, relative) {
  relative = relative.replaceAll("\\", "/");
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
      for (const task of data.tasks.filter(
        (t) =>
          taskSourceRefs(t).some((r) => r.document === relative) ||
          t.contextDocuments?.includes(relative),
      )) {
        task.needsReview = true;
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
    const byKey = new Map(blocks(document.text).map((b) => [b.key, b]));
    for (const task of data.tasks.filter(
      (t) =>
        taskSourceRefs(t).some((r) => r.document === relative) ||
        t.contextDocuments?.includes(relative),
    )) {
      task.needsReview = true;
      for (const ref of taskSourceRefs(task).filter(
        (r) =>
          r.document === relative &&
          !r.planId &&
          !(r === task.source && task.planId),
      )) {
        const block = byKey.get(ref.key);
        if (block)
          Object.assign(ref, {
            lineStart: block.lineStart,
            lineEnd: block.lineEnd,
            hash: digest(block.context),
            checked: block.checked,
            removed: false,
          });
        else ref.removed = true;
      }
    }
    // New source files and checkboxes are proposals. Approval, not indexing, creates tasks.
  });
  return { changed: true };
}
export function watchSources(store, root) {
  let timer;
  const dirty = new Set();
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
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}
