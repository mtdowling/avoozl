// A large synthetic workspace for performance work: spec folders on disk,
// their approved plans in SQLite, and the delivery, decision, conflict, flow
// and intake rows a busy workspace accumulates. Every value is made up and
// seeded, so two runs build the same workspace.
//
//   node src/app/test/large-workspace.mjs DIR [--specs 60]
//
// builds one in DIR (which must not exist yet) and prints its counts. Tests
// import largeWorkspace() and pick a smaller size.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store.mjs";
import { Operations } from "../operations.mjs";

// Small, fast, seeded: the same seed gives the same workspace.
function random(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function emptySnapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    project: { name: "Synthetic", title: "Synthetic workspace" },
    statuses: [
      { id: "planned", label: "Planned", complete: false },
      { id: "implemented", label: "Implemented", complete: false },
      { id: "accepted", label: "Accepted", complete: true },
      { id: "review", label: "Review", complete: false },
      { id: "running", label: "Running", complete: false },
      { id: "blocked", label: "Blocked", complete: false },
      { id: "deferred", label: "Deferred", complete: false },
    ],
    epics: [],
    tracks: [{ id: "catalog", label: "Plans" }],
    tasks: [],
    edges: [],
    documents: {},
    changelog: [],
  };
}

const specNameOf = (i) => `synthetic-${String(i + 1).padStart(2, "0")}`;

// One spec folder: `groups` epics, each over `leaves` leaves. Each leaf
// after the first in a group requires the one before it, and some require a
// leaf from an earlier group.
function specFiles(name, { groups, leaves, extraPerLeaf, next }) {
  const lines = ["# Tasks", ""],
    manifest = {};
  for (let g = 1; g <= groups; g++) {
    const epic = String(g),
      members = [];
    lines.push(`- [ ] ${epic} Deliver area ${g} of ${name}`);
    for (let l = 1; l <= leaves; l++) {
      const key = `${g}.${l}`,
        requires = l > 1 ? [`${g}.${l - 1}`] : [];
      for (let e = 0; e < extraPerLeaf && g > 1; e++)
        if (next() < 0.75) {
          const other = `${1 + Math.floor(next() * (g - 1))}.${1 + Math.floor(next() * leaves)}`;
          if (!requires.includes(other)) requires.push(other);
        }
      members.push(key);
      lines.push(`  - [ ] ${key} Build part ${l} of area ${g} in ${name}`);
      manifest[key] = {
        kind: "leaf",
        repository: "app",
        summary: `Synthetic leaf ${key} of ${name}.`,
        acceptance: [`Part ${l} of area ${g} works.`],
        checks: ["npm test"],
        completion: "integrated",
        ...(requires.length ? { requires } : {}),
      };
    }
    manifest[epic] = {
      kind: "package",
      summary: `Area ${g} of ${name}.`,
      requires: members,
      acceptance: [`Area ${g} of ${name} is delivered.`],
    };
  }
  lines.push("");
  return {
    "requirements.md": `# ${name}\n\nSynthetic requirements for a performance fixture.\n`,
    "design.md": `# Design\n\nSynthetic design for ${name}.\n`,
    "tasks.md": lines.join("\n"),
    "avoozl/manifest.json": JSON.stringify({ tasks: manifest }, null, 2) + "\n",
  };
}

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

