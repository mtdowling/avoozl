import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { digest } from "../model.mjs";
import { parseRepository } from "./github.mjs";
import { syncGitHubIssues } from "./github-sync.mjs";
import { canonical, fail } from "./store.mjs";

const TOKEN_PREFIX = "avoozl_intake_";
const DEFAULT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_GENERATION_ITEMS = 4000;
const SCHEMA_VERSION = "avoozl.github-intake.v2";
const CALLBACK_PATH = "/api/github-intake";

function tokenHash(value) {
  return createHash("sha256").update(value).digest();
}

function json(row) {
  return row ? JSON.parse(row.body) : null;
}

function capabilityRecord(row) {
  return row ? { ...json(row), revokedAt: row.revoked_at || null } : null;
}

function requiredText(value, label, maximum = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    fail(
      `${label} is required and must contain at most ${maximum} characters.`,
    );
  return value;
}

function optionalText(value, label, maximum = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maximum)
    fail(`${label} must contain at most ${maximum} characters.`);
  return value;
}

function stringList(value, label) {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (entry) =>
        typeof entry !== "string" || !entry.trim() || entry.length > 200,
    )
  )
    fail(`${label} must be a list of at most 100 non-empty strings.`);
  return value;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be a JSON object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length)
    fail(`Unsupported ${label} fields: ${unexpected.join(", ")}.`);
  return value;
}

function configuredRepository(store, id) {
  const issueIntake = store.get("github_repositories", id),
    queue = store.get("github_queue_repositories", id);
  if (!issueIntake && !queue)
    fail("Configure this monitored repository before minting GitHub intake.");
  if (queue && !queue.enabled)
    fail("GitHub intake requires an enabled monitored repository.");
  if (issueIntake && queue?.visibility === "public")
    fail("Public repositories cannot authorize issue execution.", 403);
  return { issueIntake, queue, remote: issueIntake || queue };
}

function intakeMode(configured) {
  return configured.issueIntake ? "authorization" : "observation-only";
}

async function requireCapabilityRepository(github, configured, capability) {
  const remote = await github.repository(parseRepository(configured.remote.id)),
    actualVisibility = remote.private === true ? "private" : "public",
    expectedVisibility =
      capability.repositoryVisibility ||
      (capability.repositoryPrivate === false ? "public" : "private");
  if (actualVisibility !== expectedVisibility)
    fail(
      `The monitored GitHub repository must remain ${expectedVisibility}.`,
      409,
    );
  if (
    remote.node_id !== capability.repositoryNodeId ||
    (configured.remote.nodeId && remote.node_id !== configured.remote.nodeId)
  )
    fail("GitHub intake repository identity changed.", 409);
  return remote;
}

function suggestedSecretName(repository) {
  return `AVOOZL_GITHUB_INTAKE_${digest(repository)
    .slice(0, 12)
    .toUpperCase()}`;
}

function validateRepository(value, capability) {
  const repository = exactKeys(
      value,
      new Set(["id", "nodeId", "private", "mode"]),
      "GitHub intake repository",
    ),
    parsed = parseRepository(repository.id);
  if (parsed.id !== capability.repository)
    fail("GitHub intake capability is bound to another repository.", 403);
  const expectedPrivate = capability.repositoryPrivate !== false,
    expectedMode = capability.mode || "authorization",
    submittedMode =
      repository.mode ||
      (repository.private === true && expectedMode === "authorization"
        ? "authorization"
        : null);
  if (repository.private !== expectedPrivate)
    fail("GitHub intake repository visibility changed.", 409);
  if (
    !["authorization", "observation-only"].includes(submittedMode) ||
    submittedMode !== expectedMode
  )
    fail("GitHub intake snapshot mode does not match its capability.", 403);
  if (submittedMode === "authorization" && repository.private !== true)
    fail("Public repositories cannot authorize issue execution.", 403);
  requiredText(repository.nodeId, "GitHub repository node ID");
  if (repository.nodeId !== capability.repositoryNodeId)
    fail("GitHub intake repository identity changed.", 409);
  return { ...repository, mode: submittedMode };
}

