// Budget actions on the page (design §4.17): the person-only buttons.
import { useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Btn } from "@kirocrew/app-sdk/ui";
import { budgetApi, toRaise, usd, type BudgetChip } from "./budget-api.ts";
import { errorMessage } from "./workspace-api.ts";

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
