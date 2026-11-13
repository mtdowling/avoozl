import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Badge as f, Btn as p, Card as m, EmptyState as h, Input as g, PageHeader as _, SegmentedControl as v } from "@kirocrew/app-sdk/ui";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { createPortal as S } from "react-dom";
import { Activity as C, Archive as w, ArchiveRestore as T, ArrowDown as E, ArrowLeft as D, ArrowRight as O, ArrowUp as k, Ban as A, BookOpen as j, Check as M, ChevronRight as N, CircleAlert as P, CircleAlert as F, CircleCheck as I, CircleDot as L, CircleHelp as ee, ClipboardCheck as R, Copy as z, Crosshair as te, Download as B, ExternalLink as V, Eye as H, FileText as ne, FileText as U, Folder as W, FolderOpen as re, Gauge as ie, Gauge as ae, GitBranch as oe, GitPullRequest as se, GitPullRequestDraft as ce, HardDrive as le, History as ue, Inbox as de, Inbox as fe, Info as pe, Laptop as me, LayoutDashboard as he, LayoutGrid as G, LayoutGrid as ge, Lock as _e, MessageSquare as ve, MessagesSquare as ye, Network as be, Network as xe, Package as Se, Pause as Ce, Pencil as we, Play as Te, Plus as Ee, Radar as De, RefreshCw as Oe, RotateCcw as ke, ScanSearch as Ae, Settings as je, ShieldCheck as Me, Trash2 as Ne, Users as Pe, Workflow as Fe, X as Ie } from "lucide-react";
// \0rolldown/runtime.js
var Le = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports);
// kirocrew-app/ui/src/Logo.tsx
function Re({ size: e = 32 }) {
	return /* @__PURE__ */ x("svg", {
		viewBox: "0 0 100 100",
		width: e,
		height: e,
		"aria-hidden": "true",
		focusable: "false",
		children: [
			/* @__PURE__ */ b("path", {
				d: "M8 95 Q50 82 92 95",
				fill: "none",
				stroke: "var(--accent)",
				strokeWidth: 2.5,
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ b("path", {
				d: "M39 36 Q28 28 29 14 Q33 28 43 30 Z M61 36 Q72 28 71 14 Q67 28 57 30 Z",
				fill: "var(--accent)"
			}),
			/* @__PURE__ */ b("path", {
				fillRule: "evenodd",
				fill: "var(--text)",
				d: "M50 8 L84 84 Q80 92 74 97 L64 70 L36 70 L26 97 Q20 92 16 84 Z M50 24 L62 58 L38 58 Z"
			}),
			/* @__PURE__ */ b("path", {
				d: "M39 45 L49 50 L46 55 Z M61 45 L51 50 L54 55 Z",
				fill: "var(--danger)"
			})
		]
	});
}
function ze(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var Be = null;
function Ve(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), Be === o && (Be = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), Be && Be !== o && Be(), Be = o, i || (i = !0, e.onChange(!0));
	};
	return {
		get open() {
			return i;
		},
		enter(n) {
			n === "touch" || i || (a(), r = t(s, e.delay ?? 300));
		},
		leave: o,
		focus(e) {
			e && s();
		},
		blur: o,
		key(e) {
			e === "Escape" && o();
		},
		hide: o
	};
}
// kirocrew-app/ui/src/Tooltip.tsx
var He = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Ue = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function K(e) {
	let t = i(), n = s(null), l = s(null), [u, d] = c(!1), [f, p] = c(null), m = o(() => Ve({ onChange: d }), []);
	r(() => m.hide, [m]), r(() => {
		if (!u) return;
		let e = (e) => m.key(e.key), t = () => m.hide();
		return document.addEventListener("keydown", e), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [u, m]), a(() => {
		if (!u || !n.current || !l.current) return p(null);
		let e = n.current.getBoundingClientRect(), t = l.current.getBoundingClientRect();
		p(ze(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [u, e.text]);
	let h = e.text?.trim(), g = typeof e.children == "function" ? e.children(h ? t : void 0) : e.children;
	return h ? /* @__PURE__ */ x("span", {
		ref: n,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => m.enter(e.pointerType),
		onPointerLeave: m.leave,
		onPointerDown: m.hide,
		onFocus: (e) => m.focus(Ue(e.target)),
		onBlur: m.blur,
		"data-tooltip-anchor": !0,
		children: [
			g,
			/* @__PURE__ */ b("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: h
			}),
			u && S(/* @__PURE__ */ x("div", {
				ref: l,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": f?.side,
				style: {
					position: "fixed",
					top: f?.top ?? 0,
					left: f?.left ?? 0,
					visibility: f ? "visible" : "hidden",
					zIndex: 2147483e3,
					maxWidth: "min(20rem, calc(100vw - 12px))",
					padding: "4px 8px",
					borderRadius: 6,
					fontSize: 12,
					lineHeight: 1.4,
					pointerEvents: "none",
					background: "var(--bg-elevated, var(--card))",
					color: "var(--text)",
					border: "1px solid var(--border)",
					boxShadow: "0 4px 12px rgb(0 0 0 / 0.25)",
					animation: He() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ b("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					h,
					f && /* @__PURE__ */ b("span", {
						"aria-hidden": "true",
						style: {
							position: "absolute",
							left: f.arrow - 4,
							[f.side === "top" ? "bottom" : "top"]: -5,
							width: 8,
							height: 8,
							transform: "rotate(45deg)",
							background: "var(--bg-elevated, var(--card))",
							borderRight: f.side === "top" ? "1px solid var(--border)" : void 0,
							borderBottom: f.side === "top" ? "1px solid var(--border)" : void 0,
							borderLeft: f.side === "bottom" ? "1px solid var(--border)" : void 0,
							borderTop: f.side === "bottom" ? "1px solid var(--border)" : void 0
						}
					})
				]
			}), document.body)
		]
	}) : /* @__PURE__ */ b(y, { children: g });
}
// kirocrew-app/ui/src/Badge.tsx
var We = {
	success: { variant: "ok" },
	warning: { variant: "warn" },
	danger: { variant: "err" },
	info: {
		variant: "muted",
		className: "bg-accent-subtle text-accent"
	},
	wave: { variant: "aim" }
};
function Ge(e) {
	return e && We[e] || { variant: "muted" };
}
function q({ variant: e, children: t }) {
	let n = Ge(e);
	return /* @__PURE__ */ b(f, {
		variant: n.variant,
		className: n.className,
		children: t
	});
}
// src/delivery-lanes.mjs
var Ke = /* @__PURE__ */ new Set(["closed", "lost"]);
Object.freeze([
	["ready", "Ready"],
	["running", "Running"],
	["reviewing", "Reviewing"],
	["needs-you", "Needs you"],
	["waiting", "Blocked or waiting"],
	["done", "Done"],
	["deferred", "Deferred"]
]);
function qe(e) {
	return e.state ? e.state : e.complete ? "done" : e.decision || e.status === "blocked" ? "needs-you" : e.status === "deferred" ? "deferred" : e.status === "running" || e.status === "review" ? "running" : e.ready ? "ready" : "waiting";
}
var Je = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function Ye(e, t) {
	let n = Je(t), r = (t?.sessions ?? []).filter((e) => !Ke.has(e.status ?? ""));
	return n === "decision" || t?.needsYou || e && qe(e) === "needs-you" && !t?.complete ? "needs-you" : t?.complete || e && qe(e) === "done" ? "done" : n === "done" || n === "verified" || t?.status === "review" && !t.handSetReview || r.some((e) => e.role !== "worker") || t?.githubReviews?.state === "pending" ? "reviewing" : r.length || n === "running" || n === "failed" || t?.status === "running" && !t.handSetReview ? "running" : e && qe(e) === "ready" ? "ready" : "waiting";
}
// kirocrew-app/ui/src/graph-layout.ts
var Xe = [
	{
		id: "ready",
		label: "Ready"
	},
	{
		id: "running",
		label: "Running"
	},
	{
		id: "waiting",
		label: "Waiting"
	},
	{
		id: "needs-you",
		label: "Needs you"
	},
	{
		id: "done",
		label: "Done"
	},
	{
		id: "deferred",
		label: "Deferred"
	}
], Ze = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
}, Qe = 1.5;
function $e(e, t = 1100) {
	let n = (12 / (12 + Math.max(0, e))) ** 2, r = Math.max(.6, Math.min(1.4, t / 1100)), i = 1 + Qe * n * r, a = (e) => Math.round(e * i);
	return {
		...Ze,
		columnGap: a(Ze.columnGap),
		rowGap: a(Ze.rowGap),
		clusterGap: a(Ze.clusterGap)
	};
}
var et = Ze.nodeWidth, tt = Ze.nodeHeight;
Ze.columnGap, Ze.rowGap, Ze.margin, Ze.clusterLabel, Ze.clusterGap;
var nt = 2, rt = 12, it = 8, at = qe;
function ot(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.edges) n.blocking && (t.has(n.to) || t.set(n.to, []), t.get(n.to).push(n.from));
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Set(), i = (e) => {
		let a = n.get(e);
		if (a !== void 0) return a;
		if (r.has(e)) return 0;
		r.add(e);
		let o = 0;
		for (let n of t.get(e) ?? []) o = Math.max(o, i(n));
		return r.delete(e), n.set(e, o + 1), o + 1;
	};
	for (let t of e.tasks) i(t.id);
	return n;
}
var st = (e) => e ?? "(none)";
function ct(e) {
	if (!e.startsWith("doc:")) return e;
	let t = e.slice(4);
	return /^\.kiro\/specs\/([^/]+)\//.exec(t)?.[1] ?? t.replace(/\.md$/, "");
}
function lt(e, t) {
	let n = new Map(e.epics.map((e) => [e.id, e.title])), r = new Map(e.epics.map((e, t) => [e.id, t])), i = (e) => {
		if (!e) return "No epic";
		let t = n.get(e);
		return t && t !== e ? t : ct(e);
	}, a = /* @__PURE__ */ new Map();
	for (let t of e.tasks) a.has(t.epic) || a.set(t.epic, []), a.get(t.epic).push(t);
	let o = [...a.keys()].sort((e, t) => (e === null ? 1e9 : r.get(e) ?? 1e8) - (t === null ? 1e9 : r.get(t) ?? 1e8)), s = /* @__PURE__ */ new Map(), c = [];
	for (let e of o) {
		let n = a.get(e);
		if (t.has(st(e))) {
			let t = `epic:${st(e)}`, r = new Set(n.map(at)), a = [
				"needs-you",
				"running",
				"ready",
				"waiting",
				"deferred",
				"done"
			].find((e) => r.has(e)) ?? "waiting";
			for (let e of n) s.set(e.id, t);
			c.push({
				id: t,
				task: null,
				title: i(e),
				epic: e,
				state: a,
				wave: 1,
				x: 0,
				y: 0,
				members: {
					total: n.length,
					done: n.filter((e) => at(e) === "done").length
				}
			});
		} else for (let t of n) s.set(t.id, t.id), c.push({
			id: t.id,
			task: t,
			title: t.title,
			epic: e,
			state: at(t),
			wave: 1,
			x: 0,
			y: 0
		});
	}
	let l = [], u = /* @__PURE__ */ new Map();
	for (let t of e.edges) {
		if (!t.blocking) continue;
		let e = s.get(t.from), n = s.get(t.to);
		if (!e || !n || e === n) continue;
		let r = `${e}\u0000${n}`, i = u.get(r);
		if (i) {
			t.satisfied || (i.satisfied = !1);
			continue;
		}
		let a = {
			from: e,
			to: n,
			kind: t.kind,
			satisfied: t.satisfied
		};
		u.set(r, a), l.push(a);
	}
	return {
		nodes: c,
		edges: l,
		epicTitle: i,
		epics: o,
		members: a
	};
}
function ut(e, t) {
	let n = new Map(e.map((e) => [e, []]));
	for (let e of t) n.get(e.from).push(e.to);
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Set();
	for (let t of e) {
		if (r.has(t)) continue;
		let e = [[t, 0]];
		for (r.set(t, 1); e.length;) {
			let t = e[e.length - 1], a = n.get(t[0]);
			if (t[1] >= a.length) {
				r.set(t[0], 2), e.pop();
				continue;
			}
			let o = a[t[1]++], s = r.get(o);
			s === 1 ? i.add(`${t[0]}\u0000${o}`) : s || (r.set(o, 1), e.push([o, 0]));
		}
	}
	let a = t.map((e) => i.has(`${e.from}\u0000${e.to}`) ? {
		lo: e.to,
		hi: e.from
	} : {
		lo: e.from,
		hi: e.to
	}), o = new Map(e.map((e) => [e, []]));
	for (let e of a) o.get(e.hi).push(e.lo);
	let s = /* @__PURE__ */ new Map(), c = (e) => {
		let t = [[e, 0]];
		for (; t.length;) {
			let e = t[t.length - 1], n = o.get(e[0]);
			if (e[1] < n.length) {
				let r = n[e[1]++];
				s.has(r) || t.push([r, 0]);
			} else s.set(e[0], 1 + Math.max(0, ...n.map((e) => s.get(e) ?? 0))), t.pop();
		}
	};
	for (let t of e) s.has(t) || c(t);
	let l = new Map(e.map((e) => [e, []]));
	for (let e of a) l.get(e.lo).push(e.hi);
	for (let t of e) !o.get(t).length && l.get(t).length && s.set(t, Math.min(...l.get(t).map((e) => s.get(e))) - 1);
	return {
		ranks: s,
		pairs: a
	};
}
function dt(e) {
	if (e.length < 2) return 0;
	let t = e.length >> 1, n = e.slice(0, t), r = e.slice(t), i = dt(n) + dt(r), a = 0, o = 0, s = 0;
	for (; a < n.length && o < r.length;) n[a] <= r[o] ? e[s++] = n[a++] : (e[s++] = r[o++], i += n.length - a);
	for (; a < n.length;) e[s++] = n[a++];
	for (; o < r.length;) e[s++] = r[o++];
	return i;
}
function ft(e, t) {
	let n = 0;
	for (let r = 0; r + 1 < e.length; r++) {
		let i = new Map(e[r + 1].map((e, t) => [e, t])), a = [];
		e[r].forEach((e, n) => {
			for (let r of t.get(e).down) a.push([n, i.get(r)]);
		}), a.sort((e, t) => e[0] - t[0] || e[1] - t[1]), n += dt(a.map((e) => e[1]));
	}
	return n;
}
function pt(e, t, n, r) {
	let i = new Map(n.map((e, t) => [e, t])), a = /* @__PURE__ */ new Map();
	e.forEach((o, s) => {
		let c = t.get(o)[r].map((e) => i.get(e)).filter((e) => e !== void 0);
		a.set(o, c.length ? c.reduce((e, t) => e + t, 0) / c.length : s / Math.max(1, e.length - 1) * n.length);
	});
	let o = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n).cluster;
		o.has(e) || o.set(e, []), o.get(e).push(a.get(n));
	}
	let s = new Map([...o].map(([e, t]) => [e, t.reduce((e, t) => e + t, 0) / t.length])), c = new Map(e.map((e, t) => [e, t]));
	return [...e].sort((e, n) => {
		let r = t.get(e).cluster, i = t.get(n).cluster;
		return s.get(r) - s.get(i) || (r < i ? -1 : +(r > i)) || a.get(e) - a.get(n) || c.get(e) - c.get(n);
	});
}
function mt(e, t) {
	let n = [], r = 0;
	for (let i = 0; i < e.length; i++) r += i ? t[i] : 0, n.push(r);
	let i = [];
	e.forEach((e, t) => {
		for (i.push({
			value: e - n[t],
			weight: 1,
			count: 1
		}); i.length > 1 && i[i.length - 2].value > i[i.length - 1].value;) {
			let e = i.pop(), t = i[i.length - 1];
			t.value = (t.value * t.weight + e.value * e.weight) / (t.weight + e.weight), t.weight += e.weight, t.count += e.count;
		}
	});
	let a = [];
	for (let e of i) for (let t = 0; t < e.count; t++) a.push(e.value + n[a.length]);
	return a;
}
var ht = (e) => {
	let t = [...e].sort((e, t) => e - t), n = t.length >> 1;
	return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2;
};
function gt(e, t = /* @__PURE__ */ new Set(), n = {}) {
	let { nodeWidth: r, nodeHeight: i, columnGap: a, rowGap: o, margin: s, clusterLabel: c, clusterGap: l } = n.spacing ?? Ze, { nodes: u, edges: d, epicTitle: f } = lt(e, t), p = new Map(u.map((e) => [e.id, e])), m = new Set(d.flatMap((e) => [e.from, e.to])), h = u.filter((e) => m.has(e.id)), g = u.filter((e) => !m.has(e.id)), { ranks: _, pairs: v } = ut(h.map((e) => e.id), d), y = /* @__PURE__ */ new Map();
	for (let e of h) y.set(e.id, {
		id: e.id,
		cluster: `epic:${st(e.epic)}`,
		height: i,
		rank: _.get(e.id),
		up: [],
		down: []
	});
	let b = [];
	v.forEach((e, t) => {
		let n = [e.lo];
		for (let r = _.get(e.lo) + 1; r < _.get(e.hi); r++) {
			let e = `\u0000d${t}:${r}`;
			y.set(e, {
				id: e,
				cluster: e,
				height: nt,
				rank: r,
				up: [],
				down: []
			}), n.push(e);
		}
		n.push(e.hi);
		for (let e = 0; e + 1 < n.length; e++) y.get(n[e]).down.push(n[e + 1]), y.get(n[e + 1]).up.push(n[e]);
		b.push(n);
	});
	let x = Math.max(0, ...[...y.values()].map((e) => e.rank)), S = Array.from({ length: x }, () => []);
	for (let e of y.values()) S[e.rank - 1].push(e.id);
	let C = new Map(h.map((e, t) => [e.id, t])), w = /* @__PURE__ */ new Map();
	for (let e of h) w.has(st(e.epic)) || w.set(st(e.epic), w.size);
	let T = (e) => {
		let t = p.get(e);
		return t ? w.get(st(t.epic)) * 1e6 + C.get(e) : 0xe8d4a51000;
	};
	for (let e of S) e.sort((e, t) => T(e) - T(t));
	let E = ft(S, y);
	if (!n.naive) {
		let e = S.map((e) => [...e]);
		for (let t = 0; t < rt && E > 0; t++) {
			let n = t % 2 == 0, r = S.map((e) => [...e]);
			if (n) for (let e = 1; e < r.length; e++) r[e] = pt(r[e], y, r[e - 1], "up");
			else for (let e = r.length - 2; e >= 0; e--) r[e] = pt(r[e], y, r[e + 1], "down");
			let i = ft(r, y);
			S = r, i < E && (E = i, e = r.map((e) => [...e]));
		}
		S = e;
	}
	let D = r + a, O = i + o, k = s + c, A = n.aspect ?? 1.8, j = S.map((e) => e.filter((e) => p.has(e))), M = Math.max(0, ...j.map((e) => e.length)), N = (e) => n.looseColumns ?? (e || Math.max(1, Math.round(Math.sqrt(g.length * A * O / D)))), P = (e) => {
		let t = j.reduce((t, n) => t + Math.max(1, Math.ceil(n.length / e)), 0), n = N(t), r = g.length ? Math.ceil(g.length / n) : 0, i = Math.max(t, g.length ? Math.min(n, g.length) : 0) * D, a = (e + r) * O + (r && e ? O : 0);
		return {
			columns: t,
			looseColumns: n,
			score: Math.abs(Math.log(i / Math.max(1, a) / A))
		};
	}, F = M;
	if (!n.rows) for (let e = 1; e <= M; e++) P(e).score < P(F).score - 1e-9 && (F = e);
	n.rows && (F = Math.min(M, n.rows));
	let { columns: I, looseColumns: L } = F ? P(F) : {
		columns: 0,
		looseColumns: N(0)
	}, ee = new Map(h.map((e) => [e.id, []]));
	for (let e of v) ee.get(e.lo).push(e.hi), ee.get(e.hi).push(e.lo);
	let R = /* @__PURE__ */ new Map(), z = /* @__PURE__ */ new Map(), te = 0, B = [];
	for (let e of j) {
		let t = Math.max(1, Math.ceil(e.length / F));
		e.forEach((e, n) => {
			R.set(e, te + Math.floor(n / F)), z.set(e, t > 1 ? n % F : n);
		}), t === 1 && B.push(e), te += t;
	}
	for (let e = 0; e < it; e++) {
		let t = e % 2 == 0 ? B : [...B].reverse();
		for (let e of t) {
			let t = e.map((e) => {
				let t = ee.get(e).map((e) => z.get(e));
				return t.length ? ht(t) : z.get(e);
			}), n = e.length;
			mt(t, e.map(() => 1)).forEach((t, r) => z.set(e[r], Math.min(Math.max(Math.round(t), r), F - n + r)));
		}
	}
	for (let e of h) e.wave = _.get(e.id), e.x = s + R.get(e.id) * D, e.y = k + z.get(e.id) * O;
	let V = /* @__PURE__ */ new Map(), H = (e, t) => {
		V.has(e) || V.set(e, /* @__PURE__ */ new Map());
		let n = V.get(e);
		return n.has(t) || n.set(t, n.size), n.get(t);
	}, ne = d.map((e) => {
		let t = p.get(e.from), n = p.get(e.to), s = R.get(t.id), c = R.get(n.id), l = t.y + i / 2, u = n.y + i / 2, d = (a / 2 - 4) / 2, f = t.x + r + 3 + H(`c${s}:out`, t.id) % 3 * d, m = n.x - 3 - H(`c${c - 1}:in`, n.id) % 3 * d;
		if (c === s + 1) return {
			...e,
			points: l === u ? [[t.x + r, l], [n.x, u]] : [
				[t.x + r, l],
				[f, l],
				[f, u],
				[n.x, u]
			]
		};
		let h = n.y - o / 2, g = n.y + i + o / 2, _ = Math.abs(l - h) <= Math.abs(l - g) ? h : g, v = _ + (H(`r${Math.round(_)}`, t.id) % 3 - 1) * 3;
		return {
			...e,
			points: [
				[t.x + r, l],
				[f, l],
				[f, v],
				[m, v],
				[m, u],
				[n.x, u]
			]
		};
	}), U = [], W = /* @__PURE__ */ new Set(), re = /* @__PURE__ */ new Map();
	for (let e of u) re.set(st(e.epic), (re.get(st(e.epic)) ?? 0) + (e.members?.total ?? 1));
	let ie = /* @__PURE__ */ new Map();
	for (let e of h) {
		let t = R.get(e.id);
		ie.has(t) || ie.set(t, []), ie.get(t).push(e);
	}
	for (let e of [...ie.keys()].sort((e, t) => e - t)) {
		let n = ie.get(e).sort((e, t) => e.y - t.y), a = [], s = () => {
			if (!a.length) return;
			let e = st(a[0].epic), n = t.has(e);
			U.push({
				epic: a[0].epic,
				title: f(a[0].epic),
				count: re.get(e) ?? a.length,
				collapsed: n,
				x: a[0].x - 4,
				y: a[0].y - o + 2,
				width: r + 8,
				height: a[a.length - 1].y + i + 2 - (a[0].y - o + 2),
				label: !n && !W.has(e)
			}), n || W.add(e), a = [];
		};
		for (let e of n) a.length && st(a[0].epic) !== st(e.epic) && s(), a.push(e);
		s();
	}
	let ae = h.length ? k + F * O - o : 0, oe = h.length ? ae + O : k, se = [], ce = g;
	ce.forEach((e, n) => {
		e.loose = !0, e.wave = 0, e.x = s + n % L * D, e.y = oe + Math.floor(n / L) * O;
		let r = st(e.epic), i = se[se.length - 1];
		i && st(i.epic) === r ? i.count++ : t.has(r) || se.push({
			epic: e.epic,
			title: f(e.epic),
			count: 1,
			x: e.x,
			y: e.y - o - 1,
			chars: Math.max(8, Math.floor((D * Math.max(1, L - n % L) - a) / 6))
		});
	});
	let le = ce.length ? Math.ceil(ce.length / L) : 0, ue = Math.max(I, ce.length ? Math.min(L, ce.length) : 0, 1);
	return {
		nodes: [...h, ...ce],
		edges: ne,
		clusters: U,
		loose: se,
		waves: x,
		crossings: E,
		rows: F,
		width: s * 2 + ue * D - a,
		height: Math.max(le ? oe + le * O - o + s : 0, ae + s, s * 2)
	};
}
function _t(e, t) {
	return t ? "none" : e.members ? "drill" : "open";
}
function vt(e, t) {
	if (!t) return e;
	let n;
	if (t.kind === "epic") n = new Set(e.tasks.filter((e) => e.epic === t.id || e.id === t.id).map((e) => e.id));
	else {
		let { up: r, down: i } = bt(e.edges.filter((e) => e.blocking), t.id);
		n = /* @__PURE__ */ new Set([
			t.id,
			...r,
			...i
		]);
	}
	return {
		...e,
		tasks: e.tasks.filter((e) => n.has(e.id)),
		edges: e.edges.filter((e) => n.has(e.from) && n.has(e.to))
	};
}
function yt(e) {
	return e.map(([e, t], n) => `${n ? "L" : "M"}${Math.round(e * 10) / 10},${Math.round(t * 10) / 10}`).join(" ");
}
function bt(e, t) {
	let n = (n) => {
		let r = /* @__PURE__ */ new Set(), i = [t];
		for (; i.length;) {
			let a = i.pop();
			for (let o of e) {
				let [e, s] = n(o);
				e === a && !r.has(s) && s !== t && (r.add(s), i.push(s));
			}
		}
		return r;
	};
	return {
		up: n((e) => [e.to, e.from]),
		down: n((e) => [e.from, e.to])
	};
}
function xt(e, t) {
	let n = new Map(e.tasks.map((e) => [e.id, e.title])), r = e.edges.filter((e) => e.blocking);
	return {
		waitsOn: r.filter((e) => e.to === t).map((e) => ({
			id: e.from,
			title: n.get(e.from) ?? e.from,
			satisfied: e.satisfied,
			condition: e.condition
		})),
		blocks: r.filter((e) => e.from === t).map((e) => ({
			id: e.to,
			title: n.get(e.to) ?? e.to
		}))
	};
}
function St(e, t, n, r, i = .1, a = 3) {
	let o = Math.min(a, Math.max(i, e.scale * t)), s = o / e.scale;
	return {
		scale: o,
		x: n - (n - e.x) * s,
		y: r - (r - e.y) * s
	};
}
function Ct(e, t, n) {
	let r = Math.max(.1, Math.min(1, t / e.width, n / e.height));
	return {
		scale: r,
		x: Math.max(0, (t - e.width * r) / 2),
		y: 0
	};
}
var wt = (e, t) => (e?.kind ?? null) === (t?.kind ?? null) && (e?.id ?? null) === (t?.id ?? null);
function Tt(e, t, n, r) {
	if (!t.drill) return e;
	let i = [.../* @__PURE__ */ new Set([...Object.keys(n), ...Object.keys(r)])].filter((e) => JSON.stringify(n[e]) !== JSON.stringify(r[e]));
	if (!i.length) return e;
	let a = i.every((e) => e === "q"), o = e[e.length - 1];
	return a && o?.searchOnly && wt(o.drill, t.drill) ? e : [...e, {
		...t,
		filter: n,
		searchOnly: a
	}];
}
function Et(e, t) {
	return e.map((n, r) => ({
		at: r,
		entry: n,
		next: r + 1 < e.length ? e[r + 1].drill : t
	})).filter(({ entry: e, next: t }) => !wt(e.drill, t)).map(({ at: e, entry: t }) => ({
		at: e,
		label: Dt(t.drill)
	}));
}
var Dt = (e) => e ? e.kind === "epic" ? e.title : `Focus: ${e.title}` : "All tasks", Ot = (e) => {
	let t = e[e.length - 1];
	if (!t) return null;
	let n = t.drill ? Dt(t.drill) : "all tasks";
	return t.filter ? `Back to ${n}, before the filter change` : `Back to ${n}`;
};
function kt(e, t, n) {
	return n ? [...e, t] : [];
}
function At(e, t = e.length - 1) {
	return t < 0 || t >= e.length ? null : {
		entry: e[t],
		stack: e.slice(0, t)
	};
}
var jt = (e) => e.button === 3, Mt = (e) => !!e.altKey && e.key === "ArrowLeft" || !!e.metaKey && e.key === "[", Nt = "/apps/avoozl/api/command";
function J(e) {
	if (e && typeof e == "object" && "body" in e) {
		let { body: t, status: n } = e;
		try {
			let e = JSON.parse(String(t));
			if (e && typeof e.error == "string") return e.error;
		} catch {}
		if (typeof n == "number") return `Request failed (${n}).`;
	}
	return e instanceof Error ? e.message : String(e);
}
function Pt(e) {
	let t = async (t, n = {}, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		...r ? { workspaceId: r } : {}
	})).result;
	return {
		list: () => t("workspaces.list"),
		add: (e) => t("workspaces.add", { ...e }),
		init: (e) => t("workspaces.init", { ...e }),
		repositories: (e) => t("repositories.list", {}, e).then((e) => e.items),
		detectRepository: (e, n) => t("repositories.detect", { folder: n }, e),
		removeRepository: (e, n) => t("repositories.remove", { id: n }, e),
		registerRepository: (e, n) => t("repositories.configure", { ...n }, e),
		tick: (e) => t("workspace.tick", {}, e),
		tickHealth: (e) => t("workspace.tick.health", {}, e)
	};
}
function Ft(e, t = Date.now()) {
	if (!e) return "Not loaded";
	let { lastRun: n, lock: r } = e;
	if (r) return r.live ? `Running (pid ${r.pid})` : `Stale lock (pid ${r.pid})`;
	if (!n) return "Never run";
	if (n.outcome === "unreadable") return "Last run unreadable";
	let i = n.at ? Math.max(0, Math.round((t - Date.parse(n.at)) / 1e3)) : null, a = i === null ? "" : i < 90 ? ` ${i}s ago` : ` ${Math.round(i / 60)}m ago`;
	return n.outcome === "error" ? `Failed${a}: ${n.error ?? "unknown error"}` : n.outcome === "locked" ? `Skipped${a}: another tick held the lock` : n.policy === "invalid" ? `Ran${a}; .avoozl.json is invalid: ${n.error ?? ""}`.trim() : `Ran${a}; policy ${n.policy ?? "unknown"}`;
}
function It(e, t) {
	return t && e.items.some((e) => e.id === t) ? t : e.items.find((e) => e.served)?.id ?? e.defaultWorkspace ?? e.items[0]?.id ?? null;
}
var Lt = "avoozl.page";
function Rt(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
function zt(e, t) {
	try {
		e?.setItem(Lt, JSON.stringify(t));
	} catch {}
}
var Bt = {
	closed: {
		label: "On",
		tip: "Turned on. Avoozl opens it when a page or tick needs it."
	},
	opening: {
		label: "Opening",
		tip: "Avoozl is opening its database."
	},
	ready: {
		label: "Active",
		tip: "Open and ticking.",
		variant: "success"
	},
	draining: {
		label: "Finishing work",
		tip: "Asked to drain: it stops taking new work."
	},
	stopped: {
		label: "Turned off",
		tip: "Turned off. Ticks and pages skip it until it is turned on."
	},
	degraded: {
		label: "Needs attention",
		tip: "Something is wrong with this workspace. Check its tick health.",
		variant: "warning"
	},
	quarantined: {
		label: "Paused for safety",
		tip: "Paused for safety. Nothing runs here until you clear it.",
		variant: "warning"
	}
}, Vt = (e) => Bt[e] ?? {
	label: e,
	tip: `State: ${e}`
}, Ht = {
	check: "failed checks",
	review: "review",
	comment: "comment",
	conflict: "conflict",
	"auto-merge": "auto-merge off"
}, Ut = {
	session: "sent to the worker",
	conductor: "queued for the conductor",
	"new attempt": "carried to a new attempt"
}, Wt = {
	bound: "stopped: all rounds used",
	"same-check": "stopped: the same check failed 3 times",
	blocked: "stopped: the worker is blocked"
};
function Gt(e) {
	let t = [`${e.rounds} of ${e.bound ?? "?"} rounds`];
	return e.latest && t.push(`last: ${e.latest.kinds.map((e) => Ht[e] ?? e).join(", ")}, ${Ut[e.latest.to] ?? e.latest.to}`), e.stopped && t.push(Wt[e.stopped] ?? `stopped: ${e.stopped}`), t.join(" · ");
}
function Kt(e) {
	let t = async (t, n, r, i) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r,
		...i === void 0 ? {} : { expectedRevision: i }
	})).result;
	return {
		graph: (e, n = {}) => {
			let r = {};
			for (let e of [
				"epic",
				"repository",
				"status",
				"plan",
				"spec"
			]) n[e] && (r[e] = n[e]);
			return t("graph.view", r, e);
		},
		delivery: (e) => t("delivery.view", {}, e).then((e) => e.items),
		deliveryPage: (e) => t("delivery.view", {}, e),
		supersede: (e, n, r) => t("task.supersede", {
			id: n,
			create: r
		}, e),
		conflicts: (e) => t("conflicts.view", {}, e).then((e) => e.items),
		conflictsPage: (e) => t("conflicts.view", {}, e),
		resolveConflict: (e, n, r, i) => t("github.conflict.resolve", {
			taskId: n,
			field: r,
			choice: i
		}, e),
		updateTask: (e, n, r, i) => t("task.update", {
			id: n,
			...r
		}, e, i),
		retry: (e, n, r = []) => t("delivery.retry", {
			taskId: n,
			dismiss: r
		}, e),
		showContentLine: (e, n) => t("content.show", { id: n }, e),
		allowContentOnce: (e, n, r) => t("content.allow", {
			id: n,
			reason: r
		}, e)
	};
}
function qt(e) {
	return {
		tasks: e.tasks.length,
		edges: e.edges.length,
		blocking: e.edges.filter((e) => e.blocking).length,
		ready: e.tasks.filter((e) => e.ready).length
	};
}
function Jt(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
function Yt(e) {
	return [
		`${e.role} #${e.attempt}`,
		e.crewUnreachable ? "crew unreachable" : e.status ?? "not observed",
		e.crew && e.crew !== "local" ? `on ${e.crew}` : null,
		e.agent && e.agent !== "kirocrew-worker" ? e.agent : null,
		Xt(e)
	].filter(Boolean).join(" · ");
}
function Xt(e) {
	if (e.served === void 0) return e.model ?? null;
	let t = `requested ${e.model ?? "agent default"}`;
	if (!e.served) return `${t}, served model not reported`;
	let n = [e.served.withheld ? "withheld" : null, e.served.changed ? "changed mid-session" : null].filter(Boolean).join(", ");
	return `${t}, served ${e.served.model ?? "unknown"}${n ? ` (${n})` : ""}`;
}
function Zt(e) {
	let t = e.outcome === "refused" ? `${e.verdict ?? "verdict"} refused` : e.verdict ?? (e.outcome === "failed" ? "no verdict" : e.outcome), n = e.served && e.served !== e.model ? `${e.model ?? "model unknown"} → served ${e.served}` : e.model ?? "model unknown";
	return [
		e.role,
		t,
		n,
		e.stale ? "stale" : null
	].filter(Boolean).join(" · ");
}
function Qt(e) {
	return [
		e.reviewer,
		e.state,
		e.stale ? `stale (${e.commit?.slice(0, 12) ?? "older commit"})` : null,
		e.allowed ? null : `ignored: ${e.reason ?? "not allowed"}`
	].filter(Boolean).join(" · ");
}
function $t(e) {
	return Object.entries(e).filter(([e, t]) => e !== "taskId" && [
		"string",
		"number",
		"boolean"
	].includes(typeof t)).map(([e, t]) => [e, String(t)]);
}
var en = {
	decision: "Open decision",
	"needs-human": "Needs you",
	review: "Review",
	"stale-session": "Session ended",
	resource: "Shared resource",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function tn(e) {
	return (e.authority ?? "local") === "local" && !e.supersededBy && e.status !== "superseded";
}
function nn(e) {
	let t = {};
	return e.id.trim() && (t.id = e.id.trim()), e.title.trim() && (t.title = e.title.trim()), t;
}
var rn = /* @__PURE__ */ new Set([
	"closed",
	"lost",
	"gone"
]);
function an(e) {
	if (!e) return [];
	let t = /* @__PURE__ */ new Map();
	for (let n of e.sessions) n.role !== "worker" && t.set(`${n.role}:${n.attempt}`, {
		key: n.slot,
		role: n.role,
		round: n.attempt,
		requested: n.model ?? null,
		served: n.served?.model ?? null,
		status: n.status,
		verdict: null,
		stale: !1,
		link: n.link ?? null,
		live: !rn.has(n.status ?? "")
	});
	for (let n of e.rounds ?? []) for (let e of n.verdicts) {
		if (e.role === "checks") continue;
		let n = `${e.role}:${e.attempt}`, r = t.get(n);
		t.set(n, {
			key: r?.key ?? `${n}:${e.commit ?? ""}`,
			role: e.role,
			round: e.attempt,
			requested: r?.requested ?? e.model ?? null,
			served: r?.served ?? e.served ?? null,
			status: r?.status ?? null,
			verdict: e.verdict ?? e.outcome ?? null,
			stale: e.stale,
			link: r?.link ?? e.link ?? null,
			live: r?.live ?? !1
		});
	}
	return [...t.values()].sort((e, t) => t.round - e.round || e.role.localeCompare(t.role));
}
function on(e) {
	return e === "running" ? "Waiting on your decision: marked running, but no session is running" : "Waiting on your decision: marked in review, but no review is running";
}
// kirocrew-app/ui/src/dashboard-api.ts
var sn = /* @__PURE__ */ new Set(["closed", "lost"]);
function cn(e) {
	return e.group ? { kind: "review" } : e.taskId ? {
		kind: "task",
		id: e.taskId
	} : {
		kind: "tab",
		tab: e.tab
	};
}
function ln(e) {
	let t = cn(e);
	return t.kind === "review" ? "Open the list of tasks to review" : t.kind === "task" ? `Open ${t.id} in the drawer` : t.tab === "conflicts" ? "Open it in Conflicts" : "Open it in Delivery";
}
var un = (e) => Jt(e.issue?.url ?? null);
function dn(e) {
	return [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null;
}
function fn(e) {
	return e.complete ? null : e.deliveries.some((e) => e.state === "decision") ? "Stopped after its retries; retry it or dismiss the findings." : null;
}
function pn(e) {
	let t = e.limit ?? 8, n = e.graph && {
		...e.graph,
		tasks: e.graph.tasks.filter((e) => !e.planArchived)
	}, r = e.delivery;
	e = {
		...e,
		delivery: e.delivery && e.delivery.filter((e) => !e.planArchived),
		conflicts: e.conflicts && e.conflicts.filter((e) => !e.planArchived)
	};
	let i = (n?.tasks ?? []).filter((e) => e.kind === "leaf"), a = {
		ready: 0,
		running: 0,
		waiting: 0,
		"needs-you": 0,
		done: 0,
		deferred: 0
	}, o = new Set((r ?? []).filter((e) => !e.complete && e.sessions.some((e) => !sn.has(e.status ?? ""))).map((e) => e.id));
	for (let e of i) {
		let t = at(e);
		a[t === "done" ? "done" : o.has(e.id) ? "running" : t === "running" ? "needs-you" : t] += 1;
	}
	let s = [], c = /* @__PURE__ */ new Set(), l = (e) => {
		c.has(e.key) || (c.add(e.key), s.push(e));
	};
	for (let t of e.delivery ?? []) {
		let e = fn(t);
		e && l({
			key: `delivery:${t.id}`,
			kind: "delivery",
			taskId: t.id,
			title: t.title,
			detail: e,
			tab: "delivery",
			href: un(t)
		});
	}
	let u = (e) => [
		"decision",
		"github-conflict",
		"stale-session"
	].indexOf(e) >>> 0;
	for (let t of [...e.conflicts ?? []].sort((e, t) => u(e.kind) - u(t.kind))) l({
		key: `${t.kind}:${t.taskId ?? t.id ?? ""}:${t.field ?? ""}`,
		kind: t.kind,
		taskId: t.taskId,
		...t.kind === "review" ? { group: t } : {},
		title: t.title,
		detail: t.detail,
		tab: "conflicts",
		href: un(t)
	});
	let d = (r ?? []).filter((e) => !e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		sessions: e.sessions.filter((e) => !sn.has(e.status ?? ""))
	})).filter((e) => e.sessions.length > 0), f = new Map((n?.tasks ?? []).map((e) => [e.id, e])), p = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), m = d.flatMap((e) => e.sessions.map((t) => {
		let n = f.get(e.id)?.epic ?? null;
		return {
			slot: t.slot,
			role: t.role,
			focus: t.title,
			taskId: e.id,
			title: e.title,
			epic: n ? p.get(n) ?? ct(n) : null,
			attempt: t.attempt,
			model: Xt(t),
			startedAt: t.boundAt,
			lastAt: t.statusAt ?? t.boundAt,
			status: t.status,
			session: t
		};
	})).sort((e, t) => (t.lastAt ?? "").localeCompare(e.lastAt ?? "")), h = n ? ot(n) : /* @__PURE__ */ new Map(), g = i.filter((e) => at(e) === "ready").map((e) => ({
		...e,
		wave: h.get(e.id) ?? 1
	})).sort((e, t) => (e.order ?? Infinity) - (t.order ?? Infinity) || e.wave - t.wave || e.id.localeCompare(t.id)), _ = (e.delivery ?? []).filter((e) => e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		at: dn(e),
		issue: un(e),
		pulls: e.pullRequests.flatMap((e) => {
			let t = Jt(e.url);
			return t ? [{
				number: e.number,
				href: t
			}] : [];
		})
	})).sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")).slice(0, t), v = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), y = /* @__PURE__ */ new Map();
	for (let e of m) {
		let t = f.get(e.taskId)?.epic;
		t && y.set(t, (y.get(t) ?? 0) + 1);
	}
	let b = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (!e.epic || !v.has(e.epic)) continue;
		let t = b.get(e.epic) ?? {
			epic: e.epic,
			title: v.get(e.epic),
			done: 0,
			total: 0,
			running: y.get(e.epic) ?? 0
		};
		t.total += 1, at(e) === "done" && (t.done += 1), b.set(e.epic, t);
	}
	let x = (e.plans?.items ?? []).filter((e) => !e.archivedAt), S = (e.plans?.items ?? []).length - x.length;
	return {
		attention: s,
		counts: a,
		running: d,
		inFlight: m,
		readyNext: g,
		recent: _,
		progress: [...b.values()],
		plans: {
			approved: x.filter((e) => e.state === "approved").length,
			draft: x.filter((e) => e.state === "draft").length,
			total: (e.plans?.total ?? x.length + S) - S
		}
	};
}
var mn = "(max-width: 480px)";
function hn(e, t) {
	return t ? "small" : e ? "wide" : "medium";
}
function gn(e) {
	return e === "small" ? {
		list: {
			display: "grid",
			gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
			gap: 6,
			width: "100%"
		},
		button: {
			minHeight: 32,
			width: "100%",
			justifyContent: "space-between"
		}
	} : {
		list: {
			display: "flex",
			flexWrap: "wrap",
			justifyContent: "flex-end",
			gap: 6,
			...e === "medium" ? { width: "100%" } : { marginLeft: "auto" }
		},
		button: {
			minHeight: 26,
			paddingInline: 8
		}
	};
}
// kirocrew-app/ui/src/task-api.ts
function _n(e) {
	return e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `${e.document}, lines ${e.lineStart}–${e.lineEnd}` : `${e.document}, line ${e.lineStart}` : e.document;
}
function vn(e, t) {
	return t ? e.split(t).flatMap((e, n) => n === 0 ? [{
		text: e,
		link: !1
	}] : [{
		text: t,
		link: !0
	}, {
		text: e,
		link: !1
	}]).filter((e) => e.text) : [{
		text: e,
		link: !1
	}];
}
var yn = (e) => e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `Lines ${e.lineStart}–${e.lineEnd}` : `Line ${e.lineStart}` : null, bn = (e) => !!e && !e.startsWith("/") && !/^[A-Za-z]:/.test(e) && !e.split(/[\\/]/).includes("..");
function xn(e, t) {
	let n = -1;
	return e.forEach((r, i) => {
		r <= t && (n < 0 || r >= e[n]) && (n = i);
	}), n;
}
function Sn(e, t, n) {
	if (!t) return [];
	if (n && n > t) {
		let r = e.flatMap((e, r) => e.line >= t && e.line <= n ? [r] : []);
		if (r.length) return r;
	}
	let r = xn(e.map((e) => e.line), t);
	if (r < 0) return [];
	let i = /^h([1-6])$/.exec(e[r].tag)?.[1];
	if (!i) return [r];
	let a = [r];
	for (let t = r + 1; t < e.length; t++) {
		let n = /^h([1-6])$/.exec(e[t].tag)?.[1];
		if (n && Number(n) <= Number(i)) break;
		a.push(t);
	}
	return a;
}
function Cn(e) {
	let t = async (t, n, r, i) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r,
		...i === void 0 ? {} : { expectedRevision: i }
	})).result;
	return {
		detail: (e, n) => t("task.detail", { id: n }, e),
		document: (e, n) => t("document.get", { id: n }, e),
		preview: (e, n, r) => t("task.change.preview", {
			id: n,
			...r
		}, e),
		save: (e, n, r) => t("task.update", n, e, r),
		settle: (e, n, r, i, a) => t("conflicts.settle", {
			action: n,
			items: r,
			...a ? { answer: a } : {}
		}, e, i)
	};
}
function wn(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i = (e, t) => {
		r.has(e) || r.set(e, []), r.get(e).push(t);
	};
	for (let n of e) (n.kind === "requires" || n.kind === "sequence") && n.to !== t && i(n.from, n.to);
	for (let e of n) i(e, t);
	let a = /* @__PURE__ */ new Map(), o = [t];
	for (; o.length;) {
		let e = o.shift();
		for (let n of r.get(e) ?? []) {
			if (n === t) {
				let n = [t];
				for (let r = e; r !== t; r = a.get(r)) n.push(r);
				return n.push(t), n.reverse();
			}
			a.has(n) || (a.set(n, e), o.push(n));
		}
	}
	return null;
}
function Tn(e, t) {
	let n = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 60).replace(/-+$/, "");
	if (n.length < 3 && (n = `task-${n || "new"}`.replace(/-+$/, "")), !t.has(n)) return n;
	for (let e = 2;; e++) if (!t.has(`${n}-${e}`)) return `${n}-${e}`;
}
var En = [
	"merged-pr",
	"integrated",
	"released",
	"answered"
], Dn = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean);
function On() {
	return {
		id: "",
		title: "",
		summary: "",
		epic: "",
		repository: "",
		acceptance: "",
		checks: "",
		prerequisites: []
	};
}
function kn(e) {
	return {
		id: e.task.id,
		title: e.task.title,
		summary: e.task.summary,
		epic: e.task.epic ?? "",
		repository: e.task.repository ?? "",
		acceptance: e.task.acceptance.join("\n"),
		checks: e.task.checks.join("\n"),
		prerequisites: e.waitsOn.filter((e) => e.kind === "requires" || e.kind === "sequence").map((e) => ({
			id: e.id,
			kind: e.kind,
			condition: e.condition ?? ""
		}))
	};
}
function An(e, t) {
	let n = { id: e.id.trim() }, r = (e, r, i) => {
		t && JSON.stringify(r) === JSON.stringify(i) || (n[e] = r);
	};
	r("title", e.title.trim(), t?.title.trim()), r("summary", e.summary.trim(), t?.summary.trim()), r("acceptance", Dn(e.acceptance), t ? Dn(t.acceptance) : void 0), r("checks", Dn(e.checks), t ? Dn(t.checks) : void 0), e.epic && r("epic", e.epic, t?.epic), r("repository", e.repository.trim() || void 0, t && t.repository.trim() || void 0), n.repository === void 0 && delete n.repository;
	let i = (e) => e.filter((e) => e.kind === "requires").map((e) => e.condition ? {
		task: e.id,
		condition: e.condition
	} : e.id), a = (e) => e.filter((e) => e.kind === "sequence").map((e) => e.id);
	return r("requires", i(e.prerequisites), t ? i(t.prerequisites) : void 0), r("sequence", a(e.prerequisites), t ? a(t.prerequisites) : void 0), t ? [
		"title",
		"summary",
		"acceptance",
		"checks"
	].some((e) => e in n) && (n.needsReview = !0) : (n.create = !0, n.needsReview = !0), n;
}
function jn(e) {
	return /Database changed/.test(e) ? "This task changed elsewhere. Reload it, then make your change again." : e;
}
function Mn(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
function Nn(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.floor((t - n) / 6e4));
	if (r < 60) return `${r} min`;
	let i = Math.floor(r / 60);
	return i < 24 ? `${i} h ${r % 60} min` : `${Math.floor(i / 24)} d ${i % 24} h`;
}
function Pn(e) {
	return e.crew && e.crew !== "local" ? e.link ?? null : Fn(e);
}
function Fn(e) {
	if (e.link) return e.link;
	let t = e.slot.startsWith("dashboard:") ? e.slot.slice(10) : e.slot;
	return `/chat?sid=${encodeURIComponent(t)}`;
}
// kirocrew-app/ui/src/routing-api.ts
var In = {
	local: 3,
	remote: 2
}, Ln = [
	"os",
	"arch",
	"tools",
	"trust"
], Rn = [
	"worker",
	"checks",
	"reviewer"
], zn = [
	{
		key: "balanced",
		title: "Balanced",
		line: "Weigh free chats, memory, disk, and load, with a small lean to this machine.",
		when: "mixed work on a few crews (the default)."
	},
	{
		key: "keep-local",
		title: "Keep local",
		line: "Run here unless this machine is full.",
		when: "remote crews are for overflow only."
	},
	{
		key: "spread-out",
		title: "Spread out",
		line: "Spread sessions across every allowed crew.",
		when: "many independent leaves."
	}
], Bn = {
	slots: "Free chats",
	memory: "Free memory",
	disk: "Free disk",
	load: "Low load",
	avoozl: "Avoozl chats already there (minus)",
	local: "This machine"
}, Vn = (e) => e && e.length ? e.join(", ") : "";
function Hn(e) {
	let t = e.when || {}, n = [
		t.labels?.length ? `label ${Vn(t.labels)}` : "",
		t.kinds?.length ? `kind ${Vn(t.kinds)}` : "",
		t.roles?.length ? `role ${t.roles.join("/")}` : "",
		t.repositories?.length ? `repository ${Vn(t.repositories)}` : "",
		t.categories?.length ? `category ${Vn(t.categories)}` : "",
		t.paths?.length ? Vn(t.paths) : ""
	].filter(Boolean);
	return n.length ? `When ${n.join(", ")}` : "Every task";
}
function Un(e) {
	return !e || e === "local" ? "local worker" : e === "github" ? "GitHub route" : e;
}
function Wn(e) {
	if (e.keepLocal) return "local only";
	let t = e.on || "local", n = [...(e.requireTags || []).map((e) => e), ...(e.forbidTags || []).map((e) => `not ${e}`)], r = t === "any" ? "any crew" : t.startsWith("tags:") ? t.slice(5).split(",").join(" ") : t;
	return n.length ? `${r} (${n.join(", ")})` : r;
}
function Gn(e) {
	if (!e) return "";
	if (e.choices) return `as ${e.choices.length} choices`;
	let t = [e.agent, e.model].filter(Boolean);
	return t.length ? `as ${t.join(" / ")}` : "";
}
function Kn(e) {
	return [
		Hn(e),
		"->",
		Un(e.route),
		"on",
		Wn(e),
		Gn(e.session)
	].filter(Boolean).join(" ");
}
var qn = (e) => e.route && e.route !== "local" ? "Session does not apply: this route opens no Avoozl session." : null;
function Jn(e) {
	let t = e.reading, n = (e, t, n = 0) => e == null ? "–" : `${e.toFixed(n)}${t}`, r = e.ageSeconds === null ? "" : e.ageSeconds < 90 ? `${e.ageSeconds}s` : `${Math.round(e.ageSeconds / 60)}m`;
	return {
		load: n(t?.loadPerCpu, "", 1),
		mem: n(t?.memFreeGb, " GB"),
		disk: n(t?.diskFreeGb, " GB"),
		health: e.available ? `ok ${r}`.trim() : /stale/.test(e.why || "") ? `stale ${r}`.trim() : e.why ?? "unavailable"
	};
}
var Yn = (e) => String(e.id === "local" ? In.local : In.remote);
function Xn(e) {
	return {
		tags: e.tags.filter((e) => !e.startsWith("trust:")).join(" "),
		trust: e.trust,
		gitHosts: e.gitHosts.join(" "),
		chatLimit: e.chatLimitSet ? String(e.chatLimit) : "",
		delivery: e.id === "local" || !e.configured ? "" : e.delivery ?? "",
		sshHost: e.sshHost ?? "",
		worktreeRoot: e.worktreeRoot ?? ""
	};
}
var Zn = (e) => e.split(/[\s,]+/).filter(Boolean);
function Qn(e, t) {
	let n = Zn(t.tags);
	for (let e of n) {
		let t = e.split(":")[0];
		if (!e.includes(":") || !Ln.includes(t)) return { error: `Tag ${e}: use key:value with key ${Ln.join(", ")}.` };
	}
	let r = { tags: [...n.filter((e) => !e.startsWith("trust:")), `trust:${e === "local" ? "local" : t.trust}`] }, i = Zn(t.gitHosts);
	if (i.length && (r.gitHosts = i), t.chatLimit.trim()) {
		let e = Number(t.chatLimit);
		if (!Number.isInteger(e) || e < 0 || e > 32) return { error: "Chat limit is a whole number 0–32." };
		r.chatLimit = e;
	}
	if (e !== "local" && (t.delivery && (r.delivery = t.delivery), t.sshHost.trim() && (r.sshHost = t.sshHost.trim()), t.worktreeRoot.trim())) {
		if (!t.worktreeRoot.trim().startsWith("/")) return { error: "Worktree folder is an absolute folder on that crew." };
		r.worktreeRoot = t.worktreeRoot.trim();
	}
	return { entry: r };
}
function $n(e) {
	let t = {};
	for (let n of e) {
		if (!n.configured) continue;
		let e = Qn(n.id, Xn(n));
		e.entry && (t[n.id] = e.entry);
	}
	return t;
}
var er = () => ({
	id: "",
	saveIn: "workspace",
	labels: [],
	kinds: "",
	roles: [],
	repositories: "",
	categories: "",
	paths: "",
	route: "",
	on: "",
	onTags: [],
	requireTags: [],
	forbidTags: [],
	keepLocal: !1,
	agent: "",
	model: "",
	choices: []
});
function tr(e) {
	let t = e.when || {}, n = e.on || "";
	return {
		id: e.id,
		saveIn: e.source === "machine" ? "machine" : e.source === "repository" ? `repository:${e.repository}` : "workspace",
		labels: t.labels || [],
		kinds: Vn(t.kinds),
		roles: t.roles || [],
		repositories: Vn(t.repositories),
		categories: Vn(t.categories),
		paths: Vn(t.paths),
		route: e.route || "",
		on: n.startsWith("tags:") ? "tags" : n,
		onTags: n.startsWith("tags:") ? n.slice(5).split(",") : [],
		requireTags: e.requireTags || [],
		forbidTags: e.forbidTags || [],
		keepLocal: !!e.keepLocal,
		agent: e.session && !e.session.choices ? e.session.agent ?? "" : "",
		model: e.session && !e.session.choices ? e.session.model ?? "" : "",
		choices: (e.session?.choices || []).map((e) => ({
			agent: e.agent ?? "",
			model: e.model ?? "",
			weight: e.weight ? String(e.weight) : ""
		}))
	};
}
var nr = (e) => e.split(",").map((e) => e.trim()).filter(Boolean);
function rr(e) {
	if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(e.id)) return { error: "Name is required: lowercase letters, digits, or -." };
	let t = {};
	e.labels.length && (t.labels = e.labels), nr(e.kinds).length && (t.kinds = nr(e.kinds)), e.roles.length && (t.roles = e.roles), nr(e.repositories).length && (t.repositories = nr(e.repositories)), nr(e.categories).length && (t.categories = nr(e.categories)), nr(e.paths).length && (t.paths = nr(e.paths));
	let n = { id: e.id };
	if (Object.keys(t).length && (n.when = t), e.route && (n.route = e.route), e.on === "tags") {
		if (!e.onTags.length) return { error: "Run on tags: pick at least one tag." };
		n.on = `tags:${e.onTags.join(",")}`;
	} else if (e.on) {
		if (!["local", "any"].includes(e.on) && e.saveIn !== "machine") return { error: "A crew name is allowed only when Save in is this machine." };
		n.on = e.on;
	}
	if (e.requireTags.length && (n.requireTags = e.requireTags), e.forbidTags.length && (n.forbidTags = e.forbidTags), e.keepLocal && (n.keepLocal = !0), e.choices.length) {
		if (e.choices.length > 10) return { error: "At most 10 choices." };
		let t = [];
		for (let [n, r] of e.choices.entries()) {
			let e = {};
			if (r.agent.trim() && (e.agent = r.agent.trim()), r.model.trim() && (e.model = r.model.trim()), r.weight.trim()) {
				let t = Number(r.weight);
				if (!Number.isInteger(t) || t < 1 || t > 100) return { error: `Choice ${n + 1}: weight is a whole number 1–100.` };
				e.weight = t;
			}
			t.push(e);
		}
		n.session = { choices: t };
	} else (e.agent.trim() || e.model.trim()) && (n.session = {
		...e.agent.trim() ? { agent: e.agent.trim() } : {},
		...e.model.trim() ? { model: e.model.trim() } : {}
	});
	return { rule: n };
}
var ir = (e) => {
	let { source: t, repository: n, sessionApplies: r, ...i } = e;
	return i;
};
function ar(e, t) {
	return e.rules.filter((e) => t === "machine" ? e.source === "machine" : t === "workspace" ? e.source === "workspace" : e.source === "repository" && `repository:${e.repository}` === t).map(ir);
}
function or(e, t, n) {
	let r = {
		...t === "machine" ? { ...e.machine } : t === "workspace" ? { ...e.workspace } : { ...e.repositories[t.slice(11)] || {} },
		rules: n
	};
	return n.length || delete r.rules, r.pick && !Object.keys(r.pick).length && delete r.pick, r.router && !Object.keys(r.router).length && delete r.router, r;
}
function sr(e, t, n) {
	let r = [...e], [i] = r.splice(t, 1);
	return r.splice(Math.max(0, Math.min(n, r.length)), 0, i), r;
}
function cr(e) {
	let t = (t, n, r = {}) => e.post(Nt, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, "routing.view"),
		preview: (e) => t(e, "routing.preview"),
		save: (e, n) => t(e, "routing.update", n),
		saveCrews: (e, n) => t(e, "crews.update", n),
		pickAgain: (e, n) => t(e, "delivery.pickAgain", { taskId: n })
	};
}
// kirocrew-app/ui/src/drawer-context.ts
var lr = e({
	openTask: () => void 0,
	addTask: () => void 0,
	openReview: () => void 0
}), ur = () => n(lr), dr = "(none)", fr = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : null, pr = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : void 0, mr = (e) => !!(e.q?.trim() || e.plan || e.epic || e.repository || e.state || e.waveMin || e.waveMax || e.authority || e.needsYou || e.archived), hr = (e, t) => !e.planArchived || !!(t.archived || t.plan);
function gr(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "", r = t.plan;
	return hr(e, t) && (!n || e.title.toLowerCase().includes(n) || e.id.toLowerCase().includes(n)) && (!r || (r.startsWith("spec:") ? e.spec === r.slice(5) : r.startsWith("plan:") ? e.planId === r.slice(5) : !1)) && (!t.epic || e.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !e.repository : e.repository === t.repository)) && (!t.state || e.state === t.state) && (!t.waveMin || e.wave >= t.waveMin) && (!t.waveMax || e.wave <= t.waveMax) && (!t.authority || (e.authority ?? "local") === t.authority) && (!t.needsYou || e.state === "needs-you" || !!e.decision);
}
var _r = (e, t) => ({
	id: e.id,
	title: e.title,
	epic: e.epic,
	planId: e.planId ?? null,
	spec: e.spec ?? null,
	repository: e.repository,
	authority: e.authority,
	state: at(e),
	wave: t,
	decision: e.decision,
	planArchived: e.planArchived ?? null
});
function vr(e, t = {}) {
	let n = e?.tasks ?? [], r = e ? ot(e) : /* @__PURE__ */ new Map(), i = (e, t) => {
		let r = /* @__PURE__ */ new Set();
		for (let t of n) {
			let n = e(t);
			n && r.add(n);
		}
		return [...r].map((e) => ({
			value: e,
			label: t(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, a = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), o = /* @__PURE__ */ new Set([...e?.repositories ?? [], ...n.map((e) => e.repository).filter((e) => !!e)]);
	return {
		plans: i(fr, (e) => t[e] ?? e.replace(/^(spec|plan):/, "")),
		epics: i((e) => e.epic, (e) => a.get(e) ?? e),
		repositories: [...[...o].sort().map((e) => ({
			value: e,
			label: e
		})), ...n.some((e) => !e.repository) ? [{
			value: dr,
			label: "No repository"
		}] : []],
		states: Xe.map((e) => ({
			value: e.id,
			label: e.label
		})),
		authorities: i((e) => e.authority ?? "local", (e) => e),
		waves: Math.max(0, ...r.values())
	};
}
function yr(e, t) {
	if (!mr(t) && !e.tasks.some((e) => e.planArchived)) return e;
	let n = ot(e), r = e.tasks.filter((e) => gr(_r(e, n.get(e.id) ?? 1), t)), i = new Set(r.map((e) => e.id));
	return {
		...e,
		tasks: r,
		edges: e.edges.filter((e) => i.has(e.from) && i.has(e.to))
	};
}
var br = (e) => `avoozl.filters.${e}`, xr = "avoozl-filter";
function Sr(e, t) {
	try {
		let n = JSON.parse(e?.getItem(br(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of [
			"q",
			"plan",
			"epic",
			"repository",
			"authority"
		]) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		Xe.some((e) => e.id === n.state) && (r.state = n.state);
		for (let e of ["waveMin", "waveMax"]) Number.isInteger(n[e]) && n[e] > 0 && (r[e] = n[e]);
		return n.needsYou === !0 && (r.needsYou = !0), n.archived === !0 && (r.archived = !0), r;
	} catch {
		return {};
	}
}
function Cr(e, t, n) {
	try {
		e?.setItem(br(t), JSON.stringify(n));
	} catch {}
}
function wr(e, t) {
	let n = {
		...e,
		...t
	};
	for (let e of Object.keys(n)) (n[e] === void 0 || n[e] === "" || n[e] === !1) && delete n[e];
	return n;
}
// kirocrew-app/ui/src/delivery-api.ts
var Tr = [
	{
		id: "ready",
		label: "Ready",
		tint: "var(--accent)"
	},
	{
		id: "in-progress",
		label: "In progress",
		tint: "var(--tile-purple, var(--accent))"
	},
	{
		id: "needs-you",
		label: "Needs you",
		tint: "var(--danger)"
	},
	{
		id: "waiting",
		label: "Blocked or waiting",
		tint: "var(--muted)"
	}
], Er = [{
	id: "running",
	label: "Running"
}, {
	id: "reviewing",
	label: "Reviewing"
}];
function Dr(e, t) {
	return t === "in-progress" ? [...e.running, ...e.reviewing] : e[t];
}
function Or(e) {
	return Er.map((t) => ({
		...t,
		cards: e[t.id]
	})).filter((e) => e.cards.length);
}
var kr = (e) => `color-mix(in srgb, ${e} 8%, var(--card, transparent))`, Ar = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function jr(e) {
	return e ? [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at),
		...e.deliveries.map((e) => typeof e.updatedAt == "string" ? e.updatedAt : null)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null : null;
}
var Mr = Ye;
function Nr(e, t) {
	return e === "running" || e === "reviewing" ? "running" : e === "waiting" ? t && at(t) === "deferred" ? "deferred" : "waiting" : e;
}
function Pr(e, t) {
	let n = new Map((e?.tasks ?? []).map((e) => [e.id, e])), r = e ? ot(e) : /* @__PURE__ */ new Map(), i = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), a = {
		ready: [],
		running: [],
		reviewing: [],
		"needs-you": [],
		waiting: [],
		done: []
	}, o = /* @__PURE__ */ new Set(), s = (e, t) => {
		let n = t?.id ?? e.id;
		o.add(n);
		let s = e?.epic ?? null, c = (t?.sessions ?? []).map((e) => e.attempt), l = Mr(e, t);
		a[l].push({
			id: n,
			title: t?.title ?? e.title,
			epic: s ? i.get(s) ?? ct(s) : null,
			epicId: s,
			repository: e?.repository ?? null,
			planId: e?.planId ?? null,
			spec: e?.spec ?? null,
			state: Nr(l, e),
			wave: r.get(n) ?? 1,
			decision: e?.decision ?? null,
			authority: t?.authority ?? e?.authority ?? "local",
			route: e?.route ?? null,
			issue: t?.issue ?? e?.issue ?? null,
			item: t,
			attempt: c.length ? Math.max(...c) : null,
			sessions: t?.sessions ?? [],
			reviewRounds: t?.rounds?.length ?? 0,
			deliveryState: Ar(t),
			deferred: e ? at(e) === "deferred" : !1,
			review: e?.review === !0,
			handSetReview: !!(t?.handSetReview ?? e?.handSetReview),
			noSession: t?.noSession ?? e?.noSession ?? null,
			nextAction: t?.nextAction ?? e?.nextAction ?? null,
			planArchived: t?.planArchived ?? e?.planArchived ?? null,
			at: jr(t)
		});
	};
	for (let e of t) e.status !== "superseded" && s(n.get(e.id) ?? null, e);
	for (let t of e?.tasks ?? []) !o.has(t.id) && t.kind === "leaf" && t.status !== "superseded" && s(t, null);
	return a.done.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a.running.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a;
}
function Fr(e) {
	let t = (e?.statuses ?? []).filter((e) => !e.complete && !["deferred", "blocked"].includes(e.id));
	return t.find((e) => e.id === "planned")?.id ?? t[0]?.id ?? null;
}
function Ir(e) {
	let t = (e?.statuses ?? []).filter((e) => e.complete);
	return (t.find((e) => e.id === "done") ?? t.find((e) => e.id === "accepted") ?? t[0])?.id ?? null;
}
function Lr(e, t) {
	return Object.fromEntries(Object.keys(e).map((n) => [n, e[n].filter((e) => gr({
		...e,
		decision: e.decision ?? (e.deliveryState === "decision" ? "delivery stopped" : null)
	}, t))]));
}
var Rr = {
	id: "done",
	label: "Done",
	tint: "var(--ok)"
};
function zr(e, t, n = 16) {
	for (let r of [
		4,
		2,
		1
	]) {
		let i = Math.min(r, t);
		if (i * 320 + (i - 1) * n <= e) return i;
	}
	return 1;
}
function Br(e) {
	if (e) return e === "running" ? "in-progress" : e === "deferred" ? "waiting" : e;
}
var Vr = (e) => e.route === "local" && !e.deferred, Hr = {
	agent: "kirocrew-worker",
	prFeedback: !0,
	feedbackRounds: 5
};
function Ur(e = {}) {
	return {
		agent: e.agent ?? "",
		model: e.model ?? "",
		prFeedback: e.prFeedback === void 0 ? "" : e.prFeedback ? "on" : "off",
		feedbackRounds: e.feedbackRounds === void 0 ? "" : String(e.feedbackRounds)
	};
}
function Wr(e) {
	let t = {};
	if (e.agent.trim()) {
		if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(e.agent.trim())) return { error: "Agent is an agent name: letters, digits, . _ : or -." };
		t.agent = e.agent.trim();
	}
	if (e.model && (t.model = e.model), e.prFeedback && (t.prFeedback = e.prFeedback === "on"), e.feedbackRounds.trim()) {
		let n = Number(e.feedbackRounds);
		if (!Number.isInteger(n) || n < 1 || n > 20) return { error: "Feedback rounds is a whole number 1–20." };
		t.feedbackRounds = n;
	}
	return { delivery: t };
}
// kirocrew-app/ui/src/icons.ts
var Gr = pe, Kr = {
	dashboard: he,
	plans: ne,
	graph: be,
	delivery: G,
	flow: ie,
	routing: le,
	conflicts: P,
	untriaged: de,
	settings: je
};
function qr(e) {
	let t = {
		kind: e.kind,
		taskId: e.taskId ?? null
	};
	return e.field && (t.field = e.field), e.slot && (t.slot = e.slot), e.id && (t.id = e.id), t;
}
function Jr(e) {
	let t = async (t, n, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		context: (e, n) => t("chat.context", { ...n }, e),
		start: (e, n) => t("task.start", { taskId: n }, e),
		tickLog: (e, n = 20) => t("workspace.tick.log", { limit: n }, e).then((e) => e.items),
		activity: (e, n = 50) => t("activity.recent", { limit: n }, e).then((e) => e.items)
	};
}
var Yr = (e, t) => Math.min(t, Math.max(1, e) * 100), Xr = (e) => `Show ${Math.min(100, e)} more (${e} left)`, Zr = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), Qr = (e) => Zr.has(e);
function $r(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function ei() {
	let e = [], t = 1, n = () => {
		let t = $r(e, (e) => e.kind === "tab");
		return t ? e.slice(e.indexOf(t) + 1) : e;
	}, r = {
		steps: () => e,
		push(n) {
			let r = t++;
			return e = [...e, {
				...n,
				id: r
			}], r;
		},
		release(t) {
			e.some((e) => e.id === t) && (e = e.filter((e) => e.id !== t));
		},
		back() {
			let t = e.at(-1);
			return t ? (t.back(), !0) : !1;
		},
		escape() {
			let t = $r(e, (e) => Qr(e.kind));
			return t ? ((t.dismiss ?? t.back)(), !0) : !1;
		},
		count: (e) => n().filter((t) => t.kind === e).length,
		sync(e, t, i) {
			let a = r.count(e);
			for (; a < t;) r.push({
				...i(),
				kind: e
			}), a++;
			for (; a > t;) {
				let t = $r(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function ti(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return !!t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? "");
}
function ni(e, t, n) {
	if (e.isComposing) return null;
	let r = n.steps();
	return e.key === "Escape" ? r.some((e) => Qr(e.kind)) ? "escape" : null : !t || !r.length || !Mt(e) || e.key === "ArrowLeft" && ti(e.target) ? null : "back";
}
function ri(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var ii = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function ai(e = ii) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: ei(),
		memory: t,
		takeMemory() {
			let e = new Map(t);
			return t.clear(), e;
		},
		putMemory(e) {
			t.clear(), e.forEach((e, n) => t.set(n, e));
		},
		scroller: n,
		scrollTop: () => n.current?.scrollTop ?? 0,
		restoreScroll: (t) => void e(() => ri(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
function oi(e, t, n, r, i, a) {
	let o = e.scrollTop(), s = e.history.push({
		kind: t,
		label: r,
		back: () => {
			e.history.release(s), a?.delete(s), e.memory.set(n, i), e.setters.get(n)?.(i), e.restoreScroll(o);
		}
	});
	return a?.add(s), s;
}
function si(e, t, n, r, i) {
	let a = n.tab !== void 0 && n.tab !== t.tab, o = n.settingsTab !== void 0 && n.settingsTab !== t.settingsTab;
	if (a || o) {
		let n = e.scrollTop(), o = a ? e.takeMemory() : null, s = e.history.push({
			kind: a ? "tab" : "inner",
			label: i(t, a),
			back: () => {
				e.history.release(s), o && e.putMemory(o), r(t), e.restoreScroll(n);
			}
		});
	}
	r(n);
}
// kirocrew-app/ui/src/NavHistory.tsx
var ci = "data-avoozl-app", li = e(null), ui = null, di = () => n(li) ?? (ui ??= ai()), fi = (e) => e instanceof Element && !!e.closest("[data-avoozl-app]");
function pi({ children: e }) {
	let t = o(ai, []);
	return r(() => {
		let e = !1, n = (t) => {
			let n = t.target;
			return n instanceof Element && n !== document.body && n !== document.documentElement ? fi(n) : e;
		}, r = (t) => {
			e = fi(t.target);
		}, i = (e) => {
			let r = ni(e, n(e), t.history);
			r && (e.preventDefault(), e.stopImmediatePropagation(), r === "escape" ? t.history.escape() : t.history.back());
		}, a = (e) => jt(e) && fi(e.target) && t.history.steps().length > 0, o = (e) => {
			a(e) && (e.preventDefault(), e.stopImmediatePropagation());
		}, s = (e) => {
			a(e) && (o(e), t.history.back());
		};
		return window.addEventListener("pointerdown", r, !0), window.addEventListener("keydown", i, !0), window.addEventListener("mousedown", o, !0), window.addEventListener("mouseup", s, !0), window.addEventListener("auxclick", o, !0), () => {
			window.removeEventListener("pointerdown", r, !0), window.removeEventListener("keydown", i, !0), window.removeEventListener("mousedown", o, !0), window.removeEventListener("mouseup", s, !0), window.removeEventListener("auxclick", o, !0);
		};
	}, [t]), /* @__PURE__ */ b(li.Provider, {
		value: t,
		children: e
	});
}
function mi(e, t, n, i, a) {
	let o = di(), c = s({
		back: i,
		dismiss: a
	});
	c.current = {
		back: i,
		dismiss: a
	}, r(() => {
		if (!t) return;
		let r = document.activeElement, i = o.history.push({
			kind: e,
			label: n,
			back: () => c.current.back(),
			dismiss: () => (c.current.dismiss ?? c.current.back)()
		});
		return () => {
			o.history.release(i);
			let e = document.activeElement;
			r?.isConnected && (!e || e === document.body) && r.focus();
		};
	}, [
		t,
		o,
		e
	]);
}
function hi(e, t, n = !0) {
	let i = di(), [a, o] = c(() => n && i.memory.has(e) ? i.memory.get(e) : t);
	return r(() => {
		i.memory.set(e, a);
	}, [
		i,
		e,
		a
	]), [a, o];
}
function gi(e, n, i, a, o = !0) {
	let c = di(), [l, u] = hi(e, a, o), d = s(l);
	d.current = l, r(() => (c.setters.set(e, u), () => {
		c.setters.get(e) === u && c.setters.delete(e);
	}), [
		c,
		e,
		u
	]);
	let f = s(i);
	f.current = i;
	let p = s(/* @__PURE__ */ new Set());
	return r(() => () => {
		o || p.current.forEach((e) => c.history.release(e));
	}, [c, o]), [
		l,
		t((t) => {
			let r = d.current;
			Object.is(r, t) || (oi(c, n, e, f.current(r), r, p.current), u(t));
		}, [
			c,
			e,
			n,
			u
		]),
		u
	];
}
var _i = {
	color: "var(--danger)",
	borderColor: "var(--danger)"
}, vi = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, yi = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function Y(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(K, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x(p, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...yi,
				...e.style
			},
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function X(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(K, {
		text: e.tooltip ?? e.label,
		children: (n) => /* @__PURE__ */ b(p, {
			type: "button",
			"aria-label": e.label,
			"aria-describedby": e.tooltip && e.tooltip !== e.label ? n : void 0,
			onClick: e.onClick,
			disabled: e.disabled,
			style: {
				...yi,
				padding: "4px 6px",
				...e.style
			},
			children: /* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			})
		})
	});
}
var bi = e(async () => !1), xi = () => n(bi);
function Si({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return mi("confirm", n !== null, "Cancel", () => l(!1)), r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ x(bi.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ x("div", {
			className: "fixed inset-0",
			style: {
				zIndex: 70,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ b("div", {
				"aria-hidden": "true",
				className: "absolute inset-0",
				onClick: () => l(!1),
				style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
			}), /* @__PURE__ */ x("div", {
				role: "alertdialog",
				"aria-modal": "true",
				"aria-labelledby": "avoozl-confirm-title",
				"aria-describedby": "avoozl-confirm-body",
				"data-confirm-dialog": !0,
				className: "relative rounded-lg border p-4 shadow-lg",
				style: {
					width: "min(28rem, 92vw)",
					background: "var(--card, var(--bg))",
					color: "var(--text)",
					borderColor: "var(--border)"
				},
				children: [
					/* @__PURE__ */ b("h3", {
						id: "avoozl-confirm-title",
						className: "text-base font-semibold",
						children: n.title
					}),
					/* @__PURE__ */ b("p", {
						id: "avoozl-confirm-body",
						className: "mt-2 text-sm text-muted",
						children: n.body
					}),
					/* @__PURE__ */ x("div", {
						className: "mt-4 flex justify-end gap-2",
						children: [/* @__PURE__ */ b(p, {
							ref: a,
							type: "button",
							onClick: () => l(!1),
							children: "Cancel"
						}), /* @__PURE__ */ b(p, {
							type: "button",
							"data-danger": !0,
							onClick: () => l(!0),
							style: vi,
							children: n.action
						})]
					})
				]
			})]
		})]
	});
}
function Ci(e) {
	let t = xi(), n = e.icon;
	return /* @__PURE__ */ b(K, {
		text: e.tooltip ?? e.label,
		children: (r) => /* @__PURE__ */ x(p, {
			type: "button",
			"data-danger": !0,
			"aria-label": e.label,
			"aria-describedby": e.tooltip ? r : void 0,
			disabled: e.disabled,
			onClick: () => void t(e.confirm).then((t) => t && e.onConfirm()),
			style: {
				...yi,
				..._i
			},
			children: [n && /* @__PURE__ */ b(n, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function wi(e, t) {
	if (e.open) for (let n of t) n !== e && n.open && (n.open = !1);
}
function Ti(e) {
	let [t, n] = c(e.open ?? !1), { group: r } = e;
	return /* @__PURE__ */ x("details", {
		open: t,
		name: r,
		onToggle: (t) => {
			let i = t.currentTarget;
			n(i.open), e.onToggle?.(i.open), r && wi(i, i.ownerDocument.querySelectorAll(`details[data-fold-group="${CSS.escape(r)}"]`));
		},
		className: "border-t",
		style: { borderColor: "var(--border)" },
		"data-fold": e.id,
		"data-fold-group": r,
		children: [/* @__PURE__ */ x("summary", {
			className: "flex items-center gap-2 py-2 text-sm font-semibold",
			style: {
				cursor: "pointer",
				listStyle: "none"
			},
			children: [/* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					display: "inline-flex",
					transform: t ? "rotate(90deg)" : "none",
					transition: "transform 120ms"
				},
				children: /* @__PURE__ */ b(N, { size: 14 })
			}), e.title]
		}), /* @__PURE__ */ b("div", {
			className: "pb-3",
			children: e.children
		})]
	});
}
function Ei(e) {
	let t = e.cards.filter((e) => !e.disabled);
	return /* @__PURE__ */ b("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "grid gap-2",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" },
		children: e.cards.map((n) => {
			let r = n.key === e.value, i = n.icon;
			return /* @__PURE__ */ x("div", {
				id: `${e.id}-${n.key}`,
				role: "radio",
				"aria-checked": r,
				"aria-disabled": n.disabled ? !0 : void 0,
				tabIndex: r ? 0 : -1,
				"data-choice": n.key,
				onClick: () => !n.disabled && e.onChange(n.key),
				onKeyDown: (r) => {
					let i = t.indexOf(n), a = r.key === "ArrowRight" || r.key === "ArrowDown" ? t[(i + 1) % t.length] : r.key === "ArrowLeft" || r.key === "ArrowUp" ? t[(i - 1 + t.length) % t.length] : r.key === " " || r.key === "Enter" ? n : null;
					a && !a.disabled && (r.preventDefault(), e.onChange(a.key), document.getElementById(`${e.id}-${a.key}`)?.focus());
				},
				className: "flex flex-col gap-1 rounded-lg",
				style: {
					cursor: n.disabled ? "not-allowed" : "pointer",
					opacity: n.disabled ? .6 : 1,
					border: `${r ? 2 : 1}px solid ${r ? "var(--accent)" : "var(--border)"}`,
					padding: r ? 9 : 10,
					background: r ? "color-mix(in srgb, var(--accent) 5%, var(--card))" : "var(--card)"
				},
				children: [
					/* @__PURE__ */ x("span", {
						className: "flex items-center gap-1.5 text-sm font-semibold",
						children: [i && /* @__PURE__ */ b(i, {
							size: 14,
							"aria-hidden": "true",
							style: { color: "var(--muted)" }
						}), n.title]
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs",
						children: n.line
					}),
					n.when && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["Use it when ", n.when]
					}),
					n.disabled && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: n.disabled
					})
				]
			}, n.key);
		})
	});
}
function Di(e) {
	let n = l(), r = o(() => Jr(n), [n]), { openChat: i } = u(), [a, s] = c(null);
	return {
		ask: t(async (t) => {
			if (e) {
				s(null);
				try {
					let { message: n } = await r.context(e, t);
					i({
						message: n,
						autoSend: !0
					});
				} catch (e) {
					s(J(e));
				}
			}
		}, [
			r,
			i,
			e
		]),
		error: a
	};
}
function Oi(e) {
	let [t, n] = c({
		reset: e,
		pages: {}
	}), r = t.reset === e ? t.pages : {}, i = (e, t) => Yr(r[e] ?? 1, t);
	return {
		take: (e, t) => t.slice(0, i(e, t.length)),
		more: (t, a) => ({
			left: a - i(t, a),
			onMore: () => n({
				reset: e,
				pages: {
					...r,
					[t]: (r[t] ?? 1) + 1
				}
			})
		})
	};
}
function ki(e) {
	return e.left <= 0 ? null : /* @__PURE__ */ b("button", {
		type: "button",
		className: "mt-2 text-xs underline",
		onClick: e.onMore,
		"data-show-more": !0,
		children: Xr(e.left)
	});
}
function Ai({ tooltip: e, ...t }) {
	return /* @__PURE__ */ b(K, {
		text: e,
		children: (e) => /* @__PURE__ */ b(p, {
			...t,
			"aria-describedby": e
		})
	});
}
var ji = {
	2: "text-lg",
	3: "text-base",
	4: "text-sm"
};
function Z(e) {
	let t = e.level ?? 3, n = `h${t}`, r = e.view ? Kr[e.view] : e.icon;
	return /* @__PURE__ */ x("div", {
		className: e.className,
		"data-section-heading": t,
		children: [/* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-x-3 gap-y-2",
			children: [/* @__PURE__ */ x("div", {
				className: "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
				"data-heading-title": !0,
				children: [/* @__PURE__ */ x(n, {
					id: e.id,
					className: `m-0 flex min-w-0 items-center gap-2 font-semibold leading-snug ${ji[t]}`,
					style: { overflowWrap: "anywhere" },
					children: [r && /* @__PURE__ */ b(r, {
						size: t === 2 ? 18 : 16,
						"aria-hidden": "true",
						style: {
							color: "var(--muted)",
							flexShrink: 0
						}
					}), e.title]
				}), e.meta]
			}), e.actions && /* @__PURE__ */ b("div", {
				className: "ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2",
				style: e.wideActions ? { width: "100%" } : void 0,
				"data-heading-actions": !0,
				children: e.actions
			})]
		}), e.blurb && /* @__PURE__ */ b("p", {
			className: "mt-0.5 text-xs text-muted",
			"data-blurb": !0,
			children: e.blurb
		})]
	});
}
function Mi(e) {
	return /* @__PURE__ */ b(Z, {
		level: 2,
		id: e.id,
		view: e.view,
		title: e.children,
		meta: e.meta,
		actions: e.actions,
		wideActions: e.wideActions
	});
}
function Ni(e) {
	let t = Kr[e.view];
	return /* @__PURE__ */ x("span", {
		className: "inline-flex items-center gap-1.5",
		children: [/* @__PURE__ */ b(t, {
			size: 14,
			"aria-hidden": "true",
			style: { flexShrink: 0 }
		}), e.children]
	});
}
// kirocrew-app/ui/src/DeliveryDetails.tsx
function Pi({ text: e }) {
	let t = Jt(e);
	return t ? /* @__PURE__ */ b("a", {
		href: t,
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		children: e
	}) : /* @__PURE__ */ b("code", {
		className: "break-all",
		children: e
	});
}
function Fi({ label: e, records: t }) {
	return t.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [/* @__PURE__ */ b("span", {
			className: "font-medium",
			children: e
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-1",
			children: t.map((e, t) => /* @__PURE__ */ b("li", {
				className: "text-muted",
				children: $t(e).map(([e, t]) => `${e}: ${t}`).join(" · ")
			}, t))
		})]
	}) : null;
}
function Ii({ rounds: e }) {
	return e.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [/* @__PURE__ */ b("span", {
			className: "font-medium",
			children: "Review rounds"
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-2",
			children: e.map((e, t) => /* @__PURE__ */ x("li", { children: [
				/* @__PURE__ */ b("code", { children: e.commit?.slice(0, 12) ?? "unknown commit" }),
				e.current ? " (current)" : " (stale)",
				/* @__PURE__ */ b("ul", {
					className: "ml-3 mt-1 flex flex-col gap-1",
					children: e.verdicts.map((e) => /* @__PURE__ */ x("li", { children: [
						e.link ? /* @__PURE__ */ b("a", {
							href: e.link,
							className: "underline",
							children: Zt(e)
						}) : Zt(e),
						e.cause && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · ", e.cause]
						}),
						e.findings.length > 0 && /* @__PURE__ */ b("ul", {
							className: "ml-3 mt-1 flex flex-col gap-1",
							children: e.findings.map((e) => /* @__PURE__ */ x("li", { children: [
								/* @__PURE__ */ b(q, {
									variant: e.state === "open" ? "danger" : "success",
									children: e.state
								}),
								" ",
								/* @__PURE__ */ b("code", { children: e.ref }),
								" ",
								e.kind,
								" · ",
								e.paths.join(", "),
								":",
								" ",
								/* @__PURE__ */ b("span", {
									className: "text-muted",
									children: e.text
								})
							] }, e.ref))
						})
					] }, `${e.role}-${e.attempt}`))
				})
			] }, `${e.commit}-${t}`))
		})]
	}) : null;
}
function Li({ reviews: e }) {
	let t = Jt(e.pullRequest), n = `PR ${e.pullRequestNumber ? `#${e.pullRequestNumber}` : ""}`;
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "GitHub reviews"
			}),
			" ",
			/* @__PURE__ */ b(q, {
				variant: e.state === "approved" ? "success" : e.state === "pending" ? "info" : "danger",
				children: e.state
			}),
			" ",
			e.approvals,
			" of ",
			e.needed,
			" approvals on ",
			/* @__PURE__ */ b("code", { children: e.headSha?.slice(0, 12) ?? "unknown head" }),
			" · ",
			t ? /* @__PURE__ */ b("a", {
				href: t,
				target: "_blank",
				rel: "noreferrer",
				className: "underline",
				children: n
			}) : n,
			e.held && /* @__PURE__ */ b("span", {
				className: "text-danger",
				children: " · holding dependents"
			}),
			e.reviews.length > 0 && /* @__PURE__ */ b("ul", {
				className: "ml-3 mt-1 flex flex-col gap-1",
				children: e.reviews.map((e) => /* @__PURE__ */ b("li", {
					className: e.allowed && !e.stale ? "" : "text-muted",
					children: Qt(e)
				}, e.reviewer))
			})
		]
	});
}
function Ri({ feedback: e }) {
	let t = Jt(e.pullRequest);
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "PR feedback"
			}),
			" ",
			Gt(e),
			e.session && /* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" · ", e.session]
			}),
			t && /* @__PURE__ */ x(y, { children: [" · ", /* @__PURE__ */ b("a", {
				href: t,
				target: "_blank",
				rel: "noreferrer",
				className: "underline",
				children: "PR"
			})] }),
			e.error && /* @__PURE__ */ x("p", {
				className: "text-danger",
				children: ["Last read failed: ", e.error]
			}),
			e.notRelayed > 0 && /* @__PURE__ */ x("p", {
				className: "text-muted",
				children: [
					e.notRelayed,
					" not sent, from people the policy does not allow:",
					" ",
					e.notRelayedLinks.map((e, t) => {
						let n = Jt(e.url);
						return /* @__PURE__ */ x("span", { children: [t > 0 && ", ", n ? /* @__PURE__ */ b("a", {
							href: n,
							target: "_blank",
							rel: "noreferrer",
							className: "underline",
							children: e.login
						}) : e.login] }, t);
					})
				]
			})
		]
	});
}
function zi({ item: e, onSupersede: t }) {
	let [n, r] = c(!1), [i, a] = c({
		id: "",
		title: e.title
	}), [o, s] = c(!1), [l, u] = c(null);
	if (!n) return /* @__PURE__ */ b("div", {
		className: "mt-2",
		children: /* @__PURE__ */ b(Ai, {
			tooltip: "Replace this task with a new one. Cannot be undone here.",
			onClick: () => r(!0),
			children: "Supersede"
		})
	});
	let d = async () => {
		s(!0), u(null);
		try {
			await t(e.id, nn(i)), r(!1);
		} catch (e) {
			u(J(e));
		} finally {
			s(!1);
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-1.5 text-sm",
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: `supersede-id-${e.id}`,
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("span", { children: "New task ID (blank picks one)" }), /* @__PURE__ */ b(g, {
					id: `supersede-id-${e.id}`,
					value: i.id,
					onChange: (e) => a({
						...i,
						id: e.target.value
					})
				})]
			}),
			/* @__PURE__ */ x("label", {
				htmlFor: `supersede-title-${e.id}`,
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("span", { children: "New task title" }), /* @__PURE__ */ b(g, {
					id: `supersede-title-${e.id}`,
					value: i.title,
					onChange: (e) => a({
						...i,
						title: e.target.value
					})
				})]
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [e.id, " becomes superseded. Tasks that wait on it wait on the new task. Its history stays, and a running session is left alone."]
			}),
			l && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-danger",
				children: l
			}),
			/* @__PURE__ */ x("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ b(Ci, {
					disabled: o,
					confirm: {
						title: `Supersede ${e.id}?`,
						body: `${e.id} is marked superseded and a new task replaces it. Everything that waits on ${e.id} waits on the new task instead. This cannot be undone here.`,
						action: "Supersede"
					},
					onConfirm: () => void d(),
					children: "Create replacement"
				}), /* @__PURE__ */ b(p, {
					onClick: () => r(!1),
					disabled: o,
					children: "Cancel"
				})]
			})
		]
	});
}
function Bi(e) {
	return (e.rounds ?? []).filter((e) => e.current).flatMap((e) => e.verdicts.flatMap((e) => e.findings.filter((e) => e.state === "open")));
}
function Vi({ item: e, busy: t, onRetry: n }) {
	let r = Bi(e), [i, a] = c(/* @__PURE__ */ new Set()), [o, s] = c("");
	return r.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-1.5 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "Dismiss findings, then retry"
			}),
			r.map((e) => /* @__PURE__ */ x("label", {
				className: "flex items-start gap-1.5",
				children: [/* @__PURE__ */ b("input", {
					type: "checkbox",
					checked: i.has(e.ref),
					onChange: (t) => {
						let n = new Set(i);
						t.target.checked ? n.add(e.ref) : n.delete(e.ref), a(n);
					}
				}), /* @__PURE__ */ x("span", { children: [
					/* @__PURE__ */ b("code", { children: e.ref }),
					" ",
					e.kind,
					": ",
					/* @__PURE__ */ b("span", {
						className: "text-muted",
						children: e.text
					})
				] })]
			}, e.ref)),
			/* @__PURE__ */ x("label", {
				htmlFor: `dismiss-${e.id}`,
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("span", { children: "Why they do not apply" }), /* @__PURE__ */ b(g, {
					id: `dismiss-${e.id}`,
					value: o,
					onChange: (e) => s(e.target.value)
				})]
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(Ci, {
				disabled: t || !i.size || !o.trim(),
				confirm: {
					title: `Dismiss ${i.size} ${i.size === 1 ? "finding" : "findings"} and retry?`,
					body: "The dismissed findings no longer block this delivery, with your reason recorded. A new attempt starts.",
					action: "Dismiss and retry"
				},
				onConfirm: () => n([...i].map((e) => ({
					finding: e,
					reason: o.trim()
				}))),
				children: [
					"Dismiss ",
					i.size || "",
					" and retry"
				]
			}) })
		]
	}) : null;
}
function Hi({ item: e, onSupersede: t }) {
	return /* @__PURE__ */ x("div", {
		className: "mt-2 border-t pt-2",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ b(q, {
					variant: e.complete ? "success" : "info",
					children: e.status ?? "no status"
				}), e.repository && /* @__PURE__ */ b(q, { children: e.repository })]
			}),
			(e.supersedes || e.supersededBy) && /* @__PURE__ */ x("p", {
				className: "mt-1 text-xs text-muted",
				children: [e.supersedes && `Replaces ${e.supersedes}. `, e.supersededBy && `Superseded by ${e.supersededBy}.`]
			}),
			e.runs.length > 0 && /* @__PURE__ */ x("p", {
				className: "mt-2 text-xs text-muted",
				children: ["Runs: ", e.runs.map((e) => `${e.id} (${e.state})`).join(", ")]
			}),
			e.integration && /* @__PURE__ */ x("p", {
				className: "mt-2 text-xs",
				children: [
					"Integrated ",
					/* @__PURE__ */ b("code", { children: e.integration.commit?.slice(0, 12) ?? "unknown commit" }),
					e.integration.branch ? ` on ${e.integration.branch}` : ""
				]
			}),
			e.pullRequests.length > 0 && /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-xs",
				children: e.pullRequests.map((e, t) => {
					let n = Jt(e.url), r = `PR ${e.number ? `#${e.number}` : ""}${e.merged ? " (merged)" : ""}`;
					return /* @__PURE__ */ b("li", { children: n ? /* @__PURE__ */ b("a", {
						href: n,
						target: "_blank",
						rel: "noreferrer",
						className: "underline",
						children: r
					}) : r }, t);
				})
			}),
			e.githubReviews && /* @__PURE__ */ b(Li, { reviews: e.githubReviews }),
			e.prFeedback && /* @__PURE__ */ b(Ri, { feedback: e.prFeedback }),
			e.evidence.length > 0 && /* @__PURE__ */ x("div", {
				className: "mt-2 text-xs",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: "Evidence"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: e.evidence.map((e, t) => /* @__PURE__ */ x("li", { children: [
						e.text ? /* @__PURE__ */ b(Pi, { text: e.text }) : e.kind ?? "record",
						e.exitCode !== void 0 && e.exitCode !== null && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · exit ", e.exitCode]
						}),
						e.commit && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · ", e.commit.slice(0, 12)]
						})
					] }, e.id ?? t))
				})]
			}),
			e.project && /* @__PURE__ */ x("div", {
				className: "mt-2 text-xs",
				children: [
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: "Project"
					}),
					/* @__PURE__ */ b("p", {
						className: "text-muted",
						children: [
							e.project.status && `Status ${e.project.status}`,
							e.project.release && `Release ${e.project.release}`,
							e.project.wave !== null && `Wave ${e.project.wave}`
						].filter(Boolean).join(" · ")
					}),
					e.project.notes.map((e, t) => /* @__PURE__ */ b("p", { children: e }, t))
				]
			}),
			/* @__PURE__ */ b(Ii, { rounds: e.rounds ?? [] }),
			/* @__PURE__ */ b(Fi, {
				label: "Deliveries",
				records: e.deliveries
			}),
			/* @__PURE__ */ b(Fi, {
				label: "Worktrees",
				records: e.worktrees
			}),
			tn(e) && /* @__PURE__ */ b(zi, {
				item: e,
				onSupersede: t
			})
		]
	});
}
// kirocrew-app/ui/src/conflicts-api.ts
function Ui(e) {
	let t = (e.authority ?? "local") === "local";
	return e.kind === "stale-session" && e.slot ? "dismiss" : e.kind === "review" ? qi(e).length ? "reviewed" : null : !t || e.kind === "needs-human" && e.reason === "hand-set-review" ? null : e.kind === "needs-human" ? e.reason === "blocked" ? "unblock" : "reviewed" : e.kind === "decision" ? "settle" : null;
}
var Wi = {
	reviewed: "Mark reviewed",
	unblock: "Unblock",
	dismiss: "Dismiss",
	settle: "Settle"
}, Gi = {
	reviewed: "Count it as reviewed so it may start. Undo by editing it.",
	unblock: "Return it to planned so it may start when ready.",
	dismiss: "Remove the ended session from this list. Its chat is kept.",
	settle: "Clear the decision and note your answer on the task."
}, Ki = (e) => `${e.kind ?? ""}:${e.taskId ?? ""}:${e.field ?? ""}:${e.slot ?? ""}${e.id ? `:${e.id}` : ""}`, qi = (e) => (e.tasks ?? []).filter((e) => (e.authority ?? "local") === "local").map((e) => ({ taskId: e.id })), Ji = (e) => e.kind === "review" ? qi(e) : [e.slot ? {
	taskId: e.taskId,
	slot: e.slot
} : { taskId: e.taskId }], Yi = (e) => e.reduce((e, t) => e + Ji(t).length, 0);
function Xi(e, t, n) {
	let r = new Set(n.settled.map((e) => `${e.taskId}\u0000${e.slot ?? ""}`)), i = (e) => r.has(`${e}\u0000`);
	return e.flatMap((e) => {
		if (Ui(e) !== t) return [e];
		if (e.kind === "review") {
			let t = (e.tasks ?? []).filter((e) => !i(e.id));
			return t.length === (e.tasks ?? []).length ? [e] : t.length ? [Zi(e, t)] : [];
		}
		return r.has(`${e.taskId}\u0000${t === "dismiss" ? e.slot ?? "" : ""}`) ? [] : [e];
	});
}
function Zi(e, t) {
	let n = t.length;
	return {
		...e,
		tasks: t,
		title: `Review ${n} ${n === 1 ? "task" : "tasks"} in ${e.plan ?? "this plan"}: their design text changed`
	};
}
function Qi(e, t) {
	let n = t.settled.length, r = [n ? `${Wi[e]}: ${n} done.` : ""];
	return t.refused.length && r.push(`Refused ${t.refused.length}: ${t.refused.map((e) => `${e.taskId} (${e.reason})`).join("; ")}`), {
		ok: t.refused.length === 0,
		text: r.filter(Boolean).join(" ")
	};
}
function $i(e) {
	return e.kind === "github-conflict" && !e.choices?.length ? e.field === "identity" ? "Two issues claim this task. Close or merge the duplicate issue on GitHub; Avoozl reads the result on its next tick." : e.field === "Avoozl state" ? "Avoozl fills Avoozl state and already wrote its value back. Move the card’s Status instead. This clears when the task’s state next changes." : "GitHub owns the issue state. Reopen or close it on GitHub; Avoozl reads the result on its next tick." : e.kind === "resource" ? "Two active runs share a resource. Stop one run, or wait for one to finish." : e.kind === "tracker-conflict" ? "The tracker record owns this field. Change it there or in the plan." : e.kind === "content-unavailable" ? "Add or fix this rule set’s terms file or plugin on this machine. Avoozl checks again on the next tick." : e.kind === "content-match" ? null : e.kind === "needs-human" && e.reason === "hand-set-review" ? "Discuss it, mark it done, or move it back to planned from the task." : e.kind === "review" && Ui(e) === null ? "GitHub or a plugin owns these tasks. Review them where they live." : Ui(e) === null && e.kind !== "github-conflict" ? `${e.authority} owns this task. Settle it where it lives.` : null;
}
var ea = [
	{
		key: "all",
		label: "All",
		keep: () => !0
	},
	{
		key: "github-conflict",
		label: "GitHub edits",
		keep: (e) => e.kind === "github-conflict"
	},
	{
		key: "decision",
		label: "Decisions",
		keep: (e) => [
			"decision",
			"content-match",
			"content-unavailable"
		].includes(e.kind)
	},
	{
		key: "needs-human",
		label: "Needs you",
		keep: (e) => e.kind === "needs-human" || e.kind === "review"
	},
	{
		key: "other",
		label: "Sessions and resources",
		keep: (e) => [
			"stale-session",
			"resource",
			"tracker-conflict"
		].includes(e.kind)
	}
];
function ta(e) {
	return Object.fromEntries(ea.map((t) => [t.key, e.filter(t.keep).length]));
}
function na(e) {
	return e.kind === "github-conflict" ? `${e.changedBy ?? "Someone"} changed ${e.field ?? "a managed field"} on GitHub; Avoozl manages it. ${e.detail}` : e.kind === "needs-human" && e.reason === "crew" || e.kind === "needs-human" && e.reason === "hand-set-review" ? e.detail : e.kind === "needs-human" ? e.reason === "blocked" ? "Marked blocked: nothing starts until you unblock it." : "New or edited: it waits for your review before it can start." : e.kind === "review" ? e.detail : e.kind === "decision" ? `An open question stops this task: ${e.detail}` : e.kind === "stale-session" ? `Its chat ended before the task finished. ${e.detail}` : e.detail;
}
var ra = (e) => e.changedAt ?? e.openedAt ?? null;
function ia(e) {
	let t = new Set(e.map(Ui));
	if (t.size !== 1) return null;
	let [n] = t;
	return n && n !== "settle" ? n : null;
}
function aa(e, t, n) {
	let r = t === 1 && n ? n : `${t} ${e === "reviewed" ? "tasks" : "items"}`;
	return {
		title: `${Wi[e]}: ${r}?`,
		body: {
			reviewed: "They count as reviewed and may start when ready. To undo, edit each task again.",
			unblock: "They go back to planned and may start when ready.",
			dismiss: "The ended sessions leave the list. Their chats are not deleted.",
			settle: "The decision is cleared and your answer is noted on the task."
		}[e],
		action: Wi[e]
	};
}
function oa(e) {
	let t = /* @__PURE__ */ new Set(["closed", "lost"]), n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.sessions.filter((e) => !t.has(e.status ?? "")).sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
		e[0] && n.set(r.id, Fn(e[0]));
	}
	return n;
}
var sa = 864e5, ca = [
	{
		value: "1d",
		label: "Older than a day",
		ms: sa
	},
	{
		value: "7d",
		label: "Older than a week",
		ms: 7 * sa
	},
	{
		value: "30d",
		label: "Older than 30 days",
		ms: 30 * sa
	}
], la = (e) => e.taskId ?? e.tasks?.[0]?.id ?? null, ua = (e, t) => e.issue?.repository ?? t?.repository ?? null;
function da(e, t, n, r) {
	let i = t.q?.trim().toLowerCase() ?? "", a = ea.find((e) => e.key === t.kind), o = ca.find((e) => e.value === t.age), s = ra(e), c = ua(e, n);
	return (!i || e.title.toLowerCase().includes(i) || (e.taskId ?? "").toLowerCase().includes(i) || e.detail.toLowerCase().includes(i)) && (!a || a.keep(e)) && (!t.plan || (n ? fr(n) : null) === t.plan) && (!t.epic || n?.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !c : c === t.repository)) && (!o || s !== null && r - Date.parse(s) > o.ms) && (!t.changedBy || e.changedBy === t.changedBy);
}
function fa(e, t) {
	let n = new Map((t?.tasks ?? []).map((e) => [e.id, e])), r = new Map((t?.epics ?? []).map((e) => [e.id, e.title])), i = ta(e), a = (t, n = (e) => e) => {
		let r = /* @__PURE__ */ new Set();
		for (let n of e) {
			let e = t(n);
			e && r.add(e);
		}
		return [...r].map((e) => ({
			value: e,
			label: n(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, o = (e) => n.get(la(e) ?? "");
	return {
		kinds: ea.filter((e) => e.key !== "all").map((e) => ({
			value: e.key,
			label: `${e.label} (${i[e.key]})`
		})),
		plans: a((e) => {
			let t = o(e);
			return t ? fr(t) : null;
		}, (e) => e.replace(/^(spec|plan):/, "")),
		epics: a((e) => o(e)?.epic, (e) => r.get(e) ?? e),
		repositories: [...a((e) => ua(e, o(e))), ...e.some((e) => !ua(e, o(e))) ? [{
			value: dr,
			label: "No repository"
		}] : []],
		ages: ca.map(({ value: e, label: t }) => ({
			value: e,
			label: t
		})),
		changedBy: a((e) => e.changedBy)
	};
}
var pa = "avoozl-conflict-filter", ma = (e) => `avoozl.conflict-filters.${e}`, ha = [
	"q",
	"kind",
	"plan",
	"epic",
	"repository",
	"age",
	"changedBy"
];
function ga(e, t) {
	try {
		let n = JSON.parse(e?.getItem(ma(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of ha) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		return r.kind && !ea.some((e) => e.key === r.kind && e.key !== "all") && delete r.kind, r.age && !ca.some((e) => e.value === r.age) && delete r.age, r;
	} catch {
		return {};
	}
}
function _a(e, t, n) {
	try {
		e?.setItem(ma(t), JSON.stringify(n));
	} catch {}
}
var va = (e) => ha.some((t) => !!e[t]?.trim());
// kirocrew-app/ui/src/useRead.ts
function ya(e, n) {
	let [i, a] = c(null), [o, s] = c(null), [l, u] = c(!1), d = t(async () => {
		if (e) {
			u(!0), s(null);
			try {
				a(await n(e));
			} catch (e) {
				s(J(e));
			} finally {
				u(!1);
			}
		}
	}, [e, n]);
	return r(() => {
		a(null), d();
	}, [d]), {
		value: i,
		error: o,
		busy: l,
		reload: d
	};
}
// kirocrew-app/ui/src/Authority.tsx
function ba({ owner: e }) {
	if (!e.authority) return null;
	if (e.authority !== "github") return /* @__PURE__ */ b(q, { children: e.authority });
	if (!e.issue) return /* @__PURE__ */ b(q, { children: "pending projection" });
	let t = Jt(e.issue.url), n = e.issue.number ? `#${e.issue.number}` : "GitHub";
	return t ? /* @__PURE__ */ b("a", {
		href: t,
		target: "_blank",
		rel: "noreferrer",
		className: "text-xs underline",
		children: n
	}) : /* @__PURE__ */ b(q, { children: n });
}
// kirocrew-app/ui/src/FilterSelect.tsx
var xa = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Sa(e) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e.id,
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: { maxWidth: "13rem" },
		children: [/* @__PURE__ */ b("span", { children: e.label }), /* @__PURE__ */ x("select", {
			id: e.id,
			value: e.value,
			onChange: (t) => e.onChange(t.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: xa,
			children: [/* @__PURE__ */ b("option", {
				value: "",
				children: "All"
			}), e.options.map((e) => /* @__PURE__ */ b("option", {
				value: e.value,
				children: e.label
			}, e.value))]
		})]
	});
}
// kirocrew-app/ui/src/FilterPanel.tsx
var Ca = {
	...xa,
	width: "4.5rem"
}, wa = (e) => {
	let t = Number(e);
	return Number.isInteger(t) && t > 0 ? t : void 0;
};
function Ta({ id: e, field: t }) {
	let n = `${e}-${t.key}`;
	return t.kind === "search" ? /* @__PURE__ */ x("label", {
		htmlFor: n,
		className: "flex flex-col gap-1 text-sm",
		children: [/* @__PURE__ */ b("span", { children: t.label }), /* @__PURE__ */ b("input", {
			id: n,
			type: "search",
			value: t.value,
			placeholder: t.placeholder,
			onChange: (e) => t.onChange(e.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: xa
		})]
	}) : t.kind === "select" ? /* @__PURE__ */ b(Sa, {
		id: n,
		label: t.label,
		value: t.value,
		options: t.options,
		onChange: t.onChange
	}) : t.kind === "check" ? /* @__PURE__ */ x("label", {
		className: "flex items-center gap-1.5 pb-1 text-sm",
		children: [/* @__PURE__ */ b("input", {
			type: "checkbox",
			checked: t.checked,
			onChange: (e) => t.onChange(e.target.checked)
		}), t.label]
	}) : /* @__PURE__ */ x("fieldset", {
		className: "flex flex-col gap-1 text-sm",
		children: [/* @__PURE__ */ b("legend", {
			className: "mb-1",
			children: t.label
		}), /* @__PURE__ */ x("span", {
			className: "flex items-center gap-1",
			children: [
				/* @__PURE__ */ b("input", {
					"aria-label": `${t.label} from`,
					type: "number",
					min: 1,
					max: t.limit || void 0,
					value: t.min ?? "",
					placeholder: "1",
					onChange: (e) => t.onChange(wa(e.target.value), t.max),
					className: "rounded border px-2 py-1 text-sm",
					style: Ca
				}),
				/* @__PURE__ */ b("span", {
					className: "text-muted",
					children: "to"
				}),
				/* @__PURE__ */ b("input", {
					"aria-label": `${t.label} to`,
					type: "number",
					min: 1,
					max: t.limit || void 0,
					value: t.max ?? "",
					placeholder: String(t.limit || ""),
					onChange: (e) => t.onChange(t.min, wa(e.target.value)),
					className: "rounded border px-2 py-1 text-sm",
					style: Ca
				})
			]
		})]
	});
}
function Ea(e) {
	let t = fl("(max-width: 767px)"), [n, r] = c(!1), i = /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-end gap-3",
		"data-filter-bar": !0,
		children: [e.fields.map((t) => /* @__PURE__ */ b(Ta, {
			id: e.id,
			field: t
		}, t.key)), /* @__PURE__ */ x(Ai, {
			tooltip: "Clear every filter on this tab",
			type: "button",
			onClick: e.onClear,
			disabled: !e.active,
			style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6
			},
			children: [/* @__PURE__ */ b(Ie, {
				size: 14,
				"aria-hidden": "true"
			}), "Clear"]
		})]
	});
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b("div", {
		role: "search",
		"aria-label": e.label,
		"data-filter-panel": e.id,
		children: t ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-2",
			children: [/* @__PURE__ */ x(p, {
				onClick: () => r(!n),
				"aria-expanded": n,
				children: ["Filters", e.active ? " (on)" : ""]
			}), n && i]
		}) : i
	}), e.children && /* @__PURE__ */ b("div", {
		className: "mt-3",
		children: e.children
	})] });
}
function Da() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function Oa(e, n) {
	let { event: i, read: a, write: o, empty: s } = n, [l, u] = c(() => e ? a(Da(), e) : s);
	return r(() => {
		u(e ? a(Da(), e) : s);
		let t = () => e && u(a(Da(), e));
		return window.addEventListener(i, t), () => window.removeEventListener(i, t);
	}, [
		e,
		i,
		a,
		s
	]), [l, t((t) => {
		u(t), e && (o(Da(), e, t), window.dispatchEvent(new Event(i)));
	}, [
		e,
		i,
		o
	])];
}
function ka(e, t, n) {
	e.write(Da(), t, n), window.dispatchEvent(new Event(e.event));
}
// kirocrew-app/ui/src/ConflictsView.tsx
var Aa = {
	event: pa,
	read: ga,
	write: _a,
	empty: {}
}, ja = {
	...en,
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit"
}, Ma = {
	title: "Title",
	body: "Managed body section",
	labels: "Managed labels",
	blockers: "Blocked-by links",
	state: "Issue state",
	identity: "Issue identity"
}, Na = (e) => Array.isArray(e) ? e.length ? e.join(", ") : "none" : e || "empty";
function Pa({ item: e }) {
	if (e.expected === void 0 && e.actual === void 0) return null;
	let t = (e, t) => /* @__PURE__ */ x("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ b("div", {
			className: "text-xs text-muted",
			children: e
		}), /* @__PURE__ */ b("pre", {
			className: "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs",
			style: { borderColor: "var(--border)" },
			children: Na(t)
		})]
	});
	return /* @__PURE__ */ x("div", {
		className: "mt-2 grid gap-2",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" },
		children: [t("Avoozl expected", e.expected), t(e.changedBy ? `GitHub has (changed by ${e.changedBy})` : "GitHub has", e.actual)]
	});
}
function Fa(e) {
	let { item: t, workspaceId: n, revision: r, busy: i, run: a } = e, s = l(), u = o(() => Kt(s), [s]), d = o(() => Cn(s), [s]), [f, p] = c(""), m = Ui(t), h = Jt(t.issue?.url ?? null), _ = (i, o) => a(async () => {
		let a = await d.settle(n, i, Ji(t), r, o);
		return e.onSettled(i, a), Qi(i, a);
	}), v = $i(t);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			t.kind === "content-match" && t.id && /* @__PURE__ */ b(La, {
				id: t.id,
				readable: t.readable === !0,
				workspaceId: n,
				busy: i,
				run: a
			}),
			t.kind === "github-conflict" && (t.choices?.length ?? 0) > 0 && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(Ci, {
						icon: ke,
						tooltip: "Next tick writes Avoozl's value over the GitHub edit",
						disabled: i || t.resolution === "desired",
						confirm: {
							title: `Re-apply Avoozl's ${Ma[t.field ?? ""] ?? t.field} on ${t.taskId}?`,
							body: `The next tick writes Avoozl's value over the edit ${t.changedBy ?? "someone"} made on GitHub. Their text is lost unless they keep a copy.`,
							action: "Re-apply"
						},
						onConfirm: () => a(async () => (await u.resolveConflict(n, t.taskId, t.field, "desired"), {
							ok: !0,
							text: "Avoozl rewrites it on the next tick."
						})),
						children: "Re-apply Avoozl’s value"
					}),
					/* @__PURE__ */ b(Y, {
						icon: M,
						tooltip: "Keep GitHub's edit until the plan changes this field",
						disabled: i || t.resolution === "github",
						onClick: () => a(async () => (await u.resolveConflict(n, t.taskId, t.field, "github"), {
							ok: !0,
							text: "GitHub’s value stays until the plan changes this field."
						})),
						children: "Keep GitHub’s value"
					}),
					t.resolution && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Chosen; applied on the next tick."
					})
				]
			}),
			m === "settle" && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ x("label", {
					htmlFor: `answer-${Ki(t)}`,
					className: "flex flex-1 flex-col gap-1 text-xs",
					style: { minWidth: "16rem" },
					children: [/* @__PURE__ */ x("span", { children: [
						"Your answer to “",
						t.detail,
						"”"
					] }), /* @__PURE__ */ b(g, {
						id: `answer-${Ki(t)}`,
						value: f,
						onChange: (e) => p(e.target.value)
					})]
				}), /* @__PURE__ */ b(Ci, {
					icon: M,
					tooltip: Gi.settle,
					disabled: i || !f.trim(),
					confirm: aa("settle", 1, t.title),
					onConfirm: () => _("settle", f.trim()),
					children: "Settle"
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					m === "dismiss" && /* @__PURE__ */ b(Ci, {
						icon: Ie,
						tooltip: Gi.dismiss,
						disabled: i,
						confirm: aa("dismiss", 1, t.title),
						onConfirm: () => _("dismiss"),
						children: "Dismiss"
					}),
					t.kind === "review" && m === "reviewed" && /* @__PURE__ */ b(Ia, {
						item: t,
						busy: i,
						onConfirm: () => _("reviewed")
					}),
					m && m !== "settle" && m !== "dismiss" && t.kind !== "review" && /* @__PURE__ */ b(Y, {
						icon: M,
						tooltip: Gi[m],
						disabled: i,
						onClick: () => _(m),
						children: Wi[m]
					}),
					t.kind === "stale-session" && t.deliveryState === "decision" && /* @__PURE__ */ b(Y, {
						icon: ke,
						tooltip: "Starts a new attempt for this task's delivery.",
						disabled: i,
						onClick: () => a(async () => (await u.retry(n, t.taskId), {
							ok: !0,
							text: `Retrying ${t.taskId}.`
						})),
						children: "Retry delivery"
					}),
					t.kind === "stale-session" && t.deliveryState !== "decision" && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Avoozl starts a new attempt on its own; dismiss this once you have read it."
					}),
					t.kind === "tracker-conflict" && Jt(t.link ?? null) && /* @__PURE__ */ b("a", {
						href: Jt(t.link ?? null),
						target: "_blank",
						rel: "noreferrer",
						className: "text-sm underline",
						children: "Open in the tracker"
					}),
					h && /* @__PURE__ */ b("a", {
						href: h,
						target: "_blank",
						rel: "noreferrer",
						className: "text-sm underline",
						children: "Open the issue"
					})
				]
			}),
			v && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: v
			})
		]
	});
}
function Ia({ item: e, busy: t, onConfirm: n }) {
	let r = xi(), i = Yi([e]);
	return /* @__PURE__ */ x(Y, {
		icon: M,
		tooltip: "Count these tasks as reviewed so they may start when ready",
		disabled: t,
		onClick: () => void r(aa("reviewed", i, i === 1 ? e.tasks?.[0]?.title : void 0)).then((e) => e && n()),
		children: [
			"Mark ",
			i,
			" reviewed"
		]
	});
}
function La(e) {
	let { id: t, readable: n, workspaceId: r, busy: i, run: a } = e, s = l(), u = o(() => Kt(s), [s]), [d, f] = c(""), [p, m] = c(null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			n && /* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-2",
				children: /* @__PURE__ */ b(Y, {
					icon: H,
					tooltip: "Read the matched line again from its source. Not stored.",
					disabled: i,
					onClick: () => a(async () => {
						let e = await u.showContentLine(r, t);
						return m(e.text ?? null), e.text === null ? {
							ok: !1,
							text: e.reason ?? "The source cannot be read again."
						} : {
							ok: !0,
							text: `Line ${e.line ?? ""} read from its source. It is not stored.`
						};
					}),
					children: "Show the matched line"
				})
			}),
			p !== null && /* @__PURE__ */ b("pre", {
				className: "max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs",
				style: { borderColor: "var(--border)" },
				children: p
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ x("label", {
					htmlFor: `allow-${t}`,
					className: "flex flex-1 flex-col gap-1 text-xs",
					style: { minWidth: "16rem" },
					children: [/* @__PURE__ */ b("span", { children: "Why this exact content may go out once (required)" }), /* @__PURE__ */ b(g, {
						id: `allow-${t}`,
						value: d,
						onChange: (e) => f(e.target.value)
					})]
				}), /* @__PURE__ */ b(Ci, {
					icon: M,
					tooltip: "Let this exact content out once. It can't be taken back.",
					disabled: i || !d.trim(),
					confirm: {
						title: "Allow this content once?",
						body: "The next write of this exact content goes out, though a rule blocked it. Any change is checked again. It cannot be taken back once written.",
						action: "Allow once"
					},
					onConfirm: () => a(async () => (await u.allowContentOnce(r, t, d.trim()), {
						ok: !0,
						text: "Allowed once. The next write of this exact content passes; any change is checked again."
					})),
					children: "Allow once"
				})]
			})
		]
	});
}
function Ra({ item: e, workspaceId: t }) {
	let n = l(), i = o(() => Cn(n), [n]), [a, s] = c(null), [u, d] = c(null);
	return r(() => {
		e.taskId && i.detail(t, e.taskId).then(s, (e) => d(J(e)));
	}, [
		i,
		t,
		e.taskId
	]), /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		"data-history": !0,
		children: [
			/* @__PURE__ */ b(Pa, { item: e }),
			u && /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: u
			}),
			a && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Plan: ",
					a.plan ? `${a.plan.title} (${a.plan.approved ? "approved" : a.plan.state ?? "draft"})` : "none",
					a.task.epicTitle ? ` · Epic: ${a.task.epicTitle}` : "",
					" · State: ",
					a.task.state ?? "unknown"
				]
			}), a.timeline.length ? /* @__PURE__ */ b("ol", {
				className: "flex flex-col gap-0.5 text-xs",
				children: a.timeline.slice(0, 12).map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ b(K, {
						text: e.at,
						children: /* @__PURE__ */ b("span", {
							className: "w-20 shrink-0 text-muted",
							children: Mn(e.at)
						})
					}), /* @__PURE__ */ b("span", { children: e.text })]
				}, t))
			}) : /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Nothing recorded yet."
			})] }),
			!e.taskId && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "This item belongs to the workspace, not one task."
			})
		]
	});
}
function za(e) {
	let { item: t } = e, n = ur(), [r, i] = c(null), a = ra(t);
	return /* @__PURE__ */ x("li", {
		className: "border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		"data-conflict-row": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-x-2 gap-y-1",
				children: [
					/* @__PURE__ */ b("input", {
						type: "checkbox",
						"aria-label": `Select ${t.title}`,
						checked: e.selected,
						disabled: !e.selectable,
						onChange: (t) => e.onSelect(t.target.checked)
					}),
					/* @__PURE__ */ b(q, {
						variant: [
							"decision",
							"needs-human",
							"review",
							"content-match",
							"content-unavailable"
						].includes(t.kind) ? "warning" : "danger",
						children: ja[t.kind] ?? t.kind
					}),
					t.field && /* @__PURE__ */ b(q, { children: Ma[t.field] ?? t.field }),
					t.taskId ? /* @__PURE__ */ b("button", {
						type: "button",
						className: "font-medium underline",
						onClick: () => n.openTask(t.taskId),
						children: t.title
					}) : /* @__PURE__ */ b("span", {
						className: "font-medium",
						children: t.title
					}),
					t.taskId && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: t.taskId
					}),
					/* @__PURE__ */ b(ba, { owner: t }),
					e.plan && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["· plan ", e.plan]
					}),
					a && /* @__PURE__ */ b(K, {
						text: a,
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["· ", Mn(a)]
						})
					}),
					/* @__PURE__ */ x("span", {
						className: "ml-auto flex items-center gap-1.5",
						children: [
							e.attach && /* @__PURE__ */ x("a", {
								href: e.attach,
								className: "self-center text-sm underline",
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 4
								},
								children: [/* @__PURE__ */ b(V, {
									size: 14,
									"aria-hidden": "true"
								}), "Attach"]
							}),
							/* @__PURE__ */ b(X, {
								icon: ve,
								label: `Ask in a chat about ${t.title}`,
								tooltip: "Ask in a chat: a new chat seeded with this item's full context",
								onClick: e.onAsk
							}),
							t.kind === "review" ? /* @__PURE__ */ b(X, {
								icon: Gr,
								label: `Info: ${t.title}`,
								tooltip: "Why these tasks need review, and the list of them",
								onClick: () => n.openReview(t, e.onReviewed)
							}) : /* @__PURE__ */ b(X, {
								icon: ue,
								label: `History of ${t.title}`,
								tooltip: "History",
								onClick: () => i(r === "history" ? null : "history")
							}),
							t.taskId && /* @__PURE__ */ b(X, {
								icon: Gr,
								label: `View task ${t.taskId}`,
								tooltip: "Open this task's details in the drawer",
								onClick: () => n.openTask(t.taskId)
							}),
							/* @__PURE__ */ b(Y, {
								icon: M,
								tooltip: "Show the ways to resolve this item",
								onClick: () => i(r === "resolve" ? null : "resolve"),
								children: "Resolve"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ b("p", {
				className: "mt-0.5 text-sm text-muted",
				style: { paddingLeft: 22 },
				children: na(t)
			}),
			r === "history" && /* @__PURE__ */ b(Ra, {
				item: t,
				workspaceId: e.workspaceId
			}),
			r === "resolve" && /* @__PURE__ */ b("div", {
				className: "mt-2 rounded border p-2",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(Fa, {
					item: t,
					workspaceId: e.workspaceId,
					revision: e.revision,
					busy: e.busy,
					run: e.run,
					onSettled: e.onSettled
				})
			})
		]
	});
}
function Ba({ workspaceId: e }) {
	let n = l(), i = o(() => Kt(n), [n]), a = o(() => Cn(n), [n]), s = Di(e), u = xi(), { value: d, error: f, busy: h, reload: g } = ya(e, t(async (e) => {
		let [t, n, r] = await Promise.all([
			i.conflictsPage(e),
			i.graph(e).catch(() => null),
			i.delivery(e).catch(() => [])
		]);
		return {
			page: t,
			graph: n,
			delivery: r
		};
	}, [i])), [_, v] = Oa(e, Aa), S = JSON.stringify(_), C = Oi(S), [w, T] = c(null), [E, D] = c(0), [O, k] = c(/* @__PURE__ */ new Set()), [A, j] = c(!1), [M, N] = c(null);
	r(() => {
		T(d?.page.items ?? null), D(d?.page.revision ?? 0), k(/* @__PURE__ */ new Set());
	}, [d]);
	let P = o(() => {
		let e = d?.graph ?? null;
		return new Map((e?.tasks ?? []).map((e) => [e.id, e.spec ?? e.planId ?? (e.epic ? ct(e.epic) : null)]));
	}, [d]), F = o(() => new Map((d?.graph?.tasks ?? []).map((e) => [e.id, e])), [d]);
	r(() => k(/* @__PURE__ */ new Set()), [S]);
	let I = o(() => oa(d?.delivery ?? []), [d]), L = (e) => {
		j(!0), N(null), (async () => {
			try {
				N(await e());
			} catch (e) {
				let t = J(e);
				N({
					ok: !1,
					text: /Database changed/.test(t) ? "Something changed elsewhere. Refresh, then try again." : t
				});
			} finally {
				j(!1);
			}
		})();
	}, ee = (e, t) => {
		D(t.revision), T((n) => n && Xi(n, e, t)), k(/* @__PURE__ */ new Set());
	}, R = w ?? [], z = fa(R, d?.graph ?? null), te = Date.now(), B = R.filter((e) => da(e, _, F.get(la(e) ?? ""), te)), V = C.take("conflicts", B), H = B.filter((e) => O.has(Ki(e))), ne = V.length > 0 && V.every((e) => O.has(Ki(e))), U = H.length === B.length && B.length > 0, W = ia(H), re = (e) => {
		let t = {
			..._,
			...e
		};
		for (let e of Object.keys(t)) t[e] || delete t[e];
		v(t);
	}, ie = async () => {
		e && W && await u(aa(W, Yi(H))) && L(async () => {
			let t = await a.settle(e, W, H.flatMap(Ji), E);
			return ee(W, t), Qi(W, t);
		});
	}, ae = (e, t) => {
		let n = new Set(O);
		t ? n.add(Ki(e)) : n.delete(Ki(e)), k(n);
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-conflicts-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-conflicts-title",
				view: "conflicts",
				actions: e && /* @__PURE__ */ b(Y, {
					icon: Oe,
					onClick: () => void g(),
					disabled: h || A,
					children: "Refresh"
				}),
				children: "Conflicts"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Edits to what Avoozl manages on an issue, decisions, tasks waiting on you, and sessions that ended. Board drags are orders, not conflicts."
			}),
			(f || s.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: f ?? s.error
			}),
			M && /* @__PURE__ */ b("p", {
				role: M.ok ? "status" : "alert",
				className: `text-sm ${M.ok ? "text-muted" : "text-danger"}`,
				children: M.text
			}),
			e ? w === null ? /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: h ? "Loading…" : "Not loaded"
			}) : w.length === 0 ? /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "No open conflicts or decisions."
			}) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Ea, {
					id: "avoozl-conflicts",
					label: "Filter conflicts",
					active: va(_),
					onClear: () => v({}),
					fields: [
						{
							kind: "search",
							key: "q",
							label: "Search",
							value: _.q ?? "",
							placeholder: "Task, ID or detail",
							onChange: (e) => re({ q: e })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: _.kind ?? "",
							options: z.kinds,
							onChange: (e) => re({ kind: e })
						},
						{
							kind: "select",
							key: "plan",
							label: "Plan",
							value: _.plan ?? "",
							options: z.plans,
							onChange: (e) => re({ plan: e })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: _.epic ?? "",
							options: z.epics,
							onChange: (e) => re({ epic: e })
						},
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: _.repository ?? "",
							options: z.repositories,
							onChange: (e) => re({ repository: e })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: _.age ?? "",
							options: z.ages,
							onChange: (e) => re({ age: e })
						},
						{
							kind: "select",
							key: "changed-by",
							label: "Changed by",
							value: _.changedBy ?? "",
							options: z.changedBy,
							onChange: (e) => re({ changedBy: e })
						}
					],
					children: /* @__PURE__ */ x("p", {
						role: "status",
						className: "text-xs text-muted",
						children: [
							B.length,
							" of ",
							w.length,
							" items"
						]
					})
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2 text-sm",
					"data-bulk-bar": !0,
					children: [
						/* @__PURE__ */ x("label", {
							className: "flex items-center gap-1.5 text-xs",
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									"aria-label": `Select the ${V.length} shown`,
									checked: ne,
									onChange: (e) => {
										let t = new Set(O);
										for (let n of V) e.target.checked ? t.add(Ki(n)) : t.delete(Ki(n));
										k(t);
									}
								}),
								"Select the ",
								V.length,
								" shown"
							]
						}),
						B.length > V.length && /* @__PURE__ */ x(Ai, {
							tooltip: "Select every matching item, including ones not shown yet",
							type: "button",
							onClick: () => k(new Set(B.map(Ki))),
							disabled: U,
							children: [
								"Select all ",
								B.length,
								" matching"
							]
						}),
						/* @__PURE__ */ x("span", {
							role: "status",
							className: "text-xs text-muted",
							"data-selection": !0,
							children: [
								H.length ? `${H.length} selected${U ? `: all ${B.length} matching` : ne && H.length === V.length ? `: the ${V.length} shown` : ""}. Bulk acts on these ${H.length}. · ` : "",
								V.length,
								" shown of ",
								B.length,
								A ? " · Working…" : ""
							]
						}),
						H.length > 0 && /* @__PURE__ */ x(y, { children: [
							/* @__PURE__ */ x(Y, {
								icon: ve,
								tooltip: "Start a Kiro Crew chat seeded with the selected items",
								onClick: () => void s.ask({ items: H.map(qr) }),
								children: [
									"Ask in a chat about ",
									H.length,
									" ",
									H.length === 1 ? "item" : "items"
								]
							}),
							W ? /* @__PURE__ */ x(Ai, {
								tooltip: Gi[W],
								type: "button",
								primary: !0,
								onClick: () => void ie(),
								disabled: A,
								children: [
									Wi[W],
									" ",
									H.length
								]
							}) : /* @__PURE__ */ b("span", {
								className: "text-xs text-muted",
								children: "Bulk resolve needs items of one kind."
							}),
							/* @__PURE__ */ b(p, {
								onClick: () => k(/* @__PURE__ */ new Set()),
								disabled: A,
								children: "Clear selection"
							})
						] })
					]
				}),
				/* @__PURE__ */ x(m, { children: [
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: V.map((t) => /* @__PURE__ */ b(za, {
							item: t,
							plan: t.taskId ? P.get(t.taskId) ?? null : null,
							onReviewed: () => void g(),
							attach: (t.kind === "stale-session" ? t.link : null) ?? (t.taskId ? I.get(t.taskId) ?? null : null),
							workspaceId: e,
							revision: E,
							busy: A,
							selectable: !0,
							selected: O.has(Ki(t)),
							onSelect: (e) => ae(t, e),
							run: L,
							onSettled: ee,
							onAsk: () => void s.ask({ items: [qr(t)] })
						}, Ki(t)))
					}),
					/* @__PURE__ */ b(ki, { ...C.more("conflicts", B.length) }),
					B.length === 0 && /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No item matches these filters."
					})
				] })
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			})
		]
	});
}
// kirocrew-app/ui/src/markdown.ts
var Va = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
function Ha(e) {
	let t = [], n = new RegExp(Va.source, "g"), r = 0, i;
	for (; i = n.exec(e);) i.index > r && t.push({
		kind: "text",
		text: e.slice(r, i.index)
	}), i[1] ? t.push({
		kind: "code",
		text: i[1].slice(1, -1)
	}) : i[2] ? t.push({
		kind: "strong",
		children: Ha(i[2].slice(2, -2))
	}) : i[3] ? t.push({
		kind: "em",
		children: Ha(i[3].slice(1, -1))
	}) : t.push({
		kind: "link",
		href: Jt(i[6]),
		children: Ha(i[5])
	}), r = i.index + i[0].length;
	return r < e.length && t.push({
		kind: "text",
		text: e.slice(r)
	}), t;
}
var Ua = (e) => e.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((e) => e.trim()), Wa = /^\s*\|.*\|\s*$/, Ga = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, Ka = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
function qa(e) {
	let t = e.replace(/\r\n/g, "\n").split("\n"), n = [], r = [], i = 1, a = () => {
		r.length && n.push({
			kind: "paragraph",
			text: r.join(" "),
			line: i
		}), r = [];
	};
	for (let e = 0; e < t.length; e++) {
		let o = t[e], s = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(o);
		if (s) {
			a();
			let r = e + 1, i = [];
			for (e++; e < t.length && !t[e].trim().startsWith(s[1]); e++) i.push(t[e]);
			n.push({
				kind: "code",
				text: i.join("\n"),
				lang: s[2] || null,
				line: r
			});
			continue;
		}
		if (Wa.test(o) && e + 1 < t.length && Ga.test(t[e + 1])) {
			a();
			let r = e + 1, i = Ua(o), s = [];
			for (e += 2; e < t.length && Wa.test(t[e]); e++) s.push(Ua(t[e]));
			e--, n.push({
				kind: "table",
				head: i,
				rows: s,
				line: r
			});
			continue;
		}
		let c = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(o);
		if (c) {
			a(), n.push({
				kind: "heading",
				level: c[1].length,
				text: c[2],
				line: e + 1
			});
			continue;
		}
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(o)) {
			a(), n.push({
				kind: "rule",
				line: e + 1
			});
			continue;
		}
		let l = /^\s*>\s?(.*)$/.exec(o);
		if (l) {
			a();
			let t = n[n.length - 1];
			t?.kind === "quote" ? t.text += " " + l[1] : n.push({
				kind: "quote",
				text: l[1],
				line: e + 1
			});
			continue;
		}
		let u = Ka.exec(o);
		if (u) {
			a();
			let t = /\d/.test(u[2]), r = {
				text: u[4],
				checked: u[3] === void 0 ? null : u[3] !== " ",
				depth: Math.floor(u[1].replace(/\t/g, "  ").length / 2),
				line: e + 1
			}, i = n[n.length - 1];
			i?.kind === "list" && (i.ordered === t || r.depth > 0) ? i.items.push(r) : n.push({
				kind: "list",
				ordered: t,
				start: t ? Number.parseInt(u[2], 10) : 1,
				items: [r],
				line: e + 1
			});
			continue;
		}
		if (!o.trim()) {
			a();
			continue;
		}
		let d = n[n.length - 1];
		!r.length && d?.kind === "list" && /^\s+/.test(o) ? d.items[d.items.length - 1].text += " " + o.trim() : (r.length || (i = e + 1), r.push(o.trim()));
	}
	return a(), n;
}
var Ja = (e, t, n) => `${e}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section"}-${n}`;
function Ya(e, t, n = 3) {
	return qa(e).flatMap((e, r) => e.kind === "heading" && e.level <= n ? [{
		level: e.level,
		text: e.text.replace(/[*_`]/g, ""),
		id: Ja(t, e.text, r)
	}] : []);
}
// kirocrew-app/ui/src/prism/before.ts
var Xa = globalThis;
// node_modules/prismjs/components/prism-sql.js
Xa.__avoozlPrismPrevious = Xa.Prism, Xa.Prism = {
	manual: !0,
	disableWorkerMessageHandler: !0
}, (/* @__PURE__ */ Le(((e, t) => {
	var n = function(e) {
		var t = /(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i, n = 0, r = {}, i = {
			manual: e.Prism && e.Prism.manual,
			disableWorkerMessageHandler: e.Prism && e.Prism.disableWorkerMessageHandler,
			util: {
				encode: function e(t) {
					return t instanceof a ? new a(t.type, e(t.content), t.alias) : Array.isArray(t) ? t.map(e) : t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\u00a0/g, " ");
				},
				type: function(e) {
					return Object.prototype.toString.call(e).slice(8, -1);
				},
				objId: function(e) {
					return e.__id || Object.defineProperty(e, "__id", { value: ++n }), e.__id;
				},
				clone: function e(t, n) {
					n ||= {};
					var r, a;
					switch (i.util.type(t)) {
						case "Object":
							if (a = i.util.objId(t), n[a]) return n[a];
							for (var o in r = {}, n[a] = r, t) t.hasOwnProperty(o) && (r[o] = e(t[o], n));
							return r;
						case "Array": return a = i.util.objId(t), n[a] ? n[a] : (r = [], n[a] = r, t.forEach(function(t, i) {
							r[i] = e(t, n);
						}), r);
						default: return t;
					}
				},
				getLanguage: function(e) {
					for (; e;) {
						var n = t.exec(e.className);
						if (n) return n[1].toLowerCase();
						e = e.parentElement;
					}
					return "none";
				},
				setLanguage: function(e, n) {
					e.className = e.className.replace(RegExp(t, "gi"), ""), e.classList.add("language-" + n);
				},
				currentScript: function() {
					if (typeof document > "u") return null;
					if (document.currentScript && document.currentScript.tagName === "SCRIPT") return document.currentScript;
					try {
						throw Error();
					} catch (r) {
						var e = (/at [^(\r\n]*\((.*):[^:]+:[^:]+\)$/i.exec(r.stack) || [])[1];
						if (e) {
							var t = document.getElementsByTagName("script");
							for (var n in t) if (t[n].src == e) return t[n];
						}
						return null;
					}
				},
				isActive: function(e, t, n) {
					for (var r = "no-" + t; e;) {
						var i = e.classList;
						if (i.contains(t)) return !0;
						if (i.contains(r)) return !1;
						e = e.parentElement;
					}
					return !!n;
				}
			},
			languages: {
				plain: r,
				plaintext: r,
				text: r,
				txt: r,
				extend: function(e, t) {
					var n = i.util.clone(i.languages[e]);
					for (var r in t) n[r] = t[r];
					return n;
				},
				insertBefore: function(e, t, n, r) {
					r ||= i.languages;
					var a = r[e], o = {};
					for (var s in a) if (a.hasOwnProperty(s)) {
						if (s == t) for (var c in n) n.hasOwnProperty(c) && (o[c] = n[c]);
						n.hasOwnProperty(s) || (o[s] = a[s]);
					}
					var l = r[e];
					return r[e] = o, i.languages.DFS(i.languages, function(t, n) {
						n === l && t != e && (this[t] = o);
					}), o;
				},
				DFS: function e(t, n, r, a) {
					a ||= {};
					var o = i.util.objId;
					for (var s in t) if (t.hasOwnProperty(s)) {
						n.call(t, s, t[s], r || s);
						var c = t[s], l = i.util.type(c);
						l === "Object" && !a[o(c)] ? (a[o(c)] = !0, e(c, n, null, a)) : l === "Array" && !a[o(c)] && (a[o(c)] = !0, e(c, n, s, a));
					}
				}
			},
			plugins: {},
			highlightAll: function(e, t) {
				i.highlightAllUnder(document, e, t);
			},
			highlightAllUnder: function(e, t, n) {
				var r = {
					callback: n,
					container: e,
					selector: "code[class*=\"language-\"], [class*=\"language-\"] code, code[class*=\"lang-\"], [class*=\"lang-\"] code"
				};
				i.hooks.run("before-highlightall", r), r.elements = Array.prototype.slice.apply(r.container.querySelectorAll(r.selector)), i.hooks.run("before-all-elements-highlight", r);
				for (var a = 0, o; o = r.elements[a++];) i.highlightElement(o, t === !0, r.callback);
			},
			highlightElement: function(t, n, r) {
				var a = i.util.getLanguage(t), o = i.languages[a];
				i.util.setLanguage(t, a);
				var s = t.parentElement;
				s && s.nodeName.toLowerCase() === "pre" && i.util.setLanguage(s, a);
				var c = {
					element: t,
					language: a,
					grammar: o,
					code: t.textContent
				};
				function l(e) {
					c.highlightedCode = e, i.hooks.run("before-insert", c), c.element.innerHTML = c.highlightedCode, i.hooks.run("after-highlight", c), i.hooks.run("complete", c), r && r.call(c.element);
				}
				if (i.hooks.run("before-sanity-check", c), s = c.element.parentElement, s && s.nodeName.toLowerCase() === "pre" && !s.hasAttribute("tabindex") && s.setAttribute("tabindex", "0"), !c.code) i.hooks.run("complete", c), r && r.call(c.element);
				else if (i.hooks.run("before-highlight", c), !c.grammar) l(i.util.encode(c.code));
				else if (n && e.Worker) {
					var u = new Worker(i.filename);
					u.onmessage = function(e) {
						l(e.data);
					}, u.postMessage(JSON.stringify({
						language: c.language,
						code: c.code,
						immediateClose: !0
					}));
				} else l(i.highlight(c.code, c.grammar, c.language));
			},
			highlight: function(e, t, n) {
				var r = {
					code: e,
					grammar: t,
					language: n
				};
				if (i.hooks.run("before-tokenize", r), !r.grammar) throw Error("The language \"" + r.language + "\" has no grammar.");
				return r.tokens = i.tokenize(r.code, r.grammar), i.hooks.run("after-tokenize", r), a.stringify(i.util.encode(r.tokens), r.language);
			},
			tokenize: function(e, t) {
				var n = t.rest;
				if (n) {
					for (var r in n) t[r] = n[r];
					delete t.rest;
				}
				var i = new c();
				return l(i, i.head, e), s(e, i, t, i.head, 0), d(i);
			},
			hooks: {
				all: {},
				add: function(e, t) {
					var n = i.hooks.all;
					n[e] = n[e] || [], n[e].push(t);
				},
				run: function(e, t) {
					var n = i.hooks.all[e];
					if (n && n.length) for (var r = 0, a; a = n[r++];) a(t);
				}
			},
			Token: a
		};
		e.Prism = i;
		function a(e, t, n, r) {
			this.type = e, this.content = t, this.alias = n, this.length = (r || "").length | 0;
		}
		a.stringify = function e(t, n) {
			if (typeof t == "string") return t;
			if (Array.isArray(t)) {
				var r = "";
				return t.forEach(function(t) {
					r += e(t, n);
				}), r;
			}
			var a = {
				type: t.type,
				content: e(t.content, n),
				tag: "span",
				classes: ["token", t.type],
				attributes: {},
				language: n
			}, o = t.alias;
			o && (Array.isArray(o) ? Array.prototype.push.apply(a.classes, o) : a.classes.push(o)), i.hooks.run("wrap", a);
			var s = "";
			for (var c in a.attributes) s += " " + c + "=\"" + (a.attributes[c] || "").replace(/"/g, "&quot;") + "\"";
			return "<" + a.tag + " class=\"" + a.classes.join(" ") + "\"" + s + ">" + a.content + "</" + a.tag + ">";
		};
		function o(e, t, n, r) {
			e.lastIndex = t;
			var i = e.exec(n);
			if (i && r && i[1]) {
				var a = i[1].length;
				i.index += a, i[0] = i[0].slice(a);
			}
			return i;
		}
		function s(e, t, n, r, c, d) {
			for (var f in n) if (n.hasOwnProperty(f) && n[f]) {
				var p = n[f];
				p = Array.isArray(p) ? p : [p];
				for (var m = 0; m < p.length; ++m) {
					if (d && d.cause == f + "," + m) return;
					var h = p[m], g = h.inside, _ = !!h.lookbehind, v = !!h.greedy, y = h.alias;
					if (v && !h.pattern.global) {
						var b = h.pattern.toString().match(/[imsuy]*$/)[0];
						h.pattern = RegExp(h.pattern.source, b + "g");
					}
					for (var x = h.pattern || h, S = r.next, C = c; S !== t.tail && !(d && C >= d.reach); C += S.value.length, S = S.next) {
						var w = S.value;
						if (t.length > e.length) return;
						if (!(w instanceof a)) {
							var T = 1, E;
							if (v) {
								if (E = o(x, C, e, _), !E || E.index >= e.length) break;
								var D = E.index, O = E.index + E[0].length, k = C;
								for (k += S.value.length; D >= k;) S = S.next, k += S.value.length;
								if (k -= S.value.length, C = k, S.value instanceof a) continue;
								for (var A = S; A !== t.tail && (k < O || typeof A.value == "string"); A = A.next) T++, k += A.value.length;
								T--, w = e.slice(C, k), E.index -= C;
							} else if (E = o(x, 0, w, _), !E) continue;
							var D = E.index, j = E[0], M = w.slice(0, D), N = w.slice(D + j.length), P = C + w.length;
							d && P > d.reach && (d.reach = P);
							var F = S.prev;
							M && (F = l(t, F, M), C += M.length), u(t, F, T);
							var I = new a(f, g ? i.tokenize(j, g) : j, y, j);
							if (S = l(t, F, I), N && l(t, S, N), T > 1) {
								var L = {
									cause: f + "," + m,
									reach: P
								};
								s(e, t, n, S.prev, C, L), d && L.reach > d.reach && (d.reach = L.reach);
							}
						}
					}
				}
			}
		}
		function c() {
			var e = {
				value: null,
				prev: null,
				next: null
			}, t = {
				value: null,
				prev: e,
				next: null
			};
			e.next = t, this.head = e, this.tail = t, this.length = 0;
		}
		function l(e, t, n) {
			var r = t.next, i = {
				value: n,
				prev: t,
				next: r
			};
			return t.next = i, r.prev = i, e.length++, i;
		}
		function u(e, t, n) {
			for (var r = t.next, i = 0; i < n && r !== e.tail; i++) r = r.next;
			t.next = r, r.prev = t, e.length -= i;
		}
		function d(e) {
			for (var t = [], n = e.head.next; n !== e.tail;) t.push(n.value), n = n.next;
			return t;
		}
		if (!e.document) return e.addEventListener && (i.disableWorkerMessageHandler || e.addEventListener("message", function(t) {
			var n = JSON.parse(t.data), r = n.language, a = n.code, o = n.immediateClose;
			e.postMessage(i.highlight(a, i.languages[r], r)), o && e.close();
		}, !1)), i;
		var f = i.util.currentScript();
		f && (i.filename = f.src, f.hasAttribute("data-manual") && (i.manual = !0));
		function p() {
			i.manual || i.highlightAll();
		}
		if (!i.manual) {
			var m = document.readyState;
			m === "loading" || m === "interactive" && f && f.defer ? document.addEventListener("DOMContentLoaded", p) : window.requestAnimationFrame ? window.requestAnimationFrame(p) : window.setTimeout(p, 16);
		}
		return i;
	}(typeof window < "u" ? window : typeof WorkerGlobalScope < "u" && self instanceof WorkerGlobalScope ? self : {});
	t !== void 0 && t.exports && (t.exports = n), typeof global < "u" && (global.Prism = n);
})))(), Prism.languages.markup = {
	comment: {
		pattern: /<!--(?:(?!<!--)[\s\S])*?-->/,
		greedy: !0
	},
	prolog: {
		pattern: /<\?[\s\S]+?\?>/,
		greedy: !0
	},
	doctype: {
		pattern: /<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,
		greedy: !0,
		inside: {
			"internal-subset": {
				pattern: /(^[^\[]*\[)[\s\S]+(?=\]>$)/,
				lookbehind: !0,
				greedy: !0,
				inside: null
			},
			string: {
				pattern: /"[^"]*"|'[^']*'/,
				greedy: !0
			},
			punctuation: /^<!|>$|[[\]]/,
			"doctype-tag": /^DOCTYPE/i,
			name: /[^\s<>'"]+/
		}
	},
	cdata: {
		pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
		greedy: !0
	},
	tag: {
		pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
		greedy: !0,
		inside: {
			tag: {
				pattern: /^<\/?[^\s>\/]+/,
				inside: {
					punctuation: /^<\/?/,
					namespace: /^[^\s>\/:]+:/
				}
			},
			"special-attr": [],
			"attr-value": {
				pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
				inside: { punctuation: [{
					pattern: /^=/,
					alias: "attr-equals"
				}, {
					pattern: /^(\s*)["']|["']$/,
					lookbehind: !0
				}] }
			},
			punctuation: /\/?>/,
			"attr-name": {
				pattern: /[^\s>\/]+/,
				inside: { namespace: /^[^\s>\/:]+:/ }
			}
		}
	},
	entity: [{
		pattern: /&[\da-z]{1,8};/i,
		alias: "named-entity"
	}, /&#x?[\da-f]{1,8};/i]
}, Prism.languages.markup.tag.inside["attr-value"].inside.entity = Prism.languages.markup.entity, Prism.languages.markup.doctype.inside["internal-subset"].inside = Prism.languages.markup, Prism.hooks.add("wrap", function(e) {
	e.type === "entity" && (e.attributes.title = e.content.replace(/&amp;/, "&"));
}), Object.defineProperty(Prism.languages.markup.tag, "addInlined", { value: function(e, t) {
	var n = {};
	n["language-" + t] = {
		pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
		lookbehind: !0,
		inside: Prism.languages[t]
	}, n.cdata = /^<!\[CDATA\[|\]\]>$/i;
	var r = { "included-cdata": {
		pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
		inside: n
	} };
	r["language-" + t] = {
		pattern: /[\s\S]+/,
		inside: Prism.languages[t]
	};
	var i = {};
	i[e] = {
		pattern: RegExp("(<__[^>]*>)(?:<!\\[CDATA\\[(?:[^\\]]|\\](?!\\]>))*\\]\\]>|(?!<!\\[CDATA\\[)[\\s\\S])*?(?=<\\/__>)".replace(/__/g, function() {
			return e;
		}), "i"),
		lookbehind: !0,
		greedy: !0,
		inside: r
	}, Prism.languages.insertBefore("markup", "cdata", i);
} }), Object.defineProperty(Prism.languages.markup.tag, "addAttribute", { value: function(e, t) {
	Prism.languages.markup.tag.inside["special-attr"].push({
		pattern: RegExp("(^|[\"'\\s])(?:" + e + ")\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s'\">=]+(?=[\\s>]))", "i"),
		lookbehind: !0,
		inside: {
			"attr-name": /^[^\s=]+/,
			"attr-value": {
				pattern: /=[\s\S]+/,
				inside: {
					value: {
						pattern: /(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,
						lookbehind: !0,
						alias: [t, "language-" + t],
						inside: Prism.languages[t]
					},
					punctuation: [{
						pattern: /^=/,
						alias: "attr-equals"
					}, /"|'/]
				}
			}
		}
	});
} }), Prism.languages.html = Prism.languages.markup, Prism.languages.mathml = Prism.languages.markup, Prism.languages.svg = Prism.languages.markup, Prism.languages.xml = Prism.languages.extend("markup", {}), Prism.languages.ssml = Prism.languages.xml, Prism.languages.atom = Prism.languages.xml, Prism.languages.rss = Prism.languages.xml, (function(e) {
	var t = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;
	e.languages.css = {
		comment: /\/\*[\s\S]*?\*\//,
		atrule: {
			pattern: RegExp("@[\\w-](?:[^;{\\s\"']|\\s+(?!\\s)|" + t.source + ")*?(?:;|(?=\\s*\\{))"),
			inside: {
				rule: /^@[\w-]+/,
				"selector-function-argument": {
					pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
					lookbehind: !0,
					alias: "selector"
				},
				keyword: {
					pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
					lookbehind: !0
				}
			}
		},
		url: {
			pattern: RegExp("\\burl\\((?:" + t.source + "|(?:[^\\\\\\r\\n()\"']|\\\\[\\s\\S])*)\\)", "i"),
			greedy: !0,
			inside: {
				function: /^url/i,
				punctuation: /^\(|\)$/,
				string: {
					pattern: RegExp("^" + t.source + "$"),
					alias: "url"
				}
			}
		},
		selector: {
			pattern: RegExp("(^|[{}\\s])[^{}\\s](?:[^{};\"'\\s]|\\s+(?![\\s{])|" + t.source + ")*(?=\\s*\\{)"),
			lookbehind: !0
		},
		string: {
			pattern: t,
			greedy: !0
		},
		property: {
			pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
			lookbehind: !0
		},
		important: /!important\b/i,
		function: {
			pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
			lookbehind: !0
		},
		punctuation: /[(){};:,]/
	}, e.languages.css.atrule.inside.rest = e.languages.css;
	var n = e.languages.markup;
	n && (n.tag.addInlined("style", "css"), n.tag.addAttribute("style", "css"));
})(Prism), Prism.languages.clike = {
	comment: [{
		pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
		lookbehind: !0,
		greedy: !0
	}, {
		pattern: /(^|[^\\:])\/\/.*/,
		lookbehind: !0,
		greedy: !0
	}],
	string: {
		pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
		greedy: !0
	},
	"class-name": {
		pattern: /(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,
		lookbehind: !0,
		inside: { punctuation: /[.\\]/ }
	},
	keyword: /\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,
	boolean: /\b(?:false|true)\b/,
	function: /\b\w+(?=\()/,
	number: /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
	operator: /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
	punctuation: /[{}[\];(),.:]/
}, Prism.languages.javascript = Prism.languages.extend("clike", {
	"class-name": [Prism.languages.clike["class-name"], {
		pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,
		lookbehind: !0
	}],
	keyword: [{
		pattern: /((?:^|\})\s*)catch\b/,
		lookbehind: !0
	}, {
		pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
		lookbehind: !0
	}],
	function: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
	number: {
		pattern: RegExp("(^|[^\\w$])(?:NaN|Infinity|0[bB][01]+(?:_[01]+)*n?|0[oO][0-7]+(?:_[0-7]+)*n?|0[xX][\\dA-Fa-f]+(?:_[\\dA-Fa-f]+)*n?|\\d+(?:_\\d+)*n|(?:\\d+(?:_\\d+)*(?:\\.(?:\\d+(?:_\\d+)*)?)?|\\.\\d+(?:_\\d+)*)(?:[Ee][+-]?\\d+(?:_\\d+)*)?)(?![\\w$])"),
		lookbehind: !0
	},
	operator: /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/
}), Prism.languages.javascript["class-name"][0].pattern = /(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/, Prism.languages.insertBefore("javascript", "keyword", {
	regex: {
		pattern: RegExp("((?:^|[^$\\w\\xA0-\\uFFFF.\"'\\])\\s]|\\b(?:return|yield))\\s*)\\/(?:(?:\\[(?:[^\\]\\\\\\r\\n]|\\\\.)*\\]|\\\\.|[^/\\\\\\[\\r\\n])+\\/[dgimyus]{0,7}|(?:\\[(?:[^[\\]\\\\\\r\\n]|\\\\.|\\[(?:[^[\\]\\\\\\r\\n]|\\\\.|\\[(?:[^[\\]\\\\\\r\\n]|\\\\.)*\\])*\\])*\\]|\\\\.|[^/\\\\\\[\\r\\n])+\\/[dgimyus]{0,7}v[dgimyus]{0,7})(?=(?:\\s|\\/\\*(?:[^*]|\\*(?!\\/))*\\*\\/)*(?:$|[\\r\\n,.;:})\\]]|\\/\\/))"),
		lookbehind: !0,
		greedy: !0,
		inside: {
			"regex-source": {
				pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
				lookbehind: !0,
				alias: "language-regex",
				inside: Prism.languages.regex
			},
			"regex-delimiter": /^\/|\/$/,
			"regex-flags": /^[a-z]+$/
		}
	},
	"function-variable": {
		pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
		alias: "function"
	},
	parameter: [
		{
			pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
			lookbehind: !0,
			inside: Prism.languages.javascript
		},
		{
			pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
			lookbehind: !0,
			inside: Prism.languages.javascript
		},
		{
			pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
			lookbehind: !0,
			inside: Prism.languages.javascript
		},
		{
			pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,
			lookbehind: !0,
			inside: Prism.languages.javascript
		}
	],
	constant: /\b[A-Z](?:[A-Z_]|\dx?)*\b/
}), Prism.languages.insertBefore("javascript", "string", {
	hashbang: {
		pattern: /^#!.*/,
		greedy: !0,
		alias: "comment"
	},
	"template-string": {
		pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
		greedy: !0,
		inside: {
			"template-punctuation": {
				pattern: /^`|`$/,
				alias: "string"
			},
			interpolation: {
				pattern: /((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,
				lookbehind: !0,
				inside: {
					"interpolation-punctuation": {
						pattern: /^\$\{|\}$/,
						alias: "punctuation"
					},
					rest: Prism.languages.javascript
				}
			},
			string: /[\s\S]+/
		}
	},
	"string-property": {
		pattern: /((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,
		lookbehind: !0,
		greedy: !0,
		alias: "property"
	}
}), Prism.languages.insertBefore("javascript", "operator", { "literal-property": {
	pattern: /((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,
	lookbehind: !0,
	alias: "property"
} }), Prism.languages.markup && (Prism.languages.markup.tag.addInlined("script", "javascript"), Prism.languages.markup.tag.addAttribute("on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)", "javascript")), Prism.languages.js = Prism.languages.javascript, (function(e) {
	e.languages.typescript = e.languages.extend("javascript", {
		"class-name": {
			pattern: /(\b(?:class|extends|implements|instanceof|interface|new|type)\s+)(?!keyof\b)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?:\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?/,
			lookbehind: !0,
			greedy: !0,
			inside: null
		},
		builtin: /\b(?:Array|Function|Promise|any|boolean|console|never|number|string|symbol|unknown)\b/
	}), e.languages.typescript.keyword.push(/\b(?:abstract|declare|is|keyof|readonly|require)\b/, /\b(?:asserts|infer|interface|module|namespace|type)\b(?=\s*(?:[{_$a-zA-Z\xA0-\uFFFF]|$))/, /\btype\b(?=\s*(?:[\{*]|$))/), delete e.languages.typescript.parameter, delete e.languages.typescript["literal-property"];
	var t = e.languages.extend("typescript", {});
	delete t["class-name"], e.languages.typescript["class-name"].inside = t, e.languages.insertBefore("typescript", "function", {
		decorator: {
			pattern: /@[$\w\xA0-\uFFFF]+/,
			inside: {
				at: {
					pattern: /^@/,
					alias: "operator"
				},
				function: /^[\s\S]+/
			}
		},
		"generic-function": {
			pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>(?=\s*\()/,
			greedy: !0,
			inside: {
				function: /^#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*/,
				generic: {
					pattern: /<[\s\S]+/,
					alias: "class-name",
					inside: t
				}
			}
		}
	}), e.languages.ts = e.languages.typescript;
})(Prism), Prism.languages.json = {
	property: {
		pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
		lookbehind: !0,
		greedy: !0
	},
	string: {
		pattern: /(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,
		lookbehind: !0,
		greedy: !0
	},
	comment: {
		pattern: /\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/,
		greedy: !0
	},
	number: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
	punctuation: /[{}[\],]/,
	operator: /:/,
	boolean: /\b(?:false|true)\b/,
	null: {
		pattern: /\bnull\b/,
		alias: "keyword"
	}
}, Prism.languages.webmanifest = Prism.languages.json, (function(e) {
	var t = "\\b(?:BASH|BASHOPTS|BASH_ALIASES|BASH_ARGC|BASH_ARGV|BASH_CMDS|BASH_COMPLETION_COMPAT_DIR|BASH_LINENO|BASH_REMATCH|BASH_SOURCE|BASH_VERSINFO|BASH_VERSION|COLORTERM|COLUMNS|COMP_WORDBREAKS|DBUS_SESSION_BUS_ADDRESS|DEFAULTS_PATH|DESKTOP_SESSION|DIRSTACK|DISPLAY|EUID|GDMSESSION|GDM_LANG|GNOME_KEYRING_CONTROL|GNOME_KEYRING_PID|GPG_AGENT_INFO|GROUPS|HISTCONTROL|HISTFILE|HISTFILESIZE|HISTSIZE|HOME|HOSTNAME|HOSTTYPE|IFS|INSTANCE|JOB|LANG|LANGUAGE|LC_ADDRESS|LC_ALL|LC_IDENTIFICATION|LC_MEASUREMENT|LC_MONETARY|LC_NAME|LC_NUMERIC|LC_PAPER|LC_TELEPHONE|LC_TIME|LESSCLOSE|LESSOPEN|LINES|LOGNAME|LS_COLORS|MACHTYPE|MAILCHECK|MANDATORY_PATH|NO_AT_BRIDGE|OLDPWD|OPTERR|OPTIND|ORBIT_SOCKETDIR|OSTYPE|PAPERSIZE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4|PWD|RANDOM|REPLY|SECONDS|SELINUX_INIT|SESSION|SESSIONTYPE|SESSION_MANAGER|SHELL|SHELLOPTS|SHLVL|SSH_AUTH_SOCK|TERM|UID|UPSTART_EVENTS|UPSTART_INSTANCE|UPSTART_JOB|UPSTART_SESSION|USER|WINDOWID|XAUTHORITY|XDG_CONFIG_DIRS|XDG_CURRENT_DESKTOP|XDG_DATA_DIRS|XDG_GREETER_DATA_DIR|XDG_MENU_PREFIX|XDG_RUNTIME_DIR|XDG_SEAT|XDG_SEAT_PATH|XDG_SESSION_DESKTOP|XDG_SESSION_ID|XDG_SESSION_PATH|XDG_SESSION_TYPE|XDG_VTNR|XMODIFIERS)\\b", n = {
		pattern: /(^(["']?)\w+\2)[ \t]+\S.*/,
		lookbehind: !0,
		alias: "punctuation",
		inside: null
	}, r = {
		bash: n,
		environment: {
			pattern: RegExp("\\$" + t),
			alias: "constant"
		},
		variable: [
			{
				pattern: /\$?\(\([\s\S]+?\)\)/,
				greedy: !0,
				inside: {
					variable: [{
						pattern: /(^\$\(\([\s\S]+)\)\)/,
						lookbehind: !0
					}, /^\$\(\(/],
					number: /\b0x[\dA-Fa-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:[Ee]-?\d+)?/,
					operator: /--|\+\+|\*\*=?|<<=?|>>=?|&&|\|\||[=!+\-*/%<>^&|]=?|[?~:]/,
					punctuation: /\(\(?|\)\)?|,|;/
				}
			},
			{
				pattern: /\$\((?:\([^)]+\)|[^()])+\)|`[^`]+`/,
				greedy: !0,
				inside: { variable: /^\$\(|^`|\)$|`$/ }
			},
			{
				pattern: /\$\{[^}]+\}/,
				greedy: !0,
				inside: {
					operator: /:[-=?+]?|[!\/]|##?|%%?|\^\^?|,,?/,
					punctuation: /[\[\]]/,
					environment: {
						pattern: RegExp("(\\{)" + t),
						lookbehind: !0,
						alias: "constant"
					}
				}
			},
			/\$(?:\w+|[#?*!@$])/
		],
		entity: /\\(?:[abceEfnrtv\\"]|O?[0-7]{1,3}|U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2})/
	};
	e.languages.bash = {
		shebang: {
			pattern: /^#!\s*\/.*/,
			alias: "important"
		},
		comment: {
			pattern: /(^|[^"{\\$])#.*/,
			lookbehind: !0
		},
		"function-name": [{
			pattern: /(\bfunction\s+)[\w-]+(?=(?:\s*\(?:\s*\))?\s*\{)/,
			lookbehind: !0,
			alias: "function"
		}, {
			pattern: /\b[\w-]+(?=\s*\(\s*\)\s*\{)/,
			alias: "function"
		}],
		"for-or-select": {
			pattern: /(\b(?:for|select)\s+)\w+(?=\s+in\s)/,
			alias: "variable",
			lookbehind: !0
		},
		"assign-left": {
			pattern: /(^|[\s;|&]|[<>]\()\w+(?:\.\w+)*(?=\+?=)/,
			inside: { environment: {
				pattern: RegExp("(^|[\\s;|&]|[<>]\\()" + t),
				lookbehind: !0,
				alias: "constant"
			} },
			alias: "variable",
			lookbehind: !0
		},
		parameter: {
			pattern: /(^|\s)-{1,2}(?:\w+:[+-]?)?\w+(?:\.\w+)*(?=[=\s]|$)/,
			alias: "variable",
			lookbehind: !0
		},
		string: [
			{
				pattern: /((?:^|[^<])<<-?\s*)(\w+)\s[\s\S]*?(?:\r?\n|\r)\2/,
				lookbehind: !0,
				greedy: !0,
				inside: r
			},
			{
				pattern: /((?:^|[^<])<<-?\s*)(["'])(\w+)\2\s[\s\S]*?(?:\r?\n|\r)\3/,
				lookbehind: !0,
				greedy: !0,
				inside: { bash: n }
			},
			{
				pattern: /(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|\$\([^)]+\)|\$(?!\()|`[^`]+`|[^"\\`$])*"/,
				lookbehind: !0,
				greedy: !0,
				inside: r
			},
			{
				pattern: /(^|[^$\\])'[^']*'/,
				lookbehind: !0,
				greedy: !0
			},
			{
				pattern: /\$'(?:[^'\\]|\\[\s\S])*'/,
				greedy: !0,
				inside: { entity: r.entity }
			}
		],
		environment: {
			pattern: RegExp("\\$?" + t),
			alias: "constant"
		},
		variable: r.variable,
		function: {
			pattern: /(^|[\s;|&]|[<>]\()(?:add|apropos|apt|apt-cache|apt-get|aptitude|aspell|automysqlbackup|awk|basename|bash|bc|bconsole|bg|bzip2|cal|cargo|cat|cfdisk|chgrp|chkconfig|chmod|chown|chroot|cksum|clear|cmp|column|comm|composer|cp|cron|crontab|csplit|curl|cut|date|dc|dd|ddrescue|debootstrap|df|diff|diff3|dig|dir|dircolors|dirname|dirs|dmesg|docker|docker-compose|du|egrep|eject|env|ethtool|expand|expect|expr|fdformat|fdisk|fg|fgrep|file|find|fmt|fold|format|free|fsck|ftp|fuser|gawk|git|gparted|grep|groupadd|groupdel|groupmod|groups|grub-mkconfig|gzip|halt|head|hg|history|host|hostname|htop|iconv|id|ifconfig|ifdown|ifup|import|install|ip|java|jobs|join|kill|killall|less|link|ln|locate|logname|logrotate|look|lpc|lpr|lprint|lprintd|lprintq|lprm|ls|lsof|lynx|make|man|mc|mdadm|mkconfig|mkdir|mke2fs|mkfifo|mkfs|mkisofs|mknod|mkswap|mmv|more|most|mount|mtools|mtr|mutt|mv|nano|nc|netstat|nice|nl|node|nohup|notify-send|npm|nslookup|op|open|parted|passwd|paste|pathchk|ping|pkill|pnpm|podman|podman-compose|popd|pr|printcap|printenv|ps|pushd|pv|quota|quotacheck|quotactl|ram|rar|rcp|reboot|remsync|rename|renice|rev|rm|rmdir|rpm|rsync|scp|screen|sdiff|sed|sendmail|seq|service|sftp|sh|shellcheck|shuf|shutdown|sleep|slocate|sort|split|ssh|stat|strace|su|sudo|sum|suspend|swapon|sync|sysctl|tac|tail|tar|tee|time|timeout|top|touch|tr|traceroute|tsort|tty|umount|uname|unexpand|uniq|units|unrar|unshar|unzip|update-grub|uptime|useradd|userdel|usermod|users|uudecode|uuencode|v|vcpkg|vdir|vi|vim|virsh|vmstat|wait|watch|wc|wget|whereis|which|who|whoami|write|xargs|xdg-open|yarn|yes|zenity|zip|zsh|zypper)(?=$|[)\s;|&])/,
			lookbehind: !0
		},
		keyword: {
			pattern: /(^|[\s;|&]|[<>]\()(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|until|while)(?=$|[)\s;|&])/,
			lookbehind: !0
		},
		builtin: {
			pattern: /(^|[\s;|&]|[<>]\()(?:\.|:|alias|bind|break|builtin|caller|cd|command|continue|declare|echo|enable|eval|exec|exit|export|getopts|hash|help|let|local|logout|mapfile|printf|pwd|read|readarray|readonly|return|set|shift|shopt|source|test|times|trap|type|typeset|ulimit|umask|unalias|unset)(?=$|[)\s;|&])/,
			lookbehind: !0,
			alias: "class-name"
		},
		boolean: {
			pattern: /(^|[\s;|&]|[<>]\()(?:false|true)(?=$|[)\s;|&])/,
			lookbehind: !0
		},
		"file-descriptor": {
			pattern: /\B&\d\b/,
			alias: "important"
		},
		operator: {
			pattern: /\d?<>|>\||\+=|=[=~]?|!=?|<<[<-]?|[&\d]?>>|\d[<>]&?|[<>][&=]?|&[>&]?|\|[&|]?/,
			inside: { "file-descriptor": {
				pattern: /^\d/,
				alias: "important"
			} }
		},
		punctuation: /\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,
		number: {
			pattern: /(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/,
			lookbehind: !0
		}
	}, n.inside = e.languages.bash;
	for (var i = [
		"comment",
		"function-name",
		"for-or-select",
		"assign-left",
		"parameter",
		"string",
		"environment",
		"function",
		"keyword",
		"builtin",
		"boolean",
		"file-descriptor",
		"operator",
		"punctuation",
		"number"
	], a = r.variable[1].inside, o = 0; o < i.length; o++) a[i[o]] = e.languages.bash[i[o]];
	e.languages.sh = e.languages.bash, e.languages.shell = e.languages.bash;
})(Prism), Prism.languages.python = {
	comment: {
		pattern: /(^|[^\\])#.*/,
		lookbehind: !0,
		greedy: !0
	},
	"string-interpolation": {
		pattern: /(?:f|fr|rf)(?:("""|''')[\s\S]*?\1|("|')(?:\\.|(?!\2)[^\\\r\n])*\2)/i,
		greedy: !0,
		inside: {
			interpolation: {
				pattern: /((?:^|[^{])(?:\{\{)*)\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}])+\})+\})+\}/,
				lookbehind: !0,
				inside: {
					"format-spec": {
						pattern: /(:)[^:(){}]+(?=\}$)/,
						lookbehind: !0
					},
					"conversion-option": {
						pattern: /![sra](?=[:}]$)/,
						alias: "punctuation"
					},
					rest: null
				}
			},
			string: /[\s\S]+/
		}
	},
	"triple-quoted-string": {
		pattern: /(?:[rub]|br|rb)?("""|''')[\s\S]*?\1/i,
		greedy: !0,
		alias: "string"
	},
	string: {
		pattern: /(?:[rub]|br|rb)?("|')(?:\\.|(?!\1)[^\\\r\n])*\1/i,
		greedy: !0
	},
	function: {
		pattern: /((?:^|\s)def[ \t]+)[a-zA-Z_]\w*(?=\s*\()/g,
		lookbehind: !0
	},
	"class-name": {
		pattern: /(\bclass\s+)\w+/i,
		lookbehind: !0
	},
	decorator: {
		pattern: /(^[\t ]*)@\w+(?:\.\w+)*/m,
		lookbehind: !0,
		alias: ["annotation", "punctuation"],
		inside: { punctuation: /\./ }
	},
	keyword: /\b(?:_(?=\s*:)|and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,
	builtin: /\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,
	boolean: /\b(?:False|None|True)\b/,
	number: /\b0(?:b(?:_?[01])+|o(?:_?[0-7])+|x(?:_?[a-f0-9])+)\b|(?:\b\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\B\.\d+(?:_\d+)*)(?:e[+-]?\d+(?:_\d+)*)?j?(?!\w)/i,
	operator: /[-+%=]=?|!=|:=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,
	punctuation: /[{}[\];(),.:]/
}, Prism.languages.python["string-interpolation"].inside.interpolation.inside.rest = Prism.languages.python, Prism.languages.py = Prism.languages.python, (function(e) {
	for (var t = "\\/\\*(?:[^*/]|\\*(?!\\/)|\\/(?!\\*)|<self>)*\\*\\/", n = 0; n < 2; n++) t = t.replace(/<self>/g, function() {
		return t;
	});
	t = t.replace(/<self>/g, function() {
		return "[^\\s\\S]";
	}), e.languages.rust = {
		comment: [{
			pattern: RegExp("(^|[^\\\\])" + t),
			lookbehind: !0,
			greedy: !0
		}, {
			pattern: /(^|[^\\:])\/\/.*/,
			lookbehind: !0,
			greedy: !0
		}],
		string: {
			pattern: /b?"(?:\\[\s\S]|[^\\"])*"|b?r(#*)"(?:[^"]|"(?!\1))*"\1/,
			greedy: !0
		},
		char: {
			pattern: /b?'(?:\\(?:x[0-7][\da-fA-F]|u\{(?:[\da-fA-F]_*){1,6}\}|.)|[^\\\r\n\t'])'/,
			greedy: !0
		},
		attribute: {
			pattern: /#!?\[(?:[^\[\]"]|"(?:\\[\s\S]|[^\\"])*")*\]/,
			greedy: !0,
			alias: "attr-name",
			inside: { string: null }
		},
		"closure-params": {
			pattern: /([=(,:]\s*|\bmove\s*)\|[^|]*\||\|[^|]*\|(?=\s*(?:\{|->))/,
			lookbehind: !0,
			greedy: !0,
			inside: {
				"closure-punctuation": {
					pattern: /^\||\|$/,
					alias: "punctuation"
				},
				rest: null
			}
		},
		"lifetime-annotation": {
			pattern: /'\w+/,
			alias: "symbol"
		},
		"fragment-specifier": {
			pattern: /(\$\w+:)[a-z]+/,
			lookbehind: !0,
			alias: "punctuation"
		},
		variable: /\$\w+/,
		"function-definition": {
			pattern: /(\bfn\s+)\w+/,
			lookbehind: !0,
			alias: "function"
		},
		"type-definition": {
			pattern: /(\b(?:enum|struct|trait|type|union)\s+)\w+/,
			lookbehind: !0,
			alias: "class-name"
		},
		"module-declaration": [{
			pattern: /(\b(?:crate|mod)\s+)[a-z][a-z_\d]*/,
			lookbehind: !0,
			alias: "namespace"
		}, {
			pattern: /(\b(?:crate|self|super)\s*)::\s*[a-z][a-z_\d]*\b(?:\s*::(?:\s*[a-z][a-z_\d]*\s*::)*)?/,
			lookbehind: !0,
			alias: "namespace",
			inside: { punctuation: /::/ }
		}],
		keyword: [/\b(?:Self|abstract|as|async|await|become|box|break|const|continue|crate|do|dyn|else|enum|extern|final|fn|for|if|impl|in|let|loop|macro|match|mod|move|mut|override|priv|pub|ref|return|self|static|struct|super|trait|try|type|typeof|union|unsafe|unsized|use|virtual|where|while|yield)\b/, /\b(?:bool|char|f(?:32|64)|[ui](?:8|16|32|64|128|size)|str)\b/],
		function: /\b[a-z_]\w*(?=\s*(?:::\s*<|\())/,
		macro: {
			pattern: /\b\w+!/,
			alias: "property"
		},
		constant: /\b[A-Z_][A-Z_\d]+\b/,
		"class-name": /\b[A-Z]\w*\b/,
		namespace: {
			pattern: /(?:\b[a-z][a-z_\d]*\s*::\s*)*\b[a-z][a-z_\d]*\s*::(?!\s*<)/,
			inside: { punctuation: /::/ }
		},
		number: /\b(?:0x[\dA-Fa-f](?:_?[\dA-Fa-f])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|(?:(?:\d(?:_?\d)*)?\.)?\d(?:_?\d)*(?:[Ee][+-]?\d+)?)(?:_?(?:f32|f64|[iu](?:8|16|32|64|size)?))?\b/,
		boolean: /\b(?:false|true)\b/,
		punctuation: /->|\.\.=|\.{1,3}|::|[{}[\];(),:]/,
		operator: /[-+*\/%!^]=?|=[=>]?|&[&=]?|\|[|=]?|<<?=?|>>?=?|[@?]/
	}, e.languages.rust["closure-params"].inside.rest = e.languages.rust, e.languages.rust.attribute.inside.string = e.languages.rust.string;
})(Prism), Prism.languages.go = Prism.languages.extend("clike", {
	string: {
		pattern: /(^|[^\\])"(?:\\.|[^"\\\r\n])*"|`[^`]*`/,
		lookbehind: !0,
		greedy: !0
	},
	keyword: /\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go(?:to)?|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/,
	boolean: /\b(?:_|false|iota|nil|true)\b/,
	number: [
		/\b0(?:b[01_]+|o[0-7_]+)i?\b/i,
		/\b0x(?:[a-f\d_]+(?:\.[a-f\d_]*)?|\.[a-f\d_]+)(?:p[+-]?\d+(?:_\d+)*)?i?(?!\w)/i,
		/(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?[\d_]+)?i?(?!\w)/i
	],
	operator: /[*\/%^!=]=?|\+[=+]?|-[=-]?|\|[=|]?|&(?:=|&|\^=?)?|>(?:>=?|=)?|<(?:<=?|=|-)?|:=|\.\.\./,
	builtin: /\b(?:append|bool|byte|cap|close|complex|complex(?:64|128)|copy|delete|error|float(?:32|64)|u?int(?:8|16|32|64)?|imag|len|make|new|panic|print(?:ln)?|real|recover|rune|string|uintptr)\b/
}), Prism.languages.insertBefore("go", "string", { char: {
	pattern: /'(?:\\.|[^'\\\r\n]){0,10}'/,
	greedy: !0
} }), delete Prism.languages.go["class-name"], Prism.languages.c = Prism.languages.extend("clike", {
	comment: {
		pattern: /\/\/(?:[^\r\n\\]|\\(?:\r\n?|\n|(?![\r\n])))*|\/\*[\s\S]*?(?:\*\/|$)/,
		greedy: !0
	},
	string: {
		pattern: /"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"/,
		greedy: !0
	},
	"class-name": {
		pattern: /(\b(?:enum|struct)\s+(?:__attribute__\s*\(\([\s\S]*?\)\)\s*)?)\w+|\b[a-z]\w*_t\b/,
		lookbehind: !0
	},
	keyword: /\b(?:_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local|__attribute__|asm|auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|typeof|union|unsigned|void|volatile|while)\b/,
	function: /\b[a-z_]\w*(?=\s*\()/i,
	number: /(?:\b0x(?:[\da-f]+(?:\.[\da-f]*)?|\.[\da-f]+)(?:p[+-]?\d+)?|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?)[ful]{0,4}/i,
	operator: />>=?|<<=?|->|([-+&|:])\1|[?:~]|[-+*/%&|^!=<>]=?/
}), Prism.languages.insertBefore("c", "string", { char: {
	pattern: /'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n]){0,32}'/,
	greedy: !0
} }), Prism.languages.insertBefore("c", "string", { macro: {
	pattern: /(^[\t ]*)#\s*[a-z](?:[^\r\n\\/]|\/(?!\*)|\/\*(?:[^*]|\*(?!\/))*\*\/|\\(?:\r\n|[\s\S]))*/im,
	lookbehind: !0,
	greedy: !0,
	alias: "property",
	inside: {
		string: [{
			pattern: /^(#\s*include\s*)<[^>]+>/,
			lookbehind: !0
		}, Prism.languages.c.string],
		char: Prism.languages.c.char,
		comment: Prism.languages.c.comment,
		"macro-name": [{
			pattern: /(^#\s*define\s+)\w+\b(?!\()/i,
			lookbehind: !0
		}, {
			pattern: /(^#\s*define\s+)\w+\b(?=\()/i,
			lookbehind: !0,
			alias: "function"
		}],
		directive: {
			pattern: /^(#\s*)[a-z]+/,
			lookbehind: !0,
			alias: "keyword"
		},
		"directive-hash": /^#/,
		punctuation: /##|\\(?=[\r\n])/,
		expression: {
			pattern: /\S[\s\S]*/,
			inside: Prism.languages.c
		}
	}
} }), Prism.languages.insertBefore("c", "function", { constant: /\b(?:EOF|NULL|SEEK_CUR|SEEK_END|SEEK_SET|__DATE__|__FILE__|__LINE__|__TIMESTAMP__|__TIME__|__func__|stderr|stdin|stdout)\b/ }), delete Prism.languages.c.boolean, (function(e) {
	var t = /\b(?:alignas|alignof|asm|auto|bool|break|case|catch|char|char16_t|char32_t|char8_t|class|co_await|co_return|co_yield|compl|concept|const|const_cast|consteval|constexpr|constinit|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|final|float|for|friend|goto|if|import|inline|int|int16_t|int32_t|int64_t|int8_t|long|module|mutable|namespace|new|noexcept|nullptr|operator|override|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|try|typedef|typeid|typename|uint16_t|uint32_t|uint64_t|uint8_t|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b/, n = "\\b(?!<keyword>)\\w+(?:\\s*\\.\\s*\\w+)*\\b".replace(/<keyword>/g, function() {
		return t.source;
	});
	e.languages.cpp = e.languages.extend("c", {
		"class-name": [
			{
				pattern: RegExp("(\\b(?:class|concept|enum|struct|typename)\\s+)(?!<keyword>)\\w+".replace(/<keyword>/g, function() {
					return t.source;
				})),
				lookbehind: !0
			},
			/\b[A-Z]\w*(?=\s*::\s*\w+\s*\()/,
			/\b[A-Z_]\w*(?=\s*::\s*~\w+\s*\()/i,
			/\b\w+(?=\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>\s*::\s*\w+\s*\()/
		],
		keyword: t,
		number: {
			pattern: /(?:\b0b[01']+|\b0x(?:[\da-f']+(?:\.[\da-f']*)?|\.[\da-f']+)(?:p[+-]?[\d']+)?|(?:\b[\d']+(?:\.[\d']*)?|\B\.[\d']+)(?:e[+-]?[\d']+)?)[ful]{0,4}/i,
			greedy: !0
		},
		operator: />>=?|<<=?|->|--|\+\+|&&|\|\||[?:~]|<=>|[-+*/%&|^!=<>]=?|\b(?:and|and_eq|bitand|bitor|not|not_eq|or|or_eq|xor|xor_eq)\b/,
		boolean: /\b(?:false|true)\b/
	}), e.languages.insertBefore("cpp", "string", {
		module: {
			pattern: RegExp("(\\b(?:import|module)\\s+)(?:\"(?:\\\\(?:\\r\\n|[\\s\\S])|[^\"\\\\\\r\\n])*\"|<[^<>\\r\\n]*>|" + "<mod-name>(?:\\s*:\\s*<mod-name>)?|:\\s*<mod-name>".replace(/<mod-name>/g, function() {
				return n;
			}) + ")"),
			lookbehind: !0,
			greedy: !0,
			inside: {
				string: /^[<"][\s\S]+/,
				operator: /:/,
				punctuation: /\./
			}
		},
		"raw-string": {
			pattern: /R"([^()\\ ]{0,16})\([\s\S]*?\)\1"/,
			alias: "string",
			greedy: !0
		}
	}), e.languages.insertBefore("cpp", "keyword", { "generic-function": {
		pattern: /\b(?!operator\b)[a-z_]\w*\s*<(?:[^<>]|<[^<>]*>)*>(?=\s*\()/i,
		inside: {
			function: /^\w+/,
			generic: {
				pattern: /<[\s\S]+/,
				alias: "class-name",
				inside: e.languages.cpp
			}
		}
	} }), e.languages.insertBefore("cpp", "operator", { "double-colon": {
		pattern: /::/,
		alias: "punctuation"
	} }), e.languages.insertBefore("cpp", "class-name", { "base-clause": {
		pattern: /(\b(?:class|struct)\s+\w+\s*:\s*)[^;{}"'\s]+(?:\s+[^;{}"'\s]+)*(?=\s*[;{])/,
		lookbehind: !0,
		greedy: !0,
		inside: e.languages.extend("cpp", {})
	} }), e.languages.insertBefore("inside", "double-colon", { "class-name": /\b[a-z_]\w*\b(?!\s*::)/i }, e.languages.cpp["base-clause"]);
})(Prism), (function(e) {
	var t = /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|exports|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|module|native|new|non-sealed|null|open|opens|package|permits|private|protected|provides|public|record(?!\s*[(){}[\]<>=%~.:,;?+\-*/&|^])|requires|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|to|transient|transitive|try|uses|var|void|volatile|while|with|yield)\b/, n = "(?:[a-z]\\w*\\s*\\.\\s*)*(?:[A-Z]\\w*\\s*\\.\\s*)*", r = {
		pattern: RegExp("(^|[^\\w.])" + n + "[A-Z](?:[\\d_A-Z]*[a-z]\\w*)?\\b"),
		lookbehind: !0,
		inside: {
			namespace: {
				pattern: /^[a-z]\w*(?:\s*\.\s*[a-z]\w*)*(?:\s*\.)?/,
				inside: { punctuation: /\./ }
			},
			punctuation: /\./
		}
	};
	e.languages.java = e.languages.extend("clike", {
		string: {
			pattern: /(^|[^\\])"(?:\\.|[^"\\\r\n])*"/,
			lookbehind: !0,
			greedy: !0
		},
		"class-name": [
			r,
			{
				pattern: RegExp("(^|[^\\w.])" + n + "[A-Z]\\w*(?=\\s+\\w+\\s*[;,=()]|\\s*(?:\\[[\\s,]*\\]\\s*)?::\\s*new\\b)"),
				lookbehind: !0,
				inside: r.inside
			},
			{
				pattern: RegExp("(\\b(?:class|enum|extends|implements|instanceof|interface|new|record|throws)\\s+)" + n + "[A-Z]\\w*\\b"),
				lookbehind: !0,
				inside: r.inside
			}
		],
		keyword: t,
		function: [e.languages.clike.function, {
			pattern: /(::\s*)[a-z_]\w*/,
			lookbehind: !0
		}],
		number: /\b0b[01][01_]*L?\b|\b0x(?:\.[\da-f_p+-]+|[\da-f_]+(?:\.[\da-f_p+-]+)?)\b|(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?[dfl]?/i,
		operator: {
			pattern: /(^|[^.])(?:<<=?|>>>?=?|->|--|\+\+|&&|\|\||::|[?:~]|[-+*/%&|^!=<>]=?)/m,
			lookbehind: !0
		},
		constant: /\b[A-Z][A-Z_\d]+\b/
	}), e.languages.insertBefore("java", "string", {
		"triple-quoted-string": {
			pattern: /"""[ \t]*[\r\n](?:(?:"|"")?(?:\\.|[^"\\]))*"""/,
			greedy: !0,
			alias: "string"
		},
		char: {
			pattern: /'(?:\\.|[^'\\\r\n]){1,6}'/,
			greedy: !0
		}
	}), e.languages.insertBefore("java", "class-name", {
		annotation: {
			pattern: /(^|[^.])@\w+(?:\s*\.\s*\w+)*/,
			lookbehind: !0,
			alias: "punctuation"
		},
		generics: {
			pattern: /<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&))*>)*>)*>)*>/,
			inside: {
				"class-name": r,
				keyword: t,
				punctuation: /[<>(),.:]/,
				operator: /[?&|]/
			}
		},
		import: [{
			pattern: RegExp("(\\bimport\\s+)" + n + "(?:[A-Z]\\w*|\\*)(?=\\s*;)"),
			lookbehind: !0,
			inside: {
				namespace: r.inside.namespace,
				punctuation: /\./,
				operator: /\*/,
				"class-name": /\w+/
			}
		}, {
			pattern: RegExp("(\\bimport\\s+static\\s+)" + n + "(?:\\w+|\\*)(?=\\s*;)"),
			lookbehind: !0,
			alias: "static",
			inside: {
				namespace: r.inside.namespace,
				static: /\b\w+$/,
				punctuation: /\./,
				operator: /\*/,
				"class-name": /\w+/
			}
		}],
		namespace: {
			pattern: RegExp("(\\b(?:exports|import(?:\\s+static)?|module|open|opens|package|provides|requires|to|transitive|uses|with)\\s+)(?!<keyword>)[a-z]\\w*(?:\\.[a-z]\\w*)*\\.?".replace(/<keyword>/g, function() {
				return t.source;
			})),
			lookbehind: !0,
			inside: { punctuation: /\./ }
		}
	});
})(Prism), (function(e) {
	var t = /[*&][^\s[\]{},]+/, n = /!(?:<[\w\-%#;/?:@&=+$,.!~*'()[\]]+>|(?:[a-zA-Z\d-]*!)?[\w\-%#;/?:@&=+$.~*'()]+)?/, r = "(?:" + n.source + "(?:[ 	]+" + t.source + ")?|" + t.source + "(?:[ 	]+" + n.source + ")?)", i = "(?:[^\\s\\x00-\\x08\\x0e-\\x1f!\"#%&'*,\\-:>?@[\\]`{|}\\x7f-\\x84\\x86-\\x9f\\ud800-\\udfff\\ufffe\\uffff]|[?:-]<PLAIN>)(?:[ \\t]*(?:(?![#:])<PLAIN>|:<PLAIN>))*".replace(/<PLAIN>/g, function() {
		return "[^\\s\\x00-\\x08\\x0e-\\x1f,[\\]{}\\x7f-\\x84\\x86-\\x9f\\ud800-\\udfff\\ufffe\\uffff]";
	}), a = "\"(?:[^\"\\\\\\r\\n]|\\\\.)*\"|'(?:[^'\\\\\\r\\n]|\\\\.)*'";
	function o(e, t) {
		t = (t || "").replace(/m/g, "") + "m";
		var n = "([:\\-,[{]\\s*(?:\\s<<prop>>[ \\t]+)?)(?:<<value>>)(?=[ \\t]*(?:$|,|\\]|\\}|(?:[\\r\\n]\\s*)?#))".replace(/<<prop>>/g, function() {
			return r;
		}).replace(/<<value>>/g, function() {
			return e;
		});
		return RegExp(n, t);
	}
	e.languages.yaml = {
		scalar: {
			pattern: RegExp("([\\-:]\\s*(?:\\s<<prop>>[ \\t]+)?[|>])[ \\t]*(?:((?:\\r?\\n|\\r)[ \\t]+)\\S[^\\r\\n]*(?:\\2[^\\r\\n]+)*)".replace(/<<prop>>/g, function() {
				return r;
			})),
			lookbehind: !0,
			alias: "string"
		},
		comment: /#.*/,
		key: {
			pattern: RegExp("((?:^|[:\\-,[{\\r\\n?])[ \\t]*(?:<<prop>>[ \\t]+)?)<<key>>(?=\\s*:\\s)".replace(/<<prop>>/g, function() {
				return r;
			}).replace(/<<key>>/g, function() {
				return "(?:" + i + "|" + a + ")";
			})),
			lookbehind: !0,
			greedy: !0,
			alias: "atrule"
		},
		directive: {
			pattern: /(^[ \t]*)%.+/m,
			lookbehind: !0,
			alias: "important"
		},
		datetime: {
			pattern: o("\\d{4}-\\d\\d?-\\d\\d?(?:[tT]|[ \\t]+)\\d\\d?:\\d{2}:\\d{2}(?:\\.\\d*)?(?:[ \\t]*(?:Z|[-+]\\d\\d?(?::\\d{2})?))?|\\d{4}-\\d{2}-\\d{2}|\\d\\d?:\\d{2}(?::\\d{2}(?:\\.\\d*)?)?"),
			lookbehind: !0,
			alias: "number"
		},
		boolean: {
			pattern: o("false|true", "i"),
			lookbehind: !0,
			alias: "important"
		},
		null: {
			pattern: o("null|~", "i"),
			lookbehind: !0,
			alias: "important"
		},
		string: {
			pattern: o(a),
			lookbehind: !0,
			greedy: !0
		},
		number: {
			pattern: o("[+-]?(?:0x[\\da-f]+|0o[0-7]+|(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?|\\.inf|\\.nan)", "i"),
			lookbehind: !0
		},
		tag: n,
		important: t,
		punctuation: /---|[:[\]{}\-,|>?]|\.\.\./
	}, e.languages.yml = e.languages.yaml;
})(Prism), (function(e) {
	function t(e) {
		return e.replace(/__/g, function() {
			return "(?:[\\w-]+|'[^'\\n\\r]*'|\"(?:\\\\.|[^\\\\\"\\r\\n])*\")";
		});
	}
	e.languages.toml = {
		comment: {
			pattern: /#.*/,
			greedy: !0
		},
		table: {
			pattern: RegExp(t("(^[\\t ]*\\[\\s*(?:\\[\\s*)?)__(?:\\s*\\.\\s*__)*(?=\\s*\\])"), "m"),
			lookbehind: !0,
			greedy: !0,
			alias: "class-name"
		},
		key: {
			pattern: RegExp(t("(^[\\t ]*|[{,]\\s*)__(?:\\s*\\.\\s*__)*(?=\\s*=)"), "m"),
			lookbehind: !0,
			greedy: !0,
			alias: "property"
		},
		string: {
			pattern: /"""(?:\\[\s\S]|[^\\])*?"""|'''[\s\S]*?'''|'[^'\n\r]*'|"(?:\\.|[^\\"\r\n])*"/,
			greedy: !0
		},
		date: [{
			pattern: /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?\b/i,
			alias: "number"
		}, {
			pattern: /\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/,
			alias: "number"
		}],
		number: /(?:\b0(?:x[\da-zA-Z]+(?:_[\da-zA-Z]+)*|o[0-7]+(?:_[0-7]+)*|b[10]+(?:_[10]+)*))\b|[-+]?\b\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?(?:[eE][+-]?\d+(?:_\d+)*)?\b|[-+]?\b(?:inf|nan)\b/,
		boolean: /\b(?:false|true)\b/,
		punctuation: /[.,=[\]{}]/
	};
})(Prism), (function(e) {
	e.languages.diff = { coord: [
		/^(?:\*{3}|-{3}|\+{3}).*$/m,
		/^@@.*@@$/m,
		/^\d.*$/m
	] };
	var t = {
		"deleted-sign": "-",
		"deleted-arrow": "<",
		"inserted-sign": "+",
		"inserted-arrow": ">",
		unchanged: " ",
		diff: "!"
	};
	Object.keys(t).forEach(function(n) {
		var r = t[n], i = [];
		/^\w+$/.test(n) || i.push(/\w+/.exec(n)[0]), n === "diff" && i.push("bold"), e.languages.diff[n] = {
			pattern: RegExp("^(?:[" + r + "].*(?:\r\n?|\n|(?![\\s\\S])))+", "m"),
			alias: i,
			inside: {
				line: {
					pattern: /(.)(?=[\s\S]).*(?:\r\n?|\n)?/,
					lookbehind: !0
				},
				prefix: {
					pattern: /[\s\S]/,
					alias: /\w+/.exec(n)[0]
				}
			}
		};
	}), Object.defineProperty(e.languages.diff, "PREFIXES", { value: t });
})(Prism), Prism.languages.sql = {
	comment: {
		pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\/\/|#).*)/,
		lookbehind: !0
	},
	variable: [{
		pattern: /@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/,
		greedy: !0
	}, /@[\w.$]+/],
	string: {
		pattern: /(^|[^@\\])("|')(?:\\[\s\S]|(?!\2)[^\\]|\2\2)*\2/,
		greedy: !0,
		lookbehind: !0
	},
	identifier: {
		pattern: /(^|[^@\\])`(?:\\[\s\S]|[^`\\]|``)*`/,
		greedy: !0,
		lookbehind: !0,
		inside: { punctuation: /^`|`$/ }
	},
	function: /\b(?:AVG|COUNT|FIRST|FORMAT|LAST|LCASE|LEN|MAX|MID|MIN|MOD|NOW|ROUND|SUM|UCASE)(?=\s*\()/i,
	keyword: /\b(?:ACTION|ADD|AFTER|ALGORITHM|ALL|ALTER|ANALYZE|ANY|APPLY|AS|ASC|AUTHORIZATION|AUTO_INCREMENT|BACKUP|BDB|BEGIN|BERKELEYDB|BIGINT|BINARY|BIT|BLOB|BOOL|BOOLEAN|BREAK|BROWSE|BTREE|BULK|BY|CALL|CASCADED?|CASE|CHAIN|CHAR(?:ACTER|SET)?|CHECK(?:POINT)?|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMNS?|COMMENT|COMMIT(?:TED)?|COMPUTE|CONNECT|CONSISTENT|CONSTRAINT|CONTAINS(?:TABLE)?|CONTINUE|CONVERT|CREATE|CROSS|CURRENT(?:_DATE|_TIME|_TIMESTAMP|_USER)?|CURSOR|CYCLE|DATA(?:BASES?)?|DATE(?:TIME)?|DAY|DBCC|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFINER|DELAYED|DELETE|DELIMITERS?|DENY|DESC|DESCRIBE|DETERMINISTIC|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DISTRIBUTED|DO|DOUBLE|DROP|DUMMY|DUMP(?:FILE)?|DUPLICATE|ELSE(?:IF)?|ENABLE|ENCLOSED|END|ENGINE|ENUM|ERRLVL|ERRORS|ESCAPED?|EXCEPT|EXEC(?:UTE)?|EXISTS|EXIT|EXPLAIN|EXTENDED|FETCH|FIELDS|FILE|FILLFACTOR|FIRST|FIXED|FLOAT|FOLLOWING|FOR(?: EACH ROW)?|FORCE|FOREIGN|FREETEXT(?:TABLE)?|FROM|FULL|FUNCTION|GEOMETRY(?:COLLECTION)?|GLOBAL|GOTO|GRANT|GROUP|HANDLER|HASH|HAVING|HOLDLOCK|HOUR|IDENTITY(?:COL|_INSERT)?|IF|IGNORE|IMPORT|INDEX|INFILE|INNER|INNODB|INOUT|INSERT|INT|INTEGER|INTERSECT|INTERVAL|INTO|INVOKER|ISOLATION|ITERATE|JOIN|KEYS?|KILL|LANGUAGE|LAST|LEAVE|LEFT|LEVEL|LIMIT|LINENO|LINES|LINESTRING|LOAD|LOCAL|LOCK|LONG(?:BLOB|TEXT)|LOOP|MATCH(?:ED)?|MEDIUM(?:BLOB|INT|TEXT)|MERGE|MIDDLEINT|MINUTE|MODE|MODIFIES|MODIFY|MONTH|MULTI(?:LINESTRING|POINT|POLYGON)|NATIONAL|NATURAL|NCHAR|NEXT|NO|NONCLUSTERED|NULLIF|NUMERIC|OFF?|OFFSETS?|ON|OPEN(?:DATASOURCE|QUERY|ROWSET)?|OPTIMIZE|OPTION(?:ALLY)?|ORDER|OUT(?:ER|FILE)?|OVER|PARTIAL|PARTITION|PERCENT|PIVOT|PLAN|POINT|POLYGON|PRECEDING|PRECISION|PREPARE|PREV|PRIMARY|PRINT|PRIVILEGES|PROC(?:EDURE)?|PUBLIC|PURGE|QUICK|RAISERROR|READS?|REAL|RECONFIGURE|REFERENCES|RELEASE|RENAME|REPEAT(?:ABLE)?|REPLACE|REPLICATION|REQUIRE|RESIGNAL|RESTORE|RESTRICT|RETURN(?:ING|S)?|REVOKE|RIGHT|ROLLBACK|ROUTINE|ROW(?:COUNT|GUIDCOL|S)?|RTREE|RULE|SAVE(?:POINT)?|SCHEMA|SECOND|SELECT|SERIAL(?:IZABLE)?|SESSION(?:_USER)?|SET(?:USER)?|SHARE|SHOW|SHUTDOWN|SIMPLE|SMALLINT|SNAPSHOT|SOME|SONAME|SQL|START(?:ING)?|STATISTICS|STATUS|STRIPED|SYSTEM_USER|TABLES?|TABLESPACE|TEMP(?:ORARY|TABLE)?|TERMINATED|TEXT(?:SIZE)?|THEN|TIME(?:STAMP)?|TINY(?:BLOB|INT|TEXT)|TOP?|TRAN(?:SACTIONS?)?|TRIGGER|TRUNCATE|TSEQUAL|TYPES?|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNION|UNIQUE|UNLOCK|UNPIVOT|UNSIGNED|UPDATE(?:TEXT)?|USAGE|USE|USER|USING|VALUES?|VAR(?:BINARY|CHAR|CHARACTER|YING)|VIEW|WAITFOR|WARNINGS|WHEN|WHERE|WHILE|WITH(?: ROLLUP|IN)?|WORK|WRITE(?:TEXT)?|YEAR)\b/i,
	boolean: /\b(?:FALSE|NULL|TRUE)\b/i,
	number: /\b0x[\da-f]+\b|\b\d+(?:\.\d*)?|\B\.\d+\b/i,
	operator: /[-+*\/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?|\b(?:AND|BETWEEN|DIV|ILIKE|IN|IS|LIKE|NOT|OR|REGEXP|RLIKE|SOUNDS LIKE|XOR)\b/i,
	punctuation: /[;[\]()`,.]/
};
// kirocrew-app/ui/src/prism/after.ts
var Za = globalThis, Qa = Za.Prism;
Za.__avoozlPrismPrevious === void 0 ? delete Za.Prism : Za.Prism = Za.__avoozlPrismPrevious, delete Za.__avoozlPrismPrevious;
// kirocrew-app/ui/src/highlight.ts
var $a = [
	"comment",
	"string",
	"keyword",
	"number",
	"boolean",
	"constant",
	"function",
	"class-name",
	"builtin",
	"type",
	"operator",
	"punctuation",
	"property",
	"variable",
	"regex",
	"attribute",
	"tag"
], eo = {
	js: "javascript",
	ts: "typescript",
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	py: "python",
	rs: "rust",
	yml: "yaml",
	html: "markup",
	xml: "markup",
	"c++": "cpp",
	golang: "go"
}, to = /* @__PURE__ */ new Map();
function no(e) {
	if (!e || !Array.isArray(e.tokens)) return null;
	let t = {};
	try {
		e.tokens.forEach((e, n) => {
			let r = $a.includes(e.type) ? e.type : "plain", i = [...new Set(String(e.flags ?? "").replace(/[^imsu]/g, ""))].join("");
			t[`t${n}`] = {
				pattern: new RegExp(String(e.pattern), i),
				greedy: !0,
				alias: r
			};
		});
	} catch {
		return null;
	}
	return t;
}
function ro(e) {
	to.clear();
	for (let [t, n] of Object.entries(e ?? {})) {
		let e = no(n);
		e && to.set(t.toLowerCase(), e);
	}
	return [...to.keys()];
}
function io(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return to.get(t) ?? Qa.languages[eo[t] ?? t] ?? null;
}
var ao = (e) => Array.isArray(e) ? e.flatMap(ao) : typeof e == "string" ? [e] : [{
	types: [e.type, ...[e.alias ?? []].flat()],
	content: ao(e.content)
}];
function oo(e, t) {
	let n = io(t);
	if (!n || e.length > 2e4) return null;
	try {
		return ao(Qa.tokenize(e, n));
	} catch {
		return null;
	}
}
var so = {
	comment: "var(--muted)",
	string: "var(--tile-green, var(--ok))",
	char: "var(--tile-green, var(--ok))",
	"attr-value": "var(--tile-green, var(--ok))",
	keyword: "var(--tile-purple, var(--aim))",
	atrule: "var(--tile-purple, var(--aim))",
	important: "var(--tile-purple, var(--aim))",
	number: "var(--tile-orange, var(--accent))",
	boolean: "var(--tile-orange, var(--accent))",
	constant: "var(--tile-orange, var(--accent))",
	function: "var(--tile-blue, var(--accent))",
	"class-name": "var(--tile-teal, var(--accent))",
	builtin: "var(--tile-teal, var(--accent))",
	type: "var(--tile-teal, var(--accent))",
	property: "var(--tile-indigo, var(--accent))",
	"attr-name": "var(--tile-indigo, var(--accent))",
	attribute: "var(--tile-indigo, var(--accent))",
	tag: "var(--tile-red, var(--danger))",
	variable: "var(--tile-pink, var(--accent))",
	regex: "var(--tile-pink, var(--accent))",
	inserted: "var(--tile-green, var(--ok))",
	deleted: "var(--tile-red, var(--danger))"
};
function co(e) {
	let t = [...e].reverse().find((e) => so[e]) ?? e.find((e) => so[e]);
	return {
		...t ? { color: so[t] } : {},
		...e.includes("comment") ? { fontStyle: "italic" } : {}
	};
}
// kirocrew-app/ui/src/Markdown.tsx
function lo({ parts: e }) {
	return e.map((e, t) => e.kind === "text" ? e.text : e.kind === "code" ? /* @__PURE__ */ b("code", {
		className: "rounded px-1 text-[12px]",
		style: { background: "var(--bg-elevated)" },
		children: e.text
	}, t) : e.kind === "strong" ? /* @__PURE__ */ b("strong", { children: /* @__PURE__ */ b(lo, { parts: e.children }) }, t) : e.kind === "em" ? /* @__PURE__ */ b("em", { children: /* @__PURE__ */ b(lo, { parts: e.children }) }, t) : e.href ? /* @__PURE__ */ b("a", {
		href: e.href,
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		style: { color: "var(--accent)" },
		children: /* @__PURE__ */ b(lo, { parts: e.children })
	}, t) : /* @__PURE__ */ b(lo, { parts: e.children }, t));
}
var uo = ({ text: e }) => /* @__PURE__ */ b(lo, { parts: Ha(e) });
function fo({ tokens: e }) {
	return e.map((e, t) => typeof e == "string" ? e : /* @__PURE__ */ b("span", {
		style: co(e.types),
		children: /* @__PURE__ */ b(fo, { tokens: e.content })
	}, t));
}
function po({ text: e, lang: t, line: n }) {
	let r = oo(e, t);
	return /* @__PURE__ */ b("pre", {
		className: "overflow-x-auto rounded border p-2 text-[12px]",
		style: {
			borderColor: "var(--border)",
			background: "var(--bg-elevated)"
		},
		"data-lang": t ?? void 0,
		"data-line": n,
		"data-highlighted": r ? "true" : void 0,
		children: /* @__PURE__ */ b("code", { children: r ? /* @__PURE__ */ b(fo, { tokens: r }) : e })
	});
}
function mo({ text: e, idPrefix: t, measure: n }) {
	let r = n ? { maxWidth: n } : void 0;
	return /* @__PURE__ */ b("div", {
		className: "flex min-w-0 flex-col gap-2 break-words text-sm leading-relaxed",
		style: { color: "var(--text)" },
		children: qa(e).map((e, n) => {
			if (e.kind === "heading") {
				let i = [
					"text-xl",
					"text-lg",
					"text-base",
					"text-sm",
					"text-sm",
					"text-sm"
				][e.level - 1];
				return /* @__PURE__ */ b("div", {
					role: "heading",
					"aria-level": e.level,
					"data-line": e.line,
					id: t ? Ja(t, e.text, n) : void 0,
					className: `${i} mt-2 font-semibold`,
					style: {
						...r,
						scrollMarginTop: 12
					},
					children: /* @__PURE__ */ b(uo, { text: e.text })
				}, n);
			}
			if (e.kind === "paragraph") return /* @__PURE__ */ b("p", {
				"data-line": e.line,
				style: r,
				children: /* @__PURE__ */ b(uo, { text: e.text })
			}, n);
			if (e.kind === "rule") return /* @__PURE__ */ b("hr", {
				"data-line": e.line,
				style: { borderColor: "var(--border)" }
			}, n);
			if (e.kind === "quote") return /* @__PURE__ */ b("blockquote", {
				"data-line": e.line,
				className: "border-l-2 pl-3 text-muted",
				style: {
					borderColor: "var(--border)",
					...r
				},
				children: /* @__PURE__ */ b(uo, { text: e.text })
			}, n);
			if (e.kind === "code") return /* @__PURE__ */ b(po, {
				text: e.text,
				lang: e.lang,
				line: e.line
			}, n);
			if (e.kind === "table") return /* @__PURE__ */ b("div", {
				"data-line": e.line,
				className: "max-w-full overflow-x-auto",
				children: /* @__PURE__ */ x("table", {
					className: "border-collapse text-[12px]",
					children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ b("tr", { children: e.head.map((e, t) => /* @__PURE__ */ b("th", {
						className: "border px-2 py-1 text-left font-semibold",
						style: { borderColor: "var(--border)" },
						children: /* @__PURE__ */ b(uo, { text: e })
					}, t)) }) }), /* @__PURE__ */ b("tbody", { children: e.rows.map((t, n) => /* @__PURE__ */ b("tr", { children: e.head.map((e, n) => /* @__PURE__ */ b("td", {
						className: "border px-2 py-1 align-top",
						style: { borderColor: "var(--border)" },
						children: /* @__PURE__ */ b(uo, { text: t[n] ?? "" })
					}, n)) }, n)) })]
				})
			}, n);
			let i = e.ordered ? "ol" : "ul";
			return /* @__PURE__ */ b(i, {
				start: e.ordered ? e.start : void 0,
				className: `flex flex-col gap-1 pl-5 ${e.ordered ? "list-decimal" : "list-disc"}`,
				style: r,
				children: e.items.map((e, t) => /* @__PURE__ */ x("li", {
					"data-line": e.line,
					style: {
						marginLeft: e.depth * 16,
						listStyleType: e.checked === null ? void 0 : "none"
					},
					children: [e.checked !== null && /* @__PURE__ */ b("span", {
						"aria-label": e.checked ? "done" : "not done",
						className: "mr-1.5",
						children: e.checked ? "☑" : "☐"
					}), /* @__PURE__ */ b(uo, { text: e.text })]
				}, t))
			}, n);
		})
	});
}
// kirocrew-app/ui/src/focus-trap.ts
function ho(e, t, n) {
	return e === 0 ? -1 : t < 0 ? n ? e - 1 : 0 : n ? (t - 1 + e) % e : (t + 1) % e;
}
// kirocrew-app/ui/src/new-plan-api.ts
var go = /^[a-z0-9][a-z0-9-]{0,79}$/, _o = "Name the epic by its spec folder: lowercase letters, digits and hyphens.", vo = {
	name: "",
	category: "",
	epic: "",
	epics: "",
	repositories: [],
	goal: "",
	context: ""
};
function yo(e) {
	return e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 80).replace(/-+$/, "");
}
function bo(e, t) {
	let n = e.trim();
	if (!n) return "Name the plan.";
	if (!go.test(n)) {
		let e = yo(n);
		return `Use lowercase letters, digits and hyphens, up to 80 characters${e && e !== n ? `, like ${e}` : ""}.`;
	}
	for (let e of t) if (e === n) return `${n} is already used by a plan or spec folder.`;
	return null;
}
function xo(e, t, n) {
	let r = [], i = bo(e.name, t);
	return i && r.push(i), n ? e.repositories.length || r.push("Pick at least one repository.") : r.push("Register a repository in Settings › Repositories first."), e.epic.trim() && !go.test(e.epic.trim()) && r.push(_o), e.goal.trim() || r.push("Say what you want."), r;
}
var So = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean), Co = (e) => JSON.stringify(e) !== JSON.stringify(vo), wo = (e) => ({
	name: e.name.trim(),
	category: e.category.trim(),
	epic: e.epic.trim(),
	epics: So(e.epics),
	repositories: e.repositories,
	goal: e.goal,
	context: e.context
});
function To(e) {
	let t = async (t, n) => (await e.post(Nt, {
		operation: "plan.new",
		workspaceId: t,
		input: n
	})).result;
	return {
		preview: (e, n) => t(e, {
			...wo(n),
			handoff: "spec-builder",
			preview: !0
		}),
		specBuilder: (e, n, r) => t(e, {
			...wo(n),
			handoff: "spec-builder",
			writeSteering: r
		}),
		request: (e, n) => t(e, wo(n))
	};
}
// kirocrew-app/ui/src/spec-builder-api.ts
var Eo = "/api/apps/spec-builder/specs", Do = "/spec-builder", Oo = "spec-builder:last-open";
function ko(e) {
	return { create: (t) => e.post(Eo, t) };
}
function Ao(e) {
	let t = e, n = "", r = "";
	try {
		let e = JSON.parse(t?.body ?? "");
		n = e.code ?? "", r = e.error ?? "";
	} catch {}
	return n === "app_disabled" ? {
		message: "Spec Builder is turned off. Turn it on in Kiro Crew: open Apps, pick Spec Builder, and switch it on. Then press Open in Spec Builder again.",
		fallback: !0
	} : /not permitted to access/.test(t?.message ?? "") || t?.status === 403 && !n ? {
		message: "Avoozl can't reach Spec Builder yet. Approve Avoozl's new Spec Builder permission in Kiro Crew under Apps › Updates, then try again.",
		fallback: !0
	} : t?.status === 404 ? {
		message: "Spec Builder is not installed in this Kiro Crew.",
		fallback: !0
	} : n === "spec_exists" || n === "spec_files_exist" ? {
		message: `Spec Builder already has a spec with this name. Pick another name. (${r})`,
		fallback: !1
	} : {
		message: `Spec Builder refused the spec: ${r || t?.message || "unknown error"}`,
		fallback: !1
	};
}
function jo(e, t) {
	try {
		window.localStorage.setItem(Oo, e);
	} catch {}
	t(Do);
}
// kirocrew-app/ui/src/NewPlanDrawer.tsx
var Mo = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\/private(?=\/)/, "");
	return n(e) === n(t);
}, No = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, Po = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
function Fo(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "font-medium",
				children: [
					e.label,
					" ",
					/* @__PURE__ */ x("span", {
						className: "font-normal text-muted",
						children: [
							"(",
							e.need,
							")"
						]
					})
				]
			}),
			e.children,
			e.problem ? /* @__PURE__ */ b("span", {
				id: `${e.id}-problem`,
				className: "text-xs text-danger",
				children: e.problem
			}) : e.hint && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.hint
			})
		]
	});
}
function Io(e) {
	let t = l(), n = o(() => To(t), [t]), { openChat: i } = u(), a = d(), f = o(() => ko(t), [t]), m = xi(), h = fl("(max-width: 767px)"), _ = fl("(prefers-reduced-motion: reduce)"), [v, y] = c(vo), [S, C] = c(null), [w, T] = c(!1), [E, D] = c(!1), [O, k] = c(!1), [A, j] = c(null), [M, N] = c(null), [P, F] = c(!1), [I, L] = c(!1), ee = s(null), R = (e) => {
		y((t) => ({
			...t,
			...e
		})), N(null);
	};
	r(() => {
		let n = !0;
		return Pt(t).repositories(e.workspaceId).then((e) => {
			if (!n) return;
			let t = e.filter((e) => !e.planning);
			C(t), t.length === 1 && R({ repositories: [t[0].id] });
		}, (e) => n && (C([]), j(J(e)))), () => {
			n = !1;
		};
	}, [t, e.workspaceId]);
	let z = Co(v), te = async () => {
		O || (!z || await m({
			title: "Discard this new plan?",
			body: "What you typed is not saved anywhere.",
			action: "Discard"
		})) && e.onClose(null);
	}, B = s(te);
	B.current = te, mi("drawer", !0, "Close New plan", () => void B.current()), r(() => {
		let e = document.activeElement, t = requestAnimationFrame(() => {
			L(!0), ee.current?.querySelector("#avoozl-new-plan-name")?.focus();
		}), n = (e) => {
			if (document.querySelector("[data-confirm-dialog]") || e.key !== "Tab" || !ee.current) return;
			let t = [...ee.current.querySelectorAll(Po)], n = ho(t.length, t.indexOf(document.activeElement), e.shiftKey);
			n < 0 || (e.preventDefault(), t[n].focus());
		};
		return document.addEventListener("keydown", n), () => {
			cancelAnimationFrame(t), document.removeEventListener("keydown", n), e?.focus?.();
		};
	}, []);
	let H = S ? xo(v, e.taken, S.length) : [], ne = w || E ? bo(v.name, e.taken) : null, U = async (e) => {
		k(!0), j(null);
		try {
			await e();
		} catch (e) {
			j(J(e));
		} finally {
			k(!1);
		}
	}, W = async (t) => {
		let r = await n.specBuilder(e.workspaceId, v, t);
		N(null);
		let i;
		try {
			i = await f.create(r.specBuilder);
		} catch (e) {
			let t = Ao(e);
			F(t.fallback), j(t.message);
			return;
		}
		let o = i.spec_dir && !Mo(i.spec_dir, r.folder);
		e.onClose(o ? `Spec Builder made ${r.name} in ${i.spec_dir}, but Avoozl reads ${r.folder}. Clear Spec Builder's base path setting, or move the folder.` : `Spec Builder is drafting ${r.name}. Avoozl writes its manifest after tasks.md, and it shows here as a draft; you approve it.`), jo(r.name, a);
	}, re = (e) => U(() => W(e)), ie = () => {
		if (D(!0), !H.length && S) return F(!1), U(async () => {
			let t = await n.preview(e.workspaceId, v);
			t.steering.state === "missing" ? N(t.steering) : await W(!1);
		});
	}, ae = () => U(async () => {
		let t = await n.request(e.workspaceId, v);
		i({
			message: t.message,
			agent: t.agent,
			autoSend: !0
		}), e.onClose(`A planner chat is drafting ${t.name}. It shows here as a draft once its folder is complete; you approve it.`);
	});
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0 z-50",
		style: {
			display: "flex",
			justifyContent: "flex-end"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			"data-drawer-backdrop": !0,
			onClick: () => void te(),
			className: "absolute inset-0",
			style: { background: "color-mix(in srgb, var(--text) 25%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: ee,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-new-plan-title",
			"data-new-plan-drawer": !0,
			className: "relative flex h-full flex-col border-l shadow-lg outline-none",
			style: {
				width: h ? "100%" : "min(36rem, 92vw)",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)",
				transform: I || _ ? "none" : "translateX(100%)",
				transition: _ ? "none" : "transform 180ms ease-out"
			},
			children: [
				/* @__PURE__ */ b("div", {
					className: "border-b px-4 py-3",
					style: { borderColor: "var(--border)" },
					children: /* @__PURE__ */ b(Z, {
						level: 2,
						id: "avoozl-new-plan-title",
						title: "New plan",
						actions: /* @__PURE__ */ b(Y, {
							icon: Ie,
							onClick: () => void te(),
							"aria-label": "Close New plan",
							children: "Close"
						})
					})
				}),
				/* @__PURE__ */ x("form", {
					id: "avoozl-new-plan-form",
					className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
					onSubmit: (e) => {
						e.preventDefault(), ie();
					},
					children: [
						/* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "Kiro Crew's Spec Builder drafts the spec from this: requirements, design, then tasks, each for you to review. Avoozl then writes the manifest, and the plan shows in Plans as a draft. Nothing is approved or started."
						}),
						/* @__PURE__ */ b(Fo, {
							id: "avoozl-new-plan-name",
							need: "required",
							label: "Name",
							hint: "Becomes the spec folder name: lowercase letters, digits and hyphens.",
							problem: ne,
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-name",
								value: v.name,
								placeholder: "cache-invalidation",
								"aria-invalid": !!ne,
								"aria-describedby": ne ? "avoozl-new-plan-name-problem" : void 0,
								onChange: (e) => R({ name: e.target.value }),
								onBlur: () => T(!0),
								style: { maxWidth: "24rem" }
							})
						}),
						/* @__PURE__ */ x(Fo, {
							id: "avoozl-new-plan-category",
							need: "optional",
							label: "Category",
							hint: "Pick one or type a new one. Left blank, the plan is Uncategorized.",
							children: [/* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-category",
								list: "avoozl-new-plan-categories",
								value: v.category,
								onChange: (e) => R({ category: e.target.value }),
								style: { maxWidth: "18rem" }
							}), /* @__PURE__ */ b("datalist", {
								id: "avoozl-new-plan-categories",
								children: e.categories.map((e) => /* @__PURE__ */ b("option", { value: e }, e))
							})]
						}),
						/* @__PURE__ */ b(Fo, {
							id: "avoozl-new-plan-epic",
							need: "optional",
							label: "Epic",
							hint: "The epic's spec folder name. Left blank, the plan is in no epic.",
							problem: v.epic.trim() && !go.test(v.epic.trim()) ? _o : null,
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-epic",
								value: v.epic,
								placeholder: "rewrite",
								onChange: (e) => R({ epic: e.target.value }),
								style: { maxWidth: "18rem" }
							})
						}),
						/* @__PURE__ */ b(Fo, {
							id: "avoozl-new-plan-epics",
							need: "optional",
							label: "Phases",
							hint: "One per line; each becomes a heading in tasks.md. Left blank, the planner picks them.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-epics",
								rows: 3,
								value: v.epics,
								onChange: (e) => R({ epics: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: No
							})
						}),
						/* @__PURE__ */ x("fieldset", {
							className: "flex flex-col gap-1 text-sm",
							children: [
								/* @__PURE__ */ x("legend", {
									className: "font-medium",
									children: ["Repositories ", /* @__PURE__ */ b("span", {
										className: "font-normal text-muted",
										children: "(required)"
									})]
								}),
								S === null ? /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "Loading…"
								}) : S.length === 0 ? /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "No repositories yet. Add one in Settings › Repositories, then come back."
								}) : S.map((e) => /* @__PURE__ */ x("label", {
									className: "flex items-center gap-2",
									children: [
										/* @__PURE__ */ b("input", {
											type: "checkbox",
											checked: v.repositories.includes(e.id),
											onChange: (t) => R({ repositories: t.target.checked ? [...v.repositories, e.id] : v.repositories.filter((t) => t !== e.id) })
										}),
										/* @__PURE__ */ b("span", { children: e.name || e.id }),
										e.github && /* @__PURE__ */ b("span", {
											className: "text-xs text-muted",
											children: e.github
										})
									]
								}, e.id)),
								E && S && S.length > 0 && !v.repositories.length && /* @__PURE__ */ b("span", {
									className: "text-xs text-danger",
									children: "Pick at least one repository."
								})
							]
						}),
						/* @__PURE__ */ b(Fo, {
							id: "avoozl-new-plan-goal",
							need: "required",
							label: "What you want",
							hint: "The planner's first prompt: the goal, who it is for, and what done looks like.",
							problem: E && !v.goal.trim() ? "Say what you want." : null,
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-goal",
								rows: 6,
								value: v.goal,
								onChange: (e) => R({ goal: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: No
							})
						}),
						/* @__PURE__ */ b(Fo, {
							id: "avoozl-new-plan-context",
							need: "optional",
							label: "Links and context",
							hint: "Files, issues and notes the planner should read.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-context",
								rows: 4,
								value: v.context,
								onChange: (e) => R({ context: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: No
							})
						}),
						M && /* @__PURE__ */ x("section", {
							"aria-labelledby": "avoozl-new-plan-steering",
							className: "flex flex-col gap-2 rounded border p-3 text-sm",
							style: { borderColor: "var(--border)" },
							children: [
								/* @__PURE__ */ b("h4", {
									id: "avoozl-new-plan-steering",
									className: "font-medium",
									children: "Add Avoozl's spec rules to this repository?"
								}),
								/* @__PURE__ */ x("p", {
									className: "text-xs text-muted",
									children: [
										"Spec Builder's chat reads steering files from the repository. This writes ",
										/* @__PURE__ */ b("code", { children: M.path }),
										", which you commit. Skip it, and the rules go with this one spec instead."
									]
								}),
								/* @__PURE__ */ b("pre", {
									className: "max-h-64 overflow-auto rounded border p-2 text-xs",
									style: {
										borderColor: "var(--border)",
										whiteSpace: "pre-wrap"
									},
									"data-steering-text": !0,
									children: M.text
								}),
								/* @__PURE__ */ x("div", {
									className: "flex flex-wrap gap-2",
									children: [/* @__PURE__ */ b(p, {
										type: "button",
										primary: !0,
										disabled: O,
										onClick: () => void re(!0),
										children: "Add the file and open Spec Builder"
									}), /* @__PURE__ */ b(p, {
										type: "button",
										disabled: O,
										onClick: () => void re(!1),
										children: "Skip the file"
									})]
								})
							]
						}),
						A && /* @__PURE__ */ b("p", {
							role: "alert",
							className: "text-sm text-danger",
							children: A
						}),
						P && /* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(p, {
							type: "button",
							disabled: O,
							onClick: () => void ae(),
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: 6
							},
							children: [/* @__PURE__ */ b(ve, {
								size: 14,
								"aria-hidden": "true"
							}), "Use an Avoozl planner chat instead"]
						}) })
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex items-center gap-2 border-t px-4 py-3",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ x(p, {
						type: "submit",
						form: "avoozl-new-plan-form",
						primary: !0,
						disabled: O || S === null || M !== null,
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ b(V, {
							size: 14,
							"aria-hidden": "true"
						}), O ? "Opening…" : "Open in Spec Builder"]
					}), /* @__PURE__ */ b(p, {
						type: "button",
						onClick: () => void te(),
						disabled: O,
						children: "Cancel"
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/sticky-column.ts
function Lo(e, t = (e) => getComputedStyle(e)) {
	for (let n = e?.parentElement ?? null; n; n = n.parentElement) if (/(auto|scroll|overlay)/.test(t(n).overflowY)) return n;
	return null;
}
function Ro(e, t) {
	let n = t;
	if (e) {
		let r = e.getBoundingClientRect?.(), i = r ? Math.min(t, r.bottom) - Math.max(0, r.top) : e.clientHeight;
		n = Math.min(e.clientHeight || i, i);
	}
	return Math.max(240, Math.floor(n - 16));
}
// kirocrew-app/ui/src/plans-api.ts
var zo = "Uncategorized";
function Bo(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.category ?? "Uncategorized";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return [...t].sort(([e], [t]) => e === "Uncategorized" ? 1 : t === "Uncategorized" ? -1 : e.localeCompare(t)).map(([e, t]) => ({
		category: e,
		rows: t.sort((e, t) => e.name.localeCompare(t.name))
	}));
}
function Vo(e) {
	return e.total ? Math.round(e.done / e.total * 100) : null;
}
function Ho(e) {
	return {
		review: e.kind === "spec" && [
			"not imported",
			"draft",
			"changed"
		].includes(e.status),
		importable: e.kind === "spec" && e.status === "not imported" && !!e.spec,
		scoped: !!(e.planId || e.spec),
		deletable: !!e.planId,
		archivable: !!e.planId && !e.archived,
		unarchivable: !!(e.planId && e.archived)
	};
}
function Uo(e) {
	return `Use the Avoozl skill's "Plan a goal" steps 2 to 4 to change ${e.spec ? `the existing spec folder .kiro/specs/${e.spec}/${e.planId ? ` (plan ${e.planId})` : ""}` : `the stored plan ${e.planId}, which has no spec folder yet; move it to .kiro/specs/<name>/ first`}. Ask me what should change. Edit it in a planner session, critique it in a second isolated session, store the new revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Plans view.`;
}
function Wo(e) {
	let t = async (t, n, r = {}) => (await e.post(Nt, {
		operation: n,
		input: r,
		workspaceId: t
	})).result, n = (e, n) => t(e, "plan.preview", { id: n });
	return {
		specs: (e) => t(e, "plan.specs"),
		table: (e) => t(e, "plan.table"),
		stored: (e) => t(e, "plan.list", { limit: 100 }),
		get: (e, n) => t(e, "plan.get", { id: n }),
		documents: (e, n) => t(e, "plan.spec.read", { name: n }),
		text: (e, n) => t(e, "plan.get", { id: n }).then((e) => e.text ?? ""),
		store: (e, n) => t(e, "plan.create", { spec: n }),
		reload: (e, n, r) => t(e, "plan.save", {
			id: n,
			expectedHash: r
		}),
		preview: n,
		archive: (e, n) => t(e, "plan.archive", { id: n }),
		unarchive: (e, n) => t(e, "plan.unarchive", { id: n }),
		deletePreview: (e, n) => t(e, "plan.delete.preview", { id: n }),
		remove: (e, n, r) => t(e, "plan.delete", {
			id: n,
			...r
		}),
		languages: (e) => t(e, "highlight.languages"),
		projection: (e, n) => t(e, "github.project.preview", { planId: n }),
		approve: async (e, r, i) => {
			let { reviewedHash: a, expectedRevision: o } = await n(e, r);
			if (a !== i) throw Error("This revision changed. Reload it before approving.");
			return t(e, "plan.approve", {
				id: r,
				expectedHash: i,
				expectedRevision: o
			});
		}
	};
}
var Go = (e, t, n = t + "s") => `${e} ${e === 1 ? t : n}`;
function Ko(e) {
	return e.retire ? [
		`${Go(e.open, "open task")}: archived. Their rows stay as history.`,
		`${Go(e.running, "running chat")}: left alone. Each task is archived when its chat ends.`,
		`${Go(e.done, "done task")}: kept as they are.`,
		`${Go(e.dependents, "task")} outside the plan that wait on it: each gets a decision for you.`,
		"The plan is marked deleted and stays in history. There is no undo button."
	] : ["The draft is marked deleted. No task was made from it.", "The plan stays in history."];
}
var qo = [
	["requirements.md", "Requirements"],
	["bugfix.md", "Bugfix"],
	["design.md", "Design"],
	["tasks.md", "Tasks"]
];
function Jo(e) {
	return e ? qo.filter(([t]) => typeof e.documents?.[t] == "string").map(([t, n]) => ({
		file: t,
		label: n,
		text: e.documents[t]
	})) : [];
}
var Yo = (e) => e ? e.slice(0, 12) : "—", Xo = (e) => `${e.file ?? "tasks.md"}:${e.lineStart}`;
function Zo(e) {
	let t = e.issue === null ? "new issue" : `#${e.issue}`, n = e.taskId ?? "parent issue";
	switch (e.kind) {
		case "issue.create": return `Create ${n}: ${e.title ?? ""}${e.type ? ` (${e.type})` : ""}`;
		case "issue.update": return `Update ${n} (${t}): ${Array.isArray(e.fields) ? e.fields.join(", ") : ""}`;
		case "label.add": return `Add label ${(e.labels ?? []).join(", ")} to ${n}`;
		case "label.remove": return `Remove label ${(e.labels ?? []).join(", ")} from ${n}`;
		case "assignee.add": return `Assign ${(e.assignees ?? []).join(", ")} to ${n}`;
		case "sub-issue.add": return `Link ${e.childTaskId} under ${n}`;
		case "blocker.add": return `${n} blocked by ${e.blockerTaskId}`;
		case "blocker.remove": return `${n} no longer blocked by ${e.blockerTaskId ?? "an issue"}`;
		case "project.add": return `Add ${n} to the Project`;
		case "project.fields": {
			let t = e.fields && !Array.isArray(e.fields) ? e.fields : {};
			return `Set ${Object.entries(t).map(([e, t]) => `${e} ${t ?? "empty"}`).join(", ")} on ${n}`;
		}
		default: return `${e.kind} on ${n}`;
	}
}
function Qo(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.repository ?? "unknown repository";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return [...t];
}
function $o(e) {
	return e ? e.disk.changed ? "The folder changed on disk. Reload it first." : e.approvals.some((t) => t.hash === e.hash) ? "This revision is approved." : e.quality.canApprove ? null : "Fix the errors below first." : "Store this spec first.";
}
function es(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "";
	return e.filter((e) => (!e.archived || t.archived) && (!n || e.name.toLowerCase().includes(n) || (e.spec ?? "").toLowerCase().includes(n) || (e.planId ?? "").toLowerCase().includes(n)) && (!t.category || (e.category ?? "Uncategorized") === t.category) && (!t.status || e.status === t.status) && (!t.kind || e.kind === t.kind) && (!t.has || (t.has === "ready" ? e.now.ready > 0 : t.has === "running" ? e.now.running > 0 : e.now.needsYou > 0)));
}
function ts(e) {
	let t = (t) => [...new Set(e.map(t))].sort((e, t) => e === "Uncategorized" ? 1 : t === "Uncategorized" ? -1 : e.localeCompare(t));
	return {
		categories: t((e) => e.category ?? "Uncategorized"),
		statuses: t((e) => e.status)
	};
}
var ns = (e) => ({
	plan: e.key,
	purpose: "discuss-plan"
}), rs = [
	"Its open tasks stop starting. Running chats keep going.",
	"Tasks in other plans that wait on it get a decision for you.",
	"It is hidden on Plans, Graph, Delivery and the Dashboard. Show archived brings it back.",
	"Nothing is deleted, and its spec folder is not touched. Unarchive undoes all of it."
];
function is(e) {
	let t = e.action === "archived" ? "Archived" : e.action === "unarchived" ? "Unarchived" : e.action;
	return e.by ? `${t} by ${e.by}` : t;
}
// kirocrew-app/ui/src/PlansView.tsx
var as = "80ch", os = "17rem", ss = "(max-width: 1023px)";
function cs(e) {
	let [n, i] = c(null), a = s(null), o = t((t) => {
		if (a.current?.(), a.current = null, !t || !e) return;
		let n = Lo(t), r = () => i(Ro(n, window.innerHeight));
		r();
		let o = n && typeof ResizeObserver < "u" ? new ResizeObserver(r) : null;
		n && o?.observe(n), window.addEventListener("resize", r), a.current = () => {
			o?.disconnect(), window.removeEventListener("resize", r);
		};
	}, [e]);
	return r(() => () => a.current?.(), []), [o, n];
}
var ls = (e) => `avoozl-doc-${e.replace(/\.md$/, "")}`, us = (e) => document.getElementById(e)?.scrollIntoView?.({ block: "start" });
function ds({ docs: e, error: t }) {
	let n = Jo(e);
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
		title: "Documents",
		className: "mb-2"
	}), t ? /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-danger",
		children: t
	}) : e ? n.length ? /* @__PURE__ */ b("div", {
		className: "mt-2 flex flex-col gap-6",
		children: n.map((t) => /* @__PURE__ */ x("section", {
			"aria-label": t.label,
			id: `avoozl-doc-${t.file}`,
			style: { scrollMarginTop: 12 },
			children: [/* @__PURE__ */ x("div", {
				className: "mb-2 flex flex-wrap items-baseline gap-x-2 border-b pb-1",
				style: { borderColor: "var(--border)" },
				children: [/* @__PURE__ */ b("h3", {
					className: "text-base font-semibold",
					children: t.label
				}), /* @__PURE__ */ x("span", {
					className: "min-w-0 text-xs text-muted",
					style: { overflowWrap: "anywhere" },
					children: [e.folder, t.file]
				})]
			}), /* @__PURE__ */ b(mo, {
				text: t.text,
				idPrefix: ls(t.file),
				measure: as
			})]
		}, t.file))
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "This folder has no requirements, design or tasks file yet."
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Loading…"
	})] });
}
function fs(e) {
	let { projection: t, busy: n } = e;
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
		title: "GitHub preview",
		blurb: "Lists every write a projection would make. Nothing is written.",
		actions: /* @__PURE__ */ b(Ai, {
			tooltip: "List every GitHub write this plan would make. Makes none.",
			onClick: e.onPreview,
			disabled: n,
			children: t ? "Preview again" : "Preview GitHub writes"
		})
	}), t && /* @__PURE__ */ x("div", {
		className: "mt-3 flex flex-col gap-2 text-sm",
		children: [
			t.previewOnly.length > 0 && /* @__PURE__ */ x("p", { children: [
				/* @__PURE__ */ b(q, { children: "preview only" }),
				" Another machine writes ",
				t.previewOnly.join(", "),
				"."
			] }),
			t.writes.length === 0 ? /* @__PURE__ */ b("p", {
				className: "text-muted",
				children: "GitHub already matches this revision."
			}) : Qo(t.writes).map(([e, t]) => /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("p", {
				className: "font-medium",
				children: [
					e,
					" · ",
					t.length,
					" writes"
				]
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-0.5",
				children: t.map((e, t) => /* @__PURE__ */ b("li", { children: Zo(e) }, t))
			})] }, e)),
			t.conflicts.map((e) => /* @__PURE__ */ x("p", { children: [
				/* @__PURE__ */ b(q, {
					variant: "danger",
					children: "conflict"
				}),
				" ",
				/* @__PURE__ */ b("code", { children: e.taskId }),
				" ",
				e.reason
			] }, `${e.taskId}:${e.field}`)),
			[...t.notes, ...t.project.problems ?? []].map((e) => /* @__PURE__ */ b("p", {
				className: "text-muted",
				children: e
			}, e)),
			t.project.status === "unavailable" && /* @__PURE__ */ x("p", {
				className: "text-muted",
				children: [
					"Project fields not previewed: ",
					t.project.reason,
					" Fix: ",
					/* @__PURE__ */ b("code", { children: t.project.fix })
				]
			})
		]
	})] });
}
function ps(e) {
	let { spec: t, plan: n, preview: r, busy: i } = e, a = $o(n), o = n?.disk.critique ?? t.critique, s = n?.quality.diagnostics ?? [];
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x(m, { children: [
				/* @__PURE__ */ b(Z, {
					title: n ? `Revision ${n.revision}` : "Not imported",
					className: "mb-2"
				}),
				/* @__PURE__ */ x("p", {
					className: "mt-1 text-sm text-muted",
					children: [
						t.folder,
						" · ",
						t.files.join(", ") || "no files"
					]
				}),
				n ? /* @__PURE__ */ x("p", {
					className: "mt-1 text-sm",
					children: [
						/* @__PURE__ */ b("code", { children: Yo(n.hash) }),
						" · ",
						n.state
					]
				}) : /* @__PURE__ */ b("p", {
					className: "mt-1 text-sm",
					children: "Import stores this folder as a draft plan, so you can check and approve it. It approves nothing and starts nothing."
				}),
				/* @__PURE__ */ b("p", {
					className: "mt-1 text-xs text-muted",
					children: "Avoozl delivers this spec. Do not use Spec Builder's Approve tasks or Kiro's Run all Tasks on it."
				}),
				/* @__PURE__ */ x("div", {
					className: "mt-3 flex flex-wrap gap-2",
					children: [
						!n && /* @__PURE__ */ b(Y, {
							icon: B,
							tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
							onClick: e.onStore,
							disabled: i,
							children: "Import"
						}),
						n?.disk.changed && /* @__PURE__ */ b(Y, {
							icon: Oe,
							tooltip: "Store the changed files as a new revision to approve",
							onClick: e.onReload,
							disabled: i,
							children: "Reload from disk"
						}),
						n && /* @__PURE__ */ x(Y, {
							icon: R,
							onClick: e.onApprove,
							disabled: i || a !== null,
							tooltip: a ?? "Approve this exact revision. Its ready tasks may then start.",
							children: ["Approve revision ", Yo(n.hash)]
						})
					]
				}),
				n && a && /* @__PURE__ */ b("p", {
					className: "mt-2 text-sm text-muted",
					children: a
				})
			] }),
			/* @__PURE__ */ b(ds, {
				docs: e.docs,
				error: e.docsError
			}, t.name),
			/* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
				title: "Diagnostics",
				className: "mb-2"
			}), n ? s.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No diagnostics."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: s.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(q, {
						variant: e.severity === "error" ? "danger" : void 0,
						children: e.severity
					}),
					" ",
					/* @__PURE__ */ b("code", { children: Xo(e) }),
					" ",
					e.message
				] }, e.id))
			}) : /* @__PURE__ */ x("p", {
				className: "mt-2 text-sm text-muted",
				children: [
					t.counts.error,
					" errors, ",
					t.counts.warning,
					" warnings in the folder on disk."
				]
			})] }),
			/* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
				title: "Critique",
				className: "mb-2"
			}), o ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("p", {
				className: "mt-2 text-sm",
				children: o.current ? "Reviews this revision." : `Reviews ${Yo(o.reviewedHash)}, not this revision.`
			}), o.findings.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-1 text-sm text-muted",
				children: "No findings."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: o.findings.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(q, { children: e.kind }),
					" ",
					e.task && /* @__PURE__ */ b("code", { children: e.task }),
					" ",
					e.text
				] }, e.line))
			})] }) : /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No avoozl/critique.md yet."
			})] }),
			r && /* @__PURE__ */ x(m, { children: [
				/* @__PURE__ */ b(Z, {
					title: "Manifest",
					className: "mb-2"
				}),
				r.baseline?.text && /* @__PURE__ */ x("p", {
					className: "mt-1 text-sm text-muted",
					children: [r.baseline.text, "."]
				}),
				/* @__PURE__ */ b("ul", {
					className: "mt-2 flex flex-col gap-1 text-sm",
					children: r.tasks.map((e) => {
						let t = r.dependencies.filter((t) => t.to === e.taskId && t.kind === "requires").map((e) => e.from);
						return /* @__PURE__ */ x("li", { children: [
							/* @__PURE__ */ b("code", { children: e.taskId }),
							" ",
							e.title,
							" ",
							/* @__PURE__ */ b(ba, { owner: e }),
							r.baseline?.taskIds.includes(e.taskId) && /* @__PURE__ */ b(q, { children: "done" }),
							t.length > 0 && /* @__PURE__ */ x("span", {
								className: "text-muted",
								children: [" · requires ", t.join(", ")]
							})
						] }, e.taskId);
					})
				})
			] }),
			n?.state === "approved" && /* @__PURE__ */ b(fs, {
				projection: e.projection,
				busy: i,
				onPreview: e.onProjection
			}),
			n && n.approvals.length > 0 && /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
				title: "Approvals",
				className: "mb-2"
			}), /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: n.approvals.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b("code", { children: Yo(e.hash) }),
					" · ",
					e.at,
					e.approvedBy ? ` · ${e.approvedBy}` : ""
				] }, e.id))
			})] })
		]
	});
}
function ms({ tasks: e }) {
	let t = Vo(e), n = fl("(prefers-reduced-motion: reduce)"), [i, a] = c(n ? t ?? 0 : 0);
	if (r(() => {
		if (t === null) return;
		if (n) {
			a(t);
			return;
		}
		let e = requestAnimationFrame(() => a(t));
		return () => cancelAnimationFrame(e);
	}, [t, n]), t === null) return /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "no tasks"
	});
	let o = {
		width: `${i}%`,
		height: "100%",
		borderRadius: 999,
		background: "linear-gradient(90deg, color-mix(in srgb, var(--ok) 70%, var(--card)), var(--ok))",
		transition: n ? "none" : "width 700ms cubic-bezier(0.2, 0.8, 0.2, 1)"
	};
	return /* @__PURE__ */ x("div", {
		style: { minWidth: 112 },
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-baseline justify-between gap-2 text-xs",
			children: [/* @__PURE__ */ x("span", {
				className: "font-semibold tabular-nums",
				style: { color: "var(--ok-text, var(--ok))" },
				children: [t, "%"]
			}), /* @__PURE__ */ x("span", {
				className: "tabular-nums text-muted",
				children: [
					e.done,
					"/",
					e.total
				]
			})]
		}), /* @__PURE__ */ b("div", {
			role: "progressbar",
			"aria-label": `${t}% of tasks done`,
			"aria-valuemin": 0,
			"aria-valuemax": 100,
			"aria-valuenow": t,
			className: "mt-1",
			style: {
				height: 8,
				borderRadius: 999,
				overflow: "hidden",
				background: "color-mix(in srgb, var(--border) 75%, transparent)",
				boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)"
			},
			children: /* @__PURE__ */ b("div", { style: o })
		})]
	});
}
var hs = {
	done: "success",
	approved: "info",
	changed: "warning",
	draft: void 0,
	"not imported": void 0
}, gs = {
	done: "Done",
	approved: "Approved",
	changed: "Changed on disk",
	draft: "Draft",
	"not imported": "Not imported"
};
function _s({ now: e }) {
	let t = [
		e.needsYou ? /* @__PURE__ */ x(q, {
			variant: "warning",
			children: [e.needsYou, " need you"]
		}, "you") : null,
		e.running ? /* @__PURE__ */ x(q, {
			variant: "info",
			children: [e.running, " running"]
		}, "run") : null,
		e.ready ? /* @__PURE__ */ x(q, { children: [e.ready, " ready"] }, "ready") : null
	].filter(Boolean);
	return t.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: t
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "—"
	});
}
var vs = {
	padding: "8px 10px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "middle"
}, ys = {
	padding: "6px 10px",
	textAlign: "left",
	fontWeight: 600,
	whiteSpace: "nowrap"
};
function bs(e) {
	let { filter: t } = e, n = ts(e.rows), r = (n) => {
		let r = {
			...t,
			...n
		};
		for (let e of Object.keys(r)) r[e] || delete r[e];
		e.onChange(r);
	};
	return /* @__PURE__ */ b(Ea, {
		id: "avoozl-plans",
		label: "Filter plans",
		active: Object.keys(t).length > 0,
		onClear: () => e.onChange({}),
		fields: [
			{
				kind: "search",
				key: "q",
				label: "Search",
				value: t.q ?? "",
				placeholder: "Plan name or folder",
				onChange: (e) => r({ q: e })
			},
			{
				kind: "select",
				key: "category",
				label: "Category",
				value: t.category ?? "",
				options: n.categories.map((e) => ({
					value: e,
					label: e
				})),
				onChange: (e) => r({ category: e })
			},
			{
				kind: "select",
				key: "status",
				label: "Status",
				value: t.status ?? "",
				options: n.statuses.map((e) => ({
					value: e,
					label: gs[e] ?? e
				})),
				onChange: (e) => r({ status: e })
			},
			{
				kind: "select",
				key: "kind",
				label: "Kind",
				value: t.kind ?? "",
				options: [{
					value: "spec",
					label: "Spec folder"
				}, {
					value: "old-style",
					label: "Old-style plan"
				}],
				onChange: (e) => r({ kind: e || void 0 })
			},
			{
				kind: "select",
				key: "has",
				label: "Has",
				value: t.has ?? "",
				options: [
					{
						value: "ready",
						label: "Ready tasks"
					},
					{
						value: "running",
						label: "Running tasks"
					},
					{
						value: "needs-you",
						label: "Tasks that need you"
					}
				],
				onChange: (e) => r({ has: e || void 0 })
			},
			{
				kind: "check",
				key: "archived",
				label: "Show archived",
				checked: !!t.archived,
				onChange: (e) => r({ archived: e })
			}
		],
		children: e.children
	});
}
var xs = "Archive this plan: its tasks stop starting and it is hidden. You can undo it.", Ss = "Unarchive this plan: its tasks may start again and it shows everywhere.", Cs = "Reload plans from disk. Imports nothing.";
function ws(e) {
	return /* @__PURE__ */ x(y, { children: [
		/* @__PURE__ */ b(Y, {
			icon: Ee,
			primary: !0,
			tooltip: "Describe a plan idea. Spec Builder drafts its spec folder; nothing is approved.",
			onClick: e.onNewPlan,
			children: "New plan"
		}),
		/* @__PURE__ */ b(Y, {
			icon: Ee,
			tooltip: "Add a draft task. It waits for your review.",
			onClick: e.onNewTask,
			children: "New task"
		}),
		/* @__PURE__ */ b(X, {
			icon: Oe,
			label: "Refresh plans",
			tooltip: Cs,
			onClick: e.onRefresh,
			disabled: e.busy
		})
	] });
}
function Ts(e) {
	let { row: t } = e, n = Ho(t);
	return /* @__PURE__ */ x("span", {
		className: "flex justify-end gap-1.5",
		children: [
			n.importable && e.onImport && /* @__PURE__ */ b(X, {
				icon: B,
				label: `Import ${t.name}`,
				tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
				disabled: e.busy,
				onClick: e.onImport
			}),
			e.onOpen && /* @__PURE__ */ b(X, {
				icon: Gr,
				label: `Open docs for ${t.name}`,
				tooltip: "Open this plan's documents and tasks",
				onClick: e.onOpen
			}),
			n.scoped && /* @__PURE__ */ b(X, {
				icon: xe,
				label: `Graph of ${t.name}`,
				tooltip: "Show this plan's tasks in the Graph",
				onClick: () => e.onScope("graph")
			}),
			n.scoped && /* @__PURE__ */ b(X, {
				icon: ge,
				label: `Delivery of ${t.name}`,
				tooltip: "Show this plan's tasks in Delivery",
				onClick: () => e.onScope("delivery")
			}),
			n.review && e.onReview && /* @__PURE__ */ b(X, {
				icon: R,
				label: `Review ${t.name}`,
				tooltip: "Open this plan to check and approve it",
				onClick: e.onReview
			}),
			e.onChange && /* @__PURE__ */ b(X, {
				icon: we,
				label: `Plan a change to ${t.name}`,
				tooltip: "Start a planner chat to change this plan",
				onClick: e.onChange
			}),
			e.onArchive && n.archivable && /* @__PURE__ */ b(X, {
				icon: w,
				label: `Archive ${t.name}`,
				tooltip: xs,
				disabled: e.busy,
				onClick: e.onArchive
			}),
			e.onUnarchive && n.unarchivable && /* @__PURE__ */ b(X, {
				icon: T,
				label: `Unarchive ${t.name}`,
				tooltip: Ss,
				disabled: e.busy,
				onClick: e.onUnarchive
			}),
			e.onDelete && n.deletable && /* @__PURE__ */ b(X, {
				icon: Ne,
				label: `Delete ${t.name}`,
				tooltip: "Delete this plan. You confirm first; it stays in history.",
				disabled: e.busy,
				onClick: e.onDelete,
				style: _i
			})
		]
	});
}
function Es(e) {
	let t = Bo(e.rows), [n, r] = c(/* @__PURE__ */ new Set()), i = Oi(e.reset ?? ""), a = (e) => (t) => {
		t.stopPropagation(), e();
	}, o = (e, t) => {
		let n = new Set(e);
		return n.has(t) ? n.delete(t) : n.add(t), n;
	}, s = /* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
		className: "text-xs text-muted",
		children: [
			/* @__PURE__ */ b("th", {
				style: ys,
				children: "Plan"
			}),
			/* @__PURE__ */ b("th", {
				style: ys,
				children: "Status"
			}),
			/* @__PURE__ */ b("th", {
				style: ys,
				children: "Progress"
			}),
			/* @__PURE__ */ b("th", {
				style: ys,
				children: "Now"
			}),
			/* @__PURE__ */ b("th", {
				style: {
					...ys,
					textAlign: "right"
				},
				children: "Epics"
			}),
			/* @__PURE__ */ b("th", {
				style: ys,
				children: "Last change"
			}),
			/* @__PURE__ */ b("th", {
				style: ys,
				children: /* @__PURE__ */ b("span", {
					className: "sr-only",
					children: "Actions"
				})
			})
		]
	}) });
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-4",
		"data-plan-groups": !0,
		children: t.map((t) => {
			let c = !n.has(t.category), l = i.take(t.category, t.rows), u = t.rows.reduce((e, t) => ({
				total: e.total + t.tasks.total,
				done: e.done + t.tasks.done
			}), {
				total: 0,
				done: 0
			}), d = `avoozl-plan-group-${t.category.replace(/[^\w-]/g, "-")}`;
			return /* @__PURE__ */ x("section", {
				"aria-labelledby": d,
				"data-plan-group": t.category,
				className: "rounded-xl border p-4",
				style: {
					borderColor: "var(--border)",
					background: "var(--card)"
				},
				children: [/* @__PURE__ */ b("h2", {
					id: d,
					className: "m-0",
					children: /* @__PURE__ */ x("button", {
						type: "button",
						"aria-expanded": c,
						onClick: () => r(o(n, t.category)),
						className: "flex w-full flex-wrap items-center gap-2 text-left text-lg font-semibold",
						children: [
							/* @__PURE__ */ b("span", {
								"aria-hidden": "true",
								style: {
									display: "inline-flex",
									transform: c ? "rotate(90deg)" : "none",
									transition: "transform 120ms"
								},
								children: /* @__PURE__ */ b(N, { size: 16 })
							}),
							/* @__PURE__ */ b(re, {
								size: 18,
								"aria-hidden": "true",
								style: { color: "var(--muted)" }
							}),
							/* @__PURE__ */ b("span", { children: t.category }),
							/* @__PURE__ */ x("span", {
								className: "text-sm font-normal text-muted",
								children: [
									t.rows.length,
									" ",
									t.rows.length === 1 ? "plan" : "plans"
								]
							}),
							/* @__PURE__ */ b("span", {
								className: "ml-auto text-sm font-normal",
								style: {
									width: "min(14rem, 40%)",
									minWidth: 120
								},
								children: /* @__PURE__ */ b(ms, { tasks: u })
							})
						]
					})
				}), c && /* @__PURE__ */ x("div", {
					className: "mt-3 overflow-x-auto",
					children: [/* @__PURE__ */ x("table", {
						className: "w-full border-collapse text-sm",
						style: { color: "var(--text)" },
						children: [s, /* @__PURE__ */ b("tbody", { children: l.map((t) => /* @__PURE__ */ x("tr", {
							"data-plan-row": t.key,
							onClick: () => e.onOpen(t),
							className: "hover:bg-accent/10",
							style: { cursor: "pointer" },
							children: [
								/* @__PURE__ */ x("td", {
									style: vs,
									children: [/* @__PURE__ */ b("button", {
										type: "button",
										className: "text-left font-medium hover:underline",
										onClick: a(() => e.onOpen(t)),
										children: t.name
									}), /* @__PURE__ */ x("span", {
										className: "mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted",
										children: [
											/* @__PURE__ */ b(q, { children: t.kind === "spec" ? t.type ?? "spec" : "old-style" }),
											t.spec ? /* @__PURE__ */ b("code", { children: t.spec }) : t.planId ? /* @__PURE__ */ b("code", { children: t.planId }) : null,
											t.errors > 0 && /* @__PURE__ */ x(q, {
												variant: "danger",
												children: [t.errors, " errors"]
											}),
											t.archived && /* @__PURE__ */ b(q, { children: "Archived" })
										]
									})]
								}),
								/* @__PURE__ */ b("td", {
									style: vs,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ b(q, {
										variant: hs[t.status],
										children: gs[t.status] ?? t.status
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...vs,
										width: 150
									},
									children: /* @__PURE__ */ b(ms, { tasks: t.tasks })
								}),
								/* @__PURE__ */ b("td", {
									style: vs,
									children: /* @__PURE__ */ b(_s, { now: t.now })
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...vs,
										textAlign: "right"
									},
									className: "tabular-nums",
									children: t.epics
								}),
								/* @__PURE__ */ b("td", {
									style: vs,
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(K, {
										text: t.lastChange,
										children: /* @__PURE__ */ b("span", { children: t.lastChange ? Mn(t.lastChange) : "—" })
									})
								}),
								/* @__PURE__ */ b("td", {
									style: vs,
									className: "whitespace-nowrap",
									onClick: (e) => e.stopPropagation(),
									children: /* @__PURE__ */ b(Ts, {
										row: t,
										busy: e.busy,
										onOpen: () => e.onOpen(t),
										onScope: (n) => e.onScope(n, t),
										onReview: () => e.onOpen(t),
										onChange: () => e.onChange(t),
										onImport: () => e.onImport(t),
										onDelete: e.onDelete ? () => e.onDelete(t) : void 0,
										onArchive: e.onArchive ? () => e.onArchive(t) : void 0,
										onUnarchive: e.onUnarchive ? () => e.onUnarchive(t) : void 0
									})
								})
							]
						}, t.key)) })]
					}), t.rows.length > l.length && /* @__PURE__ */ b(ki, { ...i.more(t.category, t.rows.length) })]
				})]
			}, t.category);
		})
	});
}
function Ds(e) {
	let { row: t, graph: n, docs: r } = e, i = (n?.tasks ?? []).filter((e) => e.kind === "leaf"), a = Object.fromEntries(Xe.map((e) => [e.id, 0]));
	for (let e of i) a[at(e)] += 1;
	let o = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), s = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (!e.epic) continue;
		let t = o.get(e.epic), n = s.get(e.epic) ?? {
			title: t && t !== e.epic ? t : ct(e.epic),
			done: 0,
			total: 0
		};
		n.total += 1, at(e) === "done" && (n.done += 1), s.set(e.epic, n);
	}
	let c = (n?.tasks ?? []).filter((e) => e.decision), l = Jo(r), u = (e) => /* @__PURE__ */ b("h4", {
		className: "text-xs font-semibold uppercase tracking-wide text-muted",
		children: e
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4 text-sm",
		"data-plan-aside": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ b(Y, {
						icon: we,
						primary: !0,
						tooltip: "Start a planner chat that drafts a change to the spec files",
						onClick: e.onEdit,
						children: "Edit plan"
					}),
					/* @__PURE__ */ b(Y, {
						icon: ye,
						tooltip: "Start a chat about this plan. It makes no edits.",
						onClick: e.onDiscuss,
						children: "Discuss plan"
					}),
					(e.onDelete || e.onArchive || e.onUnarchive) && /* @__PURE__ */ x("span", {
						className: "ml-auto flex gap-1.5",
						children: [
							e.onArchive && /* @__PURE__ */ b(X, {
								icon: w,
								label: `Archive ${t.name}`,
								tooltip: xs,
								onClick: e.onArchive
							}),
							e.onUnarchive && /* @__PURE__ */ b(X, {
								icon: T,
								label: `Unarchive ${t.name}`,
								tooltip: Ss,
								onClick: e.onUnarchive
							}),
							e.onDelete && /* @__PURE__ */ b(X, {
								icon: Ne,
								label: `Delete ${t.name}`,
								tooltip: "Delete this plan. You confirm first; it stays in history.",
								onClick: e.onDelete,
								style: _i
							})
						]
					})
				]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ x("span", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ b(q, {
							variant: hs[t.status],
							children: gs[t.status] ?? t.status
						}),
						t.type && /* @__PURE__ */ b(q, { children: t.type }),
						t.archived && /* @__PURE__ */ b(q, { children: "Archived" })
					]
				}), /* @__PURE__ */ b(ms, { tasks: t.tasks })]
			}),
			/* @__PURE__ */ x("div", { children: [u("Category"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: t.category ?? /* @__PURE__ */ b("span", {
					className: "text-muted",
					children: "None in its front-matter"
				})
			})] }),
			/* @__PURE__ */ x("div", { children: [u("Tasks by state"), /* @__PURE__ */ b("dl", {
				className: "mt-1 grid gap-x-3 gap-y-0.5",
				style: { gridTemplateColumns: "1fr auto" },
				children: Xe.map((e) => /* @__PURE__ */ x("div", {
					className: "contents",
					children: [/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: e.label
					}), /* @__PURE__ */ b("dd", {
						className: "text-right tabular-nums",
						children: n ? a[e.id] : "…"
					})]
				}, e.id))
			})] }),
			s.size > 0 && /* @__PURE__ */ x("div", { children: [u("Epics"), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: [...s].map(([t, n]) => {
					let r = n.total ? Math.round(n.done / n.total * 100) : 0;
					return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(K, {
						text: `Show only ${n.title} in the Graph`,
						display: "block",
						children: /* @__PURE__ */ x("button", {
							type: "button",
							className: "w-full rounded px-1 py-0.5 text-left hover:bg-accent/10",
							onClick: () => e.onDrill({
								kind: "epic",
								id: t,
								title: n.title
							}),
							children: [/* @__PURE__ */ x("span", {
								className: "flex justify-between gap-2",
								children: [/* @__PURE__ */ b("span", {
									className: "truncate",
									children: n.title
								}), /* @__PURE__ */ x("span", {
									className: "shrink-0 text-xs text-muted",
									children: [
										n.done,
										"/",
										n.total
									]
								})]
							}), /* @__PURE__ */ b("span", {
								className: "mt-0.5 block h-1 overflow-hidden rounded",
								style: { background: "var(--border)" },
								children: /* @__PURE__ */ b("span", {
									className: "block h-full",
									style: {
										width: `${r}%`,
										background: "var(--ok)"
									}
								})
							})]
						})
					}) }, t);
				})
			})] }),
			l.length > 0 && /* @__PURE__ */ x("nav", {
				"aria-label": "Plan outline",
				children: [u("Outline"), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: l.map((e) => /* @__PURE__ */ x("li", { children: [/* @__PURE__ */ b("button", {
						type: "button",
						className: "font-medium hover:underline",
						onClick: () => us(`avoozl-doc-${e.file}`),
						children: e.label
					}), /* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: Ya(e.text, ls(e.file), 2).filter((e) => e.level === 2).map((e) => /* @__PURE__ */ b("li", {
							className: "truncate pl-3",
							children: /* @__PURE__ */ b("button", {
								type: "button",
								className: "text-left text-xs text-muted hover:underline",
								onClick: () => us(e.id),
								children: e.text
							})
						}, e.id))
					})] }, e.file))
				})]
			}),
			/* @__PURE__ */ x("div", { children: [u("Last change"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: /* @__PURE__ */ b(K, {
					text: t.lastChange,
					children: /* @__PURE__ */ b("span", { children: t.lastChange ? Mn(t.lastChange) : /* @__PURE__ */ b("span", {
						className: "text-muted",
						children: "Unknown"
					}) })
				})
			})] }),
			(t.timeline ?? []).length > 0 && /* @__PURE__ */ x("div", {
				"data-plan-timeline": !0,
				children: [u("Timeline"), /* @__PURE__ */ b("ol", {
					className: "mt-1 flex flex-col gap-0.5",
					children: t.timeline.map((e, t) => /* @__PURE__ */ x("li", {
						className: "flex justify-between gap-2",
						children: [/* @__PURE__ */ b("span", { children: is(e) }), /* @__PURE__ */ b(K, {
							text: e.at,
							children: /* @__PURE__ */ b("span", {
								className: "shrink-0 text-xs text-muted",
								children: Mn(e.at)
							})
						})]
					}, t))
				})]
			}),
			/* @__PURE__ */ x("div", { children: [u(`Open decisions (${c.length})`), c.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-1 text-muted",
				children: "None."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: c.map((t) => /* @__PURE__ */ x("li", { children: [/* @__PURE__ */ b("button", {
					type: "button",
					className: "text-left underline",
					onClick: () => e.onOpenTask(t.id),
					children: t.title
				}), /* @__PURE__ */ b("span", {
					className: "block text-xs text-muted",
					children: t.decision
				})] }, t.id))
			})] })
		]
	});
}
function Os(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), d = s(null);
	mi("modal", !0, "Cancel", () => e.onDone(null)), r(() => {
		d.current?.focus();
	}, []);
	let f = async () => {
		u(!0), o(null);
		try {
			let r = await n.archive(i, t.planId);
			e.onDone(`Archived ${t.name}. ${r.held} tasks held, ${r.running} running chats left alone, ${r.decisions} decisions opened. Show archived on Plans brings it back.`);
		} catch (e) {
			o(J(e));
		} finally {
			u(!1);
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 70,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: () => e.onDone(null),
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			role: "alertdialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-archive-plan-title",
			"data-archive-plan": !0,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(32rem, 94vw)",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ x("h3", {
					id: "avoozl-archive-plan-title",
					className: "text-base font-semibold",
					children: [
						"Archive the plan ",
						t.name,
						"?"
					]
				}),
				/* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-1 pl-5 text-sm",
					style: { listStyle: "disc" },
					children: rs.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
				}),
				a && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: a
				}),
				/* @__PURE__ */ x("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ b(p, {
						ref: d,
						type: "button",
						onClick: () => e.onDone(null),
						children: "Cancel"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						"data-archive-confirm": !0,
						disabled: l,
						onClick: () => void f(),
						children: "Archive plan"
					})]
				})
			]
		})]
	});
}
function ks(e) {
	let { archived: t } = e.row;
	return t ? /* @__PURE__ */ x("div", {
		role: "status",
		"data-archived-banner": !0,
		className: "mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
		style: {
			borderColor: "var(--border)",
			background: "color-mix(in srgb, var(--muted) 10%, var(--card, transparent))"
		},
		children: [
			/* @__PURE__ */ b(w, {
				size: 18,
				"aria-hidden": "true",
				style: { color: "var(--muted)" }
			}),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: "This plan is archived."
					}),
					" ",
					/* @__PURE__ */ x("span", {
						className: "text-muted",
						children: [
							t.by ? `${t.by} archived it` : "Archived",
							" ",
							/* @__PURE__ */ b(K, {
								text: t.at,
								children: /* @__PURE__ */ b("span", { children: Mn(t.at) })
							}),
							". Its tasks do not start, and it is hidden unless Show archived is on."
						]
					})
				]
			}),
			/* @__PURE__ */ b(Y, {
				icon: T,
				primary: !0,
				disabled: e.busy,
				tooltip: Ss,
				onClick: e.onUnarchive,
				children: "Unarchive"
			})
		]
	}) : null;
}
function As(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), [d, f] = c(null), [m, h] = c(!1), g = s(null);
	r(() => {
		n.deletePreview(i, t.planId).then(o, (e) => f(J(e)));
	}, [
		n,
		i,
		t.planId
	]), mi("modal", !0, "Cancel", () => e.onDone(null)), r(() => {
		g.current?.focus();
	}, []);
	let _ = async () => {
		if (a) {
			h(!0), f(null);
			try {
				let t = await n.remove(i, a.id, {
					retire: a.retire,
					deleteSpecFolder: l
				});
				e.onDone(`Deleted ${a.title}. ${t.retired ? `Archived ${t.archived}, ${t.archiveWhenEnded} when their chats end, ${t.decisions} decisions opened. ` : ""}${t.removedFolder ? `Removed ${t.removedFolder} from the working tree; nothing was committed.` : ""}`);
			} catch (e) {
				f(J(e));
			} finally {
				h(!1);
			}
		}
	}, v = !!(l && a?.folder?.dirty);
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 70,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: () => e.onDone(null),
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			role: "alertdialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-delete-plan-title",
			"data-delete-plan": a?.retire ? "retire" : "draft",
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(32rem, 94vw)",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ x("h3", {
					id: "avoozl-delete-plan-title",
					className: "text-base font-semibold",
					children: [
						"Delete the plan ",
						a?.title ?? t.name,
						"?"
					]
				}),
				!a && !d && /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Counting its tasks…"
				}),
				a && /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-1 pl-5 text-sm",
					style: { listStyle: "disc" },
					children: Ko(a).map((e) => /* @__PURE__ */ b("li", { children: e }, e))
				}),
				a?.folder?.exists && /* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ x("span", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									checked: l,
									onChange: (e) => u(e.target.checked)
								}),
								"Also delete the spec folder (.kiro/specs/",
								a.spec,
								"/) from the repo."
							]
						}),
						/* @__PURE__ */ b("code", {
							className: "pl-6 text-xs text-muted",
							style: { overflowWrap: "anywhere" },
							children: a.folder.path
						}),
						/* @__PURE__ */ b("span", {
							className: "pl-6 text-xs text-muted",
							children: "Only the working tree. Avoozl never commits or pushes this."
						}),
						l && a.folder.dirty && /* @__PURE__ */ b("span", {
							role: "alert",
							className: "pl-6 text-xs text-danger",
							children: a.folder.reason
						})
					]
				}),
				d && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: d
				}),
				/* @__PURE__ */ x("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ b(p, {
						ref: g,
						type: "button",
						onClick: () => e.onDone(null),
						children: "Cancel"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						"data-danger": !0,
						disabled: !a || m || v,
						onClick: () => void _(),
						style: {
							background: "var(--danger)",
							borderColor: "var(--danger)",
							color: "#fff"
						},
						children: "Delete plan"
					})]
				})
			]
		})]
	});
}
function js(e) {
	let n = e.workspaceId, i = l(), { openChat: a } = u(), d = o(() => Wo(i), [i]), f = o(() => Kt(i), [i]), p = ur(), h = Di(n), g = fl(ss), [_, v] = cs(!g), [S, C] = c(null), [w, T] = c(null), [E, O] = c(!1);
	r(() => {
		e.newPlanRequest && O(!0);
	}, [e.newPlanRequest]);
	let [k, A] = c(null), [j, M] = c(null), [N, P, F] = gi("plans-selected", "select", (e) => e ? "Back to the plan" : "Back to all plans", null), I = s(n), [L, ee] = c({}), [R, z] = c(null), [te, B] = c(null), [V, H] = c(null), [ne, U] = c(null), [W, re] = c(null), [ie, ae] = c(null), [oe, se] = c(null), [ce, le] = c(null), [ue, de] = c(!1), [, fe] = c(0), pe = s(null), me = t(async (e) => {
		de(!0), le(null);
		try {
			await e();
		} catch (e) {
			le(J(e));
		} finally {
			de(!1);
		}
	}, []), he = t((e) => me(async () => M(await d.table(e))), [me, d]);
	r(() => {
		M(null), I.current !== n && (I.current = n, F(null)), n && (he(n), d.languages(n).then((e) => {
			ro(e.languages), fe((e) => e + 1);
		}, () => void 0));
	}, [
		n,
		he,
		d
	]);
	let G = j?.items.find((e) => e.key === N) ?? null, ge = G?.spec ? j?.specs.find((e) => e.name === G.spec) ?? null : null, _e = t(async (e, t) => {
		if (z(null), B(null), H(null), !t) return;
		let [n, r] = await Promise.all([d.get(e, t), d.preview(e, t).catch(() => null)]);
		z(n), B(r);
	}, [d]);
	r(() => {
		if (U(null), re(null), se(null), ae(null), !n || !G) return;
		let e = !0;
		return me(() => _e(n, G.planId)), f.graph(n, {
			plan: G.planId ?? void 0,
			spec: G.spec ?? void 0
		}).then((t) => e && ae(t), () => void 0), G.spec ? d.documents(n, G.spec).then((t) => e && U(t), (t) => e && re(J(t))) : G.planId && d.text(n, G.planId).then((t) => e && se({
			text: t,
			error: null
		}), (t) => e && se({
			text: null,
			error: J(t)
		})), () => {
			e = !1;
		};
	}, [n, N]), r(() => {
		N && pe.current?.scrollIntoView?.({ block: "start" });
	}, [N]);
	let ve = (e) => P(e.key), ye = (t, n) => e.onScope?.(t, { plan: pr(n) }), be = (e) => a({
		message: Uo(e),
		autoSend: !1
	}), xe = (e) => {
		if (!n) return;
		let t = n;
		me(async () => {
			let n = await e(t), r = await d.table(t);
			M(r);
			let i = r.items.find((e) => e.key === N) ?? null;
			await _e(t, i?.planId ?? n?.id ?? null);
		});
	}, Se = (e) => e.spec && xe((t) => d.store(t, e.spec)), Ce = (e) => e.planId && xe(async (t) => {
		let n = await d.unarchive(t, e.planId);
		return A(`Unarchived ${e.name}. ${n.released} tasks may start again; ${n.decisions} decisions closed.`), { id: e.planId };
	}), we = j ? es(j.items, L) : [];
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-plans-title",
		className: "flex flex-col gap-3.5",
		children: [
			S && n && /* @__PURE__ */ b(As, {
				workspaceId: n,
				row: S,
				client: d,
				onDone: (e) => {
					C(null), e !== null && (F(null), A(e), he(n));
				}
			}),
			w && n && /* @__PURE__ */ b(Os, {
				workspaceId: n,
				row: w,
				client: d,
				onDone: (e) => {
					T(null), e !== null && (A(e), he(n));
				}
			}),
			E && n && /* @__PURE__ */ b(Io, {
				workspaceId: n,
				taken: (j?.items ?? []).flatMap((e) => [e.spec, e.planId]).filter((e) => !!e),
				categories: [...new Set((j?.items ?? []).map((e) => e.category).filter((e) => !!e))].sort(),
				onClose: (e) => {
					O(!1), e && A(e);
				}
			}),
			k && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				children: k
			}),
			/* @__PURE__ */ x("div", {
				ref: pe,
				className: "flex flex-wrap items-center gap-3",
				children: [G && /* @__PURE__ */ b(Y, {
					icon: D,
					onClick: () => P(null),
					children: "All plans"
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(Mi, {
						id: "avoozl-plans-title",
						view: "plans",
						actions: n && !G ? /* @__PURE__ */ b(ws, {
							onNewPlan: () => O(!0),
							onNewTask: () => p.addTask(),
							onRefresh: () => void he(n),
							busy: ue
						}) : G ? /* @__PURE__ */ b(Ts, {
							row: G,
							onScope: (e) => ye(e, G),
							onReview: () => us("avoozl-plan-main")
						}) : null,
						children: G ? G.name : "Plans"
					})
				})]
			}),
			(ce || h.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ce ?? h.error
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: ue ? "Working…" : ""
			}),
			n ? G ? /* @__PURE__ */ x("div", {
				style: g ? {
					display: "flex",
					flexDirection: "column",
					gap: 14
				} : {
					display: "grid",
					gridTemplateColumns: `${os} minmax(0, 1fr)`,
					gap: 14,
					alignItems: "start"
				},
				children: [/* @__PURE__ */ b("aside", {
					ref: _,
					"aria-label": "Plan summary",
					"data-plan-aside-scroll": !0,
					style: g ? void 0 : {
						position: "sticky",
						top: 8,
						maxHeight: v ?? "calc(100vh - 2rem)",
						overflowY: "auto",
						overscrollBehavior: "contain"
					},
					children: /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Ds, {
						row: G,
						graph: ie,
						docs: ne,
						onEdit: () => be(G),
						onDiscuss: () => void h.ask(ns(G)),
						onDelete: Ho(G).deletable ? () => C(G) : void 0,
						onArchive: Ho(G).archivable ? () => T(G) : void 0,
						onUnarchive: Ho(G).unarchivable ? () => Ce(G) : void 0,
						onDrill: (t) => e.onDrill?.(t),
						onOpenTask: (e) => p.openTask(e)
					}) })
				}), /* @__PURE__ */ x("div", {
					id: "avoozl-plan-main",
					className: "min-w-0",
					children: [
						/* @__PURE__ */ b(ks, {
							row: G,
							busy: ue,
							onUnarchive: () => Ce(G)
						}),
						G.categoryProblem && /* @__PURE__ */ x("p", {
							className: "mb-3 text-sm text-muted",
							children: [
								/* @__PURE__ */ b(q, {
									variant: "warning",
									children: "front-matter"
								}),
								" ",
								G.categoryProblem
							]
						}),
						ge ? /* @__PURE__ */ b(ps, {
							docs: ne,
							docsError: W,
							spec: ge,
							plan: R,
							preview: te,
							projection: V,
							busy: ue,
							onStore: () => xe((e) => d.store(e, ge.name)),
							onReload: () => R && xe((e) => d.reload(e, R.id, R.hash)),
							onApprove: () => R && xe((e) => d.approve(e, R.id, R.hash)),
							onProjection: () => R && void me(async () => H(await d.projection(n, R.id)))
						}) : /* @__PURE__ */ x(m, { children: [
							/* @__PURE__ */ b(Z, {
								title: G.name,
								className: "mb-2"
							}),
							/* @__PURE__ */ x("p", {
								className: "mt-1 text-xs text-muted",
								children: [/* @__PURE__ */ b("code", { children: G.planId }), " · written before the spec layout, so it has no folder. Its tasks show in Graph and Delivery."]
							}),
							/* @__PURE__ */ b("div", {
								className: "mt-2",
								children: oe ? oe.error ? /* @__PURE__ */ b("p", {
									className: "text-sm text-danger",
									children: oe.error
								}) : oe.text ? /* @__PURE__ */ b(mo, {
									text: oe.text,
									measure: as
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "This plan has no text."
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "Loading…"
								})
							})
						] })
					]
				})]
			}) : /* @__PURE__ */ x(y, { children: [j && j.items.length > 0 && /* @__PURE__ */ b(bs, {
				filter: L,
				rows: j.items,
				onChange: ee,
				children: /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					role: "status",
					children: [
						we.length,
						" of ",
						j.items.length,
						" plans"
					]
				})
			}), /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-plans-list": !0,
				children: [
					j === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: ue ? "Loading…" : "Not loaded"
					}) : j.items.length === 0 ? /* @__PURE__ */ x("p", {
						className: "text-sm text-muted",
						children: [
							"No plans yet",
							j.root ? ` in ${j.root}/.kiro/specs` : "",
							". Use New plan to start one."
						]
					}) : we.length ? /* @__PURE__ */ b(Es, {
						rows: we,
						reset: JSON.stringify(L),
						busy: ue,
						onOpen: ve,
						onScope: ye,
						onChange: be,
						onImport: Se,
						onDelete: C,
						onArchive: T,
						onUnarchive: Ce
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No plan matches these filters."
					}),
					j?.problem && /* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: ["Spec folders: ", j.problem]
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: [
							"Categories come from ",
							/* @__PURE__ */ b("code", { children: "category:" }),
							" in the front-matter of a spec's requirements.md or bugfix.md. Avoozl never guesses one. ",
							zo,
							" holds the rest."
						]
					})
				]
			})] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			})
		]
	});
}
// kirocrew-app/ui/src/CitedFile.tsx
var Ms = "avoozl-cited", Ns = "\n[data-cited=\"true\"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }\n";
function Ps(e) {
	return e.getAttribute("role") === "heading" ? `h${e.getAttribute("aria-level") ?? "6"}` : e.tagName.toLowerCase();
}
function Fs(e, t, n, r, i = e) {
	let a = [...e.querySelectorAll("[data-line]")];
	for (let e of a) e.classList.remove(Ms), delete e.dataset.cited;
	let o = Sn(a.map((e) => ({
		line: Number(e.dataset.line),
		tag: Ps(e)
	})), t, n).map((e) => a[e]);
	for (let e of o) e.classList.add(Ms), e.dataset.cited = "true";
	let s = o[0] ?? null;
	if (s && i) {
		let e = s.getBoundingClientRect().top - i.getBoundingClientRect().top + i.scrollTop - 24;
		i.scrollTo?.({
			top: Math.max(0, e),
			behavior: r ? "auto" : "smooth"
		});
	}
	return s;
}
function Is(e) {
	let t = s(null), n = fl("(prefers-reduced-motion: reduce)"), { text: i, lineStart: a, lineEnd: o } = e;
	return r(() => {
		let e = t.current;
		if (!e) return;
		let r = requestAnimationFrame(() => Fs(e, a, o, n));
		return () => cancelAnimationFrame(r);
	}, [
		i,
		a,
		o,
		n
	]), /* @__PURE__ */ x("div", {
		ref: t,
		"data-cited-file": !0,
		"aria-label": e.label,
		className: "px-3 py-2",
		style: {
			maxHeight: e.maxHeight ?? 420,
			overflowY: "auto",
			overscrollBehavior: "contain"
		},
		children: [/* @__PURE__ */ b("style", { children: Ns }), /* @__PURE__ */ b(mo, {
			text: i,
			idPrefix: e.idPrefix
		})]
	});
}
// kirocrew-app/ui/src/repository-rows.ts
function Ls(e, t) {
	let n = /* @__PURE__ */ new Set(), r = e.map((e) => {
		let r = e.github ? t.findIndex((t) => t.name.trim() === e.github) : -1;
		return r >= 0 && n.add(r), {
			key: `checkout:${e.id}`,
			name: e.name || e.id,
			checkout: e,
			policy: r,
			github: e.github,
			folder: e.localCheckout,
			branch: r >= 0 && t[r].baseBranch || e.baseBranch
		};
	});
	return t.forEach((e, t) => {
		n.has(t) || r.push({
			key: `policy:${t}`,
			name: e.name || "New repository",
			checkout: null,
			policy: t,
			github: /^[\w.-]+\/[\w.-]+$/.test(e.name.trim()) ? e.name.trim() : null,
			folder: null,
			branch: e.baseBranch || "main"
		});
	}), r;
}
var Rs = (e) => e && /^[\w.-]+\/[\w.-]+$/.test(e) ? `https://github.com/${e}` : null, zs = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])";
function Bs(e) {
	let t = s(null), n = fl("(max-width: 767px)"), i = s(e.onDismiss);
	return i.current = e.onDismiss, mi("modal", !0, "Close the dialog", () => i.current()), r(() => {
		let e = document.activeElement;
		t.current?.querySelector(zs)?.focus();
		let n = (e) => {
			if (document.querySelector("[data-confirm-dialog]") || e.key !== "Tab" || !t.current) return;
			let n = [...t.current.querySelectorAll(zs)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = ho(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", n), () => {
			document.removeEventListener("keydown", n), e?.focus?.();
		};
	}, []), /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: () => i.current(),
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: t,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": `${e.id}-title`,
			"data-modal": e.id,
			"data-modal-size": n ? "full" : "large",
			className: "relative flex flex-col border shadow-lg",
			style: {
				width: n ? "100vw" : "min(64rem, 94vw)",
				height: n ? "100vh" : "min(52rem, 90vh)",
				borderRadius: n ? 0 : 10,
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ b("h3", {
					id: `${e.id}-title`,
					className: "border-b px-4 py-3 text-lg font-semibold",
					style: { borderColor: "var(--border)" },
					children: e.title
				}),
				/* @__PURE__ */ b("div", {
					className: "min-h-0 flex-1 overflow-y-auto p-4",
					children: e.children
				}),
				/* @__PURE__ */ b("div", {
					className: "border-t px-4 py-3",
					style: { borderColor: "var(--border)" },
					children: e.footer
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/RepositoriesSettings.tsx
var Vs = "A repository is a code checkout on this computer. Tasks change its code in their own worktrees and land on its branch. Each workspace keeps its own list.";
function Hs() {
	let e = l();
	return t(async (t) => {
		try {
			if (!(await e.post("/api/reveal", {
				path: t,
				action: "reveal"
			}))?.copy) return `Opened ${t} in Finder.`;
		} catch {}
		try {
			return await navigator.clipboard.writeText(t), `Finder could not be opened from here, so the folder path was copied: ${t}`;
		} catch {
			return `Finder could not be opened from here. The folder is ${t}`;
		}
	}, [e]);
}
function Us(e, t) {
	return e.github ? t === "local" ? "Local only mode" : t ? t === "plans-repo" ? "Plans repository mode" : "Single repository mode" : "GitHub, no mode yet" : "Local only";
}
function Ws(e) {
	return e.rows.length ? /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"aria-label": "Added repositories",
		"data-repository-list": !0,
		children: e.rows.map((t) => {
			let n = Rs(t.github);
			return /* @__PURE__ */ x("li", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 first:border-t-0",
				style: { borderColor: "var(--border)" },
				"data-repository-row": t.key,
				children: [
					/* @__PURE__ */ x("div", {
						className: "min-w-0",
						style: { flex: "1 1 18rem" },
						children: [/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: t.name
						}), /* @__PURE__ */ x("span", {
							className: "block truncate text-xs text-muted",
							children: [
								t.folder ?? "No folder on this computer",
								" · lands on ",
								/* @__PURE__ */ b("code", { children: t.branch }),
								t.github ? ` · ${t.github}` : ""
							]
						})]
					}),
					/* @__PURE__ */ b(q, { children: Us(t, e.mode) }),
					/* @__PURE__ */ x("span", {
						className: "flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ b(Y, {
								icon: we,
								tooltip: `Change ${t.name}'s settings in a dialog`,
								"aria-label": `Edit ${t.name}`,
								onClick: () => e.onEdit(t.key),
								children: "Edit"
							}),
							t.folder && /* @__PURE__ */ b(X, {
								icon: re,
								label: `Open ${t.name} in Finder`,
								onClick: () => e.onReveal(t.folder)
							}),
							n && /* @__PURE__ */ b(Ks, {
								href: n,
								name: t.name
							}),
							/* @__PURE__ */ b(Ci, {
								label: `Remove ${t.name}`,
								tooltip: e.dirty ? "Save or discard your changes first" : t.checkout ? "Stop Avoozl using this checkout. The folder and GitHub stay." : "Drop its GitHub settings from .avoozl.json when you save",
								disabled: e.busy || e.dirty && !!t.checkout,
								confirm: t.checkout ? {
									title: `Remove ${t.name} from this workspace?`,
									body: `Avoozl stops using ${t.folder ?? "this checkout"}: tasks that name ${t.checkout.id} wait until it is added again, and its entry leaves .avoozl.json. The folder${t.github ? `, the GitHub repository ${t.github}` : ""} and your plans are not touched. Avoozl refuses while a run or lock still uses it.`,
									action: "Remove"
								} : {
									title: `Remove ${t.name}'s GitHub settings?`,
									body: "Its label rules, managed labels, checks and who counts leave .avoozl.json when you save. GitHub is not changed.",
									action: "Remove"
								},
								onConfirm: () => e.onRemove(t),
								children: "Remove"
							})
						]
					})
				]
			}, t.key);
		})
	}) : /* @__PURE__ */ x("div", {
		className: "flex flex-col items-start gap-2 py-2",
		"data-repositories-empty": !0,
		children: [
			/* @__PURE__ */ b("p", {
				className: "text-sm",
				children: "No repositories yet."
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: Vs
			}),
			/* @__PURE__ */ b(Y, {
				icon: Ee,
				primary: !0,
				onClick: e.onAdd,
				children: "Add repository"
			})
		]
	});
}
function Gs(e) {
	let t = xi(), n = () => e.edited ? void t({
		title: `Discard your changes to ${e.name}?`,
		body: "Every edit in this dialog is lost. .avoozl.json stays as it is.",
		action: "Discard changes"
	}).then((t) => t && e.onDiscard()) : e.onDiscard();
	return /* @__PURE__ */ b(Bs, {
		id: "avoozl-repo-edit",
		title: e.name,
		onDismiss: n,
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center justify-end gap-2",
			children: [
				(e.error || e.edited && e.missing) && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "mr-auto text-sm text-danger",
					"data-modal-error": !0,
					children: e.error ?? e.missing
				}),
				!e.error && !e.missing && e.edited && /* @__PURE__ */ b("span", {
					className: "mr-auto text-xs text-muted",
					children: "Unsaved changes"
				}),
				/* @__PURE__ */ b(p, {
					type: "button",
					onClick: n,
					children: "Cancel"
				}),
				/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: e.onSave,
					disabled: e.saving || !e.edited,
					children: "Save"
				})
			]
		}),
		children: e.children
	});
}
function Ks({ href: e, name: t }) {
	return /* @__PURE__ */ x(qs, {
		href: e,
		tip: "Open on GitHub",
		children: [/* @__PURE__ */ b(V, {
			size: 14,
			"aria-hidden": "true"
		}), /* @__PURE__ */ x("span", {
			className: "sr-only",
			children: [
				"Open ",
				t,
				" on GitHub"
			]
		})]
	});
}
function qs(e) {
	return /* @__PURE__ */ b(K, {
		text: e.tip,
		children: /* @__PURE__ */ b("a", {
			href: e.href,
			target: "_blank",
			rel: "noopener noreferrer",
			className: "inline-flex items-center rounded border",
			style: {
				padding: "5px 7px",
				borderColor: "var(--border)",
				color: "var(--text)"
			},
			children: e.children
		})
	});
}
function Js(e) {
	let t = l(), n = o(() => Pt(t), [t]), [i, a] = c(""), [s, u] = c(null), [d, f] = c(""), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null);
	r(() => {
		u(null), S(null);
	}, [i]);
	let C = async () => {
		v(!0), S(null);
		try {
			let t = await n.detectRepository(e.workspaceId, i.trim());
			u(t), f(t.id ?? ""), h(t.baseBranch);
		} catch (e) {
			S(J(e));
		} finally {
			v(!1);
		}
	}, w = async () => {
		if (s) {
			v(!0), S(null);
			try {
				let t = await n.registerRepository(e.workspaceId, {
					id: d.trim(),
					localCheckout: s.root,
					baseBranch: m.trim() || s.baseBranch
				});
				a(""), u(null), e.onAdded(t.id);
			} catch (e) {
				S(J(e));
			} finally {
				v(!1);
			}
		}
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-repo-add",
		className: "flex flex-col gap-3",
		"data-add-repository": !0,
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
				id: "avoozl-repo-add",
				className: "text-base font-semibold",
				children: "Add repository"
			}), /* @__PURE__ */ b("p", {
				className: "mt-1 text-sm text-muted",
				children: "Point at a Git checkout on this computer; Avoozl reads its branch and GitHub remote for you."
			})] }),
			/* @__PURE__ */ x("ol", {
				className: "flex flex-col gap-3",
				style: { maxWidth: "40rem" },
				children: [/* @__PURE__ */ x("li", {
					className: "flex flex-col gap-1.5",
					"data-step": "folder",
					children: [
						/* @__PURE__ */ b("span", {
							className: "text-sm font-medium",
							children: "1. Pick the folder"
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "The checkout's folder, as an absolute path. Any folder inside it works too."
						}),
						/* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-end gap-2",
							children: [
								/* @__PURE__ */ b("label", {
									htmlFor: "avoozl-repo-folder",
									className: "sr-only",
									children: "Folder"
								}),
								/* @__PURE__ */ b(g, {
									id: "avoozl-repo-folder",
									value: i,
									placeholder: "/path/to/my-service",
									onChange: (e) => a(e.target.value),
									style: { minWidth: "18rem" }
								}),
								/* @__PURE__ */ b(Ai, {
									tooltip: "Read the folder's branch and GitHub remote. Changes nothing.",
									onClick: () => void C(),
									disabled: _ || !i.trim() || !!e.disabled,
									children: "Check folder"
								})
							]
						})
					]
				}), s && /* @__PURE__ */ x("li", {
					className: "flex flex-col gap-2",
					"data-step": "confirm",
					children: [
						/* @__PURE__ */ b("span", {
							className: "text-sm font-medium",
							children: "2. Confirm what Avoozl found"
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "Tasks land on the branch below. Change it if tasks should land elsewhere."
						}),
						/* @__PURE__ */ x("dl", {
							className: "grid gap-x-3 gap-y-1 text-sm",
							style: { gridTemplateColumns: "max-content 1fr" },
							children: [
								/* @__PURE__ */ b("dt", {
									className: "text-muted",
									children: "Folder"
								}),
								/* @__PURE__ */ b("dd", {
									className: "min-w-0",
									style: { overflowWrap: "anywhere" },
									children: s.root
								}),
								/* @__PURE__ */ b("dt", {
									className: "text-muted",
									children: "GitHub remote"
								}),
								/* @__PURE__ */ b("dd", { children: s.github ?? (s.remote ? `${s.remote} is not on GitHub` : "None: a local-only repository") }),
								/* @__PURE__ */ b("dt", {
									className: "text-muted",
									children: "Mode"
								}),
								/* @__PURE__ */ b("dd", { children: s.github ? e.mode && e.mode !== "local" ? `This workspace's ${e.mode} mode` : "No GitHub mode set yet (Settings › Where tasks live)" : "Local only" })
							]
						}),
						/* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-end gap-3",
							children: [
								/* @__PURE__ */ x("label", {
									htmlFor: "avoozl-repo-id",
									className: "flex flex-col gap-1 text-sm",
									children: [/* @__PURE__ */ b("span", { children: "Short ID" }), /* @__PURE__ */ b(g, {
										id: "avoozl-repo-id",
										value: d,
										placeholder: "my-service",
										onChange: (e) => f(e.target.value)
									})]
								}),
								/* @__PURE__ */ x("label", {
									htmlFor: "avoozl-repo-branch",
									className: "flex flex-col gap-1 text-sm",
									children: [/* @__PURE__ */ b("span", { children: "Branch tasks land on" }), /* @__PURE__ */ b(g, {
										id: "avoozl-repo-branch",
										value: m,
										onChange: (e) => h(e.target.value)
									})]
								}),
								/* @__PURE__ */ b(p, {
									primary: !0,
									onClick: () => void w(),
									disabled: _ || !d.trim() || !!e.disabled,
									children: "Add repository"
								})
							]
						})
					]
				})]
			}),
			e.disabled && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: e.disabled
			}),
			y && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: y
			})
		]
	});
}
// kirocrew-app/ui/src/DocumentReader.tsx
var Ys = "avoozl-reader", Xs = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex=\"-1\"])";
function Zs(e) {
	let { workspaceId: n, target: i, onClose: a, text: u } = e, d = l(), f = o(() => Cn(d), [d]), p = Hs(), m = fl("(max-width: 767px)"), h = fl("(prefers-reduced-motion: reduce)"), [g, _] = c({
		text: null,
		error: null
	}), [v, C] = c(null), [, w] = c(0), T = s(null), E = s(null), D = s(null);
	r(() => {
		let e = !0;
		return u === void 0 ? f.document(n, i.document).then((t) => e && _({
			text: t.text,
			error: null
		}), (t) => e && _({
			text: null,
			error: J(t)
		})) : _({
			text: u,
			error: null
		}), Wo(d).languages(n).then((t) => {
			ro(t.languages), e && w((e) => e + 1);
		}, () => void 0), () => {
			e = !1;
		};
	}, [
		d,
		f,
		n,
		i.document,
		u
	]);
	let O = t(() => {
		let e = E.current;
		e && i.lineStart && Fs(e, i.lineStart, i.lineEnd, h);
	}, [
		i.lineStart,
		i.lineEnd,
		h
	]);
	r(() => {
		if (g.text === null) return;
		let e = requestAnimationFrame(O);
		return () => cancelAnimationFrame(e);
	}, [g.text, O]), mi("modal", !0, "Close the file", a), r(() => {
		D.current = document.activeElement, T.current?.focus();
		let e = (e) => {
			if (e.key !== "Tab" || !T.current) return;
			let t = [...T.current.querySelectorAll(Xs)];
			if (!t.length) return e.preventDefault();
			let n = t[0], r = t[t.length - 1], i = document.activeElement;
			e.shiftKey && (i === n || i === T.current) ? (e.preventDefault(), r.focus()) : e.shiftKey || i !== r && T.current.contains(i) || (e.preventDefault(), n.focus());
		};
		return document.addEventListener("keydown", e, !0), () => {
			document.removeEventListener("keydown", e, !0), D.current?.focus?.();
		};
	}, [a]);
	let k = async () => {
		try {
			await navigator.clipboard.writeText(i.document), C(`Copied ${i.document}.`);
		} catch {
			C(`Could not copy. The path is ${i.document}`);
		}
	}, A = async () => {
		if (!bn(i.document)) return C("This path is outside the workspace, so it is not opened.");
		try {
			let e = (await Pt(d).list()).items.find((e) => e.id === n)?.root;
			if (!e) return C("The workspace folder is not known here.");
			C(await p(`${e.replace(/\/$/, "")}/${i.document}`));
		} catch (e) {
			C(J(e));
		}
	}, j = g.text ? Ya(g.text, Ys, 3) : [], M = yn(i), N = (e) => T.current?.querySelector(`#${CSS.escape(e)}`)?.scrollIntoView?.({
		block: "start",
		behavior: h ? "auto" : "smooth"
	});
	return S(/* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		"data-document-reader": !0,
		[ci]: "",
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			"data-reader-backdrop": !0,
			className: "absolute inset-0",
			onClick: a,
			style: { background: "color-mix(in srgb, var(--text) 35%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: T,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-reader-title",
			tabIndex: -1,
			className: `relative flex flex-col overflow-hidden border shadow-lg outline-none ${m ? "" : "rounded-lg"}`,
			style: {
				width: m ? "100vw" : "min(78rem, 94vw)",
				height: m ? "100vh" : "90vh",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [/* @__PURE__ */ x("div", {
				className: "border-b px-4 py-2.5",
				style: { borderColor: "var(--border)" },
				children: [/* @__PURE__ */ b(Z, {
					id: "avoozl-reader-title",
					title: /* @__PURE__ */ b("code", { children: i.document }),
					actions: /* @__PURE__ */ x(y, { children: [
						/* @__PURE__ */ b(X, {
							icon: z,
							label: "Copy path",
							tooltip: `Copy ${i.document}`,
							onClick: () => void k()
						}),
						u === void 0 && /* @__PURE__ */ b(X, {
							icon: re,
							label: "Reveal in Finder",
							tooltip: "Show this file in Finder",
							onClick: () => void A()
						}),
						/* @__PURE__ */ b(Y, {
							icon: Ie,
							onClick: a,
							"aria-label": "Close the file",
							children: "Close"
						})
					] }),
					blurb: M && /* @__PURE__ */ b(K, {
						text: `Scroll back to ${M.toLowerCase()}`,
						children: (e) => /* @__PURE__ */ b("button", {
							type: "button",
							className: "text-xs text-muted hover:underline",
							onClick: O,
							"aria-describedby": e,
							children: M
						})
					})
				}), v && /* @__PURE__ */ b("p", {
					role: "status",
					className: "mt-1 text-xs text-muted",
					style: { overflowWrap: "anywhere" },
					children: v
				})]
			}), /* @__PURE__ */ x("div", {
				className: "min-h-0 grow",
				style: m ? {
					display: "flex",
					flexDirection: "column",
					overflowY: "auto"
				} : {
					display: "grid",
					gridTemplateColumns: "15rem minmax(0, 1fr)",
					minHeight: 0
				},
				ref: m ? E : void 0,
				children: [j.length > 0 && (m ? /* @__PURE__ */ x("details", {
					className: "border-b px-4 py-2 text-sm",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ b("summary", {
						className: "cursor-pointer font-medium",
						children: "Outline"
					}), /* @__PURE__ */ b(Qs, {
						headings: j,
						onJump: N
					})]
				}) : /* @__PURE__ */ x("nav", {
					"aria-label": "File outline",
					className: "overflow-y-auto border-r px-3 py-3 text-sm",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ b("h4", {
						className: "text-xs font-semibold uppercase tracking-wide text-muted",
						children: "Outline"
					}), /* @__PURE__ */ b(Qs, {
						headings: j,
						onJump: N
					})]
				})), /* @__PURE__ */ b("div", {
					ref: m ? void 0 : E,
					className: "min-w-0 px-5 py-4",
					style: m ? void 0 : {
						overflowY: "auto",
						gridColumn: j.length ? void 0 : "1 / -1"
					},
					"aria-label": `Contents of ${i.document}`,
					children: g.error ? /* @__PURE__ */ b("p", {
						role: "alert",
						className: "text-sm text-danger",
						children: g.error
					}) : g.text === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Reading…"
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("style", { children: Ns }), /* @__PURE__ */ b(mo, {
						text: g.text,
						idPrefix: Ys,
						measure: as
					})] })
				})]
			})]
		})]
	}), document.body);
}
function Qs(e) {
	return /* @__PURE__ */ b("ul", {
		className: "mt-1 flex flex-col gap-0.5",
		children: e.headings.map((t) => /* @__PURE__ */ b("li", {
			className: "truncate",
			style: { paddingLeft: (t.level - 1) * 12 },
			children: /* @__PURE__ */ b("button", {
				type: "button",
				className: `text-left hover:underline ${t.level === 1 ? "font-medium" : "text-xs text-muted"}`,
				onClick: () => e.onJump(t.id),
				children: t.text
			})
		}, t.id))
	});
}
var $s = .9;
function ec(e, t) {
	let n = Math.max(Math.min(360, t), Math.floor(t * $s));
	return Math.min(n, Math.max(Math.min(360, n), Number.isFinite(e) ? Math.round(e) : 620));
}
var tc = (e) => `avoozl.drawerWidth.${e}`;
function nc(e, t) {
	try {
		let n = Number(e?.getItem(tc(t)));
		return Number.isFinite(n) && n > 0 ? n : 620;
	} catch {
		return 620;
	}
}
function rc(e, t, n) {
	try {
		n === 620 ? e?.removeItem(tc(t)) : e?.setItem(tc(t), String(n));
	} catch {}
}
function ic(e, t) {
	return t === "ArrowLeft" ? e + 40 : t === "ArrowRight" ? e - 40 : null;
}
// kirocrew-app/ui/src/ReviewState.tsx
var ac = (e, t) => `asked ${e ?? "agent default"}${t ? `, ran ${t}` : ""}`;
function oc(e) {
	let t = an(e.item);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: `flex flex-col gap-1 ${e.compact ? "text-xs" : "text-sm"}`,
		"data-review-runs": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", {
			className: "flex flex-wrap items-center gap-1.5",
			children: [
				/* @__PURE__ */ b(q, {
					variant: t.live ? "info" : void 0,
					children: t.role
				}),
				/* @__PURE__ */ x("span", { children: ["round ", t.round] }),
				/* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", ac(t.requested, t.served)]
				}),
				t.verdict ? /* @__PURE__ */ b(q, {
					variant: t.verdict === "approved" ? "success" : "warning",
					children: t.stale ? `${t.verdict} (stale)` : t.verdict
				}) : /* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", t.live ? "reviewing" : t.status ?? "no verdict"]
				}),
				/* @__PURE__ */ x("span", {
					className: "ml-auto flex items-center gap-1.5",
					children: [t.link && /* @__PURE__ */ x("a", {
						href: t.link,
						className: "inline-flex items-center gap-1 underline",
						"aria-label": `Attach to the ${t.role} chat, round ${t.round}`,
						children: [/* @__PURE__ */ b(V, {
							size: 12,
							"aria-hidden": "true"
						}), "Attach"]
					}), e.onInfo && /* @__PURE__ */ b(X, {
						icon: Gr,
						label: `Details of ${t.role} round ${t.round}`,
						tooltip: "Open the task's details",
						onClick: e.onInfo
					})]
				})
			]
		}, t.key))
	}) : null;
}
function sc(e) {
	let { task: t, workspaceId: n } = e, r = l(), i = o(() => Kt(r), [r]), a = Di(n), [s, u] = c(!1), [d, f] = c(!1), [m, h] = c(null), g = (t.authority ?? "local") === "local", _ = Ir(e.graph), v = Fr(e.graph), y = async (r, a) => {
		if (e.revision !== null) {
			f(!0), h(null);
			try {
				await i.updateTask(n, t.id, { status: r }, e.revision), u(!1), e.onChanged?.(a);
			} catch (e) {
				h(J(e));
			} finally {
				f(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		"data-hand-set-review": !0,
		className: `flex flex-col gap-2 rounded border p-2 ${e.compact ? "text-xs" : "text-sm"}`,
		style: { borderColor: "color-mix(in srgb, var(--warn, var(--muted)) 55%, var(--border))" },
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: on(t.noSession)
			}),
			t.nextAction ? /* @__PURE__ */ x("span", { children: [/* @__PURE__ */ b("span", {
				className: "text-muted",
				children: "Next: "
			}), t.nextAction] }) : /* @__PURE__ */ b("span", {
				className: "text-muted",
				children: "No next action recorded."
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-1.5",
				children: [
					/* @__PURE__ */ b(Y, {
						icon: ve,
						tooltip: "Start a Kiro Crew chat about this task. It changes nothing.",
						onClick: () => void a.ask({ tasks: [t.id] }),
						children: "Discuss"
					}),
					g && _ && !s && /* @__PURE__ */ b(Y, {
						icon: M,
						disabled: d || e.revision === null,
						tooltip: "Mark it done. Tasks that wait on it may start. You confirm first.",
						onClick: () => u(!0),
						children: "Mark done"
					}),
					g && v && /* @__PURE__ */ b(Y, {
						icon: ke,
						disabled: d || e.revision === null,
						tooltip: `Set its status back to ${v}. The tick may then start it.`,
						onClick: () => void y(v, `Moved ${t.id} back to ${v}.`),
						children: "Back to planned"
					}),
					e.onInfo && /* @__PURE__ */ b(Y, {
						icon: Gr,
						tooltip: "Open this task's details in the drawer",
						onClick: e.onInfo,
						children: "Info"
					})
				]
			}),
			s && _ && /* @__PURE__ */ x("div", {
				role: "group",
				"aria-label": "Confirm mark done",
				className: "flex flex-wrap items-center gap-2",
				"data-confirm-done": !0,
				children: [
					/* @__PURE__ */ x("span", { children: [
						"Mark ",
						t.title,
						" ",
						_,
						"? Tasks that wait on it may start. Edit can set it back."
					] }),
					/* @__PURE__ */ b(p, {
						type: "button",
						onClick: () => u(!1),
						children: "Cancel"
					}),
					/* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						disabled: d,
						onClick: () => void y(_, `Marked ${t.id} ${_}.`),
						children: "Mark done"
					})
				]
			}),
			!g && /* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [t.authority, " owns this task's status; change it there."]
			}),
			(m || a.error) && /* @__PURE__ */ b("span", {
				role: "alert",
				className: "text-danger",
				children: m ?? a.error
			})
		]
	});
}
// kirocrew-app/ui/src/TaskForm.tsx
var cc = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function lc({ id: e, label: t, children: n, hint: r }) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e,
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b("span", { children: t }),
			n,
			r && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: r
			})
		]
	});
}
function uc(e) {
	return /* @__PURE__ */ b("textarea", {
		id: e.id,
		rows: e.rows ?? 3,
		value: e.value,
		placeholder: e.placeholder,
		onChange: (t) => e.onChange(t.target.value),
		className: "rounded border px-2 py-1 text-sm",
		style: cc
	});
}
function dc(e) {
	let [t, n] = c(""), r = o(() => new Map((e.graph?.tasks ?? []).map((e) => [e.id, e.title])), [e.graph]), i = new Set(e.value.map((e) => e.id)), a = t.trim() ? (e.graph?.tasks ?? []).filter((t) => t.id !== e.self && !i.has(t.id)).filter((e) => `${e.id} ${e.title}`.toLowerCase().includes(t.trim().toLowerCase())).slice(0, 8) : [], s = (t, n) => e.onChange(e.value.map((e, r) => r === t ? {
		...e,
		...n
	} : e));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [
			/* @__PURE__ */ b("span", { children: "Prerequisites" }),
			e.value.length === 0 && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: "None. It can start once reviewed."
			}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-1.5",
				children: e.value.map((t, n) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ x("span", {
							className: "min-w-0 flex-1 truncate",
							children: [
								r.get(t.id) ?? t.id,
								" ",
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: t.id
								})
							]
						}),
						/* @__PURE__ */ x("select", {
							"aria-label": `Link kind for ${t.id}`,
							value: t.kind,
							onChange: (e) => s(n, {
								kind: e.target.value,
								condition: ""
							}),
							className: "rounded border px-1 py-0.5 text-xs",
							style: cc,
							children: [/* @__PURE__ */ b("option", {
								value: "requires",
								children: "needs it done"
							}), /* @__PURE__ */ b("option", {
								value: "sequence",
								children: "runs after it"
							})]
						}),
						t.kind === "requires" && /* @__PURE__ */ x("select", {
							"aria-label": `Level for ${t.id}`,
							value: t.condition,
							onChange: (e) => s(n, { condition: e.target.value }),
							className: "rounded border px-1 py-0.5 text-xs",
							style: cc,
							children: [/* @__PURE__ */ b("option", {
								value: "",
								children: "its own completion"
							}), En.map((e) => /* @__PURE__ */ b("option", {
								value: e,
								children: e
							}, e))]
						}),
						/* @__PURE__ */ b(p, {
							onClick: () => e.onChange(e.value.filter((e, t) => t !== n)),
							children: "Remove"
						})
					]
				}, t.id))
			}),
			/* @__PURE__ */ b(g, {
				"aria-label": "Search tasks to add as a prerequisite",
				placeholder: "Search tasks by title or ID",
				value: t,
				onChange: (e) => n(e.target.value)
			}),
			a.length > 0 && /* @__PURE__ */ b("ul", {
				role: "listbox",
				"aria-label": "Matching tasks",
				className: "flex flex-col gap-0.5 rounded border p-1",
				style: { borderColor: "var(--border)" },
				children: a.map((t) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("button", {
					type: "button",
					role: "option",
					"aria-selected": !1,
					className: "w-full truncate text-left text-sm hover:underline",
					onClick: () => {
						e.onChange([...e.value, {
							id: t.id,
							kind: "requires",
							condition: ""
						}]), n("");
					},
					children: [
						t.title,
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: t.id
						})
					]
				}) }, t.id))
			})
		]
	});
}
function fc({ preview: e }) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b("p", { children: e.message }),
			e.link && /* @__PURE__ */ b("a", {
				href: e.link,
				target: "_blank",
				rel: "noreferrer",
				className: "underline",
				children: "Open the issue"
			}),
			e.tasks && /* @__PURE__ */ x("div", {
				className: "text-xs",
				children: [/* @__PURE__ */ x("div", {
					className: "font-medium",
					children: [
						e.folder,
						"tasks.md line ",
						e.tasks.line
					]
				}), /* @__PURE__ */ b("pre", {
					className: "mt-1 whitespace-pre-wrap rounded border p-1",
					style: { borderColor: "var(--border)" },
					children: `- ${e.tasks.before}\n+ ${e.tasks.after}`
				})]
			}),
			e.manifest && /* @__PURE__ */ x("div", {
				className: "text-xs",
				children: [/* @__PURE__ */ x("div", {
					className: "font-medium",
					children: [
						e.folder,
						"avoozl/manifest.json, task ",
						e.manifest.key
					]
				}), /* @__PURE__ */ b("pre", {
					className: "mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border p-1",
					style: { borderColor: "var(--border)" },
					children: JSON.stringify(e.manifest.after, null, 2)
				})]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Nothing was written. Approving the changed plan stays your step."
			})
		]
	});
}
function pc(e) {
	let { workspaceId: t, graph: n, detail: r } = e, i = l(), a = o(() => Cn(i), [i]), s = o(() => r ? kn(r) : null, [r]), [u, d] = c(() => s ?? {
		...On(),
		prerequisites: e.prerequisite ? [{
			id: e.prerequisite,
			kind: "requires",
			condition: ""
		}] : []
	}), [f, m] = c(!1), [h, _] = c(!1), [v, y] = c(null), [S, C] = c(null), w = o(() => new Set((n?.tasks ?? []).map((e) => e.id)), [n]), T = r ? r.task.id : f ? u.id : Tn(u.title, w), E = wn(n?.edges ?? [], T || "(new)", u.prerequisites.map((e) => e.id)), D = (e) => d({
		...u,
		...e
	}), O = r?.locked ?? null, k = !!u.title.trim() && (!!r || /^[a-z][a-z0-9-]{2,80}$/.test(T)) && !E, A = async () => {
		_(!0), y(null);
		try {
			let i = An({
				...u,
				id: T
			}, s);
			if (O) {
				let { id: e, needsReview: n, create: r, ...o } = i;
				C(await a.preview(t, T, o));
				return;
			}
			await a.save(t, i, r?.revision ?? n?.revision ?? 0), e.onSaved(T);
		} catch (e) {
			y(jn(J(e)));
		} finally {
			_(!1);
		}
	};
	return /* @__PURE__ */ x("form", {
		className: "flex flex-col gap-3",
		onSubmit: (e) => {
			e.preventDefault(), A();
		},
		children: [
			O ? /* @__PURE__ */ x("p", {
				className: "rounded border p-2 text-sm",
				style: { borderColor: "var(--border)" },
				children: [
					/* @__PURE__ */ b(q, {
						variant: "warning",
						children: "Locked"
					}),
					" ",
					O.message
				]
			}) : r ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Changing the text marks this task for review again. Other tasks are not touched."
			}) : /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "A new task starts as a draft. It waits for your review before it can start."
			}),
			/* @__PURE__ */ b(lc, {
				id: "avoozl-task-title",
				label: "Title",
				children: /* @__PURE__ */ b(g, {
					id: "avoozl-task-title",
					value: u.title,
					onChange: (e) => D({ title: e.target.value }),
					required: !0
				})
			}),
			!r && /* @__PURE__ */ b(lc, {
				id: "avoozl-task-id",
				label: "Task ID",
				hint: "Lower-case letters, digits and dashes. Made from the title unless you change it.",
				children: /* @__PURE__ */ b(g, {
					id: "avoozl-task-id",
					value: T,
					onChange: (e) => {
						m(!0), D({ id: e.target.value });
					}
				})
			}),
			/* @__PURE__ */ b(lc, {
				id: "avoozl-task-summary",
				label: "Description",
				children: /* @__PURE__ */ b(uc, {
					id: "avoozl-task-summary",
					rows: 4,
					value: u.summary,
					onChange: (e) => D({ summary: e })
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ b(lc, {
					id: "avoozl-task-epic",
					label: "Epic",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-epic",
						value: u.epic,
						onChange: (e) => D({ epic: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: cc,
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: r ? "Keep" : "Inbox"
						}), (n?.epics ?? []).map((e) => /* @__PURE__ */ b("option", {
							value: e.id,
							children: e.title
						}, e.id))]
					})
				}), /* @__PURE__ */ b(lc, {
					id: "avoozl-task-repository",
					label: "Repository",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-repository",
						value: u.repository,
						onChange: (e) => D({ repository: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: cc,
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: "None"
						}), (n?.repositories ?? []).map((e) => /* @__PURE__ */ b("option", {
							value: e,
							children: e
						}, e))]
					})
				})]
			}),
			/* @__PURE__ */ b(lc, {
				id: "avoozl-task-acceptance",
				label: "Acceptance",
				hint: "One condition per line.",
				children: /* @__PURE__ */ b(uc, {
					id: "avoozl-task-acceptance",
					value: u.acceptance,
					onChange: (e) => D({ acceptance: e })
				})
			}),
			/* @__PURE__ */ b(lc, {
				id: "avoozl-task-checks",
				label: "Checks",
				hint: "One command per line, such as npm test.",
				children: /* @__PURE__ */ b(uc, {
					id: "avoozl-task-checks",
					rows: 2,
					value: u.checks,
					onChange: (e) => D({ checks: e })
				})
			}),
			/* @__PURE__ */ b(dc, {
				graph: n,
				self: T,
				value: u.prerequisites,
				onChange: (e) => D({ prerequisites: e })
			}),
			E && /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: [
					"That makes a cycle: ",
					E.join(" → "),
					". Remove one of these prerequisites."
				]
			}),
			v && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: v
			}),
			S && /* @__PURE__ */ b(fc, { preview: S }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ b(p, {
					type: "submit",
					primary: !0,
					disabled: h || !k,
					children: O ? "Draft the plan change" : r ? "Save changes" : "Add draft task"
				}), /* @__PURE__ */ b(p, {
					type: "button",
					onClick: e.onCancel,
					disabled: h,
					children: "Cancel"
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/flow-api.ts
var mc = [
	"queued",
	"coding",
	"tests",
	"commands",
	"ci-wait",
	"review",
	"rework",
	"merge",
	"waiting"
], hc = {
	queued: "#94a3b8",
	coding: "#3b82f6",
	tests: "#10b981",
	commands: "#8b5cf6",
	"ci-wait": "#0ea5e9",
	review: "#ec4899",
	rework: "#ef4444",
	merge: "#14b8a6",
	waiting: "#a8a29e"
}, gc = {
	queued: "Queued",
	coding: "Coding",
	tests: "Tests",
	commands: "Commands",
	"ci-wait": "CI wait",
	review: "Review",
	rework: "Rework",
	merge: "Merge",
	waiting: "Waiting"
};
function _c(e) {
	return Number.isFinite(e) ? e >= 1e6 ? `${(e / 1e6).toFixed(1)}M` : e >= 1e4 ? `${Math.round(e / 1e3)}k` : e >= 1e3 ? `${(e / 1e3).toFixed(1)}k` : String(Math.round(e)) : "–";
}
var vc = (e) => e ? e.toFixed(2) : "0";
function yc(e) {
	return e?.available ? e.total.turns ? null : "No turns recorded for these tasks yet." : "Not available: Kiro Crew has not reported usage for this workspace's chats yet.";
}
function bc(e) {
	let t = [];
	return (e.input || e.output) && t.push(`${_c(e.input)} in · ${_c(e.output)} out`), e.credits && t.push(`${vc(e.credits)} credits`), t.join(" · ") || "none";
}
function xc(e) {
	let t = Array.isArray(e) ? e : Array.isArray(e?.models) ? e.models : [], n = [];
	for (let e of t) {
		let t = e, r = typeof e == "string" ? e : String(t?.model_name ?? t?.model_id ?? t?.id ?? "");
		if (!r || r === "auto" || n.some((e) => e.value === r)) continue;
		let i = typeof e == "string" ? e : String(t?.display_name ?? t?.name ?? r);
		n.push({
			value: r,
			label: i
		});
	}
	return n;
}
function Sc(e, t) {
	let n = [{
		value: "auto",
		label: "auto (Kiro Crew picks)"
	}, ...e];
	return t && !n.some((e) => e.value === t) && n.push({
		value: t,
		label: `${t} (not offered now)`
	}), n;
}
var Cc = "avoozl.flow.filter.", wc = {
	event: "avoozl:flow-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Cc + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Cc + t, JSON.stringify(n));
		} catch {}
	}
}, Tc = [
	{
		value: "10",
		label: "Last 10 tasks"
	},
	{
		value: "20",
		label: "Last 20 tasks"
	},
	{
		value: "50",
		label: "Last 50 tasks"
	}
];
function Ec(e) {
	let t = (t, n, r = {}) => e.post(Nt, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e, n = {}) => t(e, "flow.view", {
			...n.repository ? { repository: n.repository } : {},
			...n.epic ? { epic: n.epic } : {},
			...n.window ? { window: Number(n.window) } : {},
			...n.stage ? { stage: n.stage } : {}
		}),
		runAnyway: (e, n) => t(e, "flow.runAnyway", {
			stopId: n,
			confirm: !0
		}),
		stop: (e, n) => t(e, "flow.stop", { ...n }),
		resume: (e, n) => t(e, "flow.resume", { stopId: n }),
		startRetro: (e) => t(e, "flow.retro.start"),
		decide: (e, n) => t(e, "flow.retro.decide", n),
		settings: (e) => t(e, "flow.settings.get"),
		saveSettings: (e, n) => t(e, "flow.settings.update", n),
		models: () => e.get("/api/models").then(xc),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n })
	};
}
function Dc(e) {
	if (e == null || !Number.isFinite(e)) return "–";
	let t = Math.round(e / 6e4);
	if (e < 6e4) return `${Math.round(e / 1e3)} s`;
	if (t < 60) return `${t} m`;
	let n = Math.floor(t / 60), r = t % 60;
	return n < 48 ? r ? `${n} h ${r} m` : `${n} h` : `${Math.round(n / 24)} d`;
}
var Oc = (e) => e == null ? "–" : `${Math.round(e * 100)}%`;
function kc(e) {
	let t = e.metrics, n = e.previous;
	return [
		{
			key: "lead",
			title: "Lead time",
			value: Dc(t.leadTimeMs),
			was: n.tasks ? Dc(n.leadTimeMs) : null,
			empty: t.leadTimeMs === null ? "Finish a task to see lead time." : null,
			tip: "Median time from ready to integrated or merged."
		},
		{
			key: "efficiency",
			title: "Flow efficiency",
			value: Oc(t.flowEfficiency),
			was: n.tasks ? Oc(n.flowEfficiency) : null,
			empty: t.flowEfficiency === null ? "Finish a task to see how much of its time was active." : null,
			tip: "Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting."
		},
		{
			key: "first-pass",
			title: "First-pass rate",
			value: Oc(t.firstPassRate),
			was: n.tasks ? Oc(n.firstPassRate) : null,
			empty: t.firstPassRate === null ? "Finish a task to see how many pass the first time." : null,
			tip: "Tasks accepted on their first attempt with no rework."
		},
		{
			key: "fix",
			title: "Time to fix",
			value: Dc(t.timeToFixMs),
			was: n.tasks && n.timeToFixMs !== null ? Dc(n.timeToFixMs) : null,
			empty: t.timeToFixMs === null ? "No line stop yet." : null,
			tip: "From the line stopping to the check passing on the branch again."
		}
	];
}
function Ac(e) {
	let t = mc.reduce((t, n) => t + (e[n] || 0), 0);
	return t ? mc.filter((t) => e[t] > 0).map((n) => ({
		stage: n,
		ms: e[n],
		share: e[n] / t,
		color: hc[n],
		label: gc[n]
	})) : [];
}
var jc = {
	"tool-calls": "from tool calls",
	markers: "from phase markers (coarse)",
	events: "from events"
};
function Mc(e) {
	if (e.type === "plan") return `${e.change} (spec ${e.spec})`;
	let t = e.file === "repository" ? ` in ${e.repository}` : "";
	return `${e.key} ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}${t}`;
}
var Nc = (e) => `${e.metric} ${e.direction === "down" ? "↓" : "↑"}`;
function Pc(e) {
	if (e.status !== "approved" || !e.pdca) return null;
	if (!e.pdca.result) return `PDCA: measuring over the next ${e.pdca.window} tasks.`;
	let t = e.pdca.result === "helped" ? "helped" : e.pdca.result === "worse" ? "worse" : "did not help", n = (t) => t == null ? "–" : /rate|efficiency/.test(e.metric) ? Oc(t) : Dc(t);
	return `PDCA: ${e.metric} ${n(e.pdca.before)} → ${n(e.pdca.after)}, ${t}.`;
}
function Fc(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var Ic = [
	{
		value: "all",
		label: "Everything",
		line: "No new work starts anywhere in this workspace."
	},
	{
		value: "repo",
		label: "One repository",
		line: "No new work starts in the repository you pick."
	},
	{
		value: "spec",
		label: "One spec",
		line: "No new work starts for the tasks of the spec you pick."
	},
	{
		value: "task",
		label: "One task and its dependents",
		line: "The task and everything that waits on it hold."
	}
], Lc = () => ({
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function Rc(e) {
	let t = e.reason.trim();
	return t ? /[\r\n]/.test(t) ? { error: "Keep the reason to one line." } : t.length > 200 ? { error: "Keep the reason to 200 characters or fewer." } : e.scope === "repo" ? e.repository ? { input: {
		scope: "repo",
		repository: e.repository,
		reason: t
	} } : { error: "Pick a repository." } : e.scope === "spec" ? e.spec ? { input: {
		scope: "spec",
		spec: e.spec,
		reason: t
	} } : { error: "Pick a spec." } : e.scope === "task" ? e.taskId ? { input: {
		scope: "task",
		taskId: e.taskId,
		reason: t
	} } : { error: "Pick a task." } : { input: {
		scope: "all",
		reason: t
	} } : { error: "Reason is required." };
}
function zc(e) {
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${Fc(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
function Bc(e) {
	return !!(e.repository || e.epic || e.window || e.stage);
}
var Vc = {
	scope: "dependents",
	localChecksFirst: !0,
	max: 3,
	by: "epic",
	everyTasks: 10,
	slowFactor: 2,
	model: "auto"
};
function Hc(e = {}) {
	return {
		scope: e.stopTheLine?.scope ?? "",
		localChecksFirst: e.localChecksFirst === void 0 ? "" : e.localChecksFirst ? "on" : "off",
		max: e.batch?.max === void 0 ? "" : String(e.batch.max),
		by: e.batch?.by ?? "",
		everyTasks: e.retro?.everyTasks === void 0 ? "" : String(e.retro.everyTasks),
		slowFactor: e.retro?.slowFactor === void 0 ? "" : String(e.retro.slowFactor),
		model: e.retro?.model ?? ""
	};
}
function Uc(e) {
	let t = {};
	e.scope && (t.stopTheLine = { scope: e.scope }), e.localChecksFirst && (t.localChecksFirst = e.localChecksFirst === "on");
	let n = {};
	if (e.max.trim()) {
		let t = Number(e.max);
		if (!Number.isInteger(t) || t < 1 || t > 10) return { error: "Most tasks per run must be a whole number 1–10." };
		n.max = t;
	}
	e.by && (n.by = e.by), Object.keys(n).length && (t.batch = n);
	let r = {};
	if (e.everyTasks.trim()) {
		let t = Number(e.everyTasks);
		if (!Number.isInteger(t) || t < 1 || t > 1e3) return { error: "After this many tasks must be a whole number 1–1000." };
		r.everyTasks = t;
	}
	if (e.slowFactor.trim()) {
		let t = Number(e.slowFactor);
		if (!Number.isFinite(t) || t < 1.1 || t > 20) return { error: "Slow when over must be a number 1.1–20." };
		r.slowFactor = t;
	}
	if (e.model.trim()) {
		if (!/^(?:auto|[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})$/.test(e.model.trim())) return { error: "Model must be a model name or auto." };
		r.model = e.model.trim();
	}
	return Object.keys(r).length && (t.retro = r), { flow: t };
}
// kirocrew-app/ui/src/FlowCharts.tsx
var Wc = 300, Gc = 90, Kc = 4;
function qc({ points: e, value: t, format: n, color: r }) {
	let i = e.map(t), a = i.filter((e) => e !== null), o = Math.max(...a, 0) || 1, s = (t) => e.length < 2 ? Wc / 2 : Kc + t * 292 / (e.length - 1), c = (e) => 86 - e / o * 82, l = i.map((e, t) => e === null ? null : `${s(t)},${c(e)}`).reduce((e, t) => (t === null ? e.push([]) : e[e.length - 1].push(t), e), [[]]).filter((e) => e.length), u = a.at(-1);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ b("span", {
			className: "text-lg font-semibold tabular-nums",
			children: u === void 0 ? "–" : n(u)
		}), /* @__PURE__ */ x("svg", {
			viewBox: `0 0 ${Wc} ${Gc}`,
			width: "100%",
			height: Gc,
			role: "img",
			"aria-label": e.map((e, t) => `${e.key}: ${i[t] === null ? "none" : n(i[t])}`).join(", "),
			preserveAspectRatio: "none",
			children: [
				/* @__PURE__ */ b("line", {
					x1: 0,
					x2: Wc,
					y1: 86,
					y2: 86,
					stroke: "var(--border)",
					strokeWidth: 1
				}),
				l.map((e, t) => /* @__PURE__ */ b("polyline", {
					points: e.join(" "),
					fill: "none",
					stroke: r,
					strokeWidth: 2,
					vectorEffect: "non-scaling-stroke"
				}, t)),
				i.map((e, t) => e === null ? null : /* @__PURE__ */ b("circle", {
					cx: s(t),
					cy: c(e),
					r: 2.5,
					fill: r
				}, t))
			]
		})]
	});
}
function Jc({ points: e }) {
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-1",
		children: /* @__PURE__ */ b("div", {
			className: "flex items-end gap-1",
			style: { height: Gc },
			role: "img",
			"aria-label": "Stage mix per period",
			children: e.map((e) => {
				let t = mc.reduce((t, n) => t + e.stages[n], 0);
				return /* @__PURE__ */ b(K, {
					text: `${e.key}: ${mc.filter((t) => e.stages[t]).map((t) => `${gc[t]} ${Dc(e.stages[t])}`).join(", ") || "no time"}`,
					children: (n) => /* @__PURE__ */ b("div", {
						tabIndex: 0,
						"aria-describedby": n,
						className: "flex flex-col-reverse overflow-hidden rounded-sm",
						style: {
							height: Gc,
							width: 14,
							background: "color-mix(in srgb, var(--muted) 12%, transparent)"
						},
						children: mc.filter((t) => e.stages[t]).map((n) => /* @__PURE__ */ b("span", { style: {
							height: `${100 * e.stages[n] / (t || 1)}%`,
							background: hc[n],
							display: "block"
						} }, n))
					})
				}, e.key);
			})
		})
	});
}
function Yc({ rows: e }) {
	let t = (e) => e.credits || e.input + e.output, n = Math.max(...e.map(t), 0) || 1;
	return /* @__PURE__ */ b("div", {
		className: "flex items-end gap-1",
		style: { height: Gc },
		role: "img",
		"aria-label": e.map((e) => `${e.key}: ${bc(e)}`).join(", "),
		children: e.map((e) => /* @__PURE__ */ b("span", {
			className: "rounded-sm",
			style: {
				display: "block",
				flex: "none",
				height: Math.max(2, Math.round(Gc * t(e) / n)),
				width: 14,
				background: "var(--accent)"
			}
		}, e.key))
	});
}
function Xc({ title: e, children: t, empty: n }) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 rounded-lg border p-3",
		style: { borderColor: "var(--border)" },
		children: [/* @__PURE__ */ b(Z, {
			level: 4,
			title: e
		}), n ? /* @__PURE__ */ b("span", {
			className: "text-sm text-muted",
			children: "Nothing finished in this window yet."
		}) : t]
	});
}
function Zc({ unit: e, onUnit: t }) {
	return /* @__PURE__ */ b("div", {
		role: "radiogroup",
		"aria-label": "Group by",
		className: "inline-flex gap-1 rounded-lg p-1",
		style: { background: "var(--bg-elevated)" },
		children: ["day", "week"].map((n) => /* @__PURE__ */ b("button", {
			type: "button",
			role: "radio",
			"aria-checked": e === n,
			onClick: () => t(n),
			className: "rounded-md px-2.5 py-1 text-xs font-medium",
			style: {
				background: e === n ? "var(--card)" : "transparent",
				color: "var(--text)",
				boxShadow: e === n ? "inset 0 0 0 1px var(--accent)" : "none"
			},
			children: n === "day" ? "By day" : "By week"
		}, n))
	});
}
function Qc({ view: e, unit: t, onUnit: n }) {
	let r = e.series?.[t] ?? [], i = !r.length;
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Z, {
				title: "Over time",
				actions: /* @__PURE__ */ b(Zc, {
					unit: t,
					onUnit: n
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
				"data-flow-charts": !0,
				children: [
					/* @__PURE__ */ b(Xc, {
						title: "Lead time (median)",
						empty: i,
						children: /* @__PURE__ */ b(qc, {
							points: r,
							value: (e) => e.leadTimeMs,
							format: Dc,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(Xc, {
						title: "Flow efficiency",
						empty: i,
						children: /* @__PURE__ */ b(qc, {
							points: r,
							value: (e) => e.flowEfficiency,
							format: Oc,
							color: "var(--ok)"
						})
					}),
					/* @__PURE__ */ b(Xc, {
						title: "First-pass rate",
						empty: i,
						children: /* @__PURE__ */ b(qc, {
							points: r,
							value: (e) => e.firstPassRate,
							format: Oc,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(Xc, {
						title: "Time to fix",
						empty: !r.some((e) => e.timeToFixMs !== null),
						children: /* @__PURE__ */ b(qc, {
							points: r,
							value: (e) => e.timeToFixMs,
							format: Dc,
							color: "var(--danger)"
						})
					}),
					/* @__PURE__ */ b(Xc, {
						title: "Stage mix",
						empty: i,
						children: /* @__PURE__ */ b(Jc, { points: r })
					})
				]
			}),
			!i && /* @__PURE__ */ b(rl, {})
		]
	});
}
function $c({ title: e, rows: t }) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1",
		children: [/* @__PURE__ */ b("span", {
			className: "text-xs text-muted",
			children: e
		}), /* @__PURE__ */ b("ul", {
			className: "flex flex-col gap-0.5 text-sm",
			children: t.slice(0, 8).map((e) => /* @__PURE__ */ x("li", {
				className: "flex flex-wrap justify-between gap-x-3",
				children: [/* @__PURE__ */ b("span", {
					className: "min-w-0 truncate",
					children: gc[e.key] ?? e.key
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums text-muted",
					children: bc(e)
				})]
			}, e.key))
		})]
	});
}
function el({ view: e, unit: t }) {
	let n = e.usage, r = yc(n), i = t === "day" ? n?.byDay ?? [] : n?.byWeek ?? [];
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		"data-usage-card": !0,
		children: [/* @__PURE__ */ b(Z, { title: "Tokens and credits" }), r || !n ? /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: r
		}) : /* @__PURE__ */ x(y, { children: [
			/* @__PURE__ */ x("p", {
				className: "text-sm",
				children: [
					"Total: ",
					/* @__PURE__ */ b("span", {
						className: "tabular-nums",
						children: bc(n.total)
					}),
					" over ",
					n.total.turns,
					" turns."
				]
			}),
			i.length > 0 && /* @__PURE__ */ x("div", {
				className: "flex min-w-0 flex-col gap-1",
				children: [/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: t === "day" ? "By day" : "By week"
				}), /* @__PURE__ */ b(Yc, { rows: i })]
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-4",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
				children: [
					/* @__PURE__ */ b($c, {
						title: "By stage",
						rows: n.byStage
					}),
					/* @__PURE__ */ b($c, {
						title: "By model",
						rows: n.byModel
					}),
					/* @__PURE__ */ b($c, {
						title: "By plan",
						rows: n.byPlan
					}),
					/* @__PURE__ */ b($c, {
						title: "By task (top 8)",
						rows: n.byTask
					})
				]
			})
		] })]
	});
}
// kirocrew-app/ui/src/FlowView.tsx
var tl = {
	display: "flex",
	height: 12,
	borderRadius: 4,
	overflow: "hidden",
	background: "color-mix(in srgb, var(--muted) 15%, transparent)"
};
function nl({ stages: e, scale: t, label: n }) {
	let r = Ac(e), i = r.reduce((e, t) => e + t.ms, 0), a = `${n}: ${r.map((e) => `${e.label} ${Dc(e.ms)}`).join(", ") || "no time yet"}`;
	return /* @__PURE__ */ b("div", {
		style: { width: `${Math.max(4, t ? 100 * i / t : 100)}%` },
		children: /* @__PURE__ */ b(K, {
			text: a,
			display: "block",
			children: (e) => /* @__PURE__ */ b("div", {
				role: "img",
				"aria-label": a,
				"aria-describedby": e,
				tabIndex: 0,
				style: tl,
				children: r.map((e) => /* @__PURE__ */ b("span", { style: {
					width: `${e.share * 100}%`,
					background: e.color,
					display: "block",
					height: "100%"
				} }, e.stage))
			})
		})
	});
}
function rl() {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
		"aria-label": "Stages",
		children: mc.map((e) => /* @__PURE__ */ x("li", {
			className: "inline-flex items-center gap-1",
			children: [/* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					width: 10,
					height: 10,
					borderRadius: 2,
					background: hc[e],
					display: "inline-block"
				}
			}), gc[e]]
		}, e))
	});
}
function il({ stops: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Ec(r), [r]), a = ur(), s = xi(), [u, d] = c(null);
	if (!e.length) return null;
	let f = async (e) => {
		if (t && await s({
			title: "Run anyway?",
			body: `New work will start while ${e.check ? `\`${e.check}\`` : "the line"} still fails on ${e.branch}. The stop stays open and shows who ran anyway.`,
			action: "Run anyway"
		})) try {
			await i.runAnyway(t, e.id), n?.();
		} catch (e) {
			d(J(e));
		}
	}, p = async (e) => {
		if (t && await s({
			title: "Resume the line?",
			body: `New work starts again in ${Fc(e)}. The stop was pulled for: ${e.reason ?? ""}`,
			action: "Resume"
		})) try {
			await i.resume(t, e.id), n?.();
		} catch (e) {
			d(J(e));
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		"data-line-banner": !0,
		children: [e.map((e) => /* @__PURE__ */ x("div", {
			role: "alert",
			className: "flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
			style: {
				borderColor: "var(--danger)",
				background: "color-mix(in srgb, var(--danger) 10%, var(--card))"
			},
			children: [
				/* @__PURE__ */ b(F, {
					size: 18,
					"aria-hidden": "true",
					style: {
						color: "var(--danger)",
						flex: "none"
					}
				}),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-0.5",
					style: { minWidth: "14rem" },
					children: [
						/* @__PURE__ */ b("span", {
							style: { overflowWrap: "anywhere" },
							children: zc(e)
						}),
						e.manual && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"data-line-pulled": !0,
							children: [
								"Pulled by ",
								e.by?.name ?? "someone",
								", ",
								Mn(e.openedAt, Date.now()),
								". Only a person can resume it."
							]
						}),
						e.runAnyway && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								"Run anyway by ",
								e.runAnyway.by,
								", ",
								Mn(e.runAnyway.at, Date.now()),
								"."
							]
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [
						e.fixTaskId && /* @__PURE__ */ b(Y, {
							icon: Gr,
							tooltip: "Open the fix task's details in the drawer",
							onClick: () => a.openTask(e.fixTaskId),
							children: "Open fix task"
						}),
						e.manual && /* @__PURE__ */ b(Y, {
							icon: Te,
							tooltip: "Start new work again in this scope; asks first",
							onClick: () => void p(e),
							children: "Resume"
						}),
						!e.manual && !e.runAnyway && /* @__PURE__ */ b(Y, {
							icon: Te,
							tooltip: "Resume new work while the check still fails; asks first",
							onClick: () => void f(e),
							style: _i,
							children: "Run anyway"
						})
					]
				})
			]
		}, e.id)), u && /* @__PURE__ */ b("p", {
			role: "alert",
			className: "text-sm text-danger",
			children: u
		})]
	});
}
function al({ view: e }) {
	return /* @__PURE__ */ b("div", {
		className: "grid gap-3",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" },
		"data-flow-cards": !0,
		children: kc(e).map((e) => /* @__PURE__ */ x(m, {
			className: "flex flex-col gap-1",
			children: [/* @__PURE__ */ b(K, {
				text: e.tip,
				children: (t) => /* @__PURE__ */ b("span", {
					"aria-describedby": t,
					tabIndex: 0,
					className: "text-xs text-muted",
					style: { width: "fit-content" },
					children: e.title
				})
			}), e.empty ? /* @__PURE__ */ b("span", {
				className: "text-sm text-muted",
				children: e.empty
			}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("span", {
				className: "text-2xl font-semibold tabular-nums",
				children: e.value
			}), /* @__PURE__ */ b("span", {
				className: "text-xs text-muted tabular-nums",
				children: e.was ? `was ${e.was}` : "no earlier window"
			})] })]
		}, e.key))
	});
}
function ol({ tasks: e }) {
	let t = ur(), n = fl("(max-width: 767px)"), r = Oi(String(e.length)), i = Math.max(0, ...e.map((e) => mc.reduce((t, n) => t + (e.stages[n] || 0), 0))), a = r.take("flow-bars", e);
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-2",
		children: [
			/* @__PURE__ */ b(Z, { title: "Time per task" }),
			/* @__PURE__ */ b(rl, {}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-1.5",
				children: a.map((e) => {
					let r = /* @__PURE__ */ x("span", {
						className: "min-w-0 truncate",
						children: [
							/* @__PURE__ */ b("span", {
								className: "tabular-nums",
								children: e.taskId
							}),
							" ",
							/* @__PURE__ */ b("span", {
								className: "text-muted",
								children: e.title
							})
						]
					}), a = /* @__PURE__ */ b(nl, {
						stages: e.stages,
						scale: i,
						label: e.taskId
					}), o = /* @__PURE__ */ x("span", {
						className: "inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
						children: [
							e.coarse && /* @__PURE__ */ b(K, {
								text: "Built from phase markers or events, not from tool calls",
								children: (e) => /* @__PURE__ */ b("span", {
									"aria-describedby": e,
									tabIndex: 0,
									className: "text-xs text-muted",
									children: "(coarse)"
								})
							}),
							e.batch && /* @__PURE__ */ b(q, { children: "batch" }),
							Dc(e.leadMs),
							/* @__PURE__ */ b(K, {
								text: "Open this task's details in the drawer",
								children: (n) => /* @__PURE__ */ b("button", {
									type: "button",
									"aria-label": `Details for ${e.taskId}`,
									"aria-describedby": n,
									onClick: () => t.openTask(e.taskId),
									style: {
										display: "inline-flex",
										color: "var(--muted)"
									},
									children: /* @__PURE__ */ b(Gr, {
										size: 14,
										"aria-hidden": "true"
									})
								})
							})
						]
					});
					return n ? /* @__PURE__ */ x("li", {
						className: "flex flex-col gap-1 text-sm",
						"data-flow-bar": e.taskId,
						children: [/* @__PURE__ */ x("span", {
							className: "flex items-center justify-between gap-2",
							children: [r, o]
						}), a]
					}, e.taskId) : /* @__PURE__ */ x("li", {
						className: "grid items-center gap-2 text-sm",
						style: { gridTemplateColumns: "minmax(6rem, 14rem) minmax(0, 1fr) auto" },
						"data-flow-bar": e.taskId,
						children: [
							r,
							a,
							o
						]
					}, e.taskId);
				})
			}),
			/* @__PURE__ */ b(ki, { ...r.more("flow-bars", e.length) }),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "(coarse) marks bars built from reports, not tool calls."
			})
		]
	});
}
function sl({ proposal: e, retro: t, onDecide: n, busy: r }) {
	let i = Pc(e);
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-3 border-t pt-2 first:border-t-0 first:pt-0",
		style: { borderColor: "var(--border)" },
		"data-proposal": `${t.id}:${e.id}`,
		children: [/* @__PURE__ */ x("div", {
			className: "flex min-w-0 flex-1 flex-col gap-0.5 text-sm",
			style: { minWidth: "14rem" },
			children: [
				/* @__PURE__ */ x("span", {
					style: { overflowWrap: "anywhere" },
					children: [
						/* @__PURE__ */ b("code", {
							className: "text-xs",
							children: Mc(e)
						}),
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-muted",
							children: Nc(e)
						}),
						e.removesCheck && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(q, {
							variant: "warning",
							children: "removes a check"
						})] }),
						e.revertOf && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(q, { children: "revert" })] })
					]
				}),
				/* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					style: { overflowWrap: "anywhere" },
					children: ["Evidence: ", e.evidence]
				}),
				e.status !== "open" && /* @__PURE__ */ x("span", {
					className: "text-xs",
					children: [e.status === "approved" ? "Approved" : `Rejected${e.reason ? `: ${e.reason}` : ""}`, i ? ` · ${i}` : ""]
				})
			]
		}), e.status === "open" && /* @__PURE__ */ x("div", {
			className: "flex gap-2",
			children: [/* @__PURE__ */ b(p, {
				type: "button",
				disabled: r,
				onClick: () => n(t, e, "reject"),
				children: "Reject"
			}), /* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				disabled: r,
				onClick: () => n(t, e, "approve"),
				children: "Approve"
			})]
		})]
	});
}
function cl({ view: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Ec(r), [r]), a = xi(), [s, u] = c(!1), [d, f] = c(null), [p, h] = c(!1), g = async (e, r, o) => {
		if (!t) return;
		let s = !1;
		if (!(o === "approve" && r.removesCheck && (s = await a({
			title: "Approve removing a check?",
			body: `${Mc(r)} removes a review role or a declared check, so fewer things are checked before work lands.`,
			action: "Remove the check"
		}), !s))) {
			u(!0), f(null);
			try {
				let { hash: a } = await i.settings(t);
				await i.decide(t, {
					retroId: e.id,
					proposalId: r.id,
					decision: o,
					expectedHash: a,
					...s ? { confirmRemoval: !0 } : {}
				}), n();
			} catch (e) {
				f(J(e));
			} finally {
				u(!1);
			}
		}
	}, _ = async () => {
		if (t) try {
			await i.startRetro(t), h(!0);
		} catch (e) {
			f(J(e));
		}
	}, v = e.retros.some((e) => e.state === "running");
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Z, {
				title: "Retros",
				actions: /* @__PURE__ */ b(Y, {
					icon: Te,
					disabled: v || p,
					tooltip: "Start a retro at the next tick instead of waiting for its trigger",
					onClick: () => void _(),
					children: p ? "Starts at the next tick" : "Run a retro now"
				})
			}),
			d && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: d
			}),
			e.retros.length ? /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-3",
				children: e.retros.map((e) => /* @__PURE__ */ x("li", {
					className: "flex flex-col gap-2",
					"data-retro": e.id,
					children: [
						/* @__PURE__ */ x("span", {
							className: "text-sm font-semibold",
							children: [
								"Retro ",
								e.n,
								" · ",
								e.triggers.map((e) => e.detail).join("; ") || "started",
								e.bottleneck ? ` · bottleneck ${gc[e.bottleneck.stage] ?? e.bottleneck.stage}` : ""
							]
						}),
						e.state === "running" && /* @__PURE__ */ x("span", {
							className: "text-sm text-muted",
							children: [
								"Running since ",
								Mn(e.startedAt, Date.now()),
								"."
							]
						}),
						e.state === "failed" && /* @__PURE__ */ x("span", {
							className: "text-sm text-danger",
							children: ["Failed: ", e.error]
						}),
						e.bottleneck && /* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: e.bottleneck.evidence
						}),
						e.proposals.length > 0 && /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-2",
							children: e.proposals.map((t) => /* @__PURE__ */ b(sl, {
								proposal: t,
								retro: e,
								onDecide: (e, t, n) => void g(e, t, n),
								busy: s
							}, t.id))
						}),
						e.dropped?.length > 0 && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["Dropped: ", e.dropped.map((e) => `${e.key ?? `proposal ${e.index + 1}`} (${e.reason})`).join("; ")]
						})
					]
				}, e.id))
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "A retro runs after 10 finished tasks."
			})
		]
	});
}
function ll({ view: e }) {
	return !e.flaky.length && !e.ciOnly.length ? null : /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b(Z, { title: "Checks that disagree" }),
			e.ciOnly.slice(0, 10).map((e) => /* @__PURE__ */ x("span", { children: [
				"CI only: ",
				e.checks.join(", "),
				" failed in CI on ",
				e.taskId,
				" (",
				e.commit.slice(0, 7),
				") after passing here."
			] }, e.id)),
			e.flaky.slice(0, 10).map((e) => /* @__PURE__ */ x("span", { children: [
				"Flaky: ",
				/* @__PURE__ */ b("code", {
					className: "text-xs",
					children: e.check
				}),
				" failed, then passed on ",
				e.commit.slice(0, 7),
				"."
			] }, e.id))
		]
	});
}
function ul({ workspaceId: e }) {
	let n = l(), r = o(() => Ec(n), [n]), [i, a] = Oa(e, wc), s = JSON.stringify(i), { value: u, error: d, busy: f, reload: p } = ya(e, t((e) => r.view(e, JSON.parse(s)), [r, s])), g = (e) => a({
		...i,
		...e
	}), [_, v] = c("day");
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-flow-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-flow-title",
				view: "flow",
				children: "Flow"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Where delivery time goes, and what the last retro proposed."
			}),
			d && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: d
			}),
			u ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(il, {
					stops: u.line,
					workspaceId: e,
					onChanged: () => void p()
				}),
				/* @__PURE__ */ b(Ea, {
					id: "avoozl-flow",
					label: "Filter flow timing",
					active: Bc(i),
					onClear: () => a({}),
					fields: [
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: i.repository ?? "",
							options: [...u.repositories.map((e) => ({
								value: e,
								label: e
							}))],
							onChange: (e) => g({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: i.epic ?? "",
							options: [...u.epics.map((e) => ({
								value: e.id,
								label: e.title
							}))],
							onChange: (e) => g({ epic: e || void 0 })
						},
						{
							kind: "select",
							key: "window",
							label: "Window",
							value: i.window ?? "20",
							options: Tc,
							onChange: (e) => g({ window: e || void 0 })
						},
						{
							kind: "select",
							key: "stage",
							label: "Stage",
							value: i.stage ?? "",
							options: [...mc.map((e) => ({
								value: e,
								label: gc[e]
							}))],
							onChange: (e) => g({ stage: e || void 0 })
						}
					]
				}),
				/* @__PURE__ */ b(al, { view: u }),
				u.bottleneck && /* @__PURE__ */ x(m, {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b(ae, {
						size: 18,
						"aria-hidden": "true",
						style: {
							color: hc[u.bottleneck.stage],
							flex: "none"
						}
					}), /* @__PURE__ */ x("span", { children: [
						/* @__PURE__ */ x("span", {
							className: "font-semibold",
							children: ["Biggest bottleneck: ", gc[u.bottleneck.stage]]
						}),
						", ",
						Math.round(u.bottleneck.share * 100),
						"% of lead time",
						u.bottleneck.repository ? ` in ${u.bottleneck.repository}` : "",
						" (median ",
						Dc(u.bottleneck.medianMs),
						" per task)."
					] })]
				}),
				u.tasks.length ? /* @__PURE__ */ b(ol, { tasks: u.tasks }) : /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(ae, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "No timing yet",
					subtitle: "Avoozl records where each task's time goes as soon as a task is dispatched."
				}),
				/* @__PURE__ */ b(Qc, {
					view: u,
					unit: _,
					onUnit: v
				}),
				/* @__PURE__ */ b(el, {
					view: u,
					unit: _
				}),
				/* @__PURE__ */ b(ll, { view: u }),
				/* @__PURE__ */ b(cl, {
					view: u,
					workspaceId: e,
					onChanged: () => void p()
				})
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: f ? "Loading…" : "Not loaded"
			})
		]
	});
}
function dl({ timing: e }) {
	return e ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		"data-timing-fold": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(nl, {
						stages: e.stages,
						scale: 0,
						label: e.taskId
					})
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Dc(e.leadMs)
				})]
			}),
			e.batch && /* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: [
					"Ran in ",
					e.batch,
					"."
				]
			}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5",
				children: e.spans.map((e) => /* @__PURE__ */ x("li", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ b("span", {
							"aria-hidden": "true",
							style: {
								width: 8,
								height: 8,
								borderRadius: 2,
								background: hc[e.stage] ?? "var(--muted)",
								flex: "none"
							}
						}),
						/* @__PURE__ */ b("span", { children: gc[e.stage] ?? e.stage }),
						e.detail && /* @__PURE__ */ b("code", {
							className: "text-xs",
							children: e.detail
						}),
						/* @__PURE__ */ b("span", {
							className: "tabular-nums",
							children: Dc(e.lengthMs)
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: jc[e.source]
						})
					]
				}, e.id))
			})
		]
	}) : /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "No timing yet: Avoozl records it from the task's first dispatch."
	});
}
// kirocrew-app/ui/src/TaskDrawer.tsx
function fl(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
function pl({ label: e, children: t }) {
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
		className: "text-muted",
		children: e
	}), /* @__PURE__ */ b("dd", {
		className: "min-w-0 break-words",
		children: t
	})] });
}
function ml({ title: e, links: t, open: n }) {
	return /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
		className: "text-sm font-semibold",
		children: e
	}), t.length === 0 ? /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Nothing."
	}) : /* @__PURE__ */ b("ul", {
		className: "mt-1 flex flex-col gap-1 text-sm",
		children: t.map((e) => /* @__PURE__ */ x("li", {
			className: "flex flex-wrap items-baseline gap-1.5",
			children: [/* @__PURE__ */ b("button", {
				type: "button",
				className: "underline",
				onClick: () => n(e.id),
				children: e.title
			}), /* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: [
					e.id,
					" · ",
					e.kind === "sequence" ? "runs after" : "needs done",
					e.condition ? ` (${e.condition})` : "",
					" · ",
					e.satisfied ? "met" : "waiting"
				]
			})]
		}, `${e.id}:${e.kind}`))
	})] });
}
function hl(e) {
	let { origin: n } = e, i = l(), a = o(() => Cn(i), [i]), [s, u] = c(null), [d, f] = c(null), p = t(() => f(null), []), m = async (t) => {
		if (s?.source === t) return u(null);
		u({
			source: t,
			text: null,
			error: null
		});
		try {
			let n = await a.document(e.workspaceId, t.document);
			u({
				source: t,
				text: n.text,
				error: null
			});
		} catch (e) {
			u({
				source: t,
				text: null,
				error: J(e)
			});
		}
	}, h = n.sources[0], g = n.sources.find((e) => e.readable) ?? null;
	return r(() => {
		g && m(g);
	}, [g?.document, g?.lineStart]), /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1.5",
		"data-origin": n.kind,
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: n.label
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: h?.readable ? vn(n.text, h.document).map((e, t) => e.link ? /* @__PURE__ */ b("button", {
					type: "button",
					className: "underline",
					style: {
						color: "var(--accent)",
						overflowWrap: "anywhere"
					},
					onClick: () => f(h),
					"data-origin-path": !0,
					children: e.text
				}, t) : e.text) : n.text
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					n.kind === "github-issue" && e.issue && /* @__PURE__ */ b("a", {
						href: e.issue,
						target: "_blank",
						rel: "noopener noreferrer",
						className: "text-xs underline",
						children: "Open the issue on GitHub"
					}),
					n.spec && e.onOpenSpec && /* @__PURE__ */ x("button", {
						type: "button",
						className: "text-xs underline",
						onClick: () => e.onOpenSpec(n.spec),
						children: [
							"Open spec ",
							n.spec,
							" in Plans"
						]
					}),
					n.sources.map((e) => e.readable ? /* @__PURE__ */ x("span", {
						className: "inline-flex flex-wrap gap-2",
						children: [/* @__PURE__ */ b(Y, {
							icon: U,
							tooltip: `Open all of ${e.document} in a reader, at the cited line`,
							onClick: () => f(e),
							"aria-label": `Open full file ${e.document}`,
							children: "Open full file"
						}), /* @__PURE__ */ x(Y, {
							icon: H,
							tooltip: "Show the lines this task was made from here, read from the file now",
							onClick: () => void m(e),
							"aria-label": `${s?.source === e ? "Hide" : "Read"} ${_n(e)}`,
							children: [
								s?.source === e ? "Hide" : "Read",
								" ",
								_n(e)
							]
						})]
					}, e.document + e.lineStart) : /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [_n(e), " (no longer in this workspace)"]
					}, e.document))
				]
			}),
			n.prompt && /* @__PURE__ */ b("blockquote", {
				className: "border-l-2 pl-2 text-xs text-muted",
				style: { borderColor: "var(--border)" },
				children: n.prompt
			}),
			s && /* @__PURE__ */ b("div", {
				className: "rounded border text-xs",
				style: { borderColor: "var(--border)" },
				"data-origin-reader": !0,
				children: s.error ? /* @__PURE__ */ b("p", {
					role: "alert",
					className: "p-2 text-danger",
					children: s.error
				}) : s.text === null ? /* @__PURE__ */ b("p", {
					className: "p-2 text-muted",
					children: "Reading…"
				}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2 border-b px-2 py-1",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ x("span", {
						className: "text-muted",
						"data-excerpt-range": !0,
						children: [s.source.document, yn(s.source) ? ` · ${yn(s.source)} marked` : ""]
					}), /* @__PURE__ */ b("button", {
						type: "button",
						className: "ml-auto underline",
						onClick: () => f(s.source),
						children: "Open full file"
					})]
				}), /* @__PURE__ */ b(Is, {
					text: s.text,
					lineStart: s.source.lineStart,
					lineEnd: s.source.lineEnd,
					maxHeight: 360,
					idPrefix: "avoozl-origin",
					label: `Contents of ${s.source.document}`
				})] })
			}),
			d && /* @__PURE__ */ b(Zs, {
				workspaceId: e.workspaceId,
				target: d,
				onClose: p
			})
		]
	});
}
function gl(e) {
	let { workspaceId: n, id: i } = e, a = l(), s = o(() => Cn(a), [a]), u = o(() => Kt(a), [a]), [d, f] = c(null), p = Oi(e.id), [m, h] = c(null), [g, _] = c(!1), v = Di(n), [S, C] = c(!1), [w, T] = c(null), E = t(async () => {
		h(null);
		try {
			f(await s.detail(n, i));
		} catch (e) {
			h(J(e));
		}
	}, [
		s,
		n,
		i
	]);
	r(() => {
		f(null), _(!1), T(null), E();
	}, [E]);
	let D = (e) => {
		C(!0), T(null), (async () => {
			try {
				T(await e()), await E();
			} catch (e) {
				T({
					ok: !1,
					text: J(e)
				});
			} finally {
				C(!1);
			}
		})();
	};
	if (m) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: m
	});
	if (!d) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let { task: O, delivery: k } = d, A = O.authority === "local", j = (k?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1), M = O.status === "deferred", N = Fr(e.graph), P = k?.complete ?? O.state === "done", F = Jt(O.issue?.url ?? null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b(Z, {
				level: 2,
				id: "avoozl-drawer-title",
				title: O.title
			}), /* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: O.id }),
					/* @__PURE__ */ b(ba, { owner: O }),
					O.state && /* @__PURE__ */ b(q, {
						variant: O.state === "needs-you" ? "warning" : void 0,
						children: O.state
					}),
					d.locked && /* @__PURE__ */ b(q, { children: "locked" }),
					O.planArchived && /* @__PURE__ */ b(q, { children: "Archived" })
				]
			})] }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [
					e.onFocus && /* @__PURE__ */ b(Y, {
						icon: te,
						tooltip: "Show only this task and the tasks it waits on and that wait on it",
						onClick: () => {
							e.onFocus(O.id, O.title), e.onClose();
						},
						children: "Focus"
					}),
					/* @__PURE__ */ b(Y, {
						icon: ve,
						tooltip: "Start a Kiro Crew chat seeded with this task's full context",
						onClick: () => void v.ask({ tasks: [O.id] }),
						children: "Ask in a chat"
					}),
					j === "decision" && /* @__PURE__ */ b(Y, {
						icon: ke,
						disabled: S,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => D(async () => (await u.retry(n, O.id), {
							ok: !0,
							text: "Retrying."
						})),
						children: "Retry"
					}),
					!P && A && !M && /* @__PURE__ */ b(Y, {
						icon: Ce,
						disabled: S,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: "deferred" }, d.revision), {
							ok: !0,
							text: "Deferred. No new attempt starts; a running session is left alone."
						})),
						children: "Defer"
					}),
					!P && A && M && N && /* @__PURE__ */ b(Y, {
						icon: Te,
						disabled: S,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: N }, d.revision), {
							ok: !0,
							text: "Resumed."
						})),
						children: "Resume"
					}),
					/* @__PURE__ */ b(Y, {
						icon: we,
						tooltip: "Edit this task. It needs your review again before it starts.",
						onClick: () => _(!g),
						children: "Edit"
					}),
					!P && !A && F && /* @__PURE__ */ b("a", {
						href: F,
						target: "_blank",
						rel: "noreferrer",
						className: "self-center text-xs underline",
						children: "Defer on the board"
					})
				]
			}),
			v.error && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: v.error
			}),
			w && /* @__PURE__ */ b("p", {
				role: w.ok ? "status" : "alert",
				className: `text-sm ${w.ok ? "text-muted" : "text-danger"}`,
				children: w.text
			}),
			O.handSetReview && /* @__PURE__ */ b(sc, {
				workspaceId: n,
				task: O,
				graph: e.graph,
				revision: d.revision,
				onChanged: (e) => {
					T({
						ok: !0,
						text: e
					}), E();
				}
			}),
			an(k).length > 0 && /* @__PURE__ */ x("section", {
				"aria-label": "Review",
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("h4", {
					className: "text-sm font-semibold",
					children: "Review"
				}), /* @__PURE__ */ b(oc, { item: k })]
			}),
			g && /* @__PURE__ */ b("div", {
				className: "rounded border p-3",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(pc, {
					workspaceId: n,
					graph: e.graph,
					detail: d,
					onSaved: () => {
						T({
							ok: !0,
							text: "Saved. This task needs your review again before it starts."
						}), _(!1), E();
					},
					onCancel: () => _(!1)
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-col",
				role: "region",
				"aria-label": "Task sections",
				children: [
					/* @__PURE__ */ b(Ti, {
						id: "summary",
						group: "task-drawer",
						title: "Summary",
						open: d.conflicts.length === 0,
						children: /* @__PURE__ */ x("dl", {
							className: "grid gap-x-3 gap-y-1.5 text-sm",
							style: { gridTemplateColumns: "max-content 1fr" },
							children: [
								/* @__PURE__ */ b(pl, {
									label: "Epic",
									children: O.epicTitle ? ct(O.epicTitle) : "none"
								}),
								d.origin && /* @__PURE__ */ b(pl, {
									label: "Came from",
									children: /* @__PURE__ */ b(hl, {
										origin: d.origin,
										issue: F,
										workspaceId: n
									})
								}),
								/* @__PURE__ */ x(pl, {
									label: "Plan",
									children: [d.plan ? `${d.plan.title}${d.plan.approved ? " (approved)" : ` (${d.plan.state ?? "draft"})`}` : "none", O.planArchived ? " · archived: its tasks do not start until you unarchive it" : ""]
								}),
								/* @__PURE__ */ x(pl, {
									label: "Authority",
									children: [
										/* @__PURE__ */ b(ba, { owner: O }),
										" ",
										O.authority
									]
								}),
								/* @__PURE__ */ b(pl, {
									label: "Route",
									children: O.route
								}),
								/* @__PURE__ */ b(pl, {
									label: "Status",
									children: O.status ?? "none"
								}),
								/* @__PURE__ */ b(pl, {
									label: "State",
									children: O.state ?? "unknown"
								}),
								/* @__PURE__ */ b(pl, {
									label: "Wave",
									children: O.wave
								}),
								/* @__PURE__ */ b(pl, {
									label: "Done when",
									children: O.completion
								}),
								O.repository && /* @__PURE__ */ b(pl, {
									label: "Repository",
									children: O.repository
								}),
								O.owner && /* @__PURE__ */ b(pl, {
									label: "Assignee",
									children: O.owner
								}),
								O.decision && /* @__PURE__ */ b(pl, {
									label: "Decision",
									children: O.decision
								}),
								O.needsReview && /* @__PURE__ */ b(pl, {
									label: "Review",
									children: "Needs your review"
								}),
								(k?.pullRequests ?? []).map((e, t) => /* @__PURE__ */ b(pl, {
									label: "Pull request",
									children: Jt(e.url) ? /* @__PURE__ */ x("a", {
										href: Jt(e.url),
										target: "_blank",
										rel: "noreferrer",
										className: "underline",
										children: [
											"#",
											e.number,
											e.merged ? " (merged)" : ""
										]
									}) : `#${e.number}`
								}, t))
							]
						})
					}),
					/* @__PURE__ */ b(Ti, {
						id: "description",
						group: "task-drawer",
						title: "Description",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [
								O.summary ? /* @__PURE__ */ b(mo, { text: O.summary }) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "No description."
								}),
								/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Acceptance"
								}), O.acceptance.length ? /* @__PURE__ */ b("ul", {
									className: "mt-1 list-disc pl-5 text-sm",
									children: O.acceptance.map((e, t) => /* @__PURE__ */ b("li", { children: e }, t))
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "None."
								})] }),
								/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Checks"
								}), O.checks.length ? /* @__PURE__ */ b("ul", {
									className: "mt-1 flex flex-col gap-1 text-sm",
									children: O.checks.map((e, t) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b("code", { children: e }) }, t))
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "None."
								})] }),
								O.context && /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "From its plan"
								}), /* @__PURE__ */ b(mo, { text: O.context })] })
							]
						})
					}),
					/* @__PURE__ */ b(Ti, {
						id: "links",
						group: "task-drawer",
						title: "Links",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [/* @__PURE__ */ b(ml, {
								title: "Waits on",
								links: d.waitsOn,
								open: e.open
							}), /* @__PURE__ */ b(ml, {
								title: "Blocks",
								links: d.blocks,
								open: e.open
							})]
						})
					}),
					/* @__PURE__ */ b(Ti, {
						id: "delivery",
						group: "task-drawer",
						title: "Delivery",
						children: k ? /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-2",
							children: [
								k.sessions.length > 0 && /* @__PURE__ */ b("ul", {
									className: "flex flex-col gap-1 text-sm",
									children: k.sessions.map((e) => /* @__PURE__ */ x("li", { children: [
										/* @__PURE__ */ x("a", {
											href: Fn(e),
											className: "underline",
											children: [
												e.role,
												" attempt ",
												e.attempt
											]
										}),
										" ",
										/* @__PURE__ */ x("span", {
											className: "text-xs text-muted",
											children: [
												e.status ?? "not observed",
												" · ",
												Xt(e) ?? "model not named",
												" · started",
												" ",
												Mn(e.boundAt),
												e.statusAt ? ` · last activity ${Mn(e.statusAt)}` : ""
											]
										})
									] }, e.slot))
								}),
								j === "decision" && /* @__PURE__ */ b(Vi, {
									item: k,
									busy: S,
									onRetry: (e) => D(async () => (await u.retry(n, O.id, e), {
										ok: !0,
										text: "Dismissed and retrying."
									}))
								}),
								/* @__PURE__ */ b(Hi, {
									item: k,
									onSupersede: async (e, t) => {
										await u.supersede(n, e, t), await E();
									}
								})
							]
						}) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "No delivery yet."
						})
					}),
					/* @__PURE__ */ b(Ti, {
						id: "timing",
						group: "task-drawer",
						title: "Timing",
						children: /* @__PURE__ */ b(dl, { timing: d.timing ?? null })
					}),
					/* @__PURE__ */ b(Ti, {
						id: "conflicts",
						group: "task-drawer",
						title: d.conflicts.length ? `Conflicts (${d.conflicts.length})` : "Conflicts",
						open: d.conflicts.length > 0,
						children: d.conflicts.length ? /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-3",
							children: d.conflicts.map((e, t) => /* @__PURE__ */ x("li", {
								className: "flex flex-col gap-2 rounded border p-2",
								style: { borderColor: "var(--border)" },
								children: [
									/* @__PURE__ */ b("div", {
										className: "text-sm font-medium",
										children: na(e)
									}),
									e.changedAt && /* @__PURE__ */ x("div", {
										className: "text-xs text-muted",
										children: [
											"Changed ",
											Mn(e.changedAt),
											e.changedBy ? ` by ${e.changedBy}` : "",
											". See Timeline for this task's history."
										]
									}),
									/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(Y, {
										icon: ve,
										tooltip: "Start a Kiro Crew chat seeded with this item",
										onClick: () => void v.ask({ items: [qr(e)] }),
										children: "Ask in a chat"
									}) }),
									/* @__PURE__ */ b(Fa, {
										item: e,
										workspaceId: n,
										revision: d.revision,
										busy: S,
										run: D,
										onSettled: () => void 0
									})
								]
							}, t))
						}) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "No conflicts or decisions on this task."
						})
					}),
					/* @__PURE__ */ b(Ti, {
						id: "timeline",
						group: "task-drawer",
						title: "Timeline",
						children: d.timeline.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
							className: "flex flex-col gap-1 text-sm",
							children: p.take("timeline", d.timeline).map((e, t) => /* @__PURE__ */ x("li", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ b(K, {
									text: e.at,
									children: /* @__PURE__ */ b("span", {
										className: "w-28 shrink-0 text-xs text-muted",
										children: Mn(e.at)
									})
								}), /* @__PURE__ */ b("span", { children: e.text })]
							}, t))
						}), /* @__PURE__ */ b(ki, { ...p.more("timeline", d.timeline.length) })] }) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "Nothing recorded yet."
						})
					})
				]
			}),
			k && tn(k) && /* @__PURE__ */ b(zi, {
				item: k,
				onSupersede: async (e, t) => {
					await u.supersede(n, e, t), await E();
				}
			}),
			k?.sessions.length ? /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Running for ",
					Nn(k.sessions.at(-1).boundAt),
					" in its latest attempt."
				]
			}) : null
		]
	});
}
function _l(e) {
	let t = l(), n = o(() => Kt(t), [t]), i = o(() => Cn(t), [t]), [a, s] = c(null), [u, d] = c(!1), [f, p] = c(null);
	r(() => {
		n.conflictsPage(e.workspaceId).then((t) => s({
			revision: t.revision,
			group: t.items.find((t) => t.kind === "review" && t.id === e.group.id) ?? null
		}), (e) => p(J(e)));
	}, [
		n,
		e.workspaceId,
		e.group.id
	]);
	let m = a ? a.group : e.group, h = async () => {
		if (a && m) {
			d(!0), p(null);
			try {
				let t = Qi("reviewed", await i.settle(e.workspaceId, "reviewed", Ji(m), a.revision));
				t.ok ? e.onReviewed() : p(t.text);
			} catch (e) {
				p(J(e));
			} finally {
				d(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Z, {
				level: 2,
				id: "avoozl-drawer-title",
				title: m?.title ?? e.group.title
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Avoozl re-reads a plan when its file changes. A task waits here when its own section changed, or when it is new. Moving a plan or fixing its links does not count. Read each task, then mark them reviewed so they may start."
			}),
			f && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: f
			}),
			a && !m ? /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Nothing here needs review now."
			}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("div", { children: m && /* @__PURE__ */ b(Ia, {
				item: m,
				busy: u || !a,
				onConfirm: () => void h()
			}) }), /* @__PURE__ */ b("ul", {
				className: "flex flex-col text-sm",
				children: (m?.tasks ?? []).map((t) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-baseline gap-2 border-t py-1.5 first:border-t-0",
					style: { borderColor: "var(--border)" },
					children: [
						/* @__PURE__ */ b("button", {
							type: "button",
							className: "text-left underline",
							onClick: () => e.open(t.id),
							children: t.title
						}),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [t.id, t.status ? ` · ${t.status}` : ""]
						}),
						/* @__PURE__ */ b(ba, { owner: t })
					]
				}, t.id))
			})] })
		]
	});
}
function vl() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function yl(e) {
	let [t, n] = c(!1);
	return /* @__PURE__ */ b("div", {
		role: "separator",
		"aria-orientation": "vertical",
		"aria-label": "Resize the task drawer",
		"aria-valuenow": e.width,
		"aria-valuemin": 360,
		tabIndex: 0,
		"data-drawer-handle": !0,
		onPointerDown: (t) => {
			t.preventDefault();
			let n = t.currentTarget;
			n.setPointerCapture?.(t.pointerId), e.onDragging(!0);
			let r = (t) => e.onResize(window.innerWidth - t.clientX), i = () => {
				e.onDragging(!1), n.removeEventListener("pointermove", r), n.removeEventListener("pointerup", i);
			};
			n.addEventListener("pointermove", r), n.addEventListener("pointerup", i);
		},
		onDoubleClick: e.onReset,
		onKeyDown: (t) => {
			let n = ic(e.width, t.key);
			n !== null && (t.preventDefault(), e.onResize(n));
		},
		onMouseEnter: () => n(!0),
		onMouseLeave: () => n(!1),
		className: "absolute inset-y-0 flex items-center justify-center outline-none",
		style: {
			right: e.width - 5,
			width: 10,
			cursor: "col-resize",
			zIndex: 1
		},
		children: /* @__PURE__ */ b("span", {
			"aria-hidden": "true",
			style: {
				width: 6,
				height: 56,
				borderRadius: 999,
				border: "1px solid var(--border)",
				background: t ? "var(--accent)" : "color-mix(in srgb, var(--muted) 80%, var(--card))"
			}
		})
	});
}
function bl({ workspaceId: e, children: n, onFocus: i }) {
	let a = l(), u = o(() => Kt(a), [a]), [d, f] = c(null), [p, m] = c([]), [h, g] = c(null), [_, v] = c(!1), S = s(null), C = s(null), w = fl("(max-width: 767px)"), T = fl("(prefers-reduced-motion: reduce)"), [E, D] = c(620), [O, k] = c(!1);
	r(() => {
		D(e ? nc(vl(), e) : 620);
	}, [e]);
	let A = t((t) => {
		let n = ec(t, window.innerWidth);
		D(n), e && rc(vl(), e, n);
	}, [e]), j = s(null);
	j.current = d;
	let M = o(() => ({
		openTask: (e) => {
			let t = j.current;
			t ? (t.kind === "review" || t.kind === "task" && t.id !== e) && m((e) => [...e, t]) : C.current = document.activeElement, f({
				kind: "task",
				id: e
			});
		},
		addTask: (e) => {
			j.current || (C.current = document.activeElement), f({
				kind: "add",
				prerequisite: e?.prerequisite
			});
		},
		openReview: (e, t) => {
			j.current || (C.current = document.activeElement), m([]), f({
				kind: "review",
				group: e,
				onReviewed: t
			});
		}
	}), []), N = d !== null, P = t(() => {
		v(!1), f(null), m([]), C.current?.focus?.();
	}, []);
	r(() => {
		d && e && u.graph(e).then(g, () => g(null));
	}, [
		N,
		e,
		u
	]), r(() => {
		if (!d) return;
		let e = requestAnimationFrame(() => {
			v(!0), S.current?.focus();
		});
		return () => cancelAnimationFrame(e);
	}, [N]);
	let F = () => {
		let e = p.at(-1);
		e && (m(p.slice(0, -1)), f(e));
	};
	return mi("drawer", N && !!e, "Close the drawer", () => p.length ? F() : P(), P), /* @__PURE__ */ x(lr.Provider, {
		value: M,
		children: [n, d && e && /* @__PURE__ */ x("div", {
			className: "fixed inset-0 z-50",
			style: {
				display: "flex",
				justifyContent: "flex-end"
			},
			children: [
				/* @__PURE__ */ b("div", {
					"aria-hidden": "true",
					"data-drawer-backdrop": !0,
					onClick: P,
					className: "absolute inset-0",
					style: { background: "color-mix(in srgb, var(--text) 25%, transparent)" }
				}),
				!w && /* @__PURE__ */ b(yl, {
					width: ec(E, typeof window > "u" ? E : window.innerWidth),
					onResize: A,
					onDragging: k,
					onReset: () => A(620)
				}),
				/* @__PURE__ */ x("div", {
					ref: S,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "avoozl-drawer-title",
					tabIndex: -1,
					className: "relative flex h-full flex-col overflow-y-auto border-l p-4 shadow-lg outline-none",
					style: {
						width: w ? "100%" : ec(E, typeof window > "u" ? E : window.innerWidth),
						background: "var(--card, var(--bg))",
						color: "var(--text)",
						borderColor: "var(--border)",
						transform: _ || T ? "none" : "translateX(100%)",
						transition: T || O ? "none" : "transform 180ms ease-out"
					},
					children: [/* @__PURE__ */ x("div", {
						className: "mb-3 flex items-center gap-2",
						children: [
							p.length > 0 && /* @__PURE__ */ b(Ai, {
								tooltip: "Go back to what you had open before",
								onClick: F,
								children: "Back"
							}),
							/* @__PURE__ */ b("span", { className: "grow" }),
							d.kind === "task" && /* @__PURE__ */ b(Y, {
								icon: Ee,
								tooltip: "Add a draft task that waits on this one",
								onClick: () => M.addTask({ prerequisite: d.id }),
								children: "Add a task after this"
							}),
							/* @__PURE__ */ b(Y, {
								icon: Ie,
								onClick: P,
								"aria-label": "Close task details",
								children: "Close"
							})
						]
					}), d.kind === "task" ? /* @__PURE__ */ b(gl, {
						workspaceId: e,
						id: d.id,
						graph: h,
						open: M.openTask,
						onClose: P,
						onFocus: i
					}) : d.kind === "review" ? /* @__PURE__ */ b(_l, {
						workspaceId: e,
						group: d.group,
						open: M.openTask,
						onReviewed: () => {
							d.onReviewed?.(), P();
						}
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Z, {
						level: 2,
						id: "avoozl-drawer-title",
						title: "Add a task",
						className: "mb-2"
					}), /* @__PURE__ */ b(pc, {
						workspaceId: e,
						graph: h,
						detail: null,
						prerequisite: d.prerequisite,
						onSaved: (e) => f({
							kind: "task",
							id: e
						}),
						onCancel: P
					})] })]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/RadioFold.tsx
var xl = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function Sl() {
	return /* @__PURE__ */ b("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function Cl(e) {
	return /* @__PURE__ */ x("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ b("style", { children: xl }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ x("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ x("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ b("input", {
						id: i,
						type: "radio",
						name: e.name,
						value: t.key,
						checked: n,
						disabled: !!t.disabled,
						"aria-describedby": `${i}-line`,
						onChange: () => e.onChange(t.key),
						className: "mt-1.5 flex-none",
						style: {
							accentColor: "var(--accent)",
							width: 16,
							height: 16
						}
					}), /* @__PURE__ */ x("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ x("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ b(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ b("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ b("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ x("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ b(Sl, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var wl = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, Tl = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
};
function El(e) {
	let [t, n] = c(!1);
	return e.workspaceId ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(K, {
		text: "Stop new work in a scope, with a reason",
		children: (e) => /* @__PURE__ */ x(p, {
			type: "button",
			"data-stop-line": !0,
			"aria-describedby": e,
			onClick: () => n(!0),
			style: wl,
			children: [/* @__PURE__ */ b(Ce, {
				size: 14,
				"aria-hidden": "true"
			}), "Stop the line"]
		})
	}), t && /* @__PURE__ */ b(Dl, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), e.onPulled();
		}
	})] }) : null;
}
function Dl(e) {
	let n = l(), i = o(() => Ec(n), [n]), [a, u] = c(Lc), [d, f] = c(null), [m, h] = c(null), [_, v] = c(!1), y = s(null), S = (e) => u((t) => ({
		...t,
		...e
	})), C = t(() => e.onClose(), [e]);
	mi("modal", !0, "Cancel", C), r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			Pt(n).repositories(r),
			Wo(n).stored(r),
			Kt(n).graph(r)
		]).then(([e, n, r]) => {
			t && f({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id
				})) : [],
				tasks: r.status === "fulfilled" ? r.value.tasks.filter((e) => e.kind !== "epic").map((e) => ({
					id: e.id,
					title: e.title || e.id
				})) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		y.current?.querySelector("input, button")?.focus();
	}, []);
	let w = async () => {
		let { input: t, error: n } = Rc(a);
		if (!t) return h(n ?? null);
		v(!0), h(null);
		try {
			await i.stop(e.workspaceId, t), e.onPulled();
		} catch (e) {
			h(J(e));
		} finally {
			v(!1);
		}
	}, T = (e, t, n, r, i) => n.length ? /* @__PURE__ */ x("label", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		children: [/* @__PURE__ */ x("span", { children: [
			e,
			" ",
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: "(required)"
			})
		] }), /* @__PURE__ */ x("select", {
			value: t,
			onChange: (e) => r(e.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: Tl,
			"data-stop-target": !0,
			children: [/* @__PURE__ */ b("option", {
				value: "",
				children: "Choose…"
			}), n.map((e) => /* @__PURE__ */ b("option", {
				value: e.id,
				children: e.title === e.id ? e.id : `${e.id}: ${e.title}`
			}, e.id))]
		})]
	}) : /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: d ? i : "Reading…"
	}), E = {
		all: null,
		repo: T("Repository", a.repository, (d?.repositories ?? []).map((e) => ({
			id: e,
			title: e
		})), (e) => S({ repository: e }), "No repository is registered."),
		spec: T("Spec", a.spec, d?.specs ?? [], (e) => S({ spec: e }), "No spec is stored yet."),
		task: T("Task", a.taskId, d?.tasks ?? [], (e) => S({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: C,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: y,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-stop-title",
			"aria-describedby": "avoozl-stop-line",
			"data-stop-dialog": !0,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(36rem, 94vw)",
				maxHeight: "90vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
					id: "avoozl-stop-title",
					className: "flex items-center gap-1.5 text-base font-semibold",
					children: [/* @__PURE__ */ b(Ce, {
						size: 14,
						"aria-hidden": "true",
						style: { color: "var(--danger)" }
					}), "Stop the line"]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-stop-line",
					className: "text-sm text-muted",
					children: "No new work starts in what you pick. Chats already running keep going. Only a person can resume it."
				})] }),
				/* @__PURE__ */ b(Cl, {
					name: "avoozl-stop-scope",
					label: "What to stop",
					value: a.scope,
					onChange: (e) => S({ scope: e }),
					sections: Ic.map((e) => ({
						key: e.value,
						title: e.label,
						line: e.line,
						fields: E[e.value]
					}))
				}),
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ x("span", { children: ["Reason ", /* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "(required)"
						})] }),
						/* @__PURE__ */ b(g, {
							value: a.reason,
							maxLength: 200,
							placeholder: "The base is broken; looking into it",
							onChange: (e) => S({ reason: e.target.value }),
							"data-stop-reason": !0
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "One line. It shows on the banner and in Flow."
						})
					]
				}),
				m && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: m
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [/* @__PURE__ */ b(p, {
						type: "button",
						onClick: C,
						children: "Cancel"
					}), /* @__PURE__ */ x(p, {
						type: "button",
						"data-danger": !0,
						"data-stop-confirm": !0,
						onClick: () => void w(),
						disabled: _,
						style: wl,
						children: [/* @__PURE__ */ b(Ce, {
							size: 14,
							"aria-hidden": "true"
						}), "Stop the line"]
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/DashboardView.tsx
var Ol = 200, kl = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, Al = {
	...en,
	delivery: "Delivery",
	"github-conflict": "GitHub edit"
}, jl = "(min-width: 1024px)", Ml = {
	flight: "22rem",
	blocked: "22rem",
	recent: "22rem"
};
function Nl({ height: e, children: t }) {
	let n = fl(jl);
	return /* @__PURE__ */ b("div", {
		"data-dashboard-row": !0,
		className: "grid gap-3.5",
		style: n ? {
			gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
			height: e
		} : void 0,
		children: t
	});
}
function Pl({ title: e, children: t, empty: n }) {
	return /* @__PURE__ */ x(m, {
		className: "flex h-full min-h-0 flex-col",
		children: [/* @__PURE__ */ b(Z, {
			title: e,
			className: "mb-2"
		}), /* @__PURE__ */ b("div", {
			"data-scroll": !0,
			className: "min-h-0 flex-1 overflow-y-auto",
			children: n ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: n
			}) : t
		})]
	});
}
var Fl = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)"
}, Il = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "baseline"
};
function Ll({ id: e, title: t, onOpen: n }) {
	return /* @__PURE__ */ b(K, {
		text: `Open ${e} in the drawer`,
		children: /* @__PURE__ */ x("button", {
			type: "button",
			className: "min-w-0 text-left",
			onClick: n,
			children: [
				/* @__PURE__ */ b("span", {
					className: "underline",
					children: t
				}),
				" ",
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: e
				})
			]
		})
	});
}
function Rl({ item: e, attach: t, onOpen: n, onInfo: r, onAsk: i, onTitle: a }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(q, {
				variant: [
					"decision",
					"needs-human",
					"review"
				].includes(e.kind) ? "warning" : "danger",
				children: Al[e.kind] ?? e.kind
			}),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b(K, {
						text: ln(e),
						children: (t) => /* @__PURE__ */ b("button", {
							type: "button",
							className: "text-left font-medium underline",
							onClick: a,
							"aria-describedby": t,
							"data-attention-title": !0,
							children: e.title
						})
					}),
					" ",
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: e.taskId
					}),
					/* @__PURE__ */ b("span", {
						className: "block text-sm text-muted",
						children: e.detail
					})
				]
			}),
			/* @__PURE__ */ x("span", {
				className: "flex gap-1.5",
				children: [
					e.href && /* @__PURE__ */ b("a", {
						href: e.href,
						target: "_blank",
						rel: "noreferrer",
						className: "self-center text-sm underline",
						children: "Issue"
					}),
					t && /* @__PURE__ */ b(K, {
						text: "Open the task's running chat",
						children: /* @__PURE__ */ b("a", {
							href: t,
							className: "self-center text-sm underline",
							"aria-label": `Attach to the chat for ${e.title}`,
							children: "Attach"
						})
					}),
					/* @__PURE__ */ b(X, {
						icon: Gr,
						label: e.group ? `Info: ${e.title}` : `Details for ${e.title}`,
						tooltip: e.group ? "Why these tasks need review, and the list of them" : "Open the task drawer",
						onClick: r
					}),
					/* @__PURE__ */ b(X, {
						icon: ve,
						label: `Ask in a chat about ${e.title}`,
						tooltip: "Ask in a chat: a new chat seeded with this item's full context",
						onClick: i
					}),
					/* @__PURE__ */ b(X, {
						icon: e.tab === "conflicts" ? M : V,
						label: e.tab === "conflicts" ? `Resolve ${e.title}` : `Open ${e.title} in Delivery`,
						tooltip: e.tab === "conflicts" ? "Resolve it in Conflicts" : "Open it in Delivery",
						onClick: n
					})
				]
			})
		]
	});
}
var zl = {
	worker: "Worker",
	checks: "Checks",
	planner: "Planner"
}, Bl = (e) => zl[e.role] ?? (e.role === "worker" ? "Worker" : `Reviewer · ${e.role}`), Vl = 2e4;
function Hl({ row: e, now: t, onInfo: n, onPickAgain: r }) {
	let i = Pn(e.session), a = e.session.crew && e.session.crew !== "local";
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(q, { children: Bl(e) }),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: e.title
					}),
					" ",
					/* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [
							e.taskId,
							e.epic ? ` · ${e.epic}` : "",
							" · attempt ",
							e.attempt
						]
					}),
					e.focus && /* @__PURE__ */ b("span", {
						className: "block text-xs text-muted",
						children: e.focus
					}),
					/* @__PURE__ */ x("span", {
						className: "block text-xs text-muted",
						children: [
							e.session.agent ? `${e.session.agent} / ` : "",
							e.model ?? "model not named",
							a ? ` · on ${e.session.crew}` : "",
							" · running ",
							Nn(e.startedAt, t),
							" ·",
							" ",
							e.session.crewUnreachable ? "crew unreachable" : e.status ?? "not observed",
							" ",
							Mn(e.lastAt, t)
						]
					})
				]
			}),
			/* @__PURE__ */ x("span", {
				className: "flex gap-1.5",
				children: [
					/* @__PURE__ */ b(X, {
						icon: Gr,
						label: `Details for ${e.title}`,
						tooltip: "Open the task drawer",
						onClick: n
					}),
					r && e.role === "worker" && /* @__PURE__ */ b(X, {
						icon: Oe,
						label: `Pick again for ${e.title}`,
						tooltip: "The next attempt picks its agent and model afresh",
						onClick: r
					}),
					i ? /* @__PURE__ */ x("a", {
						href: i,
						className: "self-center text-sm underline",
						"aria-label": `Attach to the ${e.role} chat for ${e.title}`,
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 4
						},
						children: [/* @__PURE__ */ b(V, {
							size: 14,
							"aria-hidden": "true"
						}), "Attach"]
					}) : /* @__PURE__ */ b("span", {
						className: "self-center text-xs text-muted",
						children: "Attach waits on Kiro Crew"
					})
				]
			})
		]
	});
}
function Ul(e) {
	let t = gn(e.layout);
	return /* @__PURE__ */ b("ul", {
		className: "min-w-0",
		style: t.list,
		"aria-label": `Tasks by state, ${e.total} in all`,
		"data-state-counts": e.layout,
		children: Xe.map((n) => /* @__PURE__ */ b("li", {
			className: "min-w-0",
			children: /* @__PURE__ */ b(K, {
				text: `Show ${n.label.toLowerCase()} tasks in Delivery`,
				display: e.layout === "small" ? "block" : void 0,
				children: /* @__PURE__ */ x("button", {
					type: "button",
					onClick: () => e.onPick(n.id),
					"aria-label": `${n.label}: ${e.counts[n.id]} tasks. Show them in Delivery`,
					className: "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
					style: {
						...t.button,
						borderColor: `color-mix(in srgb, ${kl[n.id]} 60%, var(--border))`,
						background: `color-mix(in srgb, ${kl[n.id]} 14%, var(--card, transparent))`,
						color: "var(--text)"
					},
					children: [/* @__PURE__ */ x("span", {
						className: "inline-flex min-w-0 items-center gap-1.5",
						children: [/* @__PURE__ */ b("svg", {
							width: 8,
							height: 8,
							"aria-hidden": "true",
							style: { flexShrink: 0 },
							children: /* @__PURE__ */ b("circle", {
								cx: 4,
								cy: 4,
								r: 4,
								style: { fill: kl[n.id] }
							})
						}), /* @__PURE__ */ b("span", {
							className: "truncate",
							children: n.label
						})]
					}), /* @__PURE__ */ b("span", {
						className: "font-semibold tabular-nums",
						style: { flexShrink: 0 },
						children: e.counts[n.id]
					})]
				})
			})
		}, n.id))
	});
}
function Wl({ count: e, onOpen: t }) {
	return /* @__PURE__ */ b(K, {
		text: "Incoming items no rule, triage label or task covers. Opens the Intake tab.",
		children: (n) => /* @__PURE__ */ x("button", {
			type: "button",
			onClick: t,
			"aria-label": `Untriaged: ${e} items. Open the Intake tab`,
			"aria-describedby": n,
			className: "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
			style: {
				borderColor: "color-mix(in srgb, var(--accent) 60%, var(--border))",
				background: "color-mix(in srgb, var(--accent) 14%, var(--card, transparent))",
				color: "var(--text)"
			},
			"data-untriaged-stat": !0,
			children: [
				/* @__PURE__ */ b(fe, {
					size: 12,
					"aria-hidden": "true"
				}),
				"Untriaged",
				/* @__PURE__ */ b("span", {
					className: "font-semibold tabular-nums",
					children: e
				})
			]
		})
	});
}
function Gl({ items: e, now: t, onOpen: n, pages: r }) {
	return e ? e.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
		className: "mt-1 flex flex-col text-sm",
		children: r.take("activity", e).map((e, r) => /* @__PURE__ */ x("li", {
			className: "flex items-baseline gap-2 border-t py-1.5 first:border-t-0",
			style: { borderColor: "var(--border)" },
			children: [/* @__PURE__ */ b(K, {
				text: e.at,
				children: /* @__PURE__ */ b("span", {
					className: "w-16 shrink-0 text-xs text-muted",
					children: Mn(e.at, t)
				})
			}), /* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					e.text,
					" ·",
					" ",
					/* @__PURE__ */ b("button", {
						type: "button",
						className: "underline",
						onClick: () => n(e.taskId),
						children: e.title
					})
				]
			})]
		}, `${e.taskId}:${e.at}:${r}`))
	}), /* @__PURE__ */ b(ki, { ...r.more("activity", e.length) })] }) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Nothing has happened yet."
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Loading…"
	});
}
function Kl(e) {
	let { workspaceId: n, onNavigate: i } = e, a = l(), s = o(() => Kt(a), [a]), u = o(() => Wo(a), [a]), d = o(() => Jr(a), [a]), f = o(() => cr(a), [a]), m = Di(n), g = hn(fl(jl), fl(mn)), { value: _, error: v, busy: S, reload: w } = ya(n, t(async (e) => {
		let [t, n, r, i, a] = await Promise.allSettled([
			s.graph(e),
			s.delivery(e),
			s.conflicts(e),
			u.stored(e),
			d.activity(e, Ol)
		]), o = (e) => e.status === "fulfilled" ? e.value : null, c = [
			t,
			n,
			r,
			i,
			a
		].filter((e) => e.status === "rejected").length, l = o(r);
		return {
			summary: pn({
				graph: o(t),
				delivery: o(n),
				conflicts: l,
				plans: o(i),
				limit: Infinity
			}),
			conflicts: l ?? [],
			activity: o(a),
			total: o(t)?.total ?? 0,
			failed: c
		};
	}, [
		s,
		u,
		d
	])), T = o(() => Ec(a), [a]), E = ya(n, t((e) => T.view(e, { window: "10" }), [T])), D = _?.summary, O = ur(), k = Oi(""), [A, j] = c(() => Date.now());
	r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (j(Date.now()), w());
		}, Vl);
		return () => clearInterval(e);
	}, [w]);
	let M = (e) => {
		let t = e.group ? [e.group] : (_?.conflicts ?? []).filter((t) => t.taskId === e.taskId && (e.kind === "delivery" || t.kind === e.kind));
		m.ask(t.length ? { items: t.map(ql) } : { tasks: e.taskId ? [e.taskId] : [] });
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-dashboard-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-dashboard-title",
				view: "dashboard",
				meta: /* @__PURE__ */ x(y, { children: [
					D && _.total > 0 && /* @__PURE__ */ x("span", {
						className: "whitespace-nowrap text-xs text-muted tabular-nums",
						children: [_.total, " tasks"]
					}),
					g === "small" ? /* @__PURE__ */ b(X, {
						icon: Oe,
						label: "Refresh",
						tooltip: "Read the Dashboard again",
						onClick: () => void w(),
						disabled: S
					}) : /* @__PURE__ */ b(Y, {
						icon: Oe,
						onClick: () => void w(),
						disabled: S,
						children: "Refresh"
					}),
					/* @__PURE__ */ b("span", {
						role: "status",
						className: S || _?.failed ? "text-xs text-muted" : "sr-only",
						children: S ? "Loading…" : _?.failed ? `${_.failed} of 5 reads failed; those sections are empty.` : ""
					}),
					e.untriaged !== null && e.untriaged !== void 0 && /* @__PURE__ */ b(Wl, {
						count: e.untriaged,
						onOpen: () => i("untriaged")
					})
				] }),
				wideActions: g !== "wide",
				actions: /* @__PURE__ */ x(y, { children: [D && _.total > 0 && /* @__PURE__ */ b(Ul, {
					counts: D.counts,
					total: _.total,
					layout: g,
					onPick: (t) => e.onScope?.("delivery", { state: t })
				}), /* @__PURE__ */ b(El, {
					workspaceId: n,
					onPulled: () => void E.reload()
				})] }),
				children: "Dashboard"
			}),
			/* @__PURE__ */ b(il, {
				stops: E.value?.line ?? [],
				workspaceId: n,
				onChanged: () => void E.reload()
			}),
			(v || m.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: v ?? m.error
			}),
			D && _.total === 0 ? /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(Re, { size: 40 }),
				title: "No tasks yet",
				subtitle: "Plan a goal from the header, then approve its spec in Plans. Ready tasks start on their own.",
				action: /* @__PURE__ */ b(p, {
					onClick: () => i("plans"),
					children: "Open Plans"
				})
			}) : D ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ x(Nl, {
					height: Ml.flight,
					children: [/* @__PURE__ */ x(Pl, {
						title: `In flight (${D.inFlight.length})`,
						empty: D.inFlight.length === 0 && "No agent is working right now.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: k.take("flight", D.inFlight).map((e) => /* @__PURE__ */ b(Hl, {
								row: e,
								now: A,
								onInfo: () => O.openTask(e.taskId),
								onPickAgain: n && e.session.sessionReason ? () => void f.pickAgain(n, e.taskId).then(() => w()) : void 0
							}, e.slot))
						}), /* @__PURE__ */ b(ki, { ...k.more("flight", D.inFlight.length) })]
					}), /* @__PURE__ */ x(Pl, {
						title: "Progress by epic",
						empty: D.progress.length === 0 && `No epics yet. ${D.plans.approved} approved and ${D.plans.draft} draft plans.`,
						children: [/* @__PURE__ */ x("p", {
							className: "mt-1 text-xs text-muted",
							children: [
								D.plans.approved,
								" approved and ",
								D.plans.draft,
								" draft plans.",
								" ",
								/* @__PURE__ */ b("button", {
									type: "button",
									className: "underline",
									onClick: () => i("plans"),
									children: "Open Plans"
								})
							]
						}), /* @__PURE__ */ b("ul", {
							className: "mt-2 flex flex-col gap-1 text-sm",
							children: D.progress.map((t) => {
								let n = t.total ? Math.round(t.done / t.total * 100) : 0, r = t.title === t.epic ? ct(t.epic) : t.title;
								return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(K, {
									text: `Show only ${r} in the Graph${t.running > 0 ? `. ${t.running} Avoozl chats running now.` : ""}`,
									display: "block",
									children: /* @__PURE__ */ x("button", {
										type: "button",
										className: "w-full rounded px-1 py-1 text-left hover:bg-accent/10",
										onClick: () => e.onDrill?.({
											kind: "epic",
											id: t.epic,
											title: r
										}),
										children: [/* @__PURE__ */ x("span", {
											className: "flex items-center justify-between gap-2",
											children: [/* @__PURE__ */ b("span", {
												className: "truncate",
												children: r
											}), /* @__PURE__ */ x("span", {
												className: "flex shrink-0 items-center gap-2 text-xs text-muted",
												children: [
													t.running > 0 && /* @__PURE__ */ x("span", {
														className: "inline-flex items-center gap-1",
														style: { color: "var(--tile-purple, var(--aim))" },
														"aria-label": `${t.running} Avoozl chats running`,
														children: [/* @__PURE__ */ b(C, {
															size: 12,
															"aria-hidden": "true"
														}), t.running]
													}),
													t.done,
													" of ",
													t.total
												]
											})]
										}), /* @__PURE__ */ b("span", {
											role: "progressbar",
											"aria-label": `${r} progress`,
											"aria-valuenow": n,
											"aria-valuemin": 0,
											"aria-valuemax": 100,
											className: "mt-1 block h-1.5 overflow-hidden rounded",
											style: { background: "var(--border)" },
											children: /* @__PURE__ */ b("span", {
												className: "block h-full",
												style: {
													width: `${n}%`,
													background: "var(--ok)"
												}
											})
										})]
									})
								}) }, t.epic);
							})
						})]
					})]
				}),
				/* @__PURE__ */ x(Nl, {
					height: Ml.blocked,
					children: [/* @__PURE__ */ x(Pl, {
						title: `Needs you (${D.attention.length})`,
						empty: D.attention.length === 0 && "Nothing waits on you.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: k.take("attention", D.attention).map((e) => /* @__PURE__ */ b(Rl, {
								item: e,
								attach: Jl(D.running, e.taskId),
								onOpen: () => i(e.tab, e.taskId ?? void 0),
								onInfo: () => e.group ? O.openReview(e.group, () => void w()) : e.taskId && O.openTask(e.taskId),
								onAsk: () => M(e),
								onTitle: () => {
									let t = cn(e);
									t.kind === "review" && e.group ? O.openReview(e.group, () => void w()) : t.kind === "task" ? O.openTask(t.id) : t.kind === "tab" && i(t.tab);
								}
							}, e.key))
						}), /* @__PURE__ */ b(ki, { ...k.more("attention", D.attention.length) })]
					}), /* @__PURE__ */ x(Pl, {
						title: `Up next (${D.readyNext.length})`,
						empty: D.readyNext.length === 0 && "No task is ready.",
						children: [
							/* @__PURE__ */ b("p", {
								className: "mt-1 text-xs text-muted",
								children: "In the order the tick starts them."
							}),
							/* @__PURE__ */ x("table", {
								className: "w-full border-collapse text-sm",
								children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("th", {
										style: Fl,
										children: "Wave"
									}),
									/* @__PURE__ */ b("th", {
										style: Fl,
										children: "Task"
									}),
									/* @__PURE__ */ b("th", {
										style: {
											...Fl,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b("span", {
											className: "sr-only",
											children: "Graph"
										})
									})
								] }) }), /* @__PURE__ */ b("tbody", { children: k.take("next", D.readyNext).map((e) => /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("td", {
										style: Il,
										children: /* @__PURE__ */ x(q, {
											variant: "wave",
											children: ["wave ", e.wave]
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...Il,
											width: "100%"
										},
										children: /* @__PURE__ */ b(Ll, {
											id: e.id,
											title: e.title,
											onOpen: () => O.openTask(e.id)
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...Il,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b(X, {
											icon: xe,
											label: `Show ${e.title} in the Graph`,
											onClick: () => i("graph", e.id)
										})
									})
								] }, e.id)) })]
							}),
							/* @__PURE__ */ b(ki, { ...k.more("next", D.readyNext.length) })
						]
					})]
				}),
				/* @__PURE__ */ x(Nl, {
					height: Ml.recent,
					children: [/* @__PURE__ */ x(Pl, {
						title: `Recently completed (${D.recent.length})`,
						empty: D.recent.length === 0 && "Nothing delivered yet.",
						children: [/* @__PURE__ */ b("table", {
							className: "w-full border-collapse text-sm",
							children: /* @__PURE__ */ b("tbody", { children: k.take("recent", D.recent).map((e) => /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ b("td", {
									style: Il,
									children: /* @__PURE__ */ b("span", {
										role: "img",
										"aria-label": "Done",
										style: { color: "var(--ok)" },
										children: "✓"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Il,
										width: "100%"
									},
									children: /* @__PURE__ */ b(Ll, {
										id: e.id,
										title: e.title,
										onOpen: () => O.openTask(e.id)
									})
								}),
								/* @__PURE__ */ b("td", {
									style: Il,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ x("span", {
										className: "flex gap-2 text-xs",
										children: [e.issue && /* @__PURE__ */ b("a", {
											href: e.issue,
											target: "_blank",
											rel: "noreferrer",
											className: "underline",
											children: "issue"
										}), e.pulls.map((e) => /* @__PURE__ */ x("a", {
											href: e.href,
											target: "_blank",
											rel: "noreferrer",
											className: "underline",
											children: ["PR", e.number ? ` #${e.number}` : ""]
										}, e.href))]
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Il,
										textAlign: "right"
									},
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(K, {
										text: e.at,
										children: /* @__PURE__ */ b("span", { children: Mn(e.at, A) })
									})
								})
							] }, e.id)) })
						}), /* @__PURE__ */ b(ki, { ...k.more("recent", D.recent.length) })]
					}), /* @__PURE__ */ b(Pl, {
						title: "Recent activity",
						children: /* @__PURE__ */ b(Gl, {
							items: _.activity,
							now: A,
							onOpen: (e) => O.openTask(e),
							pages: k
						})
					})]
				})
			] }) : !v && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Loading…"
			})
		]
	});
}
var ql = (e) => qr(e);
function Jl(e, t) {
	let n = [...e.find((e) => e.id === t)?.sessions ?? []].sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
	return n[0] ? Fn(n[0]) : null;
}
// kirocrew-app/ui/src/FilterBar.tsx
var Yl = {
	event: xr,
	read: Sr,
	write: Cr,
	empty: {}
};
function Xl(e) {
	return Oa(e, Yl);
}
function Zl(e, t) {
	ka(Yl, e, t);
}
function Ql(e) {
	let { filter: t, choices: n } = e, r = (n) => e.onChange(wr(t, n));
	return /* @__PURE__ */ b(Ea, {
		id: e.id,
		label: "Filter tasks",
		active: mr(t),
		onClear: () => e.onChange({}),
		fields: [
			{
				kind: "search",
				key: "q",
				label: "Search",
				value: t.q ?? "",
				placeholder: "Task name or ID",
				onChange: (e) => r({ q: e })
			},
			{
				kind: "select",
				key: "plan",
				label: "Plan",
				value: t.plan ?? "",
				options: n.plans,
				onChange: (e) => r({ plan: e })
			},
			{
				kind: "select",
				key: "epic",
				label: "Epic",
				value: t.epic ?? "",
				options: n.epics,
				onChange: (e) => r({ epic: e })
			},
			{
				kind: "select",
				key: "repository",
				label: "Repository",
				value: t.repository ?? "",
				options: n.repositories,
				onChange: (e) => r({ repository: e })
			},
			{
				kind: "select",
				key: "state",
				label: "State",
				value: t.state ?? "",
				options: n.states,
				onChange: (e) => r({ state: e || void 0 })
			},
			{
				kind: "range",
				key: "wave",
				label: "Wave",
				min: t.waveMin,
				max: t.waveMax,
				limit: n.waves,
				onChange: (e, t) => r({
					waveMin: e,
					waveMax: t
				})
			},
			{
				kind: "select",
				key: "authority",
				label: "Owner",
				value: t.authority ?? "",
				options: n.authorities,
				onChange: (e) => r({ authority: e })
			},
			{
				kind: "check",
				key: "needs-you",
				label: "Needs me",
				checked: !!t.needsYou,
				onChange: (e) => r({ needsYou: e })
			},
			{
				kind: "check",
				key: "archived",
				label: "Show archived",
				checked: !!t.archived,
				onChange: (e) => r({ archived: e })
			}
		],
		children: e.children
	});
}
// kirocrew-app/ui/src/GraphView.tsx
var $l = 60, eu = 640, tu = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, nu = Object.fromEntries(Xe.map((e) => [e.id, e.label])), ru = (e, t) => e.length > t ? e.slice(0, t - 1) + "…" : e, iu = (e, t) => {
	(e.key === "Enter" || e.key === " ") && (e.preventDefault(), t());
};
function au({ task: e, x: t, y: n }) {
	if (e.authority !== "github") return /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: "var(--muted)" },
		children: e.authority ?? "local"
	});
	let r = e.issue ? Jt(e.issue.url) : null, i = e.issue ? e.issue.number ? `#${e.issue.number}` : "GitHub" : "pending", a = /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: r ? "var(--accent)" : "var(--muted)" },
		children: i
	});
	return r ? /* @__PURE__ */ b("a", {
		href: r,
		target: "_blank",
		rel: "noreferrer",
		onClick: (e) => e.stopPropagation(),
		"aria-label": `Issue ${i}`,
		children: a
	}) : a;
}
function ou(e) {
	let { node: t, selected: n } = e, r = tu[t.state], i = t.members ? `${t.members.done} of ${t.members.total} done` : `${t.id} · ${nu[t.state]}`, a = t.members ? `Epic ${t.title}, collapsed, ${i}. Press to show only this epic.` : `${t.title}, ${t.id}, ${nu[t.state]}${t.task?.review ? ", waits for review" : ""}${t.task?.planArchived ? ", archived plan" : ""}${t.task?.handSetReview ? ", review set by hand, none running" : ""}`;
	return /* @__PURE__ */ x("g", {
		transform: `translate(${t.x},${t.y})`,
		role: "button",
		tabIndex: 0,
		"aria-label": a,
		"aria-pressed": t.members ? void 0 : n,
		"data-node": t.id,
		onClick: () => e.onSelect(t),
		onKeyDown: (n) => iu(n, () => e.onSelect(t)),
		onPointerEnter: () => e.onHover(t.id),
		onPointerLeave: () => e.onHover(null),
		onFocus: () => e.onHover(t.id),
		onBlur: () => e.onHover(null),
		opacity: e.dim ? .3 : 1,
		style: {
			cursor: "pointer",
			outline: "none"
		},
		children: [
			/* @__PURE__ */ b("title", { children: t.title }),
			/* @__PURE__ */ b("rect", {
				width: et,
				height: tt,
				rx: 6,
				strokeWidth: n ? 2.5 : 1,
				strokeDasharray: t.members ? "5 3" : void 0,
				style: {
					fill: "var(--card)",
					stroke: n ? "var(--accent)" : r
				}
			}),
			/* @__PURE__ */ b("rect", {
				width: 5,
				height: tt,
				rx: 3,
				style: { fill: r }
			}),
			/* @__PURE__ */ b("text", {
				x: 12,
				y: 15,
				fontSize: 11,
				fontWeight: 600,
				style: { fill: "var(--text)" },
				children: ru(t.title, t.task?.review ? 19 : 25)
			}),
			t.task?.review && /* @__PURE__ */ b("text", {
				x: et - 6,
				y: 14,
				textAnchor: "end",
				fontSize: 9,
				"data-review-badge": !0,
				style: { fill: "var(--muted)" },
				children: "review"
			}),
			/* @__PURE__ */ b("text", {
				x: 12,
				y: 29,
				fontSize: 10,
				style: { fill: "var(--muted)" },
				children: ru(i, t.task ? 20 : 28)
			}),
			t.task && /* @__PURE__ */ b(au, {
				task: t.task,
				x: et - 6,
				y: 29
			})
		]
	});
}
function su() {
	return /* @__PURE__ */ x("ul", {
		"aria-label": "Node colors",
		className: "flex flex-wrap gap-3 text-xs text-muted",
		children: [Xe.map((e) => /* @__PURE__ */ x("li", {
			className: "flex items-center gap-1",
			children: [/* @__PURE__ */ b("svg", {
				width: 10,
				height: 10,
				"aria-hidden": "true",
				children: /* @__PURE__ */ b("rect", {
					width: 10,
					height: 10,
					rx: 2,
					style: { fill: tu[e.id] }
				})
			}), e.label]
		}, e.id)), /* @__PURE__ */ b("li", { children: "Solid arrow: waiting · faded arrow: met · dashed arrow: sequence" })]
	});
}
function cu(e) {
	let { task: t } = e, n = ur(), { waitsOn: r, blocks: i } = e.neighbors, a = at(t);
	return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
		"aria-label": "Task details",
		role: "region",
		children: [
			/* @__PURE__ */ b(Z, {
				title: t.title,
				actions: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Ai, {
					tooltip: "Open this task's details in the drawer",
					onClick: () => n.openTask(t.id),
					children: "All details"
				}), /* @__PURE__ */ b(Ai, {
					tooltip: "Add a draft task that waits on this one",
					onClick: () => n.addTask({ prerequisite: t.id }),
					children: "Add a task after this"
				})] })
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-1.5 text-sm",
				children: [
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: t.id
					}),
					/* @__PURE__ */ b(q, { children: t.kind }),
					/* @__PURE__ */ b(ba, { owner: t }),
					/* @__PURE__ */ b(q, {
						variant: t.complete ? "success" : void 0,
						children: t.status ?? "no status"
					}),
					/* @__PURE__ */ b(q, {
						variant: a === "needs-you" ? "warning" : a === "ready" ? "info" : void 0,
						children: nu[a]
					}),
					t.review && /* @__PURE__ */ b(q, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(q, { children: "Archived" }),
					t.handSetReview && /* @__PURE__ */ b(q, {
						variant: "warning",
						children: "set by hand"
					})
				]
			}),
			t.handSetReview && /* @__PURE__ */ x("p", {
				className: "mt-1 text-sm",
				"data-hand-set-review": !0,
				children: [
					on(t.noSession),
					".",
					t.nextAction ? ` Next: ${t.nextAction}` : "",
					" All details has Discuss, Mark done and Back to planned."
				]
			}),
			/* @__PURE__ */ x("dl", {
				className: "mt-2 grid gap-1 text-sm",
				style: {
					gridTemplateColumns: "max-content 1fr",
					columnGap: 12
				},
				children: [
					t.repository && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Repository"
					}), /* @__PURE__ */ b("dd", { children: t.repository })] }),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Route"
					}),
					/* @__PURE__ */ b("dd", { children: t.route }),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Done when"
					}),
					/* @__PURE__ */ b("dd", { children: t.completion }),
					t.decision && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Decision"
					}), /* @__PURE__ */ b("dd", { children: t.decision })] }),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Waits on"
					}),
					/* @__PURE__ */ b("dd", { children: r.length === 0 ? "nothing" : r.map((t, n) => /* @__PURE__ */ x("span", { children: [
						n > 0 && ", ",
						/* @__PURE__ */ b("button", {
							type: "button",
							className: "underline",
							onClick: () => e.onSelect(t.id),
							children: t.id
						}),
						" ",
						/* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [
								"(",
								t.satisfied ? "met" : "waiting",
								")"
							]
						})
					] }, t.id)) }),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Blocks"
					}),
					/* @__PURE__ */ b("dd", { children: i.length === 0 ? "nothing" : i.map((t, n) => /* @__PURE__ */ x("span", { children: [n > 0 && ", ", /* @__PURE__ */ b("button", {
						type: "button",
						className: "underline",
						onClick: () => e.onSelect(t.id),
						children: t.id
					})] }, t.id)) })
				]
			})
		]
	}) });
}
function lu({ workspaceId: e, focus: n = null, drill: i = null, onDrill: a }) {
	let u = l(), d = o(() => Kt(u), [u]), f = ur(), [p, h] = Xl(e), { value: g, error: _, busy: v, reload: S } = ya(e, t((e) => d.graph(e), [d])), C = o(() => g ? vt(yr(g, p), i) : null, [
		g,
		p,
		i
	]), w = o(() => vr(g), [g]), [T, E] = c(null);
	r(() => E(null), [i]);
	let O = di(), [k, A] = hi("graph-selected", null), [j, M] = c(null), [N, P] = hi("graph-view", {
		x: 0,
		y: 0,
		scale: 1
	}), [F] = c(() => O.memory.has("graph-stack")), I = s(null), L = s(null), ee = s(!1), R = o(() => [...new Set((C?.tasks ?? []).map((e) => e.epic ?? "(none)"))], [C]), z = o(() => T ?? new Set(!i && (C?.tasks.length ?? 0) > $l ? R : []), [
		T,
		C,
		R,
		i
	]), [te, B] = c(1100), V = o(() => $e(C?.tasks.length ?? 0, te), [C, te]), H = o(() => C ? gt(C, z, { spacing: V }) : null, [
		C,
		z,
		V
	]), ne = o(() => new Map(H?.nodes.map((e) => [e.id, e]) ?? []), [H]), U = C?.tasks.find((e) => e.id === k) ?? null, W = C ? qt(C) : null, re = (e) => {
		if (!e) return "No epic";
		let t = g?.epics.find((t) => t.id === e)?.title;
		return t && t !== e ? t : ct(e);
	}, [ie, ae] = hi("graph-stack", []), oe = s({
		drill: i,
		view: N,
		selected: k
	}), se = s(!1), ce = s(F ? N : null);
	r(() => {
		let e = oe.current;
		se.current ? se.current = !1 : e.drill !== i && ae((t) => kt(t, e, i)), oe.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [i]), r(() => {
		oe.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [N, k]);
	let le = (e) => {
		ae((t) => Tt(t, {
			drill: i,
			view: N,
			selected: k
		}, p, e)), h(e);
	}, ue = (e) => {
		let t = At(ie, e);
		if (!t) return;
		let { entry: n } = t, r = ie.slice(t.stack.length).find((e) => e.filter)?.filter;
		ce.current = n.view, ae(t.stack), A(n.selected), r && h(r), n.drill === i ? P(n.view) : (se.current = !0, a?.(n.drill));
	}, de = s(ue);
	de.current = ue, r(() => {
		let e = () => de.current();
		return O.handlers.set("graph", e), () => {
			O.handlers.get("graph") === e && O.handlers.delete("graph");
		};
	}, [O]), r(() => {
		O.history.sync("graph", ie.length, () => ({
			label: "Back in the Graph",
			back: () => O.handlers.get("graph")?.()
		}));
	}, [O, ie.length]);
	let fe = (e) => a?.({
		kind: "epic",
		id: e,
		title: re(e)
	}), pe = t(() => {
		H && I.current && (ce.current ? (P(ce.current), ce.current = null) : P(Ct(H, I.current.clientWidth || 800, eu)));
	}, [H]);
	r(pe, [pe]), r(() => {
		let e = I.current;
		if (!e || typeof ResizeObserver > "u") return;
		let t = new ResizeObserver(() => B((t) => Math.abs(t - e.clientWidth) > 40 ? e.clientWidth : t));
		return t.observe(e), () => t.disconnect();
	}, [H !== null]), r(() => {
		let e = I.current;
		if (!e) return;
		let t = (t) => {
			if (!t.ctrlKey && !t.metaKey) return;
			t.preventDefault();
			let n = e.getBoundingClientRect(), r = Math.exp(-t.deltaY * .01);
			P((e) => St(e, r, t.clientX - n.left, t.clientY - n.top));
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [H]);
	let me = (e) => {
		let t = I.current?.clientWidth || 800;
		P((n) => St(n, e, t / 2, eu / 2));
	}, he = (e) => {
		let t = new Set(z);
		t.has(e) ? t.delete(e) : t.add(e), E(t);
	}, G = (e) => {
		let t = _t(e, ee.current);
		if (t === "drill") return fe(e.epic);
		if (t === "open") {
			if (e.task?.kind === "epic" && g?.tasks.some((t) => t.epic === e.id)) return fe(e.id);
			A(e.id), f.openTask(e.id);
		}
	}, ge = (e) => {
		let t = C?.tasks.find((t) => t.id === e);
		t && z.has(t.epic ?? "(none)") && he(t.epic ?? "(none)"), A(e);
	}, _e = s(null);
	r(() => {
		C && n && _e.current !== n && (_e.current = n, ge(n));
	}, [C, n]);
	let ve = (e) => {
		e.button === 0 && (L.current = {
			x: e.clientX,
			y: e.clientY,
			view: N,
			moved: !1
		}, ee.current = !1);
	}, ye = (e) => {
		let t = L.current;
		if (!t) return;
		let n = e.clientX - t.x, r = e.clientY - t.y;
		!t.moved && Math.hypot(n, r) < 4 || (t.moved || e.currentTarget.setPointerCapture(e.pointerId), t.moved = ee.current = !0, P({
			...t.view,
			x: t.view.x + n,
			y: t.view.y + r
		}));
	}, be = () => {
		L.current = null;
	}, xe = (e, t) => k !== null && (e === k || t === k), Se = j ?? k, Ce = o(() => {
		if (!H || !Se || !ne.has(Se)) return null;
		let { up: e, down: t } = bt(H.edges, Se);
		return {
			up: /* @__PURE__ */ new Set([...e, Se]),
			down: /* @__PURE__ */ new Set([...t, Se])
		};
	}, [
		H,
		Se,
		ne
	]), we = (e) => !Ce || Ce.up.has(e) || Ce.down.has(e), Te = (e, t) => !Ce || Ce.up.has(e) && Ce.up.has(t) || Ce.down.has(e) && Ce.down.has(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-graph-title",
		className: "flex flex-col gap-3.5",
		"data-graph-view": !0,
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-graph-title",
				view: "graph",
				children: "Graph"
			}),
			_ && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: _
			}),
			e ? /* @__PURE__ */ x(Ql, {
				id: "avoozl-graph",
				filter: p,
				choices: w,
				onChange: le,
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ b(Y, {
						icon: Oe,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}), /* @__PURE__ */ b(Y, {
						icon: Ee,
						tooltip: "Add a draft task. It waits for your review.",
						onClick: () => f.addTask(),
						children: "New task"
					})]
				}), /* @__PURE__ */ b("p", {
					role: "status",
					className: "mt-2 text-sm text-muted",
					children: v ? "Loading…" : W ? `${W.tasks} of ${g.total} tasks · ${W.blocking} blocking edges · ${W.ready} ready · ${H?.waves ?? 0} waves` : ""
				})]
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			}),
			C && C.total === 0 && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "No tasks yet. Store and approve a plan in the Plans tab to fill the graph."
			}),
			H && H.nodes.length > 0 && /* @__PURE__ */ x(m, { children: [
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						ie.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Y, {
							icon: D,
							tooltip: Ot(ie) ?? void 0,
							onClick: () => ue(),
							"aria-label": Ot(ie) ?? "Back",
							children: "Back"
						}), /* @__PURE__ */ x("nav", {
							"aria-label": "Graph drill-in",
							className: "flex flex-wrap items-center gap-1 text-sm",
							"data-graph-crumbs": !0,
							children: [Et(ie, i).map(({ at: e, label: t }) => /* @__PURE__ */ x("span", {
								className: "inline-flex items-center gap-1",
								children: [/* @__PURE__ */ b("button", {
									type: "button",
									className: "truncate underline",
									style: { maxWidth: "14rem" },
									onClick: () => ue(e),
									children: t
								}), /* @__PURE__ */ b("span", {
									"aria-hidden": "true",
									className: "text-muted",
									children: "›"
								})]
							}, e)), /* @__PURE__ */ b("span", {
								className: "truncate font-medium",
								"aria-current": "page",
								style: { maxWidth: "min(28rem, 60vw)" },
								children: Dt(i)
							})]
						})] }),
						/* @__PURE__ */ b(Ai, {
							tooltip: "Fold each epic into one box",
							onClick: () => E(new Set(R)),
							children: "Collapse all"
						}),
						/* @__PURE__ */ b(Ai, {
							tooltip: "Show every task inside each epic",
							onClick: () => E(/* @__PURE__ */ new Set()),
							children: "Expand all"
						}),
						/* @__PURE__ */ b("span", { className: "grow" }),
						/* @__PURE__ */ b(Ai, {
							tooltip: "Zoom out",
							onClick: () => me(1 / 1.25),
							"aria-label": "Zoom out",
							children: "−"
						}),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"aria-live": "polite",
							children: [Math.round(N.scale * 100), "%"]
						}),
						/* @__PURE__ */ b(Ai, {
							tooltip: "Zoom in",
							onClick: () => me(1.25),
							"aria-label": "Zoom in",
							children: "+"
						}),
						/* @__PURE__ */ b(Ai, {
							tooltip: "Fit the whole graph in view",
							onClick: pe,
							children: "Fit"
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					className: "mt-2",
					children: /* @__PURE__ */ b(su, {})
				}),
				/* @__PURE__ */ b("div", {
					ref: I,
					className: "mt-2 overflow-hidden rounded border",
					style: {
						borderColor: "var(--border)",
						height: eu,
						touchAction: "none"
					},
					children: /* @__PURE__ */ x("svg", {
						role: "group",
						"aria-label": "Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom.",
						width: "100%",
						height: eu,
						onPointerDown: ve,
						onPointerMove: ye,
						onPointerUp: be,
						onPointerCancel: be,
						style: {
							cursor: "grab",
							userSelect: "none"
						},
						children: [/* @__PURE__ */ x("defs", { children: [/* @__PURE__ */ b("marker", {
							id: "avoozl-arrow",
							viewBox: "0 0 10 10",
							refX: 9,
							refY: 5,
							markerWidth: 7,
							markerHeight: 7,
							orient: "auto",
							children: /* @__PURE__ */ b("path", {
								d: "M0,0 L10,5 L0,10 z",
								style: { fill: "var(--muted)" }
							})
						}), /* @__PURE__ */ b("marker", {
							id: "avoozl-arrow-on",
							viewBox: "0 0 10 10",
							refX: 9,
							refY: 5,
							markerWidth: 7,
							markerHeight: 7,
							orient: "auto",
							children: /* @__PURE__ */ b("path", {
								d: "M0,0 L10,5 L0,10 z",
								style: { fill: "var(--accent)" }
							})
						})] }), /* @__PURE__ */ x("g", {
							transform: `translate(${N.x},${N.y}) scale(${N.scale})`,
							children: [
								H.clusters.map((e, t) => {
									let n = st(e.epic);
									return /* @__PURE__ */ x("g", {
										opacity: Ce ? .5 : 1,
										children: [/* @__PURE__ */ b("rect", {
											x: e.x,
											y: e.y,
											width: e.width,
											height: e.height,
											rx: 8,
											style: {
												fill: "var(--bg-elevated)",
												stroke: "var(--border)",
												opacity: .7
											}
										}), e.label && /* @__PURE__ */ x("text", {
											x: e.x + 6,
											y: e.y + 9,
											fontSize: 10,
											role: "button",
											tabIndex: 0,
											"aria-expanded": !e.collapsed,
											"aria-label": `Epic ${e.title}, ${e.count} tasks. Press to show only this epic.`,
											onClick: () => !ee.current && fe(e.epic),
											onKeyDown: (t) => iu(t, () => fe(e.epic)),
											style: {
												fill: "var(--muted)",
												cursor: "pointer"
											},
											children: [ru(e.title, 30), " ›"]
										})]
									}, `${n}:${t}`);
								}),
								H.loose.map((e) => {
									let t = st(e.epic);
									return /* @__PURE__ */ b("text", {
										x: e.x,
										y: e.y + 11,
										fontSize: 10,
										role: "button",
										tabIndex: 0,
										"aria-label": `Epic ${e.title}: ${e.count} with no dependencies. Press to show only this epic.`,
										onClick: () => !ee.current && fe(e.epic),
										onKeyDown: (t) => iu(t, () => fe(e.epic)),
										style: {
											fill: "var(--muted)",
											cursor: "pointer"
										},
										children: ru(`${e.title} · ${e.count} with no dependencies`, e.chars)
									}, `loose:${t}`);
								}),
								H.edges.map((e) => {
									let t = Ce !== null && Te(e.from, e.to), n = Ce !== null && !t, r = xe(e.from, e.to);
									return /* @__PURE__ */ b("path", {
										d: yt(e.points),
										fill: "none",
										"data-edge": `${e.from}->${e.to}`,
										strokeWidth: t || r ? 2.25 : 1.25,
										strokeLinejoin: "round",
										strokeDasharray: e.kind === "sequence" ? "6 4" : void 0,
										markerEnd: t ? "url(#avoozl-arrow-on)" : "url(#avoozl-arrow)",
										style: {
											stroke: t ? "var(--accent)" : "var(--muted)",
											opacity: n ? .12 : t ? 1 : e.satisfied ? .35 : .8
										}
									}, `${e.from}->${e.to}`);
								}),
								H.nodes.map((e) => /* @__PURE__ */ b(ou, {
									node: e,
									selected: e.id === k,
									dim: !we(e.id),
									onSelect: G,
									onHover: M
								}, e.id))
							]
						})]
					})
				})
			] }),
			C && U && /* @__PURE__ */ b(cu, {
				task: U,
				neighbors: xt(C, U.id),
				onSelect: ge
			})
		]
	});
}
// kirocrew-app/ui/src/DeliveryView.tsx
function uu(e) {
	let { card: t, busy: n, act: r, client: i, workspaceId: a } = e, s = ur(), c = l(), u = o(() => cr(c), [c]), d = t.sessions.some((e) => e.role === "worker" && e.sessionReason), f = t.authority === "local", p = Jt(t.issue?.url ?? null), h = t.item?.complete ?? !1;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
		className: "p-1",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-start gap-2",
				children: [e.phase && /* @__PURE__ */ b(du, { phase: e.phase }), /* @__PURE__ */ b("button", {
					type: "button",
					className: "text-left text-base font-semibold leading-snug hover:underline",
					onClick: () => s.openTask(t.id),
					children: t.title
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: t.id }),
					t.epic && /* @__PURE__ */ b(q, { children: t.epic }),
					/* @__PURE__ */ b(ba, { owner: {
						authority: t.authority,
						issue: t.issue
					} }),
					t.attempt !== null && /* @__PURE__ */ x(q, { children: ["attempt ", t.attempt] }),
					t.reviewRounds > 0 && /* @__PURE__ */ x(q, { children: [t.reviewRounds, " review rounds"] }),
					t.deliveryState && /* @__PURE__ */ b(q, {
						variant: t.deliveryState === "decision" ? "warning" : void 0,
						children: t.deliveryState
					}),
					t.deferred && /* @__PURE__ */ b(q, { children: "deferred" }),
					t.review && /* @__PURE__ */ b(q, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(q, { children: "Archived" })
				]
			}),
			t.item && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(oc, {
					item: t.item,
					compact: !0,
					onInfo: () => s.openTask(t.id)
				})
			}),
			t.handSetReview && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(sc, {
					compact: !0,
					workspaceId: a,
					task: {
						id: t.id,
						title: t.title,
						authority: t.authority,
						nextAction: t.nextAction,
						noSession: t.noSession
					},
					graph: e.graph,
					revision: e.revision,
					onChanged: () => r(() => Promise.resolve())
				})
			}),
			t.sessions.length > 0 && /* @__PURE__ */ b("ul", {
				className: "mt-2.5 flex flex-col gap-1 text-xs",
				children: t.sessions.map((e) => /* @__PURE__ */ b("li", { children: e.link ? /* @__PURE__ */ b("a", {
					href: e.link,
					className: "underline",
					children: Yt(e)
				}) : Yt(e) }, e.slot))
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [
					e.ready && Vr(t) && /* @__PURE__ */ b(Y, {
						icon: Te,
						disabled: n,
						tooltip: "Starts this task first on the next tick, within the limit.",
						onClick: () => e.onStart(t.id),
						children: "Start now"
					}),
					d && !h && /* @__PURE__ */ b(Y, {
						icon: Oe,
						disabled: n,
						tooltip: "The next attempt picks its agent and model afresh",
						onClick: () => r(() => u.pickAgain(a, t.id)),
						children: "Pick again"
					}),
					t.deliveryState === "decision" && /* @__PURE__ */ b(Y, {
						icon: ke,
						disabled: n,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => r(() => i.retry(a, t.id)),
						children: "Retry"
					}),
					!h && f && e.canDefer && !t.deferred && /* @__PURE__ */ b(Y, {
						icon: Ce,
						disabled: n,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: "deferred" }, e.revision)),
						children: "Defer"
					}),
					!h && f && t.deferred && e.resume && /* @__PURE__ */ b(Y, {
						icon: Te,
						disabled: n,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: e.resume }, e.revision)),
						children: "Resume"
					}),
					!h && !f && p && /* @__PURE__ */ b(K, {
						text: "Open the issue; move its Project card to Deferred to pause it",
						children: /* @__PURE__ */ b("a", {
							href: p,
							target: "_blank",
							rel: "noreferrer",
							className: "self-center text-xs underline",
							children: "Defer on the board"
						})
					}),
					/* @__PURE__ */ b(Y, {
						icon: Gr,
						tooltip: "Open this task's details in the drawer",
						onClick: () => s.openTask(t.id),
						children: "Details"
					})
				]
			})
		]
	}) }) });
}
function du({ phase: e }) {
	let t = fl("(prefers-reduced-motion: reduce)"), n = e === "running" ? "Running: a worker is coding" : "Reviewing: a reviewer or checks chat is reading";
	return /* @__PURE__ */ x("svg", {
		width: 18,
		height: 18,
		viewBox: "0 0 24 24",
		role: "img",
		"aria-label": n,
		style: {
			flex: "none",
			marginTop: 2,
			color: e === "running" ? "var(--tile-purple, var(--accent))" : "var(--accent)"
		},
		children: [/* @__PURE__ */ b("title", { children: n }), e === "running" ? /* @__PURE__ */ x("g", { children: [/* @__PURE__ */ b("path", {
			fill: "currentColor",
			d: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.9 2.4-2-.3a7 7 0 0 0-.8-1.9l1.2-1.6-1.6-1.6-1.6 1.2a7 7 0 0 0-1.9-.8l-.3-2h-2.2l-.3 2a7 7 0 0 0-1.9.8L7.9 5.5 6.3 7.1l1.2 1.6a7 7 0 0 0-.8 1.9l-2 .3v2.2l2 .3c.2.7.4 1.3.8 1.9l-1.2 1.6 1.6 1.6 1.6-1.2c.6.4 1.2.6 1.9.8l.3 2h2.2l.3-2c.7-.2 1.3-.4 1.9-.8l1.6 1.2 1.6-1.6-1.2-1.6c.4-.6.6-1.2.8-1.9l2-.3v-2.2Z"
		}), !t && /* @__PURE__ */ b("animateTransform", {
			attributeName: "transform",
			type: "rotate",
			from: "0 12 12",
			to: "360 12 12",
			dur: "3s",
			repeatCount: "indefinite"
		})] }) : /* @__PURE__ */ x("g", { children: [
			/* @__PURE__ */ b("circle", {
				cx: 10.5,
				cy: 10.5,
				r: 5.5,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2
			}),
			/* @__PURE__ */ b("path", {
				d: "M14.6 14.6 20 20",
				stroke: "currentColor",
				strokeWidth: 2.4,
				strokeLinecap: "round"
			}),
			!t && /* @__PURE__ */ b("animateTransform", {
				attributeName: "transform",
				type: "translate",
				values: "-2 0; 2 0; -2 0",
				dur: "2.4s",
				repeatCount: "indefinite"
			})
		] })]
	});
}
var fu = 16;
function pu() {
	let e = s(null), [t, n] = c(1200);
	return r(() => {
		let t = e.current;
		if (!t || (n(t.clientWidth), typeof ResizeObserver > "u")) return;
		let r = new ResizeObserver(() => n(t.clientWidth));
		return r.observe(t), () => r.disconnect();
	}, []), {
		ref: e,
		width: t
	};
}
function mu(e) {
	let { lanes: t, narrow: n } = e, { ref: r, width: i } = pu(), a = e.only === "done" ? [Rr] : Tr.filter((t) => !e.only || t.id === e.only), o = zr(i, a.length, fu), [s, l] = c(/* @__PURE__ */ new Set(["waiting"])), u = Oi(e.reset ?? ""), d = o === 1, f = (t, n, r) => /* @__PURE__ */ x("ul", {
		className: "flex flex-col gap-3",
		children: [u.take(t, n).map((t) => e.card(t, r)), u.more(t, n.length).left > 0 && /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(ki, { ...u.more(t, n.length) }) })]
	});
	return /* @__PURE__ */ b("div", {
		ref: r,
		"data-lane-columns": o,
		style: {
			display: "grid",
			gap: fu,
			gridTemplateColumns: `repeat(${o}, minmax(0, 1fr))`,
			alignItems: "start"
		},
		children: a.map((e) => {
			let r = Dr(t, e.id), i = (d || n) && s.has(e.id);
			return /* @__PURE__ */ x("section", {
				"aria-label": `${e.label}: ${r.length}`,
				className: "flex min-w-0 flex-col gap-3 rounded-lg border p-3",
				style: {
					background: kr(e.tint),
					borderColor: "var(--border)",
					color: "var(--text)"
				},
				children: [/* @__PURE__ */ x("button", {
					type: "button",
					className: "flex items-center gap-2 text-left text-sm font-semibold",
					"aria-expanded": !i,
					onClick: () => {
						let t = new Set(s);
						t.has(e.id) ? t.delete(e.id) : t.add(e.id), l(t);
					},
					disabled: !(d || n),
					children: [
						(d || n) && /* @__PURE__ */ b("span", {
							"aria-hidden": "true",
							children: i ? "▸" : "▾"
						}),
						e.label,
						/* @__PURE__ */ b(q, {
							variant: e.id === "needs-you" && r.length ? "warning" : void 0,
							children: r.length
						})
					]
				}), !i && (r.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "None"
				}) : e.id === "in-progress" ? Or(t).map((t) => /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					role: "group",
					"aria-label": `${t.label}: ${t.cards.length}`,
					children: [/* @__PURE__ */ x("h4", {
						className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted",
						children: [
							t.label,
							" ",
							/* @__PURE__ */ b(q, { children: t.cards.length })
						]
					}), f(`${e.id}:${t.id}`, t.cards, t.id)]
				}, t.id)) : f(e.id, r))]
			}, e.id);
		})
	});
}
function hu() {
	return fl("(max-width: 767px)");
}
function gu({ workspaceId: e }) {
	let n = l(), r = o(() => Kt(n), [n]), i = o(() => Jr(n), [n]), { value: a, error: s, busy: u, reload: d } = ya(e, t(async (e) => {
		let [t, n] = await Promise.all([r.deliveryPage(e), r.graph(e).catch(() => null)]);
		return {
			items: t.items,
			graph: n,
			reports: t.contentReports ?? []
		};
	}, [r])), f = hu(), [p, h] = Xl(e), [g, _] = c(!1), [v, S] = c(!1), [C, w] = c(null), T = (e) => {
		S(!0), w(null), (async () => {
			try {
				await e(), await d();
			} catch (e) {
				w({
					ok: !1,
					text: J(e)
				});
			} finally {
				S(!1);
			}
		})();
	}, E = (t) => {
		e && (S(!0), w(null), i.start(e, t).then((e) => w({
			ok: !e.full,
			text: e.message
		})).catch((e) => w({
			ok: !1,
			text: J(e)
		})).finally(() => S(!1)));
	}, D = t(async (t, n) => {
		e && (await r.supersede(e, t, n), await d());
	}, [
		r,
		e,
		d
	]), O = a ? Pr(a.graph, a.items) : null, k = O ? Lr(O, p) : null, A = o(() => vr(a?.graph ?? null), [a]), j = k ? new Set(Object.values(k).flat().map((e) => e.id)) : null, M = (a?.reports ?? []).filter((e) => !j || !e.taskId || j.has(e.taskId)), N = a?.items.filter((e) => e.status === "superseded") ?? [], P = !!a?.graph?.statuses.some((e) => e.id === "deferred"), F = Fr(a?.graph ?? null), I = a?.graph?.revision ?? 0;
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-delivery-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-delivery-title",
				view: "delivery",
				meta: /* @__PURE__ */ b("span", {
					role: "status",
					className: "text-xs text-muted",
					children: v ? "Working…" : ""
				}),
				actions: e && /* @__PURE__ */ b(Y, {
					icon: Oe,
					onClick: () => void d(),
					disabled: u || v,
					children: "Refresh"
				}),
				children: "Delivery"
			}),
			(s || C) && /* @__PURE__ */ b("p", {
				role: s || !C?.ok ? "alert" : "status",
				className: `text-sm ${s || !C?.ok ? "text-danger" : "text-muted"}`,
				children: s ?? C?.text
			}),
			e ? k ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Ql, {
					id: "avoozl-delivery",
					filter: p,
					choices: A,
					onChange: h
				}),
				/* @__PURE__ */ b(mu, {
					lanes: k,
					only: Br(p.state),
					narrow: f,
					reset: JSON.stringify(p),
					card: (t, n) => /* @__PURE__ */ b(uu, {
						card: t,
						phase: n,
						ready: k.ready.includes(t),
						canDefer: P,
						resume: F,
						busy: v,
						act: T,
						client: r,
						workspaceId: e,
						revision: I,
						onSupersede: D,
						onStart: E,
						graph: a?.graph ?? null
					}, t.id)
				}),
				M.length > 0 && /* @__PURE__ */ b(_u, { reports: M }),
				N.length > 0 && /* @__PURE__ */ x("label", {
					className: "flex items-center gap-1 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: g,
							onChange: (e) => _(e.target.checked)
						}),
						"Show superseded (",
						N.length,
						")"
					]
				}),
				g && /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-2",
					children: N.map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Z, {
						title: e.title,
						meta: /* @__PURE__ */ b("span", {
							className: "text-sm text-muted",
							children: e.id
						}),
						className: "mb-2"
					}), /* @__PURE__ */ b(Hi, {
						item: e,
						onSupersede: D
					})] }) }, e.id))
				})
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: u ? "Loading…" : "Not loaded"
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			})
		]
	});
}
function _u({ reports: e }) {
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Z, {
			title: "Content rule reports",
			className: "mb-2"
		}),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "A rule set whose action is report lets the content through and records the match here. Change the set to block once its rules are right."
		}),
		/* @__PURE__ */ b("ul", {
			className: "mt-2 flex flex-col gap-1 text-sm",
			children: e.map((e) => /* @__PURE__ */ x("li", {
				className: "flex flex-wrap items-center gap-1.5",
				children: [
					/* @__PURE__ */ b(q, { children: e.set }),
					/* @__PURE__ */ x("span", { children: [
						"Rule ",
						e.rule,
						" at ",
						e.target,
						e.line ? ` line ${e.line}` : "",
						" (",
						e.boundary,
						")"
					] }),
					e.taskId && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: e.taskId
					}),
					e.at && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: e.at.slice(0, 16).replace("T", " ")
					})
				]
			}, e.id))
		})
	] });
}
// kirocrew-app/ui/src/untriaged-api.ts
function vu(e) {
	let t = (t, n) => e.post(Nt, {
		operation: "untriaged.view",
		input: n,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, {}),
		refresh: (e) => t(e, { refresh: !0 }),
		start: (t, n, r) => e.post(Nt, {
			operation: r === "deliver" ? "intake.deliver" : "intake.plan",
			input: {
				source: n.source,
				id: n.id
			},
			workspaceId: t
		}).then((e) => e.result),
		review: (t, n) => e.post(Nt, {
			operation: "review.chat",
			input: {
				repository: n.repository,
				number: n.number
			},
			workspaceId: t
		}).then((e) => e.result)
	};
}
function yu(e) {
	let t = (t, n, r) => e.post(Nt, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		crews: (e, n) => t(e, "untriaged.crews", { repository: n }),
		preview: (e, n) => t(e, "untriaged.handoff", {
			...n,
			preview: !0
		}),
		send: (e, n) => t(e, "untriaged.handoff", {
			...n,
			confirm: !0
		})
	};
}
function bu(e) {
	if (!e.length) return {
		ok: !1,
		reason: "Select issues to send them to an Issue Radar crew.",
		repository: null
	};
	if (e.some((e) => Ou(e) !== "github")) return {
		ok: !1,
		reason: "Issue Radar works GitHub issues. Unselect the items from other sources first.",
		repository: null
	};
	if (e.some((e) => e.kind !== "issue")) return {
		ok: !1,
		reason: "Crews work issues. Unselect the pull requests first.",
		repository: null
	};
	let t = e[0].repository;
	return e.some((e) => e.repository !== t) ? {
		ok: !1,
		reason: "Each crew works one repository. Select issues from one repository.",
		repository: null
	} : {
		ok: !0,
		reason: `Pick a crew and send ${e.length === 1 ? `#${e[0].number}` : `${e.length} issues`} to it. You confirm the label first.`,
		repository: t
	};
}
function xu(e) {
	return e.emptyScope ? "Empty scope: takes every open issue, labeled or not." : `Watches ${e.labels.join(", ")}. Avoozl adds ${e.labels[0]}.`;
}
function Su(e) {
	return e.needsHuman ? {
		text: "Needs you",
		tone: "warning"
	} : e.claimed ? {
		text: "Crew working",
		tone: "info"
	} : {
		text: "Waiting for a crew",
		tone: void 0
	};
}
var Cu = (e) => (t, n) => e.post(Nt, {
	operation: "github.repository.labels",
	input: { repository: n },
	workspaceId: t
}).then((e) => e.result);
function wu(e, t) {
	let n = (e) => e.toLocaleLowerCase(), r = new Set(e.map(n)), i = t ?? [], a = new Set(i.map(n));
	return [...i.map((e) => ({
		name: e,
		checked: r.has(n(e)),
		missing: !1
	})), ...e.filter((e) => !a.has(n(e))).map((e) => ({
		name: e,
		checked: !0,
		missing: t !== null
	}))];
}
var Tu = [
	{
		value: "1",
		label: "Last day"
	},
	{
		value: "7",
		label: "Last week"
	},
	{
		value: "30",
		label: "Last 30 days"
	},
	{
		value: "older",
		label: "Older than 30 days"
	}
], Eu = [
	{
		value: "issue",
		label: "Issues"
	},
	{
		value: "pr",
		label: "Pull requests"
	},
	{
		value: "ticket",
		label: "Tickets"
	},
	{
		value: "review",
		label: "Reviews"
	}
], Du = (e) => !!(e.source || e.repository || e.kind || e.age || e.author || e.label), Ou = (e) => e.source ?? "github", ku = 864e5;
function Au(e, t, n = Date.now()) {
	if (t.source && Ou(e) !== t.source || t.repository && e.repository !== t.repository || t.kind && e.kind !== t.kind || t.author && e.author !== t.author || t.label && !e.labels.includes(t.label)) return !1;
	if (t.age) {
		let r = e.createdAt ? Date.parse(e.createdAt) : NaN;
		return Number.isFinite(r) ? t.age === "older" ? n - r > 30 * ku : n - r <= Number(t.age) * ku : !1;
	}
	return !0;
}
function ju(e) {
	let t = (e) => [...new Set(e)].sort((e, t) => e.localeCompare(t)).map((e) => ({
		value: e,
		label: e
	})), n = e?.items ?? [];
	return {
		sources: t([...(e?.sources ?? []).map((e) => e.id), ...n.map(Ou)]),
		repositories: t((e?.repositories ?? []).map((e) => e.repository)),
		authors: t(n.map((e) => e.author).filter((e) => !!e)),
		labels: t(n.flatMap((e) => e.labels))
	};
}
function Mu(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 60 ? `${r} min` : r < 1440 ? `${Math.round(r / 60)} h` : r < 525600 ? `${Math.round(r / 60 / 24)} d` : `${Math.round(r / 60 / 24 / 365)} y`;
}
var Nu = (e) => Ou(e) === "github" ? `${e.repository}#${e.number}` : `${e.source}:${e.id}`, Pu = (e) => Ou(e) === "github" ? `${e.repository} #${e.number}` : `${e.source} ${e.id}`;
function Fu(e) {
	try {
		return new URL(e.links?.github || (Ou(e) === "github" ? e.url : "") || "").origin;
	} catch {
		return "https://github.com";
	}
}
var Iu = (e) => `${Fu(e)}/${e.repository.split("/").map(encodeURIComponent).join("/")}`, Lu = (e) => e.author ? `${Fu(e)}/${encodeURIComponent(e.author)}` : null;
function Ru(e, t, n) {
	let r = new Set(e);
	for (let e of t) n ? r.add(e) : r.delete(e);
	return r;
}
function zu(e) {
	let t = e.filter((e) => Ou(e) === "github" && e.links.issueRadar);
	if (!t.length) return {
		url: "/issue-radar",
		exact: !1,
		tooltip: "Select GitHub rows to open them in Issue Radar."
	};
	let n = /* @__PURE__ */ new Map();
	for (let e of t) n.set(e.repository, [...n.get(e.repository) ?? [], `#${e.number}`]);
	let r = [...n].map(([e, t]) => `${e} ${t.join(", ")}`).join("; ");
	return {
		url: t[0].links.issueRadar?.url ?? "/issue-radar",
		exact: !1,
		tooltip: `Issue Radar can't take a selection from a link yet, so this opens Issue Radar. Pick these there: ${r}.`
	};
}
function Bu(e) {
	let t = e.repositories.find((e) => e.error);
	return !e.repositories.length && (e.sources ?? []).length ? {
		title: "Nothing untriaged",
		subtitle: "Items from your intake sources that no trigger rule takes show here."
	} : e.repositories.length ? e.repositories.every((e) => !e.checkedAt) ? {
		title: "Not checked yet",
		subtitle: t?.error ?? "Avoozl reads GitHub on its next tick, at most every 10 minutes. Check now reads it at once."
	} : {
		title: "Nothing untriaged",
		subtitle: "Untriaged means open issues and pull requests that no trigger rule, triage label or Avoozl task covers. Change what counts in Settings › Repositories › Triggers and labels › Untriaged."
	} : {
		title: "No repository yet",
		subtitle: "Add a GitHub repository in Settings › Repositories, and its untriaged items show here."
	};
}
var Vu = "avoozl:untriaged-filter:", Hu = {
	event: "avoozl:untriaged-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Vu + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Vu + t, JSON.stringify(n));
		} catch {}
	}
}, Uu = [
	["Pick a crew", "A crew works the open issues that carry a label it watches. Avoozl adds that label."],
	["Check the label", "Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label."],
	["Sent", "A crew picks an issue on its own next turn. Follow it under With Issue Radar."]
], Wu = { color: "var(--danger)" };
function Gu(e) {
	let { workspaceId: n, client: i, items: a, repository: o } = e, [l, u] = c(0), [d, f] = c(null), [m, h] = c(""), [_, v] = c(""), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = t(() => e.onClose(l === 2 ? void 0 : "Cancelled. Nothing was written."), [e, l]);
	r(() => {
		let e = !0;
		return i.crews(n, o).then((t) => {
			e && (f(t), t.crews.length && h(t.crews[0].id));
		}).catch((t) => e && O(J(t))), () => {
			e = !1;
		};
	}, [
		i,
		n,
		o
	]), r(() => {
		k.current?.querySelector("input, button")?.focus();
	}, [l, d]), mi("modal", !0, "Cancel", A);
	let j = d?.crews.find((e) => e.id === m) ?? null, N = () => ({
		items: a.flatMap((e) => e.number === null ? [] : [{
			repository: e.repository,
			number: e.number
		}]),
		...d?.available ? { crew: { id: m } } : { label: _.trim() }
	}), P = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(J(e));
		} finally {
			E(!1);
		}
	}, I = () => P(async () => {
		S(await i.preview(n, N())), u(1);
	}), L = () => P(async () => {
		w(await i.send(n, N())), u(2), e.onSent();
	}), ee = d ? d.available ? !!j : !!_.trim() : !1;
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: l === 2 ? () => e.onClose() : A,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: k,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-radar-title",
			"aria-describedby": "avoozl-radar-line",
			"data-radar-dialog": l,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(36rem, 94vw)",
				maxHeight: "88vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ b("ol", {
					className: "flex flex-wrap gap-2 text-xs",
					"aria-label": "Steps",
					children: Uu.map(([e], t) => /* @__PURE__ */ x("li", {
						"aria-current": t === l ? "step" : void 0,
						className: t === l ? "font-semibold" : "text-muted",
						children: [
							t + 1,
							". ",
							e
						]
					}, e))
				}),
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
					id: "avoozl-radar-title",
					className: "flex items-center gap-1.5 text-base font-semibold",
					children: [/* @__PURE__ */ b(De, {
						size: 14,
						"aria-hidden": "true"
					}), Uu[l][0]]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-radar-line",
					className: "text-sm text-muted",
					children: Uu[l][1]
				})] }),
				l === 0 && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					children: [
						/* @__PURE__ */ x("p", {
							className: "text-xs text-muted",
							children: [
								a.length === 1 ? `#${a[0].number} ${a[0].title}` : `${a.length} issues`,
								" in ",
								o
							]
						}),
						d ? d.available ? d.crews.length === 0 ? /* @__PURE__ */ x("p", {
							"data-radar-no-crews": !0,
							children: [
								o,
								" has no crew in Issue Radar.",
								" ",
								/* @__PURE__ */ b("a", {
									href: "/issue-radar",
									target: "_top",
									className: "underline",
									children: "Add one in Issue Radar"
								}),
								", then come back."
							]
						}) : /* @__PURE__ */ x("fieldset", {
							className: "flex flex-col gap-1.5",
							"data-radar-crews": !0,
							children: [/* @__PURE__ */ b("legend", {
								className: "sr-only",
								children: "Crew"
							}), d.crews.map((e) => /* @__PURE__ */ x("label", {
								className: "flex cursor-pointer items-start gap-2 rounded-md border p-2",
								style: { borderColor: e.id === m ? "var(--accent)" : "var(--border)" },
								children: [/* @__PURE__ */ b("input", {
									type: "radio",
									name: "avoozl-radar-crew",
									checked: e.id === m,
									onChange: () => h(e.id),
									style: { marginTop: 3 }
								}), /* @__PURE__ */ x("span", {
									className: "flex min-w-0 flex-col gap-0.5",
									children: [/* @__PURE__ */ x("span", {
										className: "flex flex-wrap items-center gap-1.5",
										children: [
											/* @__PURE__ */ b("span", {
												className: "font-medium",
												children: e.name
											}),
											e.status && /* @__PURE__ */ b(q, { children: e.status }),
											e.labels.map((e) => /* @__PURE__ */ b(q, {
												variant: "info",
												children: e
											}, e))
										]
									}), /* @__PURE__ */ b("span", {
										className: "text-xs text-muted",
										children: xu(e)
									})]
								})]
							}, e.id))]
						}) : /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-1.5",
							"data-radar-typed": !0,
							children: [/* @__PURE__ */ b("p", {
								className: "text-xs text-muted",
								children: d.reason
							}), /* @__PURE__ */ x("label", {
								className: "flex flex-col gap-1",
								children: [
									/* @__PURE__ */ x("span", { children: ["Label the crew watches ", /* @__PURE__ */ b("span", {
										className: "text-xs text-muted",
										children: "(required)"
									})] }),
									/* @__PURE__ */ b(g, {
										value: _,
										placeholder: "radar",
										onChange: (e) => v(e.target.value)
									}),
									/* @__PURE__ */ b("span", {
										className: "text-xs text-muted",
										children: "Find it in Issue Radar under the crew’s Labels. A crew with no labels takes every open issue, so it needs none."
									})
								]
							})]
						}) : /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: D ? "" : "Reading the crews from Issue Radar…"
						}),
						j?.emptyScope && /* @__PURE__ */ x("p", {
							role: "alert",
							className: "flex items-start gap-1.5 text-sm",
							style: Wu,
							"data-radar-empty-scope": !0,
							children: [
								/* @__PURE__ */ b(F, {
									size: 14,
									"aria-hidden": "true",
									style: {
										marginTop: 3,
										flex: "none"
									}
								}),
								j.name,
								" has an empty scope, so it takes every open issue in ",
								o,
								", labeled or not. Avoozl writes no label; these move to With Issue Radar."
							]
						})
					]
				}),
				l === 1 && y && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					"data-radar-confirm": !0,
					children: [
						y.label ? /* @__PURE__ */ x("p", { children: [
							"Add label ",
							/* @__PURE__ */ b("code", {
								"data-radar-label": !0,
								children: y.label
							}),
							" to ",
							y.items.length === 1 ? "this issue" : `these ${y.items.length} issues`,
							y.crew ? ` for ${y.crew.name}` : "",
							":"
						] }) : /* @__PURE__ */ b("p", { children: "No label is written. These issues move to With Issue Radar:" }),
						/* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-0.5",
							"data-radar-items": !0,
							children: y.items.map((e) => /* @__PURE__ */ x("li", { children: [
								/* @__PURE__ */ x("span", {
									className: "text-muted tabular-nums",
									children: ["#", e.number]
								}),
								" ",
								e.title
							] }, e.number))
						}),
						y.warnings.map((e) => /* @__PURE__ */ b("p", {
							role: "alert",
							style: Wu,
							children: e
						}, e)),
						/* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "To undo, remove the label on GitHub before a crew claims the issue."
						})
					]
				}),
				l === 2 && C && /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-1 text-sm",
					"data-radar-results": !0,
					children: (C.results ?? []).map((e) => /* @__PURE__ */ x("li", {
						className: "flex items-start gap-1.5",
						children: [e.ok ? /* @__PURE__ */ b(M, {
							size: 14,
							"aria-hidden": "true",
							style: {
								color: "var(--ok)",
								marginTop: 3
							}
						}) : /* @__PURE__ */ b(Ie, {
							size: 14,
							"aria-hidden": "true",
							style: {
								color: "var(--danger)",
								marginTop: 3
							}
						}), /* @__PURE__ */ x("span", { children: [
							"#",
							e.number,
							" ",
							e.ok ? C.label ? `labeled ${C.label}` : "recorded" : `not sent: ${e.error}`
						] })]
					}, e.number))
				}),
				D && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: D
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [
						l < 2 && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: A,
							children: "Cancel"
						}),
						l === 1 && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => u(0),
							disabled: T,
							children: "Back"
						}),
						l === 0 && /* @__PURE__ */ b(p, {
							type: "button",
							"data-radar-review": !0,
							onClick: () => void I(),
							disabled: T || !ee,
							children: T ? "Checking…" : "Review"
						}),
						l === 1 && /* @__PURE__ */ b(p, {
							type: "button",
							"data-radar-send": !0,
							onClick: () => void L(),
							disabled: T,
							children: T ? "Sending…" : y?.label ? "Add label" : "Send"
						}),
						l === 2 && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => e.onClose(),
							children: "Close"
						})
					]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/UntriagedView.tsx
var Ku = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, qu = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
}, Ju = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 6,
	padding: "4px 6px",
	border: "1px solid var(--border)",
	borderRadius: 6,
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Yu(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(K, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x("a", {
			href: e.href,
			"aria-label": e.label,
			"aria-describedby": n,
			...e.external ? {
				target: "_blank",
				rel: "noopener noreferrer"
			} : { target: "_top" },
			style: Ju,
			className: "text-sm",
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function Xu({ item: e }) {
	let t = e.kind === "issue" ? L : e.kind === "ticket" ? U : e.kind === "review" ? Ae : e.draft ? ce : se, n = e.kind === "issue" ? "Issue" : e.kind === "ticket" ? "Ticket" : e.kind === "review" ? "Review request" : e.draft ? "Draft pull request" : "Pull request";
	return /* @__PURE__ */ b(K, {
		text: n,
		children: /* @__PURE__ */ b("span", {
			role: "img",
			"aria-label": n,
			style: {
				display: "inline-flex",
				color: e.kind === "issue" || e.kind === "ticket" ? "var(--ok)" : "var(--accent)"
			},
			children: /* @__PURE__ */ b(t, {
				size: 16,
				"aria-hidden": "true"
			})
		})
	});
}
var Zu = {
	passing: "Checks pass",
	failing: "Checks fail",
	pending: "Checks running"
};
function Qu({ item: e }) {
	if (e.kind !== "pr") return null;
	let t = e.checks;
	return /* @__PURE__ */ x("span", {
		className: "inline-flex flex-wrap items-center gap-1.5 text-xs",
		children: [e.draft && /* @__PURE__ */ b(q, { children: "draft" }), t && /* @__PURE__ */ x("span", {
			className: "inline-flex items-center gap-1",
			style: { color: t === "passing" ? "var(--ok)" : t === "failing" ? "var(--danger)" : "var(--muted)" },
			children: [t === "passing" ? /* @__PURE__ */ b(M, {
				size: 12,
				"aria-hidden": "true"
			}) : t === "failing" ? /* @__PURE__ */ b(Ie, {
				size: 12,
				"aria-hidden": "true"
			}) : null, Zu[t]]
		})]
	});
}
function $u({ labels: e }) {
	return e.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: e.map((e) => /* @__PURE__ */ b(q, { children: e }, e))
	}) : null;
}
function ed({ item: e, onSend: t, onReview: n, onStart: r }) {
	let i = Pu(e);
	return Ou(e) === "github" ? /* @__PURE__ */ x("span", {
		className: "inline-flex gap-1.5",
		children: [
			t && (e.kind === "issue" ? /* @__PURE__ */ b(X, {
				icon: Pe,
				label: `Send ${i} to an Issue Radar crew`,
				tooltip: "Send to an Issue Radar crew: pick a crew, check the label, then Avoozl adds it.",
				onClick: () => t(e)
			}) : /* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					display: "inline-block",
					width: 28
				}
			})),
			e.links.issueRadar && /* @__PURE__ */ b(Yu, {
				icon: De,
				label: `Open ${i} in Issue Radar`,
				tooltip: e.links.issueRadar.tooltip,
				href: e.links.issueRadar.url
			}),
			e.links.review && n && /* @__PURE__ */ b(X, {
				icon: Ae,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				onClick: () => n(e)
			}),
			e.reviewChat?.link ? /* @__PURE__ */ b(K, {
				text: "Open this pull request's code review chat",
				children: /* @__PURE__ */ b("a", {
					href: e.reviewChat.link,
					target: "_top",
					className: "self-center text-sm underline",
					"aria-label": `Attach to the code review chat for ${i}`,
					"data-review-attach": !0,
					children: "Attach"
				})
			}) : e.reviewChat?.state === "queued" ? /* @__PURE__ */ b(K, {
				text: "The next tick opens the chat, within a minute.",
				children: /* @__PURE__ */ b("span", {
					className: "self-center text-xs text-muted",
					"data-review-queued": !0,
					children: "Starting…"
				})
			}) : null
		]
	}) : /* @__PURE__ */ x("span", {
		className: "inline-flex gap-1.5",
		children: [
			e.links.review && /* @__PURE__ */ b(Yu, {
				icon: Ae,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				href: e.links.review.url
			}),
			r && e.start?.plan && /* @__PURE__ */ b(X, {
				icon: U,
				label: `Plan this: ${i}`,
				tooltip: "Plan this: a planner turns it into a task in the Inbox.",
				onClick: () => r(e, "plan")
			}),
			r && e.start?.deliver && /* @__PURE__ */ b(X, {
				icon: Te,
				label: `Deliver this: ${i}`,
				tooltip: "Deliver this: one task in its repository, pinned to this text.",
				onClick: () => r(e, "deliver")
			})
		]
	});
}
function td({ item: e }) {
	return /* @__PURE__ */ b("a", {
		href: Iu(e),
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-repository-link": !0,
		children: e.repository
	});
}
function nd({ item: e, fallback: t = "" }) {
	let n = Ou(e) === "github" ? Lu(e) : null;
	return n ? /* @__PURE__ */ b("a", {
		href: n,
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-author-link": !0,
		children: e.author
	}) : /* @__PURE__ */ b(y, { children: e.author ?? t });
}
function rd({ item: e }) {
	let t = Ou(e) === "github";
	return /* @__PURE__ */ x("a", {
		href: e.links.github ?? e.links.item ?? e.url,
		target: "_blank",
		rel: "noopener noreferrer",
		className: "min-w-0",
		style: { overflowWrap: "anywhere" },
		children: [
			/* @__PURE__ */ b("span", {
				className: "text-muted tabular-nums",
				children: t ? `#${e.number}` : e.id
			}),
			" ",
			/* @__PURE__ */ b("span", {
				className: "underline",
				children: e.title
			})
		]
	});
}
function id(e) {
	return /* @__PURE__ */ b("input", {
		type: "checkbox",
		checked: e.checked,
		"aria-label": `Select ${Pu(e.item)}`,
		onChange: (t) => e.onChange(t.target.checked)
	});
}
function ad(e) {
	let t = e.items.map(Nu), n = t.length > 0 && t.every((t) => e.selected.has(t));
	return /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-untriaged-table": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...Ku,
						width: 28
					},
					children: /* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: n,
						"aria-label": "Select every row shown",
						onChange: (n) => e.onSelect(t, n.target.checked)
					})
				}),
				/* @__PURE__ */ b("th", {
					style: {
						...Ku,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Source"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Author"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Age"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Labels"
				}),
				/* @__PURE__ */ b("th", {
					style: {
						...Ku,
						textAlign: "right"
					},
					children: /* @__PURE__ */ b(K, {
						text: "Comments",
						children: /* @__PURE__ */ b("span", {
							role: "img",
							"aria-label": "Comments",
							style: { display: "inline-flex" },
							children: /* @__PURE__ */ b(ve, {
								size: 12,
								"aria-hidden": "true"
							})
						})
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.items.map((t) => /* @__PURE__ */ x("tr", {
				"data-untriaged-row": Nu(t),
				children: [
					/* @__PURE__ */ b("td", {
						style: qu,
						children: /* @__PURE__ */ b(id, {
							item: t,
							checked: e.selected.has(Nu(t)),
							onChange: (n) => e.onSelect([Nu(t)], n)
						})
					}),
					/* @__PURE__ */ b("td", {
						style: qu,
						children: /* @__PURE__ */ b(Xu, { item: t })
					}),
					/* @__PURE__ */ x("td", {
						style: {
							...qu,
							minWidth: "16rem"
						},
						children: [/* @__PURE__ */ b(rd, { item: t }), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(Qu, { item: t }) })]
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						"data-intake-source": !0,
						children: Ou(t)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(td, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(nd, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(K, {
							text: t.createdAt ? `Opened ${t.createdAt.slice(0, 10)}` : null,
							children: /* @__PURE__ */ b("span", {
								className: "tabular-nums",
								children: Mu(t.createdAt, e.now)
							})
						})
					}),
					/* @__PURE__ */ b("td", {
						style: qu,
						children: /* @__PURE__ */ b($u, { labels: t.labels })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							textAlign: "right"
						},
						className: "tabular-nums",
						children: Ou(t) === "github" ? t.comments : ""
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ed, {
							item: t,
							onSend: e.onSend,
							onReview: e.onReview,
							onStart: e.onStart
						})
					})
				]
			}, Nu(t))) })]
		})
	});
}
function od(e) {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-untriaged-stack": !0,
		children: e.items.map((t) => /* @__PURE__ */ x("li", {
			className: "flex items-start gap-2 border-t py-2 first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-untriaged-row": Nu(t),
			children: [
				/* @__PURE__ */ b(id, {
					item: t,
					checked: e.selected.has(Nu(t)),
					onChange: (n) => e.onSelect([Nu(t)], n)
				}),
				/* @__PURE__ */ b(Xu, { item: t }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(rd, { item: t }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								Ou(t),
								" · ",
								/* @__PURE__ */ b(td, { item: t }),
								" · ",
								/* @__PURE__ */ b(nd, {
									item: t,
									fallback: "unknown"
								}),
								" · ",
								Mu(t.createdAt, e.now),
								Ou(t) === "github" ? ` · ${t.comments} comment${t.comments === 1 ? "" : "s"}` : ""
							]
						}),
						/* @__PURE__ */ b(Qu, { item: t }),
						/* @__PURE__ */ b($u, { labels: t.labels })
					]
				}),
				/* @__PURE__ */ b(ed, {
					item: t,
					onSend: e.onSend,
					onReview: e.onReview,
					onStart: e.onStart
				})
			]
		}, Nu(t)))
	});
}
function sd({ list: e, now: t }) {
	let n = e.repositories.filter((e) => e.error || e.truncated), r = (e.sources ?? []).filter((e) => e.id !== "github"), i = e.repositories.map((e) => e.checkedAt).filter((e) => !!e).sort();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-0.5 text-xs text-muted",
		"data-untriaged-checked": !0,
		children: [
			e.repositories.length > 0 && /* @__PURE__ */ x("span", { children: [i.length ? `Checked ${Mn(i[0], t)}` : "Not checked yet", " · GitHub is read at most every 10 minutes."] }),
			r.map((e) => /* @__PURE__ */ x("span", {
				className: e.error ? "text-danger" : void 0,
				"data-intake-source-state": e.id,
				children: [
					e.id,
					": ",
					e.error ?? (e.via === "mcp" ? "Items arrive through MCP." : e.checkedAt ? `Read ${Mn(e.checkedAt, t)}${e.more ? ", more on the next tick" : ""}.` : "Read on the next tick."),
					e.refused ? ` ${e.refused} item${e.refused === 1 ? "" : "s"} refused.` : ""
				]
			}, e.id)),
			n.map((e) => /* @__PURE__ */ x("span", {
				className: e.error ? "text-danger" : void 0,
				children: [
					e.repository,
					": ",
					e.error ?? `GitHub search returns ${e.read} of the ${e.searched ?? "more"} items it found. Narrow its Untriaged filter to see the rest.`
				]
			}, e.repository))
		]
	});
}
function cd({ items: e, now: t, narrow: n }) {
	let r = (e) => e.handoff ? `Sent${e.handoff.crew ? ` to ${e.handoff.crew.name}` : ""}${e.handoff.label ? ` with ${e.handoff.label}` : ""}${e.handoff.at ? ` ${Mn(e.handoff.at, t)}` : ""}` : "A crew found it on its own", i = ({ item: e }) => {
		let t = Su(e);
		return /* @__PURE__ */ b(q, {
			variant: t.tone,
			children: t.text
		});
	};
	return n ? /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-radar-list": !0,
		children: e.map((e) => /* @__PURE__ */ x("li", {
			className: "flex items-start gap-2 border-t py-2 first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-radar-row": Nu(e),
			children: [
				/* @__PURE__ */ b(Xu, { item: e }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(rd, { item: e }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								/* @__PURE__ */ b(td, { item: e }),
								" · ",
								r(e)
							]
						}),
						/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(i, { item: e }) })
					]
				}),
				/* @__PURE__ */ b(ed, { item: e })
			]
		}, Nu(e)))
	}) : /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-radar-list": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...Ku,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "State"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: "How it got there"
				}),
				/* @__PURE__ */ b("th", {
					style: Ku,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.map((e) => /* @__PURE__ */ x("tr", {
				"data-radar-row": Nu(e),
				children: [
					/* @__PURE__ */ b("td", {
						style: qu,
						children: /* @__PURE__ */ b(Xu, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							minWidth: "16rem"
						},
						children: /* @__PURE__ */ b(rd, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(td, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(i, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: qu,
						className: "text-muted",
						children: r(e)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...qu,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ed, { item: e })
					})
				]
			}, Nu(e))) })]
		})
	});
}
function ld({ workspaceId: e }) {
	let n = l(), r = xi(), i = o(() => vu(n), [n]), a = o(() => yu(n), [n]), [s, u] = gi("untriaged-show", "inner", (e) => e === "radar" ? "Back to With Issue Radar" : "Back to Untriaged", "untriaged"), [d, f] = c(null), [p, m] = c(null), { value: g, error: _, busy: S } = ya(e, t((e) => i.view(e), [i])), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), [k, A] = Oa(e, Hu), [j, M] = c(() => /* @__PURE__ */ new Set()), N = fl("(max-width: 767px)"), P = Date.now(), F = C ?? g, I = o(() => ju(F), [F]), L = o(() => (F?.items ?? []).filter((e) => Au(e, k, P)), [
		F,
		k,
		P
	]), ee = Oi(JSON.stringify(k)), R = L.filter((e) => j.has(Nu(e))), z = zu(R), te = bu(R), B = F?.withRadar ?? [], V = async () => {
		if (e) try {
			w(await i.view(e)), M(/* @__PURE__ */ new Set());
		} catch (e) {
			O(J(e));
		}
	}, H = async (t) => {
		if (e) {
			O(null);
			try {
				let n = await i.review(e, t);
				m(n.state === "open" ? `${t.repository} #${t.number} already has a code review chat. Use Attach.` : `Code review chat for ${t.repository} #${t.number} starts on the next tick${n.skill ? "" : ". The sage-review skill is not installed, so it reviews without it"}.`), await V();
			} catch (e) {
				O(J(e));
			}
		}
	}, ne = async (t, n) => {
		if (!e) return;
		let a = Pu(t);
		if (await r(n === "deliver" ? {
			title: `Deliver ${a}?`,
			body: `Avoozl makes one task in ${t.repository} from "${t.title}", pinned to its text now, and a worker starts it. Avoozl writes nothing back to ${t.source}.`,
			action: "Deliver this"
		} : {
			title: `Plan ${a}?`,
			body: `Avoozl adds "${t.title}" to the Inbox for a planner. Nothing starts until a plan is approved.`,
			action: "Plan this"
		})) {
			O(null);
			try {
				let r = await i.start(e, t, n);
				m(`${a} is now task ${r.taskId}.`), await V();
			} catch (e) {
				O(J(e));
			}
		}
	}, U = (e) => A({
		...k,
		...e
	}), W = (e, t) => M(Ru(j, e, t)), re = async () => {
		if (e) {
			E(!0), O(null);
			try {
				w(await i.refresh(e));
			} catch (e) {
				O(J(e));
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-untriaged-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-untriaged-title",
				view: "untriaged",
				actions: /* @__PURE__ */ b(Y, {
					icon: Oe,
					onClick: () => void re(),
					disabled: S || T || !F?.enabled,
					tooltip: "Read GitHub and poll each plugin source now instead of waiting for the next check",
					children: T ? "Checking…" : "Check now"
				}),
				children: "Intake"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Work that comes in from GitHub and your intake sources. Untriaged shows the items no trigger rule, triage label or Avoozl task covers. Send GitHub issues to an Issue Radar crew or start a code review chat on a pull request; plan or deliver an item from another source."
			}),
			F?.enabled && /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(v, {
				layoutId: "avoozl-untriaged-show",
				ariaLabel: "Show",
				segments: [{
					key: "untriaged",
					label: `Untriaged (${F.items.length})`
				}, ...F.mode ? [{
					key: "radar",
					label: `With Issue Radar (${B.length})`
				}] : []],
				value: s,
				onChange: (e) => u(e)
			}) }),
			p && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				"data-radar-note": !0,
				children: p
			}),
			(_ || D) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: _ ?? D
			}),
			F ? F.enabled ? s === "radar" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-radar-view": !0,
				children: [/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Issues a crew holds, or that you sent to one. Crews act with your GitHub login, so Avoozl tells their work apart by label: a close on an issue a crew claimed counts only once its pull request merges, a crew’s labels never start Avoozl rules, and a crew’s “needs human” label shows under Needs you."
				}), B.length === 0 ? /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(De, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "Nothing with Issue Radar",
					subtitle: "Select issues under Untriaged and press Send to Issue Radar."
				}) : /* @__PURE__ */ b(cd, {
					items: B,
					now: P,
					narrow: N
				})]
			}) : F.items.length === 0 ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(sd, {
				list: F,
				now: P
			}), /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(fe, {
					size: 36,
					"aria-hidden": "true"
				}),
				...Bu(F)
			})] }) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Ea, {
					id: "avoozl-untriaged",
					label: "Filter untriaged items",
					active: Du(k),
					onClear: () => A({}),
					fields: [
						{
							kind: "select",
							key: "source",
							label: "Source",
							value: k.source ?? "",
							options: I.sources,
							onChange: (e) => U({ source: e || void 0 })
						},
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: k.repository ?? "",
							options: I.repositories,
							onChange: (e) => U({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: k.kind ?? "",
							options: Eu,
							onChange: (e) => U({ kind: e || void 0 })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: k.age ?? "",
							options: Tu,
							onChange: (e) => U({ age: e || void 0 })
						},
						{
							kind: "select",
							key: "author",
							label: "Author",
							value: k.author ?? "",
							options: I.authors,
							onChange: (e) => U({ author: e || void 0 })
						},
						{
							kind: "select",
							key: "label",
							label: "Label",
							value: k.label ?? "",
							options: I.labels,
							onChange: (e) => U({ label: e || void 0 })
						}
					],
					children: /* @__PURE__ */ x("div", {
						className: "flex flex-wrap items-start gap-3",
						children: [
							/* @__PURE__ */ x("div", {
								className: "flex min-w-0 flex-1 flex-col gap-1",
								style: { minWidth: "16rem" },
								children: [/* @__PURE__ */ x("p", {
									role: "status",
									className: "text-xs text-muted",
									children: [L.length === F.items.length ? `${F.items.length} untriaged` : `${L.length} of ${F.items.length} untriaged`, R.length ? ` · ${R.length} selected` : ""]
								}), /* @__PURE__ */ b(sd, {
									list: F,
									now: P
								})]
							}),
							/* @__PURE__ */ b(K, {
								text: z.tooltip,
								children: (e) => /* @__PURE__ */ x("a", {
									href: R.length ? z.url : void 0,
									target: "_top",
									role: "button",
									"aria-disabled": !R.length || void 0,
									"aria-describedby": e,
									tabIndex: 0,
									style: {
										...Ju,
										opacity: R.length ? 1 : .5,
										cursor: R.length ? "pointer" : "default"
									},
									className: "text-sm",
									"data-bulk-open": !0,
									children: [/* @__PURE__ */ b(De, {
										size: 14,
										"aria-hidden": "true"
									}), "Open selected in Issue Radar"]
								})
							}),
							/* @__PURE__ */ b(Y, {
								icon: Pe,
								onClick: () => f(R),
								disabled: !te.ok,
								tooltip: te.reason,
								children: "Send selected to Issue Radar"
							})
						]
					})
				}),
				L.length === 0 ? /* @__PURE__ */ x("p", {
					className: "text-sm text-muted",
					children: [
						"No untriaged item matches these filters. Clear them to see all ",
						F.items.length,
						"."
					]
				}) : b(N ? od : ad, {
					items: ee.take("untriaged", L),
					selected: j,
					now: P,
					onSelect: W,
					onSend: (e) => f([e]),
					onReview: (e) => void H(e),
					onStart: (e, t) => void ne(e, t)
				}),
				/* @__PURE__ */ b(ki, { ...ee.more("untriaged", L.length) })
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Intake needs a GitHub mode or an intake source. Choose a mode in Settings › GitHub, or add a source in Settings › Plugins."
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: S ? "Loading…" : "Not loaded"
			}),
			d && e && /* @__PURE__ */ b(Gu, {
				workspaceId: e,
				client: a,
				items: d,
				repository: d[0].repository,
				onSent: () => void V(),
				onClose: (e) => {
					f(null), m(e ?? null);
				}
			})
		]
	});
}
// kirocrew-app/ui/src/settings-api.ts
function ud(e) {
	let t = async (t, n, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		get: (e) => t("github.settings.get", {}, e),
		validate: (e, n) => t("github.settings.validate", { github: n }, e),
		save: (e, n, r) => t("github.settings.update", {
			github: n,
			expectedHash: r
		}, e),
		setup: (e, n) => t("github.setup", { ...n }, e),
		cancelSetup: (e, n) => t("github.setup.cancel", { previewHash: n }, e)
	};
}
function dd(e) {
	let t = xd(e.project);
	return {
		mode: Sd(e.mode) || "plans-repo",
		planningRepository: Sd(e.planningRepository),
		repositories: Object.keys(xd(e.repositories)).join(", "),
		projectOwner: Sd(t.owner),
		projectNumber: Sd(t.number),
		projectTitle: "",
		releases: "",
		iteration: !!xd(t.fields).iteration,
		tableByWave: !1,
		epic: !0
	};
}
function fd(e) {
	let t = /^\d+$/.test(e.projectNumber.trim()) ? Number(e.projectNumber.trim()) : void 0, n = Md({
		owner: Ed(e.projectOwner),
		number: t,
		title: t === void 0 ? Ed(e.projectTitle) : void 0
	});
	return Md({
		mode: e.mode,
		planningRepository: e.mode === "plans-repo" ? Ed(e.planningRepository) : void 0,
		repositories: Td(e.repositories),
		project: Object.keys(n).length ? n : void 0,
		releases: Td(e.releases),
		iteration: e.iteration,
		tableByWave: e.tableByWave,
		epic: e.epic
	});
}
var pd = (e) => /[\s,"]/.test(e) ? `"${e}"` : e;
function md(e) {
	let t = (e) => Array.isArray(e) ? e.filter((e) => typeof e == "string" && e.trim() !== "").map((e) => e.trim()) : [], n = t(e.labelsAll), r = t(e.labelsAny), i = t(e.labelsNone), a = typeof e.assignee == "string" ? e.assignee.trim() : "";
	return [
		...n.map((e) => `label:${pd(e)}`),
		...r.length ? [`label:${r.map(pd).join(",")}`] : [],
		...i.length ? [`-label:${i.map(pd).join(",")}`] : [],
		...a ? [`assignee:${a}`] : []
	].join(" ");
}
var hd = "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee.", gd = (e) => (t, n, r, i = !1) => e.post(Nt, {
	operation: "github.trigger.preview",
	input: {
		match: r,
		...n.trim() ? { repository: n.trim() } : {},
		...i ? { untriaged: !0 } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function _d(e) {
	return e ? [
		{
			kind: "all",
			values: e.labelsAll
		},
		{
			kind: "any",
			values: e.labelsAny
		},
		{
			kind: "none",
			values: e.labelsNone
		},
		{
			kind: "assignee",
			values: e.unassigned ? ["nobody"] : e.assignee ? [e.assignee] : []
		}
	].filter((e) => e.values.length > 0) : [];
}
var vd = () => ({
	filter: "",
	triageLabels: [],
	ignoreOlderThanDays: "",
	notify: !1
}), yd = (e) => e.map((e) => `-label:${pd(e)}`).join(" ");
function bd(e) {
	let t = Md({
		filter: Ed(e.filter),
		triageLabels: e.triageLabels.length ? e.triageLabels : void 0,
		ignoreOlderThanDays: Dd(e.ignoreOlderThanDays),
		notify: e.notify || void 0
	});
	return Object.keys(t).length ? t : void 0;
}
var xd = (e) => e && typeof e == "object" && !Array.isArray(e) ? e : {}, Sd = (e) => typeof e == "string" ? e : typeof e == "number" ? String(e) : "", Cd = (e) => Array.isArray(e) ? e.map(Sd).join(", ") : "", wd = (e) => Object.fromEntries(Object.entries(xd(e)).map(([e, t]) => [e, Sd(t)]));
function Td(e) {
	let t = e.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
	return t.length ? t : void 0;
}
var Ed = (e) => e.trim() ? e.trim() : void 0;
function Dd(e) {
	let t = e.trim();
	if (t) return /^\d+$/.test(t) ? Number(t) : t;
}
var Od = /* @__PURE__ */ new Set([
	"baseBranch",
	"coder",
	"allowedActors",
	"minimumPermission",
	"requiredChecks",
	"concurrency",
	"priority",
	"pullRequestReviews",
	"managedLabels",
	"crewLabels",
	"rules",
	"untriaged"
]);
function kd() {
	return {
		id: "",
		action: "deliver",
		match: "",
		author: "",
		autoPublishChildren: !1
	};
}
function Ad(e = "") {
	return {
		name: e,
		baseBranch: "main",
		coder: "",
		allowedActors: "",
		minimumPermission: "",
		requiredChecks: "",
		concurrency: "",
		priority: "",
		pullRequestReviews: !1,
		reviewApprovals: "",
		managedLabels: {},
		crewLabels: {},
		rules: [],
		untriaged: vd(),
		rest: {}
	};
}
function jd(e) {
	let t = xd(e.project);
	return {
		mode: Sd(e.mode),
		planningRepository: Sd(e.planningRepository),
		defaultAuthority: Sd(e.defaultAuthority),
		epicIssueType: Sd(e.epicIssueType),
		projectOwner: Sd(t.owner),
		projectNumber: Sd(t.number),
		fields: wd(t.fields),
		statusValues: wd(t.statusValues),
		repositories: Object.entries(xd(e.repositories)).map(([e, t]) => {
			let n = xd(t), r = n.pullRequestReviews;
			return {
				name: e,
				baseBranch: Sd(n.baseBranch),
				coder: Sd(n.coder),
				allowedActors: Cd(n.allowedActors),
				minimumPermission: Sd(n.minimumPermission),
				requiredChecks: Cd(n.requiredChecks),
				concurrency: Sd(n.concurrency),
				priority: Cd(n.priority),
				pullRequestReviews: r != null,
				reviewApprovals: Sd(xd(r).approvals),
				managedLabels: wd(n.managedLabels),
				crewLabels: wd(n.crewLabels),
				rules: (Array.isArray(n.rules) ? n.rules : []).map((e) => {
					let t = xd(e);
					return {
						id: Sd(t.id),
						action: Sd(t.action),
						match: typeof t.match == "string" ? t.match : md(t),
						author: Sd(t.author),
						autoPublishChildren: t.autoPublishChildren === !0
					};
				}),
				untriaged: (() => {
					let e = xd(n.untriaged);
					return {
						filter: Sd(e.filter),
						triageLabels: Array.isArray(e.triageLabels) ? e.triageLabels.map(Sd).filter(Boolean) : [],
						ignoreOlderThanDays: Sd(e.ignoreOlderThanDays),
						notify: e.notify === !0
					};
				})(),
				rest: Object.fromEntries(Object.entries(n).filter(([e]) => !Od.has(e)))
			};
		})
	};
}
function Md(e) {
	return Object.fromEntries(Object.entries(e).filter(([, e]) => e !== void 0));
}
function Nd(e) {
	let t = Md(Object.fromEntries(Object.entries(e).map(([e, t]) => [e, Ed(t)])));
	return Object.keys(t).length ? t : void 0;
}
function Pd(e) {
	let t = Nd(e.fields), n = Nd(e.statusValues), r = !!(e.projectOwner.trim() || e.projectNumber.trim() || t || n);
	return {
		mode: Ed(e.mode) ?? null,
		planningRepository: Ed(e.planningRepository) ?? null,
		defaultAuthority: Ed(e.defaultAuthority) ?? null,
		epicIssueType: Ed(e.epicIssueType) ?? null,
		project: r ? Md({
			owner: Ed(e.projectOwner),
			number: Dd(e.projectNumber),
			fields: t,
			statusValues: n
		}) : null,
		repositories: e.repositories.length ? Object.fromEntries(e.repositories.map((e) => [e.name.trim(), Md({
			...e.rest,
			baseBranch: Ed(e.baseBranch),
			coder: Ed(e.coder),
			allowedActors: Td(e.allowedActors),
			minimumPermission: Ed(e.minimumPermission),
			requiredChecks: Td(e.requiredChecks),
			concurrency: Dd(e.concurrency),
			priority: Td(e.priority),
			pullRequestReviews: e.pullRequestReviews ? Md({ approvals: Dd(e.reviewApprovals) }) : void 0,
			managedLabels: Nd(e.managedLabels),
			crewLabels: Nd(e.crewLabels),
			rules: e.rules.map((e) => Md({
				id: e.id.trim(),
				action: e.action,
				match: Ed(e.match),
				author: Ed(e.author),
				autoPublishChildren: e.autoPublishChildren || void 0
			})),
			untriaged: bd(e.untriaged)
		})])) : null
	};
}
var Fd = {
	owner: {
		required: !0,
		when: "to use a Project"
	},
	number: {
		required: !0,
		when: "to use a Project"
	},
	status: {
		required: !1,
		blank: "blank: uses the field named Status"
	},
	release: {
		required: !1,
		blank: "blank: uses the field named Release"
	},
	wave: {
		required: !1,
		blank: "blank: uses the field named Wave"
	},
	iteration: {
		required: !1,
		blank: "blank: Avoozl skips Iteration"
	},
	avoozlState: {
		required: !1,
		blank: "blank: Avoozl skips Avoozl state"
	},
	todo: {
		required: !1,
		blank: "blank: Ready, or Todo on an older board"
	},
	inProgress: {
		required: !1,
		blank: "blank: In progress"
	},
	done: {
		required: !1,
		blank: "blank: Done"
	},
	deferred: {
		required: !1,
		blank: "blank: Deferred"
	}
}, Id = {
	status: "Status",
	release: "Release",
	wave: "Wave",
	iteration: "",
	avoozlState: "",
	todo: "Ready",
	inProgress: "In progress",
	done: "Done",
	deferred: "Deferred"
}, Ld = {
	name: { required: !0 },
	baseBranch: {
		required: !0,
		when: "with a GitHub mode"
	},
	coder: {
		required: !1,
		blank: "blank: Issue Radar in single-repo mode, worker sessions otherwise"
	},
	concurrency: {
		required: !1,
		blank: "blank: 1 at a time"
	},
	allowedActors: {
		required: !1,
		blank: "blank: anyone with the minimum permission"
	},
	minimumPermission: {
		required: !1,
		blank: "blank: write, unless actors are named"
	},
	managed: {
		required: !0,
		when: "to create issues"
	},
	ready: {
		required: !0,
		when: "to create issues"
	},
	responding: {
		required: !1,
		blank: "needed only for a respond rule"
	},
	planning: {
		required: !1,
		blank: "blank: Avoozl adds none"
	},
	stale: {
		required: !1,
		blank: "blank: Avoozl adds none"
	},
	decision: {
		required: !1,
		blank: "blank: Avoozl adds none"
	}
}, Rd = {
	managed: "Managed issue",
	ready: "Ready to code",
	responding: "Responding",
	planning: "Planning",
	stale: "Stale claim",
	decision: "Needs a decision"
};
function zd(e) {
	if (e.mode === "plans-repo" && !e.planningRepository.trim()) return "Plans repository mode needs its planning repository (Where tasks live).";
	if (!qd(e.mode)) return null;
	let t = e.projectOwner.trim() || e.projectNumber.trim() || Object.values(e.fields).some((e) => e.trim()) || Object.values(e.statusValues).some((e) => e.trim());
	if (t && !e.projectOwner.trim()) return "The Project needs its owner (Where tasks live › Project fields).";
	if (t && !e.projectNumber.trim()) return "The Project needs its number (Where tasks live › Project fields).";
	for (let [t, n] of e.repositories.entries()) {
		let r = n.name.trim() || `Repository ${t + 1}`;
		if (!n.name.trim()) return `${r} needs its owner/name (Repositories › Mode and branch).`;
		if (qd(e.mode) && !n.baseBranch.trim()) return `${r} needs its default branch (Repositories › Mode and branch).`;
	}
	return null;
}
function Bd(e, t, n, r = Date.now()) {
	let i = t[e], a = [];
	return n && a.push("Required by GitHub branch rule"), i && a.push(i.at ? `${i.source} · last run ${Mn(i.at, r)}` : i.source), a.join(" · ") || "Not seen on recent commits or open pull requests";
}
function Vd(e, t, n = Date.now()) {
	let r = Td(e) ?? [], i = t?.sources ?? {}, a = new Set(t?.seen ?? []), o = new Set(t?.required ?? []);
	return [.../* @__PURE__ */ new Set([...t?.seen ?? [], ...r])].map((e) => ({
		name: e,
		checked: o.has(e) || r.includes(e),
		seen: a.has(e),
		branchRule: o.has(e),
		where: Bd(e, i, o.has(e), n)
	})).sort((e, t) => Number(t.branchRule) - Number(e.branchRule) || Number(t.seen) - Number(e.seen) || e.name.localeCompare(t.name));
}
function Hd(e, t, n) {
	let r = Td(e) ?? [];
	return (n ? [.../* @__PURE__ */ new Set([...r, t])] : r.filter((e) => e !== t)).join(", ");
}
var Ud = (e) => (t, n, r) => e.post(Nt, {
	operation: "github.repository.inspect",
	input: {
		repository: n,
		...r.trim() ? { baseBranch: r.trim() } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function Wd(e) {
	if (!e) return "Reading the branch rules…";
	if (e.error || !e.reviewRule) return e.reviewError ?? e.error ?? "The branch rules could not be read.";
	let t = e.reviewRule;
	return t.hidden ? `${t.hiddenReason ?? "GitHub hides the classic protection rule from this account."} The approval count is unknown${t.approvals ? `, at least ${t.approvals} from a ruleset` : ""}. GitHub still enforces it on merge. ${t.approvals ? `Avoozl waits for ${t.approvals} approval${t.approvals === 1 ? "" : "s"} meanwhile.` : "Avoozl's reviewer chats stay the review gate."}` : t.approvals ? `${e.branch} needs ${t.approvals} approving review${t.approvals === 1 ? "" : "s"} (${t.sources.join(" and ")})${t.dismissStale ? ", and a new push dismisses old approvals" : ""}. Avoozl waits for that many from allowed people on the pull request's head commit.` : "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate.";
}
var Gd = [
	{
		mode: "local",
		title: "Local only",
		line: "Tasks stay in this workspace's database on this Mac. Nothing goes to GitHub.",
		useWhen: [
			"You work alone or offline",
			"No GitHub issues or board wanted",
			"Trying Avoozl out"
		],
		facts: [
			["Who closes tasks", "Avoozl, once checks and reviewer chats pass and the work merges into the landing branch"],
			["Pull request text", "None: work lands on the branch in your checkout"],
			["Default coder", "Avoozl worker chats"],
			["Limit", "No issues, labels, Project board or GitHub checks"]
		]
	},
	{
		mode: "plans-repo",
		title: "Plans repository",
		line: "Specs and their related issues live in a private planning repository; code and pull requests live in the code repositories.",
		useWhen: [
			"Planning stays private",
			"Code repositories are public or shared",
			"One plan spans several code repositories"
		],
		facts: [
			["Who closes issues", "GitHub, when the pull request from the linked branch Avoozl made merges"],
			["Pull request text", "The task only; never the planning repository"],
			["Default coder", "Avoozl worker sessions"],
			["Limit", "Issue Radar cannot code here"]
		]
	},
	{
		mode: "single-repo",
		title: "Single repository",
		line: "Specs, issues and pull requests all live in the code repository.",
		useWhen: [
			"One repository",
			"Open planning is fine",
			"The simplest setup"
		],
		facts: [
			["Who closes issues", "GitHub, from \"Closes #N\" when the pull request merges"],
			["Pull request text", "Names its issue with Closes #N"],
			["Default coder", "Issue Radar (worker sessions also allowed)"],
			["Limit", "Issues and plans are visible to everyone who can see the repository"]
		]
	}
], Kd = (e) => e === "plans-repo" || e === "single-repo" ? e : "local", qd = (e) => Kd(e) !== "local";
function Jd(e) {
	let t = Kd(e), n = [
		"reviewerChats",
		"landingBranch",
		"workerChats"
	];
	if (t === "local") return /* @__PURE__ */ new Set([...n, "localChecks"]);
	let r = [
		"defaultAuthority",
		"epicIssueType",
		"projectFields",
		"setupGitHub",
		"coder",
		"triggers",
		"requiredChecks",
		"pullRequestReviews"
	];
	return t === "plans-repo" ? /* @__PURE__ */ new Set([
		...n,
		...r,
		"planningRepository"
	]) : /* @__PURE__ */ new Set([
		...n,
		...r,
		"issueRadarCrews"
	]);
}
var Yd = "Labels, checks, reviews and the Project board only apply to GitHub modes.";
function Xd(e) {
	let t = [];
	return e.planningRepository.trim() && t.push("planning repository"), (e.projectOwner.trim() || e.projectNumber.trim()) && t.push("Project board"), e.repositories.length && t.push(`${e.repositories.length} repository GitHub setting${e.repositories.length === 1 ? "" : "s"}`), e.epicIssueType.trim() && t.push("epic issue type"), t;
}
var Zd = [
	{
		key: "repository",
		title: "Repository",
		steps: [
			"token",
			"repository",
			"issues"
		]
	},
	{
		key: "project",
		title: "Project",
		steps: ["project"]
	},
	{
		key: "fields",
		title: "Fields and views",
		steps: [
			"fields",
			"views",
			"workflows",
			"epic"
		]
	},
	{
		key: "labels",
		title: "Labels",
		steps: ["labels"]
	},
	{
		key: "settings",
		title: "Settings file",
		steps: ["settings"]
	}
], Qd = (e) => /^create|^enable/.test(e.action) ? "create" : /^keep/.test(e.action) ? "keep" : "change";
function $d(e) {
	return Zd.map((t) => ({
		...t,
		writes: e.filter((e) => t.steps.includes(e.step))
	})).filter((e) => e.writes.length);
}
function ef(e, t, n) {
	if (t) return {
		kind: "error",
		reason: t,
		fix: null
	};
	if (!e) return { kind: "checking" };
	let r = e.steps.find((e) => e.status === "failed");
	return r && !e.writes.length ? {
		kind: "error",
		reason: `${r.title}: ${r.reason}`,
		fix: r.fix
	} : e.writes.length || e.settings.changed ? {
		kind: "changes",
		count: e.writes.length + +!!e.settings.changed,
		at: n
	} : {
		kind: "set-up",
		at: n
	};
}
var tf = [{
	coder: "worker",
	title: "Avoozl worker chats",
	line: "Avoozl opens a Kiro Crew chat on this Mac for each ready task.",
	flow: [
		"Ready task",
		"Worker chat",
		"Checks",
		"Reviewer chats",
		"Merged"
	],
	useWhen: [
		"Plans stay private",
		"You want to watch each chat",
		"The work needs this Mac"
	],
	reviews: "Avoozl's reviewer chats review the exact commit; on GitHub, the branch's review rule applies too.",
	modes: [
		"local",
		"plans-repo",
		"single-repo"
	]
}, {
	coder: "issue-radar",
	title: "Issue Radar",
	line: "You label a GitHub issue and Issue Radar takes it.",
	flow: [
		"Ready label",
		"Issue Radar crew",
		"Pull request",
		"GitHub checks",
		"Merged"
	],
	useWhen: [
		"One open repository",
		"Your crew already codes issues",
		"Pull requests can say Closes #N"
	],
	reviews: "GitHub's branch review rule and the required checks on the pull request.",
	modes: ["single-repo"]
}], nf = (e) => Kd(e) === "single-repo" ? "issue-radar" : "worker", rf = "workspaces";
function af(e, t, n, r) {
	let i = rf;
	return t === "settings" && e !== "settings" ? i : r.includes(n) ? n : i;
}
// kirocrew-app/ui/src/ModePicker.tsx
var of = "var(--ok)", sf = "var(--tile-purple, var(--accent))";
function cf({ color: e, children: t }) {
	return /* @__PURE__ */ b("span", {
		className: "inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-4",
		style: {
			background: e,
			color: "var(--card)"
		},
		children: t
	});
}
function lf() {
	return /* @__PURE__ */ b("svg", {
		width: 10,
		height: 10,
		viewBox: "0 0 16 16",
		"aria-label": "private",
		role: "img",
		style: { flex: "none" },
		children: /* @__PURE__ */ b("path", {
			fill: "currentColor",
			d: "M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0Z"
		})
	});
}
function uf({ color: e }) {
	return /* @__PURE__ */ x("svg", {
		width: 11,
		height: 11,
		viewBox: "0 0 16 16",
		"aria-hidden": "true",
		style: {
			flex: "none",
			color: e
		},
		children: [/* @__PURE__ */ b("circle", {
			cx: 8,
			cy: 8,
			r: 6.25,
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.5
		}), /* @__PURE__ */ b("circle", {
			cx: 8,
			cy: 8,
			r: 1.6,
			fill: "currentColor"
		})]
	});
}
function df({ color: e }) {
	return /* @__PURE__ */ x("svg", {
		width: 11,
		height: 11,
		viewBox: "0 0 16 16",
		"aria-hidden": "true",
		style: {
			flex: "none",
			color: e
		},
		children: [
			/* @__PURE__ */ b("circle", {
				cx: 4,
				cy: 3.5,
				r: 1.8,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4
			}),
			/* @__PURE__ */ b("circle", {
				cx: 4,
				cy: 12.5,
				r: 1.8,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4
			}),
			/* @__PURE__ */ b("circle", {
				cx: 12,
				cy: 12.5,
				r: 1.8,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4
			}),
			/* @__PURE__ */ b("path", {
				d: "M4 5.3v5.4M12 10.7V6.5A2 2 0 0 0 10 4.5H7.5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4
			})
		]
	});
}
var ff = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card)",
	minWidth: 0,
	overflow: "hidden"
};
function pf({ name: e, locked: t, children: n }) {
	return /* @__PURE__ */ x("div", {
		style: ff,
		className: "flex-1 text-[11px] leading-4",
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1 px-2 py-1 font-semibold",
			style: {
				background: "var(--bg-elevated, transparent)",
				borderBottom: "1px solid var(--border)",
				color: "var(--text)"
			},
			children: [t && /* @__PURE__ */ b(lf, {}), /* @__PURE__ */ b("span", {
				className: "truncate",
				children: e
			})]
		}), /* @__PURE__ */ b("div", {
			className: "flex flex-col",
			children: n
		})]
	});
}
function mf({ icon: e, title: t, pill: n, sub: r }) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-0.5 px-2 py-1",
		style: { borderTop: "1px solid var(--border)" },
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1",
			children: [
				e,
				/* @__PURE__ */ b("span", {
					className: "min-w-0 flex-1 truncate",
					style: { color: "var(--text)" },
					children: t
				}),
				n
			]
		}), r && /* @__PURE__ */ b("div", {
			className: "truncate text-muted",
			children: r
		})]
	});
}
function hf() {
	return /* @__PURE__ */ x("div", {
		"aria-hidden": "true",
		children: [/* @__PURE__ */ x("div", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ b(pf, {
				name: "acme/plans",
				locked: !0,
				children: /* @__PURE__ */ b(mf, {
					icon: /* @__PURE__ */ b(uf, { color: of }),
					title: "Add login",
					pill: /* @__PURE__ */ b(cf, {
						color: of,
						children: "Open"
					}),
					sub: "#12 · spec 1.2"
				})
			}), /* @__PURE__ */ b(pf, {
				name: "acme/app",
				children: /* @__PURE__ */ b(mf, {
					icon: /* @__PURE__ */ b(df, { color: sf }),
					title: "Add login",
					pill: /* @__PURE__ */ b(cf, {
						color: sf,
						children: "Merged"
					}),
					sub: "branch avoozl/1.2"
				})
			})]
		}), /* @__PURE__ */ x("div", {
			className: "mt-1.5 flex items-center gap-1.5 text-[11px]",
			style: { color: "var(--accent)" },
			children: [/* @__PURE__ */ x("svg", {
				width: 64,
				height: 10,
				viewBox: "0 0 64 10",
				style: { flex: "none" },
				children: [/* @__PURE__ */ b("path", {
					d: "M62 5H4",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.4,
					strokeDasharray: "3 2"
				}), /* @__PURE__ */ b("path", {
					d: "M6 1 1 5l5 4",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.4,
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			}), /* @__PURE__ */ b("span", { children: "linked branch avoozl/1.2 closes #12 on merge" })]
		})]
	});
}
function gf() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(pf, {
			name: "acme/app",
			children: [/* @__PURE__ */ b(mf, {
				icon: /* @__PURE__ */ b(uf, { color: of }),
				title: "Add login",
				pill: /* @__PURE__ */ b(cf, {
					color: of,
					children: "Open"
				}),
				sub: "#12 · spec 1.2"
			}), /* @__PURE__ */ b(mf, {
				icon: /* @__PURE__ */ b(df, { color: sf }),
				title: "Add login",
				pill: /* @__PURE__ */ b(cf, {
					color: sf,
					children: "Merged"
				}),
				sub: /* @__PURE__ */ x(y, { children: ["body: ", /* @__PURE__ */ b("code", { children: "Closes #12" })] })
			})]
		})
	});
}
function _f() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(pf, {
			name: "This Mac · Avoozl workspace",
			children: [/* @__PURE__ */ b(mf, {
				icon: /* @__PURE__ */ b(uf, { color: of }),
				title: "Add login",
				pill: /* @__PURE__ */ b(cf, {
					color: sf,
					children: "Done"
				}),
				sub: "task 1.2 · in the database"
			}), /* @__PURE__ */ b(mf, {
				icon: /* @__PURE__ */ b(df, { color: sf }),
				title: "avoozl/1.2 → main",
				pill: /* @__PURE__ */ b(cf, {
					color: sf,
					children: "Merged"
				}),
				sub: "merged in your checkout"
			})]
		})
	});
}
var vf = {
	local: _f,
	"plans-repo": hf,
	"single-repo": gf
}, yf = {
	local: "A worker chat codes the task, Avoozl checks it and merges the branch on this Mac. Nothing is sent to GitHub.",
	"plans-repo": "The pull request merges from the linked branch; GitHub closes the private issue. The code repository never names the plans repository.",
	"single-repo": "The pull request says Closes #12; GitHub closes the issue when it merges."
}, bf = {
	local: me,
	"plans-repo": _e,
	"single-repo": oe
};
function xf(e) {
	let t = e.idPrefix ?? "avoozl-mode", n = Kd(e.value);
	return /* @__PURE__ */ b("div", {
		"data-mode-picker": !0,
		children: /* @__PURE__ */ b(Cl, {
			name: t,
			label: "Where tasks live",
			value: n,
			onChange: (t) => e.onChange(t),
			sections: Gd.map((t) => {
				let r = vf[t.mode];
				return {
					key: t.mode,
					title: t.title,
					line: t.line,
					icon: bf[t.mode],
					description: /* @__PURE__ */ x("div", {
						className: "flex min-w-0 flex-col gap-3",
						"data-mode-options": t.mode,
						children: [/* @__PURE__ */ x("div", {
							className: "grid gap-3",
							style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" },
							children: [/* @__PURE__ */ x("div", {
								className: "rounded-md p-2.5",
								style: { background: "var(--bg-elevated, transparent)" },
								children: [/* @__PURE__ */ b(r, {}), /* @__PURE__ */ b("p", {
									className: "mt-2 text-[11px] text-muted",
									children: yf[t.mode]
								})]
							}), /* @__PURE__ */ x("div", {
								className: "flex flex-col gap-2 text-xs",
								children: [/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("span", {
									className: "font-semibold",
									children: "Use it when"
								}), /* @__PURE__ */ b("ul", {
									className: "mt-1 flex flex-col gap-0.5 pl-4",
									style: { listStyle: "disc" },
									children: t.useWhen.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
								})] }), /* @__PURE__ */ b("dl", {
									className: "grid gap-x-3 gap-y-1",
									style: { gridTemplateColumns: "max-content 1fr" },
									children: t.facts.map(([e, t]) => /* @__PURE__ */ x("div", {
										className: "contents",
										children: [/* @__PURE__ */ b("dt", {
											className: "text-muted",
											children: e
										}), /* @__PURE__ */ b("dd", { children: t })]
									}, e))
								})]
							})]
						}), t.mode === n && e.note]
					}),
					fields: t.mode === n ? e.children : void 0
				};
			})
		})
	});
}
// kirocrew-app/ui/src/Walkthrough.tsx
function Sf(e) {
	let [t, n] = c(0), r = e.steps[t], i = e.steps.length - 1, a = (e) => n(Math.max(0, Math.min(i, e)));
	return /* @__PURE__ */ x("section", {
		"aria-roledescription": "walkthrough",
		"aria-label": e.label,
		"data-walkthrough": e.id,
		className: "flex flex-col gap-3 rounded-lg border p-4",
		style: {
			borderColor: "var(--border)",
			background: "var(--card)"
		},
		onKeyDown: (n) => {
			if (n.key === "ArrowRight") a(t + 1);
			else if (n.key === "ArrowLeft") a(t - 1);
			else if (n.key === "Escape" && e.onClose) e.onClose();
			else return;
			n.preventDefault();
		},
		children: [
			/* @__PURE__ */ b("style", { children: "[data-walk-slide]{animation:avoozl-walk 220ms ease}@keyframes avoozl-walk{from{opacity:.2;transform:translateX(12px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[data-walk-slide]{animation:none}}" }),
			/* @__PURE__ */ x("div", {
				"data-walk-slide": !0,
				className: "grid items-center gap-4",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" },
				children: [/* @__PURE__ */ b("div", {
					className: "rounded-md p-3",
					style: { background: "var(--bg-elevated, transparent)" },
					"aria-hidden": "true",
					children: r.picture
				}), /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					"aria-live": "polite",
					children: [
						/* @__PURE__ */ x("p", {
							className: "text-xs text-muted",
							children: [
								"Step ",
								t + 1,
								" of ",
								e.steps.length
							]
						}),
						/* @__PURE__ */ b("h4", {
							className: "text-lg font-semibold",
							children: r.title
						}),
						/* @__PURE__ */ b("p", {
							className: "text-base",
							children: r.text
						}),
						r.points && /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1 pl-5 text-sm",
							style: { listStyle: "disc" },
							children: r.points.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
						})
					]
				})]
			}, t),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [
					/* @__PURE__ */ x(p, {
						type: "button",
						onClick: () => a(t - 1),
						disabled: t === 0,
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ b(D, {
							size: 14,
							"aria-hidden": "true"
						}), "Back"]
					}),
					/* @__PURE__ */ b("div", {
						className: "flex items-center gap-1.5",
						role: "group",
						"aria-label": "Steps",
						children: e.steps.map((e, n) => /* @__PURE__ */ b("button", {
							type: "button",
							"aria-label": `Step ${n + 1}: ${e.title}`,
							"aria-current": n === t ? "step" : void 0,
							onClick: () => a(n),
							className: "rounded-full",
							style: {
								width: 9,
								height: 9,
								background: n === t ? "var(--accent)" : "var(--border)"
							}
						}, e.title))
					}),
					t < i ? /* @__PURE__ */ x(p, {
						type: "button",
						primary: !0,
						onClick: () => a(t + 1),
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6
						},
						children: ["Next", /* @__PURE__ */ b(O, {
							size: 14,
							"aria-hidden": "true"
						})]
					}) : e.onClose && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: e.onClose,
						children: "Done"
					})
				]
			})
		]
	});
}
function Cf(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ b("div", {
			className: "flex flex-wrap items-center gap-1.5",
			children: e.boxes.map((t, n) => /* @__PURE__ */ x("span", {
				className: "inline-flex items-center gap-1.5",
				children: [n > 0 && /* @__PURE__ */ b(O, {
					size: 14,
					style: { color: "var(--muted)" }
				}), /* @__PURE__ */ b("span", {
					className: "rounded-md px-2 py-1 text-xs font-medium",
					style: {
						border: `${n === e.on ? 2 : 1}px solid ${n === e.on ? "var(--accent)" : "var(--border)"}`,
						background: n === e.on ? "color-mix(in srgb, var(--accent) 12%, var(--card))" : "var(--card)",
						color: "var(--text)"
					},
					children: t
				})]
			}, t))
		}), e.note && /* @__PURE__ */ b("span", {
			className: "text-[11px] text-muted",
			children: e.note
		})]
	});
}
// kirocrew-app/ui/src/CoderPicker.tsx
var wf = [
	{
		title: "A task becomes ready",
		text: "When everything a task waits on is done, the tick marks it ready and starts it, up to the limit at once.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Waits on",
				"Ready",
				"Started"
			],
			on: 1,
			note: "Every minute, the tick looks for ready tasks."
		}),
		points: ["Watch it in Delivery, under Ready", "Defer pauses it before it starts"]
	},
	{
		title: "A worker chat codes it",
		text: "Avoozl opens a Kiro Crew chat on this Mac with the task brief. It works on its own branch and reports its commit.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Brief",
				"Worker chat",
				"Commit"
			],
			on: 1
		}),
		points: ["Open the chat from the task to watch", "Type in the chat to step in"]
	},
	{
		title: "Checks and reviewer chats",
		text: "A fresh chat runs the task checks on that exact commit. Reviewer chats then review it.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Commit",
				"Checks",
				"Reviewer chats"
			],
			on: 2
		}),
		points: ["A failed check starts a new attempt", "A question shows up under Needs you"]
	},
	{
		title: "It merges",
		text: "Local only merges the branch in your checkout. A GitHub mode opens a pull request, and GitHub closes the issue when it merges.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Approved",
				"Branch",
				"Merged"
			],
			on: 2
		})
	},
	{
		title: "If you switch",
		text: "The choice is per repository. Tasks already running keep their chat. New tasks use the new coder after you save.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Worker chats",
				"Save",
				"Issue Radar"
			],
			on: 1
		})
	}
], Tf = [
	{
		title: "A task becomes ready",
		text: "When everything it waits on is done, Avoozl adds the repository's ready label to its issue.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: ["Waits on", "Ready label"],
			on: 1,
			note: "Scope the crew to this exact label in Issue Radar."
		})
	},
	{
		title: "Issue Radar takes it",
		text: "The crew scoped to that label claims the issue and codes it in its own session.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Ready label",
				"Crew claims",
				"Codes"
			],
			on: 1
		}),
		points: ["Watch it on the Issue Radar page", "A \"needs human\" label shows under Needs you"]
	},
	{
		title: "A pull request with Closes #N",
		text: "The crew opens a pull request that names the issue. Required checks and the review rule run on it.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Pull request",
				"Checks",
				"Review"
			],
			on: 0
		})
	},
	{
		title: "It merges",
		text: "GitHub closes the issue when the pull request merges. Avoozl counts it done and starts what waited on it.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Merged",
				"Issue closed",
				"Next ready"
			],
			on: 1
		}),
		points: ["A claimed issue closed without a merged pull request waits for your decision", "Blocked again? Avoozl takes the ready label off"]
	},
	{
		title: "If you switch",
		text: "The choice is per repository. Tasks already running stay with their crew. New tasks use the new coder after you save.",
		picture: /* @__PURE__ */ b(Cf, {
			boxes: [
				"Issue Radar",
				"Save",
				"Worker chats"
			],
			on: 1
		})
	}
];
function Ef(e) {
	let [t, n] = c(null), r = Kd(e.mode), i = e.value || nf(e.mode), a = tf.filter((e) => e.modes.includes(r));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		children: [
			/* @__PURE__ */ b("div", {
				role: "radiogroup",
				"aria-label": "Who codes",
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" },
				children: a.map((t) => {
					let n = i === t.coder, r = nf(e.mode) === t.coder;
					return /* @__PURE__ */ x("div", {
						id: `${e.id}-${t.coder}`,
						role: "radio",
						"aria-checked": n,
						tabIndex: n ? 0 : -1,
						"data-coder": t.coder,
						onClick: () => e.onChange(r ? "" : t.coder),
						onKeyDown: (n) => {
							let r = a.indexOf(t), i = n.key === "ArrowRight" || n.key === "ArrowDown" ? a[(r + 1) % a.length] : n.key === "ArrowLeft" || n.key === "ArrowUp" ? a[(r - 1 + a.length) % a.length] : n.key === " " || n.key === "Enter" ? t : null;
							i && (n.preventDefault(), e.onChange(nf(e.mode) === i.coder ? "" : i.coder), document.getElementById(`${e.id}-${i.coder}`)?.focus());
						},
						className: "flex cursor-pointer flex-col gap-2 rounded-lg p-3",
						style: {
							border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
							padding: n ? 11 : 12,
							background: n ? "color-mix(in srgb, var(--accent) 5%, var(--card))" : "var(--card)"
						},
						children: [
							/* @__PURE__ */ x("div", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ b("span", {
										className: "text-sm font-semibold",
										children: t.title
									}),
									r && /* @__PURE__ */ b("span", {
										className: "rounded-full px-1.5 text-[10px] font-semibold",
										style: {
											border: "1px solid var(--border)",
											color: "var(--muted)"
										},
										children: "Default"
									}),
									n && /* @__PURE__ */ b("span", {
										className: "ml-auto text-xs font-semibold",
										style: { color: "var(--accent)" },
										children: "Selected"
									})
								]
							}),
							/* @__PURE__ */ b("p", {
								className: "text-sm",
								children: t.line
							}),
							/* @__PURE__ */ b("div", {
								"aria-hidden": "true",
								children: /* @__PURE__ */ b(Cf, { boxes: [...t.flow] })
							}),
							/* @__PURE__ */ x("div", {
								className: "text-xs",
								children: [/* @__PURE__ */ b("span", {
									className: "font-semibold",
									children: "Use it when"
								}), /* @__PURE__ */ b("ul", {
									className: "mt-1 flex flex-col gap-0.5 pl-4",
									style: { listStyle: "disc" },
									children: t.useWhen.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
								})]
							}),
							/* @__PURE__ */ x("p", {
								className: "text-xs",
								children: [/* @__PURE__ */ b("span", {
									className: "text-muted",
									children: "Who reviews: "
								}), t.reviews]
							})
						]
					}, t.coder);
				})
			}),
			r === "plans-repo" && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Issue Radar can't code in plans repository mode: a crew opens pull requests only in its own repository."
			}),
			r === "local" && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Issue Radar needs GitHub issues, so Local only uses worker chats."
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(Y, {
				icon: ee,
				onClick: () => n(t ? null : i),
				"aria-label": t ? "Hide how this works" : "How does this work?",
				children: t ? "Hide how this works" : "How does this work?"
			}) }),
			t && /* @__PURE__ */ b(Sf, {
				id: `${e.id}-walk`,
				label: t === "issue-radar" ? "How Issue Radar codes a task" : "How worker chats code a task",
				steps: t === "issue-radar" ? Tf : wf,
				onClose: () => n(null)
			})
		]
	});
}
// kirocrew-app/ui/src/SetupWizard.tsx
var Df = {
	create: {
		color: "var(--ok)",
		borderColor: "var(--ok)"
	},
	change: {
		color: "var(--accent)",
		borderColor: "var(--accent)"
	},
	keep: {
		color: "var(--muted)",
		borderColor: "var(--border)"
	}
}, Of = [
	["What to set up", "Avoozl reads GitHub first. Pick the extras; the mode, repositories and Project come from this tab."],
	["Check each change", "Every write Avoozl would make on GitHub. It never deletes or renames anything."],
	["Making the changes", "Avoozl makes them one at a time. Cancel stops before the next one."],
	["Save the settings file", "Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save."]
];
function kf(e) {
	let { workspaceId: n, client: i, form: a } = e, [o, l] = c(0), [u, d] = c(e.first), [f, m] = c(!1), [h, _] = c(null), v = s(null), S = s(null), C = t(() => {
		v.current ? (i.cancelSetup(n, v.current), e.onClose("Cancelled. Avoozl stops before its next write; check again to see what was made.")) : e.onClose(o === 3 ? void 0 : "Cancelled. Nothing was written.");
	}, [
		i,
		n,
		e,
		o
	]);
	mi("modal", !0, "Cancel", C), r(() => {
		S.current?.querySelector("input, button")?.focus();
	}, []);
	let w = async (e) => {
		m(!0), _(null);
		try {
			await e();
		} catch (e) {
			_(J(e));
		} finally {
			m(!1);
		}
	}, T = () => w(async () => {
		d(await i.setup(n, fd(a))), l(1);
	}), E = () => w(async () => {
		if (u) {
			l(2), v.current = u.previewHash;
			try {
				d(await i.setup(n, {
					...fd(a),
					confirm: !0,
					previewHash: u.previewHash
				}));
			} finally {
				v.current = null;
			}
			l(3);
		}
	}), D = () => w(async () => {
		u && (await i.save(n, u.settings.github, u.settings.expectedHash), await e.onSaved(), e.onClose("Saved to .avoozl.json."));
	}), O = $d(u?.writes ?? []), k = u?.writes.length ?? 0, A = (u?.results ?? []).filter((e) => e.status !== "done");
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: C,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: S,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-setup-title",
			"aria-describedby": "avoozl-setup-line",
			"data-setup-dialog": o,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(40rem, 94vw)",
				maxHeight: "88vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ b("ol", {
					className: "flex flex-wrap gap-2 text-xs",
					"aria-label": "Steps",
					children: Of.map(([e], t) => /* @__PURE__ */ x("li", {
						"aria-current": t === o ? "step" : void 0,
						className: t === o ? "font-semibold" : "text-muted",
						children: [
							t + 1,
							". ",
							e
						]
					}, e))
				}),
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
					id: "avoozl-setup-title",
					className: "text-base font-semibold",
					children: Of[o][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-setup-line",
					className: "text-sm text-muted",
					children: Of[o][1]
				})] }),
				o === 0 && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					children: [
						/* @__PURE__ */ x("p", {
							className: "text-xs text-muted",
							"data-setup-shared": !0,
							children: [
								"Mode ",
								a.mode,
								a.mode === "plans-repo" ? `, planning repository ${a.planningRepository || "not set"}` : "",
								", repositories ",
								a.repositories || "none yet",
								", Project",
								" ",
								a.projectOwner ? `${a.projectOwner}/${a.projectNumber || "new"}` : "not set",
								"."
							]
						}),
						!/^\d+$/.test(a.projectNumber.trim()) && /* @__PURE__ */ x("label", {
							className: "flex flex-col gap-1",
							children: [
								"New Project title ",
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "(optional)"
								}),
								/* @__PURE__ */ b(g, {
									id: "avoozl-setup-title-field",
									value: a.projectTitle,
									placeholder: "Avoozl",
									onChange: (t) => e.set({ projectTitle: t.target.value })
								})
							]
						}),
						/* @__PURE__ */ x("label", {
							className: "flex flex-col gap-1",
							children: [
								"Releases, if no spec names one ",
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "(optional)"
								}),
								/* @__PURE__ */ b(g, {
									id: "avoozl-setup-releases",
									value: a.releases,
									placeholder: "v1, v2",
									onChange: (t) => e.set({ releases: t.target.value })
								})
							]
						}),
						/* @__PURE__ */ b("div", {
							className: "flex flex-wrap gap-3",
							children: [
								["iteration", "Iteration field"],
								["tableByWave", "Table by wave view"],
								["epic", "Epic issue type"]
							].map(([t, n]) => /* @__PURE__ */ x("label", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ b("input", {
									type: "checkbox",
									checked: a[t],
									onChange: (n) => e.set({ [t]: n.target.checked })
								}), n]
							}, t))
						})
					]
				}),
				o === 1 && u && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-3 text-sm",
					children: [
						O.length === 0 && /* @__PURE__ */ b("p", { children: "Nothing to change on GitHub." }),
						O.map((e) => /* @__PURE__ */ x("section", {
							"data-setup-group": e.key,
							children: [/* @__PURE__ */ b("h4", {
								className: "text-xs font-semibold uppercase tracking-wide text-muted",
								children: e.title
							}), /* @__PURE__ */ b("ul", {
								className: "mt-1 flex flex-col gap-1",
								children: e.writes.map((e, t) => /* @__PURE__ */ x("li", {
									className: "flex flex-wrap items-baseline gap-2",
									children: [
										/* @__PURE__ */ b("span", {
											className: "rounded-full border px-1.5 text-[10px] font-semibold",
											style: Df[Qd(e)],
											children: Qd(e)
										}),
										/* @__PURE__ */ x("span", { children: [
											e.object,
											" ",
											/* @__PURE__ */ b("code", { children: e.name }),
											e.visibility ? ` (${e.visibility})` : "",
											" in ",
											e.owner
										] }),
										/* @__PURE__ */ b("span", {
											className: "w-full pl-12 text-xs text-muted",
											children: e.detail
										})
									]
								}, t))
							})]
						}, e.key)),
						u.checklist.length > 0 && /* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
							className: "text-xs font-semibold uppercase tracking-wide text-muted",
							children: "Left for you on GitHub"
						}), /* @__PURE__ */ b("ul", {
							className: "mt-1 list-disc pl-5 text-xs",
							children: u.checklist.map((e) => /* @__PURE__ */ b("li", { children: e.link ? /* @__PURE__ */ b("a", {
								href: e.link,
								target: "_blank",
								rel: "noopener noreferrer",
								className: "underline",
								children: e.text
							}) : e.text }, e.id))
						})] })
					]
				}),
				o === 2 && /* @__PURE__ */ x("p", {
					className: "text-sm",
					role: "status",
					children: [
						"Making ",
						k,
						" changes on GitHub…"
					]
				}),
				o === 3 && u && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					children: [
						/* @__PURE__ */ x("p", {
							role: "status",
							children: [
								"Made ",
								(u.results ?? []).filter((e) => e.status === "done").length,
								" of ",
								k,
								" changes."
							]
						}),
						A.length > 0 && /* @__PURE__ */ b("ul", {
							role: "alert",
							className: "text-xs text-danger",
							children: A.map((e, t) => /* @__PURE__ */ x("li", { children: [
								e.status,
								": ",
								e.action,
								" ",
								e.name,
								e.reason ? ` (${e.reason})` : ""
							] }, t))
						}),
						u.settings.changed ? /* @__PURE__ */ x(y, { children: [u.settings.error && /* @__PURE__ */ b("p", {
							role: "alert",
							className: "text-danger",
							children: u.settings.error
						}), /* @__PURE__ */ b("pre", {
							className: "overflow-auto rounded border p-2 text-xs",
							style: { borderColor: "var(--border)" },
							children: u.settings.diff
						})] }) : /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: ".avoozl.json already matches."
						})
					]
				}),
				h && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: h
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [
						/* @__PURE__ */ b(p, {
							type: "button",
							onClick: C,
							children: o === 3 ? "Close" : "Cancel"
						}),
						o === 1 && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => l(0),
							disabled: f,
							children: "Back"
						}),
						o === 0 && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void T(),
							disabled: f,
							children: "Check the changes"
						}),
						o === 1 && k > 0 && /* @__PURE__ */ x(p, {
							type: "button",
							primary: !0,
							onClick: () => void E(),
							disabled: f,
							children: [
								"Apply ",
								k,
								" change",
								k === 1 ? "" : "s"
							]
						}),
						o === 1 && k === 0 && u?.settings.changed && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => l(3),
							children: "Next"
						}),
						o === 3 && u?.settings.changed && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void D(),
							disabled: f || !!u.settings.error,
							children: "Save to .avoozl.json"
						})
					]
				})
			]
		})]
	});
}
function Af(e) {
	let { workspaceId: n, client: i, settings: a, shared: o } = e, [s, l] = c(() => dd(a.github)), u = {
		...s,
		...o,
		mode: o.mode || s.mode
	}, [d, f] = c(null), [p, m] = c(null), [h, g] = c(() => (/* @__PURE__ */ new Date()).toISOString()), [_, v] = c(!1), [y, S] = c(null), C = JSON.stringify(fd(u)), w = t(async () => {
		f(null), m(null);
		try {
			f(await i.setup(n, JSON.parse(C)));
		} catch (e) {
			m(J(e));
		}
		g((/* @__PURE__ */ new Date()).toISOString());
	}, [
		i,
		n,
		C
	]);
	r(() => l(dd(a.github)), [a]), r(() => {
		w();
	}, [w]);
	let T = ef(d, p, h);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		"data-setup-state": T.kind,
		children: [
			T.kind === "checking" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Checking GitHub…"
			}),
			T.kind === "set-up" && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ b(I, {
						size: 16,
						"aria-hidden": "true",
						style: { color: "var(--ok)" }
					}),
					/* @__PURE__ */ b("span", { children: "GitHub is set up." }),
					/* @__PURE__ */ b(K, {
						text: new Date(T.at).toLocaleString(),
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["Checked ", Mn(T.at, Date.now())]
						})
					}),
					/* @__PURE__ */ b(X, {
						icon: Oe,
						label: "Check again",
						tooltip: "Read GitHub again. Writes nothing.",
						onClick: () => void w()
					})
				]
			}),
			T.kind === "changes" && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ x("span", { children: [
						"Setup found ",
						T.count,
						" thing",
						T.count === 1 ? "" : "s",
						" to create or change."
					] }),
					/* @__PURE__ */ b(Y, {
						icon: Fe,
						primary: !0,
						onClick: () => v(!0),
						tooltip: "Show each change first. Nothing is written until you apply.",
						children: "Set up GitHub"
					}),
					/* @__PURE__ */ b(X, {
						icon: Oe,
						label: "Check again",
						tooltip: "Read GitHub again. Writes nothing.",
						onClick: () => void w()
					})
				]
			}),
			T.kind === "error" && /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-1 text-sm",
				role: "alert",
				children: [
					/* @__PURE__ */ x("span", {
						className: "inline-flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ b(Ie, {
								size: 14,
								"aria-hidden": "true",
								style: { color: "var(--danger)" }
							}),
							"Avoozl can't check GitHub: ",
							T.reason
						]
					}),
					T.fix && /* @__PURE__ */ x("span", {
						className: "text-xs",
						children: ["Fix: ", /* @__PURE__ */ b("code", { children: T.fix })]
					}),
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(X, {
						icon: Oe,
						label: "Check again",
						tooltip: "Read GitHub again. Writes nothing.",
						onClick: () => void w()
					}) })
				]
			}),
			y && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				role: "status",
				children: y
			}),
			_ && /* @__PURE__ */ b(kf, {
				workspaceId: n,
				client: i,
				form: u,
				set: (e) => l({
					...s,
					...e
				}),
				first: d,
				onSaved: e.onSaved,
				onClose: (e) => {
					v(!1), S(e ?? null), w();
				}
			})
		]
	});
}
// kirocrew-app/ui/src/WorkspaceView.tsx
function jf(e) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e.id,
		className: "flex flex-col gap-1 text-sm",
		children: [/* @__PURE__ */ b("span", { children: e.label }), /* @__PURE__ */ b(g, {
			id: e.id,
			value: e.value,
			placeholder: e.placeholder,
			required: e.required,
			onChange: (t) => e.onChange(t.target.value)
		})]
	});
}
var Mf = {
	info: "var(--muted)",
	warn: "var(--text)",
	error: "var(--danger)"
};
function Nf(e) {
	let { workspace: t, selected: n } = e;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("button", {
		type: "button",
		"aria-pressed": n,
		onClick: e.onSelect,
		className: `w-full rounded px-3 py-2 text-left ${n ? "bg-accent/10" : ""}`,
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: t.name
			}),
			" ",
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: t.id
			}),
			/* @__PURE__ */ x("span", {
				className: "ml-2 inline-flex gap-1",
				children: [t.served && /* @__PURE__ */ b(q, {
					variant: "info",
					children: "This backend"
				}), /* @__PURE__ */ b(K, {
					text: Vt(t.state).tip,
					children: /* @__PURE__ */ b("span", {
						"data-workspace-state": t.state,
						children: /* @__PURE__ */ b(q, {
							variant: Vt(t.state).variant,
							children: Vt(t.state).label
						})
					})
				})]
			}),
			/* @__PURE__ */ b("span", {
				className: "block truncate text-xs text-muted",
				children: t.root
			})
		]
	}) });
}
function Pf(e = {}) {
	let { onSelect: n, onListChange: i } = e, a = l(), s = o(() => Pt(a), [a]), u = o(() => Jr(a), [a]), [d, f] = c(null), [h, g] = c(null), [_, v] = c(e.selected ?? null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c({
		id: "",
		root: "",
		name: ""
	}), k = t(async (e) => {
		E(!0), w(null);
		try {
			await e();
		} catch (e) {
			w(J(e));
		} finally {
			E(!1);
		}
	}, []), A = t((e = null) => k(async () => {
		let t = await s.list();
		g(t), v((n) => It(t, e ?? n));
	}), [k, s]), j = t((e) => k(async () => {
		S(null), f(null);
		let [t, n] = await Promise.all([s.tickHealth(e), u.tickLog(e, 20).catch(() => [])]);
		S(t), f(n);
	}), [
		k,
		s,
		u
	]);
	r(() => {
		A();
	}, [A]), r(() => {
		_ && j(_);
	}, [_, j]), r(() => {
		n?.(_);
	}, [_, n]), r(() => {
		h && i?.(h);
	}, [h, i]), r(() => {
		e.selected && v(e.selected);
	}, [e.selected]);
	let M = (e) => k(async () => {
		let t = {
			id: D.id.trim(),
			root: D.root.trim(),
			name: D.name.trim() || void 0
		}, n = e === "add" ? await s.add(t) : await s.init(t);
		O({
			id: "",
			root: "",
			name: ""
		});
		let r = await s.list();
		g(r), v(n.id);
	}), N = () => {
		if (!_) return;
		let e = _;
		k(async () => {
			await s.tick(e), S(await s.tickHealth(e)), f(await u.tickLog(e, 20).catch(() => []));
		});
	}, P = h?.items.find((e) => e.id === _) ?? null, F = fl("(min-width: 768px)");
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-workspace-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b("h2", {
				id: "avoozl-workspace-title",
				className: "text-lg font-semibold",
				children: "Workspace"
			}),
			C && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: C
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: T ? "Working…" : ""
			}),
			/* @__PURE__ */ x("div", {
				"data-workspaces-layout": !0,
				style: F && P ? {
					display: "grid",
					gridTemplateColumns: "minmax(0, 3fr) minmax(18rem, 2fr)",
					gap: 14,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 14
				},
				children: [/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-col gap-3.5",
					children: [/* @__PURE__ */ x(m, { children: [
						/* @__PURE__ */ b(Z, {
							title: `Your workspaces (${h?.items.length ?? 0})`,
							className: "mb-2"
						}),
						/* @__PURE__ */ b("p", {
							className: "mt-1 text-sm text-muted",
							children: "The workspaces on this computer. The one you pick is the one the other tabs show."
						}),
						h === null ? /* @__PURE__ */ b("p", {
							className: "mt-2 text-sm text-muted",
							children: "Loading…"
						}) : h.items.length === 0 ? /* @__PURE__ */ b("p", {
							className: "mt-2 text-sm text-muted",
							children: "No workspaces yet. Add one below."
						}) : /* @__PURE__ */ b("ul", {
							className: "mt-2 flex flex-col gap-1",
							children: h.items.map((e) => /* @__PURE__ */ b(Nf, {
								workspace: e,
								selected: e.id === _,
								onSelect: () => v(e.id)
							}, e.id))
						}),
						/* @__PURE__ */ b("div", {
							className: "mt-3",
							children: /* @__PURE__ */ b(p, {
								onClick: () => void A(),
								disabled: T,
								children: "Refresh"
							})
						})
					] }), /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("section", {
						"aria-labelledby": "avoozl-ws-add",
						"data-add-workspace": !0,
						children: [
							/* @__PURE__ */ b("h3", {
								id: "avoozl-ws-add",
								className: "text-base font-semibold",
								children: "Add a workspace"
							}),
							/* @__PURE__ */ b("p", {
								className: "mt-1 text-sm text-muted",
								children: "A workspace is a folder with your plans. Pick one that already has them, or start a new one."
							}),
							/* @__PURE__ */ x("form", {
								className: "mt-3 flex flex-col gap-2",
								style: { maxWidth: "36rem" },
								onSubmit: (e) => {
									e.preventDefault(), M("add");
								},
								children: [
									/* @__PURE__ */ b(jf, {
										id: "avoozl-ws-root",
										label: "Folder (absolute path)",
										value: D.root,
										placeholder: "/path/to/plans",
										required: !0,
										onChange: (e) => O({
											...D,
											root: e
										})
									}),
									/* @__PURE__ */ b(jf, {
										id: "avoozl-ws-id",
										label: "Short ID",
										value: D.id,
										placeholder: "my-plans",
										required: !0,
										onChange: (e) => O({
											...D,
											id: e
										})
									}),
									/* @__PURE__ */ b(jf, {
										id: "avoozl-ws-name",
										label: "Name (optional)",
										value: D.name,
										onChange: (e) => O({
											...D,
											name: e
										})
									}),
									/* @__PURE__ */ b("h4", {
										className: "mt-2 text-xs font-semibold uppercase tracking-wide text-muted",
										"data-add-how": !0,
										children: "How to add:"
									}),
									/* @__PURE__ */ x("div", {
										className: "grid gap-2",
										style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))" },
										children: [/* @__PURE__ */ x("div", {
											className: "flex flex-col gap-1.5 rounded border p-3",
											style: { borderColor: "var(--border)" },
											"data-choice": "add",
											children: [/* @__PURE__ */ b(p, {
												type: "submit",
												disabled: T,
												children: "Add existing"
											}), /* @__PURE__ */ b("p", {
												className: "text-xs text-muted",
												children: "The folder already has Avoozl plans (an .avoozl.json and its database). Avoozl lists it; nothing in it changes."
											})]
										}), /* @__PURE__ */ x("div", {
											className: "flex flex-col gap-1.5 rounded border p-3",
											style: { borderColor: "var(--border)" },
											"data-choice": "init",
											children: [/* @__PURE__ */ b(p, {
												type: "button",
												disabled: T,
												onClick: () => void M("init"),
												children: "Start new"
											}), /* @__PURE__ */ b("p", {
												className: "text-xs text-muted",
												children: "Creates an empty workspace in the folder: an .avoozl.json and a new database. Refused if one is already there."
											})]
										})]
									})
								]
							})
						]
					}) })]
				}), P && /* @__PURE__ */ b("aside", {
					"aria-label": "Tick health",
					className: "min-w-0",
					children: /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
						"data-tick-panel": !0,
						style: {
							maxHeight: "calc(100vh - 12rem)",
							overflowY: "auto"
						},
						children: [
							/* @__PURE__ */ b(Z, {
								title: "Tick health",
								className: "mb-2"
							}),
							/* @__PURE__ */ b("p", {
								className: "my-2 text-sm",
								children: Ft(y)
							}),
							/* @__PURE__ */ x("h4", {
								className: "mt-2 text-xs font-semibold uppercase tracking-wide text-muted",
								children: [
									"Last ",
									20,
									" ticks, newest first"
								]
							}),
							d ? d.length === 0 ? /* @__PURE__ */ b("p", {
								className: "mt-1 text-xs text-muted",
								children: "No tick has run yet."
							}) : /* @__PURE__ */ b("ol", {
								className: "mt-1 mb-2 flex max-h-64 flex-col overflow-y-auto text-xs",
								"data-tick-log": !0,
								children: d.map((e, t) => /* @__PURE__ */ x("li", {
									className: "flex flex-col gap-0.5 border-t py-1 first:border-t-0",
									style: { borderColor: "var(--border)" },
									children: [/* @__PURE__ */ x("span", {
										className: "flex items-baseline gap-2",
										children: [/* @__PURE__ */ b(K, {
											text: e.at,
											children: /* @__PURE__ */ b("span", {
												className: "whitespace-nowrap tabular-nums text-muted",
												children: e.at ? `${e.at.slice(11, 19)} · ${Mn(e.at)}` : "unknown"
											})
										}), /* @__PURE__ */ b("span", {
											className: "font-medium uppercase",
											style: { color: Mf[e.level] },
											children: e.level
										})]
									}), /* @__PURE__ */ b("span", {
										className: "min-w-0",
										children: e.text
									})]
								}, t))
							}) : /* @__PURE__ */ b("p", {
								className: "mt-1 text-xs text-muted",
								children: "Loading…"
							}),
							/* @__PURE__ */ x("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ b(p, {
									onClick: N,
									disabled: T,
									children: "Run tick now"
								}), /* @__PURE__ */ b(p, {
									onClick: () => _ && void j(_),
									disabled: T,
									children: "Refresh health"
								})]
							})
						]
					}) })
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/onboarding-api.ts
var Ff = [
	{
		key: "folder",
		title: "Pick folder",
		line: "Point at a Git checkout. Avoozl reads its remote, branch, settings file and specs. Nothing is changed."
	},
	{
		key: "mode",
		title: "Pick mode",
		line: "Where tasks live. Nothing is saved until Set up."
	},
	{
		key: "check",
		title: "Check GitHub",
		line: "Avoozl reads GitHub and lists what Set up would create, change or keep. It writes nothing."
	},
	{
		key: "setup",
		title: "Set up",
		line: "The writes, in order. Each GitHub write asks first."
	},
	{
		key: "import",
		title: "Import specs",
		line: "Spec folders and their lint results. Import makes drafts; nothing is approved."
	},
	{
		key: "scan",
		title: "Leak scan",
		line: "This repository is public, so its issues are too. Avoozl checks the specs for secrets, paths on this computer and your content rules."
	},
	{
		key: "issues",
		title: "Preview issues",
		line: "The issues approving each draft would make. Nothing is made now."
	},
	{
		key: "finish",
		title: "Finish",
		line: "What was done. Approve plans in Plans when you are ready."
	}
];
function If(e, t) {
	let n = t?.github ?? {}, r = typeof n.mode == "string" ? n.mode : "", i = typeof n.planningRepository == "string" ? n.planningRepository : "", a = r === "plans-repo" || r === "single-repo" ? r : e.github ? "single-repo" : "local";
	return {
		mode: r === "local" ? "local" : a,
		isPlanning: !!(e.github && i && i.toLowerCase() === e.github.toLowerCase()) || !i && e.specs.length > 0,
		planningRepository: i || (e.specs.length > 0 && e.github ? e.github : ""),
		id: e.registered?.id ?? e.id ?? "",
		baseBranch: e.registered?.baseBranch ?? e.baseBranch
	};
}
var Lf = (e) => e !== "local";
function Rf(e) {
	return e.mode === "single-repo" || e.mode === "plans-repo" && e.isPlanning;
}
function zf(e, t) {
	let n = ["folder", "mode"];
	return Lf(e.mode) && n.push("check"), n.push("setup", "import"), Lf(e.mode) && Rf(e) && t?.visibility === "public" && n.push("scan"), Lf(e.mode) && n.push("issues"), n.push("finish"), n;
}
function Bf(e, t) {
	return /^[a-z][a-z0-9-]{1,60}$/.test(e.id.trim()) ? e.baseBranch.trim() ? e.mode === "local" ? null : t.github ? e.mode === "plans-repo" && !e.isPlanning && !/^[\w.-]+\/[\w.-]+$/.test(e.planningRepository.trim()) ? "Name the planning repository as owner/name." : e.mode === "plans-repo" && e.isPlanning && t.visibility === "public" ? "A planning repository must be private: its issues name plans and code repositories." : null : t.remote ? `${t.remote} is not a GitHub remote, so GitHub modes can't use this folder. Pick Local only.` : "This folder has no GitHub remote. Pick Local only, or add a GitHub remote first." : "Name the branch tasks land on." : "Give a short ID: lower-case letters, digits and dashes, starting with a letter.";
}
function Vf(e, t, n) {
	let r = n?.github ?? {}, i = Object.keys(r.repositories ?? {}), a = e.isPlanning ? t.github : e.planningRepository.trim(), o = e.mode === "plans-repo" && e.isPlanning ? i : [...i, t.github];
	return {
		mode: e.mode,
		...e.mode === "plans-repo" ? { planningRepository: a } : {},
		repositories: [...new Set(o.filter((t) => t && t.toLowerCase() !== (e.mode === "plans-repo" ? a.toLowerCase() : "")))]
	};
}
function Hf(e, t, n, r) {
	let i = [], a = n?.github ?? {};
	if (Lf(e.mode)) {
		let e = r?.writes.length ?? 0;
		i.push({
			key: "github",
			title: e ? `Make ${e} change${e === 1 ? "" : "s"} on GitHub` : "GitHub already has what Avoozl needs",
			detail: e ? "The create and change items from Check GitHub. Nothing is deleted or renamed." : "Check GitHub found nothing to create or change.",
			done: e === 0,
			confirm: e ? {
				title: `Make ${e} change${e === 1 ? "" : "s"} on GitHub?`,
				body: `Avoozl creates or changes ${(r?.writes ?? []).slice(0, 4).map((e) => `${e.object} ${e.name}`).join(", ")}${e > 4 ? `, and ${e - 4} more` : ""}. GitHub keeps them if you stop later; remove them on GitHub to undo.`,
				action: `Make ${e} change${e === 1 ? "" : "s"}`
			} : null
		});
	}
	let o = Lf(e.mode) ? !!r?.settings.changed : a.mode !== "local" && a.mode !== void 0;
	i.push({
		key: "settings",
		title: o ? `Save the mode${Lf(e.mode) ? " and GitHub names" : ""} to .avoozl.json` : ".avoozl.json already matches",
		detail: Lf(e.mode) ? "The settings Set up GitHub proposed, shown in Check GitHub." : "Local only. Kept GitHub settings stay in the file, unused.",
		done: !o,
		confirm: null
	});
	let s = Rf(e) && Lf(e.mode) ? t.github : null;
	return i.push({
		key: "register",
		title: t.registered ? `${t.registered.id} is already added` : `Add ${e.id.trim()} to this workspace`,
		detail: t.registered ? `Its folder is ${t.registered.localCheckout ?? "not on this computer"}.` : `Tasks land on ${e.baseBranch.trim()} in ${t.root}.${s ? ` Issues for ${s} are read from GitHub.` : ""}`,
		done: !!t.registered,
		confirm: s && !t.registered ? {
			title: `Link ${s} to this workspace?`,
			body: `Avoozl makes sure the labels avoozl:ready and avoozl:managed exist on ${s}, then reads its issues. Nothing else changes on GitHub.`,
			action: "Link it"
		} : null
	}), i;
}
function Uf(e, t, n) {
	let r = Lf(e.mode) ? t.github : null;
	return {
		id: e.id.trim(),
		localCheckout: t.root,
		baseBranch: e.baseBranch.trim(),
		...r ? { github: r } : {},
		...r && Rf(e) ? { issueAuthorization: !0 } : {},
		planning: e.mode === "plans-repo" ? e.isPlanning : e.mode === "local" && t.specs.length > 0 && !n
	};
}
function Wf(e, t) {
	return (e?.items ?? []).filter((e) => !e.root || e.root === t.root || t.specs.includes(e.name));
}
var Gf = (e) => !!e.plan, Kf = (e) => (e?.items ?? []).flatMap((e) => e.findings.map((t) => ({
	spec: e.name,
	...t
})));
function qf(e) {
	let t = e?.writes ?? [];
	return {
		create: t.filter((e) => e.kind === "issue.create"),
		update: t.filter((e) => e.kind === "issue.update"),
		other: t.filter((e) => e.kind !== "issue.create" && e.kind !== "issue.update").length
	};
}
function Jf(e) {
	let t = async (t, n, r = {}) => (await e.post(Nt, {
		operation: n,
		input: r,
		workspaceId: t
	})).result;
	return {
		inspect: (e, n) => t(e, "onboarding.inspect", { folder: n }),
		settings: (e) => t(e, "github.settings.get"),
		repositories: (e) => t(e, "repositories.list"),
		checkGitHub: (e, n) => t(e, "github.setup", { ...n }),
		specs: (e) => t(e, "plan.specs"),
		scan: (e, n) => t(e, "onboarding.scan", { specs: n }),
		previewIssues: (e, n) => t(e, "plan.issues.preview", { planId: n }),
		applyGitHub: (e, n, r) => t(e, "github.setup", {
			...n,
			confirm: !0,
			previewHash: r
		}),
		saveSettings: (e, n, r) => t(e, "github.settings.update", {
			github: n,
			expectedHash: r
		}),
		register: (e, n) => t(e, "repositories.configure", n),
		importSpec: (e, n) => t(e, "plan.create", { spec: n })
	};
}
// kirocrew-app/ui/src/Onboard.tsx
var Yf = {
	create: {
		color: "var(--ok)",
		borderColor: "var(--ok)"
	},
	change: {
		color: "var(--accent)",
		borderColor: "var(--accent)"
	},
	keep: {
		color: "var(--muted)",
		borderColor: "var(--border)"
	}
}, Xf = {
	local: me,
	"plans-repo": _e,
	"single-repo": oe
};
function Zf({ kind: e }) {
	return /* @__PURE__ */ b("span", {
		className: "rounded-full border px-1.5 text-[10px] font-semibold",
		style: Yf[e] ?? Yf.keep,
		children: e
	});
}
function Qf({ rows: e }) {
	return /* @__PURE__ */ b("dl", {
		className: "grid gap-x-3 gap-y-1 text-sm",
		style: { gridTemplateColumns: "max-content minmax(0, 1fr)" },
		children: e.map(([e, t]) => /* @__PURE__ */ x("div", {
			className: "contents",
			children: [/* @__PURE__ */ b("dt", {
				className: "text-muted",
				children: e
			}), /* @__PURE__ */ b("dd", {
				className: "min-w-0",
				style: { overflowWrap: "anywhere" },
				children: t
			})]
		}, e))
	});
}
function $f({ children: e }) {
	return /* @__PURE__ */ x("p", {
		className: "flex items-center gap-1.5 text-sm",
		"data-step-done": !0,
		children: [/* @__PURE__ */ b(M, {
			size: 14,
			"aria-hidden": "true",
			style: { color: "var(--ok)" }
		}), e]
	});
}
function ep(e) {
	let { found: t } = e;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-folder": !0,
		children: [
			/* @__PURE__ */ x("label", {
				className: "flex flex-col gap-1",
				children: [
					/* @__PURE__ */ x("span", { children: ["Folder ", /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ b(g, {
						id: "avoozl-onboard-folder",
						value: e.folder,
						placeholder: "/path/to/my-service",
						onChange: (t) => e.setFolder(t.target.value)
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "The checkout's folder, as an absolute path. Any folder inside it works too."
					})
				]
			}),
			t && /* @__PURE__ */ b(Qf, { rows: [
				["Checkout", t.root],
				["GitHub", t.github ? `${t.github}${t.visibility ? ` (${t.visibility})` : ""}` : t.remote ? `${t.remote} is not on GitHub` : "No remote: local only"],
				["Default branch", t.baseBranch],
				[".avoozl.json", t.settingsFile ? "Found in the checkout" : "None in the checkout"],
				["Specs", t.specs.length ? `${t.specs.length} in .kiro/specs: ${t.specs.join(", ")}` : "None in .kiro/specs"],
				["In this workspace", t.registered ? `Already added as ${t.registered.id}` : "Not added yet"]
			] }),
			t?.githubError && /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [t.githubError, " Visibility is unknown, so the leak scan step is skipped."]
			})
		]
	});
}
function tp(e) {
	let { form: t, found: n, set: r } = e, i = n.github ? null : n.remote ? `${n.remote} is not a GitHub remote.` : "This folder has no GitHub remote.";
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-mode": !0,
		children: [
			/* @__PURE__ */ b(Cl, {
				name: "avoozl-onboard-mode",
				label: "Mode",
				value: t.mode,
				onChange: (e) => r({ mode: e }),
				sections: Gd.map((e) => ({
					key: e.mode,
					title: e.title,
					line: e.line,
					icon: Xf[e.mode],
					disabled: e.mode === "local" ? null : i,
					description: /* @__PURE__ */ x("div", {
						className: "flex flex-col gap-1 text-sm",
						children: [/* @__PURE__ */ x("p", {
							className: "text-xs text-muted",
							children: [
								"Use it when: ",
								e.useWhen.join("; "),
								"."
							]
						}), /* @__PURE__ */ b(Qf, { rows: e.facts.map(([e, t]) => [e, t]) })]
					}),
					fields: e.mode === "plans-repo" ? /* @__PURE__ */ x("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ x("fieldset", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ b("legend", {
								className: "text-sm",
								children: "This folder is"
							}), [[
								!0,
								"The planning repository",
								"Specs and issues live here. It must be private."
							], [
								!1,
								"A code repository",
								"Code and pull requests live here; specs live in the planning repository."
							]].map(([e, n, i]) => /* @__PURE__ */ x("label", {
								className: "flex items-start gap-2",
								children: [/* @__PURE__ */ b("input", {
									type: "radio",
									name: "avoozl-onboard-role",
									className: "mt-1",
									checked: t.isPlanning === e,
									onChange: () => r({ isPlanning: e })
								}), /* @__PURE__ */ x("span", { children: [n, /* @__PURE__ */ b("span", {
									className: "block text-xs text-muted",
									children: i
								})] })]
							}, n))]
						}), !t.isPlanning && /* @__PURE__ */ x("label", {
							className: "flex flex-col gap-1",
							style: { maxWidth: "22rem" },
							children: [
								/* @__PURE__ */ x("span", { children: ["Planning repository ", /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "(required)"
								})] }),
								/* @__PURE__ */ b(g, {
									value: t.planningRepository,
									placeholder: "acme/plans",
									onChange: (e) => r({ planningRepository: e.target.value })
								}),
								/* @__PURE__ */ b("code", {
									className: "text-[11px] text-muted",
									children: "github.planningRepository"
								})
							]
						})]
					}) : void 0
				}))
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-2",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 15rem))" },
				children: [/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1",
					children: [/* @__PURE__ */ x("span", { children: ["Short ID ", /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }), /* @__PURE__ */ b(g, {
						value: t.id,
						placeholder: "my-service",
						disabled: !!n.registered,
						onChange: (e) => r({ id: e.target.value })
					})]
				}), /* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1",
					children: [/* @__PURE__ */ x("span", { children: ["Branch tasks land on ", /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }), /* @__PURE__ */ b(g, {
						value: t.baseBranch,
						placeholder: n.baseBranch,
						disabled: !!n.registered,
						onChange: (e) => r({ baseBranch: e.target.value })
					})]
				})]
			}),
			e.problem && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: e.problem
			})
		]
	});
}
function np({ result: e }) {
	if (!e) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Reading GitHub…"
	});
	let t = $d(e.writes), n = e.steps.filter((t) => !e.writes.some((e) => e.step === t.id) && t.status !== "failed"), r = e.steps.filter((e) => e.status === "failed");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-check": !0,
		children: [
			e.writes.length === 0 && /* @__PURE__ */ b($f, { children: "Nothing to create or change on GitHub." }),
			t.map((e) => /* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
				className: "text-xs font-semibold uppercase tracking-wide text-muted",
				children: e.title
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: e.writes.map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ b(Zf, { kind: Qd(e) }),
						/* @__PURE__ */ x("span", { children: [
							e.object,
							" ",
							/* @__PURE__ */ b("code", { children: e.name }),
							e.visibility ? ` (${e.visibility})` : "",
							" in ",
							e.owner
						] }),
						/* @__PURE__ */ b("span", {
							className: "w-full pl-12 text-xs text-muted",
							children: e.detail
						})
					]
				}, t))
			})] }, e.key)),
			n.length > 0 && /* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
				className: "text-xs font-semibold uppercase tracking-wide text-muted",
				children: "Already there"
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: n.map((e) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ b(Zf, { kind: "keep" }),
						/* @__PURE__ */ b("span", { children: e.title }),
						e.notes[0] && /* @__PURE__ */ b("span", {
							className: "w-full pl-12 text-xs text-muted",
							children: e.notes[0]
						})
					]
				}, e.id))
			})] }),
			r.map((e) => /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: [
					e.title,
					": ",
					e.reason,
					e.fix ? /* @__PURE__ */ x(y, { children: [
						" ",
						"Fix: ",
						/* @__PURE__ */ b("code", { children: e.fix })
					] }) : null
				]
			}, e.id)),
			e.settings.changed && /* @__PURE__ */ x("details", { children: [/* @__PURE__ */ b("summary", {
				className: "cursor-pointer text-xs text-muted",
				children: "The .avoozl.json change Set up would save"
			}), /* @__PURE__ */ b("pre", {
				className: "mt-1 overflow-auto rounded border p-2 text-xs",
				style: { borderColor: "var(--border)" },
				children: e.settings.diff
			})] })
		]
	});
}
function rp(e) {
	let { workspaceId: n, client: i, onClose: a } = e, o = xi(), [l, u] = c("folder"), [d, f] = c(""), [m, h] = c(null), [g, _] = c(null), [v, S] = c(!1), [C, w] = c(null), [T, E] = c(null), [D, O] = c([]), [k, A] = c(!1), [j, N] = c(null), [P, F] = c(/* @__PURE__ */ new Set()), [I, L] = c(null), [ee, R] = c({}), [z, te] = c(!1), [B, V] = c(null), H = s(null), ne = C ? zf(C, m) : [
		"folder",
		"mode",
		"setup",
		"import",
		"finish"
	], U = ne.indexOf(l), W = Ff.find((e) => e.key === l), re = D.length > 0, ie = t(() => {
		a(re ? `Stopped. Done so far: ${D.join("; ")}.` : "Cancelled. Nothing was written.");
	}, [
		a,
		re,
		D
	]);
	mi("modal", !0, "Cancel", ie), r(() => {
		H.current?.querySelector("input:not([disabled]), button")?.focus();
	}, [l]);
	let ae = async (e) => {
		te(!0), V(null);
		try {
			await e();
		} catch (e) {
			V(J(e));
		} finally {
			te(!1);
		}
	}, oe = (e) => {
		V(null), u(e);
	}, se = () => oe(ne[Math.min(ne.length - 1, U + 1)]), ce = () => oe(ne[Math.max(0, U - 1)]), le = (e) => w((t) => t && {
		...t,
		...e
	}), ue = () => ae(async () => {
		if (!d.trim()) throw Error("Give the checkout folder.");
		let [e, t, r] = await Promise.all([
			i.inspect(n, d.trim()),
			i.settings(n),
			i.repositories(n)
		]);
		h(e), _(t), S(r.items.some((t) => t.planning && t.id !== e.registered?.id)), w(If(e, t)), oe("mode");
	}), de = () => ae(async () => {
		C && m && (E(null), E(await i.checkGitHub(n, Vf(C, m, g))));
	});
	r(() => {
		l === "check" && !T && de();
	}, [l]);
	let fe = C && m ? Hf(C, m, g, T) : [], pe = () => ae(async () => {
		if (!C || !m) return;
		let t = T;
		for (let e of fe) if (!e.done) {
			if (e.confirm && !await o(e.confirm)) {
				V(`Stopped before “${e.title}”. Nothing after it was written.`);
				return;
			}
			if (e.key === "github" && t) {
				t = await i.applyGitHub(n, Vf(C, m, g), t.previewHash), E(t);
				let e = (t.results ?? []).filter((e) => e.status !== "done");
				if (O((n) => [...n, `made ${(t.results ?? []).length - e.length} GitHub changes`]), e.length) throw Error(`${e.length} GitHub change${e.length === 1 ? "" : "s"} failed: ${e.map((e) => `${e.action} ${e.name}${e.reason ? ` (${e.reason})` : ""}`).join("; ")}`);
			}
			if (e.key === "settings") {
				let e = await i.settings(n), r = C.mode === "local" ? {
					...e.github,
					mode: "local"
				} : t.settings.github, a = await i.saveSettings(n, r, C.mode === "local" ? e.hash : t.settings.expectedHash);
				_(a), O((e) => [...e, "saved .avoozl.json"]);
			}
			e.key === "register" && (await i.register(n, Uf(C, m, v)), O((e) => [...e, `added ${C.id.trim()}`]));
		}
		let r = await i.inspect(n, m.root);
		h(r), N(await i.specs(n).catch(() => null)), await e.onChanged(), A(!0), se();
	}), me = m ? Wf(j, m) : [];
	r(() => {
		l === "import" && F(new Set(me.filter((e) => !Gf(e)).map((e) => e.name)));
	}, [l, j]);
	let he = () => ae(async () => {
		for (let e of P) await i.importSpec(n, e), O((t) => [...t, `imported ${e} as a draft`]);
		N(await i.specs(n)), await e.onChanged();
	}), G = () => ae(async () => {
		L(null), L(await i.scan(n, me.map((e) => e.name)));
	});
	r(() => {
		l === "scan" && G(), l === "issues" && ae(async () => {
			let e = me.filter((e) => e.plan && !e.plan.approved), t = await Promise.all(e.map(async (e) => [e.name, await i.previewIssues(n, e.plan.id).catch((e) => ({ error: J(e) }))]));
			R(Object.fromEntries(t));
		});
	}, [l]);
	let ge = Kf(I), _e = l === "mode" && C && m ? Bf(C, m) : null, ve = l === "check" && T ? T.steps.some((e) => e.status === "failed") && T.writes.length === 0 : !1, ye = k ? [] : fe.filter((e) => !e.done), be = (e) => e === "folder" && !!m || e === "check" && !!T && T.writes.length === 0 || e === "setup" && (k || !!C && ye.length === 0) || e === "import" && me.length > 0 && me.every(Gf);
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: ie,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: H,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-onboard-title",
			"aria-describedby": "avoozl-onboard-line",
			"data-onboard-dialog": l,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(44rem, 94vw)",
				maxHeight: "88vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ b("ol", {
					className: "flex flex-wrap gap-x-3 gap-y-1 text-xs",
					"aria-label": "Steps",
					children: ne.map((e, t) => /* @__PURE__ */ x("li", {
						"aria-current": e === l ? "step" : void 0,
						className: `inline-flex items-center gap-1 ${e === l ? "font-semibold" : "text-muted"}`,
						children: [
							be(e) && /* @__PURE__ */ b(M, {
								size: 11,
								"aria-label": "done",
								style: { color: "var(--ok)" }
							}),
							t + 1,
							". ",
							Ff.find((t) => t.key === e).title
						]
					}, e))
				}),
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
					id: "avoozl-onboard-title",
					className: "text-base font-semibold",
					children: W.title
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-onboard-line",
					className: "text-sm text-muted",
					children: W.line
				})] }),
				l === "folder" && /* @__PURE__ */ b(ep, {
					folder: d,
					setFolder: (e) => {
						f(e), h(null);
					},
					found: m
				}),
				l === "mode" && C && m && /* @__PURE__ */ b(tp, {
					form: C,
					set: le,
					found: m,
					problem: _e
				}),
				l === "check" && /* @__PURE__ */ b(np, { result: T }),
				l === "setup" && /* @__PURE__ */ b("ol", {
					className: "flex flex-col gap-2 text-sm",
					"data-onboard-setup": !0,
					children: fe.map((e, t) => /* @__PURE__ */ x("li", {
						className: "flex items-start gap-2",
						children: [/* @__PURE__ */ x("span", {
							className: "w-5 flex-none text-right text-muted",
							children: [t + 1, "."]
						}), /* @__PURE__ */ x("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ x("span", {
								className: "flex items-center gap-1.5",
								children: [
									e.done || k ? /* @__PURE__ */ b(M, {
										size: 13,
										"aria-label": "done",
										style: { color: "var(--ok)" }
									}) : null,
									e.title,
									e.confirm && !e.done && !k && /* @__PURE__ */ b(q, {
										variant: "warning",
										children: "asks first"
									})
								]
							}), /* @__PURE__ */ b("span", {
								className: "block text-xs text-muted",
								children: e.detail
							})]
						})]
					}, e.key))
				}),
				l === "import" && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					"data-onboard-import": !0,
					children: [
						me.length === 0 && /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back."
						}),
						me.length > 0 && me.every(Gf) && /* @__PURE__ */ b($f, { children: "Every spec here is imported." }),
						/* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1.5",
							children: me.map((e) => /* @__PURE__ */ x("li", {
								className: "flex flex-wrap items-center gap-2",
								"data-onboard-spec": e.name,
								children: [
									/* @__PURE__ */ b("input", {
										type: "checkbox",
										"aria-label": `Import ${e.name}`,
										disabled: Gf(e),
										checked: Gf(e) || P.has(e.name),
										onChange: (t) => {
											let n = new Set(P);
											t.target.checked ? n.add(e.name) : n.delete(e.name), F(n);
										}
									}),
									/* @__PURE__ */ b("code", { children: e.name }),
									/* @__PURE__ */ x("span", {
										className: "text-xs text-muted",
										children: [e.taskCount, " tasks"]
									}),
									e.counts.error > 0 ? /* @__PURE__ */ x(q, {
										variant: "warning",
										children: [
											e.counts.error,
											" lint error",
											e.counts.error === 1 ? "" : "s"
										]
									}) : /* @__PURE__ */ x(q, { children: ["lint clean", e.counts.warning ? `, ${e.counts.warning} warnings` : ""] }),
									e.plan && /* @__PURE__ */ b(q, { children: e.plan.approved ? "approved" : "draft" })
								]
							}, e.name))
						}),
						me.some((e) => e.counts.error > 0) && /* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "A draft with lint errors imports, but Plans won't approve it until they are fixed."
						})
					]
				}),
				l === "scan" && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					"data-onboard-scan": !0,
					children: [
						!I && /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "Scanning…"
						}),
						I && ge.length === 0 && /* @__PURE__ */ x($f, { children: [
							"No secrets, local paths or content-rule matches in ",
							I.items.length,
							" spec",
							I.items.length === 1 ? "" : "s",
							"."
						] }),
						ge.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
							role: "alert",
							className: "text-danger",
							children: [
								ge.length,
								" finding",
								ge.length === 1 ? "" : "s",
								". Fix each line, then scan again. The next step waits until none are left."
							]
						}), /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1",
							children: ge.map((e, t) => /* @__PURE__ */ x("li", {
								className: "text-xs",
								children: [
									/* @__PURE__ */ x("code", { children: [
										e.spec,
										"/",
										e.file,
										":",
										e.line
									] }),
									" ",
									/* @__PURE__ */ x("span", {
										className: "text-muted",
										children: [
											e.set,
											" ",
											e.rule ?? ""
										]
									}),
									/* @__PURE__ */ b("span", {
										className: "block",
										children: e.message
									})
								]
							}, t))
						})] })
					]
				}),
				l === "issues" && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-3 text-sm",
					"data-onboard-issues": !0,
					children: [me.filter((e) => e.plan && !e.plan.approved).length === 0 && /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "No draft plans to preview. Import a spec first."
					}), Object.entries(ee).map(([e, t]) => {
						if ("error" in t) return /* @__PURE__ */ x("p", {
							role: "alert",
							className: "text-sm text-danger",
							children: [
								e,
								": ",
								t.error
							]
						}, e);
						let n = qf(t);
						return /* @__PURE__ */ x("section", {
							"data-onboard-preview": e,
							children: [/* @__PURE__ */ b("h4", {
								className: "font-semibold",
								children: /* @__PURE__ */ b("code", { children: e })
							}), t.blocked?.length ? /* @__PURE__ */ x("p", {
								className: "text-xs text-muted",
								children: ["Not previewed until lint passes: ", t.blocked[0].message]
							}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
								className: "text-xs text-muted",
								children: [
									"Approving would create ",
									n.create.length,
									" issue",
									n.create.length === 1 ? "" : "s",
									n.update.length ? `, update ${n.update.length}` : "",
									n.other ? `, and make ${n.other} label, link or board changes` : "",
									"."
								]
							}), /* @__PURE__ */ x("ul", {
								className: "mt-1 flex flex-col gap-0.5 text-xs",
								children: [n.create.slice(0, 8).map((e, t) => /* @__PURE__ */ x("li", { children: [
									/* @__PURE__ */ b(Zf, { kind: "create" }),
									" ",
									e.title,
									" ",
									/* @__PURE__ */ x("span", {
										className: "text-muted",
										children: ["in ", e.repository]
									})
								] }, t)), n.create.length > 8 && /* @__PURE__ */ x("li", {
									className: "text-muted",
									children: [
										"and ",
										n.create.length - 8,
										" more"
									]
								})]
							})] })]
						}, e);
					})]
				}),
				l === "finish" && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					"data-onboard-finish": !0,
					children: [D.length ? /* @__PURE__ */ b("ul", {
						className: "list-disc pl-5",
						children: D.map((e, t) => /* @__PURE__ */ b("li", { children: e }, t))
					}) : /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "Nothing needed changing."
					}), /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "Nothing was approved, no agent was started and nothing was pushed. Approve each draft in Plans when you are ready."
					})]
				}),
				B && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: B
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [
						/* @__PURE__ */ b(p, {
							type: "button",
							onClick: ie,
							disabled: z,
							children: l === "finish" ? "Close" : "Cancel"
						}),
						U > 0 && l !== "finish" && ne[U - 1] !== "setup" && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: ce,
							disabled: z,
							children: "Back"
						}),
						l === "folder" && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void ue(),
							disabled: z || !d.trim(),
							children: "Check folder"
						}),
						l === "mode" && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z || !!_e,
							children: "Next"
						}),
						l === "check" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => void de(),
							disabled: z,
							children: "Check again"
						}), /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z || !T || ve,
							children: "Next"
						})] }),
						l === "setup" && (ye.length ? /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void pe(),
							disabled: z,
							children: "Set up"
						}) : /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z,
							children: "Next"
						})),
						l === "import" && /* @__PURE__ */ x(y, { children: [P.size > 0 && /* @__PURE__ */ x(p, {
							type: "button",
							onClick: () => void he(),
							disabled: z,
							children: [
								"Import ",
								P.size,
								" as draft",
								P.size === 1 ? "" : "s"
							]
						}), /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z,
							children: me.length && !me.every(Gf) && P.size ? "Skip import" : "Next"
						})] }),
						l === "scan" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => void G(),
							disabled: z,
							children: "Scan again"
						}), /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z || !I || ge.length > 0,
							children: "Next"
						})] }),
						l === "issues" && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: se,
							disabled: z,
							children: "Next"
						}),
						l === "finish" && e.onOpenPlans && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => {
								a(D.length ? `Onboarded: ${D.join("; ")}.` : void 0), e.onOpenPlans();
							},
							children: "Approve in Plans"
						})
					]
				})
			]
		})]
	});
}
function ip(e) {
	let n = l(), r = o(() => Jf(n), [n]), [i, a] = c(!1), [s, u] = c(null), d = t((e) => {
		a(!1), u(e ?? null);
	}, []);
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Z, {
			title: "Onboard a repository",
			className: "mb-2"
		}),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "From a folder to plans ready to approve: mode, GitHub setup, spec import and an issue preview. Each GitHub write asks first."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
			children: Ff.map((e, t) => /* @__PURE__ */ x("li", { children: [
				t + 1,
				". ",
				e.title
			] }, e.key))
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-3",
			children: /* @__PURE__ */ b(Y, {
				icon: Fe,
				primary: !0,
				disabled: !!e.disabled,
				tooltip: e.disabled ?? "Walk through each step. Nothing is written before Set up.",
				onClick: () => {
					u(null), a(!0);
				},
				children: "Onboard"
			})
		}),
		e.disabled && /* @__PURE__ */ b("p", {
			className: "mt-2 text-xs text-muted",
			children: e.disabled
		}),
		s && /* @__PURE__ */ b("p", {
			className: "mt-2 text-xs text-muted",
			role: "status",
			children: s
		}),
		i && /* @__PURE__ */ b(rp, {
			workspaceId: e.workspaceId,
			client: r,
			onChanged: e.onChanged,
			onClose: d,
			onOpenPlans: e.onOpenPlans
		})
	] });
}
// kirocrew-app/ui/src/plugins-api.ts
var ap = "Contract version", op = "Which version of Avoozl's plugin interface this plugin was built for. Not the plugin's own version.", sp = () => ({
	id: "",
	where: "path",
	path: "",
	package: "",
	version: "",
	git: "",
	ref: "",
	subdir: "",
	contract: "1",
	config: "",
	scope: "machine"
}), cp = [
	["Where from", "Pick where the plugin’s files are. Open one source and fill it in."],
	["What", "What Avoozl found there. Check it is the plugin you meant."],
	["Applies to", "Declare it on this computer only, or share it with the repository."],
	["Review and approve", "Nothing runs until you approve this exact version."]
], lp = [
	{
		key: "path",
		title: "Folder",
		line: "A plugin folder on this computer. Use it while you build or try a plugin."
	},
	{
		key: "package",
		title: "Package",
		line: "An npm package installed in Avoozl’s plugin folder. Use it for a published plugin."
	},
	{
		key: "git",
		title: "Git",
		line: "A tag, branch or commit of a git repository. Use it to share one exact commit."
	}
], up = (e) => e[e.where].trim(), dp = {
	pack: {
		title: "Settings pack",
		line: "Settings you preview and copy into .avoozl.json once. Runs no code."
	},
	rules: {
		title: "Content rules",
		line: "Rule sets supplied while Avoozl runs. The terms never go into Git."
	},
	tracker: {
		title: "Tracker",
		line: "Keeps task records in another system."
	},
	intake: {
		title: "Intake source",
		line: "Brings outside work in, read on each tick."
	},
	route: {
		title: "Delivery route",
		line: "Delivers tasks somewhere other than a local worker."
	}
}, fp = (e) => e.provides ?? e.kinds ?? [], pp = (e) => fp(e).map((e) => dp[e]?.title ?? e);
function mp(e) {
	let t = {
		create: 0,
		change: 0,
		keep: 0,
		skip: 0
	};
	for (let n of e) t[n.action]++;
	return t;
}
function hp(e) {
	if (e === void 0) return "";
	let t = typeof e == "string" ? e : JSON.stringify(e);
	return t.length > 80 ? t.slice(0, 77) + "..." : t;
}
var gp = (e, t, n) => ({
	id: e.id,
	repositories: e.repositories,
	previewHash: e.previewHash,
	acceptLowered: t,
	confirmPublic: n
});
function _p(e, t, n, r) {
	return e.state === "approved" ? t ? t.changes.some((e) => e.action === "create" || e.action === "change") ? t.warnings.length && !n ? "Accept the who-counts change to import." : e.source === "machine" && !r ? "Confirm that the settings and the plugin id go into .avoozl.json." : null : "Nothing to import: every setting is already the same." : "Avoozl has not previewed the pack yet." : `Approve version ${e.version ?? ""} first. Nothing from the pack applies before that.`;
}
function vp(e) {
	let t = up(e);
	if (e.where !== "git") return {
		[e.where]: t,
		scope: e.scope
	};
	let n = e.subdir.trim();
	return {
		git: t,
		ref: e.ref.trim(),
		...n ? { subdir: n } : {},
		scope: e.scope
	};
}
function yp(e, t) {
	return {
		...e,
		...t.id ? { id: t.id } : {},
		...t.contract === void 0 ? {} : { contract: String(t.contract) }
	};
}
function bp(e, t, n) {
	if (!t) return "Avoozl has not looked at the source yet.";
	if (t.error) return t.error;
	if (t.contract !== void 0 && t.supported === !1) return `The plugin is built for contract version ${t.contract}; this Avoozl loads ${n.join(", ") || "1"}.`;
	let r = e.where === "package" ? e.version.trim() : "";
	return r && t.version && r !== t.version ? `The installed package is version ${t.version}, not ${r}. Install ${r} or clear the version.` : null;
}
function xp(e) {
	return e.where === "path" && /^(?:\/|~|[A-Za-z]:[\\/])/.test(e.path.trim()) ? "A shared folder must be a path inside the repository, written relative to it." : null;
}
function Sp(e, t = !1) {
	let n = e.id.trim();
	if (!/^[a-z][a-z0-9-]{0,60}$/.test(n)) return { error: "Give the plugin a lowercase id." };
	if (n === "local" || n === "github") return { error: `${n} is a built-in route.` };
	let r = up(e);
	if (!r) return { error: e.where === "path" ? "Name the plugin folder." : e.where === "git" ? "Give the git URL." : "Name the package." };
	let i = e.ref.trim(), a = e.subdir.trim();
	if (e.where === "git" && !i) return { error: "Give a tag, branch or commit." };
	let o = Number(e.contract);
	if (!Number.isInteger(o)) return { error: "Pick a contract version." };
	let s;
	if (e.config.trim()) {
		try {
			s = JSON.parse(e.config);
		} catch {
			return { error: "Config must be a JSON object." };
		}
		if (!s || typeof s != "object" || Array.isArray(s)) return { error: "Config must be a JSON object." };
	}
	return { input: {
		scope: e.scope,
		confirmPublic: t,
		entry: {
			id: n,
			[e.where]: r,
			...e.where === "git" ? {
				ref: i,
				...a ? { subdir: a } : {}
			} : {},
			contract: o,
			...s ? { config: s } : {}
		}
	} };
}
function Cp(e) {
	return e.state === "approved" ? e.health?.state === "unavailable" ? {
		label: "Unavailable",
		attention: !0
	} : {
		label: "Approved",
		attention: !1
	} : {
		label: {
			invalid: "Invalid",
			missing: "Missing",
			unsupported: "Unsupported",
			disabled: "Disabled",
			unapproved: "Needs approval",
			changed: "Changed: approve again",
			approved: "Approved"
		}[e.state],
		attention: e.state !== "disabled"
	};
}
var wp = (e) => !!e.hash && (e.state === "unapproved" || e.state === "changed"), Tp = (e) => {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t?.code === "plugin-public-repository" || /publish this plugin/.test(t?.error ?? "") ? String(t.error) : null;
	} catch {
		return null;
	}
};
function Ep(e) {
	let t = async (t, n, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		list: (e) => t("plugins.list", {}, e),
		preview: (e, n) => t("plugin.preview", n, e),
		add: (e, n) => t("plugin.add", n, e),
		approve: (e, n) => t("plugin.approve", {
			id: n.id,
			version: n.version,
			hash: n.hash,
			...n.commit ? { commit: n.commit } : {}
		}, e),
		update: (e, n) => t("plugin.update", { id: n }, e),
		disable: (e, n, r) => t("plugin.disable", {
			id: n,
			disabled: r
		}, e),
		remove: (e, n) => t("plugin.remove", { id: n }, e),
		packPreview: (e, n) => t("plugin.pack.preview", { id: n }, e),
		packImport: (e, n) => t("plugin.pack.import", n, e)
	};
}
var Dp = () => ({
	id: "",
	via: "mcp",
	repository: "",
	labelFields: "",
	assigneeField: "",
	minimumPermission: "",
	scope: "machine"
}), Op = /^[a-z][a-z0-9-]{0,60}$/;
function kp(e, t) {
	let n = e.id.trim();
	if (!Op.test(n)) return { error: "Name the source with lowercase letters, digits and dashes." };
	if (n === "github" || n === "local") return { error: `${n} is built in.` };
	if (t.includes(n)) return { error: `A source named ${n} already exists.` };
	if (!e.repository.trim()) return { error: "Pick the repository its work lands in." };
	let r = e.labelFields.split(",").map((e) => e.trim()).filter(Boolean);
	return {
		id: n,
		entry: {
			via: e.via,
			repository: e.repository.trim(),
			...r.length ? { labelFields: r } : {},
			...e.assigneeField.trim() ? { assigneeField: e.assigneeField.trim() } : {},
			...e.minimumPermission ? { minimumPermission: e.minimumPermission } : {}
		}
	};
}
function Ap(e) {
	let t = async (t, n, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		list: (e) => t("intake.sources", {}, e),
		add: (e, n) => t("intake.source.add", n, e),
		remove: (e, n) => t("intake.source.remove", {
			id: n.id,
			scope: n.scope
		}, e)
	};
}
// kirocrew-app/ui/src/PackImport.tsx
var jp = {
	create: {
		label: "Create",
		variant: "success"
	},
	change: {
		label: "Change",
		variant: "info"
	},
	keep: { label: "Keep" },
	skip: { label: "Skip" }
};
function Mp({ preview: e }) {
	let t = mp(e.changes);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		"data-pack-preview": !0,
		children: [
			e.description && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: e.description
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					t.create,
					" to create, ",
					t.change,
					" to change, ",
					t.keep,
					" already the same",
					t.skip ? `, ${t.skip} skipped` : "",
					e.repositories.length ? `. Repositories: ${e.repositories.join(", ")}.` : "."
				]
			}),
			e.warnings.map((e) => /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				"data-pack-warning": !0,
				children: e
			}, e)),
			/* @__PURE__ */ b("div", {
				style: { overflowX: "auto" },
				children: /* @__PURE__ */ x("table", {
					className: "w-full text-xs",
					children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
						className: "text-left text-muted",
						children: [
							/* @__PURE__ */ b("th", {
								className: "py-1 pr-2 font-normal",
								children: "Setting"
							}),
							/* @__PURE__ */ b("th", {
								className: "py-1 pr-2 font-normal",
								children: "Action"
							}),
							/* @__PURE__ */ b("th", {
								className: "py-1 font-normal",
								children: "Value"
							})
						]
					}) }), /* @__PURE__ */ b("tbody", { children: e.changes.map((e) => /* @__PURE__ */ x("tr", {
						className: "align-top",
						style: { borderTop: "1px solid var(--border)" },
						children: [
							/* @__PURE__ */ b("td", {
								className: "py-1 pr-2 break-all",
								children: /* @__PURE__ */ b("code", { children: e.setting })
							}),
							/* @__PURE__ */ b("td", {
								className: "py-1 pr-2",
								children: /* @__PURE__ */ b(q, {
									variant: e.warning ? "warning" : jp[e.action].variant,
									children: jp[e.action].label
								})
							}),
							/* @__PURE__ */ b("td", {
								className: "py-1 break-all",
								children: e.action === "skip" ? /* @__PURE__ */ b("span", {
									className: "text-muted",
									children: e.reason
								}) : /* @__PURE__ */ x(y, { children: [
									e.action === "change" && /* @__PURE__ */ x("span", {
										className: "block text-muted",
										children: ["was ", /* @__PURE__ */ b("code", { children: hp(e.from) })]
									}),
									/* @__PURE__ */ b("code", { children: hp(e.to) }),
									e.warning && /* @__PURE__ */ b("span", {
										className: "block text-danger",
										children: "Lowers who counts, as said above."
									})
								] })
							})
						]
					}, e.setting)) })]
				})
			})
		]
	});
}
function Np(e) {
	let { row: n, workspaceId: i, client: a, onClose: o, onChanged: l } = e, [u, d] = c(null), [f, m] = c(!1), [h, g] = c(!1), [_, v] = c(!1), [y, S] = c(null), C = s(null), w = t(() => o(), [o]);
	r(() => {
		let e = !0;
		return a.packPreview(i, n.id ?? "").then((t) => e && d(t)).catch((t) => e && S(J(t))), () => {
			e = !1;
		};
	}, [
		a,
		i,
		n.id
	]), mi("modal", !0, "Cancel", w), r(() => {
		C.current?.querySelector("button")?.focus();
	}, []);
	let T = _p(n, u, f, h), E = async () => {
		if (u && !T) {
			v(!0), S(null);
			try {
				await a.packImport(i, gp(u, f, h)), await l(), o(`Imported ${n.id} version ${n.version} into .avoozl.json.`);
			} catch (e) {
				S(J(e));
			} finally {
				v(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: w,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: C,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-pack-title",
			"data-pack-dialog": !0,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(48rem, 96vw)",
				maxHeight: "88vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
					id: "avoozl-pack-title",
					className: "text-base font-semibold",
					children: [
						"Import ",
						n.id,
						" version ",
						n.version
					]
				}), /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Copies these settings into .avoozl.json once. Later versions offer their changes here again."
				})] }),
				u ? /* @__PURE__ */ b(Mp, { preview: u }) : !y && /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Reading the pack..."
				}),
				u && u.warnings.length > 0 && /* @__PURE__ */ x("label", {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						className: "mt-1",
						checked: f,
						onChange: (e) => m(e.target.checked)
					}), /* @__PURE__ */ b("span", { children: "Import the who-counts change above" })]
				}),
				n.source === "machine" && /* @__PURE__ */ x("label", {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						className: "mt-1",
						checked: h,
						onChange: (e) => g(e.target.checked)
					}), /* @__PURE__ */ x("span", { children: ["Write the plugin id into .avoozl.json", /* @__PURE__ */ b("span", {
						className: "block text-xs text-muted",
						children: "This plugin is declared on this computer only. Anyone who can read the repository sees its id and these settings."
					})] })]
				}),
				T && u && !(u.warnings.length && !f) && /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: T
				}),
				y && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: y
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [/* @__PURE__ */ b(p, {
						type: "button",
						onClick: w,
						disabled: _,
						children: "Cancel"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => void E(),
						disabled: _ || !!T,
						children: "Import settings"
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/AddPlugin.tsx
var Pp = {
	path: W,
	package: Se,
	git: oe
};
function Fp(e) {
	return /* @__PURE__ */ x("label", {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ x("span", { children: [
				e.label,
				" ",
				e.marker && /* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					children: [
						"(",
						e.marker,
						")"
					]
				})
			] }),
			e.children,
			e.hint && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.hint
			}),
			e.raw && /* @__PURE__ */ b("code", {
				className: "text-[11px] text-muted",
				children: e.raw
			})
		]
	});
}
var Ip = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Lp({ form: e, set: t }) {
	let n = {
		path: /* @__PURE__ */ b(Fp, {
			label: "Folder",
			marker: "required",
			raw: "path",
			hint: "Absolute, or relative to this computer’s Avoozl settings. A shared plugin uses a path inside the repository.",
			children: /* @__PURE__ */ b(g, {
				value: e.path,
				placeholder: "~/plugins/example-tracker",
				onChange: (e) => t({ path: e.target.value })
			})
		}),
		package: /* @__PURE__ */ x("div", {
			className: "grid gap-2",
			style: { gridTemplateColumns: "minmax(0, 2fr) minmax(6rem, 1fr)" },
			children: [/* @__PURE__ */ b(Fp, {
				label: "Package name",
				marker: "required",
				raw: "package",
				children: /* @__PURE__ */ b(g, {
					value: e.package,
					placeholder: "@example/avoozl-tracker",
					onChange: (e) => t({ package: e.target.value })
				})
			}), /* @__PURE__ */ b(Fp, {
				label: "Version",
				marker: "optional",
				hint: "Checked against what is installed.",
				children: /* @__PURE__ */ b(g, {
					value: e.version,
					placeholder: "1.2.0",
					onChange: (e) => t({ version: e.target.value })
				})
			})]
		}),
		git: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-2",
			children: [
				/* @__PURE__ */ b(Fp, {
					label: "Git URL or repository path",
					marker: "required",
					raw: "git",
					children: /* @__PURE__ */ b(g, {
						value: e.git,
						placeholder: "https://git.example.com/team/plugin.git",
						onChange: (e) => t({ git: e.target.value })
					})
				}),
				/* @__PURE__ */ x("div", {
					className: "grid gap-2",
					style: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" },
					children: [/* @__PURE__ */ b(Fp, {
						label: "Tag, branch or commit",
						marker: "required",
						raw: "ref",
						children: /* @__PURE__ */ b(g, {
							value: e.ref,
							placeholder: "v1.0.0",
							onChange: (e) => t({ ref: e.target.value })
						})
					}), /* @__PURE__ */ b(Fp, {
						label: "Folder in the repository",
						marker: "optional",
						raw: "subdir",
						children: /* @__PURE__ */ b(g, {
							value: e.subdir,
							placeholder: "plugin",
							onChange: (e) => t({ subdir: e.target.value })
						})
					})]
				}),
				/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Next finds the exact commit this names. Add fetches only that commit, with hooks off and nothing installed."
				})
			]
		})
	};
	return /* @__PURE__ */ b("div", {
		"data-plugin-sources": !0,
		children: /* @__PURE__ */ b(Cl, {
			name: "avoozl-plugin-source",
			label: "Where from",
			value: e.where,
			onChange: (e) => t({ where: e }),
			sections: lp.map((e) => ({
				key: e.key,
				title: e.title,
				line: e.line,
				icon: Pp[e.key],
				fields: n[e.key]
			}))
		})
	});
}
function Rp(e) {
	let { form: t, preview: n, set: r } = e, i = n.contract !== void 0, a = n.capabilities ? Object.entries(n.capabilities).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; ") || "none" : void 0, o = [
		["Source", `${lp.find((e) => e.key === t.where)?.title}: ${up(t)}${t.where === "git" ? ` at ${t.ref}` : ""}`],
		["Commit found", n.commit],
		["Version", n.version],
		["Parts", n.provides || n.kinds ? pp(n).join(", ") : void 0],
		["Pack", n.pack ? (n.pack.description ?? "Settings only") + ` (${Object.keys(n.pack.settings).join(", ")})` : void 0],
		["Capabilities", a]
	];
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-plugin-what": !0,
		children: [
			/* @__PURE__ */ b("dl", {
				className: "grid gap-x-3 gap-y-1 text-xs",
				style: { gridTemplateColumns: "auto 1fr" },
				children: o.filter(([, e]) => e).map(([e, t]) => /* @__PURE__ */ x("div", {
					className: "contents",
					children: [/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: e
					}), /* @__PURE__ */ b("dd", {
						className: "break-all",
						children: /* @__PURE__ */ b("code", { children: t })
					})]
				}, e))
			}),
			/* @__PURE__ */ b(Fp, {
				label: "Id",
				marker: "required",
				raw: "id",
				hint: n.id ? "From the plugin’s own avoozl-plugin.json." : "It must match the id in the plugin’s avoozl-plugin.json. Add checks it.",
				children: /* @__PURE__ */ b(g, {
					value: t.id,
					disabled: !!n.id,
					placeholder: "example-tracker",
					onChange: (e) => r({ id: e.target.value })
				})
			}),
			/* @__PURE__ */ b(Fp, {
				label: ap,
				marker: "required",
				raw: "contract",
				hint: i ? `From the plugin’s own avoozl-plugin.json. ${op}` : op,
				children: i ? /* @__PURE__ */ b("div", {
					style: { maxWidth: "8rem" },
					children: /* @__PURE__ */ b(g, {
						value: t.contract,
						disabled: !0,
						"data-contract-from-manifest": !0
					})
				}) : /* @__PURE__ */ b("select", {
					value: t.contract,
					onChange: (e) => r({ contract: e.target.value }),
					className: "rounded border px-2 py-1 text-sm",
					style: {
						...Ip,
						maxWidth: "8rem"
					},
					children: e.supported.map((e) => /* @__PURE__ */ b("option", {
						value: String(e),
						children: e
					}, e))
				})
			}),
			/* @__PURE__ */ b(Fp, {
				label: "Config (JSON)",
				marker: "optional",
				raw: "config",
				hint: "Credentials never go here: name an environment variable with a key ending in Env.",
				children: /* @__PURE__ */ b(g, {
					value: t.config,
					onChange: (e) => r({ config: e.target.value }),
					placeholder: "{\"tokenEnv\": \"EXAMPLE_TOKEN\"}"
				})
			}),
			e.problem && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: e.problem
			})
		]
	});
}
function zp(e) {
	let { form: t } = e, n = xp(t), r = t.where === "git" ? "Written to .avoozl.json. Each computer fetches the commit with Update, then approves it." : t.where === "package" ? "Written to .avoozl.json. Each computer installs the package, then approves it." : "Written to .avoozl.json. Each computer approves it for itself.", i = (e, t, n) => /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b("p", { children: e }),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: ["Use it when ", t]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: n
			})
		]
	});
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-plugin-scope": !0,
		children: /* @__PURE__ */ b(Cl, {
			name: "avoozl-plugin-scope",
			label: "Applies to",
			value: t.scope,
			onChange: (t) => {
				e.set({ scope: t }), e.setConfirmPublic(!1);
			},
			sections: [{
				key: "machine",
				icon: me,
				title: "This computer only",
				line: "Saved in this computer’s Avoozl settings. Nothing goes into the repository.",
				description: i("Only this computer runs it, after you approve it here.", "you are trying it, or its name is private.", "Others on the repository do not see it or run it.")
			}, {
				key: "repository",
				icon: Pe,
				title: "Shared with the repo",
				line: r,
				disabled: n,
				description: i("Everyone who works in the repository gets the entry; each computer still approves it for itself.", "everyone on the repository should run it.", "A folder must be a path inside the repository, written relative to it."),
				fields: /* @__PURE__ */ x("label", {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						className: "mt-1",
						checked: e.confirmPublic,
						onChange: (t) => e.setConfirmPublic(t.target.checked)
					}), /* @__PURE__ */ x("span", { children: ["Publish it in .avoozl.json", /* @__PURE__ */ b("span", {
						className: "block text-xs text-muted",
						children: "Anyone who can read the repository sees this plugin’s id, source and config."
					})] })]
				})
			}]
		})
	});
}
function Bp(e) {
	let { workspaceId: n, client: i, onClose: a, onChanged: o } = e, l = e.supported.length ? e.supported : [1], [u, d] = c(0), [f, m] = c(sp()), [h, g] = c(null), [_, v] = c(null), [y, S] = c(null), [C, w] = c(!1), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = (e) => {
		m((t) => ({
			...t,
			...e
		})), O(null);
	}, j = t(() => {
		if (!_?.id) return a("Cancelled. Nothing was declared.");
		let e = _.id;
		i.remove(n, e).then(() => o()).finally(() => a(`Cancelled. ${e} was removed again; nothing ran.`));
	}, [
		_,
		i,
		n,
		a,
		o
	]);
	mi("modal", !0, "Cancel", j), r(() => {
		k.current?.querySelector("summary, input:not([disabled]), button")?.focus();
	}, [u]);
	let M = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(J(e));
		} finally {
			E(!1);
		}
	}, N = () => M(async () => {
		if (!up(f)) throw Error(f.where === "path" ? "Name the plugin folder." : f.where === "git" ? "Give the git URL." : "Name the package.");
		if (f.where === "git" && !f.ref.trim()) throw Error("Give a tag, branch or commit.");
		let e = await i.preview(n, vp(f));
		if (e.error) throw Error(e.error);
		g(e), m((t) => yp(t, e)), d(1);
	}), P = () => M(async () => {
		let e = Sp(f, C);
		if (!e.input) throw Error(e.error ?? "Check the form.");
		try {
			let t = await i.add(n, e.input);
			v(t), t.pack && t.id && S(await i.packPreview(n, t.id).catch(() => null));
		} catch (e) {
			let t = Tp(e);
			throw t ? Error(`${t} Tick the box to share it anyway.`) : e;
		}
		await o(), d(3);
	}), F = () => M(async () => {
		_ && (await i.approve(n, _), await o(), a(`Approved ${_.id} version ${_.version}.`));
	}), I = u === 1 ? bp(f, h, l) : null;
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: 60,
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			className: "absolute inset-0",
			onClick: j,
			style: { background: "color-mix(in srgb, var(--text) 30%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: k,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-plugin-title",
			"aria-describedby": "avoozl-plugin-line",
			"data-plugin-dialog": u,
			className: "relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg",
			style: {
				width: "min(40rem, 94vw)",
				maxHeight: "88vh",
				overflow: "auto",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)"
			},
			children: [
				/* @__PURE__ */ b("ol", {
					className: "flex flex-wrap gap-2 text-xs",
					"aria-label": "Steps",
					children: cp.map(([e], t) => /* @__PURE__ */ x("li", {
						"aria-current": t === u ? "step" : void 0,
						className: t === u ? "font-semibold" : "text-muted",
						children: [
							t + 1,
							". ",
							e
						]
					}, e))
				}),
				/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
					id: "avoozl-plugin-title",
					className: "text-base font-semibold",
					children: cp[u][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-plugin-line",
					className: "text-sm text-muted",
					children: cp[u][1]
				})] }),
				u === 0 && /* @__PURE__ */ b(Lp, {
					form: f,
					set: A
				}),
				u === 1 && h && /* @__PURE__ */ b(Rp, {
					form: f,
					preview: h,
					supported: l,
					set: A,
					problem: I
				}),
				u === 2 && /* @__PURE__ */ b(zp, {
					form: f,
					set: A,
					confirmPublic: C,
					setConfirmPublic: w
				}),
				u === 3 && _ && /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 text-sm",
					"data-plugin-review": !0,
					children: [
						/* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ b("span", {
								className: "font-semibold",
								children: _.id
							}), /* @__PURE__ */ b(q, {
								variant: Cp(_).attention ? "warning" : void 0,
								children: Cp(_).label
							})]
						}),
						_.reason && /* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: _.reason
						}),
						/* @__PURE__ */ b(tm, { row: _ }),
						/* @__PURE__ */ b(em, { row: _ }),
						y && /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-1",
							children: [
								/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Settings pack"
								}),
								/* @__PURE__ */ b(Mp, { preview: y }),
								/* @__PURE__ */ b("p", {
									className: "text-xs text-muted",
									children: "After you approve, import these from the plugin’s card. Nothing is imported now."
								})
							]
						}),
						/* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "Cancel removes the entry just added. Nothing has run."
						})
					]
				}),
				D && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: D
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap justify-end gap-2",
					children: [
						/* @__PURE__ */ b(p, {
							type: "button",
							onClick: j,
							disabled: T,
							children: "Cancel"
						}),
						(u === 1 || u === 2) && /* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => d(u - 1),
							disabled: T,
							children: "Back"
						}),
						u === 0 && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void N(),
							disabled: T,
							children: f.where === "git" ? "Find the commit" : "Next"
						}),
						u === 1 && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							disabled: T || !!I,
							onClick: () => {
								let e = Sp(f);
								if (e.error) return O(e.error);
								d(2);
							},
							children: "Next"
						}),
						u === 2 && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void P(),
							disabled: T || f.scope === "repository" && !C,
							children: f.where === "git" ? "Fetch and review" : "Add and review"
						}),
						u === 3 && _ && wp(_) && /* @__PURE__ */ x(p, {
							type: "button",
							primary: !0,
							onClick: () => void F(),
							disabled: T,
							children: [
								"Approve version ",
								_.version,
								_.commit ? ` at ${_.commit.slice(0, 12)}` : ""
							]
						}),
						u === 3 && _ && !wp(_) && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => a(`Added ${_.id}. It can't be approved yet: ${_.reason ?? Cp(_).label}.`),
							children: "Keep it unapproved"
						})
					]
				})
			]
		})]
	});
}
function Vp(e) {
	let [n, r] = c(!1), [i, a] = c(null), o = t((e) => {
		r(!1), a(e ?? null);
	}, []);
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Z, {
			title: "Add plugin",
			className: "mb-2"
		}),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "Four steps. Nothing runs or imports until you approve its exact version."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-col gap-1 text-xs",
			children: cp.map(([e, t], n) => /* @__PURE__ */ x("li", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ x("span", {
					className: "font-semibold",
					children: [n + 1, "."]
				}), /* @__PURE__ */ x("span", { children: [e, /* @__PURE__ */ b("span", {
					className: "block text-muted",
					children: t
				})] })]
			}, e))
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-3",
			children: /* @__PURE__ */ b(Y, {
				icon: Ee,
				primary: !0,
				onClick: () => {
					a(null), r(!0);
				},
				children: "Add plugin"
			})
		}),
		i && /* @__PURE__ */ b("p", {
			className: "mt-2 text-xs text-muted",
			role: "status",
			children: i
		}),
		n && /* @__PURE__ */ b(Bp, {
			workspaceId: e.workspaceId,
			client: e.client,
			supported: e.supported,
			onChanged: e.onChanged,
			onClose: o
		})
	] });
}
// kirocrew-app/ui/src/IntakeSources.tsx
var Hp = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Up(e) {
	return /* @__PURE__ */ x("label", {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ x("span", { children: [
				e.label,
				" ",
				/* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					children: [
						"(",
						e.marker,
						")"
					]
				})
			] }),
			e.children,
			e.hint && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.hint
			}),
			/* @__PURE__ */ b("code", {
				className: "text-[11px] text-muted",
				children: e.raw
			})
		]
	});
}
function Wp({ row: e, busy: t, onRemove: n }) {
	let r = e.entry ?? {};
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		"data-intake-source-row": e.id ?? "",
		children: [/* @__PURE__ */ x("div", {
			className: "flex min-w-0 flex-1 flex-col gap-0.5 text-sm",
			children: [
				/* @__PURE__ */ x("span", {
					className: "font-medium",
					children: [
						e.id ?? "Unreadable",
						" ",
						/* @__PURE__ */ b(q, { children: e.scope === "machine" ? "This computer only" : "Shared with the repo" })
					]
				}),
				/* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					children: [
						String(r.via ?? ""),
						" → ",
						String(r.repository ?? ""),
						e.state?.readAt ? ` · read ${e.state.readAt}` : ""
					]
				}),
				(e.error || e.state?.error) && /* @__PURE__ */ b("span", {
					className: "text-xs text-danger",
					children: e.error ?? e.state?.error
				})
			]
		}), e.id && /* @__PURE__ */ b(Ci, {
			icon: Ne,
			label: `Remove intake source ${e.id}`,
			disabled: t,
			confirm: {
				title: `Remove intake source ${e.id}?`,
				body: `Avoozl stops reading ${e.id}. Items it already brought in stay in Intake, and their tasks are not touched.`,
				action: "Remove source"
			},
			onConfirm: n,
			children: "Remove"
		})]
	});
}
function Gp({ workspaceId: e, plugins: n }) {
	let r = l(), i = o(() => Ap(r), [r]), { value: a, error: s, reload: u } = ya(e, t((e) => i.list(e), [i])), d = o(() => Pt(r), [r]), { value: f } = ya(e, t((e) => d.repositories(e), [d])), [h, _] = c(Dp), [v, y] = c(!1), [S, C] = c(!1), [w, T] = c(null), E = (e) => _({
		...h,
		...e
	}), D = n.filter((e) => e.id && e.capabilities?.tracker?.includes("poll")), O = a?.sources ?? [], k = (e) => {
		C(!0), T(null), e().then(() => u()).catch((e) => T(J(e))).finally(() => C(!1));
	};
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Z, {
			title: "Intake sources",
			className: "mb-2"
		}),
		/* @__PURE__ */ x("p", {
			className: "mb-2 text-xs text-muted",
			children: [
				"Where work other than GitHub comes in. Items show in the Intake tab; a rule with ",
				/* @__PURE__ */ b("code", { children: "source:<id>" }),
				" can take them. Avoozl writes nothing back to a source."
			]
		}),
		s ? /* @__PURE__ */ b("p", {
			className: "text-xs text-danger",
			children: s
		}) : null,
		O.length ? /* @__PURE__ */ b("ul", {
			className: "flex flex-col",
			"aria-label": "Declared intake sources",
			children: O.map((t, n) => /* @__PURE__ */ b(Wp, {
				row: t,
				busy: S,
				onRemove: () => k(() => i.remove(e, t))
			}, `${t.id}-${t.scope}-${n}`))
		}) : /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "No source yet. Add one below to bring in tickets or a script's items."
		}),
		/* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-col gap-2 rounded-md border p-3",
			style: { borderColor: "var(--border)" },
			"data-intake-source-add": !0,
			children: [
				/* @__PURE__ */ b("span", {
					className: "text-sm font-medium",
					children: "Add a source"
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-3",
					children: [
						/* @__PURE__ */ b(Up, {
							label: "Name",
							marker: "required",
							raw: "intake.sources.<id>",
							children: /* @__PURE__ */ b(g, {
								value: h.id,
								onChange: (e) => E({ id: e.target.value }),
								placeholder: "tickets",
								style: { width: "12rem" }
							})
						}),
						/* @__PURE__ */ b(Up, {
							label: "Comes from",
							marker: "required",
							raw: "via",
							hint: "A plugin with poll, or MCP for a script or cron job.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Hp,
								value: h.via,
								onChange: (e) => E({ via: e.target.value }),
								children: [/* @__PURE__ */ b("option", {
									value: "mcp",
									children: "MCP (a script submits items)"
								}), D.map((e) => /* @__PURE__ */ x("option", {
									value: `plugin:${e.id}`,
									children: ["Plugin ", e.id]
								}, e.id))]
							})
						}),
						/* @__PURE__ */ b(Up, {
							label: "Repository",
							marker: "required",
							raw: "repository",
							hint: "Its rules apply; a delivered item's task lands there.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Hp,
								value: h.repository,
								onChange: (e) => E({ repository: e.target.value }),
								children: [/* @__PURE__ */ b("option", {
									value: "",
									children: "Pick a repository"
								}), (f ?? []).map((e) => /* @__PURE__ */ b("option", {
									value: e.github ?? e.id,
									children: e.github ?? e.id
								}, e.id))]
							})
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-3",
					children: [
						/* @__PURE__ */ b(Up, {
							label: "Fields as labels",
							marker: "optional",
							raw: "labelFields",
							hint: "Each adds a field:value label before rules match.",
							children: /* @__PURE__ */ b(g, {
								value: h.labelFields,
								onChange: (e) => E({ labelFields: e.target.value }),
								placeholder: "component, queue",
								style: { width: "14rem" }
							})
						}),
						/* @__PURE__ */ b(Up, {
							label: "Assignee field",
							marker: "optional",
							raw: "assigneeField",
							children: /* @__PURE__ */ b(g, {
								value: h.assigneeField,
								onChange: (e) => E({ assigneeField: e.target.value }),
								placeholder: "owner",
								style: { width: "10rem" }
							})
						}),
						/* @__PURE__ */ b(Up, {
							label: "Who counts",
							marker: "optional",
							raw: "minimumPermission",
							hint: "The standing the plugin must report. Blank means write.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Hp,
								value: h.minimumPermission,
								onChange: (e) => E({ minimumPermission: e.target.value }),
								children: [/* @__PURE__ */ b("option", {
									value: "",
									children: "write (default)"
								}), [
									"read",
									"triage",
									"write",
									"maintain",
									"admin"
								].map((e) => /* @__PURE__ */ b("option", {
									value: e,
									children: e
								}, e))]
							})
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-3 text-sm",
					role: "radiogroup",
					"aria-label": "Applies to",
					children: [/* @__PURE__ */ x("label", {
						className: "inline-flex items-center gap-1.5",
						children: [/* @__PURE__ */ b("input", {
							type: "radio",
							name: "intake-scope",
							checked: h.scope === "machine",
							onChange: () => E({ scope: "machine" })
						}), " This computer only"]
					}), /* @__PURE__ */ x("label", {
						className: "inline-flex items-center gap-1.5",
						children: [/* @__PURE__ */ b("input", {
							type: "radio",
							name: "intake-scope",
							checked: h.scope === "repository",
							onChange: () => E({ scope: "repository" })
						}), " Shared with the repo"]
					})]
				}),
				h.scope === "repository" && /* @__PURE__ */ x("label", {
					className: "inline-flex items-center gap-1.5 text-xs",
					"data-intake-public-warning": !0,
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: v,
						onChange: (e) => y(e.target.checked)
					}), ".avoozl.json may be public. Saving there publishes this source's name and plugin. I understand."]
				}),
				w ? /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-xs text-danger",
					children: w
				}) : null,
				/* @__PURE__ */ x("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ b(Y, {
						icon: Ee,
						onClick: () => {
							let t = kp(h, O.flatMap((e) => e.id ? [e.id] : []));
							if (t.error || !t.id || !t.entry) return T(t.error ?? "Check the fields.");
							if (h.scope === "repository" && !v) return T("Tick the box to share this source in .avoozl.json.");
							k(async () => {
								await i.add(e, {
									id: t.id,
									entry: t.entry,
									scope: h.scope,
									confirmPublic: v
								}), _(Dp()), y(!1);
							});
						},
						disabled: S,
						children: "Add source"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						onClick: () => _(Dp()),
						disabled: S,
						children: "Clear"
					})]
				})
			]
		})
	] });
}
// kirocrew-app/ui/src/design-chat.ts
var Kp = "docs/plugins.md", qp = "Open a chat that helps you plan a plugin and write its files. It approves nothing.", Jp = `Read ${Kp}: the plugin contract, parts, sources and approval`, Yp = "Open a chat that suggests rules for you to paste here and save. What you type there stays in its transcript, so type truly private words straight into the editor.", Xp = (e) => e.length ? e.join(", ") : "none";
function Zp(e) {
	return [
		"Use the avoozl-plugin skill to help me design an Avoozl plugin.",
		"Ask what it is for and which system it talks to, then help me pick its parts, its source (folder, package or git) and whether it applies to this computer only or is shared with the repo.",
		"Then write the plugin folder: avoozl-plugin.json, any pack, the entry module, and a test against a fake host.",
		`This Avoozl supports contract version ${Xp(e.supported.map(String))}. Plugins already declared here: ${Xp(e.installed)}.`,
		"Do not approve the plugin or import its pack; I do that in Settings > Plugins."
	].join(" ");
}
function Qp(e) {
	return [
		"Use the avoozl-rules skill to help me plan an Avoozl content rule set.",
		"Ask what kind of text must stay out, then suggest rule and allow lines, where the set checks, and whether it blocks or reports.",
		"Do not write the terms file or save terms: I paste the lines into Settings > Content rules, check them with Try it, and save there.",
		"Remind me that terms typed in this chat stay in its transcript, so I type truly private words straight into the editor.",
		`Rule sets already here: ${Xp(e.sets)}.`
	].join(" ");
}
// docs/plugins.md?raw
var $p = "# Writing a plugin\n\nA plugin adds to Avoozl without changing Avoozl itself. One plugin can\nbundle several parts, so a team installs one plugin and gets its settings,\nits content rules, its tracker and its intake source together:\n\n| Part      | What it is                                                                 | Runs code |\n| --------- | -------------------------------------------------------------------------- | --------- |\n| `pack`    | Settings a person previews and copies into `.avoozl.json` once             | No        |\n| `rules`   | Content rule sets supplied while Avoozl runs                               | Yes       |\n| `tracker` | A task tracker that keeps Avoozl's task records                            | Yes       |\n| `intake`  | An intake source: the tracker kind's `poll`, which brings outside work in | Yes       |\n| `route`   | A delivery route for tasks that are not run by a local worker              | Yes       |\n\nLocal and GitHub are the only built-in routes and trackers. Everything\nelse, including any integration that must stay private, is a separate\npackage or folder that plugs in here.\n\nThe examples on this page are the test-only plugins in Avoozl's own test\ntree: `src/app/test/fixtures/plugins/sdk-team/` bundles a pack, rules, a\ntracker and an intake source; `fake-route/`, `fake-tracker/` and\n`fake-rules/` each provide one part. Read them alongside this guide. These\nfakes are the only plugins tested so far; no real plugin has run live.\n\n## What a plugin is\n\nA plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module\nfor the parts that run code, and, with a pack, `avoozl-pack.json`:\n\n```json\n{\n  \"id\": \"sdk-team\",\n  \"version\": \"1.0.0\",\n  \"contract\": 1,\n  \"provides\": [\"pack\", \"rules\", \"tracker\", \"intake\"],\n  \"capabilities\": { \"tracker\": [\"actor\", \"poll\"], \"rules\": [] },\n  \"pack\": \"avoozl-pack.json\",\n  \"entry\": \"index.mjs\"\n}\n```\n\n- `id` is lowercase letters, digits and dashes. `local` and `github` are\n  reserved. Tasks name the plugin as `plugin:<id>`.\n- `version` changes whenever you release a new build.\n- `contract` is the contract version: which version of Avoozl's plugin\n  interface this plugin was built for. It is not the plugin's own version.\n  Settings shows it as **Contract version**. This Avoozl supports contract\n  version `1`.\n- `provides` lists the parts: `pack`, `rules`, `tracker`, `intake` and\n  `route`. `intake` runs as the `tracker` kind and needs the `poll`\n  capability. A manifest written before `provides` lists `kinds` instead\n  (`route`, `tracker`, `rules`), and each kind is its own part. With\n  `provides`, leave `kinds` out; if you keep it, it must match.\n- `capabilities` lists optional features per kind. A tracker may list\n  `edges`, `subtasks`, `actor`, `pause` and `poll`. A route lists none yet.\n- `pack` names the pack file inside the folder; it defaults to\n  `avoozl-pack.json`.\n- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides\n  only a pack runs no code, so it has no `entry`; Avoozl refuses one that\n  names an entry, and never starts a process for it.\n\nThe entry module exports one object per kind: `route`, `tracker`, or\n`rules`. Each\nmethod takes `(params, { config })` and returns a JSON value or a promise of\none:\n\n```js\nexport const route = {\n  submit({ task, brief }, { config }) { ... },\n  status({ id }, { config }) { ... },\n  completion({ id }, { config }) { ... },\n  cancel({ id }, { config }) { ... },\n};\n```\n\n## Declaring and approving a plugin\n\nA `plugins` entry declares each plugin, either in the repository's\n`.avoozl.json` (shared and reviewed in Git) or in this machine's\n`plugins.json`, beside the global Avoozl configuration\n(`~/.config/avoozl/plugins.json`, never committed):\n\n```json\n{\n  \"plugins\": [\n    {\n      \"id\": \"fake-route\",\n      \"path\": \"../fake-route\",\n      \"contract\": 1,\n      \"config\": { \"stateFile\": \"route-state.json\" }\n    }\n  ]\n}\n```\n\n- Name exactly one of `path` (a folder, relative to the file that declares\n  it), `package` (a package installed into the `plugins` folder beside\n  `plugins.json`), or `git` (below).\n- `config` is plain data passed to every call. It never holds a credential. A\n  key ending in `Env`, such as `tokenEnv`, names the environment variable the\n  plugin reads its credential from; Avoozl passes that variable, and only the\n  variables `config` names this way, to the plugin.\n- Declare a plugin whose name must stay private in `plugins.json`. Settings\n  asks you to confirm before it saves a `plugins` entry into `.avoozl.json`.\n\n### Add plugin in Settings\n\n**Settings > Plugins > Add plugin** walks four steps, with Cancel on each:\n\n1. **Where from**: open Folder, Package or Git and fill it in. Each keeps\n   what you typed until you cancel. Git shows the exact commit its ref names.\n2. **What**: the id, version, kinds and capabilities the plugin's own\n   `avoozl-plugin.json` declares. The id and **Contract version** come from\n   that file; a git plugin, whose files are fetched later, picks a supported\n   contract version. A package's optional version is checked against the\n   installed package; the entry stores no version, the approval pins it.\n3. **Applies to**: this computer only (`plugins.json`) or shared with the\n   repository (`.avoozl.json`). A shared plugin is approved on each computer\n   for itself; a shared package is installed on each, and a shared git plugin\n   is fetched on each with **Update**. A shared folder is a path inside the\n   repository, relative to it.\n4. **Review and approve**: the version, content hash and, for git, the commit.\n   Cancel here removes the entry step 3 declared.\n\n### A plugin from a git repository\n\n```json\n{ \"id\": \"fake-route\", \"git\": \"https://git.example.com/team/fake-route.git\",\n  \"ref\": \"v1.0.0\", \"subdir\": \"plugin\", \"contract\": 1 }\n```\n\n`git` is a URL or a local repository path. `ref` is a tag, a branch or a full\ncommit, and `subdir` is the plugin's folder inside the repository. **Add from\ngit** in Settings (or `avoozl plugins add ID --git URL --ref REF`) resolves\n`ref` to one commit, fetches only that commit into\n`plugins/git/<id>/<commit>/` beside `plugins.json`, and stores the commit on\nthis machine. Git runs as you, with your credential helper or SSH key, so\nprivate repositories work. Git hooks are off, submodules are skipped, and\nAvoozl runs no `npm install`: commit the plugin ready to run, bundled or with\n`node_modules`. The approval names the commit, so a new commit needs a new\napproval. **Update** (or `avoozl plugins update ID`) resolves `ref` again.\nThe tick never fetches. Avoozl refuses a URL with a password or token in it,\na `subdir` outside the repository, and a commit with no `avoozl-plugin.json`.\n\nNothing loads until a person approves the plugin in **Settings** (or with\n`avoozl plugins approve ID --hash HASH`). Settings shows the id, version,\neach part, the code kinds it runs as, capabilities, location and content\nhash, a SHA-256 over every file in the folder, the pack included. The\napproval lists the parts and is stored on this machine only. Any change to\nthe version or to any file needs approval again. The tick and example\ninstallation never approve a plugin.\n\nA plugin **shared with the repo** puts its entry in `.avoozl.json`, where\nit is committed and reviewed like any other change. Each computer still\napproves it for itself. Because a shared entry is the same on every\ncomputer, its `config` holds no machine path: name an environment variable\n(`termsFileEnv`, `stateFileEnv`) that holds each computer's own path, as the\n`sdk-team` sample does.\n\n## How Avoozl runs a plugin\n\n- Each approved plugin runs in its own Node child process. Avoozl talks to it\n  in JSON lines over stdin and stdout, and gives it no port.\n- A plugin may call its own system over the network. It must not open a\n  listener. A plugin that listens is stopped and marked broken.\n- Write nothing to stdout yourself; it carries the protocol. `console.log`\n  output goes to stderr, which Avoozl discards.\n- Each call has a time limit (20 seconds by default) inside the tick's own\n  time budget.\n- Every reply is checked against the contract. Links must be `http` or\n  `https`. Reply text is untrusted data: Avoozl quotes it as data in briefs\n  and escapes it in views.\n- When a plugin is missing, unapproved, disabled, crashes, times out, replies\n  with the wrong shape, or expects an unsupported contract, Avoozl marks it\n  unavailable for that tick. Its tasks show \"needs you\" with the reason, and\n  every other task keeps moving. The next tick tries again. A plugin's tasks\n  never fall back to another route or tracker on their own.\n\n## Route kind\n\nA task whose manifest entry says `\"route\": \"plugin:<id>\"` is delivered by\nthat route instead of a local worker session. One graph can mix routes, for\nexample a local leaf, then a remote one, then a local one.\n\n| Call                    | Reply                                                                            |\n| ----------------------- | -------------------------------------------------------------------------------- |\n| `submit({task, brief})` | `{id, link}`: the remote ID and a link to the work                               |\n| `status({id})`          | `{state, link?, reason?}`: `queued`, `running`, `needs-person`, `failed`, `done` |\n| `completion({id})`      | `{pr?, answer?}`: a pull request link, an answer, or both                        |\n| `cancel({id})`          | `{cancelled}`                                                                    |\n\n- `submit` gets the task's own title, summary, acceptance and checks, and a\n  brief. Make it idempotent by task ID.\n- The tick reads `status` every tick until the work is done. `needs-person`\n  shows the task as \"needs you\" with your link.\n- A remote task is done only when `status` says `done` and `completion`\n  returns its result. Each dependent's brief quotes that result as data.\n- `failed` stops the task for a person. `route.resubmit` starts it again.\n\n## Tracker kind\n\nA task with `\"authority\": \"plugin:<id>\"` keeps its record in that tracker,\nthe way a GitHub task keeps its record in an issue. SQLite only caches it:\ndirect edits are refused, and changes go through the plan and projection.\n\n| Call                               | Reply                                                                                  |\n| ---------------------------------- | -------------------------------------------------------------------------------------- |\n| `project({task, desired, marker})` | `{id, link, marker}`: create or update the record, idempotent by namespace and task ID |\n| `read({ids})`                      | `{records: [...]}`: each record's state and fields                                     |\n| `list({namespace})`                | `{records: [...]}`: every record carrying this namespace, for rebuild                  |\n| `close({id, reason})`              | `{closed}`: close with reason `completed` or `not_planned`                             |\n\nEach record in a `read` or `list` reply has:\n\n- `id`, `link`, `state` (`open` or `closed`), and `closeReason` when closed;\n- `fields`: the managed values as they are in the tracker now: `title`,\n  `section` (the managed description section) and `tags`, plus `blockedBy`\n  with the `edges` capability;\n- `marker`: the namespace, task ID and last applied values Avoozl stored with\n  the record, returned unchanged;\n- with the `actor` capability, `closedBy` and `pausedBy`: who closed or paused\n  it; with `pause`, `paused`.\n\nRules a tracker plugin must follow:\n\n- **Store the marker.** Keep the `marker` from `project` with the record (a\n  hidden field or a managed description section) and return it unchanged from\n  `project`, `read` and `list`. A plugin that does not is refused as a\n  tracker.\n- **Edges.** Without the `edges` capability, the graph stays in Avoozl: its\n  edges come from the approved plan. With `edges`, `desired.blockedBy` lists\n  the record IDs that block this one; store them as the tracker's own links.\n- **Edit only managed fields.** Avoozl changes the title, the managed section,\n  managed tags and, with `edges`, blocking links. A field a person changed is a\n  conflict that Avoozl reports and leaves alone.\n- **Completion is Avoozl's.** Avoozl decides a task is done and then calls\n  `close(id, \"completed\")`. A close or pause by someone else is judged with\n  the actor you report, against the entry's `config.allowedActors`. Without\n  the `actor` capability, every outside close holds the task's dependents for\n  a person.\n\n## Rules kind\n\nA rules plugin supplies content rule sets: terms Avoozl must never write\n(see \"Ban private terms\" in `docs/policies.md`). It lets a team ship its\nlist as a private package that public Avoozl never sees.\n\n| Call           | Reply                                             |\n| -------------- | ------------------------------------------------- |\n| `ruleSets({})` | `{sets: [{id, version, rules: [{id, pattern}]}]}` |\n\n- `pattern` is a regular expression, matched per line ignoring case.\n- A set or rule must not carry `allow`. Allow lines exist only in a person's\n  own terms file; a plugin writes its exception into the pattern itself\n  (for example `\\bzebra\\b(?!-ui)`). A reply with `allow` is refused, which\n  makes that plugin's sets unavailable.\n- A `.avoozl.json` set `{ \"id\": \"<set id>\", \"plugin\": \"<plugin id>\" }` picks\n  one set by id. In **Settings > Content rules**, pick the plugin as the set's\n  **Rules plugin**; such a set has no terms file to edit there.\n- Without a plugin, a set's rules live in its terms file,\n  `.avoozl/local/content-rules/<set id>.txt`, one `name: pattern` per line,\n  plus `allow:` lines for false matches.\n  Settings edits it with a Rule builder (word or phrase, or pattern) and a\n  File view, writes it readable by your account only, and refuses to write\n  it where Git could commit it. **How rules work** on that tab explains the\n  format with made-up examples.\n- Avoozl keeps the rules in memory for the tick. It never writes them to\n  SQLite, receipts, or Git; findings record the set's `version`.\n- A plugin that is missing, unapproved, or broken makes only its own sets\n  unavailable, and every boundary those sets cover writes nothing until it is\n  fixed.\n\n## Pack part\n\nA pack is settings only. Avoozl never runs anything from it. It is one JSON\nfile:\n\n```json\n{\n  \"description\": \"Triage labels, triggers and who counts for SDK repositories.\",\n  \"settings\": {\n    \"repositories\": {\n      \"minimumPermission\": \"write\",\n      \"rules\": [\n        { \"id\": \"deliver\", \"action\": \"deliver\",\n          \"match\": \"label:avoozl:deliver -label:needs-triage -label:response-requested\" }\n      ],\n      \"untriaged\": { \"filter\": \"label:needs-triage\",\n                     \"triageLabels\": [\"response-requested\", \"closing-soon\"] }\n    },\n    \"project\": { \"fields\": { \"status\": \"Status\", \"release\": \"Release\" } },\n    \"contentRules\": { \"sets\": [{ \"id\": \"team-terms\", \"plugin\": \"sdk-team\" }] }\n  }\n}\n```\n\nWhat a pack may set, and where each lands in `.avoozl.json`:\n\n| Pack key                     | Sets                                                                                                                                                       |\n| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `settings.repositories`      | For each repository you pick at import: `rules` (trigger `match` lines), `untriaged`, `allowedActors`, `minimumPermission`, `requiredChecks`, `priority`, `managedLabels`, `concurrency` |\n| `settings.project`           | `github.project.fields` and `statusValues`, when a GitHub Project is set                                                                                   |\n| `settings.epicIssueType`     | `github.epicIssueType`                                                                                                                                     |\n| `settings.contentRules.sets` | Rule set references by id (`plugin`, `action`, `boundaries`), never rules                                                                                  |\n| `settings.delivery`          | `reviewers` (review roles), `agent`, `model`, `runner`, `concurrency`                                                                                      |\n| `settings.flow`              | Flow settings, such as `batch.max`                                                                                                                         |\n\n- Every key is checked with the same rules Settings uses. Any other key is\n  refused by name, such as `Pack key settings.repositories.autoMerge is not\n  a pack setting.`, and the plugin shows as invalid until it is fixed.\n- A pack cannot hold a credential or a content rule pattern. Terms come\n  from the `rules` part at run time, so they are never stored in a public\n  repository.\n- A pack has no follow mode and no org minimums. Avoozl copies the\n  settings once; after that they are the repository's own settings.\n\n**Import.** On the plugin's card in **Settings > Plugins**, **Preview and\nimport pack** shows each setting as **Create**, **Change**, **Keep** or\n**Skip** (a setting that cannot apply here, such as Project fields with no\nProject set), with the old and new values. Nothing is written until\n**Import settings**, and only:\n\n- after this computer approved this exact plugin version;\n- for the exact preview shown: if the pack or `.avoozl.json` changed since,\n  Avoozl asks you to preview again;\n- when a setting would let more people give orders than before (a lower\n  `minimumPermission`, or new `allowedActors`), only after you accept that\n  change, which the preview names on its own line;\n- for a plugin declared on this computer only, after you confirm that its\n  id and settings go into `.avoozl.json`.\n\nImport writes `packs` into `.avoozl.json`: for each plugin, the version\nimported, when and by whom, and the settings that came from it. When a\nnewer version arrives, approve it, and the card offers its preview again;\nimporting it records the new version. At the command line:\n\n```sh\navoozl plugins pack-preview sdk-team\navoozl plugins pack-import sdk-team --preview HASH [--accept-lowered]\n```\n\n## Intake part\n\nAn intake source is a tracker kind with the `poll` capability, listed in\n`provides` as `intake`. The fake tracker (`fake-tracker/`) is the example:\nits `poll` reads a JSON file of items and returns those changed since the\ncursor.\n\n| Call                    | Reply                                                                   |\n| ----------------------- | ----------------------------------------------------------------------- |\n| `poll({cursor, limit})` | `{items, cursor, more}`: items changed since `cursor`, at most `limit` |\n\n```js\nexport const tracker = {\n  poll({ cursor, limit }, { config }) {\n    const changed = readItems(config).filter(\n      (item) => !cursor || mark(item) > cursor,\n    );\n    const page = changed.slice(0, limit);\n    return {\n      items: page,\n      cursor: page.length ? mark(page.at(-1)) : cursor,\n      more: changed.length > page.length,\n    };\n  },\n};\n```\n\n- `cursor` is your own text of at most 2,000 characters, or null on the\n  first poll. Return the cursor for the next poll and `more: true` when a\n  page is left. Avoozl asks for at most 500 items, polls each source at most\n  once per tick, and stores the new cursor only after every item of the\n  reply is handled, so a crash replays the same page. A failed poll keeps\n  the cursor and the items and shows the error on the source.\n- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,\n  `review` or `ticket`), `title`, `state` (`open` or `closed`), and\n  `updatedAt`; and may have `body`, `labels`, `author`, `assignees`,\n  `closeReason`, `closedBy`, `closedAt`, `fields` (text, number or\n  true/false values) and `trigger`. An item that breaks a limit is refused\n  with a reason naming the field; the other items of the reply still count.\n- `trigger` is `{actor, permission, eventId, at}`: who last changed what a\n  rule would match, and that person's standing in your system, mapped to\n  `none`, `read`, `triage`, `write`, `maintain` or `admin`. Avoozl checks it\n  against the source's `allowedActors` and `minimumPermission` (default\n  `write`). Without the `actor` capability nobody counts, so your items only\n  list, pause or quarantine. A close counts as an order only when\n  `closedBy` is the trigger's actor and that actor counts.\n- A plugin that provides `intake` but not `tracker` is never asked to\n  `project`, `read`, `list` or `close`. Avoozl writes nothing back to an\n  intake source.\n\nDeclare the source under `intake.sources`, in `.avoozl.json` or in this\nmachine's `plugins.json` when its name must stay private:\n\n```json\n{\n  \"intake\": {\n    \"sources\": {\n      \"tickets\": {\n        \"via\": \"plugin:fake-tracker\",\n        \"repository\": \"example/app\",\n        \"labelFields\": [\"component\"],\n        \"minimumPermission\": \"write\"\n      }\n    }\n  }\n}\n```\n\n`repository` names a registered repository: its trigger rules apply, and a\ndelivered item's task lands there. A rule matches a source's items only\nwith a `source:` term, such as `label:go source:tickets`; a rule without\none matches GitHub only. `labelFields` adds a `<field>:<value>` label per\nfield and `assigneeField` an assignee before matching. Items no rule takes\nshow in the **Intake** tab with their source.\n\n## Testing your plugin\n\nCopy the fake plugins' approach: keep the remote system in a file or a local\nstand-in, declare the plugin in a temporary `plugins.json`, approve its hash,\nand run ticks. Avoozl's proof P26 does exactly this with the two fakes, and\nproof P35 installs, previews, imports and polls the `sdk-team` bundle.\nProof P32 polls the fake tracker as an intake source.\n";
// kirocrew-app/ui/src/PluginsSettings.tsx
function em({ row: e }) {
	let t = Object.entries(e.capabilities ?? {}).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; "), n = [
		["Version", e.version],
		[ap, e.contract === void 0 ? void 0 : String(e.contract)],
		["Runs code as", e.kinds?.length ? e.kinds.join(", ") : e.kinds ? "nothing: settings only" : void 0],
		["Capabilities", t || void 0],
		["Declared in", e.source === "machine" ? "this machine" : ".avoozl.json"],
		["Git", e.git ? [e.git.url, e.git.subdir].filter(Boolean).join(" : ") : void 0],
		["Ref", e.git?.ref],
		["Commit", e.commit],
		["Location", e.location],
		["Content hash", e.hash]
	];
	return /* @__PURE__ */ b("dl", {
		className: "mt-2 grid gap-x-3 gap-y-1 text-xs",
		style: { gridTemplateColumns: "auto 1fr" },
		children: n.filter(([, e]) => e).map(([e, t]) => /* @__PURE__ */ x("div", {
			className: "contents",
			children: [/* @__PURE__ */ b("dt", {
				className: "text-muted",
				children: e
			}), /* @__PURE__ */ b("dd", {
				className: "break-all",
				children: /* @__PURE__ */ b("code", { children: t })
			})]
		}, e))
	});
}
function tm({ row: e }) {
	let t = fp(e);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: "mt-2 flex flex-col gap-1 text-xs",
		"data-plugin-parts": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", { children: [
			/* @__PURE__ */ b("span", {
				className: "font-semibold",
				children: dp[t]?.title ?? t
			}),
			/* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" ", dp[t]?.line]
			}),
			t === "pack" && e.pack ? /* @__PURE__ */ b("span", {
				className: "block text-muted",
				children: e.pack.imported ? `Imported version ${e.pack.imported.version}: ${e.pack.imported.settings.length} settings.${e.pack.offer ? ` Version ${e.version} is not imported yet.` : ""}` : "Not imported yet."
			}) : null
		] }, t))
	}) : null;
}
function nm(e) {
	let { row: t, busy: n, act: r, client: i, workspaceId: a } = e, o = Cp(t), s = t.id ?? "";
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Z, {
			title: t.id ?? "Unnamed entry",
			meta: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
				variant: o.attention ? "warning" : void 0,
				children: o.label
			}), t.health?.state === "ok" ? /* @__PURE__ */ b(q, { children: "Healthy" }) : null] })
		}),
		t.reason ? /* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: t.reason
		}) : null,
		t.health?.state === "unavailable" && t.health.reason !== t.reason ? /* @__PURE__ */ x("p", {
			className: "mt-1 text-xs text-muted",
			children: ["Last tick: ", t.health.reason]
		}) : null,
		/* @__PURE__ */ b(tm, { row: t }),
		/* @__PURE__ */ b(em, { row: t }),
		t.id ? /* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-wrap gap-2",
			children: [
				t.pack ? /* @__PURE__ */ b(Ai, {
					tooltip: "See what each pack setting would create, change or keep, then import it",
					primary: t.pack.offer && t.state === "approved",
					disabled: n,
					onClick: () => e.onImport(t),
					children: t.pack.imported && t.pack.offer ? `Preview version ${t.version}` : t.pack.imported ? "Preview pack" : "Preview and import pack"
				}) : null,
				wp(t) ? /* @__PURE__ */ x(Ai, {
					tooltip: "Trust this exact version so it may run",
					primary: !0,
					disabled: n,
					onClick: () => r(() => i.approve(a, t)),
					children: [
						"Approve version ",
						t.version,
						t.commit ? ` at ${t.commit.slice(0, 12)}` : ""
					]
				}) : null,
				t.git ? /* @__PURE__ */ b(Ai, {
					tooltip: "Fetch the ref's current commit. A new commit needs approval again.",
					disabled: n,
					onClick: () => r(() => i.update(a, s)),
					children: t.commit ? `Update from ${t.git.ref}` : `Fetch ${t.git.ref}`
				}) : null,
				t.state === "disabled" ? /* @__PURE__ */ b(Ai, {
					tooltip: "Let this plugin run again",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !1)),
					children: "Enable"
				}) : t.state !== "invalid" && t.state !== "missing" ? /* @__PURE__ */ b(Ai, {
					tooltip: "Stop this plugin from running. Enable undoes it.",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !0)),
					children: "Disable"
				}) : null,
				/* @__PURE__ */ b("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ b(Ci, {
						icon: Ne,
						disabled: n,
						confirm: {
							title: `Remove the plugin ${t.id}?`,
							body: "Its declaration and approval are removed. Its tasks stay, waiting as \"needs you\" until the plugin is declared and approved again.",
							action: "Remove plugin"
						},
						onConfirm: () => r(() => i.remove(a, s)),
						children: "Remove"
					})
				})
			]
		}) : null
	] });
}
function rm({ workspaceId: e }) {
	let n = l(), r = o(() => Ep(n), [n]), { value: i, error: a, busy: s, reload: d } = ya(e, t((e) => r.list(e), [r])), [f, p] = c(!1), [g, _] = c(null), [v, y] = c(null), [S, C] = c(null), [w, T] = c(!1), { openChat: E } = u(), D = () => E({
		message: Zp({
			supported: i?.supportedContracts ?? [],
			installed: (i?.plugins ?? []).flatMap((e) => e.id ? [e.id] : [])
		}),
		autoSend: !1
	}), O = (e) => {
		p(!0), _(null), e().then(() => d()).catch((e) => _(J(e))).finally(() => p(!1));
	}, k = fl("(min-width: 1024px)");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				"data-plugin-help": !0,
				children: [/* @__PURE__ */ b(Y, {
					icon: ye,
					tooltip: qp,
					onClick: D,
					children: "Design a plugin"
				}), /* @__PURE__ */ b(Y, {
					icon: j,
					tooltip: Jp,
					onClick: () => T(!0),
					children: "Plugin guide"
				})]
			}),
			w ? /* @__PURE__ */ b(Zs, {
				workspaceId: e,
				target: {
					document: Kp,
					lineStart: null,
					lineEnd: null
				},
				text: $p,
				onClose: () => T(!1)
			}) : null,
			a ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: a
			}) : null,
			g ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: g
			}) : null,
			S ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				role: "status",
				children: S
			}) : null,
			v ? /* @__PURE__ */ b(Np, {
				row: v,
				workspaceId: e,
				client: r,
				onChanged: d,
				onClose: (e) => {
					y(null), C(e ?? null);
				}
			}) : null,
			/* @__PURE__ */ x("div", {
				"data-plugins-layout": !0,
				style: k ? {
					display: "grid",
					gridTemplateColumns: "minmax(18rem, 2fr) minmax(0, 3fr)",
					gap: 14,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 14
				},
				children: [/* @__PURE__ */ b(Vp, {
					workspaceId: e,
					client: r,
					supported: i?.supportedContracts ?? [],
					onChanged: d
				}), /* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-col gap-3",
					"aria-label": "Installed plugins",
					children: [i && !i.plugins.length ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(h, {
						title: "No plugins",
						subtitle: "Nothing loads until a plugin is declared and approved. Add one on the left."
					}) }) : null, i?.plugins.map((t, n) => /* @__PURE__ */ b(nm, {
						row: t,
						busy: f || s,
						act: O,
						client: r,
						workspaceId: e,
						onImport: y
					}, `${t.id}-${t.source}-${n}`))]
				})]
			}),
			/* @__PURE__ */ b(Gp, {
				workspaceId: e,
				plugins: i?.plugins ?? []
			})
		]
	});
}
// kirocrew-app/ui/src/content-api.ts
var im = {
	plan: "Plan files",
	github: "GitHub text",
	brief: "Session briefs",
	diff: "Worker diffs",
	intake: "Incoming items"
}, am = {
	plan: "Spec files when a plan is saved or approved.",
	github: "Issue, comment and pull request text Avoozl writes.",
	brief: "The brief a worker session starts with.",
	diff: "Lines a worker adds, checked before a push.",
	intake: "Items that come in from a plugin source or MCP. Only checked when you tick it."
}, om = Object.keys(im), sm = om.filter((e) => e !== "intake");
function cm(e) {
	return e.source === "plugin" ? `Rules plugin ${e.plugin}${e.version ? `, version ${e.version}` : ""}` : e.source === "policy" ? ".avoozl.json" : e.termsFrom === "machine" ? "Terms file named in this machine’s settings" : "Terms file in .avoozl/local/content-rules";
}
function lm(e) {
	let t = e.boundaries ? e.boundaries.map((e) => im[e] ?? e).join(", ") : "Every boundary but incoming items";
	return e.repositories ? `${t} in ${e.repositories.join(", ")}` : t;
}
var um = {
	"builtin:planning-repository": {
		name: "Plans repo name",
		protects: "The private planning repository’s name, as owner/name, a GitHub URL or owner/name#12. It is found even when split by spaces or a line break, or hidden by percent or HTML escapes.",
		where: "Linked branches, steering, session briefs and pull requests in the code repositories.",
		example: "Follow-up from example-org/secret-plans#12",
		modes: ["plans-repo"]
	},
	"builtin:reply-safety": {
		name: "Safe replies",
		protects: "Secrets and machine paths in a responder’s reply: GitHub, AWS, Slack, Google and API keys, private keys, web tokens, bearer tokens, URLs with a password, password= lines, and paths like /Users/…, C:\\…, ~/… or this machine’s own folders. Code blocks are checked too.",
		where: "Replies a responder session posts on a GitHub issue.",
		example: "The log is at ~/work/run.log",
		modes: null
	},
	"builtin:published-secrets": {
		name: "Secrets",
		protects: "Private keys, provider and GitHub tokens, password or API key values, Authorization headers, URLs with a password, user home paths, and long random-looking values.",
		where: "Issue markers, workspace publications and broad-issue previews.",
		example: "Authorization: Bearer made-up-token-123",
		modes: null
	}
}, dm = (e) => um[e]?.name ?? e, fm = (e, t) => {
	let n = um[e]?.modes;
	return !n || n.includes(t ?? "");
}, pm = () => ({
	id: "",
	action: "block",
	boundaries: [...sm],
	repositories: [],
	plugin: ""
}), mm = (e) => ({
	id: e.id,
	action: e.action,
	boundaries: e.boundaries ?? [...sm],
	repositories: e.repositories ?? [],
	plugin: e.plugin ?? ""
}), hm = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function gm(e, t) {
	let n = e.id.trim();
	return n ? n.toLowerCase().startsWith("builtin:") ? { error: "Names starting builtin: are reserved." } : hm.test(n) ? t.includes(n) ? { error: `A set named ${n} already exists.` } : e.boundaries.length ? { entry: {
		id: n,
		...e.action === "report" ? { action: "report" } : {},
		...e.boundaries.length && !(e.boundaries.length === sm.length && sm.every((t) => e.boundaries.includes(t))) ? { boundaries: om.filter((t) => e.boundaries.includes(t)) } : {},
		...e.repositories.length ? { repositories: [...e.repositories] } : {},
		...e.plugin ? { plugin: e.plugin } : {}
	} } : { error: "Pick at least one place to check." } : { error: "Use lowercase letters, digits, dots, dashes or underscores." } : { error: "Give the set a name." };
}
var _m = (e) => gm(mm(e), []).entry ?? { id: e.id }, vm = /[.*+?^${}()|[\]\\]/g, ym = (e) => e.replace(vm, "\\$&"), bm = (e) => e.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
function xm(e) {
	let t = bm(e);
	return ym(t) === e ? {
		kind: "word",
		value: t
	} : {
		kind: "pattern",
		value: e
	};
}
function Sm(e) {
	let t = e.replace(/\n$/, "").split("\n");
	return t.length === 1 && t[0] === "" ? [] : t.map((e) => {
		let t = e.trim();
		if (!t) return { kind: "blank" };
		if (t.startsWith("#")) return {
			kind: "note",
			text: t.replace(/^#\s?/, "")
		};
		let n = t.indexOf(":");
		if (n < 1) return {
			kind: "raw",
			text: e
		};
		let r = t.slice(0, n).trim(), i = xm(t.slice(n + 1).trim()), a = Cm.exec(r);
		return a ? {
			kind: "allow",
			rule: a[1]?.trim() ?? "",
			match: i.kind,
			value: i.value
		} : {
			name: r,
			...i
		};
	});
}
var Cm = /^allow(?:\s+(.*))?$/i, wm = (e, t) => e === "word" ? ym(t.trim()) : t.trim();
function Tm(e) {
	return e.kind === "blank" ? "" : e.kind === "note" ? `# ${e.text}` : e.kind === "raw" ? e.text : e.kind === "allow" ? `allow${e.rule.trim() ? ` ${e.rule.trim()}` : ""}: ${wm(e.match, e.value)}` : `${e.name.trim()}: ${wm(e.kind, e.value)}`;
}
var Em = (e) => e.length ? e.map(Tm).join("\n") + "\n" : "", Dm = (e) => [...new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name.trim()] : []))].filter(Boolean);
function Om(e, t = []) {
	if (e.kind === "raw") return "Needs a name, a colon, then the word or pattern.";
	if (e.kind === "allow") return e.rule.trim() && !Dm(t).includes(e.rule.trim()) ? "Allows a rule this file does not have." : e.value.trim() ? e.match === "pattern" ? km(e.value) : null : "Give a word, phrase or pattern to allow.";
	if (e.kind !== "word" && e.kind !== "pattern") return null;
	let n = e.name.trim();
	return n ? n.includes(":") ? "A name cannot hold a colon." : /^#/.test(n) ? "A name cannot start with #." : Cm.test(n) ? "A name cannot start with allow; use an Allow row." : e.value.trim() ? e.kind === "pattern" ? km(e.value) : null : "Give a word, phrase or pattern." : "Give the rule a name.";
}
function km(e) {
	try {
		new RegExp(e.trim(), "i");
	} catch (e) {
		return `The pattern does not compile (${String(e.message).split(": ").pop()}).`;
	}
	return null;
}
function Am(e) {
	let t = Sm(e);
	return t.flatMap((e, n) => {
		let r = Om(e, t);
		return r ? [{
			line: n + 1,
			message: r
		}] : [];
	});
}
var jm = (e) => e.filter((e) => e.kind === "word" || e.kind === "pattern").length, Mm = (e) => e.filter((e) => e.kind === "allow").length;
function Nm(e) {
	let t = new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name] : [])), n = e.length + 1;
	for (; t.has(`rule-${n}`);) n += 1;
	return `rule-${n}`;
}
function Pm(e, t) {
	let n = t.flatMap((e) => e.kind === "allow" && !Om(e, t) ? [{
		rule: e.rule.trim(),
		re: new RegExp(wm(e.match, e.value), "i")
	}] : []), r = t.flatMap((e) => {
		if (e.kind !== "word" && e.kind !== "pattern" || Om(e, t)) return [];
		let r = e.name.trim();
		return [{
			name: r,
			re: new RegExp(wm(e.kind, e.value), "gi"),
			allow: n.filter((e) => !e.rule || e.rule === r).map((e) => e.re)
		}];
	}), i = [];
	return e.split("\n").forEach((e, t) => {
		for (let { name: n, re: a, allow: o } of r) {
			let r = o.some((t) => t.test(e));
			a.lastIndex = 0;
			let s, c = 0;
			for (; (s = a.exec(e)) && c++ < 200;) s[0].length === 0 ? a.lastIndex += 1 : i.push({
				line: t,
				start: s.index,
				end: s.index + s[0].length,
				rule: n,
				...r ? { allowed: !0 } : {}
			});
		}
	}), i;
}
function Fm(e, t) {
	let n = Array(e.length).fill(null);
	for (let e of t) for (let t = e.start; t < e.end; t++) {
		let r = n[t] ??= {
			rules: [],
			allowed: []
		}, i = e.allowed ? r.allowed : r.rules;
		i.includes(e.rule) || i.push(e.rule);
	}
	let r = [], i = (e) => e ? `${e.rules.join()}|${e.allowed.join()}` : "|", a = "";
	for (let t = 0; t < e.length; t++) {
		let o = n[t], s = i(o), c = r[r.length - 1];
		c && s === a ? c.text += e[t] : r.push({
			text: e[t],
			rules: [...o?.rules ?? []],
			...o?.allowed.length ? { allowed: [...o.allowed] } : {}
		}), a = s;
	}
	return r;
}
function Im(e) {
	let t = async (t, n, r) => (await e.post(Nt, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		list: (e) => t("content.rules", {}, e),
		saveSets: (e, n, r) => t("content.sets.update", {
			sets: n,
			expectedHash: r ?? null
		}, e),
		terms: (e, n) => t("content.terms.get", { id: n }, e),
		saveTerms: (e, n, r) => t("content.terms.update", {
			id: n,
			text: r
		}, e)
	};
}
// kirocrew-app/ui/src/ContentRulesSettings.tsx
var Lm = "avoozl-content-help";
function Rm() {
	let e = document.getElementById(Lm);
	e && (e.open = !0, e.scrollIntoView({
		behavior: "smooth",
		block: "start"
	}));
}
function zm({ children: e = "How rules work" }) {
	return /* @__PURE__ */ x("button", {
		type: "button",
		className: "inline-flex items-center gap-1 text-xs underline",
		onClick: Rm,
		"data-help-link": !0,
		children: [/* @__PURE__ */ b(j, {
			size: 12,
			"aria-hidden": "true"
		}), e]
	});
}
var Bm = {
	border: "1px solid var(--border)",
	borderRadius: 10,
	background: "color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))"
};
function Vm(e) {
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("button", {
		type: "button",
		onClick: e.onClick,
		"aria-current": e.selected ? "true" : void 0,
		className: "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left",
		style: {
			background: e.selected ? "var(--card, var(--bg))" : "transparent",
			border: `1px solid ${e.selected ? "var(--accent)" : "transparent"}`
		},
		children: [/* @__PURE__ */ x("span", {
			className: "flex w-full items-center gap-1.5 text-sm font-medium",
			children: [
				e.locked && /* @__PURE__ */ b(_e, {
					size: 12,
					"aria-label": "Built in",
					style: {
						color: "var(--muted)",
						flexShrink: 0
					}
				}),
				/* @__PURE__ */ b("span", {
					className: "truncate",
					children: e.title
				}),
				e.note && /* @__PURE__ */ b("span", {
					className: "ml-auto shrink-0",
					children: e.note
				})
			]
		}), e.raw && /* @__PURE__ */ b("code", {
			className: "text-[11px] text-muted",
			children: e.raw
		})]
	}) });
}
function Hm(e) {
	let { value: t, selection: n } = e, r = (e, t) => n?.kind === e && "id" in n && n.id === t, i = /* @__PURE__ */ b(Y, {
		icon: Ee,
		primary: !0,
		onClick: () => e.onSelect({ kind: "new" }),
		tooltip: "Make a set of your own words to block or report",
		children: "Add rule set"
	});
	return /* @__PURE__ */ x("nav", {
		"aria-label": "Rule sets",
		className: "flex flex-col gap-3 p-3",
		style: Bm,
		"data-rule-panel": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-col items-start gap-2",
				children: [/* @__PURE__ */ b("h3", {
					className: "text-sm font-semibold",
					children: "Your rule sets"
				}), !(t && !t.sets.length) && i]
			}),
			t && !t.sets.length ? /* @__PURE__ */ x("div", {
				className: "flex flex-col items-start gap-1.5 text-xs",
				"data-rule-empty": !0,
				children: [
					/* @__PURE__ */ b("p", { children: "No rule sets yet. Only the built-in sets run." }),
					/* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "Choose Add rule set to block your own words, like a project code name."
					}),
					i,
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(zm, {}) })
				]
			}) : /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5",
				children: t?.sets.map((t) => /* @__PURE__ */ b(Vm, {
					title: t.id,
					selected: r("set", t.id),
					onClick: () => e.onSelect({
						kind: "set",
						id: t.id
					}),
					note: t.available ? /* @__PURE__ */ b("span", {
						className: "text-[11px] text-muted",
						children: t.action === "report" ? "Reports" : "Blocks"
					}) : /* @__PURE__ */ b(q, {
						variant: "warning",
						children: "Unavailable"
					})
				}, t.id))
			}),
			/* @__PURE__ */ x("div", {
				className: "border-t pt-2",
				style: { borderColor: "var(--border)" },
				children: [
					/* @__PURE__ */ b("h3", {
						className: "text-sm font-semibold",
						children: "Built in"
					}),
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "Always on. Settings can’t change them."
					}),
					/* @__PURE__ */ b("ul", {
						className: "mt-1 flex flex-col gap-0.5",
						children: t?.builtins.map((n) => /* @__PURE__ */ b(Vm, {
							locked: !0,
							title: dm(n.id),
							raw: n.id,
							selected: r("builtin", n.id),
							onClick: () => e.onSelect({
								kind: "builtin",
								id: n.id
							}),
							note: fm(n.id, t?.mode) ? null : /* @__PURE__ */ b("span", {
								className: "text-[11px] text-muted",
								children: "not used"
							})
						}, n.id))
					})
				]
			})
		]
	});
}
function Um({ rows: e }) {
	return /* @__PURE__ */ b("dl", {
		className: "grid gap-x-3 gap-y-1.5 text-sm",
		style: { gridTemplateColumns: "minmax(7rem, auto) 1fr" },
		children: e.map(([e, t]) => /* @__PURE__ */ x("div", {
			className: "contents",
			children: [/* @__PURE__ */ b("dt", {
				className: "text-muted",
				children: e
			}), /* @__PURE__ */ b("dd", { children: t })]
		}, e))
	});
}
function Wm({ id: e, appliesAt: t, mode: n }) {
	let r = um[e], i = fm(e, n);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-rule-details": e,
		children: [
			/* @__PURE__ */ b(Z, {
				icon: _e,
				title: dm(e),
				meta: i ? /* @__PURE__ */ b(q, { children: "Always on" }) : /* @__PURE__ */ b(q, { children: "Not used" }),
				blurb: /* @__PURE__ */ b("code", {
					className: "text-[11px]",
					children: e
				})
			}),
			!i && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode."
			}),
			/* @__PURE__ */ b(Um, { rows: [
				["What it protects", r?.protects ?? "A check Avoozl runs on its own writes."],
				["Where it checks", r?.where ?? t],
				["It blocks", r ? /* @__PURE__ */ x("span", {
					className: "flex flex-col gap-1",
					children: [/* @__PURE__ */ b("code", {
						className: "w-fit rounded border px-1.5 py-0.5 text-xs",
						style: { borderColor: "var(--border)" },
						children: r.example
					}), /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "A made-up example."
					})]
				}) : "—"]
			] })
		]
	});
}
function Gm(e) {
	return /* @__PURE__ */ x("label", {
		className: "flex items-start gap-2 text-sm",
		style: { opacity: e.disabled ? .6 : 1 },
		children: [/* @__PURE__ */ b("input", {
			type: "checkbox",
			className: "mt-1",
			checked: e.checked,
			disabled: e.disabled,
			onChange: (t) => e.onChange(t.target.checked)
		}), /* @__PURE__ */ x("span", { children: [e.label, e.hint && /* @__PURE__ */ b("span", {
			className: "block text-xs text-muted",
			children: e.hint
		})] })]
	});
}
var Km = (e, t, n) => n ? [.../* @__PURE__ */ new Set([...e, t])] : e.filter((e) => e !== t);
function qm(e) {
	let { form: t, set: n, choices: r } = e;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-set-form": !0,
		children: [
			/* @__PURE__ */ x("label", {
				className: "flex flex-col gap-1 text-sm",
				style: { maxWidth: "22rem" },
				children: [
					/* @__PURE__ */ x("span", { children: ["Name ", /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ b(g, {
						value: t.id,
						disabled: !e.isNew,
						placeholder: "company-terms",
						onChange: (e) => n({ id: e.target.value })
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: e.isNew ? "Lowercase letters, digits, dots and dashes. It also names the terms file." : "The name is the terms file’s name, so it stays."
					}),
					/* @__PURE__ */ b("code", {
						className: "text-[11px] text-muted",
						children: "id"
					})
				]
			}),
			/* @__PURE__ */ x("fieldset", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ x("legend", {
					className: "mb-1 text-sm",
					children: ["When a rule matches ", /* @__PURE__ */ b("code", {
						className: "ml-1 text-[11px] text-muted",
						children: "action"
					})]
				}), /* @__PURE__ */ b(Ei, {
					id: "avoozl-set-action",
					label: "When a rule matches",
					value: t.action,
					onChange: (e) => n({ action: e }),
					cards: [{
						key: "block",
						icon: A,
						title: "Block",
						line: "Nothing is written. You decide in Conflicts, and can allow it once.",
						when: "the words must never leave this machine."
					}, {
						key: "report",
						icon: H,
						title: "Report",
						line: "The write goes through. The match is listed in Delivery with one notice.",
						when: "you are trying a new set out."
					}]
				})]
			}),
			/* @__PURE__ */ x("fieldset", {
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ x("legend", {
					className: "mb-1 text-sm",
					children: ["Where it checks ", /* @__PURE__ */ b("code", {
						className: "ml-1 text-[11px] text-muted",
						children: "boundaries"
					})]
				}), /* @__PURE__ */ b("div", {
					className: "grid gap-1.5",
					style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))" },
					children: om.map((e) => /* @__PURE__ */ b(Gm, {
						label: im[e],
						hint: am[e],
						checked: t.boundaries.includes(e),
						onChange: (r) => n({ boundaries: Km(t.boundaries, e, r) })
					}, e))
				})]
			}),
			/* @__PURE__ */ x("fieldset", {
				className: "flex flex-col gap-1",
				children: [
					/* @__PURE__ */ x("legend", {
						className: "mb-1 text-sm",
						children: [
							"Repositories ",
							/* @__PURE__ */ b("span", {
								className: "text-xs text-muted",
								children: "(optional)"
							}),
							" ",
							/* @__PURE__ */ b("code", {
								className: "ml-1 text-[11px] text-muted",
								children: "repositories"
							})
						]
					}),
					r.repositories.length ? /* @__PURE__ */ b("div", {
						className: "flex flex-wrap gap-x-4 gap-y-1",
						children: r.repositories.map((e) => /* @__PURE__ */ b(Gm, {
							label: e,
							checked: t.repositories.includes(e),
							onChange: (r) => n({ repositories: Km(t.repositories, e, r) })
						}, e))
					}) : /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "No repositories are registered yet. Add them under Repositories."
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "None checked: every repository."
					})
				]
			}),
			/* @__PURE__ */ x("label", {
				className: "flex flex-col gap-1 text-sm",
				style: { maxWidth: "22rem" },
				children: [
					/* @__PURE__ */ x("span", { children: ["Rules plugin ", /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "(optional)"
					})] }),
					/* @__PURE__ */ x("select", {
						value: t.plugin,
						onChange: (e) => n({ plugin: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: {
							borderColor: "var(--border)",
							color: "var(--text)",
							background: "var(--card, transparent)"
						},
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: "None: use a terms file on this machine"
						}), r.plugins.map((e) => /* @__PURE__ */ b("option", {
							value: e,
							children: e
						}, e))]
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "A plugin of kind rules, approved under Plugins, can supply this set instead."
					}),
					/* @__PURE__ */ b("code", {
						className: "text-[11px] text-muted",
						children: "plugin"
					})
				]
			})
		]
	});
}
var Jm = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	padding: "4px 8px",
	fontSize: 13,
	minWidth: 0,
	width: "100%"
}, Ym = { fontFamily: "var(--mono, monospace)" }, Xm = {
	display: "grid",
	gridTemplateColumns: "minmax(6rem, 9rem) minmax(8rem, 10rem) minmax(0, 1fr) auto",
	gap: 8,
	alignItems: "center"
}, Zm = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
	gap: 6,
	alignItems: "center"
};
function Qm(e) {
	let { row: t, index: n } = e, r = Om(t, e.rows), i = `avoozl-term-error-${n}`, a = e.narrow ? Zm : Xm;
	if (t.kind === "blank") return null;
	if (t.kind === "note" || t.kind === "raw") return /* @__PURE__ */ x("li", {
		className: "flex flex-col gap-1",
		"data-term-row": n + 1,
		children: [/* @__PURE__ */ x("div", {
			style: {
				display: "grid",
				gridTemplateColumns: "auto minmax(0, 1fr) auto",
				gap: 8,
				alignItems: "center"
			},
			children: [
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					style: { width: "4.5rem" },
					children: t.kind === "note" ? "Note" : `Line ${n + 1}`
				}),
				/* @__PURE__ */ b("input", {
					value: t.text,
					"aria-label": t.kind === "note" ? `Note on line ${n + 1}` : `Line ${n + 1}`,
					"aria-invalid": r ? "true" : void 0,
					"aria-describedby": r ? i : void 0,
					onChange: (n) => e.onChange({
						kind: t.kind,
						text: n.target.value
					}),
					style: {
						...Jm,
						...t.kind === "raw" ? Ym : { color: "var(--muted)" }
					}
				}),
				/* @__PURE__ */ b(X, {
					icon: Ie,
					label: `Drop line ${n + 1}`,
					onClick: e.onRemove
				})
			]
		}), r && /* @__PURE__ */ x("span", {
			id: i,
			className: "text-xs text-danger",
			children: [
				"Line ",
				n + 1,
				": ",
				r
			]
		})]
	});
	let o = t.kind === "allow", s = o ? t.match : t.kind, c = o ? `allow-${t.match}` : t.kind, l = (e, t, n) => e === t ? n : t === "pattern" ? ym(n) : xm(n).kind === "word" ? xm(n).value : n, u = (n) => {
		if (n === c) return;
		let r = n.endsWith("pattern") ? "pattern" : "word", i = l(s, r, t.value);
		n.startsWith("allow") ? e.onChange({
			kind: "allow",
			rule: o ? t.rule : "",
			match: r,
			value: i
		}) : e.onChange({
			kind: r,
			name: o ? Nm(e.rows) : t.name,
			value: i
		});
	}, d = Dm(e.rows), f = o ? /* @__PURE__ */ x("select", {
		value: t.rule,
		"aria-label": `Rule allowed on line ${n + 1}`,
		onChange: (n) => e.onChange({
			...t,
			rule: n.target.value
		}),
		style: Jm,
		children: [/* @__PURE__ */ b("option", {
			value: "",
			children: "Every rule"
		}), [.../* @__PURE__ */ new Set([...d, ...t.rule ? [t.rule] : []])].map((e) => /* @__PURE__ */ b("option", {
			value: e,
			children: e
		}, e))]
	}) : /* @__PURE__ */ b("input", {
		value: t.name,
		"aria-label": `Rule name on line ${n + 1}`,
		placeholder: "rule-name",
		onChange: (n) => e.onChange({
			...t,
			name: n.target.value
		}),
		style: Jm
	}), p = /* @__PURE__ */ x("select", {
		value: c,
		"aria-label": `Kind on line ${n + 1}`,
		onChange: (e) => u(e.target.value),
		style: Jm,
		children: [
			/* @__PURE__ */ b("option", {
				value: "word",
				children: "Word or phrase"
			}),
			/* @__PURE__ */ b("option", {
				value: "pattern",
				children: "Pattern"
			}),
			/* @__PURE__ */ b("option", {
				value: "allow-word",
				children: "Allow word"
			}),
			/* @__PURE__ */ b("option", {
				value: "allow-pattern",
				children: "Allow pattern"
			})
		]
	}), m = /* @__PURE__ */ b("input", {
		value: t.value,
		"aria-label": `${o ? "Allowed " : ""}${s === "word" ? "word or phrase" : "pattern"} on line ${n + 1}`,
		"aria-invalid": r ? "true" : void 0,
		"aria-describedby": r ? i : void 0,
		placeholder: o ? s === "word" ? "zebra falcon app" : String.raw`\bacme-0000\b` : s === "word" ? "zebra falcon" : String.raw`\bacme-\d{4}\b`,
		onChange: (n) => e.onChange({
			...t,
			value: n.target.value
		}),
		style: {
			...Jm,
			...s === "pattern" ? Ym : {},
			...r ? { borderColor: "var(--danger)" } : {},
			...e.narrow ? { gridColumn: "1 / 3" } : {}
		}
	}), h = /* @__PURE__ */ b(X, {
		icon: Ie,
		label: o ? `Drop allow line ${n + 1}` : `Drop rule ${t.name || n + 1}`,
		onClick: e.onRemove
	});
	return /* @__PURE__ */ x("li", {
		className: "flex flex-col gap-1",
		"data-term-row": n + 1,
		children: [e.narrow ? /* @__PURE__ */ x("div", {
			style: a,
			children: [
				f,
				p,
				/* @__PURE__ */ b("span", {}),
				m,
				h
			]
		}) : /* @__PURE__ */ x("div", {
			style: a,
			children: [
				f,
				p,
				m,
				h
			]
		}), r && /* @__PURE__ */ x("span", {
			id: i,
			className: "text-xs text-danger",
			role: "alert",
			children: [
				"Line ",
				n + 1,
				": ",
				r
			]
		})]
	});
}
function $m(e) {
	let t = s(null), n = o(() => Am(e.text), [e.text]), r = new Set(n.map((e) => e.line)), i = Math.max(1, e.text.replace(/\n$/, "").split("\n").length), a = {
		fontFamily: "var(--mono, monospace)",
		fontSize: 12,
		lineHeight: "18px"
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ x("div", {
			className: "flex overflow-hidden rounded border",
			style: {
				borderColor: "var(--border)",
				height: 220
			},
			children: [/* @__PURE__ */ b("div", {
				ref: t,
				"aria-hidden": "true",
				className: "select-none overflow-hidden px-2 py-1.5 text-right",
				style: {
					...a,
					background: "color-mix(in srgb, var(--text) 5%, var(--card, var(--bg)))",
					minWidth: "2.5rem"
				},
				children: Array.from({ length: i + 20 }, (e, t) => /* @__PURE__ */ b("div", {
					style: {
						color: r.has(t + 1) ? "var(--danger)" : "var(--muted)",
						fontWeight: r.has(t + 1) ? 700 : 400,
						visibility: t < i ? "visible" : "hidden"
					},
					children: t + 1
				}, t))
			}), /* @__PURE__ */ b("textarea", {
				"aria-label": "Terms file",
				spellCheck: !1,
				value: e.text,
				onChange: (t) => e.onChange(t.target.value),
				onScroll: (e) => {
					t.current && (t.current.scrollTop = e.currentTarget.scrollTop);
				},
				className: "flex-1 resize-none px-2 py-1.5",
				style: {
					...a,
					background: "var(--card, var(--bg))",
					color: "var(--text)",
					border: 0,
					outline: "none",
					whiteSpace: "pre",
					overflow: "auto"
				}
			})]
		}), n.length > 0 && /* @__PURE__ */ b("ul", {
			className: "text-xs text-danger",
			role: "alert",
			children: n.map((e) => /* @__PURE__ */ x("li", { children: [
				"Line ",
				e.line,
				": ",
				e.message
			] }, e.line))
		})]
	});
}
function eh({ rows: e }) {
	let [t, n] = c(""), r = o(() => Pm(t, e), [t, e]), i = t.split("\n"), a = r.filter((e) => !e.allowed), s = r.length - a.length, l = [...new Set(a.map((e) => e.rule))];
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1.5 rounded border p-2",
		style: { borderColor: "var(--border)" },
		"data-try-it": !0,
		children: [/* @__PURE__ */ x("label", {
			className: "flex flex-col gap-1 text-sm",
			children: [
				"Try it",
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: "Paste some text. Matches light up. Nothing here is saved or sent."
				}),
				/* @__PURE__ */ b("textarea", {
					value: t,
					onChange: (e) => n(e.target.value),
					rows: 3,
					placeholder: "Notes from the zebra falcon sync",
					className: "rounded border px-2 py-1 text-sm",
					style: {
						borderColor: "var(--border)",
						background: "var(--card, var(--bg))",
						color: "var(--text)"
					}
				})
			]
		}), t && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("div", {
			className: "rounded px-2 py-1 text-sm",
			style: {
				background: "color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))",
				whiteSpace: "pre-wrap"
			},
			"aria-live": "polite",
			children: i.map((e, t) => /* @__PURE__ */ x("div", { children: [Fm(e, r.filter((e) => e.line === t)).map((e, t) => !e.rules.length && e.allowed ? /* @__PURE__ */ x("span", {
				"data-allowed": e.allowed.join(" "),
				children: [/* @__PURE__ */ b("del", {
					style: { color: "var(--muted)" },
					children: e.text
				}), /* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					style: { marginLeft: 2 },
					children: [" ", "(allowed)"]
				})]
			}, t) : e.rules.length ? /* @__PURE__ */ b("mark", {
				title: void 0,
				"data-match": e.rules.join(" "),
				style: {
					background: "color-mix(in srgb, var(--danger) 25%, transparent)",
					color: "inherit",
					borderRadius: 3
				},
				children: e.text
			}, t) : /* @__PURE__ */ b("span", { children: e.text }, t)), !e && "\xA0"] }, t))
		}), /* @__PURE__ */ x("p", {
			className: "text-xs text-muted",
			role: "status",
			children: [
				a.length ? `${a.length} match${a.length === 1 ? "" : "es"}: ${l.join(", ")}.` : "No matches.",
				s ? ` ${s} allowed.` : "",
				" Avoozl also reads through percent and HTML escapes; this preview does not."
			]
		})] })]
	});
}
function th(e) {
	let { workspaceId: t, client: n, set: i } = e, [a, o] = c(null), [s, l] = c([]), [u, d] = c(""), [f, m] = c(""), [h, g] = gi("content-terms-view", "inner", (e) => e === "file" ? "Back to File view" : "Back to Rule builder", "builder"), [_, y] = c(null), [S, C] = c(null), [w, T] = c(!1), E = fl("(max-width: 640px)");
	r(() => {
		let e = !0;
		return o(null), y(null), C(null), n.terms(t, i.id).then((t) => {
			if (!e) return;
			o(t);
			let n = t.text ?? "";
			d(n), m(n), l(Sm(n));
		}).catch((t) => e && y(J(t))), () => {
			e = !1;
		};
	}, [
		n,
		t,
		i.id
	]);
	let D = (e) => {
		l(e), d(Em(e)), C(null);
	}, O = (e) => {
		d(e), l(Sm(e)), C(null);
	}, k = Am(u), A = u !== f, j = async () => {
		T(!0), y(null);
		try {
			let r = await n.saveTerms(t, i.id, u);
			m(u), C(`Saved ${r.rules} rule${r.rules === 1 ? "" : "s"}.`), await e.onSaved();
		} catch (e) {
			y(J(e));
		} finally {
			T(!1);
		}
	};
	return _ && !a ? /* @__PURE__ */ b("p", {
		className: "text-sm text-danger",
		children: _
	}) : a ? a.editable ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		"data-terms-editor": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(v, {
						layoutId: "avoozl-terms-view",
						ariaLabel: "Terms view",
						segments: [{
							key: "builder",
							label: "Rule builder"
						}, {
							key: "file",
							label: "File view"
						}],
						value: h,
						onChange: (e) => g(e)
					}),
					/* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [
							jm(s),
							" rule",
							jm(s) === 1 ? "" : "s",
							Mm(s) ? `, ${Mm(s)} allow` : "",
							!a.exists && !A ? ", no file yet" : ""
						]
					}),
					/* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(zm, { children: "How a line works" })
					})
				]
			}),
			h === "builder" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				children: [
					jm(s) === 0 && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "No rules yet. Add one: a name that shows in logs, and the word or pattern to find."
					}),
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-2",
						"aria-label": "Rules",
						children: s.map((e, t) => /* @__PURE__ */ b(Qm, {
							row: e,
							rows: s,
							index: t,
							narrow: E,
							onChange: (e) => D(s.map((n, r) => r === t ? e : n)),
							onRemove: () => D(s.filter((e, n) => n !== t))
						}, t))
					}),
					/* @__PURE__ */ x("span", {
						className: "flex flex-wrap gap-3",
						children: [/* @__PURE__ */ b(Y, {
							icon: Ee,
							onClick: () => D([...s, {
								kind: "word",
								name: Nm(s),
								value: ""
							}]),
							children: "Add rule"
						}), /* @__PURE__ */ b(Y, {
							icon: Ee,
							onClick: () => D([...s, {
								kind: "allow",
								rule: "",
								match: "word",
								value: ""
							}]),
							tooltip: "Let a line through that a rule would block, like a public name that shares a word",
							children: "Add allow"
						})]
					})
				]
			}) : /* @__PURE__ */ b($m, {
				text: u,
				onChange: O
			}),
			/* @__PURE__ */ b(eh, { rows: s }),
			/* @__PURE__ */ x("p", {
				className: "flex items-start gap-1.5 text-xs text-muted",
				children: [/* @__PURE__ */ b(Me, {
					size: 14,
					"aria-hidden": "true",
					style: {
						flexShrink: 0,
						marginTop: 1
					}
				}), /* @__PURE__ */ x("span", { children: [
					"Saved only to ",
					/* @__PURE__ */ b("code", { children: a.file }),
					", which Git must ignore and only your account can read. A rule’s name can show in logs and notices; its words never do, so keep the words out of the name."
				] })]
			}),
			_ && /* @__PURE__ */ b("p", {
				className: "text-sm text-danger",
				role: "alert",
				children: _
			}),
			S && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				role: "status",
				children: S
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(p, {
						primary: !0,
						disabled: w || !A || k.length > 0,
						onClick: () => void j(),
						children: "Save terms"
					}),
					A && /* @__PURE__ */ b(p, {
						disabled: w,
						onClick: () => O(f),
						children: "Undo changes"
					}),
					k.length > 0 && /* @__PURE__ */ x("span", {
						className: "text-xs text-danger",
						children: [
							"Fix line ",
							k[0].line,
							" to save."
						]
					})
				]
			})
		]
	}) : /* @__PURE__ */ x("p", {
		className: "text-sm text-muted",
		children: [
			a.reason,
			" ",
			/* @__PURE__ */ b("code", {
				className: "text-xs",
				children: a.file
			})
		]
	}) : /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Reading the terms file…"
	});
}
function nh(e) {
	let { set: t, value: n } = e, [i, a] = c(() => t ? mm(t) : pm()), [o, s] = c(null), [l, u] = c(!1), d = t ? JSON.stringify(_m(t)) : null;
	r(() => {
		a(t ? mm(t) : pm()), s(null);
	}, [d]);
	let f = n.sets.filter((e) => e.id !== t?.id), m = n.choices ?? {
		repositories: [],
		plugins: []
	}, h = gm(i, f.map((e) => e.id)), g = !t || JSON.stringify(h.entry) !== JSON.stringify(_m(t)), _ = async (t, r) => {
		u(!0), s(null);
		try {
			e.onSaved(await e.client.saveSets(e.workspaceId, t, n.configHash), r);
		} catch (e) {
			s(J(e));
		} finally {
			u(!1);
		}
	}, v = () => {
		if (!h.entry) return s(h.error ?? "Check the form.");
		let e = n.sets.map((e) => e.id === t?.id ? h.entry : _m(e));
		_(t ? e : [...e, h.entry], String(h.entry.id));
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		"data-rule-details": t?.id ?? "new",
		children: [
			/* @__PURE__ */ b(Z, {
				title: t ? t.id : "New rule set",
				meta: t && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
					variant: t.available ? "success" : "warning",
					children: t.available ? "Available" : "Unavailable"
				}), /* @__PURE__ */ b(q, { children: t.action === "report" ? "Reports" : "Blocks" })] }),
				blurb: t ? "Your words to keep out of what Avoozl writes." : "Name it and pick where it checks. Add its words after you save.",
				actions: t && /* @__PURE__ */ b(Ci, {
					icon: Ne,
					disabled: l,
					confirm: {
						title: `Delete the rule set ${t.id}?`,
						body: "It is removed from .avoozl.json and stops checking. Its terms file stays on this machine, so a new set with the same name uses it again.",
						action: "Delete set"
					},
					onConfirm: () => void _(f.map(_m), null),
					children: "Delete set"
				})
			}),
			t && /* @__PURE__ */ b(Um, { rows: [
				["Rules from", cm(t)],
				["Checks", lm(t)],
				...t.available && t.ruleCount !== void 0 ? [["Rules", String(t.ruleCount)]] : []
			] }),
			t && !t.available && t.reason && /* @__PURE__ */ x("p", {
				className: "text-sm",
				style: { color: "var(--danger)" },
				role: "alert",
				children: [
					"Nothing it checks is written until this is fixed: ",
					t.reason,
					"."
				]
			}),
			/* @__PURE__ */ x("section", {
				className: "flex flex-col gap-2",
				children: [
					/* @__PURE__ */ b("h4", {
						className: "text-sm font-semibold",
						children: "Settings"
					}),
					/* @__PURE__ */ b(qm, {
						form: i,
						set: (e) => a({
							...i,
							...e
						}),
						isNew: !t,
						choices: m
					}),
					o && /* @__PURE__ */ b("p", {
						className: "text-sm text-danger",
						role: "alert",
						children: o
					}),
					!h.entry && h.error && i.id && /* @__PURE__ */ b("p", {
						className: "text-xs text-danger",
						children: h.error
					}),
					/* @__PURE__ */ x("div", {
						className: "flex gap-2",
						children: [/* @__PURE__ */ b(p, {
							primary: !0,
							disabled: l || !g || !h.entry,
							onClick: v,
							children: t ? "Save set" : "Create set"
						}), /* @__PURE__ */ b("span", {
							className: "self-center text-xs text-muted",
							children: "Saves to .avoozl.json. No words go there."
						})]
					})
				]
			}),
			t && t.source === "file" && /* @__PURE__ */ x("section", {
				className: "flex flex-col gap-2 border-t pt-3",
				style: { borderColor: "var(--border)" },
				children: [
					/* @__PURE__ */ b("h4", {
						className: "text-sm font-semibold",
						children: "Words and patterns"
					}),
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "One rule per line. Case doesn’t matter. Only you can see these."
					}),
					/* @__PURE__ */ b(th, {
						workspaceId: e.workspaceId,
						client: e.client,
						set: t,
						onSaved: e.reload
					})
				]
			}),
			t && t.source === "plugin" && /* @__PURE__ */ x("p", {
				className: "text-sm text-muted",
				children: [
					"The plugin ",
					t.plugin,
					" supplies this set’s rules, so there is no terms file to edit."
				]
			})
		]
	});
}
var rh = String.raw`# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b`, ih = String.raw`# zebra falcon app is the public name
allow: zebra falcon app
# ACME-0000 is the sample ticket in the docs
allow ticket: \bacme-0000\b`;
function ah() {
	return /* @__PURE__ */ x("details", {
		id: Lm,
		className: "rounded-lg border p-3",
		style: { borderColor: "var(--border)" },
		"data-rules-help": !0,
		children: [/* @__PURE__ */ x("summary", {
			className: "flex cursor-pointer items-center gap-2 text-sm font-semibold",
			style: { listStyle: "none" },
			children: [/* @__PURE__ */ b(j, {
				size: 14,
				"aria-hidden": "true"
			}), "How rules work"]
		}), /* @__PURE__ */ x("div", {
			className: "mt-3 grid gap-4 text-sm",
			style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))" },
			children: [
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Rule sets"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "A rule set is a named list of words Avoozl must not write. .avoozl.json only names the set and where it checks. The words live in a file on this machine, or come from a rules plugin."
				})] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "One rule per line"
					}),
					/* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "A name, a colon, then what to find. Lines starting with # are notes. Case never matters."
					}),
					/* @__PURE__ */ b("pre", {
						className: "mt-1 overflow-auto rounded border p-2 text-xs",
						style: { borderColor: "var(--border)" },
						children: rh
					})
				] }),
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Word or pattern"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "A word or phrase matches only itself. A pattern is a regular expression, for things like any ticket number. The builder saves a word with its dots and brackets escaped, so they mean themselves."
				})] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "Allow a false match"
					}),
					/* @__PURE__ */ x("p", {
						className: "text-muted",
						children: [
							"A line starting ",
							/* @__PURE__ */ b("code", { children: "allow" }),
							" lets text through that a rule would block. ",
							/* @__PURE__ */ b("code", { children: "allow:" }),
							" works for every rule in the file; ",
							/* @__PURE__ */ b("code", { children: "allow ticket:" }),
							" works for the ticket rule only. It counts only when it matches the same line the rule matched. Allow lines are as private as rules, and the built-in sets don’t use them."
						]
					}),
					/* @__PURE__ */ b("pre", {
						className: "mt-1 overflow-auto rounded border p-2 text-xs",
						style: { borderColor: "var(--border)" },
						children: ih
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "Where it checks"
					}),
					/* @__PURE__ */ b("ul", {
						className: "text-muted",
						children: om.map((e) => /* @__PURE__ */ x("li", { children: [
							/* @__PURE__ */ x("span", {
								style: { color: "var(--text)" },
								children: [im[e], ":"]
							}),
							" ",
							am[e]
						] }, e))
					}),
					/* @__PURE__ */ b("p", {
						className: "mt-1 text-muted",
						children: "It also reads through percent and HTML escapes and hidden zero-width characters."
					})
				] }),
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Block or report"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "Block stops the write and opens a decision in Conflicts. There a person can change the text, or Allow once with a reason: that lets that exact text through one time. Report lets the write through and lists the match in Delivery, with one notice."
				})] }),
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Built-in sets"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "Plans repo name, Safe replies and Secrets always run where they apply. Settings can’t turn them off, and a set of yours can’t use a name starting builtin:."
				})] }),
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Privacy"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "Terms files sit in .avoozl/local/content-rules, which Git must ignore, and only your account can read them. A file Git tracks, or could commit, is refused. A finding names the set, the rule and the line, never the words. A set whose file is missing blocks everything it checks until the file is back."
				})] }),
				/* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
					className: "font-semibold",
					children: "Rules plugins"
				}), /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "A plugin of kind rules can supply sets, for words a team shares without a file on each machine. Add and approve it under Plugins, then pick it as the set’s rules plugin. Its rules stay in memory only."
				})] })
			]
		})]
	});
}
function oh({ workspaceId: e }) {
	let n = l(), i = o(() => Im(n), [n]), { value: a, error: s, reload: d } = ya(e, t((e) => i.list(e), [i])), [f, p] = c(null), m = f ?? a;
	r(() => p(null), [a]);
	let [h, g] = c(null), _ = h && (h.kind === "new" || h.kind !== "set" || m?.sets.some((e) => e.id === h.id)) ? h : m?.sets[0] ? {
		kind: "set",
		id: m.sets[0].id
	} : m?.builtins[0] ? {
		kind: "builtin",
		id: m.builtins[0].id
	} : null, v = fl("(min-width: 860px)"), y = _?.kind === "set" ? m?.sets.find((e) => e.id === _.id) ?? null : null, S = _?.kind === "builtin" ? m?.builtins.find((e) => e.id === _.id) : void 0, { openChat: C } = u();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap gap-2",
				"data-rules-design": !0,
				children: /* @__PURE__ */ b(Y, {
					icon: ye,
					tooltip: Yp,
					onClick: () => C({
						message: Qp({ sets: (m?.sets ?? []).map((e) => e.id) }),
						autoSend: !1
					}),
					children: "Design a rule set"
				})
			}),
			s && /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: s
			}),
			m?.error && /* @__PURE__ */ x("p", {
				className: "text-xs text-danger",
				children: [".avoozl.json contentRules is invalid, so every check blocks: ", m.error]
			}),
			/* @__PURE__ */ x("div", {
				"data-content-layout": !0,
				style: v ? {
					display: "grid",
					gridTemplateColumns: "minmax(14rem, 18rem) minmax(0, 1fr)",
					gap: 16,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [/* @__PURE__ */ b(Hm, {
					value: m,
					selection: _,
					onSelect: g
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 rounded-lg border p-4",
					style: {
						borderColor: "var(--border)",
						background: "var(--card, var(--bg))"
					},
					children: m ? S ? /* @__PURE__ */ b(Wm, {
						id: S.id,
						appliesAt: S.appliesAt,
						mode: m.mode
					}) : _?.kind === "new" || y ? /* @__PURE__ */ b(nh, {
						workspaceId: e,
						client: i,
						value: m,
						set: y,
						reload: d,
						onSaved: (e, t) => {
							p(e), g(t ? {
								kind: "set",
								id: t
							} : null);
						}
					}, y?.id ?? "new") : null : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Reading rule sets…"
					})
				})]
			}),
			/* @__PURE__ */ b(ah, {})
		]
	});
}
// kirocrew-app/ui/src/PromptInstructions.tsx
var sh = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function ch(e) {
	let [t, n] = c(!1), r = async () => {
		if (e.builtIn) try {
			await navigator.clipboard.writeText(e.builtIn), n(!0), setTimeout(() => n(!1), 1500);
		} catch {
			n(!1);
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-2 text-sm",
		style: { maxWidth: "44rem" },
		"data-prompt-instructions": e.id,
		children: [
			/* @__PURE__ */ b(Ti, {
				id: `${e.id}-builtin`,
				title: `Built-in ${e.agent} prompt (read-only)`,
				children: e.builtIn ? /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 pb-2",
					children: [/* @__PURE__ */ b("pre", {
						className: "rounded border p-2 text-xs",
						style: {
							...sh,
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							maxHeight: "16rem",
							overflowY: "auto"
						},
						children: e.builtIn
					}), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(Y, {
						icon: t ? M : z,
						tooltip: "Copy the built-in prompt",
						onClick: () => void r(),
						children: t ? "Copied" : "Copy"
					}) })]
				}) : /* @__PURE__ */ b("p", {
					className: "pb-2 text-xs text-muted",
					children: "The built-in prompt could not be read."
				})
			}),
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: "Your instructions"
				}), /* @__PURE__ */ b(jh, { rule: { required: !1 } })]
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: "Added after the built-in prompt."
			}),
			/* @__PURE__ */ b("textarea", {
				id: e.id,
				rows: 3,
				value: e.value,
				placeholder: e.placeholder,
				onChange: (t) => e.onChange(t.target.value),
				className: "rounded border px-2 py-1 text-sm",
				style: sh
			}),
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(K, {
				text: ".avoozl.json key",
				children: /* @__PURE__ */ b("code", {
					className: "text-[11px] text-muted",
					style: {
						overflowWrap: "anywhere",
						opacity: .8
					},
					children: e.raw
				})
			})
		]
	});
}
// kirocrew-app/ui/src/FlowSettings.tsx
var lh = { required: !1 }, uh = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function dh({ name: e }) {
	return /* @__PURE__ */ b(K, {
		text: ".avoozl.json key",
		children: /* @__PURE__ */ b("code", {
			className: "text-[11px] text-muted",
			style: {
				overflowWrap: "anywhere",
				opacity: .8
			},
			children: e
		})
	});
}
function fh(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? { maxWidth: e.width } : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(jh, { rule: lh })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(dh, { name: e.raw })
		]
	});
}
function ph({ children: e }) {
	return /* @__PURE__ */ b(m, {
		className: "flex flex-col gap-4",
		"data-flow-box": !0,
		children: e
	});
}
var mh = [
	{
		key: "dependents",
		title: "Tasks that build on it",
		line: "Pause the culprit's dependents; unrelated work keeps moving.",
		when: "most of the time (the default)."
	},
	{
		key: "repo",
		title: "This repository",
		line: "Pause every task in the repository that broke.",
		when: "one repository shares a lot of code across tasks."
	},
	{
		key: "all",
		title: "Everything",
		line: "Pause every task in the workspace.",
		when: "repositories depend on each other."
	}
];
function hh({ workspaceId: e }) {
	let n = l(), i = o(() => Ec(n), [n]), { value: a, error: s, reload: u } = ya(e, t((e) => i.settings(e), [i])), [d, f] = c(Hc()), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null), [C, w] = c({
		list: [],
		error: null
	});
	r(() => {
		let e = !0;
		return i.models().then((t) => e && w({
			list: t,
			error: t.length ? null : "Kiro Crew listed no models; auto uses its default."
		}), () => e && w({
			list: [],
			error: "Kiro Crew's model list could not be read; auto uses its default."
		})), () => {
			e = !1;
		};
	}, [i]), r(() => {
		a && (f(Hc(a.flow)), h(a.instructions ?? ""));
	}, [a]);
	let T = (e) => f({
		...d,
		...e
	}), E = async () => {
		if (!a) return;
		let t = Uc(d);
		if (t.error) return S({ error: t.error });
		v(!0), S(null);
		try {
			await i.saveSettings(e, {
				flow: t.flow,
				expectedHash: a.hash
			}), m !== (a.instructions ?? "") && await i.saveInstructions(e, m), S({ ok: "Saved." }), await u();
		} catch (e) {
			S({ error: J(e) });
		} finally {
			v(!1);
		}
	};
	if (s) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: s
	});
	if (!a) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let D = d.scope || Vc.scope, O = d.localChecksFirst ? d.localChecksFirst === "on" : Vc.localChecksFirst;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-settings": !0,
		children: [
			/* @__PURE__ */ b(ph, { children: /* @__PURE__ */ b(Q, {
				title: "Timing",
				blurb: "Always on. Avoozl records where each task's time goes; nothing to set."
			}) }),
			/* @__PURE__ */ b(ph, { children: /* @__PURE__ */ b(Q, {
				title: "Stop the line",
				blurb: "When a change breaks a check that passed, pause new work until it's fixed.",
				children: /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-baseline gap-x-2",
							children: [/* @__PURE__ */ b("span", {
								className: "font-medium",
								children: "What to pause"
							}), /* @__PURE__ */ b(jh, { rule: lh })]
						}),
						/* @__PURE__ */ b(Ei, {
							id: "avoozl-flow-scope",
							label: "What to pause",
							value: D,
							onChange: (e) => T({ scope: e }),
							cards: mh.map((e) => ({ ...e }))
						}),
						/* @__PURE__ */ b(dh, { name: "flow.stopTheLine.scope" })
					]
				})
			}) }),
			/* @__PURE__ */ b(ph, { children: /* @__PURE__ */ x(Q, {
				title: "Local checks first",
				blurb: "Run the checks here before any push, so CI only confirms. It matters only when sessions push.",
				children: [/* @__PURE__ */ x("label", {
					className: "flex flex-wrap items-center gap-2 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: O,
							onChange: (e) => T({ localChecksFirst: e.target.checked ? "on" : "off" })
						}),
						/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "Require a local pass before push"
						}),
						/* @__PURE__ */ b(jh, { rule: lh })
					]
				}), /* @__PURE__ */ b(dh, { name: "flow.localChecksFirst" })]
			}) }),
			/* @__PURE__ */ b(ph, { children: /* @__PURE__ */ b(Q, {
				title: "Batching",
				blurb: "Run small related tasks together to pay setup and checks once. 1 turns it off.",
				children: /* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b(fh, {
						id: "avoozl-flow-max",
						label: "Most tasks per run",
						raw: "flow.batch.max",
						width: "13rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-flow-max",
							inputMode: "numeric",
							value: d.max,
							placeholder: String(Vc.max),
							onChange: (e) => T({ max: e.target.value })
						})
					}), /* @__PURE__ */ b(fh, {
						id: "avoozl-flow-by",
						label: "Group by",
						raw: "flow.batch.by",
						width: "12rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-flow-by",
							value: d.by,
							onChange: (e) => T({ by: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: uh,
							children: [
								/* @__PURE__ */ b("option", {
									value: "",
									children: "Same epic (default)"
								}),
								/* @__PURE__ */ b("option", {
									value: "epic",
									children: "Same epic"
								}),
								/* @__PURE__ */ b("option", {
									value: "files",
									children: "Same files"
								})
							]
						})
					})]
				})
			}) }),
			/* @__PURE__ */ b(ph, { children: /* @__PURE__ */ x(Q, {
				title: "Retro",
				blurb: "A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.",
				children: [
					/* @__PURE__ */ b(Z, {
						level: 4,
						title: "When it runs"
					}),
					/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						"data-flow-group": "when",
						children: [/* @__PURE__ */ b(fh, {
							id: "avoozl-flow-every",
							label: "After this many tasks",
							raw: "flow.retro.everyTasks",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-every",
								inputMode: "numeric",
								value: d.everyTasks,
								placeholder: String(Vc.everyTasks),
								onChange: (e) => T({ everyTasks: e.target.value })
							})
						}), /* @__PURE__ */ b(fh, {
							id: "avoozl-flow-slow",
							label: "Slow when over (× usual)",
							raw: "flow.retro.slowFactor",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-slow",
								inputMode: "decimal",
								value: d.slowFactor,
								placeholder: String(Vc.slowFactor),
								onChange: (e) => T({ slowFactor: e.target.value })
							})
						})]
					}),
					/* @__PURE__ */ b(Z, {
						level: 4,
						title: "Who runs it and what it weighs"
					}),
					/* @__PURE__ */ b("div", {
						className: "flex flex-wrap gap-4",
						"data-flow-group": "model",
						children: /* @__PURE__ */ b(fh, {
							id: "avoozl-flow-model",
							label: "Model",
							raw: "flow.retro.model",
							width: "16rem",
							note: C.error ?? void 0,
							children: /* @__PURE__ */ b("select", {
								id: "avoozl-flow-model",
								value: d.model || Vc.model,
								onChange: (e) => T({ model: e.target.value === Vc.model ? "" : e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: uh,
								children: Sc(C.list, d.model).map((e) => /* @__PURE__ */ b("option", {
									value: e.value,
									children: e.label
								}, e.value))
							})
						})
					}),
					/* @__PURE__ */ b(ch, {
						id: "avoozl-flow-instructions",
						agent: "retro",
						builtIn: a.retroPrompt,
						value: m,
						onChange: h,
						raw: "flow.retro.instructions",
						placeholder: "What the retro should weigh, for example: fewer review rounds matter more than CI time.",
						note: "Saved on this machine only."
					})
				]
			}) }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [
					/* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						disabled: _,
						onClick: () => void E(),
						children: _ ? "Saving…" : "Save"
					}),
					y?.error && /* @__PURE__ */ b("span", {
						role: "alert",
						className: "text-sm text-danger",
						children: y.error
					}),
					y?.ok && /* @__PURE__ */ b("span", {
						className: "text-sm text-muted",
						children: y.ok
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Writes flow in .avoozl.json."
					})
				]
			})
		]
	});
}
// kirocrew-app/ui/src/DeliverySettings.tsx
var gh = { required: !1 }, _h = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function vh({ name: e }) {
	return /* @__PURE__ */ b("code", {
		className: "text-[11px] text-muted",
		style: {
			overflowWrap: "anywhere",
			opacity: .8
		},
		children: e
	});
}
function yh(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.width,
			width: "100%"
		},
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(jh, { rule: gh })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(vh, { name: e.raw })
		]
	});
}
function bh({ workspaceId: e, onOpenRouting: n }) {
	let i = l(), a = o(() => (t, n = {}) => i.post(Nt, {
		operation: t,
		input: n,
		workspaceId: e
	}).then((e) => e.result), [i, e]), { value: s, error: u, reload: d } = ya(e, t(() => a("delivery.settings.get"), [a])), [f, h] = c(Ur()), [_, v] = c([]), [y, S] = c(null);
	r(() => {
		let e = !0;
		return i.get("/api/models").then((t) => e && v(xc(t)), () => e && v([])), () => {
			e = !1;
		};
	}, [i]), r(() => {
		s && h(Ur(s.delivery));
	}, [s]);
	let C = (e) => h({
		...f,
		...e
	}), w = async () => {
		if (!s) return;
		let e = Wr(f);
		if (e.error) return S({ error: e.error });
		S(null);
		try {
			await a("delivery.settings.update", {
				delivery: e.delivery,
				expectedHash: s.hash
			}), await d(), S({ ok: "Saved." });
		} catch (e) {
			S({ error: J(e) });
		}
	};
	if (u) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: u
	});
	if (!s) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	if (!s.on) return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Q, {
		title: "Delivery is off",
		blurb: "Add a delivery section to .avoozl.json to let the tick start ready tasks; these settings appear then."
	}) });
	let T = f.prFeedback ? f.prFeedback === "on" : Hr.prFeedback;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-delivery-settings": !0,
		children: [/* @__PURE__ */ x(m, {
			className: "flex flex-col gap-4",
			children: [/* @__PURE__ */ x(Q, {
				title: "Writer",
				blurb: "The agent and model worker chats open on, unless a routing rule or the task picks another.",
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b(yh, {
						id: "avoozl-delivery-agent",
						label: "Agent",
						raw: "delivery.agent",
						width: "16rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-delivery-agent",
							value: f.agent,
							placeholder: Hr.agent,
							onChange: (e) => C({ agent: e.target.value })
						})
					}), /* @__PURE__ */ b(yh, {
						id: "avoozl-delivery-model",
						label: "Model",
						raw: "delivery.model",
						width: "18rem",
						note: "Review roles that must differ from the writer need a named model.",
						children: /* @__PURE__ */ b("select", {
							id: "avoozl-delivery-model",
							value: f.model || "auto",
							onChange: (e) => C({ model: e.target.value === "auto" ? "" : e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: _h,
							children: Sc(_, f.model).map((e) => /* @__PURE__ */ b("option", {
								value: e.value,
								children: e.label
							}, e.value))
						})
					})]
				}), /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					children: [
						"Per-task agent and model, and spreading tasks across models, are routing rules.",
						" ",
						n ? /* @__PURE__ */ b("button", {
							type: "button",
							className: "underline",
							onClick: n,
							children: "Open Routing"
						}) : "Set them on the Routing tab."
					]
				})]
			}), /* @__PURE__ */ x(Q, {
				title: "Pull request feedback",
				blurb: "Send failed checks and allowed reviewers' comments back to the chat that wrote the pull request. Matters only in a GitHub mode.",
				children: [
					/* @__PURE__ */ x("label", {
						className: "flex flex-wrap items-center gap-2 text-sm",
						children: [
							/* @__PURE__ */ b("input", {
								type: "checkbox",
								checked: T,
								onChange: (e) => C({ prFeedback: e.target.checked ? "on" : "off" })
							}),
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								children: "Send pull request feedback to the writer"
							}),
							/* @__PURE__ */ b(jh, { rule: gh })
						]
					}),
					/* @__PURE__ */ b(vh, { name: "delivery.prFeedback" }),
					/* @__PURE__ */ b(yh, {
						id: "avoozl-delivery-rounds",
						label: "Most feedback rounds per task",
						raw: "delivery.feedbackRounds",
						width: "16rem",
						note: "Then Avoozl stops and asks you.",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-delivery-rounds",
							inputMode: "numeric",
							value: f.feedbackRounds,
							placeholder: String(Hr.feedbackRounds),
							onChange: (e) => C({ feedbackRounds: e.target.value })
						})
					})
				]
			})]
		}), /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-3",
			children: [
				/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: () => void w(),
					children: "Save"
				}),
				y?.error && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "text-sm text-danger",
					children: y.error
				}),
				y?.ok && /* @__PURE__ */ b("span", {
					className: "text-sm text-muted",
					children: y.ok
				}),
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: "Writes delivery in .avoozl.json."
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/SettingsView.tsx
var xh = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, Sh = (e = 220) => ({
	display: "grid",
	gap: 12,
	gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${e}px), 1fr))`,
	alignItems: "start"
}), Ch = {
	sm: "9rem",
	md: "18rem",
	lg: "28rem"
}, wh = [
	{
		key: "workspaces",
		label: "Workspaces"
	},
	{
		key: "repositories",
		label: "Repositories"
	},
	{
		key: "github",
		label: "Where tasks live"
	},
	{
		key: "plugins",
		label: "Plugins"
	},
	{
		key: "content",
		label: "Content rules"
	},
	{
		key: "flow",
		label: "Flow"
	},
	{
		key: "delivery",
		label: "Delivery"
	}
], Th = {
	workspaces: "The Avoozl workspaces on this machine, each a folder with its own task database. Add one for each set of plans you keep apart.",
	repositories: "The code checkouts tasks change and land in, with their GitHub settings. Save only writes .avoozl.json.",
	github: "The mode, planning repository and Project board. Save only writes .avoozl.json; Set up GitHub creates what's missing, after showing each change.",
	plugins: "A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.",
	content: "Terms Avoozl must never write: in plan files, issues, comments, briefs and diffs. A match stops the write and asks you.",
	flow: "How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode.",
	delivery: "Which agent and model write each task by default, and whether pull request feedback goes back to the writer. Crews and per-task picks are on the Routing tab."
}, Eh = [
	{
		key: "mode",
		label: "Mode and branch"
	},
	{
		key: "triggers",
		label: "Triggers and labels"
	},
	{
		key: "checks",
		label: "Checks"
	},
	{
		key: "reviews",
		label: "Reviews"
	}
], Dh = {
	mode: "Which repository this is, the branch pull requests merge into, and who writes the code.",
	triggers: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
	checks: "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
	reviews: "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub."
}, Oh = {
	status: "Status field",
	release: "Release field",
	wave: "Wave field",
	iteration: "Iteration field",
	avoozlState: "Avoozl state field"
}, kh = {
	claim: "Claim label",
	needsHuman: "Needs-human label"
}, Ah = {
	todo: "Ready option",
	inProgress: "In progress option",
	done: "Done option",
	deferred: "Deferred option"
};
function jh({ rule: e }) {
	return e ? e.required ? /* @__PURE__ */ x("span", {
		className: "text-xs text-muted",
		"data-marker": "required",
		children: [
			"(required",
			e.when ? ` ${e.when}` : "",
			")"
		]
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		"data-marker": "optional",
		children: "(optional)"
	}) : null;
}
function Mh(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? { maxWidth: Ch[e.width] } : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(jh, { rule: e.rule })]
			}),
			e.children,
			e.rule?.blank && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.rule.blank
			}),
			e.raw && /* @__PURE__ */ b(K, {
				text: ".avoozl.json key",
				children: /* @__PURE__ */ b("code", {
					className: "text-[11px] text-muted",
					style: {
						overflowWrap: "anywhere",
						opacity: .8
					},
					children: e.raw
				})
			})
		]
	});
}
function Nh(e) {
	return /* @__PURE__ */ b(Mh, {
		id: e.id,
		label: e.label,
		raw: e.raw,
		rule: e.rule,
		width: e.width,
		children: /* @__PURE__ */ b(g, {
			id: e.id,
			type: e.type,
			value: e.value,
			placeholder: e.placeholder,
			"aria-required": e.rule?.required || void 0,
			onChange: (t) => e.onChange(t.target.value)
		})
	});
}
function Ph(e) {
	return /* @__PURE__ */ b(Mh, {
		id: e.id,
		label: e.label,
		raw: e.raw,
		rule: e.rule,
		width: e.width,
		children: /* @__PURE__ */ x("select", {
			id: e.id,
			value: e.value,
			onChange: (t) => e.onChange(t.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: xh,
			children: [/* @__PURE__ */ b("option", {
				value: "",
				children: e.none
			}), e.options.map((e) => /* @__PURE__ */ b("option", {
				value: e,
				children: e
			}, e))]
		})
	});
}
function Fh({ children: e }) {
	return /* @__PURE__ */ b("p", {
		className: "mt-1 text-xs text-muted",
		children: e
	});
}
function Q(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		"data-section": e.title,
		children: [/* @__PURE__ */ b(Z, {
			level: e.level === "sub" ? 4 : 3,
			title: e.title,
			blurb: e.blurb,
			actions: e.actions
		}), e.children]
	});
}
var Ih = {
	all: "has all",
	any: "has any",
	none: "has none",
	assignee: "assigned to"
};
function Lh(e) {
	let t = l(), n = o(() => gd(t), [t]), [i, a] = c(null), [s, u] = c(null), d = !!e.untriaged, f = e.value.trim() || e.untriaged?.placeholder.trim() || "";
	r(() => {
		if (!f) {
			a(null), u(null);
			return;
		}
		let t = !0, r = setTimeout(() => {
			n(e.workspaceId, e.repository, f, d).then((e) => t && (a(e), u(null)), (e) => t && u(J(e)));
		}, 400);
		return () => {
			t = !1, clearTimeout(r);
		};
	}, [
		f,
		e.repository,
		e.workspaceId,
		n,
		d
	]);
	let p = i && i.match === f ? i : null, m = `${e.id}-error`;
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ x(Mh, {
				id: e.id,
				label: d ? "Untriaged filter" : "Matches issues",
				raw: d ? "untriaged.filter" : "match",
				rule: d ? {
					required: !1,
					blank: "blank: leaves out the triage labels below"
				} : { required: !0 },
				width: d ? "lg" : void 0,
				children: [/* @__PURE__ */ b(g, {
					id: e.id,
					value: e.value,
					placeholder: e.untriaged ? e.untriaged.placeholder || "no:assignee" : "label:agent:go -label:hold",
					"aria-required": !d || void 0,
					"aria-invalid": p?.error ? !0 : void 0,
					"aria-describedby": p?.error ? m : void 0,
					spellCheck: !1,
					autoComplete: "off",
					className: "font-mono",
					style: { fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)" },
					onChange: (t) => e.onChange(t.target.value)
				}), /* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: hd
				})]
			}),
			!f && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: d ? "Blank with no triage labels: every open issue and pull request counts, less rule matches and tasks." : "Type a line such as label:agent:go to see what it matches."
			}),
			s && /* @__PURE__ */ x("span", {
				className: "text-xs text-danger",
				children: ["The line could not be checked: ", s]
			}),
			p?.error && /* @__PURE__ */ b("span", {
				id: m,
				role: "alert",
				className: "text-xs text-danger",
				children: p.error.replace(/ Same syntax as GitHub's issue search\..*$/, "").replace(/^match cannot use /, "Can't use ")
			}),
			p?.parsed && /* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-1.5",
				"data-match-chips": !0,
				children: _d(p.parsed).map((e) => /* @__PURE__ */ x("span", {
					className: "flex flex-wrap items-center gap-1",
					children: [/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: Ih[e.kind]
					}), e.values.map((t) => /* @__PURE__ */ b(q, {
						variant: e.kind === "none" ? void 0 : "info",
						children: t
					}, t))]
				}, e.kind))
			}),
			p?.parsed && /* @__PURE__ */ b(Rh, {
				preview: p,
				untriaged: d
			})
		]
	});
}
function Rh({ preview: e, untriaged: t = !1 }) {
	let n = t ? ["item", "items"] : ["issue", "issues"];
	if (!e.repository) return /* @__PURE__ */ x("span", {
		className: "text-xs text-muted",
		children: [
			"Name the repository to see which open ",
			n[1],
			" match."
		]
	});
	if (e.searchError) return /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: e.searchError
	});
	if (e.total === null) return null;
	let r = e.total === 0 ? `No open ${n[0]} matches now.` : `${e.total} open ${e.total === 1 ? `${n[0]} matches` : `${n[1]} match`} now${t ? ", before rules and tasks are left out" : ""}`;
	return e.issues.length ? /* @__PURE__ */ x("details", {
		className: "text-xs",
		"data-match-issues": !0,
		children: [/* @__PURE__ */ x("summary", {
			className: "cursor-pointer text-muted",
			children: [r, e.total > e.issues.length ? ` (newest ${e.issues.length})` : ""]
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-0.5",
			children: e.issues.map((e) => /* @__PURE__ */ x("li", {
				className: "min-w-0 truncate",
				children: [
					/* @__PURE__ */ x("a", {
						href: e.url,
						target: "_blank",
						rel: "noopener noreferrer",
						className: "underline",
						children: ["#", e.number]
					}),
					" ",
					/* @__PURE__ */ b("span", { children: e.title })
				]
			}, e.number))
		})]
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		"data-match-issues": !0,
		children: r
	});
}
function zh(e) {
	let t = l(), n = o(() => Cu(t), [t]), [i, a] = c(null), { id: s, value: u, repository: d } = e, f = (t) => e.onChange({
		...u,
		...t
	}), p = /^[\w.-]+\/[\w.-]+$/.test(d);
	r(() => {
		if (a(null), !p) return;
		let t = !0;
		return n(e.workspaceId, d).then((e) => t && a(e), (e) => t && a({
			repository: d,
			labels: null,
			error: J(e)
		})), () => {
			t = !1;
		};
	}, [
		p,
		d,
		e.workspaceId,
		n
	]);
	let m = wu(u.triageLabels, i?.labels ?? null), h = (e, t) => f({ triageLabels: t ? [...u.triageLabels, e] : u.triageLabels.filter((t) => t.toLocaleLowerCase() !== e.toLocaleLowerCase()) });
	return /* @__PURE__ */ x(Q, {
		level: "sub",
		title: "Untriaged",
		blurb: "What the Intake tab's Untriaged filter lists for this repository: open issues and pull requests no rule, triage label or task covers.",
		children: [
			/* @__PURE__ */ b(Lh, {
				id: `${s}-untriaged-filter`,
				value: u.filter,
				repository: d,
				workspaceId: e.workspaceId,
				onChange: (e) => f({ filter: e }),
				untriaged: { placeholder: yd(u.triageLabels) }
			}),
			/* @__PURE__ */ x("fieldset", {
				className: "flex flex-col gap-1 text-sm",
				"data-triage-labels": !0,
				children: [
					/* @__PURE__ */ x("legend", {
						className: "flex flex-wrap items-baseline gap-x-2",
						children: [/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "Triage labels"
						}), /* @__PURE__ */ b(jh, { rule: { required: !1 } })]
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "An item with any of these counts as triaged and leaves the list."
					}),
					p ? i ? i.error ? /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: i.error
					}) : null : /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [
							"Reading ",
							d,
							"'s labels…"
						]
					}) : /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Name the repository as owner/name under Mode, and its labels show here."
					}),
					m.length > 0 && /* @__PURE__ */ b("ul", {
						className: "flex flex-wrap gap-x-4 gap-y-1",
						"aria-label": "Triage labels",
						children: m.map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("label", {
							className: "flex items-center gap-1.5",
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									checked: e.checked,
									onChange: (t) => h(e.name, t.target.checked)
								}),
								/* @__PURE__ */ b("code", { children: e.name }),
								e.missing && /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "(not on GitHub)"
								})
							]
						}) }, e.name))
					}),
					i?.labels && m.length === 0 && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [d, " has no labels yet."]
					}),
					/* @__PURE__ */ b(K, {
						text: ".avoozl.json key",
						children: /* @__PURE__ */ b("code", {
							className: "self-start text-[11px] text-muted",
							style: { opacity: .8 },
							children: "untriaged.triageLabels"
						})
					})
				]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-3",
				children: [/* @__PURE__ */ b(Nh, {
					id: `${s}-untriaged-days`,
					label: "Ignore older than, in days",
					raw: "untriaged.ignoreOlderThanDays",
					rule: {
						required: !1,
						blank: "blank: every age"
					},
					placeholder: "any",
					type: "number",
					width: "md",
					value: u.ignoreOlderThanDays,
					onChange: (e) => f({ ignoreOlderThanDays: e })
				}), /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ x("label", {
							className: "flex items-center gap-1.5",
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									checked: u.notify,
									onChange: (e) => f({ notify: e.target.checked })
								}),
								/* @__PURE__ */ b("span", {
									className: "font-medium",
									children: "Notify me when the count goes up"
								}),
								/* @__PURE__ */ b(jh, { rule: { required: !1 } })
							]
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "At most one Kiro Crew notice an hour, with the counts. Off by default."
						}),
						/* @__PURE__ */ b(K, {
							text: ".avoozl.json key",
							children: /* @__PURE__ */ b("code", {
								className: "self-start text-[11px] text-muted",
								style: { opacity: .8 },
								children: "untriaged.notify"
							})
						})
					]
				})]
			})
		]
	});
}
function Bh(e) {
	let { rule: t, id: n } = e, r = (n) => e.onChange({
		...t,
		...n
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 border-t pt-3",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				style: Sh(180),
				children: [
					/* @__PURE__ */ b(Nh, {
						id: `${n}-id`,
						label: "Rule name",
						raw: "id",
						rule: { required: !0 },
						placeholder: "deliver-ready",
						value: t.id,
						onChange: (e) => r({ id: e })
					}),
					/* @__PURE__ */ b(Ph, {
						id: `${n}-action`,
						label: "Action",
						raw: "action",
						rule: { required: !0 },
						value: t.action,
						options: e.actions,
						none: "Choose",
						onChange: (e) => r({ action: e })
					}),
					/* @__PURE__ */ b(Nh, {
						id: `${n}-author`,
						label: "Opened by",
						raw: "author",
						placeholder: "anyone",
						value: t.author,
						onChange: (e) => r({ author: e })
					})
				]
			}),
			/* @__PURE__ */ b(Lh, {
				id: `${n}-match`,
				value: t.match,
				repository: e.repository,
				workspaceId: e.workspaceId,
				onChange: (e) => r({ match: e })
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ x("label", {
					className: "flex items-center gap-1.5 text-sm",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: t.autoPublishChildren,
						onChange: (e) => r({ autoPublishChildren: e.target.checked })
					}), "Publish a clean breakdown's sub-issues without a re-label"]
				}), /* @__PURE__ */ b("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ b(Ci, {
						icon: Ne,
						confirm: {
							title: `Remove the rule ${t.id || "without a name"}?`,
							body: "Labels stop starting its action once you save. Discard changes before saving brings it back.",
							action: "Remove rule"
						},
						onConfirm: e.onRemove,
						children: "Remove rule"
					})
				})]
			})
		]
	});
}
function Vh({ roles: e }) {
	return /* @__PURE__ */ b("ul", {
		className: "mt-1 flex flex-col gap-1 text-sm",
		children: e.map((e) => /* @__PURE__ */ x("li", { children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: e.id
			}),
			" ",
			/* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [
					e.agent,
					" · ",
					e.model ?? "agent default",
					" · distinct by ",
					e.distinctFrom
				]
			}),
			/* @__PURE__ */ b("span", {
				className: "block text-xs text-muted",
				children: e.focus
			})
		] }, e.id))
	});
}
function Hh({ review: e, repository: t }) {
	if (!e) return null;
	let n = e.repositories[t], r = n ?? e.reviewers;
	return /* @__PURE__ */ b(Q, {
		level: "sub",
		title: "Avoozl reviewer chats",
		blurb: "Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json.",
		children: e.error ? /* @__PURE__ */ x("p", {
			className: "text-sm text-danger",
			children: ["The delivery block is invalid: ", e.error]
		}) : r.length === 0 ? /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "No reviewer roles. Checks alone verify a delivery."
		}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x(Fh, { children: [
			n ? "Set for this repository." : "The workspace roles.",
			" Writer model ",
			e.writerModel ?? "not named",
			"."
		] }), /* @__PURE__ */ b(Vh, { roles: r })] })
	});
}
Dh.checks;
function Uh(e) {
	let [t, n] = c(""), r = e.inspect?.checks ?? null, i = Vd(e.value, r), a = /^[\w.-]+\/[\w.-]+$/.test(e.repository), o = () => {
		let r = t.trim();
		r && (e.onChange(Hd(e.value, r, !0)), n(""));
	};
	if (!a || e.inspect && !r) return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		"data-checks": "typed",
		children: [/* @__PURE__ */ x("p", {
			className: "text-xs text-muted",
			"data-checks-why": !0,
			children: [
				a ? `${e.inspect?.checksError ?? e.inspect?.error ?? "GitHub could not be read."} Type the names instead.` : "Name the repository as owner/name under Mode, and Avoozl lists the checks GitHub runs there.",
				" ",
				"Names are exact and case-sensitive, separated by commas."
			]
		}), /* @__PURE__ */ b(Nh, {
			id: `${e.id}-checks`,
			label: "Required checks",
			raw: "requiredChecks",
			rule: {
				required: !1,
				blank: "blank: no check is required"
			},
			placeholder: "build, lint",
			width: "lg",
			value: e.value,
			onChange: e.onChange
		})]
	});
	if (!e.inspect) return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-2",
		"data-checks": "reading",
		children: /* @__PURE__ */ x("p", {
			className: "text-xs text-muted",
			children: [
				"Reading the checks GitHub runs on ",
				e.repository,
				"…"
			]
		})
	});
	let s = r?.url ?? `https://github.com/${e.repository}/settings/rules`;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-checks": "listed",
		children: [
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Seen on ",
					r.branch,
					"'s recent commits and open pull requests. Checks the branch rule requires stay on; Avoozl's list adds to them.",
					" ",
					/* @__PURE__ */ b("a", {
						href: s,
						target: "_blank",
						rel: "noopener noreferrer",
						className: "underline",
						children: "Change the branch rule on GitHub"
					})
				]
			}),
			i.length === 0 ? /* @__PURE__ */ x("p", {
				className: "text-sm text-muted",
				children: [
					"GitHub shows no checks on ",
					r.branch,
					" or its open pull requests yet. Add a name below."
				]
			}) : /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-2",
				"aria-label": "Checks",
				children: i.map((t) => /* @__PURE__ */ x("li", {
					className: "flex flex-col text-sm",
					"data-check-row": t.name,
					children: [/* @__PURE__ */ x("label", {
						className: "flex items-center gap-1.5",
						children: [/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: t.checked,
							disabled: t.branchRule,
							"aria-describedby": `${e.id}-check-${t.name}`,
							onChange: (n) => e.onChange(Hd(e.value, t.name, n.target.checked))
						}), /* @__PURE__ */ b("code", { children: t.name })]
					}), /* @__PURE__ */ b("span", {
						id: `${e.id}-check-${t.name}`,
						className: "pl-5 text-xs text-muted",
						children: t.where
					})]
				}, t.name))
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ b(Nh, {
					id: `${e.id}-check-extra`,
					label: "Add another name",
					placeholder: "a check not run yet",
					width: "md",
					value: t,
					onChange: n
				}), /* @__PURE__ */ b(Ai, {
					tooltip: "Add this exact, case-sensitive check name to the list",
					onClick: o,
					disabled: !t.trim(),
					children: "Add"
				})]
			})
		]
	});
}
function Wh(e) {
	let t = e.inspect?.reviewRule?.url ?? (e.repository ? `https://github.com/${e.repository}/settings/rules` : null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [
			/* @__PURE__ */ b("p", { children: Wd(e.inspect) }),
			t && /* @__PURE__ */ b("a", {
				href: t,
				target: "_blank",
				rel: "noreferrer",
				className: "self-start text-xs underline",
				children: "Change it on GitHub"
			}),
			e.deprecated && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 rounded border p-2 text-xs",
				style: { borderColor: "var(--border)" },
				children: [
					/* @__PURE__ */ b(q, { children: "deprecated" }),
					/* @__PURE__ */ x("span", {
						className: "text-muted",
						children: [
							".avoozl.json still sets ",
							/* @__PURE__ */ b("code", { children: "pullRequestReviews" }),
							e.approvals ? ` (${e.approvals} approvals)` : "",
							". It counts only when GitHub's rule can't be read or names no count."
						]
					}),
					/* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(Ci, {
							confirm: {
								title: "Remove pullRequestReviews from .avoozl.json?",
								body: "Once you save, Avoozl counts only GitHub's own review rule. If GitHub's rule can't be read, no approval count applies.",
								action: "Remove"
							},
							onConfirm: e.onDropDeprecated,
							children: "Remove the old setting"
						})
					})
				]
			})
		]
	});
}
function Gh(e) {
	let { repository: t, choices: n } = e, i = l(), a = o(() => Ud(i), [i]), [s, u] = gi(`settings-repo-tab-${e.index}`, "inner", (e) => `Back to ${Eh.find((t) => t.key === e)?.label ?? e}`, "mode", !1), [d, f] = c(null), h = `avoozl-settings-repo-${e.index}`, g = (n) => e.onChange({
		...t,
		...n
	}), _ = (e, n) => g({ rules: t.rules.map((t, r) => r === e ? n : t) }), y = t.name.trim();
	return r(() => {
		if (f(null), s !== "checks" && s !== "reviews" || !/^[\w.-]+\/[\w.-]+$/.test(y)) return;
		let n = !0;
		return a(e.workspaceId, y, t.baseBranch).then((e) => n && f(e), (e) => n && f({
			repository: y,
			branch: null,
			reviewRule: null,
			checks: null,
			error: J(e)
		})), () => {
			n = !1;
		};
	}, [
		s,
		y,
		t.baseBranch,
		e.workspaceId,
		a
	]), /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-repository-tabs",
				ariaLabel: "Repository settings",
				segments: Eh.map((e) => ({
					key: e.key,
					label: e.label
				})),
				value: s,
				onChange: (e) => u(e),
				wrap: !0
			}),
			s === "mode" && /* @__PURE__ */ x(Q, {
				level: "sub",
				title: "Mode and branch",
				blurb: Dh.mode,
				children: [
					/* @__PURE__ */ x("p", {
						className: "text-xs text-muted",
						children: [
							"Workspace mode: ",
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								style: { color: "var(--text)" },
								children: Kh[Kd(e.mode)]
							}),
							". Change it under Where tasks live."
						]
					}),
					/* @__PURE__ */ x("div", {
						style: Sh(),
						children: [
							/* @__PURE__ */ b(Nh, {
								id: `${h}-name`,
								label: "Repository",
								raw: "key",
								rule: Ld.name,
								placeholder: "owner/name",
								value: t.name,
								onChange: (e) => g({ name: e })
							}),
							/* @__PURE__ */ b(Nh, {
								id: `${h}-base`,
								label: "Default branch",
								raw: "baseBranch",
								rule: Ld.baseBranch,
								placeholder: "main",
								width: "md",
								value: t.baseBranch,
								onChange: (e) => g({ baseBranch: e })
							}),
							/* @__PURE__ */ b(Nh, {
								id: `${h}-concurrency`,
								label: "Tasks at once",
								raw: "concurrency",
								rule: Ld.concurrency,
								placeholder: "1",
								type: "number",
								width: "sm",
								value: t.concurrency,
								onChange: (e) => g({ concurrency: e })
							})
						]
					}),
					/* @__PURE__ */ b(Mh, {
						id: `${h}-coder-worker`,
						label: "Who codes",
						raw: "coder",
						rule: Ld.coder,
						children: /* @__PURE__ */ b(Ef, {
							id: `${h}-coder`,
							mode: e.mode,
							value: t.coder,
							onChange: (e) => g({ coder: e })
						})
					})
				]
			}),
			s === "triggers" && /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-5",
				children: [
					/* @__PURE__ */ x(Q, {
						level: "sub",
						title: "Label rules",
						blurb: Dh.triggers,
						children: [
							t.rules.length === 0 && /* @__PURE__ */ b("p", {
								className: "text-sm text-muted",
								children: "No rules yet, so labels start nothing. Add one to let a label start work."
							}),
							t.rules.map((r, i) => /* @__PURE__ */ b(Bh, {
								id: `${h}-rule-${i}`,
								rule: r,
								actions: n.actions,
								repository: y,
								workspaceId: e.workspaceId,
								onChange: (e) => _(i, e),
								onRemove: () => g({ rules: t.rules.filter((e, t) => t !== i) })
							}, i)),
							/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
								onClick: () => g({ rules: [...t.rules, kd()] }),
								children: "Add rule"
							}) })
						]
					}),
					/* @__PURE__ */ b(Q, {
						level: "sub",
						title: "Managed labels",
						blurb: "Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict.",
						children: /* @__PURE__ */ b("div", {
							style: Sh(200),
							children: n.managedLabels.map((e) => /* @__PURE__ */ b(Nh, {
								id: `${h}-label-${e}`,
								label: Rd[e] ?? e,
								raw: `managedLabels.${e}`,
								rule: Ld[e],
								value: t.managedLabels[e] ?? "",
								onChange: (n) => g({ managedLabels: {
									...t.managedLabels,
									[e]: n
								} })
							}, e))
						})
					}),
					/* @__PURE__ */ b(zh, {
						id: h,
						value: t.untriaged,
						repository: y,
						workspaceId: e.workspaceId,
						onChange: (e) => g({ untriaged: e })
					}),
					/* @__PURE__ */ b(Q, {
						level: "sub",
						title: "Issue Radar labels",
						blurb: "Labels Issue Radar puts on issues it claims. Avoozl only reads them.",
						children: /* @__PURE__ */ b("div", {
							style: Sh(200),
							children: n.crewLabels.map((e) => /* @__PURE__ */ b(Nh, {
								id: `${h}-crew-${e}`,
								label: kh[e] ?? e,
								raw: `crewLabels.${e}`,
								rule: {
									required: !1,
									blank: "blank: Issue Radar's default"
								},
								value: t.crewLabels[e] ?? "",
								onChange: (n) => g({ crewLabels: {
									...t.crewLabels,
									[e]: n
								} })
							}, e))
						})
					}),
					/* @__PURE__ */ b(Q, {
						level: "sub",
						title: "Who counts",
						blurb: "GitHub still decides who has access. This sets how much GitHub permission a person needs for a label, a board drag or a close to count.",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-end gap-3",
							children: [/* @__PURE__ */ b(Ph, {
								id: `${h}-permission`,
								label: "Minimum permission",
								raw: "minimumPermission",
								rule: Ld.minimumPermission,
								value: t.minimumPermission,
								options: n.permissions,
								none: t.allowedActors.trim() ? "None" : "Default: write",
								width: "md",
								onChange: (e) => g({ minimumPermission: e })
							}), /* @__PURE__ */ b(Nh, {
								id: `${h}-actors`,
								label: "Or only these people",
								raw: "allowedActors",
								rule: Ld.allowedActors,
								placeholder: "login, login",
								width: "md",
								value: t.allowedActors,
								onChange: (e) => g({ allowedActors: e })
							})]
						})
					}),
					/* @__PURE__ */ b(Q, {
						level: "sub",
						title: "Priority",
						blurb: "Ready tasks carrying a higher label here start first.",
						children: /* @__PURE__ */ b(Nh, {
							id: `${h}-priority`,
							label: "Priority labels, highest first",
							raw: "priority",
							rule: {
								required: !1,
								blank: "blank: graph order only"
							},
							placeholder: "p0, p1, p2",
							width: "lg",
							value: t.priority,
							onChange: (e) => g({ priority: e })
						})
					})
				]
			}),
			s === "checks" && /* @__PURE__ */ b(Q, {
				level: "sub",
				title: "Required checks",
				blurb: Dh.checks,
				children: /* @__PURE__ */ b(Uh, {
					id: h,
					value: t.requiredChecks,
					inspect: d,
					repository: y,
					onChange: (e) => g({ requiredChecks: e })
				})
			}),
			s === "reviews" && /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-5",
				children: [/* @__PURE__ */ b(Q, {
					level: "sub",
					title: "Pull-request reviews",
					blurb: Dh.reviews,
					children: /* @__PURE__ */ b(Wh, {
						inspect: d,
						repository: y,
						deprecated: t.pullRequestReviews,
						approvals: t.reviewApprovals,
						onDropDeprecated: () => g({
							pullRequestReviews: !1,
							reviewApprovals: ""
						})
					})
				}), /* @__PURE__ */ b(Hh, {
					review: e.review,
					repository: y
				})]
			})
		]
	}) });
}
var Kh = {
	local: "Local only",
	"plans-repo": "Plans repository",
	"single-repo": "Single repository"
};
function qh({ crews: e }) {
	return e.length ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Q, {
		title: "Issue Radar crews",
		blurb: "Scope each crew to its repository's ready label in Issue Radar, so it codes only what Avoozl marks ready.",
		children: /* @__PURE__ */ b("ul", {
			className: "flex flex-col gap-1 text-sm",
			children: e.map((e) => /* @__PURE__ */ x("li", { children: [
				e.repository,
				": scope its crew to",
				" ",
				e.label ? /* @__PURE__ */ b("code", { children: e.label }) : /* @__PURE__ */ b("span", {
					className: "text-danger",
					children: "no ready label yet; name one in Repositories"
				}),
				" ",
				"in",
				" ",
				/* @__PURE__ */ b("a", {
					href: e.link,
					target: "_top",
					className: "underline",
					children: "Issue Radar"
				}),
				"."
			] }, e.repository))
		})
	}) }) : null;
}
function Jh(e) {
	let { form: n, choices: r, set: i } = e, a = l(), u = o(() => Pt(a), [a]), d = Hs(), f = t((e) => u.repositories(e), [u]), { value: p, reload: h } = ya(e.workspaceId, f), g = Ls(p ?? [], n.repositories), [_, v] = c(null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = g.find((e) => e.key === _) ?? null, A = s(null), j = async (t) => {
		if (!t.checkout) i({ repositories: n.repositories.filter((e, n) => n !== t.policy) }), v(null), O({
			ok: !0,
			text: `${t.name}'s GitHub settings leave .avoozl.json when you save.`
		});
		else {
			E(!0), O(null);
			try {
				await u.removeRepository(e.workspaceId, t.checkout.id), await Promise.all([h(), e.onRegistryChanged()]), v(null), O({
					ok: !0,
					text: `Removed ${t.name}. The folder and GitHub were not touched.`
				});
			} catch (e) {
				O({
					ok: !1,
					text: J(e)
				});
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(m, { children: /* @__PURE__ */ x(Q, {
				title: `Added repositories (${g.length})`,
				blurb: Vs,
				children: [
					p === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Loading…"
					}) : /* @__PURE__ */ b(Ws, {
						rows: g,
						mode: n.mode,
						busy: T,
						dirty: e.dirty,
						onEdit: (e) => {
							S(n), w(null), v(e);
						},
						onRemove: (e) => void j(e),
						onReveal: (e) => void d(e).then((e) => O({
							ok: !0,
							text: e
						})),
						onAdd: () => A.current?.querySelector("input")?.focus()
					}),
					D && /* @__PURE__ */ b("p", {
						role: D.ok ? "status" : "alert",
						className: `mt-2 text-sm ${D.ok ? "text-muted" : "text-danger"}`,
						children: D.text
					}),
					g.length > 0 && /* @__PURE__ */ b("p", {
						className: "mt-2 text-xs text-muted",
						children: "Use Edit to change a repository's settings."
					})
				]
			}) }),
			k && y && /* @__PURE__ */ b(Gs, {
				name: k.name,
				edited: JSON.stringify(Pd(n)) !== JSON.stringify(Pd(y)),
				missing: zd(n),
				saving: e.saving,
				error: C,
				onDiscard: () => {
					e.replace(y), v(null), S(null);
				},
				onSave: async () => {
					w(null);
					let t = zd(n);
					if (t) return w(`Not saved. ${t}`);
					let r = await e.onSave();
					if (r) return w(r);
					v(null), S(null), O({
						ok: !0,
						text: `Saved ${k.name}'s settings to .avoozl.json.`
					});
				},
				children: /* @__PURE__ */ b("div", {
					className: "flex flex-col gap-3.5",
					"data-repository-dialog-body": !0,
					children: k && !qd(n.mode) ? /* @__PURE__ */ b(Yh, {
						row: k,
						review: e.review,
						kept: k.policy >= 0
					}) : k && k.policy >= 0 ? /* @__PURE__ */ b(Gh, {
						index: k.policy,
						repository: n.repositories[k.policy],
						choices: r,
						review: e.review,
						mode: n.mode,
						workspaceId: e.workspaceId,
						onChange: (e) => i({ repositories: n.repositories.map((t, n) => n === k.policy ? e : t) })
					}, k.key) : k && k.github ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Q, {
						title: `${k.name} settings`,
						blurb: `${k.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`,
						children: /* @__PURE__ */ x(Y, {
							icon: Ee,
							tooltip: "Add an entry you can change; saved when you press Save",
							onClick: () => {
								i({ repositories: [...n.repositories, {
									...Ad(k.github),
									baseBranch: k.branch
								}] });
							},
							children: ["Add GitHub settings for ", k.github]
						})
					}) }) : k ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Q, {
						title: `${k.name} settings`,
						blurb: "A local-only repository: no GitHub remote, so the GitHub tabs do not apply.",
						children: /* @__PURE__ */ b("p", {
							className: "text-sm",
							"data-local-checks": !0,
							children: "Required checks apply only to GitHub pull requests. Here Avoozl runs each task's own checks from the plan manifest, or this repository's checks when a task names none."
						})
					}) }) : null
				})
			}),
			/* @__PURE__ */ b(ip, {
				workspaceId: e.workspaceId,
				disabled: e.dirty ? "Save or discard your settings changes first: onboarding writes .avoozl.json." : null,
				onChanged: () => Promise.all([h(), e.onRegistryChanged()]),
				onOpenPlans: e.onOpenPlans
			}),
			/* @__PURE__ */ b(m, { children: /* @__PURE__ */ b("div", {
				ref: A,
				children: /* @__PURE__ */ b(Js, {
					workspaceId: e.workspaceId,
					mode: n.mode,
					disabled: e.dirty ? "Save or discard your settings changes first: adding a repository writes .avoozl.json." : null,
					onAdded: (t) => {
						Promise.all([h(), e.onRegistryChanged()]), v(`checkout:${t}`), O({
							ok: !0,
							text: `Added ${t}.`
						});
					}
				})
			}) })
		]
	});
}
function Yh(e) {
	let { row: t } = e;
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ x(Q, {
		title: `${t.name} settings`,
		blurb: "Local only: Avoozl codes, checks and merges here on this Mac.",
		children: [
			/* @__PURE__ */ x("dl", {
				className: "grid gap-x-3 gap-y-1 text-sm",
				style: { gridTemplateColumns: "max-content 1fr" },
				"data-local-repository": !0,
				children: [
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Folder"
					}),
					/* @__PURE__ */ b("dd", {
						style: { overflowWrap: "anywhere" },
						children: t.folder ?? "not on this Mac"
					}),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Landing branch"
					}),
					/* @__PURE__ */ b("dd", { children: /* @__PURE__ */ b("code", { children: t.branch }) }),
					/* @__PURE__ */ b("dt", {
						className: "text-muted",
						children: "Who codes"
					}),
					/* @__PURE__ */ b("dd", { children: "Avoozl worker chats" })
				]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm",
				"data-local-checks": !0,
				children: "Avoozl runs each task's own checks from the plan manifest, or this repository's checks when a task names none."
			}),
			e.kept && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Its GitHub settings are kept, not used. They apply again if you pick a GitHub mode."
			})
		]
	}), /* @__PURE__ */ b(Hh, {
		review: e.review,
		repository: t.github ?? t.name
	})] });
}
function Xh(e) {
	let { form: t, choices: n, set: r } = e, i = Jd(t.mode), a = Xd(t);
	return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(xf, {
		value: Kd(t.mode),
		onChange: (e) => r({ mode: e }),
		idPrefix: "avoozl-settings-mode",
		note: qd(t.mode) ? null : /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-1.5 text-sm",
			"data-local-note": !0,
			children: [
				/* @__PURE__ */ b("p", { children: Yd }),
				/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Folders, landing branches and checks are under Repositories. Worker and reviewer chats come from delivery in .avoozl.json."
				}),
				a.length > 0 && /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					"data-kept": !0,
					children: [
						"Kept, not used: ",
						a.join(", "),
						". Pick a GitHub mode to use them again."
					]
				})
			]
		}),
		children: qd(t.mode) ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ x("div", {
					style: Sh(),
					children: [
						i.has("planningRepository") && /* @__PURE__ */ b(Nh, {
							id: "avoozl-settings-planning",
							label: "Planning repository",
							raw: "planningRepository",
							rule: {
								required: !0,
								when: "in plans-repo mode"
							},
							placeholder: "owner/plans",
							value: t.planningRepository,
							onChange: (e) => r({ planningRepository: e })
						}),
						/* @__PURE__ */ b(Ph, {
							id: "avoozl-settings-authority",
							label: "New tasks belong to",
							raw: "defaultAuthority",
							rule: {
								required: !1,
								blank: t.mode ? "blank: github" : "blank: local"
							},
							value: t.defaultAuthority,
							options: n.authorities,
							none: `Default: ${t.mode ? "github" : "local"}`,
							width: "md",
							onChange: (e) => r({ defaultAuthority: e })
						}),
						/* @__PURE__ */ b(Nh, {
							id: "avoozl-settings-epic",
							label: "Epic issue type",
							raw: "epicIssueType",
							rule: {
								required: !1,
								blank: "blank: epics get no issue type"
							},
							placeholder: "Epic",
							width: "md",
							value: t.epicIssueType,
							onChange: (e) => r({ epicIssueType: e })
						})
					]
				}),
				/* @__PURE__ */ b(Zh, {
					form: t,
					choices: n,
					set: r
				}),
				/* @__PURE__ */ b(Q, {
					level: "sub",
					title: "Set up GitHub",
					blurb: "Creates the labels, Project and fields the settings above name. It reads GitHub first and shows every write before making one.",
					children: e.setup
				}),
				e.crews
			]
		}) : null
	}) });
}
function Zh({ form: e, choices: t, set: n }) {
	return /* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(Q, {
		level: "sub",
		title: "Project fields",
		blurb: "The GitHub Project board Avoozl adds managed issues to and fills with Release, Wave and Avoozl state. People move Status; Avoozl never writes it. Leave every field blank to turn Project sync off.",
		children: [
			/* @__PURE__ */ x("div", {
				style: Sh(180),
				children: [/* @__PURE__ */ b(Nh, {
					id: "avoozl-settings-project-owner",
					label: "Owner",
					raw: "project.owner",
					rule: Fd.owner,
					placeholder: "org or user",
					width: "md",
					value: e.projectOwner,
					onChange: (e) => n({ projectOwner: e })
				}), /* @__PURE__ */ b(Nh, {
					id: "avoozl-settings-project-number",
					label: "Number",
					raw: "project.number",
					rule: Fd.number,
					placeholder: "2",
					type: "number",
					width: "md",
					value: e.projectNumber,
					onChange: (e) => n({ projectNumber: e })
				})]
			}),
			/* @__PURE__ */ b("h5", {
				className: "mt-1 text-xs font-semibold uppercase tracking-wide text-muted",
				children: "Field names"
			}),
			/* @__PURE__ */ b("div", {
				style: Sh(180),
				children: t.fields.map((t) => /* @__PURE__ */ b(Nh, {
					id: `avoozl-settings-field-${t}`,
					label: Oh[t] ?? t,
					raw: `project.fields.${t}`,
					rule: Fd[t],
					placeholder: Id[t] || "none",
					value: e.fields[t] ?? "",
					onChange: (r) => n({ fields: {
						...e.fields,
						[t]: r
					} })
				}, t))
			}),
			/* @__PURE__ */ b("h5", {
				className: "mt-1 text-xs font-semibold uppercase tracking-wide text-muted",
				children: "Status options"
			}),
			/* @__PURE__ */ b("div", {
				style: Sh(180),
				children: t.statusValues.map((t) => /* @__PURE__ */ b(Nh, {
					id: `avoozl-settings-status-${t}`,
					label: Ah[t] ?? t,
					raw: `project.statusValues.${t}`,
					rule: Fd[t],
					placeholder: Id[t],
					value: e.statusValues[t] ?? "",
					onChange: (r) => n({ statusValues: {
						...e.statusValues,
						[t]: r
					} })
				}, t))
			})
		]
	}) });
}
function Qh(e) {
	return {
		mode: e.mode,
		planningRepository: e.planningRepository,
		repositories: e.repositories.map((e) => e.name.trim()).filter(Boolean).join(", "),
		projectOwner: e.projectOwner,
		projectNumber: e.projectNumber
	};
}
function $h(e) {
	let { workspaceId: n, tab: i } = e, a = l(), s = o(() => ud(a), [a]), { value: u, error: d, busy: f, reload: p } = ya(n, t((e) => s.get(e), [s])), [m, h] = c(null), [g, _] = c(null), [v, y] = c(!1);
	r(() => {
		h(u ? jd(u.github) : null), _(null);
	}, [u]);
	let S = (e) => m && h({
		...m,
		...e
	}), C = async () => {
		if (m) try {
			let e = await s.validate(n, Pd(m));
			_(e.valid ? {
				ok: !0,
				text: "Settings are valid."
			} : {
				ok: !1,
				text: e.error || "Invalid."
			});
		} catch (e) {
			_({
				ok: !1,
				text: J(e)
			});
		}
	}, w = async () => {
		if (!m || !u) return "Settings are not loaded.";
		let e = zd(m);
		if (e) return _({
			ok: !1,
			text: `Not saved. ${e}`
		}), `Not saved. ${e}`;
		y(!0);
		try {
			return await s.save(n, Pd(m), u.hash), await p(), _({
				ok: !0,
				text: "Saved to .avoozl.json."
			}), null;
		} catch (e) {
			return _({
				ok: !1,
				text: J(e)
			}), J(e);
		} finally {
			y(!1);
		}
	}, T = u?.choices;
	if (d) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: d
	});
	if (!u || !m || !T) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: f ? "Loading…" : "Not loaded"
	});
	let E = JSON.stringify(Pd(m)) !== JSON.stringify(Pd(jd(u.github))), D = zd(m);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			i === "github" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-blurb": "github",
				children: qd(m.mode) ? Th.github : "The mode for this workspace. Save only writes .avoozl.json."
			}),
			u.error && /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ["The saved settings are invalid: ", u.error]
			}),
			i === "repositories" ? /* @__PURE__ */ b(Jh, {
				form: m,
				choices: T,
				review: u.review,
				workspaceId: n,
				dirty: E,
				set: S,
				replace: h,
				onSave: w,
				saving: v,
				onRegistryChanged: p,
				onOpenPlans: e.onOpenPlans
			}) : /* @__PURE__ */ b(Xh, {
				form: m,
				choices: T,
				set: S,
				setup: /* @__PURE__ */ b(Af, {
					workspaceId: n,
					client: s,
					settings: u,
					shared: Qh(m),
					onSaved: p
				}),
				crews: Jd(m.mode).has("issueRadarCrews") ? /* @__PURE__ */ b(qh, { crews: u.crews ?? [] }) : null
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(Ai, {
						tooltip: "Check these settings without saving them",
						onClick: () => void C(),
						disabled: v,
						children: "Check"
					}),
					/* @__PURE__ */ b(Ai, {
						primary: !0,
						onClick: () => void w(),
						disabled: v || !E || !!D,
						tooltip: D,
						children: "Save"
					}),
					E ? /* @__PURE__ */ b(Ci, {
						disabled: f || v,
						confirm: {
							title: "Discard your unsaved changes?",
							body: "Every edit since the last save on these Settings tabs is lost. .avoozl.json stays as it is.",
							action: "Discard changes"
						},
						onConfirm: () => void p(),
						children: "Discard changes"
					}) : /* @__PURE__ */ b(Ai, {
						tooltip: "Read the settings from disk again",
						onClick: () => void p(),
						disabled: f || v,
						children: "Reload"
					}),
					E && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Unsaved changes"
					}),
					E && D && /* @__PURE__ */ b("span", {
						className: "text-xs",
						style: { color: "var(--danger)" },
						role: "alert",
						children: D
					})
				]
			}),
			g && /* @__PURE__ */ b("p", {
				role: g.ok ? "status" : "alert",
				className: `text-sm ${g.ok ? "text-muted" : "text-danger"}`,
				children: g.text
			})
		]
	});
}
function eg(e) {
	let { workspaceId: t } = e, [n, r] = c(rf), i = e.tab ?? n, a = wh.some((e) => e.key === i) ? i : rf, o = (t) => e.onTab ? e.onTab(t) : r(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-settings-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Mi, {
				id: "avoozl-settings-title",
				view: "settings",
				children: "Settings"
			}),
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-settings-tabs",
				ariaLabel: "Settings sections",
				segments: wh.map((e) => ({
					key: e.key,
					label: e.label
				})),
				value: a,
				onChange: (e) => o(e),
				wrap: !0
			}),
			a !== "github" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-blurb": a,
				children: Th[a]
			}),
			a === "workspaces" ? /* @__PURE__ */ b(Pf, {
				selected: t,
				onSelect: e.onSelectWorkspace,
				onListChange: e.onListChange
			}) : t ? a === "plugins" ? /* @__PURE__ */ b(rm, { workspaceId: t }) : a === "content" ? /* @__PURE__ */ b(oh, { workspaceId: t }) : a === "flow" ? /* @__PURE__ */ b(hh, { workspaceId: t }) : a === "delivery" ? /* @__PURE__ */ b(bh, {
				workspaceId: t,
				onOpenRouting: e.onOpenRouting
			}) : /* @__PURE__ */ b($h, {
				workspaceId: t,
				tab: a,
				onOpenPlans: e.onOpenPlans
			}) : /* @__PURE__ */ b(h, {
				title: "Pick a workspace",
				subtitle: "Choose one in the header, or add one under Workspaces.",
				action: /* @__PURE__ */ b(p, {
					onClick: () => o("workspaces"),
					children: "Open Workspaces"
				})
			})
		]
	});
}
// kirocrew-app/ui/src/RoutingView.tsx
var tg = { required: !1 }, ng = { required: !0 }, rg = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, ig = {
	padding: "6px 8px",
	textAlign: "left",
	verticalAlign: "top"
}, ag = { color: "var(--warning, #b45309)" };
function og({ name: e }) {
	return /* @__PURE__ */ b("code", {
		className: "text-[11px] text-muted",
		style: {
			overflowWrap: "anywhere",
			opacity: .8
		},
		children: e
	});
}
function $(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? {
			maxWidth: e.width,
			width: "100%"
		} : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(jh, { rule: e.required ? ng : tg })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			e.raw && /* @__PURE__ */ b(og, { name: e.raw })
		]
	});
}
function sg(e) {
	return e.options.length ? /* @__PURE__ */ b("div", {
		className: "flex flex-wrap gap-x-3 gap-y-1",
		role: "group",
		"aria-labelledby": e.id,
		children: e.options.map((t) => /* @__PURE__ */ x("label", {
			className: "flex items-center gap-1.5 text-sm",
			children: [/* @__PURE__ */ b("input", {
				type: "checkbox",
				checked: e.value.includes(t),
				onChange: (n) => e.onChange(n.target.checked ? [...e.value, t] : e.value.filter((e) => e !== t))
			}), t]
		}, t))
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: e.empty
	});
}
function cg() {
	let e = l(), [t, n] = c([]);
	return r(() => {
		let t = !0;
		return e.get("/api/models").then((e) => t && n(xc(e)), () => t && n([])), () => {
			t = !1;
		};
	}, [e]), t;
}
function lg(e) {
	let [t, n] = c(Xn(e.crew)), [r, i] = c(null), a = (e) => n({
		...t,
		...e
	}), o = e.crew.id === "local";
	return /* @__PURE__ */ b(Bs, {
		id: "avoozl-crew-dialog",
		title: `Crew ${e.crew.name}`,
		onDismiss: e.onCancel,
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: () => void e.onSave(t).then(i),
					children: "Save"
				}),
				/* @__PURE__ */ b(p, {
					type: "button",
					onClick: e.onCancel,
					children: "Cancel"
				}),
				r && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "text-sm text-danger",
					children: r
				}),
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: "Saved on this machine only."
				})
			]
		}),
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-3",
			children: [
				/* @__PURE__ */ b($, {
					id: "avoozl-crew-trust",
					label: "Trust",
					raw: `crews.${e.crew.id}.tags trust:`,
					required: !0,
					width: "16rem",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-crew-trust",
						value: o ? "local" : t.trust,
						disabled: o,
						onChange: (e) => a({ trust: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: rg,
						children: [/* @__PURE__ */ b("option", {
							value: "remote",
							children: "remote"
						}), /* @__PURE__ */ b("option", {
							value: "local",
							children: "local"
						})]
					})
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-crew-tags",
					label: "Tags",
					raw: `crews.${e.crew.id}.tags`,
					note: "key:value, keys os, arch, tools. Example: os:linux arch:x64 tools:docker.",
					width: "32rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-crew-tags",
						value: t.tags,
						placeholder: "none",
						onChange: (e) => a({ tags: e.target.value })
					})
				}),
				!o && /* @__PURE__ */ b($, {
					id: "avoozl-crew-hosts",
					label: "Git hosts",
					raw: `crews.${e.crew.id}.gitHosts`,
					note: "Hosts this crew can fetch from. Without one, nothing goes there.",
					width: "32rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-crew-hosts",
						value: t.gitHosts,
						placeholder: "none",
						onChange: (e) => a({ gitHosts: e.target.value })
					})
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-crew-limit",
					label: "Chat limit",
					raw: `crews.${e.crew.id}.chatLimit`,
					note: "Avoozl chats at once on this crew.",
					width: "10rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-crew-limit",
						inputMode: "numeric",
						value: t.chatLimit,
						placeholder: Yn(e.crew),
						onChange: (e) => a({ chatLimit: e.target.value })
					})
				}),
				!o && /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ b($, {
						id: "avoozl-crew-delivery",
						label: "Work comes back by",
						raw: `crews.${e.crew.id}.delivery`,
						width: "20rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-crew-delivery",
							value: t.delivery,
							onChange: (e) => a({ delivery: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: rg,
							children: [
								/* @__PURE__ */ b("option", {
									value: "",
									children: "Hand-back over SSH (default)"
								}),
								/* @__PURE__ */ b("option", {
									value: "handback",
									children: "Hand-back over SSH"
								}),
								/* @__PURE__ */ b("option", {
									value: "push",
									children: "The worker pushes its branch"
								})
							]
						})
					}),
					/* @__PURE__ */ b($, {
						id: "avoozl-crew-ssh",
						label: "SSH host",
						raw: `crews.${e.crew.id}.sshHost`,
						note: "Needed for hand-back. The host key is pinned on first fetch.",
						width: "24rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-crew-ssh",
							value: t.sshHost,
							placeholder: "user@host",
							onChange: (e) => a({ sshHost: e.target.value })
						})
					}),
					/* @__PURE__ */ b($, {
						id: "avoozl-crew-root",
						label: "Worktree folder",
						raw: `crews.${e.crew.id}.worktreeRoot`,
						note: "An absolute folder on that crew. Needed for hand-back.",
						width: "32rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-crew-root",
							value: t.worktreeRoot,
							placeholder: "/srv/avoozl-work",
							onChange: (e) => a({ worktreeRoot: e.target.value })
						})
					})
				] })
			]
		})
	});
}
function ug(e) {
	let t = l(), n = o(() => cr(t), [t]), [i, a] = c(null), [s, u] = c(e.view.staleSeconds === null ? "" : String(e.view.staleSeconds)), [d, f] = c(null);
	r(() => u(e.view.staleSeconds === null ? "" : String(e.view.staleSeconds)), [e.view.staleSeconds]);
	let m = async (t) => {
		await n.saveCrews(e.workspaceId, {
			crews: t,
			expectedHash: e.view.machineHash
		}), await e.onSaved();
	}, h = async () => {
		f(null);
		let t = s.trim() ? Number(s) : null;
		if (t !== null && (!Number.isInteger(t) || t < 10 || t > 3600)) return f("Stale after is a whole number of seconds, 10–3600.");
		try {
			await n.saveCrews(e.workspaceId, {
				staleSeconds: t,
				expectedHash: e.view.machineHash
			}), await e.onSaved(), f("Saved.");
		} catch (e) {
			f(J(e));
		}
	};
	return /* @__PURE__ */ x(Q, {
		title: "Crews",
		blurb: "Machines that can run Avoozl chats. Tags and limits stay on this machine.",
		children: [
			/* @__PURE__ */ b("div", {
				style: { overflowX: "auto" },
				children: /* @__PURE__ */ x("table", {
					className: "text-sm",
					style: {
						borderCollapse: "collapse",
						width: "100%"
					},
					"data-crews": !0,
					children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ b("tr", {
						className: "text-xs text-muted",
						children: [
							"Crew",
							"Tags",
							"Trust",
							"Chats",
							"Load",
							"Memory",
							"Disk",
							"Health",
							""
						].map((e) => /* @__PURE__ */ b("th", {
							style: ig,
							children: e
						}, e))
					}) }), /* @__PURE__ */ b("tbody", { children: e.view.crews.map((t) => {
						let n = Jn(t), r = t.trust !== "local" && (!e.view.mc10 || !e.view.remoteDispatch);
						return /* @__PURE__ */ x("tr", {
							style: { borderTop: "1px solid var(--border)" },
							"data-crew": t.id,
							children: [
								/* @__PURE__ */ x("td", {
									style: {
										...ig,
										minWidth: "9rem"
									},
									children: [
										/* @__PURE__ */ b("span", {
											className: "font-medium",
											children: t.name
										}),
										t.name !== t.id && /* @__PURE__ */ b("span", {
											className: "block text-xs text-muted",
											children: t.id
										}),
										r && /* @__PURE__ */ b("span", {
											className: "block text-xs text-muted",
											children: e.view.remoteDispatch ? "Waits on Kiro Crew." : "Kiro Crew's remote dispatch is off."
										})
									]
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									children: t.tags.filter((e) => !e.startsWith("trust:")).join(" ") || /* @__PURE__ */ b("span", {
										className: "text-muted",
										children: "none"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									children: t.trust
								}),
								/* @__PURE__ */ x("td", {
									style: ig,
									children: [
										t.running,
										"/",
										t.chatLimit
									]
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									children: n.load
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									children: n.mem
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									children: n.disk
								}),
								/* @__PURE__ */ b("td", {
									style: ig,
									className: "text-muted",
									children: n.health
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...ig,
										textAlign: "right",
										whiteSpace: "nowrap"
									},
									children: /* @__PURE__ */ x("span", {
										className: "inline-flex gap-1.5",
										children: [/* @__PURE__ */ b(X, {
											icon: we,
											label: `Edit ${t.name}`,
											tooltip: "Edit tags, limit, and hand-back",
											onClick: () => a(t)
										}), t.configured && /* @__PURE__ */ b(Ci, {
											icon: Ne,
											label: `Remove settings for ${t.name}`,
											tooltip: "Clear this machine's settings for the crew",
											confirm: {
												title: `Remove settings for ${t.name}?`,
												body: "Clears its tags, limits, and hand-back on this machine. The crew stays connected to Kiro Crew.",
												action: "Remove"
											},
											onConfirm: () => {
												let n = $n(e.view.crews);
												delete n[t.id], m(n);
											},
											children: ""
										})]
									})
								})
							]
						}, t.id);
					}) })]
				})
			}),
			e.view.crews.length === 1 && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Only this machine. Connect another Kiro Crew instance to see it here."
			}),
			!e.view.mc10 && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-mc10": !0,
				children: "Remote placement waits on Kiro Crew (MC-10). Every chat runs on local."
			}),
			/* @__PURE__ */ b($, {
				id: "avoozl-stale",
				label: "Stale after (seconds)",
				raw: "crewStaleSeconds",
				note: "A crew whose reading is older is not used.",
				width: "22rem",
				children: /* @__PURE__ */ x("span", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ b("span", {
							style: { width: "8rem" },
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-stale",
								inputMode: "numeric",
								value: s,
								placeholder: "120",
								onChange: (e) => u(e.target.value)
							})
						}),
						/* @__PURE__ */ b(p, {
							type: "button",
							onClick: () => void h(),
							children: "Save"
						}),
						d && /* @__PURE__ */ b("span", {
							className: "text-sm text-muted",
							children: d
						})
					]
				})
			}),
			i && /* @__PURE__ */ b(lg, {
				crew: i,
				onCancel: () => a(null),
				onSave: async (t) => {
					let n = Qn(i.id, t);
					if (n.error) return n.error;
					try {
						return await m({
							...$n(e.view.crews),
							[i.id]: n.entry
						}), a(null), null;
					} catch (e) {
						return J(e);
					}
				}
			})
		]
	});
}
function dg(e) {
	let [t, n] = c(e.form), [r, i] = c(null), a = (e) => n({
		...t,
		...e
	}), o = [...new Set(e.view.crews.flatMap((e) => e.tags))].sort(), s = Object.keys(e.view.repositories), l = e.view.crews.filter((e) => e.id !== "local").map((e) => e.id), u = qn({
		id: t.id,
		route: t.route || void 0
	}), d = (t, n, r) => /* @__PURE__ */ b("select", {
		id: t,
		value: n || "auto",
		onChange: (e) => r(e.target.value === "auto" ? "" : e.target.value),
		className: "rounded border px-2 py-1 text-sm",
		style: rg,
		children: Sc(e.models, n).map((e) => /* @__PURE__ */ b("option", {
			value: e.value,
			children: e.value === "auto" ? "default (the role setting, else auto)" : e.label
		}, e.value))
	});
	return /* @__PURE__ */ b(Bs, {
		id: "avoozl-rule-dialog",
		title: e.isNew ? "Add rule" : `Rule ${e.form.id}`,
		onDismiss: e.onCancel,
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: () => void e.onSave(t).then(i),
					children: "Save"
				}),
				/* @__PURE__ */ b(p, {
					type: "button",
					onClick: e.onCancel,
					children: "Cancel"
				}),
				r && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "text-sm text-danger",
					children: r
				}),
				!e.isNew && /* @__PURE__ */ b("span", {
					style: { marginLeft: "auto" },
					children: /* @__PURE__ */ b(Ci, {
						icon: Ne,
						confirm: {
							title: `Delete rule ${e.form.id}?`,
							body: "Tasks it matched follow the remaining rules from the next tick.",
							action: "Delete"
						},
						onConfirm: e.onDelete,
						children: "Delete"
					})
				})
			]
		}),
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-3",
			"data-rule-form": !0,
			children: [
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b($, {
						id: "avoozl-rule-id",
						label: "Name",
						raw: "id",
						required: !0,
						width: "16rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-rule-id",
							value: t.id,
							disabled: !e.isNew,
							onChange: (e) => a({ id: e.target.value })
						})
					}), /* @__PURE__ */ b($, {
						id: "avoozl-rule-save",
						label: "Save in",
						required: !0,
						width: "18rem",
						note: t.saveIn === "machine" ? "Kept on this machine; may name a crew." : "In .avoozl.json; tags and local only.",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-rule-save",
							value: t.saveIn,
							disabled: !e.isNew,
							onChange: (e) => a({ saveIn: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: rg,
							children: [
								/* @__PURE__ */ b("option", {
									value: "workspace",
									children: "This workspace"
								}),
								s.map((e) => /* @__PURE__ */ x("option", {
									value: `repository:${e}`,
									children: ["Repository ", e]
								}, e)),
								/* @__PURE__ */ b("option", {
									value: "machine",
									children: "This machine"
								})
							]
						})
					})]
				}),
				/* @__PURE__ */ b("hr", { style: {
					borderColor: "var(--border)",
					margin: "4px 0"
				} }),
				/* @__PURE__ */ b("span", {
					className: "text-sm font-semibold",
					children: "When"
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-rule-labels",
					label: "Labels",
					raw: "when.labels",
					note: "Any of these. Blank matches every task.",
					children: /* @__PURE__ */ b(sg, {
						id: "avoozl-rule-labels",
						options: e.view.labels,
						value: t.labels,
						onChange: (e) => a({ labels: e }),
						empty: "No task has a label yet."
					})
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-rule-roles",
					label: "Roles",
					raw: "when.roles",
					children: /* @__PURE__ */ b(sg, {
						id: "avoozl-rule-roles",
						options: [...Rn],
						value: t.roles,
						onChange: (e) => a({ roles: e }),
						empty: ""
					})
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [
						/* @__PURE__ */ b($, {
							id: "avoozl-rule-kinds",
							label: "Kinds",
							raw: "when.kinds",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-rule-kinds",
								value: t.kinds,
								placeholder: "any, e.g. test",
								onChange: (e) => a({ kinds: e.target.value })
							})
						}),
						/* @__PURE__ */ b($, {
							id: "avoozl-rule-paths",
							label: "Paths",
							raw: "when.paths",
							width: "18rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-rule-paths",
								value: t.paths,
								placeholder: "any, e.g. src/win/**",
								onChange: (e) => a({ paths: e.target.value })
							})
						}),
						/* @__PURE__ */ b($, {
							id: "avoozl-rule-repos",
							label: "Repositories",
							raw: "when.repositories",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-rule-repos",
								value: t.repositories,
								placeholder: "any",
								onChange: (e) => a({ repositories: e.target.value })
							})
						}),
						/* @__PURE__ */ b($, {
							id: "avoozl-rule-cats",
							label: "Categories",
							raw: "when.categories",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-rule-cats",
								value: t.categories,
								placeholder: "any",
								onChange: (e) => a({ categories: e.target.value })
							})
						})
					]
				}),
				/* @__PURE__ */ b("hr", { style: {
					borderColor: "var(--border)",
					margin: "4px 0"
				} }),
				/* @__PURE__ */ b("span", {
					className: "text-sm font-semibold",
					children: "Where"
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b($, {
						id: "avoozl-rule-route",
						label: "Route",
						raw: "route",
						width: "16rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-rule-route",
							value: t.route,
							onChange: (e) => a({ route: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: rg,
							children: [
								/* @__PURE__ */ b("option", {
									value: "",
									children: "repository route (default)"
								}),
								/* @__PURE__ */ b("option", {
									value: "local",
									children: "local worker"
								}),
								/* @__PURE__ */ b("option", {
									value: "github",
									children: "GitHub route"
								})
							]
						})
					}), /* @__PURE__ */ b($, {
						id: "avoozl-rule-on",
						label: "Run on",
						raw: "on",
						width: "16rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-rule-on",
							value: t.on,
							onChange: (e) => a({ on: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: rg,
							children: [
								/* @__PURE__ */ b("option", {
									value: "",
									children: "local (default)"
								}),
								/* @__PURE__ */ b("option", {
									value: "any",
									children: "any crew"
								}),
								/* @__PURE__ */ b("option", {
									value: "tags",
									children: "crews with tags"
								}),
								t.saveIn === "machine" && l.map((e) => /* @__PURE__ */ x("option", {
									value: e,
									children: ["crew ", e]
								}, e))
							]
						})
					})]
				}),
				t.on === "tags" && /* @__PURE__ */ b($, {
					id: "avoozl-rule-ontags",
					label: "Crews with all of",
					raw: "on: tags:…",
					children: /* @__PURE__ */ b(sg, {
						id: "avoozl-rule-ontags",
						options: o,
						value: t.onTags,
						onChange: (e) => a({ onTags: e }),
						empty: "No crew has tags yet."
					})
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-rule-require",
					label: "Require tags",
					raw: "requireTags",
					children: /* @__PURE__ */ b(sg, {
						id: "avoozl-rule-require",
						options: o,
						value: t.requireTags,
						onChange: (e) => a({ requireTags: e }),
						empty: "No crew has tags yet."
					})
				}),
				/* @__PURE__ */ b($, {
					id: "avoozl-rule-forbid",
					label: "Forbid tags",
					raw: "forbidTags",
					children: /* @__PURE__ */ b(sg, {
						id: "avoozl-rule-forbid",
						options: o,
						value: t.forbidTags,
						onChange: (e) => a({ forbidTags: e }),
						empty: "No crew has tags yet."
					})
				}),
				/* @__PURE__ */ x("label", {
					className: "flex items-center gap-2 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: t.keepLocal,
							onChange: (e) => a({ keepLocal: e.target.checked })
						}),
						/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "Keep local"
						}),
						/* @__PURE__ */ b(jh, { rule: tg }),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "Wins over every other rule."
						})
					]
				}),
				/* @__PURE__ */ b("hr", { style: {
					borderColor: "var(--border)",
					margin: "4px 0"
				} }),
				/* @__PURE__ */ b("span", {
					className: "text-sm font-semibold",
					children: "Session"
				}),
				u ? /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: u
				}) : /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "The agent and model the matching worker chats open on. Blank keeps the repository or workspace setting."
					}),
					!t.choices.length && /* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [/* @__PURE__ */ b($, {
							id: "avoozl-rule-agent",
							label: "Agent",
							raw: "session.agent",
							width: "16rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-rule-agent",
								value: t.agent,
								placeholder: "kirocrew-worker",
								onChange: (e) => a({ agent: e.target.value })
							})
						}), /* @__PURE__ */ b($, {
							id: "avoozl-rule-model",
							label: "Model",
							raw: "session.model",
							width: "18rem",
							children: d("avoozl-rule-model", t.model, (e) => a({ model: e }))
						})]
					}),
					t.choices.map((e, n) => /* @__PURE__ */ x("div", {
						className: "flex flex-wrap items-end gap-3",
						"data-choice-row": !0,
						children: [
							/* @__PURE__ */ b($, {
								id: `avoozl-choice-agent-${n}`,
								label: `Choice ${n + 1} agent`,
								raw: `session.choices[${n}].agent`,
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: `avoozl-choice-agent-${n}`,
									value: e.agent,
									placeholder: "kirocrew-worker",
									onChange: (e) => a({ choices: t.choices.map((t, r) => r === n ? {
										...t,
										agent: e.target.value
									} : t) })
								})
							}),
							/* @__PURE__ */ b($, {
								id: `avoozl-choice-model-${n}`,
								label: "Model",
								raw: `session.choices[${n}].model`,
								width: "16rem",
								children: d(`avoozl-choice-model-${n}`, e.model, (e) => a({ choices: t.choices.map((t, r) => r === n ? {
									...t,
									model: e
								} : t) }))
							}),
							/* @__PURE__ */ b($, {
								id: `avoozl-choice-weight-${n}`,
								label: "Weight",
								raw: `session.choices[${n}].weight`,
								width: "7rem",
								children: /* @__PURE__ */ b(g, {
									id: `avoozl-choice-weight-${n}`,
									inputMode: "numeric",
									value: e.weight,
									placeholder: "1",
									onChange: (e) => a({ choices: t.choices.map((t, r) => r === n ? {
										...t,
										weight: e.target.value
									} : t) })
								})
							}),
							/* @__PURE__ */ b(X, {
								icon: Ne,
								label: `Remove choice ${n + 1}`,
								onClick: () => a({ choices: t.choices.filter((e, t) => t !== n) })
							})
						]
					}, n)),
					t.choices.length < 10 && /* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(Y, {
						icon: Ee,
						tooltip: "Spread tasks across several agents or models by weight",
						onClick: () => a({ choices: t.choices.length ? [...t.choices, {
							agent: "",
							model: "",
							weight: ""
						}] : [{
							agent: t.agent,
							model: t.model,
							weight: ""
						}, {
							agent: "",
							model: "",
							weight: ""
						}] }),
						children: "Add choice"
					}) })
				] })
			]
		})
	});
}
function fg(e) {
	let t = l(), n = o(() => cr(t), [t]), r = cg(), [i, a] = c(null), [s, u] = c(null), [d, f] = c(null), p = (t) => t === "machine" ? e.view.machineHash : e.view.configHash, m = async (t, r) => {
		await n.save(e.workspaceId, {
			where: t,
			routing: or(e.view, t, r),
			expectedHash: p(t)
		}), await e.onSaved();
	}, h = (e) => e.source === "machine" ? "machine" : e.source === "repository" ? `repository:${e.repository}` : "workspace", g = (t, n) => {
		let r = e.view.rules[t], i = e.view.rules[n];
		if (!r || !i || h(r) !== h(i)) return;
		let a = h(r), o = ar(e.view, a), s = o.findIndex((e) => e.id === r.id), c = o.findIndex((e) => e.id === i.id);
		f(null), m(a, sr(o, s, c)).catch((e) => f(J(e)));
	};
	return /* @__PURE__ */ x(Q, {
		title: "Rules",
		blurb: "Checked top to bottom for the route. Every matching limit always applies.",
		actions: /* @__PURE__ */ b(Y, {
			icon: Ee,
			primary: !0,
			onClick: () => a({
				form: er(),
				isNew: !0
			}),
			children: "Add rule"
		}),
		children: [
			/* @__PURE__ */ x("ol", {
				className: "flex flex-col",
				"data-rules": !0,
				style: {
					listStyle: "none",
					margin: 0,
					padding: 0
				},
				children: [e.view.rules.map((t, n) => /* @__PURE__ */ x("li", {
					draggable: !0,
					onDragStart: () => u(n),
					onDragOver: (e) => e.preventDefault(),
					onDrop: () => {
						s !== null && s !== n && g(s, n), u(null);
					},
					className: "flex flex-wrap items-center gap-2 text-sm",
					style: {
						borderTop: n ? "1px solid var(--border)" : void 0,
						padding: "6px 0",
						cursor: "grab"
					},
					"data-rule": t.id,
					children: [
						/* @__PURE__ */ b("span", {
							"aria-hidden": "true",
							className: "text-muted",
							children: "⋮⋮"
						}),
						/* @__PURE__ */ b("span", {
							className: "font-medium",
							style: { minWidth: "8rem" },
							children: t.id
						}),
						/* @__PURE__ */ x("span", {
							style: {
								flex: "1 1 18rem",
								minWidth: "min(18rem, 100%)"
							},
							children: [Kn(t), qn(t) && t.session && /* @__PURE__ */ b("span", {
								className: "block text-xs text-muted",
								children: qn(t)
							})]
						}),
						/* @__PURE__ */ x("span", {
							className: "inline-flex items-center gap-1",
							style: { marginLeft: "auto" },
							children: [/* @__PURE__ */ b(q, { children: t.source === "machine" ? "this machine" : t.source === "repository" ? `repository ${t.repository}` : "workspace" }), /* @__PURE__ */ x("span", {
								className: "inline-flex gap-1",
								children: [
									/* @__PURE__ */ b(X, {
										icon: k,
										label: `Move ${t.id} up`,
										disabled: n === 0 || h(e.view.rules[n - 1]) !== h(t),
										onClick: () => g(n, n - 1)
									}),
									/* @__PURE__ */ b(X, {
										icon: E,
										label: `Move ${t.id} down`,
										disabled: n === e.view.rules.length - 1 || h(e.view.rules[n + 1]) !== h(t),
										onClick: () => g(n, n + 1)
									}),
									/* @__PURE__ */ b(X, {
										icon: we,
										label: `Edit ${t.id}`,
										onClick: () => a({
											form: tr(t),
											isNew: !1
										})
									})
								]
							})]
						})
					]
				}, `${t.source}:${t.repository ?? ""}:${t.id}`)), /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-center gap-2 text-sm text-muted",
					style: {
						borderTop: e.view.rules.length ? "1px solid var(--border)" : void 0,
						padding: "6px 0"
					},
					"data-rule": "(default)",
					children: [/* @__PURE__ */ b("span", {
						style: {
							minWidth: "8rem",
							paddingLeft: "1.25rem"
						},
						children: "(default)"
					}), /* @__PURE__ */ b("span", {
						className: "flex-1",
						children: "Anything else -> repository route on local"
					})]
				})]
			}),
			!e.view.rules.length && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "No rules: every chat runs on this machine, as before. Add a rule to send work to another crew or model."
			}),
			d && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: d
			}),
			i && /* @__PURE__ */ b(dg, {
				view: e.view,
				form: i.form,
				isNew: i.isNew,
				models: r,
				onCancel: () => a(null),
				onDelete: () => {
					let t = i.form.saveIn;
					m(t, ar(e.view, t).filter((e) => e.id !== i.form.id)).then(() => a(null), (e) => f(J(e)));
				},
				onSave: async (t) => {
					let n = rr(t);
					if (n.error) return n.error;
					let r = ar(e.view, t.saveIn), o = r.findIndex((e) => e.id === n.rule.id);
					if (i.isNew && o >= 0) return `Rule ${t.id} already exists there.`;
					let s = o >= 0 ? r.map((e, t) => t === o ? n.rule : e) : [...r, n.rule];
					try {
						return await m(t.saveIn, s), a(null), null;
					} catch (e) {
						return J(e);
					}
				}
			})
		]
	});
}
function pg(e) {
	let t = l(), n = o(() => cr(t), [t]), [r, i] = c(!1), [a, s] = c({}), [u, d] = c(null), f = e.view.pick.preset, m = async (t) => {
		d(null);
		try {
			await n.save(e.workspaceId, {
				where: "workspace",
				routing: {
					...e.view.workspace,
					pick: t
				},
				expectedHash: e.view.configHash
			}), await e.onSaved();
		} catch (e) {
			d(J(e));
		}
	};
	return /* @__PURE__ */ x(Q, {
		title: "Smart pick",
		blurb: "How Avoozl chooses among the crews a rule allows.",
		children: [
			/* @__PURE__ */ b(Ei, {
				id: "avoozl-pick",
				label: "Smart pick",
				value: f === "custom" ? "balanced" : f,
				onChange: (e) => void m({ preset: e }),
				cards: zn.map((e) => ({ ...e }))
			}),
			f === "custom" && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Custom weights are in use."
			}),
			/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(p, {
				type: "button",
				onClick: () => i(!r),
				"aria-expanded": r,
				children: r ? "Hide weights" : "Show weights"
			}) }),
			r && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-3",
				"data-weights": !0,
				children: [Object.entries(e.view.pick.weights).map(([e, t]) => /* @__PURE__ */ b($, {
					id: `avoozl-weight-${e}`,
					label: Bn[e] ?? e,
					raw: `routing.pick.weights.${e}`,
					width: "11rem",
					children: /* @__PURE__ */ b(g, {
						id: `avoozl-weight-${e}`,
						inputMode: "decimal",
						value: a[e] ?? "",
						placeholder: String(t),
						onChange: (t) => s({
							...a,
							[e]: t.target.value
						})
					})
				}, e)), /* @__PURE__ */ b(p, {
					type: "button",
					onClick: () => {
						let e = {};
						for (let [t, n] of Object.entries(a)) n.trim() && (e[t] = Number(n));
						m({
							preset: f === "custom" ? "balanced" : f,
							...Object.keys(e).length ? { weights: e } : {}
						});
					},
					children: "Save weights"
				})]
			}),
			u && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: u
			})
		]
	});
}
function mg(e) {
	let t = l(), n = o(() => cr(t), [t]), r = cg(), i = e.view.machine.router || {}, [a, s] = c(e.view.router.enabled), [u, d] = c(e.view.router.model ?? ""), [f, m] = c(i.timeoutSeconds ? String(i.timeoutSeconds) : ""), [h, _] = c(e.view.instructions ?? ""), [v, y] = c(null), S = async () => {
		y(null);
		let t = f.trim() ? Number(f) : void 0;
		if (t !== void 0 && (!Number.isInteger(t) || t < 10 || t > 600)) return y({ error: "Time limit is a whole number of seconds, 10–600." });
		let r = {
			enabled: a,
			...u ? { model: u } : {},
			...t === void 0 ? {} : { timeoutSeconds: t },
			...h.trim() ? { instructions: h.trim() } : {}
		};
		try {
			await n.save(e.workspaceId, {
				where: "machine",
				routing: {
					...e.view.machine,
					router: r
				},
				expectedHash: e.view.machineHash
			}), await e.onSaved(), y({ ok: "Saved." });
		} catch (e) {
			y({ error: J(e) });
		}
	};
	return /* @__PURE__ */ x(Q, {
		title: "Model router",
		blurb: "Optional. A model ranks the allowed crews; rules still decide what is allowed.",
		children: [
			/* @__PURE__ */ x("label", {
				className: "flex items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: a,
						onChange: (e) => s(e.target.checked)
					}),
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: "On"
					}),
					/* @__PURE__ */ b(jh, { rule: tg }),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Fallback: Smart pick, when the router fails or runs out of time."
					})
				]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-start gap-4",
				children: [/* @__PURE__ */ b($, {
					id: "avoozl-router-model",
					label: "Model",
					raw: "routing.router.model",
					width: "18rem",
					children: /* @__PURE__ */ b("select", {
						id: "avoozl-router-model",
						value: u || "auto",
						onChange: (e) => d(e.target.value === "auto" ? "" : e.target.value),
						className: "rounded border px-2 py-1 text-sm",
						style: rg,
						children: Sc(r, u).map((e) => /* @__PURE__ */ b("option", {
							value: e.value,
							children: e.label
						}, e.value))
					})
				}), /* @__PURE__ */ b($, {
					id: "avoozl-router-timeout",
					label: "Time limit (seconds)",
					raw: "routing.router.timeoutSeconds",
					width: "16rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-router-timeout",
						inputMode: "numeric",
						value: f,
						placeholder: "90",
						onChange: (e) => m(e.target.value)
					})
				})]
			}),
			/* @__PURE__ */ b($, {
				id: "avoozl-router-instructions",
				label: "Instructions",
				raw: "routing.router.instructions",
				note: "Saved on this machine only.",
				children: /* @__PURE__ */ b("textarea", {
					id: "avoozl-router-instructions",
					rows: 3,
					value: h,
					placeholder: "Prefer the build box for long test runs.",
					onChange: (e) => _(e.target.value),
					className: "rounded border px-2 py-1 text-sm",
					style: {
						...rg,
						width: "100%",
						maxWidth: "48rem"
					}
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [
					/* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => void S(),
						children: "Save"
					}),
					v?.error && /* @__PURE__ */ b("span", {
						role: "alert",
						className: "text-sm text-danger",
						children: v.error
					}),
					v?.ok && /* @__PURE__ */ b("span", {
						className: "text-sm text-muted",
						children: v.ok
					})
				]
			})
		]
	});
}
function hg(e) {
	let t = (t) => e.crews.find((e) => e.id === t)?.name ?? t, n = l(), r = o(() => cr(n), [n]), [i, a] = c(null), [s, u] = c(null), d = () => r.preview(e.workspaceId).then((e) => {
		a(e.items), u(null);
	}, (e) => u(J(e)));
	return /* @__PURE__ */ x(Q, {
		title: "Preview",
		blurb: "Where ready tasks would go now. Opens nothing.",
		actions: /* @__PURE__ */ b(p, {
			type: "button",
			onClick: () => void d(),
			children: "Preview"
		}),
		children: [
			s && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: s
			}),
			i === null ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Press Preview to see each ready task's route, crew, agent and model, and why."
			}) : i.length ? /* @__PURE__ */ b("ul", {
				className: "flex flex-col text-sm",
				style: {
					listStyle: "none",
					margin: 0,
					padding: 0
				},
				"data-preview": !0,
				children: i.map((e, n) => /* @__PURE__ */ x("li", {
					style: {
						borderTop: n ? "1px solid var(--border)" : void 0,
						padding: "6px 0"
					},
					"data-preview-task": e.taskId,
					children: [
						/* @__PURE__ */ x("span", {
							className: "flex flex-wrap gap-x-3",
							children: [
								/* @__PURE__ */ x("span", {
									className: "font-medium",
									children: [
										e.taskId,
										" ",
										e.title
									]
								}),
								/* @__PURE__ */ b("span", { children: e.route === "local" ? "local worker" : e.route }),
								/* @__PURE__ */ b("span", {
									style: e.noFit ? ag : void 0,
									children: e.noFit ? "no fit" : e.crew ? t(e.crew) : "waits"
								}),
								/* @__PURE__ */ b("span", {
									className: "text-muted",
									children: [e.agent, e.model ?? "auto"].filter(Boolean).join(" / ")
								})
							]
						}),
						/* @__PURE__ */ x("span", {
							className: "block text-xs text-muted",
							style: e.noFit ? ag : void 0,
							children: [e.noFit ? `Needs you: ${e.reason}` : e.reason, e.sessionReason ? ` · session: ${e.sessionReason}` : ""]
						}),
						e.whyNot.length > 0 && /* @__PURE__ */ x("span", {
							className: "block text-xs text-muted",
							children: ["why not: ", e.whyNot.map((e) => `${t(e.crew)} (${e.by})`).join("; ")]
						})
					]
				}, e.taskId))
			}) : /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "No task is ready now."
			}),
			!e.mc10 && i && i.some((e) => e.crew && e.crew !== "local") && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Remote picks show where tasks would go; they run on local until Kiro Crew ships MC-10."
			})
		]
	});
}
function gg({ workspaceId: e }) {
	let n = e ?? "", r = l(), i = o(() => cr(r), [r]), { value: a, error: s, reload: c } = ya(e, t((e) => i.view(e), [i])), u = async () => {
		await c();
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-routing": !0,
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b(Mi, {
				id: "avoozl-routing-heading",
				view: "routing",
				children: "Routing"
			}), /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Decide what does each task's work, and which crew and model run it."
			})] }),
			s && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: s
			}),
			a ? /* @__PURE__ */ x(y, { children: [
				a.noFit.length > 0 && /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b("p", {
					className: "text-sm",
					style: ag,
					"data-no-fit": !0,
					children: /* @__PURE__ */ b(K, {
						text: "Change a rule or a crew's tags; the task starts when it fits.",
						children: /* @__PURE__ */ b("span", { children: a.noFit.length === 1 ? `No crew fits ${a.noFit[0].taskId}: ${a.noFit[0].text}.` : `No crew fits ${a.noFit.length} tasks: ${a.noFit.map((e) => e.taskId).join(", ")}.` })
					})
				}) }),
				/* @__PURE__ */ b(m, {
					className: "flex flex-col gap-4",
					children: /* @__PURE__ */ b(ug, {
						view: a,
						workspaceId: n,
						onSaved: u
					})
				}),
				/* @__PURE__ */ b(m, {
					className: "flex flex-col gap-4",
					children: /* @__PURE__ */ b(fg, {
						view: a,
						workspaceId: n,
						onSaved: u
					})
				}),
				/* @__PURE__ */ b(m, {
					className: "flex flex-col gap-4",
					children: /* @__PURE__ */ b(pg, {
						view: a,
						workspaceId: n,
						onSaved: u
					})
				}),
				/* @__PURE__ */ b(m, {
					className: "flex flex-col gap-4",
					children: /* @__PURE__ */ b(mg, {
						view: a,
						workspaceId: n,
						onSaved: u
					})
				}),
				/* @__PURE__ */ b(m, {
					className: "flex flex-col gap-4",
					children: /* @__PURE__ */ b(hg, {
						workspaceId: n,
						mc10: a.mc10,
						crews: a.crews
					})
				})
			] }) : !s && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Loading…"
			})
		]
	});
}
// kirocrew-app/ui/src/App.tsx
var _g = [
	{
		key: "dashboard",
		label: "Dashboard"
	},
	{
		key: "plans",
		label: "Plans"
	},
	{
		key: "graph",
		label: "Graph"
	},
	{
		key: "delivery",
		label: "Delivery"
	},
	{
		key: "flow",
		label: "Flow"
	},
	{
		key: "routing",
		label: "Routing"
	},
	{
		key: "conflicts",
		label: "Conflicts"
	},
	{
		key: "untriaged",
		label: "Intake"
	},
	{
		key: "settings",
		label: "Settings"
	}
];
function vg() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function yg(e) {
	let { list: t } = e;
	return /* @__PURE__ */ x("label", {
		className: "flex items-center gap-2 text-sm",
		children: [/* @__PURE__ */ b("span", {
			className: "text-muted",
			children: "Workspace"
		}), /* @__PURE__ */ b("select", {
			"aria-label": "Workspace",
			value: e.value ?? "",
			disabled: !t?.items.length,
			onChange: (t) => e.onChange(t.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: {
				borderColor: "var(--border)",
				color: "var(--text)",
				background: "var(--card, transparent)"
			},
			children: t ? t.items.length === 0 ? /* @__PURE__ */ b("option", {
				value: "",
				children: "None yet"
			}) : t.items.map((e) => /* @__PURE__ */ b("option", {
				value: e.id,
				children: e.name
			}, e.id)) : /* @__PURE__ */ b("option", {
				value: "",
				children: "Loading…"
			})
		})]
	});
}
var bg = (e) => _g.find((t) => t.key === e)?.label ?? e;
function xg() {
	return /* @__PURE__ */ b(pi, { children: /* @__PURE__ */ b(Sg, {}) });
}
function Sg() {
	let e = di(), n = l(), i = o(() => Pt(n), [n]), a = o(() => Rt(vg()), []), [s, u] = c("dashboard"), [d, f] = c(rf), [m, g] = c(null), [y, S] = c(null), [C, w] = c(0), [T, E] = c(0), [D, O] = c(null), k = o(() => Kt(n), [n]), A = o(() => vu(n), [n]), [j, M] = c(a.workspaceId), [N, P] = c(null), [F, I] = c(null), L = t((e) => {
		P(e), M((t) => It(e, t));
	}, []);
	r(() => {
		i.list().then(L, (e) => I(J(e)));
	}, [i, L]), r(() => {
		zt(vg(), { workspaceId: j });
	}, [j]);
	let ee = {
		tab: s,
		settingsTab: d,
		focus: m,
		drill: y
	}, R = (e) => {
		e.focus !== void 0 && g(e.focus), e.drill !== void 0 && S(e.drill), e.settingsTab !== void 0 && f(e.settingsTab), e.tab !== void 0 && u(e.tab);
	}, z = (t) => si(e, ee, t, R, (e, t) => t ? `Back to ${bg(e.tab)}` : "Back to the previous Settings section"), te = () => z({
		settingsTab: "workspaces",
		tab: "settings"
	}), B = N ? j : null, V = s !== "settings" && !B, H = (e, t) => z({
		focus: t ?? null,
		drill: null,
		tab: e
	}), ne = (e, t) => {
		B && Zl(B, t), z({
			focus: null,
			drill: null,
			tab: e
		});
	}, U = (e) => z({
		focus: null,
		drill: e,
		tab: "graph"
	}), W = (e) => z({
		focus: null,
		drill: null,
		settingsTab: af(s, e, d, wh.map((e) => e.key)),
		tab: e
	});
	return r(() => {
		if (!B) return w(0);
		let e = !0, t = () => k.conflicts(B).then((t) => e && w(t.length), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		B,
		k,
		s
	]), r(() => {
		if (!B) return O(null);
		let e = !0, t = () => A.view(B).then((t) => e && O(t.enabled ? t.total : null), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		B,
		A,
		s
	]), r(() => {
		D === null && s === "untriaged" && u("dashboard");
	}, [D, s]), /* @__PURE__ */ b("div", {
		[ci]: "",
		style: { display: "contents" },
		children: /* @__PURE__ */ b(Si, { children: /* @__PURE__ */ b(bl, {
			workspaceId: B,
			onFocus: (e, t) => U({
				kind: "focus",
				id: e,
				title: t
			}),
			children: /* @__PURE__ */ x("div", {
				className: "flex h-full min-h-0 flex-col",
				children: [
					/* @__PURE__ */ b(_, {
						title: /* @__PURE__ */ x("span", {
							className: "inline-flex items-center gap-2",
							children: [/* @__PURE__ */ b(Re, { size: 28 }), "Avoozl"]
						}),
						subtitle: "Plan work as a graph, then deliver ready tasks through Kiro Crew",
						actions: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-3",
							children: [/* @__PURE__ */ b(yg, {
								list: N,
								value: j,
								onChange: M
							}), /* @__PURE__ */ b(p, {
								type: "button",
								primary: !0,
								onClick: () => {
									E((e) => e + 1), z({
										focus: null,
										drill: null,
										tab: "plans"
									});
								},
								children: "Plan a goal"
							})]
						})
					}),
					/* @__PURE__ */ b("div", {
						className: "px-6 pb-3",
						children: /* @__PURE__ */ b(v, {
							layoutId: "avoozl-views",
							ariaLabel: "Avoozl views",
							segments: _g.filter((e) => e.key !== "untriaged" || D !== null).map((e) => ({
								key: e.key,
								label: e.key === "untriaged" && D ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Intake, ${D} untriaged items`,
									children: [
										/* @__PURE__ */ b(Ni, {
											view: "untriaged",
											children: "Intake"
										}),
										" ",
										/* @__PURE__ */ b(q, {
											variant: "info",
											children: D
										})
									]
								}) : e.key === "conflicts" && C > 0 ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Conflicts, ${C} need you`,
									children: [
										/* @__PURE__ */ b(Ni, {
											view: "conflicts",
											children: "Conflicts"
										}),
										" ",
										/* @__PURE__ */ b(q, {
											variant: "warning",
											children: C
										})
									]
								}) : /* @__PURE__ */ b(Ni, {
									view: e.key,
									children: e.label
								})
							})),
							value: s,
							onChange: (e) => W(e),
							wrap: !0
						})
					}),
					F && /* @__PURE__ */ b("p", {
						role: "alert",
						className: "px-6 pb-2 text-sm text-danger",
						children: F
					}),
					/* @__PURE__ */ b("div", {
						ref: (t) => {
							e.scroller.current = t;
						},
						"data-avoozl-pane": !0,
						className: "flex-1 min-h-0 overflow-y-auto px-6 pb-8",
						children: V ? /* @__PURE__ */ b(h, {
							icon: /* @__PURE__ */ b(Re, { size: 40 }),
							title: N ? N.items.length === 0 ? "No workspace yet" : "Pick a workspace" : "Loading workspaces…",
							subtitle: N?.items.length === 0 ? "Add or initialize a workspace in Settings. Every tab reads from it." : "Choose one in the header. Every tab reads from it.",
							action: N?.items.length === 0 ? /* @__PURE__ */ b(p, {
								type: "button",
								onClick: te,
								children: "Open Settings › Workspaces"
							}) : void 0
						}) : s === "dashboard" ? /* @__PURE__ */ b(Kl, {
							workspaceId: B,
							untriaged: D,
							onNavigate: H,
							onScope: ne,
							onDrill: U
						}) : s === "plans" ? /* @__PURE__ */ b(js, {
							workspaceId: B,
							onScope: ne,
							onDrill: U,
							newPlanRequest: T
						}) : s === "graph" ? /* @__PURE__ */ b(lu, {
							workspaceId: B,
							focus: m,
							drill: y,
							onDrill: S
						}) : s === "delivery" ? /* @__PURE__ */ b(gu, { workspaceId: B }) : s === "conflicts" ? /* @__PURE__ */ b(Ba, { workspaceId: B }) : s === "flow" ? /* @__PURE__ */ b(ul, { workspaceId: B }) : s === "routing" ? /* @__PURE__ */ b(gg, { workspaceId: B }) : s === "untriaged" ? /* @__PURE__ */ b(ld, { workspaceId: B }) : /* @__PURE__ */ b(eg, {
							workspaceId: B,
							tab: d,
							onTab: (e) => z({ settingsTab: e }),
							onSelectWorkspace: (e) => e && M(e),
							onListChange: L,
							onOpenPlans: () => W("plans"),
							onOpenRouting: () => W("routing")
						})
					})
				]
			})
		}) })
	});
}
export { xg as default };
