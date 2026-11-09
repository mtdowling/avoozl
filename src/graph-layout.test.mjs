import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dependencyLayout,
  dependencyRoute,
  dependencyPath,
  NODE_W,
  NODE_H,
} from "./graph-layout.mjs";

function crossesCard(a, b, p) {
  return a.x === b.x
    ? a.x > p.x &&
        a.x < p.x + NODE_W &&
        Math.max(a.y, b.y) > p.y &&
        Math.min(a.y, b.y) < p.y + NODE_H
    : a.y > p.y &&
        a.y < p.y + NODE_H &&
        Math.max(a.x, b.x) > p.x &&
        Math.min(a.x, b.x) < p.x + NODE_W;
}

test("example dependencies progress downward and connectors avoid other cards", () => {
  const example = JSON.parse(
    fs.readFileSync(
      new URL("../examples/product-launch.json", import.meta.url),
    ),
  );
  const positions = dependencyLayout(example.tasks, example.edges);
  for (const edge of example.edges) {
    assert.ok(positions[edge.to].y > positions[edge.from].y);
    const route = dependencyRoute(edge, positions, example.edges);
    assert.equal(route[0].y, positions[edge.from].y + NODE_H);
    assert.equal(route.at(-1).y, positions[edge.to].y);
    for (let i = 1; i < route.length; i++) {
      assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y);
      for (const [id, p] of Object.entries(positions)) {
        if (id !== edge.from && id !== edge.to)
          assert.equal(
            crossesCard(route[i - 1], route[i], p),
            false,
            `${edge.from} → ${edge.to} crosses ${id}`,
          );
      }
    }
    assert.doesNotMatch(
      dependencyPath(edge, positions, example.edges),
      /NaN|undefined/,
    );
  }
});

test("cycles, disconnected tasks, and soft connections keep a finite nonoverlapping layout", () => {
  const nodes = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const edges = [
    { from: "a", to: "b", kind: "requires" },
    { from: "b", to: "a", kind: "requires" },
    { from: "b", to: "c", kind: "requires" },
    { from: "c", to: "a", kind: "supports" },
  ];
  const positions = dependencyLayout(nodes, edges);
  for (const [id, p] of Object.entries(positions)) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    for (const [other, q] of Object.entries(positions)) {
      if (id === other) continue;
      assert.ok(Math.abs(p.x - q.x) >= NODE_W || Math.abs(p.y - q.y) >= NODE_H);
    }
  }
  assert.ok(positions.c.y > positions.b.y);
  assert.deepEqual(dependencyLayout([], []), {});
  assert.equal(dependencyPath({ from: "missing", to: "a" }, positions, []), "");
});

test("connectors follow moved cards and fan out at separate ports", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "a", to: "c" },
  ];
  const positions = {
    a: { x: 100, y: 0 },
    b: { x: 0, y: 210 },
    c: { x: 320, y: 210 },
  };
  const left = dependencyRoute(edges[0], positions, edges);
  const right = dependencyRoute(edges[1], positions, edges);
  assert.ok(left[0].x < right[0].x);
  positions.b = { x: -350, y: -210 };
  const moved = dependencyRoute(edges[0], positions, edges);
  assert.equal(moved.at(-1).x, positions.b.x + NODE_W / 2);
  assert.equal(moved.at(-1).y, positions.b.y);
});

test("wide dependency levels wrap without sending dependencies backward or through cards", () => {
  const nodes = Array.from({ length: 75 }, (_, i) => ({ id: String(i) }));
  const edges = nodes
    .slice(1)
    .map((n) => ({ from: n.id, to: "0", kind: "requires" }));
  const positions = dependencyLayout(nodes, edges);
  assert.ok(Math.max(...Object.values(positions).map((p) => p.x)) < 3000);
  for (const edge of edges) {
    assert.ok(positions[edge.to].y > positions[edge.from].y + NODE_H);
    const route = dependencyRoute(edge, positions, edges);
    for (let i = 1; i < route.length; i++)
      for (const [id, p] of Object.entries(positions)) {
        if (id !== edge.from && id !== edge.to)
          assert.equal(crossesCard(route[i - 1], route[i], p), false);
      }
  }
});
