import { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directories = new Set();

// Make every entry under `root` writable: Windows refuses to delete a
// read-only file (git writes its objects read-only).
function writable(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    try {
      fs.chmodSync(target, 0o777);
    } catch {}
    if (entry.isDirectory()) writable(target);
  }
}

// Per-test hooks close servers, SQLite handles, and child processes first.
// Windows cannot remove their files while those resources remain open.
after(() => {
  for (const root of directories) {
    const remove = () =>
      fs.rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    try {
      remove();
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
      writable(root);
      try {
        remove();
      } catch (again) {
        // shortcut: a handle this process still holds keeps the folder on
        // Windows until the test process exits; the runner's temp folder is
        // discarded. Close the handle in the test if this starts to matter.
        if (process.platform !== "win32") throw again;
        process.emitWarning(`left ${root}: ${again.code}`);
      }
    }
  }
});
export function temporaryDirectory(prefix = "avoozl-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.add(root);
  return root;
}