function validateGeneration(value, repository) {
  const generation = exactKeys(
    value,
    new Set(["id", "observedAt"]),
    "GitHub intake generation",
  );
  requiredText(generation.observedAt, "GitHub intake observation time", 100);
  if (
    !/^[a-f0-9]{64}$/.test(generation.id || "") ||
    digest(JSON.stringify([repository.nodeId, generation.observedAt])) !==
      generation.id
  )
    fail("GitHub intake generation ID does not match its repository snapshot.");
  return generation;
}

function validateAuthorization(value) {
  if (value === null || value === undefined) return null;
  const authorization = exactKeys(
    value,
    new Set(["eventId", "actor", "createdAt", "label"]),
    "GitHub intake authorization",
  );
  if (
    !["string", "number"].includes(typeof authorization.eventId) ||
    !String(authorization.eventId).trim() ||
    String(authorization.eventId).length > 200
  )
    fail("GitHub label event ID is required.");
  requiredText(authorization.actor, "GitHub label actor", 200);
  requiredText(authorization.createdAt, "GitHub label event time", 100);
  requiredText(authorization.label, "GitHub ready label", 100);
  return authorization;
}

function validateItem(value) {
  const item = exactKeys(
    value,
    new Set([
      "kind",
      "id",
      "nodeId",
      "number",
      "title",
      "body",
      "url",
      "state",
      "author",
      "assignees",
      "labels",
      "draft",
      "headBranch",
      "headSha",
      "baseBranch",
      "createdAt",
      "updatedAt",
    ]),
    "GitHub intake item",
  );
  if (!["issue", "pull-request"].includes(item.kind))
    fail("GitHub intake item kind must be issue or pull-request.");
  if (
    item.id !== null &&
    item.id !== undefined &&
    (!Number.isSafeInteger(item.id) || item.id < 1)
  )
    fail("GitHub item ID must be a positive integer.");
  if (!Number.isSafeInteger(item.number) || item.number < 1)
    fail("GitHub item number must be a positive integer.");
  requiredText(item.nodeId, "GitHub item node ID");
  optionalText(item.title, "GitHub item title", 500);
  optionalText(item.body, "GitHub item body", 1024 * 1024);
  optionalText(item.url, "GitHub item URL", 2000);
  if (item.state !== "open") fail("GitHub intake accepts open items only.");
  optionalText(item.author, "GitHub item author", 200);
  stringList(item.assignees, "GitHub item assignees");
  stringList(item.labels, "GitHub item labels");
  if (item.kind === "pull-request") {
    if (typeof item.draft !== "boolean")
      fail("GitHub pull request draft state is required.");
    optionalText(item.headBranch, "GitHub pull request head branch", 500);
    optionalText(item.headSha, "GitHub pull request head SHA", 100);
    optionalText(item.baseBranch, "GitHub pull request base branch", 500);
  }
  optionalText(item.createdAt, "GitHub item creation time", 100);
  requiredText(item.updatedAt, "GitHub item update time", 100);
  return item;
}

function expectedDeliveryId(value, repository, generation) {
  if (value.kind === "repository-start")
    return digest(JSON.stringify([generation.id, "start"]));
  if (value.kind === "item")
    return digest(
      JSON.stringify([
        generation.id,
        value.item.kind,
        value.item.nodeId,
        value.item.updatedAt,
      ]),
    );
  return digest(
    JSON.stringify([
      generation.id,
      "complete",
      value.counts.issues,
      value.counts.pullRequests,
      value.itemDigest,
    ]),
  );
}

