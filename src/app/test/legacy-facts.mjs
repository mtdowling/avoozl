// Test helper: the old revision hash, and the stored-layout fold the
// reader uses (spec-legacy.mjs), for fixtures that still describe facts as
// a manifest object (Requirement 111.6, 111.10).
import { digest } from "../../model.mjs";
import { foldManifest } from "../specs/spec-legacy.mjs";
import { withoutMarks, withoutStatus } from "../specs/spec-plans.mjs";

const MANIFEST = "avoozl/manifest.json";

// The old revision hash: the manifest's raw text is part of it.
export function legacyHash(files) {
  return digest(
    ["requirements.md", "bugfix.md", "design.md", "tasks.md", MANIFEST]
      .filter((file) => files[file] !== undefined)
      .map((file) => {
        const text =
          file === MANIFEST
            ? files[file]
            : withoutStatus(
                file === "tasks.md" ? withoutMarks(files[file]) : files[file],
              );
        return `${file}\0${text}\0`;
      })
      .join(""),
  );
}

export { foldManifest };
