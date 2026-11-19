#!/usr/bin/env node
// Proof uc-p1 (spec ui-components), steps 2 and 3: a change of look is one
// edit in src/ui/. Step 1 (a new look for Hint) is screenshots; see
// docs/evidence/ui-components-p1.md.
//
//   node scripts/proof-uc-p1.mjs
//
// Step 2 renames one theme variable (--muted, everywhere Kiro Crew's sheet
// names it) in a scratch copy of the pinned Kiro Crew stylesheet, the one
// host-classes.test.mjs checks against. It runs the class check
// (class-tokens.mjs and Box's class table) on the scratch sheet, and lists
// every file under src/ that reads a variable the scratch sheet no longer
// defines. The class check reads classes only, so the variable list is this
// script's own.
//
// Step 3 counts, per file, the classes, styles, <style> elements and theme
// variables each file under src/ writes. src/standalone/ is the host shim the
// standalone build draws around the page in place of Kiro Crew (SW1); the
// Kiro Crew bundle does not include it, and raw-style.test.mjs skips it too.
// It is listed apart, not hidden.
//
// Prints JSON; exits 1 when a file outside src/ui/ and src/standalone/ shows
// up in either step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "rolldown/utils";
import { missingClasses } from "../kirocrew-app/ui/test/class-tokens.mjs";
import {
  kirocrewStylesheet,
  pin,
} from "../kirocrew-app/ui/test/kirocrew-css.mjs";

// The raw-style test's count (kirocrew-app/ui/test/raw-style.test.mjs): className
// and style attributes, <style> elements and `var(--` in strings and templates.
function rawStyleCount(file, text) {
  const { program } = parseSync(file, text, {
    lang: file.endsWith("x") ? "tsx" : "ts",
  });
  const found = { className: 0, style: 0, styleElement: 0, cssVariable: 0 };
  const vars = (t) => (t.match(/var\(--/g) ?? []).length;
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (
      node.type === "JSXAttribute" &&
      node.name.type === "JSXIdentifier" &&
      node.name.name === "className"
    )
      found.className++;
    if (
      node.type === "JSXAttribute" &&
      node.name.type === "JSXIdentifier" &&
      node.name.name === "style"
    )
      found.style++;
    if (
      node.type === "JSXOpeningElement" &&
      node.name.type === "JSXIdentifier" &&
      node.name.name === "style"
    )
      found.styleElement++;
    if (node.type === "Literal" && typeof node.value === "string")
      found.cssVariable += vars(node.value);
    if (node.type === "TemplateElement")
      found.cssVariable += vars(node.value.raw);
    if (node.type === "JSXText") found.cssVariable += vars(node.value);
    for (const key of Object.keys(node)) if (key !== "type") visit(node[key]);
  };
  visit(program);
  return found;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "kirocrew-app", "ui", "src");
const RENAMED = "--muted";

const files = fs
  .readdirSync(src, { recursive: true })
  .map((name) => name.split(path.sep).join("/"))
  .filter((name) => /\.(tsx?|json)$/.test(name) && !name.endsWith(".d.ts"));
const read = (name) => fs.readFileSync(path.join(src, name), "utf8");
const inUi = (name) => name.startsWith("ui/");
const isShim = (name) => name.startsWith("standalone/");

// Box's class table: every class src/ui/box.json can write.
const box = JSON.parse(read("ui/box.json"));
const boxClasses = [
  ...Object.values(box.flags ?? {}),
  ...Object.values(box.scales ?? {}).flatMap(Object.values),
];
const escape = (token) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
const classCheck = (css) => [
  ...missingClasses(
    css,
    Object.fromEntries(
      files
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => [name, read(name)]),
    ),
  ),
  ...boxClasses
    .filter((name) => !css.includes(`.${escape(name)}`))
    .map((name) => `${name}: ui/box.json`),
];

// Step 2: the scratch stylesheet.
const original = await kirocrewStylesheet();
const name = new RegExp(`${RENAMED}(?![\\w-])`, "g");
const scratch = original.replace(name, `${RENAMED}-renamed`);
const defines = (css, variable) => new RegExp(`${variable}:`).test(css);
const readers = files.filter((file) =>
  new RegExp(`var\\(${RENAMED}[,)]`).test(read(file)),
);
const step2 = {
  stylesheet: `Kiro Crew ${pin.release}, sha256 ${pin.sha256}`,
  renamed: `${RENAMED} -> ${RENAMED}-renamed (${original.match(name).length} places)`,
  originalDefines: defines(original, `${RENAMED}(?![\\w-])`),
  scratchDefines: defines(scratch, `${RENAMED}(?![\\w-])`),
  classCheckOnOriginal: classCheck(original),
  classCheckOnScratch: classCheck(scratch),
  filesThatReadTheRenamedVariable: readers,
  outsideUi: readers.filter((file) => !inUi(file)),
};

// Step 3: who writes a class, a style or a theme variable.
const writers = {};
for (const file of files) {
  const text = read(file);
  let n;
  if (file.endsWith(".json")) {
    const data = JSON.parse(text);
    const classes = [
      ...Object.values(data.flags ?? {}),
      ...Object.values(data.scales ?? {}).flatMap(Object.values),
    ].length;
    n = classes + (text.match(/var\(--/g) ?? []).length;
  } else
    n = Object.values(rawStyleCount(file, text)).reduce((a, b) => a + b, 0);
  if (n) writers[file] = n;
}
const step3 = {
  files: Object.keys(writers).length,
  inUi: Object.keys(writers).filter(inUi).length,
  standaloneShim: Object.keys(writers).filter(isShim),
  outsideUi: Object.keys(writers).filter(
    (file) => !inUi(file) && !isShim(file),
  ),
  writers,
};

const ok =
  step2.originalDefines &&
  !step2.scratchDefines &&
  readers.length > 0 &&
  step2.outsideUi.length === 0 &&
  step2.classCheckOnOriginal.length === 0 &&
  step3.outsideUi.length === 0;
console.log(JSON.stringify({ step2, step3, ok }, null, 2));
process.exit(ok ? 0 : 1);
