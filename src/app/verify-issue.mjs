// `issue.verify` (design D5.3, RC3.2-RC3.5): five read-only checks that an
// issue came from an approved spec. Every read goes through `gh api`, as the
// caller's own login. A read that fails fails its check, and later checks
// still run so one run reports every failure. Output names checks, logins,
// repositories, task IDs and the commit. It never quotes issue text, spec
// text or an API message, because no reason below is built from one.
import { execFile } from "node:child_process";
import { LOGIN } from "./github-marker.mjs";
import { parseProvenance } from "./github-provenance.mjs";
import { specItems } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

const REFERENCE =
  /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,9})$/;
const WRITERS = new Set(["admin", "maintain", "write"]);
const COMPARE_KNOWN = new Set(["behind", "identical", "ahead", "diverged"]);
const STATUS_LINE = /^Status: \S+$/;

export function parseIssueReference(value) {
  const match = typeof value === "string" ? REFERENCE.exec(value) : null;
  if (!match || match[2] === "." || match[2].includes(".."))
    fail("Name the issue as owner/repo#number.", 64);
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

// A reader is `(apiPath, { raw }) => { status, headers, text, reason }`.
// Status 0 means gh gave no answer; `reason` says why in words of ours.
export function ghReader({
  command = "gh",
  prefix = [],
  timeoutMs = 30_000,
  env = process.env,
} = {}) {
  return (apiPath, { raw = false } = {}) =>
    new Promise((resolve) => {
      const accept = raw
        ? "application/vnd.github.raw+json"
        : "application/vnd.github+json";
      execFile(
        command,
        [...prefix, "api", "-i", "-H", "Accept: " + accept, apiPath],
        {
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          env,
        },
        (error, stdout, stderr) => {
          const split = /\r?\n\r?\n/.exec(stdout || ""),
            head = split ? stdout.slice(0, split.index) : stdout || "",
            status = /^HTTP\/\S+\s+(\d{3})/.exec(head)?.[1];
          if (status) {
            const headers = {};
            for (const line of head.split(/\r?\n/).slice(1)) {
              const at = line.indexOf(":");
              if (at > 0)
                headers[line.slice(0, at).toLowerCase()] = line
                  .slice(at + 1)
                  .trim();
            }
            return resolve({
              status: Number(status),
              headers,
              text: split ? stdout.slice(split.index + split[0].length) : "",
            });
          }
          const reason =
            error?.code === "ENOENT"
              ? "gh is not installed"
              : /gh auth login/.test(stderr || "")
                ? "gh is not logged in; run gh auth login"
                : error?.killed
                  ? "gh did not answer in time"
                  : "gh gave no answer";
          resolve({ status: 0, headers: {}, text: "", reason });
        },
      );
    });
}

// One read, sorted into: ok (200), denied (404, or a 403 that is not a rate
// limit: the account may not see it), or unavailable (anything else: no
// login, rate limit, network, server error). Never throws.
async function get(read, apiPath, options) {
  let response;
  try {
    response = await read(apiPath, options);
  } catch {
    return { kind: "unavailable", status: 0 };
  }
  const status = Number(response?.status) || 0,
    headers = response?.headers || {},
    text = typeof response?.text === "string" ? response.text : "";
  if (status === 200) {
    if (options?.raw) return { kind: "ok", status, text };
    try {
      return { kind: "ok", status, body: JSON.parse(text) };
    } catch {
      return { kind: "unavailable", status, unreadable: true };
    }
  }
  const limited =
    headers["x-ratelimit-remaining"] === "0" ||
    headers["retry-after"] !== undefined ||
    /rate limit/i.test(text.slice(0, 500));
  if (status === 404 || (status === 403 && !limited))
    return { kind: "denied", status };
  return { kind: "unavailable", status, reason: response?.reason };
}

const why = (read) =>
  read.unreadable
    ? "read gave an unreadable answer"
    : read.status
      ? `read failed (${read.status})`
      : `read failed (${read.reason || "no answer"})`;

const done = (name, status, reason, unavailable = false) => ({
  name,
  status,
  ...(reason ? { reason } : {}),
  ...(unavailable ? { unavailable: true } : {}),
});
const pass = (name, detail) => done(name, "ok", detail);
const failed = (name, reason, unavailable = false) =>
  done(name, "fail", reason, unavailable);
const skipped = (name, reason) => done(name, "skipped", reason);
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const repoPath = (id) => `repos/${id}`;
const encode = (name) => name.split("/").map(encodeURIComponent).join("/");

async function permission(read, repository, login, name) {
  const answer = await get(
    read,
    `${repoPath(repository)}/collaborators/${encodeURIComponent(login)}/permission`,
  );
  if (answer.kind !== "ok")
    return failed(name, why(answer), answer.kind === "unavailable");
  const level = record(answer.body) ? answer.body.permission : undefined;
  if (typeof level === "string" && WRITERS.has(level))
    return pass(name, `${login} has ${level} on ${repository}`);
  return failed(name, `${login} has no write permission on ${repository}`);
}

function statusLine(text) {
  const lines = text
    .split(/\r?\n/)
    .slice(0, 20)
    .filter((line) => STATUS_LINE.test(line));
  return lines.length === 1 ? lines[0] : null;
}

async function checkSpec(read, home, marker) {
  const base = `${repoPath(home)}/contents/.kiro/specs/${marker.spec}`,
    problems = [],
    files = {};
  let unavailable = false;
  const fetch = async (file) => {
    const answer = await get(read, `${base}/${file}?ref=${marker.commit}`, {
      raw: true,
    });
    if (answer.kind === "unavailable") unavailable = true;
    return answer;
  };
  let first = await fetch("requirements.md"),
    firstName = "requirements.md";
  if (first.kind === "denied") {
    first = await fetch("bugfix.md");
    firstName = "bugfix.md";
    if (first.kind === "denied") {
      problems.push("requirements.md or bugfix.md is missing");
      first = null;
    }
  }
  if (first?.kind === "ok") files[firstName] = first.text;
  else if (first) problems.push(`${firstName} ${why(first)}`);
  for (const file of ["design.md", "tasks.md", "avoozl/manifest.json"]) {
    const answer = await fetch(file);
    if (answer.kind === "ok") files[file] = answer.text;
    else
      problems.push(
        answer.kind === "denied"
          ? `${file} is missing`
          : `${file} ${why(answer)}`,
      );
  }
  for (const [file, text] of Object.entries(files))
    if (file.endsWith(".md") && statusLine(text) !== "Status: Approved")
      problems.push(`${file} does not say Status: Approved`);
  if (files["tasks.md"] !== undefined) {
    const ids = new Set(
        specItems(marker.spec, files["tasks.md"]).map((item) => item.id),
      ),
      absent = marker.tasks.filter((id) => !ids.has(id));
    if (absent.length)
      problems.push(`tasks.md does not list ${absent.join(", ")}`);
  }
  return problems.length
    ? failed("spec", problems.join("; "), unavailable)
    : pass(
        "spec",
        `tasks.md at ${marker.commit.slice(0, 7)} lists ${marker.tasks.join(", ")}; all three files say Approved`,
      );
}

async function checkCommit(read, home, marker) {
  const repo = await get(read, repoPath(home));
  if (repo.kind !== "ok") return failed("commit", why(repo), true);
  const branch = record(repo.body) ? repo.body.default_branch : null;
  if (
    typeof branch !== "string" ||
    !branch ||
    branch.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(branch)
  )
    return failed("commit", "the default branch is unreadable", true);
  const compare = await get(
    read,
    `${repoPath(home)}/compare/${encode(branch)}...${marker.commit}`,
  );
  if (compare.kind !== "ok")
    return failed("commit", why(compare), compare.kind === "unavailable");
  const state = record(compare.body) ? compare.body.status : undefined,
    short = marker.commit.slice(0, 7);
  if (state === "identical")
    return pass("commit", `${short} is identical to ${branch}`);
  if (state === "behind") return pass("commit", `${short} is behind ${branch}`);
  return failed(
    "commit",
    COMPARE_KNOWN.has(state)
      ? `${short} is ${state}, not behind the default branch or identical to it`
      : `${short} is not behind the default branch or identical to it`,
  );
}

// Runs the five checks. `read` is a reader (ghReader() by default).
export async function verifyIssue(reference, { read = ghReader() } = {}) {
  const { owner, repo, number } = parseIssueReference(reference),
    code = `${owner}/${repo}`,
    checks = [],
    result = { repository: code, number, taskIds: [], commit: null, checks };
  const issue = await get(read, `${repoPath(code)}/issues/${number}`);
  let marker = null,
    author = null;
  if (issue.kind !== "ok") {
    // The issue itself cannot be read: nothing can be checked.
    checks.push(failed("marker", why(issue), true));
  } else {
    const data = record(issue.body) ? issue.body : {};
    author =
      typeof data.user?.login === "string" && LOGIN.test(data.user.login)
        ? data.user.login
        : null;
    if (data.pull_request)
      checks.push(failed("marker", "this is a pull request, not an issue"));
    else {
      const parsed = parseProvenance(
        typeof data.body === "string" ? data.body : "",
      );
      marker = parsed.marker;
      checks.push(
        marker ? pass("marker") : failed("marker", parsed.problem.message),
      );
    }
  }
  if (marker) {
    result.taskIds = marker.tasks;
    result.commit = marker.commit;
    result.spec = marker.spec;
    result.approvedBy = marker.approvedBy;
    if (marker.plans) result.plans = marker.plans;
  }
  const home = marker?.plans || code;
  checks.push(
    marker
      ? await permission(read, home, marker.approvedBy, "approver")
      : skipped("approver", "needs the marker"),
  );
  if (issue.kind !== "ok")
    checks.push(skipped("author", "the issue was not read"));
  else if (!author)
    checks.push(failed("author", "the issue has no readable author"));
  else {
    result.author = author;
    checks.push(await permission(read, code, author, "author"));
  }
  if (marker) {
    checks.push(await checkSpec(read, home, marker));
    checks.push(await checkCommit(read, home, marker));
  } else {
    checks.push(skipped("spec", "needs the marker"));
    checks.push(skipped("commit", "needs the marker"));
  }
  result.couldNotRun = checks.some((check) => check.unavailable);
  for (const check of checks) delete check.unavailable;
  result.ok = checks.every((check) => check.status === "ok");
  result.exitCode = result.ok ? 0 : result.couldNotRun ? 2 : 1;
  return result;
}

// One line per check: `name  ok  detail`, or `FAIL name: reason`.
export function formatVerification(result) {
  return result.checks
    .map((check) =>
      check.status === "fail"
        ? `FAIL ${check.name}: ${check.reason}`
        : `${check.name.padEnd(9)} ${check.status}${check.reason ? "  " + check.reason : ""}`,
    )
    .join("\n");
}
