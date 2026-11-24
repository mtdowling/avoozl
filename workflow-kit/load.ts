// Reads the workflow kit's cases and judges a runner's results. It depends on
// nothing but Node, so any runner written in JavaScript can use it as is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));

type Files = Record<string, string>;
type Probes = Record<string, unknown>;
// One case as read: its case.json fields, its name and its files.
export interface Case {
  name: string;
  title: string;
  files: Files;
  history?: { commit: string; files: Files; [key: string]: unknown }[];
  then?: Probes;
  expect?: Probes;
  expectFail?: Record<string, string>;
  rules?: string[];
  steps?: { do: string; [key: string]: unknown }[];
  // What the runners start from (read by scripts/kit/scenarios-doc.ts).
  runner?: {
    login?: string;
    defaultBranch?: string;
    specsBranch?: string;
    staleHours?: number;
    localOnly?: boolean;
    labels?: { require?: string[]; exclude?: string[]; stop?: string };
  };
  runners?: Record<string, string>;
  origin?: {
    branches?: string[];
    behind?: string[];
    [key: string]: unknown;
  };
  landing?: { mode?: string; pr?: string };
  repository?: { deleteBranchOnMerge?: boolean };
  issues?: Record<string, string[]>;
  stops?: string[];
  [key: string]: unknown;
}
export type Verdict = "pass" | "fail" | "expected-fail" | "unexpected-pass";

function filesUnder(dir: string, prefix = ""): Files {
  const out: Files = {};
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
// A case with `variants` is also read once per variant, as `<name>/<variant>`:
// the variant's fields replace the case's, and its `title` is the case's
// title and the variant's `title` after a colon.
export function readCases(dir = path.join(here, "cases")): Case[] {
  return fs
    .readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const found = JSON.parse(
        fs.readFileSync(path.join(dir, name, "case.json"), "utf8"),
      );
      const { variants, ...base } = found,
        read = {
          ...base,
          ...(found.history && {
            history: found.history.map((entry: { commit: string }) => ({
              ...entry,
              files: filesUnder(path.join(dir, name, "commits", entry.commit)),
            })),
          }),
          files: filesUnder(path.join(dir, name, "repo")),
        };
      return [
        { name, ...read },
        ...Object.entries(
          (variants ?? {}) as Record<string, { title: string }>,
        ).map(([key, { title, ...fields }]) => ({
          ...read,
          ...fields,
          name: `${name}/${key}`,
          title: `${read.title}: ${title}`,
        })),
      ];
    });
}

// The probes a case checks: a scenario's `then`, else a snapshot case's
// `expect`.
export const probesOf = (testCase: Case): Probes =>
  testCase.then ?? testCase.expect ?? {};

// One verdict per probe in `expect`: `pass`, `fail`, `expected-fail` or
// `unexpected-pass`. `got` holds the runner's value for each probe it can
// compute and leaves the others out.
export function judge(
  testCase: Case,
  got: Record<string, unknown> | null | undefined,
): Record<string, Verdict> {
  const verdicts: Record<string, Verdict> = {};
  for (const [probe, want] of Object.entries(probesOf(testCase))) {
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
