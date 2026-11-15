import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Writable } from "node:stream";
import { parseArguments, parseReceipt, wrap } from "../build-receipt.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const sink = () => {
  const chunks = [];
  return {
    stream: new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    }),
    text: () => chunks.join(""),
  };
};
const script = (dir, name, body) => {
  fs.writeFileSync(path.join(dir, name), body);
  return `node ${name}`;
};
const lines = (dir, file = "build-receipt.jsonl") =>
  fs
    .readFileSync(path.join(dir, file), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("the command's output and exit code pass through, and one receipt is written", async () => {
  const cwd = temporaryDirectory(),
    out = sink(),
    err = sink();
  fs.writeFileSync(
    path.join(cwd, "job.mjs"),
    'console.log("built 3"); console.error("warn"); process.exit(3)',
  );
  const code = await wrap(
    ["--issue", "12", "--target", "linux/x", "--", "node", "job.mjs"],
    { cwd, out: out.stream, err: err.stream, env: {} },
  );
  assert.equal(code, 3);
  assert.match(out.text(), /built 3/);
  assert.match(err.text(), /warn/);
  const [receipt] = lines(cwd);
  assert.equal(receipt.issue, 12);
  assert.equal(receipt.target, "linux/x");
  assert.equal(receipt.command, "node job.mjs");
  assert.equal(receipt.exit, 3);
  assert.equal(receipt.start, "unknown");
  assert.ok(receipt.ms >= 0);
  assert.deepEqual(receipt.counters, {});
  assert.ok(Buffer.byteLength(JSON.stringify(receipt)) < 2048);
});

test("the repository's parser gives the counters; a failing parser still writes a receipt", async () => {
  const cwd = temporaryDirectory(),
    quiet = sink();
  fs.writeFileSync(path.join(cwd, "job.mjs"), 'console.log("hits=7 misses=2")');
  const good = script(
    cwd,
    "parse.mjs",
    'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const m=/hits=(\\d+) misses=(\\d+)/.exec(t);console.log(JSON.stringify({hits:+m[1],misses:+m[2],note:"x"}))})',
  );
  fs.writeFileSync(
    path.join(cwd, ".avoozl.json"),
    JSON.stringify({ version: 1, receipts: { parser: good } }),
  );
  await wrap(["--", "node", "job.mjs"], {
    cwd,
    out: quiet.stream,
    err: quiet.stream,
    env: {},
  });
  assert.deepEqual(lines(cwd)[0].counters, { hits: 7, misses: 2 });
  const bad = script(cwd, "bad.mjs", "process.exit(9)");
  fs.writeFileSync(
    path.join(cwd, ".avoozl.json"),
    JSON.stringify({ version: 1, receipts: { parser: bad } }),
  );
  const code = await wrap(["--", "node", "job.mjs"], {
    cwd,
    out: quiet.stream,
    err: quiet.stream,
    env: {},
  });
  assert.equal(code, 0);
  assert.deepEqual(lines(cwd)[1].counters, {});
});

test("cold and warm come from the repository's check", async () => {
  const cwd = temporaryDirectory(),
    quiet = sink();
  fs.writeFileSync(path.join(cwd, "job.mjs"), "");
  const run = async (check) => {
    fs.writeFileSync(
      path.join(cwd, ".avoozl.json"),
      JSON.stringify({ version: 1, receipts: { warmCheck: check } }),
    );
    await wrap(["--", "node", "job.mjs"], {
      cwd,
      out: quiet.stream,
      err: quiet.stream,
      env: {},
    });
    return lines(cwd).at(-1).start;
  };
  assert.equal(await run(script(cwd, "yes.mjs", "process.exit(0)")), "warm");
  assert.equal(await run(script(cwd, "no.mjs", "process.exit(1)")), "cold");
  assert.equal(await run("no-such-command-here-xyz"), "cold");
});

test("a receipt that cannot be written never changes the result", async () => {
  const cwd = temporaryDirectory(),
    quiet = sink();
  fs.writeFileSync(path.join(cwd, "job.mjs"), "process.exit(4)");
  fs.writeFileSync(path.join(cwd, "blocked"), "a file, not a folder");
  const code = await wrap(
    ["--file", "blocked/receipt.jsonl", "--", "node", "job.mjs"],
    { cwd, out: quiet.stream, err: quiet.stream, env: {} },
  );
  assert.equal(code, 4);
});

test("a command that cannot start exits 127 and still leaves a receipt", async () => {
  const cwd = temporaryDirectory(),
    quiet = sink();
  const code = await wrap(["--", "no-such-command-here-xyz"], {
    cwd,
    out: quiet.stream,
    err: quiet.stream,
    env: {},
  });
  assert.notEqual(code, 0);
  assert.equal(lines(cwd).length, 1);
});

test("arguments: unknown options are refused; parseReceipt keeps only a valid line", () => {
  assert.throws(() => parseArguments(["--nope", "1", "--", "x"]));
  assert.equal(parseReceipt("not json"), null);
  assert.equal(parseReceipt('{"v":2,"command":"x","ms":1}'), null);
  const kept = parseReceipt(
    '{"v":1,"command":"npm test","ms":5,"start":"warm","exit":0,"target":"t","counters":{"a":1,"b":"x"}}',
  );
  assert.deepEqual(kept.counters, { a: 1 });
  assert.equal(kept.start, "warm");
});
