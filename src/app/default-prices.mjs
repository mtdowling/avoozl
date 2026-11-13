// Built-in model prices (design §4.17, R67.2): public list prices in US
// dollars per million tokens, used when this machine sets no price of its
// own. Base input and output only: cache writes and hits are not read from
// Kiro Crew's usage rows, so they are not priced here.
//
// Source: the provider's public pricing page below, read on `updated`.
// shortcut: Claude models only, because they are the ones with a public
// per-token list price that Kiro Crew offers; add others with their own
// source when a public list price exists. Update the date with the numbers.
export const DEFAULT_PRICES = Object.freeze({
  updated: "2026-11-13",
  sources: Object.freeze([
    "https://platform.claude.com/docs/en/about-claude/pricing",
  ]),
  models: Object.freeze({
    "claude-fable-5.2": { inputPerMTokUsd: 8, outputPerMTokUsd: 40 },
    "claude-mythos-5.2": { inputPerMTokUsd: 8, outputPerMTokUsd: 40 },
    "claude-fable-5.1": { inputPerMTokUsd: 10, outputPerMTokUsd: 50 },
    "claude-mythos-5.1": { inputPerMTokUsd: 10, outputPerMTokUsd: 50 },
    "claude-fable-5": { inputPerMTokUsd: 10, outputPerMTokUsd: 50 },
    "claude-mythos-5": { inputPerMTokUsd: 10, outputPerMTokUsd: 50 },
    "claude-opus-5.5": { inputPerMTokUsd: 4, outputPerMTokUsd: 20 },
    "claude-opus-5": { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
    "claude-opus-4.8": { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
    "claude-opus-4.7": { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
    "claude-opus-4.6": { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
    "claude-opus-4.5": { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
    "claude-opus-4.1": { inputPerMTokUsd: 15, outputPerMTokUsd: 75 },
    "claude-opus-4": { inputPerMTokUsd: 15, outputPerMTokUsd: 75 },
    "claude-sonnet-5.5": { inputPerMTokUsd: 2, outputPerMTokUsd: 10 },
    "claude-sonnet-5": { inputPerMTokUsd: 2, outputPerMTokUsd: 10 },
    "claude-sonnet-4.6": { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
    "claude-sonnet-4.5": { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
    "claude-sonnet-4": { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
    // The price for prompts up to 100,000 tokens; longer prompts cost more.
    "claude-haiku-5.5": { inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.5 },
    "claude-haiku-4.5": { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
  }),
});

// One model ID in the built-in table's form: lower case, no provider
// prefix ("anthropic." or "vendor/"), no date or version suffix, and dots
// between version numbers ("claude-sonnet-4-5" -> "claude-sonnet-4.5").
export function priceKey(model) {
  return String(model)
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/^(?:[a-z]+\.)+(?=claude-)/, "")
    .replace(/(?:-v\d+(?::\d+)?|-\d{8}|-latest)+$/, "")
    .replace(/(\d)-(\d)(?!\d)/g, "$1.$2");
}

// The built-in price for a model, or null.
export function defaultPrice(model, table = DEFAULT_PRICES) {
  if (!model) return null;
  return table.models[model] ?? table.models[priceKey(model)] ?? null;
}
