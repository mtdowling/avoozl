// Projection preview (design §6.1 step 7, Requirements 13.1 and 29). The
// preview runs the real projection and Project sync, so the two cannot
// drift, against a scratch copy of the database and a GitHub stand-in. The
// stand-in passes reads through, applies each write to its own copy of what
// it read, and records the write instead of sending it.
import { projectPlanIssues } from "./github-projection.mjs";
import { syncProject } from "./github-project.mjs";
import { projectedMarker } from "./github-sync.mjs";
import { parseRepository } from "./github.mjs";

// Stand-in IDs for issues a preview creates: safe integers no real issue has.
const BASE = 2 ** 52;

const repositoryId = (value) =>
  typeof value === "string" ? parseRepository(value).id : value.id;
const names = (labels) =>
  (labels || []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
const optionName = (option) =>
  option?.name?.raw ?? option?.name ?? option?.title?.raw ?? option?.title;

export class PreviewGitHub {
  constructor(github) {
    this.github = github;
    this.writes = [];
    this.issues = new Map();
    this.blockers = new Map();
    this.subIssues = new Map();
    this.items = new Map();
    this.fields = new Map();
    this.created = 0;
    // Projection checks for these optional calls; keep their absence.
    for (const name of ["listIssueTypes", "addSubIssue"])
      if (typeof github[name] !== "function") this[name] = undefined;
  }
  cache(repository, issue) {
    const key = `${repository}#${issue.number}`;
    if (!this.issues.has(key))
      this.issues.set(key, { ...structuredClone(issue), repository });
    return this.issues.get(key);
  }
  async read(repository, number) {
    const key = `${repository}#${number}`;
    if (!this.issues.has(key)) {
      const issue = await this.github.issue(repository, number);
      if (issue) this.cache(repository, issue);
    }
    return this.issues.get(key);
  }
  byId(id) {
    return [...this.issues.values()].find((issue) => Number(issue.id) === id);
  }
  // Who a write is for: the task in the issue's marker.
  task(issue) {
    return projectedMarker(issue?.body)?.taskId ?? null;
  }
  record(kind, repository, issue, detail = {}) {
    this.writes.push({
      kind,
      repository,
      taskId: this.task(issue),
      issue: issue?.preview ? null : (issue?.number ?? null),
      ...detail,
    });
  }

  // Reads.
  repository(value) {
    return this.github.repository(value);
  }
  permission(value, actor) {
    return this.github.permission(value, actor);
  }
  listIssueTypes(owner) {
    return this.github.listIssueTypes(owner);
  }
  async listIssues(value, { state = "all", label } = {}) {
    const repository = repositoryId(value);
    for (const issue of await this.github.listIssues(value, { state, label }))
      this.cache(repository, issue);
    return [...this.issues.values()]
      .filter((issue) => issue.repository === repository)
      .filter((issue) => state === "all" || issue.state === state)
      .filter((issue) => !label || names(issue.labels).includes(label))
      .map((issue) => structuredClone(issue));
  }
  async issue(value, number) {
    return structuredClone(await this.read(repositoryId(value), number));
  }
  async related(map, method, value, number) {
    const repository = repositoryId(value),
      key = `${repository}#${number}`;
    if (!map.has(key)) {
      const issue = await this.read(repository, number);
      map.set(
        key,
        issue?.preview
          ? []
          : (await this.github[method](value, number)).map((entry) =>
              structuredClone(entry),
            ),
      );
    }
    return map.get(key);
  }
  async listIssueBlockers(value, number) {
    return structuredClone(
      await this.related(this.blockers, "listIssueBlockers", value, number),
    );
  }
  async listSubIssues(value, number) {
    return structuredClone(
      await this.related(this.subIssues, "listSubIssues", value, number),
    );
  }
  async projectV2(config) {
    return this.github.projectV2(config);
  }
  async projectFields(project) {
    const fields = await this.github.projectFields(project);
    for (const field of fields) this.fields.set(Number(field.id), field);
    return fields;
  }
  async projectItems(project, fieldIds) {
    const items = await this.github.projectItems(project, fieldIds);
    for (const item of items) this.items.set(item.id, item);
    return items;
  }
  projectStatusChanges(nodeId) {
    if (String(nodeId).startsWith("PREVIEW_")) return Promise.resolve([]);
    return this.github.projectStatusChanges(nodeId);
  }

  // Writes: applied to the copy, recorded, never sent.
  async createIssue(value, input) {
    const repository = repositoryId(value),
      id = BASE + ++this.created,
      issue = this.cache(repository, {
        id,
        node_id: `PREVIEW_${id}`,
        number: id,
        preview: true,
        state: "open",
        title: input.title,
        body: input.body,
        labels: (input.labels || []).map((name) => ({ name })),
        assignees: (input.assignees || []).map((login) => ({ login })),
        html_url: null,
        ...(input.type ? { type: { name: input.type } } : {}),
      });
    this.blockers.set(`${repository}#${id}`, []);
    this.subIssues.set(`${repository}#${id}`, []);
    this.record("issue.create", repository, issue, {
      title: input.title,
      labels: input.labels || [],
      ...(input.assignees ? { assignees: input.assignees } : {}),
      ...(input.type ? { type: input.type } : {}),
    });
    return structuredClone(issue);
  }
  async updateIssue(value, number, patch) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number),
      { type, ...rest } = patch;
    Object.assign(issue, rest, type ? { type: { name: type } } : {});
    this.record("issue.update", repository, issue, {
      fields: Object.keys(patch).sort(),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(type ? { type } : {}),
    });
    return structuredClone(issue);
  }
  async addLabels(value, number, labels) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number),
      next = new Set(names(issue.labels));
    for (const label of labels) next.add(label);
    issue.labels = [...next].map((name) => ({ name }));
    this.record("label.add", repository, issue, { labels });
    return structuredClone(issue.labels);
  }
  async removeLabel(value, number, label) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number);
    issue.labels = names(issue.labels)
      .filter((name) => name !== label)
      .map((name) => ({ name }));
    this.record("label.remove", repository, issue, { labels: [label] });
    return null;
  }
  async addAssignees(value, number, assignees) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number);
    issue.assignees = assignees.map((login) => ({ login }));
    this.record("assignee.add", repository, issue, { assignees });
    return { assignees: issue.assignees };
  }
  async addSubIssue(value, number, childId) {
    const repository = repositoryId(value),
      parent = await this.read(repository, number),
      children = await this.related(
        this.subIssues,
        "listSubIssues",
        value,
        number,
      ),
      child = this.byId(childId);
    children.push(structuredClone(child));
    this.record("sub-issue.add", repository, parent, {
      childTaskId: this.task(child),
    });
    return {};
  }
  async addIssueBlocker(value, number, blockerId) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number),
      list = await this.related(
        this.blockers,
        "listIssueBlockers",
        value,
        number,
      ),
      blocker = this.byId(blockerId);
    list.push(structuredClone(blocker));
    this.record("blocker.add", repository, issue, {
      blockerTaskId: this.task(blocker),
      blockerRepository: blocker.repository,
    });
    return structuredClone(blocker);
  }
  async removeIssueBlocker(value, number, blockerId) {
    const repository = repositoryId(value),
      issue = await this.read(repository, number),
      list = await this.related(
        this.blockers,
        "listIssueBlockers",
        value,
        number,
      ),
      index = list.findIndex((entry) => Number(entry.id) === blockerId),
      [blocker] = index >= 0 ? list.splice(index, 1) : [];
    this.record("blocker.remove", repository, issue, {
      blockerTaskId: this.task(blocker),
      blockerIssueId: blockerId,
    });
    return null;
  }
  comment(kind, value, detail) {
    this.writes.push({
      kind,
      repository: repositoryId(value),
      taskId: null,
      issue: null,
      ...detail,
    });
    return Promise.resolve({ id: null, html_url: null });
  }
  createIssueComment(value, number) {
    return this.comment("comment.create", value, { issue: number });
  }
  updateIssueComment(value, id) {
    return this.comment("comment.update", value, { commentId: id });
  }
  createCommitComment(value, sha) {
    return this.comment("comment.create", value, { commit: sha });
  }
  updateCommitComment(value, id) {
    return this.comment("comment.update", value, { commentId: id });
  }
  async addProjectItem(project, { owner, repo, number }) {
    const repository = `${owner}/${repo}`,
      issue = await this.read(repository, number),
      item = {
        id: `PREVIEW_ITEM_${issue.node_id}`,
        content_type: "Issue",
        content: { node_id: issue.node_id, number },
        fields: [],
      };
    this.items.set(item.id, item);
    this.record("project.add", repository, issue);
    return structuredClone(item);
  }
  // Field and option IDs read back as names; Status never appears here
  // because Project sync never writes it.
  async updateProjectItem(_project, itemId, updates) {
    const item = this.items.get(itemId),
      issue = [...this.issues.values()].find(
        (entry) => entry.node_id === item?.content?.node_id,
      );
    this.record("project.fields", issue?.repository ?? null, issue, {
      fields: Object.fromEntries(
        updates.map(({ id, value }) => {
          const field = this.fields.get(Number(id)),
            options =
              field?.data_type === "iteration"
                ? [
                    ...(field.configuration?.iterations || []),
                    ...(field.configuration?.completed_iterations || []),
                  ]
                : field?.options || [],
            option = options.find((entry) => entry.id === value);
          return [
            field?.name ?? String(id),
            option ? optionName(option) : value,
          ];
        }),
      ),
    });
    return {};
  }
}

