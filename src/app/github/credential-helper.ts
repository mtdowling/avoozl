// `avoozl credential`, the git credential helper Avoozl hands its own
// network git commands (plugin-credentials §D9, PC6). Git runs it with
// `get`, `store` or `erase` and the request on stdin; remoteGit puts the
// job, repository and workspace in that one command's environment. It
// answers only https (or http to a loopback address), only the GitHub host,
// and only the path of the repository Avoozl named, and asks the same
// provider and job table as the API, in this process.
import { agentSession } from "../mcp/mcp-policy.ts";
import { githubGitUrl } from "../git/git.ts";
import { machineCredentials } from "./github-credentials.ts";
import { JOBS } from "./github-jobs.ts";

const LOOPBACK = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

// The part of a credential provider this helper asks (github-credentials.ts).
interface TokenProvider {
  token(request: {
    repository: string;
    owner: string;
    job: string;
  }): Promise<{ token: string }>;
}

// git's request lines (`key=value`) as an object.
function parseRequest(text: unknown) {
  const request: Record<string, string> = {};
  for (const line of String(text).split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) request[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return request;
}

// The answer to one `get`, or a refusal (thrown). `credentials` is the
// provider set; tests pass a fake.
export async function credentialAnswer(
  action: string,
  request: Record<string, string | undefined>,
  {
    env = process.env,
    credentials,
  }: { env?: NodeJS.ProcessEnv; credentials?: TokenProvider } = {},
) {
  if (action !== "get") return "";
  // A speed bump for agent sessions, not a sandbox (PC6.7): the sandbox
  // keeps plugins.json, plugin folders and gh's config out of an agent's reach.
  if (agentSession(env) || env.AVOOZL_CHILD)
    throw Error("avoozl credential does not answer inside an agent session.");
  const job = env.AVOOZL_CREDENTIAL_JOB ?? "",
    repository = env.AVOOZL_CREDENTIAL_REPOSITORY ?? "";
  if (!JOBS[job])
    throw Error("avoozl credential runs only under Avoozl's git.");
  // A grant lives only in the process that asked for it (§D7).
  if (JOBS[job]?.risk === "high")
    throw Error(`${job} is high risk; no git command runs under it.`);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw Error("avoozl credential needs the repository Avoozl named.");
  const base = new URL(githubGitUrl(env) || "https://github.com"),
    protocol = request.protocol,
    host = String(request.host || "").toLowerCase();
  if (
    !(
      protocol === "https" ||
      (protocol === "http" && LOOPBACK.has(host.replace(/:\d+$/, "")))
    )
  )
    throw Error(`avoozl credential answers https only, not ${protocol}.`);
  if (host !== base.host.toLowerCase())
    throw Error(`avoozl credential answers ${base.host} only, not ${host}.`);
  const path = String(request.path || "").replace(/\.git$/, ""),
    prefix = base.pathname.replace(/^\/|\/$/g, "");
  if (
    path.toLowerCase() !==
    (prefix ? `${prefix}/${repository}` : repository).toLowerCase()
  )
    throw Error(`avoozl credential answers ${repository} only.`);
  const provider: TokenProvider = credentials ?? machineCredentials({ env });
  const auth = await provider.token({
    repository,
    owner: repository.split("/")[0],
    job,
  });
  return `username=x-access-token\npassword=${auth.token}\n`;
}

// The command: read stdin, answer on stdout, exit non-zero on a refusal.
export async function runCredentialHelper(action: string) {
  let text = "";
  if (action === "get" || action === "store" || action === "erase")
    for await (const chunk of process.stdin) text += chunk;
  const credentials = machineCredentials({ env: process.env });
  try {
    process.stdout.write(
      await credentialAnswer(action, parseRequest(text), { credentials }),
    );
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    credentials.close();
  }
}
