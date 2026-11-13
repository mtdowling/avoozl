import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  createExtraction,
  factIdentity,
  getExtraction,
  submitExtraction,
} from "../design-extraction.mjs";
import { fixture } from "./fixtures.mjs";

const prose =
  "Build a durable import pipeline.\n\nThe import must preserve every source line.\n\nRun the compatibility suite before release.";

function facts() {
  const task = {
    kind: "task",
    text: "Build durable import pipeline",
    quote: "Build a durable import pipeline.",
    derivation: "stated",
    taskLocalId: "durable-import",
  };
  return [
    task,
    {
      kind: "acceptance",
      text: "Every source line is preserved",
      quote: "The import must preserve every source line.",
      derivation: "stated",
      relatesTo: "durable-import",
    },
    {
      kind: "validation",
      text: "Run compatibility suite before release",
      quote: "Run the compatibility suite before release.",
      derivation: "stated",
    },
    {
      kind: "risk",
      text: "The document does not state rollback behavior",
      derivation: "absent",
    },
  ];
}

// Extracted task facts carry no checks; a leaf takes its repository's.
function withChecks(store) {
  store.put("projects", {
    id: "app",
    root: "/tmp/app",
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
}

test("extracted facts are content addressed, anchored, durable, and reproducible", (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  return ops
    .execute("plan.create", {
      id: "prose-design",
      prompt: "Design a durable import.",
      text: prose,
    })
    .then((plan) => {
      const extraction = createExtraction(store, {
        planId: plan.id,
        revisionHash: plan.hash,
      });
      const submitted = submitExtraction(store, {
        extractionId: extraction.id,
        revisionHash: plan.hash,
        facts: facts(),
        provider: "fake",
        complete: true,
      });
      assert.equal(submitted.state, "completed");
      assert.equal(submitted.facts.length, 4);
      assert.equal(submitted.gaps.length, 1);
      assert.equal(submitted.facts[0].id.startsWith("fact-"), true);
      assert.equal(
        submitted.facts.find((fact) => fact.kind === "task").lineStart,
        1,
      );
      assert.equal(
        getExtraction(store, extraction.id).facts.find(
          (fact) => fact.kind === "task",
        ).status,
        "accepted",
      );
      assert.equal(
        factIdentity(facts()[0]),
        factIdentity({
          ...facts()[0],
          text: "  BUILD durable import pipeline!!! ",
        }),
      );
    });
});

test("fact submission refuses missing, ambiguous, and unsupported derivations", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      id: "anchor-design",
      prompt: "Anchor facts.",
      text: "Repeated passage.\n\nRepeated passage.",
    }),
    extraction = createExtraction(store, {
      planId: plan.id,
      revisionHash: plan.hash,
    });
  assert.throws(
    () =>
      submitExtraction(store, {
        extractionId: extraction.id,
        revisionHash: plan.hash,
        facts: [
          {
            kind: "task",
            text: "Use repeated passage",
            quote: "Repeated passage.",
            derivation: "stated",
          },
        ],
      }),
    /ambiguous/,
  );
  assert.throws(
    () =>
      submitExtraction(store, {
        extractionId: extraction.id,
        revisionHash: plan.hash,
        facts: [
          {
            kind: "task",
            text: "Infer work",
            quote: "Missing passage.",
            derivation: "inferred",
          },
        ],
      }),
    /reasoning/,
  );
  assert.throws(
    () =>
      submitExtraction(store, {
        extractionId: extraction.id,
        revisionHash: plan.hash,
        facts: [
          {
            kind: "risk",
            text: "No rollback",
            quote: "Repeated passage.",
            derivation: "absent",
          },
        ],
      }),
    /cannot cite/,
  );
});

