#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcher = path.join(root, "canvas-backend", "avoozl-backend");
const output = path.join(root, "canvas-app", "backend");

function digest(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function octal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0") + "\0";
  header.write(encoded, offset, length, "ascii");
}

function entry(name, body, { mode, type }) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  octal(header, 100, 8, mode);
  octal(header, 108, 8, 0);
  octal(header, 116, 8, 0);
  octal(header, 124, 12, body.length);
  octal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function archive() {
  const body = fs.readFileSync(launcher);
  return gzipSync(
    Buffer.concat([
      entry("bin/", Buffer.alloc(0), { mode: 0o755, type: "5" }),
      entry("bin/avoozl-backend", body, { mode: 0o755, type: "0" }),
      Buffer.alloc(1024),
    ]),
    { level: 9, mtime: 0 },
  );
}

fs.mkdirSync(output, { recursive: true });
const contents = archive();
const artifacts = {};
for (const platform of ["linux-amd64", "linux-arm64"]) {
  const file = path.join(output, `avoozl-${platform}.tar.gz`);
  fs.writeFileSync(file, contents);
  artifacts[platform] = {
    path: path.relative(path.join(root, "canvas-app"), file),
    sha256: digest(file),
  };
}
console.log(JSON.stringify({ artifacts }, null, 2));
