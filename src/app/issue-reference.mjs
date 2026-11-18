import { fail } from "./store.mjs";

const REFERENCE =
  /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,9})$/;

export function parseIssueReference(value) {
  const match = typeof value === "string" ? REFERENCE.exec(value) : null;
  if (!match || match[2] === "." || match[2].includes(".."))
    fail("Name the issue as owner/repo#number.", 64);
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}
