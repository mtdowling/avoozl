import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const LOCAL_IGNORE_PATTERN = ".avoozl/local/";

function configuredExcludesFile({ env, home, run }) {
  try {
    const value = run(
      "git",
      ["config", "--global", "--path", "--get", "core.excludesFile"],
      {
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      },
    ).trim();
    if (value) return { filename: path.resolve(value), configured: true };
  } catch {}
  const configHome = env.XDG_CONFIG_HOME
    ? path.resolve(env.XDG_CONFIG_HOME)
    : path.join(home, ".config");
  return {
    filename: path.join(configHome, "git", "ignore"),
    configured: false,
  };
}

function hasLocalRule(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some(
      (line) =>
        !line.startsWith("#") &&
        !line.startsWith("!") &&
        [LOCAL_IGNORE_PATTERN, `/${LOCAL_IGNORE_PATTERN}`].includes(line),
    );
}

function targetStatus(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return {
      exists: true,
      safeToWrite: stat.isFile() && !stat.isSymbolicLink(),
      unsafeReason: stat.isSymbolicLink()
        ? "The global Git ignore is a symbolic link; edit its managed target manually."
        : stat.isFile()
          ? null
          : "The global Git ignore path is not a regular file.",
    };
  } catch (error) {
    if (error.code === "ENOENT")
      return { exists: false, safeToWrite: true, unsafeReason: null };
    throw error;
  }
}

export function globalLocalIgnoreStatus({
  env = process.env,
  home = os.homedir(),
  run = execFileSync,
} = {}) {
  const target = configuredExcludesFile({ env, home, run }),
    file = targetStatus(target.filename);
  let text = "";
  try {
    text = fs.readFileSync(target.filename, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    pattern: LOCAL_IGNORE_PATTERN,
    filename: target.filename,
    configured: target.configured,
    ignored: hasLocalRule(text),
    safeToWrite: file.safeToWrite,
    unsafeReason: file.unsafeReason,
  };
}

export function ensureGlobalLocalIgnore({
  env = process.env,
  home = os.homedir(),
  run = execFileSync,
} = {}) {
  const before = globalLocalIgnoreStatus({ env, home, run });
  if (!before.safeToWrite) throw Error(before.unsafeReason);
  fs.mkdirSync(path.dirname(before.filename), {
    recursive: true,
    mode: 0o755,
  });
  if (!before.ignored) {
    const flags =
        fs.constants.O_RDWR |
        fs.constants.O_APPEND |
        fs.constants.O_CREAT |
        (fs.constants.O_NOFOLLOW || 0),
      descriptor = fs.openSync(before.filename, flags, 0o644);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile())
        throw Error("The global Git ignore path is not a regular file.");
      const text = fs.readFileSync(descriptor, "utf8"),
        separator = text && !text.endsWith("\n") ? "\n" : "";
      if (!hasLocalRule(text)) {
        fs.appendFileSync(
          descriptor,
          `${separator}# Avoozl machine-local state\n${LOCAL_IGNORE_PATTERN}\n`,
        );
        fs.fsyncSync(descriptor);
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }
  if (!before.configured)
    run("git", ["config", "--global", "core.excludesFile", before.filename], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 5000,
    });
  return globalLocalIgnoreStatus({ env, home, run });
}
