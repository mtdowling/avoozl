// Repository roles (R105): the role of each repository row, the edit a role
// change makes, the planning row with no checkout, and the old link.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  modeFromRoles,
  roleFromMode,
  roleOfRow,
  tasksLiveLine,
  toForm,
  toPolicy,
  withRole,
  ROLE_OPTIONS,
} from "../src/settings-api.ts";
import { repositoryRows } from "../src/repository-rows.ts";
import { redirectSettings } from "../src/nav-api.ts";

const source = (name) =>
  readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const entry = (extra = {}) => ({ baseBranch: "main", ...extra });
const rowOf = (form, name) => {
  const policy = form.repositories.findIndex((r) => r.name === name);
  return { policy, github: name, branch: "main" };
};

test("there are four roles and each has a line", () => {
  assert.deepEqual(
    ROLE_OPTIONS.map((o) => o.value),
    ["local", "code", "planning", "both"],
  );
  for (const option of ROLE_OPTIONS) assert.ok(option.label && option.line);
});

test("a repository with no saved role gets the one its mode gives", () => {
  assert.equal(roleFromMode("plans-repo", "a/plans", "A/Plans"), "planning");
  assert.equal(roleFromMode("plans-repo", "a/app", "a/plans"), "code");
  assert.equal(roleFromMode("single-repo", "a/app", ""), "both");
  assert.equal(roleFromMode("", "a/app", ""), "local");
  assert.equal(roleFromMode("plans-repo", null, "a/plans"), "local");
  const form = toForm({
    mode: "plans-repo",
    planningRepository: "a/plans",
    repositories: {
      "a/app": entry(),
      "a/plans": entry(),
      "a/lib": entry({ role: "both" }),
    },
  });
  assert.equal(roleOfRow(form, rowOf(form, "a/app")), "code");
  assert.equal(roleOfRow(form, rowOf(form, "a/plans")), "planning");
  assert.equal(roleOfRow(form, rowOf(form, "a/lib")), "both");
  // No entry: the mode decides.
  assert.equal(roleOfRow(form, { policy: -1, github: "a/new" }), "code");
  assert.equal(roleOfRow(form, { policy: -1, github: null }), "local");
});

test("the modes the roles make", () => {
  assert.equal(modeFromRoles(["local", "local"]), "");
  assert.equal(modeFromRoles(["code", "planning"]), "plans-repo");
  assert.equal(modeFromRoles(["both", "both"]), "single-repo");
  assert.equal(modeFromRoles([]), "");
});

test("choosing planning turns the old planning repository into code", () => {
  const form = toForm({
    mode: "plans-repo",
    planningRepository: "a/plans",
    repositories: { "a/app": entry(), "a/plans": entry() },
  });
  const next = withRole(
    form,
    { ...rowOf(form, "a/app"), branch: "main" },
    "planning",
  );
  const roles = Object.fromEntries(
    next.repositories.map((r) => [r.name, r.role]),
  );
  assert.deepEqual(roles, { "a/app": "planning", "a/plans": "code" });
  assert.equal(next.mode, "plans-repo");
  assert.equal(next.planningRepository, "a/app");
  // The form it came from is untouched.
  assert.equal(form.repositories[0].role, "");
});

test("a role on a repository with no entry adds one on its branch", () => {
  const form = toForm({
    mode: "single-repo",
    repositories: { "a/app": entry() },
  });
  const next = withRole(
    form,
    { policy: -1, github: "a/lib", branch: "trunk" },
    "both",
  );
  const added = next.repositories.find((r) => r.name === "a/lib");
  assert.equal(added.role, "both");
  assert.equal(added.baseBranch, "trunk");
  assert.equal(next.repositories.find((r) => r.name === "a/app").role, "both");
  // No GitHub remote: nothing changes.
  assert.equal(
    withRole(form, { policy: -1, github: null, branch: "main" }, "both"),
    form,
  );
});

test("a saved role round-trips through the form and the policy", () => {
  const github = { repositories: { "a/app": entry({ role: "code" }) } };
  const form = toForm(github);
  assert.equal(form.repositories[0].role, "code");
  assert.equal(toPolicy(form).repositories["a/app"].role, "code");
  assert.equal(Object.hasOwn(form.repositories[0].rest, "role"), false);
  assert.equal(
    Object.hasOwn(
      toPolicy(toForm({ repositories: { "a/app": entry() } })).repositories[
        "a/app"
      ],
      "role",
    ),
    false,
  );
});

test("the line above the list says where tasks live", () => {
  assert.match(tasksLiveLine("", ""), /database/);
  assert.match(
    tasksLiveLine("plans-repo", "acme/plans"),
    /Tasks live in acme\/plans/,
  );
  assert.match(
    tasksLiveLine("single-repo", ""),
    /each repository's own issues/,
  );
});

test("the planning repository with no checkout is a GitHub-only row", () => {
  const checkout = {
    id: "app",
    name: "app",
    github: "a/app",
    localCheckout: "/x/app",
    baseBranch: "main",
  };
  const rows = repositoryRows([checkout], [], "a/plans");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].githubOnly, true);
  assert.equal(rows[1].github, "a/plans");
  // With a checkout, or none named, there is no extra row.
  assert.equal(
    repositoryRows([{ ...checkout, github: "a/plans" }], [], "A/Plans").length,
    1,
  );
  assert.equal(repositoryRows([checkout], [], "").length, 1);
});

test("the old Where tasks live link opens Repository setup", () => {
  assert.equal(redirectSettings("github"), "repositories");
  assert.equal(redirectSettings("workspaces"), "workspaces");
});

test("Repository setup shows a role per row, in place, and saves the change", () => {
  const repos = source("RepositoriesSettings.tsx");
  const settings = source("SettingsView.tsx");
  assert.match(repos, /function RolePicker/);
  assert.match(repos, /<RolePicker row=\{row\} role=\{props\.roleOf\(row\)\}/);
  assert.match(repos, /aria-label=\{`Role of \$\{row\.name\}`\}/);
  // A role is a form edit, saved by the page's footer with every other setting.
  assert.match(
    settings,
    /const changeRole = \(target: RepositoryRow, role: string\) => set\(withRole\(form, target, role\)\)/,
  );
  assert.match(
    settings,
    /\{tasksLiveLine\(form\.mode, form\.planningRepository\)\}/,
  );
  assert.match(settings, /<RoleHelp \/>/);
  // A mix the backend refuses has no page to hide behind.
  assert.doesNotMatch(settings + repos, /Where tasks live/);
});
