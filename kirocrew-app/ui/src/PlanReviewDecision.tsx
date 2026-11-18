import { useEffect, useState } from "react";
import { Btn } from "./ui/Btn";
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'

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
      <Hint data-draft-review-choice as="p" size="sm">
        {chosen === "review" ? "Review queued." : "Review skipped."}
      </Hint>
    );
  return (
    <Row data-draft-review-choice gap={2} align="start">
      <Btn primary disabled={props.busy} onClick={() => choose("review")}>
        Review
      </Btn>
      <Btn disabled={props.busy} onClick={() => choose("skip")}>
        Skip
      </Btn>
    </Row>
  );
}
