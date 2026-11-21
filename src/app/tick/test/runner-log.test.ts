import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { temporaryDirectory } from "../../test/temporary.ts";
import { openRunnerLog } from "../runner-log.ts";

test("a runner log past its cap moves aside, so at most two stay", () => {
  const log = path.join(temporaryDirectory("avoozl-runner-log-"), "r.log"),
    write = (text: string) => {
      const fd = openRunnerLog(log, 8);
      fs.writeSync(fd, text);
      fs.closeSync(fd);
    };
  write("first ");
  write("second ");
  assert.equal(fs.readFileSync(log, "utf8"), "first second ");
  write("third");
  assert.equal(fs.readFileSync(log, "utf8"), "third");
  assert.equal(fs.readFileSync(`${log}.1`, "utf8"), "first second ");
  if (process.platform !== "win32")
    assert.equal(fs.statSync(log).mode & 0o777, 0o600);
});
