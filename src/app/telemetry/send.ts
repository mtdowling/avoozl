// @ts-nocheck: typing debt
// Posts queued traces and points to the OTLP endpoint (spec otel-export,
// OT10, OT12, §D10). One request at a time, no redirect, retries with
// backoff, and counters that live in memory. The header values live in this
// closure and reach no status, log or error.
import { buildMetrics, buildTrace } from "./otlp.ts";

const BATCH_ITEMS = 20;
const ATTEMPTS = 5;
const MAX_DELAY_MS = 60_000;
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const TLS =
  /^(ERR_TLS|ERR_SSL|CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|HOSTNAME_MISMATCH)/;

// What went wrong, as a kind and never the error's own words.
export function failureKind(error) {
  const code = String(error?.cause?.code ?? error?.code ?? "");
  if (error?.name === "TimeoutError" || error?.name === "AbortError")
    return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (TLS.test(code)) return "tls";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT")
    return "timeout";
  return "refused";
}

// Seconds, or a date, as milliseconds from `now`.
function retryAfter(value, now) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export function createSender({
  config,
  context,
  queue,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  random = Math.random,
  version = "unknown",
  log = () => {},
}) {
  const { headers, timeoutMs, endpoints } = config;
  const counts = { sent: 0, dropped: 0, rejected: 0 };
  let lastSuccessAt = null;
  let lastFailure = null;
  let nextAt = 0;
  let batch = null;
  let inflight = false;
  try {
    log(
      `OpenTelemetry export to ${new URL(endpoints.traces ?? endpoints.metrics).host}`,
    );
  } catch {}

  async function post(url, body) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "user-agent": `avoozl/${version}`,
      },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // The reply's body is never read.
    await response.body?.cancel?.().catch(() => {});
    return response;
  }

  function newBatch() {
    const items = queue.take(BATCH_ITEMS);
    if (!items.length) return null;
    const traces = items
      .filter((item) => item.type === "trace")
      .map((item) => buildTrace(item.trace, context))
      .filter(Boolean);
    const points = items.flatMap((item) => item.points ?? []);
    const signal = (body, url, units) =>
      body && url ? { body, url, units, done: false } : null;
    return {
      items,
      attempts: 0,
      signals: [
        signal(
          traces.length && {
            resourceSpans: traces.flatMap((body) => body.resourceSpans),
          },
          endpoints.traces,
          traces.length,
        ),
        signal(buildMetrics(points, context), endpoints.metrics, points.length),
      ].filter(Boolean),
    };
  }

  function finish() {
    queue.remove(batch.items);
    batch = null;
  }

  return {
    // One pass: send the pending batch, or the next one. Never throws.
    async pass() {
      if (inflight || now() < nextAt) return;
      inflight = true;
      try {
        batch ??= newBatch();
        if (!batch) return;
        for (const signal of batch.signals) {
          if (signal.done) continue;
          let response;
          try {
            response = await post(signal.url, signal.body);
          } catch (error) {
            lastFailure = failureKind(error);
          }
          const status = response?.status;
          if (status >= 200 && status < 300) {
            signal.done = true;
            counts.sent += signal.units;
            lastSuccessAt = new Date(now()).toISOString();
            lastFailure = null;
            batch.attempts = 0;
            continue;
          }
          if (status !== undefined) lastFailure = `http ${status}`;
          if (status !== undefined && !RETRY_STATUS.has(status)) {
            signal.done = true;
            counts.rejected += signal.units;
            continue;
          }
          batch.attempts++;
          if (batch.attempts >= ATTEMPTS) {
            for (const left of batch.signals)
              if (!left.done) counts.dropped += left.units;
            finish();
            return;
          }
          const wait =
            retryAfter(response?.headers?.get("retry-after"), now()) ??
            Math.min(MAX_DELAY_MS, 1000 * 2 ** (batch.attempts - 1));
          nextAt = now() + wait * (1 + random() * 0.25);
          return;
        }
        finish();
      } catch (error) {
        lastFailure = failureKind(error);
      } finally {
        inflight = false;
      }
    },
    // Items lost to a full queue.
    dropped(units) {
      counts.dropped += units;
    },
    status: () => ({
      state: now() < nextAt ? "backing-off" : "sending",
      failure: lastFailure,
      ...counts,
      queued: queue.units(),
      lastSuccessAt,
    }),
  };
}
