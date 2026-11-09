import test from "node:test";
import assert from "node:assert/strict";
import { createPanMomentum } from "./pan-momentum.mjs";
function fixture(options = {}) {
  let clock = 0,
    id = 0,
    x = 0,
    y = 0,
    ended = 0,
    pending = new Map(),
    deltas = [];
  const pan = createPanMomentum({
    requestFrame: (cb) => {
      pending.set(++id, cb);
      return id;
    },
    cancelFrame: (key) => pending.delete(key),
    now: () => clock,
    reducedMotion: options.reducedMotion || (() => false),
    move: (dx, dy) => {
      x += dx;
      y += dy;
      deltas.push(Math.hypot(dx, dy));
      return options.move?.(dx, dy);
    },
    end: () => ended++,
  });
  return {
    pan,
    advance(ms) {
      clock += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(clock);
    },
    fling() {
      pan.begin(0, 0, 0);
      pan.sample(50, 25, 50);
      clock = 50;
      return pan.release(50);
    },
    get state() {
      return { x, y, ended, pending: pending.size, deltas };
    },
  };
}
test("a fast pan coasts, decelerates and becomes idle", () => {
  const f = fixture();
  assert.ok(f.fling());
  for (let i = 0; i < 100; i++) f.advance(16);
  const s = f.state;
  assert.ok(s.x > 200 && s.x < 250);
  assert.ok(s.y > 100 && s.y < 125);
  assert.ok(s.deltas.every((n, i, a) => !i || n < a[i - 1]));
  assert.equal(s.ended, 1);
  assert.equal(s.pending, 0);
  assert.equal(f.pan.running, false);
});
test("coasting distance is independent of display refresh rate", () => {
  const a = fixture(),
    b = fixture();
  a.fling();
  b.fling();
  for (let i = 0; i < 30; i++) a.advance(16);
  for (let i = 0; i < 60; i++) b.advance(8);
  assert.ok(Math.abs(a.state.x - b.state.x) < 1e-8);
});
test("a hold before release and a slow drag do not fling", () => {
  const f = fixture();
  f.pan.begin(0, 0, 0);
  f.pan.sample(100, 0, 50);
  assert.equal(f.pan.release(121), false);
  f.pan.begin(0, 0, 0);
  f.pan.sample(1, 0, 50);
  assert.equal(f.pan.release(50), false);
  assert.equal(f.state.pending, 0);
});
test("new input cancels momentum, and boundaries stop work", () => {
  const f = fixture();
  f.fling();
  f.advance(16);
  f.pan.begin(0, 0, 80);
  assert.equal(f.state.pending, 0);
  assert.equal(f.state.ended, 1);
  const bounded = fixture({ move: () => false });
  bounded.fling();
  bounded.advance(16);
  assert.equal(bounded.state.pending, 0);
  assert.equal(bounded.pan.running, false);
});
test("only the blocked axis stops in a two-dimensional pan", () => {
  const f = fixture({ move: (x, y) => ({ x: 0, y }) });
  f.fling();
  f.advance(16);
  const first = f.state;
  f.advance(16);
  assert.equal(f.state.x, first.x);
  assert.ok(f.state.y > first.y);
});
test("reduced motion, cancelled gestures and background delays do not coast", () => {
  const f = fixture({ reducedMotion: () => true });
  assert.equal(f.fling(), false);
  const g = fixture();
  g.pan.begin(0, 0, 0);
  g.pan.sample(50, 0, 50);
  g.pan.stop();
  assert.equal(g.pan.release(50), false);
  g.fling();
  g.advance(1000);
  assert.equal(g.state.x, 0);
  assert.equal(g.state.pending, 0);
});
test("old travel does not keep a stopped hand moving", () => {
  const f = fixture();
  f.pan.begin(0, 0, 0);
  for (let t = 20; t <= 200; t += 20) f.pan.sample(Math.min(t, 80), 0, t);
  assert.equal(f.pan.release(200), false);
});
