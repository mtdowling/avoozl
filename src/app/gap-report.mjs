// An external gap report (RC17.6, design D22): a table that lists, per
// repository, which of a proposal's requirements it still fails. Each failing
// cell becomes one proposed task in that repository's sub-spec; a passing cell
// becomes none. Nothing here writes: the caller shows the table and, when a
// person accepts, proposes each task through plan.propose.
//
// Format: a Markdown table. The header row names the requirements, the first
// column names the repository, and each cell is `pass` or `fail`.
//
//   | Repository | R1   | R2   |
//   | ---------- | ---- | ---- |
//   | repo-a     | pass | fail |
import { fail } from "./store.mjs";

const CELL = new Set(["pass", "fail"]);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const MAX_BYTES = 200 * 1024;

const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

// { repositories, requirements, cells: [{repository, requirement, status}] }.
// Lines before the table are ignored. Inside it every line must be a row, and
// the first line that is not (or has the wrong cells) is refused by number.
export function parseGapReport(text) {
  if (typeof text !== "string" || !text.trim())
    fail("The gap report is empty.", 422);
  if (Buffer.byteLength(text) > MAX_BYTES)
    fail("The gap report is larger than 200 KB.", 422);
  const lines = text.split(/\r?\n/);
  let header = null,
    started = false,
    ended = false;
  const requirements = [],
    repositories = [],
    cells = [];
  for (const [index, raw] of lines.entries()) {
    const number = index + 1,
      line = raw.trim();
    if (ended) {
      if (line.startsWith("|"))
        fail(
          `Line ${number}: a second table follows the first. Keep one.`,
          422,
        );
      continue;
    }
    if (!line.startsWith("|")) {
      if (started) ended = true;
      continue;
    }
    const row = cellsOf(line);
    if (!started) {
      started = true;
      if (row.length < 2 || row.some((cell) => !NAME.test(cell)))
        fail(
          `Line ${number}: the header names the repository column, then one requirement per column.`,
          422,
        );
      header = row;
      requirements.push(...row.slice(1));
      if (new Set(requirements).size !== requirements.length)
        fail(`Line ${number}: a requirement is named twice.`, 422);
      continue;
    }
    if (row.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    if (row.length !== header.length)
      fail(
        `Line ${number}: ${row.length} cells, but the header has ${header.length}.`,
        422,
      );
    if (!NAME.test(row[0]))
      fail(`Line ${number}: the repository name is not usable.`, 422);
    if (repositories.includes(row[0]))
      fail(`Line ${number}: a repository is named twice.`, 422);
    repositories.push(row[0]);
    for (const [column, value] of row.slice(1).entries()) {
      const status = value.toLowerCase();
      if (!CELL.has(status))
        fail(
          `Line ${number}: a cell is "pass" or "fail", not something else (column ${column + 2}).`,
          422,
        );
      cells.push({
        repository: row[0],
        requirement: requirements[column],
        status,
      });
    }
  }
  if (!started) fail("The gap report has no table.", 422);
  if (!repositories.length) fail("The gap report table has no rows.", 422);
  return { repositories, requirements, cells };
}

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// One proposed task per failing cell: {repository, requirement, id, title,
// acceptance}. `subSpecOf(repository)` names the sub-spec that takes it, or
// null; a failing repository with no sub-spec is refused by name.
export function gapProposals(report, subSpecOf) {
  const out = [];
  for (const cell of report.cells) {
    if (cell.status !== "fail") continue;
    const spec = subSpecOf(cell.repository);
    if (!spec)
      fail(
        `${cell.repository} fails ${cell.requirement}, but no sub-spec takes that repository.`,
        422,
      );
    const id = `close-gap-${slug(cell.requirement)}`;
    out.push({
      repository: cell.repository,
      requirement: cell.requirement,
      spec,
      id,
      title: `Close the ${cell.requirement} gap in ${cell.repository}`,
      acceptance: [
        `${cell.repository} passes ${cell.requirement} in the next gap report.`,
      ],
    });
  }
  return out;
}

// The table a person reads, as text: one row per repository.
export function formatGapTable(report) {
  const status = new Map(
      report.cells.map((c) => [`${c.repository}\n${c.requirement}`, c.status]),
    ),
    rows = [
      ["Repository", ...report.requirements],
      ...report.repositories.map((repository) => [
        repository,
        ...report.requirements.map(
          (requirement) => status.get(`${repository}\n${requirement}`) ?? "",
        ),
      ]),
    ],
    width = rows[0].map((_, i) =>
      Math.max(...rows.map((row) => row[i].length)),
    );
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(width[i]))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}
