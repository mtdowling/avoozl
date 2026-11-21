// `avoozl insights` and `avoozl retro list|read|save` (simplify §D13): the
// Insights view's numbers as text, and the saved retros.
import fs from "node:fs";
import { help } from "../cli/command-help.mjs";
import { MAIN_WORDS, duration } from "../insights/format.ts";

const show = (value: unknown) => console.log(JSON.stringify(value, null, 2));

// The insights.view reply as the lines `avoozl insights` prints.
export function insightsText(view: any): string[] {
  const { strip, range } = view,
    finished = view.finished.reduce((n: number, d: any) => n + d.count, 0),
    scope = [
      range.spec && `spec ${range.spec}`,
      range.repo && `repository ${range.repo}`,
    ]
      .filter(Boolean)
      .join(", "),
    lines = [
      `Needs you ${strip.needsYou} · In flight ${strip.inFlight} · Ready ${strip.ready} · Main ${MAIN_WORDS[strip.main.state] ?? strip.main.state} · Autopilot ${strip.loop ? "on" : "off"}`,
      "",
      `Last ${range.days} days${scope ? ` (${scope})` : ""}`,
      `Finished tasks: ${finished}`,
      `Lead time: median ${duration(view.leadTime.median)}, 85th percentile ${duration(view.leadTime.p85)} over ${view.leadTime.tasks.length} tasks`,
    ];
  lines.push(
    view.stages.length
      ? `Time per stage: ${view.stages.map((s: any) => `${s.stage} ${duration(s.seconds)}`).join(", ")}`
      : "Time per stage: none recorded",
  );
  lines.push(
    view.review.tasks
      ? `Review rounds: ${view.review.average} on average over ${view.review.tasks} tasks (${view.review.rounds.map((r: any) => `${r.label}: ${r.tasks}`).join(", ")})`
      : "Review rounds: none recorded",
  );
  const { rework } = view;
  lines.push(
    rework.finished
      ? `Rework: ${rework.reworked} of ${rework.finished} finished tasks took more than one attempt${rework.judged ? `; ${rework.firstPass} of ${rework.judged} passed first time` : ""}`
      : "Rework: no finished tasks",
  );
  lines.push("", "Burndown (open / ticked, start → now):");
  if (!view.burndown.length)
    lines.push("  No task list changed in this range.");
  for (const { spec, points } of view.burndown) {
    const first = points[0],
      last = points.at(-1);
    lines.push(
      `  ${spec}: ${first.open} / ${first.done} → ${last.open} / ${last.done}`,
    );
  }
  return lines;
}

export const commands = [
  {
    command: "insights",
    help: [
      help(
        "inspect",
        "insights [--days 7|30|90] [--spec NAME] [--repo ID]",
        "The Insights numbers: what waits, burndown, finished tasks, lead time, stage time, review rounds and rework",
      ),
    ],
    async run({ options, localOrRequest }: any) {
      const view = await localOrRequest("insights.view", {
        ...(options.days ? { days: Number(options.days) } : {}),
        ...(options.spec ? { spec: options.spec } : {}),
        ...(options.repo ? { repo: options.repo } : {}),
      });
      console.log(insightsText(view).join("\n"));
    },
  },
  {
    command: "retro list",
    help: [help("inspect", "retro list", "Saved retros, newest first")],
    async run({ localOrRequest }: any) {
      const { items } = await localOrRequest("retro.list", {});
      if (!items.length) return console.log("No saved retros yet.");
      for (const item of items) console.log(`${item.name}  ${item.title}`);
    },
  },
  {
    command: "retro read",
    help: [help("inspect", "retro read NAME", "Print one saved retro")],
    async run({ positionals, localOrRequest, need }: any) {
      const retro = await localOrRequest("retro.read", {
        name: need(positionals[1], "retro read NAME"),
      });
      process.stdout.write(retro.text);
    },
  },
  {
    command: "retro save",
    help: [
      help(
        "inspect",
        "retro save --scope SCOPE < report.md",
        "Save a retro report from standard input under .avoozl/local/retros/",
      ),
    ],
    async run({ options, localOrRequest }: any) {
      show(
        await localOrRequest("retro.save", {
          scope: options.scope,
          text: fs.readFileSync(0, "utf8"),
        }),
      );
    },
  },
];
