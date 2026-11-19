#!/usr/bin/env node
// Fails when git tracks an image. Screenshots are never committed: keep them
// outside git (.avoozl-shots/ or the temp folder) and show them in chat.
// ALLOWED lists the real app assets.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALLOWED = new Set(["kirocrew-app/assets/icon.png"]);
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

export const trackedImages = (files) =>
  files.filter((f) => IMAGE.test(f) && !ALLOWED.has(f));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const bad = trackedImages(files);
  for (const f of bad) console.error(`Tracked image: ${f}`);
  if (bad.length) {
    console.error(
      `${bad.length} image file(s) are tracked. Screenshots stay outside git; remove them with git rm.`,
    );
    process.exit(1);
  }
}
