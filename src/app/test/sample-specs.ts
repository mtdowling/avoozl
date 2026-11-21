// The Recipe Box sample specs the page tests' sample workspace drafts
// (demo-fixture.mjs). Every name in them is made up. Test only.
import { taskToken } from "../specs/spec-refs.ts";

// A task item and its done bullets (simplify §D20); a person's task ends
// its title with the tag.
// One task's manifest entry.
interface Leaf {
  repository: string;
  acceptance: string[];
  summary?: string[];
  manual?: boolean;
  requires?: string[];
}
// One sample spec: its phases of [id, title] items and their entries.
interface SampleSpec {
  title: string;
  goal: string;
  phases: [string, [string, string][]][];
  manifest: Record<string, Leaf>;
}

const item = (
  id: string,
  title: string,
  { acceptance = [], manual = false }: Partial<Leaf>,
) =>
  [
    `- [ ] ${taskToken(id)} ${title}${manual ? " (**MANUAL**)" : ""}`,
    ...acceptance.map((line) => `  - ${line}`),
  ].join("\n");

const leaf = (done: string, extra: Partial<Leaf> = {}): Leaf => ({
  repository: "app",
  acceptance: [done],
  ...extra,
});

// Three specs under one epic, each with phases from tasks.md headings.
// `word` says what the sample is in its own text: "demo" or "example".
export function sampleSpecs({ word = "demo" } = {}) {
  const specs: Record<string, SampleSpec> = {
    "recipe-import": {
      title: "Recipe import",
      goal: "Paste a link to a recipe and get a clean recipe card.",
      phases: [
        [
          "Read the page",
          [
            ["1.1", "Import a recipe from a link"],
            ["1.2", "Parse ingredients into lines"],
          ],
        ],
        [
          "Tell people what went wrong",
          [
            ["2.1", "Show import errors in plain words"],
            ["2.2", "Check the import on a phone"],
          ],
        ],
      ],
      manifest: {
        1.1: leaf("A pasted link becomes a recipe card."),
        1.2: leaf("Each ingredient is one line with an amount.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A failed import says why in one sentence.", {
          requires: ["1.2"],
        }),
        2.2: {
          repository: "app",
          summary: ["A person imports three recipes on a phone."],
          acceptance: ["Three imports work on a phone."],
          manual: true,
          requires: ["2.1"],
        },
      },
    },
    "meal-planner": {
      title: "Meal planner",
      goal: "Drag recipes onto a week and see what to cook each day.",
      phases: [
        [
          "The week",
          [
            ["1.1", "Week grid for the meal planner"],
            ["1.2", "Drag a recipe onto a day"],
          ],
        ],
        ["Sharing", [["2.1", "Share the week with a link"]]],
      ],
      manifest: {
        1.1: leaf("A week shows seven days with meals."),
        1.2: leaf("A recipe dropped on a day stays there.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A link opens a read-only week.", { requires: ["1.2"] }),
      },
    },
    "shopping-list": {
      title: "Shopping list",
      goal: "Turn the week's meals into one shopping list.",
      phases: [
        [
          "The list",
          [
            ["1.1", "Build the shopping list"],
            ["1.2", "Merge the same ingredient"],
          ],
        ],
        ["In the shop", [["2.1", "Tick items off in the shop"]]],
      ],
      manifest: {
        1.1: leaf("The week's ingredients make one list."),
        1.2: leaf("Two eggs and three eggs make five eggs.", {
          requires: ["1.1"],
        }),
        2.1: leaf("A ticked item moves to the bottom.", { requires: ["1.2"] }),
      },
    },
  };
  const files: Record<string, Record<string, string>> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const lines = ["---", "repo: app", "---", "# Tasks", ""];
    for (const [phase, items] of spec.phases) {
      lines.push(`## ${phase}`, "");
      for (const [id, title] of items)
        lines.push(item(id, title, spec.manifest[id] ?? {}));
      lines.push("");
    }
    files[name] = {
      "requirements.md": `# ${spec.title}\n\nMade-up ${word} spec. ${spec.goal}\n\n## Requirement 1\n\nWHEN a person uses ${spec.title.toLowerCase()} THEN it SHALL work as the tasks say.\n`,
      "design.md": `# ${spec.title} design\n\nMade-up ${word} design. ${spec.goal}\n`,
      "tasks.md": lines.join("\n"),
    };
  }
  const members = Object.keys(specs);
  files["recipe-box"] = {
    "requirements.md": `# Recipe Box\n\nMade-up ${word} epic: a small app to import recipes, plan meals and shop.\n\n## What done means\n\nEvery member spec is done.\n`,
    "design.md": "# Design\n\nImport first, then the planner, then the list.\n",
    // The parent links each member spec, in order (simplify §D19.2).
    "tasks.md": `# Plans\n\n${members
      .map(
        (m, i) =>
          `- [ ] \`rb-${i + 1}\` Build [${specs[m]?.title}](../${m}/tasks.md)\n`,
      )
      .join("")}`,
  };
  // A draft spec the demo never approves.
  files["pantry-photos"] = {
    "requirements.md": `# Pantry photos\n\nMade-up ${word} draft. Take a photo of the pantry and list what is in it.\n`,
    "design.md": "# Design\n\nNot written yet.\n",
    "tasks.md": `---\nrepo: app\n---\n# Tasks\n\n## Try it\n\n${item(
      "1.1",
      "Read one photo into a list",
      leaf("A photo of three jars lists three items."),
    )}\n`,
  };
  return { files, members };
}
