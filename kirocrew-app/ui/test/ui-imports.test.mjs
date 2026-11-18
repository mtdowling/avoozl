// A view reaches Kiro Crew's components only through the page's own modules in
// src/ui/ (UC1.2): a change of Kiro Crew's part then reaches the page through
// one file. Only src/ui/ imports @kirocrew/app-sdk/ui.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));

test("no view imports @kirocrew/app-sdk/ui directly", () => {
  const direct = readdirSync(src, { recursive: true })
    .map((name) => name.split(path.sep).join("/"))
    .filter(
      (name) =>
        /\.tsx?$/.test(name) &&
        !name.startsWith("ui/") &&
        !name.endsWith(".d.ts"),
    )
    .filter((name) =>
      /@kirocrew\/app-sdk\/ui['"]/.test(
        readFileSync(path.join(src, name), "utf8"),
      ),
    );
  assert.deepEqual(direct, []);
});
