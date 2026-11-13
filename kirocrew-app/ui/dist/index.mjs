import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Badge as f, Btn as p, Card as m, EmptyState as h, Input as g, PageHeader as _, SegmentedControl as v } from "@kirocrew/app-sdk/ui";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { createPortal as S } from "react-dom";
import { Activity as C, Archive as w, ArchiveRestore as T, ArrowLeft as E, ArrowRight as D, Ban as O, BookOpen as k, Bot as A, Check as j, ChevronRight as M, CircleAlert as N, CircleAlert as P, CircleCheck as F, CircleDot as I, CircleHelp as L, ClipboardCheck as R, Copy as z, Crosshair as B, Download as ee, ExternalLink as V, Eye as H, FileText as U, FileText as te, Folder as ne, FolderOpen as re, Gauge as ie, Gauge as ae, GitBranch as oe, GitPullRequest as se, GitPullRequestDraft as ce, HardDrive as le, History as ue, History as de, Inbox as fe, Inbox as pe, Info as me, KeyRound as he, Laptop as ge, LayoutDashboard as _e, LayoutGrid as ve, LayoutGrid as W, Lightbulb as ye, Lock as be, MessageSquare as xe, MessagesSquare as Se, Network as Ce, Network as we, Package as Te, Pause as Ee, Pencil as De, Play as Oe, Plus as ke, Radar as Ae, RefreshCw as je, RotateCcw as Me, ScanSearch as Ne, Send as Pe, Settings as Fe, Settings as Ie, ShieldCheck as Le, Trash2 as Re, Users as ze, Workflow as Be, X as Ve } from "lucide-react";
// \0rolldown/runtime.js
var He = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports);
// kirocrew-app/ui/src/Logo.tsx
function Ue({ size: e = 32 }) {
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
function G({ variant: e, children: t }) {
	let n = Ge(e);
	return /* @__PURE__ */ b(f, {
		variant: n.variant,
		className: n.className,
		children: t
	});
}
function Ke(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var qe = null;
function Je(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), qe === o && (qe = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), qe && qe !== o && qe(), qe = o, i || (i = !0, e.onChange(!0));
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
// kirocrew-app/ui/src/layers.ts
var Ye = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function Xe(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function Ze(e, t, n) {
	return e === 0 ? -1 : t < 0 ? n ? e - 1 : 0 : n ? (t - 1 + e) % e : (t + 1) % e;
}
// src/delivery-lanes.mjs
var Qe = /* @__PURE__ */ new Set(["closed", "lost"]);
Object.freeze([
	["ready", "Ready"],
	["running", "Running"],
	["reviewing", "Reviewing"],
	["needs-you", "Needs you"],
	["waiting", "Blocked or waiting"],
	["done", "Done"],
	["deferred", "Deferred"]
]);
function $e(e) {
	return e.state ? e.state : e.complete ? "done" : e.decision || e.status === "blocked" ? "needs-you" : e.status === "deferred" ? "deferred" : e.status === "running" || e.status === "review" ? "running" : e.ready ? "ready" : "waiting";
}
var et = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function tt(e, t) {
	let n = et(t), r = (t?.sessions ?? []).filter((e) => !Qe.has(e.status ?? ""));
	return n === "decision" || t?.needsYou || e && $e(e) === "needs-you" && !t?.complete ? "needs-you" : t?.complete || e && $e(e) === "done" ? "done" : n === "done" || n === "verified" || t?.status === "review" && !t.handSetReview || r.some((e) => e.role !== "worker") || t?.githubReviews?.state === "pending" ? "reviewing" : r.length || n === "running" || n === "failed" || t?.status === "running" && !t.handSetReview ? "running" : e && $e(e) === "ready" ? "ready" : "waiting";
}
// kirocrew-app/ui/src/graph-layout.ts
var nt = [
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
], rt = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
}, it = 1.5;
function at(e, t = 1100) {
	let n = (12 / (12 + Math.max(0, e))) ** 2, r = Math.max(.6, Math.min(1.4, t / 1100)), i = 1 + it * n * r, a = (e) => Math.round(e * i);
	return {
		...rt,
		columnGap: a(rt.columnGap),
		rowGap: a(rt.rowGap),
		clusterGap: a(rt.clusterGap)
	};
}
var ot = rt.nodeWidth, st = rt.nodeHeight;
rt.columnGap, rt.rowGap, rt.margin, rt.clusterLabel, rt.clusterGap;
var ct = 2, lt = 12, ut = 8, dt = $e;
function ft(e) {
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
var pt = (e) => e ?? "(none)";
function mt(e, t) {
	let n = e.groups ?? [], r = new Map(n.map((e) => [e.id, e.title])), i = new Map(n.map((e, t) => [e.id, t])), a = (e) => r.get(e) ?? (e === null ? "No epic" : e), o = /* @__PURE__ */ new Map();
	for (let t of e.tasks) {
		let e = t.group ?? null;
		o.has(e) || o.set(e, []), o.get(e).push(t);
	}
	let s = [...o.keys()].sort((e, t) => (e === null ? 1e9 : i.get(e) ?? 1e8) - (t === null ? 1e9 : i.get(t) ?? 1e8)), c = /* @__PURE__ */ new Map(), l = [];
	for (let e of s) {
		let n = o.get(e);
		if (t.has(pt(e))) {
			let t = `group:${pt(e)}`, r = new Set(n.map(dt)), i = [
				"needs-you",
				"running",
				"ready",
				"waiting",
				"deferred",
				"done"
			].find((e) => r.has(e)) ?? "waiting";
			for (let e of n) c.set(e.id, t);
			l.push({
				id: t,
				task: null,
				title: a(e),
				group: e,
				state: i,
				wave: 1,
				x: 0,
				y: 0,
				members: {
					total: n.length,
					done: n.filter((e) => dt(e) === "done").length
				}
			});
		} else for (let t of n) c.set(t.id, t.id), l.push({
			id: t.id,
			task: t,
			title: t.title,
			group: e,
			state: dt(t),
			wave: 1,
			x: 0,
			y: 0
		});
	}
	let u = [], d = /* @__PURE__ */ new Map();
	for (let t of e.edges) {
		if (!t.blocking) continue;
		let e = c.get(t.from), n = c.get(t.to);
		if (!e || !n || e === n) continue;
		let r = `${e}\u0000${n}`, i = d.get(r);
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
		d.set(r, a), u.push(a);
	}
	return {
		nodes: l,
		edges: u,
		groupTitle: a,
		members: o
	};
}
function ht(e, t) {
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
function gt(e) {
	if (e.length < 2) return 0;
	let t = e.length >> 1, n = e.slice(0, t), r = e.slice(t), i = gt(n) + gt(r), a = 0, o = 0, s = 0;
	for (; a < n.length && o < r.length;) n[a] <= r[o] ? e[s++] = n[a++] : (e[s++] = r[o++], i += n.length - a);
	for (; a < n.length;) e[s++] = n[a++];
	for (; o < r.length;) e[s++] = r[o++];
	return i;
}
function _t(e, t) {
	let n = 0;
	for (let r = 0; r + 1 < e.length; r++) {
		let i = new Map(e[r + 1].map((e, t) => [e, t])), a = [];
		e[r].forEach((e, n) => {
			for (let r of t.get(e).down) a.push([n, i.get(r)]);
		}), a.sort((e, t) => e[0] - t[0] || e[1] - t[1]), n += gt(a.map((e) => e[1]));
	}
	return n;
}
function vt(e, t, n, r) {
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
function yt(e, t) {
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
var bt = (e) => {
	let t = [...e].sort((e, t) => e - t), n = t.length >> 1;
	return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2;
};
function xt(e, t = /* @__PURE__ */ new Set(), n = {}) {
	let { nodeWidth: r, nodeHeight: i, columnGap: a, rowGap: o, margin: s, clusterLabel: c, clusterGap: l } = n.spacing ?? rt, { nodes: u, edges: d, groupTitle: f } = mt(e, t), p = new Map(u.map((e) => [e.id, e])), m = new Set(d.flatMap((e) => [e.from, e.to])), h = u.filter((e) => m.has(e.id)), g = u.filter((e) => !m.has(e.id)), { ranks: _, pairs: v } = ht(h.map((e) => e.id), d), y = /* @__PURE__ */ new Map();
	for (let e of h) y.set(e.id, {
		id: e.id,
		cluster: `group:${pt(e.group)}`,
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
				height: ct,
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
	for (let e of h) w.has(pt(e.group)) || w.set(pt(e.group), w.size);
	let T = (e) => {
		let t = p.get(e);
		return t ? w.get(pt(t.group)) * 1e6 + C.get(e) : 0xe8d4a51000;
	};
	for (let e of S) e.sort((e, t) => T(e) - T(t));
	let E = _t(S, y);
	if (!n.naive) {
		let e = S.map((e) => [...e]);
		for (let t = 0; t < lt && E > 0; t++) {
			let n = t % 2 == 0, r = S.map((e) => [...e]);
			if (n) for (let e = 1; e < r.length; e++) r[e] = vt(r[e], y, r[e - 1], "up");
			else for (let e = r.length - 2; e >= 0; e--) r[e] = vt(r[e], y, r[e + 1], "down");
			let i = _t(r, y);
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
	}, R = new Map(h.map((e) => [e.id, []]));
	for (let e of v) R.get(e.lo).push(e.hi), R.get(e.hi).push(e.lo);
	let z = /* @__PURE__ */ new Map(), B = /* @__PURE__ */ new Map(), ee = 0, V = [];
	for (let e of j) {
		let t = Math.max(1, Math.ceil(e.length / F));
		e.forEach((e, n) => {
			z.set(e, ee + Math.floor(n / F)), B.set(e, t > 1 ? n % F : n);
		}), t === 1 && V.push(e), ee += t;
	}
	for (let e = 0; e < ut; e++) {
		let t = e % 2 == 0 ? V : [...V].reverse();
		for (let e of t) {
			let t = e.map((e) => {
				let t = R.get(e).map((e) => B.get(e));
				return t.length ? bt(t) : B.get(e);
			}), n = e.length;
			yt(t, e.map(() => 1)).forEach((t, r) => B.set(e[r], Math.min(Math.max(Math.round(t), r), F - n + r)));
		}
	}
	for (let e of h) e.wave = _.get(e.id), e.x = s + z.get(e.id) * D, e.y = k + B.get(e.id) * O;
	let H = /* @__PURE__ */ new Map(), U = (e, t) => {
		H.has(e) || H.set(e, /* @__PURE__ */ new Map());
		let n = H.get(e);
		return n.has(t) || n.set(t, n.size), n.get(t);
	}, te = d.map((e) => {
		let t = p.get(e.from), n = p.get(e.to), s = z.get(t.id), c = z.get(n.id), l = t.y + i / 2, u = n.y + i / 2, d = (a / 2 - 4) / 2, f = t.x + r + 3 + U(`c${s}:out`, t.id) % 3 * d, m = n.x - 3 - U(`c${c - 1}:in`, n.id) % 3 * d;
		if (c === s + 1) return {
			...e,
			points: l === u ? [[t.x + r, l], [n.x, u]] : [
				[t.x + r, l],
				[f, l],
				[f, u],
				[n.x, u]
			]
		};
		let h = n.y - o / 2, g = n.y + i + o / 2, _ = Math.abs(l - h) <= Math.abs(l - g) ? h : g, v = _ + (U(`r${Math.round(_)}`, t.id) % 3 - 1) * 3;
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
	}), ne = [], re = /* @__PURE__ */ new Set(), ie = /* @__PURE__ */ new Map();
	for (let e of u) ie.set(pt(e.group), (ie.get(pt(e.group)) ?? 0) + (e.members?.total ?? 1));
	let ae = /* @__PURE__ */ new Map();
	for (let e of h) {
		let t = z.get(e.id);
		ae.has(t) || ae.set(t, []), ae.get(t).push(e);
	}
	for (let e of [...ae.keys()].sort((e, t) => e - t)) {
		let n = ae.get(e).sort((e, t) => e.y - t.y), a = [], s = () => {
			if (!a.length) return;
			let e = pt(a[0].group), n = t.has(e);
			ne.push({
				group: a[0].group,
				title: f(a[0].group),
				count: ie.get(e) ?? a.length,
				collapsed: n,
				x: a[0].x - 4,
				y: a[0].y - o + 2,
				width: r + 8,
				height: a[a.length - 1].y + i + 2 - (a[0].y - o + 2),
				label: !n && !re.has(e)
			}), n || re.add(e), a = [];
		};
		for (let e of n) a.length && pt(a[0].group) !== pt(e.group) && s(), a.push(e);
		s();
	}
	let oe = h.length ? k + F * O - o : 0, se = h.length ? oe + O : k, ce = [], le = g;
	le.forEach((e, n) => {
		e.loose = !0, e.wave = 0, e.x = s + n % L * D, e.y = se + Math.floor(n / L) * O;
		let r = pt(e.group), i = ce[ce.length - 1];
		i && pt(i.group) === r ? i.count++ : t.has(r) || ce.push({
			group: e.group,
			title: f(e.group),
			count: 1,
			x: e.x,
			y: e.y - o - 1,
			chars: Math.max(8, Math.floor((D * Math.max(1, L - n % L) - a) / 6))
		});
	});
	let ue = le.length ? Math.ceil(le.length / L) : 0, de = Math.max(I, le.length ? Math.min(L, le.length) : 0, 1);
	return {
		nodes: [...h, ...le],
		edges: te,
		clusters: ne,
		loose: ce,
		waves: x,
		crossings: E,
		rows: F,
		width: s * 2 + de * D - a,
		height: Math.max(ue ? se + ue * O - o + s : 0, oe + s, s * 2)
	};
}
function St(e, t) {
	return t ? "none" : e.members ? "drill" : "open";
}
function Ct(e, t) {
	if (!t) return e;
	let n, r = (t) => new Set(e.tasks.filter(t).map((e) => e.id));
	if (t.kind === "epic") n = r((e) => (e.epic ?? null) === t.id);
	else if (t.kind === "plan") n = r((e) => (e.planId ?? null) === t.id);
	else if (t.kind === "phase") n = r((e) => (e.planId ?? null) === t.plan && (e.phase?.id ?? null) === t.id);
	else {
		let { up: r, down: i } = Tt(e.edges.filter((e) => e.blocking), t.id);
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
function wt(e) {
	return e.map(([e, t], n) => `${n ? "L" : "M"}${Math.round(e * 10) / 10},${Math.round(t * 10) / 10}`).join(" ");
}
function Tt(e, t) {
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
function Et(e, t) {
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
function Dt(e, t, n, r, i = .1, a = 3) {
	let o = Math.min(a, Math.max(i, e.scale * t)), s = o / e.scale;
	return {
		scale: o,
		x: n - (n - e.x) * s,
		y: r - (r - e.y) * s
	};
}
function Ot(e, t, n) {
	let r = Math.max(.1, Math.min(1, t / e.width, n / e.height));
	return {
		scale: r,
		x: Math.max(0, (t - e.width * r) / 2),
		y: 0
	};
}
var kt = (e, t) => (e?.kind ?? null) === (t?.kind ?? null) && (e?.id ?? null) === (t?.id ?? null);
function At(e, t, n, r) {
	if (!t.drill) return e;
	let i = [.../* @__PURE__ */ new Set([...Object.keys(n), ...Object.keys(r)])].filter((e) => JSON.stringify(n[e]) !== JSON.stringify(r[e]));
	if (!i.length) return e;
	let a = i.every((e) => e === "q"), o = e[e.length - 1];
	return a && o?.searchOnly && kt(o.drill, t.drill) ? e : [...e, {
		...t,
		filter: n,
		searchOnly: a
	}];
}
function jt(e, t) {
	return e.map((n, r) => ({
		at: r,
		entry: n,
		next: r + 1 < e.length ? e[r + 1].drill : t
	})).filter(({ entry: e, next: t }) => !kt(e.drill, t)).map(({ at: e, entry: t }) => ({
		at: e,
		label: Mt(t.drill)
	}));
}
var Mt = (e) => e ? e.kind === "focus" ? `Focus: ${e.title}` : e.title : "All tasks";
function Nt(e, t) {
	let n = t ? t.kind === "epic" ? "plan" : t.kind === "plan" ? "phase" : "plan" : "epic", r = e.plans ?? [], i = new Map(r.map((e) => [e.id, e.title])), a = (e) => n === "epic" ? e.epic ?? null : n === "plan" ? e.planId ?? null : e.phase?.id ?? null, o = n === "epic" ? e.epics.map((e) => ({
		id: e.id,
		title: e.title
	})) : n === "plan" ? r.map((e) => ({
		id: e.id,
		title: e.title
	})) : (r.find((e) => e.id === t.id)?.phases ?? []).filter((e) => e.id !== null).map((e) => ({
		id: e.id,
		title: e.title ?? e.id
	})), s = (e) => n === "phase" ? e.phase?.title ?? null : n === "plan" ? i.get(e.planId ?? "") ?? e.planId ?? null : null;
	for (let t of e.tasks) {
		let e = a(t);
		e !== null && !o.some((t) => t.id === e) && o.push({
			id: e,
			title: s(t) ?? e
		});
	}
	return o.push({
		id: null,
		title: n === "epic" ? "No epic" : n === "plan" ? "No spec" : "No phase"
	}), {
		...e,
		groups: o,
		tasks: e.tasks.map((e) => ({
			...e,
			group: a(e)
		}))
	};
}
function Pt(e, t, n) {
	return e ? e.kind === "epic" ? {
		kind: "plan",
		id: t,
		title: n
	} : e.kind === "plan" ? {
		kind: "phase",
		plan: e.id,
		id: t,
		title: n
	} : null : {
		kind: "epic",
		id: t,
		title: n
	};
}
var Ft = (e) => {
	let t = e[e.length - 1];
	if (!t) return null;
	let n = t.drill ? Mt(t.drill) : "all tasks";
	return t.filter ? `Back to ${n}, before the filter change` : `Back to ${n}`;
};
function It(e, t, n) {
	return n ? [...e, t] : [];
}
function Lt(e, t = e.length - 1) {
	return t < 0 || t >= e.length ? null : {
		entry: e[t],
		stack: e.slice(0, t)
	};
}
var Rt = (e) => e.button === 3, zt = (e) => !!e.altKey && e.key === "ArrowLeft" || !!e.metaKey && e.key === "[", Bt = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), Vt = (e) => Bt.has(e);
function Ht(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function Ut() {
	let e = [], t = 1, n = () => {
		let t = Ht(e, (e) => e.kind === "tab");
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
			let t = Ht(e, (e) => Vt(e.kind));
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
				let t = Ht(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function Wt(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return !!t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? "");
}
function Gt(e, t, n) {
	if (e.isComposing) return null;
	let r = n.steps();
	return e.key === "Escape" ? r.some((e) => Vt(e.kind)) ? "escape" : null : !t || !r.length || !zt(e) || e.key === "ArrowLeft" && Wt(e.target) ? null : "back";
}
function Kt(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var qt = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function Jt(e = qt) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: Ut(),
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
		restoreScroll: (t) => void e(() => Kt(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
function Yt(e, t, n, r, i, a) {
	let o = e.scrollTop(), s = e.history.push({
		kind: t,
		label: r,
		back: () => {
			e.history.release(s), a?.delete(s), e.memory.set(n, i), e.setters.get(n)?.(i), e.restoreScroll(o);
		}
	});
	return a?.add(s), s;
}
function Xt(e, t, n, r, i, a = {}) {
	let o = n.tab !== void 0 && n.tab !== t.tab, s = n.settingsTab !== void 0 && n.settingsTab !== t.settingsTab;
	if (o || s) {
		let n = e.scrollTop(), a = o ? e.takeMemory() : null, s = e.history.push({
			kind: o ? "tab" : "inner",
			label: i(t, o),
			back: () => {
				e.history.release(s), a && e.putMemory(a), r(t), e.restoreScroll(n);
			}
		});
	}
	for (let [t, n] of Object.entries(a)) e.memory.set(t, n), o || e.setters.get(t)?.(n);
	r(n);
}
// kirocrew-app/ui/src/NavHistory.tsx
var Zt = "data-avoozl-app", Qt = e(null), $t = null, en = () => n(Qt) ?? ($t ??= Jt()), tn = (e) => e instanceof Element && !!e.closest("[data-avoozl-app]");
function nn({ children: e }) {
	let t = o(Jt, []);
	return r(() => {
		let e = !1, n = (t) => {
			let n = t.target;
			return n instanceof Element && n !== document.body && n !== document.documentElement ? tn(n) : e;
		}, r = (t) => {
			e = tn(t.target);
		}, i = (e) => {
			let r = Gt(e, n(e), t.history);
			r && (e.preventDefault(), e.stopImmediatePropagation(), r === "escape" ? t.history.escape() : t.history.back());
		}, a = (e) => Rt(e) && tn(e.target) && t.history.steps().length > 0, o = (e) => {
			a(e) && (e.preventDefault(), e.stopImmediatePropagation());
		}, s = (e) => {
			a(e) && (o(e), t.history.back());
		};
		return window.addEventListener("pointerdown", r, !0), window.addEventListener("keydown", i, !0), window.addEventListener("mousedown", o, !0), window.addEventListener("mouseup", s, !0), window.addEventListener("auxclick", o, !0), () => {
			window.removeEventListener("pointerdown", r, !0), window.removeEventListener("keydown", i, !0), window.removeEventListener("mousedown", o, !0), window.removeEventListener("mouseup", s, !0), window.removeEventListener("auxclick", o, !0);
		};
	}, [t]), /* @__PURE__ */ b(Qt.Provider, {
		value: t,
		children: e
	});
}
function rn(e, t, n, i, a) {
	let o = en(), c = s({
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
function an(e, t, n = !0) {
	let i = en(), [a, o] = c(() => n && i.memory.has(e) ? i.memory.get(e) : t);
	return r(() => {
		i.memory.set(e, a);
	}, [
		i,
		e,
		a
	]), [a, o];
}
function on(e, n, i, a, o = !0) {
	let c = en(), [l, u] = an(e, a, o), d = s(l);
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
			Object.is(r, t) || (Yt(c, n, e, f.current(r), r, p.current), u(t));
		}, [
			c,
			e,
			n,
			u
		]),
		u
	];
}
// kirocrew-app/ui/src/icons.ts
var sn = me, cn = {
	dashboard: _e,
	plans: U,
	graph: Ce,
	delivery: ve,
	flow: ie,
	routing: le,
	conflicts: N,
	untriaged: fe,
	activity: ue,
	settings: Fe
}, ln = "/apps/avoozl/api/command";
function K(e) {
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
function un(e) {
	let t = async (t, n = {}, r) => (await e.post(ln, {
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
function dn(e, t = Date.now()) {
	if (!e) return "Not loaded";
	let { lastRun: n, lock: r } = e;
	if (r) return r.live ? `Running (pid ${r.pid})` : `Stale lock (pid ${r.pid})`;
	if (!n) return "Never run";
	if (n.outcome === "unreadable") return "Last run unreadable";
	let i = n.at ? Math.max(0, Math.round((t - Date.parse(n.at)) / 1e3)) : null, a = i === null ? "" : i < 90 ? ` ${i}s ago` : ` ${Math.round(i / 60)}m ago`;
	return n.outcome === "error" ? `Failed${a}: ${n.error ?? "unknown error"}` : n.outcome === "locked" ? `Skipped${a}: another tick held the lock` : n.policy === "invalid" ? `Ran${a}; .avoozl.json is invalid: ${n.error ?? ""}`.trim() : `Ran${a}; policy ${n.policy ?? "unknown"}`;
}
function fn(e, t) {
	return t && e.items.some((e) => e.id === t) ? t : e.items.find((e) => e.served)?.id ?? e.defaultWorkspace ?? e.items[0]?.id ?? null;
}
var pn = "avoozl.page";
function mn(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
function hn(e, t) {
	try {
		e?.setItem(pn, JSON.stringify(t));
	} catch {}
}
var gn = {
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
}, _n = (e) => gn[e] ?? {
	label: e,
	tip: `State: ${e}`
};
function vn(e) {
	let t = {
		kind: e.kind,
		taskId: e.taskId ?? null
	};
	return e.field && (t.field = e.field), e.slot && (t.slot = e.slot), e.id && (t.id = e.id), t;
}
function yn(e) {
	let t = async (t, n, r) => (await e.post(ln, {
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
// kirocrew-app/ui/src/drawer-context.ts
var bn = e({
	openTask: () => void 0,
	addTask: () => void 0,
	openReview: () => void 0
}), xn = () => n(bn), Sn = (e, t) => Math.min(t, Math.max(1, e) * 100), Cn = (e) => `Show ${Math.min(100, e)} more (${e} left)`, wn = {
	color: "var(--danger)",
	borderColor: "var(--danger)"
}, Tn = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, En = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function q(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(X, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x(p, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...En,
				...e.style
			},
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function J(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(X, {
		text: e.tooltip ?? e.label,
		children: (n) => /* @__PURE__ */ b(p, {
			type: "button",
			"aria-label": e.label,
			"aria-describedby": e.tooltip && e.tooltip !== e.label ? n : void 0,
			onClick: e.onClick,
			disabled: e.disabled,
			style: {
				...En,
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
var Dn = e(async () => !1), On = () => n(Dn);
function kn({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ x(Dn.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ x($n, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			children: [
				/* @__PURE__ */ b("h3", {
					id: "avoozl-confirm-title",
					className: "text-base font-semibold",
					children: n.title
				}),
				/* @__PURE__ */ b("p", {
					id: "avoozl-confirm-body",
					className: "text-sm text-muted",
					children: n.body
				}),
				/* @__PURE__ */ x("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ b(p, {
						ref: a,
						type: "button",
						onClick: () => l(!1),
						children: "Cancel"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						"data-danger": !0,
						onClick: () => l(!0),
						style: Tn,
						children: n.action
					})]
				})
			]
		})]
	});
}
function An(e) {
	let t = On(), n = e.icon;
	return /* @__PURE__ */ b(X, {
		text: e.tooltip ?? e.label,
		children: (r) => /* @__PURE__ */ x(p, {
			type: "button",
			"data-danger": !0,
			"aria-label": e.label,
			"aria-describedby": e.tooltip ? r : void 0,
			disabled: e.disabled,
			onClick: () => void t(e.confirm).then((t) => t && e.onConfirm()),
			style: {
				...En,
				...wn
			},
			children: [n && /* @__PURE__ */ b(n, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function jn(e, t) {
	if (e.open) for (let n of t) n !== e && n.open && (n.open = !1);
}
function Mn(e) {
	let [t, n] = c(e.open ?? !1), { group: r } = e;
	return /* @__PURE__ */ x("details", {
		open: t,
		name: r,
		onToggle: (t) => {
			let i = t.currentTarget;
			n(i.open), e.onToggle?.(i.open), r && jn(i, i.ownerDocument.querySelectorAll(`details[data-fold-group="${CSS.escape(r)}"]`));
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
				children: /* @__PURE__ */ b(M, { size: 14 })
			}), e.title]
		}), /* @__PURE__ */ b("div", {
			className: "pb-3",
			children: e.children
		})]
	});
}
function Nn(e) {
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
function Pn(e) {
	let n = l(), r = o(() => yn(n), [n]), { openChat: i } = u(), [a, s] = c(null);
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
					s(K(e));
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
function Fn(e) {
	let t = Pn(e.workspaceId);
	return e.workspaceId ? /* @__PURE__ */ x("span", {
		className: `inline-flex flex-wrap items-center gap-2 ${e.className ?? ""}`,
		children: [/* @__PURE__ */ b(X, {
			text: "Open a Kiro Crew chat that knows this page and its settings. It changes nothing.",
			children: (n) => /* @__PURE__ */ x("button", {
				type: "button",
				className: "inline-flex items-center gap-1 text-sm underline",
				"aria-describedby": n,
				onClick: () => void t.ask({
					purpose: "help",
					help: e.help
				}),
				"data-ask-help": !0,
				children: [/* @__PURE__ */ b(xe, {
					size: 14,
					"aria-hidden": "true"
				}), "Ask for help"]
			})
		}), t.error && /* @__PURE__ */ b("span", {
			role: "alert",
			className: "text-xs text-danger",
			children: t.error
		})]
	}) : null;
}
function In(e) {
	let t = xn();
	return /* @__PURE__ */ b("button", {
		type: "button",
		className: `min-w-0 text-left underline ${e.className ?? ""}`,
		onClick: () => t.openTask(e.id),
		"data-task-title": e.id,
		children: e.title
	});
}
function Ln(e) {
	let [t, n] = c({
		reset: e,
		pages: {}
	}), r = t.reset === e ? t.pages : {}, i = (e, t) => Sn(r[e] ?? 1, t);
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
function Rn(e) {
	return e.left <= 0 ? null : /* @__PURE__ */ b("button", {
		type: "button",
		className: "mt-2 text-xs underline",
		onClick: e.onMore,
		"data-show-more": !0,
		children: Cn(e.left)
	});
}
function zn({ tooltip: e, ...t }) {
	return /* @__PURE__ */ b(X, {
		text: e,
		children: (e) => /* @__PURE__ */ b(p, {
			...t,
			"aria-describedby": e
		})
	});
}
var Bn = {
	2: "text-lg",
	3: "text-base",
	4: "text-sm"
};
function Y(e) {
	let t = e.level ?? 3, n = `h${t}`, r = e.view ? cn[e.view] : e.icon;
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
					className: `m-0 flex min-w-0 items-center gap-2 font-semibold leading-snug ${Bn[t]}`,
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
function Vn(e) {
	return /* @__PURE__ */ b(Y, {
		level: 2,
		id: e.id,
		view: e.view,
		title: e.children,
		meta: e.meta,
		actions: e.actions,
		wideActions: e.wideActions
	});
}
function Hn(e) {
	let t = cn[e.view];
	return /* @__PURE__ */ x("span", {
		className: "inline-flex items-center gap-1.5",
		children: [/* @__PURE__ */ b(t, {
			size: 14,
			"aria-hidden": "true",
			style: { flexShrink: 0 }
		}), e.children]
	});
}
// kirocrew-app/ui/src/Modal.tsx
var Un = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", Wn = "color-mix(in srgb, var(--text) 30%, transparent)", Gn = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)"
}, Kn = [], qn = () => Kn.length > 0, Jn = null;
function Yn() {
	Jn || (Jn = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function Xn() {
	!Kn.length && Jn && (document.documentElement.style.overflow = Jn.html, document.body.style.overflow = Jn.body, Jn = null);
}
var Zn = e(null), Qn = () => n(Zn);
function $n(e) {
	let n = On(), r = Xe("(max-width: 767px)"), i = s(null), o = s(null), [l, u] = c(null), d = s(e);
	d.current = e;
	let f = s(!1), p = t(() => {
		let { unsaved: e, onDismiss: t } = d.current;
		if (!e) return t();
		f.current || (f.current = !0, n(e).then((e) => {
			f.current = !1, e && d.current.onDismiss();
		}));
	}, [n]);
	rn(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", p), a(() => {
		let e = i.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), Kn.push(t), Yn(), u(e), (o.current?.querySelector(Un) ?? o.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || Kn.at(-1) !== t || !o.current) return;
			let n = [...o.current.querySelectorAll(Un)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = Ze(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), Kn.splice(Kn.indexOf(t), 1), Xn(), e.open && e.close(), n?.isConnected && n.focus();
		};
	}, []);
	let m = e.title !== void 0, h = r ? {
		width: "100%",
		height: "100%",
		maxHeight: "none",
		borderRadius: 0
	} : m || e.height ? {
		width: `min(${e.width ?? "64rem"}, 94vw)`,
		height: `min(${e.height ?? "52rem"}, 90vh)`,
		borderRadius: 10
	} : {
		width: `min(${e.width ?? "36rem"}, 94vw)`,
		maxHeight: "88vh",
		borderRadius: 10
	}, g = m || e.plain ? "relative flex flex-col overflow-hidden border shadow-lg outline-none" : "relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none";
	return S(/* @__PURE__ */ x("dialog", {
		ref: i,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? "full" : m ? "large" : "box",
		[Zt]: "",
		...e.attrs,
		onCancel: (e) => {
			e.preventDefault(), p();
		},
		style: {
			position: "fixed",
			inset: 0,
			width: "100%",
			height: "100%",
			maxWidth: "none",
			maxHeight: "none",
			margin: 0,
			padding: 0,
			border: "none",
			background: "transparent",
			overflow: "hidden",
			color: "var(--text)"
		},
		children: [/* @__PURE__ */ b("style", { children: "dialog[data-modal]::backdrop{background:transparent}" }), /* @__PURE__ */ x("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ b("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: p,
				style: {
					position: "absolute",
					inset: 0,
					background: Wn
				}
			}), /* @__PURE__ */ b("div", {
				ref: (t) => {
					o.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				tabIndex: -1,
				className: g,
				style: {
					...Gn,
					...h,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ b(Zn.Provider, {
					value: l,
					children: m ? /* @__PURE__ */ x(y, { children: [
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
						e.footer && /* @__PURE__ */ b("div", {
							className: "border-t px-4 py-3",
							style: { borderColor: "var(--border)" },
							children: e.footer
						})
					] }) : e.children
				})
			})]
		})]
	}), document.body);
}
// kirocrew-app/ui/src/Tooltip.tsx
var er = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, tr = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function X(e) {
	let t = i(), n = Qn(), l = s(null), u = s(null), [d, f] = c(!1), [p, m] = c(null), h = o(() => Je({ onChange: f }), []);
	r(() => h.hide, [h]), r(() => {
		if (!d) return;
		let e = (e) => h.key(e.key), t = () => h.hide();
		return document.addEventListener("keydown", e), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [d, h]), a(() => {
		if (!d || !l.current || !u.current) return m(null);
		let e = l.current.getBoundingClientRect(), t = u.current.getBoundingClientRect();
		m(Ke(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [d, e.text]);
	let g = e.text?.trim(), _ = typeof e.children == "function" ? e.children(g ? t : void 0) : e.children;
	return g ? /* @__PURE__ */ x("span", {
		ref: l,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => h.enter(e.pointerType),
		onPointerLeave: h.leave,
		onPointerDown: h.hide,
		onFocus: (e) => h.focus(tr(e.target)),
		onBlur: h.blur,
		"data-tooltip-anchor": !0,
		children: [
			_,
			/* @__PURE__ */ b("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: g
			}),
			d && S(/* @__PURE__ */ x("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": p?.side,
				style: {
					position: "fixed",
					top: p?.top ?? 0,
					left: p?.left ?? 0,
					visibility: p ? "visible" : "hidden",
					zIndex: Ye.tooltip,
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
					animation: er() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ b("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					g,
					p && /* @__PURE__ */ b("span", {
						"aria-hidden": "true",
						style: {
							position: "absolute",
							left: p.arrow - 4,
							[p.side === "top" ? "bottom" : "top"]: -5,
							width: 8,
							height: 8,
							transform: "rotate(45deg)",
							background: "var(--bg-elevated, var(--card))",
							borderRight: p.side === "top" ? "1px solid var(--border)" : void 0,
							borderBottom: p.side === "top" ? "1px solid var(--border)" : void 0,
							borderLeft: p.side === "bottom" ? "1px solid var(--border)" : void 0,
							borderTop: p.side === "bottom" ? "1px solid var(--border)" : void 0
						}
					})
				]
			}), n ?? document.body)
		]
	}) : /* @__PURE__ */ b(y, { children: _ });
}
// kirocrew-app/ui/src/budget-api.ts
var nr = (e) => e == null ? "no cap" : `$${e.toFixed(2)}`, rr = {
	stop: "Stop",
	warn: "Warn"
}, ir = {
	stop: "When a task reaches its cap, no new chat starts for it and its running chats are asked to stop.",
	warn: "When a task reaches its cap, it keeps running and shows Over budget. You decide what to do."
}, ar = (e, t) => `Use the ${e} (${t})`, or = (e) => e.toLocaleString("en-US"), sr = "the avoozl-costs skill (skills/avoozl-costs/SKILL.md in the Avoozl app): every field on Budgets, Prices and Providers, with its default";
function cr(e, t = "") {
	return Object.entries(e).flatMap(([e, n]) => {
		let r = t ? `${t}.${e}` : e;
		return n && typeof n == "object" && !Array.isArray(n) ? cr(n, r) : n == null || n === "" ? [{
			key: r,
			value: "not set (default)"
		}] : [{
			key: r,
			value: Array.isArray(n) ? n.join(", ") : n
		}];
	});
}
var lr = {
	"crew-mode": "a Crew Mode worker",
	remote: "a remote chat",
	"read-failed": "a usage read failed",
	"not-run-by-avoozl": "not run by Avoozl",
	"not-opened-by-tick": "a chat Avoozl did not open"
}, ur = (e) => e.map((e) => lr[e] ?? e).join(", ");
function dr(e) {
	if (e.cap.usd == null && !e.reached) return e.unknown.length ? "Spend unknown" : nr(e.spent);
	let t = e.cap.usd == null ? `${Math.round(e.ratio * 100)}% of cap` : `${nr(e.spent)} / ${nr(e.cap.usd)}`;
	return e.state === "paused" ? `Stopped: ${t}` : e.reached && e.cap.mode === "warn" ? `Over budget: ${t}` : e.reached ? `Budget reached: ${t}` : e.unknown.length ? `${t}, spend unknown` : t;
}
function fr(e) {
	return e.reached ? "over" : e.warning ? "warn" : e.unknown.length ? "unknown" : "muted";
}
var pr = {
	muted: void 0,
	warn: "warning",
	over: "danger",
	unknown: void 0
}, mr = (e) => !!(e && (e.spent > 0 || e.tokens > 0 || e.credits > 0 || e.reached || e.unknown.length));
function hr(e) {
	let t = Number(e.trim().replace(/^\$/, ""));
	return !e.trim() || !Number.isFinite(t) || t <= 0 ? { error: "Enter a dollar amount above 0." } : { usd: Math.round(t * 100) / 100 };
}
function gr(e) {
	return {
		name: `receipt-${e.taskId}.json`,
		text: JSON.stringify(e, null, 2) + "\n"
	};
}
var _r = (e) => ({
	usd: e?.usd == null ? "" : String(e.usd),
	tokens: e?.tokens == null ? "" : String(e.tokens),
	credits: e?.credits == null ? "" : String(e.credits),
	mode: e?.mode ?? ""
});
function vr(e) {
	let t = {}, n = (e, t, n = !1) => {
		if (!e.trim()) return;
		let r = Number(e.trim().replace(/^\$/, ""));
		if (!Number.isFinite(r) || r <= 0 || n && !Number.isInteger(r)) throw Error(`${t} must be ${n ? "a whole number" : "a number"} above 0.`);
		return r;
	};
	try {
		let r = n(e.usd, "Dollar cap"), i = n(e.tokens, "Token cap", !0), a = n(e.credits, "Credit cap");
		r !== void 0 && (t.usd = r), i !== void 0 && (t.tokens = i), a !== void 0 && (t.credits = a);
	} catch (e) {
		return { error: e.message };
	}
	return e.mode && (t.mode = e.mode), Object.keys(t).length ? { budget: t } : {};
}
function yr(e) {
	return e.toLowerCase().replace(/^.*\//, "").replace(/^(?:[a-z]+\.)+(?=claude-)/, "").replace(/(?:-v\d+(?::\d+)?|-\d{8}|-latest)+$/, "").replace(/(\d)-(\d)(?!\d)/g, "$1.$2");
}
function br(e, t) {
	let n = e.defaults?.models;
	return n ? n[t] ?? n[yr(t)] ?? null : null;
}
var xr = (e) => `$${e}`;
function Sr(e) {
	return e.defaults ? `Prices last updated ${e.defaults.updated}.` : "Built-in prices are off until the override list below is fixed.";
}
function Cr(e, t) {
	let n = e.caps ?? {
		tokens: 2e6,
		credits: 200
	}, r = e.models[t.model], i = br(e, t.model), a = t.priced ?? (r ? "override" : i ? "default" : "none");
	return a === "credits" ? {
		kind: a,
		text: `Kiro Crew bills this model in credits, so it is budgeted in credits: ${or(n.credits)} credits per task.`
	} : a === "override" && r ? {
		kind: a,
		text: `${xr(r.inputPerMTokUsd)} in, ${xr(r.outputPerMTokUsd)} out per million tokens (your price).`
	} : a === "default" && i ? {
		kind: a,
		text: `${xr(i.inputPerMTokUsd)} in, ${xr(i.outputPerMTokUsd)} out per million tokens (built-in price).`
	} : {
		kind: "none",
		text: `No known price, so Avoozl cannot count it in dollars. It counts against the token cap instead: ${or(n.tokens)} tokens per task.`
	};
}
function wr(e, t = []) {
	let n = e.seen.filter((e) => e.model !== "unknown"), r = new Set(n.map((e) => e.model));
	return [...n, ...t.filter((e) => !r.has(e)).sort().map((e) => ({
		model: e,
		turns: 0,
		unpricedTurns: 0
	}))].map((t) => ({
		...t,
		...Cr(e, t)
	}));
}
function Tr(e, t = []) {
	let n = new Map(e.seen.map((e) => [e.model, e])), r = [.../* @__PURE__ */ new Set([
		...Object.keys(e.models),
		...t,
		...e.seen.map((e) => e.model)
	])].filter((e) => e !== "unknown");
	return {
		creditUsd: e.creditUsd == null ? "" : String(e.creditUsd),
		rows: r.sort().map((t) => {
			let r = br(e, t);
			return {
				model: t,
				input: e.models[t] ? String(e.models[t].inputPerMTokUsd) : "",
				output: e.models[t] ? String(e.models[t].outputPerMTokUsd) : "",
				unpricedTurns: n.get(t)?.unpricedTurns ?? 0,
				...r ? {
					defaultInput: String(r.inputPerMTokUsd),
					defaultOutput: String(r.outputPerMTokUsd)
				} : {}
			};
		})
	};
}
function Er(e) {
	let t = (e) => {
		let t = Number(e.trim().replace(/^\$/, ""));
		return e.trim() && Number.isFinite(t) && t >= 0 ? t : null;
	}, n = {};
	for (let r of e.rows) {
		if (!r.input.trim() && !r.output.trim()) continue;
		let e = t(r.input), i = t(r.output);
		if (e === null || i === null) return { error: `Give ${r.model} both prices as dollars of 0 or more.` };
		n[r.model] = {
			inputPerMTokUsd: e,
			outputPerMTokUsd: i
		};
	}
	if (e.creditUsd.trim()) {
		let r = t(e.creditUsd);
		return r === null ? { error: "Credit price must be dollars of 0 or more." } : { input: {
			creditUsd: r,
			models: n
		} };
	}
	return { input: { models: n } };
}
function Dr(e) {
	let t = (t, n, r = {}) => e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, "budget.view"),
		receipt: (e, n) => t(e, "budget.receipt", { taskId: n }),
		raise: (e, n, r) => t(e, "budget.raise", {
			taskId: n,
			usd: r
		}),
		stop: (e, n) => t(e, "budget.stop", { taskId: n }),
		acknowledge: (e, n) => t(e, "budget.acknowledge", { taskId: n }),
		switchToStop: (e, n) => t(e, "budget.switchToStop", { taskId: n }),
		prices: (e) => t(e, "prices.get"),
		savePrices: (e, n, r) => t(e, "prices.save", {
			...n,
			...r ? { expectedHash: r } : {}
		})
	};
}
// kirocrew-app/ui/src/Budget.tsx
function Or({ budget: e }) {
	if (!mr(e)) return null;
	let t = fr(e), n = /* @__PURE__ */ b(G, {
		variant: pr[t],
		children: dr(e)
	});
	return e.unknown.length ? /* @__PURE__ */ b(X, {
		text: `Spend unknown: ${ur(e.unknown)}. The budget does not stop a task for that.`,
		children: (e) => /* @__PURE__ */ b("span", {
			"data-budget-chip": t,
			tabIndex: 0,
			"aria-describedby": e,
			children: n
		})
	}) : /* @__PURE__ */ b("span", {
		"data-budget-chip": t,
		children: n
	});
}
function kr(e) {
	let t = Dr(l()), { budget: n } = e, [r, i] = c(() => String(Math.max(1, Math.ceil((n.cap.usd ?? n.spent) * 1.5)))), [a, o] = c(null), [s, u] = c(!1), d = async (t, n) => {
		u(!0), o(null);
		try {
			await t(), await e.onDone(n);
		} catch (e) {
			o(K(e));
		} finally {
			u(!1);
		}
	}, f = () => {
		let n = hr(r);
		return n.error ? o(n.error) : d(() => t.raise(e.workspaceId, e.taskId, n.usd), `Budget raised to ${nr(n.usd)}.`);
	}, m = n.state === "open", h = n.over?.open && n.state === null;
	return !m && !h && n.state !== "paused" ? null : /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-end gap-2",
			children: [
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [/* @__PURE__ */ b("span", { children: "New cap in dollars" }), /* @__PURE__ */ b("input", {
						className: "rounded border px-2 py-1",
						style: {
							borderColor: "var(--border)",
							background: "var(--bg)",
							color: "var(--text)",
							width: "8rem"
						},
						inputMode: "decimal",
						value: r,
						onChange: (e) => i(e.target.value),
						"aria-describedby": a ? `budget-error-${e.taskId}` : void 0
					})]
				}),
				/* @__PURE__ */ b(p, {
					disabled: s,
					onClick: f,
					children: "Raise budget"
				}),
				h && /* @__PURE__ */ b(p, {
					variant: "ghost",
					disabled: s,
					onClick: () => d(() => t.acknowledge(e.workspaceId, e.taskId), "Acknowledged."),
					children: "Acknowledge"
				}),
				h && /* @__PURE__ */ b(p, {
					variant: "ghost",
					disabled: s,
					onClick: () => d(() => t.switchToStop(e.workspaceId, e.taskId), "Switched to stop."),
					children: "Switch to stop"
				}),
				m && /* @__PURE__ */ b(p, {
					variant: "ghost",
					disabled: s,
					onClick: () => d(() => t.stop(e.workspaceId, e.taskId), "Stopped. It waits like a Deferred task."),
					children: "Stop"
				})
			]
		}), a && /* @__PURE__ */ b("p", {
			id: `budget-error-${e.taskId}`,
			role: "alert",
			className: "text-sm",
			style: { color: "var(--danger)" },
			children: a
		})]
	});
}
var Ar = (e) => Number.isInteger(e) ? String(e) : e.toFixed(2);
function jr({ title: e, rows: t, name: n }) {
	return t.length ? /* @__PURE__ */ x("table", {
		className: "w-full text-sm",
		style: { borderCollapse: "collapse" },
		children: [
			/* @__PURE__ */ b("caption", {
				className: "text-left text-xs font-semibold text-muted",
				children: e
			}),
			/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
				className: "text-left text-xs text-muted",
				children: [
					/* @__PURE__ */ b("th", {
						scope: "col",
						children: n[0].toUpperCase() + n.slice(1)
					}),
					/* @__PURE__ */ b("th", {
						scope: "col",
						children: "In"
					}),
					/* @__PURE__ */ b("th", {
						scope: "col",
						children: "Out"
					}),
					/* @__PURE__ */ b("th", {
						scope: "col",
						children: "Credits"
					}),
					/* @__PURE__ */ b("th", {
						scope: "col",
						children: "Dollars"
					})
				]
			}) }),
			/* @__PURE__ */ b("tbody", { children: t.map((e) => /* @__PURE__ */ x("tr", {
				style: { borderTop: "1px solid var(--border)" },
				children: [
					/* @__PURE__ */ x("td", {
						className: "break-all",
						children: [e[n], e.shared ? /* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: " (shared)"
						}) : null]
					}),
					/* @__PURE__ */ b("td", { children: Ar(e.input) }),
					/* @__PURE__ */ b("td", { children: Ar(e.output) }),
					/* @__PURE__ */ b("td", { children: Ar(e.credits) }),
					/* @__PURE__ */ b("td", { children: e.priced ? nr(e.usd) : /* @__PURE__ */ b("span", {
						className: "text-muted",
						children: e.usd ? `${nr(e.usd)} + unpriced` : "unpriced"
					}) })
				]
			}, String(e[n]))) })
		]
	}) : null;
}
function Mr(e) {
	let n = Dr(l()), [i, a] = c(null), [o, s] = c(null), [u, d] = c(null), f = t(() => n.receipt(e.workspaceId, e.taskId).then((e) => {
		a(e), s(null);
	}, (e) => s(K(e))), [e.workspaceId, e.taskId]);
	if (r(() => {
		f();
	}, [f]), o) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: o
	});
	if (!i) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let m = {
		taskId: i.taskId,
		spent: i.totals.usd,
		tokens: i.totals.input + i.totals.output,
		credits: i.totals.credits,
		unpricedTurns: i.totals.unpricedTurns,
		cap: i.cap,
		ratio: i.warning.ratio,
		warning: i.warning.at80,
		reached: i.warning.ratio >= 1,
		state: i.state,
		over: i.over,
		unknown: i.missing.map((e) => e.reason),
		unpricedModels: i.byModel.filter((e) => !e.priced).map((e) => String(e.model))
	}, h = () => {
		let e = gr(i), t = URL.createObjectURL(new Blob([e.text], { type: "application/json" })), n = document.createElement("a");
		n.href = t, n.download = e.name, n.click(), URL.revokeObjectURL(t);
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-budget-fold": i.taskId,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ x("span", {
						className: "font-semibold",
						children: [
							nr(i.totals.usd),
							" of ",
							nr(i.cap.usd)
						]
					}),
					mr(m) && /* @__PURE__ */ b(Or, { budget: m }),
					i.warning.at80 && !m.reached && /* @__PURE__ */ b(G, {
						variant: "warning",
						children: "80% of the cap"
					})
				]
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					i.cap.usd == null ? "No dollar cap is set." : `Cap from the ${i.cap.level} level. `,
					ir[i.cap.mode],
					" Turns with no dollar price count against",
					" ",
					Ar(i.cap.tokens ?? 0),
					" tokens, and turns billed in credits against ",
					Ar(i.cap.credits ?? 0),
					" credits.",
					i.readAt ? ` Last usage read ${new Date(i.readAt).toLocaleString()}.` : ""
				]
			}),
			!i.complete && /* @__PURE__ */ x("p", {
				className: "text-sm",
				role: "status",
				children: [
					"Spend unknown for part of this task:",
					" ",
					ur([...new Set(i.missing.map((e) => e.reason))]),
					". The budget does not stop it for that."
				]
			}),
			i.overrun ? /* @__PURE__ */ x("p", {
				className: "text-sm",
				children: [
					"Ran ",
					nr(i.overrun),
					" past the cap before the stop took hold."
				]
			}) : null,
			u && /* @__PURE__ */ b("p", {
				className: "text-sm",
				role: "status",
				children: u
			}),
			/* @__PURE__ */ b(kr, {
				workspaceId: e.workspaceId,
				taskId: i.taskId,
				budget: m,
				onDone: async (t) => {
					d(t), await f(), e.onChange?.();
				}
			}),
			/* @__PURE__ */ b(jr, {
				title: "By stage",
				rows: i.byStage,
				name: "stage"
			}),
			/* @__PURE__ */ b(jr, {
				title: "By model",
				rows: i.byModel,
				name: "model"
			}),
			/* @__PURE__ */ b(jr, {
				title: "By attempt",
				rows: i.byAttempt,
				name: "attempt"
			}),
			i.raises.length > 0 && /* @__PURE__ */ b("ul", {
				className: "text-xs text-muted",
				children: i.raises.map((e, t) => /* @__PURE__ */ x("li", { children: [
					e.by,
					" raised ",
					nr(e.from.usd ?? null),
					" to ",
					nr(e.to.usd ?? null),
					" ",
					"on ",
					new Date(e.at).toLocaleString(),
					" (prices v",
					e.priceVersion,
					")"
				] }, t))
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Prices version ",
					i.price.version,
					i.price.version === 0 ? ": none set. Add them in Settings › Prices." : "."
				]
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
				variant: "ghost",
				onClick: h,
				children: "Export JSON"
			}) })
		]
	});
}
// kirocrew-app/ui/src/views-api.ts
var Nr = {
	check: "failed checks",
	review: "review",
	comment: "comment",
	conflict: "conflict",
	"auto-merge": "auto-merge off"
}, Pr = {
	session: "sent to the worker",
	conductor: "queued for the conductor",
	"new attempt": "carried to a new attempt"
}, Fr = {
	bound: "stopped: all rounds used",
	"same-check": "stopped: the same check failed 3 times",
	blocked: "stopped: the worker is blocked"
};
function Ir(e) {
	let t = [`${e.rounds} of ${e.bound ?? "?"} rounds`];
	return e.latest && t.push(`last: ${e.latest.kinds.map((e) => Nr[e] ?? e).join(", ")}, ${Pr[e.latest.to] ?? e.latest.to}`), e.stopped && t.push(Fr[e.stopped] ?? `stopped: ${e.stopped}`), t.join(" · ");
}
function Lr(e) {
	let t = async (t, n, r, i) => (await e.post(ln, {
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
				"phase",
				"repository",
				"status",
				"plan",
				"spec"
			]) n[e] && (r[e] = n[e]);
			return t("graph.view", r, e);
		},
		epic: (e, n) => t("epic.get", { id: n }, e),
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
function Rr(e) {
	return {
		tasks: e.tasks.length,
		edges: e.edges.length,
		blocking: e.edges.filter((e) => e.blocking).length,
		ready: e.tasks.filter((e) => e.ready).length
	};
}
function zr(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var Br = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#])|code-review-sage(?:$|[/?#]))[^\s\\]*$/;
function Z(e) {
	return typeof e == "string" && Br.test(e) ? e : zr(e) ?? void 0;
}
function Vr(e) {
	return [
		`${e.role} #${e.attempt}`,
		e.crewUnreachable ? "crew unreachable" : e.status ?? "not observed",
		e.crew && e.crew !== "local" ? `on ${e.crew}` : null,
		e.agent && e.agent !== "kirocrew-worker" ? e.agent : null,
		Hr(e)
	].filter(Boolean).join(" · ");
}
function Hr(e) {
	if (e.served === void 0) return e.model ?? null;
	let t = `requested ${e.model ?? "agent default"}`;
	if (!e.served) return `${t}, served model not reported`;
	let n = [e.served.withheld ? "withheld" : null, e.served.changed ? "changed mid-session" : null].filter(Boolean).join(", ");
	return `${t}, served ${e.served.model ?? "unknown"}${n ? ` (${n})` : ""}`;
}
function Ur(e) {
	let t = e.outcome === "refused" ? `${e.verdict ?? "verdict"} refused` : e.verdict ?? (e.outcome === "failed" ? "no verdict" : e.outcome), n = e.served && e.served !== e.model ? `${e.model ?? "model unknown"} → served ${e.served}` : e.model ?? "model unknown";
	return [
		e.role,
		t,
		n,
		e.stale ? "stale" : null
	].filter(Boolean).join(" · ");
}
function Wr(e) {
	return [
		e.reviewer,
		e.state,
		e.stale ? `stale (${e.commit?.slice(0, 12) ?? "older commit"})` : null,
		e.allowed ? null : `ignored: ${e.reason ?? "not allowed"}`
	].filter(Boolean).join(" · ");
}
function Gr(e) {
	return Object.entries(e).filter(([e, t]) => e !== "taskId" && [
		"string",
		"number",
		"boolean"
	].includes(typeof t)).map(([e, t]) => [e, String(t)]);
}
var Kr = {
	decision: "Open decision",
	"needs-human": "Needs you",
	review: "Review",
	"stale-session": "Session ended",
	resource: "Shared resource",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable",
	budget: "Budget reached",
	"over-budget": "Over budget",
	"provider-out": "Provider out"
};
function qr(e) {
	return (e.authority ?? "local") === "local" && !e.supersededBy && e.status !== "superseded";
}
function Jr(e) {
	let t = {};
	return e.id.trim() && (t.id = e.id.trim()), e.title.trim() && (t.title = e.title.trim()), t;
}
var Yr = /* @__PURE__ */ new Set([
	"closed",
	"lost",
	"gone"
]);
function Xr(e) {
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
		live: !Yr.has(n.status ?? "")
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
function Zr(e) {
	return e === "running" ? "Waiting on your decision: marked running, but no session is running" : "Waiting on your decision: marked in review, but no review is running";
}
// kirocrew-app/ui/src/dashboard-api.ts
var Qr = /* @__PURE__ */ new Set(["closed", "lost"]);
function $r(e) {
	return e.group ? { kind: "review" } : e.taskId ? {
		kind: "task",
		id: e.taskId
	} : {
		kind: "tab",
		tab: e.tab
	};
}
function ei(e) {
	let t = $r(e);
	return t.kind === "review" ? "Open the list of tasks to review" : t.kind === "task" ? `Open ${t.id} in the drawer` : t.tab === "conflicts" ? "Open it in Conflicts" : "Open it in Delivery";
}
var ti = (e) => zr(e.issue?.url ?? null);
function ni(e) {
	return [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null;
}
function ri(e) {
	return e.complete ? null : e.deliveries.some((e) => e.state === "decision") ? "Stopped after its retries; retry it or dismiss the findings." : null;
}
function ii(e) {
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
	}, o = new Set((r ?? []).filter((e) => !e.complete && e.sessions.some((e) => !Qr.has(e.status ?? ""))).map((e) => e.id));
	for (let e of i) {
		let t = dt(e);
		a[t === "done" ? "done" : o.has(e.id) ? "running" : t === "running" ? "needs-you" : t] += 1;
	}
	let s = [], c = /* @__PURE__ */ new Set(), l = (e) => {
		c.has(e.key) || (c.add(e.key), s.push(e));
	};
	for (let t of e.delivery ?? []) {
		let e = ri(t);
		e && l({
			key: `delivery:${t.id}`,
			kind: "delivery",
			taskId: t.id,
			title: t.title,
			detail: e,
			tab: "delivery",
			href: ti(t)
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
		href: ti(t)
	});
	let d = (r ?? []).filter((e) => !e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		budget: e.budget ?? null,
		sessions: e.sessions.filter((e) => !Qr.has(e.status ?? ""))
	})).filter((e) => e.sessions.length > 0), f = new Map((n?.tasks ?? []).map((e) => [e.id, e])), p = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), m = d.flatMap((e) => e.sessions.map((t) => {
		let n = f.get(e.id)?.epic ?? null;
		return {
			slot: t.slot,
			role: t.role,
			focus: t.title,
			taskId: e.id,
			title: e.title,
			epic: n ? p.get(n) ?? n : null,
			attempt: t.attempt,
			model: Hr(t),
			startedAt: t.boundAt,
			lastAt: t.statusAt ?? t.boundAt,
			status: t.status,
			session: t,
			budget: e.budget
		};
	})).sort((e, t) => (t.lastAt ?? "").localeCompare(e.lastAt ?? "")), h = n ? ft(n) : /* @__PURE__ */ new Map(), g = i.filter((e) => dt(e) === "ready").map((e) => ({
		...e,
		wave: h.get(e.id) ?? 1
	})).sort((e, t) => (e.order ?? Infinity) - (t.order ?? Infinity) || e.wave - t.wave || e.id.localeCompare(t.id)), _ = (e.delivery ?? []).filter((e) => e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		at: ni(e),
		issue: ti(e),
		pulls: e.pullRequests.flatMap((e) => {
			let t = zr(e.url);
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
	for (let e of n?.epics ?? []) b.set(e.id, {
		epic: e.id,
		title: e.title,
		done: 0,
		total: 0,
		running: y.get(e.id) ?? 0
	});
	let x = 0;
	for (let e of i) {
		let t = e.epic && v.has(e.epic) ? e.epic : null;
		t === null && (x += 1);
		let n = b.get(t) ?? {
			epic: null,
			title: "No epic",
			done: 0,
			total: 0,
			running: 0
		};
		n.total += 1, dt(e) === "done" && (n.done += 1), b.set(t, n);
	}
	for (let [e, t] of b) (!t.total || e === null && !x) && b.delete(e);
	let S = (e.plans?.items ?? []).filter((e) => !e.archivedAt), C = (e.plans?.items ?? []).length - S.length;
	return {
		attention: s,
		counts: a,
		running: d,
		inFlight: m,
		overBudget: (e.delivery ?? []).filter((e) => !e.complete && e.budget?.reached).length,
		readyNext: g,
		recent: _,
		progress: [...b.values()],
		plans: {
			approved: S.filter((e) => e.state === "approved").length,
			draft: S.filter((e) => e.state === "draft").length,
			total: (e.plans?.total ?? S.length + C) - C
		}
	};
}
var ai = "(max-width: 480px)";
function oi(e, t) {
	return t ? "small" : e ? "wide" : "medium";
}
function si(e) {
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
function ci(e) {
	return e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `${e.document}, lines ${e.lineStart}–${e.lineEnd}` : `${e.document}, line ${e.lineStart}` : e.document;
}
function li(e, t) {
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
var ui = (e) => e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `Lines ${e.lineStart}–${e.lineEnd}` : `Line ${e.lineStart}` : null, di = (e) => !!e && !e.startsWith("/") && !/^[A-Za-z]:/.test(e) && !e.split(/[\\/]/).includes("..");
function fi(e, t) {
	let n = -1;
	return e.forEach((r, i) => {
		r <= t && (n < 0 || r >= e[n]) && (n = i);
	}), n;
}
function pi(e, t, n) {
	if (!t) return [];
	if (n && n > t) {
		let r = e.flatMap((e, r) => e.line >= t && e.line <= n ? [r] : []);
		if (r.length) return r;
	}
	let r = fi(e.map((e) => e.line), t);
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
function mi(e) {
	let t = async (t, n, r, i) => (await e.post(ln, {
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
function hi(e, t, n) {
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
function gi(e, t) {
	let n = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 60).replace(/-+$/, "");
	if (n.length < 3 && (n = `task-${n || "new"}`.replace(/-+$/, "")), !t.has(n)) return n;
	for (let e = 2;; e++) if (!t.has(`${n}-${e}`)) return `${n}-${e}`;
}
var _i = [
	"merged-pr",
	"integrated",
	"released",
	"answered"
], vi = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean);
function yi() {
	return {
		id: "",
		title: "",
		summary: "",
		repository: "",
		acceptance: "",
		checks: "",
		prerequisites: []
	};
}
function bi(e) {
	return {
		id: e.task.id,
		title: e.task.title,
		summary: e.task.summary,
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
function xi(e, t) {
	let n = { id: e.id.trim() }, r = (e, r, i) => {
		t && JSON.stringify(r) === JSON.stringify(i) || (n[e] = r);
	};
	r("title", e.title.trim(), t?.title.trim()), r("summary", e.summary.trim(), t?.summary.trim()), r("acceptance", vi(e.acceptance), t ? vi(t.acceptance) : void 0), r("checks", vi(e.checks), t ? vi(t.checks) : void 0), r("repository", e.repository.trim() || void 0, t && t.repository.trim() || void 0), n.repository === void 0 && delete n.repository;
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
function Si(e) {
	return /Database changed/.test(e) ? "This task changed elsewhere. Reload it, then make your change again." : e;
}
function Q(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
function Ci(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.floor((t - n) / 6e4));
	if (r < 60) return `${r} min`;
	let i = Math.floor(r / 60);
	return i < 24 ? `${i} h ${r % 60} min` : `${Math.floor(i / 24)} d ${i % 24} h`;
}
function wi(e) {
	return e.crew && e.crew !== "local" ? e.link ?? null : Ti(e);
}
function Ti(e) {
	if (e.link) return e.link;
	let t = e.slot.startsWith("dashboard:") ? e.slot.slice(10) : e.slot;
	return `/chat?sid=${encodeURIComponent(t)}`;
}
// kirocrew-app/ui/src/routing-api.ts
var Ei = {
	local: 3,
	remote: 2
}, Di = 4e3, Oi = [
	"os",
	"arch",
	"tools",
	"trust"
], ki = "Off: every task runs on this machine, as before.", Ai = {
	online: "Online",
	ready: "Ready",
	reach: "Reaches repos"
};
function ji(e, t) {
	if (e.includes(t.text)) return e;
	let n = e.trimEnd();
	return n ? `${n}\n${t.text}` : t.text;
}
function Mi(e) {
	let t = e.prompt.trim();
	return t.length > 4e3 ? { error: `The prompt is at most ${Di} characters.` } : e.enabled && !t ? { error: "Write a routing prompt before you turn routing on." } : { routing: {
		...e.enabled ? { enabled: !0 } : {},
		...t ? { prompt: t } : {},
		...e.model ? { model: e.model } : {}
	} };
}
function Ni(e, t = {}) {
	let n = {}, r = e.lowPercent.trim();
	if (r) {
		let e = Number(r);
		if (!Number.isInteger(e) || e < 1 || e > 99) return { error: "Low at is a whole number 1–99." };
		n.lowPercent = e;
	}
	let i = {};
	for (let [e, n] of Object.entries(t)) n.tokens && (i[e] = { tokens: n.tokens });
	for (let [t, n] of Object.entries(e.limits)) {
		if (!n.trim()) continue;
		let e = Number(n);
		if (!Number.isFinite(e) || e <= 0) return { error: `${t}: the limit is a number of credits above 0.` };
		i[t] = {
			...i[t],
			credits: e
		};
	}
	return Object.keys(i).length && (n.limits = i), { providers: n };
}
var Pi = (e) => e === "ok" ? "ok" : e === "low" ? "low" : "out";
function Fi(e) {
	return e.percent === null ? !e.credits && !e.tokens ? "no usage" : `${Math.round(e.credits * 10) / 10} credits, ${e.tokens} tokens` : `${e.percent}% used`;
}
function Ii(e) {
	let t = e.reading, n = (e, t, n = 0) => e == null ? "–" : `${e.toFixed(n)}${t}`;
	return {
		load: n(t?.loadPerCpu, "", 1),
		mem: n(t?.memFreeGb, " GB"),
		disk: n(t?.diskFreeGb, " GB")
	};
}
var Li = (e) => e.ok ? "yes" : e.why ?? "no";
function Ri(e) {
	return `${e.crew} / ${e.model ?? "default"}`;
}
var zi = (e) => String(e.id === "local" ? Ei.local : Ei.remote);
function Bi(e) {
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
var Vi = (e) => e.split(/[\s,]+/).filter(Boolean);
function Hi(e, t) {
	let n = Vi(t.tags);
	for (let e of n) {
		let t = e.split(":")[0];
		if (!e.includes(":") || !Oi.includes(t)) return { error: `Tag ${e}: use key:value with key ${Oi.join(", ")}.` };
	}
	let r = { tags: [...n.filter((e) => !e.startsWith("trust:")), `trust:${e === "local" ? "local" : t.trust}`] }, i = Vi(t.gitHosts);
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
function Ui(e) {
	let t = {};
	for (let n of e) {
		if (!n.configured) continue;
		let e = Hi(n.id, Bi(n));
		e.entry && (t[n.id] = e.entry);
	}
	return t;
}
function Wi(e) {
	let t = (t, n, r = {}) => e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, "routing.view"),
		preview: (e) => t(e, "routing.preview"),
		save: (e, n) => t(e, "routing.update", {
			where: "machine",
			...n
		}),
		saveProviders: (e, n) => t(e, "providers.settings.update", n),
		saveCrews: (e, n) => t(e, "crews.update", n),
		pickAgain: (e, n) => t(e, "delivery.pickAgain", { taskId: n })
	};
}
// kirocrew-app/ui/src/plans-api.ts
var Gi = "Uncategorized";
function Ki(e) {
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
function qi(e) {
	return e.total ? Math.round(e.done / e.total * 100) : null;
}
function Ji(e) {
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
function Yi(e) {
	return `Use the Avoozl skill's "Plan a goal" steps 2 to 4 to change ${e.spec ? `the existing spec folder .kiro/specs/${e.spec}/${e.planId ? ` (plan ${e.planId})` : ""}` : `the stored spec ${e.planId}, which has no spec folder yet; move it to .kiro/specs/<name>/ first`}. Ask me what should change. Edit it in a planner session, critique it in a second isolated session, store the new revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Specs view.`;
}
function Xi(e) {
	let t = async (t, n, r = {}) => (await e.post(ln, {
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
var Zi = (e, t, n = t + "s") => `${e} ${e === 1 ? t : n}`;
function Qi(e) {
	return e.retire ? [
		`${Zi(e.open, "open task")}: archived. Their rows stay as history.`,
		`${Zi(e.running, "running chat")}: left alone. Each task is archived when its chat ends.`,
		`${Zi(e.done, "done task")}: kept as they are.`,
		`${Zi(e.dependents, "task")} outside the spec that wait on it: each gets a decision for you.`,
		"The spec is marked deleted and stays in history. There is no undo button."
	] : ["The draft is marked deleted. No task was made from it.", "The spec stays in history."];
}
var $i = [
	["requirements.md", "Requirements"],
	["bugfix.md", "Bugfix"],
	["design.md", "Design"],
	["tasks.md", "Tasks"]
];
function ea(e) {
	return e ? $i.filter(([t]) => typeof e.documents?.[t] == "string").map(([t, n]) => ({
		file: t,
		label: n,
		text: e.documents[t]
	})) : [];
}
var ta = (e) => e ? e.slice(0, 12) : "—", na = (e) => `${e.file ?? "tasks.md"}:${e.lineStart}`;
function ra(e) {
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
function ia(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.repository ?? "unknown repository";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return [...t];
}
function aa(e) {
	return e ? e.disk.changed ? "The folder changed on disk. Reload it first." : e.approvals.some((t) => t.hash === e.hash) ? "This revision is approved." : e.quality.canApprove ? null : "Fix the errors below first." : "Store this spec first.";
}
function oa(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "";
	return e.filter((e) => (!e.archived || t.archived) && (!n || e.name.toLowerCase().includes(n) || (e.spec ?? "").toLowerCase().includes(n) || (e.planId ?? "").toLowerCase().includes(n)) && (!t.category || (e.category ?? "Uncategorized") === t.category) && (!t.status || e.status === t.status) && (!t.kind || e.kind === t.kind) && (!t.has || (t.has === "ready" ? e.now.ready > 0 : t.has === "running" ? e.now.running > 0 : e.now.needsYou > 0)));
}
function sa(e) {
	let t = (t) => [...new Set(e.map(t))].sort((e, t) => e === "Uncategorized" ? 1 : t === "Uncategorized" ? -1 : e.localeCompare(t));
	return {
		categories: t((e) => e.category ?? "Uncategorized"),
		statuses: t((e) => e.status)
	};
}
var ca = (e) => ({
	plan: e.key,
	purpose: "discuss-plan"
}), la = [
	"Its open tasks stop starting. Running chats keep going.",
	"Tasks in other specs that wait on it get a decision for you.",
	"It is hidden on Specs, Graph, Delivery and the Dashboard. Show archived brings it back.",
	"Nothing is deleted, and its spec folder is not touched. Unarchive undoes all of it."
];
function ua(e) {
	let t = e.action === "archived" ? "Archived" : e.action === "unarchived" ? "Unarchived" : e.action;
	return e.by ? `${t} by ${e.by}` : t;
}
// kirocrew-app/ui/src/useRead.ts
function da(e, n) {
	let [i, a] = c(null), [o, s] = c(null), [l, u] = c(!1), d = t(async () => {
		if (e) {
			u(!0), s(null);
			try {
				a(await n(e));
			} catch (e) {
				s(K(e));
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
// kirocrew-app/ui/src/FilterSelect.tsx
var fa = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function pa(e) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e.id,
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: { maxWidth: "13rem" },
		children: [
			/* @__PURE__ */ b("span", { children: e.label }),
			/* @__PURE__ */ x("select", {
				id: e.id,
				value: e.value,
				disabled: e.disabled,
				"aria-describedby": e.hint ? `${e.id}-hint` : void 0,
				onChange: (t) => e.onChange(t.target.value),
				className: "rounded border px-2 py-1 text-sm",
				style: fa,
				children: [/* @__PURE__ */ b("option", {
					value: "",
					children: "All"
				}), e.options.map((e) => /* @__PURE__ */ b("option", {
					value: e.value,
					children: e.label
				}, e.value))]
			}),
			e.hint && /* @__PURE__ */ b("span", {
				id: `${e.id}-hint`,
				className: "text-xs text-muted",
				children: e.hint
			})
		]
	});
}
function ma(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function ha(e, t, n = 50) {
	let r = t.trim().toLowerCase();
	if (!r) return {
		shown: e.items.slice(0, n),
		total: e.items.length
	};
	let i = [], a = [], o = 0;
	for (let t = 0; t < e.items.length; t++) e.text[t].includes(r) && (o += 1, e.ids[t].startsWith(r) ? i.length < n && i.push(e.items[t]) : a.length < n && a.push(e.items[t]));
	return {
		shown: [...i, ...a].slice(0, n),
		total: o
	};
}
function ga(e, t, n) {
	let r = n - 1;
	return t === "ArrowDown" ? {
		kind: "move",
		state: {
			open: !0,
			active: e.open ? Math.min(r, e.active + 1) : 0
		}
	} : t === "ArrowUp" ? {
		kind: "move",
		state: {
			open: !0,
			active: e.open ? Math.max(0, e.active - 1) : r
		}
	} : t === "Home" && e.open ? {
		kind: "move",
		state: {
			open: !0,
			active: 0
		}
	} : t === "End" && e.open ? {
		kind: "move",
		state: {
			open: !0,
			active: r
		}
	} : t === "Enter" ? e.open && e.active >= 0 && e.active < n ? {
		kind: "pick",
		index: e.active
	} : { kind: "none" } : t === "Escape" ? e.open ? { kind: "close" } : { kind: "clear" } : { kind: "none" };
}
var _a = (e) => e.map((e) => ({
	id: e.value,
	title: e.label
})), va = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function ya(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => ma(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = d && u ? va(d) : "", [p, m] = c(f), [h, g] = c(!1), [_, v] = c(!1), [y, S] = c(0), C = s(null);
	r(() => {
		h || m(f);
	}, [f, h]);
	let { shown: w, total: T } = o(() => ha(l, h ? p : ""), [
		l,
		p,
		h
	]);
	r(() => {
		C.current?.querySelector(`#${CSS.escape(`${n}-opt-${y}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [y, n]);
	let E = (t) => {
		e.onPick(t.id), g(!1), v(!1), m(u ? va(t) : "");
	}, D = (t) => {
		let n = ga({
			open: _,
			active: y
		}, t.key, w.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (v(!0), S(n.state.active)) : n.kind === "pick" ? E(w[n.index]) : n.kind === "close" ? v(!1) : (m(""), g(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, O = _ && (w.length > 0 || h);
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ b("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ b("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": O,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": O && w.length ? `${n}-opt-${y}` : void 0,
				autoComplete: "off",
				spellCheck: !1,
				value: p,
				placeholder: e.value ? void 0 : e.emptyLabel ?? e.placeholder,
				onChange: (e) => {
					m(e.target.value), g(!0), v(!0), S(0);
				},
				onFocus: () => {
					v(!0), S(0);
				},
				onBlur: () => {
					v(!1), h && !p.trim() && e.emptyLabel !== void 0 && e.value && e.onPick(""), g(!1);
				},
				onKeyDown: D,
				className: "rounded border px-2 py-1 text-sm",
				style: fa,
				"data-picker": !0
			}),
			/* @__PURE__ */ x("div", {
				hidden: !O,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: Ye.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ b("ul", {
						ref: C,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: w.map((e, t) => /* @__PURE__ */ x("li", {
							id: `${n}-opt-${t}`,
							role: "option",
							"aria-selected": t === y,
							onMouseDown: (t) => {
								t.preventDefault(), E(e);
							},
							onMouseEnter: () => S(t),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: t === y ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								/* @__PURE__ */ b("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.id
								}),
								/* @__PURE__ */ b("span", {
									className: "min-w-0 flex-1 truncate",
									children: e.title === e.id ? "" : e.title
								}),
								e.spec && /* @__PURE__ */ b("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.spec
								}),
								e.state && /* @__PURE__ */ b("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: e.state
								})
							]
						}, e.id))
					}),
					T === 0 && /* @__PURE__ */ b("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					T > w.length && /* @__PURE__ */ x("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [T - w.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var ba = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), xa = {
	...fa,
	width: "4.5rem"
}, Sa = (e) => {
	let t = Number(e);
	return Number.isInteger(t) && t > 0 ? t : void 0;
};
function Ca({ id: e, field: t }) {
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
			style: fa
		})]
	}) : t.kind === "select" ? /* @__PURE__ */ b(pa, {
		id: n,
		label: t.label,
		value: t.value,
		options: t.options,
		onChange: t.onChange,
		disabled: t.disabled,
		hint: t.hint
	}) : t.kind === "pick" ? /* @__PURE__ */ b(ya, {
		id: n,
		label: t.label,
		items: t.items,
		value: t.value,
		onPick: t.onChange,
		emptyLabel: "All",
		maxWidth: "16rem"
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
					onChange: (e) => t.onChange(Sa(e.target.value), t.max),
					className: "rounded border px-2 py-1 text-sm",
					style: xa
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
					onChange: (e) => t.onChange(t.min, Sa(e.target.value)),
					className: "rounded border px-2 py-1 text-sm",
					style: xa
				})
			]
		})]
	});
}
function wa(e) {
	let t = Xe("(max-width: 767px)"), [n, r] = c(!1), i = /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-end gap-3",
		"data-filter-bar": !0,
		children: [e.fields.map((t) => /* @__PURE__ */ b(Ca, {
			id: e.id,
			field: t
		}, t.key)), /* @__PURE__ */ x(zn, {
			tooltip: "Clear every filter on this tab",
			type: "button",
			onClick: e.onClear,
			disabled: !e.active,
			style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6
			},
			children: [/* @__PURE__ */ b(Ve, {
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
function Ta() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function Ea(e, n) {
	let { event: i, read: a, write: o, empty: s } = n, [l, u] = c(() => e ? a(Ta(), e) : s);
	return r(() => {
		u(e ? a(Ta(), e) : s);
		let t = () => e && u(a(Ta(), e));
		return window.addEventListener(i, t), () => window.removeEventListener(i, t);
	}, [
		e,
		i,
		a,
		s
	]), [l, t((t) => {
		u(t), e && (o(Ta(), e, t), window.dispatchEvent(new Event(i)));
	}, [
		e,
		i,
		o
	])];
}
function Da(e, t, n) {
	e.write(Ta(), t, n), window.dispatchEvent(new Event(e.event));
}
// kirocrew-app/ui/src/flow-api.ts
var Oa = [
	"queued",
	"coding",
	"tests",
	"commands",
	"ci-wait",
	"review",
	"rework",
	"merge",
	"waiting"
], ka = {
	queued: "#94a3b8",
	coding: "#3b82f6",
	tests: "#10b981",
	commands: "#8b5cf6",
	"ci-wait": "#0ea5e9",
	review: "#ec4899",
	rework: "#ef4444",
	merge: "#14b8a6",
	waiting: "#a8a29e"
}, Aa = {
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
function ja(e) {
	return e.pullRequest ? `Opened pull request #${e.pullRequest.number} to ${e.repository}.` : `Committed on branch ${e.branch}${e.pushed ? " and pushed" : ""}; ${e.reason ?? "no pull request was opened"}.`;
}
function Ma(e, t) {
	return e ? e.stopped.includes(t) || e.paused.includes(t) ? "stopped at budget" : e.over.includes(t) ? "over budget" : e.warning.includes(t) ? "80% of budget" : null : null;
}
function Na(e) {
	return Number.isFinite(e) ? e >= 1e6 ? `${(e / 1e6).toFixed(1)}M` : e >= 1e4 ? `${Math.round(e / 1e3)}k` : e >= 1e3 ? `${(e / 1e3).toFixed(1)}k` : String(Math.round(e)) : "–";
}
var Pa = (e) => e ? e.toFixed(2) : "0";
function Fa(e) {
	return e?.available ? e.total.turns ? null : "No turns recorded for these tasks yet." : "Not available: Kiro Crew has not reported usage for this workspace's chats yet.";
}
function Ia(e) {
	let t = [];
	return (e.input || e.output) && t.push(`${Na(e.input)} in · ${Na(e.output)} out`), e.credits && t.push(`${Pa(e.credits)} credits`), t.join(" · ") || "none";
}
function La(e) {
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
function Ra(e, t) {
	let n = [{
		value: "auto",
		label: "auto (Kiro Crew picks)"
	}, ...e];
	return t && !n.some((e) => e.value === t) && n.push({
		value: t,
		label: `${t} (not offered now)`
	}), n;
}
var za = "avoozl.flow.filter.", Ba = {
	event: "avoozl:flow-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(za + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(za + t, JSON.stringify(n));
		} catch {}
	}
}, Va = [
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
], Ha = "avoozl:line-changed", Ua = () => {
	typeof window < "u" && window.dispatchEvent(new Event(Ha));
};
function Wa(e) {
	let t = (t, n, r = {}) => e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e, n = {}) => t(e, "flow.view", {
			...n.repository ? { repository: n.repository } : {},
			...n.epic ? { epic: n.epic } : {},
			...n.plan ? { plan: n.plan } : {},
			...n.plan && n.phase ? { phase: n.phase } : {},
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
		models: () => e.get("/api/models").then(La),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n }),
		proposals: (e) => t(e, "flow.proposals"),
		revertPrompt: (e, n) => t(e, "prompt.override.revert", { target: n }),
		rebasePrompt: (e, n) => t(e, "prompt.override.rebase", n),
		lessons: (e, n = {}) => t(e, "lessons.view", Object.fromEntries(Object.entries(n).filter(([, e]) => e))),
		sharePreview: (e, n) => t(e, "lessons.share.preview", { ids: n }),
		share: (e, n, r) => t(e, "lessons.share", {
			ids: n,
			previewHash: r
		}),
		exportLessons: (e, n) => t(e, "lessons.export", { path: n })
	};
}
function Ga(e) {
	if (e == null || !Number.isFinite(e)) return "–";
	let t = Math.round(e / 6e4);
	if (e < 6e4) return `${Math.round(e / 1e3)} s`;
	if (t < 60) return `${t} m`;
	let n = Math.floor(t / 60), r = t % 60;
	return n < 48 ? r ? `${n} h ${r} m` : `${n} h` : `${Math.round(n / 24)} d`;
}
var Ka = (e) => e == null ? "–" : `${Math.round(e * 100)}%`;
function qa(e) {
	let t = e.metrics, n = e.previous;
	return [
		{
			key: "lead",
			title: "Lead time",
			value: Ga(t.leadTimeMs),
			was: n.tasks ? Ga(n.leadTimeMs) : null,
			empty: t.leadTimeMs === null ? "Finish a task to see lead time." : null,
			tip: "Median time from ready to integrated or merged."
		},
		{
			key: "efficiency",
			title: "Flow efficiency",
			value: Ka(t.flowEfficiency),
			was: n.tasks ? Ka(n.flowEfficiency) : null,
			empty: t.flowEfficiency === null ? "Finish a task to see how much of its time was active." : null,
			tip: "Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting."
		},
		{
			key: "first-pass",
			title: "First-pass rate",
			value: Ka(t.firstPassRate),
			was: n.tasks ? Ka(n.firstPassRate) : null,
			empty: t.firstPassRate === null ? "Finish a task to see how many pass the first time." : null,
			tip: "Tasks accepted on their first attempt with no rework."
		},
		{
			key: "fix",
			title: "Time to fix",
			value: Ga(t.timeToFixMs),
			was: n.tasks && n.timeToFixMs !== null ? Ga(n.timeToFixMs) : null,
			empty: t.timeToFixMs === null ? "No line stop yet." : null,
			tip: "From the line stopping to the check passing on the branch again."
		}
	];
}
function Ja(e) {
	let t = Oa.reduce((t, n) => t + (e[n] || 0), 0);
	return t ? Oa.filter((t) => e[t] > 0).map((n) => ({
		stage: n,
		ms: e[n],
		share: e[n] / t,
		color: ka[n],
		label: Aa[n]
	})) : [];
}
var Ya = {
	"tool-calls": "from tool calls",
	markers: "from phase markers (coarse)",
	events: "from events"
};
function Xa(e) {
	if (e.type === "plan") return `${e.change} (spec ${e.spec})`;
	if (e.type === "prompt") return `${e.revert ? "Revert " : ""}${e.target}${e.section ? ` § ${e.section}` : ""}`;
	if (e.type === "skill") return `${e.revert ? "Revert " : ""}skill ${e.target}`;
	if (e.type === "lesson") return `${e.kind} ${(e.lessons ?? []).join(", ")}`;
	let t = e.file === "repository" ? ` in ${e.repository}` : "";
	return `${e.key} ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}${t}`;
}
var Za = (e) => e.type === "lesson" ? "lessons review" : `${e.metric} ${e.direction === "down" ? "↓" : "↑"}`;
function Qa(e) {
	let t = e.evidence;
	return typeof t == "string" ? t : t ? `${t.runs.join(", ")} · now ${t.value} · ${t.effect}` : "";
}
function $a(e) {
	return e ? e.split("\n").map((e) => ({
		kind: e.startsWith("@@") ? "hunk" : e.startsWith("+") ? "add" : e.startsWith("-") ? "del" : "same",
		text: e
	})) : [];
}
function eo(e) {
	return e.state === "retired" ? `retired${e.staleReason ? `: ${e.staleReason}` : ""}` : e.state === "ok" ? e.outcome === "undone" ? "did not work" : e.outcome : e.staleReason ? `${e.state}: ${e.staleReason}` : e.state;
}
function to(e) {
	if (e.status !== "approved" || !e.pdca) return null;
	if (!e.pdca.result) return `PDCA: measuring over the next ${e.pdca.window} tasks.`;
	let t = e.pdca.result === "helped" ? "helped" : e.pdca.result === "worse" ? "worse" : "did not help", n = (t) => t == null ? "–" : /rate|efficiency/.test(e.metric) ? Ka(t) : Ga(t);
	return `PDCA: ${e.metric} ${n(e.pdca.before)} → ${n(e.pdca.after)}, ${t}.`;
}
function no(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var ro = [
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
], io = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], ao = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", oo = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function so(e) {
	let t = e.reason.trim();
	return t ? /[\r\n]/.test(t) ? { error: "Keep the reason to one line." } : t.length > 200 ? { error: "Keep the reason to 200 characters or fewer." } : e.kind === "agents" ? { input: {
		scope: "all",
		full: !0,
		reason: t
	} } : e.scope === "repo" ? e.repository ? { input: {
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
function co(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${no(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
function lo(e) {
	return !!(e.repository || e.epic || e.plan || e.phase || e.window || e.stage);
}
var uo = {
	scope: "dependents",
	localChecksFirst: !0,
	max: 3,
	by: "phase",
	everyTasks: 10,
	slowFactor: 2,
	model: "auto",
	share: !0,
	read: !0,
	untestedDays: 90,
	confirmDays: 180,
	reviewEvery: 5
};
function fo(e = {}) {
	return {
		scope: e.stopTheLine?.scope ?? "",
		localChecksFirst: e.localChecksFirst === void 0 ? "" : e.localChecksFirst ? "on" : "off",
		max: e.batch?.max === void 0 ? "" : String(e.batch.max),
		by: e.batch?.by ?? "",
		everyTasks: e.retro?.everyTasks === void 0 ? "" : String(e.retro.everyTasks),
		slowFactor: e.retro?.slowFactor === void 0 ? "" : String(e.retro.slowFactor),
		model: e.retro?.model ?? "",
		share: e.lessons?.share === void 0 ? "" : e.lessons.share ? "on" : "off",
		read: e.lessons?.read === void 0 ? "" : e.lessons.read ? "on" : "off",
		untestedDays: e.lessons?.untestedDays === void 0 ? "" : String(e.lessons.untestedDays),
		confirmDays: e.lessons?.confirmDays === void 0 ? "" : String(e.lessons.confirmDays),
		reviewEvery: e.lessons?.reviewEvery === void 0 ? "" : String(e.lessons.reviewEvery)
	};
}
function po(e) {
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
	Object.keys(r).length && (t.retro = r);
	let i = {};
	e.share && (i.share = e.share === "on"), e.read && (i.read = e.read === "on");
	for (let [t, n, r] of [
		[
			"untestedDays",
			"Untested lessons expire after",
			3650
		],
		[
			"confirmDays",
			"Confirm within",
			3650
		],
		[
			"reviewEvery",
			"Review lessons every",
			100
		]
	]) {
		if (!e[t].trim()) continue;
		let a = Number(e[t]);
		if (!Number.isInteger(a) || a < 1 || a > r) return { error: `${n} must be a whole number 1–${r}.` };
		i[t] = a;
	}
	return Object.keys(i).length && (t.lessons = i), { flow: t };
}
// kirocrew-app/ui/src/FlowMemory.tsx
var mo = {
	add: "var(--success, #1a7f37)",
	del: "var(--danger)",
	hunk: "var(--muted)",
	same: "var(--text)"
};
function ho({ diff: e, label: t }) {
	let n = $a(e);
	return n.length ? /* @__PURE__ */ b("pre", {
		"aria-label": t,
		className: "max-h-64 overflow-auto rounded border p-2 text-xs",
		style: {
			borderColor: "var(--border)",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			margin: 0
		},
		"data-diff": !0,
		children: n.map((e, t) => /* @__PURE__ */ b("span", {
			style: {
				display: "block",
				color: mo[e.kind]
			},
			children: e.text || " "
		}, t))
	}) : null;
}
function go({ proposal: e, busy: t, onDecide: n }) {
	let r = to(e);
	return /* @__PURE__ */ x("li", {
		className: "flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0 text-sm",
		style: { borderColor: "var(--border)" },
		"data-proposal": `${e.retro}:${e.id}`,
		children: [
			/* @__PURE__ */ x("span", {
				className: "flex flex-wrap items-center gap-2",
				style: { overflowWrap: "anywhere" },
				children: [
					/* @__PURE__ */ b(G, { children: e.type }),
					/* @__PURE__ */ b("code", {
						className: "text-xs",
						children: Xa(e)
					}),
					/* @__PURE__ */ b("span", {
						className: "text-muted",
						children: Za(e)
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: e.retro
					}),
					e.revertOf && /* @__PURE__ */ b(G, { children: "revert" }),
					e.pdca?.mixed && /* @__PURE__ */ b(G, {
						variant: "warning",
						children: "mixed window"
					})
				]
			}),
			e.base && /* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: ["Base ", e.base.slice(0, 12)]
			}),
			/* @__PURE__ */ b(ho, {
				diff: e.diff,
				label: `Diff of ${Xa(e)}`
			}),
			/* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				style: { overflowWrap: "anywhere" },
				children: ["Evidence: ", Qa(e)]
			}),
			e.lessons && e.lessons.length > 0 && /* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: ["Cites ", e.lessons.join(", ")]
			}),
			e.lessonRefused && /* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: [
					"Its lesson was not kept: ",
					e.lessonRefused,
					"."
				]
			}),
			e.leaf && /* @__PURE__ */ x("span", {
				className: "text-xs",
				children: [
					"Delivered as task ",
					e.leaf,
					"."
				]
			}),
			e.note && /* @__PURE__ */ x("span", {
				className: "text-xs",
				children: [
					"A suggested change waits on ",
					e.note.plugin ? `plugin ${e.note.plugin}'s card` : "this page",
					"; nothing was sent."
				]
			}),
			e.status === "open" ? /* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ b(p, {
					type: "button",
					disabled: t,
					onClick: () => n(e, "reject"),
					children: "Reject"
				}), /* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					disabled: t,
					onClick: () => n(e, "approve"),
					children: "Approve"
				})]
			}) : /* @__PURE__ */ x("span", {
				className: "text-xs",
				children: [e.status === "approved" ? "Approved" : `Rejected${e.reason ? `: ${e.reason}` : ""}`, r ? ` · ${r}` : ""]
			})
		]
	});
}
function _o({ drift: e, target: t, busy: n, onRebase: r }) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1.5 rounded border p-2 text-sm",
		style: { borderColor: "var(--warning, var(--border))" },
		"data-prompt-drift": `${t}:${e.section}`,
		children: [
			/* @__PURE__ */ x("span", {
				className: "font-medium",
				children: [
					"The built-in ",
					t,
					" § ",
					e.section,
					" changed under your override."
				]
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: "Sessions keep your override until you approve the rebase."
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs font-medium",
				children: "Built-in: old to new"
			}),
			/* @__PURE__ */ b(ho, {
				diff: e.diffs.builtIn,
				label: "Built-in change"
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs font-medium",
				children: "Your override against the old built-in"
			}),
			/* @__PURE__ */ b(ho, {
				diff: e.diffs.override,
				label: "Override"
			}),
			e.conflict ? /* @__PURE__ */ b("span", {
				className: "text-xs text-danger",
				children: "The override does not merge onto the new text. Revert it, or approve a new proposal later."
			}) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b("span", {
					className: "text-xs font-medium",
					children: "Rebased override"
				}),
				/* @__PURE__ */ b("pre", {
					className: "max-h-48 overflow-auto rounded border p-2 text-xs",
					style: {
						borderColor: "var(--border)",
						whiteSpace: "pre-wrap",
						margin: 0
					},
					children: e.rebased
				}),
				/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					disabled: n,
					onClick: r,
					children: "Approve rebase"
				}) })
			] })
		]
	});
}
function vo({ prompts: e, busy: t, onRevert: n, onRebase: r }) {
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-2",
		"data-prompt-versions": !0,
		children: [
			/* @__PURE__ */ b(Y, { title: "Prompt versions" }),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Overrides live on this computer, for this workspace only. Locked sections always use the built-in text."
			}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-2",
				children: e.map((e) => /* @__PURE__ */ x("li", {
					className: "flex flex-col gap-1.5 text-sm",
					children: [/* @__PURE__ */ x("span", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ b("code", {
								className: "text-xs",
								children: e.target
							}),
							/* @__PURE__ */ b("span", {
								className: "text-muted",
								children: e.active ? `override ${e.version.split("+")[1] ?? ""}` : "built-in"
							}),
							e.versions.length > 0 && /* @__PURE__ */ x("span", {
								className: "text-xs text-muted",
								children: ["last change ", Q(e.versions.at(-1).at, Date.now())]
							}),
							e.drift.length > 0 && /* @__PURE__ */ b(G, {
								variant: "warning",
								children: "built-in changed"
							}),
							e.versions.length > 0 && /* @__PURE__ */ b(p, {
								type: "button",
								disabled: t,
								onClick: () => n(e),
								style: wn,
								children: "Revert"
							})
						]
					}), e.drift.map((n) => /* @__PURE__ */ b(_o, {
						drift: n,
						target: e.target,
						busy: t,
						onRebase: () => r(e, n)
					}, n.section))]
				}, e.target))
			})
		]
	});
}
function yo({ workspaceId: e }) {
	let n = l(), r = o(() => Wa(n), [n]), i = On(), { value: a, error: s, reload: u } = da(e, t((e) => r.proposals(e), [r])), [d, f] = c(!1), [p, h] = c(null), g = async (e) => {
		f(!0), h(null);
		try {
			await e(), await u();
		} catch (e) {
			h(K(e));
		} finally {
			f(!1);
		}
	};
	if (s) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: s
	});
	if (!a || !e) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let _ = a.proposals.filter((e) => [
		"prompt",
		"skill",
		"lesson"
	].includes(e.type));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-proposals": !0,
		children: [
			p && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: p
			}),
			!a.available && /* @__PURE__ */ x("p", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted",
				children: [/* @__PURE__ */ b("span", { children: "This Avoozl process has no settings folder, so prompt overrides and lessons are off." }), /* @__PURE__ */ b(Fn, {
					workspaceId: e,
					help: {
						page: "Flow › Proposals",
						section: "Prompt overrides and lessons are off",
						says: "This Avoozl process has no settings folder, so prompt overrides and lessons are off.",
						settings: [{
							key: "settings folder",
							value: "none for this process"
						}],
						docs: "README.md, sections Flow and Configuration and secrets"
					}
				})]
			}),
			/* @__PURE__ */ x(m, {
				className: "flex flex-col gap-2",
				children: [
					/* @__PURE__ */ b(Y, { title: "Prompt and skill proposals" }),
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "A retro may propose a change to what agents are told. Nothing changes until you approve it."
					}),
					_.length ? /* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-3",
						children: _.map((t) => /* @__PURE__ */ b(go, {
							proposal: t,
							busy: d,
							onDecide: (t, n) => void g(async () => {
								(n !== "approve" || t.type !== "lesson" || t.kind !== "retire" || await i({
									title: "Retire these lessons?",
									body: `${(t.lessons ?? []).join(", ")} stop being offered and count as "did not work". They stay as history.`,
									action: "Retire"
								})) && await r.decide(e, {
									retroId: t.retro,
									proposalId: t.id,
									decision: n
								});
							})
						}, `${t.retro}:${t.id}`))
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No prompt, skill or lesson proposals yet. Settings and spec proposals are under Overview."
					}),
					a.dropped.some((e) => e.type) && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["Dropped: ", a.dropped.filter((e) => e.type).map((e) => `${e.retro} ${e.key ?? e.index} (${e.reason})`).join("; ")]
					})
				]
			}),
			/* @__PURE__ */ b(vo, {
				prompts: a.prompts,
				busy: d,
				onRevert: (t) => void g(async () => {
					await i({
						title: `Revert ${t.target}?`,
						body: "Sessions that start after this use the version before it. The revert is recorded, and you can revert it too.",
						action: "Revert"
					}) && await r.revertPrompt(e, t.target);
				}),
				onRebase: (t, n) => void g(() => r.rebasePrompt(e, {
					target: t.target,
					section: n.section,
					hash: n.hash
				}))
			}),
			a.notes.filter((e) => !e.plugin).length > 0 && /* @__PURE__ */ x(m, {
				className: "flex flex-col gap-2",
				children: [
					/* @__PURE__ */ b(Y, { title: "Suggested skill changes" }),
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "For skills no plugin owns. Copy one to its owner; Avoozl sends nothing."
					}),
					a.notes.filter((e) => !e.plugin).map((e) => /* @__PURE__ */ b(bo, { note: e }, `${e.retro}:${e.proposal}`))
				]
			})
		]
	});
}
function bo({ note: e }) {
	let [t, n] = c(!1), r = `Suggested change to ${e.file}\n\n${e.summary}\n\n${e.diff}\n`;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1 text-sm",
		"data-skill-note": e.file,
		children: [
			/* @__PURE__ */ x("span", {
				className: "font-medium",
				children: ["Suggested change to ", /* @__PURE__ */ b("code", {
					className: "text-xs",
					children: e.file
				})]
			}),
			/* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.summary
			}),
			/* @__PURE__ */ b(ho, {
				diff: e.diff,
				label: `Suggested change to ${e.file}`
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
				type: "button",
				onClick: () => void navigator.clipboard?.writeText(r).then(() => n(!0), () => n(!1)),
				children: t ? "Copied" : "Copy"
			}) })
		]
	});
}
function xo({ lesson: e }) {
	let [t, n] = c(!1);
	return /* @__PURE__ */ x("li", {
		className: "flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0 text-sm",
		style: { borderColor: "var(--border)" },
		"data-lesson": e.id,
		children: [
			/* @__PURE__ */ x("span", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b("code", {
						className: "text-xs",
						children: e.id
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: [
							e.pattern.stage,
							e.pattern.check,
							e.pattern.tool
						].filter(Boolean).join(" · ")
					}),
					/* @__PURE__ */ b(G, {
						variant: e.state === "ok" ? e.outcome === "undone" ? "warning" : void 0 : "warning",
						children: eo({
							...e,
							staleReason: null
						})
					}),
					/* @__PURE__ */ x("span", {
						className: "tabular-nums text-xs",
						children: ["confidence ", e.confidence.toFixed(2)]
					})
				]
			}),
			e.staleReason && /* @__PURE__ */ x("span", {
				className: "text-xs",
				style: {
					color: "var(--warning, var(--text))",
					overflowWrap: "anywhere"
				},
				"data-stale-reason": !0,
				children: [
					e.state === "retired" ? "Retired" : "Why",
					": ",
					e.staleReason
				]
			}),
			/* @__PURE__ */ b("span", {
				style: { overflowWrap: "anywhere" },
				children: e.finding
			}),
			/* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: [
					e.change.summary ?? e.change.type,
					" · ",
					e.confirmedAt ? `confirmed ${Q(e.confirmedAt, Date.now())}` : "not confirmed yet",
					" · from ",
					e.source
				]
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
				type: "button",
				"aria-expanded": t,
				onClick: () => n(!t),
				children: t ? "Hide history" : "History"
			}) }),
			t && /* @__PURE__ */ b("ol", {
				className: "flex flex-col gap-0.5 text-xs text-muted",
				"data-lesson-history": !0,
				children: e.history.map((e, t) => /* @__PURE__ */ x("li", { children: [
					Q(e.at, Date.now()),
					": ",
					e.what,
					e.state ? ` ${e.state}` : "",
					e.outcome ? ` ${e.outcome}` : "",
					e.reason ? ` (${e.reason})` : "",
					" by ",
					e.by
				] }, t))
			})
		]
	});
}
function So({ workspaceId: e }) {
	let n = l(), r = o(() => Wa(n), [n]), [i, a] = c({}), s = JSON.stringify(i), { value: u, error: d } = da(e, t((e) => r.lessons(e, JSON.parse(s)), [r, s])), [f, h] = c(""), [_, v] = c(null), S = (e) => a({
		...i,
		...e
	}), [C, w] = c([]), [T, E] = c(null), [D, O] = c(null), k = async (e) => {
		O(null);
		try {
			await e();
		} catch (e) {
			O({ error: K(e) });
		}
	}, A = async () => {
		if (e) {
			v(null);
			try {
				let t = await r.exportLessons(e, f.trim());
				v({ ok: `Wrote ${t.lessons} lessons to ${t.path}.` });
			} catch (e) {
				v({ error: K(e) });
			}
		}
	};
	return d ? /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: d
	}) : u ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-lessons": !0,
		children: [
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "What retros learned, kept on this computer. Lessons hold summaries only, never task text, paths or repository names."
			}),
			/* @__PURE__ */ b(wa, {
				id: "avoozl-lessons",
				label: "Filter lessons",
				active: Object.values(i).some(Boolean),
				onClear: () => a({}),
				fields: [
					{
						kind: "select",
						key: "stage",
						label: "Pattern",
						value: i.stage ?? "",
						options: Oa.map((e) => ({
							value: e,
							label: Aa[e]
						})),
						onChange: (e) => S({ stage: e || void 0 })
					},
					{
						kind: "select",
						key: "outcome",
						label: "Outcome",
						value: i.outcome ?? "",
						options: [
							"untested",
							"kept",
							"undone"
						].map((e) => ({
							value: e,
							label: e
						})),
						onChange: (e) => S({ outcome: e || void 0 })
					},
					{
						kind: "select",
						key: "source",
						label: "Source",
						value: i.source ?? "",
						options: [
							{
								value: "this",
								label: "This workspace"
							},
							{
								value: "other",
								label: "Other workspaces"
							},
							{
								value: "pack",
								label: "Plugin packs"
							}
						],
						onChange: (e) => S({ source: e || void 0 })
					},
					{
						kind: "select",
						key: "state",
						label: "State",
						value: i.state ?? "",
						options: [
							"ok",
							"stale",
							"needs re-check",
							"retired"
						].map((e) => ({
							value: e,
							label: e
						})),
						onChange: (e) => S({ state: e || void 0 })
					}
				]
			}),
			/* @__PURE__ */ x(m, {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ b(Y, { title: "Lessons" }), u.lessons.length ? /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-2",
					children: u.lessons.map((e) => /* @__PURE__ */ b(xo, { lesson: e }, e.id))
				}) : /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "No lessons yet. A lesson is written when you approve a retro proposal that carries one."
				})]
			}),
			/* @__PURE__ */ x(m, {
				className: "flex flex-col gap-2",
				"data-lessons-share": !0,
				children: [/* @__PURE__ */ b(Y, { title: "Share proven lessons" }), u.share?.off ? /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: u.share.off
				}) : /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ x("p", {
						className: "text-xs text-muted",
						children: [
							"Pick lessons to share with your team as summaries in ",
							u.share?.file ?? ".avoozl/lessons.json",
							" on ",
							u.share?.repository ?? "the repository",
							". Avoozl opens a pull request; nothing else leaves this computer."
						]
					}),
					(u.candidates ?? []).length ? /* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-1 text-sm",
						"data-share-candidates": !0,
						children: (u.candidates ?? []).map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("label", {
							className: "flex flex-wrap items-baseline gap-2",
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									checked: C.includes(e.id),
									onChange: (t) => {
										E(null), w(t.target.checked ? [...C, e.id] : C.filter((t) => t !== e.id));
									}
								}),
								/* @__PURE__ */ b("code", {
									className: "text-xs",
									children: e.id
								}),
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: e.why
								})
							]
						}) }, e.id))
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No candidates yet. A lesson can be shared once the PDCA check keeps it."
					}),
					/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-2",
						children: [/* @__PURE__ */ b(p, {
							type: "button",
							disabled: !C.length,
							onClick: () => void k(async () => E(await r.sharePreview(e, C))),
							children: "Preview share"
						}), T && /* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void k(async () => {
								let t = await r.share(e, C, T.hash);
								O({ ok: ja(t) }), E(null), w([]);
							}),
							children: "Share"
						})]
					}),
					T && /* @__PURE__ */ b("pre", {
						className: "max-h-64 overflow-auto rounded border p-2 text-xs",
						style: {
							borderColor: "var(--border)",
							whiteSpace: "pre-wrap",
							margin: 0
						},
						"data-share-preview": !0,
						children: T.text
					}),
					D?.error && /* @__PURE__ */ b("span", {
						role: "alert",
						className: "text-sm text-danger",
						children: D.error
					}),
					D?.ok && /* @__PURE__ */ b("span", {
						className: "text-sm text-muted",
						children: D.ok
					})
				] })]
			}),
			/* @__PURE__ */ x(m, {
				className: "flex flex-col gap-2",
				"data-lessons-export": !0,
				children: [
					/* @__PURE__ */ b(Y, { title: "Export as a pack" }),
					/* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "Export writes a lessons pack file you can put in a plugin; it passes your content rules first."
					}),
					/* @__PURE__ */ x("div", {
						className: "flex flex-wrap items-end gap-2",
						children: [/* @__PURE__ */ x("label", {
							className: "flex min-w-0 flex-col gap-1 text-sm",
							style: {
								maxWidth: "28rem",
								flex: "1 1 16rem"
							},
							children: [/* @__PURE__ */ b("span", {
								className: "font-medium",
								children: "Pack file (required)"
							}), /* @__PURE__ */ b(g, {
								value: f,
								placeholder: "/path/to/avoozl-lessons.json",
								onChange: (e) => h(e.target.value)
							})]
						}), /* @__PURE__ */ b(p, {
							type: "button",
							disabled: !f.trim(),
							onClick: () => void A(),
							children: "Export lessons"
						})]
					}),
					_?.error && /* @__PURE__ */ b("span", {
						role: "alert",
						className: "text-sm text-danger",
						children: _.error
					}),
					_?.ok && /* @__PURE__ */ b("span", {
						className: "text-sm text-muted",
						children: _.ok
					})
				]
			})
		]
	}) : /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
}
// kirocrew-app/ui/src/FlowCharts.tsx
var Co = 300, wo = 90, To = 4;
function Eo({ points: e, value: t, format: n, color: r }) {
	let i = e.map(t), a = i.filter((e) => e !== null), o = Math.max(...a, 0) || 1, s = (t) => e.length < 2 ? Co / 2 : To + t * 292 / (e.length - 1), c = (e) => 86 - e / o * 82, l = i.map((e, t) => e === null ? null : `${s(t)},${c(e)}`).reduce((e, t) => (t === null ? e.push([]) : e[e.length - 1].push(t), e), [[]]).filter((e) => e.length), u = a.at(-1);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ b("span", {
			className: "text-lg font-semibold tabular-nums",
			children: u === void 0 ? "–" : n(u)
		}), /* @__PURE__ */ x("svg", {
			viewBox: `0 0 ${Co} ${wo}`,
			width: "100%",
			height: wo,
			role: "img",
			"aria-label": e.map((e, t) => `${e.key}: ${i[t] === null ? "none" : n(i[t])}`).join(", "),
			preserveAspectRatio: "none",
			children: [
				/* @__PURE__ */ b("line", {
					x1: 0,
					x2: Co,
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
function Do({ points: e }) {
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-1",
		children: /* @__PURE__ */ b("div", {
			className: "flex items-end gap-1",
			style: { height: wo },
			role: "img",
			"aria-label": "Stage mix per period",
			children: e.map((e) => {
				let t = Oa.reduce((t, n) => t + e.stages[n], 0);
				return /* @__PURE__ */ b(X, {
					text: `${e.key}: ${Oa.filter((t) => e.stages[t]).map((t) => `${Aa[t]} ${Ga(e.stages[t])}`).join(", ") || "no time"}`,
					children: (n) => /* @__PURE__ */ b("div", {
						tabIndex: 0,
						"aria-describedby": n,
						className: "flex flex-col-reverse overflow-hidden rounded-sm",
						style: {
							height: wo,
							width: 14,
							background: "color-mix(in srgb, var(--muted) 12%, transparent)"
						},
						children: Oa.filter((t) => e.stages[t]).map((n) => /* @__PURE__ */ b("span", { style: {
							height: `${100 * e.stages[n] / (t || 1)}%`,
							background: ka[n],
							display: "block"
						} }, n))
					})
				}, e.key);
			})
		})
	});
}
function Oo({ rows: e }) {
	let t = (e) => e.credits || e.input + e.output, n = Math.max(...e.map(t), 0) || 1;
	return /* @__PURE__ */ b("div", {
		className: "flex items-end gap-1",
		style: { height: wo },
		role: "img",
		"aria-label": e.map((e) => `${e.key}: ${Ia(e)}`).join(", "),
		children: e.map((e) => /* @__PURE__ */ b("span", {
			className: "rounded-sm",
			style: {
				display: "block",
				flex: "none",
				height: Math.max(2, Math.round(wo * t(e) / n)),
				width: 14,
				background: "var(--accent)"
			}
		}, e.key))
	});
}
function ko({ title: e, children: t, empty: n }) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 rounded-lg border p-3",
		style: { borderColor: "var(--border)" },
		children: [/* @__PURE__ */ b(Y, {
			level: 4,
			title: e
		}), n ? /* @__PURE__ */ b("span", {
			className: "text-sm text-muted",
			children: "Nothing finished in this window yet."
		}) : t]
	});
}
function Ao({ unit: e, onUnit: t }) {
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
function jo({ view: e, unit: t, onUnit: n }) {
	let r = e.series?.[t] ?? [], i = !r.length;
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Y, {
				title: "Over time",
				actions: /* @__PURE__ */ b(Ao, {
					unit: t,
					onUnit: n
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
				"data-flow-charts": !0,
				children: [
					/* @__PURE__ */ b(ko, {
						title: "Lead time (median)",
						empty: i,
						children: /* @__PURE__ */ b(Eo, {
							points: r,
							value: (e) => e.leadTimeMs,
							format: Ga,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(ko, {
						title: "Flow efficiency",
						empty: i,
						children: /* @__PURE__ */ b(Eo, {
							points: r,
							value: (e) => e.flowEfficiency,
							format: Ka,
							color: "var(--ok)"
						})
					}),
					/* @__PURE__ */ b(ko, {
						title: "First-pass rate",
						empty: i,
						children: /* @__PURE__ */ b(Eo, {
							points: r,
							value: (e) => e.firstPassRate,
							format: Ka,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(ko, {
						title: "Time to fix",
						empty: !r.some((e) => e.timeToFixMs !== null),
						children: /* @__PURE__ */ b(Eo, {
							points: r,
							value: (e) => e.timeToFixMs,
							format: Ga,
							color: "var(--danger)"
						})
					}),
					/* @__PURE__ */ b(ko, {
						title: "Stage mix",
						empty: i,
						children: /* @__PURE__ */ b(Do, { points: r })
					})
				]
			}),
			!i && /* @__PURE__ */ b(Io, {})
		]
	});
}
function Mo({ title: e, rows: t }) {
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
					children: Aa[e.key] ?? e.key
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums text-muted",
					children: Ia(e)
				})]
			}, e.key))
		})]
	});
}
function No({ view: e, unit: t }) {
	let n = e.usage, r = Fa(n), i = t === "day" ? n?.byDay ?? [] : n?.byWeek ?? [];
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		"data-usage-card": !0,
		children: [/* @__PURE__ */ b(Y, { title: "Tokens and credits" }), r || !n ? /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: r
		}) : /* @__PURE__ */ x(y, { children: [
			/* @__PURE__ */ x("p", {
				className: "text-sm",
				children: [
					"Total: ",
					/* @__PURE__ */ b("span", {
						className: "tabular-nums",
						children: Ia(n.total)
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
				}), /* @__PURE__ */ b(Oo, { rows: i })]
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-4",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
				children: [
					/* @__PURE__ */ b(Mo, {
						title: "By stage",
						rows: n.byStage
					}),
					/* @__PURE__ */ b(Mo, {
						title: "By model",
						rows: n.byModel
					}),
					/* @__PURE__ */ b(Mo, {
						title: "By spec",
						rows: n.byPlan
					}),
					/* @__PURE__ */ b(Mo, {
						title: "By task (top 8)",
						rows: n.byTask
					})
				]
			})
		] })]
	});
}
// kirocrew-app/ui/src/FlowView.tsx
var Po = {
	display: "flex",
	height: 12,
	borderRadius: 4,
	overflow: "hidden",
	background: "color-mix(in srgb, var(--muted) 15%, transparent)"
};
function Fo({ stages: e, scale: t, label: n }) {
	let r = Ja(e), i = r.reduce((e, t) => e + t.ms, 0), a = `${n}: ${r.map((e) => `${e.label} ${Ga(e.ms)}`).join(", ") || "no time yet"}`;
	return /* @__PURE__ */ b("div", {
		style: { width: `${Math.max(4, t ? 100 * i / t : 100)}%` },
		children: /* @__PURE__ */ b(X, {
			text: a,
			display: "block",
			children: (e) => /* @__PURE__ */ b("div", {
				role: "img",
				"aria-label": a,
				"aria-describedby": e,
				tabIndex: 0,
				style: Po,
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
function Io() {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
		"aria-label": "Stages",
		children: Oa.map((e) => /* @__PURE__ */ x("li", {
			className: "inline-flex items-center gap-1",
			children: [/* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					width: 10,
					height: 10,
					borderRadius: 2,
					background: ka[e],
					display: "inline-block"
				}
			}), Aa[e]]
		}, e))
	});
}
function Lo({ stops: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Wa(r), [r]), a = xn(), s = On(), [u, d] = c(null);
	if (!e.length) return null;
	let f = async (e) => {
		if (t && await s({
			title: "Run anyway?",
			body: `New work will start while ${e.check ? `\`${e.check}\`` : "the line"} still fails on ${e.branch}. The stop stays open and shows who ran anyway.`,
			action: "Run anyway"
		})) try {
			await i.runAnyway(t, e.id), n?.(), Ua();
		} catch (e) {
			d(K(e));
		}
	}, p = async (e) => {
		if (t && await s({
			title: e.full ? "Resume all agents?" : "Resume the line?",
			body: e.full ? `New work starts again everywhere, and each interrupted task starts again on its branch and model. The stop was pulled for: ${e.reason ?? ""}` : `New work starts again in ${no(e)}. The stop was pulled for: ${e.reason ?? ""}`,
			action: "Resume"
		})) try {
			await i.resume(t, e.id), n?.(), Ua();
		} catch (e) {
			d(K(e));
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
				/* @__PURE__ */ b(P, {
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
							children: co(e)
						}),
						e.manual && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"data-line-pulled": !0,
							children: [
								"Pulled by ",
								e.by?.name ?? "someone",
								", ",
								Q(e.openedAt, Date.now()),
								". Only a person can resume it."
							]
						}),
						e.runAnyway && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								"Run anyway by ",
								e.runAnyway.by,
								", ",
								Q(e.runAnyway.at, Date.now()),
								"."
							]
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [
						e.fixTaskId && /* @__PURE__ */ b(q, {
							icon: sn,
							tooltip: "Open the fix task's details in the drawer",
							onClick: () => a.openTask(e.fixTaskId),
							children: "Open fix task"
						}),
						e.manual && /* @__PURE__ */ b(q, {
							icon: Oe,
							tooltip: "Start new work again in this scope; asks first",
							onClick: () => void p(e),
							children: "Resume"
						}),
						!e.manual && !e.runAnyway && /* @__PURE__ */ b(q, {
							icon: Oe,
							tooltip: "Resume new work while the check still fails; asks first",
							onClick: () => void f(e),
							style: wn,
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
function Ro({ view: e }) {
	return /* @__PURE__ */ b("div", {
		className: "grid gap-3",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" },
		"data-flow-cards": !0,
		children: qa(e).map((e) => /* @__PURE__ */ x(m, {
			className: "flex flex-col gap-1",
			children: [/* @__PURE__ */ b(X, {
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
function zo({ tasks: e, budget: t }) {
	let n = xn(), r = Xe("(max-width: 767px)"), i = Ln(String(e.length)), a = Math.max(0, ...e.map((e) => Oa.reduce((t, n) => t + (e.stages[n] || 0), 0))), o = i.take("flow-bars", e);
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-2",
		children: [
			/* @__PURE__ */ b(Y, { title: "Time per task" }),
			/* @__PURE__ */ b(Io, {}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-1.5",
				children: o.map((e) => {
					let i = /* @__PURE__ */ x("span", {
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
					}), o = /* @__PURE__ */ b(Fo, {
						stages: e.stages,
						scale: a,
						label: e.taskId
					}), s = /* @__PURE__ */ x("span", {
						className: "inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
						children: [
							e.coarse && /* @__PURE__ */ b(X, {
								text: "Built from phase markers or events, not from tool calls",
								children: (e) => /* @__PURE__ */ b("span", {
									"aria-describedby": e,
									tabIndex: 0,
									className: "text-xs text-muted",
									children: "(coarse)"
								})
							}),
							e.batch && /* @__PURE__ */ b(G, { children: "batch" }),
							Ma(t, e.taskId) && /* @__PURE__ */ b(G, {
								variant: Ma(t, e.taskId) === "80% of budget" ? "warning" : "danger",
								children: Ma(t, e.taskId)
							}),
							Ga(e.leadMs),
							/* @__PURE__ */ b(X, {
								text: "Open this task's details in the drawer",
								children: (t) => /* @__PURE__ */ b("button", {
									type: "button",
									"aria-label": `Details for ${e.taskId}`,
									"aria-describedby": t,
									onClick: () => n.openTask(e.taskId),
									style: {
										display: "inline-flex",
										color: "var(--muted)"
									},
									children: /* @__PURE__ */ b(sn, {
										size: 14,
										"aria-hidden": "true"
									})
								})
							})
						]
					});
					return r ? /* @__PURE__ */ x("li", {
						className: "flex flex-col gap-1 text-sm",
						"data-flow-bar": e.taskId,
						children: [/* @__PURE__ */ x("span", {
							className: "flex items-center justify-between gap-2",
							children: [i, s]
						}), o]
					}, e.taskId) : /* @__PURE__ */ x("li", {
						className: "grid items-center gap-2 text-sm",
						style: { gridTemplateColumns: "minmax(6rem, 14rem) minmax(0, 1fr) auto" },
						"data-flow-bar": e.taskId,
						children: [
							i,
							o,
							s
						]
					}, e.taskId);
				})
			}),
			/* @__PURE__ */ b(Rn, { ...i.more("flow-bars", e.length) }),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "(coarse) marks bars built from reports, not tool calls."
			})
		]
	});
}
function Bo({ proposal: e, retro: t, onDecide: n, busy: r }) {
	let i = to(e);
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
							children: Xa(e)
						}),
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-muted",
							children: Za(e)
						}),
						e.removesCheck && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(G, {
							variant: "warning",
							children: "removes a check"
						})] }),
						e.revertOf && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(G, { children: "revert" })] })
					]
				}),
				/* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					style: { overflowWrap: "anywhere" },
					children: ["Evidence: ", Qa(e)]
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
function Vo({ view: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Wa(r), [r]), a = On(), [s, u] = c(!1), [d, f] = c(null), [p, h] = c(!1), g = async (e, r, o) => {
		if (!t) return;
		let s = !1;
		if (!(o === "approve" && r.removesCheck && (s = await a({
			title: "Approve removing a check?",
			body: `${Xa(r)} removes a review role or a declared check, so fewer things are checked before work lands.`,
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
				f(K(e));
			} finally {
				u(!1);
			}
		}
	}, _ = async () => {
		if (t) try {
			await i.startRetro(t), h(!0);
		} catch (e) {
			f(K(e));
		}
	}, v = e.retros.some((e) => e.state === "running");
	return /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Y, {
				title: "Retros",
				actions: /* @__PURE__ */ b(q, {
					icon: Oe,
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
								e.bottleneck ? ` · bottleneck ${Aa[e.bottleneck.stage] ?? e.bottleneck.stage}` : ""
							]
						}),
						e.state === "running" && /* @__PURE__ */ x("span", {
							className: "text-sm text-muted",
							children: [
								"Running since ",
								Q(e.startedAt, Date.now()),
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
							children: e.proposals.map((t) => /* @__PURE__ */ b(Bo, {
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
function Ho({ view: e }) {
	return !e.flaky.length && !e.ciOnly.length ? null : /* @__PURE__ */ x(m, {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b(Y, { title: "Checks that disagree" }),
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
function Uo({ workspaceId: e }) {
	let n = l(), i = o(() => Wa(n), [n]), [a, s] = Ea(e, Ba), u = JSON.stringify(a), { value: d, error: f, busy: p, reload: g } = da(e, t((e) => i.view(e, JSON.parse(u)), [i, u]));
	r(() => {
		let e = () => void g();
		return window.addEventListener(Ha, e), () => window.removeEventListener(Ha, e);
	}, [g]);
	let _ = (e) => s({
		...a,
		...e
	}), [S, C] = c("day"), [w, T] = c("overview");
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-flow-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-flow-title",
				view: "flow",
				children: "Flow"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Where delivery time goes, and what the last retro proposed."
			}),
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-flow-tabs",
				ariaLabel: "Flow views",
				segments: [
					{
						key: "overview",
						label: "Overview"
					},
					{
						key: "proposals",
						label: "Proposals"
					},
					{
						key: "lessons",
						label: "Lessons"
					}
				],
				value: w,
				onChange: (e) => T(e),
				wrap: !0
			}),
			w === "proposals" && /* @__PURE__ */ b(yo, { workspaceId: e }),
			w === "lessons" && /* @__PURE__ */ b(So, { workspaceId: e }),
			w === "overview" && f && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: f
			}),
			w === "overview" ? d ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Lo, {
					stops: d.line,
					workspaceId: e,
					onChanged: () => void g()
				}),
				/* @__PURE__ */ b(wa, {
					id: "avoozl-flow",
					label: "Filter flow timing",
					active: lo(a),
					onClear: () => s({}),
					fields: [
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: a.repository ?? "",
							options: [...d.repositories.map((e) => ({
								value: e,
								label: e
							}))],
							onChange: (e) => _({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: a.epic ?? "",
							options: [...d.epics.map((e) => ({
								value: e.id,
								label: e.title
							}))],
							onChange: (e) => _({ epic: e || void 0 })
						},
						{
							kind: "select",
							key: "plan",
							label: "Plan",
							value: a.plan ?? "",
							options: (d.plans ?? []).map((e) => ({
								value: e.id,
								label: e.title
							})),
							onChange: (e) => _({
								plan: e || void 0,
								phase: void 0
							})
						},
						{
							kind: "select",
							key: "phase",
							label: "Phase",
							value: a.phase ?? "",
							options: (d.phases ?? []).map((e) => ({
								value: e.id,
								label: e.title
							})),
							disabled: !a.plan,
							hint: a.plan ? void 0 : "Pick a plan first",
							onChange: (e) => _({ phase: e || void 0 })
						},
						{
							kind: "select",
							key: "window",
							label: "Window",
							value: a.window ?? "20",
							options: Va,
							onChange: (e) => _({ window: e || void 0 })
						},
						{
							kind: "select",
							key: "stage",
							label: "Stage",
							value: a.stage ?? "",
							options: [...Oa.map((e) => ({
								value: e,
								label: Aa[e]
							}))],
							onChange: (e) => _({ stage: e || void 0 })
						}
					]
				}),
				/* @__PURE__ */ b(Ro, { view: d }),
				d.bottleneck && /* @__PURE__ */ x(m, {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b(ae, {
						size: 18,
						"aria-hidden": "true",
						style: {
							color: ka[d.bottleneck.stage],
							flex: "none"
						}
					}), /* @__PURE__ */ x("span", { children: [
						/* @__PURE__ */ x("span", {
							className: "font-semibold",
							children: ["Biggest bottleneck: ", Aa[d.bottleneck.stage]]
						}),
						", ",
						Math.round(d.bottleneck.share * 100),
						"% of lead time",
						d.bottleneck.repository ? ` in ${d.bottleneck.repository}` : "",
						" (median ",
						Ga(d.bottleneck.medianMs),
						" per task)."
					] })]
				}),
				d.tasks.length ? /* @__PURE__ */ b(zo, {
					tasks: d.tasks,
					budget: d.budget
				}) : /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(ae, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "No timing yet",
					subtitle: "Avoozl records where each task's time goes as soon as a task is dispatched."
				}),
				/* @__PURE__ */ b(jo, {
					view: d,
					unit: S,
					onUnit: C
				}),
				/* @__PURE__ */ b(No, {
					view: d,
					unit: S
				}),
				/* @__PURE__ */ b(Ho, { view: d }),
				/* @__PURE__ */ b(Vo, {
					view: d,
					workspaceId: e,
					onChanged: () => void g()
				})
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: p ? "Loading…" : "Not loaded"
			}) : null
		]
	});
}
function Wo({ timing: e }) {
	return e ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		"data-timing-fold": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(Fo, {
						stages: e.stages,
						scale: 0,
						label: e.taskId
					})
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Ga(e.leadMs)
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
								background: ka[e.stage] ?? "var(--muted)",
								flex: "none"
							}
						}),
						/* @__PURE__ */ b("span", { children: Aa[e.stage] ?? e.stage }),
						e.detail && /* @__PURE__ */ b("code", {
							className: "text-xs",
							children: e.detail
						}),
						/* @__PURE__ */ b("span", {
							className: "tabular-nums",
							children: Ga(e.lengthMs)
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: Ya[e.source]
						})
					]
				}, e.id))
			}),
			e.versions && e.versions.length > 0 && /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5 text-xs text-muted",
				"data-timing-versions": !0,
				children: e.versions.map((e) => /* @__PURE__ */ x("li", {
					style: { overflowWrap: "anywhere" },
					children: [
						"Attempt ",
						e.attempt,
						" ran on ",
						Object.values(e.prompts).join(", ") || "the built-in prompts",
						Object.keys(e.skills).length ? `; skills ${Object.entries(e.skills).map(([e, t]) => `${e}@${t.slice(0, 8)}`).join(", ")}` : "",
						"."
					]
				}, e.attempt))
			})
		]
	}) : /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "No timing yet: Avoozl records it from the task's first dispatch."
	});
}
// kirocrew-app/ui/src/DashboardView.tsx
var Go = 200, Ko = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, qo = {
	...Kr,
	delivery: "Delivery",
	"github-conflict": "GitHub edit"
}, Jo = "(min-width: 1024px)", Yo = {
	flight: "22rem",
	blocked: "22rem",
	recent: "22rem"
};
function Xo({ height: e, children: t }) {
	let n = Xe(Jo);
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
function Zo({ title: e, children: t, empty: n, actions: r }) {
	return /* @__PURE__ */ x(m, {
		className: "flex h-full min-h-0 flex-col",
		children: [/* @__PURE__ */ b(Y, {
			title: e,
			className: "mb-2",
			actions: r
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
var Qo = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)"
}, $o = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "baseline"
};
function es({ id: e, title: t, onOpen: n }) {
	return /* @__PURE__ */ b(X, {
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
function ts({ item: e, attach: t, onOpen: n, onInfo: r, onAsk: i, onTitle: a }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(G, {
				variant: [
					"decision",
					"needs-human",
					"review"
				].includes(e.kind) ? "warning" : "danger",
				children: qo[e.kind] ?? e.kind
			}),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b(X, {
						text: ei(e),
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
						href: Z(e.href),
						target: "_blank",
						rel: "noreferrer",
						className: "self-center text-sm underline",
						children: "Issue"
					}),
					t && /* @__PURE__ */ b(X, {
						text: "Open the task's running chat",
						children: /* @__PURE__ */ b("a", {
							href: Z(t),
							className: "self-center text-sm underline",
							"aria-label": `Attach to the chat for ${e.title}`,
							children: "Attach"
						})
					}),
					/* @__PURE__ */ b(J, {
						icon: sn,
						label: e.group ? `Info: ${e.title}` : `Details for ${e.title}`,
						tooltip: e.group ? "Why these tasks need review, and the list of them" : "Open the task drawer",
						onClick: r
					}),
					/* @__PURE__ */ b(J, {
						icon: xe,
						label: `Ask in a chat about ${e.title}`,
						tooltip: "Ask in a chat: a new chat seeded with this item's full context",
						onClick: i
					}),
					/* @__PURE__ */ b(J, {
						icon: e.tab === "conflicts" ? j : V,
						label: e.tab === "conflicts" ? `Resolve ${e.title}` : `Open ${e.title} in Delivery`,
						tooltip: e.tab === "conflicts" ? "Resolve it in Conflicts" : "Open it in Delivery",
						onClick: n
					})
				]
			})
		]
	});
}
var ns = {
	worker: "Worker",
	checks: "Checks",
	planner: "Planner"
}, rs = (e) => ns[e.role] ?? (e.role === "worker" ? "Worker" : `Reviewer · ${e.role}`), is = 2e4;
function as({ row: e, now: t, onInfo: n, onPickAgain: r }) {
	let i = wi(e.session), a = e.session.crew && e.session.crew !== "local";
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(G, { children: rs(e) }),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b(In, {
						id: e.taskId,
						title: e.title,
						className: "font-medium"
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
					" ",
					/* @__PURE__ */ b(Or, { budget: e.budget }),
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
							Ci(e.startedAt, t),
							" ·",
							" ",
							e.session.crewUnreachable ? "crew unreachable" : e.status ?? "not observed",
							" ",
							Q(e.lastAt, t)
						]
					})
				]
			}),
			/* @__PURE__ */ x("span", {
				className: "flex gap-1.5",
				children: [
					/* @__PURE__ */ b(J, {
						icon: sn,
						label: `Details for ${e.title}`,
						tooltip: "Open the task drawer",
						onClick: n
					}),
					r && e.role === "worker" && /* @__PURE__ */ b(J, {
						icon: je,
						label: `Pick again for ${e.title}`,
						tooltip: "The next attempt picks its agent and model afresh",
						onClick: r
					}),
					i ? /* @__PURE__ */ x("a", {
						href: Z(i),
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
function os(e) {
	let t = si(e.layout);
	return /* @__PURE__ */ b("ul", {
		className: "min-w-0",
		style: t.list,
		"aria-label": `Tasks by state, ${e.total} in all`,
		"data-state-counts": e.layout,
		children: nt.map((n) => /* @__PURE__ */ b("li", {
			className: "min-w-0",
			children: /* @__PURE__ */ b(X, {
				text: `Show ${n.label.toLowerCase()} tasks in Delivery`,
				display: e.layout === "small" ? "block" : void 0,
				children: /* @__PURE__ */ x("button", {
					type: "button",
					onClick: () => e.onPick(n.id),
					"aria-label": `${n.label}: ${e.counts[n.id]} tasks. Show them in Delivery`,
					className: "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
					style: {
						...t.button,
						borderColor: `color-mix(in srgb, ${Ko[n.id]} 60%, var(--border))`,
						background: `color-mix(in srgb, ${Ko[n.id]} 14%, var(--card, transparent))`,
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
								style: { fill: Ko[n.id] }
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
function ss({ count: e, onOpen: t }) {
	return /* @__PURE__ */ b(X, {
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
				/* @__PURE__ */ b(pe, {
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
function cs({ items: e, now: t, onOpen: n, pages: r }) {
	return e ? e.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
		className: "mt-1 flex flex-col text-sm",
		children: r.take("activity", e).map((e, r) => /* @__PURE__ */ x("li", {
			className: "flex items-baseline gap-2 border-t py-1.5 first:border-t-0",
			style: { borderColor: "var(--border)" },
			children: [/* @__PURE__ */ b(X, {
				text: e.at,
				children: /* @__PURE__ */ b("span", {
					className: "w-16 shrink-0 text-xs text-muted",
					children: Q(e.at, t)
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
	}), /* @__PURE__ */ b(Rn, { ...r.more("activity", e.length) })] }) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Nothing has happened yet."
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Loading…"
	});
}
function ls(e) {
	let { workspaceId: n, onNavigate: i } = e, a = l(), s = o(() => Lr(a), [a]), u = o(() => Xi(a), [a]), d = o(() => yn(a), [a]), f = o(() => Wi(a), [a]), m = Pn(n), g = oi(Xe(Jo), Xe(ai)), { value: _, error: v, busy: S, reload: w } = da(n, t(async (e) => {
		let [t, n, r, i, a] = await Promise.allSettled([
			s.graph(e),
			s.delivery(e),
			s.conflicts(e),
			u.stored(e),
			d.activity(e, Go)
		]), o = (e) => e.status === "fulfilled" ? e.value : null, c = [
			t,
			n,
			r,
			i,
			a
		].filter((e) => e.status === "rejected").length, l = o(r);
		return {
			summary: ii({
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
	])), T = o(() => Wa(a), [a]), E = da(n, t((e) => T.view(e, { window: "10" }), [T])), D = _?.summary;
	r(() => {
		let e = () => void E.reload();
		return window.addEventListener(Ha, e), () => window.removeEventListener(Ha, e);
	}, [E.reload]);
	let O = xn(), k = Ln(""), [A, j] = c(() => Date.now());
	r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (j(Date.now()), w());
		}, is);
		return () => clearInterval(e);
	}, [w]);
	let M = (e) => {
		let t = e.group ? [e.group] : (_?.conflicts ?? []).filter((t) => t.taskId === e.taskId && (e.kind === "delivery" || t.kind === e.kind));
		m.ask(t.length ? { items: t.map(us) } : { tasks: e.taskId ? [e.taskId] : [] });
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-dashboard-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-dashboard-title",
				view: "dashboard",
				meta: /* @__PURE__ */ x(y, { children: [
					D && _.total > 0 && /* @__PURE__ */ x("span", {
						className: "whitespace-nowrap text-xs text-muted tabular-nums",
						children: [_.total, " tasks"]
					}),
					g === "small" ? /* @__PURE__ */ b(J, {
						icon: je,
						label: "Refresh",
						tooltip: "Read the Dashboard again",
						onClick: () => void w(),
						disabled: S
					}) : /* @__PURE__ */ b(q, {
						icon: je,
						onClick: () => void w(),
						disabled: S,
						children: "Refresh"
					}),
					/* @__PURE__ */ b("span", {
						role: "status",
						className: S || _?.failed ? "text-xs text-muted" : "sr-only",
						children: S ? "Loading…" : _?.failed ? `${_.failed} of 5 reads failed; those sections are empty.` : ""
					}),
					e.untriaged !== null && e.untriaged !== void 0 && /* @__PURE__ */ b(ss, {
						count: e.untriaged,
						onOpen: () => i("untriaged")
					}),
					D && D.overBudget > 0 && /* @__PURE__ */ b("span", {
						"data-over-budget": !0,
						children: /* @__PURE__ */ x(G, {
							variant: "danger",
							children: [D.overBudget, " over budget"]
						})
					})
				] }),
				wideActions: g !== "wide",
				actions: /* @__PURE__ */ b(y, { children: D && _.total > 0 && /* @__PURE__ */ b(os, {
					counts: D.counts,
					total: _.total,
					layout: g,
					onPick: (t) => e.onScope?.("delivery", { state: t })
				}) }),
				children: "Dashboard"
			}),
			/* @__PURE__ */ b(Lo, {
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
				icon: /* @__PURE__ */ b(Ue, { size: 40 }),
				title: "No tasks yet",
				subtitle: "Plan a goal from the header, then approve its spec in Specs. Ready tasks start on their own.",
				action: /* @__PURE__ */ b(p, {
					onClick: () => i("plans"),
					children: "Open Specs"
				})
			}) : D ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ x(Xo, {
					height: Yo.flight,
					children: [/* @__PURE__ */ x(Zo, {
						title: `In flight (${D.inFlight.length})`,
						empty: D.inFlight.length === 0 && "No agent is working right now.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: k.take("flight", D.inFlight).map((e) => /* @__PURE__ */ b(as, {
								row: e,
								now: A,
								onInfo: () => O.openTask(e.taskId),
								onPickAgain: n && e.session.sessionReason ? () => void f.pickAgain(n, e.taskId).then(() => w()) : void 0
							}, e.slot))
						}), /* @__PURE__ */ b(Rn, { ...k.more("flight", D.inFlight.length) })]
					}), /* @__PURE__ */ x(Zo, {
						title: "Progress by epic",
						empty: D.progress.length === 0 && `No epics yet. ${D.plans.approved} approved and ${D.plans.draft} draft specs.`,
						children: [/* @__PURE__ */ x("p", {
							className: "mt-1 text-xs text-muted",
							children: [
								D.plans.approved,
								" approved and ",
								D.plans.draft,
								" draft specs.",
								" ",
								/* @__PURE__ */ b("button", {
									type: "button",
									className: "underline",
									onClick: () => i("plans"),
									children: "Open Specs"
								})
							]
						}), /* @__PURE__ */ b("ul", {
							className: "mt-2 flex flex-col gap-1 text-sm",
							children: D.progress.map((t) => {
								let n = t.total ? Math.round(t.done / t.total * 100) : 0, r = t.title;
								return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(X, {
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
								}) }, t.epic ?? "(none)");
							})
						})]
					})]
				}),
				/* @__PURE__ */ x(Xo, {
					height: Yo.blocked,
					children: [/* @__PURE__ */ x(Zo, {
						title: `Needs you (${D.attention.length})`,
						empty: D.attention.length === 0 && "Nothing waits on you.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: k.take("attention", D.attention).map((e) => /* @__PURE__ */ b(ts, {
								item: e,
								attach: ds(D.running, e.taskId),
								onOpen: () => i(e.tab, e.taskId ?? void 0),
								onInfo: () => e.group ? O.openReview(e.group, () => void w()) : e.taskId && O.openTask(e.taskId),
								onAsk: () => M(e),
								onTitle: () => {
									let t = $r(e);
									t.kind === "review" && e.group ? O.openReview(e.group, () => void w()) : t.kind === "task" ? O.openTask(t.id) : t.kind === "tab" && i(t.tab);
								}
							}, e.key))
						}), /* @__PURE__ */ b(Rn, { ...k.more("attention", D.attention.length) })]
					}), /* @__PURE__ */ x(Zo, {
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
										style: Qo,
										children: "Wave"
									}),
									/* @__PURE__ */ b("th", {
										style: Qo,
										children: "Task"
									}),
									/* @__PURE__ */ b("th", {
										style: {
											...Qo,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b("span", {
											className: "sr-only",
											children: "Graph"
										})
									})
								] }) }), /* @__PURE__ */ b("tbody", { children: k.take("next", D.readyNext).map((e) => /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("td", {
										style: $o,
										children: /* @__PURE__ */ x(G, {
											variant: "wave",
											children: ["wave ", e.wave]
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...$o,
											width: "100%"
										},
										children: /* @__PURE__ */ b(es, {
											id: e.id,
											title: e.title,
											onOpen: () => O.openTask(e.id)
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...$o,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b(J, {
											icon: we,
											label: `Show ${e.title} in the Graph`,
											onClick: () => i("graph", e.id)
										})
									})
								] }, e.id)) })]
							}),
							/* @__PURE__ */ b(Rn, { ...k.more("next", D.readyNext.length) })
						]
					})]
				}),
				/* @__PURE__ */ x(Xo, {
					height: Yo.recent,
					children: [/* @__PURE__ */ x(Zo, {
						title: `Recently completed (${D.recent.length})`,
						empty: D.recent.length === 0 && "Nothing delivered yet.",
						children: [/* @__PURE__ */ b("table", {
							className: "w-full border-collapse text-sm",
							children: /* @__PURE__ */ b("tbody", { children: k.take("recent", D.recent).map((e) => /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ b("td", {
									style: $o,
									children: /* @__PURE__ */ b("span", {
										role: "img",
										"aria-label": "Done",
										style: { color: "var(--ok)" },
										children: "✓"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...$o,
										width: "100%"
									},
									children: /* @__PURE__ */ b(es, {
										id: e.id,
										title: e.title,
										onOpen: () => O.openTask(e.id)
									})
								}),
								/* @__PURE__ */ b("td", {
									style: $o,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ x("span", {
										className: "flex gap-2 text-xs",
										children: [e.issue && /* @__PURE__ */ b("a", {
											href: Z(e.issue),
											target: "_blank",
											rel: "noreferrer",
											className: "underline",
											children: "issue"
										}), e.pulls.map((e) => /* @__PURE__ */ x("a", {
											href: Z(e.href),
											target: "_blank",
											rel: "noreferrer",
											className: "underline",
											children: ["PR", e.number ? ` #${e.number}` : ""]
										}, e.href))]
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...$o,
										textAlign: "right"
									},
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(X, {
										text: e.at,
										children: /* @__PURE__ */ b("span", { children: Q(e.at, A) })
									})
								})
							] }, e.id)) })
						}), /* @__PURE__ */ b(Rn, { ...k.more("recent", D.recent.length) })]
					}), /* @__PURE__ */ b(Zo, {
						title: "Recent activity",
						children: /* @__PURE__ */ b(cs, {
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
var us = (e) => vn(e);
function ds(e, t) {
	let n = [...e.find((e) => e.id === t)?.sessions ?? []].sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
	return n[0] ? Ti(n[0]) : null;
}
// kirocrew-app/ui/src/markdown.ts
var fs = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
function ps(e) {
	let t = [], n = new RegExp(fs.source, "g"), r = 0, i;
	for (; i = n.exec(e);) i.index > r && t.push({
		kind: "text",
		text: e.slice(r, i.index)
	}), i[1] ? t.push({
		kind: "code",
		text: i[1].slice(1, -1)
	}) : i[2] ? t.push({
		kind: "strong",
		children: ps(i[2].slice(2, -2))
	}) : i[3] ? t.push({
		kind: "em",
		children: ps(i[3].slice(1, -1))
	}) : t.push({
		kind: "link",
		href: zr(i[6]),
		children: ps(i[5])
	}), r = i.index + i[0].length;
	return r < e.length && t.push({
		kind: "text",
		text: e.slice(r)
	}), t;
}
var ms = (e) => e.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((e) => e.trim()), hs = /^\s*\|.*\|\s*$/, gs = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, _s = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
function vs(e) {
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
		if (hs.test(o) && e + 1 < t.length && gs.test(t[e + 1])) {
			a();
			let r = e + 1, i = ms(o), s = [];
			for (e += 2; e < t.length && hs.test(t[e]); e++) s.push(ms(t[e]));
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
		let u = _s.exec(o);
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
var ys = (e, t, n) => `${e}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section"}-${n}`;
function bs(e, t, n = 3) {
	return vs(e).flatMap((e, r) => e.kind === "heading" && e.level <= n ? [{
		level: e.level,
		text: e.text.replace(/[*_`]/g, ""),
		id: ys(t, e.text, r)
	}] : []);
}
// kirocrew-app/ui/src/prism/before.ts
var xs = globalThis;
// node_modules/prismjs/components/prism-sql.js
xs.__avoozlPrismPrevious = xs.Prism, xs.Prism = {
	manual: !0,
	disableWorkerMessageHandler: !0
}, (/* @__PURE__ */ He(((e, t) => {
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
var Ss = globalThis, Cs = Ss.Prism;
Ss.__avoozlPrismPrevious === void 0 ? delete Ss.Prism : Ss.Prism = Ss.__avoozlPrismPrevious, delete Ss.__avoozlPrismPrevious;
// kirocrew-app/ui/src/highlight.ts
var ws = [
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
], Ts = {
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
}, Es = /* @__PURE__ */ new Map();
function Ds(e) {
	if (!e || !Array.isArray(e.tokens)) return null;
	let t = {};
	try {
		e.tokens.forEach((e, n) => {
			let r = ws.includes(e.type) ? e.type : "plain", i = [...new Set(String(e.flags ?? "").replace(/[^imsu]/g, ""))].join("");
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
function Os(e) {
	Es.clear();
	for (let [t, n] of Object.entries(e ?? {})) {
		let e = Ds(n);
		e && Es.set(t.toLowerCase(), e);
	}
	return [...Es.keys()];
}
function ks(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return Es.get(t) ?? Cs.languages[Ts[t] ?? t] ?? null;
}
var As = (e) => Array.isArray(e) ? e.flatMap(As) : typeof e == "string" ? [e] : [{
	types: [e.type, ...[e.alias ?? []].flat()],
	content: As(e.content)
}];
function js(e, t) {
	let n = ks(t);
	if (!n || e.length > 2e4) return null;
	try {
		return As(Cs.tokenize(e, n));
	} catch {
		return null;
	}
}
var Ms = {
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
function Ns(e) {
	let t = [...e].reverse().find((e) => Ms[e]) ?? e.find((e) => Ms[e]);
	return {
		...t ? { color: Ms[t] } : {},
		...e.includes("comment") ? { fontStyle: "italic" } : {}
	};
}
// kirocrew-app/ui/src/Markdown.tsx
function Ps({ parts: e }) {
	return e.map((e, t) => e.kind === "text" ? e.text : e.kind === "code" ? /* @__PURE__ */ b("code", {
		className: "rounded px-1 text-[12px]",
		style: { background: "var(--bg-elevated)" },
		children: e.text
	}, t) : e.kind === "strong" ? /* @__PURE__ */ b("strong", { children: /* @__PURE__ */ b(Ps, { parts: e.children }) }, t) : e.kind === "em" ? /* @__PURE__ */ b("em", { children: /* @__PURE__ */ b(Ps, { parts: e.children }) }, t) : e.href ? /* @__PURE__ */ b("a", {
		href: Z(e.href),
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		style: { color: "var(--accent)" },
		children: /* @__PURE__ */ b(Ps, { parts: e.children })
	}, t) : /* @__PURE__ */ b(Ps, { parts: e.children }, t));
}
var Fs = ({ text: e }) => /* @__PURE__ */ b(Ps, { parts: ps(e) });
function Is({ tokens: e }) {
	return e.map((e, t) => typeof e == "string" ? e : /* @__PURE__ */ b("span", {
		style: Ns(e.types),
		children: /* @__PURE__ */ b(Is, { tokens: e.content })
	}, t));
}
function Ls({ text: e, lang: t, line: n }) {
	let r = js(e, t);
	return /* @__PURE__ */ b("pre", {
		className: "overflow-x-auto rounded border p-2 text-[12px]",
		style: {
			borderColor: "var(--border)",
			background: "var(--bg-elevated)"
		},
		"data-lang": t ?? void 0,
		"data-line": n,
		"data-highlighted": r ? "true" : void 0,
		children: /* @__PURE__ */ b("code", { children: r ? /* @__PURE__ */ b(Is, { tokens: r }) : e })
	});
}
function Rs({ text: e, idPrefix: t, measure: n }) {
	let r = n ? { maxWidth: n } : void 0;
	return /* @__PURE__ */ b("div", {
		className: "flex min-w-0 flex-col gap-2 break-words text-sm leading-relaxed",
		style: { color: "var(--text)" },
		children: vs(e).map((e, n) => {
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
					id: t ? ys(t, e.text, n) : void 0,
					className: `${i} mt-2 font-semibold`,
					style: {
						...r,
						scrollMarginTop: 12
					},
					children: /* @__PURE__ */ b(Fs, { text: e.text })
				}, n);
			}
			if (e.kind === "paragraph") return /* @__PURE__ */ b("p", {
				"data-line": e.line,
				style: r,
				children: /* @__PURE__ */ b(Fs, { text: e.text })
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
				children: /* @__PURE__ */ b(Fs, { text: e.text })
			}, n);
			if (e.kind === "code") return /* @__PURE__ */ b(Ls, {
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
						children: /* @__PURE__ */ b(Fs, { text: e })
					}, t)) }) }), /* @__PURE__ */ b("tbody", { children: e.rows.map((t, n) => /* @__PURE__ */ b("tr", { children: e.head.map((e, n) => /* @__PURE__ */ b("td", {
						className: "border px-2 py-1 align-top",
						style: { borderColor: "var(--border)" },
						children: /* @__PURE__ */ b(Fs, { text: t[n] ?? "" })
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
					}), /* @__PURE__ */ b(Fs, { text: e.text })]
				}, t))
			}, n);
		})
	});
}
// kirocrew-app/ui/src/Authority.tsx
function zs({ owner: e }) {
	if (!e.authority) return null;
	if (e.authority !== "github") return /* @__PURE__ */ b(G, { children: e.authority });
	if (!e.issue) return /* @__PURE__ */ b(G, { children: "pending projection" });
	let t = zr(e.issue.url), n = e.issue.number ? `#${e.issue.number}` : "GitHub";
	return t ? /* @__PURE__ */ b("a", {
		href: Z(t),
		target: "_blank",
		rel: "noreferrer",
		className: "text-xs underline",
		children: n
	}) : /* @__PURE__ */ b(G, { children: n });
}
// kirocrew-app/ui/src/new-plan-api.ts
var Bs = /^[a-z0-9][a-z0-9-]{0,79}$/, Vs = "Name the epic by its spec folder: lowercase letters, digits and hyphens.", Hs = {
	name: "",
	category: "",
	epic: "",
	phases: "",
	repositories: [],
	goal: "",
	context: "",
	idea: ""
};
function Us(e) {
	return e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 80).replace(/-+$/, "");
}
function Ws(e, t) {
	let n = e.trim();
	if (!n) return "Name the spec.";
	if (!Bs.test(n)) {
		let e = Us(n);
		return `Use lowercase letters, digits and hyphens, up to 80 characters${e && e !== n ? `, like ${e}` : ""}.`;
	}
	for (let e of t) if (e === n) return `${n} is already used by a spec or its folder.`;
	return null;
}
function Gs(e, t, n) {
	let r = [], i = Ws(e.name, t);
	return i && r.push(i), n ? e.repositories.length || r.push("Pick at least one repository.") : r.push("Register a repository in Settings › Repositories first."), e.epic.trim() && !Bs.test(e.epic.trim()) && r.push(Vs), e.goal.trim() || r.push("Say what you want."), r;
}
var Ks = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean), qs = (e) => JSON.stringify(e) !== JSON.stringify(Hs), Js = (e) => ({
	name: e.name.trim(),
	category: e.category.trim(),
	epic: e.epic.trim(),
	phases: Ks(e.phases),
	repositories: e.repositories,
	goal: e.goal,
	context: e.context,
	...e.idea ? { idea: e.idea } : {}
});
function Ys(e) {
	let t = async (t, n) => (await e.post(ln, {
		operation: "plan.new",
		workspaceId: t,
		input: n
	})).result;
	return {
		preview: (e, n) => t(e, {
			...Js(n),
			handoff: "spec-builder",
			preview: !0
		}),
		specBuilder: (e, n, r) => t(e, {
			...Js(n),
			handoff: "spec-builder",
			writeSteering: r
		}),
		request: (e, n) => t(e, Js(n))
	};
}
// kirocrew-app/ui/src/spec-builder-api.ts
var Xs = "/api/apps/spec-builder/specs", Zs = "/spec-builder", Qs = "spec-builder:last-open";
function $s(e) {
	return { create: (t) => e.post(Xs, t) };
}
function ec(e) {
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
function tc(e, t) {
	try {
		window.localStorage.setItem(Qs, e);
	} catch {}
	t(Zs);
}
// kirocrew-app/ui/src/NewPlanDrawer.tsx
var nc = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\/private(?=\/)/, "");
	return n(e) === n(t);
}, rc = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, ic = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
function ac(e) {
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
function oc(e) {
	let t = l(), n = o(() => Ys(t), [t]), { openChat: i } = u(), a = d(), f = o(() => $s(t), [t]), m = On(), h = Xe("(max-width: 767px)"), _ = Xe("(prefers-reduced-motion: reduce)"), [v, y] = c(() => ({
		...Hs,
		...e.seed
	})), [S, C] = c(null), [w, T] = c(!1), [E, D] = c(!1), [O, k] = c(!1), [A, j] = c(null), [M, N] = c(null), [P, F] = c(!1), [I, L] = c(!1), R = s(null), z = (e) => {
		y((t) => ({
			...t,
			...e
		})), N(null);
	};
	r(() => {
		let n = !0;
		return un(t).repositories(e.workspaceId).then((e) => {
			if (!n) return;
			let t = e.filter((e) => !e.planning);
			C(t), t.length === 1 && z({ repositories: [t[0].id] });
		}, (e) => n && (C([]), j(K(e)))), () => {
			n = !1;
		};
	}, [t, e.workspaceId]);
	let B = qs(v), ee = async () => {
		O || (!B || await m({
			title: "Discard this new spec?",
			body: "What you typed is not saved anywhere.",
			action: "Discard"
		})) && e.onClose(null);
	}, H = s(ee);
	H.current = ee, rn("drawer", !0, "Close New spec", () => void H.current()), r(() => {
		let e = document.activeElement, t = requestAnimationFrame(() => {
			L(!0), R.current?.querySelector("#avoozl-new-plan-name")?.focus();
		}), n = (e) => {
			if (qn() || e.key !== "Tab" || !R.current) return;
			let t = [...R.current.querySelectorAll(ic)], n = Ze(t.length, t.indexOf(document.activeElement), e.shiftKey);
			n < 0 || (e.preventDefault(), t[n].focus());
		};
		return document.addEventListener("keydown", n), () => {
			cancelAnimationFrame(t), document.removeEventListener("keydown", n), e?.focus?.();
		};
	}, []);
	let U = S ? Gs(v, e.taken, S.length) : [], te = w || E ? Ws(v.name, e.taken) : null, ne = async (e) => {
		k(!0), j(null);
		try {
			await e();
		} catch (e) {
			j(K(e));
		} finally {
			k(!1);
		}
	}, re = async (t) => {
		let r = await n.specBuilder(e.workspaceId, v, t);
		N(null);
		let i;
		try {
			i = await f.create(r.specBuilder);
		} catch (e) {
			let t = ec(e);
			F(t.fallback), j(t.message);
			return;
		}
		let o = i.spec_dir && !nc(i.spec_dir, r.folder);
		e.onClose(o ? `Spec Builder made ${r.name} in ${i.spec_dir}, but Avoozl reads ${r.folder}. Clear Spec Builder's base path setting, or move the folder.` : `Spec Builder is drafting ${r.name}. Avoozl writes its manifest after tasks.md, and it shows here as a draft; you approve it.`), tc(r.name, a);
	}, ie = (e) => ne(() => re(e)), ae = () => {
		if (D(!0), !U.length && S) return F(!1), ne(async () => {
			let t = await n.preview(e.workspaceId, v);
			t.steering.state === "missing" || t.steering.state === "older" ? N(t.steering) : await re(!1);
		});
	}, oe = () => ne(async () => {
		let t = await n.request(e.workspaceId, v);
		i({
			message: t.message,
			agent: t.agent,
			autoSend: !0
		}), e.onClose(`A planner chat is drafting ${t.name}. It shows here as a draft once its folder is complete; you approve it.`);
	});
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0",
		style: {
			zIndex: Ye.drawer,
			display: "flex",
			justifyContent: "flex-end"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			"data-drawer-backdrop": !0,
			onClick: () => void ee(),
			className: "absolute inset-0",
			style: { background: "color-mix(in srgb, var(--text) 25%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: R,
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
					children: /* @__PURE__ */ b(Y, {
						level: 2,
						id: "avoozl-new-plan-title",
						title: "New spec",
						actions: /* @__PURE__ */ b(q, {
							icon: Ve,
							onClick: () => void ee(),
							"aria-label": "Close New spec",
							children: "Close"
						})
					})
				}),
				/* @__PURE__ */ x("form", {
					id: "avoozl-new-plan-form",
					className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
					onSubmit: (e) => {
						e.preventDefault(), ae();
					},
					children: [
						/* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "Kiro Crew's Spec Builder drafts the spec from this: requirements, design, then tasks, each for you to review. Avoozl then writes the manifest, and the spec shows in Specs as a draft. Nothing is approved or started."
						}),
						/* @__PURE__ */ b(ac, {
							id: "avoozl-new-plan-name",
							need: "required",
							label: "Name",
							hint: "Becomes the spec folder name: lowercase letters, digits and hyphens.",
							problem: te,
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-name",
								value: v.name,
								placeholder: "cache-invalidation",
								"aria-invalid": !!te,
								"aria-describedby": te ? "avoozl-new-plan-name-problem" : void 0,
								onChange: (e) => z({ name: e.target.value }),
								onBlur: () => T(!0),
								style: { maxWidth: "24rem" }
							})
						}),
						/* @__PURE__ */ x(ac, {
							id: "avoozl-new-plan-category",
							need: "optional",
							label: "Category",
							hint: "Pick one or type a new one. Left blank, the spec is Uncategorized.",
							children: [/* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-category",
								list: "avoozl-new-plan-categories",
								value: v.category,
								onChange: (e) => z({ category: e.target.value }),
								style: { maxWidth: "18rem" }
							}), /* @__PURE__ */ b("datalist", {
								id: "avoozl-new-plan-categories",
								children: e.categories.map((e) => /* @__PURE__ */ b("option", { value: e }, e))
							})]
						}),
						/* @__PURE__ */ x(ac, {
							id: "avoozl-new-plan-epic",
							need: "optional",
							label: "Epic",
							hint: "Pick an epic, a goal that spans specs. Left blank, the spec is in no epic.",
							problem: v.epic.trim() && !Bs.test(v.epic.trim()) ? Vs : null,
							children: [/* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-epic",
								value: v.epic,
								list: "avoozl-new-plan-epic-list",
								placeholder: "rewrite",
								onChange: (e) => z({ epic: e.target.value }),
								style: { maxWidth: "18rem" }
							}), /* @__PURE__ */ b("datalist", {
								id: "avoozl-new-plan-epic-list",
								children: (e.epics ?? []).map((e) => /* @__PURE__ */ b("option", {
									value: e.id,
									children: e.title
								}, e.id))
							})]
						}),
						/* @__PURE__ */ b(ac, {
							id: "avoozl-new-plan-phases",
							need: "optional",
							label: "Phases",
							hint: "One per line; each becomes a heading in tasks.md. Left blank, the planner picks them.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-phases",
								rows: 3,
								value: v.phases,
								onChange: (e) => z({ phases: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: rc
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
											onChange: (t) => z({ repositories: t.target.checked ? [...v.repositories, e.id] : v.repositories.filter((t) => t !== e.id) })
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
						/* @__PURE__ */ b(ac, {
							id: "avoozl-new-plan-goal",
							need: "required",
							label: "What you want",
							hint: "The planner's first prompt: the goal, who it is for, and what done looks like.",
							problem: E && !v.goal.trim() ? "Say what you want." : null,
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-goal",
								rows: 6,
								value: v.goal,
								onChange: (e) => z({ goal: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: rc
							})
						}),
						/* @__PURE__ */ b(ac, {
							id: "avoozl-new-plan-context",
							need: "optional",
							label: "Links and context",
							hint: "Files, issues and notes the planner should read.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-context",
								rows: 4,
								value: v.context,
								onChange: (e) => z({ context: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: rc
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
										onClick: () => void ie(!0),
										children: "Add the file and open Spec Builder"
									}), /* @__PURE__ */ b(p, {
										type: "button",
										disabled: O,
										onClick: () => void ie(!1),
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
							onClick: () => void oe(),
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: 6
							},
							children: [/* @__PURE__ */ b(xe, {
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
						onClick: () => void ee(),
						disabled: O,
						children: "Cancel"
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/ideas-api.ts
var sc = {
	title: "",
	notes: "",
	links: ""
}, cc = [
	{
		key: "open",
		label: "Open"
	},
	{
		key: "graduated",
		label: "Became a spec"
	},
	{
		key: "archived",
		label: "Archived"
	}
], lc = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean);
function uc(e) {
	let t = [], n = e.title.trim();
	n ? n.length > 240 && t.push("Keep the title to 240 characters.") : t.push("Name the idea."), e.notes.trim().length > 4e3 && t.push("Keep the first note to 4,000 characters.");
	let r = lc(e.links);
	r.length > 50 && t.push("An idea holds at most 50 links.");
	for (let e of r) if (!/^https?:\/\/\S+$/i.test(e)) {
		t.push(`${e.slice(0, 60)} is not an http or https link.`);
		break;
	}
	return t;
}
var dc = (e, t) => e.filter((e) => e.state === t);
function fc(e) {
	let t = e.notes.map((e) => e.text).join("\n\n");
	return {
		name: Us(e.title),
		goal: t ? `${e.title}\n\n${t}` : e.title,
		context: e.links.map((e) => e.label ? `${e.label}: ${e.url}` : e.url).join("\n"),
		idea: e.id
	};
}
function pc(e) {
	let t = async (t, n, r) => (await e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	})).result;
	return {
		capture: (e, n) => t(e, "idea.capture", {
			title: n.title.trim(),
			...n.notes.trim() ? { notes: n.notes } : {},
			links: lc(n.links)
		}),
		append: (e, n, r) => t(e, "idea.append", {
			id: n,
			...r
		}),
		archive: (e, n) => t(e, "idea.archive", { id: n }),
		restore: (e, n) => t(e, "idea.restore", { id: n })
	};
}
// kirocrew-app/ui/src/Ideas.tsx
var mc = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, hc = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, gc = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
}, _c = "Jot down a rough idea. It never starts work; later you can riff on it or make it a spec.";
function vc(e) {
	return /* @__PURE__ */ b(q, {
		icon: ke,
		onClick: e.onClick,
		disabled: e.disabled,
		tooltip: _c,
		children: "New idea"
	});
}
function yc(e) {
	let t = l(), n = o(() => pc(t), [t]), r = On(), [i, a] = c(sc), [s, u] = c(!1), [d, f] = c(!1), [m, h] = c(null), _ = uc(i), v = JSON.stringify(i) !== JSON.stringify(sc), y = async () => {
		d || (!v || await r({
			title: "Discard this idea?",
			body: "What you typed is not saved anywhere.",
			action: "Discard"
		})) && e.onClose(null);
	}, S = async () => {
		if (u(!0), !_.length) {
			f(!0), h(null);
			try {
				e.onClose(await n.capture(e.workspaceId, i));
			} catch (e) {
				h(K(e));
			} finally {
				f(!1);
			}
		}
	};
	return /* @__PURE__ */ b($n, {
		id: "avoozl-new-idea",
		title: "New idea",
		onDismiss: () => void y(),
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center justify-end gap-2",
			children: [/* @__PURE__ */ b(p, {
				type: "button",
				onClick: () => void y(),
				disabled: d,
				children: "Cancel"
			}), /* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				onClick: () => void S(),
				disabled: d,
				children: d ? "Saving…" : "Save idea"
			})]
		}),
		children: /* @__PURE__ */ x("form", {
			className: "flex max-w-2xl flex-col gap-3",
			onSubmit: (e) => {
				e.preventDefault(), S();
			},
			children: [
				/* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "An idea is a rough note. It never starts work. Riff on it in a chat, then make it a spec when it is ready."
				}),
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [/* @__PURE__ */ x("span", {
						className: "font-medium",
						children: ["Title ", /* @__PURE__ */ b("span", {
							className: "font-normal text-muted",
							children: "(required)"
						})]
					}), /* @__PURE__ */ b(g, {
						value: i.title,
						placeholder: "Graph minimap for big specs",
						onChange: (e) => a({
							...i,
							title: e.target.value
						}),
						style: { maxWidth: "32rem" }
					})]
				}),
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [/* @__PURE__ */ x("span", {
						className: "font-medium",
						children: ["Notes ", /* @__PURE__ */ b("span", {
							className: "font-normal text-muted",
							children: "(optional)"
						})]
					}), /* @__PURE__ */ b("textarea", {
						rows: 6,
						value: i.notes,
						onChange: (e) => a({
							...i,
							notes: e.target.value
						}),
						className: "rounded border px-2 py-1 text-sm",
						style: mc
					})]
				}),
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ x("span", {
							className: "font-medium",
							children: ["Links ", /* @__PURE__ */ b("span", {
								className: "font-normal text-muted",
								children: "(optional)"
							})]
						}),
						/* @__PURE__ */ b("textarea", {
							rows: 3,
							value: i.links,
							placeholder: "https://…",
							onChange: (e) => a({
								...i,
								links: e.target.value
							}),
							className: "rounded border px-2 py-1 text-sm",
							style: mc
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "One http or https link per line."
						})
					]
				}),
				s && _.length > 0 && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: _[0]
				}),
				m && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: m
				})
			]
		})
	});
}
var bc = (e, t) => `${e} ${t}${e === 1 ? "" : "s"}`, xc = (e) => e.state === "graduated" ? /* @__PURE__ */ x(G, {
	variant: "success",
	children: ["Spec ", e.graduated?.spec]
}) : e.state === "archived" ? /* @__PURE__ */ b(G, { children: "Archived" }) : null;
function Sc(e) {
	let t = l(), n = o(() => pc(t), [t]), { idea: r } = e, [i, a] = c(""), [s, u] = c(""), [d, f] = c(!1), [m, h] = c(null), _ = r.state === "open", v = async (t, n) => {
		f(!0), h(null);
		try {
			e.onChanged(await t()), n?.();
		} catch (e) {
			h(K(e));
		} finally {
			f(!1);
		}
	};
	return /* @__PURE__ */ b($n, {
		id: "avoozl-idea",
		title: /* @__PURE__ */ x("span", {
			className: "inline-flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ b(ye, {
					size: 18,
					"aria-hidden": "true"
				}),
				r.title,
				" ",
				xc(r)
			]
		}),
		onDismiss: e.onClose,
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				_ && /* @__PURE__ */ b(q, {
					icon: w,
					onClick: () => void v(() => n.archive(e.workspaceId, r.id)),
					disabled: d,
					tooltip: "Hide this idea from the list. Restore brings it back.",
					children: "Archive"
				}),
				r.state === "archived" && /* @__PURE__ */ b(q, {
					icon: T,
					onClick: () => void v(() => n.restore(e.workspaceId, r.id)),
					disabled: d,
					children: "Restore"
				}),
				/* @__PURE__ */ b("span", { className: "flex-1" }),
				_ && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
					icon: Se,
					onClick: e.onRiff,
					tooltip: "Open a chat to think this through. It changes nothing except adding notes and links to this idea.",
					children: "Riff on this"
				}), /* @__PURE__ */ b(q, {
					icon: te,
					primary: !0,
					onClick: e.onMakeSpec,
					tooltip: "Open New spec filled in from this idea. The idea is marked as a spec once you send it.",
					children: "Make it a spec"
				})] }),
				/* @__PURE__ */ b(p, {
					type: "button",
					onClick: e.onClose,
					children: "Close"
				})
			]
		}),
		children: /* @__PURE__ */ x("div", {
			className: "flex max-w-3xl flex-col gap-4 text-sm",
			children: [
				/* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					children: [
						"Saved by ",
						r.author,
						" ",
						Q(r.createdAt),
						r.graduated ? ` · became spec ${r.graduated.spec} ${Q(r.graduated.at)}` : ""
					]
				}),
				/* @__PURE__ */ x("section", {
					"aria-labelledby": "avoozl-idea-notes",
					className: "flex flex-col gap-2",
					children: [
						/* @__PURE__ */ b("h4", {
							id: "avoozl-idea-notes",
							className: "font-semibold",
							children: "Notes"
						}),
						r.notes.length === 0 ? /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "No notes yet."
						}) : /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-2",
							children: r.notes.map((e, t) => /* @__PURE__ */ x("li", {
								className: "rounded border p-2",
								style: { borderColor: "var(--border)" },
								children: [/* @__PURE__ */ b("p", {
									style: { whiteSpace: "pre-wrap" },
									children: e.text
								}), /* @__PURE__ */ x("p", {
									className: "mt-1 text-xs text-muted",
									children: [
										e.author,
										" · ",
										Q(e.at)
									]
								})]
							}, t))
						}),
						_ && /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ b("textarea", {
								"aria-label": "New note",
								rows: 3,
								value: i,
								onChange: (e) => a(e.target.value),
								className: "rounded border px-2 py-1 text-sm",
								style: mc
							}), /* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(q, {
								icon: ke,
								disabled: d || !i.trim(),
								onClick: () => void v(() => n.append(e.workspaceId, r.id, { note: i }), () => a("")),
								children: "Add note"
							}) })]
						})
					]
				}),
				/* @__PURE__ */ x("section", {
					"aria-labelledby": "avoozl-idea-links",
					className: "flex flex-col gap-2",
					children: [
						/* @__PURE__ */ b("h4", {
							id: "avoozl-idea-links",
							className: "font-semibold",
							children: "Links"
						}),
						r.links.length === 0 ? /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "No links yet."
						}) : /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1",
							children: r.links.map((e, t) => /* @__PURE__ */ b("li", { children: zr(e.url) ? /* @__PURE__ */ b("a", {
								href: zr(e.url),
								target: "_blank",
								rel: "noopener noreferrer",
								className: "underline",
								style: { overflowWrap: "anywhere" },
								children: e.label || e.url
							}) : /* @__PURE__ */ b("span", {
								style: { overflowWrap: "anywhere" },
								children: e.label || e.url
							}) }, t))
						}),
						_ && /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ b(g, {
								"aria-label": "New link",
								value: s,
								placeholder: "https://…",
								onChange: (e) => u(e.target.value),
								style: {
									maxWidth: "28rem",
									flex: "1 1 16rem"
								}
							}), /* @__PURE__ */ b(q, {
								icon: ke,
								disabled: d || !s.trim(),
								onClick: () => void v(() => n.append(e.workspaceId, r.id, { link: s.trim() }), () => u("")),
								children: "Add link"
							})]
						})
					]
				}),
				m && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-danger",
					children: m
				})
			]
		})
	});
}
function Cc(e) {
	let t = Pn(e.workspaceId), [n, r] = c("open"), [i, a] = c(null), [o, s] = c({}), l = e.ideas.map((e) => o[e.id] ?? e), u = dc(l, n), d = l.find((e) => e.id === i) ?? null, f = (e) => void t.ask({
		purpose: "riff-idea",
		idea: e.id
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-ideas-view": !0,
		children: [
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Rough ideas from you and your agents. An idea never starts work. Riff on one in a chat, then make it a spec when it is ready."
			}),
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(v, {
				layoutId: "avoozl-ideas-state",
				ariaLabel: "Ideas to show",
				segments: cc.map((e) => ({
					key: e.key,
					label: `${e.label} (${dc(l, e.key).length})`
				})),
				value: n,
				onChange: (e) => r(e)
			}) }),
			t.error && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: t.error
			}),
			u.length === 0 ? /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(ye, {
					size: 36,
					"aria-hidden": "true"
				}),
				title: n === "open" ? "No ideas yet" : n === "archived" ? "Nothing archived" : "No idea has become a spec yet",
				subtitle: n === "open" ? "Use New idea to jot one down. Agents can add ideas too." : "Ideas show here when they move."
			}) : e.narrow ? /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-2",
				"data-ideas-stack": !0,
				children: u.map((t) => /* @__PURE__ */ x("li", {
					className: "rounded border p-3",
					style: { borderColor: "var(--border)" },
					children: [
						/* @__PURE__ */ b("button", {
							type: "button",
							className: "text-left font-medium underline-offset-2 hover:underline",
							onClick: () => a(t.id),
							children: t.title
						}),
						/* @__PURE__ */ x("p", {
							className: "mt-1 text-xs text-muted",
							children: [
								bc(t.notes.length, "note"),
								" · ",
								bc(t.links.length, "link"),
								" · ",
								Q(t.updatedAt),
								" ",
								xc(t)
							]
						}),
						t.state === "open" && /* @__PURE__ */ x("div", {
							className: "mt-2 flex gap-1.5",
							children: [/* @__PURE__ */ b(J, {
								icon: Se,
								label: `Riff on ${t.title}`,
								tooltip: "Open a chat to think this through. It changes nothing except adding notes and links to this idea.",
								onClick: () => f(t)
							}), /* @__PURE__ */ b(J, {
								icon: te,
								label: `Make ${t.title} a spec`,
								tooltip: "Open New spec filled in from this idea. The idea is marked as a spec once you send it.",
								onClick: () => e.onMakeSpec(t)
							})]
						})
					]
				}, t.id))
			}) : /* @__PURE__ */ b("div", {
				className: "overflow-x-auto",
				children: /* @__PURE__ */ x("table", {
					className: "w-full text-sm",
					style: { borderCollapse: "collapse" },
					"data-ideas-table": !0,
					children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
						/* @__PURE__ */ b("th", {
							style: hc,
							children: "Idea"
						}),
						/* @__PURE__ */ b("th", {
							style: hc,
							children: "Notes"
						}),
						/* @__PURE__ */ b("th", {
							style: hc,
							children: "Links"
						}),
						/* @__PURE__ */ b("th", {
							style: hc,
							children: "By"
						}),
						/* @__PURE__ */ b("th", {
							style: hc,
							children: "Changed"
						}),
						/* @__PURE__ */ b("th", {
							style: hc,
							children: /* @__PURE__ */ b("span", {
								className: "sr-only",
								children: "Actions"
							})
						})
					] }) }), /* @__PURE__ */ b("tbody", { children: u.map((t) => /* @__PURE__ */ x("tr", {
						"data-idea-row": t.id,
						children: [
							/* @__PURE__ */ x("td", {
								style: {
									...gc,
									minWidth: "16rem"
								},
								children: [
									/* @__PURE__ */ b("button", {
										type: "button",
										className: "text-left font-medium underline-offset-2 hover:underline",
										onClick: () => a(t.id),
										children: t.title
									}),
									" ",
									xc(t)
								]
							}),
							/* @__PURE__ */ b("td", {
								style: gc,
								className: "tabular-nums",
								children: t.notes.length
							}),
							/* @__PURE__ */ b("td", {
								style: gc,
								className: "tabular-nums",
								children: t.links.length
							}),
							/* @__PURE__ */ b("td", {
								style: gc,
								className: "text-muted",
								children: t.author
							}),
							/* @__PURE__ */ b("td", {
								style: {
									...gc,
									whiteSpace: "nowrap"
								},
								className: "text-muted",
								children: Q(t.updatedAt)
							}),
							/* @__PURE__ */ b("td", {
								style: {
									...gc,
									whiteSpace: "nowrap"
								},
								children: t.state === "open" && /* @__PURE__ */ x("span", {
									className: "flex gap-1.5",
									children: [/* @__PURE__ */ b(J, {
										icon: Se,
										label: `Riff on ${t.title}`,
										tooltip: "Open a chat to think this through. It changes nothing except adding notes and links to this idea.",
										onClick: () => f(t)
									}), /* @__PURE__ */ b(J, {
										icon: te,
										label: `Make ${t.title} a spec`,
										tooltip: "Open New spec filled in from this idea. The idea is marked as a spec once you send it.",
										onClick: () => e.onMakeSpec(t)
									})]
								})
							})
						]
					}, t.id)) })]
				})
			}),
			d && /* @__PURE__ */ b(Sc, {
				workspaceId: e.workspaceId,
				idea: d,
				onChanged: (t) => {
					s({
						...o,
						[t.id]: t
					}), e.onChanged();
				},
				onClose: () => a(null),
				onRiff: () => f(d),
				onMakeSpec: () => {
					a(null), e.onMakeSpec(d);
				}
			})
		]
	});
}
function wc(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
function Tc(e, t = Date.now()) {
	if (!e) return "Driver: unknown";
	if (e.you) return "Driver: you";
	if (e.mode === "local") return `Driver: ${e.driver?.label || e.driver?.machine || "another machine"} · this file`;
	let n = e.driver;
	if (!n || ["no-assignee", "several"].includes(e.reason)) return "Driver: nobody";
	let r = [n.login, n.label].filter(Boolean).join(" · ");
	return e.seenAt ? e.stale ? `Driver: ${r} · not seen since ${e.seenAt}` : `Driver: ${r} · seen ${wc(e.seenAt, t)}` : `Driver: ${r}`;
}
function Ec(e) {
	switch (e.reason) {
		case "other-person": return "Assigned to someone else";
		case "other-machine": return "Your other machine drives this spec";
		case "no-assignee":
		case "several": return "No single assignee";
		case "handed-off": return "Handed off";
		case "forced-away": return "Taken over by force";
		case "no-claim":
		case "no-plan-issue": return "No machine drives this spec yet";
		case "local-other-machine": return "Another machine holds this spec";
		case "not-projected": return "Not on GitHub yet";
		default: return "Read only here";
	}
}
function Dc(e) {
	return e.you || e.state === "unknown" || [
		"no-assignee",
		"several",
		"not-projected",
		"unreadable"
	].includes(e.reason) || e.reason === "handed-off" ? null : e.offer === "takeover" || e.mode === "local" ? "takeover" : "force";
}
function Oc(e) {
	switch (e.kind) {
		case "plugin": return `Approve plugin ${e.id} in Settings › Plugins`;
		case "terms": return `Add the terms file for rule set ${e.id} in Settings › Content rules`;
		case "retro-instructions": return "Write retro instructions again in Settings › Flow";
		case "router-instructions": return "Write the routing prompt again in Settings › Routing";
		default: return `Set up ${e.kind}${e.id ? " " + e.id : ""} again`;
	}
}
function kc(e, t, n, r) {
	return t.trim() === e.spec ? !r.trim() && !n ? "Tick that you understand what a rebuild loses, or give an export file." : r.trim() && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(r.trim()) ? "Give the export file by its full path." : null : `Type ${e.spec} to confirm.`;
}
function Ac(e) {
	let t = e.label.trim();
	if (t.length > 40) return { error: "A machine label is at most 40 characters." };
	if (/[/\\]/.test(t)) return { error: "A machine label has no slash." };
	let n = e.heartbeat.trim(), r = null;
	return n && (r = Number(n), !Number.isInteger(r) || r < 5 || r > 60) ? { error: "Heartbeat minutes must be a whole number from 5 to 60." } : { input: {
		label: t || null,
		heartbeatMinutes: r
	} };
}
function jc(e) {
	let t = (t, n, r = {}) => e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		status: (e, n) => t(e, "driver.status", n ? { planId: n } : {}),
		preview: (e, n, r) => t(e, "driver.takeover.preview", {
			planId: n,
			rebuild: r
		}),
		handoff: (e, n, r, i = {}) => t(e, "driver.handoff", {
			planId: n,
			action: r,
			...i
		}),
		takeover: (e, n, r) => t(e, "driver.takeover", {
			planId: n,
			...r.file ? { file: r.file } : {},
			...r.rebuild ? {
				rebuild: !0,
				acknowledgeLoss: !0
			} : {}
		}),
		force: (e, n, r, i) => t(e, "driver.forceTakeover", {
			planId: n,
			confirm: r,
			...i ? { file: i } : { acknowledgeLoss: !0 }
		}),
		decideAway: (e, n, r) => t(e, "driver.away.decide", {
			taskId: n,
			choice: r
		}),
		saveMachine: (e, n) => t(e, "driver.settings.update", n)
	};
}
// kirocrew-app/ui/src/Driver.tsx
var Mc = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
};
function Nc(e, n) {
	let i = l(), a = o(() => jc(i), [i]), [s, u] = c(null), d = t(() => {
		e && a.status(e, n ?? void 0).then(u, () => void 0);
	}, [
		a,
		e,
		n
	]);
	return r(() => {
		d();
		let e = setInterval(d, 6e4);
		return () => clearInterval(e);
	}, [d]), {
		status: s,
		spec: n ? s?.specs.find((e) => e.planId === n) ?? null : null,
		reload: d,
		client: a
	};
}
function Pc(e) {
	let { spec: t } = e;
	return t ? /* @__PURE__ */ x("span", {
		"data-driver-chip": !0,
		className: "inline-flex items-center gap-1.5 text-sm",
		children: [/* @__PURE__ */ b(ge, {
			size: 14,
			"aria-hidden": "true",
			style: { color: "var(--muted)" }
		}), /* @__PURE__ */ b(G, {
			variant: t.you ? "success" : t.stale ? "warning" : void 0,
			children: Tc(t)
		})]
	}) : null;
}
function Fc(e) {
	let { status: t } = Nc(e.workspaceId, null);
	if (!t?.enabled || !t.specs.length) return null;
	let n = t.readOnly ?? 0, r = n ? `${n} of ${t.specs.length} specs read only here` : "Driver: you";
	return /* @__PURE__ */ b(X, {
		text: n ? "Another machine or person drives these specs. Open one in Specs to see why." : "This machine drives every approved spec.",
		children: (e) => /* @__PURE__ */ x("span", {
			"data-driver-summary": !0,
			"aria-describedby": e,
			className: "inline-flex items-center gap-1.5 text-sm",
			children: [/* @__PURE__ */ b(ge, {
				size: 14,
				"aria-hidden": "true",
				style: { color: "var(--muted)" }
			}), /* @__PURE__ */ b(G, {
				variant: n ? "warning" : "success",
				children: r
			})]
		})
	});
}
function Ic(e) {
	let { spec: t } = e, [n, r] = c(null);
	if (!t || t.you || t.state === "unknown") return null;
	let i = Dc(t), a = zr(t.issue?.url ?? null);
	return /* @__PURE__ */ x("div", {
		role: "status",
		"data-driver-banner": !0,
		className: "mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
		style: {
			borderColor: "var(--warning, var(--border))",
			background: "color-mix(in srgb, var(--warning, var(--muted)) 10%, var(--card, transparent))"
		},
		children: [
			/* @__PURE__ */ b(be, {
				size: 18,
				"aria-hidden": "true",
				style: { color: "var(--muted)" }
			}),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ x("span", {
						className: "font-medium",
						children: [
							"Read only here. ",
							Ec(t),
							"."
						]
					}),
					" ",
					/* @__PURE__ */ b("span", {
						className: "text-muted",
						children: t.text
					}),
					a && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ x("a", {
						href: zr(a) ?? void 0,
						target: "_blank",
						rel: "noreferrer",
						className: "inline-flex items-center gap-1 underline",
						children: [
							"Plan issue #",
							t.issue?.number,
							" ",
							/* @__PURE__ */ b(V, {
								size: 12,
								"aria-hidden": "true"
							})
						]
					})] })
				]
			}),
			i === "takeover" && /* @__PURE__ */ b(q, {
				icon: he,
				primary: !0,
				tooltip: "Drive this spec on this machine. You choose how its run state comes over.",
				onClick: () => r("takeover"),
				children: "Take over"
			}),
			i === "force" && /* @__PURE__ */ b(q, {
				icon: he,
				tooltip: "Assign the plan issue to you and drive the spec here. You confirm first.",
				onClick: () => r("force"),
				style: wn,
				children: "Force take over"
			}),
			n === "takeover" && /* @__PURE__ */ b(Bc, {
				workspaceId: e.workspaceId,
				spec: t,
				onClose: (t) => {
					r(null), t && e.onChanged();
				}
			}),
			n === "force" && /* @__PURE__ */ b(Vc, {
				workspaceId: e.workspaceId,
				spec: t,
				onClose: (t) => {
					r(null), t && e.onChanged();
				}
			})
		]
	});
}
function Lc(e) {
	let t = e.spec?.you ? e.spec.setup : [];
	return t.length ? /* @__PURE__ */ x("div", {
		"data-driver-setup": !0,
		className: "mb-3 rounded-lg border p-3 text-sm",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b("p", {
				className: "font-medium",
				children: "Set these up on this machine"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "They stay on each machine. Until they are back, their tasks wait and their checks block writes."
			}),
			/* @__PURE__ */ b("ul", {
				className: "mt-1 list-disc pl-5",
				children: t.map((e) => /* @__PURE__ */ b("li", { children: Oc(e) }, e.kind + (e.id ?? "")))
			})
		]
	}) : null;
}
function Rc(e) {
	return e.preview?.lost.length ? /* @__PURE__ */ x("div", {
		"data-driver-loss": !0,
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b("p", {
				className: "font-medium",
				children: "A rebuild from GitHub loses"
			}),
			/* @__PURE__ */ b("ul", {
				className: "list-disc pl-5",
				children: e.preview.lost.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"The next tick raises again: ",
					e.preview.reraised.join(", "),
					"."
				]
			})
		]
	}) : null;
}
function zc(e) {
	return /* @__PURE__ */ x("label", {
		className: "flex flex-col gap-1 text-sm",
		htmlFor: e.id,
		children: [
			"Export file ",
			/* @__PURE__ */ x("span", {
				className: "text-xs text-muted",
				children: [
					"(full path to ",
					"<spec>",
					".avoozl-driver.json)"
				]
			}),
			/* @__PURE__ */ b(g, {
				id: e.id,
				value: e.value,
				onChange: (t) => e.onChange(t.target.value),
				style: Mc,
				placeholder: "/path/to/s1.avoozl-driver.json"
			})
		]
	});
}
function Bc(e) {
	let { spec: t } = e, n = l(), i = o(() => jc(n), [n]), [a, s] = c((t.mode, "file")), [u, d] = c(""), [f, m] = c(null), [h, g] = c(null), [_, v] = c(!1);
	r(() => {
		if (a !== "rebuild") return m(null);
		i.preview(e.workspaceId, t.planId, !0).then(m, (e) => g(K(e)));
	}, [
		i,
		a,
		e.workspaceId,
		t.planId
	]);
	let S = async () => {
		v(!0), g(null);
		try {
			(await i.takeover(e.workspaceId, t.planId, a === "file" ? { file: u.trim() } : a === "rebuild" ? { rebuild: !0 } : {})).won === !1 ? g("Another machine took it over at the same time and won. This spec reads only here.") : e.onClose(!0);
		} catch (e) {
			g(K(e));
		} finally {
			v(!1);
		}
	}, C = [
		{
			key: "file",
			label: "From an export",
			note: "The file the old driver wrote. Avoozl checks it against the claim before anything changes."
		},
		...t.mode === "local" ? [] : [{
			key: "rebuild",
			label: "Rebuild from GitHub",
			note: "When the old machine is gone. Some local history is lost."
		}],
		{
			key: "claim",
			label: "Keep this machine’s records",
			note: "Your other machine handed it to you, or this workspace already has its state."
		}
	];
	return /* @__PURE__ */ b($n, {
		id: "avoozl-driver-takeover",
		title: `Take over ${t.spec}`,
		onDismiss: () => e.onClose(!1),
		footer: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
			type: "button",
			onClick: () => e.onClose(!1),
			children: "Cancel"
		}), /* @__PURE__ */ b(p, {
			type: "button",
			primary: !0,
			disabled: _ || a === "file" && !u.trim(),
			onClick: () => void S(),
			children: "Take over"
		})] }),
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-3",
			children: [
				/* @__PURE__ */ b("p", {
					className: "text-sm",
					children: t.text
				}),
				/* @__PURE__ */ x("fieldset", {
					className: "flex flex-col gap-2",
					children: [/* @__PURE__ */ b("legend", {
						className: "text-sm font-medium",
						children: "How its run state comes over"
					}), C.map((e) => /* @__PURE__ */ x("label", {
						className: "flex items-start gap-2 text-sm",
						children: [/* @__PURE__ */ b("input", {
							type: "radio",
							name: "avoozl-driver-how",
							checked: a === e.key,
							onChange: () => s(e.key)
						}), /* @__PURE__ */ x("span", { children: [
							e.label,
							" ",
							/* @__PURE__ */ b("span", {
								className: "block text-xs text-muted",
								children: e.note
							})
						] })]
					}, e.key))]
				}),
				a === "file" && /* @__PURE__ */ b(zc, {
					id: "avoozl-driver-file",
					value: u,
					onChange: d
				}),
				a === "rebuild" && /* @__PURE__ */ b(Rc, { preview: f }),
				/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Avoozl waits 10 seconds and reads the plan issue again; it drives only if its claim is still there."
				}),
				h && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: h
				})
			]
		})
	});
}
function Vc(e) {
	let { spec: t } = e, n = l(), i = o(() => jc(n), [n]), [a, s] = c(""), [u, d] = c(""), [f, m] = c(!1), [h, _] = c(null), [v, S] = c(null), [C, w] = c(!1);
	r(() => {
		i.preview(e.workspaceId, t.planId, !0).then(_, (e) => S(K(e)));
	}, [
		i,
		e.workspaceId,
		t.planId
	]);
	let T = kc(t, a, f, u), E = async () => {
		w(!0), S(null);
		try {
			await i.force(e.workspaceId, t.planId, a.trim(), u.trim() || void 0), e.onClose(!0);
		} catch (e) {
			S(K(e));
		} finally {
			w(!1);
		}
	}, D = h?.current.driver ?? t.driver ?? null;
	return /* @__PURE__ */ b($n, {
		id: "avoozl-driver-force",
		title: `Force take over ${t.spec}`,
		onDismiss: () => e.onClose(!1),
		footer: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
			type: "button",
			onClick: () => e.onClose(!1),
			children: "Cancel"
		}), /* @__PURE__ */ b(X, {
			text: T ?? void 0,
			children: (e) => /* @__PURE__ */ b(p, {
				type: "button",
				"aria-describedby": e,
				disabled: C || !!T,
				onClick: () => void E(),
				style: {
					background: "var(--danger)",
					borderColor: "var(--danger)",
					color: "#fff"
				},
				children: "Force take over"
			})
		})] }),
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-3 text-sm",
			"data-driver-force": !0,
			children: [
				/* @__PURE__ */ x("dl", {
					className: "grid gap-x-3 gap-y-1",
					style: { gridTemplateColumns: "auto 1fr" },
					children: [
						/* @__PURE__ */ b("dt", {
							className: "text-muted",
							children: "Assigned to"
						}),
						/* @__PURE__ */ b("dd", { children: (h?.current.assignees ?? t.assignees ?? []).join(", ") || "nobody" }),
						/* @__PURE__ */ b("dt", {
							className: "text-muted",
							children: "Driving machine"
						}),
						/* @__PURE__ */ x("dd", { children: [
							D?.label || "no label",
							" ",
							/* @__PURE__ */ b("code", {
								className: "text-xs",
								children: D?.machine ?? "none"
							})
						] }),
						/* @__PURE__ */ b("dt", {
							className: "text-muted",
							children: "Last heartbeat"
						}),
						/* @__PURE__ */ b("dd", { children: t.seenAt ? `${t.seenAt} (${wc(t.seenAt)})` : "never" })
					]
				}),
				/* @__PURE__ */ b("p", { children: "That machine may still be running chats for this spec. Their local results will not come here; what they push to GitHub does. Avoozl sets the plan issue's assignee to you, the one assignee change it ever makes." }),
				/* @__PURE__ */ b(zc, {
					id: "avoozl-driver-force-file",
					value: u,
					onChange: d
				}),
				!u.trim() && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Rc, { preview: h }), /* @__PURE__ */ x("label", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: f,
						onChange: (e) => m(e.target.checked)
					}), "I understand what a rebuild from GitHub loses"]
				})] }),
				/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1",
					htmlFor: "avoozl-driver-force-name",
					children: [
						"Type ",
						/* @__PURE__ */ b("code", { children: t.spec }),
						" to confirm",
						/* @__PURE__ */ b(g, {
							id: "avoozl-driver-force-name",
							value: a,
							onChange: (e) => s(e.target.value),
							style: Mc,
							autoComplete: "off"
						})
					]
				}),
				v && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-danger",
					children: v
				})
			]
		})
	});
}
function Hc(e) {
	let [t, n] = c(!1), { spec: r } = e;
	return !r?.you && r?.handoff?.state !== "exported" ? null : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
		icon: Pe,
		tooltip: "Stop new work for this spec, export its run state, then reassign it on GitHub",
		onClick: () => n(!0),
		children: r.handoff ? "Hand off…" : "Hand off driver"
	}), t && /* @__PURE__ */ b(Uc, {
		workspaceId: e.workspaceId,
		spec: r,
		onClose: () => {
			n(!1), e.onChanged();
		}
	})] });
}
function Uc(e) {
	let t = l(), n = o(() => jc(t), [t]), [r, i] = c(e.spec), [a, s] = c(e.spec.handoff?.folder ?? ""), [u, d] = c(e.spec.handoff?.file ?? null), [f, m] = c(null), [h, _] = c(!1), v = r.handoff ? r.handoff.state === "draining" ? "drain" : "reassign" : "start", S = async (e) => {
		_(!0), m(null);
		try {
			let t = await e(), n = t.specs.find((e) => e.planId === r.planId);
			n && i(n), t.file && d(t.file);
		} catch (e) {
			m(K(e));
		} finally {
			_(!1);
		}
	}, C = r.handoff?.running ?? [], w = zr(r.issue?.url ?? null);
	return /* @__PURE__ */ b($n, {
		id: "avoozl-driver-handoff",
		title: `Hand off ${r.spec}`,
		onDismiss: e.onClose,
		footer: /* @__PURE__ */ x(y, { children: [
			v === "drain" && /* @__PURE__ */ b(p, {
				type: "button",
				disabled: h,
				onClick: () => void S(() => n.handoff(e.workspaceId, r.planId, "cancel")),
				children: "Cancel hand-off"
			}),
			/* @__PURE__ */ b(p, {
				type: "button",
				onClick: e.onClose,
				children: "Close"
			}),
			v === "start" && /* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				disabled: h,
				onClick: () => void S(() => n.handoff(e.workspaceId, r.planId, "start", a.trim() ? { folder: a.trim() } : {})),
				children: "Stop new work"
			}),
			v === "drain" && /* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				disabled: h || !a.trim(),
				onClick: () => void S(() => n.handoff(e.workspaceId, r.planId, "export", {
					folder: a.trim(),
					...C.length ? { unfinished: !0 } : {}
				})),
				children: C.length ? `Export with ${C.length} unfinished` : "Export"
			})
		] }),
		children: /* @__PURE__ */ x("ol", {
			className: "flex flex-col gap-4 text-sm",
			"data-driver-handoff": !0,
			children: [
				/* @__PURE__ */ x("li", {
					"aria-current": v === "start" || v === "drain" ? "step" : void 0,
					children: [
						/* @__PURE__ */ b("p", {
							className: "font-medium",
							children: "1. Drain"
						}),
						/* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "No new work starts for this spec. Running chats keep running and are never ended; their reports still apply."
						}),
						v !== "start" && /* @__PURE__ */ x("div", {
							className: "mt-1",
							children: [C.length ? `${C.length} chat(s) still running:` : "No chat is running.", C.length > 0 && /* @__PURE__ */ b("ul", {
								className: "list-disc pl-5",
								children: C.map((e) => /* @__PURE__ */ x("li", { children: [
									e.taskId,
									" ",
									/* @__PURE__ */ x("span", {
										className: "text-muted",
										children: [
											"(",
											e.role,
											", ",
											e.status ?? "unknown",
											")"
										]
									})
								] }, e.slot))
							})]
						})
					]
				}),
				/* @__PURE__ */ x("li", {
					"aria-current": v === "drain" ? "step" : void 0,
					children: [
						/* @__PURE__ */ b("p", {
							className: "font-medium",
							children: "2. Export"
						}),
						/* @__PURE__ */ x("p", {
							className: "text-muted",
							children: [
								"One file, ",
								r.spec,
								".avoozl-driver.json, in a folder you pick outside the workspace repository. It may hold private notes: Avoozl never uploads, commits or pushes it. With a folder set, Avoozl writes it once the last chat ends."
							]
						}),
						v !== "reassign" && /* @__PURE__ */ x("label", {
							className: "mt-1 flex flex-col gap-1",
							htmlFor: "avoozl-driver-folder",
							children: [
								"Folder ",
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "(full path)"
								}),
								/* @__PURE__ */ b(g, {
									id: "avoozl-driver-folder",
									value: a,
									onChange: (e) => s(e.target.value),
									style: Mc,
									placeholder: "/path/to/a/folder"
								})
							]
						}),
						u && /* @__PURE__ */ x("p", {
							className: "mt-1",
							children: ["Written: ", /* @__PURE__ */ b("code", { children: u })]
						})
					]
				}),
				/* @__PURE__ */ x("li", {
					"aria-current": v === "reassign" ? "step" : void 0,
					children: [
						/* @__PURE__ */ b("p", {
							className: "font-medium",
							children: "3. Reassign"
						}),
						/* @__PURE__ */ b("p", {
							className: "text-muted",
							children: r.mode === "local" ? "Move the file to the other machine and press Take over there." : "Assign the plan issue to the person who takes over. Avoozl does not reassign it. Your other machine needs no reassignment: press Take over there."
						}),
						v === "reassign" && w && /* @__PURE__ */ x("a", {
							href: zr(w) ?? void 0,
							target: "_blank",
							rel: "noreferrer",
							className: "mt-1 inline-flex items-center gap-1 underline",
							children: ["Reassign it on GitHub ", /* @__PURE__ */ b(V, {
								size: 12,
								"aria-hidden": "true"
							})]
						})
					]
				}),
				f && /* @__PURE__ */ b("li", {
					role: "alert",
					className: "text-danger",
					children: f
				})
			]
		})
	});
}
function Wc(e) {
	let { status: t, client: n, reload: i } = Nc(e.workspaceId, null), [a, o] = c({
		label: "",
		heartbeat: ""
	}), [s, l] = c(null), [u, d] = c(null);
	if (r(() => {
		t?.machine && o({
			label: t.machine.label ?? "",
			heartbeat: t.machine.heartbeatMinutes ? String(t.machine.heartbeatMinutes) : ""
		});
	}, [t?.machine?.label, t?.machine?.heartbeatMinutes]), !e.workspaceId || !t?.enabled || !t.machine) return null;
	let f = async () => {
		let t = Ac(a);
		if (t.error || !t.input) return d(t.error ?? null);
		d(null);
		try {
			await n.saveMachine(e.workspaceId, t.input), l("Saved on this computer."), i();
		} catch (e) {
			d(K(e));
		}
	};
	return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("section", {
		"data-this-computer": !0,
		"aria-labelledby": "avoozl-this-computer",
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b("h4", {
				id: "avoozl-this-computer",
				className: "text-base font-semibold",
				children: "This computer"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "These stay on this machine. The label shows in plan issues so people can tell your machines apart."
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-4",
				children: [/* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					htmlFor: "avoozl-machine-label",
					children: [
						"Machine label ",
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "(optional)"
						}),
						/* @__PURE__ */ b(g, {
							id: "avoozl-machine-label",
							maxLength: 40,
							value: a.label,
							onChange: (e) => o({
								...a,
								label: e.target.value
							}),
							style: Mc,
							placeholder: "laptop"
						})
					]
				}), /* @__PURE__ */ x("label", {
					className: "flex flex-col gap-1 text-sm",
					htmlFor: "avoozl-machine-heartbeat",
					children: [
						"Heartbeat minutes ",
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "(optional)"
						}),
						/* @__PURE__ */ b(g, {
							id: "avoozl-machine-heartbeat",
							inputMode: "numeric",
							value: a.heartbeat,
							onChange: (e) => o({
								...a,
								heartbeat: e.target.value
							}),
							style: Mc,
							placeholder: "15"
						})
					]
				})]
			}),
			/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: ["Machine ID ", /* @__PURE__ */ b("code", { children: t.machine.id })]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "In Local only mode the driver lock guards only workspaces that open this database or a copy of it. It cannot see another machine, and there is no forced take-over between machines."
			}),
			/* @__PURE__ */ x("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: () => void f(),
					children: "Save"
				}), s && /* @__PURE__ */ b("span", {
					role: "status",
					className: "text-sm text-muted",
					children: s
				})]
			}),
			u && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: u
			})
		]
	}) });
}
// kirocrew-app/ui/src/filters.ts
var Gc = "(none)", Kc = "(none)", qc = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : null, Jc = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : void 0, Yc = (e) => !!(e.q?.trim() || e.plan || e.epic || e.phase || e.repository || e.state || e.waveMin || e.waveMax || e.authority || e.needsYou || e.archived), Xc = (e, t) => !e.planArchived || !!(t.archived || t.plan);
function Zc(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "", r = t.plan;
	return Xc(e, t) && (!n || e.title.toLowerCase().includes(n) || e.id.toLowerCase().includes(n)) && (!r || (r.startsWith("spec:") ? e.spec === r.slice(5) : r.startsWith("plan:") ? e.planId === r.slice(5) : !1)) && (!t.epic || (t.epic === "(none)" ? !e.epic : e.epic === t.epic)) && (!t.phase || !r || (t.phase === "(none)" ? !e.phase : e.phase?.id === t.phase)) && (!t.repository || (t.repository === "(none)" ? !e.repository : e.repository === t.repository)) && (!t.state || e.state === t.state) && (!t.waveMin || e.wave >= t.waveMin) && (!t.waveMax || e.wave <= t.waveMax) && (!t.authority || (e.authority ?? "local") === t.authority) && (!t.needsYou || e.state === "needs-you" || !!e.decision);
}
var Qc = (e, t) => ({
	id: e.id,
	title: e.title,
	epic: e.epic,
	phase: e.phase ?? null,
	planId: e.planId ?? null,
	spec: e.spec ?? null,
	repository: e.repository,
	authority: e.authority,
	state: dt(e),
	wave: t,
	decision: e.decision,
	planArchived: e.planArchived ?? null
});
function $c(e, t = {}, n) {
	let r = e?.tasks ?? [], i = e ? ft(e) : /* @__PURE__ */ new Map(), a = (e, t) => {
		let n = /* @__PURE__ */ new Set();
		for (let t of r) {
			let r = e(t);
			r && n.add(r);
		}
		return [...n].map((e) => ({
			value: e,
			label: t(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, o = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), s = /* @__PURE__ */ new Set([...e?.repositories ?? [], ...r.map((e) => e.repository).filter((e) => !!e)]);
	return {
		plans: a(qc, (e) => t[e] ?? e.replace(/^(spec|plan):/, "")),
		epics: [...a((e) => e.epic, (e) => o.get(e) ?? e), ...r.some((e) => !e.epic) ? [{
			value: Kc,
			label: "No epic"
		}] : []],
		phases: (() => {
			if (!n) return [];
			let e = r.filter((e) => qc(e) === n), t = /* @__PURE__ */ new Map();
			for (let n of e) n.phase && !t.has(n.phase.id) && t.set(n.phase.id, n.phase.title);
			return [...[...t].map(([e, t]) => ({
				value: e,
				label: t
			})), ...e.some((e) => !e.phase) ? [{
				value: Kc,
				label: "No phase"
			}] : []];
		})(),
		repositories: [...[...s].sort().map((e) => ({
			value: e,
			label: e
		})), ...r.some((e) => !e.repository) ? [{
			value: Gc,
			label: "No repository"
		}] : []],
		states: nt.map((e) => ({
			value: e.id,
			label: e.label
		})),
		authorities: a((e) => e.authority ?? "local", (e) => e),
		waves: Math.max(0, ...i.values())
	};
}
function el(e, t) {
	if (!Yc(t) && !e.tasks.some((e) => e.planArchived)) return e;
	let n = ft(e), r = e.tasks.filter((e) => Zc(Qc(e, n.get(e.id) ?? 1), t)), i = new Set(r.map((e) => e.id));
	return {
		...e,
		tasks: r,
		edges: e.edges.filter((e) => i.has(e.from) && i.has(e.to))
	};
}
var tl = (e) => `avoozl.filters.${e}`, nl = "avoozl-filter";
function rl(e, t) {
	try {
		let n = JSON.parse(e?.getItem(tl(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of [
			"q",
			"plan",
			"epic",
			"phase",
			"repository",
			"authority"
		]) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		nt.some((e) => e.id === n.state) && (r.state = n.state);
		for (let e of ["waveMin", "waveMax"]) Number.isInteger(n[e]) && n[e] > 0 && (r[e] = n[e]);
		return n.needsYou === !0 && (r.needsYou = !0), n.archived === !0 && (r.archived = !0), r;
	} catch {
		return {};
	}
}
function il(e, t, n) {
	try {
		e?.setItem(tl(t), JSON.stringify(n));
	} catch {}
}
function al(e, t) {
	let n = {
		...e,
		...t
	};
	for (let e of Object.keys(n)) (n[e] === void 0 || n[e] === "" || n[e] === !1) && delete n[e];
	return n;
}
// kirocrew-app/ui/src/sticky-column.ts
function ol(e, t = (e) => getComputedStyle(e)) {
	for (let n = e?.parentElement ?? null; n; n = n.parentElement) if (/(auto|scroll|overlay)/.test(t(n).overflowY)) return n;
	return null;
}
function sl(e, t) {
	let n = t;
	if (e) {
		let r = e.getBoundingClientRect?.(), i = r ? Math.min(t, r.bottom) - Math.max(0, r.top) : e.clientHeight;
		n = Math.min(e.clientHeight || i, i);
	}
	return Math.max(240, Math.floor(n - 16));
}
// kirocrew-app/ui/src/PlansView.tsx
var cl = "80ch", ll = "17rem", ul = "(max-width: 1023px)";
function dl(e) {
	let [n, i] = c(null), a = s(null), o = t((t) => {
		if (a.current?.(), a.current = null, !t || !e) return;
		let n = ol(t), r = () => i(sl(n, window.innerHeight));
		r();
		let o = n && typeof ResizeObserver < "u" ? new ResizeObserver(r) : null;
		n && o?.observe(n), window.addEventListener("resize", r), a.current = () => {
			o?.disconnect(), window.removeEventListener("resize", r);
		};
	}, [e]);
	return r(() => () => a.current?.(), []), [o, n];
}
var fl = (e) => `avoozl-doc-${e.replace(/\.md$/, "")}`, pl = (e) => document.getElementById(e)?.scrollIntoView?.({ block: "start" });
function ml({ docs: e, error: t }) {
	let n = ea(e);
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
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
			}), /* @__PURE__ */ b(Rs, {
				text: t.text,
				idPrefix: fl(t.file),
				measure: cl
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
function hl(e) {
	let { projection: t, busy: n } = e;
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
		title: "GitHub preview",
		blurb: "Lists every write a projection would make. Nothing is written.",
		actions: /* @__PURE__ */ b(zn, {
			tooltip: "List every GitHub write this spec would make. Makes none.",
			onClick: e.onPreview,
			disabled: n,
			children: t ? "Preview again" : "Preview GitHub writes"
		})
	}), t && /* @__PURE__ */ x("div", {
		className: "mt-3 flex flex-col gap-2 text-sm",
		children: [
			t.previewOnly.length > 0 && /* @__PURE__ */ x("p", { children: [
				/* @__PURE__ */ b(G, { children: "preview only" }),
				" Another machine writes ",
				t.previewOnly.join(", "),
				"."
			] }),
			t.writes.length === 0 ? /* @__PURE__ */ b("p", {
				className: "text-muted",
				children: "GitHub already matches this revision."
			}) : ia(t.writes).map(([e, t]) => /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("p", {
				className: "font-medium",
				children: [
					e,
					" · ",
					t.length,
					" writes"
				]
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-0.5",
				children: t.map((e, t) => /* @__PURE__ */ b("li", { children: ra(e) }, t))
			})] }, e)),
			t.conflicts.map((e) => /* @__PURE__ */ x("p", { children: [
				/* @__PURE__ */ b(G, {
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
function gl(e) {
	let { spec: t, plan: n, preview: r, busy: i } = e, a = aa(n), o = n?.disk.critique ?? t.critique, s = n?.quality.diagnostics ?? [];
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x(m, { children: [
				/* @__PURE__ */ b(Y, {
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
						/* @__PURE__ */ b("code", { children: ta(n.hash) }),
						" · ",
						n.state
					]
				}) : /* @__PURE__ */ b("p", {
					className: "mt-1 text-sm",
					children: "Import stores this folder as a draft spec, so you can check and approve it. It approves nothing and starts nothing."
				}),
				/* @__PURE__ */ b("p", {
					className: "mt-1 text-xs text-muted",
					children: "Avoozl delivers this spec. Do not use Spec Builder's Approve tasks or Kiro's Run all Tasks on it."
				}),
				/* @__PURE__ */ x("div", {
					className: "mt-3 flex flex-wrap gap-2",
					children: [
						!n && /* @__PURE__ */ b(q, {
							icon: ee,
							tooltip: "Store this folder as a draft spec. Approves and starts nothing.",
							onClick: e.onStore,
							disabled: i,
							children: "Import"
						}),
						n?.disk.changed && /* @__PURE__ */ b(q, {
							icon: je,
							tooltip: "Store the changed files as a new revision to approve",
							onClick: e.onReload,
							disabled: i,
							children: "Reload from disk"
						}),
						n && /* @__PURE__ */ x(q, {
							icon: R,
							onClick: e.onApprove,
							disabled: i || a !== null,
							tooltip: a ?? "Approve this exact revision. Its ready tasks may then start.",
							children: ["Approve revision ", ta(n.hash)]
						})
					]
				}),
				n && a && /* @__PURE__ */ b("p", {
					className: "mt-2 text-sm text-muted",
					children: a
				})
			] }),
			/* @__PURE__ */ b(ml, {
				docs: e.docs,
				error: e.docsError
			}, t.name),
			/* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
				title: "Diagnostics",
				className: "mb-2"
			}), n ? s.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No diagnostics."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: s.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(G, {
						variant: e.severity === "error" ? "danger" : void 0,
						children: e.severity
					}),
					" ",
					/* @__PURE__ */ b("code", { children: na(e) }),
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
			/* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
				title: "Critique",
				className: "mb-2"
			}), o ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("p", {
				className: "mt-2 text-sm",
				children: o.current ? "Reviews this revision." : `Reviews ${ta(o.reviewedHash)}, not this revision.`
			}), o.findings.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-1 text-sm text-muted",
				children: "No findings."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: o.findings.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(G, { children: e.kind }),
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
				/* @__PURE__ */ b(Y, {
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
							/* @__PURE__ */ b(zs, { owner: e }),
							r.baseline?.taskIds.includes(e.taskId) && /* @__PURE__ */ b(G, { children: "done" }),
							t.length > 0 && /* @__PURE__ */ x("span", {
								className: "text-muted",
								children: [" · requires ", t.join(", ")]
							})
						] }, e.taskId);
					})
				})
			] }),
			n?.state === "approved" && /* @__PURE__ */ b(hl, {
				projection: e.projection,
				busy: i,
				onPreview: e.onProjection
			}),
			n && n.approvals.length > 0 && /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
				title: "Approvals",
				className: "mb-2"
			}), /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: n.approvals.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b("code", { children: ta(e.hash) }),
					" · ",
					e.at,
					e.approvedBy ? ` · ${e.approvedBy}` : ""
				] }, e.id))
			})] })
		]
	});
}
function _l({ tasks: e }) {
	let t = qi(e), n = Xe("(prefers-reduced-motion: reduce)"), [i, a] = c(n ? t ?? 0 : 0);
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
var vl = {
	done: "success",
	approved: "info",
	changed: "warning",
	draft: void 0,
	"not imported": void 0
}, yl = {
	done: "Done",
	approved: "Approved",
	changed: "Changed on disk",
	draft: "Draft",
	"not imported": "Not imported"
};
function bl({ now: e }) {
	let t = [
		e.needsYou ? /* @__PURE__ */ x(G, {
			variant: "warning",
			children: [e.needsYou, " need you"]
		}, "you") : null,
		e.running ? /* @__PURE__ */ x(G, {
			variant: "info",
			children: [e.running, " running"]
		}, "run") : null,
		e.ready ? /* @__PURE__ */ x(G, { children: [e.ready, " ready"] }, "ready") : null
	].filter(Boolean);
	return t.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: t
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "—"
	});
}
var xl = {
	padding: "8px 10px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "middle"
}, Sl = {
	padding: "6px 10px",
	textAlign: "left",
	fontWeight: 600,
	whiteSpace: "nowrap"
};
function Cl(e) {
	let { filter: t } = e, n = sa(e.rows), r = (n) => {
		let r = {
			...t,
			...n
		};
		for (let e of Object.keys(r)) r[e] || delete r[e];
		e.onChange(r);
	};
	return /* @__PURE__ */ b(wa, {
		id: "avoozl-plans",
		label: "Filter specs",
		active: Object.keys(t).length > 0,
		onClear: () => e.onChange({}),
		fields: [
			{
				kind: "search",
				key: "q",
				label: "Search",
				value: t.q ?? "",
				placeholder: "Spec name or folder",
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
					label: yl[e] ?? e
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
					label: "Old-style spec"
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
var wl = "Archive this spec: its tasks stop starting and it is hidden. You can undo it.", Tl = "Unarchive this spec: its tasks may start again and it shows everywhere.", El = "Reload specs from disk. Imports nothing.";
function Dl(e) {
	return /* @__PURE__ */ x(y, { children: [
		/* @__PURE__ */ b(q, {
			icon: ke,
			primary: !0,
			tooltip: "Describe what you want. Spec Builder drafts its spec folder; nothing is approved.",
			onClick: e.onNewPlan,
			children: "New spec"
		}),
		/* @__PURE__ */ b(vc, { onClick: e.onNewIdea }),
		e.onOpenIdeas && /* @__PURE__ */ x(q, {
			icon: ye,
			tooltip: "Open your ideas on the Intake tab",
			onClick: e.onOpenIdeas,
			children: ["Ideas", e.ideas === null ? "" : ` (${e.ideas})`]
		}),
		/* @__PURE__ */ b(q, {
			icon: ke,
			tooltip: "Add a draft task. It waits for your review.",
			onClick: e.onNewTask,
			children: "New task"
		}),
		/* @__PURE__ */ b(J, {
			icon: je,
			label: "Refresh specs",
			tooltip: El,
			onClick: e.onRefresh,
			disabled: e.busy
		})
	] });
}
function Ol(e) {
	let { row: t } = e, n = Ji(t);
	return /* @__PURE__ */ x("span", {
		className: "flex justify-end gap-1.5",
		children: [
			n.importable && e.onImport && /* @__PURE__ */ b(J, {
				icon: ee,
				label: `Import ${t.name}`,
				tooltip: "Store this folder as a draft spec. Approves and starts nothing.",
				disabled: e.busy,
				onClick: e.onImport
			}),
			e.onOpen && /* @__PURE__ */ b(J, {
				icon: sn,
				label: `Open docs for ${t.name}`,
				tooltip: "Open this spec's documents and tasks",
				onClick: e.onOpen
			}),
			n.scoped && /* @__PURE__ */ b(J, {
				icon: we,
				label: `Graph of ${t.name}`,
				tooltip: "Show this spec's tasks in the Graph",
				onClick: () => e.onScope("graph")
			}),
			n.scoped && /* @__PURE__ */ b(J, {
				icon: W,
				label: `Delivery of ${t.name}`,
				tooltip: "Show this spec's tasks in Delivery",
				onClick: () => e.onScope("delivery")
			}),
			n.review && e.onReview && /* @__PURE__ */ b(J, {
				icon: R,
				label: `Review ${t.name}`,
				tooltip: "Open this spec to check and approve it",
				onClick: e.onReview
			}),
			e.onChange && /* @__PURE__ */ b(J, {
				icon: De,
				label: `Change spec ${t.name}`,
				tooltip: "Start a planner chat to change this spec",
				onClick: e.onChange
			}),
			e.onArchive && n.archivable && /* @__PURE__ */ b(J, {
				icon: w,
				label: `Archive ${t.name}`,
				tooltip: wl,
				disabled: e.busy,
				onClick: e.onArchive
			}),
			e.onUnarchive && n.unarchivable && /* @__PURE__ */ b(J, {
				icon: T,
				label: `Unarchive ${t.name}`,
				tooltip: Tl,
				disabled: e.busy,
				onClick: e.onUnarchive
			}),
			e.onDelete && n.deletable && /* @__PURE__ */ b(J, {
				icon: Re,
				label: `Delete ${t.name}`,
				tooltip: "Delete this spec. You confirm first; it stays in history.",
				disabled: e.busy,
				onClick: e.onDelete,
				style: wn
			})
		]
	});
}
function kl(e) {
	let t = Ki(e.rows), [n, r] = c(/* @__PURE__ */ new Set()), i = Ln(e.reset ?? ""), a = (e) => (t) => {
		t.stopPropagation(), e();
	}, o = (e, t) => {
		let n = new Set(e);
		return n.has(t) ? n.delete(t) : n.add(t), n;
	}, s = /* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
		className: "text-xs text-muted",
		children: [
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Spec"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Status"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Progress"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Now"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Epic"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
				children: "Last change"
			}),
			/* @__PURE__ */ b("th", {
				style: Sl,
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
								children: /* @__PURE__ */ b(M, { size: 16 })
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
									t.rows.length === 1 ? "spec" : "specs"
								]
							}),
							/* @__PURE__ */ b("span", {
								className: "ml-auto text-sm font-normal",
								style: {
									width: "min(14rem, 40%)",
									minWidth: 120
								},
								children: /* @__PURE__ */ b(_l, { tasks: u })
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
									style: xl,
									children: [/* @__PURE__ */ b("button", {
										type: "button",
										className: "text-left font-medium hover:underline",
										onClick: a(() => e.onOpen(t)),
										children: t.name
									}), /* @__PURE__ */ x("span", {
										className: "mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted",
										children: [
											/* @__PURE__ */ b(G, { children: t.kind === "epic" ? "Epic" : t.kind === "spec" ? t.type ?? "spec" : "old-style" }),
											t.spec ? /* @__PURE__ */ b("code", { children: t.spec }) : t.planId ? /* @__PURE__ */ b("code", { children: t.planId }) : null,
											t.errors > 0 && /* @__PURE__ */ x(G, {
												variant: "danger",
												children: [t.errors, " errors"]
											}),
											t.archived && /* @__PURE__ */ b(G, { children: "Archived" })
										]
									})]
								}),
								/* @__PURE__ */ b("td", {
									style: xl,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ b(G, {
										variant: vl[t.status],
										children: yl[t.status] ?? t.status
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...xl,
										width: 150
									},
									children: /* @__PURE__ */ b(_l, { tasks: t.tasks })
								}),
								/* @__PURE__ */ b("td", {
									style: xl,
									children: /* @__PURE__ */ b(bl, { now: t.now })
								}),
								/* @__PURE__ */ b("td", {
									style: xl,
									className: "text-xs",
									children: t.kind === "epic" ? `${t.members?.length ?? 0} plans` : t.epicTitle ?? /* @__PURE__ */ b("span", {
										className: "text-muted",
										children: "No epic"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: xl,
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(X, {
										text: t.lastChange,
										children: /* @__PURE__ */ b("span", { children: t.lastChange ? Q(t.lastChange) : "—" })
									})
								}),
								/* @__PURE__ */ b("td", {
									style: xl,
									className: "whitespace-nowrap",
									onClick: (e) => e.stopPropagation(),
									children: /* @__PURE__ */ b(Ol, {
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
					}), t.rows.length > l.length && /* @__PURE__ */ b(Rn, { ...i.more(t.category, t.rows.length) })]
				})]
			}, t.category);
		})
	});
}
function Al(e) {
	let { row: t, graph: n, docs: r } = e, i = (n?.tasks ?? []).filter((e) => e.kind === "leaf"), a = Object.fromEntries(nt.map((e) => [e.id, 0]));
	for (let e of i) a[dt(e)] += 1;
	let o = /* @__PURE__ */ new Map();
	for (let e of i) {
		let t = e.phase?.id ?? null, n = o.get(t) ?? {
			title: e.phase?.title ?? "No phase",
			done: 0,
			total: 0
		};
		n.total += 1, dt(e) === "done" && (n.done += 1), o.set(t, n);
	}
	let s = [...o].sort(([e], [t]) => Number(e === null) - Number(t === null)), c = (n?.tasks ?? []).filter((e) => e.decision), l = ea(r), u = (e) => /* @__PURE__ */ b("h4", {
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
					/* @__PURE__ */ b(q, {
						icon: De,
						primary: !0,
						tooltip: "Start a planner chat that drafts a change to the spec files",
						onClick: e.onEdit,
						children: "Edit spec"
					}),
					/* @__PURE__ */ b(q, {
						icon: Se,
						tooltip: "Start a chat about this spec. It makes no edits.",
						onClick: e.onDiscuss,
						children: "Discuss spec"
					}),
					e.workspaceId && /* @__PURE__ */ b(Hc, {
						workspaceId: e.workspaceId,
						spec: e.driver,
						onChanged: e.onDriverChanged
					}),
					(e.onDelete || e.onArchive || e.onUnarchive) && /* @__PURE__ */ x("span", {
						className: "ml-auto flex gap-1.5",
						children: [
							e.onArchive && /* @__PURE__ */ b(J, {
								icon: w,
								label: `Archive ${t.name}`,
								tooltip: wl,
								onClick: e.onArchive
							}),
							e.onUnarchive && /* @__PURE__ */ b(J, {
								icon: T,
								label: `Unarchive ${t.name}`,
								tooltip: Tl,
								onClick: e.onUnarchive
							}),
							e.onDelete && /* @__PURE__ */ b(J, {
								icon: Re,
								label: `Delete ${t.name}`,
								tooltip: "Delete this spec. You confirm first; it stays in history.",
								onClick: e.onDelete,
								style: wn
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
						/* @__PURE__ */ b(G, {
							variant: vl[t.status],
							children: yl[t.status] ?? t.status
						}),
						t.type && /* @__PURE__ */ b(G, { children: t.type }),
						t.archived && /* @__PURE__ */ b(G, { children: "Archived" })
					]
				}), /* @__PURE__ */ b(_l, { tasks: t.tasks })]
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
				children: nt.map((e) => /* @__PURE__ */ x("div", {
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
			t.kind !== "epic" && /* @__PURE__ */ x("div", { children: [u("Epic"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: t.epic ? /* @__PURE__ */ b("button", {
					type: "button",
					className: "underline",
					onClick: () => e.onDrill({
						kind: "epic",
						id: t.epic,
						title: t.epicTitle ?? t.epic
					}),
					children: t.epicTitle ?? t.epic
				}) : /* @__PURE__ */ b("span", {
					className: "text-muted",
					children: "No epic"
				})
			})] }),
			s.length > 0 && /* @__PURE__ */ x("div", { children: [u("Phases"), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: s.map(([n, r]) => {
					let i = r.total ? Math.round(r.done / r.total * 100) : 0;
					return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(X, {
						text: `Show only ${r.title} in the Graph`,
						display: "block",
						children: /* @__PURE__ */ x("button", {
							type: "button",
							className: "w-full rounded px-1 py-0.5 text-left hover:bg-accent/10",
							onClick: () => e.onDrill({
								kind: "phase",
								plan: t.planId,
								id: n,
								title: r.title
							}),
							children: [/* @__PURE__ */ x("span", {
								className: "flex justify-between gap-2",
								children: [/* @__PURE__ */ b("span", {
									className: "truncate",
									children: r.title
								}), /* @__PURE__ */ x("span", {
									className: "shrink-0 text-xs text-muted",
									children: [
										r.done,
										"/",
										r.total
									]
								})]
							}), /* @__PURE__ */ b("span", {
								className: "mt-0.5 block h-1 overflow-hidden rounded",
								style: { background: "var(--border)" },
								children: /* @__PURE__ */ b("span", {
									className: "block h-full",
									style: {
										width: `${i}%`,
										background: "var(--ok)"
									}
								})
							})]
						})
					}) }, n ?? "(none)");
				})
			})] }),
			l.length > 0 && /* @__PURE__ */ x("nav", {
				"aria-label": "Spec outline",
				children: [u("Outline"), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: l.map((e) => /* @__PURE__ */ x("li", { children: [/* @__PURE__ */ b("button", {
						type: "button",
						className: "font-medium hover:underline",
						onClick: () => pl(`avoozl-doc-${e.file}`),
						children: e.label
					}), /* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: bs(e.text, fl(e.file), 2).filter((e) => e.level === 2).map((e) => /* @__PURE__ */ b("li", {
							className: "truncate pl-3",
							children: /* @__PURE__ */ b("button", {
								type: "button",
								className: "text-left text-xs text-muted hover:underline",
								onClick: () => pl(e.id),
								children: e.text
							})
						}, e.id))
					})] }, e.file))
				})]
			}),
			/* @__PURE__ */ x("div", { children: [u("Last change"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: /* @__PURE__ */ b(X, {
					text: t.lastChange,
					children: /* @__PURE__ */ b("span", { children: t.lastChange ? Q(t.lastChange) : /* @__PURE__ */ b("span", {
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
						children: [/* @__PURE__ */ b("span", { children: ua(e) }), /* @__PURE__ */ b(X, {
							text: e.at,
							children: /* @__PURE__ */ b("span", {
								className: "shrink-0 text-xs text-muted",
								children: Q(e.at)
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
function jl(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), d = s(null);
	r(() => {
		d.current?.focus();
	}, []);
	let f = async () => {
		u(!0), o(null);
		try {
			let r = await n.archive(i, t.planId);
			e.onDone(`Archived ${t.name}. ${r.held} tasks held, ${r.running} running chats left alone, ${r.decisions} decisions opened. Show archived on Specs brings it back.`);
		} catch (e) {
			o(K(e));
		} finally {
			u(!1);
		}
	};
	return /* @__PURE__ */ x($n, {
		id: "avoozl-archive-plan",
		role: "alertdialog",
		width: "32rem",
		backLabel: "Cancel",
		attrs: { "data-archive-plan": !0 },
		onDismiss: () => e.onDone(null),
		children: [
			/* @__PURE__ */ x("h3", {
				id: "avoozl-archive-plan-title",
				className: "text-base font-semibold",
				children: [
					"Archive the spec ",
					t.name,
					"?"
				]
			}),
			/* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-1 pl-5 text-sm",
				style: { listStyle: "disc" },
				children: la.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
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
					children: "Archive spec"
				})]
			})
		]
	});
}
function Ml(e) {
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
						children: "This spec is archived."
					}),
					" ",
					/* @__PURE__ */ x("span", {
						className: "text-muted",
						children: [
							t.by ? `${t.by} archived it` : "Archived",
							" ",
							/* @__PURE__ */ b(X, {
								text: t.at,
								children: /* @__PURE__ */ b("span", { children: Q(t.at) })
							}),
							". Its tasks do not start, and it is hidden unless Show archived is on."
						]
					})
				]
			}),
			/* @__PURE__ */ b(q, {
				icon: T,
				primary: !0,
				disabled: e.busy,
				tooltip: Tl,
				onClick: e.onUnarchive,
				children: "Unarchive"
			})
		]
	}) : null;
}
function Nl(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), [d, f] = c(null), [m, h] = c(!1), g = s(null);
	r(() => {
		n.deletePreview(i, t.planId).then(o, (e) => f(K(e)));
	}, [
		n,
		i,
		t.planId
	]), r(() => {
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
				f(K(e));
			} finally {
				h(!1);
			}
		}
	}, v = !!(l && a?.folder?.dirty);
	return /* @__PURE__ */ x($n, {
		id: "avoozl-delete-plan",
		role: "alertdialog",
		width: "32rem",
		backLabel: "Cancel",
		attrs: { "data-delete-plan": a?.retire ? "retire" : "draft" },
		onDismiss: () => e.onDone(null),
		children: [
			/* @__PURE__ */ x("h3", {
				id: "avoozl-delete-plan-title",
				className: "text-base font-semibold",
				children: [
					"Delete the spec ",
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
				children: Qi(a).map((e) => /* @__PURE__ */ b("li", { children: e }, e))
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
					children: "Delete spec"
				})]
			})
		]
	});
}
function Pl(e) {
	let n = e.workspaceId, i = l(), { openChat: a } = u(), d = o(() => Xi(i), [i]), f = o(() => Lr(i), [i]), p = xn(), h = Pn(n), g = Xe(ul), [_, v] = dl(!g), [S, C] = c(null), [w, T] = c(null), [D, O] = c(null), [k, A] = c(!1);
	r(() => {
		e.newPlanRequest?.n && O({ seed: e.newPlanRequest.seed });
	}, [e.newPlanRequest]);
	let [j, M] = c(null), [N, P] = c(null), [F, I, L] = on("plans-selected", "select", (e) => e ? "Back to the spec" : "Back to all specs", null), R = s(n), [z, B] = c({}), [ee, V] = c(null), [H, U] = c(null), [te, ne] = c(null), [re, ie] = c(null), [ae, oe] = c(null), [se, ce] = c(null), [le, ue] = c(null), [de, fe] = c(null), [pe, me] = c(!1), [, he] = c(0), ge = s(null), _e = t(async (e) => {
		me(!0), fe(null);
		try {
			await e();
		} catch (e) {
			fe(K(e));
		} finally {
			me(!1);
		}
	}, []), ve = t((e) => _e(async () => P(await d.table(e))), [_e, d]);
	r(() => {
		P(null), R.current !== n && (R.current = n, L(null)), n && (ve(n), d.languages(n).then((e) => {
			Os(e.languages), he((e) => e + 1);
		}, () => void 0));
	}, [
		n,
		ve,
		d
	]);
	let W = N?.items.find((e) => e.key === F) ?? null, ye = Nc(n, W?.planId ?? null), be = W?.spec ? N?.specs.find((e) => e.name === W.spec) ?? null : null, xe = t(async (e, t) => {
		if (V(null), U(null), ne(null), !t) return;
		let [n, r] = await Promise.all([d.get(e, t), d.preview(e, t).catch(() => null)]);
		V(n), U(r);
	}, [d]);
	r(() => {
		if (ie(null), oe(null), ue(null), ce(null), !n || !W) return;
		let e = !0;
		return _e(() => xe(n, W.planId)), f.graph(n, {
			plan: W.planId ?? void 0,
			spec: W.spec ?? void 0
		}).then((t) => e && ce(t), () => void 0), W.spec ? d.documents(n, W.spec).then((t) => e && ie(t), (t) => e && oe(K(t))) : W.planId && d.text(n, W.planId).then((t) => e && ue({
			text: t,
			error: null
		}), (t) => e && ue({
			text: null,
			error: K(t)
		})), () => {
			e = !1;
		};
	}, [n, F]), r(() => {
		F && ge.current?.scrollIntoView?.({ block: "start" });
	}, [F]);
	let Se = (e) => I(e.key), Ce = (t, n) => e.onScope?.(t, { plan: Jc(n) }), we = (e) => a({
		message: Yi(e),
		autoSend: !1
	}), Te = (e) => {
		if (!n) return;
		let t = n;
		_e(async () => {
			let n = await e(t), r = await d.table(t);
			P(r);
			let i = r.items.find((e) => e.key === F) ?? null;
			await xe(t, i?.planId ?? n?.id ?? null);
		});
	}, Ee = (e) => e.spec && Te((t) => d.store(t, e.spec)), De = (e) => e.planId && Te(async (t) => {
		let n = await d.unarchive(t, e.planId);
		return M(`Unarchived ${e.name}. ${n.released} tasks may start again; ${n.decisions} decisions closed.`), { id: e.planId };
	}), Oe = N ? oa(N.items, z) : [];
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-plans-title",
		className: "flex flex-col gap-3.5",
		children: [
			S && n && /* @__PURE__ */ b(Nl, {
				workspaceId: n,
				row: S,
				client: d,
				onDone: (e) => {
					C(null), e !== null && (L(null), M(e), ve(n));
				}
			}),
			w && n && /* @__PURE__ */ b(jl, {
				workspaceId: n,
				row: w,
				client: d,
				onDone: (e) => {
					T(null), e !== null && (M(e), ve(n));
				}
			}),
			k && n && /* @__PURE__ */ b(yc, {
				workspaceId: n,
				onClose: (e) => {
					A(!1), e && M(`Saved the idea ${e.title}. Find it under Ideas.`);
				}
			}),
			D && n && /* @__PURE__ */ b(oc, {
				workspaceId: n,
				seed: D.seed,
				taken: (N?.items ?? []).flatMap((e) => [e.spec, e.planId]).filter((e) => !!e),
				categories: [...new Set((N?.items ?? []).map((e) => e.category).filter((e) => !!e))].sort(),
				epics: (N?.items ?? []).filter((e) => e.kind === "epic" && e.spec).map((e) => ({
					id: e.spec,
					title: e.name
				})),
				onClose: (e) => {
					O(null), e && M(e);
				}
			}),
			j && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				children: j
			}),
			/* @__PURE__ */ x("div", {
				ref: ge,
				className: "flex flex-wrap items-center gap-3",
				children: [W && /* @__PURE__ */ b(q, {
					icon: E,
					onClick: () => I(null),
					children: "All specs"
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(Vn, {
						id: "avoozl-plans-title",
						view: "plans",
						actions: n && !W ? /* @__PURE__ */ b(Dl, {
							onNewPlan: () => O({}),
							onNewIdea: () => A(!0),
							onOpenIdeas: e.onOpenIdeas,
							ideas: e.ideas ?? null,
							onNewTask: () => p.addTask(),
							onRefresh: () => void ve(n),
							busy: pe
						}) : W ? /* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ b(Pc, { spec: ye.spec }), /* @__PURE__ */ b(Ol, {
								row: W,
								onScope: (e) => Ce(e, W),
								onReview: () => pl("avoozl-plan-main")
							})]
						}) : null,
						children: W ? W.name : "Specs"
					})
				})]
			}),
			(de || h.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: de ?? h.error
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: pe ? "Working…" : ""
			}),
			n ? W ? /* @__PURE__ */ x("div", {
				style: g ? {
					display: "flex",
					flexDirection: "column",
					gap: 14
				} : {
					display: "grid",
					gridTemplateColumns: `${ll} minmax(0, 1fr)`,
					gap: 14,
					alignItems: "start"
				},
				children: [/* @__PURE__ */ b("aside", {
					ref: _,
					"aria-label": "Spec summary",
					"data-plan-aside-scroll": !0,
					style: g ? void 0 : {
						position: "sticky",
						top: 8,
						zIndex: Ye.sticky,
						maxHeight: v ?? "calc(100vh - 2rem)",
						overflowY: "auto",
						overscrollBehavior: "contain"
					},
					children: /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(Al, {
						row: W,
						graph: se,
						docs: re,
						onEdit: () => we(W),
						onDiscuss: () => void h.ask(ca(W)),
						onDelete: Ji(W).deletable ? () => C(W) : void 0,
						onArchive: Ji(W).archivable ? () => T(W) : void 0,
						onUnarchive: Ji(W).unarchivable ? () => De(W) : void 0,
						onDrill: (t) => e.onDrill?.(t),
						onOpenTask: (e) => p.openTask(e),
						workspaceId: n,
						driver: ye.spec,
						onDriverChanged: ye.reload
					}) })
				}), /* @__PURE__ */ x("div", {
					id: "avoozl-plan-main",
					className: "min-w-0",
					children: [
						/* @__PURE__ */ b(Ml, {
							row: W,
							busy: pe,
							onUnarchive: () => De(W)
						}),
						n && /* @__PURE__ */ b(Ic, {
							workspaceId: n,
							spec: ye.spec,
							onChanged: ye.reload
						}),
						/* @__PURE__ */ b(Lc, { spec: ye.spec }),
						W.categoryProblem && /* @__PURE__ */ x("p", {
							className: "mb-3 text-sm text-muted",
							children: [
								/* @__PURE__ */ b(G, {
									variant: "warning",
									children: "front-matter"
								}),
								" ",
								W.categoryProblem
							]
						}),
						be ? /* @__PURE__ */ b(gl, {
							docs: re,
							docsError: ae,
							spec: be,
							plan: ee,
							preview: H,
							projection: te,
							busy: pe,
							onStore: () => Te((e) => d.store(e, be.name)),
							onReload: () => ee && Te((e) => d.reload(e, ee.id, ee.hash)),
							onApprove: () => ee && Te((e) => d.approve(e, ee.id, ee.hash)),
							onProjection: () => ee && void _e(async () => ne(await d.projection(n, ee.id)))
						}) : /* @__PURE__ */ x(m, { children: [
							/* @__PURE__ */ b(Y, {
								title: W.name,
								className: "mb-2"
							}),
							/* @__PURE__ */ x("p", {
								className: "mt-1 text-xs text-muted",
								children: [/* @__PURE__ */ b("code", { children: W.planId }), " · written before the spec layout, so it has no folder. Its tasks show in Graph and Delivery."]
							}),
							/* @__PURE__ */ b("div", {
								className: "mt-2",
								children: le ? le.error ? /* @__PURE__ */ b("p", {
									className: "text-sm text-danger",
									children: le.error
								}) : le.text ? /* @__PURE__ */ b(Rs, {
									text: le.text,
									measure: cl
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "This spec has no text."
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "Loading…"
								})
							})
						] })
					]
				})]
			}) : /* @__PURE__ */ x(y, { children: [N && N.items.length > 0 && /* @__PURE__ */ b(Cl, {
				filter: z,
				rows: N.items,
				onChange: B,
				children: /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					role: "status",
					children: [
						Oe.length,
						" of ",
						N.items.length,
						" specs"
					]
				})
			}), /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-plans-list": !0,
				children: [
					N === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: pe ? "Loading…" : "Not loaded"
					}) : N.items.length === 0 ? /* @__PURE__ */ x("p", {
						className: "text-sm text-muted",
						children: [
							"No specs yet",
							N.root ? ` in ${N.root}/.kiro/specs` : "",
							". Use New spec to start one."
						]
					}) : Oe.length ? /* @__PURE__ */ b(kl, {
						rows: Oe,
						reset: JSON.stringify(z),
						busy: pe,
						onOpen: Se,
						onScope: Ce,
						onChange: we,
						onImport: Ee,
						onDelete: C,
						onArchive: T,
						onUnarchive: De
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No spec matches these filters."
					}),
					N?.problem && /* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: ["Spec folders: ", N.problem]
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: [
							"Categories come from ",
							/* @__PURE__ */ b("code", { children: "category:" }),
							" in the front-matter of a spec's requirements.md or bugfix.md. Avoozl never guesses one. ",
							Gi,
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
// kirocrew-app/ui/src/EpicPanel.tsx
var Fl = (e, t) => t ? Math.round(e / t * 100) : 0;
function Il(e) {
	let n = t((t) => e.client.epic(t, e.id), [e.client, e.id]), { value: r, error: i } = da(e.workspaceId, n);
	return i ? /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: i
	}) : r ? /* @__PURE__ */ x(m, {
		"data-epic-panel": !0,
		children: [
			/* @__PURE__ */ b(Y, {
				title: r.title,
				actions: e.onOpenPlans && /* @__PURE__ */ b("button", {
					type: "button",
					className: "text-sm underline",
					onClick: e.onOpenPlans,
					children: "Edit or discuss in Specs"
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ b(G, { children: r.complete ? "done" : r.approved ? "approved" : "draft" }), /* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					children: [
						r.progress.done,
						" of ",
						r.progress.total,
						" tasks done across ",
						r.members.length,
						" specs"
					]
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-2 grid gap-4 text-sm",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))" },
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					style: { maxWidth: "75ch" },
					children: [
						r.goal && /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
							className: "text-xs font-semibold uppercase tracking-wide text-muted",
							children: "Goal"
						}), /* @__PURE__ */ b("p", {
							className: "mt-1 whitespace-pre-wrap",
							children: r.goal
						})] }),
						r.done && /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
							className: "text-xs font-semibold uppercase tracking-wide text-muted",
							children: "What done means"
						}), /* @__PURE__ */ b("p", {
							className: "mt-1 whitespace-pre-wrap",
							children: r.done
						})] }),
						r.decisions.length > 0 && /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
							className: "text-xs font-semibold uppercase tracking-wide text-muted",
							children: "Open decisions"
						}), /* @__PURE__ */ b("ul", {
							className: "mt-1 list-disc pl-5",
							children: r.decisions.map((e) => /* @__PURE__ */ x("li", { children: [
								e.title,
								": ",
								e.decision
							] }, e.taskId))
						})] })
					]
				}), /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
					className: "text-xs font-semibold uppercase tracking-wide text-muted",
					children: "Member specs"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: r.members.map((t) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("button", {
						type: "button",
						className: "w-full rounded px-1 py-0.5 text-left hover:bg-accent/10",
						onClick: () => e.onDrill({
							kind: "plan",
							id: t.plan,
							title: t.title
						}),
						children: [/* @__PURE__ */ x("span", {
							className: "flex justify-between gap-2",
							children: [/* @__PURE__ */ b("span", {
								className: "truncate",
								children: t.title
							}), /* @__PURE__ */ x("span", {
								className: "shrink-0 text-xs text-muted",
								children: [
									t.status,
									!t.confirmed && " · not confirmed",
									" · ",
									t.progress.done,
									"/",
									t.progress.total
								]
							})]
						}), /* @__PURE__ */ b("span", {
							className: "mt-0.5 block h-1 overflow-hidden rounded",
							style: { background: "var(--border)" },
							children: /* @__PURE__ */ b("span", {
								className: "block h-full",
								style: {
									width: `${Fl(t.progress.done, t.progress.total)}%`,
									background: "var(--ok)"
								}
							})
						})]
					}) }, t.plan))
				})] })]
			})
		]
	}) : null;
}
// kirocrew-app/ui/src/FilterBar.tsx
var Ll = {
	event: nl,
	read: rl,
	write: il,
	empty: {}
};
function Rl(e) {
	return Ea(e, Ll);
}
function zl(e, t) {
	Da(Ll, e, t);
}
function Bl(e) {
	let { filter: t, choices: n } = e, r = (n) => e.onChange(al(t, n));
	return /* @__PURE__ */ b(wa, {
		id: e.id,
		label: "Filter tasks",
		active: Yc(t),
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
				key: "epic",
				label: "Epic",
				value: t.epic ?? "",
				options: n.epics,
				onChange: (e) => r({ epic: e })
			},
			{
				kind: "pick",
				key: "plan",
				label: "Spec",
				value: t.plan ?? "",
				items: _a(n.plans),
				onChange: (e) => r({
					plan: e,
					phase: void 0
				})
			},
			{
				kind: "select",
				key: "phase",
				label: "Phase",
				value: t.phase ?? "",
				options: n.phases,
				disabled: !t.plan,
				hint: t.plan ? void 0 : "Pick a spec first",
				onChange: (e) => r({ phase: e })
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
var Vl = 60, Hl = 640, Ul = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, Wl = Object.fromEntries(nt.map((e) => [e.id, e.label])), Gl = (e, t) => e.length > t ? e.slice(0, t - 1) + "…" : e, Kl = (e, t) => {
	(e.key === "Enter" || e.key === " ") && (e.preventDefault(), t());
};
function ql({ task: e, x: t, y: n }) {
	if (e.authority !== "github") return /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: "var(--muted)" },
		children: e.authority ?? "local"
	});
	let r = e.issue ? zr(e.issue.url) : null, i = e.issue ? e.issue.number ? `#${e.issue.number}` : "GitHub" : "pending", a = /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: r ? "var(--accent)" : "var(--muted)" },
		children: i
	});
	return r ? /* @__PURE__ */ b("a", {
		href: Z(r),
		target: "_blank",
		rel: "noreferrer",
		onClick: (e) => e.stopPropagation(),
		"aria-label": `Issue ${i}`,
		children: a
	}) : a;
}
function Jl(e) {
	let { node: t, selected: n } = e, r = Ul[t.state], i = t.members ? `${t.members.done} of ${t.members.total} done` : `${t.id} · ${Wl[t.state]}`, a = t.members ? `${t.title}, collapsed, ${i}. Press to open it.` : `${t.title}, ${t.id}, ${Wl[t.state]}${t.task?.review ? ", waits for review" : ""}${t.task?.planArchived ? ", archived plan" : ""}${t.task?.handSetReview ? ", review set by hand, none running" : ""}`;
	return /* @__PURE__ */ x("g", {
		transform: `translate(${t.x},${t.y})`,
		role: "button",
		tabIndex: 0,
		"aria-label": a,
		"aria-pressed": t.members ? void 0 : n,
		"data-node": t.id,
		onClick: () => e.onSelect(t),
		onKeyDown: (n) => Kl(n, () => e.onSelect(t)),
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
				width: ot,
				height: st,
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
				height: st,
				rx: 3,
				style: { fill: r }
			}),
			/* @__PURE__ */ b("text", {
				x: 12,
				y: 15,
				fontSize: 11,
				fontWeight: 600,
				style: { fill: "var(--text)" },
				children: Gl(t.title, t.task?.review ? 19 : 25)
			}),
			t.task?.review && /* @__PURE__ */ b("text", {
				x: ot - 6,
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
				children: Gl(i, t.task ? 20 : 28)
			}),
			t.task && /* @__PURE__ */ b(ql, {
				task: t.task,
				x: ot - 6,
				y: 29
			})
		]
	});
}
function Yl() {
	return /* @__PURE__ */ x("ul", {
		"aria-label": "Node colors",
		className: "flex flex-wrap gap-3 text-xs text-muted",
		children: [nt.map((e) => /* @__PURE__ */ x("li", {
			className: "flex items-center gap-1",
			children: [/* @__PURE__ */ b("svg", {
				width: 10,
				height: 10,
				"aria-hidden": "true",
				children: /* @__PURE__ */ b("rect", {
					width: 10,
					height: 10,
					rx: 2,
					style: { fill: Ul[e.id] }
				})
			}), e.label]
		}, e.id)), /* @__PURE__ */ b("li", { children: "Solid arrow: waiting · faded arrow: met · dashed arrow: sequence" })]
	});
}
function Xl(e) {
	let { task: t } = e, n = xn(), { waitsOn: r, blocks: i } = e.neighbors, a = dt(t);
	return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
		"aria-label": "Task details",
		role: "region",
		children: [
			/* @__PURE__ */ b(Y, {
				title: t.title,
				actions: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(zn, {
					tooltip: "Open this task's details in the drawer",
					onClick: () => n.openTask(t.id),
					children: "All details"
				}), /* @__PURE__ */ b(zn, {
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
					/* @__PURE__ */ b(G, { children: t.kind }),
					/* @__PURE__ */ b(zs, { owner: t }),
					/* @__PURE__ */ b(G, {
						variant: t.complete ? "success" : void 0,
						children: t.status ?? "no status"
					}),
					/* @__PURE__ */ b(G, {
						variant: a === "needs-you" ? "warning" : a === "ready" ? "info" : void 0,
						children: Wl[a]
					}),
					t.review && /* @__PURE__ */ b(G, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(G, { children: "Archived" }),
					t.handSetReview && /* @__PURE__ */ b(G, {
						variant: "warning",
						children: "set by hand"
					})
				]
			}),
			t.handSetReview && /* @__PURE__ */ x("p", {
				className: "mt-1 text-sm",
				"data-hand-set-review": !0,
				children: [
					Zr(t.noSession),
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
function Zl({ workspaceId: e, focus: n = null, drill: i = null, onDrill: a }) {
	let u = l(), d = o(() => Lr(u), [u]), f = xn(), [p, h] = Rl(e), { value: g, error: _, busy: v, reload: S } = da(e, t((e) => d.graph(e), [d])), C = o(() => g ? Nt(Ct(el(g, p), i), i) : null, [
		g,
		p,
		i
	]), w = o(() => $c(g, {}, p.plan), [g, p.plan]), [T, D] = c(null);
	r(() => D(null), [i]);
	let O = en(), [k, A] = an("graph-selected", null), [j, M] = c(null), [N, P] = an("graph-view", {
		x: 0,
		y: 0,
		scale: 1
	}), [F] = c(() => O.memory.has("graph-stack")), I = s(null), L = s(null), R = s(!1), z = o(() => [...new Set((C?.tasks ?? []).map((e) => pt(e.group ?? null)))], [C]), B = o(() => T ?? new Set((!i || i.kind === "epic") && (C?.tasks.length ?? 0) > Vl ? z : []), [
		T,
		C,
		z,
		i
	]), [ee, V] = c(1100), H = o(() => at(C?.tasks.length ?? 0, ee), [C, ee]), U = o(() => C ? xt(C, B, { spacing: H }) : null, [
		C,
		B,
		H
	]), te = o(() => new Map(U?.nodes.map((e) => [e.id, e]) ?? []), [U]), ne = C?.tasks.find((e) => e.id === k) ?? null, re = C ? Rr(C) : null, ie = (e) => C?.groups?.find((t) => t.id === e)?.title ?? e ?? "None", [ae, oe] = an("graph-stack", []), se = s({
		drill: i,
		view: N,
		selected: k
	}), ce = s(!1), le = s(F ? N : null);
	r(() => {
		let e = se.current;
		ce.current ? ce.current = !1 : e.drill !== i && oe((t) => It(t, e, i)), se.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [i]), r(() => {
		se.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [N, k]);
	let ue = (e) => {
		oe((t) => At(t, {
			drill: i,
			view: N,
			selected: k
		}, p, e)), h(e);
	}, de = (e) => {
		let t = Lt(ae, e);
		if (!t) return;
		let { entry: n } = t, r = ae.slice(t.stack.length).find((e) => e.filter)?.filter;
		le.current = n.view, oe(t.stack), A(n.selected), r && h(r), n.drill === i ? P(n.view) : (ce.current = !0, a?.(n.drill));
	}, fe = s(de);
	fe.current = de, r(() => {
		let e = () => fe.current();
		return O.handlers.set("graph", e), () => {
			O.handlers.get("graph") === e && O.handlers.delete("graph");
		};
	}, [O]), r(() => {
		O.history.sync("graph", ae.length, () => ({
			label: "Back in the Graph",
			back: () => O.handlers.get("graph")?.()
		}));
	}, [O, ae.length]);
	let pe = (e) => {
		let t = Pt(i, e, ie(e));
		t && a?.(t);
	}, me = t(() => {
		U && I.current && (le.current ? (P(le.current), le.current = null) : P(Ot(U, I.current.clientWidth || 800, Hl)));
	}, [U]);
	r(me, [me]), r(() => {
		let e = I.current;
		if (!e || typeof ResizeObserver > "u") return;
		let t = new ResizeObserver(() => V((t) => Math.abs(t - e.clientWidth) > 40 ? e.clientWidth : t));
		return t.observe(e), () => t.disconnect();
	}, [U !== null]), r(() => {
		let e = I.current;
		if (!e) return;
		let t = (t) => {
			if (!t.ctrlKey && !t.metaKey) return;
			t.preventDefault();
			let n = e.getBoundingClientRect(), r = Math.exp(-t.deltaY * .01);
			P((e) => Dt(e, r, t.clientX - n.left, t.clientY - n.top));
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [U]);
	let he = (e) => {
		let t = I.current?.clientWidth || 800;
		P((n) => Dt(n, e, t / 2, Hl / 2));
	}, ge = (e) => {
		let t = new Set(B);
		t.has(e) ? t.delete(e) : t.add(e), D(t);
	}, _e = (e) => {
		let t = St(e, R.current);
		if (t === "drill") {
			let t = Pt(i, e.group, e.title);
			t ? a?.(t) : ge(pt(e.group));
		} else t === "open" && (A(e.id), f.openTask(e.id));
	}, ve = (e) => {
		let t = C?.tasks.find((t) => t.id === e);
		t && B.has(pt(t.group ?? null)) && ge(pt(t.group ?? null)), A(e);
	}, W = s(null);
	r(() => {
		C && n && W.current !== n && (W.current = n, ve(n));
	}, [C, n]);
	let ye = (e) => {
		e.button === 0 && (L.current = {
			x: e.clientX,
			y: e.clientY,
			view: N,
			moved: !1
		}, R.current = !1);
	}, be = (e) => {
		let t = L.current;
		if (!t) return;
		let n = e.clientX - t.x, r = e.clientY - t.y;
		!t.moved && Math.hypot(n, r) < 4 || (t.moved || e.currentTarget.setPointerCapture(e.pointerId), t.moved = R.current = !0, P({
			...t.view,
			x: t.view.x + n,
			y: t.view.y + r
		}));
	}, xe = () => {
		L.current = null;
	}, Se = (e, t) => k !== null && (e === k || t === k), Ce = j ?? k, we = o(() => {
		if (!U || !Ce || !te.has(Ce)) return null;
		let { up: e, down: t } = Tt(U.edges, Ce);
		return {
			up: /* @__PURE__ */ new Set([...e, Ce]),
			down: /* @__PURE__ */ new Set([...t, Ce])
		};
	}, [
		U,
		Ce,
		te
	]), Te = (e) => !we || we.up.has(e) || we.down.has(e), Ee = (e, t) => !we || we.up.has(e) && we.up.has(t) || we.down.has(e) && we.down.has(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-graph-title",
		className: "flex flex-col gap-3.5",
		"data-graph-view": !0,
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-graph-title",
				view: "graph",
				children: "Graph"
			}),
			_ && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: _
			}),
			e ? /* @__PURE__ */ x(Bl, {
				id: "avoozl-graph",
				filter: p,
				choices: w,
				onChange: ue,
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ b(q, {
						icon: je,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}), /* @__PURE__ */ b(q, {
						icon: ke,
						tooltip: "Add a draft task. It waits for your review.",
						onClick: () => f.addTask(),
						children: "New task"
					})]
				}), /* @__PURE__ */ b("p", {
					role: "status",
					className: "mt-2 text-sm text-muted",
					children: v ? "Loading…" : re ? `${re.tasks} of ${g.total} tasks · ${re.blocking} blocking edges · ${re.ready} ready · ${U?.waves ?? 0} waves` : ""
				})]
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			}),
			e && i?.kind === "epic" && i.id && /* @__PURE__ */ b(Il, {
				workspaceId: e,
				id: i.id,
				client: d,
				onDrill: (e) => a?.(e)
			}),
			C && C.total === 0 && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "No tasks yet. Store and approve a spec in the Specs tab to fill the graph."
			}),
			U && U.nodes.length > 0 && /* @__PURE__ */ x(m, { children: [
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						ae.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
							icon: E,
							tooltip: Ft(ae) ?? void 0,
							onClick: () => de(),
							"aria-label": Ft(ae) ?? "Back",
							children: "Back"
						}), /* @__PURE__ */ x("nav", {
							"aria-label": "Graph drill-in",
							className: "flex flex-wrap items-center gap-1 text-sm",
							"data-graph-crumbs": !0,
							children: [jt(ae, i).map(({ at: e, label: t }) => /* @__PURE__ */ x("span", {
								className: "inline-flex items-center gap-1",
								children: [/* @__PURE__ */ b("button", {
									type: "button",
									className: "truncate underline",
									style: { maxWidth: "14rem" },
									onClick: () => de(e),
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
								children: Mt(i)
							})]
						})] }),
						/* @__PURE__ */ b(zn, {
							tooltip: "Fold each group into one box",
							onClick: () => D(new Set(z)),
							children: "Collapse all"
						}),
						/* @__PURE__ */ b(zn, {
							tooltip: "Show every task inside each group",
							onClick: () => D(/* @__PURE__ */ new Set()),
							children: "Expand all"
						}),
						/* @__PURE__ */ b("span", { className: "grow" }),
						/* @__PURE__ */ b(zn, {
							tooltip: "Zoom out",
							onClick: () => he(1 / 1.25),
							"aria-label": "Zoom out",
							children: "−"
						}),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"aria-live": "polite",
							children: [Math.round(N.scale * 100), "%"]
						}),
						/* @__PURE__ */ b(zn, {
							tooltip: "Zoom in",
							onClick: () => he(1.25),
							"aria-label": "Zoom in",
							children: "+"
						}),
						/* @__PURE__ */ b(zn, {
							tooltip: "Fit the whole graph in view",
							onClick: me,
							children: "Fit"
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					className: "mt-2",
					children: /* @__PURE__ */ b(Yl, {})
				}),
				/* @__PURE__ */ b("div", {
					ref: I,
					className: "mt-2 overflow-hidden rounded border",
					style: {
						borderColor: "var(--border)",
						height: Hl,
						touchAction: "none"
					},
					children: /* @__PURE__ */ x("svg", {
						role: "group",
						"aria-label": "Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom.",
						width: "100%",
						height: Hl,
						onPointerDown: ye,
						onPointerMove: be,
						onPointerUp: xe,
						onPointerCancel: xe,
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
								U.clusters.map((e, t) => {
									let n = pt(e.group);
									return /* @__PURE__ */ x("g", {
										opacity: we ? .5 : 1,
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
											"aria-label": `${e.title}, ${e.count} tasks. Press to open it.`,
											onClick: () => !R.current && pe(e.group),
											onKeyDown: (t) => Kl(t, () => pe(e.group)),
											style: {
												fill: "var(--muted)",
												cursor: "pointer"
											},
											children: [Gl(e.title, 30), " ›"]
										})]
									}, `${n}:${t}`);
								}),
								U.loose.map((e) => {
									let t = pt(e.group);
									return /* @__PURE__ */ b("text", {
										x: e.x,
										y: e.y + 11,
										fontSize: 10,
										role: "button",
										tabIndex: 0,
										"aria-label": `${e.title}: ${e.count} with no dependencies. Press to open it.`,
										onClick: () => !R.current && pe(e.group),
										onKeyDown: (t) => Kl(t, () => pe(e.group)),
										style: {
											fill: "var(--muted)",
											cursor: "pointer"
										},
										children: Gl(`${e.title} · ${e.count} with no dependencies`, e.chars)
									}, `loose:${t}`);
								}),
								U.edges.map((e) => {
									let t = we !== null && Ee(e.from, e.to), n = we !== null && !t, r = Se(e.from, e.to);
									return /* @__PURE__ */ b("path", {
										d: wt(e.points),
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
								U.nodes.map((e) => /* @__PURE__ */ b(Jl, {
									node: e,
									selected: e.id === k,
									dim: !Te(e.id),
									onSelect: _e,
									onHover: M
								}, e.id))
							]
						})]
					})
				})
			] }),
			C && ne && /* @__PURE__ */ b(Xl, {
				task: ne,
				neighbors: Et(C, ne.id),
				onSelect: ve
			})
		]
	});
}
// kirocrew-app/ui/src/DeliveryDetails.tsx
function Ql({ text: e }) {
	let t = zr(e);
	return t ? /* @__PURE__ */ b("a", {
		href: Z(t),
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		children: e
	}) : /* @__PURE__ */ b("code", {
		className: "break-all",
		children: e
	});
}
function $l({ label: e, records: t }) {
	return t.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [/* @__PURE__ */ b("span", {
			className: "font-medium",
			children: e
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-1",
			children: t.map((e, t) => /* @__PURE__ */ b("li", {
				className: "text-muted",
				children: Gr(e).map(([e, t]) => `${e}: ${t}`).join(" · ")
			}, t))
		})]
	}) : null;
}
function eu({ rounds: e }) {
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
							href: Z(e.link),
							className: "underline",
							children: Ur(e)
						}) : Ur(e),
						e.cause && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · ", e.cause]
						}),
						e.findings.length > 0 && /* @__PURE__ */ b("ul", {
							className: "ml-3 mt-1 flex flex-col gap-1",
							children: e.findings.map((e) => /* @__PURE__ */ x("li", { children: [
								/* @__PURE__ */ b(G, {
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
function tu({ reviews: e }) {
	let t = zr(e.pullRequest), n = `PR ${e.pullRequestNumber ? `#${e.pullRequestNumber}` : ""}`;
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "GitHub reviews"
			}),
			" ",
			/* @__PURE__ */ b(G, {
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
				href: Z(t),
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
					children: Wr(e)
				}, e.reviewer))
			})
		]
	});
}
function nu({ feedback: e }) {
	let t = zr(e.pullRequest);
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "PR feedback"
			}),
			" ",
			Ir(e),
			e.session && /* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" · ", e.session]
			}),
			t && /* @__PURE__ */ x(y, { children: [" · ", /* @__PURE__ */ b("a", {
				href: Z(t),
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
						let n = zr(e.url);
						return /* @__PURE__ */ x("span", { children: [t > 0 && ", ", n ? /* @__PURE__ */ b("a", {
							href: Z(n),
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
function ru({ item: e, onSupersede: t }) {
	let [n, r] = c(!1), [i, a] = c({
		id: "",
		title: e.title
	}), [o, s] = c(!1), [l, u] = c(null);
	if (!n) return /* @__PURE__ */ b("div", {
		className: "mt-2",
		children: /* @__PURE__ */ b(zn, {
			tooltip: "Replace this task with a new one. Cannot be undone here.",
			onClick: () => r(!0),
			children: "Supersede"
		})
	});
	let d = async () => {
		s(!0), u(null);
		try {
			await t(e.id, Jr(i)), r(!1);
		} catch (e) {
			u(K(e));
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
				children: [/* @__PURE__ */ b(An, {
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
function iu(e) {
	return (e.rounds ?? []).filter((e) => e.current).flatMap((e) => e.verdicts.flatMap((e) => e.findings.filter((e) => e.state === "open")));
}
function au({ item: e, busy: t, onRetry: n }) {
	let r = iu(e), [i, a] = c(/* @__PURE__ */ new Set()), [o, s] = c("");
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
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(An, {
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
function ou({ item: e, onSupersede: t }) {
	return /* @__PURE__ */ x("div", {
		className: "mt-2 border-t pt-2",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ b(G, {
					variant: e.complete ? "success" : "info",
					children: e.status ?? "no status"
				}), e.repository && /* @__PURE__ */ b(G, { children: e.repository })]
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
					let n = zr(e.url), r = `PR ${e.number ? `#${e.number}` : ""}${e.merged ? " (merged)" : ""}`;
					return /* @__PURE__ */ b("li", { children: n ? /* @__PURE__ */ b("a", {
						href: Z(n),
						target: "_blank",
						rel: "noreferrer",
						className: "underline",
						children: r
					}) : r }, t);
				})
			}),
			e.githubReviews && /* @__PURE__ */ b(tu, { reviews: e.githubReviews }),
			e.prFeedback && /* @__PURE__ */ b(nu, { feedback: e.prFeedback }),
			e.evidence.length > 0 && /* @__PURE__ */ x("div", {
				className: "mt-2 text-xs",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: "Evidence"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: e.evidence.map((e, t) => /* @__PURE__ */ x("li", { children: [
						e.text ? /* @__PURE__ */ b(Ql, { text: e.text }) : e.kind ?? "record",
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
			/* @__PURE__ */ b(eu, { rounds: e.rounds ?? [] }),
			/* @__PURE__ */ b($l, {
				label: "Deliveries",
				records: e.deliveries
			}),
			/* @__PURE__ */ b($l, {
				label: "Worktrees",
				records: e.worktrees
			}),
			qr(e) && /* @__PURE__ */ b(ru, {
				item: e,
				onSupersede: t
			})
		]
	});
}
// kirocrew-app/ui/src/delivery-api.ts
var su = [
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
], cu = [{
	id: "running",
	label: "Running"
}, {
	id: "reviewing",
	label: "Reviewing"
}];
function lu(e, t) {
	return t === "in-progress" ? [...e.running, ...e.reviewing] : e[t];
}
function uu(e) {
	return cu.map((t) => ({
		...t,
		cards: e[t.id]
	})).filter((e) => e.cards.length);
}
var du = (e) => `color-mix(in srgb, ${e} 8%, var(--card, transparent))`, fu = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function pu(e) {
	return e ? [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at),
		...e.deliveries.map((e) => typeof e.updatedAt == "string" ? e.updatedAt : null)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null : null;
}
var mu = tt;
function hu(e, t) {
	return e === "running" || e === "reviewing" ? "running" : e === "waiting" ? t && dt(t) === "deferred" ? "deferred" : "waiting" : e;
}
function gu(e, t) {
	let n = new Map((e?.tasks ?? []).map((e) => [e.id, e])), r = e ? ft(e) : /* @__PURE__ */ new Map(), i = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), a = new Map((e?.plans ?? []).map((e) => [e.id, e.title])), o = {
		ready: [],
		running: [],
		reviewing: [],
		"needs-you": [],
		waiting: [],
		done: []
	}, s = /* @__PURE__ */ new Set(), c = (e, t) => {
		let n = t?.id ?? e.id;
		s.add(n);
		let c = e?.epic ?? null, l = (t?.sessions ?? []).map((e) => e.attempt), u = mu(e, t);
		o[u].push({
			id: n,
			title: t?.title ?? e.title,
			epic: c ? i.get(c) ?? c : null,
			epicId: c,
			repository: e?.repository ?? null,
			planId: e?.planId ?? null,
			plan: e?.planId ? a.get(e.planId) ?? e.planId : null,
			phase: e?.phase ?? t?.phase ?? null,
			subIssue: t?.subIssue ?? null,
			spec: e?.spec ?? null,
			state: hu(u, e),
			wave: r.get(n) ?? 1,
			decision: e?.decision ?? null,
			authority: t?.authority ?? e?.authority ?? "local",
			route: e?.route ?? null,
			issue: t?.issue ?? e?.issue ?? null,
			item: t,
			attempt: l.length ? Math.max(...l) : null,
			sessions: t?.sessions ?? [],
			reviewRounds: t?.rounds?.length ?? 0,
			deliveryState: fu(t),
			deferred: e ? dt(e) === "deferred" : !1,
			review: e?.review === !0,
			handSetReview: !!(t?.handSetReview ?? e?.handSetReview),
			noSession: t?.noSession ?? e?.noSession ?? null,
			nextAction: t?.nextAction ?? e?.nextAction ?? null,
			planArchived: t?.planArchived ?? e?.planArchived ?? null,
			at: pu(t)
		});
	};
	for (let e of t) e.status !== "superseded" && c(n.get(e.id) ?? null, e);
	for (let t of e?.tasks ?? []) !s.has(t.id) && t.kind === "leaf" && t.status !== "superseded" && c(t, null);
	return o.done.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), o.running.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), o;
}
function _u(e) {
	let t = (e?.statuses ?? []).filter((e) => !e.complete && !["deferred", "blocked"].includes(e.id));
	return t.find((e) => e.id === "planned")?.id ?? t[0]?.id ?? null;
}
function vu(e) {
	let t = (e?.statuses ?? []).filter((e) => e.complete);
	return (t.find((e) => e.id === "done") ?? t.find((e) => e.id === "accepted") ?? t[0])?.id ?? null;
}
function yu(e, t) {
	return Object.fromEntries(Object.keys(e).map((n) => [n, e[n].filter((e) => Zc({
		...e,
		epic: e.epicId,
		decision: e.decision ?? (e.deliveryState === "decision" ? "delivery stopped" : null)
	}, t))]));
}
var bu = {
	id: "done",
	label: "Done",
	tint: "var(--ok)"
};
function xu(e, t, n = 16) {
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
function Su(e) {
	if (e) return e === "running" ? "in-progress" : e === "deferred" ? "waiting" : e;
}
var Cu = (e) => e.route === "local" && !e.deferred, wu = {
	agent: "kirocrew-worker",
	prFeedback: !0,
	feedbackRounds: 5
};
function Tu(e = {}) {
	return {
		agent: e.agent ?? "",
		model: e.model ?? "",
		prFeedback: e.prFeedback === void 0 ? "" : e.prFeedback ? "on" : "off",
		feedbackRounds: e.feedbackRounds === void 0 ? "" : String(e.feedbackRounds)
	};
}
function Eu(e) {
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
// kirocrew-app/ui/src/ReviewState.tsx
var Du = (e, t) => `asked ${e ?? "agent default"}${t ? `, ran ${t}` : ""}`;
function Ou(e) {
	let t = Xr(e.item);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: `flex flex-col gap-1 ${e.compact ? "text-xs" : "text-sm"}`,
		"data-review-runs": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", {
			className: "flex flex-wrap items-center gap-1.5",
			children: [
				/* @__PURE__ */ b(G, {
					variant: t.live ? "info" : void 0,
					children: t.role
				}),
				/* @__PURE__ */ x("span", { children: ["round ", t.round] }),
				/* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", Du(t.requested, t.served)]
				}),
				t.verdict ? /* @__PURE__ */ b(G, {
					variant: t.verdict === "approved" ? "success" : "warning",
					children: t.stale ? `${t.verdict} (stale)` : t.verdict
				}) : /* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", t.live ? "reviewing" : t.status ?? "no verdict"]
				}),
				/* @__PURE__ */ x("span", {
					className: "ml-auto flex items-center gap-1.5",
					children: [t.link && /* @__PURE__ */ x("a", {
						href: Z(t.link),
						className: "inline-flex items-center gap-1 underline",
						"aria-label": `Attach to the ${t.role} chat, round ${t.round}`,
						children: [/* @__PURE__ */ b(V, {
							size: 12,
							"aria-hidden": "true"
						}), "Attach"]
					}), e.onInfo && /* @__PURE__ */ b(J, {
						icon: sn,
						label: `Details of ${t.role} round ${t.round}`,
						tooltip: "Open the task's details",
						onClick: e.onInfo
					})]
				})
			]
		}, t.key))
	}) : null;
}
function ku(e) {
	let { task: t, workspaceId: n } = e, r = l(), i = o(() => Lr(r), [r]), a = Pn(n), [s, u] = c(!1), [d, f] = c(!1), [m, h] = c(null), g = (t.authority ?? "local") === "local", _ = vu(e.graph), v = _u(e.graph), y = async (r, a) => {
		if (e.revision !== null) {
			f(!0), h(null);
			try {
				await i.updateTask(n, t.id, { status: r }, e.revision), u(!1), e.onChanged?.(a);
			} catch (e) {
				h(K(e));
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
				children: Zr(t.noSession)
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
					/* @__PURE__ */ b(q, {
						icon: xe,
						tooltip: "Start a Kiro Crew chat about this task. It changes nothing.",
						onClick: () => void a.ask({ tasks: [t.id] }),
						children: "Discuss"
					}),
					g && _ && !s && /* @__PURE__ */ b(q, {
						icon: j,
						disabled: d || e.revision === null,
						tooltip: "Mark it done. Tasks that wait on it may start. You confirm first.",
						onClick: () => u(!0),
						children: "Mark done"
					}),
					g && v && /* @__PURE__ */ b(q, {
						icon: Me,
						disabled: d || e.revision === null,
						tooltip: `Set its status back to ${v}. The tick may then start it.`,
						onClick: () => void y(v, `Moved ${t.id} back to ${v}.`),
						children: "Back to planned"
					}),
					e.onInfo && /* @__PURE__ */ b(q, {
						icon: sn,
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
// kirocrew-app/ui/src/DeliveryView.tsx
function Au(e) {
	let { card: t, busy: n, act: r, client: i, workspaceId: a } = e, s = xn(), c = l(), u = o(() => Wi(c), [c]), d = t.sessions.some((e) => e.role === "worker" && e.sessionReason), f = t.authority === "local", p = zr(t.issue?.url ?? null), h = t.item?.complete ?? !1;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(m, { children: /* @__PURE__ */ x("div", {
		className: "p-1",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-start gap-2",
				children: [e.phase && /* @__PURE__ */ b(ju, { phase: e.phase }), /* @__PURE__ */ b(In, {
					id: t.id,
					title: t.title,
					className: "text-base font-semibold leading-snug"
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: t.id }),
					t.epic && /* @__PURE__ */ b(G, { children: t.epic }),
					t.plan && /* @__PURE__ */ x("span", { children: [t.plan, t.phase ? ` · ${t.phase.title}` : ""] }),
					/* @__PURE__ */ b(zs, { owner: {
						authority: t.authority,
						issue: t.issue
					} }),
					t.attempt !== null && /* @__PURE__ */ x(G, { children: ["attempt ", t.attempt] }),
					t.reviewRounds > 0 && /* @__PURE__ */ x(G, { children: [t.reviewRounds, " review rounds"] }),
					t.deliveryState && /* @__PURE__ */ b(G, {
						variant: t.deliveryState === "decision" ? "warning" : void 0,
						children: t.deliveryState
					}),
					t.deferred && /* @__PURE__ */ b(G, { children: "deferred" }),
					t.review && /* @__PURE__ */ b(G, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(G, { children: "Archived" }),
					/* @__PURE__ */ b(Or, { budget: t.item?.budget })
				]
			}),
			t.subIssue && /* @__PURE__ */ b("p", {
				className: "mt-2 text-xs",
				style: { color: "var(--warning, var(--muted))" },
				"data-sub-issue": !0,
				children: t.subIssue.reason
			}),
			t.item && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(Ou, {
					item: t.item,
					compact: !0,
					onInfo: () => s.openTask(t.id)
				})
			}),
			t.handSetReview && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(ku, {
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
					href: Z(e.link),
					className: "underline",
					children: Vr(e)
				}) : Vr(e) }, e.slot))
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [
					e.ready && Cu(t) && /* @__PURE__ */ b(q, {
						icon: Oe,
						disabled: n,
						tooltip: "Starts this task first on the next tick, within the limit.",
						onClick: () => e.onStart(t.id),
						children: "Start now"
					}),
					d && !h && /* @__PURE__ */ b(q, {
						icon: je,
						disabled: n,
						tooltip: "The next attempt picks its agent and model afresh",
						onClick: () => r(() => u.pickAgain(a, t.id)),
						children: "Pick again"
					}),
					t.deliveryState === "decision" && /* @__PURE__ */ b(q, {
						icon: Me,
						disabled: n,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => r(() => i.retry(a, t.id)),
						children: "Retry"
					}),
					!h && f && e.canDefer && !t.deferred && /* @__PURE__ */ b(q, {
						icon: Ee,
						disabled: n,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: "deferred" }, e.revision)),
						children: "Defer"
					}),
					!h && f && t.deferred && e.resume && /* @__PURE__ */ b(q, {
						icon: Oe,
						disabled: n,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: e.resume }, e.revision)),
						children: "Resume"
					}),
					!h && !f && p && /* @__PURE__ */ b(X, {
						text: "Open the issue; move its Project card to Deferred to pause it",
						children: /* @__PURE__ */ b("a", {
							href: Z(p),
							target: "_blank",
							rel: "noreferrer",
							className: "self-center text-xs underline",
							children: "Defer on the board"
						})
					}),
					/* @__PURE__ */ b(q, {
						icon: sn,
						tooltip: "Open this task's details in the drawer",
						onClick: () => s.openTask(t.id),
						children: "Details"
					})
				]
			})
		]
	}) }) });
}
function ju({ phase: e }) {
	let t = Xe("(prefers-reduced-motion: reduce)"), n = e === "running" ? "Running: a worker is coding" : "Reviewing: a reviewer or checks chat is reading";
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
var Mu = 16;
function Nu() {
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
function Pu(e) {
	let { lanes: t, narrow: n } = e, { ref: r, width: i } = Nu(), a = e.only === "done" ? [bu] : su.filter((t) => !e.only || t.id === e.only), o = xu(i, a.length, Mu), [s, l] = c(/* @__PURE__ */ new Set(["waiting"])), u = Ln(e.reset ?? ""), d = o === 1, f = (t, n, r) => /* @__PURE__ */ x("ul", {
		className: "flex flex-col gap-3",
		children: [u.take(t, n).map((t) => e.card(t, r)), u.more(t, n.length).left > 0 && /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(Rn, { ...u.more(t, n.length) }) })]
	});
	return /* @__PURE__ */ b("div", {
		ref: r,
		"data-lane-columns": o,
		style: {
			display: "grid",
			gap: Mu,
			gridTemplateColumns: `repeat(${o}, minmax(0, 1fr))`,
			alignItems: "start"
		},
		children: a.map((e) => {
			let r = lu(t, e.id), i = (d || n) && s.has(e.id);
			return /* @__PURE__ */ x("section", {
				"aria-label": `${e.label}: ${r.length}`,
				className: "flex min-w-0 flex-col gap-3 rounded-lg border p-3",
				style: {
					background: du(e.tint),
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
						/* @__PURE__ */ b(G, {
							variant: e.id === "needs-you" && r.length ? "warning" : void 0,
							children: r.length
						})
					]
				}), !i && (r.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "None"
				}) : e.id === "in-progress" ? uu(t).map((t) => /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					role: "group",
					"aria-label": `${t.label}: ${t.cards.length}`,
					children: [/* @__PURE__ */ x("h4", {
						className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted",
						children: [
							t.label,
							" ",
							/* @__PURE__ */ b(G, { children: t.cards.length })
						]
					}), f(`${e.id}:${t.id}`, t.cards, t.id)]
				}, t.id)) : f(e.id, r))]
			}, e.id);
		})
	});
}
function Fu() {
	return Xe("(max-width: 767px)");
}
function Iu({ workspaceId: e }) {
	let n = l(), r = o(() => Lr(n), [n]), i = o(() => yn(n), [n]), { value: a, error: s, busy: u, reload: d } = da(e, t(async (e) => {
		let [t, n] = await Promise.all([r.deliveryPage(e), r.graph(e).catch(() => null)]);
		return {
			items: t.items,
			graph: n,
			reports: t.contentReports ?? []
		};
	}, [r])), f = Fu(), [p, h] = Rl(e), [g, _] = c(!1), [v, S] = c(!1), [C, w] = c(null), T = (e) => {
		S(!0), w(null), (async () => {
			try {
				await e(), await d();
			} catch (e) {
				w({
					ok: !1,
					text: K(e)
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
			text: K(e)
		})).finally(() => S(!1)));
	}, D = t(async (t, n) => {
		e && (await r.supersede(e, t, n), await d());
	}, [
		r,
		e,
		d
	]), O = o(() => a ? gu(a.graph, a.items) : null, [a]), k = O ? yu(O, p) : null, A = o(() => $c(a?.graph ?? null, {}, p.plan), [a, p.plan]), j = o(() => (O?.ready ?? []).filter(Cu).map((e) => ({
		id: e.id,
		title: e.title,
		spec: e.spec,
		state: e.state
	})), [O]), M = k ? new Set(Object.values(k).flat().map((e) => e.id)) : null, N = (a?.reports ?? []).filter((e) => !M || !e.taskId || M.has(e.taskId)), P = a?.items.filter((e) => e.status === "superseded") ?? [], F = !!a?.graph?.statuses.some((e) => e.id === "deferred"), I = _u(a?.graph ?? null), L = a?.graph?.revision ?? 0;
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-delivery-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-delivery-title",
				view: "delivery",
				meta: /* @__PURE__ */ b("span", {
					role: "status",
					className: "text-xs text-muted",
					children: v ? "Working…" : ""
				}),
				actions: e && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
					icon: je,
					onClick: () => void d(),
					disabled: u || v,
					children: "Refresh"
				}), j.length > 0 && /* @__PURE__ */ b("div", {
					"data-start-now-picker": !0,
					style: { minWidth: "14rem" },
					children: /* @__PURE__ */ b(ya, {
						label: "Start now",
						items: j,
						value: "",
						keep: !1,
						onPick: E,
						placeholder: "Find a ready task",
						maxWidth: "20rem"
					})
				})] }),
				children: "Delivery"
			}),
			(s || C) && /* @__PURE__ */ b("p", {
				role: s || !C?.ok ? "alert" : "status",
				className: `text-sm ${s || !C?.ok ? "text-danger" : "text-muted"}`,
				children: s ?? C?.text
			}),
			e ? k ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Bl, {
					id: "avoozl-delivery",
					filter: p,
					choices: A,
					onChange: h
				}),
				/* @__PURE__ */ b(Pu, {
					lanes: k,
					only: Su(p.state),
					narrow: f,
					reset: JSON.stringify(p),
					card: (t, n) => /* @__PURE__ */ b(Au, {
						card: t,
						phase: n,
						ready: k.ready.includes(t),
						canDefer: F,
						resume: I,
						busy: v,
						act: T,
						client: r,
						workspaceId: e,
						revision: L,
						onSupersede: D,
						onStart: E,
						graph: a?.graph ?? null
					}, t.id)
				}),
				N.length > 0 && /* @__PURE__ */ b(Lu, { reports: N }),
				P.length > 0 && /* @__PURE__ */ x("label", {
					className: "flex items-center gap-1 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: g,
							onChange: (e) => _(e.target.checked)
						}),
						"Show superseded (",
						P.length,
						")"
					]
				}),
				g && /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-2",
					children: P.map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ b(Y, {
						title: e.title,
						meta: /* @__PURE__ */ b("span", {
							className: "text-sm text-muted",
							children: e.id
						}),
						className: "mb-2"
					}), /* @__PURE__ */ b(ou, {
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
function Lu({ reports: e }) {
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Y, {
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
					/* @__PURE__ */ b(G, { children: e.set }),
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
// kirocrew-app/ui/src/conflicts-api.ts
function Ru(e) {
	let t = (e.authority ?? "local") === "local";
	return e.kind === "stale-session" && e.slot ? "dismiss" : e.kind === "review" ? Hu(e).length ? "reviewed" : null : !t || e.kind === "needs-human" && e.reason === "hand-set-review" ? null : e.kind === "needs-human" ? e.reason === "blocked" ? "unblock" : "reviewed" : e.kind === "decision" ? "settle" : null;
}
var zu = {
	reviewed: "Mark reviewed",
	unblock: "Unblock",
	dismiss: "Dismiss",
	settle: "Settle"
}, Bu = {
	reviewed: "Count it as reviewed so it may start. Undo by editing it.",
	unblock: "Return it to planned so it may start when ready.",
	dismiss: "Remove the ended session from this list. Its chat is kept.",
	settle: "Clear the decision and note your answer on the task."
}, Vu = (e) => `${e.kind ?? ""}:${e.taskId ?? ""}:${e.field ?? ""}:${e.slot ?? ""}${e.id ? `:${e.id}` : ""}`, Hu = (e) => (e.tasks ?? []).filter((e) => (e.authority ?? "local") === "local").map((e) => ({ taskId: e.id })), Uu = (e) => e.kind === "review" ? Hu(e) : [e.slot ? {
	taskId: e.taskId,
	slot: e.slot
} : { taskId: e.taskId }], Wu = (e) => e.reduce((e, t) => e + Uu(t).length, 0);
function Gu(e, t, n) {
	let r = new Set(n.settled.map((e) => `${e.taskId}\u0000${e.slot ?? ""}`)), i = (e) => r.has(`${e}\u0000`);
	return e.flatMap((e) => {
		if (Ru(e) !== t) return [e];
		if (e.kind === "review") {
			let t = (e.tasks ?? []).filter((e) => !i(e.id));
			return t.length === (e.tasks ?? []).length ? [e] : t.length ? [Ku(e, t)] : [];
		}
		return r.has(`${e.taskId}\u0000${t === "dismiss" ? e.slot ?? "" : ""}`) ? [] : [e];
	});
}
function Ku(e, t) {
	let n = t.length;
	return {
		...e,
		tasks: t,
		title: `Review ${n} ${n === 1 ? "task" : "tasks"} in ${e.plan ?? "this spec"}: their design text changed`
	};
}
function qu(e, t) {
	let n = t.settled.length, r = [n ? `${zu[e]}: ${n} done.` : ""];
	return t.refused.length && r.push(`Refused ${t.refused.length}: ${t.refused.map((e) => `${e.taskId} (${e.reason})`).join("; ")}`), {
		ok: t.refused.length === 0,
		text: r.filter(Boolean).join(" ")
	};
}
function Ju(e) {
	return e.kind === "github-conflict" && !e.choices?.length ? e.field === "identity" ? "Two issues claim this task. Close or merge the duplicate issue on GitHub; Avoozl reads the result on its next tick." : e.field === "Avoozl state" ? "Avoozl fills Avoozl state and already wrote its value back. Move the card’s Status instead. This clears when the task’s state next changes." : "GitHub owns the issue state. Reopen or close it on GitHub; Avoozl reads the result on its next tick." : e.kind === "resource" ? "Two active runs share a resource. Stop one run, or wait for one to finish." : e.kind === "tracker-conflict" ? "The tracker record owns this field. Change it there or in the spec." : e.kind === "content-unavailable" ? "Add or fix this rule set’s terms file or plugin on this machine. Avoozl checks again on the next tick." : e.kind === "content-match" || e.kind === "budget" || e.kind === "over-budget" ? null : e.kind === "needs-human" && e.reason === "hand-set-review" ? "Discuss it, mark it done, or move it back to planned from the task." : e.kind === "review" && Ru(e) === null ? "GitHub or a plugin owns these tasks. Review them where they live." : Ru(e) === null && e.kind !== "github-conflict" ? `${e.authority} owns this task. Settle it where it lives.` : null;
}
var Yu = [
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
function Xu(e) {
	return Object.fromEntries(Yu.map((t) => [t.key, e.filter(t.keep).length]));
}
function Zu(e) {
	return e.kind === "github-conflict" ? `${e.changedBy ?? "Someone"} changed ${e.field ?? "a managed field"} on GitHub; Avoozl manages it. ${e.detail}` : e.kind === "needs-human" && e.reason === "crew" || e.kind === "needs-human" && e.reason === "hand-set-review" ? e.detail : e.kind === "needs-human" ? e.reason === "blocked" ? "Marked blocked: nothing starts until you unblock it." : "New or edited: it waits for your review before it can start." : e.kind === "review" ? e.detail : e.kind === "decision" ? `An open question stops this task: ${e.detail}` : e.kind === "stale-session" ? `Its chat ended before the task finished. ${e.detail}` : e.detail;
}
var Qu = (e) => e.changedAt ?? e.openedAt ?? null;
function $u(e) {
	let t = new Set(e.map(Ru));
	if (t.size !== 1) return null;
	let [n] = t;
	return n && n !== "settle" ? n : null;
}
function ed(e, t, n) {
	let r = t === 1 && n ? n : `${t} ${e === "reviewed" ? "tasks" : "items"}`;
	return {
		title: `${zu[e]}: ${r}?`,
		body: {
			reviewed: "They count as reviewed and may start when ready. To undo, edit each task again.",
			unblock: "They go back to planned and may start when ready.",
			dismiss: "The ended sessions leave the list. Their chats are not deleted.",
			settle: "The decision is cleared and your answer is noted on the task."
		}[e],
		action: zu[e]
	};
}
function td(e) {
	let t = /* @__PURE__ */ new Set(["closed", "lost"]), n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.sessions.filter((e) => !t.has(e.status ?? "")).sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
		e[0] && n.set(r.id, Ti(e[0]));
	}
	return n;
}
var nd = 864e5, rd = [
	{
		value: "1d",
		label: "Older than a day",
		ms: nd
	},
	{
		value: "7d",
		label: "Older than a week",
		ms: 7 * nd
	},
	{
		value: "30d",
		label: "Older than 30 days",
		ms: 30 * nd
	}
], id = (e) => e.taskId ?? e.tasks?.[0]?.id ?? null, ad = (e, t) => e.issue?.repository ?? t?.repository ?? null;
function od(e, t, n, r) {
	let i = t.q?.trim().toLowerCase() ?? "", a = Yu.find((e) => e.key === t.kind), o = rd.find((e) => e.value === t.age), s = Qu(e), c = ad(e, n);
	return (!i || e.title.toLowerCase().includes(i) || (e.taskId ?? "").toLowerCase().includes(i) || e.detail.toLowerCase().includes(i)) && (!a || a.keep(e)) && (!t.plan || (n ? qc(n) : null) === t.plan) && (!t.epic || n?.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !c : c === t.repository)) && (!o || s !== null && r - Date.parse(s) > o.ms) && (!t.changedBy || e.changedBy === t.changedBy);
}
function sd(e, t) {
	let n = new Map((t?.tasks ?? []).map((e) => [e.id, e])), r = new Map((t?.epics ?? []).map((e) => [e.id, e.title])), i = Xu(e), a = (t, n = (e) => e) => {
		let r = /* @__PURE__ */ new Set();
		for (let n of e) {
			let e = t(n);
			e && r.add(e);
		}
		return [...r].map((e) => ({
			value: e,
			label: n(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, o = (e) => n.get(id(e) ?? "");
	return {
		kinds: Yu.filter((e) => e.key !== "all").map((e) => ({
			value: e.key,
			label: `${e.label} (${i[e.key]})`
		})),
		plans: a((e) => {
			let t = o(e);
			return t ? qc(t) : null;
		}, (e) => e.replace(/^(spec|plan):/, "")),
		epics: a((e) => o(e)?.epic, (e) => r.get(e) ?? e),
		repositories: [...a((e) => ad(e, o(e))), ...e.some((e) => !ad(e, o(e))) ? [{
			value: Gc,
			label: "No repository"
		}] : []],
		ages: rd.map(({ value: e, label: t }) => ({
			value: e,
			label: t
		})),
		changedBy: a((e) => e.changedBy)
	};
}
var cd = "avoozl-conflict-filter", ld = (e) => `avoozl.conflict-filters.${e}`, ud = [
	"q",
	"kind",
	"plan",
	"epic",
	"repository",
	"age",
	"changedBy"
];
function dd(e, t) {
	try {
		let n = JSON.parse(e?.getItem(ld(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of ud) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		return r.kind && !Yu.some((e) => e.key === r.kind && e.key !== "all") && delete r.kind, r.age && !rd.some((e) => e.value === r.age) && delete r.age, r;
	} catch {
		return {};
	}
}
function fd(e, t, n) {
	try {
		e?.setItem(ld(t), JSON.stringify(n));
	} catch {}
}
var pd = (e) => ud.some((t) => !!e[t]?.trim()), md = {
	event: cd,
	read: dd,
	write: fd,
	empty: {}
}, hd = {
	...Kr,
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit"
}, gd = {
	title: "Title",
	body: "Managed body section",
	labels: "Managed labels",
	blockers: "Blocked-by links",
	state: "Issue state",
	identity: "Issue identity"
}, _d = (e) => Array.isArray(e) ? e.length ? e.join(", ") : "none" : e || "empty";
function vd({ item: e }) {
	if (e.expected === void 0 && e.actual === void 0) return null;
	let t = (e, t) => /* @__PURE__ */ x("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ b("div", {
			className: "text-xs text-muted",
			children: e
		}), /* @__PURE__ */ b("pre", {
			className: "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs",
			style: { borderColor: "var(--border)" },
			children: _d(t)
		})]
	});
	return /* @__PURE__ */ x("div", {
		className: "mt-2 grid gap-2",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" },
		children: [t("Avoozl expected", e.expected), t(e.changedBy ? `GitHub has (changed by ${e.changedBy})` : "GitHub has", e.actual)]
	});
}
function yd(e) {
	let { item: t, workspaceId: n, revision: r, busy: i, run: a } = e, s = l(), u = o(() => Lr(s), [s]), d = o(() => mi(s), [s]), [f, p] = c(""), m = Ru(t), h = zr(t.issue?.url ?? null), _ = (i, o) => a(async () => {
		let a = await d.settle(n, i, Uu(t), r, o);
		return e.onSettled(i, a), qu(i, a);
	}), v = Ju(t);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			(t.kind === "budget" || t.kind === "over-budget") && t.taskId && t.budget && /* @__PURE__ */ b(kr, {
				workspaceId: n,
				taskId: t.taskId,
				budget: t.budget,
				onDone: (e) => a(async () => ({
					ok: !0,
					text: e
				}))
			}),
			t.kind === "content-match" && t.id && /* @__PURE__ */ b(xd, {
				id: t.id,
				readable: t.readable === !0,
				workspaceId: n,
				busy: i,
				run: a
			}),
			t.kind === "github-conflict" && (t.choices?.length ?? 0) > 0 && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(An, {
						icon: Me,
						tooltip: "Next tick writes Avoozl's value over the GitHub edit",
						disabled: i || t.resolution === "desired",
						confirm: {
							title: `Re-apply Avoozl's ${gd[t.field ?? ""] ?? t.field} on ${t.taskId}?`,
							body: `The next tick writes Avoozl's value over the edit ${t.changedBy ?? "someone"} made on GitHub. Their text is lost unless they keep a copy.`,
							action: "Re-apply"
						},
						onConfirm: () => a(async () => (await u.resolveConflict(n, t.taskId, t.field, "desired"), {
							ok: !0,
							text: "Avoozl rewrites it on the next tick."
						})),
						children: "Re-apply Avoozl’s value"
					}),
					/* @__PURE__ */ b(q, {
						icon: j,
						tooltip: "Keep GitHub's edit until the spec changes this field",
						disabled: i || t.resolution === "github",
						onClick: () => a(async () => (await u.resolveConflict(n, t.taskId, t.field, "github"), {
							ok: !0,
							text: "GitHub’s value stays until the spec changes this field."
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
					htmlFor: `answer-${Vu(t)}`,
					className: "flex flex-1 flex-col gap-1 text-xs",
					style: { minWidth: "16rem" },
					children: [/* @__PURE__ */ x("span", { children: [
						"Your answer to “",
						t.detail,
						"”"
					] }), /* @__PURE__ */ b(g, {
						id: `answer-${Vu(t)}`,
						value: f,
						onChange: (e) => p(e.target.value)
					})]
				}), /* @__PURE__ */ b(An, {
					icon: j,
					tooltip: Bu.settle,
					disabled: i || !f.trim(),
					confirm: ed("settle", 1, t.title),
					onConfirm: () => _("settle", f.trim()),
					children: "Settle"
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					m === "dismiss" && /* @__PURE__ */ b(An, {
						icon: Ve,
						tooltip: Bu.dismiss,
						disabled: i,
						confirm: ed("dismiss", 1, t.title),
						onConfirm: () => _("dismiss"),
						children: "Dismiss"
					}),
					t.kind === "review" && m === "reviewed" && /* @__PURE__ */ b(bd, {
						item: t,
						busy: i,
						onConfirm: () => _("reviewed")
					}),
					m && m !== "settle" && m !== "dismiss" && t.kind !== "review" && /* @__PURE__ */ b(q, {
						icon: j,
						tooltip: Bu[m],
						disabled: i,
						onClick: () => _(m),
						children: zu[m]
					}),
					t.kind === "stale-session" && t.deliveryState === "decision" && /* @__PURE__ */ b(q, {
						icon: Me,
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
					t.kind === "tracker-conflict" && zr(t.link ?? null) && /* @__PURE__ */ b("a", {
						href: zr(t.link ?? null),
						target: "_blank",
						rel: "noreferrer",
						className: "text-sm underline",
						children: "Open in the tracker"
					}),
					h && /* @__PURE__ */ b("a", {
						href: Z(h),
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
function bd({ item: e, busy: t, onConfirm: n }) {
	let r = On(), i = Wu([e]);
	return /* @__PURE__ */ x(q, {
		icon: j,
		tooltip: "Count these tasks as reviewed so they may start when ready",
		disabled: t,
		onClick: () => void r(ed("reviewed", i, i === 1 ? e.tasks?.[0]?.title : void 0)).then((e) => e && n()),
		children: [
			"Mark ",
			i,
			" reviewed"
		]
	});
}
function xd(e) {
	let { id: t, readable: n, workspaceId: r, busy: i, run: a } = e, s = l(), u = o(() => Lr(s), [s]), [d, f] = c(""), [p, m] = c(null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			n && /* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-2",
				children: /* @__PURE__ */ b(q, {
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
				}), /* @__PURE__ */ b(An, {
					icon: j,
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
function Sd({ item: e, workspaceId: t }) {
	let n = l(), i = o(() => mi(n), [n]), [a, s] = c(null), [u, d] = c(null);
	return r(() => {
		e.taskId && i.detail(t, e.taskId).then(s, (e) => d(K(e)));
	}, [
		i,
		t,
		e.taskId
	]), /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		"data-history": !0,
		children: [
			/* @__PURE__ */ b(vd, { item: e }),
			u && /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: u
			}),
			a && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Spec: ",
					a.plan ? `${a.plan.title} (${a.plan.approved ? "approved" : a.plan.state ?? "draft"})` : "none",
					a.task.epicTitle ? ` · Epic: ${a.task.epicTitle}` : "",
					" · State: ",
					a.task.state ?? "unknown"
				]
			}), a.timeline.length ? /* @__PURE__ */ b("ol", {
				className: "flex flex-col gap-0.5 text-xs",
				children: a.timeline.slice(0, 12).map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ b(X, {
						text: e.at,
						children: /* @__PURE__ */ b("span", {
							className: "w-20 shrink-0 text-muted",
							children: Q(e.at)
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
function Cd(e) {
	let { item: t } = e, n = xn(), [r, i] = c(null), a = Qu(t);
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
					/* @__PURE__ */ b(G, {
						variant: [
							"decision",
							"needs-human",
							"review",
							"content-match",
							"content-unavailable"
						].includes(t.kind) ? "warning" : "danger",
						children: hd[t.kind] ?? t.kind
					}),
					t.field && /* @__PURE__ */ b(G, { children: gd[t.field] ?? t.field }),
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
					/* @__PURE__ */ b(zs, { owner: t }),
					e.plan && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["· spec ", e.plan]
					}),
					a && /* @__PURE__ */ b(X, {
						text: a,
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["· ", Q(a)]
						})
					}),
					/* @__PURE__ */ x("span", {
						className: "ml-auto flex items-center gap-1.5",
						children: [
							e.attach && /* @__PURE__ */ x("a", {
								href: Z(e.attach),
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
							/* @__PURE__ */ b(J, {
								icon: xe,
								label: `Ask in a chat about ${t.title}`,
								tooltip: "Ask in a chat: a new chat seeded with this item's full context",
								onClick: e.onAsk
							}),
							t.kind === "review" ? /* @__PURE__ */ b(J, {
								icon: sn,
								label: `Info: ${t.title}`,
								tooltip: "Why these tasks need review, and the list of them",
								onClick: () => n.openReview(t, e.onReviewed)
							}) : /* @__PURE__ */ b(J, {
								icon: de,
								label: `History of ${t.title}`,
								tooltip: "History",
								onClick: () => i(r === "history" ? null : "history")
							}),
							t.taskId && /* @__PURE__ */ b(J, {
								icon: sn,
								label: `View task ${t.taskId}`,
								tooltip: "Open this task's details in the drawer",
								onClick: () => n.openTask(t.taskId)
							}),
							/* @__PURE__ */ b(q, {
								icon: j,
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
				children: Zu(t)
			}),
			r === "history" && /* @__PURE__ */ b(Sd, {
				item: t,
				workspaceId: e.workspaceId
			}),
			r === "resolve" && /* @__PURE__ */ b("div", {
				className: "mt-2 rounded border p-2",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(yd, {
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
function wd({ workspaceId: e }) {
	let n = l(), i = o(() => Lr(n), [n]), a = o(() => mi(n), [n]), s = Pn(e), u = On(), { value: d, error: f, busy: h, reload: g } = da(e, t(async (e) => {
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
	}, [i])), [_, v] = Ea(e, md), S = JSON.stringify(_), C = Ln(S), [w, T] = c(null), [E, D] = c(0), [O, k] = c(/* @__PURE__ */ new Set()), [A, j] = c(!1), [M, N] = c(null);
	r(() => {
		T(d?.page.items ?? null), D(d?.page.revision ?? 0), k(/* @__PURE__ */ new Set());
	}, [d]);
	let P = o(() => {
		let e = d?.graph ?? null;
		return new Map((e?.tasks ?? []).map((e) => [e.id, e.spec ?? e.planId ?? null]));
	}, [d]), F = o(() => new Map((d?.graph?.tasks ?? []).map((e) => [e.id, e])), [d]);
	r(() => k(/* @__PURE__ */ new Set()), [S]);
	let I = o(() => td(d?.delivery ?? []), [d]), L = (e) => {
		j(!0), N(null), (async () => {
			try {
				N(await e());
			} catch (e) {
				let t = K(e);
				N({
					ok: !1,
					text: /Database changed/.test(t) ? "Something changed elsewhere. Refresh, then try again." : t
				});
			} finally {
				j(!1);
			}
		})();
	}, R = (e, t) => {
		D(t.revision), T((n) => n && Gu(n, e, t)), k(/* @__PURE__ */ new Set());
	}, z = w ?? [], B = sd(z, d?.graph ?? null), ee = Date.now(), V = z.filter((e) => od(e, _, F.get(id(e) ?? ""), ee)), H = C.take("conflicts", V), U = V.filter((e) => O.has(Vu(e))), te = H.length > 0 && H.every((e) => O.has(Vu(e))), ne = U.length === V.length && V.length > 0, re = $u(U), ie = (e) => {
		let t = {
			..._,
			...e
		};
		for (let e of Object.keys(t)) t[e] || delete t[e];
		v(t);
	}, ae = async () => {
		e && re && await u(ed(re, Wu(U))) && L(async () => {
			let t = await a.settle(e, re, U.flatMap(Uu), E);
			return R(re, t), qu(re, t);
		});
	}, oe = (e, t) => {
		let n = new Set(O);
		t ? n.add(Vu(e)) : n.delete(Vu(e)), k(n);
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-conflicts-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-conflicts-title",
				view: "conflicts",
				actions: e && /* @__PURE__ */ b(q, {
					icon: je,
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
				/* @__PURE__ */ b(wa, {
					id: "avoozl-conflicts",
					label: "Filter conflicts",
					active: pd(_),
					onClear: () => v({}),
					fields: [
						{
							kind: "search",
							key: "q",
							label: "Search",
							value: _.q ?? "",
							placeholder: "Task, ID or detail",
							onChange: (e) => ie({ q: e })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: _.kind ?? "",
							options: B.kinds,
							onChange: (e) => ie({ kind: e })
						},
						{
							kind: "pick",
							key: "plan",
							label: "Spec",
							value: _.plan ?? "",
							items: _a(B.plans),
							onChange: (e) => ie({ plan: e })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: _.epic ?? "",
							options: B.epics,
							onChange: (e) => ie({ epic: e })
						},
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: _.repository ?? "",
							options: B.repositories,
							onChange: (e) => ie({ repository: e })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: _.age ?? "",
							options: B.ages,
							onChange: (e) => ie({ age: e })
						},
						{
							kind: "select",
							key: "changed-by",
							label: "Changed by",
							value: _.changedBy ?? "",
							options: B.changedBy,
							onChange: (e) => ie({ changedBy: e })
						}
					],
					children: /* @__PURE__ */ x("p", {
						role: "status",
						className: "text-xs text-muted",
						children: [
							V.length,
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
									"aria-label": `Select the ${H.length} shown`,
									checked: te,
									onChange: (e) => {
										let t = new Set(O);
										for (let n of H) e.target.checked ? t.add(Vu(n)) : t.delete(Vu(n));
										k(t);
									}
								}),
								"Select the ",
								H.length,
								" shown"
							]
						}),
						V.length > H.length && /* @__PURE__ */ x(zn, {
							tooltip: "Select every matching item, including ones not shown yet",
							type: "button",
							onClick: () => k(new Set(V.map(Vu))),
							disabled: ne,
							children: [
								"Select all ",
								V.length,
								" matching"
							]
						}),
						/* @__PURE__ */ x("span", {
							role: "status",
							className: "text-xs text-muted",
							"data-selection": !0,
							children: [
								U.length ? `${U.length} selected${ne ? `: all ${V.length} matching` : te && U.length === H.length ? `: the ${H.length} shown` : ""}. Bulk acts on these ${U.length}. · ` : "",
								H.length,
								" shown of ",
								V.length,
								A ? " · Working…" : ""
							]
						}),
						U.length > 0 && /* @__PURE__ */ x(y, { children: [
							/* @__PURE__ */ x(q, {
								icon: xe,
								tooltip: "Start a Kiro Crew chat seeded with the selected items",
								onClick: () => void s.ask({ items: U.map(vn) }),
								children: [
									"Ask in a chat about ",
									U.length,
									" ",
									U.length === 1 ? "item" : "items"
								]
							}),
							re ? /* @__PURE__ */ x(zn, {
								tooltip: Bu[re],
								type: "button",
								primary: !0,
								onClick: () => void ae(),
								disabled: A,
								children: [
									zu[re],
									" ",
									U.length
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
						children: H.map((t) => /* @__PURE__ */ b(Cd, {
							item: t,
							plan: t.taskId ? P.get(t.taskId) ?? null : null,
							onReviewed: () => void g(),
							attach: (t.kind === "stale-session" ? t.link : null) ?? (t.taskId ? I.get(t.taskId) ?? null : null),
							workspaceId: e,
							revision: E,
							busy: A,
							selectable: !0,
							selected: O.has(Vu(t)),
							onSelect: (e) => oe(t, e),
							run: L,
							onSettled: R,
							onAsk: () => void s.ask({ items: [vn(t)] })
						}, Vu(t)))
					}),
					/* @__PURE__ */ b(Rn, { ...C.more("conflicts", V.length) }),
					V.length === 0 && /* @__PURE__ */ b("p", {
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
// kirocrew-app/ui/src/untriaged-api.ts
function Td(e) {
	let t = (t, n) => e.post(ln, {
		operation: "untriaged.view",
		input: n,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, {}),
		refresh: (e) => t(e, { refresh: !0 }),
		start: (t, n, r) => e.post(ln, {
			operation: r === "deliver" ? "intake.deliver" : "intake.plan",
			input: {
				source: n.source,
				id: n.id
			},
			workspaceId: t
		}).then((e) => e.result),
		review: (t, n) => e.post(ln, {
			operation: "review.chat",
			input: {
				repository: n.repository,
				number: n.number
			},
			workspaceId: t
		}).then((e) => e.result)
	};
}
function Ed(e) {
	let t = (t, n, r) => e.post(ln, {
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
function Dd(e) {
	if (!e.length) return {
		ok: !1,
		reason: "Select issues to send them to an Issue Radar crew.",
		repository: null
	};
	if (e.some((e) => Fd(e) !== "github")) return {
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
function Od(e) {
	return e.emptyScope ? "Empty scope: takes every open issue, labeled or not." : `Watches ${e.labels.join(", ")}. Avoozl adds ${e.labels[0]}.`;
}
function kd(e) {
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
var Ad = (e) => (t, n) => e.post(ln, {
	operation: "github.repository.labels",
	input: { repository: n },
	workspaceId: t
}).then((e) => e.result);
function jd(e, t) {
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
var Md = [
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
], Nd = [
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
], Pd = (e) => !!(e.source || e.repository || e.kind || e.age || e.author || e.label), Fd = (e) => e.source ?? "github", Id = 864e5;
function Ld(e, t, n = Date.now()) {
	if (t.source && Fd(e) !== t.source || t.repository && e.repository !== t.repository || t.kind && e.kind !== t.kind || t.author && e.author !== t.author || t.label && !e.labels.includes(t.label)) return !1;
	if (t.age) {
		let r = e.createdAt ? Date.parse(e.createdAt) : NaN;
		return Number.isFinite(r) ? t.age === "older" ? n - r > 30 * Id : n - r <= Number(t.age) * Id : !1;
	}
	return !0;
}
function Rd(e) {
	let t = (e) => [...new Set(e)].sort((e, t) => e.localeCompare(t)).map((e) => ({
		value: e,
		label: e
	})), n = e?.items ?? [];
	return {
		sources: t([...(e?.sources ?? []).map((e) => e.id), ...n.map(Fd)]),
		repositories: t((e?.repositories ?? []).map((e) => e.repository)),
		authors: t(n.map((e) => e.author).filter((e) => !!e)),
		labels: t(n.flatMap((e) => e.labels))
	};
}
function zd(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 60 ? `${r} min` : r < 1440 ? `${Math.round(r / 60)} h` : r < 525600 ? `${Math.round(r / 60 / 24)} d` : `${Math.round(r / 60 / 24 / 365)} y`;
}
var Bd = (e) => Fd(e) === "github" ? `${e.repository}#${e.number}` : `${e.source}:${e.id}`, Vd = (e) => Fd(e) === "github" ? `${e.repository} #${e.number}` : `${e.source} ${e.id}`;
function Hd(e) {
	try {
		return new URL(e.links?.github || (Fd(e) === "github" ? e.url : "") || "").origin;
	} catch {
		return "https://github.com";
	}
}
var Ud = (e) => `${Hd(e)}/${e.repository.split("/").map(encodeURIComponent).join("/")}`, Wd = (e) => e.author ? `${Hd(e)}/${encodeURIComponent(e.author)}` : null;
function Gd(e, t, n) {
	let r = new Set(e);
	for (let e of t) n ? r.add(e) : r.delete(e);
	return r;
}
function Kd(e) {
	let t = e.filter((e) => Fd(e) === "github" && e.links.issueRadar);
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
function qd(e) {
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
var Jd = "avoozl:untriaged-filter:", Yd = {
	event: "avoozl:untriaged-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Jd + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Jd + t, JSON.stringify(n));
		} catch {}
	}
}, Xd = [
	["Pick a crew", "A crew works the open issues that carry a label it watches. Avoozl adds that label."],
	["Check the label", "Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label."],
	["Sent", "A crew picks an issue on its own next turn. Follow it under With Issue Radar."]
], Zd = { color: "var(--danger)" };
function Qd(e) {
	let { workspaceId: n, client: i, items: a, repository: o } = e, [l, u] = c(0), [d, f] = c(null), [m, h] = c(""), [_, v] = c(""), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = t(() => e.onClose(l === 2 ? void 0 : "Cancelled. Nothing was written."), [e, l]);
	r(() => {
		let e = !0;
		return i.crews(n, o).then((t) => {
			e && (f(t), t.crews.length && h(t.crews[0].id));
		}).catch((t) => e && O(K(t))), () => {
			e = !1;
		};
	}, [
		i,
		n,
		o
	]), r(() => {
		k.current?.querySelector("input, button")?.focus();
	}, [l, d]);
	let M = d?.crews.find((e) => e.id === m) ?? null, N = () => ({
		items: a.flatMap((e) => e.number === null ? [] : [{
			repository: e.repository,
			number: e.number
		}]),
		...d?.available ? { crew: { id: m } } : { label: _.trim() }
	}), F = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(K(e));
		} finally {
			E(!1);
		}
	}, I = () => F(async () => {
		S(await i.preview(n, N())), u(1);
	}), L = () => F(async () => {
		w(await i.send(n, N())), u(2), e.onSent();
	}), R = d ? d.available ? !!M : !!_.trim() : !1;
	return /* @__PURE__ */ x($n, {
		id: "avoozl-radar",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-radar-line",
		boxRef: k,
		attrs: { "data-radar-dialog": l },
		unsaved: l < 2 && _.trim() !== "" && {
			title: "Stop the hand-off?",
			body: "Nothing is sent. What you typed is lost.",
			action: "Stop"
		},
		onDismiss: A,
		children: [
			/* @__PURE__ */ b("ol", {
				className: "flex flex-wrap gap-2 text-xs",
				"aria-label": "Steps",
				children: Xd.map(([e], t) => /* @__PURE__ */ x("li", {
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
				children: [/* @__PURE__ */ b(Ae, {
					size: 14,
					"aria-hidden": "true"
				}), Xd[l][0]]
			}), /* @__PURE__ */ b("p", {
				id: "avoozl-radar-line",
				className: "text-sm text-muted",
				children: Xd[l][1]
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
										e.status && /* @__PURE__ */ b(G, { children: e.status }),
										e.labels.map((e) => /* @__PURE__ */ b(G, {
											variant: "info",
											children: e
										}, e))
									]
								}), /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: Od(e)
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
					M?.emptyScope && /* @__PURE__ */ x("p", {
						role: "alert",
						className: "flex items-start gap-1.5 text-sm",
						style: Zd,
						"data-radar-empty-scope": !0,
						children: [
							/* @__PURE__ */ b(P, {
								size: 14,
								"aria-hidden": "true",
								style: {
									marginTop: 3,
									flex: "none"
								}
							}),
							M.name,
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
						style: Zd,
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
					children: [e.ok ? /* @__PURE__ */ b(j, {
						size: 14,
						"aria-hidden": "true",
						style: {
							color: "var(--ok)",
							marginTop: 3
						}
					}) : /* @__PURE__ */ b(Ve, {
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
						disabled: T || !R,
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
	});
}
// kirocrew-app/ui/src/UntriagedView.tsx
var $d = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, ef = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
}, tf = {
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
function nf(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(X, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x("a", {
			href: Z(e.href),
			"aria-label": e.label,
			"aria-describedby": n,
			...e.external ? {
				target: "_blank",
				rel: "noopener noreferrer"
			} : { target: "_top" },
			style: tf,
			className: "text-sm",
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function rf({ item: e }) {
	let t = e.kind === "issue" ? I : e.kind === "ticket" ? te : e.kind === "review" ? Ne : e.draft ? ce : se, n = e.kind === "issue" ? "Issue" : e.kind === "ticket" ? "Ticket" : e.kind === "review" ? "Review request" : e.draft ? "Draft pull request" : "Pull request";
	return /* @__PURE__ */ b(X, {
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
var af = {
	passing: "Checks pass",
	failing: "Checks fail",
	pending: "Checks running"
};
function of({ item: e }) {
	if (e.kind !== "pr") return null;
	let t = e.checks;
	return /* @__PURE__ */ x("span", {
		className: "inline-flex flex-wrap items-center gap-1.5 text-xs",
		children: [e.draft && /* @__PURE__ */ b(G, { children: "draft" }), t && /* @__PURE__ */ x("span", {
			className: "inline-flex items-center gap-1",
			style: { color: t === "passing" ? "var(--ok)" : t === "failing" ? "var(--danger)" : "var(--muted)" },
			children: [t === "passing" ? /* @__PURE__ */ b(j, {
				size: 12,
				"aria-hidden": "true"
			}) : t === "failing" ? /* @__PURE__ */ b(Ve, {
				size: 12,
				"aria-hidden": "true"
			}) : null, af[t]]
		})]
	});
}
function sf({ labels: e }) {
	return e.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: e.map((e) => /* @__PURE__ */ b(G, { children: e }, e))
	}) : null;
}
function cf({ item: e, onSend: t, onReview: n, onStart: r }) {
	let i = Vd(e);
	return Fd(e) === "github" ? /* @__PURE__ */ x("span", {
		className: "inline-flex gap-1.5",
		children: [
			t && (e.kind === "issue" ? /* @__PURE__ */ b(J, {
				icon: ze,
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
			e.links.issueRadar && /* @__PURE__ */ b(nf, {
				icon: Ae,
				label: `Open ${i} in Issue Radar`,
				tooltip: e.links.issueRadar.tooltip,
				href: Z(e.links.issueRadar.url)
			}),
			e.links.review && n && /* @__PURE__ */ b(J, {
				icon: Ne,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				onClick: () => n(e)
			}),
			e.reviewChat?.link ? /* @__PURE__ */ b(X, {
				text: "Open this pull request's code review chat",
				children: /* @__PURE__ */ b("a", {
					href: Z(e.reviewChat.link),
					target: "_top",
					className: "self-center text-sm underline",
					"aria-label": `Attach to the code review chat for ${i}`,
					"data-review-attach": !0,
					children: "Attach"
				})
			}) : e.reviewChat?.state === "queued" ? /* @__PURE__ */ b(X, {
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
			e.links.review && /* @__PURE__ */ b(nf, {
				icon: Ne,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				href: Z(e.links.review.url)
			}),
			r && e.start?.plan && /* @__PURE__ */ b(J, {
				icon: te,
				label: `Plan this: ${i}`,
				tooltip: "Plan this: a planner turns it into a task in the Inbox.",
				onClick: () => r(e, "plan")
			}),
			r && e.start?.deliver && /* @__PURE__ */ b(J, {
				icon: Oe,
				label: `Deliver this: ${i}`,
				tooltip: "Deliver this: one task in its repository, pinned to this text.",
				onClick: () => r(e, "deliver")
			})
		]
	});
}
function lf({ item: e }) {
	return /* @__PURE__ */ b("a", {
		href: Z(Ud(e)),
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-repository-link": !0,
		children: e.repository
	});
}
function uf({ item: e, fallback: t = "" }) {
	let n = Fd(e) === "github" ? Wd(e) : null;
	return n ? /* @__PURE__ */ b("a", {
		href: Z(n),
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-author-link": !0,
		children: e.author
	}) : /* @__PURE__ */ b(y, { children: e.author ?? t });
}
function df({ item: e }) {
	let t = Fd(e) === "github";
	return /* @__PURE__ */ x("a", {
		href: Z(e.links.github ?? e.links.item ?? e.url),
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
function ff(e) {
	return /* @__PURE__ */ b("input", {
		type: "checkbox",
		checked: e.checked,
		"aria-label": `Select ${Vd(e.item)}`,
		onChange: (t) => e.onChange(t.target.checked)
	});
}
function pf(e) {
	let t = e.items.map(Bd), n = t.length > 0 && t.every((t) => e.selected.has(t));
	return /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-untriaged-table": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...$d,
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
						...$d,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Source"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Author"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Age"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Labels"
				}),
				/* @__PURE__ */ b("th", {
					style: {
						...$d,
						textAlign: "right"
					},
					children: /* @__PURE__ */ b(X, {
						text: "Comments",
						children: /* @__PURE__ */ b("span", {
							role: "img",
							"aria-label": "Comments",
							style: { display: "inline-flex" },
							children: /* @__PURE__ */ b(xe, {
								size: 12,
								"aria-hidden": "true"
							})
						})
					})
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.items.map((t) => /* @__PURE__ */ x("tr", {
				"data-untriaged-row": Bd(t),
				children: [
					/* @__PURE__ */ b("td", {
						style: ef,
						children: /* @__PURE__ */ b(ff, {
							item: t,
							checked: e.selected.has(Bd(t)),
							onChange: (n) => e.onSelect([Bd(t)], n)
						})
					}),
					/* @__PURE__ */ b("td", {
						style: ef,
						children: /* @__PURE__ */ b(rf, { item: t })
					}),
					/* @__PURE__ */ x("td", {
						style: {
							...ef,
							minWidth: "16rem"
						},
						children: [/* @__PURE__ */ b(df, { item: t }), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(of, { item: t }) })]
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						"data-intake-source": !0,
						children: Fd(t)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(lf, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(uf, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(X, {
							text: t.createdAt ? `Opened ${t.createdAt.slice(0, 10)}` : null,
							children: /* @__PURE__ */ b("span", {
								className: "tabular-nums",
								children: zd(t.createdAt, e.now)
							})
						})
					}),
					/* @__PURE__ */ b("td", {
						style: ef,
						children: /* @__PURE__ */ b(sf, { labels: t.labels })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							textAlign: "right"
						},
						className: "tabular-nums",
						children: Fd(t) === "github" ? t.comments : ""
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(cf, {
							item: t,
							onSend: e.onSend,
							onReview: e.onReview,
							onStart: e.onStart
						})
					})
				]
			}, Bd(t))) })]
		})
	});
}
function mf(e) {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-untriaged-stack": !0,
		children: e.items.map((t) => /* @__PURE__ */ x("li", {
			className: "flex items-start gap-2 border-t py-2 first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-untriaged-row": Bd(t),
			children: [
				/* @__PURE__ */ b(ff, {
					item: t,
					checked: e.selected.has(Bd(t)),
					onChange: (n) => e.onSelect([Bd(t)], n)
				}),
				/* @__PURE__ */ b(rf, { item: t }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(df, { item: t }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								Fd(t),
								" · ",
								/* @__PURE__ */ b(lf, { item: t }),
								" · ",
								/* @__PURE__ */ b(uf, {
									item: t,
									fallback: "unknown"
								}),
								" · ",
								zd(t.createdAt, e.now),
								Fd(t) === "github" ? ` · ${t.comments} comment${t.comments === 1 ? "" : "s"}` : ""
							]
						}),
						/* @__PURE__ */ b(of, { item: t }),
						/* @__PURE__ */ b(sf, { labels: t.labels })
					]
				}),
				/* @__PURE__ */ b(cf, {
					item: t,
					onSend: e.onSend,
					onReview: e.onReview,
					onStart: e.onStart
				})
			]
		}, Bd(t)))
	});
}
function hf({ onOpen: e }) {
	return e ? /* @__PURE__ */ b("button", {
		type: "button",
		className: "underline",
		onClick: e,
		"data-open-intake-sources": !0,
		children: "Settings › Plugins › Intake sources"
	}) : /* @__PURE__ */ b(y, { children: "Settings › Plugins" });
}
function gf({ list: e, now: t, onOpenSources: n }) {
	let r = e.repositories.filter((e) => e.error || e.truncated), i = (e.sources ?? []).filter((e) => e.id !== "github"), a = e.repositories.map((e) => e.checkedAt).filter((e) => !!e).sort();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-0.5 text-xs text-muted",
		"data-untriaged-checked": !0,
		children: [
			e.repositories.length > 0 && /* @__PURE__ */ x("span", { children: [a.length ? `Checked ${Q(a[0], t)}` : "Not checked yet", " · GitHub is read at most every 10 minutes."] }),
			i.filter((e) => e.error).map((e) => /* @__PURE__ */ x("span", {
				className: "text-danger",
				"data-intake-source-state": e.id,
				children: [
					e.id,
					": ",
					e.error
				]
			}, e.id)),
			i.length > 0 && /* @__PURE__ */ x("span", {
				"data-intake-sources-note": !0,
				children: [
					i.length,
					" other source",
					i.length === 1 ? "" : "s",
					". Status and settings: ",
					/* @__PURE__ */ b(hf, { onOpen: n }),
					"."
				]
			}),
			r.map((e) => /* @__PURE__ */ x("span", {
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
function _f({ items: e, now: t, narrow: n }) {
	let r = (e) => e.handoff ? `Sent${e.handoff.crew ? ` to ${e.handoff.crew.name}` : ""}${e.handoff.label ? ` with ${e.handoff.label}` : ""}${e.handoff.at ? ` ${Q(e.handoff.at, t)}` : ""}` : "A crew found it on its own", i = ({ item: e }) => {
		let t = kd(e);
		return /* @__PURE__ */ b(G, {
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
			"data-radar-row": Bd(e),
			children: [
				/* @__PURE__ */ b(rf, { item: e }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(df, { item: e }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								/* @__PURE__ */ b(lf, { item: e }),
								" · ",
								r(e)
							]
						}),
						/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(i, { item: e }) })
					]
				}),
				/* @__PURE__ */ b(cf, { item: e })
			]
		}, Bd(e)))
	}) : /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-radar-list": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...$d,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "State"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: "How it got there"
				}),
				/* @__PURE__ */ b("th", {
					style: $d,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.map((e) => /* @__PURE__ */ x("tr", {
				"data-radar-row": Bd(e),
				children: [
					/* @__PURE__ */ b("td", {
						style: ef,
						children: /* @__PURE__ */ b(rf, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							minWidth: "16rem"
						},
						children: /* @__PURE__ */ b(df, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(lf, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(i, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: ef,
						className: "text-muted",
						children: r(e)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...ef,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(cf, { item: e })
					})
				]
			}, Bd(e))) })]
		})
	});
}
function vf({ workspaceId: e, onMakeSpec: n, onOpenSources: r }) {
	let i = l(), a = On(), s = o(() => Td(i), [i]), u = o(() => Ed(i), [i]), [d, f] = on("untriaged-show", "inner", (e) => e === "radar" ? "Back to With Issue Radar" : e === "ideas" ? "Back to Ideas" : "Back to Untriaged", "untriaged"), [p, m] = c(!1), [g, _] = c(null), [S, C] = c(null), { value: w, error: T, busy: E } = da(e, t((e) => s.view(e), [s])), [D, O] = c(null), [k, A] = c(!1), [j, M] = c(null), [N, P] = Ea(e, Yd), [F, I] = c(() => /* @__PURE__ */ new Set()), L = Xe("(max-width: 767px)"), R = Date.now(), z = D ?? w, B = z && !z.enabled ? "ideas" : d, ee = z?.ideas ?? [], V = o(() => Rd(z), [z]), H = o(() => (z?.items ?? []).filter((e) => Ld(e, N, R)), [
		z,
		N,
		R
	]), U = Ln(JSON.stringify(N)), te = H.filter((e) => F.has(Bd(e))), ne = Kd(te), re = Dd(te), ie = z?.withRadar ?? [], ae = async () => {
		if (e) try {
			O(await s.view(e)), I(/* @__PURE__ */ new Set());
		} catch (e) {
			M(K(e));
		}
	}, oe = async (t) => {
		if (e) {
			M(null);
			try {
				let n = await s.review(e, t);
				C(n.state === "open" ? `${t.repository} #${t.number} already has a code review chat. Use Attach.` : `Code review chat for ${t.repository} #${t.number} starts on the next tick${n.skill ? "" : ". The sage-review skill is not installed, so it reviews without it"}.`), await ae();
			} catch (e) {
				M(K(e));
			}
		}
	}, se = async (t, n) => {
		if (!e) return;
		let r = Vd(t);
		if (await a(n === "deliver" ? {
			title: `Deliver ${r}?`,
			body: `Avoozl makes one task in ${t.repository} from "${t.title}", pinned to its text now, and a worker starts it. Avoozl writes nothing back to ${t.source}.`,
			action: "Deliver this"
		} : {
			title: `Plan ${r}?`,
			body: `Avoozl adds "${t.title}" to the Inbox for a planner. Nothing starts until a spec is approved.`,
			action: "Plan this"
		})) {
			M(null);
			try {
				let i = await s.start(e, t, n);
				C(`${r} is now task ${i.taskId}.`), await ae();
			} catch (e) {
				M(K(e));
			}
		}
	}, ce = (e) => P({
		...N,
		...e
	}), le = (e, t) => I(Gd(F, e, t)), ue = async () => {
		if (e) {
			A(!0), M(null);
			try {
				O(await s.refresh(e));
			} catch (e) {
				M(K(e));
			} finally {
				A(!1);
			}
		}
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-untriaged-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-untriaged-title",
				view: "untriaged",
				actions: /* @__PURE__ */ x("span", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ b(vc, {
						onClick: () => m(!0),
						disabled: !e
					}), /* @__PURE__ */ b(q, {
						icon: je,
						onClick: () => void ue(),
						disabled: E || k || !z?.enabled,
						tooltip: "Read GitHub and poll each plugin source now instead of waiting for the next check",
						children: k ? "Checking…" : "Check now"
					})]
				}),
				children: "Intake"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Work that comes in from GitHub and your intake sources, and your own ideas. Untriaged shows the items no trigger rule, triage label or Avoozl task covers. Send GitHub issues to an Issue Radar crew or start a code review chat on a pull request; plan or deliver an item from another source."
			}),
			z && /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(v, {
				layoutId: "avoozl-untriaged-show",
				ariaLabel: "Show",
				segments: [
					...z.enabled ? [{
						key: "untriaged",
						label: `Untriaged (${z.items.length})`
					}] : [],
					...z.enabled && z.mode ? [{
						key: "radar",
						label: `With Issue Radar (${ie.length})`
					}] : [],
					{
						key: "ideas",
						label: `Ideas (${ee.filter((e) => e.state === "open").length})`
					}
				],
				value: B,
				onChange: (e) => f(e)
			}) }),
			S && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				"data-radar-note": !0,
				children: S
			}),
			(T || j) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: T ?? j
			}),
			z ? B === "ideas" ? /* @__PURE__ */ x(y, { children: [!z.enabled && /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Untriaged items need a GitHub mode or an intake source. Choose a mode in Settings › GitHub, or add a source in ",
					/* @__PURE__ */ b(hf, { onOpen: r }),
					"."
				]
			}), e && /* @__PURE__ */ b(Cc, {
				workspaceId: e,
				ideas: ee,
				narrow: L,
				onChanged: () => void ae(),
				onMakeSpec: (e) => n?.(e)
			})] }) : B === "radar" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-radar-view": !0,
				children: [/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Issues a crew holds, or that you sent to one. Crews act with your GitHub login, so Avoozl tells their work apart by label: a close on an issue a crew claimed counts only once its pull request merges, a crew’s labels never start Avoozl rules, and a crew’s “needs human” label shows under Needs you."
				}), ie.length === 0 ? /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(Ae, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "Nothing with Issue Radar",
					subtitle: "Select issues under Untriaged and press Send to Issue Radar."
				}) : /* @__PURE__ */ b(_f, {
					items: ie,
					now: R,
					narrow: L
				})]
			}) : z.items.length === 0 ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(gf, {
				list: z,
				now: R,
				onOpenSources: r
			}), /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(pe, {
					size: 36,
					"aria-hidden": "true"
				}),
				...qd(z)
			})] }) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(wa, {
					id: "avoozl-untriaged",
					label: "Filter untriaged items",
					active: Pd(N),
					onClear: () => P({}),
					fields: [
						{
							kind: "select",
							key: "source",
							label: "Source",
							value: N.source ?? "",
							options: V.sources,
							onChange: (e) => ce({ source: e || void 0 })
						},
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: N.repository ?? "",
							options: V.repositories,
							onChange: (e) => ce({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: N.kind ?? "",
							options: Nd,
							onChange: (e) => ce({ kind: e || void 0 })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: N.age ?? "",
							options: Md,
							onChange: (e) => ce({ age: e || void 0 })
						},
						{
							kind: "select",
							key: "author",
							label: "Author",
							value: N.author ?? "",
							options: V.authors,
							onChange: (e) => ce({ author: e || void 0 })
						},
						{
							kind: "select",
							key: "label",
							label: "Label",
							value: N.label ?? "",
							options: V.labels,
							onChange: (e) => ce({ label: e || void 0 })
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
									children: [H.length === z.items.length ? `${z.items.length} untriaged` : `${H.length} of ${z.items.length} untriaged`, te.length ? ` · ${te.length} selected` : ""]
								}), /* @__PURE__ */ b(gf, {
									list: z,
									now: R,
									onOpenSources: r
								})]
							}),
							/* @__PURE__ */ b(X, {
								text: ne.tooltip,
								children: (e) => /* @__PURE__ */ x("a", {
									href: Z(te.length ? ne.url : void 0),
									target: "_top",
									role: "button",
									"aria-disabled": !te.length || void 0,
									"aria-describedby": e,
									tabIndex: 0,
									style: {
										...tf,
										opacity: te.length ? 1 : .5,
										cursor: te.length ? "pointer" : "default"
									},
									className: "text-sm",
									"data-bulk-open": !0,
									children: [/* @__PURE__ */ b(Ae, {
										size: 14,
										"aria-hidden": "true"
									}), "Open selected in Issue Radar"]
								})
							}),
							/* @__PURE__ */ b(q, {
								icon: ze,
								onClick: () => _(te),
								disabled: !re.ok,
								tooltip: re.reason,
								children: "Send selected to Issue Radar"
							})
						]
					})
				}),
				H.length === 0 ? /* @__PURE__ */ x("p", {
					className: "text-sm text-muted",
					children: [
						"No untriaged item matches these filters. Clear them to see all ",
						z.items.length,
						"."
					]
				}) : b(L ? mf : pf, {
					items: U.take("untriaged", H),
					selected: F,
					now: R,
					onSelect: le,
					onSend: (e) => _([e]),
					onReview: (e) => void oe(e),
					onStart: (e, t) => void se(e, t)
				}),
				/* @__PURE__ */ b(Rn, { ...U.more("untriaged", H.length) })
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: E ? "Loading…" : "Not loaded"
			}),
			p && e && /* @__PURE__ */ b(yc, {
				workspaceId: e,
				onClose: (e) => {
					m(!1), e && (C(`Saved the idea ${e.title}.`), f("ideas"), ae());
				}
			}),
			g && e && /* @__PURE__ */ b(Qd, {
				workspaceId: e,
				client: u,
				items: g,
				repository: g[0].repository,
				onSent: () => void ae(),
				onClose: (e) => {
					_(null), C(e ?? null);
				}
			})
		]
	});
}
// kirocrew-app/ui/src/activity-api.ts
var yf = {
	local: "This workspace",
	github: "GitHub",
	plugin: "Plugin sync",
	mcp: "MCP or a session"
};
function bf(e) {
	let t = async (t, n, r) => (await e.post(ln, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		list: (e, n, r = 0) => t("activity.list", {
			...n,
			offset: r
		}, e),
		settings: (e) => t("activity.settings.get", {}, e),
		saveSettings: (e, n, r) => t("activity.settings.update", {
			retentionDays: n,
			expectedHash: r
		}, e)
	};
}
var xf = (e) => !!(e.source || e.kind || e.actor);
function Sf(e, t) {
	let n = (e, t, n = (e) => e) => [{
		value: "",
		label: "All"
	}, ...[.../* @__PURE__ */ new Set([...e, ...t ? [t] : []])].sort().map((e) => ({
		value: e,
		label: n(e)
	}))];
	return {
		sources: n(e?.sources ?? [], t.source, (e) => yf[e] ?? e),
		kinds: n(e?.kinds ?? [], t.kind),
		actors: n(e?.actors ?? [], t.actor)
	};
}
function Cf(e) {
	if (e.targetId && e.task) return {
		kind: "task",
		id: e.targetId
	};
	let t = zr(e.link);
	return t && t.startsWith("https:") ? {
		kind: "link",
		href: t
	} : null;
}
function wf(e) {
	let t = e.trim();
	if (!t) return { days: null };
	let n = Number(t);
	return !Number.isInteger(n) || n < 1 || n > 365 ? {
		days: null,
		error: "Use a whole number of days, 1–365."
	} : { days: n };
}
var Tf = "avoozl:activity-filter:", Ef = {
	event: "avoozl:activity-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Tf + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Tf + t, JSON.stringify(n));
		} catch {}
	}
}, Df = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, Of = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
};
function kf({ at: e, now: t }) {
	return /* @__PURE__ */ b(X, {
		text: e.replace("T", " ").slice(0, 19),
		children: /* @__PURE__ */ b("span", {
			className: "tabular-nums",
			children: Q(e, t)
		})
	});
}
function Af({ row: e }) {
	return e.redacted ? /* @__PURE__ */ x("span", {
		className: "inline-flex flex-wrap items-center gap-1.5",
		"data-activity-redacted": !0,
		children: [/* @__PURE__ */ b(G, {
			variant: "warning",
			children: "Redacted"
		}), /* @__PURE__ */ b("span", {
			className: "text-muted",
			children: e.summary
		})]
	}) : /* @__PURE__ */ b("span", {
		style: { overflowWrap: "anywhere" },
		children: e.summary
	});
}
function jf({ row: e }) {
	let t = xn(), n = Cf(e);
	return n ? n.kind === "task" ? /* @__PURE__ */ b("button", {
		type: "button",
		className: "underline",
		onClick: () => t.openTask(n.id),
		"aria-label": `View task ${n.id}`,
		"data-activity-task": !0,
		children: n.id
	}) : /* @__PURE__ */ b("a", {
		href: Z(n.href),
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-activity-link": !0,
		children: e.targetId ?? "Open on GitHub"
	}) : /* @__PURE__ */ b("span", {
		className: "text-muted",
		children: e.targetId ?? ""
	});
}
function Mf({ rows: e, now: t }) {
	return /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-activity-table": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: Df,
					children: "When"
				}),
				/* @__PURE__ */ b("th", {
					style: Df,
					children: "Source"
				}),
				/* @__PURE__ */ b("th", {
					style: Df,
					children: "Who"
				}),
				/* @__PURE__ */ b("th", {
					style: Df,
					children: "What"
				}),
				/* @__PURE__ */ b("th", {
					style: Df,
					children: "Target"
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.map((e) => /* @__PURE__ */ x("tr", {
				"data-activity-row": e.seq,
				children: [
					/* @__PURE__ */ b("td", {
						style: {
							...Of,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(kf, {
							at: e.at,
							now: t
						})
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Of,
							whiteSpace: "nowrap"
						},
						children: yf[e.source] ?? e.source
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Of,
							whiteSpace: "nowrap"
						},
						children: e.actor ?? ""
					}),
					/* @__PURE__ */ x("td", {
						style: {
							...Of,
							minWidth: "16rem"
						},
						children: [/* @__PURE__ */ b(Af, { row: e }), /* @__PURE__ */ b("div", {
							className: "text-xs text-muted",
							children: e.kind
						})]
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Of,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(jf, { row: e })
					})
				]
			}, e.seq)) })]
		})
	});
}
function Nf({ rows: e, now: t }) {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-activity-stack": !0,
		children: e.map((e) => /* @__PURE__ */ x("li", {
			className: "flex flex-col gap-1 border-t py-2 text-sm first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-activity-row": e.seq,
			children: [
				/* @__PURE__ */ b(Af, { row: e }),
				/* @__PURE__ */ x("span", {
					className: "text-xs text-muted",
					children: [
						/* @__PURE__ */ b(kf, {
							at: e.at,
							now: t
						}),
						" · ",
						yf[e.source] ?? e.source,
						e.actor ? ` · ${e.actor}` : "",
						" · ",
						e.kind
					]
				}),
				/* @__PURE__ */ b("span", {
					className: "text-xs",
					children: /* @__PURE__ */ b(jf, { row: e })
				})
			]
		}, e.seq))
	});
}
function Pf({ workspaceId: e, onSaved: n }) {
	let i = l(), a = o(() => bf(i), [i]), [s, u] = c(null), [d, f] = c(""), [p, m] = c(null), [h, g] = c(!1), _ = t(async () => {
		try {
			let t = await a.settings(e);
			u(t), f(t.retentionDays === t.default ? "" : String(t.retentionDays));
		} catch (e) {
			m({
				ok: !1,
				text: K(e)
			});
		}
	}, [a, e]);
	r(() => {
		_();
	}, [_]);
	let v = wf(d), y = async () => {
		if (s && !v.error) {
			g(!0), m(null);
			try {
				let t = await a.saveSettings(e, v.days, s.hash);
				u(t), m({
					ok: !0,
					text: `Saved. Activity is kept ${t.retentionDays} days.`
				}), n();
			} catch (e) {
				m({
					ok: !1,
					text: K(e)
				});
			} finally {
				g(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		"data-activity-keep": !0,
		children: [
			/* @__PURE__ */ b(Y, {
				title: "Keep activity",
				blurb: "Saved to .avoozl.json. Each tick deletes rows older than this."
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ x("label", {
					htmlFor: "avoozl-activity-keep",
					className: "flex flex-col gap-1 text-sm",
					children: [/* @__PURE__ */ b("span", { children: "Days (optional)" }), /* @__PURE__ */ b("input", {
						id: "avoozl-activity-keep",
						type: "number",
						min: 1,
						max: 365,
						value: d,
						placeholder: String(s?.default ?? 30),
						onChange: (e) => f(e.target.value),
						"aria-invalid": v.error ? !0 : void 0,
						"aria-describedby": v.error ? "avoozl-activity-keep-error" : void 0,
						className: "rounded border px-2 py-1 text-sm",
						style: {
							...fa,
							width: "6rem"
						}
					})]
				}), /* @__PURE__ */ b(zn, {
					primary: !0,
					tooltip: "Save how many days activity is kept",
					onClick: () => void y(),
					disabled: !s || h || !!v.error,
					children: "Save"
				})]
			}),
			v.error && /* @__PURE__ */ b("p", {
				id: "avoozl-activity-keep-error",
				role: "alert",
				className: "text-xs text-danger",
				children: v.error
			}),
			p && /* @__PURE__ */ b("p", {
				role: p.ok ? "status" : "alert",
				className: `text-xs ${p.ok ? "text-muted" : "text-danger"}`,
				children: p.text
			})
		]
	});
}
function Ff({ workspaceId: e }) {
	let n = l(), i = o(() => bf(n), [n]), [a, s] = Ea(e, Ef), [u, d] = c(null), [f, p] = c(null), [m, g] = c(!1), _ = Xe("(max-width: 767px)"), v = Date.now(), y = JSON.stringify(a), S = t(async () => {
		if (e) {
			g(!0), p(null);
			try {
				d(await i.list(e, JSON.parse(y)));
			} catch (e) {
				p(K(e));
			} finally {
				g(!1);
			}
		}
	}, [
		i,
		e,
		y
	]);
	r(() => {
		d(null), S();
	}, [S]);
	let C = async () => {
		if (e && u) {
			g(!0);
			try {
				let t = await i.list(e, a, u.items.length);
				d({
					...t,
					items: [...u.items, ...t.items.filter((e) => !u.items.some((t) => t.seq === e.seq))]
				});
			} catch (e) {
				p(K(e));
			} finally {
				g(!1);
			}
		}
	}, w = Sf(u, a), T = (e) => s({
		...a,
		...e
	}), E = u?.items ?? [];
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-activity-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-activity-title",
				view: "activity",
				actions: /* @__PURE__ */ b(q, {
					icon: je,
					onClick: () => void S(),
					disabled: m || !e,
					tooltip: "Read the activity log again",
					children: "Refresh"
				}),
				children: "Activity"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "What people, sessions, GitHub and plugins did in this workspace. Rows hold IDs and short summaries only; a row the content rules caught is kept as redacted."
			}),
			f && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: f
			}),
			/* @__PURE__ */ b(wa, {
				id: "avoozl-activity",
				label: "Filter activity",
				active: xf(a),
				onClear: () => s({}),
				fields: [
					{
						kind: "select",
						key: "source",
						label: "Source",
						value: a.source ?? "",
						options: w.sources,
						onChange: (e) => T({ source: e || void 0 })
					},
					{
						kind: "select",
						key: "kind",
						label: "Kind",
						value: a.kind ?? "",
						options: w.kinds,
						onChange: (e) => T({ kind: e || void 0 })
					},
					{
						kind: "select",
						key: "actor",
						label: "Who",
						value: a.actor ?? "",
						options: w.actors,
						onChange: (e) => T({ actor: e || void 0 })
					}
				],
				children: /* @__PURE__ */ b("p", {
					role: "status",
					className: "text-xs text-muted",
					children: u ? `${u.total} ${u.total === 1 ? "entry" : "entries"}${xf(a) ? " match" : ""} · kept ${u.retentionDays} days` : m ? "Loading…" : "Not loaded"
				})
			}),
			u && E.length === 0 ? /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(de, {
					size: 36,
					"aria-hidden": "true"
				}),
				title: xf(a) ? "No activity matches these filters" : "No activity yet",
				subtitle: xf(a) ? "Clear the filters to see every entry." : "Starting work, stopping the line, approving and saving settings show here, and so do the closes, board moves and labels the tick reads."
			}) : b(_ ? Nf : Mf, {
				rows: E,
				now: v
			}),
			u && /* @__PURE__ */ b(Rn, {
				left: u.total - E.length,
				onMore: () => void C()
			}),
			e && /* @__PURE__ */ b(Pf, {
				workspaceId: e,
				onSaved: () => void S()
			})
		]
	});
}
// kirocrew-app/ui/src/providers-api.ts
function If(e) {
	let t = (t, n, r = {}) => e.post(ln, {
		operation: n,
		input: r,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, "providers.view"),
		preview: (e, n) => t(e, "provider.switch.preview", n),
		dryRun: (e, n) => t(e, "provider.switch.dryRun", n),
		switch: (e, n) => t(e, "provider.switch", n),
		clear: (e, n) => t(e, "provider.health.clear", { id: n }),
		save: (e, n) => t(e, "providers.settings.update", n),
		models: () => e.get("/api/models").then(La)
	};
}
function Lf(e, t, n) {
	if (e === "tasks") return n.length ? { tasks: [...n] } : null;
	let r = t.trim();
	return r ? e === "provider" ? { provider: r } : { model: r } : null;
}
function Rf(e, t = []) {
	let n = (e) => t.filter((t) => t.scope === e).map((e) => e.name);
	return {
		providers: [...new Set([...e.map((e) => e.provider), ...n("provider")].filter((e) => !!e))].sort(),
		models: [...new Set([...e.map((e) => e.model), ...n("model")].filter((e) => !!e && e !== "auto"))].sort(),
		tasks: [...new Set(e.map((e) => e.taskId))].sort()
	};
}
function zf(e, t) {
	let n = (e) => `${e.slot}\u0000${e.model ?? ""}`, r = new Set(e.chats.map(n)), i = new Set(t.chats.map(n)), a = (e) => `${e.scope}:${e.name}`;
	return {
		added: t.chats.filter((e) => !r.has(n(e))),
		removed: e.chats.filter((e) => !i.has(n(e))),
		marks: e.marks.map(a).join() !== t.marks.map(a).join()
	};
}
function Bf(e, t) {
	return (e.queued ? `Queued ${e.queued} running chat${e.queued === 1 ? "" : "s"} to ${t}. Each moves at its next turn.` : "No running chat was moved.") + (e.marked?.length ? ` New tasks skip ${e.marked.join(", ")} until you undo it.` : "");
}
var Vf = {
	usage: "usage",
	error: "errors",
	person: "a person"
};
function Hf(e) {
	let t = e.scope === "model" ? "Model" : e.scope === "provider" ? "Provider" : "Limit", n = e.source === "usage" && typeof e.percent == "number" ? `${e.percent}% of its limit` : e.source === "person" && e.to ? `new tasks use ${e.to}` : e.kind === "credits" ? "out of credits" : e.kind === "rate-limit" ? "rate limited" : "";
	return `${t} ${e.name} is ${e.level} (${[Vf[e.source], n].filter(Boolean).join("; ")})`;
}
var Uf = (e) => e.source === "person", Wf = [
	{
		key: "provider",
		label: "Provider"
	},
	{
		key: "model",
		label: "Model"
	},
	{
		key: "tasks",
		label: "Tasks"
	}
], Gf = {
	padding: "4px 6px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "baseline",
	textAlign: "left"
}, Kf = {
	...Gf,
	borderTop: "none",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)"
};
function qf(e) {
	let [t, n] = c(!1);
	return e.workspaceId ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(q, {
		icon: A,
		tooltip: "Move running chats to another model, and optionally new tasks too",
		onClick: () => n(!0),
		children: "Switch model"
	}), t && /* @__PURE__ */ b(Yf, {
		workspaceId: e.workspaceId,
		onClose: (t) => {
			n(!1), t && e.onSwitched?.();
		}
	})] }) : null;
}
var Jf = (e, t, n = `${t}s`) => `${e} ${e === 1 ? t : n}`;
function Yf(e) {
	let { workspaceId: t } = e, n = l(), i = o(() => If(n), [n]), [a, s] = c(null), [u, d] = c(!1), [f, m] = c(null), [h, _] = c("choose"), [v, S] = c("provider"), [C, w] = c(""), [T, E] = c([]), [D, O] = c(""), [k, A] = c(!1), [j, M] = c(null), [N, P] = c(null), [F, I] = c(!1), [L, R] = c(null), [z, B] = c(null), ee = () => i.view(t).then((e) => {
		s(e), d(!1);
	}, () => d(!0));
	r(() => {
		ee(), i.models().then(m, () => m("failed"));
	}, [i, t]);
	let V = Rf(a?.chats ?? [], a?.marks ?? []), H = Lf(v, C, T), U = o(() => _a(Ra(Array.isArray(f) ? f : [], "")), [f]), te = async () => {
		if (H && D.trim()) {
			I(!0), R(null), P(null);
			try {
				M(await i.dryRun(t, {
					from: H,
					to: D.trim(),
					alsoNewTasks: k
				})), _("review");
			} catch (e) {
				R(K(e));
			} finally {
				I(!1);
			}
		}
	}, ne = async () => {
		if (H && j) {
			I(!0), R(null);
			try {
				let e = await i.switch(t, {
					from: H,
					to: j.to,
					alsoNewTasks: j.alsoNewTasks,
					previewHash: j.previewHash
				});
				B(Bf(e, j.to)), _("done"), await ee();
			} catch (e) {
				let n = e?.status, r = K(e);
				if (n === 409 || /changed since the dry run/.test(r)) try {
					let e = await i.dryRun(t, {
						from: H,
						to: j.to,
						alsoNewTasks: j.alsoNewTasks
					});
					P(zf(j, e)), M(e);
				} catch (e) {
					R(K(e));
				}
				else R(r);
			} finally {
				I(!1);
			}
		}
	}, re = async (e) => {
		R(null);
		try {
			await i.clear(t, e), await ee();
		} catch (e) {
			R(K(e));
		}
	}, ie = L && /* @__PURE__ */ b("span", {
		role: "alert",
		className: "text-sm text-danger",
		children: L
	}), ae = () => e.onClose(h === "done"), oe = h === "choose" ? /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-center gap-3",
		children: [
			/* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				disabled: F || !H || !D.trim(),
				onClick: () => void te(),
				"data-switch-dry-run": !0,
				children: F ? "Checking…" : "Dry run"
			}),
			/* @__PURE__ */ b(p, {
				type: "button",
				onClick: ae,
				children: "Cancel"
			}),
			ie
		]
	}) : h === "review" ? /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-center gap-3",
		children: [
			/* @__PURE__ */ b(p, {
				type: "button",
				onClick: () => _("choose"),
				"data-switch-back": !0,
				children: "Back"
			}),
			/* @__PURE__ */ b(p, {
				type: "button",
				primary: !0,
				disabled: F || !j || !j.chats.length && !j.marks.length,
				onClick: () => void ne(),
				"data-switch-confirm": !0,
				children: F ? "Switching…" : N ? "Confirm again" : "Confirm"
			}),
			/* @__PURE__ */ b(p, {
				type: "button",
				onClick: ae,
				children: "Cancel"
			}),
			ie
		]
	}) : /* @__PURE__ */ b("div", {
		className: "flex flex-wrap items-center gap-3",
		children: /* @__PURE__ */ b(p, {
			type: "button",
			primary: !0,
			onClick: ae,
			children: "Close"
		})
	}), se = (e, t, n) => u ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
		className: "text-xs text-muted",
		children: [
			"The running chats could not be read, so there is no list. Type a ",
			e.toLowerCase(),
			" name."
		]
	}), /* @__PURE__ */ b(g, {
		"aria-label": e,
		value: C,
		onChange: (e) => w(e.target.value),
		style: { maxWidth: "24rem" }
	})] }) : a ? t.length ? /* @__PURE__ */ x("select", {
		"aria-label": e,
		value: C,
		onChange: (e) => w(e.target.value),
		className: "rounded border px-2 py-1",
		style: {
			...fa,
			maxWidth: "24rem"
		},
		"data-switch-from": !0,
		children: [/* @__PURE__ */ x("option", {
			value: "",
			children: ["Choose a ", e.toLowerCase()]
		}), t.map((e) => /* @__PURE__ */ b("option", {
			value: e,
			children: e
		}, e))]
	}) : /* @__PURE__ */ b("p", {
		className: "text-muted",
		children: n
	}) : /* @__PURE__ */ b("p", {
		className: "text-muted",
		children: "Reading…"
	});
	return /* @__PURE__ */ b($n, {
		id: "avoozl-switch-model",
		title: "Switch model",
		backLabel: "Close Switch model",
		unsaved: h !== "done" && (D !== "" || H !== null) && {
			title: "Stop switching?",
			body: "No chat is moved. What you picked is lost.",
			action: "Stop"
		},
		onDismiss: ae,
		footer: oe,
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-4 text-sm",
			"data-switch-model": !0,
			"data-switch-step": h,
			children: [
				h === "choose" && /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ x("div", {
						className: "flex flex-col gap-1 text-muted",
						"data-switch-intro": !0,
						children: [
							/* @__PURE__ */ b("p", { children: "Running chats change model at their next turn. Each keeps its branch and worktree." }),
							/* @__PURE__ */ b("p", { children: "The reply a chat is writing now finishes first, so nothing is lost." }),
							/* @__PURE__ */ b("p", { children: "Nothing changes until you check the dry run and press Confirm." })
						]
					}),
					(a?.marks.length ?? 0) > 0 && /* @__PURE__ */ x("section", {
						"aria-label": "Provider health",
						children: [/* @__PURE__ */ b("h4", {
							className: "font-medium",
							children: "Health"
						}), /* @__PURE__ */ b("ul", {
							className: "mt-1 flex flex-col gap-1",
							children: a.marks.map((e) => /* @__PURE__ */ x("li", {
								className: "flex flex-wrap items-center gap-2",
								children: [/* @__PURE__ */ b("span", { children: Hf(e) }), Uf(e) && /* @__PURE__ */ b(p, {
									type: "button",
									onClick: () => void re(e.id),
									"aria-label": `Undo: ${Hf(e)}`,
									children: "Undo"
								})]
							}, e.id))
						})]
					}),
					/* @__PURE__ */ x("fieldset", {
						className: "flex flex-col gap-2",
						children: [
							/* @__PURE__ */ b("legend", {
								className: "font-medium",
								children: "From"
							}),
							/* @__PURE__ */ b("div", {
								className: "flex flex-wrap gap-3",
								role: "radiogroup",
								"aria-label": "Switch from",
								children: Wf.map((e) => /* @__PURE__ */ x("label", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ b("input", {
										type: "radio",
										name: "avoozl-switch-from",
										value: e.key,
										checked: v === e.key,
										onChange: () => {
											S(e.key), w("");
										}
									}), e.label]
								}, e.key))
							}),
							v === "provider" ? se("Provider", V.providers, "No running chat or health mark names a provider.") : v === "model" ? se("Model", V.models, "No running chat or health mark names a model.") : a ? V.tasks.length ? /* @__PURE__ */ b("ul", {
								className: "flex flex-col gap-1",
								"aria-label": "Running tasks",
								children: V.tasks.map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("label", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ b("input", {
											type: "checkbox",
											checked: T.includes(e),
											onChange: (t) => E(t.target.checked ? [...T, e] : T.filter((t) => t !== e))
										}),
										e,
										/* @__PURE__ */ b("span", {
											className: "text-xs text-muted",
											children: a.chats.filter((t) => t.taskId === e).map((e) => `${e.role} on ${e.model ?? "auto"}`).join(", ")
										})
									]
								}) }, e))
							}) : /* @__PURE__ */ b("p", {
								className: "text-muted",
								children: "No task is running."
							}) : /* @__PURE__ */ b("p", {
								className: "text-muted",
								children: u ? "The running chats could not be read." : "Reading…"
							})
						]
					}),
					f === "failed" ? /* @__PURE__ */ x("div", {
						className: "flex flex-col gap-1",
						children: [
							/* @__PURE__ */ b("label", {
								htmlFor: "avoozl-switch-to",
								className: "font-medium",
								children: "To"
							}),
							/* @__PURE__ */ b("p", {
								className: "text-xs text-muted",
								children: "Kiro Crew's model list could not be read, so there is no list. Type a model ID, or auto."
							}),
							/* @__PURE__ */ b(g, {
								id: "avoozl-switch-to",
								value: D,
								onChange: (e) => O(e.target.value),
								style: { maxWidth: "24rem" }
							})
						]
					}) : f === null ? /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "Reading Kiro Crew's models…"
					}) : /* @__PURE__ */ b(ya, {
						id: "avoozl-switch-to",
						label: /* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "To"
						}),
						items: U,
						value: D,
						onPick: O,
						placeholder: "Type to find a model, or auto",
						maxWidth: "24rem"
					}),
					/* @__PURE__ */ x("label", {
						className: "flex items-start gap-1.5",
						children: [/* @__PURE__ */ b("input", {
							type: "checkbox",
							className: "mt-1",
							checked: k,
							onChange: (e) => A(e.target.checked),
							"data-switch-also-new": !0
						}), /* @__PURE__ */ x("span", { children: [/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "Also new tasks"
						}), /* @__PURE__ */ b("span", {
							className: "block text-muted",
							children: "Routing skips the From provider or model for new tasks and uses To instead. It stays that way until you undo it under Health, here or in Settings › Providers."
						})] })]
					})
				] }),
				h === "review" && j && /* @__PURE__ */ b(Xf, {
					dry: j,
					changed: N
				}),
				h === "done" && /* @__PURE__ */ b("p", {
					role: "status",
					"data-switch-done": !0,
					children: z
				})
			]
		})
	});
}
function Xf({ dry: e, changed: t }) {
	let { counts: n } = e;
	return /* @__PURE__ */ x("section", {
		"aria-label": "Dry run",
		"data-switch-preview": !0,
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b("p", {
				className: "text-muted",
				children: "Dry run: nothing has changed yet. Confirm switches exactly this set."
			}),
			t && /* @__PURE__ */ x("div", {
				role: "alert",
				className: "rounded border p-2",
				style: { borderColor: "var(--warning, var(--border))" },
				"data-switch-changed": !0,
				children: [/* @__PURE__ */ b("p", {
					className: "font-medium",
					children: "The running chats changed since the dry run. Check the new set, then confirm again."
				}), /* @__PURE__ */ x("ul", {
					className: "mt-1 flex flex-col gap-0.5",
					children: [
						t.added.map((e) => /* @__PURE__ */ x("li", { children: [
							"Added: ",
							e.title,
							" (",
							e.taskId,
							") · ",
							e.role,
							" on ",
							e.model ?? "auto"
						] }, `+${e.slot}`)),
						t.removed.map((e) => /* @__PURE__ */ x("li", { children: [
							"Gone: ",
							e.title,
							" (",
							e.taskId,
							") · ",
							e.role,
							" on ",
							e.model ?? "auto"
						] }, `-${e.slot}`)),
						t.marks && /* @__PURE__ */ b("li", { children: "The new-task rule changed." })
					]
				})]
			}),
			/* @__PURE__ */ x("p", {
				className: "font-medium",
				"data-switch-counts": !0,
				children: [
					Jf(n.switch, "chat"),
					" switch · ",
					n.cannot,
					" can't · ",
					n.queued === null ? "queued tasks unknown" : Jf(n.queued, "queued task"),
					" affected"
				]
			}),
			e.chats.length ? /* @__PURE__ */ b("div", {
				className: "overflow-x-auto",
				children: /* @__PURE__ */ x("table", {
					className: "w-full border-collapse",
					children: [
						/* @__PURE__ */ b("caption", {
							className: "sr-only",
							children: "Chats that switch"
						}),
						/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
							/* @__PURE__ */ b("th", {
								style: Kf,
								children: "Task"
							}),
							/* @__PURE__ */ b("th", {
								style: Kf,
								children: "Spec"
							}),
							/* @__PURE__ */ b("th", {
								style: Kf,
								children: "Now"
							}),
							/* @__PURE__ */ b("th", {
								style: Kf,
								children: "New"
							}),
							/* @__PURE__ */ b("th", {
								style: Kf,
								children: "Runs on"
							})
						] }) }),
						/* @__PURE__ */ b("tbody", { children: e.chats.map((e) => /* @__PURE__ */ x("tr", { children: [
							/* @__PURE__ */ x("td", {
								style: Gf,
								children: [
									e.title,
									" ",
									/* @__PURE__ */ x("span", {
										className: "text-xs text-muted",
										children: [
											e.taskId,
											" · ",
											e.role
										]
									})
								]
							}),
							/* @__PURE__ */ b("td", {
								style: Gf,
								children: e.spec ?? "—"
							}),
							/* @__PURE__ */ b("td", {
								style: Gf,
								children: e.model ?? "auto"
							}),
							/* @__PURE__ */ b("td", {
								style: Gf,
								children: e.to
							}),
							/* @__PURE__ */ b("td", {
								style: Gf,
								children: e.where === "local" ? "this machine" : e.where
							})
						] }, e.slot)) })
					]
				})
			}) : /* @__PURE__ */ b("p", { children: "No running chat switches." }),
			e.skipped.length > 0 && /* @__PURE__ */ x("section", {
				"aria-label": "Can't switch",
				children: [/* @__PURE__ */ b("h4", {
					className: "font-medium",
					children: "Can't switch"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-0.5",
					children: e.skipped.map((e) => /* @__PURE__ */ x("li", { children: [
						e.title,
						" ",
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [e.taskId, e.role ? ` · ${e.role}` : ""]
						}),
						": ",
						e.why
					] }, e.slot ?? e.taskId))
				})]
			}),
			e.alsoNewTasks && /* @__PURE__ */ x("section", {
				"aria-label": "New tasks",
				children: [
					/* @__PURE__ */ b("h4", {
						className: "font-medium",
						children: "New tasks"
					}),
					e.marks.length ? /* @__PURE__ */ x("p", { children: [
						"Routing skips ",
						e.marks.map((e) => `${e.scope} ${e.name}`).join(", "),
						" and uses ",
						e.to,
						", until you undo it."
					] }) : /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "No provider or model to mark: To is already the same."
					}),
					e.queued === null ? /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "The queued tasks could not be read."
					}) : e.queued.length ? /* @__PURE__ */ b("ul", {
						className: "mt-1 flex flex-col gap-0.5",
						"aria-label": "Queued tasks affected",
						children: e.queued.map((t) => /* @__PURE__ */ x("li", { children: [
							t.title,
							" ",
							/* @__PURE__ */ x("span", {
								className: "text-xs text-muted",
								children: [t.taskId, t.spec ? ` · ${t.spec}` : ""]
							}),
							": ",
							t.model,
							" → ",
							e.to
						] }, t.taskId))
					}) : /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "No queued task would have used it."
					})
				]
			})
		]
	});
}
// kirocrew-app/ui/src/RadioFold.tsx
var Zf = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function Qf() {
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
function $f(e) {
	return /* @__PURE__ */ x("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ b("style", { children: Zf }), e.sections.map((t) => {
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
						t.description && t.fields && /* @__PURE__ */ b(Qf, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var ep = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, tp = {
	...ep,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, np = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, rp = 6e4;
function ip(e) {
	let t = l(), n = o(() => Wa(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, rp);
		return window.addEventListener(Ha, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(Ha, r);
		};
	}, [n, e]), i;
}
function ap(e) {
	let [t, n] = c(!1), r = ip(e.workspaceId);
	if (!e.workspaceId) return null;
	let i = r.length > 0, a = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; ");
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(X, {
		text: i ? `The line is stopped: ${a}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (e) => /* @__PURE__ */ x(p, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": e,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: i ? tp : ep,
			children: [/* @__PURE__ */ b(Ee, {
				size: 14,
				"aria-hidden": "true",
				style: i ? { color: "var(--danger)" } : void 0
			}), i ? "Line stopped" : "Stop the line"]
		})
	}), t && /* @__PURE__ */ b(op, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), Ua(), e.onPulled?.();
		}
	})] });
}
function op(e) {
	let n = l(), i = o(() => Wa(n), [n]), [a, u] = c(oo), [d, f] = c(null), [m, h] = c(null), [_, v] = c(!1), y = On(), S = s(null), C = (e) => u((t) => ({
		...t,
		...e
	})), w = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			un(n).repositories(r),
			Xi(n).stored(r),
			Lr(n).graph(r)
		]).then(([e, n, r]) => {
			t && f({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? ba(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		S.current?.querySelector("input, button")?.focus();
	}, []);
	let T = async () => {
		let { input: t, error: n } = so(a);
		if (!t) return h(n ?? null);
		if (!t.full || await y({
			title: "Stop all agents?",
			body: "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.",
			action: "Stop all agents"
		})) {
			v(!0), h(null);
			try {
				await i.stop(e.workspaceId, t), e.onPulled();
			} catch (e) {
				h(K(e));
			} finally {
				v(!1);
			}
		}
	}, E = (e) => /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: d ? e : "Reading…"
	}), D = (e) => /* @__PURE__ */ x("span", { children: [
		e,
		" ",
		/* @__PURE__ */ b("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), O = (e, t, n, r, i) => n.length ? /* @__PURE__ */ b(ya, {
		label: D(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : E(i), k = {
		all: null,
		repo: d?.repositories.length ? /* @__PURE__ */ x("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [D("Repository"), /* @__PURE__ */ x("select", {
				value: a.repository,
				onChange: (e) => C({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: np,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ b("option", {
					value: "",
					children: "Choose…"
				}), d.repositories.map((e) => /* @__PURE__ */ b("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : E("No repository is registered."),
		spec: O("Spec", a.spec, d?.specs ?? [], (e) => C({ spec: e }), "No spec is stored yet."),
		task: O("Task", a.taskId, d?.tasks ?? [], (e) => C({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ x($n, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: S,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(oo()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		onDismiss: w,
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
				id: "avoozl-stop-title",
				className: "flex items-center gap-1.5 text-base font-semibold",
				children: [/* @__PURE__ */ b(Ee, {
					size: 14,
					"aria-hidden": "true",
					style: { color: "var(--danger)" }
				}), "Stop the line"]
			}), /* @__PURE__ */ b("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			})] }),
			/* @__PURE__ */ b($f, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => C({ kind: e }),
				sections: io.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: ao
					}) } : { fields: /* @__PURE__ */ b($f, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => C({ scope: e }),
						sections: ro.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: k[e.value]
						}))
					}) }
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
						onChange: (e) => C({ reason: e.target.value }),
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
					onClick: w,
					children: "Cancel"
				}), /* @__PURE__ */ x(p, {
					type: "button",
					"data-danger": !0,
					"data-stop-confirm": !0,
					onClick: () => void T(),
					disabled: _,
					style: ep,
					children: [/* @__PURE__ */ b(Ee, {
						size: 14,
						"aria-hidden": "true"
					}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/settings-api.ts
function sp(e) {
	let t = async (t, n, r) => (await e.post(ln, {
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
function cp(e) {
	let t = vp(e.project);
	return {
		mode: yp(e.mode) || "plans-repo",
		planningRepository: yp(e.planningRepository),
		repositories: Object.keys(vp(e.repositories)).join(", "),
		projectOwner: yp(t.owner),
		projectNumber: yp(t.number),
		projectTitle: "",
		releases: "",
		iteration: !!vp(t.fields).iteration,
		tableByWave: !1,
		epic: !0
	};
}
function lp(e) {
	let t = /^\d+$/.test(e.projectNumber.trim()) ? Number(e.projectNumber.trim()) : void 0, n = kp({
		owner: Cp(e.projectOwner),
		number: t,
		title: t === void 0 ? Cp(e.projectTitle) : void 0
	});
	return kp({
		mode: e.mode,
		planningRepository: e.mode === "plans-repo" ? Cp(e.planningRepository) : void 0,
		repositories: Sp(e.repositories),
		project: Object.keys(n).length ? n : void 0,
		releases: Sp(e.releases),
		iteration: e.iteration,
		tableByWave: e.tableByWave,
		epic: e.epic
	});
}
var up = (e) => /[\s,"]/.test(e) ? `"${e}"` : e;
function dp(e) {
	let t = (e) => Array.isArray(e) ? e.filter((e) => typeof e == "string" && e.trim() !== "").map((e) => e.trim()) : [], n = t(e.labelsAll), r = t(e.labelsAny), i = t(e.labelsNone), a = typeof e.assignee == "string" ? e.assignee.trim() : "";
	return [
		...n.map((e) => `label:${up(e)}`),
		...r.length ? [`label:${r.map(up).join(",")}`] : [],
		...i.length ? [`-label:${i.map(up).join(",")}`] : [],
		...a ? [`assignee:${a}`] : []
	].join(" ");
}
var fp = "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee.", pp = (e) => (t, n, r, i = !1) => e.post(ln, {
	operation: "github.trigger.preview",
	input: {
		match: r,
		...n.trim() ? { repository: n.trim() } : {},
		...i ? { untriaged: !0 } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function mp(e) {
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
var hp = () => ({
	filter: "",
	triageLabels: [],
	ignoreOlderThanDays: "",
	notify: !1
}), gp = (e) => e.map((e) => `-label:${up(e)}`).join(" ");
function _p(e) {
	let t = kp({
		filter: Cp(e.filter),
		triageLabels: e.triageLabels.length ? e.triageLabels : void 0,
		ignoreOlderThanDays: wp(e.ignoreOlderThanDays),
		notify: e.notify || void 0
	});
	return Object.keys(t).length ? t : void 0;
}
var vp = (e) => e && typeof e == "object" && !Array.isArray(e) ? e : {}, yp = (e) => typeof e == "string" ? e : typeof e == "number" ? String(e) : "", bp = (e) => Array.isArray(e) ? e.map(yp).join(", ") : "", xp = (e) => Object.fromEntries(Object.entries(vp(e)).map(([e, t]) => [e, yp(t)]));
function Sp(e) {
	let t = e.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
	return t.length ? t : void 0;
}
var Cp = (e) => e.trim() ? e.trim() : void 0;
function wp(e) {
	let t = e.trim();
	if (t) return /^\d+$/.test(t) ? Number(t) : t;
}
var Tp = /* @__PURE__ */ new Set([
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
function Ep() {
	return {
		id: "",
		action: "deliver",
		match: "",
		author: "",
		autoPublishChildren: !1
	};
}
function Dp(e = "") {
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
		untriaged: hp(),
		rest: {}
	};
}
function Op(e) {
	let t = vp(e.project);
	return {
		mode: yp(e.mode),
		planningRepository: yp(e.planningRepository),
		defaultAuthority: yp(e.defaultAuthority),
		epicIssueType: yp(e.epicIssueType),
		maxPerParent: (() => {
			let t = vp(e.subIssues).maxPerParent;
			return t === 100 ? "" : yp(t);
		})(),
		includeDone: vp(e.issues).includeDone === !0,
		projectOwner: yp(t.owner),
		projectNumber: yp(t.number),
		fields: xp(t.fields),
		statusValues: xp(t.statusValues),
		repositories: Object.entries(vp(e.repositories)).map(([e, t]) => {
			let n = vp(t), r = n.pullRequestReviews;
			return {
				name: e,
				baseBranch: yp(n.baseBranch),
				coder: yp(n.coder),
				allowedActors: bp(n.allowedActors),
				minimumPermission: yp(n.minimumPermission),
				requiredChecks: bp(n.requiredChecks),
				concurrency: yp(n.concurrency),
				priority: bp(n.priority),
				pullRequestReviews: r != null,
				reviewApprovals: yp(vp(r).approvals),
				managedLabels: xp(n.managedLabels),
				crewLabels: xp(n.crewLabels),
				rules: (Array.isArray(n.rules) ? n.rules : []).map((e) => {
					let t = vp(e);
					return {
						id: yp(t.id),
						action: yp(t.action),
						match: typeof t.match == "string" ? t.match : dp(t),
						author: yp(t.author),
						autoPublishChildren: t.autoPublishChildren === !0
					};
				}),
				untriaged: (() => {
					let e = vp(n.untriaged);
					return {
						filter: yp(e.filter),
						triageLabels: Array.isArray(e.triageLabels) ? e.triageLabels.map(yp).filter(Boolean) : [],
						ignoreOlderThanDays: yp(e.ignoreOlderThanDays),
						notify: e.notify === !0
					};
				})(),
				rest: Object.fromEntries(Object.entries(n).filter(([e]) => !Tp.has(e)))
			};
		})
	};
}
function kp(e) {
	return Object.fromEntries(Object.entries(e).filter(([, e]) => e !== void 0));
}
function Ap(e) {
	let t = kp(Object.fromEntries(Object.entries(e).map(([e, t]) => [e, Cp(t)])));
	return Object.keys(t).length ? t : void 0;
}
function jp(e) {
	let t = Ap(e.fields), n = Ap(e.statusValues), r = !!(e.projectOwner.trim() || e.projectNumber.trim() || t || n);
	return {
		mode: Cp(e.mode) ?? null,
		planningRepository: Cp(e.planningRepository) ?? null,
		defaultAuthority: Cp(e.defaultAuthority) ?? null,
		epicIssueType: Cp(e.epicIssueType) ?? null,
		subIssues: wp(e.maxPerParent) === void 0 ? null : { maxPerParent: wp(e.maxPerParent) },
		issues: e.includeDone ? { includeDone: !0 } : null,
		project: r ? kp({
			owner: Cp(e.projectOwner),
			number: wp(e.projectNumber),
			fields: t,
			statusValues: n
		}) : null,
		repositories: e.repositories.length ? Object.fromEntries(e.repositories.map((e) => [e.name.trim(), kp({
			...e.rest,
			baseBranch: Cp(e.baseBranch),
			coder: Cp(e.coder),
			allowedActors: Sp(e.allowedActors),
			minimumPermission: Cp(e.minimumPermission),
			requiredChecks: Sp(e.requiredChecks),
			concurrency: wp(e.concurrency),
			priority: Sp(e.priority),
			pullRequestReviews: e.pullRequestReviews ? kp({ approvals: wp(e.reviewApprovals) }) : void 0,
			managedLabels: Ap(e.managedLabels),
			crewLabels: Ap(e.crewLabels),
			rules: e.rules.map((e) => kp({
				id: e.id.trim(),
				action: e.action,
				match: Cp(e.match),
				author: Cp(e.author),
				autoPublishChildren: e.autoPublishChildren || void 0
			})),
			untriaged: _p(e.untriaged)
		})])) : null
	};
}
var Mp = {
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
	phase: {
		required: !1,
		blank: "blank: phases stay off the Project"
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
}, Np = {
	status: "Status",
	release: "Release",
	wave: "Wave",
	iteration: "",
	avoozlState: "",
	phase: "",
	todo: "Ready",
	inProgress: "In progress",
	done: "Done",
	deferred: "Deferred"
}, Pp = {
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
}, Fp = {
	managed: "Managed issue",
	ready: "Ready to code",
	responding: "Responding",
	planning: "Planning",
	stale: "Stale claim",
	decision: "Needs a decision"
};
function Ip(e) {
	if (e.mode === "plans-repo" && !e.planningRepository.trim()) return "Plans repository mode needs its planning repository (Where tasks live).";
	if (!Wp(e.mode)) return null;
	let t = e.projectOwner.trim() || e.projectNumber.trim() || Object.values(e.fields).some((e) => e.trim()) || Object.values(e.statusValues).some((e) => e.trim());
	if (t && !e.projectOwner.trim()) return "The Project needs its owner (Where tasks live › Project fields).";
	if (t && !e.projectNumber.trim()) return "The Project needs its number (Where tasks live › Project fields).";
	for (let [t, n] of e.repositories.entries()) {
		let r = n.name.trim() || `Repository ${t + 1}`;
		if (!n.name.trim()) return `${r} needs its owner/name (Repositories › Mode and branch).`;
		if (Wp(e.mode) && !n.baseBranch.trim()) return `${r} needs its default branch (Repositories › Mode and branch).`;
	}
	return null;
}
function Lp(e, t, n, r = Date.now()) {
	let i = t[e], a = [];
	return n && a.push("Required by GitHub branch rule"), i && a.push(i.at ? `${i.source} · last run ${Q(i.at, r)}` : i.source), a.join(" · ") || "Not seen on recent commits or open pull requests";
}
function Rp(e, t, n = Date.now()) {
	let r = Sp(e) ?? [], i = t?.sources ?? {}, a = new Set(t?.seen ?? []), o = new Set(t?.required ?? []);
	return [.../* @__PURE__ */ new Set([...t?.seen ?? [], ...r])].map((e) => ({
		name: e,
		checked: o.has(e) || r.includes(e),
		seen: a.has(e),
		branchRule: o.has(e),
		where: Lp(e, i, o.has(e), n)
	})).sort((e, t) => Number(t.branchRule) - Number(e.branchRule) || Number(t.seen) - Number(e.seen) || e.name.localeCompare(t.name));
}
function zp(e, t, n) {
	let r = Sp(e) ?? [];
	return (n ? [.../* @__PURE__ */ new Set([...r, t])] : r.filter((e) => e !== t)).join(", ");
}
var Bp = (e) => (t, n, r) => e.post(ln, {
	operation: "github.repository.inspect",
	input: {
		repository: n,
		...r.trim() ? { baseBranch: r.trim() } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function Vp(e) {
	if (!e) return "Reading the branch rules…";
	if (e.error || !e.reviewRule) return e.reviewError ?? e.error ?? "The branch rules could not be read.";
	let t = e.reviewRule;
	return t.hidden ? `${t.hiddenReason ?? "GitHub hides the classic protection rule from this account."} The approval count is unknown${t.approvals ? `, at least ${t.approvals} from a ruleset` : ""}. GitHub still enforces it on merge. ${t.approvals ? `Avoozl waits for ${t.approvals} approval${t.approvals === 1 ? "" : "s"} meanwhile.` : "Avoozl's reviewer chats stay the review gate."}` : t.approvals ? `${e.branch} needs ${t.approvals} approving review${t.approvals === 1 ? "" : "s"} (${t.sources.join(" and ")})${t.dismissStale ? ", and a new push dismisses old approvals" : ""}. Avoozl waits for that many from allowed people on the pull request's head commit.` : "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate.";
}
var Hp = [
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
], Up = (e) => e === "plans-repo" || e === "single-repo" ? e : "local", Wp = (e) => Up(e) !== "local";
function Gp(e) {
	let t = Up(e), n = [
		"reviewerChats",
		"landingBranch",
		"workerChats"
	];
	if (t === "local") return /* @__PURE__ */ new Set([...n, "localChecks"]);
	let r = [
		"defaultAuthority",
		"epicIssueType",
		"subIssueCap",
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
var Kp = "Labels, checks, reviews and the Project board only apply to GitHub modes.";
function qp(e) {
	let t = [];
	return e.planningRepository.trim() && t.push("planning repository"), (e.projectOwner.trim() || e.projectNumber.trim()) && t.push("Project board"), e.repositories.length && t.push(`${e.repositories.length} repository GitHub setting${e.repositories.length === 1 ? "" : "s"}`), e.epicIssueType.trim() && t.push("epic issue type"), e.maxPerParent.trim() && t.push("sub-issue cap"), e.includeDone && t.push("issues for done tasks"), t;
}
var Jp = [
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
], Yp = (e) => /^create|^enable/.test(e.action) ? "create" : /^keep/.test(e.action) ? "keep" : "change";
function Xp(e) {
	return Jp.map((t) => ({
		...t,
		writes: e.filter((e) => t.steps.includes(e.step))
	})).filter((e) => e.writes.length);
}
function Zp(e, t, n) {
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
var Qp = [{
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
		"Specs stay private",
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
}], $p = (e) => Up(e) === "single-repo" ? "issue-radar" : "worker", em = "workspaces";
function tm(e, t, n, r) {
	let i = em;
	return t === "settings" && e !== "settings" ? i : r.includes(n) ? n : i;
}
// kirocrew-app/ui/src/ModePicker.tsx
var nm = "var(--ok)", rm = "var(--tile-purple, var(--accent))";
function im({ color: e, children: t }) {
	return /* @__PURE__ */ b("span", {
		className: "inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-4",
		style: {
			background: e,
			color: "var(--card)"
		},
		children: t
	});
}
function am() {
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
function om({ color: e }) {
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
function sm({ color: e }) {
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
var cm = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card)",
	minWidth: 0,
	overflow: "hidden"
};
function lm({ name: e, locked: t, children: n }) {
	return /* @__PURE__ */ x("div", {
		style: cm,
		className: "flex-1 text-[11px] leading-4",
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1 px-2 py-1 font-semibold",
			style: {
				background: "var(--bg-elevated, transparent)",
				borderBottom: "1px solid var(--border)",
				color: "var(--text)"
			},
			children: [t && /* @__PURE__ */ b(am, {}), /* @__PURE__ */ b("span", {
				className: "truncate",
				children: e
			})]
		}), /* @__PURE__ */ b("div", {
			className: "flex flex-col",
			children: n
		})]
	});
}
function um({ icon: e, title: t, pill: n, sub: r }) {
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
function dm() {
	return /* @__PURE__ */ x("div", {
		"aria-hidden": "true",
		children: [/* @__PURE__ */ x("div", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ b(lm, {
				name: "acme/plans",
				locked: !0,
				children: /* @__PURE__ */ b(um, {
					icon: /* @__PURE__ */ b(om, { color: nm }),
					title: "Add login",
					pill: /* @__PURE__ */ b(im, {
						color: nm,
						children: "Open"
					}),
					sub: "#12 · spec 1.2"
				})
			}), /* @__PURE__ */ b(lm, {
				name: "acme/app",
				children: /* @__PURE__ */ b(um, {
					icon: /* @__PURE__ */ b(sm, { color: rm }),
					title: "Add login",
					pill: /* @__PURE__ */ b(im, {
						color: rm,
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
function fm() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(lm, {
			name: "acme/app",
			children: [/* @__PURE__ */ b(um, {
				icon: /* @__PURE__ */ b(om, { color: nm }),
				title: "Add login",
				pill: /* @__PURE__ */ b(im, {
					color: nm,
					children: "Open"
				}),
				sub: "#12 · spec 1.2"
			}), /* @__PURE__ */ b(um, {
				icon: /* @__PURE__ */ b(sm, { color: rm }),
				title: "Add login",
				pill: /* @__PURE__ */ b(im, {
					color: rm,
					children: "Merged"
				}),
				sub: /* @__PURE__ */ x(y, { children: ["body: ", /* @__PURE__ */ b("code", { children: "Closes #12" })] })
			})]
		})
	});
}
function pm() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(lm, {
			name: "This Mac · Avoozl workspace",
			children: [/* @__PURE__ */ b(um, {
				icon: /* @__PURE__ */ b(om, { color: nm }),
				title: "Add login",
				pill: /* @__PURE__ */ b(im, {
					color: rm,
					children: "Done"
				}),
				sub: "task 1.2 · in the database"
			}), /* @__PURE__ */ b(um, {
				icon: /* @__PURE__ */ b(sm, { color: rm }),
				title: "avoozl/1.2 → main",
				pill: /* @__PURE__ */ b(im, {
					color: rm,
					children: "Merged"
				}),
				sub: "merged in your checkout"
			})]
		})
	});
}
var mm = {
	local: pm,
	"plans-repo": dm,
	"single-repo": fm
}, hm = {
	local: "A worker chat codes the task, Avoozl checks it and merges the branch on this Mac. Nothing is sent to GitHub.",
	"plans-repo": "The pull request merges from the linked branch; GitHub closes the private issue. The code repository never names the plans repository.",
	"single-repo": "The pull request says Closes #12; GitHub closes the issue when it merges."
}, gm = {
	local: ge,
	"plans-repo": be,
	"single-repo": oe
};
function _m(e) {
	let t = e.idPrefix ?? "avoozl-mode", n = Up(e.value);
	return /* @__PURE__ */ b("div", {
		"data-mode-picker": !0,
		children: /* @__PURE__ */ b($f, {
			name: t,
			label: "Where tasks live",
			value: n,
			onChange: (t) => e.onChange(t),
			sections: Hp.map((t) => {
				let r = mm[t.mode];
				return {
					key: t.mode,
					title: t.title,
					line: t.line,
					icon: gm[t.mode],
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
									children: hm[t.mode]
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
function vm(e) {
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
						children: [/* @__PURE__ */ b(E, {
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
						children: ["Next", /* @__PURE__ */ b(D, {
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
function ym(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ b("div", {
			className: "flex flex-wrap items-center gap-1.5",
			children: e.boxes.map((t, n) => /* @__PURE__ */ x("span", {
				className: "inline-flex items-center gap-1.5",
				children: [n > 0 && /* @__PURE__ */ b(D, {
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
var bm = [
	{
		title: "A task becomes ready",
		text: "When everything a task waits on is done, the tick marks it ready and starts it, up to the limit at once.",
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
			boxes: [
				"Worker chats",
				"Save",
				"Issue Radar"
			],
			on: 1
		})
	}
], xm = [
	{
		title: "A task becomes ready",
		text: "When everything it waits on is done, Avoozl adds the repository's ready label to its issue.",
		picture: /* @__PURE__ */ b(ym, {
			boxes: ["Waits on", "Ready label"],
			on: 1,
			note: "Scope the crew to this exact label in Issue Radar."
		})
	},
	{
		title: "Issue Radar takes it",
		text: "The crew scoped to that label claims the issue and codes it in its own session.",
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
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
		picture: /* @__PURE__ */ b(ym, {
			boxes: [
				"Issue Radar",
				"Save",
				"Worker chats"
			],
			on: 1
		})
	}
];
function Sm(e) {
	let [t, n] = c(null), r = Up(e.mode), i = e.value || $p(e.mode), a = Qp.filter((e) => e.modes.includes(r));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		children: [
			/* @__PURE__ */ b("div", {
				role: "radiogroup",
				"aria-label": "Who codes",
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" },
				children: a.map((t) => {
					let n = i === t.coder, r = $p(e.mode) === t.coder;
					return /* @__PURE__ */ x("div", {
						id: `${e.id}-${t.coder}`,
						role: "radio",
						"aria-checked": n,
						tabIndex: n ? 0 : -1,
						"data-coder": t.coder,
						onClick: () => e.onChange(r ? "" : t.coder),
						onKeyDown: (n) => {
							let r = a.indexOf(t), i = n.key === "ArrowRight" || n.key === "ArrowDown" ? a[(r + 1) % a.length] : n.key === "ArrowLeft" || n.key === "ArrowUp" ? a[(r - 1 + a.length) % a.length] : n.key === " " || n.key === "Enter" ? t : null;
							i && (n.preventDefault(), e.onChange($p(e.mode) === i.coder ? "" : i.coder), document.getElementById(`${e.id}-${i.coder}`)?.focus());
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
								children: /* @__PURE__ */ b(ym, { boxes: [...t.flow] })
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
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(q, {
				icon: L,
				onClick: () => n(t ? null : i),
				"aria-label": t ? "Hide how this works" : "How does this work?",
				children: t ? "Hide how this works" : "How does this work?"
			}) }),
			t && /* @__PURE__ */ b(vm, {
				id: `${e.id}-walk`,
				label: t === "issue-radar" ? "How Issue Radar codes a task" : "How worker chats code a task",
				steps: t === "issue-radar" ? xm : bm,
				onClose: () => n(null)
			})
		]
	});
}
// kirocrew-app/ui/src/SetupWizard.tsx
var Cm = {
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
}, wm = [
	["What to set up", "Avoozl reads GitHub first. Pick the extras; the mode, repositories and Project come from this tab."],
	["Check each change", "Every write Avoozl would make on GitHub. It never deletes or renames anything."],
	["Making the changes", "Avoozl makes them one at a time. Cancel stops before the next one."],
	["Save the settings file", "Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save."]
];
function Tm(e) {
	let { workspaceId: n, client: i, form: a } = e, [o, l] = c(0), [u, d] = c(e.first), [f, m] = c(!1), [h, _] = c(null), v = s(null), S = s(null), C = t(() => {
		v.current ? (i.cancelSetup(n, v.current), e.onClose("Cancelled. Avoozl stops before its next write; check again to see what was made.")) : e.onClose(o === 3 ? void 0 : "Cancelled. Nothing was written.");
	}, [
		i,
		n,
		e,
		o
	]);
	r(() => {
		S.current?.querySelector("input, button")?.focus();
	}, []);
	let w = async (e) => {
		m(!0), _(null);
		try {
			await e();
		} catch (e) {
			_(K(e));
		} finally {
			m(!1);
		}
	}, T = () => w(async () => {
		d(await i.setup(n, lp(a))), l(1);
	}), E = () => w(async () => {
		if (u) {
			l(2), v.current = u.previewHash;
			try {
				d(await i.setup(n, {
					...lp(a),
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
	}), O = Xp(u?.writes ?? []), k = u?.writes.length ?? 0, A = (u?.results ?? []).filter((e) => e.status !== "done");
	return /* @__PURE__ */ x($n, {
		id: "avoozl-setup",
		width: "40rem",
		backLabel: "Cancel",
		describedBy: "avoozl-setup-line",
		boxRef: S,
		attrs: { "data-setup-dialog": o },
		onDismiss: C,
		children: [
			/* @__PURE__ */ b("ol", {
				className: "flex flex-wrap gap-2 text-xs",
				"aria-label": "Steps",
				children: wm.map(([e], t) => /* @__PURE__ */ x("li", {
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
				children: wm[o][0]
			}), /* @__PURE__ */ b("p", {
				id: "avoozl-setup-line",
				className: "text-sm text-muted",
				children: wm[o][1]
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
										style: Cm[Yp(e)],
										children: Yp(e)
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
							href: Z(e.link),
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
	});
}
function Em(e) {
	let { workspaceId: n, client: i, settings: a, shared: o } = e, [s, l] = c(() => cp(a.github)), u = {
		...s,
		...o,
		mode: o.mode || s.mode
	}, [d, f] = c(null), [p, m] = c(null), [h, g] = c(() => (/* @__PURE__ */ new Date()).toISOString()), [_, v] = c(!1), [y, S] = c(null), C = JSON.stringify(lp(u)), w = t(async () => {
		f(null), m(null);
		try {
			f(await i.setup(n, JSON.parse(C)));
		} catch (e) {
			m(K(e));
		}
		g((/* @__PURE__ */ new Date()).toISOString());
	}, [
		i,
		n,
		C
	]);
	r(() => l(cp(a.github)), [a]), r(() => {
		w();
	}, [w]);
	let T = Zp(d, p, h);
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
					/* @__PURE__ */ b(F, {
						size: 16,
						"aria-hidden": "true",
						style: { color: "var(--ok)" }
					}),
					/* @__PURE__ */ b("span", { children: "GitHub is set up." }),
					/* @__PURE__ */ b(X, {
						text: new Date(T.at).toLocaleString(),
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["Checked ", Q(T.at, Date.now())]
						})
					}),
					/* @__PURE__ */ b(J, {
						icon: je,
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
					/* @__PURE__ */ b(q, {
						icon: Be,
						primary: !0,
						onClick: () => v(!0),
						tooltip: "Show each change first. Nothing is written until you apply.",
						children: "Set up GitHub"
					}),
					/* @__PURE__ */ b(J, {
						icon: je,
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
							/* @__PURE__ */ b(Ve, {
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
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(J, {
						icon: je,
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
			_ && /* @__PURE__ */ b(Tm, {
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
function Dm(e) {
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
var Om = {
	info: "var(--muted)",
	warn: "var(--text)",
	error: "var(--danger)"
};
function km(e) {
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
				children: [t.served && /* @__PURE__ */ b(G, {
					variant: "info",
					children: "This backend"
				}), /* @__PURE__ */ b(X, {
					text: _n(t.state).tip,
					children: /* @__PURE__ */ b("span", {
						"data-workspace-state": t.state,
						children: /* @__PURE__ */ b(G, {
							variant: _n(t.state).variant,
							children: _n(t.state).label
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
function Am(e = {}) {
	let { onSelect: n, onListChange: i } = e, a = l(), s = o(() => un(a), [a]), u = o(() => yn(a), [a]), [d, f] = c(null), [h, g] = c(null), [_, v] = c(e.selected ?? null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c({
		id: "",
		root: "",
		name: ""
	}), k = t(async (e) => {
		E(!0), w(null);
		try {
			await e();
		} catch (e) {
			w(K(e));
		} finally {
			E(!1);
		}
	}, []), A = t((e = null) => k(async () => {
		let t = await s.list();
		g(t), v((n) => fn(t, e ?? n));
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
	}, P = h?.items.find((e) => e.id === _) ?? null, F = Xe("(min-width: 768px)");
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
						/* @__PURE__ */ b(Y, {
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
							children: h.items.map((e) => /* @__PURE__ */ b(km, {
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
								children: "A workspace is a folder with your specs. Pick one that already has them, or start a new one."
							}),
							/* @__PURE__ */ x("form", {
								className: "mt-3 flex flex-col gap-2",
								style: { maxWidth: "36rem" },
								onSubmit: (e) => {
									e.preventDefault(), M("add");
								},
								children: [
									/* @__PURE__ */ b(Dm, {
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
									/* @__PURE__ */ b(Dm, {
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
									/* @__PURE__ */ b(Dm, {
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
												children: "The folder already has Avoozl specs (an .avoozl.json and its database). Avoozl lists it; nothing in it changes."
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
							/* @__PURE__ */ b(Y, {
								title: "Tick health",
								className: "mb-2"
							}),
							/* @__PURE__ */ b("p", {
								className: "my-2 text-sm",
								children: dn(y)
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
										children: [/* @__PURE__ */ b(X, {
											text: e.at,
											children: /* @__PURE__ */ b("span", {
												className: "whitespace-nowrap tabular-nums text-muted",
												children: e.at ? `${e.at.slice(11, 19)} · ${Q(e.at)}` : "unknown"
											})
										}), /* @__PURE__ */ b("span", {
											className: "font-medium uppercase",
											style: { color: Om[e.level] },
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
var jm = [
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
		line: "What was done. Approve specs in Specs when you are ready."
	}
];
function Mm(e, t) {
	let n = t?.github ?? {}, r = typeof n.mode == "string" ? n.mode : "", i = typeof n.planningRepository == "string" ? n.planningRepository : "", a = r === "plans-repo" || r === "single-repo" ? r : e.github ? "single-repo" : "local";
	return {
		mode: r === "local" ? "local" : a,
		isPlanning: !!(e.github && i && i.toLowerCase() === e.github.toLowerCase()) || !i && e.specs.length > 0,
		planningRepository: i || (e.specs.length > 0 && e.github ? e.github : ""),
		id: e.registered?.id ?? e.id ?? "",
		baseBranch: e.registered?.baseBranch ?? e.baseBranch
	};
}
var Nm = (e) => e !== "local";
function Pm(e) {
	return e.mode === "single-repo" || e.mode === "plans-repo" && e.isPlanning;
}
function Fm(e, t) {
	let n = ["folder", "mode"];
	return Nm(e.mode) && n.push("check"), n.push("setup", "import"), Nm(e.mode) && Pm(e) && t?.visibility === "public" && n.push("scan"), Nm(e.mode) && n.push("issues"), n.push("finish"), n;
}
function Im(e, t) {
	return /^[a-z][a-z0-9-]{1,60}$/.test(e.id.trim()) ? e.baseBranch.trim() ? e.mode === "local" ? null : t.github ? e.mode === "plans-repo" && !e.isPlanning && !/^[\w.-]+\/[\w.-]+$/.test(e.planningRepository.trim()) ? "Name the planning repository as owner/name." : e.mode === "plans-repo" && e.isPlanning && t.visibility === "public" ? "A planning repository must be private: its issues name specs and code repositories." : null : t.remote ? `${t.remote} is not a GitHub remote, so GitHub modes can't use this folder. Pick Local only.` : "This folder has no GitHub remote. Pick Local only, or add a GitHub remote first." : "Name the branch tasks land on." : "Give a short ID: lower-case letters, digits and dashes, starting with a letter.";
}
function Lm(e, t, n) {
	let r = n?.github ?? {}, i = Object.keys(r.repositories ?? {}), a = e.isPlanning ? t.github : e.planningRepository.trim(), o = e.mode === "plans-repo" && e.isPlanning ? i : [...i, t.github];
	return {
		mode: e.mode,
		...e.mode === "plans-repo" ? { planningRepository: a } : {},
		repositories: [...new Set(o.filter((t) => t && t.toLowerCase() !== (e.mode === "plans-repo" ? a.toLowerCase() : "")))]
	};
}
function Rm(e, t, n, r) {
	let i = [], a = n?.github ?? {};
	if (Nm(e.mode)) {
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
	let o = Nm(e.mode) ? !!r?.settings.changed : a.mode !== "local" && a.mode !== void 0;
	i.push({
		key: "settings",
		title: o ? `Save the mode${Nm(e.mode) ? " and GitHub names" : ""} to .avoozl.json` : ".avoozl.json already matches",
		detail: Nm(e.mode) ? "The settings Set up GitHub proposed, shown in Check GitHub." : "Local only. Kept GitHub settings stay in the file, unused.",
		done: !o,
		confirm: null
	});
	let s = Pm(e) && Nm(e.mode) ? t.github : null;
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
function zm(e, t, n) {
	let r = Nm(e.mode) ? t.github : null;
	return {
		id: e.id.trim(),
		localCheckout: t.root,
		baseBranch: e.baseBranch.trim(),
		...r ? { github: r } : {},
		...r && Pm(e) ? { issueAuthorization: !0 } : {},
		planning: e.mode === "plans-repo" ? e.isPlanning : e.mode === "local" && t.specs.length > 0 && !n
	};
}
function Bm(e, t) {
	return (e?.items ?? []).filter((e) => !e.root || e.root === t.root || t.specs.includes(e.name));
}
var Vm = (e) => !!e.plan, Hm = (e) => (e?.items ?? []).flatMap((e) => e.findings.map((t) => ({
	spec: e.name,
	...t
})));
function Um(e) {
	let t = e?.writes ?? [];
	return {
		create: t.filter((e) => e.kind === "issue.create"),
		update: t.filter((e) => e.kind === "issue.update"),
		other: t.filter((e) => e.kind !== "issue.create" && e.kind !== "issue.update").length
	};
}
function Wm(e) {
	let t = async (t, n, r = {}) => (await e.post(ln, {
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
var Gm = {
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
}, Km = {
	local: ge,
	"plans-repo": be,
	"single-repo": oe
};
function qm({ kind: e }) {
	return /* @__PURE__ */ b("span", {
		className: "rounded-full border px-1.5 text-[10px] font-semibold",
		style: Gm[e] ?? Gm.keep,
		children: e
	});
}
function Jm({ rows: e }) {
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
function Ym({ children: e }) {
	return /* @__PURE__ */ x("p", {
		className: "flex items-center gap-1.5 text-sm",
		"data-step-done": !0,
		children: [/* @__PURE__ */ b(j, {
			size: 14,
			"aria-hidden": "true",
			style: { color: "var(--ok)" }
		}), e]
	});
}
function Xm(e) {
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
			t && /* @__PURE__ */ b(Jm, { rows: [
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
function Zm(e) {
	let { form: t, found: n, set: r } = e, i = n.github ? null : n.remote ? `${n.remote} is not a GitHub remote.` : "This folder has no GitHub remote.";
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-mode": !0,
		children: [
			/* @__PURE__ */ b($f, {
				name: "avoozl-onboard-mode",
				label: "Mode",
				value: t.mode,
				onChange: (e) => r({ mode: e }),
				sections: Hp.map((e) => ({
					key: e.mode,
					title: e.title,
					line: e.line,
					icon: Km[e.mode],
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
						}), /* @__PURE__ */ b(Jm, { rows: e.facts.map(([e, t]) => [e, t]) })]
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
function Qm({ result: e }) {
	if (!e) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Reading GitHub…"
	});
	let t = Xp(e.writes), n = e.steps.filter((t) => !e.writes.some((e) => e.step === t.id) && t.status !== "failed"), r = e.steps.filter((e) => e.status === "failed");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-check": !0,
		children: [
			e.writes.length === 0 && /* @__PURE__ */ b(Ym, { children: "Nothing to create or change on GitHub." }),
			t.map((e) => /* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
				className: "text-xs font-semibold uppercase tracking-wide text-muted",
				children: e.title
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: e.writes.map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ b(qm, { kind: Yp(e) }),
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
						/* @__PURE__ */ b(qm, { kind: "keep" }),
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
function $m(e) {
	let { workspaceId: n, client: i, onClose: a } = e, o = On(), [l, u] = c("folder"), [d, f] = c(""), [m, h] = c(null), [g, _] = c(null), [v, S] = c(!1), [C, w] = c(null), [T, E] = c(null), [D, O] = c([]), [k, A] = c(!1), [M, N] = c(null), [P, F] = c(/* @__PURE__ */ new Set()), [I, L] = c(null), [R, z] = c({}), [B, ee] = c(!1), [V, H] = c(null), U = s(null), te = C ? Fm(C, m) : [
		"folder",
		"mode",
		"setup",
		"import",
		"finish"
	], ne = te.indexOf(l), re = jm.find((e) => e.key === l), ie = D.length > 0, ae = t(() => {
		a(ie ? `Stopped. Done so far: ${D.join("; ")}.` : "Cancelled. Nothing was written.");
	}, [
		a,
		ie,
		D
	]);
	r(() => {
		U.current?.querySelector("input:not([disabled]), button")?.focus();
	}, [l]);
	let oe = async (e) => {
		ee(!0), H(null);
		try {
			await e();
		} catch (e) {
			H(K(e));
		} finally {
			ee(!1);
		}
	}, se = (e) => {
		H(null), u(e);
	}, ce = () => se(te[Math.min(te.length - 1, ne + 1)]), le = () => se(te[Math.max(0, ne - 1)]), ue = (e) => w((t) => t && {
		...t,
		...e
	}), de = () => oe(async () => {
		if (!d.trim()) throw Error("Give the checkout folder.");
		let [e, t, r] = await Promise.all([
			i.inspect(n, d.trim()),
			i.settings(n),
			i.repositories(n)
		]);
		h(e), _(t), S(r.items.some((t) => t.planning && t.id !== e.registered?.id)), w(Mm(e, t)), se("mode");
	}), fe = () => oe(async () => {
		C && m && (E(null), E(await i.checkGitHub(n, Lm(C, m, g))));
	});
	r(() => {
		l === "check" && !T && fe();
	}, [l]);
	let pe = C && m ? Rm(C, m, g, T) : [], me = () => oe(async () => {
		if (!C || !m) return;
		let t = T;
		for (let e of pe) if (!e.done) {
			if (e.confirm && !await o(e.confirm)) {
				H(`Stopped before “${e.title}”. Nothing after it was written.`);
				return;
			}
			if (e.key === "github" && t) {
				t = await i.applyGitHub(n, Lm(C, m, g), t.previewHash), E(t);
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
			e.key === "register" && (await i.register(n, zm(C, m, v)), O((e) => [...e, `added ${C.id.trim()}`]));
		}
		let r = await i.inspect(n, m.root);
		h(r), N(await i.specs(n).catch(() => null)), await e.onChanged(), A(!0), ce();
	}), he = m ? Bm(M, m) : [];
	r(() => {
		l === "import" && F(new Set(he.filter((e) => !Vm(e)).map((e) => e.name)));
	}, [l, M]);
	let ge = () => oe(async () => {
		for (let e of P) await i.importSpec(n, e), O((t) => [...t, `imported ${e} as a draft`]);
		N(await i.specs(n)), await e.onChanged();
	}), _e = () => oe(async () => {
		L(null), L(await i.scan(n, he.map((e) => e.name)));
	});
	r(() => {
		l === "scan" && _e(), l === "issues" && oe(async () => {
			let e = he.filter((e) => e.plan && !e.plan.approved), t = await Promise.all(e.map(async (e) => [e.name, await i.previewIssues(n, e.plan.id).catch((e) => ({ error: K(e) }))]));
			z(Object.fromEntries(t));
		});
	}, [l]);
	let ve = Hm(I), W = l === "mode" && C && m ? Im(C, m) : null, ye = l === "check" && T ? T.steps.some((e) => e.status === "failed") && T.writes.length === 0 : !1, be = k ? [] : pe.filter((e) => !e.done), xe = (e) => e === "folder" && !!m || e === "check" && !!T && T.writes.length === 0 || e === "setup" && (k || !!C && be.length === 0) || e === "import" && he.length > 0 && he.every(Vm);
	return /* @__PURE__ */ x($n, {
		id: "avoozl-onboard",
		width: "44rem",
		backLabel: "Cancel",
		describedBy: "avoozl-onboard-line",
		boxRef: U,
		attrs: { "data-onboard-dialog": l },
		unsaved: d.trim() !== "" && {
			title: "Stop onboarding?",
			body: ie ? `What was done stays: ${D.join("; ")}.` : "What you entered is lost. Nothing was written.",
			action: "Stop"
		},
		onDismiss: ae,
		children: [
			/* @__PURE__ */ b("ol", {
				className: "flex flex-wrap gap-x-3 gap-y-1 text-xs",
				"aria-label": "Steps",
				children: te.map((e, t) => /* @__PURE__ */ x("li", {
					"aria-current": e === l ? "step" : void 0,
					className: `inline-flex items-center gap-1 ${e === l ? "font-semibold" : "text-muted"}`,
					children: [
						xe(e) && /* @__PURE__ */ b(j, {
							size: 11,
							"aria-label": "done",
							style: { color: "var(--ok)" }
						}),
						t + 1,
						". ",
						jm.find((t) => t.key === e).title
					]
				}, e))
			}),
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
				id: "avoozl-onboard-title",
				className: "text-base font-semibold",
				children: re.title
			}), /* @__PURE__ */ b("p", {
				id: "avoozl-onboard-line",
				className: "text-sm text-muted",
				children: re.line
			})] }),
			l === "folder" && /* @__PURE__ */ b(Xm, {
				folder: d,
				setFolder: (e) => {
					f(e), h(null);
				},
				found: m
			}),
			l === "mode" && C && m && /* @__PURE__ */ b(Zm, {
				form: C,
				set: ue,
				found: m,
				problem: W
			}),
			l === "check" && /* @__PURE__ */ b(Qm, { result: T }),
			l === "setup" && /* @__PURE__ */ b("ol", {
				className: "flex flex-col gap-2 text-sm",
				"data-onboard-setup": !0,
				children: pe.map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex items-start gap-2",
					children: [/* @__PURE__ */ x("span", {
						className: "w-5 flex-none text-right text-muted",
						children: [t + 1, "."]
					}), /* @__PURE__ */ x("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ x("span", {
							className: "flex items-center gap-1.5",
							children: [
								e.done || k ? /* @__PURE__ */ b(j, {
									size: 13,
									"aria-label": "done",
									style: { color: "var(--ok)" }
								}) : null,
								e.title,
								e.confirm && !e.done && !k && /* @__PURE__ */ b(G, {
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
					he.length === 0 && /* @__PURE__ */ b("p", {
						className: "text-muted",
						children: "No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back."
					}),
					he.length > 0 && he.every(Vm) && /* @__PURE__ */ b(Ym, { children: "Every spec here is imported." }),
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-1.5",
						children: he.map((e) => /* @__PURE__ */ x("li", {
							className: "flex flex-wrap items-center gap-2",
							"data-onboard-spec": e.name,
							children: [
								/* @__PURE__ */ b("input", {
									type: "checkbox",
									"aria-label": `Import ${e.name}`,
									disabled: Vm(e),
									checked: Vm(e) || P.has(e.name),
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
								e.counts.error > 0 ? /* @__PURE__ */ x(G, {
									variant: "warning",
									children: [
										e.counts.error,
										" lint error",
										e.counts.error === 1 ? "" : "s"
									]
								}) : /* @__PURE__ */ x(G, { children: ["lint clean", e.counts.warning ? `, ${e.counts.warning} warnings` : ""] }),
								e.plan && /* @__PURE__ */ b(G, { children: e.plan.approved ? "approved" : "draft" })
							]
						}, e.name))
					}),
					he.some((e) => e.counts.error > 0) && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "A draft with lint errors imports, but Specs won't approve it until they are fixed."
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
					I && ve.length === 0 && /* @__PURE__ */ x(Ym, { children: [
						"No secrets, local paths or content-rule matches in ",
						I.items.length,
						" spec",
						I.items.length === 1 ? "" : "s",
						"."
					] }),
					ve.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
						role: "alert",
						className: "text-danger",
						children: [
							ve.length,
							" finding",
							ve.length === 1 ? "" : "s",
							". Fix each line, then scan again. The next step waits until none are left."
						]
					}), /* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-1",
						children: ve.map((e, t) => /* @__PURE__ */ x("li", {
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
				children: [he.filter((e) => e.plan && !e.plan.approved).length === 0 && /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "No draft specs to preview. Import a spec first."
				}), Object.entries(R).map(([e, t]) => {
					if ("error" in t) return /* @__PURE__ */ x("p", {
						role: "alert",
						className: "text-sm text-danger",
						children: [
							e,
							": ",
							t.error
						]
					}, e);
					let n = Um(t);
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
								/* @__PURE__ */ b(qm, { kind: "create" }),
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
					children: "Nothing was approved, no agent was started and nothing was pushed. Approve each draft in Specs when you are ready."
				})]
			}),
			V && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: V
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [
					/* @__PURE__ */ b(p, {
						type: "button",
						onClick: ae,
						disabled: B,
						children: l === "finish" ? "Close" : "Cancel"
					}),
					ne > 0 && l !== "finish" && te[ne - 1] !== "setup" && /* @__PURE__ */ b(p, {
						type: "button",
						onClick: le,
						disabled: B,
						children: "Back"
					}),
					l === "folder" && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => void de(),
						disabled: B || !d.trim(),
						children: "Check folder"
					}),
					l === "mode" && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B || !!W,
						children: "Next"
					}),
					l === "check" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
						type: "button",
						onClick: () => void fe(),
						disabled: B,
						children: "Check again"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B || !T || ye,
						children: "Next"
					})] }),
					l === "setup" && (be.length ? /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => void me(),
						disabled: B,
						children: "Set up"
					}) : /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B,
						children: "Next"
					})),
					l === "import" && /* @__PURE__ */ x(y, { children: [P.size > 0 && /* @__PURE__ */ x(p, {
						type: "button",
						onClick: () => void ge(),
						disabled: B,
						children: [
							"Import ",
							P.size,
							" as draft",
							P.size === 1 ? "" : "s"
						]
					}), /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B,
						children: he.length && !he.every(Vm) && P.size ? "Skip import" : "Next"
					})] }),
					l === "scan" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(p, {
						type: "button",
						onClick: () => void _e(),
						disabled: B,
						children: "Scan again"
					}), /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B || !I || ve.length > 0,
						children: "Next"
					})] }),
					l === "issues" && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: ce,
						disabled: B,
						children: "Next"
					}),
					l === "finish" && e.onOpenPlans && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => {
							a(D.length ? `Onboarded: ${D.join("; ")}.` : void 0), e.onOpenPlans();
						},
						children: "Approve in Specs"
					})
				]
			})
		]
	});
}
function eh(e) {
	let n = l(), r = o(() => Wm(n), [n]), [i, a] = c(!1), [s, u] = c(null), d = t((e) => {
		a(!1), u(e ?? null);
	}, []);
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Y, {
			title: "Onboard a repository",
			className: "mb-2"
		}),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "From a folder to specs ready to approve: mode, GitHub setup, spec import and an issue preview. Each GitHub write asks first."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
			children: jm.map((e, t) => /* @__PURE__ */ x("li", { children: [
				t + 1,
				". ",
				e.title
			] }, e.key))
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-3",
			children: /* @__PURE__ */ b(q, {
				icon: Be,
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
		i && /* @__PURE__ */ b($m, {
			workspaceId: e.workspaceId,
			client: r,
			onChanged: e.onChanged,
			onClose: d,
			onOpenPlans: e.onOpenPlans
		})
	] });
}
// kirocrew-app/ui/src/repository-rows.ts
function th(e, t) {
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
var nh = (e) => e && /^[\w.-]+\/[\w.-]+$/.test(e) ? `https://github.com/${e}` : null, rh = "A repository is a code checkout on this computer. Tasks change its code in their own worktrees and land on its branch. Each workspace keeps its own list.";
function ih() {
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
function ah(e, t) {
	return e.github ? t === "local" ? "Local only mode" : t ? t === "plans-repo" ? "Plans repository mode" : "Single repository mode" : "GitHub, no mode yet" : "Local only";
}
function oh(e) {
	return e.rows.length ? /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"aria-label": "Added repositories",
		"data-repository-list": !0,
		children: e.rows.map((t) => {
			let n = nh(t.github);
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
					/* @__PURE__ */ b(G, { children: ah(t, e.mode) }),
					/* @__PURE__ */ x("span", {
						className: "flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ b(q, {
								icon: De,
								tooltip: `Change ${t.name}'s settings in a dialog`,
								"aria-label": `Edit ${t.name}`,
								onClick: () => e.onEdit(t.key),
								children: "Edit"
							}),
							t.folder && /* @__PURE__ */ b(J, {
								icon: re,
								label: `Open ${t.name} in Finder`,
								onClick: () => e.onReveal(t.folder)
							}),
							n && /* @__PURE__ */ b(ch, {
								href: Z(n),
								name: t.name
							}),
							/* @__PURE__ */ b(An, {
								label: `Remove ${t.name}`,
								tooltip: e.dirty ? "Save or discard your changes first" : t.checkout ? "Stop Avoozl using this checkout. The folder and GitHub stay." : "Drop its GitHub settings from .avoozl.json when you save",
								disabled: e.busy || e.dirty && !!t.checkout,
								confirm: t.checkout ? {
									title: `Remove ${t.name} from this workspace?`,
									body: `Avoozl stops using ${t.folder ?? "this checkout"}: tasks that name ${t.checkout.id} wait until it is added again, and its entry leaves .avoozl.json. The folder${t.github ? `, the GitHub repository ${t.github}` : ""} and your specs are not touched. Avoozl refuses while a run or lock still uses it.`,
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
				children: rh
			}),
			/* @__PURE__ */ b(q, {
				icon: ke,
				primary: !0,
				onClick: e.onAdd,
				children: "Add repository"
			})
		]
	});
}
function sh(e) {
	let t = On(), n = {
		title: `Discard your changes to ${e.name}?`,
		body: "Every edit in this dialog is lost. .avoozl.json stays as it is.",
		action: "Discard changes"
	};
	return /* @__PURE__ */ b($n, {
		id: "avoozl-repo-edit",
		title: e.name,
		unsaved: e.edited && n,
		onDismiss: e.onDiscard,
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
					onClick: () => e.edited ? void t(n).then((t) => t && e.onDiscard()) : e.onDiscard(),
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
function ch({ href: e, name: t }) {
	return /* @__PURE__ */ x(lh, {
		href: Z(e),
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
function lh(e) {
	return /* @__PURE__ */ b(X, {
		text: e.tip,
		children: /* @__PURE__ */ b("a", {
			href: Z(e.href),
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
function uh(e) {
	let t = l(), n = o(() => un(t), [t]), [i, a] = c(""), [s, u] = c(null), [d, f] = c(""), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null);
	r(() => {
		u(null), S(null);
	}, [i]);
	let C = async () => {
		v(!0), S(null);
		try {
			let t = await n.detectRepository(e.workspaceId, i.trim());
			u(t), f(t.id ?? ""), h(t.baseBranch);
		} catch (e) {
			S(K(e));
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
				S(K(e));
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
								/* @__PURE__ */ b(zn, {
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
// kirocrew-app/ui/src/plugins-api.ts
var dh = "Contract version", fh = "Which version of Avoozl's plugin interface this plugin was built for. Not the plugin's own version.", ph = () => ({
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
}), mh = [
	["Where from", "Pick where the plugin’s files are. Open one source and fill it in."],
	["What", "What Avoozl found there. Check it is the plugin you meant."],
	["Applies to", "Declare it on this computer only, or share it with the repository."],
	["Review and approve", "Nothing runs until you approve this exact version."]
], hh = [
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
], gh = (e) => e[e.where].trim(), _h = {
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
	},
	lessons: {
		title: "Lessons pack",
		line: "Retro lessons you preview and import as read-only. Runs no code."
	}
}, vh = (e) => e.provides ?? e.kinds ?? [], yh = (e) => vh(e).map((e) => _h[e]?.title ?? e);
function bh(e) {
	let t = {
		create: 0,
		change: 0,
		keep: 0,
		skip: 0
	};
	for (let n of e) t[n.action]++;
	return t;
}
function xh(e) {
	if (e === void 0) return "";
	let t = typeof e == "string" ? e : JSON.stringify(e);
	return t.length > 80 ? t.slice(0, 77) + "..." : t;
}
var Sh = (e, t, n) => ({
	id: e.id,
	repositories: e.repositories,
	previewHash: e.previewHash,
	acceptLowered: t,
	confirmPublic: n
});
function Ch(e, t, n, r) {
	return e.state === "approved" ? t ? t.changes.some((e) => e.action === "create" || e.action === "change") ? t.warnings.length && !n ? "Accept the who-counts change to import." : e.source === "machine" && !r ? "Confirm that the settings and the plugin id go into .avoozl.json." : null : "Nothing to import: every setting is already the same." : "Avoozl has not previewed the pack yet." : `Approve version ${e.version ?? ""} first. Nothing from the pack applies before that.`;
}
function wh(e) {
	let t = gh(e);
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
function Th(e, t) {
	return {
		...e,
		...t.id ? { id: t.id } : {},
		...t.contract === void 0 ? {} : { contract: String(t.contract) }
	};
}
function Eh(e, t, n) {
	if (!t) return "Avoozl has not looked at the source yet.";
	if (t.error) return t.error;
	if (t.contract !== void 0 && t.supported === !1) return `The plugin is built for contract version ${t.contract}; this Avoozl loads ${n.join(", ") || "1"}.`;
	let r = e.where === "package" ? e.version.trim() : "";
	return r && t.version && r !== t.version ? `The installed package is version ${t.version}, not ${r}. Install ${r} or clear the version.` : null;
}
function Dh(e) {
	return e.where === "path" && /^(?:\/|~|[A-Za-z]:[\\/])/.test(e.path.trim()) ? "A shared folder must be a path inside the repository, written relative to it." : null;
}
function Oh(e, t = !1) {
	let n = e.id.trim();
	if (!/^[a-z][a-z0-9-]{0,60}$/.test(n)) return { error: "Give the plugin a lowercase id." };
	if (n === "local" || n === "github") return { error: `${n} is a built-in route.` };
	let r = gh(e);
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
function kh(e) {
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
var Ah = (e) => !!e.hash && (e.state === "unapproved" || e.state === "changed"), jh = (e) => {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t?.code === "plugin-public-repository" || /publish this plugin/.test(t?.error ?? "") ? String(t.error) : null;
	} catch {
		return null;
	}
};
function Mh(e) {
	let t = async (t, n, r) => (await e.post(ln, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		list: (e) => t("plugins.list", {}, e),
		lessonsPreview: (e, n) => t("plugin.lessons.preview", { id: n }, e),
		lessonsImport: (e, n, r) => t("plugin.lessons.import", {
			id: n,
			previewHash: r
		}, e),
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
var Nh = () => ({
	id: "",
	via: "mcp",
	repository: "",
	labelFields: "",
	assigneeField: "",
	who: "permission",
	minimumPermission: "",
	allowedActors: "",
	scope: "machine"
}), Ph = [
	"read",
	"triage",
	"write",
	"maintain",
	"admin"
], Fh = /^[a-z][a-z0-9-]{0,60}$/, Ih = (e) => e.split(",").map((e) => e.trim()).filter(Boolean);
function Lh(e, t) {
	let n = e.id.trim();
	if (!Fh.test(n)) return {
		error: "Name the source with lowercase letters, digits and dashes.",
		field: "id"
	};
	if (n === "github" || n === "local" || n === "retro") return {
		error: `${n} is built in.`,
		field: "id"
	};
	if (t.includes(n)) return {
		error: `A source named ${n} already exists.`,
		field: "id"
	};
	if (!e.repository.trim()) return {
		error: "Pick the repository its work lands in.",
		field: "repository"
	};
	let r = Ih(e.labelFields), i = e.via !== "mcp", a = i && e.who === "people" ? Ih(e.allowedActors) : [];
	return i && e.who === "people" && !a.length ? {
		error: "Name at least one person, or choose a permission.",
		field: "allowedActors"
	} : {
		id: n,
		entry: {
			via: e.via,
			repository: e.repository.trim(),
			...r.length ? { labelFields: r } : {},
			...e.assigneeField.trim() ? { assigneeField: e.assigneeField.trim() } : {},
			...a.length ? { allowedActors: a } : {},
			...i && e.who === "permission" && e.minimumPermission ? { minimumPermission: e.minimumPermission } : {}
		}
	};
}
function Rh(e) {
	let t = String(e ?? "");
	return t.startsWith("plugin:") ? `Plugin ${t.slice(7)}` : t === "mcp" ? "MCP (a script or cron job sends items)" : t || "Unknown";
}
var zh = (e) => Array.isArray(e) ? e.filter((e) => typeof e == "string") : [];
function Bh(e, t, n = Date.now()) {
	let r = String(e.entry?.via ?? ""), i = r.startsWith("plugin:") ? r.slice(7) : null, a = i ? t.find((e) => e.id === i) : null, o = e.items, s = [];
	i && s.push(e.state?.readAt ? `Polled ${Q(e.state.readAt, n)}${e.state.more ? ", more next tick" : ""}` : "Not polled yet"), o && s.push(`${o.total} item${o.total === 1 ? "" : "s"}, ${o.untriaged} untriaged`), o?.lastAt && s.push(`newest ${Q(o.lastAt, n)}`);
	let c = e.state?.refused?.length ?? 0;
	return c && s.push(`${c} refused`), e.error ? {
		tone: "error",
		label: "Not used",
		facts: s,
		problem: e.error
	} : a && a.state !== "approved" ? {
		tone: "off",
		label: "Off",
		facts: s,
		problem: `Plugin ${i} is ${kh(a).label.toLowerCase()}. Turn it on in its plugin card above.`
	} : e.state?.error ? {
		tone: "error",
		label: "Error",
		facts: s,
		problem: e.state.error
	} : i ? e.state?.readAt ? {
		tone: "ok",
		label: "On",
		facts: s,
		problem: null
	} : {
		tone: "waiting",
		label: "Waiting",
		facts: s,
		problem: null
	} : o?.total ? {
		tone: "ok",
		label: "On",
		facts: s,
		problem: null
	} : {
		tone: "waiting",
		label: "No item yet",
		facts: s,
		problem: null
	};
}
function Vh(e, t) {
	let n = String(e.entry?.via ?? "");
	if (!n.startsWith("plugin:")) return {
		level: "Untriaged only",
		line: "Rules can only pause or quarantine its items. You start work with Plan this or Deliver this."
	};
	let r = n.slice(7), i = t.find((e) => e.id === r);
	return i && !i.capabilities?.tracker?.includes("actor") ? {
		level: "No rules",
		line: `Plugin ${r} can't say who acted, so no rule runs. Items wait in Untriaged.`
	} : {
		level: "Full rules",
		line: "Its rules can start, deliver, pause or quarantine work, when the person who acted counts."
	};
}
function Hh(e) {
	if (!e || e.via === "mcp") return "Not used: an MCP caller is you";
	let t = zh(e.allowedActors), n = typeof e.minimumPermission == "string" ? e.minimumPermission : null;
	return t.length ? `${t.join(", ")}${n ? `, or anyone with ${n} or higher` : ""}` : `Anyone with ${n ?? "write"} or higher${n ? "" : " (default)"}`;
}
var Uh = (e) => zh(e).join(", ");
function Wh(e) {
	let t = async (t, n, r) => (await e.post(ln, {
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
function Gh(e) {
	let t = (t) => e.rows.filter((e) => e.action === t).length;
	return `Version ${e.version}: ${t("add")} new, ${t("change")} changed, ${t("keep")} unchanged, ${t("retire")} retired.`;
}
// kirocrew-app/ui/src/PackImport.tsx
var Kh = {
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
function qh({ preview: e }) {
	let t = bh(e.changes);
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
								children: /* @__PURE__ */ b(G, {
									variant: e.warning ? "warning" : Kh[e.action].variant,
									children: Kh[e.action].label
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
										children: ["was ", /* @__PURE__ */ b("code", { children: xh(e.from) })]
									}),
									/* @__PURE__ */ b("code", { children: xh(e.to) }),
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
function Jh(e) {
	let { row: n, workspaceId: i, client: a, onClose: o, onChanged: l } = e, [u, d] = c(null), [f, m] = c(!1), [h, g] = c(!1), [_, v] = c(!1), [y, S] = c(null), C = s(null), w = t(() => o(), [o]);
	r(() => {
		let e = !0;
		return a.packPreview(i, n.id ?? "").then((t) => e && d(t)).catch((t) => e && S(K(t))), () => {
			e = !1;
		};
	}, [
		a,
		i,
		n.id
	]), r(() => {
		C.current?.querySelector("button")?.focus();
	}, []);
	let T = Ch(n, u, f, h), E = async () => {
		if (u && !T) {
			v(!0), S(null);
			try {
				await a.packImport(i, Sh(u, f, h)), await l(), o(`Imported ${n.id} version ${n.version} into .avoozl.json.`);
			} catch (e) {
				S(K(e));
			} finally {
				v(!1);
			}
		}
	};
	return /* @__PURE__ */ x($n, {
		id: "avoozl-pack",
		width: "48rem",
		backLabel: "Cancel",
		boxRef: C,
		attrs: { "data-pack-dialog": !0 },
		onDismiss: w,
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
			u ? /* @__PURE__ */ b(qh, { preview: u }) : !y && /* @__PURE__ */ b("p", {
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
	});
}
// kirocrew-app/ui/src/AddPlugin.tsx
var Yh = {
	path: ne,
	package: Te,
	git: oe
};
function Xh(e) {
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
var Zh = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Qh({ form: e, set: t }) {
	let n = {
		path: /* @__PURE__ */ b(Xh, {
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
			children: [/* @__PURE__ */ b(Xh, {
				label: "Package name",
				marker: "required",
				raw: "package",
				children: /* @__PURE__ */ b(g, {
					value: e.package,
					placeholder: "@example/avoozl-tracker",
					onChange: (e) => t({ package: e.target.value })
				})
			}), /* @__PURE__ */ b(Xh, {
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
				/* @__PURE__ */ b(Xh, {
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
					children: [/* @__PURE__ */ b(Xh, {
						label: "Tag, branch or commit",
						marker: "required",
						raw: "ref",
						children: /* @__PURE__ */ b(g, {
							value: e.ref,
							placeholder: "v1.0.0",
							onChange: (e) => t({ ref: e.target.value })
						})
					}), /* @__PURE__ */ b(Xh, {
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
		children: /* @__PURE__ */ b($f, {
			name: "avoozl-plugin-source",
			label: "Where from",
			value: e.where,
			onChange: (e) => t({ where: e }),
			sections: hh.map((e) => ({
				key: e.key,
				title: e.title,
				line: e.line,
				icon: Yh[e.key],
				fields: n[e.key]
			}))
		})
	});
}
function $h(e) {
	let { form: t, preview: n, set: r } = e, i = n.contract !== void 0, a = n.capabilities ? Object.entries(n.capabilities).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; ") || "none" : void 0, o = [
		["Source", `${hh.find((e) => e.key === t.where)?.title}: ${gh(t)}${t.where === "git" ? ` at ${t.ref}` : ""}`],
		["Commit found", n.commit],
		["Version", n.version],
		["Parts", n.provides || n.kinds ? yh(n).join(", ") : void 0],
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
			/* @__PURE__ */ b(Xh, {
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
			/* @__PURE__ */ b(Xh, {
				label: dh,
				marker: "required",
				raw: "contract",
				hint: i ? `From the plugin’s own avoozl-plugin.json. ${fh}` : fh,
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
						...Zh,
						maxWidth: "8rem"
					},
					children: e.supported.map((e) => /* @__PURE__ */ b("option", {
						value: String(e),
						children: e
					}, e))
				})
			}),
			/* @__PURE__ */ b(Xh, {
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
function eg(e) {
	let { form: t } = e, n = Dh(t), r = t.where === "git" ? "Written to .avoozl.json. Each computer fetches the commit with Update, then approves it." : t.where === "package" ? "Written to .avoozl.json. Each computer installs the package, then approves it." : "Written to .avoozl.json. Each computer approves it for itself.", i = (e, t, n) => /* @__PURE__ */ x("div", {
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
		children: /* @__PURE__ */ b($f, {
			name: "avoozl-plugin-scope",
			label: "Applies to",
			value: t.scope,
			onChange: (t) => {
				e.set({ scope: t }), e.setConfirmPublic(!1);
			},
			sections: [{
				key: "machine",
				icon: ge,
				title: "This computer only",
				line: "Saved in this computer’s Avoozl settings. Nothing goes into the repository.",
				description: i("Only this computer runs it, after you approve it here.", "you are trying it, or its name is private.", "Others on the repository do not see it or run it.")
			}, {
				key: "repository",
				icon: ze,
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
function tg(e) {
	let { workspaceId: n, client: i, onClose: a, onChanged: o } = e, l = e.supported.length ? e.supported : [1], [u, d] = c(0), [f, m] = c(ph()), [h, g] = c(null), [_, v] = c(null), [y, S] = c(null), [C, w] = c(!1), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = (e) => {
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
	r(() => {
		k.current?.querySelector("summary, input:not([disabled]), button")?.focus();
	}, [u]);
	let M = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(K(e));
		} finally {
			E(!1);
		}
	}, N = () => M(async () => {
		if (!gh(f)) throw Error(f.where === "path" ? "Name the plugin folder." : f.where === "git" ? "Give the git URL." : "Name the package.");
		if (f.where === "git" && !f.ref.trim()) throw Error("Give a tag, branch or commit.");
		let e = await i.preview(n, wh(f));
		if (e.error) throw Error(e.error);
		g(e), m((t) => Th(t, e)), d(1);
	}), P = () => M(async () => {
		let e = Oh(f, C);
		if (!e.input) throw Error(e.error ?? "Check the form.");
		try {
			let t = await i.add(n, e.input);
			v(t), t.pack && t.id && S(await i.packPreview(n, t.id).catch(() => null));
		} catch (e) {
			let t = jh(e);
			throw t ? Error(`${t} Tick the box to share it anyway.`) : e;
		}
		await o(), d(3);
	}), F = () => M(async () => {
		_ && (await i.approve(n, _), await o(), a(`Approved ${_.id} version ${_.version}.`));
	}), I = u === 1 ? Eh(f, h, l) : null;
	return /* @__PURE__ */ x($n, {
		id: "avoozl-plugin",
		width: "40rem",
		backLabel: "Cancel",
		describedBy: "avoozl-plugin-line",
		boxRef: k,
		attrs: { "data-plugin-dialog": u },
		unsaved: (!!_ || u > 0 || JSON.stringify(f) !== JSON.stringify(ph())) && {
			title: "Stop adding this plugin?",
			body: _ ? `${_.id} is removed again. Nothing ran.` : "What you entered is lost.",
			action: "Stop"
		},
		onDismiss: j,
		children: [
			/* @__PURE__ */ b("ol", {
				className: "flex flex-wrap gap-2 text-xs",
				"aria-label": "Steps",
				children: mh.map(([e], t) => /* @__PURE__ */ x("li", {
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
				children: mh[u][0]
			}), /* @__PURE__ */ b("p", {
				id: "avoozl-plugin-line",
				className: "text-sm text-muted",
				children: mh[u][1]
			})] }),
			u === 0 && /* @__PURE__ */ b(Qh, {
				form: f,
				set: A
			}),
			u === 1 && h && /* @__PURE__ */ b($h, {
				form: f,
				preview: h,
				supported: l,
				set: A,
				problem: I
			}),
			u === 2 && /* @__PURE__ */ b(eg, {
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
						}), /* @__PURE__ */ b(G, {
							variant: kh(_).attention ? "warning" : void 0,
							children: kh(_).label
						})]
					}),
					_.reason && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: _.reason
					}),
					/* @__PURE__ */ b(Fg, { row: _ }),
					/* @__PURE__ */ b(Pg, { row: _ }),
					y && /* @__PURE__ */ x("div", {
						className: "flex flex-col gap-1",
						children: [
							/* @__PURE__ */ b("h4", {
								className: "text-sm font-semibold",
								children: "Settings pack"
							}),
							/* @__PURE__ */ b(qh, { preview: y }),
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
							let e = Oh(f);
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
					u === 3 && _ && Ah(_) && /* @__PURE__ */ x(p, {
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
					u === 3 && _ && !Ah(_) && /* @__PURE__ */ b(p, {
						type: "button",
						primary: !0,
						onClick: () => a(`Added ${_.id}. It can't be approved yet: ${_.reason ?? kh(_).label}.`),
						children: "Keep it unapproved"
					})
				]
			})
		]
	});
}
function ng(e) {
	let [n, r] = c(!1), [i, a] = c(null), o = t((e) => {
		r(!1), a(e ?? null);
	}, []);
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Y, {
			title: "Add plugin",
			className: "mb-2"
		}),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "Four steps. Nothing runs or imports until you approve its exact version."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-col gap-1 text-xs",
			children: mh.map(([e, t], n) => /* @__PURE__ */ x("li", {
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
			children: /* @__PURE__ */ b(q, {
				icon: ke,
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
		n && /* @__PURE__ */ b(tg, {
			workspaceId: e.workspaceId,
			client: e.client,
			supported: e.supported,
			onChanged: e.onChanged,
			onClose: o
		})
	] });
}
// kirocrew-app/ui/src/IntakeSources.tsx
var rg = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, ig = { borderColor: "var(--border)" }, ag = {
	ok: "success",
	off: void 0,
	error: "danger",
	waiting: "info"
}, og = {
	machine: "This computer only",
	repository: "Shared with the repo"
}, sg = {
	machine: "Saved in this computer's Avoozl settings. Nobody else sees it.",
	repository: "Saved in the repo's .avoozl.json, so everyone with the repo gets it."
};
function cg({ label: e, raw: t, children: n }) {
	return /* @__PURE__ */ x("div", {
		className: "contents",
		children: [/* @__PURE__ */ x("dt", {
			className: "text-muted",
			children: [e, t && /* @__PURE__ */ b("code", {
				className: "ml-1 text-[11px]",
				children: t
			})]
		}), /* @__PURE__ */ b("dd", {
			className: "m-0 min-w-0",
			style: { overflowWrap: "anywhere" },
			children: n
		})]
	});
}
function lg({ children: e }) {
	let t = Xe("(max-width: 767px)");
	return /* @__PURE__ */ b("dl", {
		className: "mt-2 grid gap-x-4 text-xs",
		style: {
			gridTemplateColumns: t ? "minmax(0, 1fr)" : "13rem minmax(0, 1fr)",
			rowGap: t ? 2 : 4
		},
		"data-intake-facts": !0,
		children: e
	});
}
function ug(e) {
	let t = `avoozl-intake-${e.id}`;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("article", {
		"aria-labelledby": t,
		className: "rounded-lg border p-3",
		style: ig,
		...e.attrs,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ b("h4", {
					id: t,
					className: "m-0 text-sm font-semibold",
					style: { overflowWrap: "anywhere" },
					children: e.title
				}), e.badges]
			}),
			/* @__PURE__ */ b("p", {
				className: "mt-1 text-xs text-muted",
				"data-intake-status": !0,
				children: e.status
			}),
			e.problem && /* @__PURE__ */ x("p", {
				className: "mt-1 flex items-start gap-1.5 text-xs text-danger",
				"data-intake-problem": !0,
				children: [/* @__PURE__ */ b(P, {
					size: 14,
					"aria-hidden": "true",
					style: {
						flex: "none",
						marginTop: 1
					}
				}), /* @__PURE__ */ x("span", { children: [
					/* @__PURE__ */ x("span", {
						className: "font-semibold",
						children: [e.problem.kind, ":"]
					}),
					" ",
					e.problem.text
				] })]
			}),
			e.children,
			e.actions && /* @__PURE__ */ b("div", {
				className: "mt-3 flex flex-wrap justify-end gap-2",
				children: e.actions
			})
		]
	}) });
}
function dg({ scope: e }) {
	return /* @__PURE__ */ b(X, {
		text: sg[e],
		children: /* @__PURE__ */ b("span", {
			tabIndex: 0,
			className: "inline-flex",
			children: /* @__PURE__ */ b(G, { children: og[e] })
		})
	});
}
function fg({ github: e, onOpen: t }) {
	let n = Date.now(), r = e.repositories.filter((e) => e.error), i = e.repositories.map((e) => e.checkedAt).filter((e) => !!e).sort(), a = !!e.mode, o = a ? [i.length ? `Read ${Q(i[0], n)}` : "Not read yet", e.items ? `${e.items.total} items, ${e.items.untriaged} untriaged` : null].filter(Boolean).join(" · ") : "Off: no GitHub mode is set for this workspace.";
	return /* @__PURE__ */ b(ug, {
		id: "github",
		title: "GitHub",
		badges: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(G, { children: "Built in" }), /* @__PURE__ */ b(G, {
			variant: a ? r.length ? "danger" : "success" : void 0,
			children: a ? r.length ? "Error" : "On" : "Off"
		})] }),
		status: o,
		problem: r.length ? {
			kind: "Last error",
			text: r.map((e) => `${e.repository}: ${e.error}`).join(" ")
		} : null,
		attrs: { "data-intake-source-row": "github" },
		actions: t ? /* @__PURE__ */ b(q, {
			icon: Ie,
			onClick: t,
			tooltip: "Its mode, repositories and trigger rules are set there",
			children: "Open GitHub settings"
		}) : void 0,
		children: /* @__PURE__ */ x(lg, { children: [
			/* @__PURE__ */ b(cg, {
				label: "Mode",
				children: e.mode ?? "None"
			}),
			/* @__PURE__ */ b(cg, {
				label: "Repositories",
				children: e.repositories.map((e) => e.repository).join(", ") || "None read yet"
			}),
			/* @__PURE__ */ b(cg, {
				label: "Can trigger",
				children: a ? "Full rules: each repository's trigger rules, for people with its minimum permission." : "Nothing until a GitHub mode is set."
			})
		] })
	});
}
function pg({ row: e, plugins: t, busy: n, onRemove: r }) {
	let i = e.entry ?? {}, a = Bh(e, t), o = Vh(e, t), s = e.id ?? "unreadable";
	return /* @__PURE__ */ b(ug, {
		id: `source-${s}`,
		title: e.id ?? "Unreadable entry",
		badges: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(dg, { scope: e.scope }), /* @__PURE__ */ b(G, {
			variant: ag[a.tone],
			children: a.label
		})] }),
		status: a.facts.join(" · "),
		problem: a.problem ? {
			kind: a.tone === "off" ? "Off" : e.error ? "Not used" : "Last error",
			text: a.problem
		} : null,
		attrs: {
			"data-intake-source-row": e.id ?? "",
			"data-tone": a.tone
		},
		actions: e.id ? /* @__PURE__ */ b(An, {
			icon: Re,
			label: `Remove intake source ${e.id}`,
			disabled: n,
			confirm: {
				title: `Remove intake source ${e.id}?`,
				body: `Avoozl stops reading ${e.id}. Items it already brought in stay in Intake, and their tasks are not touched.`,
				action: "Remove source"
			},
			onConfirm: r,
			children: "Remove"
		}) : void 0,
		children: /* @__PURE__ */ x(lg, { children: [
			/* @__PURE__ */ b(cg, {
				label: "Comes from",
				raw: "via",
				children: Rh(i.via)
			}),
			/* @__PURE__ */ b(cg, {
				label: "Work lands in",
				raw: "repository",
				children: String(i.repository ?? "")
			}),
			/* @__PURE__ */ x(cg, {
				label: "Can trigger",
				children: [
					/* @__PURE__ */ x("span", {
						className: "font-semibold",
						children: [o.level, "."]
					}),
					" ",
					o.line
				]
			}),
			/* @__PURE__ */ b(cg, {
				label: "Who counts",
				raw: i.via === "mcp" ? void 0 : i.allowedActors ? "allowedActors" : "minimumPermission",
				children: Hh(e.entry)
			}),
			Uh(i.labelFields) && /* @__PURE__ */ b(cg, {
				label: "Fields as labels",
				raw: "labelFields",
				children: Uh(i.labelFields)
			}),
			typeof i.assigneeField == "string" && /* @__PURE__ */ b(cg, {
				label: "Assignee field",
				raw: "assigneeField",
				children: i.assigneeField
			}),
			e.state?.cursor && /* @__PURE__ */ b(cg, {
				label: "Next poll from",
				raw: "cursor",
				children: /* @__PURE__ */ b("code", { children: e.state.cursor })
			})
		] })
	});
}
function mg(e) {
	let t = [e.hint ? `${e.id}-hint` : "", `${e.id}-raw`].filter(Boolean).join(" ");
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ x("label", {
					htmlFor: e.id,
					className: "text-sm font-medium",
					children: [
						e.label,
						" ",
						/* @__PURE__ */ x("span", {
							className: "text-xs font-normal text-muted",
							children: [
								"(",
								e.marker,
								")"
							]
						})
					]
				}), /* @__PURE__ */ b("code", {
					id: `${e.id}-raw`,
					className: "text-[11px] text-muted",
					children: e.raw
				})]
			}),
			e.children(t),
			e.hint && /* @__PURE__ */ b("span", {
				id: `${e.id}-hint`,
				className: "text-xs text-muted",
				children: e.hint
			})
		]
	});
}
function hg({ legend: e, children: t }) {
	return /* @__PURE__ */ x("fieldset", {
		className: "m-0 flex min-w-0 flex-col gap-3 border-0 p-0",
		children: [/* @__PURE__ */ b("legend", {
			className: "mb-1 p-0 text-sm font-semibold",
			children: e
		}), t]
	});
}
function gg(e) {
	let [t, n] = c(Nh), [r, i] = c(!1), [a, o] = c(!1), [s, l] = c(null), u = (e) => n({
		...t,
		...e
	}), d = e.plugins.filter((e) => e.id && e.capabilities?.tracker?.includes("poll")), f = t.via !== "mcp", m = JSON.stringify(t) !== JSON.stringify(Nh()), h = (e) => s?.field === e || void 0, _ = () => {
		let n = Lh(t, e.taken);
		n.error || !n.id || !n.entry ? (l({
			text: n.error ?? "Check the fields.",
			field: n.field
		}), n.field && document.getElementById(`intake-${n.field}`)?.focus()) : t.scope === "repository" && !r ? (l({
			text: "Tick the box to share this source in .avoozl.json.",
			field: "scope"
		}), document.getElementById("intake-confirm-public")?.focus()) : (o(!0), l(null), e.onAdd({
			id: n.id,
			entry: n.entry
		}, t, r).then(e.onClose).catch((e) => l({ text: K(e) })).finally(() => o(!1)));
	}, v = [...d.map((t) => {
		let n = Vh({
			id: null,
			scope: "machine",
			error: null,
			entry: { via: `plugin:${t.id}` }
		}, e.plugins);
		return {
			key: `plugin:${t.id}`,
			title: `Plugin ${t.id}`,
			line: `Avoozl polls it on each tick.${t.state === "approved" ? "" : " The plugin is off until you approve or enable it."}`,
			description: /* @__PURE__ */ x("p", {
				className: "text-xs",
				children: [
					/* @__PURE__ */ x("span", {
						className: "font-semibold",
						children: [n.level, "."]
					}),
					" ",
					n.line
				]
			})
		};
	}), {
		key: "mcp",
		title: "MCP",
		line: "A script or cron job sends items through Avoozl's MCP tools.",
		description: /* @__PURE__ */ x("p", {
			className: "text-xs",
			children: [/* @__PURE__ */ b("span", {
				className: "font-semibold",
				children: "Untriaged only."
			}), " Rules can only pause or quarantine its items. You start work with Plan this or Deliver this."]
		})
	}];
	return /* @__PURE__ */ b($n, {
		id: "avoozl-intake-add",
		title: "Add an intake source",
		width: "40rem",
		onDismiss: e.onClose,
		unsaved: m ? {
			title: "Discard this source?",
			body: "What you typed is lost.",
			action: "Discard"
		} : null,
		backLabel: "Close Add an intake source",
		attrs: { "data-intake-source-add": !0 },
		footer: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-2",
			children: [s && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "m-0 text-xs text-danger",
				children: s.text
			}), /* @__PURE__ */ x("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [/* @__PURE__ */ b(p, {
					type: "button",
					onClick: e.onClose,
					disabled: a,
					children: "Cancel"
				}), /* @__PURE__ */ b(q, {
					icon: ke,
					primary: !0,
					onClick: _,
					disabled: a,
					children: "Add source"
				})]
			})]
		}),
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-5",
			children: [
				/* @__PURE__ */ x(hg, {
					legend: "Source",
					children: [/* @__PURE__ */ b(mg, {
						id: "intake-id",
						label: "Name",
						marker: "required",
						raw: "intake.sources.<id>",
						hint: "Lowercase letters, digits and dashes. Rules match it with source:<name>.",
						children: (e) => /* @__PURE__ */ b(g, {
							id: "intake-id",
							value: t.id,
							onChange: (e) => u({ id: e.target.value }),
							placeholder: "e.g. tickets",
							"aria-describedby": e,
							"aria-invalid": h("id"),
							style: {
								width: "20ch",
								maxWidth: "100%"
							}
						})
					}), /* @__PURE__ */ b(mg, {
						id: "intake-repository",
						label: "Work lands in",
						marker: "required",
						raw: "repository",
						hint: "Its rules apply, and a delivered item's task lands there.",
						children: (n) => /* @__PURE__ */ x("select", {
							id: "intake-repository",
							className: "rounded-md border px-2 py-1 text-sm",
							style: {
								...rg,
								width: "fit-content"
							},
							value: t.repository,
							onChange: (e) => u({ repository: e.target.value }),
							"aria-describedby": n,
							"aria-invalid": h("repository"),
							children: [/* @__PURE__ */ b("option", {
								value: "",
								children: "Pick a repository"
							}), e.repositories.map((e) => /* @__PURE__ */ b("option", {
								value: e.github ?? e.id,
								children: e.github ?? e.id
							}, e.id))]
						})
					})]
				}),
				/* @__PURE__ */ x(hg, {
					legend: "Comes from (required)",
					children: [/* @__PURE__ */ b($f, {
						name: "intake-via",
						label: "Comes from",
						value: t.via,
						onChange: (e) => u({ via: e }),
						sections: v
					}), !d.length && /* @__PURE__ */ b("p", {
						className: "m-0 text-xs text-muted",
						children: "No plugin with poll is installed. Add one above to poll a tracker."
					})]
				}),
				/* @__PURE__ */ x(hg, {
					legend: "Item fields",
					children: [/* @__PURE__ */ b(mg, {
						id: "intake-labelFields",
						label: "Fields as labels",
						marker: "optional",
						raw: "labelFields",
						hint: "Comma list. Each adds a field:value label before rules match.",
						children: (e) => /* @__PURE__ */ b(g, {
							id: "intake-labelFields",
							value: t.labelFields,
							onChange: (e) => u({ labelFields: e.target.value }),
							placeholder: "none",
							"aria-describedby": e,
							style: {
								width: "28ch",
								maxWidth: "100%"
							}
						})
					}), /* @__PURE__ */ b(mg, {
						id: "intake-assigneeField",
						label: "Assignee field",
						marker: "optional",
						raw: "assigneeField",
						hint: "The item field that names who it's assigned to.",
						children: (e) => /* @__PURE__ */ b(g, {
							id: "intake-assigneeField",
							value: t.assigneeField,
							onChange: (e) => u({ assigneeField: e.target.value }),
							placeholder: "none",
							"aria-describedby": e,
							style: {
								width: "20ch",
								maxWidth: "100%"
							}
						})
					})]
				}),
				f && /* @__PURE__ */ b(hg, {
					legend: "Who counts (optional)",
					children: /* @__PURE__ */ b($f, {
						name: "intake-who",
						label: "Who counts",
						value: t.who,
						onChange: (e) => u({ who: e }),
						sections: [{
							key: "permission",
							title: "People with a permission",
							line: "The standing the plugin reports for the person who acted.",
							fields: /* @__PURE__ */ b(mg, {
								id: "intake-minimumPermission",
								label: "At least",
								marker: "optional",
								raw: "minimumPermission",
								children: (e) => /* @__PURE__ */ x("select", {
									id: "intake-minimumPermission",
									className: "rounded-md border px-2 py-1 text-sm",
									style: {
										...rg,
										width: "fit-content"
									},
									value: t.minimumPermission,
									onChange: (e) => u({ minimumPermission: e.target.value }),
									"aria-describedby": e,
									children: [/* @__PURE__ */ x("option", {
										value: "",
										children: ["write", " (default)"]
									}), Ph.map((e) => /* @__PURE__ */ b("option", {
										value: e,
										children: e
									}, e))]
								})
							})
						}, {
							key: "people",
							title: "Only named people",
							line: "Only these people can set off a rule.",
							fields: /* @__PURE__ */ b(mg, {
								id: "intake-allowedActors",
								label: "People",
								marker: "required",
								raw: "allowedActors",
								hint: "Comma list of names, as the plugin reports them.",
								children: (e) => /* @__PURE__ */ b(g, {
									id: "intake-allowedActors",
									value: t.allowedActors,
									onChange: (e) => u({ allowedActors: e.target.value }),
									placeholder: "e.g. sam, riley",
									"aria-describedby": e,
									"aria-invalid": h("allowedActors"),
									style: {
										width: "28ch",
										maxWidth: "100%"
									}
								})
							})
						}]
					})
				}),
				/* @__PURE__ */ b(hg, {
					legend: "Saved in (required)",
					children: /* @__PURE__ */ b($f, {
						name: "intake-scope",
						label: "Saved in",
						value: t.scope,
						onChange: (e) => u({ scope: e }),
						sections: [{
							key: "machine",
							title: og.machine,
							line: sg.machine
						}, {
							key: "repository",
							title: og.repository,
							line: sg.repository,
							fields: /* @__PURE__ */ x("label", {
								className: "inline-flex items-start gap-2 text-xs",
								"data-intake-public-warning": !0,
								children: [/* @__PURE__ */ b("input", {
									id: "intake-confirm-public",
									type: "checkbox",
									checked: r,
									onChange: (e) => i(e.target.checked),
									"aria-invalid": h("scope"),
									style: { marginTop: 2 }
								}), /* @__PURE__ */ b("span", { children: ".avoozl.json may be public. Saving there publishes this source's name and plugin. I understand." })]
							})
						}]
					})
				})
			]
		})
	});
}
function _g({ workspaceId: e, plugins: n, onOpenGitHub: r }) {
	let i = l(), a = o(() => Wh(i), [i]), { value: s, error: u, reload: d } = da(e, t((e) => a.list(e), [a])), f = o(() => un(i), [i]), { value: p } = da(e, t((e) => f.repositories(e), [f])), [g, _] = c(!1), [v, y] = c(!1), [S, C] = c(null), w = s?.sources ?? [], T = (t) => {
		y(!0), C(null), a.remove(e, t).then(() => d()).catch((e) => C(K(e))).finally(() => y(!1));
	}, E = /* @__PURE__ */ b(q, {
		icon: ke,
		primary: !w.length,
		onClick: () => _(!0),
		disabled: v,
		children: "Add a source"
	});
	return /* @__PURE__ */ x("section", {
		"data-intake-sources": !0,
		"aria-labelledby": "avoozl-intake-title",
		children: [/* @__PURE__ */ x(m, { children: [
			/* @__PURE__ */ b(Y, {
				id: "avoozl-intake-title",
				title: "Intake sources",
				actions: w.length ? E : void 0,
				blurb: "Where work comes in. Items show in the Intake tab. Avoozl writes nothing back to a source.",
				className: "mb-3"
			}),
			u || S ? /* @__PURE__ */ b("p", {
				role: "alert",
				className: "mb-2 text-xs text-danger",
				children: u ?? S
			}) : null,
			/* @__PURE__ */ x("ul", {
				className: "m-0 flex list-none flex-col gap-3 p-0",
				"aria-label": "Intake sources",
				children: [s?.github && /* @__PURE__ */ b(fg, {
					github: s.github,
					onOpen: r
				}), w.map((e, t) => /* @__PURE__ */ b(pg, {
					row: e,
					plugins: n,
					busy: v,
					onRemove: () => T(e)
				}, `${e.id}-${e.scope}-${t}`))]
			}),
			s && !w.length && /* @__PURE__ */ b("div", {
				className: "mt-3 rounded-lg border p-3",
				style: {
					...ig,
					borderStyle: "dashed"
				},
				"data-intake-empty": !0,
				children: /* @__PURE__ */ b(h, {
					title: "No other source yet",
					subtitle: "Add one to poll a tracker plugin, or to take items a script or cron job sends through MCP.",
					action: E
				})
			})
		] }), g && /* @__PURE__ */ b(gg, {
			plugins: n,
			repositories: p ?? [],
			taken: w.flatMap((e) => e.id ? [e.id] : []),
			onClose: () => _(!1),
			onAdd: async (t, n, r) => {
				await a.add(e, {
					id: t.id,
					entry: t.entry,
					scope: n.scope,
					confirmPublic: r
				}), await d();
			}
		})]
	});
}
// kirocrew-app/ui/src/CitedFile.tsx
var vg = "avoozl-cited", yg = "\n[data-cited=\"true\"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }\n";
function bg(e) {
	return e.getAttribute("role") === "heading" ? `h${e.getAttribute("aria-level") ?? "6"}` : e.tagName.toLowerCase();
}
function xg(e, t, n, r, i = e) {
	let a = [...e.querySelectorAll("[data-line]")];
	for (let e of a) e.classList.remove(vg), delete e.dataset.cited;
	let o = pi(a.map((e) => ({
		line: Number(e.dataset.line),
		tag: bg(e)
	})), t, n).map((e) => a[e]);
	for (let e of o) e.classList.add(vg), e.dataset.cited = "true";
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
function Sg(e) {
	let t = s(null), n = Xe("(prefers-reduced-motion: reduce)"), { text: i, lineStart: a, lineEnd: o } = e;
	return r(() => {
		let e = t.current;
		if (!e) return;
		let r = requestAnimationFrame(() => xg(e, a, o, n));
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
		children: [/* @__PURE__ */ b("style", { children: yg }), /* @__PURE__ */ b(Rs, {
			text: i,
			idPrefix: e.idPrefix
		})]
	});
}
// kirocrew-app/ui/src/DocumentReader.tsx
var Cg = "avoozl-reader";
function wg(e) {
	let { workspaceId: n, target: i, onClose: a, text: u } = e, d = l(), f = o(() => mi(d), [d]), p = ih(), m = Xe("(max-width: 767px)"), h = Xe("(prefers-reduced-motion: reduce)"), [g, _] = c({
		text: null,
		error: null
	}), [v, S] = c(null), [, C] = c(0), w = s(null), T = s(null);
	r(() => {
		let e = !0;
		return u === void 0 ? f.document(n, i.document).then((t) => e && _({
			text: t.text,
			error: null
		}), (t) => e && _({
			text: null,
			error: K(t)
		})) : _({
			text: u,
			error: null
		}), Xi(d).languages(n).then((t) => {
			Os(t.languages), e && C((e) => e + 1);
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
	let E = t(() => {
		let e = T.current;
		e && i.lineStart && xg(e, i.lineStart, i.lineEnd, h);
	}, [
		i.lineStart,
		i.lineEnd,
		h
	]);
	r(() => {
		if (g.text === null) return;
		let e = requestAnimationFrame(E);
		return () => cancelAnimationFrame(e);
	}, [g.text, E]), r(() => {
		w.current?.focus();
	}, []);
	let D = async () => {
		try {
			await navigator.clipboard.writeText(i.document), S(`Copied ${i.document}.`);
		} catch {
			S(`Could not copy. The path is ${i.document}`);
		}
	}, O = async () => {
		if (!di(i.document)) return S("This path is outside the workspace, so it is not opened.");
		try {
			let e = (await un(d).list()).items.find((e) => e.id === n)?.root;
			if (!e) return S("The workspace folder is not known here.");
			S(await p(`${e.replace(/\/$/, "")}/${i.document}`));
		} catch (e) {
			S(K(e));
		}
	}, k = g.text ? bs(g.text, Cg, 3) : [], A = ui(i), j = (e) => w.current?.querySelector(`#${CSS.escape(e)}`)?.scrollIntoView?.({
		block: "start",
		behavior: h ? "auto" : "smooth"
	});
	return /* @__PURE__ */ x($n, {
		id: "avoozl-reader",
		plain: !0,
		width: "78rem",
		height: "90vh",
		backLabel: "Close the file",
		boxRef: w,
		attrs: { "data-document-reader": !0 },
		onDismiss: a,
		children: [/* @__PURE__ */ x("div", {
			className: "border-b px-4 py-2.5",
			style: { borderColor: "var(--border)" },
			children: [/* @__PURE__ */ b(Y, {
				id: "avoozl-reader-title",
				title: /* @__PURE__ */ b("code", { children: i.document }),
				actions: /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ b(J, {
						icon: z,
						label: "Copy path",
						tooltip: `Copy ${i.document}`,
						onClick: () => void D()
					}),
					u === void 0 && /* @__PURE__ */ b(J, {
						icon: re,
						label: "Reveal in Finder",
						tooltip: "Show this file in Finder",
						onClick: () => void O()
					}),
					/* @__PURE__ */ b(q, {
						icon: Ve,
						onClick: a,
						"aria-label": "Close the file",
						children: "Close"
					})
				] }),
				blurb: A && /* @__PURE__ */ b(X, {
					text: `Scroll back to ${A.toLowerCase()}`,
					children: (e) => /* @__PURE__ */ b("button", {
						type: "button",
						className: "text-xs text-muted hover:underline",
						onClick: E,
						"aria-describedby": e,
						children: A
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
			ref: m ? T : void 0,
			children: [k.length > 0 && (m ? /* @__PURE__ */ x("details", {
				className: "border-b px-4 py-2 text-sm",
				style: { borderColor: "var(--border)" },
				children: [/* @__PURE__ */ b("summary", {
					className: "cursor-pointer font-medium",
					children: "Outline"
				}), /* @__PURE__ */ b(Tg, {
					headings: k,
					onJump: j
				})]
			}) : /* @__PURE__ */ x("nav", {
				"aria-label": "File outline",
				className: "overflow-y-auto border-r px-3 py-3 text-sm",
				style: { borderColor: "var(--border)" },
				children: [/* @__PURE__ */ b("h4", {
					className: "text-xs font-semibold uppercase tracking-wide text-muted",
					children: "Outline"
				}), /* @__PURE__ */ b(Tg, {
					headings: k,
					onJump: j
				})]
			})), /* @__PURE__ */ b("div", {
				ref: m ? void 0 : T,
				className: "min-w-0 px-5 py-4",
				style: m ? void 0 : {
					overflowY: "auto",
					gridColumn: k.length ? void 0 : "1 / -1"
				},
				"aria-label": `Contents of ${i.document}`,
				children: g.error ? /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: g.error
				}) : g.text === null ? /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Reading…"
				}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("style", { children: yg }), /* @__PURE__ */ b(Rs, {
					text: g.text,
					idPrefix: Cg,
					measure: cl
				})] })
			})]
		})]
	});
}
function Tg(e) {
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
// kirocrew-app/ui/src/design-chat.ts
var Eg = "docs/plugins.md", Dg = "Open a chat that helps you plan a plugin and write its files. It approves nothing.", Og = `Read ${Eg}: the plugin contract, parts, sources and approval`, kg = "Open a chat that suggests rules for you to paste here and save. What you type there stays in its transcript, so type truly private words straight into the editor.", Ag = (e) => e.length ? e.join(", ") : "none";
function jg(e) {
	return [
		"Use the avoozl-plugin skill to help me design an Avoozl plugin.",
		"Ask what it is for and which system it talks to, then help me pick its parts, its source (folder, package or git) and whether it applies to this computer only or is shared with the repo.",
		"Then write the plugin folder: avoozl-plugin.json, any pack, the entry module, and a test against a fake host.",
		`This Avoozl supports contract version ${Ag(e.supported.map(String))}. Plugins already declared here: ${Ag(e.installed)}.`,
		"Do not approve the plugin or import its pack; I do that in Settings > Plugins."
	].join(" ");
}
function Mg(e) {
	return [
		"Use the avoozl-rules skill to help me plan an Avoozl content rule set.",
		"Ask what kind of text must stay out, then suggest rule and allow lines, where the set checks, and whether it blocks or reports.",
		"Do not write the terms file or save terms: I paste the lines into Settings > Content rules, check them with Try it, and save there.",
		"Remind me that terms typed in this chat stay in its transcript, so I type truly private words straight into the editor.",
		`Rule sets already here: ${Ag(e.sets)}.`
	].join(" ");
}
// docs/plugins.md?raw
var Ng = "# Writing a plugin\n\nA plugin adds to Avoozl without changing Avoozl itself. One plugin can\nbundle several parts, so a team installs one plugin and gets its settings,\nits content rules, its tracker and its intake source together:\n\n| Part      | What it is                                                                 | Runs code |\n| --------- | -------------------------------------------------------------------------- | --------- |\n| `pack`    | Settings a person previews and copies into `.avoozl.json` once             | No        |\n| `rules`   | Content rule sets supplied while Avoozl runs                               | Yes       |\n| `tracker` | A task tracker that keeps Avoozl's task records                            | Yes       |\n| `intake`  | An intake source: the tracker kind's `poll`, which brings outside work in | Yes       |\n| `route`   | A delivery route for tasks that are not run by a local worker              | Yes       |\n\nLocal and GitHub are the only built-in routes and trackers. Everything\nelse, including any integration that must stay private, is a separate\npackage or folder that plugs in here.\n\nThe examples on this page are the test-only plugins in Avoozl's own test\ntree: `src/app/test/fixtures/plugins/sdk-team/` bundles a pack, rules, a\ntracker and an intake source; `fake-route/`, `fake-tracker/` and\n`fake-rules/` each provide one part. Read them alongside this guide. These\nfakes are the only plugins tested so far; no real plugin has run live.\n\n## What a plugin is\n\nA plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module\nfor the parts that run code, and, with a pack, `avoozl-pack.json`:\n\n```json\n{\n  \"id\": \"sdk-team\",\n  \"version\": \"1.0.0\",\n  \"contract\": 1,\n  \"provides\": [\"pack\", \"rules\", \"tracker\", \"intake\"],\n  \"capabilities\": { \"tracker\": [\"actor\", \"poll\"], \"rules\": [] },\n  \"pack\": \"avoozl-pack.json\",\n  \"entry\": \"index.mjs\"\n}\n```\n\n- `id` is lowercase letters, digits and dashes. `local` and `github` are\n  reserved. Tasks name the plugin as `plugin:<id>`.\n- `version` changes whenever you release a new build.\n- `contract` is the contract version: which version of Avoozl's plugin\n  interface this plugin was built for. It is not the plugin's own version.\n  Settings shows it as **Contract version**. This Avoozl supports contract\n  version `1`.\n- `provides` lists the parts: `pack`, `rules`, `tracker`, `intake` and\n  `route`. `intake` runs as the `tracker` kind and needs the `poll`\n  capability. A manifest written before `provides` lists `kinds` instead\n  (`route`, `tracker`, `rules`), and each kind is its own part. With\n  `provides`, leave `kinds` out; if you keep it, it must match.\n- `capabilities` lists optional features per kind. A tracker may list\n  `edges`, `subtasks`, `actor`, `pause` and `poll`. A route lists none yet.\n- `pack` names the pack file inside the folder; it defaults to\n  `avoozl-pack.json`.\n- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides\n  only a pack runs no code, so it has no `entry`; Avoozl refuses one that\n  names an entry, and never starts a process for it.\n\nThe entry module exports one object per kind: `route`, `tracker`, or\n`rules`. Each\nmethod takes `(params, { config })` and returns a JSON value or a promise of\none:\n\n```js\nexport const route = {\n  submit({ task, brief }, { config }) { ... },\n  status({ id }, { config }) { ... },\n  completion({ id }, { config }) { ... },\n  cancel({ id }, { config }) { ... },\n};\n```\n\n## Declaring and approving a plugin\n\nA `plugins` entry declares each plugin, either in the repository's\n`.avoozl.json` (shared and reviewed in Git) or in this machine's\n`plugins.json`, beside the global Avoozl configuration\n(`~/.config/avoozl/plugins.json`, never committed):\n\n```json\n{\n  \"plugins\": [\n    {\n      \"id\": \"fake-route\",\n      \"path\": \"../fake-route\",\n      \"contract\": 1,\n      \"config\": { \"stateFile\": \"route-state.json\" }\n    }\n  ]\n}\n```\n\n- Name exactly one of `path` (a folder, relative to the file that declares\n  it), `package` (a package installed into the `plugins` folder beside\n  `plugins.json`), or `git` (below).\n- `config` is plain data passed to every call. It never holds a credential. A\n  key ending in `Env`, such as `tokenEnv`, names the environment variable the\n  plugin reads its credential from; Avoozl passes that variable, and only the\n  variables `config` names this way, to the plugin.\n- Declare a plugin whose name must stay private in `plugins.json`. Settings\n  asks you to confirm before it saves a `plugins` entry into `.avoozl.json`.\n\n### Add plugin in Settings\n\n**Settings > Plugins > Add plugin** walks four steps, with Cancel on each:\n\n1. **Where from**: open Folder, Package or Git and fill it in. Each keeps\n   what you typed until you cancel. Git shows the exact commit its ref names.\n2. **What**: the id, version, kinds and capabilities the plugin's own\n   `avoozl-plugin.json` declares. The id and **Contract version** come from\n   that file; a git plugin, whose files are fetched later, picks a supported\n   contract version. A package's optional version is checked against the\n   installed package; the entry stores no version, the approval pins it.\n3. **Applies to**: this computer only (`plugins.json`) or shared with the\n   repository (`.avoozl.json`). A shared plugin is approved on each computer\n   for itself; a shared package is installed on each, and a shared git plugin\n   is fetched on each with **Update**. A shared folder is a path inside the\n   repository, relative to it.\n4. **Review and approve**: the version, content hash and, for git, the commit.\n   Cancel here removes the entry step 3 declared.\n\n### A plugin from a git repository\n\n```json\n{ \"id\": \"fake-route\", \"git\": \"https://git.example.com/team/fake-route.git\",\n  \"ref\": \"v1.0.0\", \"subdir\": \"plugin\", \"contract\": 1 }\n```\n\n`git` is a URL or a local repository path. `ref` is a tag, a branch or a full\ncommit, and `subdir` is the plugin's folder inside the repository. **Add from\ngit** in Settings (or `avoozl plugins add ID --git URL --ref REF`) resolves\n`ref` to one commit, fetches only that commit into\n`plugins/git/<id>/<commit>/` beside `plugins.json`, and stores the commit on\nthis machine. Git runs as you, with your credential helper or SSH key, so\nprivate repositories work. Git hooks are off, submodules are skipped, and\nAvoozl runs no `npm install`: commit the plugin ready to run, bundled or with\n`node_modules`. The approval names the commit, so a new commit needs a new\napproval. **Update** (or `avoozl plugins update ID`) resolves `ref` again.\nThe tick never fetches. Avoozl refuses a URL with a password or token in it,\na `subdir` outside the repository, and a commit with no `avoozl-plugin.json`.\n\nNothing loads until a person approves the plugin in **Settings** (or with\n`avoozl plugins approve ID --hash HASH`). Settings shows the id, version,\neach part, the code kinds it runs as, capabilities, location and content\nhash, a SHA-256 over every file in the folder, the pack included. The\napproval lists the parts and is stored on this machine only. Any change to\nthe version or to any file needs approval again. The tick and example\ninstallation never approve a plugin.\n\nA plugin **shared with the repo** puts its entry in `.avoozl.json`, where\nit is committed and reviewed like any other change. Each computer still\napproves it for itself. Because a shared entry is the same on every\ncomputer, its `config` holds no machine path: name an environment variable\n(`termsFileEnv`, `stateFileEnv`) that holds each computer's own path, as the\n`sdk-team` sample does.\n\n## How Avoozl runs a plugin\n\n- Each approved plugin runs in its own Node child process. Avoozl talks to it\n  in JSON lines over stdin and stdout, and gives it no port.\n- A plugin may call its own system over the network. It must not open a\n  listener. A plugin that listens is stopped and marked broken.\n- Write nothing to stdout yourself; it carries the protocol. `console.log`\n  output goes to stderr, which Avoozl discards.\n- Each call has a time limit (20 seconds by default) inside the tick's own\n  time budget.\n- Every reply is checked against the contract. Links must be `http` or\n  `https`. Reply text is untrusted data: Avoozl quotes it as data in briefs\n  and escapes it in views.\n- When a plugin is missing, unapproved, disabled, crashes, times out, replies\n  with the wrong shape, or expects an unsupported contract, Avoozl marks it\n  unavailable for that tick. Its tasks show \"needs you\" with the reason, and\n  every other task keeps moving. The next tick tries again. A plugin's tasks\n  never fall back to another route or tracker on their own.\n\n## Route kind\n\nA task whose manifest entry says `\"route\": \"plugin:<id>\"` is delivered by\nthat route instead of a local worker session. One graph can mix routes, for\nexample a local leaf, then a remote one, then a local one.\n\n| Call                    | Reply                                                                            |\n| ----------------------- | -------------------------------------------------------------------------------- |\n| `submit({task, brief})` | `{id, link}`: the remote ID and a link to the work                               |\n| `status({id})`          | `{state, link?, reason?}`: `queued`, `running`, `needs-person`, `failed`, `done` |\n| `completion({id})`      | `{pr?, answer?}`: a pull request link, an answer, or both                        |\n| `cancel({id})`          | `{cancelled}`                                                                    |\n\n- `submit` gets the task's own title, summary, acceptance and checks, and a\n  brief. Make it idempotent by task ID.\n- The tick reads `status` every tick until the work is done. `needs-person`\n  shows the task as \"needs you\" with your link.\n- A remote task is done only when `status` says `done` and `completion`\n  returns its result. Each dependent's brief quotes that result as data.\n- `failed` stops the task for a person. `route.resubmit` starts it again.\n\n## Tracker kind\n\nA task with `\"authority\": \"plugin:<id>\"` keeps its record in that tracker,\nthe way a GitHub task keeps its record in an issue. SQLite only caches it:\ndirect edits are refused, and changes go through the spec and projection.\n\n| Call                               | Reply                                                                                  |\n| ---------------------------------- | -------------------------------------------------------------------------------------- |\n| `project({task, desired, marker})` | `{id, link, marker}`: create or update the record, idempotent by namespace and task ID |\n| `read({ids})`                      | `{records: [...]}`: each record's state and fields                                     |\n| `list({namespace})`                | `{records: [...]}`: every record carrying this namespace, for rebuild                  |\n| `close({id, reason})`              | `{closed}`: close with reason `completed` or `not_planned`                             |\n\nEach record in a `read` or `list` reply has:\n\n- `id`, `link`, `state` (`open` or `closed`), and `closeReason` when closed;\n- `fields`: the managed values as they are in the tracker now: `title`,\n  `section` (the managed description section) and `tags`, plus `blockedBy`\n  with the `edges` capability;\n- `marker`: the namespace, task ID and last applied values Avoozl stored with\n  the record, returned unchanged;\n- with the `actor` capability, `closedBy` and `pausedBy`: who closed or paused\n  it; with `pause`, `paused`.\n\nRules a tracker plugin must follow:\n\n- **Store the marker.** Keep the `marker` from `project` with the record (a\n  hidden field or a managed description section) and return it unchanged from\n  `project`, `read` and `list`. A plugin that does not is refused as a\n  tracker.\n- **Edges.** Without the `edges` capability, the graph stays in Avoozl: its\n  edges come from the approved spec. With `edges`, `desired.blockedBy` lists\n  the record IDs that block this one; store them as the tracker's own links.\n- **Edit only managed fields.** Avoozl changes the title, the managed section,\n  managed tags and, with `edges`, blocking links. A field a person changed is a\n  conflict that Avoozl reports and leaves alone.\n- **Completion is Avoozl's.** Avoozl decides a task is done and then calls\n  `close(id, \"completed\")`. A close or pause by someone else is judged with\n  the actor you report, against the entry's `config.allowedActors`. Without\n  the `actor` capability, every outside close holds the task's dependents for\n  a person.\n\n## Rules kind\n\nA rules plugin supplies content rule sets: terms Avoozl must never write\n(see \"Ban private terms\" in `docs/policies.md`). It lets a team ship its\nlist as a private package that public Avoozl never sees.\n\n| Call           | Reply                                             |\n| -------------- | ------------------------------------------------- |\n| `ruleSets({})` | `{sets: [{id, version, rules: [{id, pattern}]}]}` |\n\n- `pattern` is a regular expression, matched per line ignoring case.\n- A set or rule must not carry `allow`. Allow lines exist only in a person's\n  own terms file; a plugin writes its exception into the pattern itself\n  (for example `\\bzebra\\b(?!-ui)`). A reply with `allow` is refused, which\n  makes that plugin's sets unavailable.\n- A `.avoozl.json` set `{ \"id\": \"<set id>\", \"plugin\": \"<plugin id>\" }` picks\n  one set by id. In **Settings > Content rules**, pick the plugin as the set's\n  **Rules plugin**; such a set has no terms file to edit there.\n- Without a plugin, a set's rules live in its terms file,\n  `.avoozl/local/content-rules/<set id>.txt`, one `name: pattern` per line,\n  plus `allow:` lines for false matches.\n  Settings edits it with a Rule builder (word or phrase, or pattern) and a\n  File view, writes it readable by your account only, and refuses to write\n  it where Git could commit it. **How rules work** on that tab explains the\n  format with made-up examples.\n- Avoozl keeps the rules in memory for the tick. It never writes them to\n  SQLite, receipts, or Git; findings record the set's `version`.\n- A plugin that is missing, unapproved, or broken makes only its own sets\n  unavailable, and every boundary those sets cover writes nothing until it is\n  fixed.\n\n## Pack part\n\nA pack is settings only. Avoozl never runs anything from it. It is one JSON\nfile:\n\n```json\n{\n  \"description\": \"Triage labels, triggers and who counts for SDK repositories.\",\n  \"settings\": {\n    \"repositories\": {\n      \"minimumPermission\": \"write\",\n      \"rules\": [\n        { \"id\": \"deliver\", \"action\": \"deliver\",\n          \"match\": \"label:avoozl:deliver -label:needs-triage -label:response-requested\" }\n      ],\n      \"untriaged\": { \"filter\": \"label:needs-triage\",\n                     \"triageLabels\": [\"response-requested\", \"closing-soon\"] }\n    },\n    \"project\": { \"fields\": { \"status\": \"Status\", \"release\": \"Release\" } },\n    \"contentRules\": { \"sets\": [{ \"id\": \"team-terms\", \"plugin\": \"sdk-team\" }] }\n  }\n}\n```\n\nWhat a pack may set, and where each lands in `.avoozl.json`:\n\n| Pack key                     | Sets                                                                                                                                                       |\n| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `settings.repositories`      | For each repository you pick at import: `rules` (trigger `match` lines), `untriaged`, `allowedActors`, `minimumPermission`, `requiredChecks`, `priority`, `managedLabels`, `concurrency` |\n| `settings.project`           | `github.project.fields` and `statusValues`, when a GitHub Project is set                                                                                   |\n| `settings.epicIssueType`     | `github.epicIssueType`                                                                                                                                     |\n| `settings.contentRules.sets` | Rule set references by id (`plugin`, `action`, `boundaries`), never rules                                                                                  |\n| `settings.delivery`          | `reviewers` (review roles), `agent`, `model`, `runner`, `concurrency`                                                                                      |\n| `settings.flow`              | Flow settings, such as `batch.max`                                                                                                                         |\n\n- Every key is checked with the same rules Settings uses. Any other key is\n  refused by name, such as `Pack key settings.repositories.autoMerge is not\n  a pack setting.`, and the plugin shows as invalid until it is fixed.\n- A pack cannot hold a credential or a content rule pattern. Terms come\n  from the `rules` part at run time, so they are never stored in a public\n  repository.\n- A pack has no follow mode and no org minimums. Avoozl copies the\n  settings once; after that they are the repository's own settings.\n\n**Import.** On the plugin's card in **Settings > Plugins**, **Preview and\nimport pack** shows each setting as **Create**, **Change**, **Keep** or\n**Skip** (a setting that cannot apply here, such as Project fields with no\nProject set), with the old and new values. Nothing is written until\n**Import settings**, and only:\n\n- after this computer approved this exact plugin version;\n- for the exact preview shown: if the pack or `.avoozl.json` changed since,\n  Avoozl asks you to preview again;\n- when a setting would let more people give orders than before (a lower\n  `minimumPermission`, or new `allowedActors`), only after you accept that\n  change, which the preview names on its own line;\n- for a plugin declared on this computer only, after you confirm that its\n  id and settings go into `.avoozl.json`.\n\nImport writes `packs` into `.avoozl.json`: for each plugin, the version\nimported, when and by whom, and the settings that came from it. When a\nnewer version arrives, approve it, and the card offers its preview again;\nimporting it records the new version. At the command line:\n\n```sh\navoozl plugins pack-preview sdk-team\navoozl plugins pack-import sdk-team --preview HASH [--accept-lowered]\n```\n\n## Intake part\n\nAn intake source is a tracker kind with the `poll` capability, listed in\n`provides` as `intake`. The fake tracker (`fake-tracker/`) is the example:\nits `poll` reads a JSON file of items and returns those changed since the\ncursor.\n\n| Call                    | Reply                                                                   |\n| ----------------------- | ----------------------------------------------------------------------- |\n| `poll({cursor, limit})` | `{items, cursor, more}`: items changed since `cursor`, at most `limit` |\n\n```js\nexport const tracker = {\n  poll({ cursor, limit }, { config }) {\n    const changed = readItems(config).filter(\n      (item) => !cursor || mark(item) > cursor,\n    );\n    const page = changed.slice(0, limit);\n    return {\n      items: page,\n      cursor: page.length ? mark(page.at(-1)) : cursor,\n      more: changed.length > page.length,\n    };\n  },\n};\n```\n\n- `cursor` is your own text of at most 2,000 characters, or null on the\n  first poll. Return the cursor for the next poll and `more: true` when a\n  page is left. Avoozl asks for at most 500 items, polls each source at most\n  once per tick, and stores the new cursor only after every item of the\n  reply is handled, so a crash replays the same page. A failed poll keeps\n  the cursor and the items and shows the error on the source.\n- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,\n  `review` or `ticket`), `title`, `state` (`open` or `closed`), and\n  `updatedAt`; and may have `body`, `labels`, `author`, `assignees`,\n  `closeReason`, `closedBy`, `closedAt`, `fields` (text, number or\n  true/false values) and `trigger`. An item that breaks a limit is refused\n  with a reason naming the field; the other items of the reply still count.\n- `trigger` is `{actor, permission, eventId, at}`: who last changed what a\n  rule would match, and that person's standing in your system, mapped to\n  `none`, `read`, `triage`, `write`, `maintain` or `admin`. Avoozl checks it\n  against the source's `allowedActors` and `minimumPermission` (default\n  `write`). Without the `actor` capability nobody counts, so your items only\n  list, pause or quarantine. A close counts as an order only when\n  `closedBy` is the trigger's actor and that actor counts.\n- A plugin that provides `intake` but not `tracker` is never asked to\n  `project`, `read`, `list` or `close`. Avoozl writes nothing back to an\n  intake source.\n\nDeclare the source under `intake.sources`, in `.avoozl.json` or in this\nmachine's `plugins.json` when its name must stay private:\n\n```json\n{\n  \"intake\": {\n    \"sources\": {\n      \"tickets\": {\n        \"via\": \"plugin:fake-tracker\",\n        \"repository\": \"example/app\",\n        \"labelFields\": [\"component\"],\n        \"minimumPermission\": \"write\"\n      }\n    }\n  }\n}\n```\n\n`repository` names a registered repository: its trigger rules apply, and a\ndelivered item's task lands there. A rule matches a source's items only\nwith a `source:` term, such as `label:go source:tickets`; a rule without\none matches GitHub only. `labelFields` adds a `<field>:<value>` label per\nfield and `assigneeField` an assignee before matching. Items no rule takes\nshow in the **Intake** tab with their source.\n\n## Testing your plugin\n\nCopy the fake plugins' approach: keep the remote system in a file or a local\nstand-in, declare the plugin in a temporary `plugins.json`, approve its hash,\nand run ticks. Avoozl's proof P26 does exactly this with the two fakes, and\nproof P35 installs, previews, imports and polls the `sdk-team` bundle.\nProof P32 polls the fake tracker as an intake source.\n";
// kirocrew-app/ui/src/PluginsSettings.tsx
function Pg({ row: e }) {
	let t = Object.entries(e.capabilities ?? {}).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; "), n = [
		["Version", e.version],
		[dh, e.contract === void 0 ? void 0 : String(e.contract)],
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
function Fg({ row: e }) {
	let t = vh(e);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: "mt-2 flex flex-col gap-1 text-xs",
		"data-plugin-parts": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", { children: [
			/* @__PURE__ */ b("span", {
				className: "font-semibold",
				children: _h[t]?.title ?? t
			}),
			/* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" ", _h[t]?.line]
			}),
			t === "pack" && e.pack ? /* @__PURE__ */ b("span", {
				className: "block text-muted",
				children: e.pack.imported ? `Imported version ${e.pack.imported.version}: ${e.pack.imported.settings.length} settings.${e.pack.offer ? ` Version ${e.version} is not imported yet.` : ""}` : "Not imported yet."
			}) : null
		] }, t))
	}) : null;
}
function Ig({ row: e, busy: t, act: n, client: r, workspaceId: i }) {
	let [a, o] = c(null), [s, l] = c(null), u = e.id ?? "";
	return /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-1 text-xs",
		"data-lessons-pack": u,
		children: [a ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("span", { children: Gh(a) }), /* @__PURE__ */ x("div", {
			className: "flex flex-wrap gap-2",
			children: [/* @__PURE__ */ b(zn, {
				tooltip: "Import these lessons read-only, named by this plugin and version",
				primary: !0,
				disabled: t || e.state !== "approved",
				onClick: () => n(async () => {
					await r.lessonsImport(i, u, a.hash), l(`Imported ${a.rows.filter((e) => e.action !== "retire").length} lessons.`), o(null);
				}),
				children: "Import lessons"
			}), /* @__PURE__ */ b(zn, {
				tooltip: "Close the preview without importing",
				disabled: t,
				onClick: () => o(null),
				children: "Cancel"
			})]
		})] }) : /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(zn, {
			tooltip: "See which lessons importing this pack adds, changes or retires",
			disabled: t,
			onClick: () => n(async () => o(await r.lessonsPreview(i, u))),
			children: "Preview lessons pack"
		}) }), s && /* @__PURE__ */ b("span", {
			className: "text-muted",
			children: s
		})]
	});
}
function Lg(e) {
	let { row: t, busy: n, act: r, client: i, workspaceId: a } = e, o = kh(t), s = t.id ?? "";
	return /* @__PURE__ */ x(m, { children: [
		/* @__PURE__ */ b(Y, {
			title: t.id ?? "Unnamed entry",
			meta: /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(G, {
				variant: o.attention ? "warning" : void 0,
				children: o.label
			}), t.health?.state === "ok" ? /* @__PURE__ */ b(G, { children: "Healthy" }) : null] })
		}),
		t.reason ? /* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: t.reason
		}) : null,
		t.health?.state === "unavailable" && t.health.reason !== t.reason ? /* @__PURE__ */ x("p", {
			className: "mt-1 text-xs text-muted",
			children: ["Last tick: ", t.health.reason]
		}) : null,
		/* @__PURE__ */ b(Fg, { row: t }),
		/* @__PURE__ */ b(Pg, { row: t }),
		vh(t).includes("lessons") && t.id ? /* @__PURE__ */ b(Ig, {
			row: t,
			busy: n,
			act: r,
			client: i,
			workspaceId: a
		}) : null,
		e.notes.length > 0 && /* @__PURE__ */ x("div", {
			className: "mt-2 flex flex-col gap-2",
			"data-plugin-notes": !0,
			children: [/* @__PURE__ */ b("span", {
				className: "text-xs font-semibold",
				children: "Suggested changes from retros. Copy one to the plugin's owner; Avoozl sends nothing."
			}), e.notes.map((e, t) => /* @__PURE__ */ b(bo, { note: e }, t))]
		}),
		t.id ? /* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-wrap gap-2",
			children: [
				t.pack ? /* @__PURE__ */ b(zn, {
					tooltip: "See what each pack setting would create, change or keep, then import it",
					primary: t.pack.offer && t.state === "approved",
					disabled: n,
					onClick: () => e.onImport(t),
					children: t.pack.imported && t.pack.offer ? `Preview version ${t.version}` : t.pack.imported ? "Preview pack" : "Preview and import pack"
				}) : null,
				Ah(t) ? /* @__PURE__ */ x(zn, {
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
				t.git ? /* @__PURE__ */ b(zn, {
					tooltip: "Fetch the ref's current commit. A new commit needs approval again.",
					disabled: n,
					onClick: () => r(() => i.update(a, s)),
					children: t.commit ? `Update from ${t.git.ref}` : `Fetch ${t.git.ref}`
				}) : null,
				t.state === "disabled" ? /* @__PURE__ */ b(zn, {
					tooltip: "Let this plugin run again",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !1)),
					children: "Enable"
				}) : t.state !== "invalid" && t.state !== "missing" ? /* @__PURE__ */ b(zn, {
					tooltip: "Stop this plugin from running. Enable undoes it.",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !0)),
					children: "Disable"
				}) : null,
				/* @__PURE__ */ b("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ b(An, {
						icon: Re,
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
function Rg({ workspaceId: e, onOpenGitHub: n }) {
	let i = l(), a = o(() => Mh(i), [i]), { value: s, error: d, busy: f, reload: p } = da(e, t((e) => a.list(e), [a])), [g, _] = c(!1), [v, y] = c(null), [S, C] = c(null), [w, T] = c(null), [E, D] = c(!1), { openChat: O } = u(), A = () => O({
		message: jg({
			supported: s?.supportedContracts ?? [],
			installed: (s?.plugins ?? []).flatMap((e) => e.id ? [e.id] : [])
		}),
		autoSend: !1
	}), j = (e) => {
		_(!0), y(null), e().then(() => p()).catch((e) => y(K(e))).finally(() => _(!1));
	}, M = Xe("(min-width: 1024px)"), N = o(() => Wa(i), [i]), [P, F] = c([]);
	return r(() => {
		let t = !0;
		return N.proposals(e).then((e) => t && F(e.notes), () => t && F([])), () => {
			t = !1;
		};
	}, [N, e]), /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				"data-plugin-help": !0,
				children: [/* @__PURE__ */ b(q, {
					icon: Se,
					tooltip: Dg,
					onClick: A,
					children: "Design a plugin"
				}), /* @__PURE__ */ b(q, {
					icon: k,
					tooltip: Og,
					onClick: () => D(!0),
					children: "Plugin guide"
				})]
			}),
			E ? /* @__PURE__ */ b(wg, {
				workspaceId: e,
				target: {
					document: Eg,
					lineStart: null,
					lineEnd: null
				},
				text: Ng,
				onClose: () => D(!1)
			}) : null,
			d ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: d
			}) : null,
			v ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: v
			}) : null,
			w ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				role: "status",
				children: w
			}) : null,
			S ? /* @__PURE__ */ b(Jh, {
				row: S,
				workspaceId: e,
				client: a,
				onChanged: p,
				onClose: (e) => {
					C(null), T(e ?? null);
				}
			}) : null,
			/* @__PURE__ */ x("div", {
				"data-plugins-layout": !0,
				style: M ? {
					display: "grid",
					gridTemplateColumns: "minmax(18rem, 2fr) minmax(0, 3fr)",
					gap: 14,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 14
				},
				children: [/* @__PURE__ */ b(ng, {
					workspaceId: e,
					client: a,
					supported: s?.supportedContracts ?? [],
					onChanged: p
				}), /* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-col gap-3",
					"aria-label": "Installed plugins",
					children: [s && !s.plugins.length ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(h, {
						title: "No plugins",
						subtitle: "Nothing loads until a plugin is declared and approved. Add one on the left.",
						action: /* @__PURE__ */ b(Fn, {
							workspaceId: e,
							help: {
								page: "Settings › Plugins",
								section: "No plugins",
								says: "Nothing loads until a plugin is declared and approved. Add one on the left.",
								settings: [{
									key: "plugins",
									value: "none declared"
								}],
								docs: "docs/plugins.md, and the avoozl-plugin skill"
							}
						})
					}) }) : null, s?.plugins.map((t, n) => /* @__PURE__ */ b(Lg, {
						row: t,
						busy: g || f,
						act: j,
						client: a,
						workspaceId: e,
						onImport: C,
						notes: P.filter((e) => e.plugin === t.id)
					}, `${t.id}-${t.source}-${n}`))]
				})]
			}),
			/* @__PURE__ */ b(_g, {
				workspaceId: e,
				plugins: s?.plugins ?? [],
				onOpenGitHub: n
			})
		]
	});
}
// kirocrew-app/ui/src/content-api.ts
var zg = {
	plan: "Spec files",
	github: "GitHub text",
	brief: "Session briefs",
	diff: "Worker diffs",
	intake: "Incoming items"
}, Bg = {
	plan: "Spec files when a spec is saved or approved.",
	github: "Issue, comment and pull request text Avoozl writes.",
	brief: "The brief a worker session starts with.",
	diff: "Lines a worker adds, checked before a push.",
	intake: "Items that come in from a plugin source or MCP. Only checked when you tick it.",
	proposal: "A retro's proposals, their diffs and evidence.",
	lesson: "Lessons shared across workspaces, when written, used and exported."
}, Vg = Object.keys(zg), Hg = Vg.filter((e) => e !== "intake");
function Ug(e) {
	return e.source === "plugin" ? `Rules plugin ${e.plugin}${e.version ? `, version ${e.version}` : ""}` : e.source === "policy" ? ".avoozl.json" : e.termsFrom === "machine" ? "Terms file named in this machine’s settings" : "Terms file in .avoozl/local/content-rules";
}
function Wg(e) {
	let t = e.boundaries ? e.boundaries.map((e) => zg[e] ?? e).join(", ") : "Every boundary but incoming items";
	return e.repositories ? `${t} in ${e.repositories.join(", ")}` : t;
}
var Gg = {
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
}, Kg = (e) => Gg[e]?.name ?? e, qg = (e, t) => {
	let n = Gg[e]?.modes;
	return !n || n.includes(t ?? "");
}, Jg = () => ({
	id: "",
	action: "block",
	boundaries: [...Hg],
	repositories: [],
	plugin: ""
}), Yg = (e) => ({
	id: e.id,
	action: e.action,
	boundaries: e.boundaries ?? [...Hg],
	repositories: e.repositories ?? [],
	plugin: e.plugin ?? ""
}), Xg = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function Zg(e, t) {
	let n = e.id.trim();
	return n ? n.toLowerCase().startsWith("builtin:") ? { error: "Names starting builtin: are reserved." } : Xg.test(n) ? t.includes(n) ? { error: `A set named ${n} already exists.` } : e.boundaries.length ? { entry: {
		id: n,
		...e.action === "report" ? { action: "report" } : {},
		...e.boundaries.length && !(e.boundaries.length === Hg.length && Hg.every((t) => e.boundaries.includes(t))) ? { boundaries: Vg.filter((t) => e.boundaries.includes(t)) } : {},
		...e.repositories.length ? { repositories: [...e.repositories] } : {},
		...e.plugin ? { plugin: e.plugin } : {}
	} } : { error: "Pick at least one place to check." } : { error: "Use lowercase letters, digits, dots, dashes or underscores." } : { error: "Give the set a name." };
}
var Qg = (e) => Zg(Yg(e), []).entry ?? { id: e.id }, $g = /[.*+?^${}()|[\]\\]/g, e_ = (e) => e.replace($g, "\\$&"), t_ = (e) => e.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
function n_(e) {
	let t = t_(e);
	return e_(t) === e ? {
		kind: "word",
		value: t
	} : {
		kind: "pattern",
		value: e
	};
}
function r_(e) {
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
		let r = t.slice(0, n).trim(), i = n_(t.slice(n + 1).trim()), a = i_.exec(r);
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
var i_ = /^allow(?:\s+(.*))?$/i, a_ = (e, t) => e === "word" ? e_(t.trim()) : t.trim();
function o_(e) {
	return e.kind === "blank" ? "" : e.kind === "note" ? `# ${e.text}` : e.kind === "raw" ? e.text : e.kind === "allow" ? `allow${e.rule.trim() ? ` ${e.rule.trim()}` : ""}: ${a_(e.match, e.value)}` : `${e.name.trim()}: ${a_(e.kind, e.value)}`;
}
var s_ = (e) => e.length ? e.map(o_).join("\n") + "\n" : "", c_ = (e) => [...new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name.trim()] : []))].filter(Boolean);
function l_(e, t = []) {
	if (e.kind === "raw") return "Needs a name, a colon, then the word or pattern.";
	if (e.kind === "allow") return e.rule.trim() && !c_(t).includes(e.rule.trim()) ? "Allows a rule this file does not have." : e.value.trim() ? e.match === "pattern" ? u_(e.value) : null : "Give a word, phrase or pattern to allow.";
	if (e.kind !== "word" && e.kind !== "pattern") return null;
	let n = e.name.trim();
	return n ? n.includes(":") ? "A name cannot hold a colon." : /^#/.test(n) ? "A name cannot start with #." : i_.test(n) ? "A name cannot start with allow; use an Allow row." : e.value.trim() ? e.kind === "pattern" ? u_(e.value) : null : "Give a word, phrase or pattern." : "Give the rule a name.";
}
function u_(e) {
	try {
		new RegExp(e.trim(), "i");
	} catch (e) {
		return `The pattern does not compile (${String(e.message).split(": ").pop()}).`;
	}
	return null;
}
function d_(e) {
	let t = r_(e);
	return t.flatMap((e, n) => {
		let r = l_(e, t);
		return r ? [{
			line: n + 1,
			message: r
		}] : [];
	});
}
var f_ = (e) => e.filter((e) => e.kind === "word" || e.kind === "pattern").length, p_ = (e) => e.filter((e) => e.kind === "allow").length;
function m_(e) {
	let t = new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name] : [])), n = e.length + 1;
	for (; t.has(`rule-${n}`);) n += 1;
	return `rule-${n}`;
}
function h_(e, t) {
	let n = t.flatMap((e) => e.kind === "allow" && !l_(e, t) ? [{
		rule: e.rule.trim(),
		re: new RegExp(a_(e.match, e.value), "i")
	}] : []), r = t.flatMap((e) => {
		if (e.kind !== "word" && e.kind !== "pattern" || l_(e, t)) return [];
		let r = e.name.trim();
		return [{
			name: r,
			re: new RegExp(a_(e.kind, e.value), "gi"),
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
function g_(e, t) {
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
function __(e) {
	let t = async (t, n, r) => (await e.post(ln, {
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
var v_ = "avoozl-content-help";
function y_() {
	let e = document.getElementById(v_);
	e && (e.open = !0, e.scrollIntoView({
		behavior: "smooth",
		block: "start"
	}));
}
function b_({ children: e = "How rules work" }) {
	return /* @__PURE__ */ x("button", {
		type: "button",
		className: "inline-flex items-center gap-1 text-xs underline",
		onClick: y_,
		"data-help-link": !0,
		children: [/* @__PURE__ */ b(k, {
			size: 12,
			"aria-hidden": "true"
		}), e]
	});
}
var x_ = {
	border: "1px solid var(--border)",
	borderRadius: 10,
	background: "color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))"
};
function S_(e) {
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
				e.locked && /* @__PURE__ */ b(be, {
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
function C_(e) {
	let { value: t, selection: n } = e, r = (e, t) => n?.kind === e && "id" in n && n.id === t, i = /* @__PURE__ */ b(q, {
		icon: ke,
		primary: !0,
		onClick: () => e.onSelect({ kind: "new" }),
		tooltip: "Make a set of your own words to block or report",
		children: "Add rule set"
	});
	return /* @__PURE__ */ x("nav", {
		"aria-label": "Rule sets",
		className: "flex flex-col gap-3 p-3",
		style: x_,
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
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(b_, {}) })
				]
			}) : /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5",
				children: t?.sets.map((t) => /* @__PURE__ */ b(S_, {
					title: t.id,
					selected: r("set", t.id),
					onClick: () => e.onSelect({
						kind: "set",
						id: t.id
					}),
					note: t.available ? /* @__PURE__ */ b("span", {
						className: "text-[11px] text-muted",
						children: t.action === "report" ? "Reports" : "Blocks"
					}) : /* @__PURE__ */ b(G, {
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
						children: t?.builtins.map((n) => /* @__PURE__ */ b(S_, {
							locked: !0,
							title: Kg(n.id),
							raw: n.id,
							selected: r("builtin", n.id),
							onClick: () => e.onSelect({
								kind: "builtin",
								id: n.id
							}),
							note: qg(n.id, t?.mode) ? null : /* @__PURE__ */ b("span", {
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
function w_({ rows: e }) {
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
function T_({ id: e, appliesAt: t, mode: n }) {
	let r = Gg[e], i = qg(e, n);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-rule-details": e,
		children: [
			/* @__PURE__ */ b(Y, {
				icon: be,
				title: Kg(e),
				meta: i ? /* @__PURE__ */ b(G, { children: "Always on" }) : /* @__PURE__ */ b(G, { children: "Not used" }),
				blurb: /* @__PURE__ */ b("code", {
					className: "text-[11px]",
					children: e
				})
			}),
			!i && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode."
			}),
			/* @__PURE__ */ b(w_, { rows: [
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
function E_(e) {
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
var D_ = (e, t, n) => n ? [.../* @__PURE__ */ new Set([...e, t])] : e.filter((e) => e !== t);
function O_(e) {
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
				}), /* @__PURE__ */ b(Nn, {
					id: "avoozl-set-action",
					label: "When a rule matches",
					value: t.action,
					onChange: (e) => n({ action: e }),
					cards: [{
						key: "block",
						icon: O,
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
					children: Vg.map((e) => /* @__PURE__ */ b(E_, {
						label: zg[e],
						hint: Bg[e],
						checked: t.boundaries.includes(e),
						onChange: (r) => n({ boundaries: D_(t.boundaries, e, r) })
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
						children: r.repositories.map((e) => /* @__PURE__ */ b(E_, {
							label: e,
							checked: t.repositories.includes(e),
							onChange: (r) => n({ repositories: D_(t.repositories, e, r) })
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
var k_ = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	padding: "4px 8px",
	fontSize: 13,
	minWidth: 0,
	width: "100%"
}, A_ = { fontFamily: "var(--mono, monospace)" }, j_ = {
	display: "grid",
	gridTemplateColumns: "minmax(6rem, 9rem) minmax(8rem, 10rem) minmax(0, 1fr) auto",
	gap: 8,
	alignItems: "center"
}, M_ = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
	gap: 6,
	alignItems: "center"
};
function N_(e) {
	let { row: t, index: n } = e, r = l_(t, e.rows), i = `avoozl-term-error-${n}`, a = e.narrow ? M_ : j_;
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
						...k_,
						...t.kind === "raw" ? A_ : { color: "var(--muted)" }
					}
				}),
				/* @__PURE__ */ b(J, {
					icon: Ve,
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
	let o = t.kind === "allow", s = o ? t.match : t.kind, c = o ? `allow-${t.match}` : t.kind, l = (e, t, n) => e === t ? n : t === "pattern" ? e_(n) : n_(n).kind === "word" ? n_(n).value : n, u = (n) => {
		if (n === c) return;
		let r = n.endsWith("pattern") ? "pattern" : "word", i = l(s, r, t.value);
		n.startsWith("allow") ? e.onChange({
			kind: "allow",
			rule: o ? t.rule : "",
			match: r,
			value: i
		}) : e.onChange({
			kind: r,
			name: o ? m_(e.rows) : t.name,
			value: i
		});
	}, d = c_(e.rows), f = o ? /* @__PURE__ */ x("select", {
		value: t.rule,
		"aria-label": `Rule allowed on line ${n + 1}`,
		onChange: (n) => e.onChange({
			...t,
			rule: n.target.value
		}),
		style: k_,
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
		style: k_
	}), p = /* @__PURE__ */ x("select", {
		value: c,
		"aria-label": `Kind on line ${n + 1}`,
		onChange: (e) => u(e.target.value),
		style: k_,
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
			...k_,
			...s === "pattern" ? A_ : {},
			...r ? { borderColor: "var(--danger)" } : {},
			...e.narrow ? { gridColumn: "1 / 3" } : {}
		}
	}), h = /* @__PURE__ */ b(J, {
		icon: Ve,
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
function P_(e) {
	let t = s(null), n = o(() => d_(e.text), [e.text]), r = new Set(n.map((e) => e.line)), i = Math.max(1, e.text.replace(/\n$/, "").split("\n").length), a = {
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
function F_({ rows: e }) {
	let [t, n] = c(""), r = o(() => h_(t, e), [t, e]), i = t.split("\n"), a = r.filter((e) => !e.allowed), s = r.length - a.length, l = [...new Set(a.map((e) => e.rule))];
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
			children: i.map((e, t) => /* @__PURE__ */ x("div", { children: [g_(e, r.filter((e) => e.line === t)).map((e, t) => !e.rules.length && e.allowed ? /* @__PURE__ */ x("span", {
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
function I_(e) {
	let { workspaceId: t, client: n, set: i } = e, [a, o] = c(null), [s, l] = c([]), [u, d] = c(""), [f, m] = c(""), [h, g] = on("content-terms-view", "inner", (e) => e === "file" ? "Back to File view" : "Back to Rule builder", "builder"), [_, y] = c(null), [S, C] = c(null), [w, T] = c(!1), E = Xe("(max-width: 640px)");
	r(() => {
		let e = !0;
		return o(null), y(null), C(null), n.terms(t, i.id).then((t) => {
			if (!e) return;
			o(t);
			let n = t.text ?? "";
			d(n), m(n), l(r_(n));
		}).catch((t) => e && y(K(t))), () => {
			e = !1;
		};
	}, [
		n,
		t,
		i.id
	]);
	let D = (e) => {
		l(e), d(s_(e)), C(null);
	}, O = (e) => {
		d(e), l(r_(e)), C(null);
	}, k = d_(u), A = u !== f, j = async () => {
		T(!0), y(null);
		try {
			let r = await n.saveTerms(t, i.id, u);
			m(u), C(`Saved ${r.rules} rule${r.rules === 1 ? "" : "s"}.`), await e.onSaved();
		} catch (e) {
			y(K(e));
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
							f_(s),
							" rule",
							f_(s) === 1 ? "" : "s",
							p_(s) ? `, ${p_(s)} allow` : "",
							!a.exists && !A ? ", no file yet" : ""
						]
					}),
					/* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(b_, { children: "How a line works" })
					})
				]
			}),
			h === "builder" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				children: [
					f_(s) === 0 && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "No rules yet. Add one: a name that shows in logs, and the word or pattern to find."
					}),
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-2",
						"aria-label": "Rules",
						children: s.map((e, t) => /* @__PURE__ */ b(N_, {
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
						children: [/* @__PURE__ */ b(q, {
							icon: ke,
							onClick: () => D([...s, {
								kind: "word",
								name: m_(s),
								value: ""
							}]),
							children: "Add rule"
						}), /* @__PURE__ */ b(q, {
							icon: ke,
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
			}) : /* @__PURE__ */ b(P_, {
				text: u,
				onChange: O
			}),
			/* @__PURE__ */ b(F_, { rows: s }),
			/* @__PURE__ */ x("p", {
				className: "flex items-start gap-1.5 text-xs text-muted",
				children: [/* @__PURE__ */ b(Le, {
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
function L_(e) {
	let { set: t, value: n } = e, [i, a] = c(() => t ? Yg(t) : Jg()), [o, s] = c(null), [l, u] = c(!1), d = t ? JSON.stringify(Qg(t)) : null;
	r(() => {
		a(t ? Yg(t) : Jg()), s(null);
	}, [d]);
	let f = n.sets.filter((e) => e.id !== t?.id), m = n.choices ?? {
		repositories: [],
		plugins: []
	}, h = Zg(i, f.map((e) => e.id)), g = !t || JSON.stringify(h.entry) !== JSON.stringify(Qg(t)), _ = async (t, r) => {
		u(!0), s(null);
		try {
			e.onSaved(await e.client.saveSets(e.workspaceId, t, n.configHash), r);
		} catch (e) {
			s(K(e));
		} finally {
			u(!1);
		}
	}, v = () => {
		if (!h.entry) return s(h.error ?? "Check the form.");
		let e = n.sets.map((e) => e.id === t?.id ? h.entry : Qg(e));
		_(t ? e : [...e, h.entry], String(h.entry.id));
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		"data-rule-details": t?.id ?? "new",
		children: [
			/* @__PURE__ */ b(Y, {
				title: t ? t.id : "New rule set",
				meta: t && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(G, {
					variant: t.available ? "success" : "warning",
					children: t.available ? "Available" : "Unavailable"
				}), /* @__PURE__ */ b(G, { children: t.action === "report" ? "Reports" : "Blocks" })] }),
				blurb: t ? "Your words to keep out of what Avoozl writes." : "Name it and pick where it checks. Add its words after you save.",
				actions: t && /* @__PURE__ */ b(An, {
					icon: Re,
					disabled: l,
					confirm: {
						title: `Delete the rule set ${t.id}?`,
						body: "It is removed from .avoozl.json and stops checking. Its terms file stays on this machine, so a new set with the same name uses it again.",
						action: "Delete set"
					},
					onConfirm: () => void _(f.map(Qg), null),
					children: "Delete set"
				})
			}),
			t && /* @__PURE__ */ b(w_, { rows: [
				["Rules from", Ug(t)],
				["Checks", Wg(t)],
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
					/* @__PURE__ */ b(O_, {
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
					/* @__PURE__ */ b(I_, {
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
var R_ = String.raw`# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b`, z_ = String.raw`# zebra falcon app is the public name
allow: zebra falcon app
# ACME-0000 is the sample ticket in the docs
allow ticket: \bacme-0000\b`;
function B_() {
	return /* @__PURE__ */ x("details", {
		id: v_,
		className: "rounded-lg border p-3",
		style: { borderColor: "var(--border)" },
		"data-rules-help": !0,
		children: [/* @__PURE__ */ x("summary", {
			className: "flex cursor-pointer items-center gap-2 text-sm font-semibold",
			style: { listStyle: "none" },
			children: [/* @__PURE__ */ b(k, {
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
						children: R_
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
						children: z_
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "Where it checks"
					}),
					/* @__PURE__ */ b("ul", {
						className: "text-muted",
						children: Vg.map((e) => /* @__PURE__ */ x("li", { children: [
							/* @__PURE__ */ x("span", {
								style: { color: "var(--text)" },
								children: [zg[e], ":"]
							}),
							" ",
							Bg[e]
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
function V_({ workspaceId: e }) {
	let n = l(), i = o(() => __(n), [n]), { value: a, error: s, reload: d } = da(e, t((e) => i.list(e), [i])), [f, p] = c(null), m = f ?? a;
	r(() => p(null), [a]);
	let [h, g] = c(null), _ = h && (h.kind === "new" || h.kind !== "set" || m?.sets.some((e) => e.id === h.id)) ? h : m?.sets[0] ? {
		kind: "set",
		id: m.sets[0].id
	} : m?.builtins[0] ? {
		kind: "builtin",
		id: m.builtins[0].id
	} : null, v = Xe("(min-width: 860px)"), y = _?.kind === "set" ? m?.sets.find((e) => e.id === _.id) ?? null : null, S = _?.kind === "builtin" ? m?.builtins.find((e) => e.id === _.id) : void 0, { openChat: C } = u();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap gap-2",
				"data-rules-design": !0,
				children: /* @__PURE__ */ b(q, {
					icon: Se,
					tooltip: kg,
					onClick: () => C({
						message: Mg({ sets: (m?.sets ?? []).map((e) => e.id) }),
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
				children: [/* @__PURE__ */ b(C_, {
					value: m,
					selection: _,
					onSelect: g
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 rounded-lg border p-4",
					style: {
						borderColor: "var(--border)",
						background: "var(--card, var(--bg))"
					},
					children: m ? S ? /* @__PURE__ */ b(T_, {
						id: S.id,
						appliesAt: S.appliesAt,
						mode: m.mode
					}) : _?.kind === "new" || y ? /* @__PURE__ */ b(L_, {
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
			/* @__PURE__ */ b(B_, {})
		]
	});
}
// kirocrew-app/ui/src/PromptInstructions.tsx
var H_ = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function U_(e) {
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
			/* @__PURE__ */ b(Mn, {
				id: `${e.id}-builtin`,
				title: `Built-in ${e.agent} prompt (read-only)`,
				children: e.builtIn ? /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 pb-2",
					children: [/* @__PURE__ */ b("pre", {
						className: "rounded border p-2 text-xs",
						style: {
							...H_,
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							maxHeight: "16rem",
							overflowY: "auto"
						},
						children: e.builtIn
					}), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(q, {
						icon: t ? j : z,
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
				}), /* @__PURE__ */ b(zv, { rule: { required: !1 } })]
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
				style: H_
			}),
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(X, {
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
var W_ = { required: !1 }, G_ = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function K_({ name: e }) {
	return /* @__PURE__ */ b(X, {
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
function q_(e) {
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
				}), /* @__PURE__ */ b(zv, { rule: W_ })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(K_, { name: e.raw })
		]
	});
}
function J_({ children: e }) {
	return /* @__PURE__ */ b(m, {
		className: "flex flex-col gap-4",
		"data-flow-box": !0,
		children: e
	});
}
var Y_ = [
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
function X_({ workspaceId: e }) {
	let n = l(), i = o(() => Wa(n), [n]), { value: a, error: s, reload: u } = da(e, t((e) => i.settings(e), [i])), [d, f] = c(fo()), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null), [C, w] = c({
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
		a && (f(fo(a.flow)), h(a.instructions ?? ""));
	}, [a]);
	let T = (e) => f({
		...d,
		...e
	}), [E, D] = c(0);
	r(() => {
		let t = !0;
		return i.proposals(e).then((e) => t && D(e.prompts.reduce((e, t) => e + t.drift.length, 0)), () => t && D(0)), () => {
			t = !1;
		};
	}, [i, e]);
	let O = async () => {
		if (!a) return;
		let t = po(d);
		if (t.error) return S({ error: t.error });
		v(!0), S(null);
		try {
			await i.saveSettings(e, {
				flow: t.flow,
				expectedHash: a.hash
			}), m !== (a.instructions ?? "") && await i.saveInstructions(e, m), S({ ok: "Saved." }), await u();
		} catch (e) {
			S({ error: K(e) });
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
	let k = d.scope || uo.scope, A = d.localChecksFirst ? d.localChecksFirst === "on" : uo.localChecksFirst;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-settings": !0,
		children: [
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ b($, {
				title: "Timing",
				blurb: "Always on. Avoozl records where each task's time goes; nothing to set."
			}) }),
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ b($, {
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
							}), /* @__PURE__ */ b(zv, { rule: W_ })]
						}),
						/* @__PURE__ */ b(Nn, {
							id: "avoozl-flow-scope",
							label: "What to pause",
							value: k,
							onChange: (e) => T({ scope: e }),
							cards: Y_.map((e) => ({ ...e }))
						}),
						/* @__PURE__ */ b(K_, { name: "flow.stopTheLine.scope" })
					]
				})
			}) }),
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ x($, {
				title: "Local checks first",
				blurb: "Run the checks here before any push, so CI only confirms. It matters only when sessions push.",
				children: [/* @__PURE__ */ x("label", {
					className: "flex flex-wrap items-center gap-2 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: A,
							onChange: (e) => T({ localChecksFirst: e.target.checked ? "on" : "off" })
						}),
						/* @__PURE__ */ b("span", {
							className: "font-medium",
							children: "Require a local pass before push"
						}),
						/* @__PURE__ */ b(zv, { rule: W_ })
					]
				}), /* @__PURE__ */ b(K_, { name: "flow.localChecksFirst" })]
			}) }),
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ b($, {
				title: "Batching",
				blurb: "Run small related tasks together to pay setup and checks once. 1 turns it off.",
				children: /* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b(q_, {
						id: "avoozl-flow-max",
						label: "Most tasks per run",
						raw: "flow.batch.max",
						width: "13rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-flow-max",
							inputMode: "numeric",
							value: d.max,
							placeholder: String(uo.max),
							onChange: (e) => T({ max: e.target.value })
						})
					}), /* @__PURE__ */ b(q_, {
						id: "avoozl-flow-by",
						label: "Group by",
						raw: "flow.batch.by",
						width: "12rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-flow-by",
							value: d.by,
							onChange: (e) => T({ by: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: G_,
							children: [
								/* @__PURE__ */ b("option", {
									value: "",
									children: "Same phase (default)"
								}),
								/* @__PURE__ */ b("option", {
									value: "phase",
									children: "Same phase"
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
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ x($, {
				title: "Retro",
				blurb: "A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.",
				children: [
					/* @__PURE__ */ b(Y, {
						level: 4,
						title: "When it runs"
					}),
					/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						"data-flow-group": "when",
						children: [/* @__PURE__ */ b(q_, {
							id: "avoozl-flow-every",
							label: "After this many tasks",
							raw: "flow.retro.everyTasks",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-every",
								inputMode: "numeric",
								value: d.everyTasks,
								placeholder: String(uo.everyTasks),
								onChange: (e) => T({ everyTasks: e.target.value })
							})
						}), /* @__PURE__ */ b(q_, {
							id: "avoozl-flow-slow",
							label: "Slow when over (× usual)",
							raw: "flow.retro.slowFactor",
							width: "14rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-slow",
								inputMode: "decimal",
								value: d.slowFactor,
								placeholder: String(uo.slowFactor),
								onChange: (e) => T({ slowFactor: e.target.value })
							})
						})]
					}),
					/* @__PURE__ */ b(Y, {
						level: 4,
						title: "Who runs it and what it weighs"
					}),
					/* @__PURE__ */ b("div", {
						className: "flex flex-wrap gap-4",
						"data-flow-group": "model",
						children: /* @__PURE__ */ b(q_, {
							id: "avoozl-flow-model",
							label: "Model",
							raw: "flow.retro.model",
							width: "16rem",
							note: C.error ?? void 0,
							children: /* @__PURE__ */ b("select", {
								id: "avoozl-flow-model",
								value: d.model || uo.model,
								onChange: (e) => T({ model: e.target.value === uo.model ? "" : e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: G_,
								children: Ra(C.list, d.model).map((e) => /* @__PURE__ */ b("option", {
									value: e.value,
									children: e.label
								}, e.value))
							})
						})
					}),
					/* @__PURE__ */ b(U_, {
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
			/* @__PURE__ */ b(J_, { children: /* @__PURE__ */ x($, {
				title: "Lessons",
				blurb: "What retros learned, as short summaries. Lessons stay on this computer and help retros in your other workspaces.",
				children: [
					/* @__PURE__ */ b("div", {
						className: "flex flex-col gap-2",
						"data-flow-group": "lessons",
						children: [["share", "Share this workspace's lessons"], ["read", "Use lessons from other workspaces"]].map(([e, t]) => /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-0.5",
							children: [/* @__PURE__ */ x("label", {
								className: "flex flex-wrap items-center gap-2 text-sm",
								children: [
									/* @__PURE__ */ b("input", {
										type: "checkbox",
										checked: d[e] ? d[e] === "on" : uo[e],
										onChange: (t) => T({ [e]: t.target.checked ? "on" : "off" })
									}),
									/* @__PURE__ */ b("span", {
										className: "font-medium",
										children: t
									}),
									/* @__PURE__ */ b(zv, { rule: W_ })
								]
							}), /* @__PURE__ */ b(K_, { name: `flow.lessons.${e}` })]
						}, e))
					}),
					/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [
							/* @__PURE__ */ b(q_, {
								id: "avoozl-flow-untested",
								label: "Untested lessons expire after (days)",
								raw: "flow.lessons.untestedDays",
								width: "16rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-untested",
									inputMode: "numeric",
									value: d.untestedDays,
									placeholder: String(uo.untestedDays),
									onChange: (e) => T({ untestedDays: e.target.value })
								})
							}),
							/* @__PURE__ */ b(q_, {
								id: "avoozl-flow-confirm",
								label: "Confirm within (days)",
								raw: "flow.lessons.confirmDays",
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-confirm",
									inputMode: "numeric",
									value: d.confirmDays,
									placeholder: String(uo.confirmDays),
									onChange: (e) => T({ confirmDays: e.target.value })
								})
							}),
							/* @__PURE__ */ b(q_, {
								id: "avoozl-flow-review",
								label: "Review lessons every (retros)",
								raw: "flow.lessons.reviewEvery",
								width: "15rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-review",
									inputMode: "numeric",
									value: d.reviewEvery,
									placeholder: String(uo.reviewEvery),
									onChange: (e) => T({ reviewEvery: e.target.value })
								})
							})
						]
					}),
					E > 0 && /* @__PURE__ */ x("p", {
						role: "status",
						className: "text-sm",
						style: { color: "var(--warning, var(--text))" },
						"data-override-warning": !0,
						children: [E === 1 ? "A prompt override is" : `${E} prompt overrides are`, " based on an older built-in text. Review the rebase in Flow › Proposals."]
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
						onClick: () => void O(),
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
// kirocrew-app/ui/src/FieldBox.tsx
function Z_(e) {
	return /* @__PURE__ */ x("fieldset", {
		"data-field-box": e.title,
		className: "flex min-w-0 flex-col gap-2 rounded-lg",
		style: {
			border: "1px solid var(--border)",
			padding: "8px 12px 12px",
			margin: 0
		},
		children: [
			/* @__PURE__ */ b("legend", {
				className: "text-sm font-semibold",
				style: { padding: "0 4px" },
				children: e.title
			}),
			e.blurb && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: e.blurb
			}),
			e.children
		]
	});
}
// kirocrew-app/ui/src/BudgetSettings.tsx
var Q_ = { required: !1 }, $_ = 2e6, ev = 200, tv = (e) => e.toLocaleString("en-US");
function nv(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			width: "100%",
			maxWidth: "16rem"
		},
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(zv, { rule: Q_ })]
			}),
			/* @__PURE__ */ b(g, {
				id: e.id,
				inputMode: "decimal",
				value: e.value,
				placeholder: e.placeholder,
				"aria-describedby": `${e.id}-blank`,
				onChange: (t) => e.onChange(t.target.value)
			}),
			/* @__PURE__ */ x("span", {
				id: `${e.id}-blank`,
				className: "text-xs text-muted",
				children: ["Blank: ", e.fallback]
			}),
			/* @__PURE__ */ b("code", {
				className: "text-[11px] text-muted",
				children: e.raw
			})
		]
	});
}
function rv(e) {
	let { id: t, form: n, fallback: r } = e, i = (t) => e.onChange({
		...n,
		...t
	}), a = (t) => ({
		key: t,
		title: rr[t],
		line: ir[t],
		...t === "warn" && e.warnFields ? { fields: e.warnFields } : {}
	}), o = [
		...e.inherit ? [{
			key: "",
			title: ar(r.from, rr[r.mode]),
			line: `It follows the ${r.from}, and changes when that changes.`
		}] : [],
		a("stop"),
		a("warn")
	], s = e.inherit ? n.mode : n.mode || r.mode;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Z_, {
				title: "Dollar cap",
				children: /* @__PURE__ */ b(nv, {
					id: `${t}-usd`,
					label: "Dollar cap per task",
					value: n.usd,
					fallback: r.usd,
					placeholder: r.short.usd,
					raw: "budget.usd",
					onChange: (e) => i({ usd: e })
				})
			}),
			/* @__PURE__ */ x(Z_, {
				title: "When a task reaches its cap",
				children: [/* @__PURE__ */ b($f, {
					name: `${t}-mode`,
					label: "When a task reaches its cap",
					value: s,
					onChange: (e) => i({ mode: e }),
					sections: o
				}), /* @__PURE__ */ b("code", {
					className: "text-[11px] text-muted",
					children: "budget.mode"
				})]
			}),
			/* @__PURE__ */ b(Mn, {
				title: "Advanced: caps for turns not counted in dollars",
				id: `${t}-advanced`,
				children: /* @__PURE__ */ b(Z_, {
					title: "Caps for turns not counted in dollars",
					blurb: "Avoozl counts most turns in dollars. A model Kiro Crew bills in credits counts against the credit cap. A model with no known price counts against the token cap.",
					children: /* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-3",
						children: [/* @__PURE__ */ b(nv, {
							id: `${t}-tokens`,
							label: "Token cap per task",
							value: n.tokens,
							fallback: r.tokens,
							placeholder: r.short.tokens,
							raw: "budget.tokens",
							onChange: (e) => i({ tokens: e })
						}), /* @__PURE__ */ b(nv, {
							id: `${t}-credits`,
							label: "Credit cap per task",
							value: n.credits,
							fallback: r.credits,
							placeholder: r.short.credits,
							raw: "budget.credits",
							onChange: (e) => i({ credits: e })
						})]
					})
				})
			})
		]
	});
}
function iv(e) {
	let t = [e?.usd == null ? null : `$${e.usd}`, e?.mode ? rr[e.mode] : null].filter(Boolean);
	return t.length ? t.join(", ") : "uses the workspace default";
}
function av({ workspaceId: e }) {
	let n = l(), i = t((t, r = {}) => n.post(ln, {
		operation: t,
		input: r,
		workspaceId: e
	}).then((e) => e.result), [n, e]), { value: a, error: o, reload: s } = da(e, t(() => i("budget.settings.get"), [i])), [u, d] = c({}), [f, h] = c(!1), [g, _] = c({});
	if (r(() => {
		a && (d({
			"": _r(a.budget),
			...Object.fromEntries(Object.entries(a.repositories).map(([e, t]) => [e, _r(t)]))
		}), h(a.budget.notify === !0));
	}, [a]), o) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: o
	});
	if (!a) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let v = u[""] ?? _r(null), y = {
		from: "built-in default",
		usd: "no dollar cap",
		tokens: `${tv($_)} tokens`,
		credits: `${tv(ev)} credits`,
		mode: "stop",
		short: {
			usd: "no cap",
			tokens: tv($_),
			credits: tv(ev)
		}
	}, S = {
		from: "workspace default",
		usd: v.usd ? `the workspace default ($${v.usd})` : "the workspace default (no dollar cap)",
		tokens: `the workspace default (${tv(Number(v.tokens) || $_)} tokens)`,
		credits: `the workspace default (${tv(Number(v.credits) || ev)} credits)`,
		mode: v.mode || "stop",
		short: {
			usd: v.usd ? `$${v.usd}` : "no cap",
			tokens: tv(Number(v.tokens) || $_),
			credits: tv(Number(v.credits) || ev)
		}
	}, C = async (e) => {
		let t = vr(u[e] ?? _r(null));
		if (t.error) return _({
			...g,
			[e]: { error: t.error }
		});
		let n = {
			...t.budget ?? {},
			...!e && f ? { notify: !0 } : {}
		};
		try {
			await i("budget.settings.update", {
				budget: n,
				...e ? { repository: e } : {},
				expectedHash: a.hash
			}), await s(), _({
				...g,
				[e]: { ok: "Saved." }
			});
		} catch (t) {
			_({
				...g,
				[e]: { error: K(t) }
			});
		}
	}, w = (e) => g[e] && /* @__PURE__ */ b("p", {
		role: g[e].error ? "alert" : "status",
		className: "text-sm",
		style: g[e].error ? { color: "var(--danger)" } : void 0,
		children: g[e].error ?? g[e].ok
	}), T = {
		page: "Settings › Budgets",
		says: "A spending cap per task for the workspace and each repository, and what happens when a task reaches it. Blank fields use the default.",
		settings: cr({
			budget: {
				usd: v.usd,
				mode: v.mode,
				tokens: v.tokens,
				credits: v.credits,
				notify: f
			},
			projects: Object.fromEntries(Object.keys(a.repositories).map((e) => {
				let t = u[e] ?? _r(null);
				return [e, { budget: {
					usd: t.usd,
					mode: t.mode,
					tokens: t.tokens,
					credits: t.credits
				} }];
			})),
			defaults: `no dollar cap, Stop, ${tv($_)} tokens, ${tv(ev)} credits, no notice`
		}),
		docs: sr
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		"data-budget-settings": !0,
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-2",
				children: /* @__PURE__ */ b(Fn, {
					workspaceId: e,
					help: T
				})
			}),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-3",
				children: /* @__PURE__ */ x($, {
					title: "Workspace default",
					blurb: "Each task's cap, unless its repository, spec or task sets its own. Retries, checks and reviews share the task's cap. Receipts are kept even with no cap.",
					children: [/* @__PURE__ */ b(rv, {
						id: "budget-workspace",
						form: v,
						onChange: (e) => d({
							...u,
							"": e
						}),
						fallback: y,
						inherit: !1,
						warnFields: /* @__PURE__ */ x("label", {
							className: "flex items-start gap-2 text-sm",
							children: [/* @__PURE__ */ b("input", {
								type: "checkbox",
								checked: f,
								onChange: (e) => h(e.target.checked),
								style: { marginTop: 3 }
							}), /* @__PURE__ */ x("span", { children: [
								"Also send a Kiro Crew notice when a task goes over budget",
								" ",
								/* @__PURE__ */ b(zv, { rule: Q_ }),
								/* @__PURE__ */ b("code", {
									className: "block text-[11px] text-muted",
									children: "budget.notify"
								})
							] })]
						})
					}), /* @__PURE__ */ x("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [/* @__PURE__ */ b(p, {
							type: "button",
							primary: !0,
							onClick: () => void C(""),
							children: "Save"
						}), w("")]
					})]
				})
			}),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-3",
				children: /* @__PURE__ */ b($, {
					title: "Repositories",
					blurb: "A repository can set its own cap for its tasks. A blank field uses the workspace default.",
					children: Object.keys(a.repositories).length === 0 ? /* @__PURE__ */ x("p", {
						className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted",
						children: [/* @__PURE__ */ b("span", { children: "No repository is in .avoozl.json yet. Add one under Repositories." }), /* @__PURE__ */ b(Fn, {
							workspaceId: e,
							help: {
								page: "Settings › Budgets",
								section: "Repositories",
								says: "No repository is in .avoozl.json yet. Add one under Repositories.",
								settings: [{
									key: "repositories",
									value: "none"
								}],
								docs: "README.md, section Create a workspace"
							}
						})]
					}) : Object.keys(a.repositories).sort().map((e) => /* @__PURE__ */ b(Mn, {
						id: `budget-repo-${e}`,
						title: /* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-baseline gap-x-2",
							children: [/* @__PURE__ */ b("span", { children: e }), /* @__PURE__ */ b("span", {
								className: "text-xs font-normal text-muted",
								children: iv(a.repositories[e])
							})]
						}),
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [/* @__PURE__ */ b(rv, {
								id: `budget-${e}`,
								form: u[e] ?? _r(null),
								onChange: (t) => d({
									...u,
									[e]: t
								}),
								fallback: S,
								inherit: !0
							}), /* @__PURE__ */ x("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [/* @__PURE__ */ x(p, {
									type: "button",
									primary: !0,
									onClick: () => void C(e),
									children: ["Save ", e]
								}), w(e)]
							})]
						})
					}, e))
				})
			})
		]
	});
}
var ov = {
	override: "Your price",
	default: "Built-in price",
	credits: "Credits",
	none: "No price"
};
function sv({ workspaceId: e }) {
	let n = l(), i = o(() => Dr(n), [n]), { value: a, error: s, reload: u } = da(e, t((e) => i.prices(e), [i])), [d, f] = c([]), [h, _] = c({
		creditUsd: "",
		rows: []
	}), [v, S] = c(null);
	if (r(() => {
		n.get("/api/models").then((e) => f(La(e).map((e) => e.value).filter((e) => e !== "auto")), () => f([]));
	}, [n]), r(() => {
		a && _(Tr(a, d));
	}, [a, d]), s) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: s
	});
	if (!a) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Loading…"
	});
	let C = async () => {
		let t = Er(h);
		if (t.error) return S({ error: t.error });
		try {
			let n = await i.savePrices(e, t.input, a.hash);
			await u(), S({ ok: `Saved as version ${n.version}.` });
		} catch (e) {
			S({ error: K(e) });
		}
	}, w = (e, t) => _({
		...h,
		rows: h.rows.map((n, r) => r === e ? {
			...n,
			...t
		} : n)
	}), T = wr(a, d), E = Object.keys(a.models).length + (a.creditUsd == null ? 0 : 1), D = {
		page: "Settings › Prices",
		says: "Avoozl prices models with a built-in list on its own. This page shows how each model is budgeted, and holds optional price overrides for this computer.",
		settings: [
			{
				key: "prices last updated",
				value: a.defaults?.updated ?? "built-in prices off"
			},
			...T.map((e) => ({
				key: `model ${e.model}`,
				value: e.text
			})),
			...cr({ prices: {
				creditUsd: a.creditUsd,
				...Object.fromEntries(Object.entries(a.models).map(([e, t]) => [`models.${e}`, `$${t.inputPerMTokUsd} in, $${t.outputPerMTokUsd} out per million tokens`]))
			} })
		],
		docs: sr
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		"data-prices-settings": !0,
		children: [/* @__PURE__ */ b("div", {
			className: "flex flex-wrap items-center gap-2",
			children: /* @__PURE__ */ b(Fn, {
				workspaceId: e,
				help: D
			})
		}), /* @__PURE__ */ b(m, {
			className: "flex flex-col gap-3",
			children: /* @__PURE__ */ x($, {
				title: "Prices",
				blurb: "Avoozl turns each model's use into dollars with a built-in list of public prices. You do not need to enter any.",
				children: [
					a.error && /* @__PURE__ */ b("p", {
						role: "alert",
						className: "text-sm",
						style: { color: "var(--danger)" },
						children: a.error
					}),
					/* @__PURE__ */ x("p", {
						className: "text-sm",
						"data-prices-updated": !0,
						children: [Sr(a), a.defaults?.sources[0] && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b("a", {
							href: Z(a.defaults.sources[0]),
							target: "_blank",
							rel: "noreferrer",
							style: { color: "var(--accent)" },
							children: "Source"
						})] })]
					}),
					/* @__PURE__ */ b(Z_, {
						title: "Models in use",
						blurb: "How each model's use counts toward a task's budget.",
						children: T.length === 0 ? /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "No models yet. They show here once Kiro Crew lists them or a task uses one."
						}) : /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-2",
							"aria-label": "Models in use",
							children: T.map((e) => /* @__PURE__ */ x("li", {
								"data-model-row": e.kind,
								className: "flex min-w-0 flex-col gap-0.5 border-t pt-2 text-sm",
								style: { borderColor: "var(--border)" },
								children: [/* @__PURE__ */ x("span", {
									className: "flex flex-wrap items-center gap-2",
									children: [/* @__PURE__ */ b("span", {
										className: "font-medium",
										style: { overflowWrap: "anywhere" },
										children: e.model
									}), /* @__PURE__ */ b(G, {
										variant: e.kind === "none" ? "warning" : void 0,
										children: ov[e.kind]
									})]
								}), /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: e.text
								})]
							}, e.model))
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "price-overrides",
						title: /* @__PURE__ */ x("span", {
							className: "flex flex-wrap items-baseline gap-x-2",
							children: [/* @__PURE__ */ b("span", { children: "Override prices" }), /* @__PURE__ */ b("span", {
								className: "text-xs font-normal text-muted",
								children: E ? `${E} set` : "optional"
							})]
						}),
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [
								/* @__PURE__ */ x("p", {
									className: "text-xs text-muted",
									children: [
										"Only if you pay a different price than the list price. A blank field uses the built-in price. Overrides stay on this computer.",
										" ",
										a.version ? `Version ${a.version}${a.savedAt ? `, saved ${new Date(a.savedAt).toLocaleString()}` : ""}.` : ""
									]
								}),
								/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(G, { children: "This computer only" }) }),
								/* @__PURE__ */ b(Z_, {
									title: "Kiro credits",
									blurb: "Kiro Crew bills some models in credits. With no price here, those turns count against the credit cap in Settings › Budgets.",
									children: /* @__PURE__ */ x("div", {
										className: "flex min-w-0 flex-col gap-1 text-sm",
										style: { maxWidth: "16rem" },
										children: [
											/* @__PURE__ */ x("label", {
												htmlFor: "price-credit",
												className: "flex flex-wrap items-baseline gap-x-2",
												children: [/* @__PURE__ */ b("span", {
													className: "font-medium",
													children: "Dollars per credit"
												}), /* @__PURE__ */ b(zv, { rule: Q_ })]
											}),
											/* @__PURE__ */ b(g, {
												id: "price-credit",
												inputMode: "decimal",
												value: h.creditUsd,
												placeholder: "count in credits",
												onChange: (e) => _({
													...h,
													creditUsd: e.target.value
												})
											}),
											/* @__PURE__ */ b("code", {
												className: "text-[11px] text-muted",
												children: "prices.creditUsd"
											})
										]
									})
								}),
								h.rows.length > 0 && /* @__PURE__ */ b(Z_, {
									title: "Token prices",
									blurb: "Dollars per million tokens.",
									children: /* @__PURE__ */ b("ul", {
										className: "flex flex-col gap-2",
										"aria-label": "Token price overrides",
										children: h.rows.map((e, t) => /* @__PURE__ */ x("li", {
											className: "flex flex-wrap items-end gap-2 border-t pt-2 text-sm",
											style: { borderColor: "var(--border)" },
											children: [
												/* @__PURE__ */ b("span", {
													className: "font-medium",
													style: {
														flex: "1 1 12rem",
														minWidth: 0,
														overflowWrap: "anywhere"
													},
													children: e.model
												}),
												/* @__PURE__ */ x("label", {
													className: "flex flex-col gap-0.5 text-xs",
													style: { width: "8rem" },
													children: ["Input", /* @__PURE__ */ b(g, {
														"aria-label": `${e.model} dollars per million input tokens`,
														inputMode: "decimal",
														value: e.input,
														placeholder: e.defaultInput ? `$${e.defaultInput} built-in` : "no price",
														onChange: (e) => w(t, { input: e.target.value })
													})]
												}),
												/* @__PURE__ */ x("label", {
													className: "flex flex-col gap-0.5 text-xs",
													style: { width: "8rem" },
													children: ["Output", /* @__PURE__ */ b(g, {
														"aria-label": `${e.model} dollars per million output tokens`,
														inputMode: "decimal",
														value: e.output,
														placeholder: e.defaultOutput ? `$${e.defaultOutput} built-in` : "no price",
														onChange: (e) => w(t, { output: e.target.value })
													})]
												})
											]
										}, e.model))
									})
								}),
								/* @__PURE__ */ x("div", {
									className: "flex flex-wrap items-center gap-2",
									children: [/* @__PURE__ */ b(p, {
										type: "button",
										primary: !0,
										onClick: () => void C(),
										children: "Save overrides"
									}), v && /* @__PURE__ */ b("p", {
										role: v.error ? "alert" : "status",
										className: "text-sm",
										style: v.error ? { color: "var(--danger)" } : void 0,
										children: v.error ?? v.ok
									})]
								})
							]
						})
					})
				]
			})
		})]
	});
}
// kirocrew-app/ui/src/DeliverySettings.tsx
var cv = { required: !1 }, lv = "The tick starts no ready task until delivery is on. Its agent, model and pull request settings show here then.", uv = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function dv({ name: e }) {
	return /* @__PURE__ */ b("code", {
		className: "text-[11px] text-muted",
		style: {
			overflowWrap: "anywhere",
			opacity: .8
		},
		children: e
	});
}
function fv(e) {
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
				}), /* @__PURE__ */ b(zv, { rule: cv })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(dv, { name: e.raw })
		]
	});
}
function pv({ workspaceId: e, onOpenRouting: n }) {
	let i = l(), a = o(() => (t, n = {}) => i.post(ln, {
		operation: t,
		input: n,
		workspaceId: e
	}).then((e) => e.result), [i, e]), { value: s, error: u, reload: d } = da(e, t(() => a("delivery.settings.get"), [a])), [f, h] = c(Tu()), [_, v] = c([]), [y, S] = c(null), [C, w] = c(!1), T = On();
	r(() => {
		let e = !0;
		return i.get("/api/models").then((t) => e && v(La(t)), () => e && v([])), () => {
			e = !1;
		};
	}, [i]), r(() => {
		s && h(Tu(s.delivery));
	}, [s]);
	let E = (e) => h({
		...f,
		...e
	}), D = async () => {
		if (!s) return;
		let e = Eu(f);
		if (e.error) return S({ error: e.error });
		S(null);
		try {
			await a("delivery.settings.update", {
				delivery: e.delivery,
				expectedHash: s.hash
			}), await d(), S({ ok: "Saved." });
		} catch (e) {
			S({ error: K(e) });
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
	let O = async () => {
		if (await T({
			title: "Turn on delivery?",
			body: "The tick starts ready tasks in Kiro Crew chats, about once a minute, with the default agent and model. Stop the line or Defer pauses them.",
			action: "Turn on delivery"
		})) {
			w(!0), S(null);
			try {
				await a("delivery.settings.update", {
					delivery: {},
					expectedHash: s.hash,
					turnOn: !0
				}), await d();
			} catch (e) {
				S({ error: K(e) });
			} finally {
				w(!1);
			}
		}
	};
	if (!s.on) return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b($, {
		title: "Delivery is off",
		blurb: lv,
		children: /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-3",
			"data-delivery-off": !0,
			children: [
				/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					disabled: C,
					onClick: () => void O(),
					"data-turn-on-delivery": !0,
					children: C ? "Turning on…" : "Turn on delivery"
				}),
				/* @__PURE__ */ b(Fn, {
					workspaceId: e,
					help: {
						page: "Settings › Delivery",
						section: "Delivery is off",
						says: `${lv} A Turn on delivery button writes a default delivery section.`,
						settings: [{
							key: "delivery",
							value: "not set (delivery is off)"
						}, {
							key: "saved in",
							value: ".avoozl.json, through this page"
						}],
						docs: "README.md, sections Deliver locally and Deliver through GitHub"
					}
				}),
				y?.error && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "text-sm text-danger",
					children: y.error
				})
			]
		})
	}) });
	let k = f.prFeedback ? f.prFeedback === "on" : wu.prFeedback;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-delivery-settings": !0,
		children: [/* @__PURE__ */ x(m, {
			className: "flex flex-col gap-4",
			children: [/* @__PURE__ */ x($, {
				title: "Writer",
				blurb: "The agent and model worker chats open on, unless the routing prompt or the task picks another.",
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-4",
					children: [/* @__PURE__ */ b(fv, {
						id: "avoozl-delivery-agent",
						label: "Agent",
						raw: "delivery.agent",
						width: "16rem",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-delivery-agent",
							value: f.agent,
							placeholder: wu.agent,
							onChange: (e) => E({ agent: e.target.value })
						})
					}), /* @__PURE__ */ b(fv, {
						id: "avoozl-delivery-model",
						label: "Model",
						raw: "delivery.model",
						width: "18rem",
						note: "Review roles that must differ from the writer need a named model.",
						children: /* @__PURE__ */ b("select", {
							id: "avoozl-delivery-model",
							value: f.model || "auto",
							onChange: (e) => E({ model: e.target.value === "auto" ? "" : e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: uv,
							children: Ra(_, f.model).map((e) => /* @__PURE__ */ b("option", {
								value: e.value,
								children: e.label
							}, e.value))
						})
					})]
				}), /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					children: [
						"Spreading tasks across crews and models is the routing prompt's job; a task's manifest can pin one.",
						" ",
						n ? /* @__PURE__ */ b("button", {
							type: "button",
							className: "underline",
							onClick: n,
							children: "Open Routing"
						}) : "Set it on the Routing tab."
					]
				})]
			}), /* @__PURE__ */ x($, {
				title: "Pull request feedback",
				blurb: "Send failed checks and allowed reviewers' comments back to the chat that wrote the pull request. Matters only in a GitHub mode.",
				children: [
					/* @__PURE__ */ x("label", {
						className: "flex flex-wrap items-center gap-2 text-sm",
						children: [
							/* @__PURE__ */ b("input", {
								type: "checkbox",
								checked: k,
								onChange: (e) => E({ prFeedback: e.target.checked ? "on" : "off" })
							}),
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								children: "Send pull request feedback to the writer"
							}),
							/* @__PURE__ */ b(zv, { rule: cv })
						]
					}),
					/* @__PURE__ */ b(dv, { name: "delivery.prFeedback" }),
					/* @__PURE__ */ b(fv, {
						id: "avoozl-delivery-rounds",
						label: "Most feedback rounds per task",
						raw: "delivery.feedbackRounds",
						width: "16rem",
						note: "Then Avoozl stops and asks you.",
						children: /* @__PURE__ */ b(g, {
							id: "avoozl-delivery-rounds",
							inputMode: "numeric",
							value: f.feedbackRounds,
							placeholder: String(wu.feedbackRounds),
							onChange: (e) => E({ feedbackRounds: e.target.value })
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
					onClick: () => void D(),
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
// kirocrew-app/ui/src/RoutingView.tsx
var mv = { required: !1 }, hv = { required: !0 }, gv = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, _v = {
	padding: "6px 8px",
	textAlign: "left",
	verticalAlign: "top"
}, vv = { color: "var(--warning, #b45309)" };
function yv({ name: e }) {
	return /* @__PURE__ */ b("code", {
		className: "text-[11px] text-muted",
		style: {
			overflowWrap: "anywhere",
			opacity: .8
		},
		children: e
	});
}
function bv(e) {
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
				}), /* @__PURE__ */ b(zv, { rule: e.required ? hv : mv })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			e.raw && /* @__PURE__ */ b(yv, { name: e.raw })
		]
	});
}
function xv() {
	let e = l(), [t, n] = c([]);
	return r(() => {
		let t = !0;
		return e.get("/api/models").then((e) => t && n(La(e)), () => t && n([])), () => {
			t = !1;
		};
	}, [e]), t;
}
function Sv(e) {
	return e.message?.error ? /* @__PURE__ */ b("span", {
		role: "alert",
		className: "text-sm text-danger",
		children: e.message.error
	}) : e.message?.ok ? /* @__PURE__ */ b("span", {
		role: "status",
		className: "text-sm text-muted",
		children: e.message.ok
	}) : null;
}
function Cv(e) {
	let t = l(), n = o(() => Wi(t), [t]), r = xv(), [i, a] = c(e.view.switchedOn), [s, u] = c(e.view.prompt ?? ""), [d, f] = c(e.view.model ?? ""), [m, h] = c(null), g = async () => {
		h(null);
		let t = Mi({
			enabled: i,
			prompt: s,
			model: d
		});
		if (t.error) return h({ error: t.error });
		try {
			await n.save(e.workspaceId, {
				routing: t.routing,
				expectedHash: e.view.machineHash
			}), await e.onSaved(), h({ ok: "Saved." });
		} catch (e) {
			h({ error: K(e) });
		}
	}, _ = e.view.lastCall;
	return /* @__PURE__ */ x($, {
		title: "Routing prompt",
		blurb: "Tell the routing agent how to choose. It only picks among crews and models that pass the checks below.",
		children: [
			/* @__PURE__ */ x("label", {
				className: "flex items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ b("input", {
						type: "checkbox",
						role: "switch",
						"aria-checked": i,
						checked: i,
						onChange: (e) => a(e.target.checked)
					}),
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: "On"
					}),
					/* @__PURE__ */ b(zv, { rule: mv }),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: i ? "One call each tick ranks every ready task. A bad or missing reply falls back to local." : ki
					})
				]
			}),
			/* @__PURE__ */ b(bv, {
				id: "avoozl-routing-prompt",
				label: "Prompt",
				raw: "routing.prompt",
				note: `Saved on this machine only. At most ${Di} characters. A crew or model pinned in a task's manifest still wins.`,
				children: /* @__PURE__ */ b("textarea", {
					id: "avoozl-routing-prompt",
					rows: 5,
					value: s,
					maxLength: Di,
					placeholder: "Tests go remote. Everything else stays local.",
					onChange: (e) => u(e.target.value),
					className: "rounded border px-2 py-1 text-sm",
					style: {
						...gv,
						width: "100%",
						maxWidth: "48rem"
					}
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-col gap-1",
				children: [
					/* @__PURE__ */ b("span", {
						className: "text-sm font-medium",
						children: "Examples"
					}),
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: "Insert one, then edit it."
					}),
					/* @__PURE__ */ b("div", {
						className: "flex flex-wrap gap-2",
						"data-examples": !0,
						children: e.view.examples.map((e) => /* @__PURE__ */ b(q, {
							icon: ke,
							tooltip: e.text,
							onClick: () => u(ji(s, e)),
							children: e.title
						}, e.id))
					})
				]
			}),
			/* @__PURE__ */ b(bv, {
				id: "avoozl-routing-model",
				label: "Routing agent's model",
				raw: "routing.model",
				width: "18rem",
				children: /* @__PURE__ */ b("select", {
					id: "avoozl-routing-model",
					value: d || "auto",
					onChange: (e) => f(e.target.value === "auto" ? "" : e.target.value),
					className: "rounded border px-2 py-1 text-sm",
					style: gv,
					children: Ra(r, d).map((e) => /* @__PURE__ */ b("option", {
						value: e.value,
						children: e.label
					}, e.value))
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(p, {
					type: "button",
					primary: !0,
					onClick: () => void g(),
					children: "Save"
				}), /* @__PURE__ */ b(Sv, { message: m })]
			}),
			_ && /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				"data-last-call": !0,
				children: [
					"Last call ",
					_.id,
					": ",
					_.tasks,
					" task",
					_.tasks === 1 ? "" : "s",
					", ",
					_.state === "fallback" || _.state === "used" && _.why ? `fell back to local (${_.why})` : _.state,
					"."
				]
			})
		]
	});
}
function wv(e) {
	let t = l(), n = o(() => Wi(t), [t]), i = e.view.providers, a = () => ({
		lowPercent: i.lowPercent === null ? "" : String(i.lowPercent),
		limits: Object.fromEntries(i.rows.map((e) => [e.provider, i.limits[e.provider]?.credits ? String(i.limits[e.provider].credits) : ""]))
	}), [s, u] = c(a), [d, f] = c(null);
	r(() => u(a()), [e.view]);
	let m = async () => {
		f(null);
		let t = Ni(s, i.limits);
		if (t.error) return f({ error: t.error });
		try {
			await n.saveProviders(e.workspaceId, {
				providers: t.providers,
				expectedHash: i.hash
			}), await e.onSaved(), f({ ok: "Saved." });
		} catch (e) {
			f({ error: K(e) });
		}
	};
	return /* @__PURE__ */ x($, {
		title: "Providers",
		blurb: "Health and usage in the last 5 hours, read live. Out is never offered; low is a fact the prompt can weigh. A running chat switches model only when its provider is out.",
		actions: /* @__PURE__ */ b(Fn, {
			workspaceId: e.workspaceId,
			help: {
				page: "Settings › Routing",
				section: "Providers",
				says: "When a provider counts as low or out, from its credit limit per 5 hours. Blank fields use the default.",
				settings: cr({
					providers: {
						lowPercent: s.lowPercent,
						limits: Object.entries(s.limits).filter(([, e]) => e.trim()).map(([e, t]) => `${e} ${t} credits`)
					},
					defaults: `low at ${i.defaultLowPercent}%, no limits`
				}),
				docs: sr
			}
		}),
		children: [i.rows.length ? /* @__PURE__ */ b("div", {
			style: { overflowX: "auto" },
			children: /* @__PURE__ */ x("table", {
				className: "text-sm",
				style: {
					borderCollapse: "collapse",
					width: "100%"
				},
				"data-providers": !0,
				children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ b("tr", {
					className: "text-xs text-muted",
					children: [
						"Provider",
						"Health",
						"Usage",
						"Limit (credits per 5 h)"
					].map((e) => /* @__PURE__ */ b("th", {
						style: _v,
						children: e
					}, e))
				}) }), /* @__PURE__ */ b("tbody", { children: i.rows.map((e) => /* @__PURE__ */ x("tr", {
					style: { borderTop: "1px solid var(--border)" },
					"data-provider": e.provider,
					children: [
						/* @__PURE__ */ b("td", {
							style: _v,
							className: "font-medium",
							children: e.provider
						}),
						/* @__PURE__ */ x("td", {
							style: {
								..._v,
								...e.level === "out" ? vv : {}
							},
							children: [Pi(e.level), e.why && e.level !== "ok" ? /* @__PURE__ */ b("span", {
								className: "block text-xs text-muted",
								children: e.why
							}) : null]
						}),
						/* @__PURE__ */ b("td", {
							style: _v,
							children: Fi(e)
						}),
						/* @__PURE__ */ b("td", {
							style: {
								..._v,
								width: "10rem"
							},
							children: /* @__PURE__ */ b(g, {
								"aria-label": `${e.provider} limit in credits per 5 hours`,
								inputMode: "decimal",
								value: s.limits[e.provider] ?? "",
								placeholder: "none",
								onChange: (t) => u({
									...s,
									limits: {
										...s.limits,
										[e.provider]: t.target.value
									}
								})
							})
						})
					]
				}, e.provider)) })]
			})
		}) : /* @__PURE__ */ b("p", {
			className: "text-xs text-muted",
			children: "No provider has usage or a health mark yet."
		}), /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-end gap-3",
			children: [
				/* @__PURE__ */ b(bv, {
					id: "avoozl-providers-low",
					label: "Low at (% of limit)",
					raw: "providers.lowPercent",
					width: "12rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-providers-low",
						inputMode: "numeric",
						value: s.lowPercent,
						placeholder: String(i.defaultLowPercent),
						onChange: (e) => u({
							...s,
							lowPercent: e.target.value
						})
					})
				}),
				/* @__PURE__ */ b(p, {
					type: "button",
					onClick: () => void m(),
					children: "Save"
				}),
				/* @__PURE__ */ b(Sv, { message: d })
			]
		})]
	});
}
function Tv(e) {
	let [t, n] = c(Bi(e.crew)), [r, i] = c(null), a = (e) => n({
		...t,
		...e
	}), o = e.crew.id === "local";
	return /* @__PURE__ */ b($n, {
		id: "avoozl-crew-dialog",
		title: `Crew ${e.crew.name}`,
		unsaved: JSON.stringify(t) !== JSON.stringify(Bi(e.crew)) && {
			title: `Discard your changes to ${e.crew.name}?`,
			body: "Every edit in this dialog is lost.",
			action: "Discard changes"
		},
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
				/* @__PURE__ */ b(bv, {
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
						style: gv,
						children: [/* @__PURE__ */ b("option", {
							value: "remote",
							children: "remote"
						}), /* @__PURE__ */ b("option", {
							value: "local",
							children: "local"
						})]
					})
				}),
				/* @__PURE__ */ b(bv, {
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
				!o && /* @__PURE__ */ b(bv, {
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
				/* @__PURE__ */ b(bv, {
					id: "avoozl-crew-limit",
					label: "Chat limit",
					raw: `crews.${e.crew.id}.chatLimit`,
					note: "Avoozl chats at once on this crew.",
					width: "10rem",
					children: /* @__PURE__ */ b(g, {
						id: "avoozl-crew-limit",
						inputMode: "numeric",
						value: t.chatLimit,
						placeholder: zi(e.crew),
						onChange: (e) => a({ chatLimit: e.target.value })
					})
				}),
				!o && /* @__PURE__ */ x(y, { children: [
					/* @__PURE__ */ b(bv, {
						id: "avoozl-crew-delivery",
						label: "Work comes back by",
						raw: `crews.${e.crew.id}.delivery`,
						width: "20rem",
						children: /* @__PURE__ */ x("select", {
							id: "avoozl-crew-delivery",
							value: t.delivery,
							onChange: (e) => a({ delivery: e.target.value }),
							className: "rounded border px-2 py-1 text-sm",
							style: gv,
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
					/* @__PURE__ */ b(bv, {
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
					/* @__PURE__ */ b(bv, {
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
function Ev(e) {
	let t = l(), n = o(() => Wi(t), [t]), [i, a] = c(null), [s, u] = c(e.view.staleSeconds === null ? "" : String(e.view.staleSeconds)), [d, f] = c(null);
	r(() => u(e.view.staleSeconds === null ? "" : String(e.view.staleSeconds)), [e.view.staleSeconds]);
	let m = async (t) => {
		await n.saveCrews(e.workspaceId, {
			crews: t,
			expectedHash: e.view.machineHash
		}), await e.onSaved();
	}, h = async () => {
		f(null);
		let t = s.trim() ? Number(s) : null;
		if (t !== null && (!Number.isInteger(t) || t < 10 || t > 3600)) return f({ error: "Stale after is a whole number of seconds, 10–3600." });
		try {
			await n.saveCrews(e.workspaceId, {
				staleSeconds: t,
				expectedHash: e.view.machineHash
			}), await e.onSaved(), f({ ok: "Saved." });
		} catch (e) {
			f({ error: K(e) });
		}
	};
	return /* @__PURE__ */ x($, {
		title: "Crews",
		blurb: "Machines that can run Avoozl chats, with the checks every option must pass. Tags and limits stay on this machine.",
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
							"Chats",
							"Load",
							"Memory",
							...Object.values(Ai),
							""
						].map((e) => /* @__PURE__ */ b("th", {
							style: _v,
							children: e
						}, e))
					}) }), /* @__PURE__ */ b("tbody", { children: e.view.crews.map((t) => {
						let n = Ii(t);
						return /* @__PURE__ */ x("tr", {
							style: { borderTop: "1px solid var(--border)" },
							"data-crew": t.id,
							children: [
								/* @__PURE__ */ x("td", {
									style: {
										..._v,
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
										/* @__PURE__ */ b("span", {
											className: "block text-xs text-muted",
											children: t.trust
										})
									]
								}),
								/* @__PURE__ */ b("td", {
									style: _v,
									children: t.tags.filter((e) => !e.startsWith("trust:")).join(" ") || /* @__PURE__ */ b("span", {
										className: "text-muted",
										children: "none"
									})
								}),
								/* @__PURE__ */ x("td", {
									style: _v,
									children: [
										t.running,
										"/",
										t.chatLimit
									]
								}),
								/* @__PURE__ */ b("td", {
									style: _v,
									children: n.load
								}),
								/* @__PURE__ */ b("td", {
									style: _v,
									children: n.mem
								}),
								t.checks.map((e) => /* @__PURE__ */ b("td", {
									style: _v,
									className: e.ok ? void 0 : "text-muted",
									"data-check": e.check,
									children: Li(e)
								}, e.check)),
								/* @__PURE__ */ b("td", {
									style: {
										..._v,
										textAlign: "right",
										whiteSpace: "nowrap"
									},
									children: /* @__PURE__ */ x("span", {
										className: "inline-flex gap-1.5",
										children: [/* @__PURE__ */ b(J, {
											icon: De,
											label: `Edit ${t.name}`,
											tooltip: "Edit tags, limit, and hand-back",
											onClick: () => a(t)
										}), t.configured && /* @__PURE__ */ b(An, {
											icon: Re,
											label: `Remove settings for ${t.name}`,
											tooltip: "Clear this machine's settings for the crew",
											confirm: {
												title: `Remove settings for ${t.name}?`,
												body: "Clears its tags, limits, and hand-back on this machine. The crew stays connected to Kiro Crew.",
												action: "Remove"
											},
											onConfirm: () => {
												let n = Ui(e.view.crews);
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
				children: "Remote crews wait on Kiro Crew (MC-10). Every chat runs on local."
			}),
			/* @__PURE__ */ b(bv, {
				id: "avoozl-stale",
				label: "Stale after (seconds)",
				raw: "crewStaleSeconds",
				note: "A crew whose reading is older is not online.",
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
						/* @__PURE__ */ b(Sv, { message: d })
					]
				})
			}),
			i && /* @__PURE__ */ b(Tv, {
				crew: i,
				onCancel: () => a(null),
				onSave: async (t) => {
					let n = Hi(i.id, t);
					if (n.error) return n.error;
					try {
						return await m({
							...Ui(e.view.crews),
							[i.id]: n.entry
						}), a(null), null;
					} catch (e) {
						return K(e);
					}
				}
			})
		]
	});
}
function Dv(e) {
	let t = l(), n = o(() => Wi(t), [t]), [r, i] = c(null), [a, s] = c(null), u = () => n.preview(e.workspaceId).then((e) => {
		i(e), s(null);
	}, (e) => s(K(e)));
	return /* @__PURE__ */ x($, {
		title: "Preview",
		blurb: "A dry run on the ready tasks now: what passes the checks, and what the routing agent would get. Opens nothing and calls no agent.",
		actions: /* @__PURE__ */ b(p, {
			type: "button",
			onClick: () => void u(),
			children: "Preview"
		}),
		children: [
			a && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: a
			}),
			r === null ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Press Preview to see each ready task's options and what happens to it."
			}) : r.items.length ? /* @__PURE__ */ b("ul", {
				className: "flex flex-col text-sm",
				style: {
					listStyle: "none",
					margin: 0,
					padding: 0
				},
				"data-preview": !0,
				children: r.items.map((e, t) => /* @__PURE__ */ x("li", {
					style: {
						borderTop: t ? "1px solid var(--border)" : void 0,
						padding: "6px 0"
					},
					"data-preview-task": e.taskId,
					children: [
						/* @__PURE__ */ x("span", {
							className: "flex flex-wrap gap-x-3",
							children: [/* @__PURE__ */ x("span", {
								className: "font-medium",
								children: [
									e.taskId,
									" ",
									e.title
								]
							}), /* @__PURE__ */ x("span", {
								style: e.noFit ? vv : void 0,
								children: [e.outcome.crew ? `${e.outcome.crew} / ${e.outcome.model ?? "default"}: ` : "", e.noFit ? `Needs you: ${e.outcome.text}` : e.outcome.text]
							})]
						}),
						e.options.length > 1 && /* @__PURE__ */ x("span", {
							className: "block text-xs text-muted",
							children: ["options: ", e.options.map(Ri).join("; ")]
						}),
						e.removed.length > 0 && /* @__PURE__ */ x("span", {
							className: "block text-xs text-muted",
							children: ["ruled out: ", e.removed.map((e) => `${e.crew ?? e.model} (${e.by})`).join("; ")]
						})
					]
				}, e.taskId))
			}) : /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "No task is ready now."
			}),
			r?.brief && /* @__PURE__ */ x("details", {
				className: "text-sm",
				"data-brief": !0,
				children: [/* @__PURE__ */ b("summary", { children: "What the routing agent would get" }), /* @__PURE__ */ b("pre", {
					className: "text-xs",
					style: {
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
						maxHeight: "24rem",
						overflowY: "auto"
					},
					children: r.brief
				})]
			})
		]
	});
}
function Ov({ workspaceId: e }) {
	let n = e ?? "", r = l(), i = o(() => Wi(r), [r]), { value: a, error: s, reload: c } = da(e, t((e) => i.view(e), [i])), u = async () => {
		await c();
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-routing": !0,
		children: [s && /* @__PURE__ */ b("p", {
			role: "alert",
			className: "text-sm text-danger",
			children: s
		}), a ? /* @__PURE__ */ x(y, { children: [
			a.noFit.length > 0 && /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b("p", {
				className: "text-sm",
				style: vv,
				"data-no-fit": !0,
				children: a.noFit.length === 1 ? `No crew fits ${a.noFit[0].taskId}: ${a.noFit[0].text}.` : `No crew fits ${a.noFit.length} tasks: ${a.noFit.map((e) => e.taskId).join(", ")}.`
			}) }),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-4",
				children: /* @__PURE__ */ b(Cv, {
					view: a,
					workspaceId: n,
					onSaved: u
				})
			}),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-4",
				children: /* @__PURE__ */ b(wv, {
					view: a,
					workspaceId: n,
					onSaved: u
				})
			}),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-4",
				children: /* @__PURE__ */ b(Ev, {
					view: a,
					workspaceId: n,
					onSaved: u
				})
			}),
			/* @__PURE__ */ b(m, {
				className: "flex flex-col gap-4",
				children: /* @__PURE__ */ b(Dv, { workspaceId: n })
			})
		] }) : !s && /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "Loading…"
		})]
	});
}
// kirocrew-app/ui/src/SettingsView.tsx
var kv = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, Av = (e = 220) => ({
	display: "grid",
	gap: 12,
	gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${e}px), 1fr))`,
	alignItems: "start"
}), jv = {
	sm: "9rem",
	md: "18rem",
	lg: "28rem"
}, Mv = [
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
	},
	{
		key: "budgets",
		label: "Budgets"
	},
	{
		key: "prices",
		label: "Prices"
	},
	{
		key: "routing",
		label: "Routing"
	}
], Nv = {
	workspaces: "The Avoozl workspaces on this machine, each a folder with its own task database. Add one for each set of specs you keep apart.",
	repositories: "The code checkouts tasks change and land in, with their GitHub settings. Save only writes .avoozl.json.",
	github: "The mode, planning repository and Project board. Save only writes .avoozl.json; Set up GitHub creates what's missing, after showing each change.",
	plugins: "A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.",
	content: "Terms Avoozl must never write: in spec files, issues, comments, briefs and diffs. A match stops the write and asks you.",
	flow: "How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode.",
	delivery: "Which agent and model write each task by default, and whether pull request feedback goes back to the writer. Crews and the routing prompt are on the Routing tab.",
	budgets: "Each task's spending cap and what happens at it: stop new work, or only warn. Save only writes .avoozl.json.",
	prices: "What each model costs, so budgets can count dollars. Kept on this computer only, never in a repository.",
	routing: "Off by default: every task runs on this machine. On, one routing prompt picks a crew and a model for each ready task, among the options that pass the checks. Saved on this machine only."
}, Pv = [
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
], Fv = {
	mode: "Which repository this is, the branch pull requests merge into, and who writes the code.",
	triggers: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
	checks: "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
	reviews: "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub."
}, Iv = {
	status: "Status field",
	release: "Release field",
	wave: "Wave field",
	iteration: "Iteration field",
	avoozlState: "Avoozl state field"
}, Lv = {
	claim: "Claim label",
	needsHuman: "Needs-human label"
}, Rv = {
	todo: "Ready option",
	inProgress: "In progress option",
	done: "Done option",
	deferred: "Deferred option"
};
function zv({ rule: e }) {
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
function Bv(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? { maxWidth: jv[e.width] } : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(zv, { rule: e.rule })]
			}),
			e.children,
			e.rule?.blank && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.rule.blank
			}),
			e.raw && /* @__PURE__ */ b(X, {
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
function Vv(e) {
	return /* @__PURE__ */ b(Bv, {
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
function Hv(e) {
	return /* @__PURE__ */ b(Bv, {
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
			style: kv,
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
function Uv({ children: e }) {
	return /* @__PURE__ */ b("p", {
		className: "mt-1 text-xs text-muted",
		children: e
	});
}
function $(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		"data-section": e.title,
		children: [/* @__PURE__ */ b(Y, {
			level: e.level === "sub" ? 4 : 3,
			title: e.title,
			blurb: e.blurb,
			actions: e.actions
		}), e.children]
	});
}
var Wv = {
	all: "has all",
	any: "has any",
	none: "has none",
	assignee: "assigned to"
};
function Gv(e) {
	let t = l(), n = o(() => pp(t), [t]), [i, a] = c(null), [s, u] = c(null), d = !!e.untriaged, f = e.value.trim() || e.untriaged?.placeholder.trim() || "";
	r(() => {
		if (!f) {
			a(null), u(null);
			return;
		}
		let t = !0, r = setTimeout(() => {
			n(e.workspaceId, e.repository, f, d).then((e) => t && (a(e), u(null)), (e) => t && u(K(e)));
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
			/* @__PURE__ */ x(Bv, {
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
					children: fp
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
				children: mp(p.parsed).map((e) => /* @__PURE__ */ x("span", {
					className: "flex flex-wrap items-center gap-1",
					children: [/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: Wv[e.kind]
					}), e.values.map((t) => /* @__PURE__ */ b(G, {
						variant: e.kind === "none" ? void 0 : "info",
						children: t
					}, t))]
				}, e.kind))
			}),
			p?.parsed && /* @__PURE__ */ b(Kv, {
				preview: p,
				untriaged: d
			})
		]
	});
}
function Kv({ preview: e, untriaged: t = !1 }) {
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
						href: Z(e.url),
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
function qv(e) {
	let t = l(), n = o(() => Ad(t), [t]), [i, a] = c(null), { id: s, value: u, repository: d } = e, f = (t) => e.onChange({
		...u,
		...t
	}), p = /^[\w.-]+\/[\w.-]+$/.test(d);
	r(() => {
		if (a(null), !p) return;
		let t = !0;
		return n(e.workspaceId, d).then((e) => t && a(e), (e) => t && a({
			repository: d,
			labels: null,
			error: K(e)
		})), () => {
			t = !1;
		};
	}, [
		p,
		d,
		e.workspaceId,
		n
	]);
	let m = jd(u.triageLabels, i?.labels ?? null), h = (e, t) => f({ triageLabels: t ? [...u.triageLabels, e] : u.triageLabels.filter((t) => t.toLocaleLowerCase() !== e.toLocaleLowerCase()) });
	return /* @__PURE__ */ x($, {
		level: "sub",
		title: "Untriaged",
		blurb: "What the Intake tab's Untriaged filter lists for this repository: open issues and pull requests no rule, triage label or task covers.",
		children: [
			/* @__PURE__ */ b(Gv, {
				id: `${s}-untriaged-filter`,
				value: u.filter,
				repository: d,
				workspaceId: e.workspaceId,
				onChange: (e) => f({ filter: e }),
				untriaged: { placeholder: gp(u.triageLabels) }
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
						}), /* @__PURE__ */ b(zv, { rule: { required: !1 } })]
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
					/* @__PURE__ */ b(X, {
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
				children: [/* @__PURE__ */ b(Vv, {
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
								/* @__PURE__ */ b(zv, { rule: { required: !1 } })
							]
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "At most one Kiro Crew notice an hour, with the counts. Off by default."
						}),
						/* @__PURE__ */ b(X, {
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
function Jv(e) {
	let { rule: t, id: n } = e, r = (n) => e.onChange({
		...t,
		...n
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 border-t pt-3",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				style: Av(180),
				children: [
					/* @__PURE__ */ b(Vv, {
						id: `${n}-id`,
						label: "Rule name",
						raw: "id",
						rule: { required: !0 },
						placeholder: "deliver-ready",
						value: t.id,
						onChange: (e) => r({ id: e })
					}),
					/* @__PURE__ */ b(Hv, {
						id: `${n}-action`,
						label: "Action",
						raw: "action",
						rule: { required: !0 },
						value: t.action,
						options: e.actions,
						none: "Choose",
						onChange: (e) => r({ action: e })
					}),
					/* @__PURE__ */ b(Vv, {
						id: `${n}-author`,
						label: "Opened by",
						raw: "author",
						placeholder: "anyone",
						value: t.author,
						onChange: (e) => r({ author: e })
					})
				]
			}),
			/* @__PURE__ */ b(Gv, {
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
					children: /* @__PURE__ */ b(An, {
						icon: Re,
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
function Yv({ roles: e }) {
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
function Xv({ review: e, repository: t }) {
	if (!e) return null;
	let n = e.repositories[t], r = n ?? e.reviewers;
	return /* @__PURE__ */ b($, {
		level: "sub",
		title: "Avoozl reviewer chats",
		blurb: "Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json.",
		children: e.error ? /* @__PURE__ */ x("p", {
			className: "text-sm text-danger",
			children: ["The delivery block is invalid: ", e.error]
		}) : r.length === 0 ? /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "No reviewer roles. Checks alone verify a delivery."
		}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x(Uv, { children: [
			n ? "Set for this repository." : "The workspace roles.",
			" Writer model ",
			e.writerModel ?? "not named",
			"."
		] }), /* @__PURE__ */ b(Yv, { roles: r })] })
	});
}
function Zv(e) {
	let [t, n] = c(""), r = e.inspect?.checks ?? null, i = Rp(e.value, r), a = /^[\w.-]+\/[\w.-]+$/.test(e.repository), o = () => {
		let r = t.trim();
		r && (e.onChange(zp(e.value, r, !0)), n(""));
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
		}), /* @__PURE__ */ b(Vv, {
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
						href: Z(s),
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
							onChange: (n) => e.onChange(zp(e.value, t.name, n.target.checked))
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
				children: [/* @__PURE__ */ b(Vv, {
					id: `${e.id}-check-extra`,
					label: "Add another name",
					placeholder: "a check not run yet",
					width: "md",
					value: t,
					onChange: n
				}), /* @__PURE__ */ b(zn, {
					tooltip: "Add this exact, case-sensitive check name to the list",
					onClick: o,
					disabled: !t.trim(),
					children: "Add"
				})]
			})
		]
	});
}
function Qv(e) {
	let t = e.inspect?.reviewRule?.url ?? (e.repository ? `https://github.com/${e.repository}/settings/rules` : null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [
			/* @__PURE__ */ b("p", { children: Vp(e.inspect) }),
			t && /* @__PURE__ */ b("a", {
				href: Z(t),
				target: "_blank",
				rel: "noreferrer",
				className: "self-start text-xs underline",
				children: "Change it on GitHub"
			}),
			e.deprecated && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 rounded border p-2 text-xs",
				style: { borderColor: "var(--border)" },
				children: [
					/* @__PURE__ */ b(G, { children: "deprecated" }),
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
						children: /* @__PURE__ */ b(An, {
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
function $v(e) {
	let { repository: t, choices: n } = e, i = l(), a = o(() => Bp(i), [i]), [s, u] = on(`settings-repo-tab-${e.index}`, "inner", (e) => `Back to ${Pv.find((t) => t.key === e)?.label ?? e}`, "mode", !1), [d, f] = c(null), h = `avoozl-settings-repo-${e.index}`, g = (n) => e.onChange({
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
			error: K(e)
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
				segments: Pv.map((e) => ({
					key: e.key,
					label: e.label
				})),
				value: s,
				onChange: (e) => u(e),
				wrap: !0
			}),
			s === "mode" && /* @__PURE__ */ x($, {
				level: "sub",
				title: "Mode and branch",
				blurb: Fv.mode,
				children: [
					/* @__PURE__ */ x("p", {
						className: "text-xs text-muted",
						children: [
							"Workspace mode: ",
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								style: { color: "var(--text)" },
								children: ey[Up(e.mode)]
							}),
							". Change it under Where tasks live."
						]
					}),
					/* @__PURE__ */ x("div", {
						style: Av(),
						children: [
							/* @__PURE__ */ b(Vv, {
								id: `${h}-name`,
								label: "Repository",
								raw: "key",
								rule: Pp.name,
								placeholder: "owner/name",
								value: t.name,
								onChange: (e) => g({ name: e })
							}),
							/* @__PURE__ */ b(Vv, {
								id: `${h}-base`,
								label: "Default branch",
								raw: "baseBranch",
								rule: Pp.baseBranch,
								placeholder: "main",
								width: "md",
								value: t.baseBranch,
								onChange: (e) => g({ baseBranch: e })
							}),
							/* @__PURE__ */ b(Vv, {
								id: `${h}-concurrency`,
								label: "Tasks at once",
								raw: "concurrency",
								rule: Pp.concurrency,
								placeholder: "1",
								type: "number",
								width: "sm",
								value: t.concurrency,
								onChange: (e) => g({ concurrency: e })
							})
						]
					}),
					/* @__PURE__ */ b(Bv, {
						id: `${h}-coder-worker`,
						label: "Who codes",
						raw: "coder",
						rule: Pp.coder,
						children: /* @__PURE__ */ b(Sm, {
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
					/* @__PURE__ */ x($, {
						level: "sub",
						title: "Label rules",
						blurb: Fv.triggers,
						children: [
							t.rules.length === 0 && /* @__PURE__ */ x("p", {
								className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted",
								children: [/* @__PURE__ */ b("span", { children: "No rules yet, so labels start nothing. Add one to let a label start work." }), /* @__PURE__ */ b(Fn, {
									workspaceId: e.workspaceId,
									help: {
										page: "Settings › Repositories › Edit › Triggers",
										section: "Label rules",
										says: "No rules yet, so labels start nothing. Add one to let a label start work.",
										settings: [{
											key: "mode",
											value: e.mode
										}, {
											key: "rules",
											value: "none"
										}],
										docs: "README.md, section Deliver through GitHub"
									}
								})]
							}),
							t.rules.map((r, i) => /* @__PURE__ */ b(Jv, {
								id: `${h}-rule-${i}`,
								rule: r,
								actions: n.actions,
								repository: y,
								workspaceId: e.workspaceId,
								onChange: (e) => _(i, e),
								onRemove: () => g({ rules: t.rules.filter((e, t) => t !== i) })
							}, i)),
							/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(p, {
								onClick: () => g({ rules: [...t.rules, Ep()] }),
								children: "Add rule"
							}) })
						]
					}),
					/* @__PURE__ */ b($, {
						level: "sub",
						title: "Managed labels",
						blurb: "Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict.",
						children: /* @__PURE__ */ b("div", {
							style: Av(200),
							children: n.managedLabels.map((e) => /* @__PURE__ */ b(Vv, {
								id: `${h}-label-${e}`,
								label: Fp[e] ?? e,
								raw: `managedLabels.${e}`,
								rule: Pp[e],
								value: t.managedLabels[e] ?? "",
								onChange: (n) => g({ managedLabels: {
									...t.managedLabels,
									[e]: n
								} })
							}, e))
						})
					}),
					/* @__PURE__ */ b(qv, {
						id: h,
						value: t.untriaged,
						repository: y,
						workspaceId: e.workspaceId,
						onChange: (e) => g({ untriaged: e })
					}),
					/* @__PURE__ */ b($, {
						level: "sub",
						title: "Issue Radar labels",
						blurb: "Labels Issue Radar puts on issues it claims. Avoozl only reads them.",
						children: /* @__PURE__ */ b("div", {
							style: Av(200),
							children: n.crewLabels.map((e) => /* @__PURE__ */ b(Vv, {
								id: `${h}-crew-${e}`,
								label: Lv[e] ?? e,
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
					/* @__PURE__ */ b($, {
						level: "sub",
						title: "Who counts",
						blurb: "GitHub still decides who has access. This sets how much GitHub permission a person needs for a label, a board drag or a close to count.",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-end gap-3",
							children: [/* @__PURE__ */ b(Hv, {
								id: `${h}-permission`,
								label: "Minimum permission",
								raw: "minimumPermission",
								rule: Pp.minimumPermission,
								value: t.minimumPermission,
								options: n.permissions,
								none: t.allowedActors.trim() ? "None" : "Default: write",
								width: "md",
								onChange: (e) => g({ minimumPermission: e })
							}), /* @__PURE__ */ b(Vv, {
								id: `${h}-actors`,
								label: "Or only these people",
								raw: "allowedActors",
								rule: Pp.allowedActors,
								placeholder: "login, login",
								width: "md",
								value: t.allowedActors,
								onChange: (e) => g({ allowedActors: e })
							})]
						})
					}),
					/* @__PURE__ */ b($, {
						level: "sub",
						title: "Priority",
						blurb: "Ready tasks carrying a higher label here start first.",
						children: /* @__PURE__ */ b(Vv, {
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
			s === "checks" && /* @__PURE__ */ b($, {
				level: "sub",
				title: "Required checks",
				blurb: Fv.checks,
				children: /* @__PURE__ */ b(Zv, {
					id: h,
					value: t.requiredChecks,
					inspect: d,
					repository: y,
					onChange: (e) => g({ requiredChecks: e })
				})
			}),
			s === "reviews" && /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-5",
				children: [/* @__PURE__ */ b($, {
					level: "sub",
					title: "Pull-request reviews",
					blurb: Fv.reviews,
					children: /* @__PURE__ */ b(Qv, {
						inspect: d,
						repository: y,
						deprecated: t.pullRequestReviews,
						approvals: t.reviewApprovals,
						onDropDeprecated: () => g({
							pullRequestReviews: !1,
							reviewApprovals: ""
						})
					})
				}), /* @__PURE__ */ b(Xv, {
					review: e.review,
					repository: y
				})]
			})
		]
	}) });
}
var ey = {
	local: "Local only",
	"plans-repo": "Plans repository",
	"single-repo": "Single repository"
};
function ty({ crews: e }) {
	return e.length ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b($, {
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
					href: Z(e.link),
					target: "_top",
					className: "underline",
					children: "Issue Radar"
				}),
				"."
			] }, e.repository))
		})
	}) }) : null;
}
function ny(e) {
	let { form: n, choices: r, set: i } = e, a = l(), u = o(() => un(a), [a]), d = ih(), f = t((e) => u.repositories(e), [u]), { value: p, reload: h } = da(e.workspaceId, f), g = th(p ?? [], n.repositories), [_, v] = c(null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = g.find((e) => e.key === _) ?? null, A = s(null), j = async (t) => {
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
					text: K(e)
				});
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(m, { children: /* @__PURE__ */ x($, {
				title: `Added repositories (${g.length})`,
				blurb: rh,
				children: [
					p === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Loading…"
					}) : /* @__PURE__ */ b(oh, {
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
			k && y && /* @__PURE__ */ b(sh, {
				name: k.name,
				edited: JSON.stringify(jp(n)) !== JSON.stringify(jp(y)),
				missing: Ip(n),
				saving: e.saving,
				error: C,
				onDiscard: () => {
					e.replace(y), v(null), S(null);
				},
				onSave: async () => {
					w(null);
					let t = Ip(n);
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
					children: k && !Wp(n.mode) ? /* @__PURE__ */ b(ry, {
						row: k,
						review: e.review,
						kept: k.policy >= 0
					}) : k && k.policy >= 0 ? /* @__PURE__ */ b($v, {
						index: k.policy,
						repository: n.repositories[k.policy],
						choices: r,
						review: e.review,
						mode: n.mode,
						workspaceId: e.workspaceId,
						onChange: (e) => i({ repositories: n.repositories.map((t, n) => n === k.policy ? e : t) })
					}, k.key) : k && k.github ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b($, {
						title: `${k.name} settings`,
						blurb: `${k.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`,
						children: /* @__PURE__ */ x(q, {
							icon: ke,
							tooltip: "Add an entry you can change; saved when you press Save",
							onClick: () => {
								i({ repositories: [...n.repositories, {
									...Dp(k.github),
									baseBranch: k.branch
								}] });
							},
							children: ["Add GitHub settings for ", k.github]
						})
					}) }) : k ? /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b($, {
						title: `${k.name} settings`,
						blurb: "A local-only repository: no GitHub remote, so the GitHub tabs do not apply.",
						children: /* @__PURE__ */ b("p", {
							className: "text-sm",
							"data-local-checks": !0,
							children: "Required checks apply only to GitHub pull requests. Here Avoozl runs each task's own checks from the spec manifest, or this repository's checks when a task names none."
						})
					}) }) : null
				})
			}),
			/* @__PURE__ */ b(eh, {
				workspaceId: e.workspaceId,
				disabled: e.dirty ? "Save or discard your settings changes first: onboarding writes .avoozl.json." : null,
				onChanged: () => Promise.all([h(), e.onRegistryChanged()]),
				onOpenPlans: e.onOpenPlans
			}),
			/* @__PURE__ */ b(m, { children: /* @__PURE__ */ b("div", {
				ref: A,
				children: /* @__PURE__ */ b(uh, {
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
function ry(e) {
	let { row: t } = e;
	return /* @__PURE__ */ x(m, { children: [/* @__PURE__ */ x($, {
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
				children: "Avoozl runs each task's own checks from the spec manifest, or this repository's checks when a task names none."
			}),
			e.kept && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Its GitHub settings are kept, not used. They apply again if you pick a GitHub mode."
			})
		]
	}), /* @__PURE__ */ b(Xv, {
		review: e.review,
		repository: t.github ?? t.name
	})] });
}
function iy(e) {
	let { form: t, choices: n, set: r } = e, i = Gp(t.mode), a = qp(t);
	return /* @__PURE__ */ b(m, { children: /* @__PURE__ */ b(_m, {
		value: Up(t.mode),
		onChange: (e) => r({ mode: e }),
		idPrefix: "avoozl-settings-mode",
		note: Wp(t.mode) ? null : /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-1.5 text-sm",
			"data-local-note": !0,
			children: [
				/* @__PURE__ */ b("p", { children: Kp }),
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
		children: Wp(t.mode) ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ x("div", {
					style: Av(),
					children: [
						i.has("planningRepository") && /* @__PURE__ */ b(Vv, {
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
						/* @__PURE__ */ b(Hv, {
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
						/* @__PURE__ */ b(Vv, {
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
						}),
						i.has("subIssueCap") && /* @__PURE__ */ b(Vv, {
							id: "avoozl-settings-sub-issues",
							label: "Sub-issues per parent",
							raw: "subIssues.maxPerParent",
							rule: {
								required: !1,
								blank: "Most sub-issues Avoozl links under one issue. GitHub allows 100, closed ones included."
							},
							placeholder: "100",
							type: "number",
							width: "sm",
							value: t.maxPerParent,
							onChange: (e) => r({ maxPerParent: e })
						})
					]
				}),
				/* @__PURE__ */ x("label", {
					className: "flex items-center gap-1.5 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: t.includeDone,
							onChange: (e) => r({ includeDone: e.target.checked })
						}),
						"Make issues for tasks already done when a spec is approved ",
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "issues.includeDone"
						})
					]
				}),
				/* @__PURE__ */ b(ay, {
					form: t,
					choices: n,
					set: r
				}),
				/* @__PURE__ */ b($, {
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
function ay({ form: e, choices: t, set: n }) {
	return /* @__PURE__ */ b("div", { children: /* @__PURE__ */ x($, {
		level: "sub",
		title: "Project fields",
		blurb: "The GitHub Project board Avoozl adds managed issues to and fills with Release, Wave and Avoozl state. People move Status; Avoozl never writes it. Leave every field blank to turn Project sync off.",
		children: [
			/* @__PURE__ */ x("div", {
				style: Av(180),
				children: [/* @__PURE__ */ b(Vv, {
					id: "avoozl-settings-project-owner",
					label: "Owner",
					raw: "project.owner",
					rule: Mp.owner,
					placeholder: "org or user",
					width: "md",
					value: e.projectOwner,
					onChange: (e) => n({ projectOwner: e })
				}), /* @__PURE__ */ b(Vv, {
					id: "avoozl-settings-project-number",
					label: "Number",
					raw: "project.number",
					rule: Mp.number,
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
				style: Av(180),
				children: t.fields.map((t) => /* @__PURE__ */ b(Vv, {
					id: `avoozl-settings-field-${t}`,
					label: Iv[t] ?? t,
					raw: `project.fields.${t}`,
					rule: Mp[t],
					placeholder: Np[t] || "none",
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
				style: Av(180),
				children: t.statusValues.map((t) => /* @__PURE__ */ b(Vv, {
					id: `avoozl-settings-status-${t}`,
					label: Rv[t] ?? t,
					raw: `project.statusValues.${t}`,
					rule: Mp[t],
					placeholder: Np[t],
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
function oy(e) {
	return {
		mode: e.mode,
		planningRepository: e.planningRepository,
		repositories: e.repositories.map((e) => e.name.trim()).filter(Boolean).join(", "),
		projectOwner: e.projectOwner,
		projectNumber: e.projectNumber
	};
}
function sy(e) {
	let { workspaceId: n, tab: i } = e, a = l(), s = o(() => sp(a), [a]), { value: u, error: d, busy: f, reload: p } = da(n, t((e) => s.get(e), [s])), [m, h] = c(null), [g, _] = c(null), [v, y] = c(!1);
	r(() => {
		h(u ? Op(u.github) : null), _(null);
	}, [u]);
	let S = (e) => m && h({
		...m,
		...e
	}), C = async () => {
		if (m) try {
			let e = await s.validate(n, jp(m));
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
				text: K(e)
			});
		}
	}, w = async () => {
		if (!m || !u) return "Settings are not loaded.";
		let e = Ip(m);
		if (e) return _({
			ok: !1,
			text: `Not saved. ${e}`
		}), `Not saved. ${e}`;
		y(!0);
		try {
			return await s.save(n, jp(m), u.hash), await p(), _({
				ok: !0,
				text: "Saved to .avoozl.json."
			}), null;
		} catch (e) {
			return _({
				ok: !1,
				text: K(e)
			}), K(e);
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
	let E = JSON.stringify(jp(m)) !== JSON.stringify(jp(Op(u.github))), D = Ip(m);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			i === "github" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-blurb": "github",
				children: Wp(m.mode) ? Nv.github : "The mode for this workspace. Save only writes .avoozl.json."
			}),
			u.error && /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ["The saved settings are invalid: ", u.error]
			}),
			i === "repositories" ? /* @__PURE__ */ b(ny, {
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
			}) : /* @__PURE__ */ b(iy, {
				form: m,
				choices: T,
				set: S,
				setup: /* @__PURE__ */ b(Em, {
					workspaceId: n,
					client: s,
					settings: u,
					shared: oy(m),
					onSaved: p
				}),
				crews: Gp(m.mode).has("issueRadarCrews") ? /* @__PURE__ */ b(ty, { crews: u.crews ?? [] }) : null
			}),
			i === "github" && /* @__PURE__ */ b(Wc, { workspaceId: n }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(zn, {
						tooltip: "Check these settings without saving them",
						onClick: () => void C(),
						disabled: v,
						children: "Check"
					}),
					/* @__PURE__ */ b(zn, {
						primary: !0,
						onClick: () => void w(),
						disabled: v || !E || !!D,
						tooltip: D,
						children: "Save"
					}),
					E ? /* @__PURE__ */ b(An, {
						disabled: f || v,
						confirm: {
							title: "Discard your unsaved changes?",
							body: "Every edit since the last save on these Settings tabs is lost. .avoozl.json stays as it is.",
							action: "Discard changes"
						},
						onConfirm: () => void p(),
						children: "Discard changes"
					}) : /* @__PURE__ */ b(zn, {
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
function cy(e) {
	let { workspaceId: t } = e, [n, r] = c(em), i = e.tab ?? n, a = Mv.some((e) => e.key === i) ? i : em, o = (t) => e.onTab ? e.onTab(t) : r(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-settings-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Vn, {
				id: "avoozl-settings-title",
				view: "settings",
				children: "Settings"
			}),
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-settings-tabs",
				ariaLabel: "Settings sections",
				segments: Mv.map((e) => ({
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
				children: Nv[a]
			}),
			a === "workspaces" ? /* @__PURE__ */ b(Am, {
				selected: t,
				onSelect: e.onSelectWorkspace,
				onListChange: e.onListChange
			}) : t ? a === "plugins" ? /* @__PURE__ */ b(Rg, {
				workspaceId: t,
				onOpenGitHub: () => o("github")
			}) : a === "content" ? /* @__PURE__ */ b(V_, { workspaceId: t }) : a === "flow" ? /* @__PURE__ */ b(X_, { workspaceId: t }) : a === "delivery" ? /* @__PURE__ */ b(pv, {
				workspaceId: t,
				onOpenRouting: e.onOpenRouting
			}) : a === "budgets" ? /* @__PURE__ */ b(av, { workspaceId: t }) : a === "prices" ? /* @__PURE__ */ b(sv, { workspaceId: t }) : a === "routing" ? /* @__PURE__ */ b(Ov, { workspaceId: t }) : /* @__PURE__ */ b(sy, {
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
var ly = .9;
function uy(e, t) {
	let n = Math.max(Math.min(360, t), Math.floor(t * ly));
	return Math.min(n, Math.max(Math.min(360, n), Number.isFinite(e) ? Math.round(e) : 620));
}
var dy = (e) => `avoozl.drawerWidth.${e}`;
function fy(e, t) {
	try {
		let n = Number(e?.getItem(dy(t)));
		return Number.isFinite(n) && n > 0 ? n : 620;
	} catch {
		return 620;
	}
}
function py(e, t, n) {
	try {
		n === 620 ? e?.removeItem(dy(t)) : e?.setItem(dy(t), String(n));
	} catch {}
}
function my(e, t) {
	return t === "ArrowLeft" ? e + 40 : t === "ArrowRight" ? e - 40 : null;
}
// kirocrew-app/ui/src/TaskForm.tsx
var hy = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function gy({ id: e, label: t, children: n, hint: r }) {
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
function _y(e) {
	return /* @__PURE__ */ b("textarea", {
		id: e.id,
		rows: e.rows ?? 3,
		value: e.value,
		placeholder: e.placeholder,
		onChange: (t) => e.onChange(t.target.value),
		className: "rounded border px-2 py-1 text-sm",
		style: hy
	});
}
function vy(e) {
	let t = o(() => new Map((e.graph?.tasks ?? []).map((e) => [e.id, e.title])), [e.graph]), n = e.value.map((e) => e.id).join("\n"), r = o(() => {
		let t = new Set(n.split("\n"));
		return ba(e.graph?.tasks ?? []).filter((n) => n.id !== e.self && !t.has(n.id));
	}, [
		e.graph,
		e.self,
		n
	]), i = (t, n) => e.onChange(e.value.map((e, r) => r === t ? {
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
				children: e.value.map((n, r) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ x("span", {
							className: "min-w-0 flex-1 truncate",
							children: [
								t.get(n.id) ?? n.id,
								" ",
								/* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: n.id
								})
							]
						}),
						/* @__PURE__ */ x("select", {
							"aria-label": `Link kind for ${n.id}`,
							value: n.kind,
							onChange: (e) => i(r, {
								kind: e.target.value,
								condition: ""
							}),
							className: "rounded border px-1 py-0.5 text-xs",
							style: hy,
							children: [/* @__PURE__ */ b("option", {
								value: "requires",
								children: "needs it done"
							}), /* @__PURE__ */ b("option", {
								value: "sequence",
								children: "runs after it"
							})]
						}),
						n.kind === "requires" && /* @__PURE__ */ x("select", {
							"aria-label": `Level for ${n.id}`,
							value: n.condition,
							onChange: (e) => i(r, { condition: e.target.value }),
							className: "rounded border px-1 py-0.5 text-xs",
							style: hy,
							children: [/* @__PURE__ */ b("option", {
								value: "",
								children: "its own completion"
							}), _i.map((e) => /* @__PURE__ */ b("option", {
								value: e,
								children: e
							}, e))]
						}),
						/* @__PURE__ */ b(p, {
							onClick: () => e.onChange(e.value.filter((e, t) => t !== r)),
							children: "Remove"
						})
					]
				}, n.id))
			}),
			/* @__PURE__ */ b(ya, {
				label: "Add a prerequisite",
				placeholder: "Search tasks by title or ID",
				items: r,
				value: "",
				keep: !1,
				onPick: (t) => e.onChange([...e.value, {
					id: t,
					kind: "requires",
					condition: ""
				}])
			})
		]
	});
}
function yy({ preview: e }) {
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b("p", { children: e.message }),
			e.link && /* @__PURE__ */ b("a", {
				href: Z(e.link),
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
				children: "Nothing was written. Approving the changed spec stays your step."
			})
		]
	});
}
function by(e) {
	let { workspaceId: t, graph: n, detail: r } = e, i = l(), a = o(() => mi(i), [i]), s = o(() => r ? bi(r) : null, [r]), [u, d] = c(() => s ?? {
		...yi(),
		prerequisites: e.prerequisite ? [{
			id: e.prerequisite,
			kind: "requires",
			condition: ""
		}] : []
	}), [f, m] = c(!1), [h, _] = c(!1), [v, y] = c(null), [S, C] = c(null), w = o(() => new Set((n?.tasks ?? []).map((e) => e.id)), [n]), T = r ? r.task.id : f ? u.id : gi(u.title, w), E = hi(n?.edges ?? [], T || "(new)", u.prerequisites.map((e) => e.id)), D = (e) => d({
		...u,
		...e
	}), O = r?.locked ?? null, k = !!u.title.trim() && (!!r || /^[a-z][a-z0-9-]{2,80}$/.test(T)) && !E, A = async () => {
		_(!0), y(null);
		try {
			let i = xi({
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
			y(Si(K(e)));
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
					/* @__PURE__ */ b(G, {
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
			/* @__PURE__ */ b(gy, {
				id: "avoozl-task-title",
				label: "Title",
				children: /* @__PURE__ */ b(g, {
					id: "avoozl-task-title",
					value: u.title,
					onChange: (e) => D({ title: e.target.value }),
					required: !0
				})
			}),
			!r && /* @__PURE__ */ b(gy, {
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
			/* @__PURE__ */ b(gy, {
				id: "avoozl-task-summary",
				label: "Description",
				children: /* @__PURE__ */ b(_y, {
					id: "avoozl-task-summary",
					rows: 4,
					value: u.summary,
					onChange: (e) => D({ summary: e })
				})
			}),
			/* @__PURE__ */ b("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: /* @__PURE__ */ b(gy, {
					id: "avoozl-task-repository",
					label: "Repository",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-repository",
						value: u.repository,
						onChange: (e) => D({ repository: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: hy,
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: "None"
						}), (n?.repositories ?? []).map((e) => /* @__PURE__ */ b("option", {
							value: e,
							children: e
						}, e))]
					})
				})
			}),
			/* @__PURE__ */ b(gy, {
				id: "avoozl-task-acceptance",
				label: "Acceptance",
				hint: "One condition per line.",
				children: /* @__PURE__ */ b(_y, {
					id: "avoozl-task-acceptance",
					value: u.acceptance,
					onChange: (e) => D({ acceptance: e })
				})
			}),
			/* @__PURE__ */ b(gy, {
				id: "avoozl-task-checks",
				label: "Checks",
				hint: "One command per line, such as npm test.",
				children: /* @__PURE__ */ b(_y, {
					id: "avoozl-task-checks",
					rows: 2,
					value: u.checks,
					onChange: (e) => D({ checks: e })
				})
			}),
			/* @__PURE__ */ b(vy, {
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
			S && /* @__PURE__ */ b(yy, { preview: S }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ b(p, {
					type: "submit",
					primary: !0,
					disabled: h || !k,
					children: O ? "Draft the spec change" : r ? "Save changes" : "Add draft task"
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
// kirocrew-app/ui/src/files-api.ts
function xy(e) {
	let t = async (t, n, r) => (await e.post(ln, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		files: (e, n, r = !1) => t("task.files", {
			taskId: n,
			...r ? { all: !0 } : {}
		}, e),
		diff: (e, n, r) => t("task.diff", {
			taskId: n,
			path: r
		}, e)
	};
}
var Sy = {
	added: "A",
	modified: "M",
	deleted: "D",
	renamed: "R",
	copied: "C"
}, Cy = {
	added: "success",
	modified: "info",
	deleted: "danger",
	renamed: "wave",
	copied: "wave"
};
function wy(e) {
	return [
		"added",
		"modified",
		"deleted",
		"renamed",
		"copied"
	].map((t) => [t, e.filter((e) => e.status === t).length]).filter(([, e]) => e > 0).map(([e, t]) => `${t} ${e}`).join(", ");
}
function Ty(e, t = []) {
	let n = new Map(t.map((e) => [e.path, e])), r = {
		name: "",
		path: "",
		change: null,
		file: !1,
		children: []
	};
	for (let i of /* @__PURE__ */ new Set([...e, ...t.map((e) => e.path)])) {
		let e = i.split("/"), t = r;
		e.forEach((r, a) => {
			let o = e.slice(0, a + 1).join("/"), s = a === e.length - 1, c = t.children.find((e) => e.name === r && e.file === s);
			c || (c = {
				name: r,
				path: o,
				change: s ? n.get(i) ?? null : null,
				file: s,
				children: []
			}, t.children.push(c)), t = c;
		});
	}
	let i = (e) => {
		let t = e.children.map(i);
		return t.sort((e, t) => Number(e.file) - Number(t.file) || e.name.localeCompare(t.name)), !e.file && e.path && t.length === 1 && !t[0].file ? {
			...t[0],
			name: `${e.name}/${t[0].name}`
		} : {
			...e,
			children: t
		};
	};
	return i(r).children;
}
var Ey = (e) => e.kind === "add" || e.kind === "del" || e.kind === "context";
function Dy(e) {
	let t = [], n = 0, r = 0, i = !1, a = e.split("\n");
	a.at(-1) === "" && a.pop();
	for (let e of a) {
		let a = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(e);
		a ? (n = Number(a[1]), r = Number(a[2]), i = !0, t.push({
			kind: "hunk",
			text: e
		})) : !i || e.startsWith("\\") || e.startsWith("diff --git ") ? (e.startsWith("diff --git ") && (i = !1), t.push({
			kind: "meta",
			text: e
		})) : e.startsWith("+") ? t.push({
			kind: "add",
			text: e.slice(1),
			old: null,
			new: r++
		}) : e.startsWith("-") ? t.push({
			kind: "del",
			text: e.slice(1),
			old: n++,
			new: null
		}) : t.push({
			kind: "context",
			text: e.slice(1),
			old: n++,
			new: r++
		});
	}
	return t;
}
function Oy(e) {
	let t = [], n = [], r = [], i = () => {
		for (let e = 0; e < Math.max(n.length, r.length); e++) t.push({
			kind: "pair",
			left: n[e] ?? null,
			right: r[e] ?? null
		});
		n = [], r = [];
	};
	for (let a of e) Ey(a) ? a.kind === "del" ? (r.length && i(), n.push(a)) : a.kind === "add" ? r.push(a) : (i(), t.push({
		kind: "pair",
		left: a,
		right: a
	})) : (i(), t.push(a));
	return i(), t;
}
var ky = [{
	key: "kiro",
	label: "Kiro"
}, {
	key: "vscode",
	label: "VS Code"
}];
function Ay(e, t) {
	let n = /^[A-Za-z]:\\/.test(e) || e.includes("\\") && !e.includes("/") ? "\\" : "/";
	return e.replace(/[\\/]+$/, "") + n + t.split("/").join(n);
}
function jy(e, t, n) {
	if (!t) return null;
	let r = t.replace(/\\/g, "/");
	if (!r.startsWith("/") && !/^[A-Za-z]:\//.test(r)) return null;
	let i = r.replace(/^\/+/, "").split("/").map((e, t) => t === 0 && /^[A-Za-z]:$/.test(e) ? e : encodeURIComponent(e)).join("/");
	return `${e === "vscode" ? "vscode" : "kiro"}://file/${i}${n ? `:${n}` : ""}`;
}
function My(e) {
	for (let t of e) if (Ey(t) && t.kind !== "context") return t.new ?? t.old;
	return null;
}
var Ny = "avoozl.editor";
function Py(e) {
	try {
		return e?.getItem(Ny) === "vscode" ? "vscode" : "kiro";
	} catch {
		return "kiro";
	}
}
function Fy(e, t) {
	try {
		t === "kiro" ? e?.removeItem(Ny) : e?.setItem(Ny, t);
	} catch {}
}
function Iy(e) {
	let t = e.additions !== null && e.deletions !== null ? ` (+${e.additions} −${e.deletions})` : "";
	return e.link ? "A link. Not followed or shown." : e.binary ? "Binary file. Not shown." : e.tooLarge ? `Too large to show here${t}${e.bytes ? `, ${Math.round(e.bytes / 1024)} KB` : ""}. Open it in your editor.` : e.status === "unchanged" ? "This task did not change this file." : e.status === "deleted" && !e.diff ? "Deleted." : e.diff ? null : "No text changes.";
}
// kirocrew-app/ui/src/TaskFiles.tsx
var Ly = 1500;
function Ry() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var zy = {
	fontFamily: "var(--mono, ui-monospace, monospace)",
	fontSize: 12,
	lineHeight: "18px"
}, By = {
	add: "color-mix(in srgb, var(--ok) 16%, transparent)",
	del: "color-mix(in srgb, var(--danger) 16%, transparent)",
	hunk: "color-mix(in srgb, var(--accent) 10%, transparent)"
};
function Vy({ change: e }) {
	return /* @__PURE__ */ x("span", {
		"data-status": e.status,
		children: [/* @__PURE__ */ b("span", {
			"aria-hidden": "true",
			children: /* @__PURE__ */ b(G, {
				variant: Cy[e.status],
				children: Sy[e.status]
			})
		}), /* @__PURE__ */ b("span", {
			className: "sr-only",
			children: e.status
		})]
	});
}
function Hy({ change: e }) {
	return e.binary ? /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "binary"
	}) : e.additions === null ? null : /* @__PURE__ */ x("span", {
		className: "shrink-0 text-xs",
		style: zy,
		children: [
			/* @__PURE__ */ x("span", {
				style: { color: "var(--ok)" },
				children: ["+", e.additions]
			}),
			" ",
			/* @__PURE__ */ x("span", {
				style: { color: "var(--danger)" },
				children: ["−", e.deletions]
			})
		]
	});
}
function Uy(e) {
	return /* @__PURE__ */ b("ul", {
		"aria-label": e.depth === 0 ? "Files" : void 0,
		className: "flex flex-col",
		children: e.nodes.map((t) => t.file ? /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x("button", {
			type: "button",
			"aria-current": e.selected === t.path ? "true" : void 0,
			onClick: () => e.onPick(t.path),
			className: "flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left text-sm",
			style: {
				paddingLeft: 4 + e.depth * 14,
				background: e.selected === t.path ? "var(--bg-elevated)" : void 0,
				color: t.change ? "var(--text)" : "var(--muted)"
			},
			"data-file": t.path,
			children: [
				t.change ? /* @__PURE__ */ b(Vy, { change: t.change }) : /* @__PURE__ */ b("span", {
					style: { width: 18 },
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ x("span", {
					className: "min-w-0 flex-1 truncate",
					children: [
						t.name,
						t.change?.from && /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [" ← ", t.change.from]
						}),
						t.change?.untracked && /* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: " (not committed)"
						})
					]
				}),
				t.change && /* @__PURE__ */ b(Hy, { change: t.change })
			]
		}) }, t.path) : /* @__PURE__ */ x("li", { children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1 px-1 py-0.5 text-sm text-muted",
			style: { paddingLeft: 4 + e.depth * 14 },
			children: [/* @__PURE__ */ b(ne, {
				size: 14,
				"aria-hidden": "true"
			}), /* @__PURE__ */ b("span", {
				className: "truncate",
				children: t.name
			})]
		}), /* @__PURE__ */ b(Uy, {
			nodes: t.children,
			depth: e.depth + 1,
			selected: e.selected,
			onPick: e.onPick
		})] }, t.path))
	});
}
var Wy = (e) => /* @__PURE__ */ b("span", {
	className: "select-none pr-2 text-right text-muted",
	style: {
		display: "inline-block",
		minWidth: 36
	},
	children: e ?? ""
});
function Gy({ lines: e }) {
	return /* @__PURE__ */ b("div", {
		role: "group",
		"aria-label": "Unified diff",
		style: zy,
		children: e.map((e, t) => Ey(e) ? /* @__PURE__ */ x("div", {
			"data-line": e.kind,
			style: {
				whiteSpace: "pre",
				background: e.kind === "context" ? void 0 : By[e.kind]
			},
			children: [
				Wy(e.old),
				Wy(e.new),
				/* @__PURE__ */ b("span", { children: e.kind === "add" ? "+" : e.kind === "del" ? "-" : " " }),
				e.text
			]
		}, t) : /* @__PURE__ */ b("div", {
			className: "text-muted",
			style: {
				whiteSpace: "pre",
				background: e.kind === "hunk" ? By.hunk : void 0
			},
			children: e.text
		}, t))
	});
}
function Ky({ lines: e }) {
	let t = o(() => Oy(e), [e]), n = (e, t) => /* @__PURE__ */ b("div", {
		style: {
			whiteSpace: "pre",
			overflow: "hidden",
			background: e && e.kind !== "context" ? By[e.kind] : void 0
		},
		children: e ? /* @__PURE__ */ x(y, { children: [Wy(t === "left" ? e.old : e.new), e.text] }) : " "
	});
	return /* @__PURE__ */ b("div", {
		role: "group",
		"aria-label": "Side-by-side diff",
		style: zy,
		children: t.map((e, t) => e.kind === "pair" ? /* @__PURE__ */ x("div", {
			"data-split-row": !0,
			style: {
				display: "grid",
				gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
				gap: 1
			},
			children: [n(e.left, "left"), n(e.right, "right")]
		}, t) : /* @__PURE__ */ b("div", {
			className: "text-muted",
			style: {
				whiteSpace: "pre",
				background: e.kind === "hunk" ? By.hunk : void 0
			},
			children: e.text
		}, t))
	});
}
function qy(e) {
	return /* @__PURE__ */ b("span", {
		role: "group",
		"aria-label": e.label,
		className: "inline-flex overflow-hidden rounded border",
		style: { borderColor: "var(--border)" },
		children: e.options.map((t) => /* @__PURE__ */ b("button", {
			type: "button",
			"aria-pressed": e.value === t.key,
			onClick: () => e.onChange(t.key),
			className: "px-2 py-0.5 text-xs",
			style: e.value === t.key ? {
				background: "var(--accent)",
				color: "var(--bg)"
			} : { color: "var(--text)" },
			children: t.label
		}, t.key))
	});
}
function Jy(e) {
	let [t, n] = c(!1), r = o(() => Dy(e.diff.diff), [e.diff.diff]), i = Iy(e.diff);
	if (i) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		"data-diff-summary": !0,
		children: i
	});
	let a = t ? r : r.slice(0, Ly);
	return /* @__PURE__ */ x("div", {
		"data-diff": !0,
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ b("div", {
			className: "overflow-x-auto rounded border",
			style: {
				borderColor: "var(--border)",
				background: "var(--card, var(--bg))"
			},
			children: e.layout === "split" ? /* @__PURE__ */ b(Ky, { lines: a }) : /* @__PURE__ */ b(Gy, { lines: a })
		}), a.length < r.length && /* @__PURE__ */ x("button", {
			type: "button",
			className: "self-start text-xs underline",
			onClick: () => n(!0),
			children: [
				"Show the other ",
				r.length - a.length,
				" lines"
			]
		})]
	});
}
function Yy(e) {
	let t = l(), n = o(() => xy(t), [t]), [i, a] = c(null), [s, u] = c(null), [d, f] = c(!1), [p, m] = c(null), [h, g] = c(null), [_, v] = c("unified"), [S, C] = c(() => Py(Ry())), [w, T] = c(0);
	r(() => {
		if (!e.active) return;
		let t = !0;
		return u(null), n.files(e.workspaceId, e.taskId, d).then((e) => t && a(e), (e) => t && u(K(e))), () => {
			t = !1;
		};
	}, [
		n,
		e.workspaceId,
		e.taskId,
		e.active,
		d,
		w
	]), r(() => {
		m(null), g(null), a(null), f(!1);
	}, [e.taskId]);
	let E = (t) => {
		m(t), g({
			path: t,
			view: null,
			error: null
		}), n.diff(e.workspaceId, e.taskId, t).then((e) => g((n) => n?.path === t ? {
			path: t,
			view: e,
			error: null
		} : n), (e) => g((n) => n?.path === t ? {
			path: t,
			view: null,
			error: K(e)
		} : n));
	}, D = o(() => i ? Ty(d && i.all ? i.all.paths : [], i.files) : [], [i, d]);
	if (s) return /* @__PURE__ */ b("p", {
		role: "alert",
		className: "text-sm text-danger",
		children: s
	});
	if (!i) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Reading the task's branch…"
	});
	let O = zr(i.github) && i.github, k = i.mode === "worktree" && !i.remote && i.worktree, A = O && /* @__PURE__ */ x("a", {
		href: zr(O),
		target: "_blank",
		rel: "noreferrer",
		className: "inline-flex items-center gap-1 text-sm underline",
		"data-github-branch": !0,
		children: [
			/* @__PURE__ */ b(oe, {
				size: 14,
				"aria-hidden": "true"
			}),
			i.branch,
			" on GitHub"
		]
	});
	if (i.mode === "none") return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [/* @__PURE__ */ b("p", {
			className: "text-muted",
			children: i.remote ? "This task runs on another machine. Its files are not here." : "No worktree or branch for this task on this machine yet."
		}), A]
	});
	let j = i.files.find((e) => e.path === p) ?? null, M = h?.view ? Dy(h.view.diff) : [], N = k && p && j?.status !== "deleted" ? {
		path: Ay(i.worktree, p),
		line: My(M)
	} : null, P = N && jy(S, N.path, N.line);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-task-files": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ b("span", {
						"data-files-totals": !0,
						children: i.totals ? /* @__PURE__ */ x(y, { children: [
							i.totals.files,
							" ",
							i.totals.files === 1 ? "file" : "files",
							" changed",
							i.totals.files > 0 && /* @__PURE__ */ x(y, { children: [
								" ",
								"· ",
								/* @__PURE__ */ x("span", {
									style: { color: "var(--ok)" },
									children: ["+", i.totals.additions]
								}),
								" ",
								/* @__PURE__ */ x("span", {
									style: { color: "var(--danger)" },
									children: ["−", i.totals.deletions]
								})
							] })
						] }) : "Too many changes to list."
					}),
					i.files.length > 0 && /* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: wy(i.files)
					}),
					/* @__PURE__ */ b("span", { className: "flex-1" }),
					/* @__PURE__ */ b(J, {
						icon: je,
						label: "Read the files again",
						onClick: () => T((e) => e + 1)
					})
				]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2 text-xs",
				children: [
					/* @__PURE__ */ x("span", {
						className: "text-muted",
						children: [i.mode === "worktree" ? "Its worktree" : `Its branch ${i.branch}`, " against where it left its base."]
					}),
					k ? /* @__PURE__ */ x("a", {
						href: jy(S, i.worktree),
						className: "inline-flex items-center gap-1 underline",
						"data-open-worktree": !0,
						children: [
							/* @__PURE__ */ b(V, {
								size: 14,
								"aria-hidden": "true"
							}),
							"Open worktree in ",
							ky.find((e) => e.key === S).label
						]
					}) : A,
					k && /* @__PURE__ */ x("label", {
						className: "inline-flex items-center gap-1",
						children: ["Editor", /* @__PURE__ */ b("select", {
							value: S,
							onChange: (e) => {
								let t = e.target.value;
								C(t), Fy(Ry(), t);
							},
							className: "rounded border px-1 py-0.5 text-xs",
							style: {
								borderColor: "var(--border)",
								background: "var(--card, var(--bg))",
								color: "var(--text)"
							},
							children: ky.map((e) => /* @__PURE__ */ b("option", {
								value: e.key,
								children: e.label
							}, e.key))
						})]
					}),
					/* @__PURE__ */ x("label", {
						className: "inline-flex items-center gap-1",
						children: [/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: d,
							onChange: (e) => f(e.target.checked)
						}), "Show all files"]
					})
				]
			}),
			D.length === 0 ? /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "This task has not changed any files yet."
			}) : /* @__PURE__ */ b("div", {
				className: "max-h-80 overflow-auto rounded border p-1",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(Uy, {
					nodes: D,
					depth: 0,
					selected: p,
					onPick: E
				})
			}),
			(i.truncated || i.all?.truncated) && /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "Only the first files are listed."
			}),
			h && /* @__PURE__ */ x("section", {
				"aria-label": `Diff of ${h.path}`,
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ b("h4", {
							className: "min-w-0 flex-1 text-sm font-semibold",
							style: {
								...zy,
								overflowWrap: "anywhere"
							},
							children: h.path
						}),
						/* @__PURE__ */ b(qy, {
							label: "Diff layout",
							options: [{
								key: "unified",
								label: "Unified"
							}, {
								key: "split",
								label: "Split"
							}],
							value: _,
							onChange: (e) => v(e)
						}),
						P && /* @__PURE__ */ x("a", {
							href: jy(S, N.path, N.line),
							className: "inline-flex items-center gap-1 text-xs underline",
							"data-open-file": !0,
							children: [
								/* @__PURE__ */ b(V, {
									size: 14,
									"aria-hidden": "true"
								}),
								"Open in ",
								ky.find((e) => e.key === S).label
							]
						})
					]
				}), h.error ? /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: h.error
				}) : h.view ? /* @__PURE__ */ b(Jy, {
					diff: h.view,
					layout: _
				}) : /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Reading the diff…"
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/TaskDrawer.tsx
function Xy({ label: e, children: t }) {
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
		className: "text-muted",
		children: e
	}), /* @__PURE__ */ b("dd", {
		className: "min-w-0 break-words",
		children: t
	})] });
}
function Zy({ title: e, links: t, open: n }) {
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
function Qy(e) {
	let { origin: n } = e, i = l(), a = o(() => mi(i), [i]), [s, u] = c(null), [d, f] = c(null), p = t(() => f(null), []), m = async (t) => {
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
				error: K(e)
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
				children: h?.readable ? li(n.text, h.document).map((e, t) => e.link ? /* @__PURE__ */ b("button", {
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
						href: Z(e.issue),
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
							" in Specs"
						]
					}),
					n.sources.map((e) => e.readable ? /* @__PURE__ */ x("span", {
						className: "inline-flex flex-wrap gap-2",
						children: [/* @__PURE__ */ b(q, {
							icon: te,
							tooltip: `Open all of ${e.document} in a reader, at the cited line`,
							onClick: () => f(e),
							"aria-label": `Open full file ${e.document}`,
							children: "Open full file"
						}), /* @__PURE__ */ x(q, {
							icon: H,
							tooltip: "Show the lines this task was made from here, read from the file now",
							onClick: () => void m(e),
							"aria-label": `${s?.source === e ? "Hide" : "Read"} ${ci(e)}`,
							children: [
								s?.source === e ? "Hide" : "Read",
								" ",
								ci(e)
							]
						})]
					}, e.document + e.lineStart) : /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [ci(e), " (no longer in this workspace)"]
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
						children: [s.source.document, ui(s.source) ? ` · ${ui(s.source)} marked` : ""]
					}), /* @__PURE__ */ b("button", {
						type: "button",
						className: "ml-auto underline",
						onClick: () => f(s.source),
						children: "Open full file"
					})]
				}), /* @__PURE__ */ b(Sg, {
					text: s.text,
					lineStart: s.source.lineStart,
					lineEnd: s.source.lineEnd,
					maxHeight: 360,
					idPrefix: "avoozl-origin",
					label: `Contents of ${s.source.document}`
				})] })
			}),
			d && /* @__PURE__ */ b(wg, {
				workspaceId: e.workspaceId,
				target: d,
				onClose: p
			})
		]
	});
}
function $y(e) {
	let { workspaceId: n, id: i } = e, a = l(), s = o(() => mi(a), [a]), u = o(() => Lr(a), [a]), [d, f] = c(null), p = Ln(e.id), [m, h] = c(null), [g, _] = c(!1), v = Pn(n), [S, C] = c(!1), [w, T] = c(null), [E, D] = c(!1);
	r(() => D(!1), [i]);
	let O = t(async () => {
		h(null);
		try {
			f(await s.detail(n, i));
		} catch (e) {
			h(K(e));
		}
	}, [
		s,
		n,
		i
	]);
	r(() => {
		f(null), _(!1), T(null), O();
	}, [O]);
	let k = (e) => {
		C(!0), T(null), (async () => {
			try {
				T(await e()), await O();
			} catch (e) {
				T({
					ok: !1,
					text: K(e)
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
	let { task: A, delivery: j } = d, M = A.authority === "local", N = (j?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1), P = A.status === "deferred", F = _u(e.graph), I = j?.complete ?? A.state === "done", L = zr(A.issue?.url ?? null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b(Y, {
				level: 2,
				id: "avoozl-drawer-title",
				title: A.title
			}), /* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: A.id }),
					/* @__PURE__ */ b(zs, { owner: A }),
					A.state && /* @__PURE__ */ b(G, {
						variant: A.state === "needs-you" ? "warning" : void 0,
						children: A.state
					}),
					d.locked && /* @__PURE__ */ b(G, { children: "locked" }),
					A.planArchived && /* @__PURE__ */ b(G, { children: "Archived" })
				]
			})] }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [
					e.onFocus && /* @__PURE__ */ b(q, {
						icon: B,
						tooltip: "Show only this task and the tasks it waits on and that wait on it",
						onClick: () => {
							e.onFocus(A.id, A.title), e.onClose();
						},
						children: "Focus"
					}),
					/* @__PURE__ */ b(q, {
						icon: xe,
						tooltip: "Start a Kiro Crew chat seeded with this task's full context",
						onClick: () => void v.ask({ tasks: [A.id] }),
						children: "Ask in a chat"
					}),
					N === "decision" && /* @__PURE__ */ b(q, {
						icon: Me,
						disabled: S,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => k(async () => (await u.retry(n, A.id), {
							ok: !0,
							text: "Retrying."
						})),
						children: "Retry"
					}),
					!I && M && !P && /* @__PURE__ */ b(q, {
						icon: Ee,
						disabled: S,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => k(async () => (await u.updateTask(n, A.id, { status: "deferred" }, d.revision), {
							ok: !0,
							text: "Deferred. No new attempt starts; a running session is left alone."
						})),
						children: "Defer"
					}),
					!I && M && P && F && /* @__PURE__ */ b(q, {
						icon: Oe,
						disabled: S,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => k(async () => (await u.updateTask(n, A.id, { status: F }, d.revision), {
							ok: !0,
							text: "Resumed."
						})),
						children: "Resume"
					}),
					/* @__PURE__ */ b(q, {
						icon: De,
						tooltip: "Edit this task. It needs your review again before it starts.",
						onClick: () => _(!g),
						children: "Edit"
					}),
					!I && !M && L && /* @__PURE__ */ b("a", {
						href: Z(L),
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
			A.handSetReview && /* @__PURE__ */ b(ku, {
				workspaceId: n,
				task: A,
				graph: e.graph,
				revision: d.revision,
				onChanged: (e) => {
					T({
						ok: !0,
						text: e
					}), O();
				}
			}),
			Xr(j).length > 0 && /* @__PURE__ */ x("section", {
				"aria-label": "Review",
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("h4", {
					className: "text-sm font-semibold",
					children: "Review"
				}), /* @__PURE__ */ b(Ou, { item: j })]
			}),
			g && /* @__PURE__ */ b("div", {
				className: "rounded border p-3",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(by, {
					workspaceId: n,
					graph: e.graph,
					detail: d,
					onSaved: () => {
						T({
							ok: !0,
							text: "Saved. This task needs your review again before it starts."
						}), _(!1), O();
					},
					onCancel: () => _(!1)
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-col",
				role: "region",
				"aria-label": "Task sections",
				children: [
					/* @__PURE__ */ b(Mn, {
						id: "summary",
						group: "task-drawer",
						title: "Summary",
						open: d.conflicts.length === 0,
						children: /* @__PURE__ */ x("dl", {
							className: "grid gap-x-3 gap-y-1.5 text-sm",
							style: { gridTemplateColumns: "max-content 1fr" },
							children: [
								/* @__PURE__ */ b(Xy, {
									label: "Epic",
									children: A.epicTitle ?? "none"
								}),
								/* @__PURE__ */ b(Xy, {
									label: "Phase",
									children: A.phase?.title ?? "none"
								}),
								d.origin && /* @__PURE__ */ b(Xy, {
									label: "Came from",
									children: /* @__PURE__ */ b(Qy, {
										origin: d.origin,
										issue: L,
										workspaceId: n
									})
								}),
								/* @__PURE__ */ x(Xy, {
									label: "Spec",
									children: [d.plan ? `${d.plan.title}${d.plan.approved ? " (approved)" : ` (${d.plan.state ?? "draft"})`}` : "none", A.planArchived ? " · archived: its tasks do not start until you unarchive it" : ""]
								}),
								/* @__PURE__ */ x(Xy, {
									label: "Authority",
									children: [
										/* @__PURE__ */ b(zs, { owner: A }),
										" ",
										A.authority
									]
								}),
								/* @__PURE__ */ b(Xy, {
									label: "Route",
									children: A.route
								}),
								/* @__PURE__ */ b(Xy, {
									label: "Status",
									children: A.status ?? "none"
								}),
								/* @__PURE__ */ b(Xy, {
									label: "State",
									children: A.state ?? "unknown"
								}),
								/* @__PURE__ */ b(Xy, {
									label: "Wave",
									children: A.wave
								}),
								/* @__PURE__ */ b(Xy, {
									label: "Done when",
									children: A.completion
								}),
								A.repository && /* @__PURE__ */ b(Xy, {
									label: "Repository",
									children: A.repository
								}),
								A.owner && /* @__PURE__ */ b(Xy, {
									label: "Assignee",
									children: A.owner
								}),
								A.decision && /* @__PURE__ */ b(Xy, {
									label: "Decision",
									children: A.decision
								}),
								A.needsReview && /* @__PURE__ */ b(Xy, {
									label: "Review",
									children: "Needs your review"
								}),
								(j?.pullRequests ?? []).map((e, t) => /* @__PURE__ */ b(Xy, {
									label: "Pull request",
									children: zr(e.url) ? /* @__PURE__ */ x("a", {
										href: zr(e.url),
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
					/* @__PURE__ */ b(Mn, {
						id: "description",
						group: "task-drawer",
						title: "Description",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [
								A.summary ? /* @__PURE__ */ b(Rs, { text: A.summary }) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "No description."
								}),
								/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Acceptance"
								}), A.acceptance.length ? /* @__PURE__ */ b("ul", {
									className: "mt-1 list-disc pl-5 text-sm",
									children: A.acceptance.map((e, t) => /* @__PURE__ */ b("li", { children: e }, t))
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "None."
								})] }),
								/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Checks"
								}), A.checks.length ? /* @__PURE__ */ b("ul", {
									className: "mt-1 flex flex-col gap-1 text-sm",
									children: A.checks.map((e, t) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b("code", { children: e }) }, t))
								}) : /* @__PURE__ */ b("p", {
									className: "text-sm text-muted",
									children: "None."
								})] }),
								A.context && /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "From its spec"
								}), /* @__PURE__ */ b(Rs, { text: A.context })] })
							]
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "links",
						group: "task-drawer",
						title: "Links",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [/* @__PURE__ */ b(Zy, {
								title: "Waits on",
								links: d.waitsOn,
								open: e.open
							}), /* @__PURE__ */ b(Zy, {
								title: "Blocks",
								links: d.blocks,
								open: e.open
							})]
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "delivery",
						group: "task-drawer",
						title: "Delivery",
						children: j ? /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-2",
							children: [
								j.sessions.length > 0 && /* @__PURE__ */ b("ul", {
									className: "flex flex-col gap-1 text-sm",
									children: j.sessions.map((e) => /* @__PURE__ */ x("li", { children: [
										/* @__PURE__ */ x("a", {
											href: Z(Ti(e)),
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
												Hr(e) ?? "model not named",
												" · started",
												" ",
												Q(e.boundAt),
												e.statusAt ? ` · last activity ${Q(e.statusAt)}` : ""
											]
										})
									] }, e.slot))
								}),
								N === "decision" && /* @__PURE__ */ b(au, {
									item: j,
									busy: S,
									onRetry: (e) => k(async () => (await u.retry(n, A.id, e), {
										ok: !0,
										text: "Dismissed and retrying."
									}))
								}),
								/* @__PURE__ */ b(ou, {
									item: j,
									onSupersede: async (e, t) => {
										await u.supersede(n, e, t), await O();
									}
								})
							]
						}) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "No delivery yet."
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "files",
						group: "task-drawer",
						title: "Files",
						onToggle: (e) => e && D(!0),
						children: /* @__PURE__ */ b(Yy, {
							workspaceId: n,
							taskId: A.id,
							active: E
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "timing",
						group: "task-drawer",
						title: "Timing",
						children: /* @__PURE__ */ b(Wo, { timing: d.timing ?? null })
					}),
					/* @__PURE__ */ b(Mn, {
						id: "budget",
						group: "task-drawer",
						title: /* @__PURE__ */ x("span", {
							className: "flex items-center gap-2",
							children: ["Budget ", /* @__PURE__ */ b(Or, { budget: j?.budget })]
						}),
						children: /* @__PURE__ */ b(Mr, {
							workspaceId: n,
							taskId: A.id,
							onChange: () => void O()
						})
					}),
					/* @__PURE__ */ b(Mn, {
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
										children: Zu(e)
									}),
									e.changedAt && /* @__PURE__ */ x("div", {
										className: "text-xs text-muted",
										children: [
											"Changed ",
											Q(e.changedAt),
											e.changedBy ? ` by ${e.changedBy}` : "",
											". See Timeline for this task's history."
										]
									}),
									/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(q, {
										icon: xe,
										tooltip: "Start a Kiro Crew chat seeded with this item",
										onClick: () => void v.ask({ items: [vn(e)] }),
										children: "Ask in a chat"
									}) }),
									/* @__PURE__ */ b(yd, {
										item: e,
										workspaceId: n,
										revision: d.revision,
										busy: S,
										run: k,
										onSettled: () => void 0
									})
								]
							}, t))
						}) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "No conflicts or decisions on this task."
						})
					}),
					/* @__PURE__ */ b(Mn, {
						id: "timeline",
						group: "task-drawer",
						title: "Timeline",
						children: d.timeline.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
							className: "flex flex-col gap-1 text-sm",
							children: p.take("timeline", d.timeline).map((e, t) => /* @__PURE__ */ x("li", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ b(X, {
									text: e.at,
									children: /* @__PURE__ */ b("span", {
										className: "w-28 shrink-0 text-xs text-muted",
										children: Q(e.at)
									})
								}), /* @__PURE__ */ b("span", { children: e.text })]
							}, t))
						}), /* @__PURE__ */ b(Rn, { ...p.more("timeline", d.timeline.length) })] }) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "Nothing recorded yet."
						})
					})
				]
			}),
			j && qr(j) && /* @__PURE__ */ b(ru, {
				item: j,
				onSupersede: async (e, t) => {
					await u.supersede(n, e, t), await O();
				}
			}),
			j?.sessions.length ? /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Running for ",
					Ci(j.sessions.at(-1).boundAt),
					" in its latest attempt."
				]
			}) : null
		]
	});
}
function eb(e) {
	let t = l(), n = o(() => Lr(t), [t]), i = o(() => mi(t), [t]), [a, s] = c(null), [u, d] = c(!1), [f, p] = c(null);
	r(() => {
		n.conflictsPage(e.workspaceId).then((t) => s({
			revision: t.revision,
			group: t.items.find((t) => t.kind === "review" && t.id === e.group.id) ?? null
		}), (e) => p(K(e)));
	}, [
		n,
		e.workspaceId,
		e.group.id
	]);
	let m = a ? a.group : e.group, h = async () => {
		if (a && m) {
			d(!0), p(null);
			try {
				let t = qu("reviewed", await i.settle(e.workspaceId, "reviewed", Uu(m), a.revision));
				t.ok ? e.onReviewed() : p(t.text);
			} catch (e) {
				p(K(e));
			} finally {
				d(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(Y, {
				level: 2,
				id: "avoozl-drawer-title",
				title: m?.title ?? e.group.title
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Avoozl re-reads a spec when its file changes. A task waits here when its own section changed, or when it is new. Moving a spec or fixing its links does not count. Read each task, then mark them reviewed so they may start."
			}),
			f && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: f
			}),
			a && !m ? /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Nothing here needs review now."
			}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("div", { children: m && /* @__PURE__ */ b(bd, {
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
						/* @__PURE__ */ b(zs, { owner: t })
					]
				}, t.id))
			})] })
		]
	});
}
function tb() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function nb(e) {
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
			let n = my(e.width, t.key);
			n !== null && (t.preventDefault(), e.onResize(n));
		},
		onMouseEnter: () => n(!0),
		onMouseLeave: () => n(!1),
		className: "absolute inset-y-0 flex items-center justify-center outline-none",
		style: {
			right: e.width - 5,
			width: 10,
			cursor: "col-resize",
			zIndex: Ye.raised
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
function rb({ workspaceId: e, children: n, onFocus: i }) {
	let a = l(), u = o(() => Lr(a), [a]), [d, f] = c(null), [p, m] = c([]), [h, g] = c(null), [_, v] = c(!1), S = s(null), C = s(null), w = Xe("(max-width: 767px)"), T = Xe("(prefers-reduced-motion: reduce)"), [E, D] = c(620), [O, k] = c(!1);
	r(() => {
		D(e ? fy(tb(), e) : 620);
	}, [e]);
	let A = t((t) => {
		let n = uy(t, window.innerWidth);
		D(n), e && py(tb(), e, n);
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
	return rn("drawer", N && !!e, "Close the drawer", () => p.length ? F() : P(), P), /* @__PURE__ */ x(bn.Provider, {
		value: M,
		children: [n, d && e && /* @__PURE__ */ x("div", {
			className: "fixed inset-0",
			style: {
				zIndex: Ye.drawer,
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
				!w && /* @__PURE__ */ b(nb, {
					width: uy(E, typeof window > "u" ? E : window.innerWidth),
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
						width: w ? "100%" : uy(E, typeof window > "u" ? E : window.innerWidth),
						background: "var(--card, var(--bg))",
						color: "var(--text)",
						borderColor: "var(--border)",
						transform: _ || T ? "none" : "translateX(100%)",
						transition: T || O ? "none" : "transform 180ms ease-out"
					},
					children: [/* @__PURE__ */ x("div", {
						className: "mb-3 flex items-center gap-2",
						children: [
							p.length > 0 && /* @__PURE__ */ b(zn, {
								tooltip: "Go back to what you had open before",
								onClick: F,
								children: "Back"
							}),
							/* @__PURE__ */ b("span", { className: "grow" }),
							d.kind === "task" && /* @__PURE__ */ b(q, {
								icon: ke,
								tooltip: "Add a draft task that waits on this one",
								onClick: () => M.addTask({ prerequisite: d.id }),
								children: "Add a task after this"
							}),
							/* @__PURE__ */ b(q, {
								icon: Ve,
								onClick: P,
								"aria-label": "Close task details",
								children: "Close"
							})
						]
					}), d.kind === "task" ? /* @__PURE__ */ b($y, {
						workspaceId: e,
						id: d.id,
						graph: h,
						open: M.openTask,
						onClose: P,
						onFocus: i
					}) : d.kind === "review" ? /* @__PURE__ */ b(eb, {
						workspaceId: e,
						group: d.group,
						open: M.openTask,
						onReviewed: () => {
							d.onReviewed?.(), P();
						}
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Y, {
						level: 2,
						id: "avoozl-drawer-title",
						title: "Add a task",
						className: "mb-2"
					}), /* @__PURE__ */ b(by, {
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
// kirocrew-app/ui/src/App.tsx
var ib = [
	{
		key: "dashboard",
		label: "Dashboard"
	},
	{
		key: "plans",
		label: "Specs"
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
		key: "conflicts",
		label: "Conflicts"
	},
	{
		key: "untriaged",
		label: "Intake"
	},
	{
		key: "activity",
		label: "Activity"
	},
	{
		key: "settings",
		label: "Settings"
	}
];
function ab() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function ob(e) {
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
var sb = (e) => ib.find((t) => t.key === e)?.label ?? e;
function cb() {
	return /* @__PURE__ */ b(nn, { children: /* @__PURE__ */ b(lb, {}) });
}
function lb() {
	let e = en(), n = l(), i = o(() => un(n), [n]), a = o(() => mn(ab()), []), [s, u] = c("dashboard"), [d, f] = c(em), [m, g] = c(null), [y, S] = c(null), [C, w] = c(0), [T, E] = c({ n: 0 }), [D, O] = c(null), [k, A] = c(null), j = o(() => Lr(n), [n]), M = o(() => Td(n), [n]), [N, P] = c(a.workspaceId), [F, I] = c(null), [L, R] = c(null), z = t((e) => {
		I(e), P((t) => fn(e, t));
	}, []);
	r(() => {
		i.list().then(z, (e) => R(K(e)));
	}, [i, z]), r(() => {
		hn(ab(), { workspaceId: N });
	}, [N]);
	let B = {
		tab: s,
		settingsTab: d,
		focus: m,
		drill: y
	}, ee = (e) => {
		e.focus !== void 0 && g(e.focus), e.drill !== void 0 && S(e.drill), e.settingsTab !== void 0 && f(e.settingsTab), e.tab !== void 0 && u(e.tab);
	}, V = (t, n) => Xt(e, B, t, ee, (e, t) => t ? `Back to ${sb(e.tab)}` : "Back to the previous Settings section", n), H = () => V({
		settingsTab: "workspaces",
		tab: "settings"
	}), U = F ? N : null, te = s !== "settings" && !U, ne = (e, t) => V({
		focus: t ?? null,
		drill: null,
		tab: e
	}), re = (e, t) => {
		U && zl(U, t), V({
			focus: null,
			drill: null,
			tab: e
		});
	}, ie = (e) => V({
		focus: null,
		drill: e,
		tab: "graph"
	}), ae = (e) => V({
		focus: null,
		drill: null,
		settingsTab: tm(s, e, d, Mv.map((e) => e.key)),
		tab: e
	});
	return r(() => {
		if (!U) return w(0);
		let e = !0, t = () => j.conflicts(U).then((t) => e && w(t.length), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		U,
		j,
		s
	]), r(() => {
		if (!U) return O(null);
		let e = !0, t = () => M.view(U).then((t) => {
			e && (O(t.enabled ? t.total : null), A((t.ideas ?? []).filter((e) => e.state === "open").length));
		}, () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		U,
		M,
		s
	]), /* @__PURE__ */ b("div", {
		[Zt]: "",
		style: { display: "contents" },
		children: /* @__PURE__ */ b(kn, { children: /* @__PURE__ */ b(rb, {
			workspaceId: U,
			onFocus: (e, t) => ie({
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
							children: [/* @__PURE__ */ b(Ue, { size: 28 }), "Avoozl"]
						}),
						subtitle: "Plan work as a graph, then deliver ready tasks through Kiro Crew",
						actions: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-3",
							children: [
								/* @__PURE__ */ b(ob, {
									list: F,
									value: N,
									onChange: P
								}),
								/* @__PURE__ */ b(Fc, { workspaceId: U }),
								/* @__PURE__ */ b(p, {
									type: "button",
									primary: !0,
									onClick: () => {
										E((e) => ({ n: e.n + 1 })), V({
											focus: null,
											drill: null,
											tab: "plans"
										});
									},
									children: "Plan a goal"
								})
							]
						})
					}),
					/* @__PURE__ */ x("div", {
						className: "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-3",
						"data-top-row": !0,
						children: [/* @__PURE__ */ b(v, {
							layoutId: "avoozl-views",
							ariaLabel: "Avoozl views",
							segments: ib.map((e) => ({
								key: e.key,
								label: e.key === "untriaged" && D ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Intake, ${D} untriaged items`,
									children: [
										/* @__PURE__ */ b(Hn, {
											view: "untriaged",
											children: "Intake"
										}),
										" ",
										/* @__PURE__ */ b(G, {
											variant: "info",
											children: D
										})
									]
								}) : e.key === "conflicts" && C > 0 ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Conflicts, ${C} need you`,
									children: [
										/* @__PURE__ */ b(Hn, {
											view: "conflicts",
											children: "Conflicts"
										}),
										" ",
										/* @__PURE__ */ b(G, {
											variant: "warning",
											children: C
										})
									]
								}) : /* @__PURE__ */ b(Hn, {
									view: e.key,
									children: e.label
								})
							})),
							value: s,
							onChange: (e) => ae(e),
							wrap: !0
						}), U && /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-2",
							"data-top-actions": !0,
							children: [/* @__PURE__ */ b(qf, { workspaceId: U }), /* @__PURE__ */ b(ap, { workspaceId: U })]
						})]
					}),
					L && /* @__PURE__ */ b("p", {
						role: "alert",
						className: "px-6 pb-2 text-sm text-danger",
						children: L
					}),
					/* @__PURE__ */ b("div", {
						ref: (t) => {
							e.scroller.current = t;
						},
						"data-avoozl-pane": !0,
						className: "flex-1 min-h-0 overflow-y-auto px-6 pb-8",
						children: te ? /* @__PURE__ */ b(h, {
							icon: /* @__PURE__ */ b(Ue, { size: 40 }),
							title: F ? F.items.length === 0 ? "No workspace yet" : "Pick a workspace" : "Loading workspaces…",
							subtitle: F?.items.length === 0 ? "Add or initialize a workspace in Settings. Every tab reads from it." : "Choose one in the header. Every tab reads from it.",
							action: F?.items.length === 0 ? /* @__PURE__ */ b(p, {
								type: "button",
								onClick: H,
								children: "Open Settings › Workspaces"
							}) : void 0
						}) : s === "dashboard" ? /* @__PURE__ */ b(ls, {
							workspaceId: U,
							untriaged: D,
							onNavigate: ne,
							onScope: re,
							onDrill: ie
						}) : s === "plans" ? /* @__PURE__ */ b(Pl, {
							workspaceId: U,
							onScope: re,
							onDrill: ie,
							newPlanRequest: T,
							ideas: k,
							onOpenIdeas: () => V({
								focus: null,
								drill: null,
								tab: "untriaged"
							}, { "untriaged-show": "ideas" })
						}) : s === "graph" ? /* @__PURE__ */ b(Zl, {
							workspaceId: U,
							focus: m,
							drill: y,
							onDrill: S
						}) : s === "delivery" ? /* @__PURE__ */ b(Iu, { workspaceId: U }) : s === "conflicts" ? /* @__PURE__ */ b(wd, { workspaceId: U }) : s === "flow" ? /* @__PURE__ */ b(Uo, { workspaceId: U }) : s === "untriaged" ? /* @__PURE__ */ b(vf, {
							workspaceId: U,
							onOpenSources: () => V({
								settingsTab: "plugins",
								tab: "settings"
							}),
							onMakeSpec: (e) => {
								E((t) => ({
									n: t.n + 1,
									seed: fc(e)
								})), V({
									focus: null,
									drill: null,
									tab: "plans"
								});
							}
						}) : s === "activity" ? /* @__PURE__ */ b(Ff, { workspaceId: U }) : /* @__PURE__ */ b(cy, {
							workspaceId: U,
							tab: d,
							onTab: (e) => V({ settingsTab: e }),
							onSelectWorkspace: (e) => e && P(e),
							onListChange: z,
							onOpenPlans: () => ae("plans"),
							onOpenRouting: () => V({
								settingsTab: "routing",
								tab: "settings"
							})
						})
					})
				]
			})
		}) })
	});
}
export { cb as default };
