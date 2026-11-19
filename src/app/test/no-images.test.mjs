import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { trackedImages } from "../../../scripts/check/check-no-images.mjs";
import { assertShotOutsideGit } from "../../../kirocrew-app/ui/test/browser/chrome.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

test("only the listed app assets may be tracked images", () => {
  assert.deepEqual(
    trackedImages([
      "kirocrew-app/assets/icon.png",
      "docs/evidence/x/after/a.PNG",
      "b.jpeg",
      "c.webp",
      "d.gif",
      "README.md",
    ]),
    ["docs/evidence/x/after/a.PNG", "b.jpeg", "c.webp", "d.gif"],
  );
});

test("screenshots go to .avoozl-shots or outside the repository", () => {
  assertShotOutsideGit(path.join(repo, ".avoozl-shots", "x", "a.png"));
  assertShotOutsideGit(path.join(os.tmpdir(), "a.png"));
  assert.throws(
    () => assertShotOutsideGit(path.join(repo, "docs", "evidence", "a.png")),
    /outside git/,
  );
});