export function validateGitHubIntakeSnapshot(value, capability) {
  exactKeys(
    value,
    new Set([
      "schemaVersion",
      "kind",
      "repository",
      "generation",
      "item",
      "authorization",
      "counts",
      "itemDigest",
      "deliveryId",
    ]),
    "GitHub intake snapshot",
  );
  if (Buffer.byteLength(canonical(value)) > MAX_SNAPSHOT_BYTES)
    fail("GitHub intake snapshot is too large.", 413);
  if (value.schemaVersion !== SCHEMA_VERSION)
    fail("Unsupported GitHub intake schema version.");
  if (!["repository-start", "item", "repository-complete"].includes(value.kind))
    fail("Unsupported GitHub intake snapshot kind.");
  const repository = validateRepository(value.repository, capability),
    generation = validateGeneration(value.generation, repository);
  let item = null,
    authorization = null,
    counts = null,
    itemDigest = null;
  if (value.kind === "item") {
    item = validateItem(value.item);
    authorization = validateAuthorization(value.authorization);
    if (authorization && item.kind !== "issue")
      fail("Only GitHub issues may include ready-label authorization.");
    if (authorization && repository.mode === "observation-only")
      fail(
        "Observation-only GitHub snapshots cannot authorize issue execution.",
        403,
      );
  } else if (value.item !== undefined || value.authorization !== undefined) {
    fail("Repository snapshot boundaries may not contain a GitHub item.");
  }
  if (value.kind === "repository-complete") {
    counts = exactKeys(
      value.counts,
      new Set(["issues", "pullRequests"]),
      "GitHub intake counts",
    );
    for (const [name, count] of Object.entries(counts))
      if (!Number.isSafeInteger(count) || count < 0)
        fail(`GitHub intake ${name} count must be a non-negative integer.`);
    if (counts.issues + counts.pullRequests > MAX_GENERATION_ITEMS)
      fail(
        "GitHub intake generation exceeds the 4,000-item safety limit.",
        413,
      );
    if (!/^[a-f0-9]{64}$/.test(value.itemDigest || ""))
      fail("GitHub intake item digest is required.");
    itemDigest = value.itemDigest;
  } else if (value.counts !== undefined || value.itemDigest !== undefined) {
    fail("Only a completed repository snapshot may contain counts.");
  }
  if (
    !/^[a-f0-9]{64}$/.test(value.deliveryId || "") ||
    expectedDeliveryId(
      { ...value, item, counts, itemDigest },
      repository,
      generation,
    ) !== value.deliveryId
  )
    fail("GitHub intake delivery ID does not match the snapshot.");
  return {
    kind: value.kind,
    repository: repository.id,
    repositoryNodeId: repository.nodeId,
    generationId: generation.id,
    observedAt: generation.observedAt,
    item,
    authorization,
    counts,
    itemDigest,
    deliveryId: value.deliveryId,
    snapshotHash: digest(canonical(value)),
  };
}

