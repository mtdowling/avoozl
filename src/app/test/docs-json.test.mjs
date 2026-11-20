// JSON shown in the docs is pretty-printed: 2-space indent, one key per line.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const skip = ["docs/research", "docs/evidence"];

function* markdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (!skip.includes(rel) && entry.name !== "node_modules")
        yield* markdown(file);
    } else if (entry.name.endsWith(".md")) yield file;
  }
}

test("json blocks in the docs are pretty-printed", () => {
  const files = [
    path.join(root, "README.md"),
    ...["docs", "kirocrew-app/skills", "prompts", ".kiro/specs"].flatMap(
      (d) => [...markdown(path.join(root, d))],
    ),
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/^( *)```json[^\n]*\n([\s\S]*?)^\1```/gm)) {
      const body = m[2]
        .split("\n")
        .map((l) => l.slice(m[1].length))
        .join("\n")
        .trim();
      const where = `${path.relative(root, file)}: ${body.slice(0, 40)}`;
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        // A fragment or placeholder block: one line may hold only one key.
        assert.ok(
          !(!body.includes("\n") && (body.match(/"\s*:/g) ?? []).length > 1),
          `${where}: write it across lines`,
        );
        continue;
      }
      assert.equal(body, JSON.stringify(parsed, null, 2), where);
    }
  }
});
