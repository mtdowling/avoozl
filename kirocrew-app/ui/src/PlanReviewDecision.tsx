import { useEffect, useState } from "react";
import { Btn } from "@kirocrew/app-sdk/ui";

export function PlanReviewDecision(props: {
  planId: string;
  revisionHash: string;
  busy: boolean;
  onDecide: (action: "review" | "skip") => Promise<unknown>;
  run: (call: () => Promise<{ ok: boolean; text: string }>) => void;
}) {
  const [chosen, setChosen] = useState<"review" | "skip" | null>(null);
  useEffect(() => setChosen(null), [props.planId, props.revisionHash]);
  const choose = (action: "review" | "skip") =>
    props.run(async () => {
      await props.onDecide(action);
      setChosen(action);
      return {
        ok: true,
        text:
          action === "review"
            ? "Review queued for the next Check."
            : "Review skipped for this revision.",
      };
    });
  if (chosen)
    return (
      <p data-draft-review-choice className="text-sm text-muted">
        {chosen === "review" ? "Review queued." : "Review skipped."}
      </p>
    );
  return (
    <div data-draft-review-choice className="flex flex-wrap gap-2">
      <Btn primary disabled={props.busy} onClick={() => choose("review")}>
        Review
      </Btn>
      <Btn disabled={props.busy} onClick={() => choose("skip")}>
        Skip
      </Btn>
    </div>
  );
}