export async function mintGitHubIntakeCapability(
  store,
  github,
  { repository, lifetimeMs = DEFAULT_LIFETIME_MS } = {},
) {
  const id = parseRepository(repository).id,
    configured = configuredRepository(store, id);
  if (
    !Number.isSafeInteger(lifetimeMs) ||
    lifetimeMs < 60 * 60 * 1000 ||
    lifetimeMs > MAX_LIFETIME_MS
  )
    fail(
      "GitHub intake capability lifetime must be between one hour and one year.",
    );
  const remote = await github.repository(parseRepository(configured.remote.id)),
    repositoryVisibility = remote.private === true ? "private" : "public",
    configuredVisibility =
      configured.queue?.visibility ||
      (configured.remote.private === true ? "private" : "public");
  if (configuredVisibility !== repositoryVisibility)
    fail(
      `${id} is ${repositoryVisibility}, but this monitored source is configured as ${configuredVisibility}. Reconfigure it explicitly before continuing.`,
      409,
    );
  if (configured.issueIntake && repositoryVisibility !== "private")
    fail("Public repositories cannot authorize issue execution.", 403);
  if (configured.remote.nodeId && remote.node_id !== configured.remote.nodeId)
    fail("The configured GitHub repository identity changed.", 409);
  const now = new Date(),
    active = store.db
      .prepare(
        "SELECT id FROM github_intake_capabilities WHERE repository=? AND revoked_at IS NULL AND expires_at>? LIMIT 1",
      )
      .get(id, now.toISOString());
  if (active)
    fail(
      "An active GitHub intake capability already exists for this repository. Revoke it before rotating the saved secret.",
      409,
    );
  const token = TOKEN_PREFIX + randomBytes(32).toString("hex"),
    capability = {
      id: "intake-cap-" + randomUUID(),
      repository: id,
      repositoryNodeId: remote.node_id,
      repositoryPrivate: remote.private === true,
      repositoryVisibility,
      mode: intakeMode(configured),
      permissions: ["github-intake:submit"],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
      callbackPath: CALLBACK_PATH,
      suggestedSecretName: suggestedSecretName(id),
    };
  store.transaction(() => {
    store.db
      .prepare(
        "INSERT INTO github_intake_capabilities(id,repository,token_hash,expires_at,revoked_at,body) VALUES (?,?,?,?,NULL,?)",
      )
      .run(
        capability.id,
        capability.repository,
        tokenHash(token),
        capability.expiresAt,
        JSON.stringify(capability),
      );
    store.event(null, "github.intake.capability.created", {
      id: capability.id,
      repository: capability.repository,
      expiresAt: capability.expiresAt,
      mode: capability.mode,
      repositoryVisibility: capability.repositoryVisibility,
      permissions: capability.permissions,
    });
  });
  return {
    token,
    capability,
    callbackPath: CALLBACK_PATH,
    authorization: "Bearer",
    savedSecret: {
      suggestedName: capability.suggestedSecretName,
      value: token,
      returnedOnce: true,
    },
  };
}

export function listGitHubIntakeCapabilities(store, { repository } = {}) {
  const id = repository ? parseRepository(repository).id : null,
    rows = store.db
      .prepare(
        `SELECT * FROM github_intake_capabilities${
          id ? " WHERE repository=?" : ""
        } ORDER BY rowid DESC`,
      )
      .all(...(id ? [id] : [])),
    now = Date.now();
  return rows.map((row) => {
    const capability = capabilityRecord(row);
    return {
      ...capability,
      state: capability.revokedAt
        ? "revoked"
        : Date.parse(capability.expiresAt) <= now
          ? "expired"
          : "active",
    };
  });
}

export function revokeGitHubIntakeCapability(store, { id, repository } = {}) {
  if (!id && !repository)
    fail("Choose a GitHub intake capability or repository to revoke.");
  const repositoryId = repository ? parseRepository(repository).id : null,
    at = new Date().toISOString(),
    result = store.transaction(() => {
      const changed = id
        ? store.db
            .prepare(
              "UPDATE github_intake_capabilities SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
            )
            .run(at, id)
        : store.db
            .prepare(
              "UPDATE github_intake_capabilities SET revoked_at=? WHERE repository=? AND revoked_at IS NULL",
            )
            .run(at, repositoryId);
      if (!changed.changes)
        fail("Active GitHub intake capability not found.", 404);
      store.event(null, "github.intake.capability.revoked", {
        id: id || null,
        repository: repositoryId,
        count: Number(changed.changes),
      });
      return Number(changed.changes);
    });
  return { revoked: result, at };
}

export function authorizeGitHubIntakeCapability(store, token) {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX))
    fail("GitHub intake capability required.", 403);
  const candidate = tokenHash(token),
    rows = store.db
      .prepare(
        "SELECT * FROM github_intake_capabilities WHERE revoked_at IS NULL ORDER BY rowid DESC",
      )
      .all();
  for (const row of rows) {
    const expected = Buffer.from(row.token_hash);
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      if (Date.parse(row.expires_at) <= Date.now())
        fail("GitHub intake capability expired.", 403);
      return capabilityRecord(row);
    }
  }
  fail("GitHub intake capability refused.", 403);
}

