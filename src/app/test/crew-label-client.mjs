import { defaultJob, fixedCredentials } from "./github-credentials.mjs";
import { GitHubClient } from "../github/github.mjs";

// Sends a fake GitHub's createIssue through the real client's createIssue
// over a fake fetch, so a test sees the request GitHub would get (R103.2).
// The fake still makes the issue. Returns the requests and the label edits
// made after a create; no network is involved.
export function throughClient(fake) {
  const make = fake.createIssue.bind(fake),
    requests = [],
    labelEdits = [];
  let target = null;
  const answer = (body) => new Response(JSON.stringify(body));
  const client = defaultJob(
    "check-in",
    new GitHubClient({
      credentials: fixedCredentials("test-token"),
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const { pathname } = new URL(url),
          body = options.body ? JSON.parse(options.body) : null;
        if (
          options.method === "POST" &&
          /^\/repos\/[^/]+\/[^/]+\/issues$/.test(pathname)
        ) {
          requests.push({ form: "rest", labels: body.labels || [] });
          return answer(await make(target, body));
        }
        if (pathname.includes("/labels/"))
          return answer({
            node_id: "L:" + decodeURIComponent(pathname.split("/").pop()),
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
          const input = body.variables.input,
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
  for (const name of ["addLabels", "updateIssue"]) {
    const call = fake[name]?.bind(fake);
    if (call)
      fake[name] = (...args) => {
        labelEdits.push([name, ...args.slice(1)]);
        return call(...args);
      };
  }
  return { requests, labelEdits };
}
