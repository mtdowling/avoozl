// The review of a forward (RC26.5.4, design D31.2 and D31.3). The hash binds
// the exact public diff, title and body, the commit they make and where it
// goes, so a push can happen only on what the person saw. The commit hash
// already holds the tree, the parent, the author and the message.
import { sha256 } from "../content/content-rules.mjs";

export const reviewHash = ({ diff, title, body, commit, branch, target }) =>
  sha256(JSON.stringify([diff, title, body, commit, branch, target]));
