import { parseRepository } from "./github.mjs";
import { repoFilesOf } from "./repo-files.mjs";
import { specItems } from "./spec-plans.mjs";

// What a forward must not carry (RC25.6c): the plans branch head commit and
// the folder name and task IDs of each private spec. A missing branch or folder reads as
// none; any other failure throws, so a forward never passes on a guess.
export async function plansBranchFacts(
  github,
  mirror,
  files = repoFilesOf(github),
) {
  const repository = parseRepository(mirror.mirror),
    head = await files.head(repository, mirror.plansBranch),
    { files: found, blobs } = await files.readAt(
      repository,
      head ?? mirror.plansBranch,
      {
        prefix: ".kiro/specs/",
        want: (file) => file.split("/").length > 3,
        text: (file) => /^\.kiro\/specs\/[^/]+\/tasks\.md$/.test(file),
      },
    ),
    specNames = [
      ...new Set([...blobs.keys()].map((file) => file.split("/")[2])),
    ],
    taskIds = [];
  for (const [file, text] of found) {
    const name = file.split("/")[2];
    for (const item of specItems(name, text))
      if (item.id) taskIds.push(item.id);
  }
  return {
    commits: head ? [head] : [],
    specNames,
    taskIds,
  };
}
