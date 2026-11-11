import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dependencyLayout,
  dependencyPath,
  NODE_H,
  NODE_W,
} from "../graph-layout.mjs";
import type { State, Task } from "./types";

type Point = { x: number; y: number };
type Camera = { x: number; y: number; scale: number };
type GraphNode = Task & {
  graphKind?: "workstream" | "task";
  childCount?: number;
};
type GraphRelation = "whole" | "immediate" | "upstream" | "downstream" | "both";

function loadPositions(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object"
      ? (value as Record<string, Point>)
      : {};
  } catch {
    return {};
  }
}

function storePositions(key: string, value: Record<string, Point>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function EnhancedGraph({
  state,
  matchingTasks,
  openTask,
}: {
  state: State;
  matchingTasks: Task[];
  openTask: (task: Task) => void;
}) {
  const [mode, setMode] = useState<"overview" | "tasks">("overview");
  const [group, setGroup] = useState<"epic" | "track" | "status" | "tag">(
    "epic",
  );
  const [focusedEpic, setFocusedEpic] = useState("");
  const [selected, setSelected] = useState("");
  const [relation, setRelation] = useState<GraphRelation>("whole");
  const complete = useMemo(
    () =>
      new Set(
        state.statuses.filter((item) => item.complete).map((item) => item.id),
      ),
    [state.statuses],
  );
  const overviewNodes = useMemo<GraphNode[]>(
    () =>
      state.epics.flatMap((epic) => {
        const children = matchingTasks.filter((task) => task.epic === epic.id);
        if (!children.length) return [];
        const remaining = children.filter((task) => !complete.has(task.status));
        return [
          {
            id: `epic:${epic.id}`,
            title: epic.title,
            summary: `${remaining.length} remaining · ${children.length} total tasks`,
            status: remaining.some((task) => task.status === "blocked")
              ? "blocked"
              : remaining.length
                ? "partial"
                : "implemented",
            epic: epic.id,
            track: children[0]?.track,
            graphKind: "workstream",
            childCount: children.length,
          },
        ];
      }),
    [complete, matchingTasks, state.epics],
  );
  const taskCandidates = useMemo(
    () =>
      focusedEpic
        ? matchingTasks.filter((task) => task.epic === focusedEpic)
        : matchingTasks,
    [focusedEpic, matchingTasks],
  );
  const baseNodes = useMemo<GraphNode[]>(
    () =>
      mode === "overview"
        ? overviewNodes
        : taskCandidates
            .slice(0, 180)
            .map((task) => ({ ...task, graphKind: "task" })),
    [mode, overviewNodes, taskCandidates],
  );
  const baseLinks = useMemo(() => {
    const ids = new Set(baseNodes.map((task) => task.id));
    const source = mode === "overview" ? state.epicEdges || [] : state.edges;
    return source
      .map((edge) =>
        mode === "overview"
          ? {
              ...edge,
              from: edge.from.startsWith("epic:")
                ? edge.from
                : `epic:${edge.from}`,
              to: edge.to.startsWith("epic:") ? edge.to : `epic:${edge.to}`,
            }
          : edge,
      )
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }, [baseNodes, mode, state.edges, state.epicEdges]);
  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (!selected || relation === "whole" || relation === "immediate")
      return ids;
    const queue = [selected];
    ids.add(selected);
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of baseLinks) {
        const next =
          (relation === "downstream" || relation === "both") && edge.from === id
            ? edge.to
            : (relation === "upstream" || relation === "both") && edge.to === id
              ? edge.from
              : "";
        if (next && !ids.has(next)) {
          ids.add(next);
          queue.push(next);
        }
      }
    }
    return ids;
  }, [baseLinks, relation, selected]);
  const nodes = useMemo(
    () =>
      selected && ["upstream", "downstream", "both"].includes(relation)
        ? baseNodes.filter((task) => connected.has(task.id))
        : baseNodes,
    [baseNodes, connected, relation, selected],
  );
  const links = useMemo(() => {
    const ids = new Set(nodes.map((task) => task.id));
    return baseLinks.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }, [baseLinks, nodes]);
  const neighbors = useMemo(() => {
    const ids = new Set([selected]);
    if (!selected) return ids;
    for (const edge of baseLinks) {
      if (edge.from === selected) ids.add(edge.to);
      if (edge.to === selected) ids.add(edge.from);
    }
    return ids;
  }, [baseLinks, selected]);

  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{
    distance: number;
    middle: Point;
    camera: Camera;
  } | null>(null);
  const [positions, setPositions] = useState<Record<string, Point> | null>(
    null,
  );
  const [layoutReady, setLayoutReady] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);
  const layoutKey = `avoozl-graph-layout-v4:${mode}:${group}:${focusedEpic || "all"}`;
  const [manualPositions, setManualPositions] = useState<Record<string, Point>>(
    () => loadPositions(layoutKey),
  );
  const [nodeDrag, setNodeDrag] = useState<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const movedNode = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPositions(null);
    setLayoutReady(false);
    setManualPositions(loadPositions(layoutKey));
    const timer = window.setTimeout(() => {
      const key = (task: GraphNode) =>
        group === "status"
          ? task.status
          : group === "track"
            ? task.track || ""
            : group === "tag"
              ? task.tags?.[0] || "untagged"
              : task.epic || "";
      const next = dependencyLayout(nodes, links, key);
      if (!cancelled) setPositions(next);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [group, layoutKey, links, nodes]);
  const displayPositions = useMemo(
    () => ({ ...(positions || {}), ...manualPositions }),
    [manualPositions, positions],
  );
  const bounds = useMemo(() => {
    const points = Object.values(displayPositions);
    const minX = Math.min(0, ...points.map((point) => point.x)) - 110;
    const minY = Math.min(0, ...points.map((point) => point.y)) - 55;
    const maxX =
      Math.max(NODE_W, ...points.map((point) => point.x + NODE_W)) + 110;
    const maxY =
      Math.max(NODE_H, ...points.map((point) => point.y + NODE_H)) + 55;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [displayPositions]);
  const fit = useCallback(() => {
    if (!positions || !nodes.length) return;
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const scale = Math.max(
      0.05,
      Math.min(1.25, box.width / bounds.width, box.height / bounds.height),
    );
    setCamera({
      scale,
      x: (box.width - bounds.width * scale) / 2 - bounds.minX * scale,
      y: (box.height - bounds.height * scale) / 2 - bounds.minY * scale,
    });
  }, [bounds, nodes.length, positions]);
  useLayoutEffect(() => {
    if (!positions) return;
    fit();
    setLayoutReady(true);
  }, [fit, positions]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  function zoom(factor: number, clientX?: number, clientY?: number) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const anchorX = clientX == null ? box.width / 2 : clientX - box.left;
    const anchorY = clientY == null ? box.height / 2 : clientY - box.top;
    setCamera((current) => {
      const scale = Math.max(0.05, Math.min(3, current.scale * factor));
      const ratio = scale / current.scale;
      return {
        scale,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio,
      };
    });
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest(".graph-controls, .graph-html-node"))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1) {
      setDrag({
        x: event.clientX,
        y: event.clientY,
        cameraX: camera.x,
        cameraY: camera.y,
      });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.max(1, distance(a, b)),
        middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        camera,
      };
      setDrag(null);
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2 && pinch.current) {
      const box = stage.current?.getBoundingClientRect();
      const [a, b] = [...pointers.current.values()];
      if (!box) return;
      const middle = {
        x: (a.x + b.x) / 2 - box.left,
        y: (a.y + b.y) / 2 - box.top,
      };
      const originalMiddle = {
        x: pinch.current.middle.x - box.left,
        y: pinch.current.middle.y - box.top,
      };
      const scale = Math.max(
        0.05,
        Math.min(
          3,
          (pinch.current.camera.scale * distance(a, b)) /
            pinch.current.distance,
        ),
      );
      const worldX =
        (originalMiddle.x - pinch.current.camera.x) /
        pinch.current.camera.scale;
      const worldY =
        (originalMiddle.y - pinch.current.camera.y) /
        pinch.current.camera.scale;
      setCamera({
        scale,
        x: middle.x - worldX * scale,
        y: middle.y - worldY * scale,
      });
    } else if (drag) {
      setCamera((current) => ({
        ...current,
        x: drag.cameraX + event.clientX - drag.x,
        y: drag.cameraY + event.clientY - drag.y,
      }));
    }
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    setDrag(null);
  }

  function chooseNode(node: GraphNode) {
    if (node.graphKind === "workstream") {
      setFocusedEpic(node.epic || "");
      setMode("tasks");
      setRelation("whole");
      setSelected("");
      return;
    }
    if (relation === "whole") {
      openTask(node);
      return;
    }
    setSelected(node.id);
  }

  const selectedTask = baseNodes.find((item) => item.id === selected);
  const relationPrompt =
    relation === "immediate"
      ? "Click a task to show its immediate context."
      : relation === "upstream"
        ? "Click a task to show all of its prerequisites."
        : relation === "downstream"
          ? "Click a task to show everything it unblocks."
          : relation === "both"
            ? "Click a task to show all connected work."
            : "";

  return (
    <section className="graph-view enhanced-graph">
      <div className="graph-top">
        <div className="graph-mode-controls">
          <button
            className={mode === "overview" ? "active" : ""}
            onClick={() => {
              setMode("overview");
              setFocusedEpic("");
              setRelation("whole");
              setSelected("");
            }}
          >
            Workstreams
          </button>
          <button
            className={mode === "tasks" ? "active" : ""}
            onClick={() => {
              setMode("tasks");
              setFocusedEpic("");
              setRelation("whole");
              setSelected("");
            }}
          >
            Tasks
          </button>
          <label>
            Group{" "}
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value as typeof group)}
            >
              <option value="epic">Epic</option>
              <option value="track">Track</option>
              <option value="status">Status</option>
              <option value="tag">Tag</option>
            </select>
          </label>
        </div>
        <span>
          <i className="legend-line" /> prerequisite → dependent{" "}
          <i className="legend-line dashed" /> supports / sequence
        </span>
        <select
          aria-label="Choose dependency graph scope"
          value={relation}
          onChange={(event) => {
            const next = event.target.value as GraphRelation;
            setRelation(next);
            if (next === "whole") setSelected("");
          }}
        >
          <option value="whole">Whole matching graph</option>
          <option value="immediate">Immediate context</option>
          <option value="upstream">All prerequisites of selected</option>
          <option value="downstream">Everything selected unblocks</option>
          <option value="both">All connected work</option>
        </select>
      </div>
      {(relation !== "whole" || selected || focusedEpic) && (
        <div className="graph-focus-bar">
          <span>
            {selectedTask ? (
              <>
                <b>{selectedTask.title}</b>
                {relation === "immediate"
                  ? " · immediate connections highlighted"
                  : ""}
              </>
            ) : focusedEpic && relation === "whole" ? (
              <b>
                {state.epics.find((item) => item.id === focusedEpic)?.title}
              </b>
            ) : (
              relationPrompt
            )}
          </span>
          {selectedTask && (
            <button onClick={() => openTask(selectedTask)}>Open task</button>
          )}
          {selectedTask && relation === "immediate" && (
            <button onClick={() => setRelation("both")}>
              Expand connected work
            </button>
          )}
          <button
            onClick={() => {
              setSelected("");
              setRelation("whole");
              setFocusedEpic("");
            }}
          >
            Whole collection
          </button>
        </div>
      )}
      <div
        id="graph-stage"
        className={!layoutReady ? "loading" : drag ? "dragging" : ""}
        ref={stage}
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onWheel={(event) => {
          event.preventDefault();
          if (
            event.shiftKey ||
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ) {
            setCamera((current) => ({
              ...current,
              x: current.x - event.deltaX,
              y: current.y - (event.shiftKey ? event.deltaY : 0),
            }));
          } else {
            zoom(
              Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.003),
              event.clientX,
              event.clientY,
            );
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "+" || event.key === "=") zoom(1.2);
          else if (event.key === "-") zoom(1 / 1.2);
          else if (event.key === "0") fit();
        }}
      >
        {!layoutReady ? (
          <div className="center-state avoozl-loading graph-loading">
            <div className="avoozl-loader">
              <span>A</span>
            </div>
            <p>
              Laying out {mode === "overview" ? "workstreams" : "task graph"}…
            </p>
          </div>
        ) : !nodes.length ? (
          <div className="graph-empty">
            <strong>No tasks match these graph filters.</strong>
            <span>Change the filters or return to the whole collection.</span>
          </div>
        ) : (
          <>
            <svg
              id="graph"
              role="group"
              aria-label="Task dependency graph"
              viewBox={`${-camera.x / camera.scale} ${-camera.y / camera.scale} ${stageSize.width / camera.scale} ${stageSize.height / camera.scale}`}
            >
              <defs>
                <marker
                  id="arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,4 L0,8" fill="currentColor" />
                </marker>
              </defs>
              <g>
                {links.map((edge, index) => (
                  <path
                    key={edge.id || index}
                    className={`edge ${edge.kind} ${edge.from === selected || edge.to === selected ? "highlight" : ""}`}
                    d={dependencyPath(edge, displayPositions, links)}
                  >
                    <title>
                      {edge.kind}: {edge.reason}
                    </title>
                  </path>
                ))}
              </g>
            </svg>
            <div className="graph-node-layer">
              {nodes.map((node) => {
                const point = displayPositions[node.id];
                if (!point) return null;
                const status = state.statuses.find(
                  (item) => item.id === node.status,
                );
                const track = state.tracks.find(
                  (item) => item.id === node.track,
                );
                const label =
                  node.graphKind === "workstream"
                    ? "WORKSTREAM"
                    : node.epic?.startsWith("doc:")
                      ? "PLAN"
                      : node.epic || "TASK";
                const dim =
                  selected &&
                  relation === "immediate" &&
                  !neighbors.has(node.id);
                return (
                  <button
                    className={`graph-html-node ${selected === node.id ? "selected" : ""} ${dim ? "dim" : ""} ${node.graphKind === "workstream" ? "workstream" : ""}`}
                    key={node.id}
                    style={
                      {
                        left: camera.x + point.x * camera.scale,
                        top: camera.y + point.y * camera.scale,
                        width: NODE_W * camera.scale,
                        height: NODE_H * camera.scale,
                        "--track-color": track?.color || "#8899aa",
                        "--node-scale": camera.scale,
                      } as React.CSSProperties
                    }
                    title={`${node.title} — ${node.graphKind === "workstream" ? node.summary : status?.label || node.status}. ${node.summary || ""}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      movedNode.current = false;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setNodeDrag({
                        id: node.id,
                        x: event.clientX,
                        y: event.clientY,
                        startX: point.x,
                        startY: point.y,
                      });
                    }}
                    onPointerMove={(event) => {
                      if (!nodeDrag || nodeDrag.id !== node.id) return;
                      const dx = (event.clientX - nodeDrag.x) / camera.scale;
                      const dy = (event.clientY - nodeDrag.y) / camera.scale;
                      if (Math.abs(dx) + Math.abs(dy) > 3)
                        movedNode.current = true;
                      setManualPositions((current) => {
                        const next = {
                          ...current,
                          [node.id]: {
                            x: nodeDrag.startX + dx,
                            y: nodeDrag.startY + dy,
                          },
                        };
                        storePositions(layoutKey, next);
                        return next;
                      });
                    }}
                    onPointerUp={() => setNodeDrag(null)}
                    onPointerCancel={() => setNodeDrag(null)}
                    onClick={() => {
                      if (movedNode.current) {
                        movedNode.current = false;
                        return;
                      }
                      chooseNode(node);
                    }}
                  >
                    <span className="graph-html-track">
                      {label} ·{" "}
                      {track?.label?.toUpperCase() ||
                        (node.graphKind === "workstream" ? "DELIVERY" : "TASK")}
                    </span>
                    <strong>{node.title}</strong>
                    <span
                      className="graph-html-status"
                      style={{ color: status?.color || "#8899aa" }}
                    >
                      <i style={{ background: status?.color || "#8899aa" }} />
                      {node.graphKind === "workstream"
                        ? node.summary
                        : status?.label || node.status}
                    </span>
                    <span className="graph-html-open">↗</span>
                  </button>
                );
              })}
            </div>
            <div className="graph-controls">
              <button onClick={() => zoom(0.8)} aria-label="Zoom out">
                −
              </button>
              <output>{Math.round(camera.scale * 100)}%</output>
              <button onClick={() => zoom(1.25)} aria-label="Zoom in">
                ＋
              </button>
              <button onClick={fit}>Fit</button>
              <button
                onClick={() => {
                  setManualPositions({});
                  try {
                    localStorage.removeItem(layoutKey);
                  } catch {}
                  requestAnimationFrame(fit);
                }}
              >
                Reset layout
              </button>
            </div>
            <div className="graph-instructions">
              Drag nodes to arrange · drag canvas to pan · scroll or pinch to
              zoom · click to inspect
            </div>
          </>
        )}
      </div>
      {layoutReady && (
        <div className="graph-footer">
          <span>
            {mode === "overview"
              ? `${nodes.length} workstreams`
              : `${nodes.length} of ${taskCandidates.length} matching tasks`}{" "}
            · {links.length} connections
            {mode === "tasks" && taskCandidates.length > 180
              ? " · narrow the filters to show more"
              : ""}
          </span>
          <span>
            Layout positions stay in this browser. Task data comes from the
            workspace.
          </span>
        </div>
      )}
    </section>
  );
}
