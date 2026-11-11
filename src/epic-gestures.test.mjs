import test from "node:test";
import assert from "node:assert/strict";
import {
  installEpicGestures,
  zoomEpicCamera,
  createEpicProgress,
  resolveEpicLabelWidth,
} from "./progress.mjs";
function fixture() {
  const listeners = new Map(),
    captured = new Set(),
    classes = new Set(),
    calls = [];
  let zoom = 100;
  const viewport = {
    clientWidth: 1000,
    clientHeight: 500,
    scrollLeft: 200,
    scrollTop: 100,
    getBoundingClientRect: () => ({ left: 50, top: 100 }),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    hasPointerCapture: (id) => captured.has(id),
    setPointerCapture: (id) => captured.add(id),
  };
  const root = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
  };
  function camera(x = 660) {
    const anchor = Math.max(0, Math.min(780, x - 50 - 220));
    return {
      zoom,
      fraction: (viewport.scrollLeft + anchor) / ((780 * zoom) / 100),
      top: viewport.scrollTop,
      anchor,
    };
  }
  const momentum = Object.fromEntries(
    ["stop", "begin", "sample", "release"].map((name) => [
      name,
      (...args) => calls.push([name, ...args]),
    ]),
  );
  const gestures = installEpicGestures(root, {
    getViewport: () => viewport,
    captureCamera: camera,
    momentum,
    setZoom(value, x, c = {}) {
      const next = zoomEpicCamera(
        {
          zoom,
          left: viewport.scrollLeft,
          width: 780,
          anchor: camera(x).anchor,
        },
        value,
        c.fraction,
      );
      zoom = next.zoom;
      viewport.scrollLeft = next.left;
      if (c.top !== undefined) viewport.scrollTop = Math.max(0, c.top);
    },
  });
  function fire(type, input = {}) {
    const e = {
      type,
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 300,
      timeStamp: 100,
      target: { closest: () => viewport },
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...input,
    };
    for (const fn of listeners.get(type) || []) fn(e);
    return e;
  }
  return {
    fire,
    gestures,
    viewport,
    captured,
    calls,
    camera,
    get zoom() {
      return zoom;
    },
  };
}
test("two fingers zoom around their midpoint and pan vertically", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2, clientX: 500 });
  const anchor = f.camera(400).fraction;
  f.fire("pointermove", { clientX: 250, clientY: 320 });
  f.fire("pointermove", { pointerId: 2, clientX: 550, clientY: 320 });
  assert.equal(f.zoom, 150);
  assert.ok(Math.abs(f.camera(400).fraction - anchor) < 1e-12);
  assert.equal(f.viewport.scrollTop, 80);
  assert.deepEqual([...f.captured], [1, 2]);
  assert.ok(f.gestures.consumeClick());
});
test("pinch release does not fling, and the remaining finger can resume panning", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2, clientX: 500 });
  f.fire("pointermove", { pointerId: 2, clientX: 600 });
  f.fire("pointerup", { pointerId: 2 });
  const before = f.viewport.scrollLeft;
  f.fire("pointermove", { clientX: 280, timeStamp: 130 });
  assert.equal(f.viewport.scrollLeft, before + 20);
  f.fire("pointerup", { timeStamp: 140 });
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 1);
  const g = fixture();
  g.fire("pointerdown");
  g.fire("pointerdown", { pointerId: 2, clientX: 500 });
  g.fire("pointerup", { pointerId: 2 });
  g.fire("pointerup");
  assert.equal(g.calls.filter((c) => c[0] === "release").length, 0);
});
test("single-finger taps still select, and single-finger drags retain momentum", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerup");
  assert.equal(f.gestures.consumeClick(), false);
  f.fire("pointerdown");
  f.fire("pointermove", { clientX: 250, timeStamp: 140 });
  f.fire("pointerup", { timeStamp: 150 });
  assert.ok(f.gestures.consumeClick());
  assert.equal(f.gestures.consumeClick(), false);
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 1);
});
test("taking touch capture from a task keeps the drag and release velocity", () => {
  const f = fixture(),
    task = { closest: () => f.viewport };
  f.fire("pointerdown", { target: task, pointerType: "touch" });
  f.fire("pointermove", {
    target: task,
    pointerType: "touch",
    clientY: 290,
    timeStamp: 110,
  });
  assert.equal(f.viewport.scrollTop, 110);
  assert.ok(f.captured.has(1));
  // Touch implicitly captures the pressed task. Transferring capture to the
  // viewport sends this event from that task before the next pointermove.
  f.fire("lostpointercapture", { target: task, pointerType: "touch" });
  f.fire("pointermove", { clientY: 200, timeStamp: 140 });
  assert.equal(f.viewport.scrollTop, 200);
  f.fire("pointerup", { timeStamp: 150 });
  assert.deepEqual(
    f.calls.filter((c) => c[0] === "sample").map((c) => c[2]),
    [290, 200],
  );
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 1);
  assert.ok(f.gestures.consumeClick());
});
test("losing viewport capture cancels a drag without momentum", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointermove", { clientY: 290, timeStamp: 110 });
  f.captured.delete(1);
  f.fire("lostpointercapture", { target: f.viewport });
  f.fire("pointermove", { clientY: 200, timeStamp: 140 });
  f.fire("pointerup", { timeStamp: 150 });
  assert.equal(f.viewport.scrollTop, 110);
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 0);
  assert.ok(f.gestures.consumeClick());
});
test("touch capture handoffs preserve both fingers during a pinch", () => {
  const f = fixture(),
    task = { closest: () => f.viewport };
  f.fire("pointerdown", { target: task });
  f.fire("pointerdown", { pointerId: 2, target: task, clientX: 500 });
  for (const pointerId of [1, 2])
    f.fire("lostpointercapture", { pointerId, target: task });
  f.fire("pointermove", { pointerId: 2, clientX: 600 });
  assert.equal(f.zoom, 150);
  f.fire("pointerup", { pointerId: 2 });
  f.fire("pointerup");
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 0);
  assert.ok(f.gestures.consumeClick());
});
test("cancellation and view resets clear every tracked finger", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2, clientX: 500 });
  f.fire("pointercancel");
  const before = f.zoom;
  f.fire("pointermove", { pointerId: 2, clientX: 900 });
  assert.equal(f.zoom, before);
  assert.equal(f.calls.filter((c) => c[0] === "release").length, 0);
  f.gestures.reset();
  assert.equal(f.gestures.consumeClick(), false);
});
test("Safari trackpad gestures use cumulative scale without double-applying wheel zoom", () => {
  const f = fixture(),
    start = f.fire("gesturestart", { clientX: 500, scale: 1 });
  assert.ok(start.defaultPrevented);
  f.fire("gesturechange", { clientX: 500, scale: 1.2 });
  assert.equal(f.zoom, 120);
  f.fire("gesturechange", { clientX: 500, scale: 1.5 });
  assert.equal(f.zoom, 150);
  f.fire("wheel", { ctrlKey: true, deltaY: -40 });
  assert.equal(f.zoom, 150);
  f.fire("gestureend", { timeStamp: 200 });
  f.fire("wheel", { ctrlKey: true, deltaY: -40, timeStamp: 220 });
  assert.equal(f.zoom, 150);
  f.fire("wheel", { ctrlKey: true, deltaY: -40, timeStamp: 300 });
  assert.ok(f.zoom > 150);
});
test("plain wheel scrolling stays native; modified wheel zoom remains anchored", () => {
  const f = fixture();
  assert.ok(!f.fire("wheel", { deltaY: 30 }).defaultPrevented);
  assert.equal(f.zoom, 100);
  const before = f.camera(500).fraction;
  assert.ok(
    f.fire("wheel", { ctrlKey: true, clientX: 500, deltaY: -30 })
      .defaultPrevented,
  );
  assert.ok(f.zoom > 100);
  assert.ok(Math.abs(f.camera(500).fraction - before) < 1e-12);
});
test("camera limits and degenerate pointer distances never produce invalid zoom", () => {
  for (const value of [0, -10, Infinity, NaN, 1e8]) {
    const c = zoomEpicCamera(
      { zoom: 100, left: 200, width: 780, anchor: 300 },
      value,
    );
    assert.ok(c.zoom >= 1 && c.zoom <= 16384);
    assert.ok(Number.isFinite(c.left));
  }
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2 });
  f.fire("pointermove", { pointerId: 2, clientX: 400 });
  assert.ok(Number.isFinite(f.zoom));
  assert.ok(f.zoom <= 16384);
});
test("a third finger rebases without jumping or triggering a task click", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2, clientX: 500 });
  f.fire("pointermove", { pointerId: 2, clientX: 600 });
  const before = f.zoom;
  f.fire("pointerdown", { pointerId: 3, clientX: 700 });
  f.fire("pointerup", { pointerId: 1 });
  assert.equal(f.zoom, before);
  f.fire("pointermove", { pointerId: 3, clientX: 750 });
  assert.ok(f.zoom > before);
  assert.ok(f.gestures.consumeClick());
});

