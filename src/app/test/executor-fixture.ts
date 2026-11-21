// Preserve native behavior assertions at the private adapter boundary while
// tests also exercise the planner's portable request shape.
import { kirocrewConfiguration } from "../executors/kirocrew.ts";
import type { Store } from "../store/store.ts";

export function nativeDispatch(
  store: Store,
  request: { executor?: string; [key: string]: unknown },
) {
  if (request.executor !== "kirocrew")
    throw Error("This fixture handles only native requests.");
  const {
    id,
    version,
    operation,
    executor,
    worktree,
    permissionClass,
    ...legacy
  } = request;
  return { ...legacy, ...kirocrewConfiguration(store, request) };
}
