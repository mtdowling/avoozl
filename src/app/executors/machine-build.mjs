// The machine server's build id (MS3.4): the package version and a hash of
// its source files.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function sourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}

let build = null;

// Computed once per process.
export function buildId() {
  if (build) return build;
  const hash = crypto.createHash("sha256");
  for (const file of [
    ...sourceFiles(path.join(ROOT, "src")),
    path.join(ROOT, "cli.mjs"),
  ].sort()) {
    hash.update(path.relative(ROOT, file).replaceAll("\\", "/"));
    hash.update(fs.readFileSync(file));
  }
  const { version } = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  return (build = `${version}+${hash.digest("hex").slice(0, 12)}`);
}
