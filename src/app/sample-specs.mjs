// The made-up Recipe Box specs: three specs under one epic, and one draft.
// Demo mode (demo.mjs) builds its sample from them, and the recipe-box
// example (examples.mjs) installs them as draft spec folders.
import { factsLines } from "./spec-facts.mjs";

// A task item, its Facts bullet (Requirement 111) and its summary bullets.
const item = (id, title, { summary = [], ...entry }) =>
  [
    `- [ ] ${id} ${title}`,
    ...factsLines(entry),
    ...summary.map((line) => `  - ${line}`),
  ].join("\n");

const leaf = (done, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  acceptance: [done],
  completion: "integrated",
  ...extra,
});

// Three specs under one epic, each with phases from tasks.md headings.
// `word` says what the sample is in its own text: "demo" or "example".
export function sampleSpecs({ word = "demo" } = {}) {
  const specs = {
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
          kind: "leaf",
          repository: "app",
          summary: ["A person imports three recipes on a phone."],
          acceptance: ["Three imports work on a phone."],
          completion: "answered",
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
  const files = {};
  for (const [name, spec] of Object.entries(specs)) {
    const lines = ["# Tasks", ""];
    for (const [phase, items] of spec.phases) {
      lines.push(`## ${phase}`, "");
      for (const [id, title] of items)
        lines.push(item(id, title, spec.manifest[id]));
      lines.push("");
    }
    files[name] = {
      "requirements.md": `---\nepic: recipe-box\n---\n# ${spec.title}\n\nMade-up ${word} spec. ${spec.goal}\n\n## Requirement 1\n\nWHEN a person uses ${spec.title.toLowerCase()} THEN it SHALL work as the tasks say.\n`,
      "design.md": `# ${spec.title} design\n\nMade-up ${word} design. ${spec.goal}\n`,
      "tasks.md": lines.join("\n"),
    };
  }
  const members = Object.keys(specs);
  files["recipe-box"] = {
    "requirements.md": `# Recipe Box\n\nMade-up ${word} epic: a small app to import recipes, plan meals and shop.\n\n## What done means\n\nEvery member spec is done.\n`,
    "design.md": "# Design\n\nImport first, then the planner, then the list.\n",
    "tasks.md": `---\nkind: epic\n---\n# Plans\n\n${members
      .map((m, i) => item(i + 1, specs[m].title, { plan: m }) + "\n")
      .join("")}`,
  };
  // A draft spec the demo never approves.
  files["pantry-photos"] = {
    "requirements.md": `# Pantry photos\n\nMade-up ${word} draft. Take a photo of the pantry and list what is in it.\n`,
    "design.md": "# Design\n\nNot written yet.\n",
    "tasks.md": `# Tasks\n\n## Try it\n\n${item(
      "1.1",
      "Read one photo into a list",
      leaf("A photo of three jars lists three items."),
    )}\n`,
  };
  return { files, members };
}
