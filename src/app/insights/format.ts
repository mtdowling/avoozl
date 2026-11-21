// The words `avoozl insights` and the Insights view share. Imports nothing,
// so the page bundles it.

// Seconds as a person reads them: 45 s, 12 min, 3.5 h, 2.1 d.
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "none";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 360) / 10} h`;
  return `${Math.round(seconds / 8640) / 10} d`;
}

// The main branch's check state, as the strip and the CLI write it.
export const MAIN_WORDS: Record<string, string> = {
  passing: "passing",
  stopped: "line stopped",
  unknown: "not read yet",
};
