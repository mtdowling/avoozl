import { createHash } from "node:crypto";

// The repository the client names in each call: its workspace id.
interface Repo {
  id: string;
  [key: string]: unknown;
}
// An issue as GitHub's REST API returns it, for the fields this fake keeps.
// A test may add more (state_reason, closed_at).
export interface FakeIssue {
  id: number;
  node_id: string;
  number: number;
  repository: string;
  state: string;
  labels: { name: string }[];
  title: string;
  body: string;
  html_url: string;
  assignees: { login: string }[];
  type?: { name: string };
  [key: string]: unknown;
}
interface IssueInput {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  type?: string;
  parentIssueId?: string;
}
interface FakeComment {
  id: number;
  number: number;
  body: string;
  html_url: string;
  user: { login: string };
}
// A read a test answers itself; any arguments.
type Answer = (...args: never[]) => Promise<unknown>;

const notFound = (message = "Not Found") =>
  Object.assign(new Error(message), { status: 404 });

// An in-memory GitHub for projection, completion and rebuild tests. Every
// value is fake and no network client is involved.
export class FakeGitHub {
  login: string;
  issues: Record<string, unknown>[];
  events: Map<number, unknown[]>;
  timelines: Map<number, unknown[]>;
  permissions: Map<string, string>;
  created: FakeIssue[];
  updated: number[];
  labels: (string | number)[][];
  subIssues: [number, number][];
  comments: FakeComment[];
  blockers: Map<string, Map<number, FakeIssue | undefined>>;
  branches: Map<string, string>;
  files: Map<string, string>;
  shas: Map<string, string>;
  // Issue type names per owner, when a test gives any.
  declare issueTypes?: Record<string, string[]>;
  // Reads a test answers when its code path needs them.
  declare checkRuns?: Answer;
  declare commitStatus?: Answer;
  declare issueLinks?: Answer;
  declare closingPullRequests?: Answer;
  declare branchPullRequests?: Answer;
  declare pullRequest?: Answer;
  declare commit?: Answer;
  declare listDiscussions?: Answer;
  declare addDiscussionComment?: Answer;
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
    // Branch name -> history root; the same root means shared history.
    this.branches = new Map([["main", "main"]]);
    this.files = new Map();
    this.shas = new Map();
  }
  // Files by `ref:path`. A folder answers with its direct entries.
  contents(_repository: Repo, pathname: string, ref: string) {
    const missing = () => Promise.reject(notFound());
    const text = this.files.get(`${ref}:${pathname}`);
    if (text !== undefined)
      return Promise.resolve({
        type: "file",
        encoding: "base64",
        content: Buffer.from(text).toString("base64"),
      });
    const prefix = `${ref}:${pathname}/`,
      names = new Map<string, string>();
    for (const key of this.files.keys())
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        names.set(rest.split("/")[0], rest.includes("/") ? "dir" : "file");
      }
    return names.size
      ? Promise.resolve([...names].map(([name, type]) => ({ name, type })))
      : missing();
  }
  // The tree and blob reads the file reader falls back to. A commit sha
  // names the branch it was read from.
  shaOf(name: string) {
    // The sha follows the branch's files, so a changed branch has a new head.
    const hash = createHash("sha1").update(`branch:${name}`);
    for (const [key, text] of this.files)
      if (key.startsWith(`${name}:`)) hash.update(key).update(text);
    const sha = hash.digest("hex");
    this.shas.set(sha, name);
    return sha;
  }
  treeEntries(_repository: Repo, ref: string) {
    const prefix = `${this.shas.get(ref) ?? ref}:`;
    return Promise.resolve(
      [...this.files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ path: key.slice(prefix.length), type: "blob" })),
    );
  }
  blobTexts(_repository: Repo, ref: string, paths: string[]) {
    const prefix = `${this.shas.get(ref) ?? ref}:`;
    return Promise.resolve(
      new Map(
        paths.map((file) => [file, this.files.get(prefix + file) ?? null]),
      ),
    );
  }
  branch(_repository: Repo, name: string) {
    return this.branches.has(name) ||
      [...this.files.keys()].some((key) => key.startsWith(`${name}:`))
      ? Promise.resolve({ name, commit: { sha: this.shaOf(name) } })
      : Promise.reject(notFound());
  }
  compareCommits(_repository: Repo, base: string, head: string) {
    if (this.branches.get(base) === this.branches.get(head))
      return Promise.resolve({ status: "ahead", ahead_by: 0, behind_by: 0 });
    return Promise.reject(
      notFound(`No common ancestor between ${base} and ${head}.`),
    );
  }
  available() {
    return true;
  }
  repository({ owner, repo }: { owner: string; repo: string }) {
    return Promise.resolve({
      node_id: "repo-node",
      full_name: owner + "/" + repo,
      private: true,
      default_branch: "main",
    });
  }
  currentUser() {
    return Promise.resolve({ login: this.login });
  }
  ensureLabel<L extends { name: string }>(_repository: Repo, label: L) {
    this.labels.push(["ensure", label.name]);
    return Promise.resolve(label);
  }
  // An ETag that moves with any issue or event change, as GitHub's does
  // through updated_at.
  issueActivity(_repository: Repo, etag: string) {
    const now = createHash("sha256")
      .update(JSON.stringify([this.issues, [...this.events]]))
      .digest("hex");
    return Promise.resolve({ changed: now !== etag, etag: now });
  }
  searchIssuesWithAnyLabel() {
    return Promise.resolve(this.issues.map((issue) => structuredClone(issue)));
  }
  listIssues(
    repository: Repo,
    { state = "all", label }: { state?: string; label?: string } = {},
  ) {
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
  issueEvents(_repository: Repo, number: number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline(_repository: Repo, number: number) {
    return Promise.resolve(structuredClone(this.timelines.get(number) || []));
  }
  issue(_repository: Repo, number: number) {
    const issue = this.created.find((item) => item.number === number);
    return Promise.resolve(structuredClone(issue));
  }
  // The issue with this number; a missing one is the test's own mistake.
  private made(number: number) {
    const issue = this.created.find((item) => item.number === number);
    if (!issue) throw notFound(`No issue #${number}.`);
    return issue;
  }
  listIssueBlockers(repository: Repo, number: number) {
    const key = `${repository.id}#${number}`;
    return Promise.resolve(
      structuredClone([...(this.blockers.get(key) || new Map()).values()]),
    );
  }
  addIssueBlocker(repository: Repo, number: number, blockerIssueId: number) {
    const key = `${repository.id}#${number}`,
      blockers = this.blockers.get(key) || new Map(),
      blocker = this.created.find((item) => item.id === blockerIssueId);
    blockers.set(blockerIssueId, blocker);
    this.blockers.set(key, blockers);
    return Promise.resolve(structuredClone(blocker));
  }
  removeIssueBlocker(repository: Repo, number: number, blockerIssueId: number) {
    const key = `${repository.id}#${number}`,
      blockers = this.blockers.get(key) || new Map();
    blockers.delete(blockerIssueId);
    this.blockers.set(key, blockers);
    return Promise.resolve(null);
  }
  permission(_repository: Repo, actor: string) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  createIssue(repository: Repo, input: IssueInput) {
    const number = this.created.length + 40;
    const issue: FakeIssue = {
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
    // Made under its parent in the create call, as GraphQL createIssue does.
    const parent = this.created.find(
      (item) => item.node_id === input.parentIssueId,
    );
    if (parent) this.subIssues.push([parent.number, issue.id]);
    return Promise.resolve(structuredClone(issue));
  }
  updateIssue(
    _repository: Repo,
    number: number,
    input: Partial<Omit<FakeIssue, "type">> & { type?: string },
  ) {
    const issue = this.made(number),
      { type, ...rest } = input;
    Object.assign(issue, rest, type ? { type: { name: type } } : {});
    this.updated.push(number);
    return Promise.resolve(structuredClone(issue));
  }
  addLabels(_repository: Repo, number: number, labels: string[]) {
    this.labels.push(["add", number, ...labels]);
    const issue = this.made(number),
      names = new Set((issue.labels || []).map((label) => label.name));
    for (const label of labels) names.add(label);
    issue.labels = [...names].map((name) => ({ name }));
    return Promise.resolve(issue.labels);
  }
  removeLabel(_repository: Repo, number: number, label: string) {
    this.labels.push(["remove", number, label]);
    const issue = this.made(number);
    issue.labels = (issue.labels || []).filter((item) => item.name !== label);
    return Promise.resolve(null);
  }
  // Adds, as GitHub's POST does; a login already assigned stays once.
  addAssignees(_repository: Repo, number: number, assignees: string[]) {
    const issue = this.made(number),
      kept = (issue.assignees || []).map((entry) => entry.login);
    issue.assignees = [...new Set([...kept, ...assignees])].map((login) => ({
      login,
    }));
    return Promise.resolve({ assignees: issue.assignees });
  }
  removeAssignees(_repository: Repo, number: number, assignees: string[]) {
    const issue = this.made(number);
    issue.assignees = (issue.assignees || []).filter(
      (entry) => !assignees.includes(entry.login),
    );
    return Promise.resolve({ assignees: issue.assignees });
  }
  addSubIssue(_repository: Repo, number: number, databaseId: number) {
    this.subIssues.push([number, databaseId]);
    return Promise.resolve({});
  }
  listIssueTypes(owner: string) {
    return Promise.resolve(
      (this.issueTypes?.[owner] || []).map((name) => ({ name })),
    );
  }
  listSubIssues(_repository: Repo, number: number) {
    return Promise.resolve(
      this.subIssues
        .filter(([parent]) => parent === number)
        .map(([, id]) =>
          structuredClone(this.created.find((item) => item.id === id)),
        ),
    );
  }
  createIssueComment(_repository: Repo, number: number, body: string) {
    const comment = {
      id: this.comments.length + 1,
      number,
      body,
      html_url: `https://example.test/comments/${this.comments.length + 1}`,
      user: { login: this.login },
    };
    this.comments.push(comment);
    return Promise.resolve(structuredClone(comment));
  }
  listIssueComments(_repository: Repo, number: number) {
    return Promise.resolve(
      structuredClone(this.comments.filter((item) => item.number === number)),
    );
  }
  updateIssueComment(_repository: Repo, id: number, body: string) {
    const comment = this.comments.find((item) => item.id === id);
    if (!comment) throw notFound(`No comment ${id}.`);
    comment.body = body;
    return Promise.resolve(structuredClone(comment));
  }
}