function claimDelivery(store, capability, snapshot) {
  const id = `${snapshot.repository}:${snapshot.deliveryId}`,
    now = new Date(),
    existing = store.db
      .prepare("SELECT * FROM github_intake_deliveries WHERE id=?")
      .get(id);
  if (existing) {
    const record = json(existing);
    if (existing.state === "processed") return { replayed: true, record };
    if (
      existing.state === "processing" &&
      Date.parse(existing.received_at) > now.getTime() - PROCESSING_TIMEOUT_MS
    )
      fail("GitHub intake delivery is already processing.", 409);
  }
  const record = {
    id,
    deliveryId: snapshot.deliveryId,
    capabilityId: capability.id,
    repository: snapshot.repository,
    generationId: snapshot.generationId,
    kind: snapshot.kind,
    snapshotHash: snapshot.snapshotHash,
    observedAt: snapshot.observedAt,
    receivedAt: now.toISOString(),
    state: "processing",
    attempts: (json(existing)?.attempts || 0) + 1,
  };
  store.transaction(() => {
    store.db
      .prepare(
        "INSERT INTO github_intake_deliveries(id,capability_id,repository,state,received_at,body) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET capability_id=excluded.capability_id,state=excluded.state,received_at=excluded.received_at,body=excluded.body",
      )
      .run(
        id,
        capability.id,
        snapshot.repository,
        record.state,
        record.receivedAt,
        JSON.stringify(record),
      );
    store.event(null, "github.intake.received", {
      deliveryId: snapshot.deliveryId,
      repository: snapshot.repository,
      generationId: snapshot.generationId,
      kind: snapshot.kind,
      capabilityId: capability.id,
      snapshotHash: snapshot.snapshotHash,
    });
  });
  return { replayed: false, record };
}

function finishDelivery(store, record, state, fields) {
  const next = {
    ...record,
    ...fields,
    state,
    finishedAt: new Date().toISOString(),
  };
  store.transaction(() => {
    store.db
      .prepare("UPDATE github_intake_deliveries SET state=?,body=? WHERE id=?")
      .run(state, JSON.stringify(next), record.id);
    store.event(
      null,
      state === "processed"
        ? "github.intake.processed"
        : "github.intake.failed",
      {
        deliveryId: record.deliveryId,
        repository: record.repository,
        generationId: record.generationId,
        kind: record.kind,
        ...(state === "processed"
          ? { resultState: next.resultState }
          : { message: next.message }),
      },
    );
  });
  return next;
}

function generation(store, id) {
  return json(
    store.db
      .prepare("SELECT * FROM github_intake_generations WHERE id=?")
      .get(id),
  );
}

function startGeneration(store, capability, snapshot) {
  const existing = generation(store, snapshot.generationId);
  if (existing) {
    if (
      existing.repository !== snapshot.repository ||
      existing.capabilityId !== capability.id
    )
      fail("GitHub intake generation belongs to another capability.", 403);
    return existing;
  }
  const record = {
    id: snapshot.generationId,
    capabilityId: capability.id,
    repository: snapshot.repository,
    repositoryNodeId: snapshot.repositoryNodeId,
    observedAt: snapshot.observedAt,
    startedAt: new Date().toISOString(),
    state: "receiving",
    items: [],
  };
  store.transaction(() => {
    store.db
      .prepare(
        "UPDATE github_intake_generations SET state='superseded',body=json_set(body,'$.state','superseded') WHERE repository=? AND state='receiving'",
      )
      .run(snapshot.repository);
    store.db
      .prepare(
        "INSERT INTO github_intake_generations(id,capability_id,repository,state,started_at,body) VALUES (?,?,?,?,?,?)",
      )
      .run(
        record.id,
        record.capabilityId,
        record.repository,
        record.state,
        record.startedAt,
        JSON.stringify(record),
      );
  });
  return record;
}

