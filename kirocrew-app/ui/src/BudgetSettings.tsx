// Settings › Budgets (design §4.17, R67.2, R67.5). Budgets write `budget`
// and `projects.<id>.budget` in .avoozl.json through budget.settings.update
// with the file's hash. Cost estimates use Avoozl's built-in dated price
// list; there is no price page.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Btn, Card, Input } from "@kirocrew/app-sdk/ui";
import { Marker, Section } from "./SettingsView.tsx";
import { RadioFold, type RadioSection } from "./RadioFold.tsx";
import { Fold } from "./controls.tsx";
import { FieldBox } from "./FieldBox.tsx";
import { useRead } from "./useRead.ts";
import { AskForHelp } from "./controls.tsx";
import { COMMAND_PATH, errorMessage } from "./workspace-api.ts";
import {
  MODE_TEXT,
  MODE_TITLE,
  budgetApi,
  COSTS_DOCS,
  fromBudgetForm,
  helpSettings,
  inheritText,
  toBudgetForm,
  type BudgetForm,
  type BudgetMode,
  type BudgetValue,
} from "./budget-api.ts";

const OPTIONAL = { required: false } as const;
const DEFAULT_TOKENS = 2000000;
const DEFAULT_CREDITS = 200;
const n = (value: number) => value.toLocaleString("en-US");

interface BudgetSettingsView {
  hash: string | null;
  budget: BudgetValue;
  repositories: Record<string, BudgetValue>;
}

