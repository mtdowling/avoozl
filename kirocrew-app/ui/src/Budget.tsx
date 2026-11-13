// Budgets on the page (design §4.17): the spend chip, the drawer's Budget
// fold with the receipt and Export JSON, and the person-only actions.
import { useCallback, useEffect, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Btn } from "@kirocrew/app-sdk/ui";
import Badge from "./Badge.tsx";
import { Tooltip } from "./Tooltip.tsx";
import {
  MODE_TEXT,
  budgetApi,
  chipText,
  chipTone,
  chipVariant,
  receiptFile,
  showChip,
  toRaise,
  unknownText,
  usd,
  type BudgetChip,
  type Receipt,
  type ReceiptLine,
} from "./budget-api.ts";
import { errorMessage } from "./workspace-api.ts";

// `$1.20 / $5.00`; amber from 80%, red at the cap, "Over budget" in warn mode.
export function SpendChip({
  budget,
}: {
  budget: BudgetChip | null | undefined;
}) {
  if (!showChip(budget)) return null;
  const tone = chipTone(budget);
  const badge = <Badge variant={chipVariant[tone]}>{chipText(budget)}</Badge>;
  if (!budget.unknown.length)
    return <span data-budget-chip={tone}>{badge}</span>;
  return (
    <Tooltip
      text={`Spend unknown: ${unknownText(budget.unknown)}. The budget does not stop a task for that.`}
    >
      {(describedBy) => (
        <span
          data-budget-chip={tone}
          tabIndex={0}
          aria-describedby={describedBy}
        >
          {badge}
        </span>
      )}
    </Tooltip>
  );
}

