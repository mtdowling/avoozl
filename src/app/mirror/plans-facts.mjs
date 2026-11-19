import { parseRepository } from "../github/github.mjs";
import { repoFilesOf } from "../git/repo-files.mjs";
import { specItems } from "../specs/spec-plans.mjs";
import { DEFAULT_SPECS_PATH } from "../specs/specs-path.mjs";

// The plans branch keeps specs at the default path.
const PREFIX = `${DEFAULT_SPECS_PATH}/`,
  specOf = (file) => file.slice(PREFIX.length).split("/")[0];

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
        prefix: PREFIX,
        want: (file) => file.slice(PREFIX.length).split("/").length > 1,
        text: (file) => /^[^/]+\/tasks\.md$/.test(file.slice(PREFIX.length)),
      },
    ),
    specNames = [...new Set([...blobs.keys()].map((file) => specOf(file)))],
    taskIds = [];
  for (const [file, text] of found) {
    const name = specOf(file);
    for (const item of specItems(name, text))
      if (item.id) taskIds.push(item.id);
  }
  return {
    commits: head ? [head] : [],
    specNames,
    taskIds,
  };
}