function requireGeneration(store, capability, snapshot) {
  const record = generation(store, snapshot.generationId);
  if (!record) fail("Start the GitHub repository snapshot first.", 409);
  if (
    record.repository !== snapshot.repository ||
    record.capabilityId !== capability.id ||
    record.repositoryNodeId !== snapshot.repositoryNodeId
  )
    fail("GitHub intake generation is bound to another repository.", 403);
  if (record.state !== "receiving")
    fail("GitHub intake generation is no longer receiving items.", 409);
  return record;
}

function queueItem(snapshot, queueConfig) {
  const item = snapshot.item,
    observedAt = snapshot.observedAt;
  return {
    id: `github-queue:${snapshot.repository}:${item.kind}:${item.nodeId}`,
    kind: item.kind,
    repository: snapshot.repository,
    projectId: queueConfig.projectId || null,
    nodeId: item.nodeId,
    number: item.number,
    title:
      item.title ||
      `${item.kind === "issue" ? "Issue" : "Pull request"} #${item.number}`,
    summary: String(item.body || "").slice(0, 4000),
    body: String(item.body || ""),
    bodyHash: digest(String(item.body || "")),
    url: item.url || null,
    author: item.author || null,
    assignees: item.assignees,
    assigned: item.assignees.length > 0,
    labels: item.labels,
    state: "open",
    ...(item.kind === "pull-request"
      ? {
          draft: item.draft,
          headBranch: item.headBranch || null,
          headSha: item.headSha || null,
          baseBranch: item.baseBranch || null,
        }
      : {}),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt,
    observedAt,
    intakeGenerationId: snapshot.generationId,
  };
}

async function acceptItem(store, github, capability, snapshot) {
  const current = requireGeneration(store, capability, snapshot),
    configured = configuredRepository(store, snapshot.repository);
  let authorization = null;
  if (
    capability.mode === "authorization" &&
    snapshot.item.kind === "issue" &&
    configured.issueIntake
  ) {
    const synced = await syncGitHubIssues(store, github, {
      repository: snapshot.repository,
      issueNumber: snapshot.item.number,
    });
    authorization = [
      ...synced.authorized,
      ...synced.quarantined,
      ...synced.pending,
      ...synced.withdrawn,
    ].find((record) => record.number === snapshot.item.number);
  }
  const key = `${snapshot.item.kind}:${snapshot.item.nodeId}`,
    items = current.items.some((entry) => entry.key === key)
      ? current.items
      : [...current.items, { key, kind: snapshot.item.kind }];
  if (items.length > MAX_GENERATION_ITEMS)
    fail("GitHub intake generation exceeds the 4,000-item safety limit.", 413);
  store.transaction(() => {
    if (configured.queue)
      store.put("github_queue_items", queueItem(snapshot, configured.queue));
    const next = { ...current, items };
    store.db
      .prepare("UPDATE github_intake_generations SET body=? WHERE id=?")
      .run(JSON.stringify(next), current.id);
  });
  return {
    resultState: authorization?.state || "queued",
    authorizationReread: Boolean(configured.issueIntake),
    snapshotAuthorizationMatched:
      Boolean(authorization && snapshot.authorization) &&
      authorization.nodeId === snapshot.item.nodeId &&
      authorization.labelEventId === String(snapshot.authorization.eventId),
  };
}

