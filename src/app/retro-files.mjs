// Each finished retro is a committed Markdown file (design §4.42), so a
// rebuilt database has its retros back. The file is
// `.kiro/retros/<retro id>.md`: a short readable summary, then the whole
// record as one fenced `json avoozl-retro` block, which is what a rebuild
// reads. Avoozl's agent identity authors the commit; it touches no spec.
import fs from "node:fs";
import path from "node:path";
import { check as checkContent, contentBinding } from "./content-rules.mjs";
import { agentAuthorEnv, git } from "./git.mjs";
import { commitOnMain } from "./git-approvals.mjs";
import { digest } from "../model.mjs";

export const RETRO_DIR = ".kiro/retros";
const FENCE = "```json avoozl-retro";
const FINISHED = new Set(["done", "failed"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const META = "retro.files";

export const retroPath = (id) => `${RETRO_DIR}/${id}.md`;

// The file's text for one retro record.
export function retroText(retro) {
  const lines = [
    `# Retro ${retro.id}`,
    "",
    `State: ${retro.state}${retro.finishedAt ? `, finished ${retro.finishedAt}` : ""}.`,
  ];
  if (retro.bottleneck)
    lines.push(
      "",
      `Bottleneck: ${retro.bottleneck.stage}${retro.bottleneck.repository ? ` in ${retro.bottleneck.repository}` : ""}. ${retro.bottleneck.evidence}`,
    );
  for (const p of retro.proposals || [])
    lines.push(
      `- ${p.id} (${p.status}): ${String(p.title ?? p.key ?? p.target ?? p.type ?? "proposal").replace(/\s+/g, " ")}`,
    );
  return `${lines.join("\n")}\n\n${FENCE}\n${JSON.stringify(retro, null, 2)}\n\`\`\`\n`;
}

// The record a retro file holds, or null when it holds none.
export function parseRetroText(text) {
  const start = String(text).indexOf(`${FENCE}\n`);
  if (start < 0) return null;
  const body = text.slice(start + FENCE.length + 1),
    end = body.indexOf("\n```");
  if (end < 0) return null;
  try {
    const record = JSON.parse(body.slice(0, end));
    return record && typeof record === "object" && ID.test(record.id ?? "")
      ? record
      : null;
  } catch {
    return null;
  }
}

// Commit every finished retro not yet in git as it stands now, in one
// commit on main. A retro whose text a content rule matches is left out.
// Returns {commit, written} or null when nothing was new.
export async function writeRetroFiles(store, root) {
  const known = store.getMeta(META) || {},
    files = {},
    written = [];
  for (const retro of store.list("flow_retros")) {
    if (!FINISHED.has(retro.state) || !ID.test(retro.id ?? "")) continue;
    const text = retroText(retro),
      hash = digest(text);
    if (known[retro.id] === hash) continue;
    if (contentBinding(store)?.workspaceRoot) {
      const { findings, unavailable } = checkContent(store, {
        boundary: "proposal",
        target: `retro:${retro.id}`,
        text,
      });
      if (findings.length || unavailable.length) continue;
    }
    files[retroPath(retro.id)] = text;
    written.push([retro.id, hash]);
  }
  if (!written.length) return null;
  const made = await commitOnMain(root, files, {
    message:
      written.length === 1
        ? `Record retro ${written[0][0]}`
        : `Record ${written.length} retros`,
    env: agentAuthorEnv({}),
  });
  store.setMeta(META, { ...known, ...Object.fromEntries(written) });
  // The checkout shows the files it now holds, so its work tree stays clean.
  if (made)
    for (const [file, text] of Object.entries(files)) {
      const target = path.join(root, file);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
    }
  return { commit: made?.commit ?? null, written: written.map(([id]) => id) };
}

// Every retro record committed at `ref`.
export async function readRetroFiles(root, ref = "HEAD") {
  let names = [];
  try {
    names = (await git(root, ["ls-tree", "--name-only", ref, `${RETRO_DIR}/`]))
      .split("\n")
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
  const records = [];
  for (const name of names) {
    const text = await git(root, ["show", `${ref}:${name}`]).catch(() => "");
    const record = parseRetroText(text);
    if (record) records.push(record);
  }
  return records;
}
