// Saved retros: each report the avoozl-retro skill writes, as one Markdown
// file in `.avoozl/local/retros/` of the workspace, named
// `<YYYY-MM-DD-HHMM>-<scope>.md` in UTC. Only these operations write or read
// the folder; the skill saves through retro.save.
import fs from "node:fs";
import path from "node:path";
import { fail } from "../store/store.ts";

const FILE =
  /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-([a-z0-9][a-z0-9-]{0,59})(?:-(\d+))?\.md$/;
const SCOPE = /^[a-z0-9][a-z0-9-]{0,59}$/;
// A report is a page of Markdown; anything larger is not a retro.
export const MAX_RETRO_BYTES = 200_000;

export const retrosFolder = (workspaceRoot: string) =>
  path.join(workspaceRoot, ".avoozl", "local", "retros");

// The scope as a file-name part: lower case, letters, digits and dashes.
export function retroScope(value: unknown): string {
  const scope = String(value ?? "workspace")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  if (!SCOPE.test(scope))
    fail("Name the retro's scope: a spec, a repository or workspace.", 400);
  return scope;
}

const stamp = (at: Date) =>
  at.toISOString().slice(0, 16).replace("T", "-").replace(":", "");

// The first `# ` heading, else the first line with text.
const titleOf = (text: string) => {
  const lines = text.split("\n").map((line) => line.trim());
  return (
    lines
      .find((line) => /^# /.test(line))
      ?.slice(2)
      .trim() ||
    lines.find(Boolean) ||
    "Retro"
  ).slice(0, 200);
};

// Write one report; a second report in the same minute and scope gets -2.
export function saveRetro(
  workspaceRoot: string,
  input: { scope?: unknown; text?: unknown },
  now = new Date(),
) {
  const text = input?.text as string;
  if (typeof text !== "string" || !text.trim())
    fail("A retro needs its report as Markdown text.", 400);
  if (Buffer.byteLength(text) > MAX_RETRO_BYTES)
    fail(`A retro report is at most ${MAX_RETRO_BYTES} bytes.`, 413);
  const scope = retroScope(input.scope),
    folder = retrosFolder(workspaceRoot),
    base = `${stamp(now)}-${scope}`;
  fs.mkdirSync(folder, { recursive: true });
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    try {
      fs.writeFileSync(
        path.join(folder, name),
        text.endsWith("\n") ? text : `${text}\n`,
        {
          flag: "wx",
        },
      );
      return describe(folder, name);
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
}

function describe(folder: string, name: string) {
  const [, day, hour, minute, scope] = FILE.exec(name)!,
    text = fs.readFileSync(path.join(folder, name), "utf8");
  return {
    name,
    at: `${day}T${hour}:${minute}:00.000Z`,
    scope,
    title: titleOf(text),
    path: `.avoozl/local/retros/${name}`,
  };
}

// Every saved retro, newest first.
export function listRetros(workspaceRoot: string) {
  const folder = retrosFolder(workspaceRoot);
  let names: string[] = [];
  try {
    names = fs.readdirSync(folder).filter((name) => FILE.test(name));
  } catch {
    return { items: [] };
  }
  return {
    items: names
      .map((name) => describe(folder, name))
      .sort((a, b) => b.at.localeCompare(a.at) || b.name.localeCompare(a.name)),
  };
}

// One saved retro by its file name, with its Markdown.
export function readRetro(workspaceRoot: string, input: { name?: unknown }) {
  const name = input?.name as string;
  if (typeof name !== "string" || !FILE.test(name))
    fail("Name a saved retro, such as 2026-11-21-0930-workspace.md.", 400);
  const folder = retrosFolder(workspaceRoot);
  if (!fs.existsSync(path.join(folder, name)))
    fail(`No saved retro ${name}.`, 404);
  return {
    ...describe(folder, name),
    text: fs.readFileSync(path.join(folder, name), "utf8"),
  };
}
