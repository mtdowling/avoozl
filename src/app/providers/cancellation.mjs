// Intentional-interruption contract shared by the provider adapters.
//
// A provider turn can end for unrelated reasons that look alike on the wire:
// the user canceled it, the provider failed, or the provider finished just as
// the cancellation arrived. Clicking Cancel must never relabel a genuine
// provider failure, and a stopped process must never be reported as a failure.
//
// Adapters record an interruption intent before asking the provider to stop,
// count their own provider observations so ordering does not depend on clocks,
// and classify the turn's terminal event through `classifyTurnEnd`. The
// provider's own diagnostic is always preserved, even when the run state is
// interrupted, so real errors stay visible.
export const INTERRUPTION_CONTRACT_VERSION = 1;

export const TERMINAL_STATES = ["completed", "interrupted", "failed"];

// Recorded intent. `observation` is the adapter's provider-message counter at
// the moment the user asked to stop, so a terminal event that the adapter had
// already observed cannot be attributed to this request.
export function requestInterruption(observation, reason = "client-cancel") {
  return {
    contract: INTERRUPTION_CONTRACT_VERSION,
    reason,
    observation,
    requestedAt: new Date().toISOString(),
    acknowledgedAt: null,
    acknowledgment: null,
  };
}

export function acknowledgeInterruption(interruption, acknowledgment = {}) {
  if (!interruption) return interruption;
  interruption.acknowledgedAt = new Date().toISOString();
  interruption.acknowledgment = acknowledgment;
  return interruption;
}

// Decide a truthful terminal state.
//
// `providerState` is the provider's own classification when it reports one
// ("completed", "interrupted", "failed"); Claude reports none and relies on
// `isError`. `observation` is the adapter's counter for the terminal event.
export function classifyTurnEnd({
  interruption = null,
  providerState,
  isError = false,
  diagnostic = null,
  observation = Number.MAX_SAFE_INTEGER,
} = {}) {
  const detail = diagnostic || null;
  // The provider is authoritative when it distinguishes interruption itself.
  if (providerState === "interrupted")
    return {
      state: "interrupted",
      error: undefined,
      cancellation: {
        source: "provider",
        requested: Boolean(interruption),
        requestedAt: interruption?.requestedAt || null,
        acknowledgedAt: interruption?.acknowledgedAt || null,
        reason: interruption?.reason || "provider-interrupted",
        contract: INTERRUPTION_CONTRACT_VERSION,
      },
      ...(detail ? { providerDiagnostic: detail } : {}),
    };
  // Only an intent recorded before this event was observed can explain it.
  const applies =
    Boolean(interruption) && interruption.observation <= observation;
  if (!applies)
    return isError || providerState === "failed"
      ? { state: "failed", error: detail || "The provider reported a failure." }
      : { state: "completed", error: undefined };
  // The stop was requested and the turn ended inside that window. The run is
  // interrupted, not failed: a process we asked to stop is not a defect.
  //
  // A provider that does not report interruption status of its own leaves one
  // case genuinely undecidable — the turn may have finished a moment before
  // the request landed. That uncertainty is recorded rather than resolved by
  // guessing, so a reader is never told something the host does not know.
  return {
    state: "interrupted",
    error: undefined,
    cancellation: {
      source: "client",
      requested: true,
      requestedAt: interruption.requestedAt,
      acknowledgedAt: interruption.acknowledgedAt,
      reason: interruption.reason,
      providerConfirmed: false,
      // Without a provider interruption status, a clean terminal result may
      // mean the turn completed just before the request arrived.
      completionRace: isError ? "no" : "possible",
      contract: INTERRUPTION_CONTRACT_VERSION,
    },
    // The provider still said something. Keep it rather than discarding it:
    // the run stopped because it was asked to, and this is what the provider
    // reported. A reader can tell the two apart.
    ...(detail
      ? { providerDiagnostic: detail, diagnosticDuringInterruption: true }
      : {}),
  };
}
