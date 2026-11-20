// The Release queue: mirror forwards merged in a private mirror and not yet
// public (RC24.5). No repository is released by label, so the queue holds
// only these.
import { mirrorForwards } from "./mirror-forward.mjs";

export function releaseQueue(store) {
  return {
    repositories: [],
    forwards: mirrorForwards(store).filter(
      (record) => record.state !== "public_merged",
    ),
  };
}
