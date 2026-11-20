// A task's definition digest (@@DEL:Requirement 102.3@@): the digest of its
// manifest entry, carried by each landing trailer so a landing names the
// exact task it completed. Key order does not matter.
import { digest } from "../../model.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export function taskDefinition(entry) {
  return digest(JSON.stringify(canonical(entry ?? null)));
}
