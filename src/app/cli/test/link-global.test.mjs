import assert from "node:assert/strict";
import { test } from "node:test";
import { linkCommand, skipReason } from "../link-global.mjs";

const checkout = "/home/me/avoozl";

test("an install in a checkout links the global command", () => {
  assert.equal(skipReason({}, checkout), "");
});

test("CI, global, dependency and opted-out installs do not link", () => {
  assert.match(skipReason({ CI: "true" }, checkout), /CI/);
  assert.match(
    skipReason({ npm_config_global: "true" }, checkout),
    /global install/,
  );
  assert.match(
    skipReason({ AVOOZL_NO_GLOBAL_LINK: "1" }, checkout),
    /AVOOZL_NO_GLOBAL_LINK/,
  );
  assert.match(
    skipReason({}, "/home/me/app/node_modules/avoozl"),
    /dependency/,
  );
  assert.match(
    skipReason({}, "C:\\Users\\me\\app\\node_modules\\avoozl"),
    /dependency/,
  );
});

test("the link runs the calling npm without scripts", () => {
  const [command, args] = linkCommand(
    { npm_execpath: "/usr/lib/npm/bin/npm-cli.js" },
    checkout,
  );
  assert.equal(command, process.execPath);
  assert.equal(args[0], "/usr/lib/npm/bin/npm-cli.js");
  assert.ok(args.includes("--global"));
  assert.ok(args.includes("--ignore-scripts"));
  assert.equal(args.at(-1), checkout);
  assert.equal(linkCommand({}, checkout)[0], "npm");
});
