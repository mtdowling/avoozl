// The example parity check: fails a change to schema/ between --from and
// --to, and says which arguments and credentials it was given.
import { execFileSync } from "node:child_process";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const from = arg("--from"),
  to = arg("--to");
console.log(`repo=${arg("--repo")} from=${from} to=${to}`);
for (const name of [
  "PARITY_TOKEN",
  "GH_TOKEN",
  "SSH_AUTH_SOCK",
  "KIROCREW_PROXY_SECRET",
])
  console.log(
    `env ${name}=${process.env[name] === undefined ? "absent" : "present"}`,
  );
const changed = execFileSync("git", ["diff", "--name-only", from, to], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
if (changed.some((file) => file.startsWith("schema/"))) {
  console.log("parity: the schema changed");
  process.exit(1);
}
console.log("parity: same");
