import fs from "node:fs";
import path from "node:path";
import { applicationRoot } from "./config.mjs";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

const packs = [
  {
    id: "product-launch",
    version: 1,
    title: "Launch a small product",
    description:
      "Two epics, eight example tasks, dependencies, design context, a draft proposal, and a walkthrough.",
  },
];
export function listExamples() {
  return { examples: packs };
}
export function seedExample(
  store,
  { example = "product-launch" } = {},
  expectedRevision,
) {
  const info = packs.find((p) => p.id === example);
  if (!info)
    fail("Unknown example pack. Use workspace.examples to list packs.");
  const pack = JSON.parse(
    fs.readFileSync(
      path.join(applicationRoot, "examples", example + ".json"),
      "utf8",
    ),
  );
  return store.transaction(() => {
    const receiptId = "example:" + example,
      previous = store.get("receipts", receiptId);
    if (previous) return { ...previous, existing: true };
    const data = structuredClone(store.read());
    if (expectedRevision !== undefined && data.revision !== expectedRevision)
      fail("Workspace changed. Reload before loading examples.", 409);
    for (const [key, idKey] of [
      ["tasks", "id"],
      ["epics", "id"],
      ["tracks", "id"],
    ]) {
      const current = new Set(data[key].map((v) => v[idKey]));
      for (const item of pack[key])
        if (current.has(item[idKey]))
          fail(
            "Example ID already exists: " +
              item[idKey] +
              ". Existing data was preserved.",
            409,
          );
      data[key].push(...pack[key]);
    }
    const now = new Date().toISOString();
    for (const task of data.tasks.filter((t) =>
      pack.tasks.some((p) => p.id === t.id),
    )) {
      task.createdAt = now;
      task.updatedAt = now;
      task.statusAuthority = "database";
      task.example = example;
    }
    for (const document of pack.documents) {
      if (data.documents[document.id])
        fail(
          "Example document already exists. Existing data was preserved.",
          409,
        );
      const text = document.text;
      data.documents[document.id] = {
        ...document,
        path: document.id,
        hash: digest(text),
        modifiedAt: now,
        managed: true,
        links: [],
        rawLinks: [],
      };
      store.db
        .prepare("INSERT INTO outbox(id,path,text) VALUES (?,?,?)")
        .run("example:" + document.id, document.id, text);
    }
    const draft = pack.draft;
    if (store.get("plans", draft.id))
      fail("Example draft already exists. Existing data was preserved.", 409);
    store.put("plans", {
      ...draft,
      hash: digest(draft.text),
      state: "draft",
      revision: 1,
      kind: "plan",
      context: {},
      createdAt: now,
      updatedAt: now,
      history: [],
    });
    data.edges.push(...pack.edges);
    data.presentation ??= {};
    data.presentation.views ??= [];
    data.presentation.tours ??= [];
    for (const [kind, items] of [
      ["views", pack.views],
      ["tours", pack.tours],
    ])
      for (const item of items) {
        if (data.presentation[kind].some((v) => v.id === item.id))
          fail(
            "Example presentation already exists. Existing data was preserved.",
            409,
          );
        data.presentation[kind].push({
          ...item,
          createdAt: now,
          updatedAt: now,
        });
      }
    store.commit(data, "Load example pack: " + info.title, expectedRevision);
    const receipt = {
      id: receiptId,
      example,
      version: info.version,
      at: now,
      taskIds: pack.tasks.map((t) => t.id),
      documentIds: pack.documents.map((d) => d.id),
      draftId: draft.id,
    };
    store.put("receipts", receipt);
    store.event(null, "workspace.seeded", receipt);
    return { ...receipt, existing: false };
  });
}