test("a prose-only extraction previews and approves without writing a document", async (t) => {
  const { store } = fixture(t);
  withChecks(store);
  const ops = new Operations(store, { operator: "Maintainer" }),
    plan = await ops.execute("plan.create", {
      id: "approve-prose",
      prompt: "Approve prose.",
      text: prose,
    }),
    extraction = await ops.execute("plan.extract", {
      planId: plan.id,
      revisionHash: plan.hash,
    });
  await ops.execute("plan.extraction.submit", {
    extractionId: extraction.id,
    revisionHash: plan.hash,
    facts: facts(),
    complete: true,
  });
  const preview = await ops.execute("plan.preview", {
    id: plan.id,
    extractionId: extraction.id,
  });
  assert.equal(preview.quality.canApprove, true);
  assert.equal(preview.tasks.length, 1);
  assert.equal(preview.gaps.length, 1);
  const receipt = await ops.execute("plan.approve", {
    id: plan.id,
    extractionId: extraction.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(receipt.extractionId, extraction.id);
  assert.equal(receipt.taskIds.length, 1);
  const task = store
    .read()
    .tasks.find((item) => item.id === receipt.taskIds[0]);
  assert.equal(task.acceptance[0], "Every source line is preserved");
  assert.equal(task.approvedSource.factId.startsWith("fact-"), true);
  assert.equal(store.get("plans", plan.id).documentId, undefined);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM outbox").get().count,
    0,
  );
});

test("fact disposition persists and reuse creates no second task", async (t) => {
  const { store } = fixture(t);
  withChecks(store);
  const ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      id: "reuse-prose",
      prompt: "Reuse existing work.",
      text: prose,
    }),
    extraction = await ops.execute("plan.extract", {
      planId: plan.id,
      revisionHash: plan.hash,
    });
  const submitted = await ops.execute("plan.extraction.submit", {
    extractionId: extraction.id,
    revisionHash: plan.hash,
    facts: facts(),
    complete: true,
  });
  const taskFact = submitted.facts.find((fact) => fact.kind === "task");
  await ops.execute("plan.extraction.dispose", {
    extractionId: extraction.id,
    factId: taskFact.id,
    status: "reused",
    taskId: "sample-task",
  });
  const preview = await ops.execute("plan.preview", {
    id: plan.id,
    extractionId: extraction.id,
  });
  assert.equal(preview.tasks[0].taskId, "sample-task");
  await ops.execute("plan.approve", {
    id: plan.id,
    extractionId: extraction.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(store.read().tasks.length, 1);
  assert.equal(
    store
      .read()
      .tasks[0].sourceReferences.some(
        (reference) => reference.factId === taskFact.id,
      ),
    true,
  );
});

test("re-extraction preserves dispositions and marks removed facts withdrawn", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      id: "reextract-prose",
      prompt: "Re-extract changed prose.",
      text: prose,
    }),
    first = await ops.execute("plan.extract", {
      planId: plan.id,
      revisionHash: plan.hash,
    }),
    firstResult = await ops.execute("plan.extraction.submit", {
      extractionId: first.id,
      revisionHash: plan.hash,
      facts: facts(),
      complete: true,
    }),
    taskFact = firstResult.facts.find((fact) => fact.kind === "task");
  await ops.execute("plan.extraction.dispose", {
    extractionId: first.id,
    factId: taskFact.id,
    status: "rejected",
  });
  const changed = await ops.execute("plan.save", {
    id: plan.id,
    expectedHash: plan.hash,
    text: "Build a durable import pipeline.\n\nThe import must preserve every source line.",
  });
  const second = await ops.execute("plan.extract", {
    planId: changed.id,
    revisionHash: changed.hash,
  });
  const result = await ops.execute("plan.extraction.submit", {
    extractionId: second.id,
    revisionHash: changed.hash,
    facts: facts().slice(0, 2),
    complete: true,
  });
  assert.equal(
    result.facts.find((fact) => fact.id === taskFact.id).status,
    "rejected",
  );
  assert.equal(result.facts.filter((fact) => fact.withdrawn).length, 2);
  assert.equal(
    result.facts.find((fact) => fact.kind === "validation").withdrawn,
    true,
  );
});
