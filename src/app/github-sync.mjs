// A registered GitHub repository: its record, and this machine's identity.
// No label is read as an order (triage-agent TA11.1), so nothing here reads
// issues.
import { randomUUID } from "node:crypto";
import os from "node:os";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import { parseMarker } from "./github-marker.mjs";

export function projectedMarker(body) {
  return parseMarker(body);
}

export function machineIdentity(store) {
  let identity = store.getMeta("machineIdentity");
  if (!identity) {
    identity = {
      id: "machine-" + randomUUID().slice(0, 12),
      name: os.hostname().slice(0, 120),
      createdAt: new Date().toISOString(),
    };
    store.setMeta("machineIdentity", identity);
  }
  return identity;
}

export async function prepareGitHubRepository(store, github, input) {
  const repository = parseRepository(input.repository || input.id);
  if (
    !store.get("repositories", input.repositoryId) &&
    input.registering?.id !== input.repositoryId
  )
    fail("Configure the execution repository before its GitHub repository.");
  const [remote, user] = await Promise.all([
    github.repository(repository),
    github.currentUser(),
  ]);
  const record = {
    ...repository,
    id: repository.id,
    nodeId: remote.node_id,
    private: Boolean(remote.private),
    repositoryId: input.repositoryId,
    ...(input.workspaceRepositoryId
      ? { workspaceRepositoryId: input.workspaceRepositoryId }
      : {}),
    assignee: input.assignee || user.login,
    provider: input.provider || null,
    model: input.model || null,
    autoStart: Boolean(input.autoStart),
    activeMachine: input.active === false ? null : machineIdentity(store).id,
    configuredBy: user.login,
    configuredAt: new Date().toISOString(),
  };
  return record;
}

export async function configureGitHubRepository(store, github, input) {
  const record = await prepareGitHubRepository(store, github, input);
  store.put("github_repositories", record);
  store.event(null, "github.repository.configured", {
    repository: record.id,
    repositoryId: record.repositoryId,
    assignee: record.assignee,
  });
  return record;
}
