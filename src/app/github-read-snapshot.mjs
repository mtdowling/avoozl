// One logical check shares read promises, including failures, independently
// of HTTP freshness. Async-local scopes keep concurrent workspaces isolated.
import { AsyncLocalStorage } from "node:async_hooks";
const scope = new AsyncLocalStorage();
export const withGitHubReadSnapshots = (run) => scope.run(new Map(), run);
export function sharedGitHubRead(client, key, read) {
  const check = scope.getStore();
  if (!check) return read();
  if (!check.has(client)) check.set(client, new Map());
  const reads = check.get(client);
  if (!reads.has(key)) reads.set(key, Promise.resolve().then(read));
  return reads.get(key);
}
