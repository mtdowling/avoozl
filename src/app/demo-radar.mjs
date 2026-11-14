// Demo data for the Radar-based screens (demo.mjs builds the sample from it).
// Everything here is made up. Nothing reaches GitHub, Kiro Crew or an agent.
//
// Two parts:
//  1. What the fake GitHub holds that crews leave there: claim comments,
//     labels, merge times, check runs. The real reads (`radar.crews`,
//     `radar.releasequeue`, `conflicts.view`) show it unchanged.
//  2. `demoFixtures()`: the shapes the new screens read in one call. Open
//     demo only: operation `demo.fixtures` (observe). Types and the
//     consumers' notes are in kirocrew-app/ui/src/demo-fixtures.ts.
//
// Local workers are retired: the sample has no worker rows. Crews are Issue
// Radar crews on three made-up machines.
import { statusComplete } from "../model.mjs";
import { buildTrace } from "./trace.mjs";
import { renderProvenance } from "./github-provenance.mjs";

export const DEMO_FIXTURES_VERSION = 1;
export const CLAIM_LABEL = "crew: in progress";
export const NEEDS_HUMAN_LABEL = "crew: needs human";
const READY = "ready";

// The crews and where they run. The machine is Kiro Crew's, not GitHub's, so
// only these fixtures name it (Variant A in the experience proposal).
export const CREWS = Object.freeze([
  { id: "c_draco", name: "Draco", machine: "desk-linux" },
  { id: "c_orion", name: "Orion", machine: "build-mac" },
  { id: "c_vega", name: "Vega", machine: "cloud-box" },
  { id: "c_nova", name: "Nova", machine: "cloud-box" },
]);
const crew = (name) => CREWS.find((entry) => entry.name === name);

const iso = (now, hours) => new Date(now - hours * 3600_000).toISOString();

// A crew's claim comment, as Radar writes it: a name line, a status line,
// then the marker.
function claimComment({
  id,
  now,
  repository,
  issue,
  who,
  phase,
  pr,
  hours,
  born,
}) {
  const c = crew(who),
    updated = iso(now, hours);
  return {
    id,
    created_at: iso(now, born),
    updated_at: updated,
    html_url: `https://github.com/${repository}/issues/${issue}#issuecomment-${id}`,
    user: { login: "kirocrew-bot" },
    body: `👻 **${c.name}**\n${phase} · updated ${updated.slice(11, 16)} UTC\n<!-- kirocrew-crew v=1 id=${c.id} phase=${phase} pr=${pr ?? ""} updated=${updated} -->`,
  };
}

