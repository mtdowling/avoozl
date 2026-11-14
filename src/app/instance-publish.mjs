// Each Avoozl publishes its ID and display name once in its private mirror, as
// a repository Actions variable, so another Avoozl reading a marker's
// `instance=<id>` can show a name. Never on a public repository: nothing is
// written there, and the refusal is a notice, not a retry loop.
// shortcut: published once per name (kept in the workspace database), so a
// variable someone deletes comes back only on the next rename. Read the list
// each tick if that matters.
import { parseRepository } from "./github.mjs";
import { instanceIdentity, instanceVariableName } from "./instance.mjs";

const META = "instancePublished";
const ERRORS = "instancePublishErrors";

// The tick step. Returns {errors}; a refusal or a failed write is retried on
// the next tick, and never throws.
export async function publishInstanceStep(store, github, { policy } = {}) {
  // No mirror, nothing to publish, and no identity made just to find out.
  if (!Object.values(policy?.repositories || {}).some((e) => e.mirror))
    return { errors: [] };
  const errors = [],
    seen = store.getMeta(ERRORS) ?? {},
    now = {},
    { id, name } = instanceIdentity(store),
    done = store.getMeta(META) ?? {};
  let changed = false;
  for (const entry of Object.values(policy?.repositories || {})) {
    const mirror = entry.mirror?.mirror;
    if (!mirror || !github?.available?.() || done[mirror] === name) continue;
    // A notice once per cause, not once per tick.
    const fail = (text) => {
      now[mirror] = text;
      if (seen[mirror] !== text) errors.push(text);
    };
    try {
      const remote = await github.repository(parseRepository(mirror));
      if (remote?.private !== true) {
        fail(
          `${mirror} is not private, so Avoozl did not publish its name there.`,
        );
        continue;
      }
      await github.setRepoVariable(mirror, instanceVariableName(id), name);
      done[mirror] = name;
      changed = true;
    } catch (error) {
      fail(`Avoozl could not publish its name to ${mirror}: ${error.message}`);
    }
  }
  if (changed) store.setMeta(META, done);
  if (JSON.stringify(seen) !== JSON.stringify(now)) store.setMeta(ERRORS, now);
  return { errors };
}
