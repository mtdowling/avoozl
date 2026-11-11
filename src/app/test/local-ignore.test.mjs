import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ensureGlobalLocalIgnore,
  globalLocalIgnoreStatus,
  LOCAL_IGNORE_PATTERN,
} from "../local-ignore.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function gitConfig(initialFilename = null) {
  let filename = initialFilename;
  const calls = [];
  return {
    calls,
    run(command, args) {
      calls.push([command, ...args]);
      assert.equal(command, "git");
      if (args.includes("--get")) {
        if (!filename) throw Error("core.excludesFile is not configured");
        return filename + "\n";
      }
      assert.deepEqual(args.slice(0, -1), [
        "config",
        "--global",
        "core.excludesFile",
      ]);
      filename = args.at(-1);
      return "";
    },
  };
}

test("local ignore status recognizes only an active exact Avoozl rule", () => {
  const root = temporaryDirectory("avoozl-ignore-status-"),
    filename = path.join(root, "global-ignore"),
    git = gitConfig(filename);
  fs.writeFileSync(
    filename,
    [
      `# ${LOCAL_IGNORE_PATTERN}`,
      `!${LOCAL_IGNORE_PATTERN}`,
      ".avoozl/local/cache/",
      "",
    ].join("\n"),
  );

  assert.deepEqual(globalLocalIgnoreStatus({ run: git.run }), {
    pattern: LOCAL_IGNORE_PATTERN,
    filename,
    configured: true,
    ignored: false,
    safeToWrite: true,
    unsafeReason: null,
  });

  fs.appendFileSync(filename, `/${LOCAL_IGNORE_PATTERN}\n`);
  assert.equal(globalLocalIgnoreStatus({ run: git.run }).ignored, true);
});

test("local ignore setup creates and configures the XDG fallback once", () => {
  const root = temporaryDirectory("avoozl-ignore-fallback-"),
    configHome = path.join(root, "config"),
    filename = path.join(configHome, "git", "ignore"),
    git = gitConfig();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, "node_modules/");

  const first = ensureGlobalLocalIgnore({
    env: { XDG_CONFIG_HOME: configHome },
    home: path.join(root, "unused-home"),
    run: git.run,
  });
  const second = ensureGlobalLocalIgnore({
    env: { XDG_CONFIG_HOME: configHome },
    home: path.join(root, "unused-home"),
    run: git.run,
  });
  const text = fs.readFileSync(filename, "utf8");

  assert.equal(first.filename, filename);
  assert.equal(first.configured, true);
  assert.equal(first.ignored, true);
  assert.deepEqual(second, first);
  assert.equal(
    text.split(/\r?\n/).filter((line) => line === LOCAL_IGNORE_PATTERN).length,
    1,
  );
  assert.match(
    text,
    /^node_modules\/\n# Avoozl machine-local state\n\.avoozl\/local\/\n$/,
  );
  assert.equal(
    git.calls.filter(
      (call) =>
        call[1] === "config" &&
        call[2] === "--global" &&
        call[3] === "core.excludesFile" &&
        call[4] !== "--get",
    ).length,
    1,
  );
});

test("local ignore setup honors an existing core.excludesFile", () => {
  const root = temporaryDirectory("avoozl-ignore-existing-"),
    filename = path.join(root, "shared-ignore"),
    git = gitConfig(filename);
  fs.writeFileSync(filename, `${LOCAL_IGNORE_PATTERN}\n`);

  const before = fs.readFileSync(filename, "utf8"),
    result = ensureGlobalLocalIgnore({ run: git.run });

  assert.equal(result.filename, filename);
  assert.equal(result.configured, true);
  assert.equal(result.ignored, true);
  assert.equal(fs.readFileSync(filename, "utf8"), before);
  assert.equal(
    git.calls.some(
      (call) =>
        call[1] === "config" &&
        call[2] === "--global" &&
        call[3] === "core.excludesFile" &&
        call[4] !== "--get",
    ),
    false,
  );
});

test("local ignore setup refuses to follow a configured symbolic link", () => {
  const root = temporaryDirectory("avoozl-ignore-link-"),
    target = path.join(root, "managed-ignore"),
    filename = path.join(root, "global-ignore"),
    git = gitConfig(filename);
  fs.writeFileSync(target, "node_modules/\n");
  fs.symlinkSync(target, filename);

  const status = globalLocalIgnoreStatus({ run: git.run });
  assert.equal(status.ignored, false);
  assert.equal(status.safeToWrite, false);
  assert.match(status.unsafeReason, /symbolic link/);
  assert.throws(
    () => ensureGlobalLocalIgnore({ run: git.run }),
    /symbolic link/,
  );
  assert.equal(fs.readFileSync(target, "utf8"), "node_modules/\n");
});