// Every write projection and Project sync would make for `planId`, without
// making any. Returns {planId, planHash, writes, conflicts, notes,
// unlinked, previewOnly, project}.
export async function previewProjection(
  store,
  github,
  { planId, repository, identity, policy = null, claimed = new Set() },
) {
  const scratch = store.scratch(),
    stand = new PreviewGitHub(github);
  try {
    const projection = await projectPlanIssues(scratch, stand, {
      planId,
      repository,
      identity,
      locked: true,
      dryRun: true,
    });
    let project = { status: "off" };
    if (policy?.project) {
      const result = await syncProject(scratch, stand, {
        policy,
        identity,
        claimed,
      });
      project = {
        status: result.status,
        problems: result.problems || [],
        ...(result.reason ? { reason: result.reason, fix: result.fix } : {}),
      };
    }
    return {
      planId: projection.planId,
      planHash: projection.planHash,
      writes: stand.writes,
      conflicts: projection.conflicts,
      notes: projection.notes,
      // Children the sub-issue cap or GitHub leaves unlinked (R59.15).
      unlinked: projection.unlinked,
      // Done tasks that get no issue (R74, github.issues.includeDone).
      skippedDone: projection.skippedDone,
      previewOnly: projection.previewOnly,
      project,
    };
  } finally {
    scratch.close();
  }
}