// Raise budget, Stop, Acknowledge and Switch to stop: a person's only.
export function BudgetActions(props: {
  workspaceId: string;
  taskId: string;
  budget: BudgetChip;
  onDone: (text: string) => void | Promise<void>;
}) {
  const api = budgetApi(useAppApi());
  const { budget } = props;
  const [amount, setAmount] = useState(() =>
    String(Math.max(1, Math.ceil((budget.cap.usd ?? budget.spent) * 1.5))),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (call: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError(null);
    try {
      await call();
      await props.onDone(text);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const raise = () => {
    const parsed = toRaise(amount);
    if (parsed.error) return setError(parsed.error);
    return act(
      () => api.raise(props.workspaceId, props.taskId, parsed.usd!),
      `Budget raised to ${usd(parsed.usd)}.`,
    );
  };
  const stopped = budget.state === "open",
    over = budget.over?.open && budget.state === null;
  if (!stopped && !over && budget.state !== "paused") return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>New cap in dollars</span>
          <input
            className="rounded border px-2 py-1"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              width: "8rem",
            }}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby={
              error ? `budget-error-${props.taskId}` : undefined
            }
          />
        </label>
        <Btn disabled={busy} onClick={raise}>
          Raise budget
        </Btn>
        {over && (
          <Btn
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(
                () => api.acknowledge(props.workspaceId, props.taskId),
                "Acknowledged.",
              )
            }
          >
            Acknowledge
          </Btn>
        )}
        {over && (
          <Btn
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(
                () => api.switchToStop(props.workspaceId, props.taskId),
                "Switched to stop.",
              )
            }
          >
            Switch to stop
          </Btn>
        )}
        {stopped && (
          <Btn
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(
                () => api.stop(props.workspaceId, props.taskId),
                "Stopped. It waits like a Deferred task.",
              )
            }
          >
            Stop
          </Btn>
        )}
      </div>
      {error && (
        <p
          id={`budget-error-${props.taskId}`}
          role="alert"
          className="text-sm"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function LineTable({
  title,
  rows,
  name,
}: {
  title: string;
  rows: ReceiptLine[];
  name: "stage" | "model" | "attempt";
}) {
  if (!rows.length) return null;
  return (
    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
      <caption className="text-left text-xs font-semibold text-muted">
        {title}
      </caption>
      <thead>
        <tr className="text-left text-xs text-muted">
          <th scope="col">{name[0].toUpperCase() + name.slice(1)}</th>
          <th scope="col">In</th>
          <th scope="col">Out</th>
          <th scope="col">Credits</th>
          <th scope="col">Dollars</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={String(row[name])}
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <td className="break-all">
              {row[name]}
              {row.shared ? (
                <span className="text-xs text-muted"> (shared)</span>
              ) : null}
            </td>
            <td>{num(row.input)}</td>
            <td>{num(row.output)}</td>
            <td>{num(row.credits)}</td>
            <td>
              {row.priced ? (
                usd(row.usd)
              ) : (
                <span className="text-muted">
                  {row.usd ? `${usd(row.usd)} + unpriced` : "unpriced"}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The drawer's Budget fold, after Timing.
export function BudgetFold(props: {
  workspaceId: string;
  taskId: string;
  onChange?: () => void;
}) {
  const api = budgetApi(useAppApi());
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api.receipt(props.workspaceId, props.taskId).then(
        (r) => {
          setReceipt(r);
          setError(null);
        },
        (caught) => setError(errorMessage(caught)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.workspaceId, props.taskId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!receipt) return <p className="text-sm text-muted">Loading…</p>;
  const chip: BudgetChip = {
    taskId: receipt.taskId,
    spent: receipt.totals.usd,
    tokens: receipt.totals.input + receipt.totals.output,
    credits: receipt.totals.credits,
    unpricedTurns: receipt.totals.unpricedTurns,
    cap: receipt.cap,
    ratio: receipt.warning.ratio,
    warning: receipt.warning.at80,
    reached: receipt.warning.ratio >= 1,
    state: receipt.state,
    over: receipt.over,
    unknown: receipt.missing.map((m) => m.reason),
    unpricedModels: receipt.byModel
      .filter((m) => !m.priced)
      .map((m) => String(m.model)),
  };
  const exportJson = () => {
    const file = receiptFile(receipt);
    const url = URL.createObjectURL(
      new Blob([file.text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-3" data-budget-fold={receipt.taskId}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          {usd(receipt.totals.usd)} of {usd(receipt.cap.usd)}
        </span>
        {showChip(chip) && <SpendChip budget={chip} />}
        {receipt.warning.at80 && !chip.reached && (
          <Badge variant="warning">80% of the cap</Badge>
        )}
      </div>
      <p className="text-xs text-muted">
        {receipt.cap.usd == null
          ? "No dollar cap is set."
          : `Cap from the ${receipt.cap.level} level. `}
        {MODE_TEXT[receipt.cap.mode]} Unpriced turns count against{" "}
        {num(receipt.cap.tokens ?? 0)} tokens and{" "}
        {num(receipt.cap.credits ?? 0)} credits.
        {receipt.readAt
          ? ` Last usage read ${new Date(receipt.readAt).toLocaleString()}.`
          : ""}
      </p>
      {!receipt.complete && (
        <p className="text-sm" role="status">
          Spend unknown for part of this task:{" "}
          {unknownText([...new Set(receipt.missing.map((m) => m.reason))])}. The
          budget does not stop it for that.
        </p>
      )}
      {receipt.overrun ? (
        <p className="text-sm">
          Ran {usd(receipt.overrun)} past the cap before the stop took hold.
        </p>
      ) : null}
      {note && (
        <p className="text-sm" role="status">
          {note}
        </p>
      )}
      <BudgetActions
        workspaceId={props.workspaceId}
        taskId={receipt.taskId}
        budget={chip}
        onDone={async (text) => {
          setNote(text);
          await load();
          props.onChange?.();
        }}
      />
      <LineTable title="By stage" rows={receipt.byStage} name="stage" />
      <LineTable title="By model" rows={receipt.byModel} name="model" />
      <LineTable title="By attempt" rows={receipt.byAttempt} name="attempt" />
      {receipt.raises.length > 0 && (
        <ul className="text-xs text-muted">
          {receipt.raises.map((r, i) => (
            <li key={i}>
              {r.by} raised {usd(r.from.usd ?? null)} to {usd(r.to.usd ?? null)}{" "}
              on {new Date(r.at).toLocaleString()} (prices v{r.priceVersion})
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Prices version {receipt.price.version}
        {receipt.price.version === 0
          ? ": none set. Add them in Settings › Prices."
          : "."}
      </p>
      <div>
        <Btn variant="ghost" onClick={exportJson}>
          Export JSON
        </Btn>
      </div>
    </div>
  );
}
