import { createHash } from "node:crypto";

// An in-memory GitHub for projection, completion and rebuild tests. Every
// value is fake and no network client is involved.
export class FakeGitHub {
  constructor() {
    this.login = "worker";
    this.issues = [];
    this.events = new Map();
    this.timelines = new Map();
    this.permissions = new Map();
    this.created = [];
    this.updated = [];
    this.labels = [];
    this.subIssues = [];
    this.comments = [];
    this.blockers = new Map();
  }
  available() {
    return true;
  }
  repository({ owner, repo }) {
    return Promise.resolve({
      node_id: "repo-node",
      full_name: owner + "/" + repo,
      private: true,
    });
  }
  currentUser() {
    return Promise.resolve({ login: this.login });
  }
  ensureLabel(_repository, label) {
    this.labels.push(["ensure", label.name]);
    return Promise.resolve(label);
  }
  // An ETag that moves with any issue or event change, as GitHub's does
  // through updated_at.
  issueActivity(_repository, etag) {
    const now = createHash("sha256")
      .update(JSON.stringify([this.issues, [...this.events]]))
      .digest("hex");
    return Promise.resolve({ changed: now !== etag, etag: now });
  }
  searchIssuesWithAnyLabel() {
    return Promise.resolve(this.issues.map((issue) => structuredClone(issue)));
  }
  listIssues(repository, { state = "all", label } = {}) {
    return Promise.resolve(
      this.created
        .filter((issue) => issue.repository === repository.id)
        .filter((issue) => state === "all" || issue.state === state)
        .filter(
          (issue) =>
            !label ||
            (issue.labels || []).some(
              (item) => (typeof item === "string" ? item : item.name) === label,
            ),
        )
        .map((issue) => structuredClone(issue)),
    );
  }
  issueEvents(_repository, number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline(_repository, number) {
    return Promise.resolve(structuredClone(this.timelines.get(number) || []));
  }
  issue(_repository, number) {
    const issue = this.created.find((item) => item.number === number);
    return Promise.resolve(structuredClone(issue));
  }
  listIssueBlockers(repository, number) {
    const key = `${repository.id}#${number}`;
    return Promise.resolve(
      structuredClone([...(this.blockers.get(key) || new Map()).values()]),
    );
  }
  addIssueBlocker(repository, number, blockerIssueId) {
    const key = `${repository.id}#${number}`,
      blockers = this.blockers.get(key) || new Map(),
      blocker = this.created.find((item) => item.id === blockerIssueId);
    blockers.set(blockerIssueId, blocker);
    this.blockers.set(key, blockers);
    return Promise.resolve(structuredClone(blocker));
  }
  removeIssueBlocker(repository, number, blockerIssueId) {
    const key = `${repository.id}#${number}`,
      blockers = this.blockers.get(key) || new Map();
    blockers.delete(blockerIssueId);
    this.blockers.set(key, blockers);
    return Promise.resolve(null);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  createIssue(repository, input) {
    const number = this.created.length + 40;
    const issue = {
      id: number,
      node_id: "issue-" + number,
      number,
      repository: repository.id,
      state: "open",
      labels: (input.labels || []).map((name) => ({ name })),
      title: input.title,
      body: input.body,
      html_url: `https://example.test/${repository.id}/issues/${number}`,
      assignees: (input.assignees || []).map((login) => ({ login })),
      ...(input.type ? { type: { name: input.type } } : {}),
    };
    this.created.push(issue);
    return Promise.resolve(structuredClone(issue));
  }
  updateIssue(_repository, number, input) {
    const issue = this.created.find((item) => item.number === number),
      { type, ...rest } = input;
    Object.assign(issue, rest, type ? { type: { name: type } } : {});
    this.updated.push(number);
    return Promise.resolve(structuredClone(issue));
  }
  addLabels(_repository, number, labels) {
    this.labels.push(["add", number, ...labels]);
    const issue = this.created.find((item) => item.number === number),
      names = new Set((issue.labels || []).map((label) => label.name));
    for (const label of labels) names.add(label);
    issue.labels = [...names].map((name) => ({ name }));
    return Promise.resolve(issue.labels);
  }
  removeLabel(_repository, number, label) {
    this.labels.push(["remove", number, label]);
    const issue = this.created.find((item) => item.number === number);
    issue.labels = (issue.labels || []).filter((item) => item.name !== label);
    return Promise.resolve(null);
  }
  addAssignees(_repository, number, assignees) {
    const issue = this.created.find((item) => item.number === number);
    issue.assignees = assignees.map((login) => ({ login }));
    return Promise.resolve({ assignees: issue.assignees });
  }
  addSubIssue(_repository, number, databaseId) {
    this.subIssues.push([number, databaseId]);
    return Promise.resolve({});
  }
  listIssueTypes(owner) {
    return Promise.resolve(
      (this.issueTypes?.[owner] || []).map((name) => ({ name })),
    );
  }
  listSubIssues(_repository, number) {
    return Promise.resolve(
      this.subIssues
        .filter(([parent]) => parent === number)
        .map(([, id]) =>
          structuredClone(this.created.find((item) => item.id === id)),
        ),
    );
  }
  createIssueComment(_repository, number, body) {
    const comment = {
      id: this.comments.length + 1,
      number,
      body,
      html_url: `https://example.test/comments/${this.comments.length + 1}`,
    };
    this.comments.push(comment);
    return Promise.resolve(structuredClone(comment));
  }
  updateIssueComment(_repository, id, body) {
    const comment = this.comments.find((item) => item.id === id);
    comment.body = body;
    return Promise.resolve(structuredClone(comment));
  }
}
