// @ts-nocheck: typing debt
// Starts telemetry for one store (spec otel-export, OT4, OT10, §D6): the
// SQLite exporter is already registered when the database opens, and this
// starts the 5-second timer that registers or unregisters the OTLP exporter
// from machine config and sends. Only the process that runs the tick calls
// it; any other process records to SQLite only.
import { readTelemetryConfig } from "./config.ts";
import { createQueue } from "./queue.ts";
import {
  registerExporter,
  sqliteExporter,
  unregisterExporter,
} from "./record.ts";
import { createSender } from "./send.ts";
import { LIMITS } from "./sqlite-exporter.ts";
import { instanceId } from "./state.ts";

const handles = new WeakMap();
const INTERVAL_MS = 5000;
const FLUSH_MS = 5000;

// The words of Settings and the CLI, by status, with the state a registered
// exporter is in replacing `ready`.
export function telemetryStatusReply(store, config, active) {
  const sender = active?.sender.status();
  return {
    status: sender && config.status === "ready" ? sender.state : config.status,
    failure: sender?.failure ?? null,
    endpoint: config.endpoint,
    endpointFrom: config.endpointFrom,
    protocol: config.protocol,
    headerNames: config.headerNames,
    missingHeaders: config.missingHeaders,
    saved: config.saved,
    sent: sender?.sent ?? 0,
    queued: sender?.queued ?? 0,
    dropped: sender?.dropped ?? 0,
    rejected: sender?.rejected ?? 0,
    lastSuccessAt: sender?.lastSuccessAt ?? null,
    local: {
      ...sqliteExporter(store).counts(),
      days: LIMITS.days,
      spanCap: LIMITS.spanCap,
      pointCap: LIMITS.pointCap,
    },
  };
}

export function startTelemetry({
  store,
  configDirectory,
  stateDirectory,
  env = process.env,
  version,
  log,
  fetchImpl,
  intervalMs = INTERVAL_MS,
}) {
  const known = handles.get(store);
  if (known) return known;
  let active = null;
  let config = readTelemetryConfig(configDirectory, env);

  function stopExporter() {
    if (!active) return;
    unregisterExporter(store, "otlp");
    active.queue.clear();
    active = null;
  }

  function startExporter() {
    const queue = createQueue();
    const sender = createSender({
      config,
      context: {
        instanceId: instanceId(stateDirectory),
        serviceName: config.serviceName,
        resource: config.resource,
      },
      queue,
      version,
      log,
      fetchImpl,
    });
    const lost = (units) => units && sender.dropped(units);
    registerExporter(store, {
      name: "otlp",
      onTrace: (trace) => lost(queue.addTrace(trace)),
      onPoint: (row) => lost(queue.addPoint(row)),
      status: () => sender.status(),
    });
    active = { queue, sender };
  }

  // One pass: follow the setting, then send. Never throws.
  async function step() {
    try {
      config = readTelemetryConfig(configDirectory, env);
      if (config.status === "ready" && !active) startExporter();
      else if (config.status !== "ready") stopExporter();
      await active?.sender.pass();
    } catch {}
  }

  const timer = setInterval(step, intervalMs);
  timer.unref();
  const handle = {
    step,
    status: () => telemetryStatusReply(store, config, active),
    // Send what is queued, for a process that is about to end. Bounded, and
    // never throws.
    async flush(limit = FLUSH_MS) {
      await step();
      const deadline = Date.now() + limit;
      while (active?.queue.length() && Date.now() < deadline) {
        const before = active.queue.units();
        await Promise.race([
          active.sender.pass(),
          new Promise((resolve) => setTimeout(resolve, limit).unref()),
        ]);
        if (active?.queue.units() >= before) break;
      }
    },
    stop() {
      clearInterval(timer);
      stopExporter();
      handles.delete(store);
    },
  };
  store.telemetryStop = handle.stop;
  handles.set(store, handle);
  step();
  return handle;
}

export const telemetryHandle = (store) => handles.get(store) ?? null;

// The status for a process that does not run the exporter: the setting and
// the environment as this process sees them, and the local counts.
export function telemetryStatus(store, { configDirectory, env = process.env }) {
  const handle = telemetryHandle(store);
  if (handle) return handle.status();
  return telemetryStatusReply(
    store,
    readTelemetryConfig(configDirectory, env),
    null,
  );
}
