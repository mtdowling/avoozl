// Retro rule targets (RC8.6, design D10). A retro proposal names where a rule
// goes: `AGENTS.md` or a steering file (a pull request a person merges; crews
// re-read both for each issue), or the crew's Additional prompt (shown as full
// text with Copy and a link, because that edit is owner-only and Avoozl writes
// nothing to Radar). Each applied rule is recorded, and after N finished
// issues a check reports how many came since, with an undo offer.
import { parseRepository } from "./github.mjs";
import { fail } from "./store.mjs";

export const RETRO_TARGETS = ["agents", "steering", "prompt"];
export const RETRO_CHECK_AFTER = 5;
const META = "radarRetro";
const STEERING = /^\.kiro\/steering\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

const marker = (id) => [
  `<!-- avoozl:retro ${id} -->`,
  `<!-- /avoozl:retro ${id} -->`,
];
const entries = (store) => store.getMeta(META) ?? [];

const blockFor = (id, text) => {
  const [start, end] = marker(id);
  return `${start}\n${text.trim()}\n${end}\n`;
};

export const withRetroBlock = (file, id, text) =>
  `${file ? file.replace(/\n*$/, "\n\n") : ""}${blockFor(id, text)}`;

export function withoutRetroBlock(file, id) {
  const [start, end] = marker(id),
    from = file.indexOf(start),
    to = file.indexOf(end);
  if (from < 0 || to < from) return file;
  return (file.slice(0, from) + file.slice(to + end.length + 1)).replace(
    /\n{3,}/g,
    "\n\n",
  );
}

async function readFile(github, repository, path, ref) {
  const { owner, repo } = parseRepository(repository);
  try {
    const file = await github.request(
      "GET",
      `/repos/${owner}/${repo}/contents/${path}`,
      { query: { ref } },
    );
    return {
      sha: file.sha,
      text: Buffer.from(file.content ?? "", "base64").toString("utf8"),
    };
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

// One pull request that changes one file on its own branch. Never the default
// branch. `change(text)` returns the new file text.
async function openPull(
  github,
  repository,
  { base, branch, path, title, body, change },
) {
  const { owner, repo } = parseRepository(repository),
    root = `/repos/${owner}/${repo}`,
    file = await readFile(github, repository, path, base),
    content = change(file?.text ?? "");
  if (content === (file?.text ?? ""))
    fail(`${path} on ${base} has nothing to change.`, 409);
  const ref = await github.request("GET", `${root}/git/ref/heads/${base}`);
  await github.request("POST", `${root}/git/refs`, {
    body: { ref: `refs/heads/${branch}`, sha: ref.object.sha },
  });
  await github.request("PUT", `${root}/contents/${path}`, {
    body: {
      message: title,
      content: Buffer.from(content).toString("base64"),
      branch,
      ...(file?.sha ? { sha: file.sha } : {}),
    },
  });
  const pull = await github.request("POST", `${root}/pulls`, {
    body: { title, head: branch, base, body },
  });
  if (!pull?.number) fail("GitHub did not open the pull request.", 502);
  return pull;
}

// Apply a rule. `input`: { repository, target, text, file?, base?, checkAfter? }.
// `check(text)` returns what blocks the pull request text (strings).
export async function applyRetroRule(
  store,
  github,
  input,
  { check, now = Date.now() } = {},
) {
  const { repository, target } = input,
    text = String(input.text ?? "").trim();
  if (!RETRO_TARGETS.includes(target))
    fail(`target is one of ${RETRO_TARGETS.join(", ")}.`, 400);
  if (!text) fail("Write the rule text.", 400);
  const id = `r${now.toString(36)}`,
    checkAfter = Number.isInteger(input.checkAfter)
      ? input.checkAfter
      : RETRO_CHECK_AFTER,
    entry = {
      id,
      repository,
      target,
      text,
      appliedAt: new Date(now).toISOString(),
      checkAfter,
      pr: null,
      path: null,
      undone: false,
    };
  let result;
  if (target === "prompt") {
    // Nothing is written to GitHub or Radar. The person pastes it.
    result = { copy: text, link: "radar", written: false };
  } else {
    const path = target === "agents" ? "AGENTS.md" : input.file;
    if (target === "steering" && !STEERING.test(path ?? ""))
      fail("A steering file is .kiro/steering/<name>.md.", 400);
    const title = `Add a crew rule to ${path}`,
      body = `${text}\n\nAdded from a retro. Crews re-read ${path} for each issue.`,
      blocked = check ? check(`${title}\n${body}`) : [];
    if (blocked.length)
      fail(
        `A content rule blocks the pull request text (${blocked.join(", ")}). Nothing was changed.`,
        422,
      );
    const pull = await openPull(github, repository, {
      base: input.base ?? "main",
      branch: `avoozl/retro-${id}`,
      path,
      title,
      body,
      change: (file) => withRetroBlock(file, id, text),
    });
    entry.pr = pull.number;
    entry.path = path;
    entry.base = input.base ?? "main";
    result = { pr: pull.number, written: true };
  }
  store.setMeta(META, [...entries(store), entry]);
  return { id, target, ...result };
}

// Undo a repo rule: a second pull request that removes the block. A prompt
// rule has nothing to undo in Avoozl; the person removes the text.
export async function undoRetroRule(
  store,
  github,
  id,
  { now = Date.now() } = {},
) {
  const list = entries(store),
    entry = list.find((e) => e.id === id);
  if (!entry) fail(`No retro rule ${id}.`, 404);
  if (!entry.path)
    fail("This rule is in the Additional prompt. Remove it there.", 409);
  if (entry.undone) fail("Already undone.", 409);
  const pull = await openPull(github, entry.repository, {
    base: entry.base,
    branch: `avoozl/retro-undo-${id}`,
    path: entry.path,
    title: `Remove a crew rule from ${entry.path}`,
    body: "Removes a rule added from a retro.",
    change: (file) => withoutRetroBlock(file, id),
  });
  store.setMeta(
    META,
    list.map((e) =>
      e.id === id ? { ...e, undone: true, undoPr: pull.number } : e,
    ),
  );
  return { id, undoPr: pull.number };
}

// The applied rules, each with its check: how many issues finished since it
// was applied (from flow rows `{ repository, merged }`), and an undo offer
// once `checkAfter` have. Reads only.
export function retroView(store, flowRows = []) {
  return entries(store).map((e) => {
    const since = flowRows.filter(
      (row) =>
        row.repository === e.repository &&
        row.merged &&
        Date.parse(row.merged) > Date.parse(e.appliedAt),
    ).length;
    const due = !e.undone && since >= e.checkAfter;
    return {
      ...e,
      since,
      due,
      undo:
        due && e.path
          ? { id: e.id, offer: `Undo ${e.path} rule #${e.pr}` }
          : null,
    };
  });
}
