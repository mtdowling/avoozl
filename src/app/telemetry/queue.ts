// @ts-nocheck: typing debt
// The OTLP exporter's memory queue (spec otel-export, OT10.3): at most 500
// items, an item being one trace or up to 100 points. When it is full the
// oldest item goes. Nothing here does I/O.
export const MAX_ITEMS = 500;
export const POINTS_PER_ITEM = 100;

export function createQueue(max = MAX_ITEMS) {
  const items = [];
  // Drop the oldest item that is not in flight; returns the units it held.
  function overflow() {
    let dropped = 0;
    while (items.length > max) {
      const at = items.findIndex((item) => !item.sealed);
      if (at < 0) break;
      dropped += items.splice(at, 1)[0].units;
    }
    return dropped;
  }
  return {
    // Each returns the number of traces or points dropped to make room.
    addTrace(trace) {
      items.push({ type: "trace", trace, units: 1 });
      return overflow();
    },
    addPoint(point) {
      const last = items.at(-1);
      if (
        last?.type === "points" &&
        !last.sealed &&
        last.units < POINTS_PER_ITEM
      ) {
        last.points.push(point);
        last.units++;
        return 0;
      }
      items.push({ type: "points", points: [point], units: 1 });
      return overflow();
    },
    // The oldest `count` items, sealed so that they stop growing.
    take(count) {
      const taken = items.slice(0, count);
      for (const item of taken) item.sealed = true;
      return taken;
    },
    remove(taken) {
      for (const item of taken) {
        const at = items.indexOf(item);
        if (at >= 0) items.splice(at, 1);
      }
    },
    clear() {
      items.length = 0;
    },
    length: () => items.length,
    units: () => items.reduce((sum, item) => sum + item.units, 0),
  };
}