// Claims, labels, events, pull request times and check runs, by issue and
// pull request number. `links` is demo.mjs DEMO_LINKS.
export function radarOverlay(now, repository) {
  const common = { now, repository },
    comment = (args) => claimComment({ ...common, ...args });
  return {
    comments: {
      2: [
        comment({
          id: 1002,
          issue: 2,
          who: "Vega",
          phase: "resolved",
          pr: 20,
          hours: 26,
          born: 30,
        }),
      ],
      3: [
        comment({
          id: 1003,
          issue: 3,
          who: "Draco",
          phase: "resolved",
          pr: 21,
          hours: 13,
          born: 20,
        }),
      ],
      4: [
        comment({
          id: 1004,
          issue: 4,
          who: "Draco",
          phase: "implementing",
          pr: 22,
          hours: 0.4,
          born: 3,
        }),
      ],
      6: [
        comment({
          id: 1006,
          issue: 6,
          who: "Nova",
          phase: "handed-back",
          pr: 23,
          hours: 1,
          born: 6,
        }),
      ],
      30: [
        comment({
          id: 1030,
          issue: 30,
          who: "Orion",
          phase: "investigating",
          pr: null,
          hours: 0.2,
          born: 1.5,
        }),
      ],
      31: [
        comment({
          id: 1031,
          issue: 31,
          who: "Vega",
          phase: "claimed",
          pr: null,
          hours: 0.1,
          born: 0.5,
        }),
      ],
    },
    // Issue number -> label names, on top of the issue's own.
    labels: {
      4: [CLAIM_LABEL, READY],
      6: [NEEDS_HUMAN_LABEL],
      9: [READY],
      30: [CLAIM_LABEL],
      31: [CLAIM_LABEL],
    },
    events: Object.fromEntries(
      [
        [2, 31],
        [3, 22],
        [4, 4],
        [9, 2],
      ].map(([issue, hours]) => [
        issue,
        [
          {
            event: "labeled",
            label: { name: READY },
            created_at: iso(now, hours),
          },
        ],
      ]),
    ),
    // Pull request number -> times.
    pulls: {
      20: { created_at: iso(now, 29), merged_at: iso(now, 25) },
      21: { created_at: iso(now, 19), merged_at: iso(now, 12) },
      22: { created_at: iso(now, 2.5), merged_at: null },
      23: { created_at: iso(now, 5), merged_at: null },
    },
    runs: {
      20: [
        {
          name: "test",
          status: "completed",
          conclusion: "success",
          started_at: iso(now, 28),
          completed_at: iso(now, 27),
        },
      ],
      21: [
        {
          name: "test",
          status: "completed",
          conclusion: "success",
          started_at: iso(now, 14),
          completed_at: iso(now, 13),
        },
      ],
      22: [
        {
          name: "test",
          status: "completed",
          conclusion: "failure",
          started_at: iso(now, 1),
          completed_at: iso(now, 0.8),
        },
        {
          name: "lint",
          status: "completed",
          conclusion: "success",
          started_at: iso(now, 1),
          completed_at: iso(now, 0.9),
        },
      ],
    },
    approvedAt: iso(now, 40),
    // The leaf issues carry Avoozl's provenance marker.
    provenance: (spec, task) =>
      renderProvenance({
        spec,
        tasks: [task],
        commit: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        approvedBy: "demo-owner",
      }),
  };
}

// The sample's state that real reads turn into Radar screens. Called once,
// inside the build transaction folder, after the plans are approved.
export function seedRadar(store, { repository, now = Date.now() }) {
  store.put("github_repositories", {
    id: repository,
    projectId: "app",
    // Release does not wait on the public sign-off for a private repository.
    private: true,
    label: READY,
  });
  store.mutate("Demo Radar state", (data) => {
    const by = new Map(data.tasks.map((task) => [task.id, task]));
    // Two pull requests merged: GitHub's word on them, which Flow, the phase
    // gates and the side panel's recent merges read.
    for (const [id, pr] of [
      ["recipe-import.1.1", 20],
      ["recipe-import.1.2", 21],
    ])
      by.get(id).githubVerdict = {
        state: "verified",
        mergedAt: radarOverlay(now, repository).pulls[pr].merged_at,
        pullRequest: pr,
      };
    // The ready label is on: Draco has claimed the first, nobody the second.
    by.get("recipe-import.2.1").dispatch = { ready: true };
    by.get("shopping-list.1.1").dispatch = { ready: true };
    // Nova handed this back: its issue carries the needs-human label.
    const held = by.get("meal-planner.1.1");
    held.decision = "crew-needs-human:meal-planner.1.1";
    held.crewHold = {
      kind: "needs-human",
      label: NEEDS_HUMAN_LABEL,
      number: 6,
    };
  });
}

// --- Fixtures ----------------------------------------------------------------

const PHASE_OF = (task) => task.phase?.id ?? "";

function epicsView(data, rows, plans) {
  const row = new Map(rows.map((entry) => [entry.taskId, entry]));
  const done = (task) => statusComplete(data, task.status);
  return data.epics.map((epic) => ({
    id: epic.id,
    title: epic.title ?? epic.id,
    plans: epic.plans.map((planId) => {
      const tasks = data.tasks.filter((task) => task.planId === planId),
        order = [...new Set(tasks.map(PHASE_OF))];
      let before = true;
      const phases = order.map((phaseId) => {
        const mine = tasks.filter((task) => PHASE_OF(task) === phaseId),
          merged = mine.filter(done).length,
          released = mine.filter(
            (task) =>
              done(task) ||
              ["released", "claimed"].includes(row.get(task.id)?.state),
          ).length,
          // A handback comes first: a person must answer before anything moves.
          handed = mine.find((task) => task.crewHold),
          held = handed
            ? `Handed back: answer issue #${handed.crewHold.number} on GitHub.`
            : (mine
                .map((task) => row.get(task.id))
                .find((entry) => entry?.state === "held")?.reason ?? null),
          gate = merged === mine.length ? "passed" : before ? "open" : "closed";
        before = before && merged === mine.length;
        return {
          id: phaseId,
          title: mine[0].phase?.title ?? phaseId,
          gate,
          total: mine.length,
          merged,
          released,
          held,
        };
      });
      return { id: planId, title: plans.get(planId)?.title ?? planId, phases };
    }),
  }));
}

