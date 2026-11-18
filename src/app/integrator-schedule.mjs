// Which ready entries go in one train, by footprint (landing-trains lt-10.1,
// LT12, D13). Pure over the entries: no store, no git.
import { pathsOverlap } from "./release-ranking.mjs";

const overlap = (a, b) => pathsOverlap(a.footprint ?? [], b.footprint ?? []);

// `ready` is in queue order. Returns {members, held}: at most `maxBranches`
// members, and `held` for entries pushed to a later train for overlap.
//   same-train  an entry that overlaps a member joins right after it, past
//               entries that do not overlap, when what it was built on is
//               already in the train and the train stays within maxBranches.
//   serialize   an entry that overlaps an earlier member waits for the next
//               train, and so does anything built on it.
export function composeTrain(ready, { overlap: mode, maxBranches }) {
  const held = [];
  if (mode === "serialize") {
    const members = [],
      left = new Set();
    for (const entry of ready) {
      if (members.length >= maxBranches) break;
      const clash = members.find((m) => overlap(m, entry)),
        blocked = (entry.builtOn ?? []).find((key) => left.has(key));
      if (clash || blocked) {
        left.add(entry.key);
        held.push({
          key: entry.key,
          reason: clash
            ? `overlaps ${clash.key}, so it waits for the next train`
            : `built on ${blocked}, which waits for the next train`,
        });
      } else members.push(entry);
    }
    return { members, held };
  }
  const out = [],
    rest = [...ready];
  while (rest.length) {
    const block = [rest.shift()];
    for (let k = 0; k < block.length; k++)
      for (let i = 0; i < rest.length; ) {
        const later = rest[i],
          needs = (later.builtOn ?? []).filter((key) =>
            rest.some((e) => e.key === key && e !== later),
          );
        if (overlap(block[k], later) && !needs.length)
          block.push(...rest.splice(i, 1));
        else i += 1;
      }
    out.push(...block);
  }
  return { members: out.slice(0, maxBranches), held };
}
