// Reads the workflow kit's cases and judges a runner's results. It depends on
// nothing but Node, so any runner written in JavaScript can use it as is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));

function filesUnder(dir, prefix = "") {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      Object.assign(out, filesUnder(path.join(dir, entry.name), rel));
    else out[rel] = fs.readFileSync(path.join(dir, entry.name), "utf8");
  }
  return out;
}

// Each case: its `case.json` fields, its `name`, and `files`, the tree under
// its `repo` folder keyed by path from the repository root. A case with a
// `history` also gets each commit's `files`, read from `commits/<commit>`.
export function readCases(dir = path.join(here, "cases")) {
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => {
      const found = JSON.parse(
        fs.readFileSync(path.join(dir, name, "case.json"), "utf8"),
      );
      return {
        name,
        ...found,
        ...(found.history && {
          history: found.history.map((entry) => ({
            ...entry,
            files: filesUnder(path.join(dir, name, "commits", entry.commit)),
          })),
        }),
        files: filesUnder(path.join(dir, name, "repo")),
      };
    });
}

// One verdict per probe in `expect`: `pass`, `fail`, `expected-fail` or
// `unexpected-pass`. `got` holds the runner's value for each probe it can
// compute and leaves the others out.
export function judge(testCase, got) {
  const verdicts = {};
  for (const [probe, want] of Object.entries(testCase.expect ?? {})) {
    const ok = isDeepStrictEqual(got?.[probe], want),
      marked = testCase.expectFail?.[probe] !== undefined;
    verdicts[probe] = ok
      ? marked
        ? "unexpected-pass"
        : "pass"
      : marked
        ? "expected-fail"
        : "fail";
  }
  return verdicts;
}