async function completeGeneration(store, github, capability, snapshot) {
  const current = requireGeneration(store, capability, snapshot),
    configured = configuredRepository(store, snapshot.repository),
    issues = current.items.filter((entry) => entry.kind === "issue").length,
    pullRequests = current.items.filter(
      (entry) => entry.kind === "pull-request",
    ).length,
    itemDigest = digest(
      JSON.stringify(current.items.map((entry) => entry.key).sort()),
    );
  if (
    issues !== snapshot.counts.issues ||
    pullRequests !== snapshot.counts.pullRequests ||
    itemDigest !== snapshot.itemDigest
  )
    fail(
      "GitHub repository snapshot is incomplete; cached items were preserved.",
      409,
    );
  const remote = await requireCapabilityRepository(
    github,
    configured,
    capability,
  );
  if (remote.node_id !== snapshot.repositoryNodeId)
    fail("GitHub intake repository identity changed.", 409);
  const seen = new Set(current.items.map((entry) => entry.key)),
    removed = [];
  store.transaction(() => {
    if (configured.queue)
      for (const item of store
        .list("github_queue_items")
        .filter((entry) => entry.repository === snapshot.repository)) {
        const key = `${item.kind}:${item.nodeId}`;
        if (!seen.has(key)) {
          store.put("github_queue_items", {
            ...item,
            state: "closed",
            processed: true,
            processedAt: item.processedAt || new Date().toISOString(),
            disposition: item.disposition || "no-longer-open",
          });
          removed.push(item.id);
        }
      }
    const next = {
      ...current,
      state: "complete",
      completedAt: new Date().toISOString(),
      counts: snapshot.counts,
      itemDigest,
      removed,
    };
    store.db
      .prepare(
        "UPDATE github_intake_generations SET state='complete',body=? WHERE id=?",
      )
      .run(JSON.stringify(next), current.id);
    store.setMeta("githubQueueSync", {
      source: "openhands-automation",
      repositories: [
        {
          id: snapshot.repository,
          issues,
          pullRequests,
          syncedAt: next.completedAt,
        },
      ],
      items: issues + pullRequests,
      syncedAt: next.completedAt,
      generationId: current.id,
    });
    store.event(null, "github.queue.sync.completed", {
      source: "openhands-automation",
      repository: snapshot.repository,
      issues,
      pullRequests,
      removed: removed.length,
      generationId: current.id,
    });
  });
  return {
    resultState: "complete",
    issues,
    pullRequests,
    removed: removed.length,
  };
}

export async function ingestGitHubSnapshot(store, github, token, value) {
  const capability = authorizeGitHubIntakeCapability(store, token),
    snapshot = validateGitHubIntakeSnapshot(value, capability),
    claimed = claimDelivery(store, capability, snapshot);
  if (claimed.replayed) {
    store.event(null, "github.intake.replayed", {
      deliveryId: snapshot.deliveryId,
      repository: snapshot.repository,
      generationId: snapshot.generationId,
      kind: snapshot.kind,
    });
    return {
      accepted: true,
      replayed: true,
      deliveryId: snapshot.deliveryId,
      repository: snapshot.repository,
      generationId: snapshot.generationId,
      kind: snapshot.kind,
      state: claimed.record.resultState || "processed",
    };
  }
  try {
    let outcome;
    if (snapshot.kind === "repository-start") {
      const configured = configuredRepository(store, snapshot.repository),
        remote = await requireCapabilityRepository(
          github,
          configured,
          capability,
        );
      if (remote.node_id !== snapshot.repositoryNodeId)
        fail("GitHub intake repository identity changed.", 409);
      startGeneration(store, capability, snapshot);
      outcome = { resultState: "receiving" };
    } else if (snapshot.kind === "item") {
      outcome = await acceptItem(store, github, capability, snapshot);
    } else {
      outcome = await completeGeneration(store, github, capability, snapshot);
    }
    finishDelivery(store, claimed.record, "processed", outcome);
    return {
      accepted: true,
      replayed: false,
      deliveryId: snapshot.deliveryId,
      repository: snapshot.repository,
      generationId: snapshot.generationId,
      kind: snapshot.kind,
      state: outcome.resultState,
      ...(outcome.authorizationReread
        ? {
            authorizationReread: true,
            snapshotAuthorizationMatched: outcome.snapshotAuthorizationMatched,
          }
        : {}),
      ...(snapshot.kind === "repository-complete"
        ? {
            issues: outcome.issues,
            pullRequests: outcome.pullRequests,
            removed: outcome.removed,
          }
        : {}),
    };
  } catch (error) {
    finishDelivery(store, claimed.record, "failed", {
      message: String(error.message || error).slice(0, 1000),
    });
    throw error;
  }
}
