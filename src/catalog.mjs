import fs from "node:fs";
import path from "node:path";
import { digest, blocks } from "./model.mjs";
const SKIP = new Set([
  "evidence",
  "native-runtime",
  ".git",
  "node_modules",
  ".DS_Store",
]);
export function planFiles(root) {
  const files = [];
  function visit(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else if (e.isFile() && e.name.endsWith(".md"))
        files.push(path.relative(root, file).split(path.sep).join("/"));
    }
  }
  visit(root);
  return files.sort();
}
export function readDocument(root, relative) {
  relative = relative.replaceAll("\\", "/");
  const file = path.join(root, relative),
    text = fs.readFileSync(file, "utf8");
  const rawLinks = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^https?:|^#|^mailto:/.test(href))
    .map((href) =>
      path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), href.split("#")[0]),
      ),
    )
    .filter((href) => !href.startsWith(".."));
  return {
    rawLinks,
    id: relative,
    path: relative,
    title: text.match(/^# (.+)$/m)?.[1] || path.basename(relative, ".md"),
    text,
    hash: digest(text),
    modifiedAt: fs.statSync(file).mtime.toISOString(),
    historical:
      relative.startsWith("reports/") ||
      relative.startsWith("abandoned/") ||
      relative.startsWith("done/"),
    links: [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
      .map((m) => m[1])
      .filter((href) => !/^https?:|^#|^mailto:/.test(href))
      .map((href) =>
        path.posix.normalize(
          path.posix.join(path.posix.dirname(relative), href.split("#")[0]),
        ),
      )
      .filter((href) => !href.startsWith("..")),
  };
}
export function catalogTask(document, block) {
  const id = "plan-" + digest(document.id + "#" + block.key).slice(0, 18);
  return {
    id,
    title: block.title.replace(/\*\*/g, "").replace(/`/g, ""),
    summary:
      "Imported plan item. The source checkbox is historical context; task edits in this database are authoritative.",
    status: block.checked ? "recorded" : "planned",
    epic:
      document.id === "todo/nupp-native-runtime.md" && block.epic
        ? block.epic
        : "doc:" + document.id,
    track:
      document.id === "todo/nupp-native-runtime.md" && block.epic
        ? {
            W1: "frontend",
            W2: "storage",
            W3: "services",
            W4: "images",
            W5: "library",
            W6: "delivery",
            W7: "performance",
          }[block.epic]
        : "catalog",
    scope:
      document.id === "todo/nupp-native-runtime.md" && block.epic
        ? "runtime"
        : "catalog",
    kind: "task",
    tags: [document.historical ? "historical" : "plan-inventory"],
    source: {
      document: document.id,
      key: block.key,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      hash: digest(block.context),
      checked: block.checked,
    },
    statusAuthority: "database",
    needsReview: false,
    updatedAt: document.modifiedAt,
  };
}
export function syncPlans(
  data,
  root,
  { initial = false, changed = null } = {},
) {
  const files = planFiles(root),
    present = new Set(files),
    stats = { added: 0, changed: 0, removed: 0, newTasks: 0 };
  data.documents ??= {};
  data.tasks ??= [];
  for (const relative of files) {
    if (changed && !changed.has(relative)) continue;
    const previous = data.documents[relative],
      document = readDocument(root, relative);
    if (previous?.hash === document.hash && previous.rawLinks) continue;
    document.plan = previous?.plan;
    data.documents[relative] = document;
    stats[previous ? "changed" : "added"]++;
    const currentBlocks = blocks(document.text),
      byKey = new Map(currentBlocks.map((b) => [b.key, b]));
    const existing = data.tasks.filter((t) => t.source?.document === relative),
      claimed = new Set();
    for (const task of existing) {
      const b = byKey.get(task.source.key);
      if (!b) {
        if (!task.source.removed) {
          task.source.removed = true;
          task.needsReview = true;
        }
        continue;
      }
      claimed.add(b.key);
      const hash = digest(b.context);
      if (!initial && task.source.hash && task.source.hash !== hash)
        task.needsReview = true;
      task.source = {
        ...task.source,
        lineStart: b.lineStart,
        lineEnd: b.lineEnd,
        hash,
        checked: b.checked,
        removed: false,
      };
    }
    for (const block of currentBlocks) {
      if (claimed.has(block.key)) continue;
      const task = catalogTask(document, block);
      if (!initial) {
        task.status = "review";
        task.needsReview = true;
      }
      data.tasks.push(task);
      stats.newTasks++;
    }
  }
  for (const [id, doc] of Object.entries(data.documents)) {
    if (!present.has(id) && !doc.removed) {
      doc.removed = true;
      stats.removed++;
      for (const task of data.tasks.filter((t) => t.source?.document === id)) {
        task.source.removed = true;
        task.needsReview = true;
      }
    }
  }
  const known = new Set(Object.keys(data.documents));
  for (const doc of Object.values(data.documents)) {
    doc.links = [
      ...new Set((doc.rawLinks || doc.links).filter((id) => known.has(id))),
    ];
  }
  const main = data.documents["todo/nupp-native-runtime.md"];
  if (main) {
    const lines = main.text.split("\n");
    for (const epic of data.epics || []) {
      const start = lines.findIndex((l) =>
        l.startsWith("### " + epic.id + "."),
      );
      if (start < 0) continue;
      let end = start + 1;
      while (end < lines.length && !/^### W\d\.|^## /.test(lines[end])) end++;
      epic.context = { document: main.id, lineStart: start + 1, lineEnd: end };
    }
  }
  return stats;
}
