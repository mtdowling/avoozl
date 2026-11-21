import { defaultJob, fixedCredentials } from "./github-credentials.ts";
import { GitHubClient } from "../github/github.ts";

// Sends a fake GitHub's createIssue through the real client's createIssue
// over a fake fetch, so a test sees the request GitHub would get (R103.2).
// The fake still makes the issue. Returns the requests and the label edits
// made after a create; no network is involved.
// The fake's parts this wraps: its create and its label edits.
interface Issue {
  id?: number;
  node_id?: string;
  number: number;
  html_url?: string;
  state?: string;
  title?: string;
  body?: string;
  labels?: unknown[];
  assignees?: unknown[];
}
interface Fake {
  createIssue(
    repository: unknown,
    input: Record<string, unknown>,
  ): Promise<Issue>;
  addLabels?(...args: unknown[]): unknown;
  updateIssue?(...args: unknown[]): unknown;
}
// GraphQL createIssue's input, for the fields the fake takes.
interface CreateInput {
  title: string;
  body: string;
  labelIds?: string[];
  assigneeIds?: string[];
  parentIssueId?: string;
  issueTypeId?: string;
}

export function throughClient(fake: Fake) {
  const make = fake.createIssue.bind(fake),
    requests: { form: string; labels: string[] }[] = [],
    labelEdits: unknown[][] = [];
  let target: unknown = null;
  const answer = (body: unknown) => new Response(JSON.stringify(body));
  const client = defaultJob(
    "check-in",
    new GitHubClient({
      credentials: fixedCredentials("test-token"),
      apiUrl: "https://api.example.test",
      fetch: async (url, options = {}) => {
        const { pathname } = new URL(String(url)),
          body =
            typeof options.body === "string" ? JSON.parse(options.body) : null;
        if (
          options.method === "POST" &&
          /^\/repos\/[^/]+\/[^/]+\/issues$/.test(pathname)
        ) {
          requests.push({ form: "rest", labels: body.labels || [] });
          return answer(await make(target, body));
        }
        if (pathname.includes("/labels/"))
          return answer({
            node_id: "L:" + decodeURIComponent(pathname.split("/").pop() ?? ""),
          });
        if (pathname.startsWith("/users/"))
          return answer({ node_id: "U:" + pathname.split("/").pop() });
        if (/^\/orgs\/[^/]+\/issue-types$/.test(pathname))
          return answer(
            ["Epic", "Task", "Feature", "Bug"].map((name) => ({
              name,
              node_id: "T:" + name,
            })),
          );
        if (pathname === "/graphql") {
          const input: CreateInput = body.variables.input,
            labels = (input.labelIds || []).map((id) => id.slice(2));
          requests.push({ form: "graphql", labels });
          const issue = await make(target, {
            title: input.title,
            body: input.body,
            labels,
            assignees: (input.assigneeIds || []).map((id) => id.slice(2)),
            ...(input.parentIssueId
              ? { parentIssueId: input.parentIssueId }
              : {}),
            ...(input.issueTypeId ? { type: input.issueTypeId.slice(2) } : {}),
          });
          return answer({
            data: {
              createIssue: {
                issue: {
                  id: issue.node_id ?? "I_" + issue.number,
                  databaseId: issue.id ?? issue.number,
                  number: issue.number,
                  url: issue.html_url ?? "",
                  state: issue.state ?? "OPEN",
                  title: issue.title ?? input.title,
                  body: issue.body ?? input.body,
                  labels: { nodes: issue.labels ?? [] },
                  assignees: { nodes: issue.assignees ?? [] },
                  subIssuesSummary: { total: 0 },
                },
              },
            },
          });
        }
        // The repository read the GraphQL form needs.
        return answer({ node_id: "R:" + pathname });
      },
    }),
  );
  fake.createIssue = (value, input) => {
    target = value;
    return client.createIssue(value, input);
  };
  for (const name of ["addLabels", "updateIssue"] as const) {
    const call = fake[name]?.bind(fake);
    if (call)
      fake[name] = (...args: unknown[]) => {
        labelEdits.push([name, ...args.slice(1)]);
        return call(...args);
      };
  }
  return { requests, labelEdits };
}