// One number field: label, marker, the default it falls back to, and the
// raw key.
function NumberField(props: {
  id: string;
  label: string;
  value: string;
  fallback: string;
  // A short placeholder; the full fallback is the line under the field.
  placeholder: string;
  raw: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 text-sm"
      style={{ width: "100%", maxWidth: "16rem" }}
    >
      <label
        htmlFor={props.id}
        className="flex flex-wrap items-baseline gap-x-2"
      >
        <span className="font-medium">{props.label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      <Input
        id={props.id}
        inputMode="decimal"
        value={props.value}
        placeholder={props.placeholder}
        aria-describedby={`${props.id}-blank`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <span id={`${props.id}-blank`} className="text-xs text-muted">
        Blank: {props.fallback}
      </span>
      <code className="text-[11px] text-muted">{props.raw}</code>
    </div>
  );
}

// What a level falls back to when a field is blank.
interface Fallback {
  // "workspace default" or "built-in default".
  from: string;
  usd: string;
  tokens: string;
  credits: string;
  mode: BudgetMode;
  // Short placeholders for the fields.
  short: { usd: string; tokens: string; credits: string };
}

// One level's caps and mode. The workspace has no "inherit" choice; a
// repository's says where its value comes from and what it is.
function CapFields(props: {
  id: string;
  form: BudgetForm;
  onChange: (form: BudgetForm) => void;
  fallback: Fallback;
  inherit: boolean;
  warnFields?: ReactNode;
}) {
  const { id, form, fallback } = props;
  const set = (change: Partial<BudgetForm>) =>
    props.onChange({ ...form, ...change });
  type Choice = "" | BudgetMode;
  const modeSection = (key: BudgetMode): RadioSection<Choice> => ({
    key,
    title: MODE_TITLE[key],
    line: MODE_TEXT[key],
    ...(key === "warn" && props.warnFields ? { fields: props.warnFields } : {}),
  });
  const sections: RadioSection<Choice>[] = [
    ...(props.inherit
      ? [
          {
            key: "" as Choice,
            title: inheritText(fallback.from, MODE_TITLE[fallback.mode]),
            line: `It follows the ${fallback.from}, and changes when that changes.`,
          },
        ]
      : []),
    modeSection("stop"),
    modeSection("warn"),
  ];
  const mode: Choice = props.inherit ? form.mode : form.mode || fallback.mode;
  return (
    <div className="flex flex-col gap-3">
      <FieldBox title="Dollar cap">
        <NumberField
          id={`${id}-usd`}
          label="Dollar cap per task"
          value={form.usd}
          fallback={fallback.usd}
          placeholder={fallback.short.usd}
          raw="budget.usd"
          onChange={(usd) => set({ usd })}
        />
      </FieldBox>
      <FieldBox title="When a task reaches its cap">
        <RadioFold
          name={`${id}-mode`}
          label="When a task reaches its cap"
          value={mode}
          onChange={(next) => set({ mode: next })}
          sections={sections}
        />
        <code className="text-[11px] text-muted">budget.mode</code>
      </FieldBox>
      <Fold
        title="Advanced: caps for turns not counted in dollars"
        id={`${id}-advanced`}
      >
        <FieldBox
          title="Caps for turns not counted in dollars"
          blurb="Avoozl counts most turns in dollars. A model Kiro Crew bills in credits counts against the credit cap. A model with no known price counts against the token cap."
        >
          <div className="flex flex-wrap gap-3">
            <NumberField
              id={`${id}-tokens`}
              label="Token cap per task"
              value={form.tokens}
              fallback={fallback.tokens}
              placeholder={fallback.short.tokens}
              raw="budget.tokens"
              onChange={(tokens) => set({ tokens })}
            />
            <NumberField
              id={`${id}-credits`}
              label="Credit cap per task"
              value={form.credits}
              fallback={fallback.credits}
              placeholder={fallback.short.credits}
              raw="budget.credits"
              onChange={(credits) => set({ credits })}
            />
          </div>
        </FieldBox>
      </Fold>
    </div>
  );
}

// "$8, Warn" for a repository's summary line.
function levelSummary(value: BudgetValue | undefined) {
  const parts = [
    value?.usd != null ? `$${value.usd}` : null,
    value?.mode ? MODE_TITLE[value.mode] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "uses the workspace default";
}

export function BudgetSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi();
  const run = useCallback(
    <T,>(operation: string, input: Record<string, unknown> = {}) =>
      api
        .post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
        .then((r) => r.result),
    [api, workspaceId],
  );
  const load = useCallback(
    () => run<BudgetSettingsView>("budget.settings.get"),
    [run],
  );
  const { value, error, reload } = useRead<BudgetSettingsView>(
    workspaceId,
    load,
  );
  const [forms, setForms] = useState<Record<string, BudgetForm>>({});
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState<
    Record<string, { ok?: string; error?: string }>
  >({});
  useEffect(() => {
    if (!value) return;
    setForms({
      "": toBudgetForm(value.budget),
      ...Object.fromEntries(
        Object.entries(value.repositories).map(([id, b]) => [
          id,
          toBudgetForm(b),
        ]),
      ),
    });
    setNotify(value.budget.notify === true);
  }, [value]);
  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!value) return <p className="text-sm text-muted">Loading…</p>;
  const workspace = forms[""] ?? toBudgetForm(null);
  const builtIn: Fallback = {
    from: "built-in default",
    usd: "no dollar cap",
    tokens: `${n(DEFAULT_TOKENS)} tokens`,
    credits: `${n(DEFAULT_CREDITS)} credits`,
    mode: "stop",
    short: {
      usd: "no cap",
      tokens: n(DEFAULT_TOKENS),
      credits: n(DEFAULT_CREDITS),
    },
  };
  const fromWorkspace: Fallback = {
    from: "workspace default",
    usd: workspace.usd
      ? `the workspace default ($${workspace.usd})`
      : "the workspace default (no dollar cap)",
    tokens: `the workspace default (${n(Number(workspace.tokens) || DEFAULT_TOKENS)} tokens)`,
    credits: `the workspace default (${n(Number(workspace.credits) || DEFAULT_CREDITS)} credits)`,
    mode: workspace.mode || "stop",
    short: {
      usd: workspace.usd ? `$${workspace.usd}` : "no cap",
      tokens: n(Number(workspace.tokens) || DEFAULT_TOKENS),
      credits: n(Number(workspace.credits) || DEFAULT_CREDITS),
    },
  };
  const save = async (repository: string) => {
    const built = fromBudgetForm(forms[repository] ?? toBudgetForm(null));
    if (built.error)
      return setMessage({ ...message, [repository]: { error: built.error } });
    const budget = {
      ...(built.budget ?? {}),
      ...(!repository && notify ? { notify: true } : {}),
    };
    try {
      await run("budget.settings.update", {
        budget,
        ...(repository ? { repository } : {}),
        expectedHash: value.hash,
      });
      await reload();
      setMessage({ ...message, [repository]: { ok: "Saved." } });
    } catch (caught) {
      setMessage({ ...message, [repository]: { error: errorMessage(caught) } });
    }
  };
  const status = (key: string) =>
    message[key] && (
      <p
        role={message[key].error ? "alert" : "status"}
        className="text-sm"
        style={message[key].error ? { color: "var(--danger)" } : undefined}
      >
        {message[key].error ?? message[key].ok}
      </p>
    );
  const help = {
    page: "Settings › Budgets",
    says: "A spending cap per task for the workspace and each repository, and what happens when a task reaches it. Blank fields use the default.",
    settings: helpSettings({
      budget: {
        usd: workspace.usd,
        mode: workspace.mode,
        tokens: workspace.tokens,
        credits: workspace.credits,
        notify,
      },
      projects: Object.fromEntries(
        Object.keys(value.repositories).map((id) => {
          const f = forms[id] ?? toBudgetForm(null);
          return [
            id,
            {
              budget: {
                usd: f.usd,
                mode: f.mode,
                tokens: f.tokens,
                credits: f.credits,
              },
            },
          ];
        }),
      ),
      defaults: `no dollar cap, Stop, ${n(DEFAULT_TOKENS)} tokens, ${n(DEFAULT_CREDITS)} credits, no notice`,
    }),
    docs: COSTS_DOCS,
  };
  return (
    <div className="flex flex-col gap-4" data-budget-settings>
      <div className="flex flex-wrap items-center gap-2">
        <AskForHelp workspaceId={workspaceId} help={help} />
      </div>
      <Card className="flex flex-col gap-3">
        <Section
          title="Workspace default"
          blurb="Each task's cap, unless its repository, spec or task sets its own. Retries, checks and reviews share the task's cap. Receipts are kept even with no cap."
        >
          <CapFields
            id="budget-workspace"
            form={workspace}
            onChange={(form) => setForms({ ...forms, "": form })}
            fallback={builtIn}
            inherit={false}
            warnFields={
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Also send a Kiro Crew notice when a task goes over budget{" "}
                  <Marker rule={OPTIONAL} />
                  <code className="block text-[11px] text-muted">
                    budget.notify
                  </code>
                </span>
              </label>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn type="button" primary onClick={() => void save("")}>
              Save
            </Btn>
            {status("")}
          </div>
        </Section>
      </Card>
      <Card className="flex flex-col gap-3">
        <Section
          title="Repositories"
          blurb="A repository can set its own cap for its tasks. A blank field uses the workspace default."
        >
          {Object.keys(value.repositories).length === 0 ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>
                No repository is in .avoozl.json yet. Add one under
                Repositories.
              </span>
              <AskForHelp
                workspaceId={workspaceId}
                help={{
                  page: "Settings › Budgets",
                  section: "Repositories",
                  says: "No repository is in .avoozl.json yet. Add one under Repositories.",
                  settings: [{ key: "repositories", value: "none" }],
                  docs: "README.md, section Create a workspace",
                }}
              />
            </p>
          ) : (
            Object.keys(value.repositories)
              .sort()
              .map((id) => (
                <Fold
                  key={id}
                  id={`budget-repo-${id}`}
                  title={
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span>{id}</span>
                      <span className="text-xs font-normal text-muted">
                        {levelSummary(value.repositories[id])}
                      </span>
                    </span>
                  }
                >
                  <div className="flex flex-col gap-3">
                    <CapFields
                      id={`budget-${id}`}
                      form={forms[id] ?? toBudgetForm(null)}
                      onChange={(form) => setForms({ ...forms, [id]: form })}
                      fallback={fromWorkspace}
                      inherit
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Btn type="button" primary onClick={() => void save(id)}>
                        Save {id}
                      </Btn>
                      {status(id)}
                    </div>
                  </div>
                </Fold>
              ))
          )}
        </Section>
      </Card>
    </div>
  );
}