// Build the workspace in `root`. Returns the open store, an Operations over
// it, and what was made. Defaults are the large size: about 60 specs, 5,000
// tasks and 15,000 edges.
export async function largeWorkspace(
  root,
  {
    specs = 60,
    groups = 6,
    leaves = 13,
    extraPerLeaf = 2,
    crossSpecEdges = 300,
    seed = 7,
  } = {},
) {
  const next = random(seed);
  fs.mkdirSync(root, { recursive: true });
  // The one code repository leaves name.
  const checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Synthetic");
  git(checkout, "config", "user.email", "synthetic@example.test");
  fs.writeFileSync(path.join(checkout, "README.md"), "synthetic\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Start");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { runner: "tick", concurrency: 4 },
    }),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  store.importSnapshot(emptySnapshot());
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
  });
  const ops = new Operations(store, { workspaceRoot: root, operator: "Owner" });

  // Spec folders, each stored and approved the way the Plans page does it.
  const names = [];
  for (let i = 0; i < specs; i++) {
    const name = specNameOf(i),
      directory = path.join(root, ".kiro", "specs", name);
    fs.mkdirSync(path.join(directory, "avoozl"), { recursive: true });
    for (const [file, text] of Object.entries(
      specFiles(name, { groups, leaves, extraPerLeaf, next }),
    ))
      fs.writeFileSync(path.join(directory, file), text);
    const plan = await ops.execute("plan.create", { spec: name });
    await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
    names.push(name);
  }

  // Statuses, epics, decisions, conflicts and links across specs.
  const epics = Array.from(
    { length: Math.max(1, Math.ceil(specs / 5)) },
    (_, i) => ({
      id: `area-${i + 1}`,
      title: `Area ${i + 1}`,
      scope: "catalog",
    }),
  );
  const picked = { running: [], review: [], decisions: 0, conflicts: 0 };
  store.mutate("Synthetic state", (data) => {
    const index = new Map(names.map((name, i) => [name, i]));
    for (const task of data.tasks) {
      const spec = index.get(task.planId) ?? 0,
        roll = next();
      // Each task's phase stands for its area (Requirement 59.5).
      const area = epics[Math.floor(spec / 5)];
      task.phase = { id: area.id, title: area.title };
      // Earlier specs are further along.
      const done = spec / specs < 0.4;
      if (task.kind === "leaf") {
        if (done) task.status = "accepted";
        else if (roll < 0.04) task.status = "running";
        else if (roll < 0.07) task.status = "review";
        else if (roll < 0.09) task.status = "blocked";
        else if (roll < 0.11) task.status = "deferred";
        else if (roll < 0.2) task.status = "implemented";
        if (task.status === "running") picked.running.push(task.id);
        if (task.status === "review") picked.review.push(task.id);
      } else if (done) task.status = "accepted";
      if (!done && next() < 0.02) {
        task.decision = `Synthetic decision for ${task.id}.`;
        picked.decisions++;
      }
      if (!done && next() < 0.01) {
        task.projectionConflicts = [
          {
            field: "title",
            reason: "The issue title was changed on GitHub.",
            expected: task.title,
            actual: task.title + " (edited)",
            desired: task.title,
            changedBy: "synthetic-user",
            changedAt: new Date(0).toISOString(),
          },
        ];
        picked.conflicts++;
      }
      if (!done && next() < 0.02) task.needsReview = true;
    }
    // Links from an earlier spec's leaf to a later spec's leaf, so the
    // graph stays acyclic.
    const leavesBySpec = names.map((name) =>
        data.tasks.filter((t) => t.planId === name && t.kind === "leaf"),
      ),
      seen = new Set(data.edges.map((e) => e.id));
    let added = 0;
    for (
      let tries = 0;
      added < crossSpecEdges && tries < crossSpecEdges * 4;
      tries++
    ) {
      if (specs < 2) break;
      const a = Math.floor(next() * (specs - 1)),
        b = a + 1 + Math.floor(next() * (specs - a - 1)),
        from = leavesBySpec[a][Math.floor(next() * leavesBySpec[a].length)],
        to = leavesBySpec[b][Math.floor(next() * leavesBySpec[b].length)],
        id = `${from.id}:requires:${to.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      data.edges.push({
        id,
        from: from.id,
        to: to.id,
        kind: "requires",
        reason: "Synthetic link.",
      });
      added++;
    }
  });

  // Delivery rows: a live session per running leaf, a delivery and evidence
  // per running or review leaf, flow spans, and incoming items. Sessions are
  // bound now, after their plans were approved, as a real tick binds them.
  const at = new Date().toISOString();
  store.transaction(() => {
    picked.running.forEach((taskId, i) =>
      store.put("session_bindings", {
        id: `synthetic-slot-${i}`,
        slot: `synthetic-slot-${i}`,
        taskId,
        role: "worker",
        attempt: 1,
        status: "running",
        statusAt: at,
        boundAt: at,
        source: "tick",
      }),
    );
    picked.running.forEach((taskId) =>
      store.put("task_deliveries", {
        id: taskId,
        taskId,
        state: "running",
        attempts: [],
        updatedAt: at,
      }),
    );
    [...picked.running, ...picked.review].forEach((taskId, i) => {
      store.put("evidence", {
        id: `synthetic-evidence-${i}`,
        taskId,
        kind: "checks",
        argv: ["npm", "test"],
        exitCode: 0,
        startedAt: at,
      });
    });
    for (let i = 0; i < 300; i++)
      store.put("incoming_items", {
        id: `synthetic\0item-${i}`,
        source: "synthetic",
        itemId: `item-${i}`,
        firstSeenAt: at,
        record: {
          source: "synthetic",
          id: `item-${i}`,
          kind: "ticket",
          state: i % 5 ? "open" : "closed",
          title: `Synthetic item ${i}`,
          body: "Synthetic body.",
          labels: [],
          assignees: [],
          updatedAt: new Date(i * 60000).toISOString(),
          link: null,
        },
        route: { state: "untriaged", at },
        taskId: null,
        history: [],
      });
  });
  const spans = store.db.prepare(
    "INSERT INTO flow_spans(id,task_id,attempt,batch_id,role,stage,started_at,ended_at,source,detail) VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  store.transaction(() => {
    const data = store.read();
    let n = 0;
    for (const task of data.tasks)
      if (task.kind === "leaf" && task.status === "accepted" && n < 2000) {
        const start = Date.parse("2026-01-01T00:00:00Z") + n * 3600000;
        for (const [stage, offset, length] of [
          ["queued", 0, 600000],
          ["work", 600000, 1800000],
          ["verify", 2400000, 600000],
        ])
          spans.run(
            `${task.id}:${stage}`,
            task.id,
            1,
            null,
            "worker",
            stage,
            new Date(start + offset).toISOString(),
            new Date(start + offset + length).toISOString(),
            "synthetic",
            null,
          );
        n++;
      }
  });
  const data = store.read();
  return {
    root,
    store,
    ops,
    specs: names,
    epics: epics.map((e) => e.id),
    counts: {
      specs: names.length,
      tasks: data.tasks.length,
      edges: data.edges.length,
      decisions: picked.decisions,
      conflicts: picked.conflicts,
      running: picked.running.length,
      review: picked.review.length,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, flag, value] = process.argv.slice(2);
  if (!dir) {
    console.error(
      "Usage: node src/app/test/large-workspace.mjs DIR [--specs N]",
    );
    process.exit(2);
  }
  if (fs.existsSync(dir)) {
    console.error(`${dir} exists; name a new folder.`);
    process.exit(2);
  }
  const options = flag === "--specs" ? { specs: Number(value) } : {},
    built = await largeWorkspace(path.resolve(dir), options);
  built.store.close();
  console.log(JSON.stringify(built.counts));
}