test("Safari touch events do not duplicate two-pointer zoom or zoom the browser", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointerdown", { pointerId: 2, clientX: 500 });
  assert.ok(f.fire("gesturestart", { scale: 1 }).defaultPrevented);
  assert.ok(f.fire("gesturechange", { scale: 2 }).defaultPrevented);
  assert.equal(f.zoom, 100);
  f.fire("pointermove", { pointerId: 2, clientX: 600 });
  assert.equal(f.zoom, 150);
  assert.ok(f.fire("gestureend").defaultPrevented);
});

test("an unrendered chart can be suspended and suspended again during app startup", (t) => {
  const previous = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => {
    if (previous === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previous;
  });
  const root = { addEventListener() {}, replaceChildren() {} },
    chart = createEpicProgress(root, { select() {}, changeZoom() {} });
  assert.doesNotThrow(() => chart.suspend());
  assert.doesNotThrow(() => chart.suspend());
});

test("Epic labels respect persisted bounds and use a compact responsive fallback", () => {
  assert.equal(resolveEpicLabelWidth(1200, 360), 360);
  assert.equal(resolveEpicLabelWidth(1200, 50), 150);
  assert.equal(resolveEpicLabelWidth(1200, 900), 480);
  assert.equal(resolveEpicLabelWidth(760, 360), 150);
  assert.equal(resolveEpicLabelWidth(420, 480), 150);
});

test("a drag does not swallow the next zoom-control or keyboard click", () => {
  const f = fixture();
  f.fire("pointerdown");
  f.fire("pointermove", { clientX: 250, timeStamp: 140 });
  f.fire("pointerup", { timeStamp: 150 });
  assert.equal(
    f.gestures.consumeClick({ target: { closest: () => null }, detail: 1 }),
    false,
  );
  assert.equal(
    f.gestures.consumeClick({
      target: { closest: () => f.viewport },
      detail: 0,
    }),
    false,
  );
  assert.equal(
    f.gestures.consumeClick({
      target: { closest: () => f.viewport },
      detail: 1,
    }),
    true,
  );
});
