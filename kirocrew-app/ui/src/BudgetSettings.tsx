// Settings › Budgets and Settings › Prices (design §4.17, R67.2, R67.5).
// Budgets write `budget` and `projects.<id>.budget` in .avoozl.json through
// budget.settings.update with the file's hash. Prices are this computer's
// only: prices.save writes ~/.config/avoozl/config.json and a new version.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Btn, Card, Input } from "@kirocrew/app-sdk/ui";
import Badge from "./Badge.tsx";
import { Marker, Section } from "./SettingsView.tsx";
import { useRead } from "./useRead.ts";
import { COMMAND_PATH, errorMessage } from "./workspace-api.ts";
import { parseModels } from "./flow-api.ts";
import {
  MODE_TEXT,
  budgetApi,
  fromBudgetForm,
  fromPricesForm,
  toBudgetForm,
  toPricesForm,
  type BudgetForm,
  type BudgetMode,
  type BudgetValue,
  type PricesForm,
} from "./budget-api.ts";

const OPTIONAL = { required: false } as const;

interface BudgetSettingsView {
  hash: string | null;
  budget: BudgetValue;
  repositories: Record<string, BudgetValue>;
}

// The four cap fields and the mode, for one level. Blank means the level
// above applies; placeholders show what that is.
function CapFields(props: {
  id: string;
  form: BudgetForm;
  onChange: (form: BudgetForm) => void;
  placeholder: { usd: string; tokens: string; credits: string; mode: string };
}) {
  const { id, form } = props;
  const set = (change: Partial<BudgetForm>) =>
    props.onChange({ ...form, ...change });
  const field = (key: "usd" | "tokens" | "credits", label: string) => (
    <div
      className="flex min-w-0 flex-col gap-1 text-sm"
      style={{ maxWidth: "12rem" }}
    >
      <label
        htmlFor={`${id}-${key}`}
        className="flex flex-wrap items-baseline gap-x-2"
      >
        <span className="font-medium">{label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      <Input
        id={`${id}-${key}`}
        inputMode="decimal"
        value={form[key]}
        placeholder={props.placeholder[key]}
        onChange={(e) => set({ [key]: e.target.value })}
      />
      <code className="text-[11px] text-muted">{`budget.${key}`}</code>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {field("usd", "Dollar cap per task")}
        {field("tokens", "Token cap for unpriced turns")}
        {field("credits", "Credit cap for unpriced turns")}
      </div>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">
          At the cap <Marker rule={OPTIONAL} />
        </legend>
        {(["", "stop", "warn"] as const).map((mode) => (
          <label key={mode || "inherit"} className="flex items-start gap-2">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={form.mode === mode}
              onChange={() => set({ mode })}
              style={{ marginTop: 3 }}
            />
            <span>
              {mode
                ? MODE_TEXT[mode as BudgetMode]
                : `Same as above (${props.placeholder.mode}).`}
            </span>
          </label>
        ))}
        <code className="text-[11px] text-muted">budget.mode</code>
      </fieldset>
    </div>
  );
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
  const above = {
    usd: workspace.usd ? `$${workspace.usd} (workspace)` : "no cap",
    tokens: workspace.tokens || "2000000",
    credits: workspace.credits || "200",
    mode: workspace.mode || "stop",
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
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <Section
          title="Workspace default"
          blurb="Each task's cap unless its repository, spec or task sets one. Retries, checks and reviews share the task's cap. With no dollar cap, receipts are still kept."
        >
          <CapFields
            id="budget-workspace"
            form={workspace}
            onChange={(form) => setForms({ ...forms, "": form })}
            placeholder={{
              usd: "no cap",
              tokens: "2000000",
              credits: "200",
              mode: "stop",
            }}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              Send a Kiro Crew notice when a warn-mode task goes over budget{" "}
              <Marker rule={OPTIONAL} />
              <code className="block text-[11px] text-muted">
                budget.notify
              </code>
            </span>
          </label>
          <div className="flex items-center gap-2">
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
          blurb="A repository's cap replaces the workspace default for its tasks. A spec's manifest and a task can set their own."
        >
          {Object.keys(value.repositories).length === 0 ? (
            <p className="text-sm text-muted">
              No repository is in .avoozl.json yet. Add one under Repositories.
            </p>
          ) : (
            Object.keys(value.repositories)
              .sort()
              .map((id) => (
                <details
                  key={id}
                  className="border-t pt-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  <summary className="cursor-pointer text-sm font-semibold">
                    {id}
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    <CapFields
                      id={`budget-${id}`}
                      form={forms[id] ?? toBudgetForm(null)}
                      onChange={(form) => setForms({ ...forms, [id]: form })}
                      placeholder={above}
                    />
                    <div className="flex items-center gap-2">
                      <Btn type="button" primary onClick={() => void save(id)}>
                        Save {id}
                      </Btn>
                      {status(id)}
                    </div>
                  </div>
                </details>
              ))
          )}
        </Section>
      </Card>
    </div>
  );
}

export function PricesSettings({ workspaceId }: { workspaceId: string }) {
  const app = useAppApi();
  const api = useMemo(() => budgetApi(app), [app]);
  const load = useCallback((id: string) => api.prices(id), [api]);
  const { value, error, reload } = useRead(workspaceId, load);
  const [offered, setOffered] = useState<string[]>([]);
  const [form, setForm] = useState<PricesForm>({ creditUsd: "", rows: [] });
  const [message, setMessage] = useState<{
    ok?: string;
    error?: string;
  } | null>(null);
  useEffect(() => {
    app.get<unknown>("/api/models").then(
      (body) =>
        setOffered(
          parseModels(body)
            .map((m) => m.value)
            .filter((v) => v !== "auto"),
        ),
      () => setOffered([]),
    );
  }, [app]);
  useEffect(() => {
    if (value) setForm(toPricesForm(value, offered));
  }, [value, offered]);
  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!value) return <p className="text-sm text-muted">Loading…</p>;
  const save = async () => {
    const built = fromPricesForm(form);
    if (built.error) return setMessage({ error: built.error });
    try {
      const saved = await api.savePrices(workspaceId, built.input!, value.hash);
      await reload();
      setMessage({ ok: `Saved as version ${saved.version}.` });
    } catch (caught) {
      setMessage({ error: errorMessage(caught) });
    }
  };
  const setRow = (i: number, change: Partial<PricesForm["rows"][number]>) =>
    setForm({
      ...form,
      rows: form.rows.map((row, j) => (j === i ? { ...row, ...change } : row)),
    });
  return (
    <Card className="flex flex-col gap-3">
      <Section
        title="Prices"
        blurb="Dollars per million input and output tokens for each model, and per Kiro credit. Budgets turn usage into dollars with these. Avoozl ships no prices."
        actions={<Badge>This computer only</Badge>}
      >
        {value.error && (
          <p
            role="alert"
            className="text-sm"
            style={{ color: "var(--danger)" }}
          >
            {value.error}
          </p>
        )}
        <p className="text-xs text-muted">
          {value.version
            ? `Version ${value.version}${value.savedAt ? `, saved ${new Date(value.savedAt).toLocaleString()}` : ""}.`
            : "No prices yet. Until a model has a price, its turns count against the token and credit caps."}
        </p>
        <div
          className="flex min-w-0 flex-col gap-1 text-sm"
          style={{ maxWidth: "12rem" }}
        >
          <label
            htmlFor="price-credit"
            className="flex flex-wrap items-baseline gap-x-2"
          >
            <span className="font-medium">Dollars per credit</span>
            <Marker rule={OPTIONAL} />
          </label>
          <Input
            id="price-credit"
            inputMode="decimal"
            value={form.creditUsd}
            placeholder="none"
            onChange={(e) => setForm({ ...form, creditUsd: e.target.value })}
          />
          <code className="text-[11px] text-muted">prices.creditUsd</code>
        </div>
        {form.rows.length === 0 ? (
          <p className="text-sm text-muted">
            No models yet. They appear here once Kiro Crew lists them or a task
            uses one.
          </p>
        ) : (
          <table
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col">Model</th>
                <th scope="col">$ per M input</th>
                <th scope="col">$ per M output</th>
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, i) => (
                <tr
                  key={row.model}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <th
                    scope="row"
                    className="break-all py-1 pr-2 text-left font-normal"
                  >
                    {row.model}
                    {row.unpricedTurns > 0 && !row.input && (
                      <span className="block text-xs text-muted">
                        {row.unpricedTurns} turns with no price
                      </span>
                    )}
                  </th>
                  <td className="py-1 pr-2">
                    <Input
                      aria-label={`${row.model} dollars per million input tokens`}
                      inputMode="decimal"
                      value={row.input}
                      placeholder="none"
                      onChange={(e) => setRow(i, { input: e.target.value })}
                      style={{ maxWidth: "8rem" }}
                    />
                  </td>
                  <td className="py-1">
                    <Input
                      aria-label={`${row.model} dollars per million output tokens`}
                      inputMode="decimal"
                      value={row.output}
                      placeholder="none"
                      onChange={(e) => setRow(i, { output: e.target.value })}
                      style={{ maxWidth: "8rem" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center gap-2">
          <Btn type="button" primary onClick={() => void save()}>
            Save
          </Btn>
          {message && (
            <p
              role={message.error ? "alert" : "status"}
              className="text-sm"
              style={message.error ? { color: "var(--danger)" } : undefined}
            >
              {message.error ?? message.ok}
            </p>
          )}
        </div>
      </Section>
    </Card>
  );
}
