// `panel.view`: everything the chat side panel shows, in one read. Each part is
// read on its own and a part that fails is null, so the panel shows that
// section as unread and the others still show. GitHub reads go through the
// client's one max-age cache (github.cacheSeconds), so a panel that reads every
// 30 seconds does not cost 30 seconds of GitHub calls. Read only.
import { checkState } from "./radar-events.mjs";

// Pull requests whose checks one read looks up. A panel has no room for more.
const MAX_CHECKS = 12;

// passing | failing | pending | none, from the checks on a pull request head.
export function checkSummary(runs) {
  const list = Array.isArray(runs) ? runs : (runs?.check_runs ?? []),
    state = checkState(list);
  return {
    state: state.failed.length
      ? "failing"
      : !state.total
        ? "none"
        : state.done < state.total
          ? "pending"
          : "passing",
    total: state.total,
    done: state.done,
    failed: state.failed,
  };
}

// "owner/repo#57" -> the checks on that pull request's head, for each crew
// claim that names a pull request. A pull request that cannot be read is left
// out (the panel shows it as unknown).
export async function pullChecks(github, claims) {
  const checks = {};
  if (!github?.available?.()) return checks;
  const wanted = (claims?.rows ?? [])
    .filter((row) => row.pr && row.repository)
    .slice(0, MAX_CHECKS);
  await Promise.all(
    wanted.map(async (row) => {
      try {
        const pull = await github.pullRequest(row.repository, row.pr),
          sha = pull?.head?.sha;
        if (sha)
          checks[`${row.repository}#${row.pr}`] = checkSummary(
            await github.checkRuns(row.repository, sha),
          );
      } catch {
        // Unknown, not failing.
      }
    }),
  );
  return checks;
}

// Reads every part with `reads`, an object of name -> () => value | Promise.
// A read that throws is null.
export async function panelView(reads) {
  const out = {};
  await Promise.all(
    Object.entries(reads).map(async ([name, read]) => {
      try {
        out[name] = await read();
      } catch {
        out[name] = null;
      }
    }),
  );
  return { readAt: new Date().toISOString(), ...out };
}