const LIVE_STATUS = {
  claimed: "working",
  investigating: "working",
  implementing: "working",
};

// What the Radar screens read, in one object. `demo` is demoOperations().
export async function demoFixtures(demo, { now = Date.now() } = {}) {
  const { store, github } = demo,
    sample = github.sample,
    data = store.read(),
    queue = await demo.execute("radar.releasequeue", {}),
    claims = await demo.execute("radar.crews", {}),
    conflicts = await demo.execute("conflicts.view", {}),
    rows = queue.repositories.flatMap((entry) => entry.rows),
    repository = sample.repository,
    overlay = sample.overlay,
    issueOf = (number) =>
      sample.issues.find((entry) => entry.number === number),
    link = (number) => issueOf(number).html_url;

  const crews = claims.rows
    .map((claim) => {
      const who = CREWS.find((entry) => entry.id === claim.crewId);
      return {
        kind: "radar-crew",
        id: claim.crewId,
        name: claim.crewName ?? who?.name ?? null,
        machine: who?.machine ?? null,
        status: LIVE_STATUS[claim.phase] ?? "waiting",
        repository,
        issue: claim.number,
        title: claim.title,
        phase: claim.phase,
        pr: claim.pr,
        updatedAt: claim.updated,
        url: claim.url ?? link(claim.number),
        prUrl: claim.prUrl,
      };
    })
    // Nova has handed back issue #6: it holds no claim and waits for a person.
    .concat(
      CREWS.filter((entry) => entry.name === "Nova").map((entry) => ({
        kind: "radar-crew",
        id: entry.id,
        name: entry.name,
        machine: entry.machine,
        status: "waiting-on-you",
        repository,
        issue: null,
        handedBack: 6,
        title: issueOf(6).title,
        phase: "handed-back",
        pr: 23,
        updatedAt: overlay.comments[6][0].updated_at,
        url: link(6),
        prUrl: `https://github.com/${repository}/pull/23`,
      })),
    );

  const handHold = conflicts.items.find((item) =>
      /crew: needs human/.test(item.detail || ""),
    ),
    decision = conflicts.items.find(
      (item) => item.kind === "decision" && item !== handHold,
    );
  const waitingOnYou = [
    {
      kind: "handback",
      taskId: handHold?.taskId ?? "meal-planner.1.1",
      title: "Week grid for the meal planner",
      issue: 6,
      url: link(6),
      crew: "Nova",
      machine: crew("Nova").machine,
      question: "Does the week start on Monday or on Sunday?",
      label: NEEDS_HUMAN_LABEL,
      since: overlay.comments[6][0].updated_at,
    },
    {
      kind: "review-draft",
      pr: 24,
      title: sample.pulls.find((pull) => pull.number === 24).title,
      url: sample.pulls.find((pull) => pull.number === 24).html_url,
      since: iso(now, 1),
    },
    ...(decision
      ? [
          {
            kind: "decision",
            taskId: decision.taskId,
            title: decision.title,
            detail: decision.detail,
            since: iso(now, 3),
          },
        ]
      : []),
  ];

  const pull24 = sample.pulls.find((pull) => pull.number === 24);
  const reviewDraft = {
    repository,
    pr: 24,
    title: pull24.title,
    url: pull24.html_url,
    author: "demo-contributor",
    state: "ready-to-post",
    draftedBy: "Vega",
    draftedAt: iso(now, 1),
    verdict: "comment",
    summary:
      "The dark colors read well. Two small things before it lands: one color has too little contrast, and the new CSS has no test.",
    findings: [
      {
        path: "src/grid.css",
        line: 41,
        severity: "should-fix",
        text: "The day label is grey on grey. It misses the contrast ratio of 4.5.",
      },
      {
        path: "src/grid.css",
        line: 12,
        severity: "nit",
        text: "This color repeats the one on line 8. Use the variable.",
      },
      {
        path: "src/grid.test.js",
        line: null,
        severity: "should-fix",
        text: "Add a test that the grid renders with the dark class.",
      },
    ],
  };

  const recentMerges = sample.pulls
    .filter((pull) => pull.merged)
    .map((pull) => ({
      repository,
      pr: pull.number,
      title: pull.title,
      url: pull.html_url,
      mergedAt: pull.merged_at,
      crew: pull.number === 20 ? "Vega" : "Draco",
      machine:
        pull.number === 20 ? crew("Vega").machine : crew("Draco").machine,
    }))
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));

  const trace = (number, pr) =>
    buildTrace({
      issue: issueOf(number),
      comments: overlay.comments[number],
      events: overlay.events[number],
      pull: sample.pulls.find((entry) => entry.number === pr),
      checks: overlay.runs[pr],
      readyLabel: READY,
      specApproved: { at: overlay.approvedAt },
    });
  const traces = [
    { repository, ...trace(3, 21) },
    { repository, ...trace(4, 22) },
  ];

  return {
    version: DEMO_FIXTURES_VERSION,
    generatedAt: new Date(now).toISOString(),
    repository,
    epics: epicsView(
      data,
      rows,
      new Map(store.list("plans").map((plan) => [plan.id, plan])),
    ),
    crews,
    waitingOnYou,
    reviewDraft,
    recentMerges,
    traces,
    // Read the Release queue itself with `radar.releasequeue`.
    driverSession: {
      state: "running",
      slot: "demo-driver",
      // The chat link, as the side panel's `DriverSession` reads it. Opening
      // it in the demo shows the chat preview sentence.
      link: "/chat?sid=demo-driver",
      previewOnly: true,
      startedAt: iso(now, 2),
      lastTurnAt: iso(now, 0.01),
      turnsToday: 11,
      turnLimit: 40,
    },
    // The example toggle: the page picks one of the two states to show. The
    // sample's own line never stops (the demo changes nothing).
    stopLine: {
      example: "running",
      running: {
        state: "running",
        releasing: true,
        say: "Avoozl releases work in graph order. Crews claim it.",
      },
      stopped: {
        state: "stopped",
        releasing: false,
        reason: "Tests went red on main after the parser change.",
        by: "Demo owner",
        openedAt: iso(now, 0.5),
        unclaimedReadyRemoved: 1,
        claimedCommented: 1,
        say: "Avoozl stops releasing, takes ready off 1 unclaimed issue and comments on 1 claimed one. Running crews finish their turn. Nothing is deleted. Resume from the same button.",
        onlyRadar: "Pausing a crew itself is owner-only in Issue Radar.",
      },
    },
    // A sample of the private mirror (RC24): the sample's repository is
    // private, so this only shows what the section looks like.
    mirror: {
      sample: true,
      source: "example/recipe-box",
      mirror: "example/recipe-box-private",
      forwardMode: "nudge",
      sync: { state: "in-sync", checkedAt: iso(now, 0.02) },
      scan: "clean",
      items: [
        {
          state: "to_forward",
          task: "recipe-import.2.1",
          mirrorPr: 22,
          reason: "Merged in the mirror, not forwarded yet.",
          forward: "Forward",
        },
        {
          state: "public_open",
          task: "recipe-import.1.2",
          mirrorPr: 21,
          publicPr: 41,
          reason: "Public pull request is open.",
        },
        {
          state: "public_merged",
          task: "recipe-import.1.1",
          mirrorPr: 20,
          publicPr: 40,
          reason: "Merged in the public repository.",
        },
        {
          state: "blocked",
          task: "meal-planner.1.2",
          mirrorPr: 25,
          reason: "The leak scan found a private name. Nothing was pushed.",
        },
      ],
    },
  };
}
