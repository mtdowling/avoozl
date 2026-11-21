// One logical check shares read promises, including failures, independently
// of HTTP freshness. Async-local scopes keep concurrent workspaces isolated.
import { AsyncLocalStorage } from "node:async_hooks";
// Per check: client -> read key -> the shared promise.
const scope = new AsyncLocalStorage<
  Map<object, Map<string, Promise<unknown>>>
>();
export const withGitHubReadSnapshots = <T>(run: () => T) =>
  scope.run(new Map(), run);
export function sharedGitHubRead<T>(
  client: object,
  key: string,
  read: () => T | Promise<T>,
): Promise<T> | T {
  const check = scope.getStore();
  if (!check) return read();
  if (!check.has(client)) check.set(client, new Map());
  const reads = check.get(client)!;
  if (!reads.has(key)) reads.set(key, Promise.resolve().then(read));
  return reads.get(key) as Promise<T>;
}
