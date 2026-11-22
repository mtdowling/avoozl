import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WorkspaceRegistry } from "../../settings/host-config.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { validateWorkspaceProvisionProposal } from "../workspace-proposal.ts";

const cli = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));

const proposal = () => ({
  version: 1,
  proposalId: "python-sdk-rewrite",
  requestedBy: "KiroCrew rewrite skill",
  summary: "Prepare an SDK rewrite workspace.",
  workspace: {
    id: "python-rewrite",
    name: "Python SDK Rewrite",
    root: path.resolve("/tmp/python-rewrite"),
    action: "create",
    initializeGit: true,
  },
  repositories: [
    {
      id: "target",
      name: "Python SDK",
      root: path.resolve("/tmp/python-sdk"),
      access: "write",
      baseBranch: "main",
      planning: false,
    },
    {
      id: "reference",
      root: path.resolve("/tmp/reference-sdk"),
      access: "read",
    },
  ],
});

test("workspace proposals normalize explicit writable and read-only repositories", () => {
  const checked = validateWorkspaceProvisionProposal(proposal());
  assert.equal(checked.workspace.initializeGit, true);
  assert.deepEqual(
    checked.repositories.map(({ id, access, baseBranch, planning }) => ({
      id,
      access,
      baseBranch,
      planning,
    })),
    [
      {
        id: "target",
        access: "write",
        baseBranch: "main",
        planning: false,
      },
      {
        id: "reference",
        access: "read",
        baseBranch: "main",
        planning: false,
      },
    ],
  );
});

test("workspace proposals reject hidden fields, relative paths, and duplicate repositories", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...proposal(), secret: "hidden" }, /unknown field: secret/],
    [
      {
        ...proposal(),
        workspace: { ...proposal().workspace, root: "relative" },
      },
      /absolute path/,
    ],
    [
      {
        ...proposal(),
        repositories: [
          proposal().repositories[0],
          { ...proposal().repositories[1], id: "target" },
        ],
      },
      /listed more than once/,
    ],
  ];
  for (const [value, expected] of cases)
    assert.throws(() => validateWorkspaceProvisionProposal(value), expected);
});

test("adding an existing workspace cannot also initialize its Git repository", () => {
  const value = proposal();
  value.workspace.action = "add";
  assert.throws(
    () => validateWorkspaceProvisionProposal(value),
    /cannot initialize Git/,
  );
});

test("workspace propose stores a request without creating its workspace", () => {
  const root = temporaryDirectory("avoozl-workspace-proposal-"),
    home = path.join(root, "home"),
    config = path.join(root, "config"),
    state = path.join(root, "state"),
    file = path.join(root, "proposal.json"),
    value = proposal();
  value.workspace.root = path.join(root, "plans");
  fs.mkdirSync(home);
  fs.writeFileSync(file, JSON.stringify(value));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_STATE_HOME: state,
  };
  for (const key of Object.keys(env))
    if (/^AVOOZL(_|$)/.test(key)) delete env[key];
  execFileSync(
    process.execPath,
    [cli, "workspace", "propose", "--input", file],
    { env },
  );
  const registry = new WorkspaceRegistry({ env });
  try {
    assert.equal(
      registry.catalog.workspaceProposal(value.proposalId)?.proposal
        .requestedBy,
      value.requestedBy,
    );
  } finally {
    registry.close();
  }
  assert.equal(fs.existsSync(value.workspace.root), false);
});
