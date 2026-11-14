// The review-rules pull request of Radar's Set up (RC7.1, design D9): one pull
// request that adds a marked section to `AGENTS.md` holding the review rules
// and the one-line crew prompt (D5.4). Crews re-read `AGENTS.md` for every
// issue, so the rules and the prompt reach them there. Avoozl never writes to
// the default branch: the change is a branch and a pull request a person
// merges. Read, check and write calls only; no network of its own.
import { CREW_PROMPT } from "./radar-crew-prompt.mjs";
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

export const AGENTS_BRANCH = "avoozl/review-rules";
const START = "<!-- avoozl:review-rules -->",
  END = "<!-- /avoozl:review-rules -->";

export const DEFAULT_REVIEW_RULES = [
  "- Build only from an issue that came from an approved spec. If the check below fails, skip the issue.",
  "- Open one pull request per issue, and name the issue in it with `Closes #N`.",
  "- Leave merging to auto-merge once the required checks pass.",
  "- Say what you skipped or did not check.",
].join("\n");

export const rulesBlock = (settings = {}) =>
  `${START}\n## Review rules\n\n${(settings.radar?.reviewRules ?? DEFAULT_REVIEW_RULES).trim()}\n\n${CREW_PROMPT}\n${END}\n`;

// `AGENTS.md` with the block added or replaced; the rest is kept as read.
export function withRulesBlock(text, block) {
  const body = String(text ?? ""),
    from = body.indexOf(START),
    to = body.indexOf(END);
  if (from >= 0 && to > from)
    return body.slice(0, from) + block + body.slice(to + END.length + 1);
  return body ? `${body.replace(/\n*$/, "\n")}\n${block}` : block;
}

const notFound = (error) => error?.status === 404;

async function readFile(github, repository, branch) {
  const { owner, repo } = parseRepository(repository);
  try {
    const file = await github.request(
      "GET",
      `/repos/${owner}/${repo}/contents/AGENTS.md`,
      { query: { ref: branch } },
    );
    return {
      sha: file.sha,
      text: Buffer.from(file.content ?? "", "base64").toString("utf8"),
    };
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

// One Set up step: ok (already there, or a pull request is open), change, or
// blocked (the token cannot write). `check(text)` is the content screen:
// it returns what blocks the text, as strings; none means it passes.
export async function inspectAgentsPr(
  github,
  repository,
  settings,
  { branch, push, check },
) {
  const block = rulesBlock(settings),
    file = await readFile(github, repository, branch),
    next = withRulesBlock(file?.text, block);
  if (file?.text === next)
    return {
      id: "agents-pr",
      status: "ok",
      detail: `AGENTS.md on ${branch} holds the review rules.`,
    };
  const { owner } = parseRepository(repository),
    open = ((await github
      .listPullRequests(repository, {
        state: "open",
        head: `${owner}:${AGENTS_BRANCH}`,
      })
      .catch(() => [])) ?? [])[0];
  if (open)
    return {
      id: "agents-pr",
      status: "ok",
      detail: `Pull request #${open.number} already proposes the review rules. Merge it.`,
    };
  if (!push)
    return {
      id: "agents-pr",
      status: "blocked",
      permission:
        "Write access to the repository (Contents and Pull requests: write)",
      detail: "AGENTS.md has no review rules block.",
    };
  const title = "Add review rules for crews to AGENTS.md",
    body = `Adds the review rules and the one-line crew prompt to AGENTS.md. Crews read this file for every issue.\n\n${block}`,
    blocked = check ? check(`${title}\n${body}`) : [];
  if (blocked.length)
    return {
      id: "agents-pr",
      status: "error",
      detail: `A content rule blocks the pull request text (${blocked.join(", ")}). Nothing was changed.`,
    };
  return {
    id: "agents-pr",
    status: "change",
    detail: `Open a pull request ${AGENTS_BRANCH} that ${file ? "updates" : "creates"} AGENTS.md on ${branch}.`,
    write: { branch, title, body, content: next, sha: file?.sha ?? null },
  };
}

export async function writeAgentsPr(github, repository, { write }) {
  const { owner, repo } = parseRepository(repository),
    base = `/repos/${owner}/${repo}`,
    ref = await github.request("GET", `${base}/git/ref/heads/${write.branch}`);
  try {
    await github.request("POST", `${base}/git/refs`, {
      body: { ref: `refs/heads/${AGENTS_BRANCH}`, sha: ref.object.sha },
    });
  } catch (error) {
    // shortcut: a branch left by an earlier try is reused as is; upgrade by
    // reading its AGENTS.md sha if that file write is refused.
    if (error?.status !== 422) throw error;
  }
  await github.request("PUT", `${base}/contents/AGENTS.md`, {
    body: {
      message: write.title,
      content: Buffer.from(write.content).toString("base64"),
      branch: AGENTS_BRANCH,
      ...(write.sha ? { sha: write.sha } : {}),
    },
  });
  const pull = await github.request("POST", `${base}/pulls`, {
    body: {
      title: write.title,
      head: AGENTS_BRANCH,
      base: write.branch,
      body: write.body,
    },
  });
  if (!pull?.number) fail("GitHub did not open the pull request.", 502);
  return pull;
}
