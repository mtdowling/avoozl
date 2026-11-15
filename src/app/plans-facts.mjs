import { parseRepository } from "./github.mjs";
import { specItems } from "./spec-plans.mjs";

// What a forward must not carry (RC25.6c): the plans branch head commit and
// the folder name and task IDs of each private spec. A missing branch or folder reads as
// none; any other failure throws, so a forward never passes on a guess.
export async function plansBranchFacts(github, mirror) {
  const repository = parseRepository(mirror.mirror),
    none = (error) => {
      if (error.status === 404) return null;
      throw error;
    },
    head = await github.branch(repository, mirror.plansBranch).catch(none),
    listing = await github
      .contents(repository, ".kiro/specs", mirror.plansBranch)
      .catch(none);
  const specNames = Array.isArray(listing)
      ? listing
          .filter((entry) => entry.type === "dir")
          .map((entry) => entry.name)
      : [],
    taskIds = [];
  for (const name of specNames) {
    const file = await github
      .contents(repository, `.kiro/specs/${name}/tasks.md`, mirror.plansBranch)
      .catch(none);
    if (typeof file?.content !== "string") continue;
    const text = Buffer.from(file.content, file.encoding || "base64").toString(
      "utf8",
    );
    for (const item of specItems(name, text))
      if (item.id) taskIds.push(item.id);
  }
  return {
    commits: head?.commit?.sha ? [head.commit.sha] : [],
    specNames,
    taskIds,
  };
}
