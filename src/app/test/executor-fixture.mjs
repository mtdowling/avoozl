// Preserve native behavior assertions at the private adapter boundary while
// tests also exercise the planner's portable request shape.
import { kirocrewConfiguration } from "../executors/kirocrew.mjs";
export function nativeDispatch(store, request) {
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
