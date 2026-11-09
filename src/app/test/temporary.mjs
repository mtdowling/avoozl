import { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directories = new Set();
// Per-test hooks close servers, SQLite handles, and child processes first.
// Windows cannot remove their files while those resources remain open.
after(() => {
  for (const root of directories)
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
});
export function temporaryDirectory(prefix = "aicommander-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.add(root);
  return root;
}
