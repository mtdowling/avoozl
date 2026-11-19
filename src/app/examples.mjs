import fs from "node:fs";
import path from "node:path";
import { applicationRoot } from "./config.mjs";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";
import { sampleSpecs } from "./sample-specs.mjs";
import { SPECS_DIRECTORY } from "./spec-plans.mjs";

// The pack `seed` installs when none is named.
const DEFAULT_EXAMPLE = "recipe-box";
const packs = [
  {
    id: "recipe-box",
    version: 1,
    title: "Recipe Box",
    description:
      "Four draft Kiro spec folders in .kiro/specs/: the Recipe Box epic and its three specs (recipe import, meal planner, shopping list), ten tasks in all. Nothing is approved, so the graph gets no task until you approve a spec.",
  },
  {
    id: "product-launch",
    version: 1,
    title: "Launch a small product",
    description:
      "The older data model, kept for callers that name it: eight tasks written straight into the graph, their dependencies, one Markdown document under the documents root, a text draft, and a saved view. No spec folder and no epic.",
  },
];
export function listExamples() {
  return { default: DEFAULT_EXAMPLE, examples: packs };
}

// Install the Recipe Box specs as draft spec folders. `specRoot` gives the
// folder that holds `.kiro/specs`, and `createDraft` stores one folder as a
// draft plan, as `plan.create` does. A failure removes the folders this call
// wrote and rolls back its rows; a retry after success changes nothing, so
// edits to the folders and the drafts stay.
function seedSpecFolders(
  store,
  info,
  expectedRevision,
  { specRoot, createDraft } = {},
) {
  const receiptId = "example:" + info.id,
    previous = store.get("receipts", receiptId);
  if (previous) return { ...previous, existing: true };
  if (
    expectedRevision !== undefined &&
    store.read().revision !== expectedRevision
  )
    fail("Workspace changed. Reload before loading examples.", 409);
  if (!specRoot || !createDraft)
    fail("This example installs spec folders and needs a workspace root.", 409);
  const root = specRoot(),
    { files, members } = sampleSpecs({ word: "example" }),
    // Members first: the epic folder names them.
    specs = [...members, "recipe-box"],
    directory = (name) => path.join(root, SPECS_DIRECTORY, name),
    taken = (name) =>
      fail(
        `Example spec ${name} already exists. Existing data was preserved.`,
        409,
      );
  for (const name of specs)
    if (fs.existsSync(directory(name)) || store.get("plans", name)) taken(name);
  const written = [];
  try {
    fs.mkdirSync(path.join(root, SPECS_DIRECTORY), { recursive: true });
    for (const name of specs) {
      try {
        // Not recursive: a folder that appeared since the check is refused.
        fs.mkdirSync(directory(name));
      } catch (error) {
        if (error.code === "EEXIST") taken(name);
        throw error;
      }
      written.push(directory(name));
      for (const [file, text] of Object.entries(files[name])) {
        const target = path.join(directory(name), file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text, { flag: "wx" });
      }
    }
    return store.transaction(() => {
      const plans = specs.map((name) => createDraft(name));
      if (plans.some((plan) => plan.state !== "draft"))
        fail("An example spec was not stored as a draft.", 409);
      const receipt = {
        id: receiptId,
        example: info.id,
        version: info.version,
        at: new Date().toISOString(),
        specs,
        planIds: plans.map((plan) => plan.id),
      };
      store.put("receipts", receipt);
      store.event(null, "workspace.seeded", receipt);
      return { ...receipt, existing: false };
    });
  } catch (error) {
    for (const folder of written)
      fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

export function seedExample(
  store,
  { example = DEFAULT_EXAMPLE } = {},
  expectedRevision,
  specFolders,
) {
  const info = packs.find((p) => p.id === example);
  if (!info)
    fail("Unknown example pack. Use workspace.examples to list packs.");
  if (example === "recipe-box")
    return seedSpecFolders(store, info, expectedRevision, specFolders);
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
