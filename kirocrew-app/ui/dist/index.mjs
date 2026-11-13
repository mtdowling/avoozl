import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u } from "@kirocrew/app-sdk";
import { Badge as d, Btn as f, Card as p, CardTitle as m, EmptyState as h, Input as g, PageHeader as _, SegmentedControl as v } from "@kirocrew/app-sdk/ui";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { createPortal as S } from "react-dom";
import { Activity as C, Archive as w, ArchiveRestore as T, ArrowLeft as E, ArrowRight as D, Ban as O, BookOpen as k, Check as A, ChevronRight as j, CircleAlert as M, CircleAlert as N, CircleCheck as P, CircleDot as F, CircleHelp as I, ClipboardCheck as L, Copy as ee, Crosshair as R, Download as z, ExternalLink as te, Eye as B, FileText as V, FileText as H, Folder as ne, FolderOpen as U, Gauge as W, Gauge as re, GitBranch as G, GitPullRequest as ie, GitPullRequestDraft as ae, History as oe, Inbox as se, Inbox as ce, Info as le, Laptop as ue, LayoutDashboard as de, LayoutGrid as fe, LayoutGrid as pe, Lock as me, MessageSquare as he, MessagesSquare as K, Network as ge, Network as _e, Package as ve, Pause as ye, Pencil as be, Play as xe, Plus as Se, Radar as Ce, RefreshCw as we, RotateCcw as Te, ScanSearch as Ee, Send as De, Settings as Oe, ShieldCheck as ke, Trash2 as Ae, Users as je, Workflow as Me, X as Ne } from "lucide-react";
// \0rolldown/runtime.js
var Pe = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports);
// kirocrew-app/ui/src/Logo.tsx
function Fe({ size: e = 32 }) {
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
function Ie(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var Le = null;
function Re(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), Le === o && (Le = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), Le && Le !== o && Le(), Le = o, i || (i = !0, e.onChange(!0));
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
var ze = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Be = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function q(e) {
	let t = i(), n = s(null), l = s(null), [u, d] = c(!1), [f, p] = c(null), m = o(() => Re({ onChange: d }), []);
	r(() => m.hide, [m]), r(() => {
		if (!u) return;
		let e = (e) => m.key(e.key), t = () => m.hide();
		return document.addEventListener("keydown", e), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [u, m]), a(() => {
		if (!u || !n.current || !l.current) return p(null);
		let e = n.current.getBoundingClientRect(), t = l.current.getBoundingClientRect();
		p(Ie(e, t, {
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
		onFocus: (e) => m.focus(Be(e.target)),
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
					animation: ze() ? void 0 : "avoozl-tip-in 120ms ease-out"
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
var Ve = {
	success: { variant: "ok" },
	warning: { variant: "warn" },
	danger: { variant: "err" },
	info: {
		variant: "muted",
		className: "bg-accent-subtle text-accent"
	},
	wave: { variant: "aim" }
};
function He(e) {
	return e && Ve[e] || { variant: "muted" };
}
function J({ variant: e, children: t }) {
	let n = He(e);
	return /* @__PURE__ */ b(d, {
		variant: n.variant,
		className: n.className,
		children: t
	});
}
// src/delivery-lanes.mjs
var Ue = /* @__PURE__ */ new Set(["closed", "lost"]);
Object.freeze([
	["ready", "Ready"],
	["running", "Running"],
	["reviewing", "Reviewing"],
	["needs-you", "Needs you"],
	["waiting", "Blocked or waiting"],
	["done", "Done"],
	["deferred", "Deferred"]
]);
function We(e) {
	return e.state ? e.state : e.complete ? "done" : e.decision || e.status === "blocked" ? "needs-you" : e.status === "deferred" ? "deferred" : e.status === "running" || e.status === "review" ? "running" : e.ready ? "ready" : "waiting";
}
var Ge = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function Ke(e, t) {
	let n = Ge(t), r = (t?.sessions ?? []).filter((e) => !Ue.has(e.status ?? ""));
	return n === "decision" || t?.needsYou || e && We(e) === "needs-you" && !t?.complete ? "needs-you" : t?.complete || e && We(e) === "done" ? "done" : n === "done" || n === "verified" || t?.status === "review" && !t.handSetReview || r.some((e) => e.role !== "worker") || t?.githubReviews?.state === "pending" ? "reviewing" : r.length || n === "running" || n === "failed" || t?.status === "running" && !t.handSetReview ? "running" : e && We(e) === "ready" ? "ready" : "waiting";
}
// kirocrew-app/ui/src/graph-layout.ts
var qe = [
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
], Je = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
}, Ye = 1.5;
function Xe(e, t = 1100) {
	let n = (12 / (12 + Math.max(0, e))) ** 2, r = Math.max(.6, Math.min(1.4, t / 1100)), i = 1 + Ye * n * r, a = (e) => Math.round(e * i);
	return {
		...Je,
		columnGap: a(Je.columnGap),
		rowGap: a(Je.rowGap),
		clusterGap: a(Je.clusterGap)
	};
}
var Ze = Je.nodeWidth, Qe = Je.nodeHeight;
Je.columnGap, Je.rowGap, Je.margin, Je.clusterLabel, Je.clusterGap;
var $e = 2, et = 12, tt = 8, nt = We;
function rt(e) {
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
var it = (e) => e ?? "(none)";
function at(e) {
	if (!e.startsWith("doc:")) return e;
	let t = e.slice(4);
	return /^\.kiro\/specs\/([^/]+)\//.exec(t)?.[1] ?? t.replace(/\.md$/, "");
}
function ot(e, t) {
	let n = new Map(e.epics.map((e) => [e.id, e.title])), r = new Map(e.epics.map((e, t) => [e.id, t])), i = (e) => {
		if (!e) return "No epic";
		let t = n.get(e);
		return t && t !== e ? t : at(e);
	}, a = /* @__PURE__ */ new Map();
	for (let t of e.tasks) a.has(t.epic) || a.set(t.epic, []), a.get(t.epic).push(t);
	let o = [...a.keys()].sort((e, t) => (e === null ? 1e9 : r.get(e) ?? 1e8) - (t === null ? 1e9 : r.get(t) ?? 1e8)), s = /* @__PURE__ */ new Map(), c = [];
	for (let e of o) {
		let n = a.get(e);
		if (t.has(it(e))) {
			let t = `epic:${it(e)}`, r = new Set(n.map(nt)), a = [
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
					done: n.filter((e) => nt(e) === "done").length
				}
			});
		} else for (let t of n) s.set(t.id, t.id), c.push({
			id: t.id,
			task: t,
			title: t.title,
			epic: e,
			state: nt(t),
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
function st(e, t) {
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
function ct(e) {
	if (e.length < 2) return 0;
	let t = e.length >> 1, n = e.slice(0, t), r = e.slice(t), i = ct(n) + ct(r), a = 0, o = 0, s = 0;
	for (; a < n.length && o < r.length;) n[a] <= r[o] ? e[s++] = n[a++] : (e[s++] = r[o++], i += n.length - a);
	for (; a < n.length;) e[s++] = n[a++];
	for (; o < r.length;) e[s++] = r[o++];
	return i;
}
function lt(e, t) {
	let n = 0;
	for (let r = 0; r + 1 < e.length; r++) {
		let i = new Map(e[r + 1].map((e, t) => [e, t])), a = [];
		e[r].forEach((e, n) => {
			for (let r of t.get(e).down) a.push([n, i.get(r)]);
		}), a.sort((e, t) => e[0] - t[0] || e[1] - t[1]), n += ct(a.map((e) => e[1]));
	}
	return n;
}
function ut(e, t, n, r) {
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
function dt(e, t) {
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
var ft = (e) => {
	let t = [...e].sort((e, t) => e - t), n = t.length >> 1;
	return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2;
};
function pt(e, t = /* @__PURE__ */ new Set(), n = {}) {
	let { nodeWidth: r, nodeHeight: i, columnGap: a, rowGap: o, margin: s, clusterLabel: c, clusterGap: l } = n.spacing ?? Je, { nodes: u, edges: d, epicTitle: f } = ot(e, t), p = new Map(u.map((e) => [e.id, e])), m = new Set(d.flatMap((e) => [e.from, e.to])), h = u.filter((e) => m.has(e.id)), g = u.filter((e) => !m.has(e.id)), { ranks: _, pairs: v } = st(h.map((e) => e.id), d), y = /* @__PURE__ */ new Map();
	for (let e of h) y.set(e.id, {
		id: e.id,
		cluster: `epic:${it(e.epic)}`,
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
				height: $e,
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
	for (let e of h) w.has(it(e.epic)) || w.set(it(e.epic), w.size);
	let T = (e) => {
		let t = p.get(e);
		return t ? w.get(it(t.epic)) * 1e6 + C.get(e) : 0xe8d4a51000;
	};
	for (let e of S) e.sort((e, t) => T(e) - T(t));
	let E = lt(S, y);
	if (!n.naive) {
		let e = S.map((e) => [...e]);
		for (let t = 0; t < et && E > 0; t++) {
			let n = t % 2 == 0, r = S.map((e) => [...e]);
			if (n) for (let e = 1; e < r.length; e++) r[e] = ut(r[e], y, r[e - 1], "up");
			else for (let e = r.length - 2; e >= 0; e--) r[e] = ut(r[e], y, r[e + 1], "down");
			let i = lt(r, y);
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
	for (let e = 0; e < tt; e++) {
		let t = e % 2 == 0 ? B : [...B].reverse();
		for (let e of t) {
			let t = e.map((e) => {
				let t = ee.get(e).map((e) => z.get(e));
				return t.length ? ft(t) : z.get(e);
			}), n = e.length;
			dt(t, e.map(() => 1)).forEach((t, r) => z.set(e[r], Math.min(Math.max(Math.round(t), r), F - n + r)));
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
	for (let e of u) re.set(it(e.epic), (re.get(it(e.epic)) ?? 0) + (e.members?.total ?? 1));
	let G = /* @__PURE__ */ new Map();
	for (let e of h) {
		let t = R.get(e.id);
		G.has(t) || G.set(t, []), G.get(t).push(e);
	}
	for (let e of [...G.keys()].sort((e, t) => e - t)) {
		let n = G.get(e).sort((e, t) => e.y - t.y), a = [], s = () => {
			if (!a.length) return;
			let e = it(a[0].epic), n = t.has(e);
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
		for (let e of n) a.length && it(a[0].epic) !== it(e.epic) && s(), a.push(e);
		s();
	}
	let ie = h.length ? k + F * O - o : 0, ae = h.length ? ie + O : k, oe = [], se = g;
	se.forEach((e, n) => {
		e.loose = !0, e.wave = 0, e.x = s + n % L * D, e.y = ae + Math.floor(n / L) * O;
		let r = it(e.epic), i = oe[oe.length - 1];
		i && it(i.epic) === r ? i.count++ : t.has(r) || oe.push({
			epic: e.epic,
			title: f(e.epic),
			count: 1,
			x: e.x,
			y: e.y - o - 1,
			chars: Math.max(8, Math.floor((D * Math.max(1, L - n % L) - a) / 6))
		});
	});
	let ce = se.length ? Math.ceil(se.length / L) : 0, le = Math.max(I, se.length ? Math.min(L, se.length) : 0, 1);
	return {
		nodes: [...h, ...se],
		edges: ne,
		clusters: U,
		loose: oe,
		waves: x,
		crossings: E,
		rows: F,
		width: s * 2 + le * D - a,
		height: Math.max(ce ? ae + ce * O - o + s : 0, ie + s, s * 2)
	};
}
function mt(e, t) {
	return t ? "none" : e.members ? "drill" : "open";
}
function ht(e, t) {
	if (!t) return e;
	let n;
	if (t.kind === "epic") n = new Set(e.tasks.filter((e) => e.epic === t.id || e.id === t.id).map((e) => e.id));
	else {
		let { up: r, down: i } = _t(e.edges.filter((e) => e.blocking), t.id);
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
function gt(e) {
	return e.map(([e, t], n) => `${n ? "L" : "M"}${Math.round(e * 10) / 10},${Math.round(t * 10) / 10}`).join(" ");
}
function _t(e, t) {
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
function vt(e, t) {
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
function yt(e, t, n, r, i = .1, a = 3) {
	let o = Math.min(a, Math.max(i, e.scale * t)), s = o / e.scale;
	return {
		scale: o,
		x: n - (n - e.x) * s,
		y: r - (r - e.y) * s
	};
}
function bt(e, t, n) {
	let r = Math.max(.1, Math.min(1, t / e.width, n / e.height));
	return {
		scale: r,
		x: Math.max(0, (t - e.width * r) / 2),
		y: 0
	};
}
var xt = (e, t) => (e?.kind ?? null) === (t?.kind ?? null) && (e?.id ?? null) === (t?.id ?? null);
function St(e, t, n, r) {
	if (!t.drill) return e;
	let i = [.../* @__PURE__ */ new Set([...Object.keys(n), ...Object.keys(r)])].filter((e) => JSON.stringify(n[e]) !== JSON.stringify(r[e]));
	if (!i.length) return e;
	let a = i.every((e) => e === "q"), o = e[e.length - 1];
	return a && o?.searchOnly && xt(o.drill, t.drill) ? e : [...e, {
		...t,
		filter: n,
		searchOnly: a
	}];
}
function Ct(e, t) {
	return e.map((n, r) => ({
		at: r,
		entry: n,
		next: r + 1 < e.length ? e[r + 1].drill : t
	})).filter(({ entry: e, next: t }) => !xt(e.drill, t)).map(({ at: e, entry: t }) => ({
		at: e,
		label: wt(t.drill)
	}));
}
var wt = (e) => e ? e.kind === "epic" ? e.title : `Focus: ${e.title}` : "All tasks", Tt = (e) => {
	let t = e[e.length - 1];
	if (!t) return null;
	let n = t.drill ? wt(t.drill) : "all tasks";
	return t.filter ? `Back to ${n}, before the filter change` : `Back to ${n}`;
};
function Et(e, t, n) {
	return n ? [...e, t] : [];
}
function Dt(e, t = e.length - 1) {
	return t < 0 || t >= e.length ? null : {
		entry: e[t],
		stack: e.slice(0, t)
	};
}
var Ot = (e) => e.button === 3, kt = (e) => !!e.altKey && e.key === "ArrowLeft" || !!e.metaKey && e.key === "[", At = "/apps/avoozl/api/command";
function Y(e) {
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
function jt(e) {
	let t = async (t, n = {}, r) => (await e.post(At, {
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
function Mt(e, t = Date.now()) {
	if (!e) return "Not loaded";
	let { lastRun: n, lock: r } = e;
	if (r) return r.live ? `Running (pid ${r.pid})` : `Stale lock (pid ${r.pid})`;
	if (!n) return "Never run";
	if (n.outcome === "unreadable") return "Last run unreadable";
	let i = n.at ? Math.max(0, Math.round((t - Date.parse(n.at)) / 1e3)) : null, a = i === null ? "" : i < 90 ? ` ${i}s ago` : ` ${Math.round(i / 60)}m ago`;
	return n.outcome === "error" ? `Failed${a}: ${n.error ?? "unknown error"}` : n.outcome === "locked" ? `Skipped${a}: another tick held the lock` : n.policy === "invalid" ? `Ran${a}; .avoozl.json is invalid: ${n.error ?? ""}`.trim() : `Ran${a}; policy ${n.policy ?? "unknown"}`;
}
function Nt(e, t) {
	return t && e.items.some((e) => e.id === t) ? t : e.items.find((e) => e.served)?.id ?? e.defaultWorkspace ?? e.items[0]?.id ?? null;
}
var Pt = "avoozl.page";
function Ft(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
function It(e, t) {
	try {
		e?.setItem(Pt, JSON.stringify(t));
	} catch {}
}
var Lt = {
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
}, Rt = (e) => Lt[e] ?? {
	label: e,
	tip: `State: ${e}`
}, zt = {
	check: "failed checks",
	review: "review",
	comment: "comment",
	conflict: "conflict",
	"auto-merge": "auto-merge off"
}, Bt = {
	session: "sent to the worker",
	conductor: "queued for the conductor",
	"new attempt": "carried to a new attempt"
}, Vt = {
	bound: "stopped: all rounds used",
	"same-check": "stopped: the same check failed 3 times",
	blocked: "stopped: the worker is blocked"
};
function Ht(e) {
	let t = [`${e.rounds} of ${e.bound ?? "?"} rounds`];
	return e.latest && t.push(`last: ${e.latest.kinds.map((e) => zt[e] ?? e).join(", ")}, ${Bt[e.latest.to] ?? e.latest.to}`), e.stopped && t.push(Vt[e.stopped] ?? `stopped: ${e.stopped}`), t.join(" · ");
}
function Ut(e) {
	let t = async (t, n, r, i) => (await e.post(At, {
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
function Wt(e) {
	return {
		tasks: e.tasks.length,
		edges: e.edges.length,
		blocking: e.edges.filter((e) => e.blocking).length,
		ready: e.tasks.filter((e) => e.ready).length
	};
}
function Gt(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
function Kt(e) {
	return [
		`${e.role} #${e.attempt}`,
		e.status ?? "not observed",
		qt(e)
	].filter(Boolean).join(" · ");
}
function qt(e) {
	if (e.served === void 0) return e.model ?? null;
	let t = `requested ${e.model ?? "agent default"}`;
	if (!e.served) return `${t}, served model not reported`;
	let n = [e.served.withheld ? "withheld" : null, e.served.changed ? "changed mid-session" : null].filter(Boolean).join(", ");
	return `${t}, served ${e.served.model ?? "unknown"}${n ? ` (${n})` : ""}`;
}
function Jt(e) {
	let t = e.outcome === "refused" ? `${e.verdict ?? "verdict"} refused` : e.verdict ?? (e.outcome === "failed" ? "no verdict" : e.outcome), n = e.served && e.served !== e.model ? `${e.model ?? "model unknown"} → served ${e.served}` : e.model ?? "model unknown";
	return [
		e.role,
		t,
		n,
		e.stale ? "stale" : null
	].filter(Boolean).join(" · ");
}
function Yt(e) {
	return [
		e.reviewer,
		e.state,
		e.stale ? `stale (${e.commit?.slice(0, 12) ?? "older commit"})` : null,
		e.allowed ? null : `ignored: ${e.reason ?? "not allowed"}`
	].filter(Boolean).join(" · ");
}
function Xt(e) {
	return Object.entries(e).filter(([e, t]) => e !== "taskId" && [
		"string",
		"number",
		"boolean"
	].includes(typeof t)).map(([e, t]) => [e, String(t)]);
}
var Zt = {
	decision: "Open decision",
	"needs-human": "Needs you",
	review: "Review",
	"stale-session": "Session ended",
	resource: "Shared resource",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function Qt(e) {
	return (e.authority ?? "local") === "local" && !e.supersededBy && e.status !== "superseded";
}
function $t(e) {
	let t = {};
	return e.id.trim() && (t.id = e.id.trim()), e.title.trim() && (t.title = e.title.trim()), t;
}
var en = /* @__PURE__ */ new Set([
	"closed",
	"lost",
	"gone"
]);
function tn(e) {
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
		live: !en.has(n.status ?? "")
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
function nn(e) {
	return e === "running" ? "Waiting on your decision: marked running, but no session is running" : "Waiting on your decision: marked in review, but no review is running";
}
// kirocrew-app/ui/src/dashboard-api.ts
var rn = /* @__PURE__ */ new Set(["closed", "lost"]), an = (e) => Gt(e.issue?.url ?? null);
function on(e) {
	return [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null;
}
function sn(e) {
	return e.complete ? null : e.deliveries.some((e) => e.state === "decision") ? "Stopped after its retries; retry it or dismiss the findings." : null;
}
function cn(e) {
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
	}, o = new Set((r ?? []).filter((e) => !e.complete && e.sessions.some((e) => !rn.has(e.status ?? ""))).map((e) => e.id));
	for (let e of i) {
		let t = nt(e);
		a[t === "done" ? "done" : o.has(e.id) ? "running" : t === "running" ? "needs-you" : t] += 1;
	}
	let s = [], c = /* @__PURE__ */ new Set(), l = (e) => {
		c.has(e.key) || (c.add(e.key), s.push(e));
	};
	for (let t of e.delivery ?? []) {
		let e = sn(t);
		e && l({
			key: `delivery:${t.id}`,
			kind: "delivery",
			taskId: t.id,
			title: t.title,
			detail: e,
			tab: "delivery",
			href: an(t)
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
		href: an(t)
	});
	let d = (r ?? []).filter((e) => !e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		sessions: e.sessions.filter((e) => !rn.has(e.status ?? ""))
	})).filter((e) => e.sessions.length > 0), f = new Map((n?.tasks ?? []).map((e) => [e.id, e])), p = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), m = d.flatMap((e) => e.sessions.map((t) => {
		let n = f.get(e.id)?.epic ?? null;
		return {
			slot: t.slot,
			role: t.role,
			focus: t.title,
			taskId: e.id,
			title: e.title,
			epic: n ? p.get(n) ?? at(n) : null,
			attempt: t.attempt,
			model: qt(t),
			startedAt: t.boundAt,
			lastAt: t.statusAt ?? t.boundAt,
			status: t.status,
			session: t
		};
	})).sort((e, t) => (t.lastAt ?? "").localeCompare(e.lastAt ?? "")), h = n ? rt(n) : /* @__PURE__ */ new Map(), g = i.filter((e) => nt(e) === "ready").map((e) => ({
		...e,
		wave: h.get(e.id) ?? 1
	})).sort((e, t) => (e.order ?? Infinity) - (t.order ?? Infinity) || e.wave - t.wave || e.id.localeCompare(t.id)), _ = (e.delivery ?? []).filter((e) => e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		at: on(e),
		issue: an(e),
		pulls: e.pullRequests.flatMap((e) => {
			let t = Gt(e.url);
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
		t.total += 1, nt(e) === "done" && (t.done += 1), b.set(e.epic, t);
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
var ln = "(max-width: 480px)";
function un(e, t) {
	return t ? "small" : e ? "wide" : "medium";
}
function dn(e) {
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
function fn(e) {
	return e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `${e.document}, lines ${e.lineStart}–${e.lineEnd}` : `${e.document}, line ${e.lineStart}` : e.document;
}
function pn(e, t) {
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
var mn = (e) => e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `Lines ${e.lineStart}–${e.lineEnd}` : `Line ${e.lineStart}` : null, hn = (e) => !!e && !e.startsWith("/") && !/^[A-Za-z]:/.test(e) && !e.split(/[\\/]/).includes("..");
function gn(e, t) {
	let n = -1;
	return e.forEach((r, i) => {
		r <= t && (n < 0 || r >= e[n]) && (n = i);
	}), n;
}
function _n(e, t, n) {
	if (!t) return [];
	if (n && n > t) {
		let r = e.flatMap((e, r) => e.line >= t && e.line <= n ? [r] : []);
		if (r.length) return r;
	}
	let r = gn(e.map((e) => e.line), t);
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
function vn(e) {
	let t = async (t, n, r, i) => (await e.post(At, {
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
function yn(e, t, n) {
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
function bn(e, t) {
	let n = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 60).replace(/-+$/, "");
	if (n.length < 3 && (n = `task-${n || "new"}`.replace(/-+$/, "")), !t.has(n)) return n;
	for (let e = 2;; e++) if (!t.has(`${n}-${e}`)) return `${n}-${e}`;
}
var xn = [
	"merged-pr",
	"integrated",
	"released",
	"answered"
], Sn = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean);
function Cn() {
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
function wn(e) {
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
function Tn(e, t) {
	let n = { id: e.id.trim() }, r = (e, r, i) => {
		t && JSON.stringify(r) === JSON.stringify(i) || (n[e] = r);
	};
	r("title", e.title.trim(), t?.title.trim()), r("summary", e.summary.trim(), t?.summary.trim()), r("acceptance", Sn(e.acceptance), t ? Sn(t.acceptance) : void 0), r("checks", Sn(e.checks), t ? Sn(t.checks) : void 0), e.epic && r("epic", e.epic, t?.epic), r("repository", e.repository.trim() || void 0, t && t.repository.trim() || void 0), n.repository === void 0 && delete n.repository;
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
function En(e) {
	return /Database changed/.test(e) ? "This task changed elsewhere. Reload it, then make your change again." : e;
}
function Dn(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
function On(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.floor((t - n) / 6e4));
	if (r < 60) return `${r} min`;
	let i = Math.floor(r / 60);
	return i < 24 ? `${i} h ${r % 60} min` : `${Math.floor(i / 24)} d ${i % 24} h`;
}
function kn(e) {
	if (e.link) return e.link;
	let t = e.slot.startsWith("dashboard:") ? e.slot.slice(10) : e.slot;
	return `/chat?sid=${encodeURIComponent(t)}`;
}
// kirocrew-app/ui/src/drawer-context.ts
var An = e({
	openTask: () => void 0,
	addTask: () => void 0,
	openReview: () => void 0
}), jn = () => n(An), Mn = "(none)", Nn = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : null, Pn = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : void 0, Fn = (e) => !!(e.q?.trim() || e.plan || e.epic || e.repository || e.state || e.waveMin || e.waveMax || e.authority || e.needsYou || e.archived), In = (e, t) => !e.planArchived || !!(t.archived || t.plan);
function Ln(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "", r = t.plan;
	return In(e, t) && (!n || e.title.toLowerCase().includes(n) || e.id.toLowerCase().includes(n)) && (!r || (r.startsWith("spec:") ? e.spec === r.slice(5) : r.startsWith("plan:") ? e.planId === r.slice(5) : !1)) && (!t.epic || e.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !e.repository : e.repository === t.repository)) && (!t.state || e.state === t.state) && (!t.waveMin || e.wave >= t.waveMin) && (!t.waveMax || e.wave <= t.waveMax) && (!t.authority || (e.authority ?? "local") === t.authority) && (!t.needsYou || e.state === "needs-you" || !!e.decision);
}
var Rn = (e, t) => ({
	id: e.id,
	title: e.title,
	epic: e.epic,
	planId: e.planId ?? null,
	spec: e.spec ?? null,
	repository: e.repository,
	authority: e.authority,
	state: nt(e),
	wave: t,
	decision: e.decision,
	planArchived: e.planArchived ?? null
});
function zn(e, t = {}) {
	let n = e?.tasks ?? [], r = e ? rt(e) : /* @__PURE__ */ new Map(), i = (e, t) => {
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
		plans: i(Nn, (e) => t[e] ?? e.replace(/^(spec|plan):/, "")),
		epics: i((e) => e.epic, (e) => a.get(e) ?? e),
		repositories: [...[...o].sort().map((e) => ({
			value: e,
			label: e
		})), ...n.some((e) => !e.repository) ? [{
			value: Mn,
			label: "No repository"
		}] : []],
		states: qe.map((e) => ({
			value: e.id,
			label: e.label
		})),
		authorities: i((e) => e.authority ?? "local", (e) => e),
		waves: Math.max(0, ...r.values())
	};
}
function Bn(e, t) {
	if (!Fn(t) && !e.tasks.some((e) => e.planArchived)) return e;
	let n = rt(e), r = e.tasks.filter((e) => Ln(Rn(e, n.get(e.id) ?? 1), t)), i = new Set(r.map((e) => e.id));
	return {
		...e,
		tasks: r,
		edges: e.edges.filter((e) => i.has(e.from) && i.has(e.to))
	};
}
var Vn = (e) => `avoozl.filters.${e}`, Hn = "avoozl-filter";
function Un(e, t) {
	try {
		let n = JSON.parse(e?.getItem(Vn(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of [
			"q",
			"plan",
			"epic",
			"repository",
			"authority"
		]) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		qe.some((e) => e.id === n.state) && (r.state = n.state);
		for (let e of ["waveMin", "waveMax"]) Number.isInteger(n[e]) && n[e] > 0 && (r[e] = n[e]);
		return n.needsYou === !0 && (r.needsYou = !0), n.archived === !0 && (r.archived = !0), r;
	} catch {
		return {};
	}
}
function Wn(e, t, n) {
	try {
		e?.setItem(Vn(t), JSON.stringify(n));
	} catch {}
}
function Gn(e, t) {
	let n = {
		...e,
		...t
	};
	for (let e of Object.keys(n)) (n[e] === void 0 || n[e] === "" || n[e] === !1) && delete n[e];
	return n;
}
// kirocrew-app/ui/src/delivery-api.ts
var Kn = [
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
], qn = [{
	id: "running",
	label: "Running"
}, {
	id: "reviewing",
	label: "Reviewing"
}];
function Jn(e, t) {
	return t === "in-progress" ? [...e.running, ...e.reviewing] : e[t];
}
function Yn(e) {
	return qn.map((t) => ({
		...t,
		cards: e[t.id]
	})).filter((e) => e.cards.length);
}
var Xn = (e) => `color-mix(in srgb, ${e} 8%, var(--card, transparent))`, Zn = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function Qn(e) {
	return e ? [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at),
		...e.deliveries.map((e) => typeof e.updatedAt == "string" ? e.updatedAt : null)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null : null;
}
var $n = Ke;
function er(e, t) {
	return e === "running" || e === "reviewing" ? "running" : e === "waiting" ? t && nt(t) === "deferred" ? "deferred" : "waiting" : e;
}
function tr(e, t) {
	let n = new Map((e?.tasks ?? []).map((e) => [e.id, e])), r = e ? rt(e) : /* @__PURE__ */ new Map(), i = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), a = {
		ready: [],
		running: [],
		reviewing: [],
		"needs-you": [],
		waiting: [],
		done: []
	}, o = /* @__PURE__ */ new Set(), s = (e, t) => {
		let n = t?.id ?? e.id;
		o.add(n);
		let s = e?.epic ?? null, c = (t?.sessions ?? []).map((e) => e.attempt), l = $n(e, t);
		a[l].push({
			id: n,
			title: t?.title ?? e.title,
			epic: s ? i.get(s) ?? at(s) : null,
			epicId: s,
			repository: e?.repository ?? null,
			planId: e?.planId ?? null,
			spec: e?.spec ?? null,
			state: er(l, e),
			wave: r.get(n) ?? 1,
			decision: e?.decision ?? null,
			authority: t?.authority ?? e?.authority ?? "local",
			route: e?.route ?? null,
			issue: t?.issue ?? e?.issue ?? null,
			item: t,
			attempt: c.length ? Math.max(...c) : null,
			sessions: t?.sessions ?? [],
			reviewRounds: t?.rounds?.length ?? 0,
			deliveryState: Zn(t),
			deferred: e ? nt(e) === "deferred" : !1,
			review: e?.review === !0,
			handSetReview: !!(t?.handSetReview ?? e?.handSetReview),
			noSession: t?.noSession ?? e?.noSession ?? null,
			nextAction: t?.nextAction ?? e?.nextAction ?? null,
			planArchived: t?.planArchived ?? e?.planArchived ?? null,
			at: Qn(t)
		});
	};
	for (let e of t) e.status !== "superseded" && s(n.get(e.id) ?? null, e);
	for (let t of e?.tasks ?? []) !o.has(t.id) && t.kind === "leaf" && t.status !== "superseded" && s(t, null);
	return a.done.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a.running.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a;
}
function nr(e) {
	let t = (e?.statuses ?? []).filter((e) => !e.complete && !["deferred", "blocked"].includes(e.id));
	return t.find((e) => e.id === "planned")?.id ?? t[0]?.id ?? null;
}
function rr(e) {
	let t = (e?.statuses ?? []).filter((e) => e.complete);
	return (t.find((e) => e.id === "done") ?? t.find((e) => e.id === "accepted") ?? t[0])?.id ?? null;
}
function ir(e, t) {
	return Object.fromEntries(Object.keys(e).map((n) => [n, e[n].filter((e) => Ln({
		...e,
		decision: e.decision ?? (e.deliveryState === "decision" ? "delivery stopped" : null)
	}, t))]));
}
var ar = {
	id: "done",
	label: "Done",
	tint: "var(--ok)"
};
function or(e, t, n = 16) {
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
function sr(e) {
	if (e) return e === "running" ? "in-progress" : e === "deferred" ? "waiting" : e;
}
var cr = (e) => e.route === "local" && !e.deferred, lr = le, ur = {
	dashboard: de,
	plans: V,
	graph: ge,
	delivery: fe,
	flow: W,
	conflicts: M,
	untriaged: se,
	settings: Oe
};
function dr(e) {
	let t = {
		kind: e.kind,
		taskId: e.taskId ?? null
	};
	return e.field && (t.field = e.field), e.slot && (t.slot = e.slot), e.id && (t.id = e.id), t;
}
function fr(e) {
	let t = async (t, n, r) => (await e.post(At, {
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
var pr = (e, t) => Math.min(t, Math.max(1, e) * 100), mr = (e) => `Show ${Math.min(100, e)} more (${e} left)`, hr = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), gr = (e) => hr.has(e);
function _r(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function vr() {
	let e = [], t = 1, n = () => {
		let t = _r(e, (e) => e.kind === "tab");
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
			let t = _r(e, (e) => gr(e.kind));
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
				let t = _r(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function yr(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return !!t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? "");
}
function br(e, t, n) {
	if (e.isComposing) return null;
	let r = n.steps();
	return e.key === "Escape" ? r.some((e) => gr(e.kind)) ? "escape" : null : !t || !r.length || !kt(e) || e.key === "ArrowLeft" && yr(e.target) ? null : "back";
}
function xr(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var Sr = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function Cr(e = Sr) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: vr(),
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
		restoreScroll: (t) => void e(() => xr(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
function wr(e, t, n, r, i, a) {
	let o = e.scrollTop(), s = e.history.push({
		kind: t,
		label: r,
		back: () => {
			e.history.release(s), a?.delete(s), e.memory.set(n, i), e.setters.get(n)?.(i), e.restoreScroll(o);
		}
	});
	return a?.add(s), s;
}
function Tr(e, t, n, r, i) {
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
var Er = "data-avoozl-app", Dr = e(null), Or = null, kr = () => n(Dr) ?? (Or ??= Cr()), Ar = (e) => e instanceof Element && !!e.closest("[data-avoozl-app]");
function jr({ children: e }) {
	let t = o(Cr, []);
	return r(() => {
		let e = !1, n = (t) => {
			let n = t.target;
			return n instanceof Element && n !== document.body && n !== document.documentElement ? Ar(n) : e;
		}, r = (t) => {
			e = Ar(t.target);
		}, i = (e) => {
			let r = br(e, n(e), t.history);
			r && (e.preventDefault(), e.stopImmediatePropagation(), r === "escape" ? t.history.escape() : t.history.back());
		}, a = (e) => Ot(e) && Ar(e.target) && t.history.steps().length > 0, o = (e) => {
			a(e) && (e.preventDefault(), e.stopImmediatePropagation());
		}, s = (e) => {
			a(e) && (o(e), t.history.back());
		};
		return window.addEventListener("pointerdown", r, !0), window.addEventListener("keydown", i, !0), window.addEventListener("mousedown", o, !0), window.addEventListener("mouseup", s, !0), window.addEventListener("auxclick", o, !0), () => {
			window.removeEventListener("pointerdown", r, !0), window.removeEventListener("keydown", i, !0), window.removeEventListener("mousedown", o, !0), window.removeEventListener("mouseup", s, !0), window.removeEventListener("auxclick", o, !0);
		};
	}, [t]), /* @__PURE__ */ b(Dr.Provider, {
		value: t,
		children: e
	});
}
function Mr(e, t, n, i, a) {
	let o = kr(), c = s({
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
function Nr(e, t, n = !0) {
	let i = kr(), [a, o] = c(() => n && i.memory.has(e) ? i.memory.get(e) : t);
	return r(() => {
		i.memory.set(e, a);
	}, [
		i,
		e,
		a
	]), [a, o];
}
function Pr(e, n, i, a, o = !0) {
	let c = kr(), [l, u] = Nr(e, a, o), d = s(l);
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
			Object.is(r, t) || (wr(c, n, e, f.current(r), r, p.current), u(t));
		}, [
			c,
			e,
			n,
			u
		]),
		u
	];
}
var Fr = {
	color: "var(--danger)",
	borderColor: "var(--danger)"
}, Ir = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Lr = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function X(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(q, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x(f, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...Lr,
				...e.style
			},
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function Z(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(q, {
		text: e.tooltip ?? e.label,
		children: (n) => /* @__PURE__ */ b(f, {
			type: "button",
			"aria-label": e.label,
			"aria-describedby": e.tooltip && e.tooltip !== e.label ? n : void 0,
			onClick: e.onClick,
			disabled: e.disabled,
			style: {
				...Lr,
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
var Rr = e(async () => !1), zr = () => n(Rr);
function Br({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return Mr("confirm", n !== null, "Cancel", () => l(!1)), r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ x(Rr.Provider, {
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
						children: [/* @__PURE__ */ b(f, {
							ref: a,
							type: "button",
							onClick: () => l(!1),
							children: "Cancel"
						}), /* @__PURE__ */ b(f, {
							type: "button",
							"data-danger": !0,
							onClick: () => l(!0),
							style: Ir,
							children: n.action
						})]
					})
				]
			})]
		})]
	});
}
function Vr(e) {
	let t = zr(), n = e.icon;
	return /* @__PURE__ */ b(q, {
		text: e.tooltip ?? e.label,
		children: (r) => /* @__PURE__ */ x(f, {
			type: "button",
			"data-danger": !0,
			"aria-label": e.label,
			"aria-describedby": e.tooltip ? r : void 0,
			disabled: e.disabled,
			onClick: () => void t(e.confirm).then((t) => t && e.onConfirm()),
			style: {
				...Lr,
				...Fr
			},
			children: [n && /* @__PURE__ */ b(n, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function Hr(e, t) {
	if (e.open) for (let n of t) n !== e && n.open && (n.open = !1);
}
function Ur(e) {
	let [t, n] = c(e.open ?? !1), { group: r } = e;
	return /* @__PURE__ */ x("details", {
		open: t,
		name: r,
		onToggle: (t) => {
			let i = t.currentTarget;
			n(i.open), e.onToggle?.(i.open), r && Hr(i, i.ownerDocument.querySelectorAll(`details[data-fold-group="${CSS.escape(r)}"]`));
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
				children: /* @__PURE__ */ b(j, { size: 14 })
			}), e.title]
		}), /* @__PURE__ */ b("div", {
			className: "pb-3",
			children: e.children
		})]
	});
}
function Wr(e) {
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
function Gr(e) {
	let n = l(), r = o(() => fr(n), [n]), { openChat: i } = u(), [a, s] = c(null);
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
					s(Y(e));
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
function Kr(e) {
	let [t, n] = c({
		reset: e,
		pages: {}
	}), r = t.reset === e ? t.pages : {}, i = (e, t) => pr(r[e] ?? 1, t);
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
function qr(e) {
	return e.left <= 0 ? null : /* @__PURE__ */ b("button", {
		type: "button",
		className: "mt-2 text-xs underline",
		onClick: e.onMore,
		"data-show-more": !0,
		children: mr(e.left)
	});
}
function Q({ tooltip: e, ...t }) {
	return /* @__PURE__ */ b(q, {
		text: e,
		children: (e) => /* @__PURE__ */ b(f, {
			...t,
			"aria-describedby": e
		})
	});
}
function Jr(e) {
	let t = ur[e.view];
	return /* @__PURE__ */ x("h2", {
		id: e.id,
		className: e.className ?? "flex items-center gap-2 text-lg font-semibold",
		children: [/* @__PURE__ */ b(t, {
			size: 18,
			"aria-hidden": "true",
			style: {
				color: "var(--muted)",
				flexShrink: 0
			}
		}), e.children]
	});
}
function Yr(e) {
	let t = ur[e.view];
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
function Xr({ text: e }) {
	let t = Gt(e);
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
function Zr({ label: e, records: t }) {
	return t.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [/* @__PURE__ */ b("span", {
			className: "font-medium",
			children: e
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-1",
			children: t.map((e, t) => /* @__PURE__ */ b("li", {
				className: "text-muted",
				children: Xt(e).map(([e, t]) => `${e}: ${t}`).join(" · ")
			}, t))
		})]
	}) : null;
}
function Qr({ rounds: e }) {
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
							children: Jt(e)
						}) : Jt(e),
						e.cause && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · ", e.cause]
						}),
						e.findings.length > 0 && /* @__PURE__ */ b("ul", {
							className: "ml-3 mt-1 flex flex-col gap-1",
							children: e.findings.map((e) => /* @__PURE__ */ x("li", { children: [
								/* @__PURE__ */ b(J, {
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
function $r({ reviews: e }) {
	let t = Gt(e.pullRequest), n = `PR ${e.pullRequestNumber ? `#${e.pullRequestNumber}` : ""}`;
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "GitHub reviews"
			}),
			" ",
			/* @__PURE__ */ b(J, {
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
					children: Yt(e)
				}, e.reviewer))
			})
		]
	});
}
function ei({ feedback: e }) {
	let t = Gt(e.pullRequest);
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "PR feedback"
			}),
			" ",
			Ht(e),
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
						let n = Gt(e.url);
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
function ti({ item: e, onSupersede: t }) {
	let [n, r] = c(!1), [i, a] = c({
		id: "",
		title: e.title
	}), [o, s] = c(!1), [l, u] = c(null);
	if (!n) return /* @__PURE__ */ b("div", {
		className: "mt-2",
		children: /* @__PURE__ */ b(Q, {
			tooltip: "Replace this task with a new one. Cannot be undone here.",
			onClick: () => r(!0),
			children: "Supersede"
		})
	});
	let d = async () => {
		s(!0), u(null);
		try {
			await t(e.id, $t(i)), r(!1);
		} catch (e) {
			u(Y(e));
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
				children: [/* @__PURE__ */ b(Vr, {
					disabled: o,
					confirm: {
						title: `Supersede ${e.id}?`,
						body: `${e.id} is marked superseded and a new task replaces it. Everything that waits on ${e.id} waits on the new task instead. This cannot be undone here.`,
						action: "Supersede"
					},
					onConfirm: () => void d(),
					children: "Create replacement"
				}), /* @__PURE__ */ b(f, {
					onClick: () => r(!1),
					disabled: o,
					children: "Cancel"
				})]
			})
		]
	});
}
function ni(e) {
	return (e.rounds ?? []).filter((e) => e.current).flatMap((e) => e.verdicts.flatMap((e) => e.findings.filter((e) => e.state === "open")));
}
function ri({ item: e, busy: t, onRetry: n }) {
	let r = ni(e), [i, a] = c(/* @__PURE__ */ new Set()), [o, s] = c("");
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
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(Vr, {
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
function ii({ item: e, onSupersede: t }) {
	return /* @__PURE__ */ x("div", {
		className: "mt-2 border-t pt-2",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ b(J, {
					variant: e.complete ? "success" : "info",
					children: e.status ?? "no status"
				}), e.repository && /* @__PURE__ */ b(J, { children: e.repository })]
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
					let n = Gt(e.url), r = `PR ${e.number ? `#${e.number}` : ""}${e.merged ? " (merged)" : ""}`;
					return /* @__PURE__ */ b("li", { children: n ? /* @__PURE__ */ b("a", {
						href: n,
						target: "_blank",
						rel: "noreferrer",
						className: "underline",
						children: r
					}) : r }, t);
				})
			}),
			e.githubReviews && /* @__PURE__ */ b($r, { reviews: e.githubReviews }),
			e.prFeedback && /* @__PURE__ */ b(ei, { feedback: e.prFeedback }),
			e.evidence.length > 0 && /* @__PURE__ */ x("div", {
				className: "mt-2 text-xs",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: "Evidence"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: e.evidence.map((e, t) => /* @__PURE__ */ x("li", { children: [
						e.text ? /* @__PURE__ */ b(Xr, { text: e.text }) : e.kind ?? "record",
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
			/* @__PURE__ */ b(Qr, { rounds: e.rounds ?? [] }),
			/* @__PURE__ */ b(Zr, {
				label: "Deliveries",
				records: e.deliveries
			}),
			/* @__PURE__ */ b(Zr, {
				label: "Worktrees",
				records: e.worktrees
			}),
			Qt(e) && /* @__PURE__ */ b(ti, {
				item: e,
				onSupersede: t
			})
		]
	});
}
// kirocrew-app/ui/src/conflicts-api.ts
function ai(e) {
	let t = (e.authority ?? "local") === "local";
	return e.kind === "stale-session" && e.slot ? "dismiss" : e.kind === "review" ? li(e).length ? "reviewed" : null : !t || e.kind === "needs-human" && e.reason === "hand-set-review" ? null : e.kind === "needs-human" ? e.reason === "blocked" ? "unblock" : "reviewed" : e.kind === "decision" ? "settle" : null;
}
var oi = {
	reviewed: "Mark reviewed",
	unblock: "Unblock",
	dismiss: "Dismiss",
	settle: "Settle"
}, si = {
	reviewed: "Count it as reviewed so it may start. Undo by editing it.",
	unblock: "Return it to planned so it may start when ready.",
	dismiss: "Remove the ended session from this list. Its chat is kept.",
	settle: "Clear the decision and note your answer on the task."
}, ci = (e) => `${e.kind ?? ""}:${e.taskId ?? ""}:${e.field ?? ""}:${e.slot ?? ""}${e.id ? `:${e.id}` : ""}`, li = (e) => (e.tasks ?? []).filter((e) => (e.authority ?? "local") === "local").map((e) => ({ taskId: e.id })), ui = (e) => e.kind === "review" ? li(e) : [e.slot ? {
	taskId: e.taskId,
	slot: e.slot
} : { taskId: e.taskId }], di = (e) => e.reduce((e, t) => e + ui(t).length, 0);
function fi(e, t, n) {
	let r = new Set(n.settled.map((e) => `${e.taskId}\u0000${e.slot ?? ""}`)), i = (e) => r.has(`${e}\u0000`);
	return e.flatMap((e) => {
		if (ai(e) !== t) return [e];
		if (e.kind === "review") {
			let t = (e.tasks ?? []).filter((e) => !i(e.id));
			return t.length === (e.tasks ?? []).length ? [e] : t.length ? [pi(e, t)] : [];
		}
		return r.has(`${e.taskId}\u0000${t === "dismiss" ? e.slot ?? "" : ""}`) ? [] : [e];
	});
}
function pi(e, t) {
	let n = t.length;
	return {
		...e,
		tasks: t,
		title: `Review ${n} ${n === 1 ? "task" : "tasks"} in ${e.plan ?? "this plan"}: their design text changed`
	};
}
function mi(e, t) {
	let n = t.settled.length, r = [n ? `${oi[e]}: ${n} done.` : ""];
	return t.refused.length && r.push(`Refused ${t.refused.length}: ${t.refused.map((e) => `${e.taskId} (${e.reason})`).join("; ")}`), {
		ok: t.refused.length === 0,
		text: r.filter(Boolean).join(" ")
	};
}
function hi(e) {
	return e.kind === "github-conflict" && !e.choices?.length ? e.field === "identity" ? "Two issues claim this task. Close or merge the duplicate issue on GitHub; Avoozl reads the result on its next tick." : e.field === "Avoozl state" ? "Avoozl fills Avoozl state and already wrote its value back. Move the card’s Status instead. This clears when the task’s state next changes." : "GitHub owns the issue state. Reopen or close it on GitHub; Avoozl reads the result on its next tick." : e.kind === "resource" ? "Two active runs share a resource. Stop one run, or wait for one to finish." : e.kind === "tracker-conflict" ? "The tracker record owns this field. Change it there or in the plan." : e.kind === "content-unavailable" ? "Add or fix this rule set’s terms file or plugin on this machine. Avoozl checks again on the next tick." : e.kind === "content-match" ? null : e.kind === "needs-human" && e.reason === "hand-set-review" ? "Discuss it, mark it done, or move it back to planned from the task." : e.kind === "review" && ai(e) === null ? "GitHub or a plugin owns these tasks. Review them where they live." : ai(e) === null && e.kind !== "github-conflict" ? `${e.authority} owns this task. Settle it where it lives.` : null;
}
var gi = [
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
function _i(e) {
	return Object.fromEntries(gi.map((t) => [t.key, e.filter(t.keep).length]));
}
function vi(e) {
	return e.kind === "github-conflict" ? `${e.changedBy ?? "Someone"} changed ${e.field ?? "a managed field"} on GitHub; Avoozl manages it. ${e.detail}` : e.kind === "needs-human" && e.reason === "crew" || e.kind === "needs-human" && e.reason === "hand-set-review" ? e.detail : e.kind === "needs-human" ? e.reason === "blocked" ? "Marked blocked: nothing starts until you unblock it." : "New or edited: it waits for your review before it can start." : e.kind === "review" ? e.detail : e.kind === "decision" ? `An open question stops this task: ${e.detail}` : e.kind === "stale-session" ? `Its chat ended before the task finished. ${e.detail}` : e.detail;
}
var yi = (e) => e.changedAt ?? e.openedAt ?? null;
function bi(e) {
	let t = new Set(e.map(ai));
	if (t.size !== 1) return null;
	let [n] = t;
	return n && n !== "settle" ? n : null;
}
function xi(e, t, n) {
	let r = t === 1 && n ? n : `${t} ${e === "reviewed" ? "tasks" : "items"}`;
	return {
		title: `${oi[e]}: ${r}?`,
		body: {
			reviewed: "They count as reviewed and may start when ready. To undo, edit each task again.",
			unblock: "They go back to planned and may start when ready.",
			dismiss: "The ended sessions leave the list. Their chats are not deleted.",
			settle: "The decision is cleared and your answer is noted on the task."
		}[e],
		action: oi[e]
	};
}
function Si(e) {
	let t = /* @__PURE__ */ new Set(["closed", "lost"]), n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.sessions.filter((e) => !t.has(e.status ?? "")).sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
		e[0] && n.set(r.id, kn(e[0]));
	}
	return n;
}
var Ci = 864e5, wi = [
	{
		value: "1d",
		label: "Older than a day",
		ms: Ci
	},
	{
		value: "7d",
		label: "Older than a week",
		ms: 7 * Ci
	},
	{
		value: "30d",
		label: "Older than 30 days",
		ms: 30 * Ci
	}
], Ti = (e) => e.taskId ?? e.tasks?.[0]?.id ?? null, Ei = (e, t) => e.issue?.repository ?? t?.repository ?? null;
function Di(e, t, n, r) {
	let i = t.q?.trim().toLowerCase() ?? "", a = gi.find((e) => e.key === t.kind), o = wi.find((e) => e.value === t.age), s = yi(e), c = Ei(e, n);
	return (!i || e.title.toLowerCase().includes(i) || (e.taskId ?? "").toLowerCase().includes(i) || e.detail.toLowerCase().includes(i)) && (!a || a.keep(e)) && (!t.plan || (n ? Nn(n) : null) === t.plan) && (!t.epic || n?.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !c : c === t.repository)) && (!o || s !== null && r - Date.parse(s) > o.ms) && (!t.changedBy || e.changedBy === t.changedBy);
}
function Oi(e, t) {
	let n = new Map((t?.tasks ?? []).map((e) => [e.id, e])), r = new Map((t?.epics ?? []).map((e) => [e.id, e.title])), i = _i(e), a = (t, n = (e) => e) => {
		let r = /* @__PURE__ */ new Set();
		for (let n of e) {
			let e = t(n);
			e && r.add(e);
		}
		return [...r].map((e) => ({
			value: e,
			label: n(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, o = (e) => n.get(Ti(e) ?? "");
	return {
		kinds: gi.filter((e) => e.key !== "all").map((e) => ({
			value: e.key,
			label: `${e.label} (${i[e.key]})`
		})),
		plans: a((e) => {
			let t = o(e);
			return t ? Nn(t) : null;
		}, (e) => e.replace(/^(spec|plan):/, "")),
		epics: a((e) => o(e)?.epic, (e) => r.get(e) ?? e),
		repositories: [...a((e) => Ei(e, o(e))), ...e.some((e) => !Ei(e, o(e))) ? [{
			value: Mn,
			label: "No repository"
		}] : []],
		ages: wi.map(({ value: e, label: t }) => ({
			value: e,
			label: t
		})),
		changedBy: a((e) => e.changedBy)
	};
}
var ki = "avoozl-conflict-filter", Ai = (e) => `avoozl.conflict-filters.${e}`, ji = [
	"q",
	"kind",
	"plan",
	"epic",
	"repository",
	"age",
	"changedBy"
];
function Mi(e, t) {
	try {
		let n = JSON.parse(e?.getItem(Ai(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of ji) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		return r.kind && !gi.some((e) => e.key === r.kind && e.key !== "all") && delete r.kind, r.age && !wi.some((e) => e.value === r.age) && delete r.age, r;
	} catch {
		return {};
	}
}
function Ni(e, t, n) {
	try {
		e?.setItem(Ai(t), JSON.stringify(n));
	} catch {}
}
var Pi = (e) => ji.some((t) => !!e[t]?.trim());
// kirocrew-app/ui/src/useRead.ts
function Fi(e, n) {
	let [i, a] = c(null), [o, s] = c(null), [l, u] = c(!1), d = t(async () => {
		if (e) {
			u(!0), s(null);
			try {
				a(await n(e));
			} catch (e) {
				s(Y(e));
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
function Ii({ owner: e }) {
	if (!e.authority) return null;
	if (e.authority !== "github") return /* @__PURE__ */ b(J, { children: e.authority });
	if (!e.issue) return /* @__PURE__ */ b(J, { children: "pending projection" });
	let t = Gt(e.issue.url), n = e.issue.number ? `#${e.issue.number}` : "GitHub";
	return t ? /* @__PURE__ */ b("a", {
		href: t,
		target: "_blank",
		rel: "noreferrer",
		className: "text-xs underline",
		children: n
	}) : /* @__PURE__ */ b(J, { children: n });
}
// kirocrew-app/ui/src/FilterSelect.tsx
var Li = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Ri(e) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e.id,
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: { maxWidth: "13rem" },
		children: [/* @__PURE__ */ b("span", { children: e.label }), /* @__PURE__ */ x("select", {
			id: e.id,
			value: e.value,
			onChange: (t) => e.onChange(t.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: Li,
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
var zi = {
	...Li,
	width: "4.5rem"
}, Bi = (e) => {
	let t = Number(e);
	return Number.isInteger(t) && t > 0 ? t : void 0;
};
function Vi({ id: e, field: t }) {
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
			style: Li
		})]
	}) : t.kind === "select" ? /* @__PURE__ */ b(Ri, {
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
					onChange: (e) => t.onChange(Bi(e.target.value), t.max),
					className: "rounded border px-2 py-1 text-sm",
					style: zi
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
					onChange: (e) => t.onChange(t.min, Bi(e.target.value)),
					className: "rounded border px-2 py-1 text-sm",
					style: zi
				})
			]
		})]
	});
}
function Hi(e) {
	let t = fc("(max-width: 767px)"), [n, r] = c(!1), i = /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-end gap-3",
		"data-filter-bar": !0,
		children: [e.fields.map((t) => /* @__PURE__ */ b(Vi, {
			id: e.id,
			field: t
		}, t.key)), /* @__PURE__ */ x(Q, {
			tooltip: "Clear every filter on this tab",
			type: "button",
			onClick: e.onClear,
			disabled: !e.active,
			style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6
			},
			children: [/* @__PURE__ */ b(Ne, {
				size: 14,
				"aria-hidden": "true"
			}), "Clear"]
		})]
	});
	return /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b("div", {
		role: "search",
		"aria-label": e.label,
		"data-filter-panel": e.id,
		children: t ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-2",
			children: [/* @__PURE__ */ x(f, {
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
function Ui() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function Wi(e, n) {
	let { event: i, read: a, write: o, empty: s } = n, [l, u] = c(() => e ? a(Ui(), e) : s);
	return r(() => {
		u(e ? a(Ui(), e) : s);
		let t = () => e && u(a(Ui(), e));
		return window.addEventListener(i, t), () => window.removeEventListener(i, t);
	}, [
		e,
		i,
		a,
		s
	]), [l, t((t) => {
		u(t), e && (o(Ui(), e, t), window.dispatchEvent(new Event(i)));
	}, [
		e,
		i,
		o
	])];
}
function Gi(e, t, n) {
	e.write(Ui(), t, n), window.dispatchEvent(new Event(e.event));
}
// kirocrew-app/ui/src/ConflictsView.tsx
var Ki = {
	event: ki,
	read: Mi,
	write: Ni,
	empty: {}
}, qi = {
	...Zt,
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit"
}, Ji = {
	title: "Title",
	body: "Managed body section",
	labels: "Managed labels",
	blockers: "Blocked-by links",
	state: "Issue state",
	identity: "Issue identity"
}, Yi = (e) => Array.isArray(e) ? e.length ? e.join(", ") : "none" : e || "empty";
function Xi({ item: e }) {
	if (e.expected === void 0 && e.actual === void 0) return null;
	let t = (e, t) => /* @__PURE__ */ x("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ b("div", {
			className: "text-xs text-muted",
			children: e
		}), /* @__PURE__ */ b("pre", {
			className: "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs",
			style: { borderColor: "var(--border)" },
			children: Yi(t)
		})]
	});
	return /* @__PURE__ */ x("div", {
		className: "mt-2 grid gap-2",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" },
		children: [t("Avoozl expected", e.expected), t(e.changedBy ? `GitHub has (changed by ${e.changedBy})` : "GitHub has", e.actual)]
	});
}
function Zi(e) {
	let { item: t, workspaceId: n, revision: r, busy: i, run: a } = e, s = l(), u = o(() => Ut(s), [s]), d = o(() => vn(s), [s]), [f, p] = c(""), m = ai(t), h = Gt(t.issue?.url ?? null), _ = (i, o) => a(async () => {
		let a = await d.settle(n, i, ui(t), r, o);
		return e.onSettled(i, a), mi(i, a);
	}), v = hi(t);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			t.kind === "content-match" && t.id && /* @__PURE__ */ b($i, {
				id: t.id,
				readable: t.readable === !0,
				workspaceId: n,
				busy: i,
				run: a
			}),
			t.kind === "github-conflict" && (t.choices?.length ?? 0) > 0 && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(Vr, {
						icon: Te,
						tooltip: "Next tick writes Avoozl's value over the GitHub edit",
						disabled: i || t.resolution === "desired",
						confirm: {
							title: `Re-apply Avoozl's ${Ji[t.field ?? ""] ?? t.field} on ${t.taskId}?`,
							body: `The next tick writes Avoozl's value over the edit ${t.changedBy ?? "someone"} made on GitHub. Their text is lost unless they keep a copy.`,
							action: "Re-apply"
						},
						onConfirm: () => a(async () => (await u.resolveConflict(n, t.taskId, t.field, "desired"), {
							ok: !0,
							text: "Avoozl rewrites it on the next tick."
						})),
						children: "Re-apply Avoozl’s value"
					}),
					/* @__PURE__ */ b(X, {
						icon: A,
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
					htmlFor: `answer-${ci(t)}`,
					className: "flex flex-1 flex-col gap-1 text-xs",
					style: { minWidth: "16rem" },
					children: [/* @__PURE__ */ x("span", { children: [
						"Your answer to “",
						t.detail,
						"”"
					] }), /* @__PURE__ */ b(g, {
						id: `answer-${ci(t)}`,
						value: f,
						onChange: (e) => p(e.target.value)
					})]
				}), /* @__PURE__ */ b(Vr, {
					icon: A,
					tooltip: si.settle,
					disabled: i || !f.trim(),
					confirm: xi("settle", 1, t.title),
					onConfirm: () => _("settle", f.trim()),
					children: "Settle"
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					m === "dismiss" && /* @__PURE__ */ b(Vr, {
						icon: Ne,
						tooltip: si.dismiss,
						disabled: i,
						confirm: xi("dismiss", 1, t.title),
						onConfirm: () => _("dismiss"),
						children: "Dismiss"
					}),
					t.kind === "review" && m === "reviewed" && /* @__PURE__ */ b(Qi, {
						item: t,
						busy: i,
						onConfirm: () => _("reviewed")
					}),
					m && m !== "settle" && m !== "dismiss" && t.kind !== "review" && /* @__PURE__ */ b(X, {
						icon: A,
						tooltip: si[m],
						disabled: i,
						onClick: () => _(m),
						children: oi[m]
					}),
					t.kind === "stale-session" && t.deliveryState === "decision" && /* @__PURE__ */ b(X, {
						icon: Te,
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
					t.kind === "tracker-conflict" && Gt(t.link ?? null) && /* @__PURE__ */ b("a", {
						href: Gt(t.link ?? null),
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
function Qi({ item: e, busy: t, onConfirm: n }) {
	let r = zr(), i = di([e]);
	return /* @__PURE__ */ x(X, {
		icon: A,
		tooltip: "Count these tasks as reviewed so they may start when ready",
		disabled: t,
		onClick: () => void r(xi("reviewed", i, i === 1 ? e.tasks?.[0]?.title : void 0)).then((e) => e && n()),
		children: [
			"Mark ",
			i,
			" reviewed"
		]
	});
}
function $i(e) {
	let { id: t, readable: n, workspaceId: r, busy: i, run: a } = e, s = l(), u = o(() => Ut(s), [s]), [d, f] = c(""), [p, m] = c(null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			n && /* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-2",
				children: /* @__PURE__ */ b(X, {
					icon: B,
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
				}), /* @__PURE__ */ b(Vr, {
					icon: A,
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
function ea({ item: e, workspaceId: t }) {
	let n = l(), i = o(() => vn(n), [n]), [a, s] = c(null), [u, d] = c(null);
	return r(() => {
		e.taskId && i.detail(t, e.taskId).then(s, (e) => d(Y(e)));
	}, [
		i,
		t,
		e.taskId
	]), /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		"data-history": !0,
		children: [
			/* @__PURE__ */ b(Xi, { item: e }),
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
					children: [/* @__PURE__ */ b(q, {
						text: e.at,
						children: /* @__PURE__ */ b("span", {
							className: "w-20 shrink-0 text-muted",
							children: Dn(e.at)
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
function ta(e) {
	let { item: t } = e, n = jn(), [r, i] = c(null), a = yi(t);
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
					/* @__PURE__ */ b(J, {
						variant: [
							"decision",
							"needs-human",
							"review",
							"content-match",
							"content-unavailable"
						].includes(t.kind) ? "warning" : "danger",
						children: qi[t.kind] ?? t.kind
					}),
					t.field && /* @__PURE__ */ b(J, { children: Ji[t.field] ?? t.field }),
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
					/* @__PURE__ */ b(Ii, { owner: t }),
					e.plan && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["· plan ", e.plan]
					}),
					a && /* @__PURE__ */ b(q, {
						text: a,
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["· ", Dn(a)]
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
								children: [/* @__PURE__ */ b(te, {
									size: 14,
									"aria-hidden": "true"
								}), "Attach"]
							}),
							/* @__PURE__ */ b(Z, {
								icon: he,
								label: `Ask in a chat about ${t.title}`,
								tooltip: "Ask in a chat: a new chat seeded with this item's full context",
								onClick: e.onAsk
							}),
							t.kind === "review" ? /* @__PURE__ */ b(Z, {
								icon: lr,
								label: `Info: ${t.title}`,
								tooltip: "Why these tasks need review, and the list of them",
								onClick: () => n.openReview(t, e.onReviewed)
							}) : /* @__PURE__ */ b(Z, {
								icon: oe,
								label: `History of ${t.title}`,
								tooltip: "History",
								onClick: () => i(r === "history" ? null : "history")
							}),
							t.taskId && /* @__PURE__ */ b(Z, {
								icon: lr,
								label: `View task ${t.taskId}`,
								tooltip: "Open this task's details in the drawer",
								onClick: () => n.openTask(t.taskId)
							}),
							/* @__PURE__ */ b(X, {
								icon: A,
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
				children: vi(t)
			}),
			r === "history" && /* @__PURE__ */ b(ea, {
				item: t,
				workspaceId: e.workspaceId
			}),
			r === "resolve" && /* @__PURE__ */ b("div", {
				className: "mt-2 rounded border p-2",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(Zi, {
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
function na({ workspaceId: e }) {
	let n = l(), i = o(() => Ut(n), [n]), a = o(() => vn(n), [n]), s = Gr(e), u = zr(), { value: d, error: m, busy: h, reload: g } = Fi(e, t(async (e) => {
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
	}, [i])), [_, v] = Wi(e, Ki), S = JSON.stringify(_), C = Kr(S), [w, T] = c(null), [E, D] = c(0), [O, k] = c(/* @__PURE__ */ new Set()), [A, j] = c(!1), [M, N] = c(null);
	r(() => {
		T(d?.page.items ?? null), D(d?.page.revision ?? 0), k(/* @__PURE__ */ new Set());
	}, [d]);
	let P = o(() => {
		let e = d?.graph ?? null;
		return new Map((e?.tasks ?? []).map((e) => [e.id, e.spec ?? e.planId ?? (e.epic ? at(e.epic) : null)]));
	}, [d]), F = o(() => new Map((d?.graph?.tasks ?? []).map((e) => [e.id, e])), [d]);
	r(() => k(/* @__PURE__ */ new Set()), [S]);
	let I = o(() => Si(d?.delivery ?? []), [d]), L = (e) => {
		j(!0), N(null), (async () => {
			try {
				N(await e());
			} catch (e) {
				let t = Y(e);
				N({
					ok: !1,
					text: /Database changed/.test(t) ? "Something changed elsewhere. Refresh, then try again." : t
				});
			} finally {
				j(!1);
			}
		})();
	}, ee = (e, t) => {
		D(t.revision), T((n) => n && fi(n, e, t)), k(/* @__PURE__ */ new Set());
	}, R = w ?? [], z = Oi(R, d?.graph ?? null), te = Date.now(), B = R.filter((e) => Di(e, _, F.get(Ti(e) ?? ""), te)), V = C.take("conflicts", B), H = B.filter((e) => O.has(ci(e))), ne = V.length > 0 && V.every((e) => O.has(ci(e))), U = H.length === B.length && B.length > 0, W = bi(H), re = (e) => {
		let t = {
			..._,
			...e
		};
		for (let e of Object.keys(t)) t[e] || delete t[e];
		v(t);
	}, G = async () => {
		e && W && await u(xi(W, di(H))) && L(async () => {
			let t = await a.settle(e, W, H.flatMap(ui), E);
			return ee(W, t), mi(W, t);
		});
	}, ie = (e, t) => {
		let n = new Set(O);
		t ? n.add(ci(e)) : n.delete(ci(e)), k(n);
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-conflicts-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(Jr, {
					id: "avoozl-conflicts-title",
					view: "conflicts",
					children: "Conflicts"
				}), e && /* @__PURE__ */ b(X, {
					icon: we,
					onClick: () => void g(),
					disabled: h || A,
					children: "Refresh"
				})]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Edits to what Avoozl manages on an issue, decisions, tasks waiting on you, and sessions that ended. Board drags are orders, not conflicts."
			}),
			(m || s.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: m ?? s.error
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
				/* @__PURE__ */ b(Hi, {
					id: "avoozl-conflicts",
					label: "Filter conflicts",
					active: Pi(_),
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
										for (let n of V) e.target.checked ? t.add(ci(n)) : t.delete(ci(n));
										k(t);
									}
								}),
								"Select the ",
								V.length,
								" shown"
							]
						}),
						B.length > V.length && /* @__PURE__ */ x(Q, {
							tooltip: "Select every matching item, including ones not shown yet",
							type: "button",
							onClick: () => k(new Set(B.map(ci))),
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
							/* @__PURE__ */ x(X, {
								icon: he,
								tooltip: "Start a Kiro Crew chat seeded with the selected items",
								onClick: () => void s.ask({ items: H.map(dr) }),
								children: [
									"Ask in a chat about ",
									H.length,
									" ",
									H.length === 1 ? "item" : "items"
								]
							}),
							W ? /* @__PURE__ */ x(Q, {
								tooltip: si[W],
								type: "button",
								primary: !0,
								onClick: () => void G(),
								disabled: A,
								children: [
									oi[W],
									" ",
									H.length
								]
							}) : /* @__PURE__ */ b("span", {
								className: "text-xs text-muted",
								children: "Bulk resolve needs items of one kind."
							}),
							/* @__PURE__ */ b(f, {
								onClick: () => k(/* @__PURE__ */ new Set()),
								disabled: A,
								children: "Clear selection"
							})
						] })
					]
				}),
				/* @__PURE__ */ x(p, { children: [
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: V.map((t) => /* @__PURE__ */ b(ta, {
							item: t,
							plan: t.taskId ? P.get(t.taskId) ?? null : null,
							onReviewed: () => void g(),
							attach: (t.kind === "stale-session" ? t.link : null) ?? (t.taskId ? I.get(t.taskId) ?? null : null),
							workspaceId: e,
							revision: E,
							busy: A,
							selectable: !0,
							selected: O.has(ci(t)),
							onSelect: (e) => ie(t, e),
							run: L,
							onSettled: ee,
							onAsk: () => void s.ask({ items: [dr(t)] })
						}, ci(t)))
					}),
					/* @__PURE__ */ b(qr, { ...C.more("conflicts", B.length) }),
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
var ra = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
function ia(e) {
	let t = [], n = new RegExp(ra.source, "g"), r = 0, i;
	for (; i = n.exec(e);) i.index > r && t.push({
		kind: "text",
		text: e.slice(r, i.index)
	}), i[1] ? t.push({
		kind: "code",
		text: i[1].slice(1, -1)
	}) : i[2] ? t.push({
		kind: "strong",
		children: ia(i[2].slice(2, -2))
	}) : i[3] ? t.push({
		kind: "em",
		children: ia(i[3].slice(1, -1))
	}) : t.push({
		kind: "link",
		href: Gt(i[6]),
		children: ia(i[5])
	}), r = i.index + i[0].length;
	return r < e.length && t.push({
		kind: "text",
		text: e.slice(r)
	}), t;
}
var aa = (e) => e.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((e) => e.trim()), oa = /^\s*\|.*\|\s*$/, sa = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, ca = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
function la(e) {
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
		if (oa.test(o) && e + 1 < t.length && sa.test(t[e + 1])) {
			a();
			let r = e + 1, i = aa(o), s = [];
			for (e += 2; e < t.length && oa.test(t[e]); e++) s.push(aa(t[e]));
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
		let u = ca.exec(o);
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
var ua = (e, t, n) => `${e}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section"}-${n}`;
function da(e, t, n = 3) {
	return la(e).flatMap((e, r) => e.kind === "heading" && e.level <= n ? [{
		level: e.level,
		text: e.text.replace(/[*_`]/g, ""),
		id: ua(t, e.text, r)
	}] : []);
}
// kirocrew-app/ui/src/prism/before.ts
var fa = globalThis;
// node_modules/prismjs/components/prism-sql.js
fa.__avoozlPrismPrevious = fa.Prism, fa.Prism = {
	manual: !0,
	disableWorkerMessageHandler: !0
}, (/* @__PURE__ */ Pe(((e, t) => {
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
var pa = globalThis, ma = pa.Prism;
pa.__avoozlPrismPrevious === void 0 ? delete pa.Prism : pa.Prism = pa.__avoozlPrismPrevious, delete pa.__avoozlPrismPrevious;
// kirocrew-app/ui/src/highlight.ts
var ha = [
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
], ga = {
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
}, _a = /* @__PURE__ */ new Map();
function va(e) {
	if (!e || !Array.isArray(e.tokens)) return null;
	let t = {};
	try {
		e.tokens.forEach((e, n) => {
			let r = ha.includes(e.type) ? e.type : "plain", i = [...new Set(String(e.flags ?? "").replace(/[^imsu]/g, ""))].join("");
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
function ya(e) {
	_a.clear();
	for (let [t, n] of Object.entries(e ?? {})) {
		let e = va(n);
		e && _a.set(t.toLowerCase(), e);
	}
	return [..._a.keys()];
}
function ba(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return _a.get(t) ?? ma.languages[ga[t] ?? t] ?? null;
}
var xa = (e) => Array.isArray(e) ? e.flatMap(xa) : typeof e == "string" ? [e] : [{
	types: [e.type, ...[e.alias ?? []].flat()],
	content: xa(e.content)
}];
function Sa(e, t) {
	let n = ba(t);
	if (!n || e.length > 2e4) return null;
	try {
		return xa(ma.tokenize(e, n));
	} catch {
		return null;
	}
}
var Ca = {
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
function wa(e) {
	let t = [...e].reverse().find((e) => Ca[e]) ?? e.find((e) => Ca[e]);
	return {
		...t ? { color: Ca[t] } : {},
		...e.includes("comment") ? { fontStyle: "italic" } : {}
	};
}
// kirocrew-app/ui/src/Markdown.tsx
function Ta({ parts: e }) {
	return e.map((e, t) => e.kind === "text" ? e.text : e.kind === "code" ? /* @__PURE__ */ b("code", {
		className: "rounded px-1 text-[12px]",
		style: { background: "var(--bg-elevated)" },
		children: e.text
	}, t) : e.kind === "strong" ? /* @__PURE__ */ b("strong", { children: /* @__PURE__ */ b(Ta, { parts: e.children }) }, t) : e.kind === "em" ? /* @__PURE__ */ b("em", { children: /* @__PURE__ */ b(Ta, { parts: e.children }) }, t) : e.href ? /* @__PURE__ */ b("a", {
		href: e.href,
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		style: { color: "var(--accent)" },
		children: /* @__PURE__ */ b(Ta, { parts: e.children })
	}, t) : /* @__PURE__ */ b(Ta, { parts: e.children }, t));
}
var Ea = ({ text: e }) => /* @__PURE__ */ b(Ta, { parts: ia(e) });
function Da({ tokens: e }) {
	return e.map((e, t) => typeof e == "string" ? e : /* @__PURE__ */ b("span", {
		style: wa(e.types),
		children: /* @__PURE__ */ b(Da, { tokens: e.content })
	}, t));
}
function Oa({ text: e, lang: t, line: n }) {
	let r = Sa(e, t);
	return /* @__PURE__ */ b("pre", {
		className: "overflow-x-auto rounded border p-2 text-[12px]",
		style: {
			borderColor: "var(--border)",
			background: "var(--bg-elevated)"
		},
		"data-lang": t ?? void 0,
		"data-line": n,
		"data-highlighted": r ? "true" : void 0,
		children: /* @__PURE__ */ b("code", { children: r ? /* @__PURE__ */ b(Da, { tokens: r }) : e })
	});
}
function ka({ text: e, idPrefix: t, measure: n }) {
	let r = n ? { maxWidth: n } : void 0;
	return /* @__PURE__ */ b("div", {
		className: "flex min-w-0 flex-col gap-2 break-words text-sm leading-relaxed",
		style: { color: "var(--text)" },
		children: la(e).map((e, n) => {
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
					id: t ? ua(t, e.text, n) : void 0,
					className: `${i} mt-2 font-semibold`,
					style: {
						...r,
						scrollMarginTop: 12
					},
					children: /* @__PURE__ */ b(Ea, { text: e.text })
				}, n);
			}
			if (e.kind === "paragraph") return /* @__PURE__ */ b("p", {
				"data-line": e.line,
				style: r,
				children: /* @__PURE__ */ b(Ea, { text: e.text })
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
				children: /* @__PURE__ */ b(Ea, { text: e.text })
			}, n);
			if (e.kind === "code") return /* @__PURE__ */ b(Oa, {
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
						children: /* @__PURE__ */ b(Ea, { text: e })
					}, t)) }) }), /* @__PURE__ */ b("tbody", { children: e.rows.map((t, n) => /* @__PURE__ */ b("tr", { children: e.head.map((e, n) => /* @__PURE__ */ b("td", {
						className: "border px-2 py-1 align-top",
						style: { borderColor: "var(--border)" },
						children: /* @__PURE__ */ b(Ea, { text: t[n] ?? "" })
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
					}), /* @__PURE__ */ b(Ea, { text: e.text })]
				}, t))
			}, n);
		})
	});
}
// kirocrew-app/ui/src/focus-trap.ts
function Aa(e, t, n) {
	return e === 0 ? -1 : t < 0 ? n ? e - 1 : 0 : n ? (t - 1 + e) % e : (t + 1) % e;
}
// kirocrew-app/ui/src/new-plan-api.ts
var ja = /^[a-z0-9][a-z0-9-]{0,79}$/, Ma = {
	name: "",
	category: "",
	epics: "",
	repositories: [],
	goal: "",
	context: ""
};
function Na(e) {
	return e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 80).replace(/-+$/, "");
}
function Pa(e, t) {
	let n = e.trim();
	if (!n) return "Name the plan.";
	if (!ja.test(n)) {
		let e = Na(n);
		return `Use lowercase letters, digits and hyphens, up to 80 characters${e && e !== n ? `, like ${e}` : ""}.`;
	}
	for (let e of t) if (e === n) return `${n} is already used by a plan or spec folder.`;
	return null;
}
function Fa(e, t, n) {
	let r = [], i = Pa(e.name, t);
	return i && r.push(i), n ? e.repositories.length || r.push("Pick at least one repository.") : r.push("Register a repository in Settings › Repositories first."), e.goal.trim() || r.push("Say what you want."), r;
}
var Ia = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean), La = (e) => JSON.stringify(e) !== JSON.stringify(Ma);
function Ra(e) {
	return { request: async (t, n) => (await e.post(At, {
		operation: "plan.new",
		workspaceId: t,
		input: {
			name: n.name.trim(),
			category: n.category.trim(),
			epics: Ia(n.epics),
			repositories: n.repositories,
			goal: n.goal,
			context: n.context
		}
	})).result };
}
// kirocrew-app/ui/src/NewPlanDrawer.tsx
var za = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, Ba = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
function Va(e) {
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
function Ha(e) {
	let t = l(), n = o(() => Ra(t), [t]), { openChat: i } = u(), a = zr(), d = fc("(max-width: 767px)"), p = fc("(prefers-reduced-motion: reduce)"), [m, h] = c(Ma), [_, v] = c(null), [y, S] = c(!1), [C, w] = c(!1), [T, E] = c(!1), [D, O] = c(null), [k, A] = c(!1), j = s(null), M = (e) => h((t) => ({
		...t,
		...e
	}));
	r(() => {
		let n = !0;
		return jt(t).repositories(e.workspaceId).then((e) => {
			if (!n) return;
			let t = e.filter((e) => !e.planning);
			v(t), t.length === 1 && M({ repositories: [t[0].id] });
		}, (e) => n && (v([]), O(Y(e)))), () => {
			n = !1;
		};
	}, [t, e.workspaceId]);
	let N = La(m), P = async () => {
		T || (!N || await a({
			title: "Discard this new plan?",
			body: "What you typed is not saved anywhere.",
			action: "Discard"
		})) && e.onClose(null);
	}, F = s(P);
	F.current = P, Mr("drawer", !0, "Close New plan", () => void F.current()), r(() => {
		let e = document.activeElement, t = requestAnimationFrame(() => {
			A(!0), j.current?.querySelector("#avoozl-new-plan-name")?.focus();
		}), n = (e) => {
			if (document.querySelector("[data-confirm-dialog]") || e.key !== "Tab" || !j.current) return;
			let t = [...j.current.querySelectorAll(Ba)], n = Aa(t.length, t.indexOf(document.activeElement), e.shiftKey);
			n < 0 || (e.preventDefault(), t[n].focus());
		};
		return document.addEventListener("keydown", n), () => {
			cancelAnimationFrame(t), document.removeEventListener("keydown", n), e?.focus?.();
		};
	}, []);
	let I = _ ? Fa(m, e.taken, _.length) : [], L = y || C ? Pa(m.name, e.taken) : null, ee = async () => {
		if (w(!0), !I.length && _) {
			E(!0), O(null);
			try {
				let t = await n.request(e.workspaceId, m);
				i({
					message: t.message,
					agent: t.agent,
					autoSend: !0
				}), e.onClose(`A planner chat is drafting ${t.name}. It shows here as a draft once its folder is complete; you approve it.`);
			} catch (e) {
				O(Y(e));
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "fixed inset-0 z-50",
		style: {
			display: "flex",
			justifyContent: "flex-end"
		},
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			"data-drawer-backdrop": !0,
			onClick: () => void P(),
			className: "absolute inset-0",
			style: { background: "color-mix(in srgb, var(--text) 25%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: j,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-new-plan-title",
			"data-new-plan-drawer": !0,
			className: "relative flex h-full flex-col border-l shadow-lg outline-none",
			style: {
				width: d ? "100%" : "min(36rem, 92vw)",
				background: "var(--card, var(--bg))",
				color: "var(--text)",
				borderColor: "var(--border)",
				transform: k || p ? "none" : "translateX(100%)",
				transition: p ? "none" : "transform 180ms ease-out"
			},
			children: [
				/* @__PURE__ */ x("div", {
					className: "flex items-center gap-2 border-b px-4 py-3",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ b("h3", {
						id: "avoozl-new-plan-title",
						className: "grow text-lg font-semibold",
						children: "New plan"
					}), /* @__PURE__ */ b(X, {
						icon: Ne,
						onClick: () => void P(),
						"aria-label": "Close New plan",
						children: "Close"
					})]
				}),
				/* @__PURE__ */ x("form", {
					id: "avoozl-new-plan-form",
					className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
					onSubmit: (e) => {
						e.preventDefault(), ee();
					},
					children: [
						/* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: "An Avoozl planner chat drafts the spec folder from this. The plan shows in Plans as a draft once its folder is complete. Nothing is approved or started."
						}),
						/* @__PURE__ */ b(Va, {
							id: "avoozl-new-plan-name",
							need: "required",
							label: "Name",
							hint: "Becomes the spec folder name: lowercase letters, digits and hyphens.",
							problem: L,
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-name",
								value: m.name,
								placeholder: "cache-invalidation",
								"aria-invalid": !!L,
								"aria-describedby": L ? "avoozl-new-plan-name-problem" : void 0,
								onChange: (e) => M({ name: e.target.value }),
								onBlur: () => S(!0),
								style: { maxWidth: "24rem" }
							})
						}),
						/* @__PURE__ */ x(Va, {
							id: "avoozl-new-plan-category",
							need: "optional",
							label: "Category",
							hint: "Pick one or type a new one. Left blank, the plan is Uncategorized.",
							children: [/* @__PURE__ */ b(g, {
								id: "avoozl-new-plan-category",
								list: "avoozl-new-plan-categories",
								value: m.category,
								onChange: (e) => M({ category: e.target.value }),
								style: { maxWidth: "18rem" }
							}), /* @__PURE__ */ b("datalist", {
								id: "avoozl-new-plan-categories",
								children: e.categories.map((e) => /* @__PURE__ */ b("option", { value: e }, e))
							})]
						}),
						/* @__PURE__ */ b(Va, {
							id: "avoozl-new-plan-epics",
							need: "optional",
							label: "Epics or phases",
							hint: "One per line. Left blank, the planner picks them.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-epics",
								rows: 3,
								value: m.epics,
								onChange: (e) => M({ epics: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: za
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
								_ === null ? /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "Loading…"
								}) : _.length === 0 ? /* @__PURE__ */ b("span", {
									className: "text-xs text-muted",
									children: "No repositories yet. Add one in Settings › Repositories, then come back."
								}) : _.map((e) => /* @__PURE__ */ x("label", {
									className: "flex items-center gap-2",
									children: [
										/* @__PURE__ */ b("input", {
											type: "checkbox",
											checked: m.repositories.includes(e.id),
											onChange: (t) => M({ repositories: t.target.checked ? [...m.repositories, e.id] : m.repositories.filter((t) => t !== e.id) })
										}),
										/* @__PURE__ */ b("span", { children: e.name || e.id }),
										e.github && /* @__PURE__ */ b("span", {
											className: "text-xs text-muted",
											children: e.github
										})
									]
								}, e.id)),
								C && _ && _.length > 0 && !m.repositories.length && /* @__PURE__ */ b("span", {
									className: "text-xs text-danger",
									children: "Pick at least one repository."
								})
							]
						}),
						/* @__PURE__ */ b(Va, {
							id: "avoozl-new-plan-goal",
							need: "required",
							label: "What you want",
							hint: "The planner's first prompt: the goal, who it is for, and what done looks like.",
							problem: C && !m.goal.trim() ? "Say what you want." : null,
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-goal",
								rows: 6,
								value: m.goal,
								onChange: (e) => M({ goal: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: za
							})
						}),
						/* @__PURE__ */ b(Va, {
							id: "avoozl-new-plan-context",
							need: "optional",
							label: "Links and context",
							hint: "Files, issues and notes the planner should read.",
							children: /* @__PURE__ */ b("textarea", {
								id: "avoozl-new-plan-context",
								rows: 4,
								value: m.context,
								onChange: (e) => M({ context: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: za
							})
						}),
						D && /* @__PURE__ */ b("p", {
							role: "alert",
							className: "text-sm text-danger",
							children: D
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex items-center gap-2 border-t px-4 py-3",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ x(f, {
						type: "submit",
						form: "avoozl-new-plan-form",
						primary: !0,
						disabled: T || _ === null,
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 6
						},
						children: [/* @__PURE__ */ b(De, {
							size: 14,
							"aria-hidden": "true"
						}), T ? "Opening…" : "Start planner chat"]
					}), /* @__PURE__ */ b(f, {
						type: "button",
						onClick: () => void P(),
						disabled: T,
						children: "Cancel"
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/sticky-column.ts
function Ua(e, t = (e) => getComputedStyle(e)) {
	for (let n = e?.parentElement ?? null; n; n = n.parentElement) if (/(auto|scroll|overlay)/.test(t(n).overflowY)) return n;
	return null;
}
function Wa(e, t) {
	let n = t;
	if (e) {
		let r = e.getBoundingClientRect?.(), i = r ? Math.min(t, r.bottom) - Math.max(0, r.top) : e.clientHeight;
		n = Math.min(e.clientHeight || i, i);
	}
	return Math.max(240, Math.floor(n - 16));
}
// kirocrew-app/ui/src/plans-api.ts
var Ga = "Uncategorized";
function Ka(e) {
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
function qa(e) {
	return e.total ? Math.round(e.done / e.total * 100) : null;
}
function Ja(e) {
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
function Ya(e) {
	return `Use the Avoozl skill's "Plan a goal" steps 2 to 4 to change ${e.spec ? `the existing spec folder .kiro/specs/${e.spec}/${e.planId ? ` (plan ${e.planId})` : ""}` : `the stored plan ${e.planId}, which has no spec folder yet; move it to .kiro/specs/<name>/ first`}. Ask me what should change. Edit it in a planner session, critique it in a second isolated session, store the new revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Plans view.`;
}
function Xa(e) {
	let t = async (t, n, r = {}) => (await e.post(At, {
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
var Za = (e, t, n = t + "s") => `${e} ${e === 1 ? t : n}`;
function Qa(e) {
	return e.retire ? [
		`${Za(e.open, "open task")}: archived. Their rows stay as history.`,
		`${Za(e.running, "running chat")}: left alone. Each task is archived when its chat ends.`,
		`${Za(e.done, "done task")}: kept as they are.`,
		`${Za(e.dependents, "task")} outside the plan that wait on it: each gets a decision for you.`,
		"The plan is marked deleted and stays in history. There is no undo button."
	] : ["The draft is marked deleted. No task was made from it.", "The plan stays in history."];
}
var $a = [
	["requirements.md", "Requirements"],
	["bugfix.md", "Bugfix"],
	["design.md", "Design"],
	["tasks.md", "Tasks"]
];
function eo(e) {
	return e ? $a.filter(([t]) => typeof e.documents?.[t] == "string").map(([t, n]) => ({
		file: t,
		label: n,
		text: e.documents[t]
	})) : [];
}
var to = (e) => e ? e.slice(0, 12) : "—", no = (e) => `${e.file ?? "tasks.md"}:${e.lineStart}`;
function ro(e) {
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
function io(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.repository ?? "unknown repository";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return [...t];
}
function ao(e) {
	return e ? e.disk.changed ? "The folder changed on disk. Reload it first." : e.approvals.some((t) => t.hash === e.hash) ? "This revision is approved." : e.quality.canApprove ? null : "Fix the errors below first." : "Store this spec first.";
}
var oo = "Use the Avoozl skill's \"Plan a goal\" steps. Ask me for the goal and which repositories are in scope. Draft one Kiro spec folder in the planning repository with a planner session, critique it in a second isolated session, store and validate the revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Plans view.";
function so(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "";
	return e.filter((e) => (!e.archived || t.archived) && (!n || e.name.toLowerCase().includes(n) || (e.spec ?? "").toLowerCase().includes(n) || (e.planId ?? "").toLowerCase().includes(n)) && (!t.category || (e.category ?? "Uncategorized") === t.category) && (!t.status || e.status === t.status) && (!t.kind || e.kind === t.kind) && (!t.has || (t.has === "ready" ? e.now.ready > 0 : t.has === "running" ? e.now.running > 0 : e.now.needsYou > 0)));
}
function co(e) {
	let t = (t) => [...new Set(e.map(t))].sort((e, t) => e === "Uncategorized" ? 1 : t === "Uncategorized" ? -1 : e.localeCompare(t));
	return {
		categories: t((e) => e.category ?? "Uncategorized"),
		statuses: t((e) => e.status)
	};
}
var lo = (e) => ({
	plan: e.key,
	purpose: "discuss-plan"
}), uo = [
	"Its open tasks stop starting. Running chats keep going.",
	"Tasks in other plans that wait on it get a decision for you.",
	"It is hidden on Plans, Graph, Delivery and the Dashboard. Show archived brings it back.",
	"Nothing is deleted, and its spec folder is not touched. Unarchive undoes all of it."
];
function fo(e) {
	let t = e.action === "archived" ? "Archived" : e.action === "unarchived" ? "Unarchived" : e.action;
	return e.by ? `${t} by ${e.by}` : t;
}
// kirocrew-app/ui/src/PlansView.tsx
var po = "80ch", mo = "17rem", ho = "(max-width: 1023px)";
function go(e) {
	let [n, i] = c(null), a = s(null), o = t((t) => {
		if (a.current?.(), a.current = null, !t || !e) return;
		let n = Ua(t), r = () => i(Wa(n, window.innerHeight));
		r();
		let o = n && typeof ResizeObserver < "u" ? new ResizeObserver(r) : null;
		n && o?.observe(n), window.addEventListener("resize", r), a.current = () => {
			o?.disconnect(), window.removeEventListener("resize", r);
		};
	}, [e]);
	return r(() => () => a.current?.(), []), [o, n];
}
var _o = (e) => `avoozl-doc-${e.replace(/\.md$/, "")}`, vo = (e) => document.getElementById(e)?.scrollIntoView?.({ block: "start" });
function yo({ docs: e, error: t }) {
	let n = eo(e);
	return /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Documents" }), t ? /* @__PURE__ */ b("p", {
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
			}), /* @__PURE__ */ b(ka, {
				text: t.text,
				idPrefix: _o(t.file),
				measure: po
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
function bo(e) {
	let { projection: t, busy: n } = e;
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "GitHub preview" }),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-sm text-muted",
			children: "Lists every write a projection would make. Nothing is written."
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-2",
			children: /* @__PURE__ */ b(Q, {
				tooltip: "List every GitHub write this plan would make. Makes none.",
				onClick: e.onPreview,
				disabled: n,
				children: t ? "Preview again" : "Preview GitHub writes"
			})
		}),
		t && /* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-col gap-2 text-sm",
			children: [
				t.previewOnly.length > 0 && /* @__PURE__ */ x("p", { children: [
					/* @__PURE__ */ b(J, { children: "preview only" }),
					" Another machine writes ",
					t.previewOnly.join(", "),
					"."
				] }),
				t.writes.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "GitHub already matches this revision."
				}) : io(t.writes).map(([e, t]) => /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("p", {
					className: "font-medium",
					children: [
						e,
						" · ",
						t.length,
						" writes"
					]
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-0.5",
					children: t.map((e, t) => /* @__PURE__ */ b("li", { children: ro(e) }, t))
				})] }, e)),
				t.conflicts.map((e) => /* @__PURE__ */ x("p", { children: [
					/* @__PURE__ */ b(J, {
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
		})
	] });
}
function xo(e) {
	let { spec: t, plan: n, preview: r, busy: i } = e, a = ao(n), o = n?.disk.critique ?? t.critique, s = n?.quality.diagnostics ?? [];
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x(p, { children: [
				/* @__PURE__ */ b(m, { children: n ? `Revision ${n.revision}` : "Not imported" }),
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
						/* @__PURE__ */ b("code", { children: to(n.hash) }),
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
						!n && /* @__PURE__ */ b(X, {
							icon: z,
							tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
							onClick: e.onStore,
							disabled: i,
							children: "Import"
						}),
						n?.disk.changed && /* @__PURE__ */ b(X, {
							icon: we,
							tooltip: "Store the changed files as a new revision to approve",
							onClick: e.onReload,
							disabled: i,
							children: "Reload from disk"
						}),
						n && /* @__PURE__ */ x(X, {
							icon: L,
							onClick: e.onApprove,
							disabled: i || a !== null,
							tooltip: a ?? "Approve this exact revision. Its ready tasks may then start.",
							children: ["Approve revision ", to(n.hash)]
						})
					]
				}),
				n && a && /* @__PURE__ */ b("p", {
					className: "mt-2 text-sm text-muted",
					children: a
				})
			] }),
			/* @__PURE__ */ b(yo, {
				docs: e.docs,
				error: e.docsError
			}, t.name),
			/* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Diagnostics" }), n ? s.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No diagnostics."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: s.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(J, {
						variant: e.severity === "error" ? "danger" : void 0,
						children: e.severity
					}),
					" ",
					/* @__PURE__ */ b("code", { children: no(e) }),
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
			/* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Critique" }), o ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("p", {
				className: "mt-2 text-sm",
				children: o.current ? "Reviews this revision." : `Reviews ${to(o.reviewedHash)}, not this revision.`
			}), o.findings.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-1 text-sm text-muted",
				children: "No findings."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: o.findings.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(J, { children: e.kind }),
					" ",
					e.task && /* @__PURE__ */ b("code", { children: e.task }),
					" ",
					e.text
				] }, e.line))
			})] }) : /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No avoozl/critique.md yet."
			})] }),
			r && /* @__PURE__ */ x(p, { children: [
				/* @__PURE__ */ b(m, { children: "Manifest" }),
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
							/* @__PURE__ */ b(Ii, { owner: e }),
							r.baseline?.taskIds.includes(e.taskId) && /* @__PURE__ */ b(J, { children: "done" }),
							t.length > 0 && /* @__PURE__ */ x("span", {
								className: "text-muted",
								children: [" · requires ", t.join(", ")]
							})
						] }, e.taskId);
					})
				})
			] }),
			n?.state === "approved" && /* @__PURE__ */ b(bo, {
				projection: e.projection,
				busy: i,
				onPreview: e.onProjection
			}),
			n && n.approvals.length > 0 && /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Approvals" }), /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: n.approvals.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b("code", { children: to(e.hash) }),
					" · ",
					e.at,
					e.approvedBy ? ` · ${e.approvedBy}` : ""
				] }, e.id))
			})] })
		]
	});
}
function So({ tasks: e }) {
	let t = qa(e), n = fc("(prefers-reduced-motion: reduce)"), [i, a] = c(n ? t ?? 0 : 0);
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
var Co = {
	done: "success",
	approved: "info",
	changed: "warning",
	draft: void 0,
	"not imported": void 0
}, wo = {
	done: "Done",
	approved: "Approved",
	changed: "Changed on disk",
	draft: "Draft",
	"not imported": "Not imported"
};
function To({ now: e }) {
	let t = [
		e.needsYou ? /* @__PURE__ */ x(J, {
			variant: "warning",
			children: [e.needsYou, " need you"]
		}, "you") : null,
		e.running ? /* @__PURE__ */ x(J, {
			variant: "info",
			children: [e.running, " running"]
		}, "run") : null,
		e.ready ? /* @__PURE__ */ x(J, { children: [e.ready, " ready"] }, "ready") : null
	].filter(Boolean);
	return t.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: t
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "—"
	});
}
var Eo = {
	padding: "8px 10px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "middle"
}, Do = {
	padding: "6px 10px",
	textAlign: "left",
	fontWeight: 600,
	whiteSpace: "nowrap"
};
function Oo(e) {
	let { filter: t } = e, n = co(e.rows), r = (n) => {
		let r = {
			...t,
			...n
		};
		for (let e of Object.keys(r)) r[e] || delete r[e];
		e.onChange(r);
	};
	return /* @__PURE__ */ b(Hi, {
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
					label: wo[e] ?? e
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
var ko = "Archive this plan: its tasks stop starting and it is hidden. You can undo it.", Ao = "Unarchive this plan: its tasks may start again and it shows everywhere.";
function jo(e) {
	let { row: t } = e, n = Ja(t);
	return /* @__PURE__ */ x("span", {
		className: "flex justify-end gap-1.5",
		children: [
			n.importable && e.onImport && /* @__PURE__ */ b(Z, {
				icon: z,
				label: `Import ${t.name}`,
				tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
				disabled: e.busy,
				onClick: e.onImport
			}),
			e.onOpen && /* @__PURE__ */ b(Z, {
				icon: lr,
				label: `Open docs for ${t.name}`,
				tooltip: "Open this plan's documents and tasks",
				onClick: e.onOpen
			}),
			n.scoped && /* @__PURE__ */ b(Z, {
				icon: _e,
				label: `Graph of ${t.name}`,
				tooltip: "Show this plan's tasks in the Graph",
				onClick: () => e.onScope("graph")
			}),
			n.scoped && /* @__PURE__ */ b(Z, {
				icon: pe,
				label: `Delivery of ${t.name}`,
				tooltip: "Show this plan's tasks in Delivery",
				onClick: () => e.onScope("delivery")
			}),
			n.review && e.onReview && /* @__PURE__ */ b(Z, {
				icon: L,
				label: `Review ${t.name}`,
				tooltip: "Open this plan to check and approve it",
				onClick: e.onReview
			}),
			e.onChange && /* @__PURE__ */ b(Z, {
				icon: be,
				label: `Plan a change to ${t.name}`,
				tooltip: "Start a planner chat to change this plan",
				onClick: e.onChange
			}),
			e.onArchive && n.archivable && /* @__PURE__ */ b(Z, {
				icon: w,
				label: `Archive ${t.name}`,
				tooltip: ko,
				disabled: e.busy,
				onClick: e.onArchive
			}),
			e.onUnarchive && n.unarchivable && /* @__PURE__ */ b(Z, {
				icon: T,
				label: `Unarchive ${t.name}`,
				tooltip: Ao,
				disabled: e.busy,
				onClick: e.onUnarchive
			}),
			e.onDelete && n.deletable && /* @__PURE__ */ b(Z, {
				icon: Ae,
				label: `Delete ${t.name}`,
				tooltip: "Delete this plan. You confirm first; it stays in history.",
				disabled: e.busy,
				onClick: e.onDelete,
				style: Fr
			})
		]
	});
}
function Mo(e) {
	let t = Ka(e.rows), [n, r] = c(/* @__PURE__ */ new Set()), i = Kr(e.reset ?? ""), a = (e) => (t) => {
		t.stopPropagation(), e();
	}, o = (e, t) => {
		let n = new Set(e);
		return n.has(t) ? n.delete(t) : n.add(t), n;
	}, s = /* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
		className: "text-xs text-muted",
		children: [
			/* @__PURE__ */ b("th", {
				style: Do,
				children: "Plan"
			}),
			/* @__PURE__ */ b("th", {
				style: Do,
				children: "Status"
			}),
			/* @__PURE__ */ b("th", {
				style: Do,
				children: "Progress"
			}),
			/* @__PURE__ */ b("th", {
				style: Do,
				children: "Now"
			}),
			/* @__PURE__ */ b("th", {
				style: {
					...Do,
					textAlign: "right"
				},
				children: "Epics"
			}),
			/* @__PURE__ */ b("th", {
				style: Do,
				children: "Last change"
			}),
			/* @__PURE__ */ b("th", {
				style: Do,
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
								children: /* @__PURE__ */ b(j, { size: 16 })
							}),
							/* @__PURE__ */ b(U, {
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
								children: /* @__PURE__ */ b(So, { tasks: u })
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
									style: Eo,
									children: [/* @__PURE__ */ b("button", {
										type: "button",
										className: "text-left font-medium hover:underline",
										onClick: a(() => e.onOpen(t)),
										children: t.name
									}), /* @__PURE__ */ x("span", {
										className: "mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted",
										children: [
											/* @__PURE__ */ b(J, { children: t.kind === "spec" ? t.type ?? "spec" : "old-style" }),
											t.spec ? /* @__PURE__ */ b("code", { children: t.spec }) : t.planId ? /* @__PURE__ */ b("code", { children: t.planId }) : null,
											t.errors > 0 && /* @__PURE__ */ x(J, {
												variant: "danger",
												children: [t.errors, " errors"]
											}),
											t.archived && /* @__PURE__ */ b(J, { children: "Archived" })
										]
									})]
								}),
								/* @__PURE__ */ b("td", {
									style: Eo,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ b(J, {
										variant: Co[t.status],
										children: wo[t.status] ?? t.status
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Eo,
										width: 150
									},
									children: /* @__PURE__ */ b(So, { tasks: t.tasks })
								}),
								/* @__PURE__ */ b("td", {
									style: Eo,
									children: /* @__PURE__ */ b(To, { now: t.now })
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Eo,
										textAlign: "right"
									},
									className: "tabular-nums",
									children: t.epics
								}),
								/* @__PURE__ */ b("td", {
									style: Eo,
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(q, {
										text: t.lastChange,
										children: /* @__PURE__ */ b("span", { children: t.lastChange ? Dn(t.lastChange) : "—" })
									})
								}),
								/* @__PURE__ */ b("td", {
									style: Eo,
									className: "whitespace-nowrap",
									onClick: (e) => e.stopPropagation(),
									children: /* @__PURE__ */ b(jo, {
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
					}), t.rows.length > l.length && /* @__PURE__ */ b(qr, { ...i.more(t.category, t.rows.length) })]
				})]
			}, t.category);
		})
	});
}
function No(e) {
	let { row: t, graph: n, docs: r } = e, i = (n?.tasks ?? []).filter((e) => e.kind === "leaf"), a = Object.fromEntries(qe.map((e) => [e.id, 0]));
	for (let e of i) a[nt(e)] += 1;
	let o = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), s = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (!e.epic) continue;
		let t = o.get(e.epic), n = s.get(e.epic) ?? {
			title: t && t !== e.epic ? t : at(e.epic),
			done: 0,
			total: 0
		};
		n.total += 1, nt(e) === "done" && (n.done += 1), s.set(e.epic, n);
	}
	let c = (n?.tasks ?? []).filter((e) => e.decision), l = eo(r), u = (e) => /* @__PURE__ */ b("h4", {
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
					/* @__PURE__ */ b(X, {
						icon: be,
						primary: !0,
						tooltip: "Start a planner chat that drafts a change to the spec files",
						onClick: e.onEdit,
						children: "Edit plan"
					}),
					/* @__PURE__ */ b(X, {
						icon: K,
						tooltip: "Start a chat about this plan. It makes no edits.",
						onClick: e.onDiscuss,
						children: "Discuss plan"
					}),
					(e.onDelete || e.onArchive || e.onUnarchive) && /* @__PURE__ */ x("span", {
						className: "ml-auto flex gap-1.5",
						children: [
							e.onArchive && /* @__PURE__ */ b(Z, {
								icon: w,
								label: `Archive ${t.name}`,
								tooltip: ko,
								onClick: e.onArchive
							}),
							e.onUnarchive && /* @__PURE__ */ b(Z, {
								icon: T,
								label: `Unarchive ${t.name}`,
								tooltip: Ao,
								onClick: e.onUnarchive
							}),
							e.onDelete && /* @__PURE__ */ b(Z, {
								icon: Ae,
								label: `Delete ${t.name}`,
								tooltip: "Delete this plan. You confirm first; it stays in history.",
								onClick: e.onDelete,
								style: Fr
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
						/* @__PURE__ */ b(J, {
							variant: Co[t.status],
							children: wo[t.status] ?? t.status
						}),
						t.type && /* @__PURE__ */ b(J, { children: t.type }),
						t.archived && /* @__PURE__ */ b(J, { children: "Archived" })
					]
				}), /* @__PURE__ */ b(So, { tasks: t.tasks })]
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
				children: qe.map((e) => /* @__PURE__ */ x("div", {
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
					return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(q, {
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
						onClick: () => vo(`avoozl-doc-${e.file}`),
						children: e.label
					}), /* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: da(e.text, _o(e.file), 2).filter((e) => e.level === 2).map((e) => /* @__PURE__ */ b("li", {
							className: "truncate pl-3",
							children: /* @__PURE__ */ b("button", {
								type: "button",
								className: "text-left text-xs text-muted hover:underline",
								onClick: () => vo(e.id),
								children: e.text
							})
						}, e.id))
					})] }, e.file))
				})]
			}),
			/* @__PURE__ */ x("div", { children: [u("Last change"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: /* @__PURE__ */ b(q, {
					text: t.lastChange,
					children: /* @__PURE__ */ b("span", { children: t.lastChange ? Dn(t.lastChange) : /* @__PURE__ */ b("span", {
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
						children: [/* @__PURE__ */ b("span", { children: fo(e) }), /* @__PURE__ */ b(q, {
							text: e.at,
							children: /* @__PURE__ */ b("span", {
								className: "shrink-0 text-xs text-muted",
								children: Dn(e.at)
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
function Po(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), d = s(null);
	Mr("modal", !0, "Cancel", () => e.onDone(null)), r(() => {
		d.current?.focus();
	}, []);
	let p = async () => {
		u(!0), o(null);
		try {
			let r = await n.archive(i, t.planId);
			e.onDone(`Archived ${t.name}. ${r.held} tasks held, ${r.running} running chats left alone, ${r.decisions} decisions opened. Show archived on Plans brings it back.`);
		} catch (e) {
			o(Y(e));
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
					children: uo.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
				}),
				a && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-sm text-danger",
					children: a
				}),
				/* @__PURE__ */ x("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ b(f, {
						ref: d,
						type: "button",
						onClick: () => e.onDone(null),
						children: "Cancel"
					}), /* @__PURE__ */ b(f, {
						type: "button",
						primary: !0,
						"data-archive-confirm": !0,
						disabled: l,
						onClick: () => void p(),
						children: "Archive plan"
					})]
				})
			]
		})]
	});
}
function Fo(e) {
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
							/* @__PURE__ */ b(q, {
								text: t.at,
								children: /* @__PURE__ */ b("span", { children: Dn(t.at) })
							}),
							". Its tasks do not start, and it is hidden unless Show archived is on."
						]
					})
				]
			}),
			/* @__PURE__ */ b(X, {
				icon: T,
				primary: !0,
				disabled: e.busy,
				tooltip: Ao,
				onClick: e.onUnarchive,
				children: "Unarchive"
			})
		]
	}) : null;
}
function Io(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), [d, p] = c(null), [m, h] = c(!1), g = s(null);
	r(() => {
		n.deletePreview(i, t.planId).then(o, (e) => p(Y(e)));
	}, [
		n,
		i,
		t.planId
	]), Mr("modal", !0, "Cancel", () => e.onDone(null)), r(() => {
		g.current?.focus();
	}, []);
	let _ = async () => {
		if (a) {
			h(!0), p(null);
			try {
				let t = await n.remove(i, a.id, {
					retire: a.retire,
					deleteSpecFolder: l
				});
				e.onDone(`Deleted ${a.title}. ${t.retired ? `Archived ${t.archived}, ${t.archiveWhenEnded} when their chats end, ${t.decisions} decisions opened. ` : ""}${t.removedFolder ? `Removed ${t.removedFolder} from the working tree; nothing was committed.` : ""}`);
			} catch (e) {
				p(Y(e));
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
					children: Qa(a).map((e) => /* @__PURE__ */ b("li", { children: e }, e))
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
					children: [/* @__PURE__ */ b(f, {
						ref: g,
						type: "button",
						onClick: () => e.onDone(null),
						children: "Cancel"
					}), /* @__PURE__ */ b(f, {
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
function Lo(e) {
	let n = e.workspaceId, i = l(), { openChat: a } = u(), d = o(() => Xa(i), [i]), f = o(() => Ut(i), [i]), h = jn(), g = Gr(n), _ = fc(ho), [v, S] = go(!_), [C, w] = c(null), [T, D] = c(null), [O, k] = c(!1), [A, j] = c(null), [M, N] = c(null), [P, F, I] = Pr("plans-selected", "select", (e) => e ? "Back to the plan" : "Back to all plans", null), L = s(n), [ee, R] = c({}), [z, te] = c(null), [B, V] = c(null), [H, ne] = c(null), [U, W] = c(null), [re, G] = c(null), [ie, ae] = c(null), [oe, se] = c(null), [ce, le] = c(null), [ue, de] = c(!1), [, fe] = c(0), pe = s(null), me = t(async (e) => {
		de(!0), le(null);
		try {
			await e();
		} catch (e) {
			le(Y(e));
		} finally {
			de(!1);
		}
	}, []), he = t((e) => me(async () => N(await d.table(e))), [me, d]);
	r(() => {
		N(null), L.current !== n && (L.current = n, I(null)), n && (he(n), d.languages(n).then((e) => {
			ya(e.languages), fe((e) => e + 1);
		}, () => void 0));
	}, [
		n,
		he,
		d
	]);
	let K = M?.items.find((e) => e.key === P) ?? null, ge = K?.spec ? M?.specs.find((e) => e.name === K.spec) ?? null : null, _e = t(async (e, t) => {
		if (te(null), V(null), ne(null), !t) return;
		let [n, r] = await Promise.all([d.get(e, t), d.preview(e, t).catch(() => null)]);
		te(n), V(r);
	}, [d]);
	r(() => {
		if (W(null), G(null), se(null), ae(null), !n || !K) return;
		let e = !0;
		return me(() => _e(n, K.planId)), f.graph(n, {
			plan: K.planId ?? void 0,
			spec: K.spec ?? void 0
		}).then((t) => e && ae(t), () => void 0), K.spec ? d.documents(n, K.spec).then((t) => e && W(t), (t) => e && G(Y(t))) : K.planId && d.text(n, K.planId).then((t) => e && se({
			text: t,
			error: null
		}), (t) => e && se({
			text: null,
			error: Y(t)
		})), () => {
			e = !1;
		};
	}, [n, P]), r(() => {
		P && pe.current?.scrollIntoView?.({ block: "start" });
	}, [P]);
	let ve = (e) => F(e.key), ye = (t, n) => e.onScope?.(t, { plan: Pn(n) }), be = (e) => a({
		message: Ya(e),
		autoSend: !1
	}), xe = (e) => {
		if (!n) return;
		let t = n;
		me(async () => {
			let n = await e(t), r = await d.table(t);
			N(r);
			let i = r.items.find((e) => e.key === P) ?? null;
			await _e(t, i?.planId ?? n?.id ?? null);
		});
	}, Ce = (e) => e.spec && xe((t) => d.store(t, e.spec)), Te = (e) => e.planId && xe(async (t) => {
		let n = await d.unarchive(t, e.planId);
		return j(`Unarchived ${e.name}. ${n.released} tasks may start again; ${n.decisions} decisions closed.`), { id: e.planId };
	}), Ee = M ? so(M.items, ee) : [];
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-plans-title",
		className: "flex flex-col gap-3.5",
		children: [
			C && n && /* @__PURE__ */ b(Io, {
				workspaceId: n,
				row: C,
				client: d,
				onDone: (e) => {
					w(null), e !== null && (I(null), j(e), he(n));
				}
			}),
			T && n && /* @__PURE__ */ b(Po, {
				workspaceId: n,
				row: T,
				client: d,
				onDone: (e) => {
					D(null), e !== null && (j(e), he(n));
				}
			}),
			O && n && /* @__PURE__ */ b(Ha, {
				workspaceId: n,
				taken: (M?.items ?? []).flatMap((e) => [e.spec, e.planId]).filter((e) => !!e),
				categories: [...new Set((M?.items ?? []).map((e) => e.category).filter((e) => !!e))].sort(),
				onClose: (e) => {
					k(!1), e && j(e);
				}
			}),
			A && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				children: A
			}),
			/* @__PURE__ */ x("div", {
				ref: pe,
				className: "flex flex-wrap items-center gap-3",
				children: [
					K && /* @__PURE__ */ b(X, {
						icon: E,
						onClick: () => F(null),
						children: "All plans"
					}),
					/* @__PURE__ */ b(Jr, {
						id: "avoozl-plans-title",
						view: "plans",
						children: K ? K.name : "Plans"
					}),
					n && !K && /* @__PURE__ */ x(y, { children: [
						/* @__PURE__ */ b(X, {
							icon: Se,
							primary: !0,
							tooltip: "Describe a plan idea. A planner chat drafts its spec folder; nothing is approved.",
							onClick: () => k(!0),
							children: "New plan"
						}),
						/* @__PURE__ */ b(X, {
							icon: we,
							onClick: () => void he(n),
							disabled: ue,
							children: "Refresh"
						}),
						/* @__PURE__ */ b(X, {
							icon: Se,
							tooltip: "Add a draft task. It waits for your review.",
							onClick: () => h.addTask(),
							children: "Add task"
						})
					] }),
					K && /* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(jo, {
							row: K,
							onScope: (e) => ye(e, K),
							onReview: () => vo("avoozl-plan-main")
						})
					})
				]
			}),
			(ce || g.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ce ?? g.error
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: ue ? "Working…" : ""
			}),
			n ? K ? /* @__PURE__ */ x("div", {
				style: _ ? {
					display: "flex",
					flexDirection: "column",
					gap: 14
				} : {
					display: "grid",
					gridTemplateColumns: `${mo} minmax(0, 1fr)`,
					gap: 14,
					alignItems: "start"
				},
				children: [/* @__PURE__ */ b("aside", {
					ref: v,
					"aria-label": "Plan summary",
					"data-plan-aside-scroll": !0,
					style: _ ? void 0 : {
						position: "sticky",
						top: 8,
						maxHeight: S ?? "calc(100vh - 2rem)",
						overflowY: "auto",
						overscrollBehavior: "contain"
					},
					children: /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(No, {
						row: K,
						graph: ie,
						docs: U,
						onEdit: () => be(K),
						onDiscuss: () => void g.ask(lo(K)),
						onDelete: Ja(K).deletable ? () => w(K) : void 0,
						onArchive: Ja(K).archivable ? () => D(K) : void 0,
						onUnarchive: Ja(K).unarchivable ? () => Te(K) : void 0,
						onDrill: (t) => e.onDrill?.(t),
						onOpenTask: (e) => h.openTask(e)
					}) })
				}), /* @__PURE__ */ x("div", {
					id: "avoozl-plan-main",
					className: "min-w-0",
					children: [
						/* @__PURE__ */ b(Fo, {
							row: K,
							busy: ue,
							onUnarchive: () => Te(K)
						}),
						K.categoryProblem && /* @__PURE__ */ x("p", {
							className: "mb-3 text-sm text-muted",
							children: [
								/* @__PURE__ */ b(J, {
									variant: "warning",
									children: "front-matter"
								}),
								" ",
								K.categoryProblem
							]
						}),
						ge ? /* @__PURE__ */ b(xo, {
							docs: U,
							docsError: re,
							spec: ge,
							plan: z,
							preview: B,
							projection: H,
							busy: ue,
							onStore: () => xe((e) => d.store(e, ge.name)),
							onReload: () => z && xe((e) => d.reload(e, z.id, z.hash)),
							onApprove: () => z && xe((e) => d.approve(e, z.id, z.hash)),
							onProjection: () => z && void me(async () => ne(await d.projection(n, z.id)))
						}) : /* @__PURE__ */ x(p, { children: [
							/* @__PURE__ */ b(m, { children: K.name }),
							/* @__PURE__ */ x("p", {
								className: "mt-1 text-xs text-muted",
								children: [/* @__PURE__ */ b("code", { children: K.planId }), " · written before the spec layout, so it has no folder. Its tasks show in Graph and Delivery."]
							}),
							/* @__PURE__ */ b("div", {
								className: "mt-2",
								children: oe ? oe.error ? /* @__PURE__ */ b("p", {
									className: "text-sm text-danger",
									children: oe.error
								}) : oe.text ? /* @__PURE__ */ b(ka, {
									text: oe.text,
									measure: po
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
			}) : /* @__PURE__ */ x(y, { children: [M && M.items.length > 0 && /* @__PURE__ */ b(Oo, {
				filter: ee,
				rows: M.items,
				onChange: R,
				children: /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					role: "status",
					children: [
						Ee.length,
						" of ",
						M.items.length,
						" plans"
					]
				})
			}), /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-plans-list": !0,
				children: [
					M === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: ue ? "Loading…" : "Not loaded"
					}) : M.items.length === 0 ? /* @__PURE__ */ x("p", {
						className: "text-sm text-muted",
						children: [
							"No plans yet",
							M.root ? ` in ${M.root}/.kiro/specs` : "",
							". Use New plan to start one."
						]
					}) : Ee.length ? /* @__PURE__ */ b(Mo, {
						rows: Ee,
						reset: JSON.stringify(ee),
						busy: ue,
						onOpen: ve,
						onScope: ye,
						onChange: be,
						onImport: Ce,
						onDelete: w,
						onArchive: D,
						onUnarchive: Te
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No plan matches these filters."
					}),
					M?.problem && /* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: ["Spec folders: ", M.problem]
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: [
							"Categories come from ",
							/* @__PURE__ */ b("code", { children: "category:" }),
							" in the front-matter of a spec's requirements.md or bugfix.md. Avoozl never guesses one. ",
							Ga,
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
var Ro = "avoozl-cited", zo = "\n[data-cited=\"true\"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }\n";
function Bo(e) {
	return e.getAttribute("role") === "heading" ? `h${e.getAttribute("aria-level") ?? "6"}` : e.tagName.toLowerCase();
}
function Vo(e, t, n, r, i = e) {
	let a = [...e.querySelectorAll("[data-line]")];
	for (let e of a) e.classList.remove(Ro), delete e.dataset.cited;
	let o = _n(a.map((e) => ({
		line: Number(e.dataset.line),
		tag: Bo(e)
	})), t, n).map((e) => a[e]);
	for (let e of o) e.classList.add(Ro), e.dataset.cited = "true";
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
function Ho(e) {
	let t = s(null), n = fc("(prefers-reduced-motion: reduce)"), { text: i, lineStart: a, lineEnd: o } = e;
	return r(() => {
		let e = t.current;
		if (!e) return;
		let r = requestAnimationFrame(() => Vo(e, a, o, n));
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
		children: [/* @__PURE__ */ b("style", { children: zo }), /* @__PURE__ */ b(ka, {
			text: i,
			idPrefix: e.idPrefix
		})]
	});
}
// kirocrew-app/ui/src/repository-rows.ts
function Uo(e, t) {
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
var Wo = (e) => e && /^[\w.-]+\/[\w.-]+$/.test(e) ? `https://github.com/${e}` : null, Go = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])";
function Ko(e) {
	let t = s(null), n = fc("(max-width: 767px)"), i = s(e.onDismiss);
	return i.current = e.onDismiss, Mr("modal", !0, "Close the dialog", () => i.current()), r(() => {
		let e = document.activeElement;
		t.current?.querySelector(Go)?.focus();
		let n = (e) => {
			if (document.querySelector("[data-confirm-dialog]") || e.key !== "Tab" || !t.current) return;
			let n = [...t.current.querySelectorAll(Go)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = Aa(n.length, n.indexOf(document.activeElement), e.shiftKey);
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
var qo = "A repository is a code checkout on this computer. Tasks change its code in their own worktrees and land on its branch. Each workspace keeps its own list.";
function Jo() {
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
function Yo(e, t) {
	return e.github ? t === "local" ? "Local only mode" : t ? t === "plans-repo" ? "Plans repository mode" : "Single repository mode" : "GitHub, no mode yet" : "Local only";
}
function Xo(e) {
	return e.rows.length ? /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"aria-label": "Added repositories",
		"data-repository-list": !0,
		children: e.rows.map((t) => {
			let n = Wo(t.github);
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
					/* @__PURE__ */ b(J, { children: Yo(t, e.mode) }),
					/* @__PURE__ */ x("span", {
						className: "flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ b(X, {
								icon: be,
								tooltip: `Change ${t.name}'s settings in a dialog`,
								"aria-label": `Edit ${t.name}`,
								onClick: () => e.onEdit(t.key),
								children: "Edit"
							}),
							t.folder && /* @__PURE__ */ b(Z, {
								icon: U,
								label: `Open ${t.name} in Finder`,
								onClick: () => e.onReveal(t.folder)
							}),
							n && /* @__PURE__ */ b(Qo, {
								href: n,
								name: t.name
							}),
							/* @__PURE__ */ b(Vr, {
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
				children: qo
			}),
			/* @__PURE__ */ b(X, {
				icon: Se,
				primary: !0,
				onClick: e.onAdd,
				children: "Add repository"
			})
		]
	});
}
function Zo(e) {
	let t = zr(), n = () => e.edited ? void t({
		title: `Discard your changes to ${e.name}?`,
		body: "Every edit in this dialog is lost. .avoozl.json stays as it is.",
		action: "Discard changes"
	}).then((t) => t && e.onDiscard()) : e.onDiscard();
	return /* @__PURE__ */ b(Ko, {
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
				/* @__PURE__ */ b(f, {
					type: "button",
					onClick: n,
					children: "Cancel"
				}),
				/* @__PURE__ */ b(f, {
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
function Qo({ href: e, name: t }) {
	return /* @__PURE__ */ x($o, {
		href: e,
		tip: "Open on GitHub",
		children: [/* @__PURE__ */ b(te, {
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
function $o(e) {
	return /* @__PURE__ */ b(q, {
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
function es(e) {
	let t = l(), n = o(() => jt(t), [t]), [i, a] = c(""), [s, u] = c(null), [d, p] = c(""), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null);
	r(() => {
		u(null), S(null);
	}, [i]);
	let C = async () => {
		v(!0), S(null);
		try {
			let t = await n.detectRepository(e.workspaceId, i.trim());
			u(t), p(t.id ?? ""), h(t.baseBranch);
		} catch (e) {
			S(Y(e));
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
				S(Y(e));
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
								/* @__PURE__ */ b(Q, {
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
										onChange: (e) => p(e.target.value)
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
								/* @__PURE__ */ b(f, {
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
var ts = "avoozl-reader", ns = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex=\"-1\"])";
function rs(e) {
	let { workspaceId: n, target: i, onClose: a, text: u } = e, d = l(), f = o(() => vn(d), [d]), p = Jo(), m = fc("(max-width: 767px)"), h = fc("(prefers-reduced-motion: reduce)"), [g, _] = c({
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
			error: Y(t)
		})) : _({
			text: u,
			error: null
		}), Xa(d).languages(n).then((t) => {
			ya(t.languages), e && w((e) => e + 1);
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
		e && i.lineStart && Vo(e, i.lineStart, i.lineEnd, h);
	}, [
		i.lineStart,
		i.lineEnd,
		h
	]);
	r(() => {
		if (g.text === null) return;
		let e = requestAnimationFrame(O);
		return () => cancelAnimationFrame(e);
	}, [g.text, O]), Mr("modal", !0, "Close the file", a), r(() => {
		D.current = document.activeElement, T.current?.focus();
		let e = (e) => {
			if (e.key !== "Tab" || !T.current) return;
			let t = [...T.current.querySelectorAll(ns)];
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
		if (!hn(i.document)) return C("This path is outside the workspace, so it is not opened.");
		try {
			let e = (await jt(d).list()).items.find((e) => e.id === n)?.root;
			if (!e) return C("The workspace folder is not known here.");
			C(await p(`${e.replace(/\/$/, "")}/${i.document}`));
		} catch (e) {
			C(Y(e));
		}
	}, j = g.text ? da(g.text, ts, 3) : [], M = mn(i), N = (e) => T.current?.querySelector(`#${CSS.escape(e)}`)?.scrollIntoView?.({
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
		[Er]: "",
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
				children: [/* @__PURE__ */ x("div", {
					className: "flex items-start gap-2",
					children: [
						/* @__PURE__ */ x("div", {
							className: "flex min-w-0 grow flex-col",
							children: [/* @__PURE__ */ b("h3", {
								id: "avoozl-reader-title",
								className: "text-sm font-semibold",
								style: { overflowWrap: "anywhere" },
								children: /* @__PURE__ */ b("code", { children: i.document })
							}), M && /* @__PURE__ */ b("span", {
								className: "self-start",
								children: /* @__PURE__ */ b(q, {
									text: `Scroll back to ${M.toLowerCase()}`,
									children: (e) => /* @__PURE__ */ b("button", {
										type: "button",
										className: "text-xs text-muted hover:underline",
										onClick: O,
										"aria-describedby": e,
										children: M
									})
								})
							})]
						}),
						/* @__PURE__ */ b(Z, {
							icon: ee,
							label: "Copy path",
							tooltip: `Copy ${i.document}`,
							onClick: () => void k()
						}),
						u === void 0 && /* @__PURE__ */ b(Z, {
							icon: U,
							label: "Reveal in Finder",
							tooltip: "Show this file in Finder",
							onClick: () => void A()
						}),
						/* @__PURE__ */ b(X, {
							icon: Ne,
							onClick: a,
							"aria-label": "Close the file",
							children: "Close"
						})
					]
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
					}), /* @__PURE__ */ b(is, {
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
					}), /* @__PURE__ */ b(is, {
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
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("style", { children: zo }), /* @__PURE__ */ b(ka, {
						text: g.text,
						idPrefix: ts,
						measure: po
					})] })
				})]
			})]
		})]
	}), document.body);
}
function is(e) {
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
var as = .9;
function os(e, t) {
	let n = Math.max(Math.min(360, t), Math.floor(t * as));
	return Math.min(n, Math.max(Math.min(360, n), Number.isFinite(e) ? Math.round(e) : 620));
}
var ss = (e) => `avoozl.drawerWidth.${e}`;
function cs(e, t) {
	try {
		let n = Number(e?.getItem(ss(t)));
		return Number.isFinite(n) && n > 0 ? n : 620;
	} catch {
		return 620;
	}
}
function ls(e, t, n) {
	try {
		n === 620 ? e?.removeItem(ss(t)) : e?.setItem(ss(t), String(n));
	} catch {}
}
function us(e, t) {
	return t === "ArrowLeft" ? e + 40 : t === "ArrowRight" ? e - 40 : null;
}
// kirocrew-app/ui/src/ReviewState.tsx
var ds = (e, t) => `asked ${e ?? "agent default"}${t ? `, ran ${t}` : ""}`;
function fs(e) {
	let t = tn(e.item);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: `flex flex-col gap-1 ${e.compact ? "text-xs" : "text-sm"}`,
		"data-review-runs": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", {
			className: "flex flex-wrap items-center gap-1.5",
			children: [
				/* @__PURE__ */ b(J, {
					variant: t.live ? "info" : void 0,
					children: t.role
				}),
				/* @__PURE__ */ x("span", { children: ["round ", t.round] }),
				/* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", ds(t.requested, t.served)]
				}),
				t.verdict ? /* @__PURE__ */ b(J, {
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
						children: [/* @__PURE__ */ b(te, {
							size: 12,
							"aria-hidden": "true"
						}), "Attach"]
					}), e.onInfo && /* @__PURE__ */ b(Z, {
						icon: lr,
						label: `Details of ${t.role} round ${t.round}`,
						tooltip: "Open the task's details",
						onClick: e.onInfo
					})]
				})
			]
		}, t.key))
	}) : null;
}
function ps(e) {
	let { task: t, workspaceId: n } = e, r = l(), i = o(() => Ut(r), [r]), a = Gr(n), [s, u] = c(!1), [d, p] = c(!1), [m, h] = c(null), g = (t.authority ?? "local") === "local", _ = rr(e.graph), v = nr(e.graph), y = async (r, a) => {
		if (e.revision !== null) {
			p(!0), h(null);
			try {
				await i.updateTask(n, t.id, { status: r }, e.revision), u(!1), e.onChanged?.(a);
			} catch (e) {
				h(Y(e));
			} finally {
				p(!1);
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
				children: nn(t.noSession)
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
					/* @__PURE__ */ b(X, {
						icon: he,
						tooltip: "Start a Kiro Crew chat about this task. It changes nothing.",
						onClick: () => void a.ask({ tasks: [t.id] }),
						children: "Discuss"
					}),
					g && _ && !s && /* @__PURE__ */ b(X, {
						icon: A,
						disabled: d || e.revision === null,
						tooltip: "Mark it done. Tasks that wait on it may start. You confirm first.",
						onClick: () => u(!0),
						children: "Mark done"
					}),
					g && v && /* @__PURE__ */ b(X, {
						icon: Te,
						disabled: d || e.revision === null,
						tooltip: `Set its status back to ${v}. The tick may then start it.`,
						onClick: () => void y(v, `Moved ${t.id} back to ${v}.`),
						children: "Back to planned"
					}),
					e.onInfo && /* @__PURE__ */ b(X, {
						icon: lr,
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
					/* @__PURE__ */ b(f, {
						type: "button",
						onClick: () => u(!1),
						children: "Cancel"
					}),
					/* @__PURE__ */ b(f, {
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
var ms = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function hs({ id: e, label: t, children: n, hint: r }) {
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
function gs(e) {
	return /* @__PURE__ */ b("textarea", {
		id: e.id,
		rows: e.rows ?? 3,
		value: e.value,
		placeholder: e.placeholder,
		onChange: (t) => e.onChange(t.target.value),
		className: "rounded border px-2 py-1 text-sm",
		style: ms
	});
}
function _s(e) {
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
							style: ms,
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
							style: ms,
							children: [/* @__PURE__ */ b("option", {
								value: "",
								children: "its own completion"
							}), xn.map((e) => /* @__PURE__ */ b("option", {
								value: e,
								children: e
							}, e))]
						}),
						/* @__PURE__ */ b(f, {
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
function vs({ preview: e }) {
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
function ys(e) {
	let { workspaceId: t, graph: n, detail: r } = e, i = l(), a = o(() => vn(i), [i]), s = o(() => r ? wn(r) : null, [r]), [u, d] = c(() => s ?? {
		...Cn(),
		prerequisites: e.prerequisite ? [{
			id: e.prerequisite,
			kind: "requires",
			condition: ""
		}] : []
	}), [p, m] = c(!1), [h, _] = c(!1), [v, y] = c(null), [S, C] = c(null), w = o(() => new Set((n?.tasks ?? []).map((e) => e.id)), [n]), T = r ? r.task.id : p ? u.id : bn(u.title, w), E = yn(n?.edges ?? [], T || "(new)", u.prerequisites.map((e) => e.id)), D = (e) => d({
		...u,
		...e
	}), O = r?.locked ?? null, k = !!u.title.trim() && (!!r || /^[a-z][a-z0-9-]{2,80}$/.test(T)) && !E, A = async () => {
		_(!0), y(null);
		try {
			let i = Tn({
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
			y(En(Y(e)));
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
					/* @__PURE__ */ b(J, {
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
			/* @__PURE__ */ b(hs, {
				id: "avoozl-task-title",
				label: "Title",
				children: /* @__PURE__ */ b(g, {
					id: "avoozl-task-title",
					value: u.title,
					onChange: (e) => D({ title: e.target.value }),
					required: !0
				})
			}),
			!r && /* @__PURE__ */ b(hs, {
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
			/* @__PURE__ */ b(hs, {
				id: "avoozl-task-summary",
				label: "Description",
				children: /* @__PURE__ */ b(gs, {
					id: "avoozl-task-summary",
					rows: 4,
					value: u.summary,
					onChange: (e) => D({ summary: e })
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ b(hs, {
					id: "avoozl-task-epic",
					label: "Epic",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-epic",
						value: u.epic,
						onChange: (e) => D({ epic: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: ms,
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: r ? "Keep" : "Inbox"
						}), (n?.epics ?? []).map((e) => /* @__PURE__ */ b("option", {
							value: e.id,
							children: e.title
						}, e.id))]
					})
				}), /* @__PURE__ */ b(hs, {
					id: "avoozl-task-repository",
					label: "Repository",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-repository",
						value: u.repository,
						onChange: (e) => D({ repository: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: ms,
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
			/* @__PURE__ */ b(hs, {
				id: "avoozl-task-acceptance",
				label: "Acceptance",
				hint: "One condition per line.",
				children: /* @__PURE__ */ b(gs, {
					id: "avoozl-task-acceptance",
					value: u.acceptance,
					onChange: (e) => D({ acceptance: e })
				})
			}),
			/* @__PURE__ */ b(hs, {
				id: "avoozl-task-checks",
				label: "Checks",
				hint: "One command per line, such as npm test.",
				children: /* @__PURE__ */ b(gs, {
					id: "avoozl-task-checks",
					rows: 2,
					value: u.checks,
					onChange: (e) => D({ checks: e })
				})
			}),
			/* @__PURE__ */ b(_s, {
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
			S && /* @__PURE__ */ b(vs, { preview: S }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ b(f, {
					type: "submit",
					primary: !0,
					disabled: h || !k,
					children: O ? "Draft the plan change" : r ? "Save changes" : "Add draft task"
				}), /* @__PURE__ */ b(f, {
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
var bs = [
	"queued",
	"coding",
	"tests",
	"commands",
	"ci-wait",
	"review",
	"rework",
	"merge",
	"waiting"
], xs = {
	queued: "#94a3b8",
	coding: "#3b82f6",
	tests: "#10b981",
	commands: "#8b5cf6",
	"ci-wait": "#0ea5e9",
	review: "#ec4899",
	rework: "#ef4444",
	merge: "#14b8a6",
	waiting: "#a8a29e"
}, Ss = {
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
function Cs(e) {
	return Number.isFinite(e) ? e >= 1e6 ? `${(e / 1e6).toFixed(1)}M` : e >= 1e4 ? `${Math.round(e / 1e3)}k` : e >= 1e3 ? `${(e / 1e3).toFixed(1)}k` : String(Math.round(e)) : "–";
}
var ws = (e) => e ? e.toFixed(2) : "0";
function Ts(e) {
	let t = [];
	return (e.input || e.output) && t.push(`${Cs(e.input)} in · ${Cs(e.output)} out`), e.credits && t.push(`${ws(e.credits)} credits`), t.join(" · ") || "none";
}
function Es(e) {
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
function Ds(e, t) {
	let n = [{
		value: "auto",
		label: "auto (Kiro Crew picks)"
	}, ...e];
	return t && !n.some((e) => e.value === t) && n.push({
		value: t,
		label: `${t} (not offered now)`
	}), n;
}
var Os = "avoozl.flow.filter.", ks = {
	event: "avoozl:flow-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Os + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Os + t, JSON.stringify(n));
		} catch {}
	}
}, As = [
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
function js(e) {
	let t = (t, n, r = {}) => e.post(At, {
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
		startRetro: (e) => t(e, "flow.retro.start"),
		decide: (e, n) => t(e, "flow.retro.decide", n),
		settings: (e) => t(e, "flow.settings.get"),
		saveSettings: (e, n) => t(e, "flow.settings.update", n),
		models: () => e.get("/api/models").then(Es),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n })
	};
}
function Ms(e) {
	if (e == null || !Number.isFinite(e)) return "–";
	let t = Math.round(e / 6e4);
	if (e < 6e4) return `${Math.round(e / 1e3)} s`;
	if (t < 60) return `${t} m`;
	let n = Math.floor(t / 60), r = t % 60;
	return n < 48 ? r ? `${n} h ${r} m` : `${n} h` : `${Math.round(n / 24)} d`;
}
var Ns = (e) => e == null ? "–" : `${Math.round(e * 100)}%`;
function Ps(e) {
	let t = e.metrics, n = e.previous;
	return [
		{
			key: "lead",
			title: "Lead time",
			value: Ms(t.leadTimeMs),
			was: n.tasks ? Ms(n.leadTimeMs) : null,
			empty: t.leadTimeMs === null ? "Finish a task to see lead time." : null,
			tip: "Median time from ready to integrated or merged."
		},
		{
			key: "efficiency",
			title: "Flow efficiency",
			value: Ns(t.flowEfficiency),
			was: n.tasks ? Ns(n.flowEfficiency) : null,
			empty: t.flowEfficiency === null ? "Finish a task to see how much of its time was active." : null,
			tip: "Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting."
		},
		{
			key: "first-pass",
			title: "First-pass rate",
			value: Ns(t.firstPassRate),
			was: n.tasks ? Ns(n.firstPassRate) : null,
			empty: t.firstPassRate === null ? "Finish a task to see how many pass the first time." : null,
			tip: "Tasks accepted on their first attempt with no rework."
		},
		{
			key: "fix",
			title: "Time to fix",
			value: Ms(t.timeToFixMs),
			was: n.tasks && n.timeToFixMs !== null ? Ms(n.timeToFixMs) : null,
			empty: t.timeToFixMs === null ? "No line stop yet." : null,
			tip: "From the line stopping to the check passing on the branch again."
		}
	];
}
function Fs(e) {
	let t = bs.reduce((t, n) => t + (e[n] || 0), 0);
	return t ? bs.filter((t) => e[t] > 0).map((n) => ({
		stage: n,
		ms: e[n],
		share: e[n] / t,
		color: xs[n],
		label: Ss[n]
	})) : [];
}
var Is = {
	"tool-calls": "from tool calls",
	markers: "from phase markers (coarse)",
	events: "from events"
};
function Ls(e) {
	if (e.type === "plan") return `${e.change} (spec ${e.spec})`;
	let t = e.file === "repository" ? ` in ${e.repository}` : "";
	return `${e.key} ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}${t}`;
}
var Rs = (e) => `${e.metric} ${e.direction === "down" ? "↓" : "↑"}`;
function zs(e) {
	if (e.status !== "approved" || !e.pdca) return null;
	if (!e.pdca.result) return `PDCA: measuring over the next ${e.pdca.window} tasks.`;
	let t = e.pdca.result === "helped" ? "helped" : e.pdca.result === "worse" ? "worse" : "did not help", n = (t) => t == null ? "–" : /rate|efficiency/.test(e.metric) ? Ns(t) : Ms(t);
	return `PDCA: ${e.metric} ${n(e.pdca.before)} → ${n(e.pdca.after)}, ${t}.`;
}
function Bs(e) {
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
function Vs(e) {
	return !!(e.repository || e.epic || e.window || e.stage);
}
var Hs = {
	scope: "dependents",
	localChecksFirst: !0,
	max: 3,
	by: "epic",
	everyTasks: 10,
	slowFactor: 2,
	model: "auto"
};
function Us(e = {}) {
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
function Ws(e) {
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
var Gs = 300, Ks = 90, qs = 4;
function Js({ points: e, value: t, format: n, color: r }) {
	let i = e.map(t), a = i.filter((e) => e !== null), o = Math.max(...a, 0) || 1, s = (t) => e.length < 2 ? Gs / 2 : qs + t * 292 / (e.length - 1), c = (e) => 86 - e / o * 82, l = i.map((e, t) => e === null ? null : `${s(t)},${c(e)}`).reduce((e, t) => (t === null ? e.push([]) : e[e.length - 1].push(t), e), [[]]).filter((e) => e.length), u = a.at(-1);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ b("span", {
			className: "text-lg font-semibold tabular-nums",
			children: u === void 0 ? "–" : n(u)
		}), /* @__PURE__ */ x("svg", {
			viewBox: `0 0 ${Gs} ${Ks}`,
			width: "100%",
			height: Ks,
			role: "img",
			"aria-label": e.map((e, t) => `${e.key}: ${i[t] === null ? "none" : n(i[t])}`).join(", "),
			preserveAspectRatio: "none",
			children: [
				/* @__PURE__ */ b("line", {
					x1: 0,
					x2: Gs,
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
function Ys({ points: e }) {
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-1",
		children: /* @__PURE__ */ b("div", {
			className: "flex items-end gap-1",
			style: { height: Ks },
			role: "img",
			"aria-label": "Stage mix per period",
			children: e.map((e) => {
				let t = bs.reduce((t, n) => t + e.stages[n], 0);
				return /* @__PURE__ */ b(q, {
					text: `${e.key}: ${bs.filter((t) => e.stages[t]).map((t) => `${Ss[t]} ${Ms(e.stages[t])}`).join(", ") || "no time"}`,
					children: (n) => /* @__PURE__ */ b("div", {
						tabIndex: 0,
						"aria-describedby": n,
						className: "flex flex-col-reverse overflow-hidden rounded-sm",
						style: {
							height: Ks,
							width: 14,
							background: "color-mix(in srgb, var(--muted) 12%, transparent)"
						},
						children: bs.filter((t) => e.stages[t]).map((n) => /* @__PURE__ */ b("span", { style: {
							height: `${100 * e.stages[n] / (t || 1)}%`,
							background: xs[n],
							display: "block"
						} }, n))
					})
				}, e.key);
			})
		})
	});
}
function Xs({ rows: e }) {
	let t = (e) => e.credits || e.input + e.output, n = Math.max(...e.map(t), 0) || 1;
	return /* @__PURE__ */ b("div", {
		className: "flex items-end gap-1",
		style: { height: Ks },
		role: "img",
		"aria-label": e.map((e) => `${e.key}: ${Ts(e)}`).join(", "),
		children: e.map((e) => /* @__PURE__ */ b("span", {
			className: "rounded-sm",
			style: {
				display: "block",
				flex: "none",
				height: Math.max(2, Math.round(Ks * t(e) / n)),
				width: 14,
				background: "var(--accent)"
			}
		}, e.key))
	});
}
function Zs({ title: e, children: t, empty: n }) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 rounded-lg border p-3",
		style: { borderColor: "var(--border)" },
		children: [/* @__PURE__ */ b("span", {
			className: "text-xs text-muted",
			children: e
		}), n ? /* @__PURE__ */ b("span", {
			className: "text-sm text-muted",
			children: "Nothing finished in this window yet."
		}) : t]
	});
}
function Qs({ view: e }) {
	let [t, n] = c("day"), r = e.series?.[t] ?? [], i = t === "day" ? e.usage?.byDay ?? [] : e.usage?.byWeek ?? [], a = !r.length;
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(m, { children: "Over time" }), /* @__PURE__ */ b("div", {
					role: "radiogroup",
					"aria-label": "Group by",
					className: "inline-flex gap-1 rounded-lg p-1",
					style: { background: "var(--bg-elevated)" },
					children: ["day", "week"].map((e) => /* @__PURE__ */ b("button", {
						type: "button",
						role: "radio",
						"aria-checked": t === e,
						onClick: () => n(e),
						className: "rounded-md px-2.5 py-1 text-xs font-medium",
						style: {
							background: t === e ? "var(--card)" : "transparent",
							color: "var(--text)",
							boxShadow: t === e ? "inset 0 0 0 1px var(--accent)" : "none"
						},
						children: e === "day" ? "By day" : "By week"
					}, e))
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
				"data-flow-charts": !0,
				children: [
					/* @__PURE__ */ b(Zs, {
						title: "Lead time (median)",
						empty: a,
						children: /* @__PURE__ */ b(Js, {
							points: r,
							value: (e) => e.leadTimeMs,
							format: Ms,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(Zs, {
						title: "Flow efficiency",
						empty: a,
						children: /* @__PURE__ */ b(Js, {
							points: r,
							value: (e) => e.flowEfficiency,
							format: Ns,
							color: "var(--ok)"
						})
					}),
					/* @__PURE__ */ b(Zs, {
						title: "First-pass rate",
						empty: a,
						children: /* @__PURE__ */ b(Js, {
							points: r,
							value: (e) => e.firstPassRate,
							format: Ns,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(Zs, {
						title: "Time to fix",
						empty: !r.some((e) => e.timeToFixMs !== null),
						children: /* @__PURE__ */ b(Js, {
							points: r,
							value: (e) => e.timeToFixMs,
							format: Ms,
							color: "var(--danger)"
						})
					}),
					/* @__PURE__ */ b(Zs, {
						title: "Stage mix",
						empty: a,
						children: /* @__PURE__ */ b(Ys, { points: r })
					}),
					/* @__PURE__ */ b(Zs, {
						title: "Tokens and credits",
						empty: !i.length,
						children: /* @__PURE__ */ b(Xs, { rows: i })
					})
				]
			}),
			!a && /* @__PURE__ */ b(rc, {})
		]
	});
}
function $s({ title: e, rows: t }) {
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
					children: Ss[e.key] ?? e.key
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums text-muted",
					children: Ts(e)
				})]
			}, e.key))
		})]
	});
}
function ec({ view: e }) {
	let t = e.usage;
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-3",
		children: [/* @__PURE__ */ b(m, { children: "Tokens and credits" }), t?.available ? t.total.turns ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
			className: "text-sm",
			children: [
				"Total: ",
				/* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Ts(t.total)
				}),
				" over ",
				t.total.turns,
				" turns."
			]
		}), /* @__PURE__ */ x("div", {
			className: "grid gap-4",
			style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
			children: [
				/* @__PURE__ */ b($s, {
					title: "By stage",
					rows: t.byStage
				}),
				/* @__PURE__ */ b($s, {
					title: "By model",
					rows: t.byModel
				}),
				/* @__PURE__ */ b($s, {
					title: "By plan",
					rows: t.byPlan
				}),
				/* @__PURE__ */ b($s, {
					title: "By task (top 8)",
					rows: t.byTask
				})
			]
		})] }) : /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "No turns recorded for these tasks yet."
		}) : /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "Not available: Kiro Crew has not answered a usage read for this workspace's chats yet."
		})]
	});
}
// kirocrew-app/ui/src/FlowView.tsx
var tc = {
	display: "flex",
	height: 12,
	borderRadius: 4,
	overflow: "hidden",
	background: "color-mix(in srgb, var(--muted) 15%, transparent)"
};
function nc({ stages: e, scale: t, label: n }) {
	let r = Fs(e), i = r.reduce((e, t) => e + t.ms, 0), a = `${n}: ${r.map((e) => `${e.label} ${Ms(e.ms)}`).join(", ") || "no time yet"}`;
	return /* @__PURE__ */ b("div", {
		style: { width: `${Math.max(4, t ? 100 * i / t : 100)}%` },
		children: /* @__PURE__ */ b(q, {
			text: a,
			display: "block",
			children: (e) => /* @__PURE__ */ b("div", {
				role: "img",
				"aria-label": a,
				"aria-describedby": e,
				tabIndex: 0,
				style: tc,
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
function rc() {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
		"aria-label": "Stages",
		children: bs.map((e) => /* @__PURE__ */ x("li", {
			className: "inline-flex items-center gap-1",
			children: [/* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					width: 10,
					height: 10,
					borderRadius: 2,
					background: xs[e],
					display: "inline-block"
				}
			}), Ss[e]]
		}, e))
	});
}
function ic({ stops: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => js(r), [r]), a = jn(), s = zr(), [u, d] = c(null);
	if (!e.length) return null;
	let f = async (e) => {
		if (t && await s({
			title: "Run anyway?",
			body: `New work will start while ${e.check ? `\`${e.check}\`` : "the line"} still fails on ${e.branch}. The stop stays open and shows who ran anyway.`,
			action: "Run anyway"
		})) try {
			await i.runAnyway(t, e.id), n?.();
		} catch (e) {
			d(Y(e));
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
				/* @__PURE__ */ b(N, {
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
					children: [/* @__PURE__ */ b("span", {
						style: { overflowWrap: "anywhere" },
						children: Bs(e)
					}), e.runAnyway && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [
							"Run anyway by ",
							e.runAnyway.by,
							", ",
							Dn(e.runAnyway.at, Date.now()),
							"."
						]
					})]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [e.fixTaskId && /* @__PURE__ */ b(X, {
						icon: lr,
						tooltip: "Open the fix task's details in the drawer",
						onClick: () => a.openTask(e.fixTaskId),
						children: "Open fix task"
					}), !e.runAnyway && /* @__PURE__ */ b(X, {
						icon: xe,
						tooltip: "Resume new work while the check still fails; asks first",
						onClick: () => void f(e),
						style: Fr,
						children: "Run anyway"
					})]
				})
			]
		}, e.id)), u && /* @__PURE__ */ b("p", {
			role: "alert",
			className: "text-sm text-danger",
			children: u
		})]
	});
}
function ac({ view: e }) {
	return /* @__PURE__ */ b("div", {
		className: "grid gap-3",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" },
		"data-flow-cards": !0,
		children: Ps(e).map((e) => /* @__PURE__ */ x(p, {
			className: "flex flex-col gap-1",
			children: [/* @__PURE__ */ b(q, {
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
function oc({ tasks: e }) {
	let t = jn(), n = fc("(max-width: 767px)"), r = Kr(String(e.length)), i = Math.max(0, ...e.map((e) => bs.reduce((t, n) => t + (e.stages[n] || 0), 0))), a = r.take("flow-bars", e);
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-2",
		children: [
			/* @__PURE__ */ b(m, { children: "Time per task" }),
			/* @__PURE__ */ b(rc, {}),
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
					}), a = /* @__PURE__ */ b(nc, {
						stages: e.stages,
						scale: i,
						label: e.taskId
					}), o = /* @__PURE__ */ x("span", {
						className: "inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
						children: [
							e.coarse && /* @__PURE__ */ b(q, {
								text: "Built from phase markers or events, not from tool calls",
								children: (e) => /* @__PURE__ */ b("span", {
									"aria-describedby": e,
									tabIndex: 0,
									className: "text-xs text-muted",
									children: "(coarse)"
								})
							}),
							e.batch && /* @__PURE__ */ b(J, { children: "batch" }),
							Ms(e.leadMs),
							/* @__PURE__ */ b(q, {
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
									children: /* @__PURE__ */ b(lr, {
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
			/* @__PURE__ */ b(qr, { ...r.more("flow-bars", e.length) }),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "(coarse) marks bars built from reports, not tool calls."
			})
		]
	});
}
function sc({ proposal: e, retro: t, onDecide: n, busy: r }) {
	let i = zs(e);
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
							children: Ls(e)
						}),
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-muted",
							children: Rs(e)
						}),
						e.removesCheck && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(J, {
							variant: "warning",
							children: "removes a check"
						})] }),
						e.revertOf && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(J, { children: "revert" })] })
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
			children: [/* @__PURE__ */ b(f, {
				type: "button",
				disabled: r,
				onClick: () => n(t, e, "reject"),
				children: "Reject"
			}), /* @__PURE__ */ b(f, {
				type: "button",
				primary: !0,
				disabled: r,
				onClick: () => n(t, e, "approve"),
				children: "Approve"
			})]
		})]
	});
}
function cc({ view: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => js(r), [r]), a = zr(), [s, u] = c(!1), [d, f] = c(null), [h, g] = c(!1), _ = async (e, r, o) => {
		if (!t) return;
		let s = !1;
		if (!(o === "approve" && r.removesCheck && (s = await a({
			title: "Approve removing a check?",
			body: `${Ls(r)} removes a review role or a declared check, so fewer things are checked before work lands.`,
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
				f(Y(e));
			} finally {
				u(!1);
			}
		}
	}, v = async () => {
		if (t) try {
			await i.startRetro(t), g(!0);
		} catch (e) {
			f(Y(e));
		}
	}, y = e.retros.some((e) => e.state === "running");
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(m, { children: "Retros" }), /* @__PURE__ */ b(X, {
					icon: xe,
					disabled: y || h,
					tooltip: "Start a retro at the next tick instead of waiting for its trigger",
					onClick: () => void v(),
					children: h ? "Starts at the next tick" : "Run a retro now"
				})]
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
								e.bottleneck ? ` · bottleneck ${Ss[e.bottleneck.stage] ?? e.bottleneck.stage}` : ""
							]
						}),
						e.state === "running" && /* @__PURE__ */ x("span", {
							className: "text-sm text-muted",
							children: [
								"Running since ",
								Dn(e.startedAt, Date.now()),
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
							children: e.proposals.map((t) => /* @__PURE__ */ b(sc, {
								proposal: t,
								retro: e,
								onDecide: (e, t, n) => void _(e, t, n),
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
function lc({ view: e }) {
	return !e.flaky.length && !e.ciOnly.length ? null : /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-1 text-sm",
		children: [
			/* @__PURE__ */ b(m, { children: "Checks that disagree" }),
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
function uc({ workspaceId: e }) {
	let n = l(), r = o(() => js(n), [n]), [i, a] = Wi(e, ks), s = JSON.stringify(i), { value: c, error: u, busy: d, reload: f } = Fi(e, t((e) => r.view(e, JSON.parse(s)), [r, s])), m = (e) => a({
		...i,
		...e
	});
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-flow-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Jr, {
				id: "avoozl-flow-title",
				view: "flow",
				children: "Flow"
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Where delivery time goes, and what the last retro proposed."
			}),
			u && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: u
			}),
			c ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(ic, {
					stops: c.line,
					workspaceId: e,
					onChanged: () => void f()
				}),
				/* @__PURE__ */ b(Hi, {
					id: "avoozl-flow",
					label: "Filter flow timing",
					active: Vs(i),
					onClear: () => a({}),
					fields: [
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: i.repository ?? "",
							options: [...c.repositories.map((e) => ({
								value: e,
								label: e
							}))],
							onChange: (e) => m({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: i.epic ?? "",
							options: [...c.epics.map((e) => ({
								value: e.id,
								label: e.title
							}))],
							onChange: (e) => m({ epic: e || void 0 })
						},
						{
							kind: "select",
							key: "window",
							label: "Window",
							value: i.window ?? "20",
							options: As,
							onChange: (e) => m({ window: e || void 0 })
						},
						{
							kind: "select",
							key: "stage",
							label: "Stage",
							value: i.stage ?? "",
							options: [...bs.map((e) => ({
								value: e,
								label: Ss[e]
							}))],
							onChange: (e) => m({ stage: e || void 0 })
						}
					]
				}),
				/* @__PURE__ */ b(ac, { view: c }),
				c.bottleneck && /* @__PURE__ */ x(p, {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b(re, {
						size: 18,
						"aria-hidden": "true",
						style: {
							color: xs[c.bottleneck.stage],
							flex: "none"
						}
					}), /* @__PURE__ */ x("span", { children: [
						/* @__PURE__ */ x("span", {
							className: "font-semibold",
							children: ["Biggest bottleneck: ", Ss[c.bottleneck.stage]]
						}),
						", ",
						Math.round(c.bottleneck.share * 100),
						"% of lead time",
						c.bottleneck.repository ? ` in ${c.bottleneck.repository}` : "",
						" (median ",
						Ms(c.bottleneck.medianMs),
						" per task)."
					] })]
				}),
				c.tasks.length ? /* @__PURE__ */ b(oc, { tasks: c.tasks }) : /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(re, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "No timing yet",
					subtitle: "Avoozl records where each task's time goes as soon as a task is dispatched."
				}),
				/* @__PURE__ */ b(Qs, { view: c }),
				/* @__PURE__ */ b(ec, { view: c }),
				/* @__PURE__ */ b(lc, { view: c }),
				/* @__PURE__ */ b(cc, {
					view: c,
					workspaceId: e,
					onChanged: () => void f()
				})
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: d ? "Loading…" : "Not loaded"
			})
		]
	});
}
function dc({ timing: e }) {
	return e ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		"data-timing-fold": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(nc, {
						stages: e.stages,
						scale: 0,
						label: e.taskId
					})
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Ms(e.leadMs)
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
								background: xs[e.stage] ?? "var(--muted)",
								flex: "none"
							}
						}),
						/* @__PURE__ */ b("span", { children: Ss[e.stage] ?? e.stage }),
						e.detail && /* @__PURE__ */ b("code", {
							className: "text-xs",
							children: e.detail
						}),
						/* @__PURE__ */ b("span", {
							className: "tabular-nums",
							children: Ms(e.lengthMs)
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: Is[e.source]
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
function fc(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
function pc({ label: e, children: t }) {
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
		className: "text-muted",
		children: e
	}), /* @__PURE__ */ b("dd", {
		className: "min-w-0 break-words",
		children: t
	})] });
}
function mc({ title: e, links: t, open: n }) {
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
function hc(e) {
	let { origin: n } = e, i = l(), a = o(() => vn(i), [i]), [s, u] = c(null), [d, f] = c(null), p = t(() => f(null), []), m = async (t) => {
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
				error: Y(e)
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
				children: h?.readable ? pn(n.text, h.document).map((e, t) => e.link ? /* @__PURE__ */ b("button", {
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
						children: [/* @__PURE__ */ b(X, {
							icon: H,
							tooltip: `Open all of ${e.document} in a reader, at the cited line`,
							onClick: () => f(e),
							"aria-label": `Open full file ${e.document}`,
							children: "Open full file"
						}), /* @__PURE__ */ x(X, {
							icon: B,
							tooltip: "Show the lines this task was made from here, read from the file now",
							onClick: () => void m(e),
							"aria-label": `${s?.source === e ? "Hide" : "Read"} ${fn(e)}`,
							children: [
								s?.source === e ? "Hide" : "Read",
								" ",
								fn(e)
							]
						})]
					}, e.document + e.lineStart) : /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [fn(e), " (no longer in this workspace)"]
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
						children: [s.source.document, mn(s.source) ? ` · ${mn(s.source)} marked` : ""]
					}), /* @__PURE__ */ b("button", {
						type: "button",
						className: "ml-auto underline",
						onClick: () => f(s.source),
						children: "Open full file"
					})]
				}), /* @__PURE__ */ b(Ho, {
					text: s.text,
					lineStart: s.source.lineStart,
					lineEnd: s.source.lineEnd,
					maxHeight: 360,
					idPrefix: "avoozl-origin",
					label: `Contents of ${s.source.document}`
				})] })
			}),
			d && /* @__PURE__ */ b(rs, {
				workspaceId: e.workspaceId,
				target: d,
				onClose: p
			})
		]
	});
}
function gc(e) {
	let { workspaceId: n, id: i } = e, a = l(), s = o(() => vn(a), [a]), u = o(() => Ut(a), [a]), [d, f] = c(null), p = Kr(e.id), [m, h] = c(null), [g, _] = c(!1), v = Gr(n), [S, C] = c(!1), [w, T] = c(null), E = t(async () => {
		h(null);
		try {
			f(await s.detail(n, i));
		} catch (e) {
			h(Y(e));
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
					text: Y(e)
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
	let { task: O, delivery: k } = d, A = O.authority === "local", j = (k?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1), M = O.status === "deferred", N = nr(e.graph), P = k?.complete ?? O.state === "done", F = Gt(O.issue?.url ?? null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("h3", {
				id: "avoozl-drawer-title",
				className: "text-lg font-semibold leading-snug",
				children: O.title
			}), /* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: O.id }),
					/* @__PURE__ */ b(Ii, { owner: O }),
					O.state && /* @__PURE__ */ b(J, {
						variant: O.state === "needs-you" ? "warning" : void 0,
						children: O.state
					}),
					d.locked && /* @__PURE__ */ b(J, { children: "locked" }),
					O.planArchived && /* @__PURE__ */ b(J, { children: "Archived" })
				]
			})] }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [
					e.onFocus && /* @__PURE__ */ b(X, {
						icon: R,
						tooltip: "Show only this task and the tasks it waits on and that wait on it",
						onClick: () => {
							e.onFocus(O.id, O.title), e.onClose();
						},
						children: "Focus"
					}),
					/* @__PURE__ */ b(X, {
						icon: he,
						tooltip: "Start a Kiro Crew chat seeded with this task's full context",
						onClick: () => void v.ask({ tasks: [O.id] }),
						children: "Ask in a chat"
					}),
					j === "decision" && /* @__PURE__ */ b(X, {
						icon: Te,
						disabled: S,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => D(async () => (await u.retry(n, O.id), {
							ok: !0,
							text: "Retrying."
						})),
						children: "Retry"
					}),
					!P && A && !M && /* @__PURE__ */ b(X, {
						icon: ye,
						disabled: S,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: "deferred" }, d.revision), {
							ok: !0,
							text: "Deferred. No new attempt starts; a running session is left alone."
						})),
						children: "Defer"
					}),
					!P && A && M && N && /* @__PURE__ */ b(X, {
						icon: xe,
						disabled: S,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: N }, d.revision), {
							ok: !0,
							text: "Resumed."
						})),
						children: "Resume"
					}),
					/* @__PURE__ */ b(X, {
						icon: be,
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
			O.handSetReview && /* @__PURE__ */ b(ps, {
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
			tn(k).length > 0 && /* @__PURE__ */ x("section", {
				"aria-label": "Review",
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("h4", {
					className: "text-sm font-semibold",
					children: "Review"
				}), /* @__PURE__ */ b(fs, { item: k })]
			}),
			g && /* @__PURE__ */ b("div", {
				className: "rounded border p-3",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(ys, {
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
					/* @__PURE__ */ b(Ur, {
						id: "summary",
						group: "task-drawer",
						title: "Summary",
						open: d.conflicts.length === 0,
						children: /* @__PURE__ */ x("dl", {
							className: "grid gap-x-3 gap-y-1.5 text-sm",
							style: { gridTemplateColumns: "max-content 1fr" },
							children: [
								/* @__PURE__ */ b(pc, {
									label: "Epic",
									children: O.epicTitle ? at(O.epicTitle) : "none"
								}),
								d.origin && /* @__PURE__ */ b(pc, {
									label: "Came from",
									children: /* @__PURE__ */ b(hc, {
										origin: d.origin,
										issue: F,
										workspaceId: n
									})
								}),
								/* @__PURE__ */ x(pc, {
									label: "Plan",
									children: [d.plan ? `${d.plan.title}${d.plan.approved ? " (approved)" : ` (${d.plan.state ?? "draft"})`}` : "none", O.planArchived ? " · archived: its tasks do not start until you unarchive it" : ""]
								}),
								/* @__PURE__ */ x(pc, {
									label: "Authority",
									children: [
										/* @__PURE__ */ b(Ii, { owner: O }),
										" ",
										O.authority
									]
								}),
								/* @__PURE__ */ b(pc, {
									label: "Route",
									children: O.route
								}),
								/* @__PURE__ */ b(pc, {
									label: "Status",
									children: O.status ?? "none"
								}),
								/* @__PURE__ */ b(pc, {
									label: "State",
									children: O.state ?? "unknown"
								}),
								/* @__PURE__ */ b(pc, {
									label: "Wave",
									children: O.wave
								}),
								/* @__PURE__ */ b(pc, {
									label: "Done when",
									children: O.completion
								}),
								O.repository && /* @__PURE__ */ b(pc, {
									label: "Repository",
									children: O.repository
								}),
								O.owner && /* @__PURE__ */ b(pc, {
									label: "Assignee",
									children: O.owner
								}),
								O.decision && /* @__PURE__ */ b(pc, {
									label: "Decision",
									children: O.decision
								}),
								O.needsReview && /* @__PURE__ */ b(pc, {
									label: "Review",
									children: "Needs your review"
								}),
								(k?.pullRequests ?? []).map((e, t) => /* @__PURE__ */ b(pc, {
									label: "Pull request",
									children: Gt(e.url) ? /* @__PURE__ */ x("a", {
										href: Gt(e.url),
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
					/* @__PURE__ */ b(Ur, {
						id: "description",
						group: "task-drawer",
						title: "Description",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [
								O.summary ? /* @__PURE__ */ b(ka, { text: O.summary }) : /* @__PURE__ */ b("p", {
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
								}), /* @__PURE__ */ b(ka, { text: O.context })] })
							]
						})
					}),
					/* @__PURE__ */ b(Ur, {
						id: "links",
						group: "task-drawer",
						title: "Links",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [/* @__PURE__ */ b(mc, {
								title: "Waits on",
								links: d.waitsOn,
								open: e.open
							}), /* @__PURE__ */ b(mc, {
								title: "Blocks",
								links: d.blocks,
								open: e.open
							})]
						})
					}),
					/* @__PURE__ */ b(Ur, {
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
											href: kn(e),
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
												qt(e) ?? "model not named",
												" · started",
												" ",
												Dn(e.boundAt),
												e.statusAt ? ` · last activity ${Dn(e.statusAt)}` : ""
											]
										})
									] }, e.slot))
								}),
								j === "decision" && /* @__PURE__ */ b(ri, {
									item: k,
									busy: S,
									onRetry: (e) => D(async () => (await u.retry(n, O.id, e), {
										ok: !0,
										text: "Dismissed and retrying."
									}))
								}),
								/* @__PURE__ */ b(ii, {
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
					/* @__PURE__ */ b(Ur, {
						id: "timing",
						group: "task-drawer",
						title: "Timing",
						children: /* @__PURE__ */ b(dc, { timing: d.timing ?? null })
					}),
					/* @__PURE__ */ b(Ur, {
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
										children: vi(e)
									}),
									e.changedAt && /* @__PURE__ */ x("div", {
										className: "text-xs text-muted",
										children: [
											"Changed ",
											Dn(e.changedAt),
											e.changedBy ? ` by ${e.changedBy}` : "",
											". See Timeline for this task's history."
										]
									}),
									/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(X, {
										icon: he,
										tooltip: "Start a Kiro Crew chat seeded with this item",
										onClick: () => void v.ask({ items: [dr(e)] }),
										children: "Ask in a chat"
									}) }),
									/* @__PURE__ */ b(Zi, {
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
					/* @__PURE__ */ b(Ur, {
						id: "timeline",
						group: "task-drawer",
						title: "Timeline",
						children: d.timeline.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
							className: "flex flex-col gap-1 text-sm",
							children: p.take("timeline", d.timeline).map((e, t) => /* @__PURE__ */ x("li", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ b(q, {
									text: e.at,
									children: /* @__PURE__ */ b("span", {
										className: "w-28 shrink-0 text-xs text-muted",
										children: Dn(e.at)
									})
								}), /* @__PURE__ */ b("span", { children: e.text })]
							}, t))
						}), /* @__PURE__ */ b(qr, { ...p.more("timeline", d.timeline.length) })] }) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "Nothing recorded yet."
						})
					})
				]
			}),
			k && Qt(k) && /* @__PURE__ */ b(ti, {
				item: k,
				onSupersede: async (e, t) => {
					await u.supersede(n, e, t), await E();
				}
			}),
			k?.sessions.length ? /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Running for ",
					On(k.sessions.at(-1).boundAt),
					" in its latest attempt."
				]
			}) : null
		]
	});
}
function _c(e) {
	let t = l(), n = o(() => Ut(t), [t]), i = o(() => vn(t), [t]), [a, s] = c(null), [u, d] = c(!1), [f, p] = c(null);
	r(() => {
		n.conflictsPage(e.workspaceId).then((t) => s({
			revision: t.revision,
			group: t.items.find((t) => t.kind === "review" && t.id === e.group.id) ?? null
		}), (e) => p(Y(e)));
	}, [
		n,
		e.workspaceId,
		e.group.id
	]);
	let m = a ? a.group : e.group, h = async () => {
		if (a && m) {
			d(!0), p(null);
			try {
				let t = mi("reviewed", await i.settle(e.workspaceId, "reviewed", ui(m), a.revision));
				t.ok ? e.onReviewed() : p(t.text);
			} catch (e) {
				p(Y(e));
			} finally {
				d(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b("h3", {
				id: "avoozl-drawer-title",
				className: "text-lg font-semibold",
				children: m?.title ?? e.group.title
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
			}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("div", { children: m && /* @__PURE__ */ b(Qi, {
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
						/* @__PURE__ */ b(Ii, { owner: t })
					]
				}, t.id))
			})] })
		]
	});
}
function vc() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function yc(e) {
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
			let n = us(e.width, t.key);
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
function bc({ workspaceId: e, children: n, onFocus: i }) {
	let a = l(), u = o(() => Ut(a), [a]), [d, f] = c(null), [p, m] = c([]), [h, g] = c(null), [_, v] = c(!1), S = s(null), C = s(null), w = fc("(max-width: 767px)"), T = fc("(prefers-reduced-motion: reduce)"), [E, D] = c(620), [O, k] = c(!1);
	r(() => {
		D(e ? cs(vc(), e) : 620);
	}, [e]);
	let A = t((t) => {
		let n = os(t, window.innerWidth);
		D(n), e && ls(vc(), e, n);
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
	return Mr("drawer", N && !!e, "Close the drawer", () => p.length ? F() : P(), P), /* @__PURE__ */ x(An.Provider, {
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
				!w && /* @__PURE__ */ b(yc, {
					width: os(E, typeof window > "u" ? E : window.innerWidth),
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
						width: w ? "100%" : os(E, typeof window > "u" ? E : window.innerWidth),
						background: "var(--card, var(--bg))",
						color: "var(--text)",
						borderColor: "var(--border)",
						transform: _ || T ? "none" : "translateX(100%)",
						transition: T || O ? "none" : "transform 180ms ease-out"
					},
					children: [/* @__PURE__ */ x("div", {
						className: "mb-3 flex items-center gap-2",
						children: [
							p.length > 0 && /* @__PURE__ */ b(Q, {
								tooltip: "Go back to what you had open before",
								onClick: F,
								children: "Back"
							}),
							/* @__PURE__ */ b("span", { className: "grow" }),
							d.kind === "task" && /* @__PURE__ */ b(X, {
								icon: Se,
								tooltip: "Add a draft task that waits on this one",
								onClick: () => M.addTask({ prerequisite: d.id }),
								children: "Add a task after this"
							}),
							/* @__PURE__ */ b(X, {
								icon: Ne,
								onClick: P,
								"aria-label": "Close task details",
								children: "Close"
							})
						]
					}), d.kind === "task" ? /* @__PURE__ */ b(gc, {
						workspaceId: e,
						id: d.id,
						graph: h,
						open: M.openTask,
						onClose: P,
						onFocus: i
					}) : d.kind === "review" ? /* @__PURE__ */ b(_c, {
						workspaceId: e,
						group: d.group,
						open: M.openTask,
						onReviewed: () => {
							d.onReviewed?.(), P();
						}
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("h3", {
						id: "avoozl-drawer-title",
						className: "mb-2 text-lg font-semibold",
						children: "Add a task"
					}), /* @__PURE__ */ b(ys, {
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
// kirocrew-app/ui/src/DashboardView.tsx
var xc = 200, Sc = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, Cc = {
	...Zt,
	delivery: "Delivery",
	"github-conflict": "GitHub edit"
}, wc = "(min-width: 1024px)", Tc = {
	flight: "22rem",
	blocked: "22rem",
	recent: "22rem"
};
function Ec({ height: e, children: t }) {
	let n = fc(wc);
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
function Dc({ title: e, children: t, empty: n }) {
	return /* @__PURE__ */ x(p, {
		className: "flex h-full min-h-0 flex-col",
		children: [/* @__PURE__ */ b(m, { children: e }), /* @__PURE__ */ b("div", {
			"data-scroll": !0,
			className: "min-h-0 flex-1 overflow-y-auto",
			children: n ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: n
			}) : t
		})]
	});
}
var Oc = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)"
}, kc = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "baseline"
};
function Ac({ id: e, title: t, onOpen: n }) {
	return /* @__PURE__ */ b(q, {
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
function jc({ item: e, attach: t, onOpen: n, onInfo: r, onAsk: i }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(J, {
				variant: [
					"decision",
					"needs-human",
					"review"
				].includes(e.kind) ? "warning" : "danger",
				children: Cc[e.kind] ?? e.kind
			}),
			/* @__PURE__ */ x("span", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ b("span", {
						className: "font-medium",
						children: e.title
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
					t && /* @__PURE__ */ b(q, {
						text: "Open the task's running chat",
						children: /* @__PURE__ */ b("a", {
							href: t,
							className: "self-center text-sm underline",
							"aria-label": `Attach to the chat for ${e.title}`,
							children: "Attach"
						})
					}),
					/* @__PURE__ */ b(Z, {
						icon: lr,
						label: e.group ? `Info: ${e.title}` : `Details for ${e.title}`,
						tooltip: e.group ? "Why these tasks need review, and the list of them" : "Open the task drawer",
						onClick: r
					}),
					/* @__PURE__ */ b(Z, {
						icon: he,
						label: `Ask in a chat about ${e.title}`,
						tooltip: "Ask in a chat: a new chat seeded with this item's full context",
						onClick: i
					}),
					/* @__PURE__ */ b(Z, {
						icon: e.tab === "conflicts" ? A : te,
						label: e.tab === "conflicts" ? `Resolve ${e.title}` : `Open ${e.title} in Delivery`,
						tooltip: e.tab === "conflicts" ? "Resolve it in Conflicts" : "Open it in Delivery",
						onClick: n
					})
				]
			})
		]
	});
}
var Mc = {
	worker: "Worker",
	checks: "Checks",
	planner: "Planner"
}, Nc = (e) => Mc[e.role] ?? (e.role === "worker" ? "Worker" : `Reviewer · ${e.role}`), Pc = 2e4;
function Fc({ row: e, now: t, onInfo: n }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(J, { children: Nc(e) }),
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
							e.model ?? "model not named",
							" · running ",
							On(e.startedAt, t),
							" · ",
							e.status ?? "not observed",
							" ",
							Dn(e.lastAt, t)
						]
					})
				]
			}),
			/* @__PURE__ */ x("span", {
				className: "flex gap-1.5",
				children: [/* @__PURE__ */ b(Z, {
					icon: lr,
					label: `Details for ${e.title}`,
					tooltip: "Open the task drawer",
					onClick: n
				}), /* @__PURE__ */ x("a", {
					href: kn(e.session),
					className: "self-center text-sm underline",
					"aria-label": `Attach to the ${e.role} chat for ${e.title}`,
					style: {
						display: "inline-flex",
						alignItems: "center",
						gap: 4
					},
					children: [/* @__PURE__ */ b(te, {
						size: 14,
						"aria-hidden": "true"
					}), "Attach"]
				})]
			})
		]
	});
}
function Ic(e) {
	let t = dn(e.layout);
	return /* @__PURE__ */ b("ul", {
		className: "min-w-0",
		style: t.list,
		"aria-label": `Tasks by state, ${e.total} in all`,
		"data-state-counts": e.layout,
		children: qe.map((n) => /* @__PURE__ */ b("li", {
			className: "min-w-0",
			children: /* @__PURE__ */ b(q, {
				text: `Show ${n.label.toLowerCase()} tasks in Delivery`,
				display: e.layout === "small" ? "block" : void 0,
				children: /* @__PURE__ */ x("button", {
					type: "button",
					onClick: () => e.onPick(n.id),
					"aria-label": `${n.label}: ${e.counts[n.id]} tasks. Show them in Delivery`,
					className: "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
					style: {
						...t.button,
						borderColor: `color-mix(in srgb, ${Sc[n.id]} 60%, var(--border))`,
						background: `color-mix(in srgb, ${Sc[n.id]} 14%, var(--card, transparent))`,
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
								style: { fill: Sc[n.id] }
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
function Lc({ count: e, onOpen: t }) {
	return /* @__PURE__ */ b(q, {
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
				/* @__PURE__ */ b(ce, {
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
function Rc({ items: e, now: t, onOpen: n, pages: r }) {
	return e ? e.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
		className: "mt-1 flex flex-col text-sm",
		children: r.take("activity", e).map((e, r) => /* @__PURE__ */ x("li", {
			className: "flex items-baseline gap-2 border-t py-1.5 first:border-t-0",
			style: { borderColor: "var(--border)" },
			children: [/* @__PURE__ */ b(q, {
				text: e.at,
				children: /* @__PURE__ */ b("span", {
					className: "w-16 shrink-0 text-xs text-muted",
					children: Dn(e.at, t)
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
	}), /* @__PURE__ */ b(qr, { ...r.more("activity", e.length) })] }) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Nothing has happened yet."
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Loading…"
	});
}
function zc(e) {
	let { workspaceId: n, onNavigate: i } = e, a = l(), s = o(() => Ut(a), [a]), u = o(() => Xa(a), [a]), d = o(() => fr(a), [a]), p = Gr(n), m = un(fc(wc), fc(ln)), { value: g, error: _, busy: v, reload: S } = Fi(n, t(async (e) => {
		let [t, n, r, i, a] = await Promise.allSettled([
			s.graph(e),
			s.delivery(e),
			s.conflicts(e),
			u.stored(e),
			d.activity(e, xc)
		]), o = (e) => e.status === "fulfilled" ? e.value : null, c = [
			t,
			n,
			r,
			i,
			a
		].filter((e) => e.status === "rejected").length, l = o(r);
		return {
			summary: cn({
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
	])), w = o(() => js(a), [a]), T = Fi(n, t((e) => w.view(e, { window: "10" }), [w])), E = g?.summary, D = jn(), O = Kr(""), [k, A] = c(() => Date.now());
	r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (A(Date.now()), S());
		}, Pc);
		return () => clearInterval(e);
	}, [S]);
	let j = (e) => {
		let t = e.group ? [e.group] : (g?.conflicts ?? []).filter((t) => t.taskId === e.taskId && (e.kind === "delivery" || t.kind === e.kind));
		p.ask(t.length ? { items: t.map(Bc) } : { tasks: e.taskId ? [e.taskId] : [] });
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-dashboard-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				"data-dashboard-header": !0,
				children: [
					/* @__PURE__ */ b(Jr, {
						id: "avoozl-dashboard-title",
						view: "dashboard",
						children: "Dashboard"
					}),
					E && g.total > 0 && /* @__PURE__ */ x("span", {
						className: "whitespace-nowrap text-xs text-muted tabular-nums",
						children: [g.total, " tasks"]
					}),
					m === "small" ? /* @__PURE__ */ b(Z, {
						icon: we,
						label: "Refresh",
						tooltip: "Read the Dashboard again",
						onClick: () => void S(),
						disabled: v
					}) : /* @__PURE__ */ b(X, {
						icon: we,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}),
					/* @__PURE__ */ b("span", {
						role: "status",
						className: v || g?.failed ? "text-xs text-muted" : "sr-only",
						children: v ? "Loading…" : g?.failed ? `${g.failed} of 5 reads failed; those sections are empty.` : ""
					}),
					e.untriaged !== null && e.untriaged !== void 0 && /* @__PURE__ */ b(Lc, {
						count: e.untriaged,
						onOpen: () => i("untriaged")
					}),
					E && g.total > 0 && /* @__PURE__ */ b(Ic, {
						counts: E.counts,
						total: g.total,
						layout: m,
						onPick: (t) => e.onScope?.("delivery", { state: t })
					})
				]
			}),
			/* @__PURE__ */ b(ic, {
				stops: T.value?.line ?? [],
				workspaceId: n,
				onChanged: () => void T.reload()
			}),
			(_ || p.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: _ ?? p.error
			}),
			E && g.total === 0 ? /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(Fe, { size: 40 }),
				title: "No tasks yet",
				subtitle: "Plan a goal from the header, then approve its spec in Plans. Ready tasks start on their own.",
				action: /* @__PURE__ */ b(f, {
					onClick: () => i("plans"),
					children: "Open Plans"
				})
			}) : E ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ x(Ec, {
					height: Tc.flight,
					children: [/* @__PURE__ */ x(Dc, {
						title: `In flight (${E.inFlight.length})`,
						empty: E.inFlight.length === 0 && "No agent is working right now.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: O.take("flight", E.inFlight).map((e) => /* @__PURE__ */ b(Fc, {
								row: e,
								now: k,
								onInfo: () => D.openTask(e.taskId)
							}, e.slot))
						}), /* @__PURE__ */ b(qr, { ...O.more("flight", E.inFlight.length) })]
					}), /* @__PURE__ */ x(Dc, {
						title: "Progress by epic",
						empty: E.progress.length === 0 && `No epics yet. ${E.plans.approved} approved and ${E.plans.draft} draft plans.`,
						children: [/* @__PURE__ */ x("p", {
							className: "mt-1 text-xs text-muted",
							children: [
								E.plans.approved,
								" approved and ",
								E.plans.draft,
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
							children: E.progress.map((t) => {
								let n = t.total ? Math.round(t.done / t.total * 100) : 0, r = t.title === t.epic ? at(t.epic) : t.title;
								return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(q, {
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
				/* @__PURE__ */ x(Ec, {
					height: Tc.blocked,
					children: [/* @__PURE__ */ x(Dc, {
						title: `Needs you (${E.attention.length})`,
						empty: E.attention.length === 0 && "Nothing waits on you.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: O.take("attention", E.attention).map((e) => /* @__PURE__ */ b(jc, {
								item: e,
								attach: Vc(E.running, e.taskId),
								onOpen: () => i(e.tab, e.taskId ?? void 0),
								onInfo: () => e.group ? D.openReview(e.group, () => void S()) : e.taskId && D.openTask(e.taskId),
								onAsk: () => j(e)
							}, e.key))
						}), /* @__PURE__ */ b(qr, { ...O.more("attention", E.attention.length) })]
					}), /* @__PURE__ */ x(Dc, {
						title: `Up next (${E.readyNext.length})`,
						empty: E.readyNext.length === 0 && "No task is ready.",
						children: [
							/* @__PURE__ */ b("p", {
								className: "mt-1 text-xs text-muted",
								children: "In the order the tick starts them."
							}),
							/* @__PURE__ */ x("table", {
								className: "w-full border-collapse text-sm",
								children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("th", {
										style: Oc,
										children: "Wave"
									}),
									/* @__PURE__ */ b("th", {
										style: Oc,
										children: "Task"
									}),
									/* @__PURE__ */ b("th", {
										style: {
											...Oc,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b("span", {
											className: "sr-only",
											children: "Graph"
										})
									})
								] }) }), /* @__PURE__ */ b("tbody", { children: O.take("next", E.readyNext).map((e) => /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("td", {
										style: kc,
										children: /* @__PURE__ */ x(J, {
											variant: "wave",
											children: ["wave ", e.wave]
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...kc,
											width: "100%"
										},
										children: /* @__PURE__ */ b(Ac, {
											id: e.id,
											title: e.title,
											onOpen: () => D.openTask(e.id)
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...kc,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b(Z, {
											icon: _e,
											label: `Show ${e.title} in the Graph`,
											onClick: () => i("graph", e.id)
										})
									})
								] }, e.id)) })]
							}),
							/* @__PURE__ */ b(qr, { ...O.more("next", E.readyNext.length) })
						]
					})]
				}),
				/* @__PURE__ */ x(Ec, {
					height: Tc.recent,
					children: [/* @__PURE__ */ x(Dc, {
						title: `Recently completed (${E.recent.length})`,
						empty: E.recent.length === 0 && "Nothing delivered yet.",
						children: [/* @__PURE__ */ b("table", {
							className: "w-full border-collapse text-sm",
							children: /* @__PURE__ */ b("tbody", { children: O.take("recent", E.recent).map((e) => /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ b("td", {
									style: kc,
									children: /* @__PURE__ */ b("span", {
										role: "img",
										"aria-label": "Done",
										style: { color: "var(--ok)" },
										children: "✓"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...kc,
										width: "100%"
									},
									children: /* @__PURE__ */ b(Ac, {
										id: e.id,
										title: e.title,
										onOpen: () => D.openTask(e.id)
									})
								}),
								/* @__PURE__ */ b("td", {
									style: kc,
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
										...kc,
										textAlign: "right"
									},
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(q, {
										text: e.at,
										children: /* @__PURE__ */ b("span", { children: Dn(e.at, k) })
									})
								})
							] }, e.id)) })
						}), /* @__PURE__ */ b(qr, { ...O.more("recent", E.recent.length) })]
					}), /* @__PURE__ */ b(Dc, {
						title: "Recent activity",
						children: /* @__PURE__ */ b(Rc, {
							items: g.activity,
							now: k,
							onOpen: (e) => D.openTask(e),
							pages: O
						})
					})]
				})
			] }) : !_ && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Loading…"
			})
		]
	});
}
var Bc = (e) => dr(e);
function Vc(e, t) {
	let n = [...e.find((e) => e.id === t)?.sessions ?? []].sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
	return n[0] ? kn(n[0]) : null;
}
// kirocrew-app/ui/src/FilterBar.tsx
var Hc = {
	event: Hn,
	read: Un,
	write: Wn,
	empty: {}
};
function Uc(e) {
	return Wi(e, Hc);
}
function Wc(e, t) {
	Gi(Hc, e, t);
}
function Gc(e) {
	let { filter: t, choices: n } = e, r = (n) => e.onChange(Gn(t, n));
	return /* @__PURE__ */ b(Hi, {
		id: e.id,
		label: "Filter tasks",
		active: Fn(t),
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
var Kc = 60, qc = 640, Jc = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, Yc = Object.fromEntries(qe.map((e) => [e.id, e.label])), Xc = (e, t) => e.length > t ? e.slice(0, t - 1) + "…" : e, Zc = (e, t) => {
	(e.key === "Enter" || e.key === " ") && (e.preventDefault(), t());
};
function Qc({ task: e, x: t, y: n }) {
	if (e.authority !== "github") return /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: "var(--muted)" },
		children: e.authority ?? "local"
	});
	let r = e.issue ? Gt(e.issue.url) : null, i = e.issue ? e.issue.number ? `#${e.issue.number}` : "GitHub" : "pending", a = /* @__PURE__ */ b("text", {
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
function $c(e) {
	let { node: t, selected: n } = e, r = Jc[t.state], i = t.members ? `${t.members.done} of ${t.members.total} done` : `${t.id} · ${Yc[t.state]}`, a = t.members ? `Epic ${t.title}, collapsed, ${i}. Press to show only this epic.` : `${t.title}, ${t.id}, ${Yc[t.state]}${t.task?.review ? ", waits for review" : ""}${t.task?.planArchived ? ", archived plan" : ""}${t.task?.handSetReview ? ", review set by hand, none running" : ""}`;
	return /* @__PURE__ */ x("g", {
		transform: `translate(${t.x},${t.y})`,
		role: "button",
		tabIndex: 0,
		"aria-label": a,
		"aria-pressed": t.members ? void 0 : n,
		"data-node": t.id,
		onClick: () => e.onSelect(t),
		onKeyDown: (n) => Zc(n, () => e.onSelect(t)),
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
				width: Ze,
				height: Qe,
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
				height: Qe,
				rx: 3,
				style: { fill: r }
			}),
			/* @__PURE__ */ b("text", {
				x: 12,
				y: 15,
				fontSize: 11,
				fontWeight: 600,
				style: { fill: "var(--text)" },
				children: Xc(t.title, t.task?.review ? 19 : 25)
			}),
			t.task?.review && /* @__PURE__ */ b("text", {
				x: Ze - 6,
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
				children: Xc(i, t.task ? 20 : 28)
			}),
			t.task && /* @__PURE__ */ b(Qc, {
				task: t.task,
				x: Ze - 6,
				y: 29
			})
		]
	});
}
function el() {
	return /* @__PURE__ */ x("ul", {
		"aria-label": "Node colors",
		className: "flex flex-wrap gap-3 text-xs text-muted",
		children: [qe.map((e) => /* @__PURE__ */ x("li", {
			className: "flex items-center gap-1",
			children: [/* @__PURE__ */ b("svg", {
				width: 10,
				height: 10,
				"aria-hidden": "true",
				children: /* @__PURE__ */ b("rect", {
					width: 10,
					height: 10,
					rx: 2,
					style: { fill: Jc[e.id] }
				})
			}), e.label]
		}, e.id)), /* @__PURE__ */ b("li", { children: "Solid arrow: waiting · faded arrow: met · dashed arrow: sequence" })]
	});
}
function tl(e) {
	let { task: t } = e, n = jn(), { waitsOn: r, blocks: i } = e.neighbors, a = nt(t);
	return /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
		"aria-label": "Task details",
		role: "region",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(m, { children: t.title }),
					/* @__PURE__ */ b(Q, {
						tooltip: "Open this task's details in the drawer",
						onClick: () => n.openTask(t.id),
						children: "All details"
					}),
					/* @__PURE__ */ b(Q, {
						tooltip: "Add a draft task that waits on this one",
						onClick: () => n.addTask({ prerequisite: t.id }),
						children: "Add a task after this"
					})
				]
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-1 flex flex-wrap items-center gap-1.5 text-sm",
				children: [
					/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: t.id
					}),
					/* @__PURE__ */ b(J, { children: t.kind }),
					/* @__PURE__ */ b(Ii, { owner: t }),
					/* @__PURE__ */ b(J, {
						variant: t.complete ? "success" : void 0,
						children: t.status ?? "no status"
					}),
					/* @__PURE__ */ b(J, {
						variant: a === "needs-you" ? "warning" : a === "ready" ? "info" : void 0,
						children: Yc[a]
					}),
					t.review && /* @__PURE__ */ b(J, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(J, { children: "Archived" }),
					t.handSetReview && /* @__PURE__ */ b(J, {
						variant: "warning",
						children: "set by hand"
					})
				]
			}),
			t.handSetReview && /* @__PURE__ */ x("p", {
				className: "mt-1 text-sm",
				"data-hand-set-review": !0,
				children: [
					nn(t.noSession),
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
function nl({ workspaceId: e, focus: n = null, drill: i = null, onDrill: a }) {
	let u = l(), d = o(() => Ut(u), [u]), f = jn(), [m, h] = Uc(e), { value: g, error: _, busy: v, reload: S } = Fi(e, t((e) => d.graph(e), [d])), C = o(() => g ? ht(Bn(g, m), i) : null, [
		g,
		m,
		i
	]), w = o(() => zn(g), [g]), [T, D] = c(null);
	r(() => D(null), [i]);
	let O = kr(), [k, A] = Nr("graph-selected", null), [j, M] = c(null), [N, P] = Nr("graph-view", {
		x: 0,
		y: 0,
		scale: 1
	}), [F] = c(() => O.memory.has("graph-stack")), I = s(null), L = s(null), ee = s(!1), R = o(() => [...new Set((C?.tasks ?? []).map((e) => e.epic ?? "(none)"))], [C]), z = o(() => T ?? new Set(!i && (C?.tasks.length ?? 0) > Kc ? R : []), [
		T,
		C,
		R,
		i
	]), [te, B] = c(1100), V = o(() => Xe(C?.tasks.length ?? 0, te), [C, te]), H = o(() => C ? pt(C, z, { spacing: V }) : null, [
		C,
		z,
		V
	]), ne = o(() => new Map(H?.nodes.map((e) => [e.id, e]) ?? []), [H]), U = C?.tasks.find((e) => e.id === k) ?? null, W = C ? Wt(C) : null, re = (e) => {
		if (!e) return "No epic";
		let t = g?.epics.find((t) => t.id === e)?.title;
		return t && t !== e ? t : at(e);
	}, [G, ie] = Nr("graph-stack", []), ae = s({
		drill: i,
		view: N,
		selected: k
	}), oe = s(!1), se = s(F ? N : null);
	r(() => {
		let e = ae.current;
		oe.current ? oe.current = !1 : e.drill !== i && ie((t) => Et(t, e, i)), ae.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [i]), r(() => {
		ae.current = {
			drill: i,
			view: N,
			selected: k
		};
	}, [N, k]);
	let ce = (e) => {
		ie((t) => St(t, {
			drill: i,
			view: N,
			selected: k
		}, m, e)), h(e);
	}, le = (e) => {
		let t = Dt(G, e);
		if (!t) return;
		let { entry: n } = t, r = G.slice(t.stack.length).find((e) => e.filter)?.filter;
		se.current = n.view, ie(t.stack), A(n.selected), r && h(r), n.drill === i ? P(n.view) : (oe.current = !0, a?.(n.drill));
	}, ue = s(le);
	ue.current = le, r(() => {
		let e = () => ue.current();
		return O.handlers.set("graph", e), () => {
			O.handlers.get("graph") === e && O.handlers.delete("graph");
		};
	}, [O]), r(() => {
		O.history.sync("graph", G.length, () => ({
			label: "Back in the Graph",
			back: () => O.handlers.get("graph")?.()
		}));
	}, [O, G.length]);
	let de = (e) => a?.({
		kind: "epic",
		id: e,
		title: re(e)
	}), fe = t(() => {
		H && I.current && (se.current ? (P(se.current), se.current = null) : P(bt(H, I.current.clientWidth || 800, qc)));
	}, [H]);
	r(fe, [fe]), r(() => {
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
			P((e) => yt(e, r, t.clientX - n.left, t.clientY - n.top));
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [H]);
	let pe = (e) => {
		let t = I.current?.clientWidth || 800;
		P((n) => yt(n, e, t / 2, qc / 2));
	}, me = (e) => {
		let t = new Set(z);
		t.has(e) ? t.delete(e) : t.add(e), D(t);
	}, he = (e) => {
		let t = mt(e, ee.current);
		if (t === "drill") return de(e.epic);
		if (t === "open") {
			if (e.task?.kind === "epic" && g?.tasks.some((t) => t.epic === e.id)) return de(e.id);
			A(e.id), f.openTask(e.id);
		}
	}, K = (e) => {
		let t = C?.tasks.find((t) => t.id === e);
		t && z.has(t.epic ?? "(none)") && me(t.epic ?? "(none)"), A(e);
	}, ge = s(null);
	r(() => {
		C && n && ge.current !== n && (ge.current = n, K(n));
	}, [C, n]);
	let _e = (e) => {
		e.button === 0 && (L.current = {
			x: e.clientX,
			y: e.clientY,
			view: N,
			moved: !1
		}, ee.current = !1);
	}, ve = (e) => {
		let t = L.current;
		if (!t) return;
		let n = e.clientX - t.x, r = e.clientY - t.y;
		!t.moved && Math.hypot(n, r) < 4 || (t.moved || e.currentTarget.setPointerCapture(e.pointerId), t.moved = ee.current = !0, P({
			...t.view,
			x: t.view.x + n,
			y: t.view.y + r
		}));
	}, ye = () => {
		L.current = null;
	}, be = (e, t) => k !== null && (e === k || t === k), xe = j ?? k, Ce = o(() => {
		if (!H || !xe || !ne.has(xe)) return null;
		let { up: e, down: t } = _t(H.edges, xe);
		return {
			up: /* @__PURE__ */ new Set([...e, xe]),
			down: /* @__PURE__ */ new Set([...t, xe])
		};
	}, [
		H,
		xe,
		ne
	]), Te = (e) => !Ce || Ce.up.has(e) || Ce.down.has(e), Ee = (e, t) => !Ce || Ce.up.has(e) && Ce.up.has(t) || Ce.down.has(e) && Ce.down.has(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-graph-title",
		className: "flex flex-col gap-3.5",
		"data-graph-view": !0,
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-3",
				children: /* @__PURE__ */ b(Jr, {
					id: "avoozl-graph-title",
					view: "graph",
					children: "Graph"
				})
			}),
			_ && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: _
			}),
			e ? /* @__PURE__ */ x(Gc, {
				id: "avoozl-graph",
				filter: m,
				choices: w,
				onChange: ce,
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ b(X, {
						icon: we,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}), /* @__PURE__ */ b(X, {
						icon: Se,
						tooltip: "Add a draft task. It waits for your review.",
						onClick: () => f.addTask(),
						children: "Add task"
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
			H && H.nodes.length > 0 && /* @__PURE__ */ x(p, { children: [
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						G.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(X, {
							icon: E,
							tooltip: Tt(G) ?? void 0,
							onClick: () => le(),
							"aria-label": Tt(G) ?? "Back",
							children: "Back"
						}), /* @__PURE__ */ x("nav", {
							"aria-label": "Graph drill-in",
							className: "flex flex-wrap items-center gap-1 text-sm",
							"data-graph-crumbs": !0,
							children: [Ct(G, i).map(({ at: e, label: t }) => /* @__PURE__ */ x("span", {
								className: "inline-flex items-center gap-1",
								children: [/* @__PURE__ */ b("button", {
									type: "button",
									className: "truncate underline",
									style: { maxWidth: "14rem" },
									onClick: () => le(e),
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
								children: wt(i)
							})]
						})] }),
						/* @__PURE__ */ b(Q, {
							tooltip: "Fold each epic into one box",
							onClick: () => D(new Set(R)),
							children: "Collapse all"
						}),
						/* @__PURE__ */ b(Q, {
							tooltip: "Show every task inside each epic",
							onClick: () => D(/* @__PURE__ */ new Set()),
							children: "Expand all"
						}),
						/* @__PURE__ */ b("span", { className: "grow" }),
						/* @__PURE__ */ b(Q, {
							tooltip: "Zoom out",
							onClick: () => pe(1 / 1.25),
							"aria-label": "Zoom out",
							children: "−"
						}),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"aria-live": "polite",
							children: [Math.round(N.scale * 100), "%"]
						}),
						/* @__PURE__ */ b(Q, {
							tooltip: "Zoom in",
							onClick: () => pe(1.25),
							"aria-label": "Zoom in",
							children: "+"
						}),
						/* @__PURE__ */ b(Q, {
							tooltip: "Fit the whole graph in view",
							onClick: fe,
							children: "Fit"
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					className: "mt-2",
					children: /* @__PURE__ */ b(el, {})
				}),
				/* @__PURE__ */ b("div", {
					ref: I,
					className: "mt-2 overflow-hidden rounded border",
					style: {
						borderColor: "var(--border)",
						height: qc,
						touchAction: "none"
					},
					children: /* @__PURE__ */ x("svg", {
						role: "group",
						"aria-label": "Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom.",
						width: "100%",
						height: qc,
						onPointerDown: _e,
						onPointerMove: ve,
						onPointerUp: ye,
						onPointerCancel: ye,
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
									let n = it(e.epic);
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
											onClick: () => !ee.current && de(e.epic),
											onKeyDown: (t) => Zc(t, () => de(e.epic)),
											style: {
												fill: "var(--muted)",
												cursor: "pointer"
											},
											children: [Xc(e.title, 30), " ›"]
										})]
									}, `${n}:${t}`);
								}),
								H.loose.map((e) => {
									let t = it(e.epic);
									return /* @__PURE__ */ b("text", {
										x: e.x,
										y: e.y + 11,
										fontSize: 10,
										role: "button",
										tabIndex: 0,
										"aria-label": `Epic ${e.title}: ${e.count} with no dependencies. Press to show only this epic.`,
										onClick: () => !ee.current && de(e.epic),
										onKeyDown: (t) => Zc(t, () => de(e.epic)),
										style: {
											fill: "var(--muted)",
											cursor: "pointer"
										},
										children: Xc(`${e.title} · ${e.count} with no dependencies`, e.chars)
									}, `loose:${t}`);
								}),
								H.edges.map((e) => {
									let t = Ce !== null && Ee(e.from, e.to), n = Ce !== null && !t, r = be(e.from, e.to);
									return /* @__PURE__ */ b("path", {
										d: gt(e.points),
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
								H.nodes.map((e) => /* @__PURE__ */ b($c, {
									node: e,
									selected: e.id === k,
									dim: !Te(e.id),
									onSelect: he,
									onHover: M
								}, e.id))
							]
						})]
					})
				})
			] }),
			C && U && /* @__PURE__ */ b(tl, {
				task: U,
				neighbors: vt(C, U.id),
				onSelect: K
			})
		]
	});
}
// kirocrew-app/ui/src/DeliveryView.tsx
function rl(e) {
	let { card: t, busy: n, act: r, client: i, workspaceId: a } = e, o = jn(), s = t.authority === "local", c = Gt(t.issue?.url ?? null), l = t.item?.complete ?? !1;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
		className: "p-1",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-start gap-2",
				children: [e.phase && /* @__PURE__ */ b(il, { phase: e.phase }), /* @__PURE__ */ b("button", {
					type: "button",
					className: "text-left text-base font-semibold leading-snug hover:underline",
					onClick: () => o.openTask(t.id),
					children: t.title
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted",
				children: [
					/* @__PURE__ */ b("span", { children: t.id }),
					t.epic && /* @__PURE__ */ b(J, { children: t.epic }),
					/* @__PURE__ */ b(Ii, { owner: {
						authority: t.authority,
						issue: t.issue
					} }),
					t.attempt !== null && /* @__PURE__ */ x(J, { children: ["attempt ", t.attempt] }),
					t.reviewRounds > 0 && /* @__PURE__ */ x(J, { children: [t.reviewRounds, " review rounds"] }),
					t.deliveryState && /* @__PURE__ */ b(J, {
						variant: t.deliveryState === "decision" ? "warning" : void 0,
						children: t.deliveryState
					}),
					t.deferred && /* @__PURE__ */ b(J, { children: "deferred" }),
					t.review && /* @__PURE__ */ b(J, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(J, { children: "Archived" })
				]
			}),
			t.item && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(fs, {
					item: t.item,
					compact: !0,
					onInfo: () => o.openTask(t.id)
				})
			}),
			t.handSetReview && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(ps, {
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
					children: Kt(e)
				}) : Kt(e) }, e.slot))
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [
					e.ready && cr(t) && /* @__PURE__ */ b(X, {
						icon: xe,
						disabled: n,
						tooltip: "Starts this task first on the next tick, within the limit.",
						onClick: () => e.onStart(t.id),
						children: "Start now"
					}),
					t.deliveryState === "decision" && /* @__PURE__ */ b(X, {
						icon: Te,
						disabled: n,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => r(() => i.retry(a, t.id)),
						children: "Retry"
					}),
					!l && s && e.canDefer && !t.deferred && /* @__PURE__ */ b(X, {
						icon: ye,
						disabled: n,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: "deferred" }, e.revision)),
						children: "Defer"
					}),
					!l && s && t.deferred && e.resume && /* @__PURE__ */ b(X, {
						icon: xe,
						disabled: n,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: e.resume }, e.revision)),
						children: "Resume"
					}),
					!l && !s && c && /* @__PURE__ */ b(q, {
						text: "Open the issue; move its Project card to Deferred to pause it",
						children: /* @__PURE__ */ b("a", {
							href: c,
							target: "_blank",
							rel: "noreferrer",
							className: "self-center text-xs underline",
							children: "Defer on the board"
						})
					}),
					/* @__PURE__ */ b(X, {
						icon: lr,
						tooltip: "Open this task's details in the drawer",
						onClick: () => o.openTask(t.id),
						children: "Details"
					})
				]
			})
		]
	}) }) });
}
function il({ phase: e }) {
	let t = fc("(prefers-reduced-motion: reduce)"), n = e === "running" ? "Running: a worker is coding" : "Reviewing: a reviewer or checks chat is reading";
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
var al = 16;
function ol() {
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
function sl(e) {
	let { lanes: t, narrow: n } = e, { ref: r, width: i } = ol(), a = e.only === "done" ? [ar] : Kn.filter((t) => !e.only || t.id === e.only), o = or(i, a.length, al), [s, l] = c(/* @__PURE__ */ new Set(["waiting"])), u = Kr(e.reset ?? ""), d = o === 1, f = (t, n, r) => /* @__PURE__ */ x("ul", {
		className: "flex flex-col gap-3",
		children: [u.take(t, n).map((t) => e.card(t, r)), u.more(t, n.length).left > 0 && /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(qr, { ...u.more(t, n.length) }) })]
	});
	return /* @__PURE__ */ b("div", {
		ref: r,
		"data-lane-columns": o,
		style: {
			display: "grid",
			gap: al,
			gridTemplateColumns: `repeat(${o}, minmax(0, 1fr))`,
			alignItems: "start"
		},
		children: a.map((e) => {
			let r = Jn(t, e.id), i = (d || n) && s.has(e.id);
			return /* @__PURE__ */ x("section", {
				"aria-label": `${e.label}: ${r.length}`,
				className: "flex min-w-0 flex-col gap-3 rounded-lg border p-3",
				style: {
					background: Xn(e.tint),
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
						/* @__PURE__ */ b(J, {
							variant: e.id === "needs-you" && r.length ? "warning" : void 0,
							children: r.length
						})
					]
				}), !i && (r.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "None"
				}) : e.id === "in-progress" ? Yn(t).map((t) => /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					role: "group",
					"aria-label": `${t.label}: ${t.cards.length}`,
					children: [/* @__PURE__ */ x("h4", {
						className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted",
						children: [
							t.label,
							" ",
							/* @__PURE__ */ b(J, { children: t.cards.length })
						]
					}), f(`${e.id}:${t.id}`, t.cards, t.id)]
				}, t.id)) : f(e.id, r))]
			}, e.id);
		})
	});
}
function cl() {
	return fc("(max-width: 767px)");
}
function ll({ workspaceId: e }) {
	let n = l(), r = o(() => Ut(n), [n]), i = o(() => fr(n), [n]), { value: a, error: s, busy: u, reload: d } = Fi(e, t(async (e) => {
		let [t, n] = await Promise.all([r.deliveryPage(e), r.graph(e).catch(() => null)]);
		return {
			items: t.items,
			graph: n,
			reports: t.contentReports ?? []
		};
	}, [r])), f = cl(), [h, g] = Uc(e), [_, v] = c(!1), [S, C] = c(!1), [w, T] = c(null), E = (e) => {
		C(!0), T(null), (async () => {
			try {
				await e(), await d();
			} catch (e) {
				T({
					ok: !1,
					text: Y(e)
				});
			} finally {
				C(!1);
			}
		})();
	}, D = (t) => {
		e && (C(!0), T(null), i.start(e, t).then((e) => T({
			ok: !e.full,
			text: e.message
		})).catch((e) => T({
			ok: !1,
			text: Y(e)
		})).finally(() => C(!1)));
	}, O = t(async (t, n) => {
		e && (await r.supersede(e, t, n), await d());
	}, [
		r,
		e,
		d
	]), k = a ? tr(a.graph, a.items) : null, A = k ? ir(k, h) : null, j = o(() => zn(a?.graph ?? null), [a]), M = A ? new Set(Object.values(A).flat().map((e) => e.id)) : null, N = (a?.reports ?? []).filter((e) => !M || !e.taskId || M.has(e.taskId)), P = a?.items.filter((e) => e.status === "superseded") ?? [], F = !!a?.graph?.statuses.some((e) => e.id === "deferred"), I = nr(a?.graph ?? null), L = a?.graph?.revision ?? 0;
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-delivery-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [
					/* @__PURE__ */ b(Jr, {
						id: "avoozl-delivery-title",
						view: "delivery",
						children: "Delivery"
					}),
					e && /* @__PURE__ */ b(X, {
						icon: we,
						onClick: () => void d(),
						disabled: u || S,
						children: "Refresh"
					}),
					/* @__PURE__ */ b("span", {
						role: "status",
						className: "text-xs text-muted",
						children: S ? "Working…" : ""
					})
				]
			}),
			(s || w) && /* @__PURE__ */ b("p", {
				role: s || !w?.ok ? "alert" : "status",
				className: `text-sm ${s || !w?.ok ? "text-danger" : "text-muted"}`,
				children: s ?? w?.text
			}),
			e ? A ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Gc, {
					id: "avoozl-delivery",
					filter: h,
					choices: j,
					onChange: g
				}),
				/* @__PURE__ */ b(sl, {
					lanes: A,
					only: sr(h.state),
					narrow: f,
					reset: JSON.stringify(h),
					card: (t, n) => /* @__PURE__ */ b(rl, {
						card: t,
						phase: n,
						ready: A.ready.includes(t),
						canDefer: F,
						resume: I,
						busy: S,
						act: E,
						client: r,
						workspaceId: e,
						revision: L,
						onSupersede: O,
						onStart: D,
						graph: a?.graph ?? null
					}, t.id)
				}),
				N.length > 0 && /* @__PURE__ */ b(ul, { reports: N }),
				P.length > 0 && /* @__PURE__ */ x("label", {
					className: "flex items-center gap-1 text-sm",
					children: [
						/* @__PURE__ */ b("input", {
							type: "checkbox",
							checked: _,
							onChange: (e) => v(e.target.checked)
						}),
						"Show superseded (",
						P.length,
						")"
					]
				}),
				_ && /* @__PURE__ */ b("ul", {
					className: "flex flex-col gap-2",
					children: P.map((e) => /* @__PURE__ */ b("li", { children: /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ x(m, { children: [
						e.title,
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-sm text-muted",
							children: e.id
						})
					] }), /* @__PURE__ */ b(ii, {
						item: e,
						onSupersede: O
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
function ul({ reports: e }) {
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "Content rule reports" }),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "A rule set whose action is report lets the content through and records the match here. Change the set to block once its rules are right."
		}),
		/* @__PURE__ */ b("ul", {
			className: "mt-2 flex flex-col gap-1 text-sm",
			children: e.map((e) => /* @__PURE__ */ x("li", {
				className: "flex flex-wrap items-center gap-1.5",
				children: [
					/* @__PURE__ */ b(J, { children: e.set }),
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
function dl(e) {
	let t = (t, n) => e.post(At, {
		operation: "untriaged.view",
		input: n,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, {}),
		refresh: (e) => t(e, { refresh: !0 }),
		start: (t, n, r) => e.post(At, {
			operation: r === "deliver" ? "intake.deliver" : "intake.plan",
			input: {
				source: n.source,
				id: n.id
			},
			workspaceId: t
		}).then((e) => e.result),
		review: (t, n) => e.post(At, {
			operation: "review.chat",
			input: {
				repository: n.repository,
				number: n.number
			},
			workspaceId: t
		}).then((e) => e.result)
	};
}
function fl(e) {
	let t = (t, n, r) => e.post(At, {
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
function pl(e) {
	if (!e.length) return {
		ok: !1,
		reason: "Select issues to send them to an Issue Radar crew.",
		repository: null
	};
	if (e.some((e) => xl(e) !== "github")) return {
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
function ml(e) {
	return e.emptyScope ? "Empty scope: takes every open issue, labeled or not." : `Watches ${e.labels.join(", ")}. Avoozl adds ${e.labels[0]}.`;
}
function hl(e) {
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
var gl = (e) => (t, n) => e.post(At, {
	operation: "github.repository.labels",
	input: { repository: n },
	workspaceId: t
}).then((e) => e.result);
function _l(e, t) {
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
var vl = [
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
], yl = [
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
], bl = (e) => !!(e.source || e.repository || e.kind || e.age || e.author || e.label), xl = (e) => e.source ?? "github", Sl = 864e5;
function Cl(e, t, n = Date.now()) {
	if (t.source && xl(e) !== t.source || t.repository && e.repository !== t.repository || t.kind && e.kind !== t.kind || t.author && e.author !== t.author || t.label && !e.labels.includes(t.label)) return !1;
	if (t.age) {
		let r = e.createdAt ? Date.parse(e.createdAt) : NaN;
		return Number.isFinite(r) ? t.age === "older" ? n - r > 30 * Sl : n - r <= Number(t.age) * Sl : !1;
	}
	return !0;
}
function wl(e) {
	let t = (e) => [...new Set(e)].sort((e, t) => e.localeCompare(t)).map((e) => ({
		value: e,
		label: e
	})), n = e?.items ?? [];
	return {
		sources: t([...(e?.sources ?? []).map((e) => e.id), ...n.map(xl)]),
		repositories: t((e?.repositories ?? []).map((e) => e.repository)),
		authors: t(n.map((e) => e.author).filter((e) => !!e)),
		labels: t(n.flatMap((e) => e.labels))
	};
}
function Tl(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 60 ? `${r} min` : r < 1440 ? `${Math.round(r / 60)} h` : r < 525600 ? `${Math.round(r / 60 / 24)} d` : `${Math.round(r / 60 / 24 / 365)} y`;
}
var El = (e) => xl(e) === "github" ? `${e.repository}#${e.number}` : `${e.source}:${e.id}`, Dl = (e) => xl(e) === "github" ? `${e.repository} #${e.number}` : `${e.source} ${e.id}`;
function Ol(e) {
	try {
		return new URL(e.links?.github || (xl(e) === "github" ? e.url : "") || "").origin;
	} catch {
		return "https://github.com";
	}
}
var kl = (e) => `${Ol(e)}/${e.repository.split("/").map(encodeURIComponent).join("/")}`, Al = (e) => e.author ? `${Ol(e)}/${encodeURIComponent(e.author)}` : null;
function jl(e, t, n) {
	let r = new Set(e);
	for (let e of t) n ? r.add(e) : r.delete(e);
	return r;
}
function Ml(e) {
	let t = e.filter((e) => xl(e) === "github" && e.links.issueRadar);
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
function Nl(e) {
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
var Pl = "avoozl:untriaged-filter:", Fl = {
	event: "avoozl:untriaged-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Pl + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Pl + t, JSON.stringify(n));
		} catch {}
	}
}, Il = [
	["Pick a crew", "A crew works the open issues that carry a label it watches. Avoozl adds that label."],
	["Check the label", "Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label."],
	["Sent", "A crew picks an issue on its own next turn. Follow it under With Issue Radar."]
], Ll = { color: "var(--danger)" };
function Rl(e) {
	let { workspaceId: n, client: i, items: a, repository: o } = e, [l, u] = c(0), [d, p] = c(null), [m, h] = c(""), [_, v] = c(""), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = s(null), j = t(() => e.onClose(l === 2 ? void 0 : "Cancelled. Nothing was written."), [e, l]);
	r(() => {
		let e = !0;
		return i.crews(n, o).then((t) => {
			e && (p(t), t.crews.length && h(t.crews[0].id));
		}).catch((t) => e && O(Y(t))), () => {
			e = !1;
		};
	}, [
		i,
		n,
		o
	]), r(() => {
		k.current?.querySelector("input, button")?.focus();
	}, [l, d]), Mr("modal", !0, "Cancel", j);
	let M = d?.crews.find((e) => e.id === m) ?? null, P = () => ({
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
			O(Y(e));
		} finally {
			E(!1);
		}
	}, I = () => F(async () => {
		S(await i.preview(n, P())), u(1);
	}), L = () => F(async () => {
		w(await i.send(n, P())), u(2), e.onSent();
	}), ee = d ? d.available ? !!M : !!_.trim() : !1;
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
			onClick: l === 2 ? () => e.onClose() : j,
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
					children: Il.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: [/* @__PURE__ */ b(Ce, {
						size: 14,
						"aria-hidden": "true"
					}), Il[l][0]]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-radar-line",
					className: "text-sm text-muted",
					children: Il[l][1]
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
											e.status && /* @__PURE__ */ b(J, { children: e.status }),
											e.labels.map((e) => /* @__PURE__ */ b(J, {
												variant: "info",
												children: e
											}, e))
										]
									}), /* @__PURE__ */ b("span", {
										className: "text-xs text-muted",
										children: ml(e)
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
							style: Ll,
							"data-radar-empty-scope": !0,
							children: [
								/* @__PURE__ */ b(N, {
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
							style: Ll,
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
						children: [e.ok ? /* @__PURE__ */ b(A, {
							size: 14,
							"aria-hidden": "true",
							style: {
								color: "var(--ok)",
								marginTop: 3
							}
						}) : /* @__PURE__ */ b(Ne, {
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
						l < 2 && /* @__PURE__ */ b(f, {
							type: "button",
							onClick: j,
							children: "Cancel"
						}),
						l === 1 && /* @__PURE__ */ b(f, {
							type: "button",
							onClick: () => u(0),
							disabled: T,
							children: "Back"
						}),
						l === 0 && /* @__PURE__ */ b(f, {
							type: "button",
							"data-radar-review": !0,
							onClick: () => void I(),
							disabled: T || !ee,
							children: T ? "Checking…" : "Review"
						}),
						l === 1 && /* @__PURE__ */ b(f, {
							type: "button",
							"data-radar-send": !0,
							onClick: () => void L(),
							disabled: T,
							children: T ? "Sending…" : y?.label ? "Add label" : "Send"
						}),
						l === 2 && /* @__PURE__ */ b(f, {
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
var zl = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, Bl = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
}, Vl = {
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
function Hl(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(q, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x("a", {
			href: e.href,
			"aria-label": e.label,
			"aria-describedby": n,
			...e.external ? {
				target: "_blank",
				rel: "noopener noreferrer"
			} : { target: "_top" },
			style: Vl,
			className: "text-sm",
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function Ul({ item: e }) {
	let t = e.kind === "issue" ? F : e.kind === "ticket" ? H : e.kind === "review" ? Ee : e.draft ? ae : ie, n = e.kind === "issue" ? "Issue" : e.kind === "ticket" ? "Ticket" : e.kind === "review" ? "Review request" : e.draft ? "Draft pull request" : "Pull request";
	return /* @__PURE__ */ b(q, {
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
var Wl = {
	passing: "Checks pass",
	failing: "Checks fail",
	pending: "Checks running"
};
function Gl({ item: e }) {
	if (e.kind !== "pr") return null;
	let t = e.checks;
	return /* @__PURE__ */ x("span", {
		className: "inline-flex flex-wrap items-center gap-1.5 text-xs",
		children: [e.draft && /* @__PURE__ */ b(J, { children: "draft" }), t && /* @__PURE__ */ x("span", {
			className: "inline-flex items-center gap-1",
			style: { color: t === "passing" ? "var(--ok)" : t === "failing" ? "var(--danger)" : "var(--muted)" },
			children: [t === "passing" ? /* @__PURE__ */ b(A, {
				size: 12,
				"aria-hidden": "true"
			}) : t === "failing" ? /* @__PURE__ */ b(Ne, {
				size: 12,
				"aria-hidden": "true"
			}) : null, Wl[t]]
		})]
	});
}
function Kl({ labels: e }) {
	return e.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: e.map((e) => /* @__PURE__ */ b(J, { children: e }, e))
	}) : null;
}
function ql({ item: e, onSend: t, onReview: n, onStart: r }) {
	let i = Dl(e);
	return xl(e) === "github" ? /* @__PURE__ */ x("span", {
		className: "inline-flex gap-1.5",
		children: [
			t && (e.kind === "issue" ? /* @__PURE__ */ b(Z, {
				icon: je,
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
			e.links.issueRadar && /* @__PURE__ */ b(Hl, {
				icon: Ce,
				label: `Open ${i} in Issue Radar`,
				tooltip: e.links.issueRadar.tooltip,
				href: e.links.issueRadar.url
			}),
			e.links.review && n && /* @__PURE__ */ b(Z, {
				icon: Ee,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				onClick: () => n(e)
			}),
			e.reviewChat?.link ? /* @__PURE__ */ b(q, {
				text: "Open this pull request's code review chat",
				children: /* @__PURE__ */ b("a", {
					href: e.reviewChat.link,
					target: "_top",
					className: "self-center text-sm underline",
					"aria-label": `Attach to the code review chat for ${i}`,
					"data-review-attach": !0,
					children: "Attach"
				})
			}) : e.reviewChat?.state === "queued" ? /* @__PURE__ */ b(q, {
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
			e.links.review && /* @__PURE__ */ b(Hl, {
				icon: Ee,
				label: `Code review for ${i}`,
				tooltip: e.links.review.tooltip,
				href: e.links.review.url
			}),
			r && e.start?.plan && /* @__PURE__ */ b(Z, {
				icon: H,
				label: `Plan this: ${i}`,
				tooltip: "Plan this: a planner turns it into a task in the Inbox.",
				onClick: () => r(e, "plan")
			}),
			r && e.start?.deliver && /* @__PURE__ */ b(Z, {
				icon: xe,
				label: `Deliver this: ${i}`,
				tooltip: "Deliver this: one task in its repository, pinned to this text.",
				onClick: () => r(e, "deliver")
			})
		]
	});
}
function Jl({ item: e }) {
	return /* @__PURE__ */ b("a", {
		href: kl(e),
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-repository-link": !0,
		children: e.repository
	});
}
function Yl({ item: e, fallback: t = "" }) {
	let n = xl(e) === "github" ? Al(e) : null;
	return n ? /* @__PURE__ */ b("a", {
		href: n,
		target: "_blank",
		rel: "noopener noreferrer",
		className: "underline",
		"data-author-link": !0,
		children: e.author
	}) : /* @__PURE__ */ b(y, { children: e.author ?? t });
}
function Xl({ item: e }) {
	let t = xl(e) === "github";
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
function Zl(e) {
	return /* @__PURE__ */ b("input", {
		type: "checkbox",
		checked: e.checked,
		"aria-label": `Select ${Dl(e.item)}`,
		onChange: (t) => e.onChange(t.target.checked)
	});
}
function Ql(e) {
	let t = e.items.map(El), n = t.length > 0 && t.every((t) => e.selected.has(t));
	return /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-untriaged-table": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...zl,
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
						...zl,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Source"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Author"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Age"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Labels"
				}),
				/* @__PURE__ */ b("th", {
					style: {
						...zl,
						textAlign: "right"
					},
					children: /* @__PURE__ */ b(q, {
						text: "Comments",
						children: /* @__PURE__ */ b("span", {
							role: "img",
							"aria-label": "Comments",
							style: { display: "inline-flex" },
							children: /* @__PURE__ */ b(he, {
								size: 12,
								"aria-hidden": "true"
							})
						})
					})
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.items.map((t) => /* @__PURE__ */ x("tr", {
				"data-untriaged-row": El(t),
				children: [
					/* @__PURE__ */ b("td", {
						style: Bl,
						children: /* @__PURE__ */ b(Zl, {
							item: t,
							checked: e.selected.has(El(t)),
							onChange: (n) => e.onSelect([El(t)], n)
						})
					}),
					/* @__PURE__ */ b("td", {
						style: Bl,
						children: /* @__PURE__ */ b(Ul, { item: t })
					}),
					/* @__PURE__ */ x("td", {
						style: {
							...Bl,
							minWidth: "16rem"
						},
						children: [/* @__PURE__ */ b(Xl, { item: t }), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(Gl, { item: t }) })]
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						"data-intake-source": !0,
						children: xl(t)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(Jl, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(Yl, { item: t })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(q, {
							text: t.createdAt ? `Opened ${t.createdAt.slice(0, 10)}` : null,
							children: /* @__PURE__ */ b("span", {
								className: "tabular-nums",
								children: Tl(t.createdAt, e.now)
							})
						})
					}),
					/* @__PURE__ */ b("td", {
						style: Bl,
						children: /* @__PURE__ */ b(Kl, { labels: t.labels })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							textAlign: "right"
						},
						className: "tabular-nums",
						children: xl(t) === "github" ? t.comments : ""
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ql, {
							item: t,
							onSend: e.onSend,
							onReview: e.onReview,
							onStart: e.onStart
						})
					})
				]
			}, El(t))) })]
		})
	});
}
function $l(e) {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-untriaged-stack": !0,
		children: e.items.map((t) => /* @__PURE__ */ x("li", {
			className: "flex items-start gap-2 border-t py-2 first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-untriaged-row": El(t),
			children: [
				/* @__PURE__ */ b(Zl, {
					item: t,
					checked: e.selected.has(El(t)),
					onChange: (n) => e.onSelect([El(t)], n)
				}),
				/* @__PURE__ */ b(Ul, { item: t }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(Xl, { item: t }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								xl(t),
								" · ",
								/* @__PURE__ */ b(Jl, { item: t }),
								" · ",
								/* @__PURE__ */ b(Yl, {
									item: t,
									fallback: "unknown"
								}),
								" · ",
								Tl(t.createdAt, e.now),
								xl(t) === "github" ? ` · ${t.comments} comment${t.comments === 1 ? "" : "s"}` : ""
							]
						}),
						/* @__PURE__ */ b(Gl, { item: t }),
						/* @__PURE__ */ b(Kl, { labels: t.labels })
					]
				}),
				/* @__PURE__ */ b(ql, {
					item: t,
					onSend: e.onSend,
					onReview: e.onReview,
					onStart: e.onStart
				})
			]
		}, El(t)))
	});
}
function eu({ list: e, now: t }) {
	let n = e.repositories.filter((e) => e.error || e.truncated), r = (e.sources ?? []).filter((e) => e.id !== "github"), i = e.repositories.map((e) => e.checkedAt).filter((e) => !!e).sort();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-0.5 text-xs text-muted",
		"data-untriaged-checked": !0,
		children: [
			e.repositories.length > 0 && /* @__PURE__ */ x("span", { children: [i.length ? `Checked ${Dn(i[0], t)}` : "Not checked yet", " · GitHub is read at most every 10 minutes."] }),
			r.map((e) => /* @__PURE__ */ x("span", {
				className: e.error ? "text-danger" : void 0,
				"data-intake-source-state": e.id,
				children: [
					e.id,
					": ",
					e.error ?? (e.via === "mcp" ? "Items arrive through MCP." : e.checkedAt ? `Read ${Dn(e.checkedAt, t)}${e.more ? ", more on the next tick" : ""}.` : "Read on the next tick."),
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
function tu({ items: e, now: t, narrow: n }) {
	let r = (e) => e.handoff ? `Sent${e.handoff.crew ? ` to ${e.handoff.crew.name}` : ""}${e.handoff.label ? ` with ${e.handoff.label}` : ""}${e.handoff.at ? ` ${Dn(e.handoff.at, t)}` : ""}` : "A crew found it on its own", i = ({ item: e }) => {
		let t = hl(e);
		return /* @__PURE__ */ b(J, {
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
			"data-radar-row": El(e),
			children: [
				/* @__PURE__ */ b(Ul, { item: e }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(Xl, { item: e }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								/* @__PURE__ */ b(Jl, { item: e }),
								" · ",
								r(e)
							]
						}),
						/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(i, { item: e }) })
					]
				}),
				/* @__PURE__ */ b(ql, { item: e })
			]
		}, El(e)))
	}) : /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-radar-list": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...zl,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "State"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: "How it got there"
				}),
				/* @__PURE__ */ b("th", {
					style: zl,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.map((e) => /* @__PURE__ */ x("tr", {
				"data-radar-row": El(e),
				children: [
					/* @__PURE__ */ b("td", {
						style: Bl,
						children: /* @__PURE__ */ b(Ul, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							minWidth: "16rem"
						},
						children: /* @__PURE__ */ b(Xl, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(Jl, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(i, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: Bl,
						className: "text-muted",
						children: r(e)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...Bl,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ql, { item: e })
					})
				]
			}, El(e))) })]
		})
	});
}
function nu({ workspaceId: e }) {
	let n = l(), r = zr(), i = o(() => dl(n), [n]), a = o(() => fl(n), [n]), [s, u] = Pr("untriaged-show", "inner", (e) => e === "radar" ? "Back to With Issue Radar" : "Back to Untriaged", "untriaged"), [d, f] = c(null), [p, m] = c(null), { value: g, error: _, busy: S } = Fi(e, t((e) => i.view(e), [i])), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), [k, A] = Wi(e, Fl), [j, M] = c(() => /* @__PURE__ */ new Set()), N = fc("(max-width: 767px)"), P = Date.now(), F = C ?? g, I = o(() => wl(F), [F]), L = o(() => (F?.items ?? []).filter((e) => Cl(e, k, P)), [
		F,
		k,
		P
	]), ee = Kr(JSON.stringify(k)), R = L.filter((e) => j.has(El(e))), z = Ml(R), te = pl(R), B = F?.withRadar ?? [], V = async () => {
		if (e) try {
			w(await i.view(e)), M(/* @__PURE__ */ new Set());
		} catch (e) {
			O(Y(e));
		}
	}, H = async (t) => {
		if (e) {
			O(null);
			try {
				let n = await i.review(e, t);
				m(n.state === "open" ? `${t.repository} #${t.number} already has a code review chat. Use Attach.` : `Code review chat for ${t.repository} #${t.number} starts on the next tick${n.skill ? "" : ". The sage-review skill is not installed, so it reviews without it"}.`), await V();
			} catch (e) {
				O(Y(e));
			}
		}
	}, ne = async (t, n) => {
		if (!e) return;
		let a = Dl(t);
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
				O(Y(e));
			}
		}
	}, U = (e) => A({
		...k,
		...e
	}), W = (e, t) => M(jl(j, e, t)), re = async () => {
		if (e) {
			E(!0), O(null);
			try {
				w(await i.refresh(e));
			} catch (e) {
				O(Y(e));
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-untriaged-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(Jr, {
					id: "avoozl-untriaged-title",
					view: "untriaged",
					children: "Intake"
				}), /* @__PURE__ */ b(X, {
					icon: we,
					onClick: () => void re(),
					disabled: S || T || !F?.enabled,
					tooltip: "Read GitHub and poll each plugin source now instead of waiting for the next check",
					children: T ? "Checking…" : "Check now"
				})]
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
					icon: /* @__PURE__ */ b(Ce, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "Nothing with Issue Radar",
					subtitle: "Select issues under Untriaged and press Send to Issue Radar."
				}) : /* @__PURE__ */ b(tu, {
					items: B,
					now: P,
					narrow: N
				})]
			}) : F.items.length === 0 ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(eu, {
				list: F,
				now: P
			}), /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(ce, {
					size: 36,
					"aria-hidden": "true"
				}),
				...Nl(F)
			})] }) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(Hi, {
					id: "avoozl-untriaged",
					label: "Filter untriaged items",
					active: bl(k),
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
							options: yl,
							onChange: (e) => U({ kind: e || void 0 })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: k.age ?? "",
							options: vl,
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
								}), /* @__PURE__ */ b(eu, {
									list: F,
									now: P
								})]
							}),
							/* @__PURE__ */ b(q, {
								text: z.tooltip,
								children: (e) => /* @__PURE__ */ x("a", {
									href: R.length ? z.url : void 0,
									target: "_top",
									role: "button",
									"aria-disabled": !R.length || void 0,
									"aria-describedby": e,
									tabIndex: 0,
									style: {
										...Vl,
										opacity: R.length ? 1 : .5,
										cursor: R.length ? "pointer" : "default"
									},
									className: "text-sm",
									"data-bulk-open": !0,
									children: [/* @__PURE__ */ b(Ce, {
										size: 14,
										"aria-hidden": "true"
									}), "Open selected in Issue Radar"]
								})
							}),
							/* @__PURE__ */ b(X, {
								icon: je,
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
				}) : b(N ? $l : Ql, {
					items: ee.take("untriaged", L),
					selected: j,
					now: P,
					onSelect: W,
					onSend: (e) => f([e]),
					onReview: (e) => void H(e),
					onStart: (e, t) => void ne(e, t)
				}),
				/* @__PURE__ */ b(qr, { ...ee.more("untriaged", L.length) })
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Intake needs a GitHub mode or an intake source. Choose a mode in Settings › GitHub, or add a source in Settings › Plugins."
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: S ? "Loading…" : "Not loaded"
			}),
			d && e && /* @__PURE__ */ b(Rl, {
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
function ru(e) {
	let t = async (t, n, r) => (await e.post(At, {
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
function iu(e) {
	let t = mu(e.project);
	return {
		mode: $(e.mode) || "plans-repo",
		planningRepository: $(e.planningRepository),
		repositories: Object.keys(mu(e.repositories)).join(", "),
		projectOwner: $(t.owner),
		projectNumber: $(t.number),
		projectTitle: "",
		releases: "",
		iteration: !!mu(t.fields).iteration,
		tableByWave: !1,
		epic: !0
	};
}
function au(e) {
	let t = /^\d+$/.test(e.projectNumber.trim()) ? Number(e.projectNumber.trim()) : void 0, n = wu({
		owner: vu(e.projectOwner),
		number: t,
		title: t === void 0 ? vu(e.projectTitle) : void 0
	});
	return wu({
		mode: e.mode,
		planningRepository: e.mode === "plans-repo" ? vu(e.planningRepository) : void 0,
		repositories: _u(e.repositories),
		project: Object.keys(n).length ? n : void 0,
		releases: _u(e.releases),
		iteration: e.iteration,
		tableByWave: e.tableByWave,
		epic: e.epic
	});
}
var ou = (e) => /[\s,"]/.test(e) ? `"${e}"` : e;
function su(e) {
	let t = (e) => Array.isArray(e) ? e.filter((e) => typeof e == "string" && e.trim() !== "").map((e) => e.trim()) : [], n = t(e.labelsAll), r = t(e.labelsAny), i = t(e.labelsNone), a = typeof e.assignee == "string" ? e.assignee.trim() : "";
	return [
		...n.map((e) => `label:${ou(e)}`),
		...r.length ? [`label:${r.map(ou).join(",")}`] : [],
		...i.length ? [`-label:${i.map(ou).join(",")}`] : [],
		...a ? [`assignee:${a}`] : []
	].join(" ");
}
var cu = "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee.", lu = (e) => (t, n, r, i = !1) => e.post(At, {
	operation: "github.trigger.preview",
	input: {
		match: r,
		...n.trim() ? { repository: n.trim() } : {},
		...i ? { untriaged: !0 } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function uu(e) {
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
var du = () => ({
	filter: "",
	triageLabels: [],
	ignoreOlderThanDays: "",
	notify: !1
}), fu = (e) => e.map((e) => `-label:${ou(e)}`).join(" ");
function pu(e) {
	let t = wu({
		filter: vu(e.filter),
		triageLabels: e.triageLabels.length ? e.triageLabels : void 0,
		ignoreOlderThanDays: yu(e.ignoreOlderThanDays),
		notify: e.notify || void 0
	});
	return Object.keys(t).length ? t : void 0;
}
var mu = (e) => e && typeof e == "object" && !Array.isArray(e) ? e : {}, $ = (e) => typeof e == "string" ? e : typeof e == "number" ? String(e) : "", hu = (e) => Array.isArray(e) ? e.map($).join(", ") : "", gu = (e) => Object.fromEntries(Object.entries(mu(e)).map(([e, t]) => [e, $(t)]));
function _u(e) {
	let t = e.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
	return t.length ? t : void 0;
}
var vu = (e) => e.trim() ? e.trim() : void 0;
function yu(e) {
	let t = e.trim();
	if (t) return /^\d+$/.test(t) ? Number(t) : t;
}
var bu = /* @__PURE__ */ new Set([
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
function xu() {
	return {
		id: "",
		action: "deliver",
		match: "",
		author: "",
		autoPublishChildren: !1
	};
}
function Su(e = "") {
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
		untriaged: du(),
		rest: {}
	};
}
function Cu(e) {
	let t = mu(e.project);
	return {
		mode: $(e.mode),
		planningRepository: $(e.planningRepository),
		defaultAuthority: $(e.defaultAuthority),
		epicIssueType: $(e.epicIssueType),
		projectOwner: $(t.owner),
		projectNumber: $(t.number),
		fields: gu(t.fields),
		statusValues: gu(t.statusValues),
		repositories: Object.entries(mu(e.repositories)).map(([e, t]) => {
			let n = mu(t), r = n.pullRequestReviews;
			return {
				name: e,
				baseBranch: $(n.baseBranch),
				coder: $(n.coder),
				allowedActors: hu(n.allowedActors),
				minimumPermission: $(n.minimumPermission),
				requiredChecks: hu(n.requiredChecks),
				concurrency: $(n.concurrency),
				priority: hu(n.priority),
				pullRequestReviews: r != null,
				reviewApprovals: $(mu(r).approvals),
				managedLabels: gu(n.managedLabels),
				crewLabels: gu(n.crewLabels),
				rules: (Array.isArray(n.rules) ? n.rules : []).map((e) => {
					let t = mu(e);
					return {
						id: $(t.id),
						action: $(t.action),
						match: typeof t.match == "string" ? t.match : su(t),
						author: $(t.author),
						autoPublishChildren: t.autoPublishChildren === !0
					};
				}),
				untriaged: (() => {
					let e = mu(n.untriaged);
					return {
						filter: $(e.filter),
						triageLabels: Array.isArray(e.triageLabels) ? e.triageLabels.map($).filter(Boolean) : [],
						ignoreOlderThanDays: $(e.ignoreOlderThanDays),
						notify: e.notify === !0
					};
				})(),
				rest: Object.fromEntries(Object.entries(n).filter(([e]) => !bu.has(e)))
			};
		})
	};
}
function wu(e) {
	return Object.fromEntries(Object.entries(e).filter(([, e]) => e !== void 0));
}
function Tu(e) {
	let t = wu(Object.fromEntries(Object.entries(e).map(([e, t]) => [e, vu(t)])));
	return Object.keys(t).length ? t : void 0;
}
function Eu(e) {
	let t = Tu(e.fields), n = Tu(e.statusValues), r = !!(e.projectOwner.trim() || e.projectNumber.trim() || t || n);
	return {
		mode: vu(e.mode) ?? null,
		planningRepository: vu(e.planningRepository) ?? null,
		defaultAuthority: vu(e.defaultAuthority) ?? null,
		epicIssueType: vu(e.epicIssueType) ?? null,
		project: r ? wu({
			owner: vu(e.projectOwner),
			number: yu(e.projectNumber),
			fields: t,
			statusValues: n
		}) : null,
		repositories: e.repositories.length ? Object.fromEntries(e.repositories.map((e) => [e.name.trim(), wu({
			...e.rest,
			baseBranch: vu(e.baseBranch),
			coder: vu(e.coder),
			allowedActors: _u(e.allowedActors),
			minimumPermission: vu(e.minimumPermission),
			requiredChecks: _u(e.requiredChecks),
			concurrency: yu(e.concurrency),
			priority: _u(e.priority),
			pullRequestReviews: e.pullRequestReviews ? wu({ approvals: yu(e.reviewApprovals) }) : void 0,
			managedLabels: Tu(e.managedLabels),
			crewLabels: Tu(e.crewLabels),
			rules: e.rules.map((e) => wu({
				id: e.id.trim(),
				action: e.action,
				match: vu(e.match),
				author: vu(e.author),
				autoPublishChildren: e.autoPublishChildren || void 0
			})),
			untriaged: pu(e.untriaged)
		})])) : null
	};
}
var Du = {
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
}, Ou = {
	status: "Status",
	release: "Release",
	wave: "Wave",
	iteration: "",
	avoozlState: "",
	todo: "Ready",
	inProgress: "In progress",
	done: "Done",
	deferred: "Deferred"
}, ku = {
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
}, Au = {
	managed: "Managed issue",
	ready: "Ready to code",
	responding: "Responding",
	planning: "Planning",
	stale: "Stale claim",
	decision: "Needs a decision"
};
function ju(e) {
	if (e.mode === "plans-repo" && !e.planningRepository.trim()) return "Plans repository mode needs its planning repository (Where tasks live).";
	if (!zu(e.mode)) return null;
	let t = e.projectOwner.trim() || e.projectNumber.trim() || Object.values(e.fields).some((e) => e.trim()) || Object.values(e.statusValues).some((e) => e.trim());
	if (t && !e.projectOwner.trim()) return "The Project needs its owner (Where tasks live › Project fields).";
	if (t && !e.projectNumber.trim()) return "The Project needs its number (Where tasks live › Project fields).";
	for (let [t, n] of e.repositories.entries()) {
		let r = n.name.trim() || `Repository ${t + 1}`;
		if (!n.name.trim()) return `${r} needs its owner/name (Repositories › Mode and branch).`;
		if (zu(e.mode) && !n.baseBranch.trim()) return `${r} needs its default branch (Repositories › Mode and branch).`;
	}
	return null;
}
function Mu(e, t, n, r = Date.now()) {
	let i = t[e], a = [];
	return n && a.push("Required by GitHub branch rule"), i && a.push(i.at ? `${i.source} · last run ${Dn(i.at, r)}` : i.source), a.join(" · ") || "Not seen on recent commits or open pull requests";
}
function Nu(e, t, n = Date.now()) {
	let r = _u(e) ?? [], i = t?.sources ?? {}, a = new Set(t?.seen ?? []), o = new Set(t?.required ?? []);
	return [.../* @__PURE__ */ new Set([...t?.seen ?? [], ...r])].map((e) => ({
		name: e,
		checked: o.has(e) || r.includes(e),
		seen: a.has(e),
		branchRule: o.has(e),
		where: Mu(e, i, o.has(e), n)
	})).sort((e, t) => Number(t.branchRule) - Number(e.branchRule) || Number(t.seen) - Number(e.seen) || e.name.localeCompare(t.name));
}
function Pu(e, t, n) {
	let r = _u(e) ?? [];
	return (n ? [.../* @__PURE__ */ new Set([...r, t])] : r.filter((e) => e !== t)).join(", ");
}
var Fu = (e) => (t, n, r) => e.post(At, {
	operation: "github.repository.inspect",
	input: {
		repository: n,
		...r.trim() ? { baseBranch: r.trim() } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function Iu(e) {
	if (!e) return "Reading the branch rules…";
	if (e.error || !e.reviewRule) return e.reviewError ?? e.error ?? "The branch rules could not be read.";
	let t = e.reviewRule;
	return t.hidden ? `${t.hiddenReason ?? "GitHub hides the classic protection rule from this account."} The approval count is unknown${t.approvals ? `, at least ${t.approvals} from a ruleset` : ""}. GitHub still enforces it on merge. ${t.approvals ? `Avoozl waits for ${t.approvals} approval${t.approvals === 1 ? "" : "s"} meanwhile.` : "Avoozl's reviewer chats stay the review gate."}` : t.approvals ? `${e.branch} needs ${t.approvals} approving review${t.approvals === 1 ? "" : "s"} (${t.sources.join(" and ")})${t.dismissStale ? ", and a new push dismisses old approvals" : ""}. Avoozl waits for that many from allowed people on the pull request's head commit.` : "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate.";
}
var Lu = [
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
], Ru = (e) => e === "plans-repo" || e === "single-repo" ? e : "local", zu = (e) => Ru(e) !== "local";
function Bu(e) {
	let t = Ru(e), n = [
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
var Vu = "Labels, checks, reviews and the Project board only apply to GitHub modes.";
function Hu(e) {
	let t = [];
	return e.planningRepository.trim() && t.push("planning repository"), (e.projectOwner.trim() || e.projectNumber.trim()) && t.push("Project board"), e.repositories.length && t.push(`${e.repositories.length} repository GitHub setting${e.repositories.length === 1 ? "" : "s"}`), e.epicIssueType.trim() && t.push("epic issue type"), t;
}
var Uu = [
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
], Wu = (e) => /^create|^enable/.test(e.action) ? "create" : /^keep/.test(e.action) ? "keep" : "change";
function Gu(e) {
	return Uu.map((t) => ({
		...t,
		writes: e.filter((e) => t.steps.includes(e.step))
	})).filter((e) => e.writes.length);
}
function Ku(e, t, n) {
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
var qu = [{
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
}], Ju = (e) => Ru(e) === "single-repo" ? "issue-radar" : "worker", Yu = "workspaces";
function Xu(e, t, n, r) {
	let i = Yu;
	return t === "settings" && e !== "settings" ? i : r.includes(n) ? n : i;
}
// kirocrew-app/ui/src/RadioFold.tsx
var Zu = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function Qu() {
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
function $u(e) {
	return /* @__PURE__ */ x("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ b("style", { children: Zu }), e.sections.map((t) => {
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
						t.description && t.fields && /* @__PURE__ */ b(Qu, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/ModePicker.tsx
var ed = "var(--ok)", td = "var(--tile-purple, var(--accent))";
function nd({ color: e, children: t }) {
	return /* @__PURE__ */ b("span", {
		className: "inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-4",
		style: {
			background: e,
			color: "var(--card)"
		},
		children: t
	});
}
function rd() {
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
function id({ color: e }) {
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
function ad({ color: e }) {
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
var od = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card)",
	minWidth: 0,
	overflow: "hidden"
};
function sd({ name: e, locked: t, children: n }) {
	return /* @__PURE__ */ x("div", {
		style: od,
		className: "flex-1 text-[11px] leading-4",
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1 px-2 py-1 font-semibold",
			style: {
				background: "var(--bg-elevated, transparent)",
				borderBottom: "1px solid var(--border)",
				color: "var(--text)"
			},
			children: [t && /* @__PURE__ */ b(rd, {}), /* @__PURE__ */ b("span", {
				className: "truncate",
				children: e
			})]
		}), /* @__PURE__ */ b("div", {
			className: "flex flex-col",
			children: n
		})]
	});
}
function cd({ icon: e, title: t, pill: n, sub: r }) {
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
function ld() {
	return /* @__PURE__ */ x("div", {
		"aria-hidden": "true",
		children: [/* @__PURE__ */ x("div", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ b(sd, {
				name: "acme/plans",
				locked: !0,
				children: /* @__PURE__ */ b(cd, {
					icon: /* @__PURE__ */ b(id, { color: ed }),
					title: "Add login",
					pill: /* @__PURE__ */ b(nd, {
						color: ed,
						children: "Open"
					}),
					sub: "#12 · spec 1.2"
				})
			}), /* @__PURE__ */ b(sd, {
				name: "acme/app",
				children: /* @__PURE__ */ b(cd, {
					icon: /* @__PURE__ */ b(ad, { color: td }),
					title: "Add login",
					pill: /* @__PURE__ */ b(nd, {
						color: td,
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
function ud() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(sd, {
			name: "acme/app",
			children: [/* @__PURE__ */ b(cd, {
				icon: /* @__PURE__ */ b(id, { color: ed }),
				title: "Add login",
				pill: /* @__PURE__ */ b(nd, {
					color: ed,
					children: "Open"
				}),
				sub: "#12 · spec 1.2"
			}), /* @__PURE__ */ b(cd, {
				icon: /* @__PURE__ */ b(ad, { color: td }),
				title: "Add login",
				pill: /* @__PURE__ */ b(nd, {
					color: td,
					children: "Merged"
				}),
				sub: /* @__PURE__ */ x(y, { children: ["body: ", /* @__PURE__ */ b("code", { children: "Closes #12" })] })
			})]
		})
	});
}
function dd() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(sd, {
			name: "This Mac · Avoozl workspace",
			children: [/* @__PURE__ */ b(cd, {
				icon: /* @__PURE__ */ b(id, { color: ed }),
				title: "Add login",
				pill: /* @__PURE__ */ b(nd, {
					color: td,
					children: "Done"
				}),
				sub: "task 1.2 · in the database"
			}), /* @__PURE__ */ b(cd, {
				icon: /* @__PURE__ */ b(ad, { color: td }),
				title: "avoozl/1.2 → main",
				pill: /* @__PURE__ */ b(nd, {
					color: td,
					children: "Merged"
				}),
				sub: "merged in your checkout"
			})]
		})
	});
}
var fd = {
	local: dd,
	"plans-repo": ld,
	"single-repo": ud
}, pd = {
	local: "A worker chat codes the task, Avoozl checks it and merges the branch on this Mac. Nothing is sent to GitHub.",
	"plans-repo": "The pull request merges from the linked branch; GitHub closes the private issue. The code repository never names the plans repository.",
	"single-repo": "The pull request says Closes #12; GitHub closes the issue when it merges."
}, md = {
	local: ue,
	"plans-repo": me,
	"single-repo": G
};
function hd(e) {
	let t = e.idPrefix ?? "avoozl-mode", n = Ru(e.value);
	return /* @__PURE__ */ b("div", {
		"data-mode-picker": !0,
		children: /* @__PURE__ */ b($u, {
			name: t,
			label: "Where tasks live",
			value: n,
			onChange: (t) => e.onChange(t),
			sections: Lu.map((t) => {
				let r = fd[t.mode];
				return {
					key: t.mode,
					title: t.title,
					line: t.line,
					icon: md[t.mode],
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
									children: pd[t.mode]
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
function gd(e) {
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
					/* @__PURE__ */ x(f, {
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
					t < i ? /* @__PURE__ */ x(f, {
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
					}) : e.onClose && /* @__PURE__ */ b(f, {
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
function _d(e) {
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
var vd = [
	{
		title: "A task becomes ready",
		text: "When everything a task waits on is done, the tick marks it ready and starts it, up to the limit at once.",
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
			boxes: [
				"Worker chats",
				"Save",
				"Issue Radar"
			],
			on: 1
		})
	}
], yd = [
	{
		title: "A task becomes ready",
		text: "When everything it waits on is done, Avoozl adds the repository's ready label to its issue.",
		picture: /* @__PURE__ */ b(_d, {
			boxes: ["Waits on", "Ready label"],
			on: 1,
			note: "Scope the crew to this exact label in Issue Radar."
		})
	},
	{
		title: "Issue Radar takes it",
		text: "The crew scoped to that label claims the issue and codes it in its own session.",
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
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
		picture: /* @__PURE__ */ b(_d, {
			boxes: [
				"Issue Radar",
				"Save",
				"Worker chats"
			],
			on: 1
		})
	}
];
function bd(e) {
	let [t, n] = c(null), r = Ru(e.mode), i = e.value || Ju(e.mode), a = qu.filter((e) => e.modes.includes(r));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		children: [
			/* @__PURE__ */ b("div", {
				role: "radiogroup",
				"aria-label": "Who codes",
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" },
				children: a.map((t) => {
					let n = i === t.coder, r = Ju(e.mode) === t.coder;
					return /* @__PURE__ */ x("div", {
						id: `${e.id}-${t.coder}`,
						role: "radio",
						"aria-checked": n,
						tabIndex: n ? 0 : -1,
						"data-coder": t.coder,
						onClick: () => e.onChange(r ? "" : t.coder),
						onKeyDown: (n) => {
							let r = a.indexOf(t), i = n.key === "ArrowRight" || n.key === "ArrowDown" ? a[(r + 1) % a.length] : n.key === "ArrowLeft" || n.key === "ArrowUp" ? a[(r - 1 + a.length) % a.length] : n.key === " " || n.key === "Enter" ? t : null;
							i && (n.preventDefault(), e.onChange(Ju(e.mode) === i.coder ? "" : i.coder), document.getElementById(`${e.id}-${i.coder}`)?.focus());
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
								children: /* @__PURE__ */ b(_d, { boxes: [...t.flow] })
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
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(X, {
				icon: I,
				onClick: () => n(t ? null : i),
				"aria-label": t ? "Hide how this works" : "How does this work?",
				children: t ? "Hide how this works" : "How does this work?"
			}) }),
			t && /* @__PURE__ */ b(gd, {
				id: `${e.id}-walk`,
				label: t === "issue-radar" ? "How Issue Radar codes a task" : "How worker chats code a task",
				steps: t === "issue-radar" ? yd : vd,
				onClose: () => n(null)
			})
		]
	});
}
// kirocrew-app/ui/src/SetupWizard.tsx
var xd = {
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
}, Sd = [
	["What to set up", "Avoozl reads GitHub first. Pick the extras; the mode, repositories and Project come from this tab."],
	["Check each change", "Every write Avoozl would make on GitHub. It never deletes or renames anything."],
	["Making the changes", "Avoozl makes them one at a time. Cancel stops before the next one."],
	["Save the settings file", "Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save."]
];
function Cd(e) {
	let { workspaceId: n, client: i, form: a } = e, [o, l] = c(0), [u, d] = c(e.first), [p, m] = c(!1), [h, _] = c(null), v = s(null), S = s(null), C = t(() => {
		v.current ? (i.cancelSetup(n, v.current), e.onClose("Cancelled. Avoozl stops before its next write; check again to see what was made.")) : e.onClose(o === 3 ? void 0 : "Cancelled. Nothing was written.");
	}, [
		i,
		n,
		e,
		o
	]);
	Mr("modal", !0, "Cancel", C), r(() => {
		S.current?.querySelector("input, button")?.focus();
	}, []);
	let w = async (e) => {
		m(!0), _(null);
		try {
			await e();
		} catch (e) {
			_(Y(e));
		} finally {
			m(!1);
		}
	}, T = () => w(async () => {
		d(await i.setup(n, au(a))), l(1);
	}), E = () => w(async () => {
		if (u) {
			l(2), v.current = u.previewHash;
			try {
				d(await i.setup(n, {
					...au(a),
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
	}), O = Gu(u?.writes ?? []), k = u?.writes.length ?? 0, A = (u?.results ?? []).filter((e) => e.status !== "done");
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
					children: Sd.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: Sd[o][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-setup-line",
					className: "text-sm text-muted",
					children: Sd[o][1]
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
											style: xd[Wu(e)],
											children: Wu(e)
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
						/* @__PURE__ */ b(f, {
							type: "button",
							onClick: C,
							children: o === 3 ? "Close" : "Cancel"
						}),
						o === 1 && /* @__PURE__ */ b(f, {
							type: "button",
							onClick: () => l(0),
							disabled: p,
							children: "Back"
						}),
						o === 0 && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void T(),
							disabled: p,
							children: "Check the changes"
						}),
						o === 1 && k > 0 && /* @__PURE__ */ x(f, {
							type: "button",
							primary: !0,
							onClick: () => void E(),
							disabled: p,
							children: [
								"Apply ",
								k,
								" change",
								k === 1 ? "" : "s"
							]
						}),
						o === 1 && k === 0 && u?.settings.changed && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => l(3),
							children: "Next"
						}),
						o === 3 && u?.settings.changed && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void D(),
							disabled: p || !!u.settings.error,
							children: "Save to .avoozl.json"
						})
					]
				})
			]
		})]
	});
}
function wd(e) {
	let { workspaceId: n, client: i, settings: a, shared: o } = e, [s, l] = c(() => iu(a.github)), u = {
		...s,
		...o,
		mode: o.mode || s.mode
	}, [d, f] = c(null), [p, m] = c(null), [h, g] = c(() => (/* @__PURE__ */ new Date()).toISOString()), [_, v] = c(!1), [y, S] = c(null), C = JSON.stringify(au(u)), w = t(async () => {
		f(null), m(null);
		try {
			f(await i.setup(n, JSON.parse(C)));
		} catch (e) {
			m(Y(e));
		}
		g((/* @__PURE__ */ new Date()).toISOString());
	}, [
		i,
		n,
		C
	]);
	r(() => l(iu(a.github)), [a]), r(() => {
		w();
	}, [w]);
	let T = Ku(d, p, h);
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
					/* @__PURE__ */ b(P, {
						size: 16,
						"aria-hidden": "true",
						style: { color: "var(--ok)" }
					}),
					/* @__PURE__ */ b("span", { children: "GitHub is set up." }),
					/* @__PURE__ */ b(q, {
						text: new Date(T.at).toLocaleString(),
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["Checked ", Dn(T.at, Date.now())]
						})
					}),
					/* @__PURE__ */ b(Z, {
						icon: we,
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
					/* @__PURE__ */ b(X, {
						icon: Me,
						primary: !0,
						onClick: () => v(!0),
						tooltip: "Show each change first. Nothing is written until you apply.",
						children: "Set up GitHub"
					}),
					/* @__PURE__ */ b(Z, {
						icon: we,
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
							/* @__PURE__ */ b(Ne, {
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
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(Z, {
						icon: we,
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
			_ && /* @__PURE__ */ b(Cd, {
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
function Td(e) {
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
var Ed = {
	info: "var(--muted)",
	warn: "var(--text)",
	error: "var(--danger)"
};
function Dd(e) {
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
				children: [t.served && /* @__PURE__ */ b(J, {
					variant: "info",
					children: "This backend"
				}), /* @__PURE__ */ b(q, {
					text: Rt(t.state).tip,
					children: /* @__PURE__ */ b("span", {
						"data-workspace-state": t.state,
						children: /* @__PURE__ */ b(J, {
							variant: Rt(t.state).variant,
							children: Rt(t.state).label
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
function Od(e = {}) {
	let { onSelect: n, onListChange: i } = e, a = l(), s = o(() => jt(a), [a]), u = o(() => fr(a), [a]), [d, h] = c(null), [g, _] = c(null), [v, y] = c(e.selected ?? null), [S, C] = c(null), [w, T] = c(null), [E, D] = c(!1), [O, k] = c({
		id: "",
		root: "",
		name: ""
	}), A = t(async (e) => {
		D(!0), T(null);
		try {
			await e();
		} catch (e) {
			T(Y(e));
		} finally {
			D(!1);
		}
	}, []), j = t((e = null) => A(async () => {
		let t = await s.list();
		_(t), y((n) => Nt(t, e ?? n));
	}), [A, s]), M = t((e) => A(async () => {
		C(null), h(null);
		let [t, n] = await Promise.all([s.tickHealth(e), u.tickLog(e, 20).catch(() => [])]);
		C(t), h(n);
	}), [
		A,
		s,
		u
	]);
	r(() => {
		j();
	}, [j]), r(() => {
		v && M(v);
	}, [v, M]), r(() => {
		n?.(v);
	}, [v, n]), r(() => {
		g && i?.(g);
	}, [g, i]), r(() => {
		e.selected && y(e.selected);
	}, [e.selected]);
	let N = (e) => A(async () => {
		let t = {
			id: O.id.trim(),
			root: O.root.trim(),
			name: O.name.trim() || void 0
		}, n = e === "add" ? await s.add(t) : await s.init(t);
		k({
			id: "",
			root: "",
			name: ""
		});
		let r = await s.list();
		_(r), y(n.id);
	}), P = () => {
		if (!v) return;
		let e = v;
		A(async () => {
			await s.tick(e), C(await s.tickHealth(e)), h(await u.tickLog(e, 20).catch(() => []));
		});
	}, F = g?.items.find((e) => e.id === v) ?? null, I = fc("(min-width: 768px)");
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-workspace-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b("h2", {
				id: "avoozl-workspace-title",
				className: "text-lg font-semibold",
				children: "Workspace"
			}),
			w && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: w
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: E ? "Working…" : ""
			}),
			/* @__PURE__ */ x("div", {
				"data-workspaces-layout": !0,
				style: I && F ? {
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
					children: [/* @__PURE__ */ x(p, { children: [
						/* @__PURE__ */ x(m, { children: [
							"Your workspaces (",
							g?.items.length ?? 0,
							")"
						] }),
						/* @__PURE__ */ b("p", {
							className: "mt-1 text-sm text-muted",
							children: "The workspaces on this computer. The one you pick is the one the other tabs show."
						}),
						g === null ? /* @__PURE__ */ b("p", {
							className: "mt-2 text-sm text-muted",
							children: "Loading…"
						}) : g.items.length === 0 ? /* @__PURE__ */ b("p", {
							className: "mt-2 text-sm text-muted",
							children: "No workspaces yet. Add one below."
						}) : /* @__PURE__ */ b("ul", {
							className: "mt-2 flex flex-col gap-1",
							children: g.items.map((e) => /* @__PURE__ */ b(Dd, {
								workspace: e,
								selected: e.id === v,
								onSelect: () => y(e.id)
							}, e.id))
						}),
						/* @__PURE__ */ b("div", {
							className: "mt-3",
							children: /* @__PURE__ */ b(f, {
								onClick: () => void j(),
								disabled: E,
								children: "Refresh"
							})
						})
					] }), /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("section", {
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
									e.preventDefault(), N("add");
								},
								children: [
									/* @__PURE__ */ b(Td, {
										id: "avoozl-ws-root",
										label: "Folder (absolute path)",
										value: O.root,
										placeholder: "/path/to/plans",
										required: !0,
										onChange: (e) => k({
											...O,
											root: e
										})
									}),
									/* @__PURE__ */ b(Td, {
										id: "avoozl-ws-id",
										label: "Short ID",
										value: O.id,
										placeholder: "my-plans",
										required: !0,
										onChange: (e) => k({
											...O,
											id: e
										})
									}),
									/* @__PURE__ */ b(Td, {
										id: "avoozl-ws-name",
										label: "Name (optional)",
										value: O.name,
										onChange: (e) => k({
											...O,
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
											children: [/* @__PURE__ */ b(f, {
												type: "submit",
												disabled: E,
												children: "Add existing"
											}), /* @__PURE__ */ b("p", {
												className: "text-xs text-muted",
												children: "The folder already has Avoozl plans (an .avoozl.json and its database). Avoozl lists it; nothing in it changes."
											})]
										}), /* @__PURE__ */ x("div", {
											className: "flex flex-col gap-1.5 rounded border p-3",
											style: { borderColor: "var(--border)" },
											"data-choice": "init",
											children: [/* @__PURE__ */ b(f, {
												type: "button",
												disabled: E,
												onClick: () => void N("init"),
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
				}), F && /* @__PURE__ */ b("aside", {
					"aria-label": "Tick health",
					className: "min-w-0",
					children: /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
						"data-tick-panel": !0,
						style: {
							maxHeight: "calc(100vh - 12rem)",
							overflowY: "auto"
						},
						children: [
							/* @__PURE__ */ b(m, { children: "Tick health" }),
							/* @__PURE__ */ b("p", {
								className: "my-2 text-sm",
								children: Mt(S)
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
										children: [/* @__PURE__ */ b(q, {
											text: e.at,
											children: /* @__PURE__ */ b("span", {
												className: "whitespace-nowrap tabular-nums text-muted",
												children: e.at ? `${e.at.slice(11, 19)} · ${Dn(e.at)}` : "unknown"
											})
										}), /* @__PURE__ */ b("span", {
											className: "font-medium uppercase",
											style: { color: Ed[e.level] },
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
								children: [/* @__PURE__ */ b(f, {
									onClick: P,
									disabled: E,
									children: "Run tick now"
								}), /* @__PURE__ */ b(f, {
									onClick: () => v && void M(v),
									disabled: E,
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
var kd = [
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
function Ad(e, t) {
	let n = t?.github ?? {}, r = typeof n.mode == "string" ? n.mode : "", i = typeof n.planningRepository == "string" ? n.planningRepository : "", a = r === "plans-repo" || r === "single-repo" ? r : e.github ? "single-repo" : "local";
	return {
		mode: r === "local" ? "local" : a,
		isPlanning: !!(e.github && i && i.toLowerCase() === e.github.toLowerCase()) || !i && e.specs.length > 0,
		planningRepository: i || (e.specs.length > 0 && e.github ? e.github : ""),
		id: e.registered?.id ?? e.id ?? "",
		baseBranch: e.registered?.baseBranch ?? e.baseBranch
	};
}
var jd = (e) => e !== "local";
function Md(e) {
	return e.mode === "single-repo" || e.mode === "plans-repo" && e.isPlanning;
}
function Nd(e, t) {
	let n = ["folder", "mode"];
	return jd(e.mode) && n.push("check"), n.push("setup", "import"), jd(e.mode) && Md(e) && t?.visibility === "public" && n.push("scan"), jd(e.mode) && n.push("issues"), n.push("finish"), n;
}
function Pd(e, t) {
	return /^[a-z][a-z0-9-]{1,60}$/.test(e.id.trim()) ? e.baseBranch.trim() ? e.mode === "local" ? null : t.github ? e.mode === "plans-repo" && !e.isPlanning && !/^[\w.-]+\/[\w.-]+$/.test(e.planningRepository.trim()) ? "Name the planning repository as owner/name." : e.mode === "plans-repo" && e.isPlanning && t.visibility === "public" ? "A planning repository must be private: its issues name plans and code repositories." : null : t.remote ? `${t.remote} is not a GitHub remote, so GitHub modes can't use this folder. Pick Local only.` : "This folder has no GitHub remote. Pick Local only, or add a GitHub remote first." : "Name the branch tasks land on." : "Give a short ID: lower-case letters, digits and dashes, starting with a letter.";
}
function Fd(e, t, n) {
	let r = n?.github ?? {}, i = Object.keys(r.repositories ?? {}), a = e.isPlanning ? t.github : e.planningRepository.trim(), o = e.mode === "plans-repo" && e.isPlanning ? i : [...i, t.github];
	return {
		mode: e.mode,
		...e.mode === "plans-repo" ? { planningRepository: a } : {},
		repositories: [...new Set(o.filter((t) => t && t.toLowerCase() !== (e.mode === "plans-repo" ? a.toLowerCase() : "")))]
	};
}
function Id(e, t, n, r) {
	let i = [], a = n?.github ?? {};
	if (jd(e.mode)) {
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
	let o = jd(e.mode) ? !!r?.settings.changed : a.mode !== "local" && a.mode !== void 0;
	i.push({
		key: "settings",
		title: o ? `Save the mode${jd(e.mode) ? " and GitHub names" : ""} to .avoozl.json` : ".avoozl.json already matches",
		detail: jd(e.mode) ? "The settings Set up GitHub proposed, shown in Check GitHub." : "Local only. Kept GitHub settings stay in the file, unused.",
		done: !o,
		confirm: null
	});
	let s = Md(e) && jd(e.mode) ? t.github : null;
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
function Ld(e, t, n) {
	let r = jd(e.mode) ? t.github : null;
	return {
		id: e.id.trim(),
		localCheckout: t.root,
		baseBranch: e.baseBranch.trim(),
		...r ? { github: r } : {},
		...r && Md(e) ? { issueAuthorization: !0 } : {},
		planning: e.mode === "plans-repo" ? e.isPlanning : e.mode === "local" && t.specs.length > 0 && !n
	};
}
function Rd(e, t) {
	return (e?.items ?? []).filter((e) => !e.root || e.root === t.root || t.specs.includes(e.name));
}
var zd = (e) => !!e.plan, Bd = (e) => (e?.items ?? []).flatMap((e) => e.findings.map((t) => ({
	spec: e.name,
	...t
})));
function Vd(e) {
	let t = e?.writes ?? [];
	return {
		create: t.filter((e) => e.kind === "issue.create"),
		update: t.filter((e) => e.kind === "issue.update"),
		other: t.filter((e) => e.kind !== "issue.create" && e.kind !== "issue.update").length
	};
}
function Hd(e) {
	let t = async (t, n, r = {}) => (await e.post(At, {
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
var Ud = {
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
}, Wd = {
	local: ue,
	"plans-repo": me,
	"single-repo": G
};
function Gd({ kind: e }) {
	return /* @__PURE__ */ b("span", {
		className: "rounded-full border px-1.5 text-[10px] font-semibold",
		style: Ud[e] ?? Ud.keep,
		children: e
	});
}
function Kd({ rows: e }) {
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
function qd({ children: e }) {
	return /* @__PURE__ */ x("p", {
		className: "flex items-center gap-1.5 text-sm",
		"data-step-done": !0,
		children: [/* @__PURE__ */ b(A, {
			size: 14,
			"aria-hidden": "true",
			style: { color: "var(--ok)" }
		}), e]
	});
}
function Jd(e) {
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
			t && /* @__PURE__ */ b(Kd, { rows: [
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
function Yd(e) {
	let { form: t, found: n, set: r } = e, i = n.github ? null : n.remote ? `${n.remote} is not a GitHub remote.` : "This folder has no GitHub remote.";
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-mode": !0,
		children: [
			/* @__PURE__ */ b($u, {
				name: "avoozl-onboard-mode",
				label: "Mode",
				value: t.mode,
				onChange: (e) => r({ mode: e }),
				sections: Lu.map((e) => ({
					key: e.mode,
					title: e.title,
					line: e.line,
					icon: Wd[e.mode],
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
						}), /* @__PURE__ */ b(Kd, { rows: e.facts.map(([e, t]) => [e, t]) })]
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
function Xd({ result: e }) {
	if (!e) return /* @__PURE__ */ b("p", {
		className: "text-sm text-muted",
		children: "Reading GitHub…"
	});
	let t = Gu(e.writes), n = e.steps.filter((t) => !e.writes.some((e) => e.step === t.id) && t.status !== "failed"), r = e.steps.filter((e) => e.status === "failed");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3 text-sm",
		"data-onboard-check": !0,
		children: [
			e.writes.length === 0 && /* @__PURE__ */ b(qd, { children: "Nothing to create or change on GitHub." }),
			t.map((e) => /* @__PURE__ */ x("section", { children: [/* @__PURE__ */ b("h4", {
				className: "text-xs font-semibold uppercase tracking-wide text-muted",
				children: e.title
			}), /* @__PURE__ */ b("ul", {
				className: "mt-1 flex flex-col gap-1",
				children: e.writes.map((e, t) => /* @__PURE__ */ x("li", {
					className: "flex flex-wrap items-baseline gap-2",
					children: [
						/* @__PURE__ */ b(Gd, { kind: Wu(e) }),
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
						/* @__PURE__ */ b(Gd, { kind: "keep" }),
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
function Zd(e) {
	let { workspaceId: n, client: i, onClose: a } = e, o = zr(), [l, u] = c("folder"), [d, p] = c(""), [m, h] = c(null), [g, _] = c(null), [v, S] = c(!1), [C, w] = c(null), [T, E] = c(null), [D, O] = c([]), [k, j] = c(!1), [M, N] = c(null), [P, F] = c(/* @__PURE__ */ new Set()), [I, L] = c(null), [ee, R] = c({}), [z, te] = c(!1), [B, V] = c(null), H = s(null), ne = C ? Nd(C, m) : [
		"folder",
		"mode",
		"setup",
		"import",
		"finish"
	], U = ne.indexOf(l), W = kd.find((e) => e.key === l), re = D.length > 0, G = t(() => {
		a(re ? `Stopped. Done so far: ${D.join("; ")}.` : "Cancelled. Nothing was written.");
	}, [
		a,
		re,
		D
	]);
	Mr("modal", !0, "Cancel", G), r(() => {
		H.current?.querySelector("input:not([disabled]), button")?.focus();
	}, [l]);
	let ie = async (e) => {
		te(!0), V(null);
		try {
			await e();
		} catch (e) {
			V(Y(e));
		} finally {
			te(!1);
		}
	}, ae = (e) => {
		V(null), u(e);
	}, oe = () => ae(ne[Math.min(ne.length - 1, U + 1)]), se = () => ae(ne[Math.max(0, U - 1)]), ce = (e) => w((t) => t && {
		...t,
		...e
	}), le = () => ie(async () => {
		if (!d.trim()) throw Error("Give the checkout folder.");
		let [e, t, r] = await Promise.all([
			i.inspect(n, d.trim()),
			i.settings(n),
			i.repositories(n)
		]);
		h(e), _(t), S(r.items.some((t) => t.planning && t.id !== e.registered?.id)), w(Ad(e, t)), ae("mode");
	}), ue = () => ie(async () => {
		C && m && (E(null), E(await i.checkGitHub(n, Fd(C, m, g))));
	});
	r(() => {
		l === "check" && !T && ue();
	}, [l]);
	let de = C && m ? Id(C, m, g, T) : [], fe = () => ie(async () => {
		if (!C || !m) return;
		let t = T;
		for (let e of de) if (!e.done) {
			if (e.confirm && !await o(e.confirm)) {
				V(`Stopped before “${e.title}”. Nothing after it was written.`);
				return;
			}
			if (e.key === "github" && t) {
				t = await i.applyGitHub(n, Fd(C, m, g), t.previewHash), E(t);
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
			e.key === "register" && (await i.register(n, Ld(C, m, v)), O((e) => [...e, `added ${C.id.trim()}`]));
		}
		let r = await i.inspect(n, m.root);
		h(r), N(await i.specs(n).catch(() => null)), await e.onChanged(), j(!0), oe();
	}), pe = m ? Rd(M, m) : [];
	r(() => {
		l === "import" && F(new Set(pe.filter((e) => !zd(e)).map((e) => e.name)));
	}, [l, M]);
	let me = () => ie(async () => {
		for (let e of P) await i.importSpec(n, e), O((t) => [...t, `imported ${e} as a draft`]);
		N(await i.specs(n)), await e.onChanged();
	}), he = () => ie(async () => {
		L(null), L(await i.scan(n, pe.map((e) => e.name)));
	});
	r(() => {
		l === "scan" && he(), l === "issues" && ie(async () => {
			let e = pe.filter((e) => e.plan && !e.plan.approved), t = await Promise.all(e.map(async (e) => [e.name, await i.previewIssues(n, e.plan.id).catch((e) => ({ error: Y(e) }))]));
			R(Object.fromEntries(t));
		});
	}, [l]);
	let K = Bd(I), ge = l === "mode" && C && m ? Pd(C, m) : null, _e = l === "check" && T ? T.steps.some((e) => e.status === "failed") && T.writes.length === 0 : !1, ve = k ? [] : de.filter((e) => !e.done), ye = (e) => e === "folder" && !!m || e === "check" && !!T && T.writes.length === 0 || e === "setup" && (k || !!C && ve.length === 0) || e === "import" && pe.length > 0 && pe.every(zd);
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
			onClick: G,
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
							ye(e) && /* @__PURE__ */ b(A, {
								size: 11,
								"aria-label": "done",
								style: { color: "var(--ok)" }
							}),
							t + 1,
							". ",
							kd.find((t) => t.key === e).title
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
				l === "folder" && /* @__PURE__ */ b(Jd, {
					folder: d,
					setFolder: (e) => {
						p(e), h(null);
					},
					found: m
				}),
				l === "mode" && C && m && /* @__PURE__ */ b(Yd, {
					form: C,
					set: ce,
					found: m,
					problem: ge
				}),
				l === "check" && /* @__PURE__ */ b(Xd, { result: T }),
				l === "setup" && /* @__PURE__ */ b("ol", {
					className: "flex flex-col gap-2 text-sm",
					"data-onboard-setup": !0,
					children: de.map((e, t) => /* @__PURE__ */ x("li", {
						className: "flex items-start gap-2",
						children: [/* @__PURE__ */ x("span", {
							className: "w-5 flex-none text-right text-muted",
							children: [t + 1, "."]
						}), /* @__PURE__ */ x("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ x("span", {
								className: "flex items-center gap-1.5",
								children: [
									e.done || k ? /* @__PURE__ */ b(A, {
										size: 13,
										"aria-label": "done",
										style: { color: "var(--ok)" }
									}) : null,
									e.title,
									e.confirm && !e.done && !k && /* @__PURE__ */ b(J, {
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
						pe.length === 0 && /* @__PURE__ */ b("p", {
							className: "text-muted",
							children: "No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back."
						}),
						pe.length > 0 && pe.every(zd) && /* @__PURE__ */ b(qd, { children: "Every spec here is imported." }),
						/* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1.5",
							children: pe.map((e) => /* @__PURE__ */ x("li", {
								className: "flex flex-wrap items-center gap-2",
								"data-onboard-spec": e.name,
								children: [
									/* @__PURE__ */ b("input", {
										type: "checkbox",
										"aria-label": `Import ${e.name}`,
										disabled: zd(e),
										checked: zd(e) || P.has(e.name),
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
									e.counts.error > 0 ? /* @__PURE__ */ x(J, {
										variant: "warning",
										children: [
											e.counts.error,
											" lint error",
											e.counts.error === 1 ? "" : "s"
										]
									}) : /* @__PURE__ */ x(J, { children: ["lint clean", e.counts.warning ? `, ${e.counts.warning} warnings` : ""] }),
									e.plan && /* @__PURE__ */ b(J, { children: e.plan.approved ? "approved" : "draft" })
								]
							}, e.name))
						}),
						pe.some((e) => e.counts.error > 0) && /* @__PURE__ */ b("p", {
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
						I && K.length === 0 && /* @__PURE__ */ x(qd, { children: [
							"No secrets, local paths or content-rule matches in ",
							I.items.length,
							" spec",
							I.items.length === 1 ? "" : "s",
							"."
						] }),
						K.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
							role: "alert",
							className: "text-danger",
							children: [
								K.length,
								" finding",
								K.length === 1 ? "" : "s",
								". Fix each line, then scan again. The next step waits until none are left."
							]
						}), /* @__PURE__ */ b("ul", {
							className: "flex flex-col gap-1",
							children: K.map((e, t) => /* @__PURE__ */ x("li", {
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
					children: [pe.filter((e) => e.plan && !e.plan.approved).length === 0 && /* @__PURE__ */ b("p", {
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
						let n = Vd(t);
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
									/* @__PURE__ */ b(Gd, { kind: "create" }),
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
						/* @__PURE__ */ b(f, {
							type: "button",
							onClick: G,
							disabled: z,
							children: l === "finish" ? "Close" : "Cancel"
						}),
						U > 0 && l !== "finish" && ne[U - 1] !== "setup" && /* @__PURE__ */ b(f, {
							type: "button",
							onClick: se,
							disabled: z,
							children: "Back"
						}),
						l === "folder" && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void le(),
							disabled: z || !d.trim(),
							children: "Check folder"
						}),
						l === "mode" && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z || !!ge,
							children: "Next"
						}),
						l === "check" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(f, {
							type: "button",
							onClick: () => void ue(),
							disabled: z,
							children: "Check again"
						}), /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z || !T || _e,
							children: "Next"
						})] }),
						l === "setup" && (ve.length ? /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void fe(),
							disabled: z,
							children: "Set up"
						}) : /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z,
							children: "Next"
						})),
						l === "import" && /* @__PURE__ */ x(y, { children: [P.size > 0 && /* @__PURE__ */ x(f, {
							type: "button",
							onClick: () => void me(),
							disabled: z,
							children: [
								"Import ",
								P.size,
								" as draft",
								P.size === 1 ? "" : "s"
							]
						}), /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z,
							children: pe.length && !pe.every(zd) && P.size ? "Skip import" : "Next"
						})] }),
						l === "scan" && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(f, {
							type: "button",
							onClick: () => void he(),
							disabled: z,
							children: "Scan again"
						}), /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z || !I || K.length > 0,
							children: "Next"
						})] }),
						l === "issues" && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: oe,
							disabled: z,
							children: "Next"
						}),
						l === "finish" && e.onOpenPlans && /* @__PURE__ */ b(f, {
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
function Qd(e) {
	let n = l(), r = o(() => Hd(n), [n]), [i, a] = c(!1), [s, u] = c(null), d = t((e) => {
		a(!1), u(e ?? null);
	}, []);
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "Onboard a repository" }),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "From a folder to plans ready to approve: mode, GitHub setup, spec import and an issue preview. Each GitHub write asks first."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
			children: kd.map((e, t) => /* @__PURE__ */ x("li", { children: [
				t + 1,
				". ",
				e.title
			] }, e.key))
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-3",
			children: /* @__PURE__ */ b(X, {
				icon: Me,
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
		i && /* @__PURE__ */ b(Zd, {
			workspaceId: e.workspaceId,
			client: r,
			onChanged: e.onChanged,
			onClose: d,
			onOpenPlans: e.onOpenPlans
		})
	] });
}
// kirocrew-app/ui/src/plugins-api.ts
var $d = "Contract version", ef = "Which version of Avoozl's plugin interface this plugin was built for. Not the plugin's own version.", tf = () => ({
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
}), nf = [
	["Where from", "Pick where the plugin’s files are. Open one source and fill it in."],
	["What", "What Avoozl found there. Check it is the plugin you meant."],
	["Applies to", "Declare it on this computer only, or share it with the repository."],
	["Review and approve", "Nothing runs until you approve this exact version."]
], rf = [
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
], af = (e) => e[e.where].trim(), of = {
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
}, sf = (e) => e.provides ?? e.kinds ?? [], cf = (e) => sf(e).map((e) => of[e]?.title ?? e);
function lf(e) {
	let t = {
		create: 0,
		change: 0,
		keep: 0,
		skip: 0
	};
	for (let n of e) t[n.action]++;
	return t;
}
function uf(e) {
	if (e === void 0) return "";
	let t = typeof e == "string" ? e : JSON.stringify(e);
	return t.length > 80 ? t.slice(0, 77) + "..." : t;
}
var df = (e, t, n) => ({
	id: e.id,
	repositories: e.repositories,
	previewHash: e.previewHash,
	acceptLowered: t,
	confirmPublic: n
});
function ff(e, t, n, r) {
	return e.state === "approved" ? t ? t.changes.some((e) => e.action === "create" || e.action === "change") ? t.warnings.length && !n ? "Accept the who-counts change to import." : e.source === "machine" && !r ? "Confirm that the settings and the plugin id go into .avoozl.json." : null : "Nothing to import: every setting is already the same." : "Avoozl has not previewed the pack yet." : `Approve version ${e.version ?? ""} first. Nothing from the pack applies before that.`;
}
function pf(e) {
	let t = af(e);
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
function mf(e, t) {
	return {
		...e,
		...t.id ? { id: t.id } : {},
		...t.contract === void 0 ? {} : { contract: String(t.contract) }
	};
}
function hf(e, t, n) {
	if (!t) return "Avoozl has not looked at the source yet.";
	if (t.error) return t.error;
	if (t.contract !== void 0 && t.supported === !1) return `The plugin is built for contract version ${t.contract}; this Avoozl loads ${n.join(", ") || "1"}.`;
	let r = e.where === "package" ? e.version.trim() : "";
	return r && t.version && r !== t.version ? `The installed package is version ${t.version}, not ${r}. Install ${r} or clear the version.` : null;
}
function gf(e) {
	return e.where === "path" && /^(?:\/|~|[A-Za-z]:[\\/])/.test(e.path.trim()) ? "A shared folder must be a path inside the repository, written relative to it." : null;
}
function _f(e, t = !1) {
	let n = e.id.trim();
	if (!/^[a-z][a-z0-9-]{0,60}$/.test(n)) return { error: "Give the plugin a lowercase id." };
	if (n === "local" || n === "github") return { error: `${n} is a built-in route.` };
	let r = af(e);
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
function vf(e) {
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
var yf = (e) => !!e.hash && (e.state === "unapproved" || e.state === "changed"), bf = (e) => {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t?.code === "plugin-public-repository" || /publish this plugin/.test(t?.error ?? "") ? String(t.error) : null;
	} catch {
		return null;
	}
};
function xf(e) {
	let t = async (t, n, r) => (await e.post(At, {
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
var Sf = () => ({
	id: "",
	via: "mcp",
	repository: "",
	labelFields: "",
	assigneeField: "",
	minimumPermission: "",
	scope: "machine"
}), Cf = /^[a-z][a-z0-9-]{0,60}$/;
function wf(e, t) {
	let n = e.id.trim();
	if (!Cf.test(n)) return { error: "Name the source with lowercase letters, digits and dashes." };
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
function Tf(e) {
	let t = async (t, n, r) => (await e.post(At, {
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
var Ef = {
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
function Df({ preview: e }) {
	let t = lf(e.changes);
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
								children: /* @__PURE__ */ b(J, {
									variant: e.warning ? "warning" : Ef[e.action].variant,
									children: Ef[e.action].label
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
										children: ["was ", /* @__PURE__ */ b("code", { children: uf(e.from) })]
									}),
									/* @__PURE__ */ b("code", { children: uf(e.to) }),
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
function Of(e) {
	let { row: n, workspaceId: i, client: a, onClose: o, onChanged: l } = e, [u, d] = c(null), [p, m] = c(!1), [h, g] = c(!1), [_, v] = c(!1), [y, S] = c(null), C = s(null), w = t(() => o(), [o]);
	r(() => {
		let e = !0;
		return a.packPreview(i, n.id ?? "").then((t) => e && d(t)).catch((t) => e && S(Y(t))), () => {
			e = !1;
		};
	}, [
		a,
		i,
		n.id
	]), Mr("modal", !0, "Cancel", w), r(() => {
		C.current?.querySelector("button")?.focus();
	}, []);
	let T = ff(n, u, p, h), E = async () => {
		if (u && !T) {
			v(!0), S(null);
			try {
				await a.packImport(i, df(u, p, h)), await l(), o(`Imported ${n.id} version ${n.version} into .avoozl.json.`);
			} catch (e) {
				S(Y(e));
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
				u ? /* @__PURE__ */ b(Df, { preview: u }) : !y && /* @__PURE__ */ b("p", {
					className: "text-sm text-muted",
					children: "Reading the pack..."
				}),
				u && u.warnings.length > 0 && /* @__PURE__ */ x("label", {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						className: "mt-1",
						checked: p,
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
				T && u && !(u.warnings.length && !p) && /* @__PURE__ */ b("p", {
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
					children: [/* @__PURE__ */ b(f, {
						type: "button",
						onClick: w,
						disabled: _,
						children: "Cancel"
					}), /* @__PURE__ */ b(f, {
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
var kf = {
	path: ne,
	package: ve,
	git: G
};
function Af(e) {
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
var jf = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Mf({ form: e, set: t }) {
	let n = {
		path: /* @__PURE__ */ b(Af, {
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
			children: [/* @__PURE__ */ b(Af, {
				label: "Package name",
				marker: "required",
				raw: "package",
				children: /* @__PURE__ */ b(g, {
					value: e.package,
					placeholder: "@example/avoozl-tracker",
					onChange: (e) => t({ package: e.target.value })
				})
			}), /* @__PURE__ */ b(Af, {
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
				/* @__PURE__ */ b(Af, {
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
					children: [/* @__PURE__ */ b(Af, {
						label: "Tag, branch or commit",
						marker: "required",
						raw: "ref",
						children: /* @__PURE__ */ b(g, {
							value: e.ref,
							placeholder: "v1.0.0",
							onChange: (e) => t({ ref: e.target.value })
						})
					}), /* @__PURE__ */ b(Af, {
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
		children: /* @__PURE__ */ b($u, {
			name: "avoozl-plugin-source",
			label: "Where from",
			value: e.where,
			onChange: (e) => t({ where: e }),
			sections: rf.map((e) => ({
				key: e.key,
				title: e.title,
				line: e.line,
				icon: kf[e.key],
				fields: n[e.key]
			}))
		})
	});
}
function Nf(e) {
	let { form: t, preview: n, set: r } = e, i = n.contract !== void 0, a = n.capabilities ? Object.entries(n.capabilities).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; ") || "none" : void 0, o = [
		["Source", `${rf.find((e) => e.key === t.where)?.title}: ${af(t)}${t.where === "git" ? ` at ${t.ref}` : ""}`],
		["Commit found", n.commit],
		["Version", n.version],
		["Parts", n.provides || n.kinds ? cf(n).join(", ") : void 0],
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
			/* @__PURE__ */ b(Af, {
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
			/* @__PURE__ */ b(Af, {
				label: $d,
				marker: "required",
				raw: "contract",
				hint: i ? `From the plugin’s own avoozl-plugin.json. ${ef}` : ef,
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
						...jf,
						maxWidth: "8rem"
					},
					children: e.supported.map((e) => /* @__PURE__ */ b("option", {
						value: String(e),
						children: e
					}, e))
				})
			}),
			/* @__PURE__ */ b(Af, {
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
function Pf(e) {
	let { form: t } = e, n = gf(t), r = t.where === "git" ? "Written to .avoozl.json. Each computer fetches the commit with Update, then approves it." : t.where === "package" ? "Written to .avoozl.json. Each computer installs the package, then approves it." : "Written to .avoozl.json. Each computer approves it for itself.", i = (e, t, n) => /* @__PURE__ */ x("div", {
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
		children: /* @__PURE__ */ b($u, {
			name: "avoozl-plugin-scope",
			label: "Applies to",
			value: t.scope,
			onChange: (t) => {
				e.set({ scope: t }), e.setConfirmPublic(!1);
			},
			sections: [{
				key: "machine",
				icon: ue,
				title: "This computer only",
				line: "Saved in this computer’s Avoozl settings. Nothing goes into the repository.",
				description: i("Only this computer runs it, after you approve it here.", "you are trying it, or its name is private.", "Others on the repository do not see it or run it.")
			}, {
				key: "repository",
				icon: je,
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
function Ff(e) {
	let { workspaceId: n, client: i, onClose: a, onChanged: o } = e, l = e.supported.length ? e.supported : [1], [u, d] = c(0), [p, m] = c(tf()), [h, g] = c(null), [_, v] = c(null), [y, S] = c(null), [C, w] = c(!1), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = (e) => {
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
	Mr("modal", !0, "Cancel", j), r(() => {
		k.current?.querySelector("summary, input:not([disabled]), button")?.focus();
	}, [u]);
	let M = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(Y(e));
		} finally {
			E(!1);
		}
	}, N = () => M(async () => {
		if (!af(p)) throw Error(p.where === "path" ? "Name the plugin folder." : p.where === "git" ? "Give the git URL." : "Name the package.");
		if (p.where === "git" && !p.ref.trim()) throw Error("Give a tag, branch or commit.");
		let e = await i.preview(n, pf(p));
		if (e.error) throw Error(e.error);
		g(e), m((t) => mf(t, e)), d(1);
	}), P = () => M(async () => {
		let e = _f(p, C);
		if (!e.input) throw Error(e.error ?? "Check the form.");
		try {
			let t = await i.add(n, e.input);
			v(t), t.pack && t.id && S(await i.packPreview(n, t.id).catch(() => null));
		} catch (e) {
			let t = bf(e);
			throw t ? Error(`${t} Tick the box to share it anyway.`) : e;
		}
		await o(), d(3);
	}), F = () => M(async () => {
		_ && (await i.approve(n, _), await o(), a(`Approved ${_.id} version ${_.version}.`));
	}), I = u === 1 ? hf(p, h, l) : null;
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
					children: nf.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: nf[u][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-plugin-line",
					className: "text-sm text-muted",
					children: nf[u][1]
				})] }),
				u === 0 && /* @__PURE__ */ b(Mf, {
					form: p,
					set: A
				}),
				u === 1 && h && /* @__PURE__ */ b(Nf, {
					form: p,
					preview: h,
					supported: l,
					set: A,
					problem: I
				}),
				u === 2 && /* @__PURE__ */ b(Pf, {
					form: p,
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
							}), /* @__PURE__ */ b(J, {
								variant: vf(_).attention ? "warning" : void 0,
								children: vf(_).label
							})]
						}),
						_.reason && /* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: _.reason
						}),
						/* @__PURE__ */ b(Xf, { row: _ }),
						/* @__PURE__ */ b(Yf, { row: _ }),
						y && /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-1",
							children: [
								/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Settings pack"
								}),
								/* @__PURE__ */ b(Df, { preview: y }),
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
						/* @__PURE__ */ b(f, {
							type: "button",
							onClick: j,
							disabled: T,
							children: "Cancel"
						}),
						(u === 1 || u === 2) && /* @__PURE__ */ b(f, {
							type: "button",
							onClick: () => d(u - 1),
							disabled: T,
							children: "Back"
						}),
						u === 0 && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void N(),
							disabled: T,
							children: p.where === "git" ? "Find the commit" : "Next"
						}),
						u === 1 && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							disabled: T || !!I,
							onClick: () => {
								let e = _f(p);
								if (e.error) return O(e.error);
								d(2);
							},
							children: "Next"
						}),
						u === 2 && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => void P(),
							disabled: T || p.scope === "repository" && !C,
							children: p.where === "git" ? "Fetch and review" : "Add and review"
						}),
						u === 3 && _ && yf(_) && /* @__PURE__ */ x(f, {
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
						u === 3 && _ && !yf(_) && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => a(`Added ${_.id}. It can't be approved yet: ${_.reason ?? vf(_).label}.`),
							children: "Keep it unapproved"
						})
					]
				})
			]
		})]
	});
}
function If(e) {
	let [n, r] = c(!1), [i, a] = c(null), o = t((e) => {
		r(!1), a(e ?? null);
	}, []);
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "Add plugin" }),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: "Four steps. Nothing runs or imports until you approve its exact version."
		}),
		/* @__PURE__ */ b("ol", {
			className: "mt-2 flex flex-col gap-1 text-xs",
			children: nf.map(([e, t], n) => /* @__PURE__ */ x("li", {
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
			children: /* @__PURE__ */ b(X, {
				icon: Se,
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
		n && /* @__PURE__ */ b(Ff, {
			workspaceId: e.workspaceId,
			client: e.client,
			supported: e.supported,
			onChanged: e.onChanged,
			onClose: o
		})
	] });
}
// kirocrew-app/ui/src/IntakeSources.tsx
var Lf = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Rf(e) {
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
function zf({ row: e, busy: t, onRemove: n }) {
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
						/* @__PURE__ */ b(J, { children: e.scope === "machine" ? "This computer only" : "Shared with the repo" })
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
		}), e.id && /* @__PURE__ */ b(Vr, {
			icon: Ae,
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
function Bf({ workspaceId: e, plugins: n }) {
	let r = l(), i = o(() => Tf(r), [r]), { value: a, error: s, reload: u } = Fi(e, t((e) => i.list(e), [i])), d = o(() => jt(r), [r]), { value: h } = Fi(e, t((e) => d.repositories(e), [d])), [_, v] = c(Sf), [y, S] = c(!1), [C, w] = c(!1), [T, E] = c(null), D = (e) => v({
		..._,
		...e
	}), O = n.filter((e) => e.id && e.capabilities?.tracker?.includes("poll")), k = a?.sources ?? [], A = (e) => {
		w(!0), E(null), e().then(() => u()).catch((e) => E(Y(e))).finally(() => w(!1));
	};
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "Intake sources" }),
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
		k.length ? /* @__PURE__ */ b("ul", {
			className: "flex flex-col",
			"aria-label": "Declared intake sources",
			children: k.map((t, n) => /* @__PURE__ */ b(zf, {
				row: t,
				busy: C,
				onRemove: () => A(() => i.remove(e, t))
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
						/* @__PURE__ */ b(Rf, {
							label: "Name",
							marker: "required",
							raw: "intake.sources.<id>",
							children: /* @__PURE__ */ b(g, {
								value: _.id,
								onChange: (e) => D({ id: e.target.value }),
								placeholder: "tickets",
								style: { width: "12rem" }
							})
						}),
						/* @__PURE__ */ b(Rf, {
							label: "Comes from",
							marker: "required",
							raw: "via",
							hint: "A plugin with poll, or MCP for a script or cron job.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Lf,
								value: _.via,
								onChange: (e) => D({ via: e.target.value }),
								children: [/* @__PURE__ */ b("option", {
									value: "mcp",
									children: "MCP (a script submits items)"
								}), O.map((e) => /* @__PURE__ */ x("option", {
									value: `plugin:${e.id}`,
									children: ["Plugin ", e.id]
								}, e.id))]
							})
						}),
						/* @__PURE__ */ b(Rf, {
							label: "Repository",
							marker: "required",
							raw: "repository",
							hint: "Its rules apply; a delivered item's task lands there.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Lf,
								value: _.repository,
								onChange: (e) => D({ repository: e.target.value }),
								children: [/* @__PURE__ */ b("option", {
									value: "",
									children: "Pick a repository"
								}), (h ?? []).map((e) => /* @__PURE__ */ b("option", {
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
						/* @__PURE__ */ b(Rf, {
							label: "Fields as labels",
							marker: "optional",
							raw: "labelFields",
							hint: "Each adds a field:value label before rules match.",
							children: /* @__PURE__ */ b(g, {
								value: _.labelFields,
								onChange: (e) => D({ labelFields: e.target.value }),
								placeholder: "component, queue",
								style: { width: "14rem" }
							})
						}),
						/* @__PURE__ */ b(Rf, {
							label: "Assignee field",
							marker: "optional",
							raw: "assigneeField",
							children: /* @__PURE__ */ b(g, {
								value: _.assigneeField,
								onChange: (e) => D({ assigneeField: e.target.value }),
								placeholder: "owner",
								style: { width: "10rem" }
							})
						}),
						/* @__PURE__ */ b(Rf, {
							label: "Who counts",
							marker: "optional",
							raw: "minimumPermission",
							hint: "The standing the plugin must report. Blank means write.",
							children: /* @__PURE__ */ x("select", {
								className: "rounded-md border px-2 py-1 text-sm",
								style: Lf,
								value: _.minimumPermission,
								onChange: (e) => D({ minimumPermission: e.target.value }),
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
							checked: _.scope === "machine",
							onChange: () => D({ scope: "machine" })
						}), " This computer only"]
					}), /* @__PURE__ */ x("label", {
						className: "inline-flex items-center gap-1.5",
						children: [/* @__PURE__ */ b("input", {
							type: "radio",
							name: "intake-scope",
							checked: _.scope === "repository",
							onChange: () => D({ scope: "repository" })
						}), " Shared with the repo"]
					})]
				}),
				_.scope === "repository" && /* @__PURE__ */ x("label", {
					className: "inline-flex items-center gap-1.5 text-xs",
					"data-intake-public-warning": !0,
					children: [/* @__PURE__ */ b("input", {
						type: "checkbox",
						checked: y,
						onChange: (e) => S(e.target.checked)
					}), ".avoozl.json may be public. Saving there publishes this source's name and plugin. I understand."]
				}),
				T ? /* @__PURE__ */ b("p", {
					role: "alert",
					className: "text-xs text-danger",
					children: T
				}) : null,
				/* @__PURE__ */ x("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ b(X, {
						icon: Se,
						onClick: () => {
							let t = wf(_, k.flatMap((e) => e.id ? [e.id] : []));
							if (t.error || !t.id || !t.entry) return E(t.error ?? "Check the fields.");
							if (_.scope === "repository" && !y) return E("Tick the box to share this source in .avoozl.json.");
							A(async () => {
								await i.add(e, {
									id: t.id,
									entry: t.entry,
									scope: _.scope,
									confirmPublic: y
								}), v(Sf()), S(!1);
							});
						},
						disabled: C,
						children: "Add source"
					}), /* @__PURE__ */ b(f, {
						type: "button",
						onClick: () => v(Sf()),
						disabled: C,
						children: "Clear"
					})]
				})
			]
		})
	] });
}
// kirocrew-app/ui/src/design-chat.ts
var Vf = "docs/plugins.md", Hf = "Open a chat that helps you plan a plugin and write its files. It approves nothing.", Uf = `Read ${Vf}: the plugin contract, parts, sources and approval`, Wf = "Open a chat that suggests rules for you to paste here and save. What you type there stays in its transcript, so type truly private words straight into the editor.", Gf = (e) => e.length ? e.join(", ") : "none";
function Kf(e) {
	return [
		"Use the avoozl-plugin skill to help me design an Avoozl plugin.",
		"Ask what it is for and which system it talks to, then help me pick its parts, its source (folder, package or git) and whether it applies to this computer only or is shared with the repo.",
		"Then write the plugin folder: avoozl-plugin.json, any pack, the entry module, and a test against a fake host.",
		`This Avoozl supports contract version ${Gf(e.supported.map(String))}. Plugins already declared here: ${Gf(e.installed)}.`,
		"Do not approve the plugin or import its pack; I do that in Settings > Plugins."
	].join(" ");
}
function qf(e) {
	return [
		"Use the avoozl-rules skill to help me plan an Avoozl content rule set.",
		"Ask what kind of text must stay out, then suggest rule and allow lines, where the set checks, and whether it blocks or reports.",
		"Do not write the terms file or save terms: I paste the lines into Settings > Content rules, check them with Try it, and save there.",
		"Remind me that terms typed in this chat stay in its transcript, so I type truly private words straight into the editor.",
		`Rule sets already here: ${Gf(e.sets)}.`
	].join(" ");
}
// docs/plugins.md?raw
var Jf = "# Writing a plugin\n\nA plugin adds to Avoozl without changing Avoozl itself. One plugin can\nbundle several parts, so a team installs one plugin and gets its settings,\nits content rules, its tracker and its intake source together:\n\n| Part      | What it is                                                                 | Runs code |\n| --------- | -------------------------------------------------------------------------- | --------- |\n| `pack`    | Settings a person previews and copies into `.avoozl.json` once             | No        |\n| `rules`   | Content rule sets supplied while Avoozl runs                               | Yes       |\n| `tracker` | A task tracker that keeps Avoozl's task records                            | Yes       |\n| `intake`  | An intake source: the tracker kind's `poll`, which brings outside work in | Yes       |\n| `route`   | A delivery route for tasks that are not run by a local worker              | Yes       |\n\nLocal and GitHub are the only built-in routes and trackers. Everything\nelse, including any integration that must stay private, is a separate\npackage or folder that plugs in here.\n\nThe examples on this page are the test-only plugins in Avoozl's own test\ntree: `src/app/test/fixtures/plugins/sdk-team/` bundles a pack, rules, a\ntracker and an intake source; `fake-route/`, `fake-tracker/` and\n`fake-rules/` each provide one part. Read them alongside this guide.\n\n## What a plugin is\n\nA plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module\nfor the parts that run code, and, with a pack, `avoozl-pack.json`:\n\n```json\n{\n  \"id\": \"sdk-team\",\n  \"version\": \"1.0.0\",\n  \"contract\": 1,\n  \"provides\": [\"pack\", \"rules\", \"tracker\", \"intake\"],\n  \"capabilities\": { \"tracker\": [\"actor\", \"poll\"], \"rules\": [] },\n  \"pack\": \"avoozl-pack.json\",\n  \"entry\": \"index.mjs\"\n}\n```\n\n- `id` is lowercase letters, digits and dashes. `local` and `github` are\n  reserved. Tasks name the plugin as `plugin:<id>`.\n- `version` changes whenever you release a new build.\n- `contract` is the contract version: which version of Avoozl's plugin\n  interface this plugin was built for. It is not the plugin's own version.\n  Settings shows it as **Contract version**. This Avoozl supports contract\n  version `1`.\n- `provides` lists the parts: `pack`, `rules`, `tracker`, `intake` and\n  `route`. `intake` runs as the `tracker` kind and needs the `poll`\n  capability. A manifest written before `provides` lists `kinds` instead\n  (`route`, `tracker`, `rules`), and each kind is its own part. With\n  `provides`, leave `kinds` out; if you keep it, it must match.\n- `capabilities` lists optional features per kind. A tracker may list\n  `edges`, `subtasks`, `actor`, `pause` and `poll`. A route lists none yet.\n- `pack` names the pack file inside the folder; it defaults to\n  `avoozl-pack.json`.\n- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides\n  only a pack runs no code, so it has no `entry`; Avoozl refuses one that\n  names an entry, and never starts a process for it.\n\nThe entry module exports one object per kind: `route`, `tracker`, or\n`rules`. Each\nmethod takes `(params, { config })` and returns a JSON value or a promise of\none:\n\n```js\nexport const route = {\n  submit({ task, brief }, { config }) { ... },\n  status({ id }, { config }) { ... },\n  completion({ id }, { config }) { ... },\n  cancel({ id }, { config }) { ... },\n};\n```\n\n## Declaring and approving a plugin\n\nA `plugins` entry declares each plugin, either in the repository's\n`.avoozl.json` (shared and reviewed in Git) or in this machine's\n`plugins.json`, beside the global Avoozl configuration\n(`~/.config/avoozl/plugins.json`, never committed):\n\n```json\n{\n  \"plugins\": [\n    {\n      \"id\": \"fake-route\",\n      \"path\": \"../fake-route\",\n      \"contract\": 1,\n      \"config\": { \"stateFile\": \"route-state.json\" }\n    }\n  ]\n}\n```\n\n- Name exactly one of `path` (a folder, relative to the file that declares\n  it), `package` (a package installed into the `plugins` folder beside\n  `plugins.json`), or `git` (below).\n- `config` is plain data passed to every call. It never holds a credential. A\n  key ending in `Env`, such as `tokenEnv`, names the environment variable the\n  plugin reads its credential from; Avoozl passes that variable, and only the\n  variables `config` names this way, to the plugin.\n- Declare a plugin whose name must stay private in `plugins.json`. Settings\n  asks you to confirm before it saves a `plugins` entry into `.avoozl.json`.\n\n### Add plugin in Settings\n\n**Settings > Plugins > Add plugin** walks four steps, with Cancel on each:\n\n1. **Where from**: open Folder, Package or Git and fill it in. Each keeps\n   what you typed until you cancel. Git shows the exact commit its ref names.\n2. **What**: the id, version, kinds and capabilities the plugin's own\n   `avoozl-plugin.json` declares. The id and **Contract version** come from\n   that file; a git plugin, whose files are fetched later, picks a supported\n   contract version. A package's optional version is checked against the\n   installed package; the entry stores no version, the approval pins it.\n3. **Applies to**: this computer only (`plugins.json`) or shared with the\n   repository (`.avoozl.json`). A shared plugin is approved on each computer\n   for itself; a shared package is installed on each, and a shared git plugin\n   is fetched on each with **Update**. A shared folder is a path inside the\n   repository, relative to it.\n4. **Review and approve**: the version, content hash and, for git, the commit.\n   Cancel here removes the entry step 3 declared.\n\n### A plugin from a git repository\n\n```json\n{ \"id\": \"fake-route\", \"git\": \"https://git.example.com/team/fake-route.git\",\n  \"ref\": \"v1.0.0\", \"subdir\": \"plugin\", \"contract\": 1 }\n```\n\n`git` is a URL or a local repository path. `ref` is a tag, a branch or a full\ncommit, and `subdir` is the plugin's folder inside the repository. **Add from\ngit** in Settings (or `avoozl plugins add ID --git URL --ref REF`) resolves\n`ref` to one commit, fetches only that commit into\n`plugins/git/<id>/<commit>/` beside `plugins.json`, and stores the commit on\nthis machine. Git runs as you, with your credential helper or SSH key, so\nprivate repositories work. Git hooks are off, submodules are skipped, and\nAvoozl runs no `npm install`: commit the plugin ready to run, bundled or with\n`node_modules`. The approval names the commit, so a new commit needs a new\napproval. **Update** (or `avoozl plugins update ID`) resolves `ref` again.\nThe tick never fetches. Avoozl refuses a URL with a password or token in it,\na `subdir` outside the repository, and a commit with no `avoozl-plugin.json`.\n\nNothing loads until a person approves the plugin in **Settings** (or with\n`avoozl plugins approve ID --hash HASH`). Settings shows the id, version,\neach part, the code kinds it runs as, capabilities, location and content\nhash, a SHA-256 over every file in the folder, the pack included. The\napproval lists the parts and is stored on this machine only. Any change to\nthe version or to any file needs approval again. The tick and example\ninstallation never approve a plugin.\n\nA plugin **shared with the repo** puts its entry in `.avoozl.json`, where\nit is committed and reviewed like any other change. Each computer still\napproves it for itself. Because a shared entry is the same on every\ncomputer, its `config` holds no machine path: name an environment variable\n(`termsFileEnv`, `stateFileEnv`) that holds each computer's own path, as the\n`sdk-team` sample does.\n\n## How Avoozl runs a plugin\n\n- Each approved plugin runs in its own Node child process. Avoozl talks to it\n  in JSON lines over stdin and stdout, and gives it no port.\n- A plugin may call its own system over the network. It must not open a\n  listener. A plugin that listens is stopped and marked broken.\n- Write nothing to stdout yourself; it carries the protocol. `console.log`\n  output goes to stderr, which Avoozl discards.\n- Each call has a time limit (20 seconds by default) inside the tick's own\n  time budget.\n- Every reply is checked against the contract. Links must be `http` or\n  `https`. Reply text is untrusted data: Avoozl quotes it as data in briefs\n  and escapes it in views.\n- When a plugin is missing, unapproved, disabled, crashes, times out, replies\n  with the wrong shape, or expects an unsupported contract, Avoozl marks it\n  unavailable for that tick. Its tasks show \"needs you\" with the reason, and\n  every other task keeps moving. The next tick tries again. A plugin's tasks\n  never fall back to another route or tracker on their own.\n\n## Route kind\n\nA task whose manifest entry says `\"route\": \"plugin:<id>\"` is delivered by\nthat route instead of a local worker session. One graph can mix routes, for\nexample a local leaf, then a remote one, then a local one.\n\n| Call                    | Reply                                                                            |\n| ----------------------- | -------------------------------------------------------------------------------- |\n| `submit({task, brief})` | `{id, link}`: the remote ID and a link to the work                               |\n| `status({id})`          | `{state, link?, reason?}`: `queued`, `running`, `needs-person`, `failed`, `done` |\n| `completion({id})`      | `{pr?, answer?}`: a pull request link, an answer, or both                        |\n| `cancel({id})`          | `{cancelled}`                                                                    |\n\n- `submit` gets the task's own title, summary, acceptance and checks, and a\n  brief. Make it idempotent by task ID.\n- The tick reads `status` every tick until the work is done. `needs-person`\n  shows the task as \"needs you\" with your link.\n- A remote task is done only when `status` says `done` and `completion`\n  returns its result. Each dependent's brief quotes that result as data.\n- `failed` stops the task for a person. `route.resubmit` starts it again.\n\n## Tracker kind\n\nA task with `\"authority\": \"plugin:<id>\"` keeps its record in that tracker,\nthe way a GitHub task keeps its record in an issue. SQLite only caches it:\ndirect edits are refused, and changes go through the plan and projection.\n\n| Call                               | Reply                                                                                  |\n| ---------------------------------- | -------------------------------------------------------------------------------------- |\n| `project({task, desired, marker})` | `{id, link, marker}`: create or update the record, idempotent by namespace and task ID |\n| `read({ids})`                      | `{records: [...]}`: each record's state and fields                                     |\n| `list({namespace})`                | `{records: [...]}`: every record carrying this namespace, for rebuild                  |\n| `close({id, reason})`              | `{closed}`: close with reason `completed` or `not_planned`                             |\n\nEach record in a `read` or `list` reply has:\n\n- `id`, `link`, `state` (`open` or `closed`), and `closeReason` when closed;\n- `fields`: the managed values as they are in the tracker now: `title`,\n  `section` (the managed description section) and `tags`, plus `blockedBy`\n  with the `edges` capability;\n- `marker`: the namespace, task ID and last applied values Avoozl stored with\n  the record, returned unchanged;\n- with the `actor` capability, `closedBy` and `pausedBy`: who closed or paused\n  it; with `pause`, `paused`.\n\nRules a tracker plugin must follow:\n\n- **Store the marker.** Keep the `marker` from `project` with the record (a\n  hidden field or a managed description section) and return it unchanged from\n  `project`, `read` and `list`. A plugin that does not is refused as a\n  tracker.\n- **Edges.** Without the `edges` capability, the graph stays in Avoozl: its\n  edges come from the approved plan. With `edges`, `desired.blockedBy` lists\n  the record IDs that block this one; store them as the tracker's own links.\n- **Edit only managed fields.** Avoozl changes the title, the managed section,\n  managed tags and, with `edges`, blocking links. A field a person changed is a\n  conflict that Avoozl reports and leaves alone.\n- **Completion is Avoozl's.** Avoozl decides a task is done and then calls\n  `close(id, \"completed\")`. A close or pause by someone else is judged with\n  the actor you report, against the entry's `config.allowedActors`. Without\n  the `actor` capability, every outside close holds the task's dependents for\n  a person.\n\n## Rules kind\n\nA rules plugin supplies content rule sets: terms Avoozl must never write\n(see \"Ban private terms\" in `docs/policies.md`). It lets a team ship its\nlist as a private package that public Avoozl never sees.\n\n| Call           | Reply                                             |\n| -------------- | ------------------------------------------------- |\n| `ruleSets({})` | `{sets: [{id, version, rules: [{id, pattern}]}]}` |\n\n- `pattern` is a regular expression, matched per line ignoring case.\n- A set or rule must not carry `allow`. Allow lines exist only in a person's\n  own terms file; a plugin writes its exception into the pattern itself\n  (for example `\\bzebra\\b(?!-ui)`). A reply with `allow` is refused, which\n  makes that plugin's sets unavailable.\n- A `.avoozl.json` set `{ \"id\": \"<set id>\", \"plugin\": \"<plugin id>\" }` picks\n  one set by id. In **Settings > Content rules**, pick the plugin as the set's\n  **Rules plugin**; such a set has no terms file to edit there.\n- Without a plugin, a set's rules live in its terms file,\n  `.avoozl/local/content-rules/<set id>.txt`, one `name: pattern` per line,\n  plus `allow:` lines for false matches.\n  Settings edits it with a Rule builder (word or phrase, or pattern) and a\n  File view, writes it readable by your account only, and refuses to write\n  it where Git could commit it. **How rules work** on that tab explains the\n  format with made-up examples.\n- Avoozl keeps the rules in memory for the tick. It never writes them to\n  SQLite, receipts, or Git; findings record the set's `version`.\n- A plugin that is missing, unapproved, or broken makes only its own sets\n  unavailable, and every boundary those sets cover writes nothing until it is\n  fixed.\n\n## Pack part\n\nA pack is settings only. Avoozl never runs anything from it. It is one JSON\nfile:\n\n```json\n{\n  \"description\": \"Triage labels, triggers and who counts for SDK repositories.\",\n  \"settings\": {\n    \"repositories\": {\n      \"minimumPermission\": \"write\",\n      \"rules\": [\n        { \"id\": \"deliver\", \"action\": \"deliver\",\n          \"match\": \"label:avoozl:deliver -label:needs-triage -label:response-requested\" }\n      ],\n      \"untriaged\": { \"filter\": \"label:needs-triage\",\n                     \"triageLabels\": [\"response-requested\", \"closing-soon\"] }\n    },\n    \"project\": { \"fields\": { \"status\": \"Status\", \"release\": \"Release\" } },\n    \"contentRules\": { \"sets\": [{ \"id\": \"team-terms\", \"plugin\": \"sdk-team\" }] }\n  }\n}\n```\n\nWhat a pack may set, and where each lands in `.avoozl.json`:\n\n| Pack key                     | Sets                                                                                                                                                       |\n| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |\n| `settings.repositories`      | For each repository you pick at import: `rules` (trigger `match` lines), `untriaged`, `allowedActors`, `minimumPermission`, `requiredChecks`, `priority`, `managedLabels`, `concurrency` |\n| `settings.project`           | `github.project.fields` and `statusValues`, when a GitHub Project is set                                                                                   |\n| `settings.epicIssueType`     | `github.epicIssueType`                                                                                                                                     |\n| `settings.contentRules.sets` | Rule set references by id (`plugin`, `action`, `boundaries`), never rules                                                                                  |\n| `settings.delivery`          | `reviewers` (review roles), `agent`, `model`, `runner`, `concurrency`                                                                                      |\n| `settings.flow`              | Flow settings, such as `batch.max`                                                                                                                         |\n\n- Every key is checked with the same rules Settings uses. Any other key is\n  refused by name, such as `Pack key settings.repositories.autoMerge is not\n  a pack setting.`, and the plugin shows as invalid until it is fixed.\n- A pack cannot hold a credential or a content rule pattern. Terms come\n  from the `rules` part at run time, so they are never stored in a public\n  repository.\n- A pack has no follow mode and no org minimums. Avoozl copies the\n  settings once; after that they are the repository's own settings.\n\n**Import.** On the plugin's card in **Settings > Plugins**, **Preview and\nimport pack** shows each setting as **Create**, **Change**, **Keep** or\n**Skip** (a setting that cannot apply here, such as Project fields with no\nProject set), with the old and new values. Nothing is written until\n**Import settings**, and only:\n\n- after this computer approved this exact plugin version;\n- for the exact preview shown: if the pack or `.avoozl.json` changed since,\n  Avoozl asks you to preview again;\n- when a setting would let more people give orders than before (a lower\n  `minimumPermission`, or new `allowedActors`), only after you accept that\n  change, which the preview names on its own line;\n- for a plugin declared on this computer only, after you confirm that its\n  id and settings go into `.avoozl.json`.\n\nImport writes `packs` into `.avoozl.json`: for each plugin, the version\nimported, when and by whom, and the settings that came from it. When a\nnewer version arrives, approve it, and the card offers its preview again;\nimporting it records the new version. At the command line:\n\n```sh\navoozl plugins pack-preview sdk-team\navoozl plugins pack-import sdk-team --preview HASH [--accept-lowered]\n```\n\n## Intake part\n\nAn intake source is a tracker kind with the `poll` capability, listed in\n`provides` as `intake`. The fake tracker (`fake-tracker/`) is the example:\nits `poll` reads a JSON file of items and returns those changed since the\ncursor.\n\n| Call                    | Reply                                                                   |\n| ----------------------- | ----------------------------------------------------------------------- |\n| `poll({cursor, limit})` | `{items, cursor, more}`: items changed since `cursor`, at most `limit` |\n\n```js\nexport const tracker = {\n  poll({ cursor, limit }, { config }) {\n    const changed = readItems(config).filter(\n      (item) => !cursor || mark(item) > cursor,\n    );\n    const page = changed.slice(0, limit);\n    return {\n      items: page,\n      cursor: page.length ? mark(page.at(-1)) : cursor,\n      more: changed.length > page.length,\n    };\n  },\n};\n```\n\n- `cursor` is your own text of at most 2,000 characters, or null on the\n  first poll. Return the cursor for the next poll and `more: true` when a\n  page is left. Avoozl asks for at most 500 items, polls each source at most\n  once per tick, and stores the new cursor only after every item of the\n  reply is handled, so a crash replays the same page. A failed poll keeps\n  the cursor and the items and shows the error on the source.\n- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,\n  `review` or `ticket`), `title`, `state` (`open` or `closed`), and\n  `updatedAt`; and may have `body`, `labels`, `author`, `assignees`,\n  `closeReason`, `closedBy`, `closedAt`, `fields` (text, number or\n  true/false values) and `trigger`. An item that breaks a limit is refused\n  with a reason naming the field; the other items of the reply still count.\n- `trigger` is `{actor, permission, eventId, at}`: who last changed what a\n  rule would match, and that person's standing in your system, mapped to\n  `none`, `read`, `triage`, `write`, `maintain` or `admin`. Avoozl checks it\n  against the source's `allowedActors` and `minimumPermission` (default\n  `write`). Without the `actor` capability nobody counts, so your items only\n  list, pause or quarantine. A close counts as an order only when\n  `closedBy` is the trigger's actor and that actor counts.\n- A plugin that provides `intake` but not `tracker` is never asked to\n  `project`, `read`, `list` or `close`. Avoozl writes nothing back to an\n  intake source.\n\nDeclare the source under `intake.sources`, in `.avoozl.json` or in this\nmachine's `plugins.json` when its name must stay private:\n\n```json\n{\n  \"intake\": {\n    \"sources\": {\n      \"tickets\": {\n        \"via\": \"plugin:fake-tracker\",\n        \"repository\": \"example/app\",\n        \"labelFields\": [\"component\"],\n        \"minimumPermission\": \"write\"\n      }\n    }\n  }\n}\n```\n\n`repository` names a registered repository: its trigger rules apply, and a\ndelivered item's task lands there. A rule matches a source's items only\nwith a `source:` term, such as `label:go source:tickets`; a rule without\none matches GitHub only. `labelFields` adds a `<field>:<value>` label per\nfield and `assigneeField` an assignee before matching. Items no rule takes\nshow in the **Intake** tab with their source.\n\n## Testing your plugin\n\nCopy the fake plugins' approach: keep the remote system in a file or a local\nstand-in, declare the plugin in a temporary `plugins.json`, approve its hash,\nand run ticks. Avoozl's proof P26 does exactly this with the two fakes, and\nproof P35 installs, previews, imports and polls the `sdk-team` bundle.\nProof P32 polls the fake tracker as an intake source.\n";
// kirocrew-app/ui/src/PluginsSettings.tsx
function Yf({ row: e }) {
	let t = Object.entries(e.capabilities ?? {}).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; "), n = [
		["Version", e.version],
		[$d, e.contract === void 0 ? void 0 : String(e.contract)],
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
function Xf({ row: e }) {
	let t = sf(e);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: "mt-2 flex flex-col gap-1 text-xs",
		"data-plugin-parts": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", { children: [
			/* @__PURE__ */ b("span", {
				className: "font-semibold",
				children: of[t]?.title ?? t
			}),
			/* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" ", of[t]?.line]
			}),
			t === "pack" && e.pack ? /* @__PURE__ */ b("span", {
				className: "block text-muted",
				children: e.pack.imported ? `Imported version ${e.pack.imported.version}: ${e.pack.imported.settings.length} settings.${e.pack.offer ? ` Version ${e.version} is not imported yet.` : ""}` : "Not imported yet."
			}) : null
		] }, t))
	}) : null;
}
function Zf(e) {
	let { row: t, busy: n, act: r, client: i, workspaceId: a } = e, o = vf(t), s = t.id ?? "";
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ b(m, { children: t.id ?? "Unnamed entry" }),
				/* @__PURE__ */ b(J, {
					variant: o.attention ? "warning" : void 0,
					children: o.label
				}),
				t.health?.state === "ok" ? /* @__PURE__ */ b(J, { children: "Healthy" }) : null
			]
		}),
		t.reason ? /* @__PURE__ */ b("p", {
			className: "mt-1 text-xs text-muted",
			children: t.reason
		}) : null,
		t.health?.state === "unavailable" && t.health.reason !== t.reason ? /* @__PURE__ */ x("p", {
			className: "mt-1 text-xs text-muted",
			children: ["Last tick: ", t.health.reason]
		}) : null,
		/* @__PURE__ */ b(Xf, { row: t }),
		/* @__PURE__ */ b(Yf, { row: t }),
		t.id ? /* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-wrap gap-2",
			children: [
				t.pack ? /* @__PURE__ */ b(Q, {
					tooltip: "See what each pack setting would create, change or keep, then import it",
					primary: t.pack.offer && t.state === "approved",
					disabled: n,
					onClick: () => e.onImport(t),
					children: t.pack.imported && t.pack.offer ? `Preview version ${t.version}` : t.pack.imported ? "Preview pack" : "Preview and import pack"
				}) : null,
				yf(t) ? /* @__PURE__ */ x(Q, {
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
				t.git ? /* @__PURE__ */ b(Q, {
					tooltip: "Fetch the ref's current commit. A new commit needs approval again.",
					disabled: n,
					onClick: () => r(() => i.update(a, s)),
					children: t.commit ? `Update from ${t.git.ref}` : `Fetch ${t.git.ref}`
				}) : null,
				t.state === "disabled" ? /* @__PURE__ */ b(Q, {
					tooltip: "Let this plugin run again",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !1)),
					children: "Enable"
				}) : t.state !== "invalid" && t.state !== "missing" ? /* @__PURE__ */ b(Q, {
					tooltip: "Stop this plugin from running. Enable undoes it.",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !0)),
					children: "Disable"
				}) : null,
				/* @__PURE__ */ b("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ b(Vr, {
						icon: Ae,
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
function Qf({ workspaceId: e }) {
	let n = l(), r = o(() => xf(n), [n]), { value: i, error: a, busy: s, reload: d } = Fi(e, t((e) => r.list(e), [r])), [f, m] = c(!1), [g, _] = c(null), [v, y] = c(null), [S, C] = c(null), [w, T] = c(!1), { openChat: E } = u(), D = () => E({
		message: Kf({
			supported: i?.supportedContracts ?? [],
			installed: (i?.plugins ?? []).flatMap((e) => e.id ? [e.id] : [])
		}),
		autoSend: !1
	}), O = (e) => {
		m(!0), _(null), e().then(() => d()).catch((e) => _(Y(e))).finally(() => m(!1));
	}, A = fc("(min-width: 1024px)");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				"data-plugin-help": !0,
				children: [/* @__PURE__ */ b(X, {
					icon: K,
					tooltip: Hf,
					onClick: D,
					children: "Design a plugin"
				}), /* @__PURE__ */ b(X, {
					icon: k,
					tooltip: Uf,
					onClick: () => T(!0),
					children: "Plugin guide"
				})]
			}),
			w ? /* @__PURE__ */ b(rs, {
				workspaceId: e,
				target: {
					document: Vf,
					lineStart: null,
					lineEnd: null
				},
				text: Jf,
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
			v ? /* @__PURE__ */ b(Of, {
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
				style: A ? {
					display: "grid",
					gridTemplateColumns: "minmax(18rem, 2fr) minmax(0, 3fr)",
					gap: 14,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 14
				},
				children: [/* @__PURE__ */ b(If, {
					workspaceId: e,
					client: r,
					supported: i?.supportedContracts ?? [],
					onChanged: d
				}), /* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-col gap-3",
					"aria-label": "Installed plugins",
					children: [i && !i.plugins.length ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(h, {
						title: "No plugins",
						subtitle: "Nothing loads until a plugin is declared and approved. Add one on the left."
					}) }) : null, i?.plugins.map((t, n) => /* @__PURE__ */ b(Zf, {
						row: t,
						busy: f || s,
						act: O,
						client: r,
						workspaceId: e,
						onImport: y
					}, `${t.id}-${t.source}-${n}`))]
				})]
			}),
			/* @__PURE__ */ b(Bf, {
				workspaceId: e,
				plugins: i?.plugins ?? []
			})
		]
	});
}
// kirocrew-app/ui/src/content-api.ts
var $f = {
	plan: "Plan files",
	github: "GitHub text",
	brief: "Session briefs",
	diff: "Worker diffs",
	intake: "Incoming items"
}, ep = {
	plan: "Spec files when a plan is saved or approved.",
	github: "Issue, comment and pull request text Avoozl writes.",
	brief: "The brief a worker session starts with.",
	diff: "Lines a worker adds, checked before a push.",
	intake: "Items that come in from a plugin source or MCP. Only checked when you tick it."
}, tp = Object.keys($f), np = tp.filter((e) => e !== "intake");
function rp(e) {
	return e.source === "plugin" ? `Rules plugin ${e.plugin}${e.version ? `, version ${e.version}` : ""}` : e.source === "policy" ? ".avoozl.json" : e.termsFrom === "machine" ? "Terms file named in this machine’s settings" : "Terms file in .avoozl/local/content-rules";
}
function ip(e) {
	let t = e.boundaries ? e.boundaries.map((e) => $f[e] ?? e).join(", ") : "Every boundary but incoming items";
	return e.repositories ? `${t} in ${e.repositories.join(", ")}` : t;
}
var ap = {
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
}, op = (e) => ap[e]?.name ?? e, sp = (e, t) => {
	let n = ap[e]?.modes;
	return !n || n.includes(t ?? "");
}, cp = () => ({
	id: "",
	action: "block",
	boundaries: [...np],
	repositories: [],
	plugin: ""
}), lp = (e) => ({
	id: e.id,
	action: e.action,
	boundaries: e.boundaries ?? [...np],
	repositories: e.repositories ?? [],
	plugin: e.plugin ?? ""
}), up = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function dp(e, t) {
	let n = e.id.trim();
	return n ? n.toLowerCase().startsWith("builtin:") ? { error: "Names starting builtin: are reserved." } : up.test(n) ? t.includes(n) ? { error: `A set named ${n} already exists.` } : e.boundaries.length ? { entry: {
		id: n,
		...e.action === "report" ? { action: "report" } : {},
		...e.boundaries.length && !(e.boundaries.length === np.length && np.every((t) => e.boundaries.includes(t))) ? { boundaries: tp.filter((t) => e.boundaries.includes(t)) } : {},
		...e.repositories.length ? { repositories: [...e.repositories] } : {},
		...e.plugin ? { plugin: e.plugin } : {}
	} } : { error: "Pick at least one place to check." } : { error: "Use lowercase letters, digits, dots, dashes or underscores." } : { error: "Give the set a name." };
}
var fp = (e) => dp(lp(e), []).entry ?? { id: e.id }, pp = /[.*+?^${}()|[\]\\]/g, mp = (e) => e.replace(pp, "\\$&"), hp = (e) => e.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
function gp(e) {
	let t = hp(e);
	return mp(t) === e ? {
		kind: "word",
		value: t
	} : {
		kind: "pattern",
		value: e
	};
}
function _p(e) {
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
		let r = t.slice(0, n).trim(), i = gp(t.slice(n + 1).trim()), a = vp.exec(r);
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
var vp = /^allow(?:\s+(.*))?$/i, yp = (e, t) => e === "word" ? mp(t.trim()) : t.trim();
function bp(e) {
	return e.kind === "blank" ? "" : e.kind === "note" ? `# ${e.text}` : e.kind === "raw" ? e.text : e.kind === "allow" ? `allow${e.rule.trim() ? ` ${e.rule.trim()}` : ""}: ${yp(e.match, e.value)}` : `${e.name.trim()}: ${yp(e.kind, e.value)}`;
}
var xp = (e) => e.length ? e.map(bp).join("\n") + "\n" : "", Sp = (e) => [...new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name.trim()] : []))].filter(Boolean);
function Cp(e, t = []) {
	if (e.kind === "raw") return "Needs a name, a colon, then the word or pattern.";
	if (e.kind === "allow") return e.rule.trim() && !Sp(t).includes(e.rule.trim()) ? "Allows a rule this file does not have." : e.value.trim() ? e.match === "pattern" ? wp(e.value) : null : "Give a word, phrase or pattern to allow.";
	if (e.kind !== "word" && e.kind !== "pattern") return null;
	let n = e.name.trim();
	return n ? n.includes(":") ? "A name cannot hold a colon." : /^#/.test(n) ? "A name cannot start with #." : vp.test(n) ? "A name cannot start with allow; use an Allow row." : e.value.trim() ? e.kind === "pattern" ? wp(e.value) : null : "Give a word, phrase or pattern." : "Give the rule a name.";
}
function wp(e) {
	try {
		new RegExp(e.trim(), "i");
	} catch (e) {
		return `The pattern does not compile (${String(e.message).split(": ").pop()}).`;
	}
	return null;
}
function Tp(e) {
	let t = _p(e);
	return t.flatMap((e, n) => {
		let r = Cp(e, t);
		return r ? [{
			line: n + 1,
			message: r
		}] : [];
	});
}
var Ep = (e) => e.filter((e) => e.kind === "word" || e.kind === "pattern").length, Dp = (e) => e.filter((e) => e.kind === "allow").length;
function Op(e) {
	let t = new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name] : [])), n = e.length + 1;
	for (; t.has(`rule-${n}`);) n += 1;
	return `rule-${n}`;
}
function kp(e, t) {
	let n = t.flatMap((e) => e.kind === "allow" && !Cp(e, t) ? [{
		rule: e.rule.trim(),
		re: new RegExp(yp(e.match, e.value), "i")
	}] : []), r = t.flatMap((e) => {
		if (e.kind !== "word" && e.kind !== "pattern" || Cp(e, t)) return [];
		let r = e.name.trim();
		return [{
			name: r,
			re: new RegExp(yp(e.kind, e.value), "gi"),
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
function Ap(e, t) {
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
function jp(e) {
	let t = async (t, n, r) => (await e.post(At, {
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
var Mp = "avoozl-content-help";
function Np() {
	let e = document.getElementById(Mp);
	e && (e.open = !0, e.scrollIntoView({
		behavior: "smooth",
		block: "start"
	}));
}
function Pp({ children: e = "How rules work" }) {
	return /* @__PURE__ */ x("button", {
		type: "button",
		className: "inline-flex items-center gap-1 text-xs underline",
		onClick: Np,
		"data-help-link": !0,
		children: [/* @__PURE__ */ b(k, {
			size: 12,
			"aria-hidden": "true"
		}), e]
	});
}
var Fp = {
	border: "1px solid var(--border)",
	borderRadius: 10,
	background: "color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))"
};
function Ip(e) {
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
				e.locked && /* @__PURE__ */ b(me, {
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
function Lp(e) {
	let { value: t, selection: n } = e, r = (e, t) => n?.kind === e && "id" in n && n.id === t, i = /* @__PURE__ */ b(X, {
		icon: Se,
		primary: !0,
		onClick: () => e.onSelect({ kind: "new" }),
		tooltip: "Make a set of your own words to block or report",
		children: "Add rule set"
	});
	return /* @__PURE__ */ x("nav", {
		"aria-label": "Rule sets",
		className: "flex flex-col gap-3 p-3",
		style: Fp,
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
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(Pp, {}) })
				]
			}) : /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5",
				children: t?.sets.map((t) => /* @__PURE__ */ b(Ip, {
					title: t.id,
					selected: r("set", t.id),
					onClick: () => e.onSelect({
						kind: "set",
						id: t.id
					}),
					note: t.available ? /* @__PURE__ */ b("span", {
						className: "text-[11px] text-muted",
						children: t.action === "report" ? "Reports" : "Blocks"
					}) : /* @__PURE__ */ b(J, {
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
						children: t?.builtins.map((n) => /* @__PURE__ */ b(Ip, {
							locked: !0,
							title: op(n.id),
							raw: n.id,
							selected: r("builtin", n.id),
							onClick: () => e.onSelect({
								kind: "builtin",
								id: n.id
							}),
							note: sp(n.id, t?.mode) ? null : /* @__PURE__ */ b("span", {
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
function Rp({ rows: e }) {
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
function zp({ id: e, appliesAt: t, mode: n }) {
	let r = ap[e], i = sp(e, n);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-rule-details": e,
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
				className: "flex items-center gap-2 text-base font-semibold",
				children: [
					/* @__PURE__ */ b(me, {
						size: 14,
						"aria-hidden": "true",
						style: { color: "var(--muted)" }
					}),
					op(e),
					i ? /* @__PURE__ */ b(J, { children: "Always on" }) : /* @__PURE__ */ b(J, { children: "Not used" })
				]
			}), /* @__PURE__ */ b("code", {
				className: "text-[11px] text-muted",
				children: e
			})] }),
			!i && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode."
			}),
			/* @__PURE__ */ b(Rp, { rows: [
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
function Bp(e) {
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
var Vp = (e, t, n) => n ? [.../* @__PURE__ */ new Set([...e, t])] : e.filter((e) => e !== t);
function Hp(e) {
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
				}), /* @__PURE__ */ b(Wr, {
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
						icon: B,
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
					children: tp.map((e) => /* @__PURE__ */ b(Bp, {
						label: $f[e],
						hint: ep[e],
						checked: t.boundaries.includes(e),
						onChange: (r) => n({ boundaries: Vp(t.boundaries, e, r) })
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
						children: r.repositories.map((e) => /* @__PURE__ */ b(Bp, {
							label: e,
							checked: t.repositories.includes(e),
							onChange: (r) => n({ repositories: Vp(t.repositories, e, r) })
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
var Up = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	padding: "4px 8px",
	fontSize: 13,
	minWidth: 0,
	width: "100%"
}, Wp = { fontFamily: "var(--mono, monospace)" }, Gp = {
	display: "grid",
	gridTemplateColumns: "minmax(6rem, 9rem) minmax(8rem, 10rem) minmax(0, 1fr) auto",
	gap: 8,
	alignItems: "center"
}, Kp = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
	gap: 6,
	alignItems: "center"
};
function qp(e) {
	let { row: t, index: n } = e, r = Cp(t, e.rows), i = `avoozl-term-error-${n}`, a = e.narrow ? Kp : Gp;
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
						...Up,
						...t.kind === "raw" ? Wp : { color: "var(--muted)" }
					}
				}),
				/* @__PURE__ */ b(Z, {
					icon: Ne,
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
	let o = t.kind === "allow", s = o ? t.match : t.kind, c = o ? `allow-${t.match}` : t.kind, l = (e, t, n) => e === t ? n : t === "pattern" ? mp(n) : gp(n).kind === "word" ? gp(n).value : n, u = (n) => {
		if (n === c) return;
		let r = n.endsWith("pattern") ? "pattern" : "word", i = l(s, r, t.value);
		n.startsWith("allow") ? e.onChange({
			kind: "allow",
			rule: o ? t.rule : "",
			match: r,
			value: i
		}) : e.onChange({
			kind: r,
			name: o ? Op(e.rows) : t.name,
			value: i
		});
	}, d = Sp(e.rows), f = o ? /* @__PURE__ */ x("select", {
		value: t.rule,
		"aria-label": `Rule allowed on line ${n + 1}`,
		onChange: (n) => e.onChange({
			...t,
			rule: n.target.value
		}),
		style: Up,
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
		style: Up
	}), p = /* @__PURE__ */ x("select", {
		value: c,
		"aria-label": `Kind on line ${n + 1}`,
		onChange: (e) => u(e.target.value),
		style: Up,
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
			...Up,
			...s === "pattern" ? Wp : {},
			...r ? { borderColor: "var(--danger)" } : {},
			...e.narrow ? { gridColumn: "1 / 3" } : {}
		}
	}), h = /* @__PURE__ */ b(Z, {
		icon: Ne,
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
function Jp(e) {
	let t = s(null), n = o(() => Tp(e.text), [e.text]), r = new Set(n.map((e) => e.line)), i = Math.max(1, e.text.replace(/\n$/, "").split("\n").length), a = {
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
function Yp({ rows: e }) {
	let [t, n] = c(""), r = o(() => kp(t, e), [t, e]), i = t.split("\n"), a = r.filter((e) => !e.allowed), s = r.length - a.length, l = [...new Set(a.map((e) => e.rule))];
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
			children: i.map((e, t) => /* @__PURE__ */ x("div", { children: [Ap(e, r.filter((e) => e.line === t)).map((e, t) => !e.rules.length && e.allowed ? /* @__PURE__ */ x("span", {
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
function Xp(e) {
	let { workspaceId: t, client: n, set: i } = e, [a, o] = c(null), [s, l] = c([]), [u, d] = c(""), [p, m] = c(""), [h, g] = Pr("content-terms-view", "inner", (e) => e === "file" ? "Back to File view" : "Back to Rule builder", "builder"), [_, y] = c(null), [S, C] = c(null), [w, T] = c(!1), E = fc("(max-width: 640px)");
	r(() => {
		let e = !0;
		return o(null), y(null), C(null), n.terms(t, i.id).then((t) => {
			if (!e) return;
			o(t);
			let n = t.text ?? "";
			d(n), m(n), l(_p(n));
		}).catch((t) => e && y(Y(t))), () => {
			e = !1;
		};
	}, [
		n,
		t,
		i.id
	]);
	let D = (e) => {
		l(e), d(xp(e)), C(null);
	}, O = (e) => {
		d(e), l(_p(e)), C(null);
	}, k = Tp(u), A = u !== p, j = async () => {
		T(!0), y(null);
		try {
			let r = await n.saveTerms(t, i.id, u);
			m(u), C(`Saved ${r.rules} rule${r.rules === 1 ? "" : "s"}.`), await e.onSaved();
		} catch (e) {
			y(Y(e));
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
							Ep(s),
							" rule",
							Ep(s) === 1 ? "" : "s",
							Dp(s) ? `, ${Dp(s)} allow` : "",
							!a.exists && !A ? ", no file yet" : ""
						]
					}),
					/* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(Pp, { children: "How a line works" })
					})
				]
			}),
			h === "builder" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				children: [
					Ep(s) === 0 && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "No rules yet. Add one: a name that shows in logs, and the word or pattern to find."
					}),
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-2",
						"aria-label": "Rules",
						children: s.map((e, t) => /* @__PURE__ */ b(qp, {
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
						children: [/* @__PURE__ */ b(X, {
							icon: Se,
							onClick: () => D([...s, {
								kind: "word",
								name: Op(s),
								value: ""
							}]),
							children: "Add rule"
						}), /* @__PURE__ */ b(X, {
							icon: Se,
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
			}) : /* @__PURE__ */ b(Jp, {
				text: u,
				onChange: O
			}),
			/* @__PURE__ */ b(Yp, { rows: s }),
			/* @__PURE__ */ x("p", {
				className: "flex items-start gap-1.5 text-xs text-muted",
				children: [/* @__PURE__ */ b(ke, {
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
					/* @__PURE__ */ b(f, {
						primary: !0,
						disabled: w || !A || k.length > 0,
						onClick: () => void j(),
						children: "Save terms"
					}),
					A && /* @__PURE__ */ b(f, {
						disabled: w,
						onClick: () => O(p),
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
function Zp(e) {
	let { set: t, value: n } = e, [i, a] = c(() => t ? lp(t) : cp()), [o, s] = c(null), [l, u] = c(!1), d = t ? JSON.stringify(fp(t)) : null;
	r(() => {
		a(t ? lp(t) : cp()), s(null);
	}, [d]);
	let p = n.sets.filter((e) => e.id !== t?.id), m = n.choices ?? {
		repositories: [],
		plugins: []
	}, h = dp(i, p.map((e) => e.id)), g = !t || JSON.stringify(h.entry) !== JSON.stringify(fp(t)), _ = async (t, r) => {
		u(!0), s(null);
		try {
			e.onSaved(await e.client.saveSets(e.workspaceId, t, n.configHash), r);
		} catch (e) {
			s(Y(e));
		} finally {
			u(!1);
		}
	}, v = () => {
		if (!h.entry) return s(h.error ?? "Check the form.");
		let e = n.sets.map((e) => e.id === t?.id ? h.entry : fp(e));
		_(t ? e : [...e, h.entry], String(h.entry.id));
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		"data-rule-details": t?.id ?? "new",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-start gap-2",
				children: [/* @__PURE__ */ x("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ x("h3", {
						className: "flex flex-wrap items-center gap-2 text-base font-semibold",
						children: [
							t ? t.id : "New rule set",
							t && /* @__PURE__ */ b(J, {
								variant: t.available ? "success" : "warning",
								children: t.available ? "Available" : "Unavailable"
							}),
							t && /* @__PURE__ */ b(J, { children: t.action === "report" ? "Reports" : "Blocks" })
						]
					}), /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: t ? "Your words to keep out of what Avoozl writes." : "Name it and pick where it checks. Add its words after you save."
					})]
				}), t && /* @__PURE__ */ b(Vr, {
					icon: Ae,
					disabled: l,
					confirm: {
						title: `Delete the rule set ${t.id}?`,
						body: "It is removed from .avoozl.json and stops checking. Its terms file stays on this machine, so a new set with the same name uses it again.",
						action: "Delete set"
					},
					onConfirm: () => void _(p.map(fp), null),
					children: "Delete set"
				})]
			}),
			t && /* @__PURE__ */ b(Rp, { rows: [
				["Rules from", rp(t)],
				["Checks", ip(t)],
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
					/* @__PURE__ */ b(Hp, {
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
						children: [/* @__PURE__ */ b(f, {
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
					/* @__PURE__ */ b(Xp, {
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
var Qp = String.raw`# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b`, $p = String.raw`# zebra falcon app is the public name
allow: zebra falcon app
# ACME-0000 is the sample ticket in the docs
allow ticket: \bacme-0000\b`;
function em() {
	return /* @__PURE__ */ x("details", {
		id: Mp,
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
						children: Qp
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
						children: $p
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "Where it checks"
					}),
					/* @__PURE__ */ b("ul", {
						className: "text-muted",
						children: tp.map((e) => /* @__PURE__ */ x("li", { children: [
							/* @__PURE__ */ x("span", {
								style: { color: "var(--text)" },
								children: [$f[e], ":"]
							}),
							" ",
							ep[e]
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
function tm({ workspaceId: e }) {
	let n = l(), i = o(() => jp(n), [n]), { value: a, error: s, reload: d } = Fi(e, t((e) => i.list(e), [i])), [f, p] = c(null), m = f ?? a;
	r(() => p(null), [a]);
	let [h, g] = c(null), _ = h && (h.kind === "new" || h.kind !== "set" || m?.sets.some((e) => e.id === h.id)) ? h : m?.sets[0] ? {
		kind: "set",
		id: m.sets[0].id
	} : m?.builtins[0] ? {
		kind: "builtin",
		id: m.builtins[0].id
	} : null, v = fc("(min-width: 860px)"), y = _?.kind === "set" ? m?.sets.find((e) => e.id === _.id) ?? null : null, S = _?.kind === "builtin" ? m?.builtins.find((e) => e.id === _.id) : void 0, { openChat: C } = u();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap gap-2",
				"data-rules-design": !0,
				children: /* @__PURE__ */ b(X, {
					icon: K,
					tooltip: Wf,
					onClick: () => C({
						message: qf({ sets: (m?.sets ?? []).map((e) => e.id) }),
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
				children: [/* @__PURE__ */ b(Lp, {
					value: m,
					selection: _,
					onSelect: g
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 rounded-lg border p-4",
					style: {
						borderColor: "var(--border)",
						background: "var(--card, var(--bg))"
					},
					children: m ? S ? /* @__PURE__ */ b(zp, {
						id: S.id,
						appliesAt: S.appliesAt,
						mode: m.mode
					}) : _?.kind === "new" || y ? /* @__PURE__ */ b(Zp, {
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
			/* @__PURE__ */ b(em, {})
		]
	});
}
// kirocrew-app/ui/src/PromptInstructions.tsx
var nm = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function rm(e) {
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
			/* @__PURE__ */ b(Ur, {
				id: `${e.id}-builtin`,
				title: `Built-in ${e.agent} prompt (read-only)`,
				children: e.builtIn ? /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 pb-2",
					children: [/* @__PURE__ */ b("pre", {
						className: "rounded border p-2 text-xs",
						style: {
							...nm,
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							maxHeight: "16rem",
							overflowY: "auto"
						},
						children: e.builtIn
					}), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(X, {
						icon: t ? A : ee,
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
				}), /* @__PURE__ */ b(bm, { rule: { required: !1 } })]
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
				style: nm
			}),
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(q, {
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
var im = { required: !1 }, am = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function om({ name: e }) {
	return /* @__PURE__ */ b(q, {
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
function sm(e) {
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
				}), /* @__PURE__ */ b(bm, { rule: im })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(om, { name: e.raw })
		]
	});
}
var cm = [
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
function lm({ workspaceId: e }) {
	let n = l(), i = o(() => js(n), [n]), { value: a, error: s, reload: u } = Fi(e, t((e) => i.settings(e), [i])), [d, m] = c(Us()), [h, _] = c(""), [v, y] = c(!1), [S, C] = c(null), [w, T] = c({
		list: [],
		error: null
	});
	r(() => {
		let e = !0;
		return i.models().then((t) => e && T({
			list: t,
			error: t.length ? null : "Kiro Crew listed no models; auto uses its default."
		}), () => e && T({
			list: [],
			error: "Kiro Crew's model list could not be read; auto uses its default."
		})), () => {
			e = !1;
		};
	}, [i]), r(() => {
		a && (m(Us(a.flow)), _(a.instructions ?? ""));
	}, [a]);
	let E = (e) => m({
		...d,
		...e
	}), D = async () => {
		if (!a) return;
		let t = Ws(d);
		if (t.error) return C({ error: t.error });
		y(!0), C(null);
		try {
			await i.saveSettings(e, {
				flow: t.flow,
				expectedHash: a.hash
			}), h !== (a.instructions ?? "") && await i.saveInstructions(e, h), C({ ok: "Saved." }), await u();
		} catch (e) {
			C({ error: Y(e) });
		} finally {
			y(!1);
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
	let O = d.scope || Hs.scope, k = d.localChecksFirst ? d.localChecksFirst === "on" : Hs.localChecksFirst;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-settings": !0,
		children: [/* @__PURE__ */ x(p, {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ b(Tm, {
					title: "Timing",
					blurb: "Always on. Avoozl records where each task's time goes; nothing to set."
				}),
				/* @__PURE__ */ b(Tm, {
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
								}), /* @__PURE__ */ b(bm, { rule: im })]
							}),
							/* @__PURE__ */ b(Wr, {
								id: "avoozl-flow-scope",
								label: "What to pause",
								value: O,
								onChange: (e) => E({ scope: e }),
								cards: cm.map((e) => ({ ...e }))
							}),
							/* @__PURE__ */ b(om, { name: "flow.stopTheLine.scope" })
						]
					})
				}),
				/* @__PURE__ */ x(Tm, {
					title: "Local checks first",
					blurb: "Run the checks here before any push, so CI only confirms. It matters only when sessions push.",
					children: [/* @__PURE__ */ x("label", {
						className: "flex flex-wrap items-center gap-2 text-sm",
						children: [
							/* @__PURE__ */ b("input", {
								type: "checkbox",
								checked: k,
								onChange: (e) => E({ localChecksFirst: e.target.checked ? "on" : "off" })
							}),
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								children: "Require a local pass before push"
							}),
							/* @__PURE__ */ b(bm, { rule: im })
						]
					}), /* @__PURE__ */ b(om, { name: "flow.localChecksFirst" })]
				}),
				/* @__PURE__ */ b(Tm, {
					title: "Batching",
					blurb: "Run small related tasks together to pay setup and checks once. 1 turns it off.",
					children: /* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [/* @__PURE__ */ b(sm, {
							id: "avoozl-flow-max",
							label: "Most tasks per run",
							raw: "flow.batch.max",
							width: "13rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-max",
								inputMode: "numeric",
								value: d.max,
								placeholder: String(Hs.max),
								onChange: (e) => E({ max: e.target.value })
							})
						}), /* @__PURE__ */ b(sm, {
							id: "avoozl-flow-by",
							label: "Group by",
							raw: "flow.batch.by",
							width: "12rem",
							children: /* @__PURE__ */ x("select", {
								id: "avoozl-flow-by",
								value: d.by,
								onChange: (e) => E({ by: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: am,
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
				}),
				/* @__PURE__ */ x(Tm, {
					title: "Retro",
					blurb: "A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.",
					children: [/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [
							/* @__PURE__ */ b(sm, {
								id: "avoozl-flow-every",
								label: "After this many tasks",
								raw: "flow.retro.everyTasks",
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-every",
									inputMode: "numeric",
									value: d.everyTasks,
									placeholder: String(Hs.everyTasks),
									onChange: (e) => E({ everyTasks: e.target.value })
								})
							}),
							/* @__PURE__ */ b(sm, {
								id: "avoozl-flow-slow",
								label: "Slow when over (× usual)",
								raw: "flow.retro.slowFactor",
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-slow",
									inputMode: "decimal",
									value: d.slowFactor,
									placeholder: String(Hs.slowFactor),
									onChange: (e) => E({ slowFactor: e.target.value })
								})
							}),
							/* @__PURE__ */ b(sm, {
								id: "avoozl-flow-model",
								label: "Model",
								raw: "flow.retro.model",
								width: "16rem",
								note: w.error ?? void 0,
								children: /* @__PURE__ */ b("select", {
									id: "avoozl-flow-model",
									value: d.model || Hs.model,
									onChange: (e) => E({ model: e.target.value === Hs.model ? "" : e.target.value }),
									className: "rounded border px-2 py-1 text-sm",
									style: am,
									children: Ds(w.list, d.model).map((e) => /* @__PURE__ */ b("option", {
										value: e.value,
										children: e.label
									}, e.value))
								})
							})
						]
					}), /* @__PURE__ */ b(rm, {
						id: "avoozl-flow-instructions",
						agent: "retro",
						builtIn: a.retroPrompt,
						value: h,
						onChange: _,
						raw: "flow.retro.instructions",
						placeholder: "What the retro should weigh, for example: fewer review rounds matter more than CI time.",
						note: "Saved on this machine only."
					})]
				})
			]
		}), /* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-3",
			children: [
				/* @__PURE__ */ b(f, {
					type: "button",
					primary: !0,
					disabled: v,
					onClick: () => void D(),
					children: v ? "Saving…" : "Save"
				}),
				S?.error && /* @__PURE__ */ b("span", {
					role: "alert",
					className: "text-sm text-danger",
					children: S.error
				}),
				S?.ok && /* @__PURE__ */ b("span", {
					className: "text-sm text-muted",
					children: S.ok
				}),
				/* @__PURE__ */ b("span", {
					className: "text-xs text-muted",
					children: "Writes flow in .avoozl.json."
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/SettingsView.tsx
var um = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, dm = (e = 220) => ({
	display: "grid",
	gap: 12,
	gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${e}px), 1fr))`,
	alignItems: "start"
}), fm = {
	sm: "9rem",
	md: "18rem",
	lg: "28rem"
}, pm = [
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
	}
], mm = {
	workspaces: "The Avoozl workspaces on this machine, each a folder with its own task database. Add one for each set of plans you keep apart.",
	repositories: "The code checkouts tasks change and land in, with their GitHub settings. Save only writes .avoozl.json.",
	github: "The mode, planning repository and Project board. Save only writes .avoozl.json; Set up GitHub creates what's missing, after showing each change.",
	plugins: "A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.",
	content: "Terms Avoozl must never write: in plan files, issues, comments, briefs and diffs. A match stops the write and asks you.",
	flow: "How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode."
}, hm = [
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
], gm = {
	mode: "Which repository this is, the branch pull requests merge into, and who writes the code.",
	triggers: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
	checks: "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
	reviews: "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub."
}, _m = {
	status: "Status field",
	release: "Release field",
	wave: "Wave field",
	iteration: "Iteration field",
	avoozlState: "Avoozl state field"
}, vm = {
	claim: "Claim label",
	needsHuman: "Needs-human label"
}, ym = {
	todo: "Ready option",
	inProgress: "In progress option",
	done: "Done option",
	deferred: "Deferred option"
};
function bm({ rule: e }) {
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
function xm(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? { maxWidth: fm[e.width] } : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(bm, { rule: e.rule })]
			}),
			e.children,
			e.rule?.blank && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.rule.blank
			}),
			e.raw && /* @__PURE__ */ b(q, {
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
function Sm(e) {
	return /* @__PURE__ */ b(xm, {
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
function Cm(e) {
	return /* @__PURE__ */ b(xm, {
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
			style: um,
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
function wm({ children: e }) {
	return /* @__PURE__ */ b("p", {
		className: "mt-1 text-xs text-muted",
		children: e
	});
}
function Tm(e) {
	let t = e.level === "sub" ? /* @__PURE__ */ b("h4", {
		className: "text-sm font-semibold",
		children: e.title
	}) : /* @__PURE__ */ b(m, { children: e.title });
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		"data-section": e.title,
		children: [/* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-start gap-2",
			children: [/* @__PURE__ */ x("div", {
				className: "min-w-0 flex-1",
				children: [t, e.blurb && /* @__PURE__ */ b("p", {
					className: "mt-0.5 text-xs text-muted",
					"data-blurb": !0,
					children: e.blurb
				})]
			}), e.actions && /* @__PURE__ */ b("div", {
				className: "ml-auto flex items-center gap-2",
				children: e.actions
			})]
		}), e.children]
	});
}
var Em = {
	all: "has all",
	any: "has any",
	none: "has none",
	assignee: "assigned to"
};
function Dm(e) {
	let t = l(), n = o(() => lu(t), [t]), [i, a] = c(null), [s, u] = c(null), d = !!e.untriaged, f = e.value.trim() || e.untriaged?.placeholder.trim() || "";
	r(() => {
		if (!f) {
			a(null), u(null);
			return;
		}
		let t = !0, r = setTimeout(() => {
			n(e.workspaceId, e.repository, f, d).then((e) => t && (a(e), u(null)), (e) => t && u(Y(e)));
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
			/* @__PURE__ */ x(xm, {
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
					children: cu
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
				children: uu(p.parsed).map((e) => /* @__PURE__ */ x("span", {
					className: "flex flex-wrap items-center gap-1",
					children: [/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: Em[e.kind]
					}), e.values.map((t) => /* @__PURE__ */ b(J, {
						variant: e.kind === "none" ? void 0 : "info",
						children: t
					}, t))]
				}, e.kind))
			}),
			p?.parsed && /* @__PURE__ */ b(Om, {
				preview: p,
				untriaged: d
			})
		]
	});
}
function Om({ preview: e, untriaged: t = !1 }) {
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
function km(e) {
	let t = l(), n = o(() => gl(t), [t]), [i, a] = c(null), { id: s, value: u, repository: d } = e, f = (t) => e.onChange({
		...u,
		...t
	}), p = /^[\w.-]+\/[\w.-]+$/.test(d);
	r(() => {
		if (a(null), !p) return;
		let t = !0;
		return n(e.workspaceId, d).then((e) => t && a(e), (e) => t && a({
			repository: d,
			labels: null,
			error: Y(e)
		})), () => {
			t = !1;
		};
	}, [
		p,
		d,
		e.workspaceId,
		n
	]);
	let m = _l(u.triageLabels, i?.labels ?? null), h = (e, t) => f({ triageLabels: t ? [...u.triageLabels, e] : u.triageLabels.filter((t) => t.toLocaleLowerCase() !== e.toLocaleLowerCase()) });
	return /* @__PURE__ */ x(Tm, {
		level: "sub",
		title: "Untriaged",
		blurb: "What the Intake tab's Untriaged filter lists for this repository: open issues and pull requests no rule, triage label or task covers.",
		children: [
			/* @__PURE__ */ b(Dm, {
				id: `${s}-untriaged-filter`,
				value: u.filter,
				repository: d,
				workspaceId: e.workspaceId,
				onChange: (e) => f({ filter: e }),
				untriaged: { placeholder: fu(u.triageLabels) }
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
						}), /* @__PURE__ */ b(bm, { rule: { required: !1 } })]
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
					/* @__PURE__ */ b(q, {
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
				children: [/* @__PURE__ */ b(Sm, {
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
								/* @__PURE__ */ b(bm, { rule: { required: !1 } })
							]
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "At most one Kiro Crew notice an hour, with the counts. Off by default."
						}),
						/* @__PURE__ */ b(q, {
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
function Am(e) {
	let { rule: t, id: n } = e, r = (n) => e.onChange({
		...t,
		...n
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 border-t pt-3",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				style: dm(180),
				children: [
					/* @__PURE__ */ b(Sm, {
						id: `${n}-id`,
						label: "Rule name",
						raw: "id",
						rule: { required: !0 },
						placeholder: "deliver-ready",
						value: t.id,
						onChange: (e) => r({ id: e })
					}),
					/* @__PURE__ */ b(Cm, {
						id: `${n}-action`,
						label: "Action",
						raw: "action",
						rule: { required: !0 },
						value: t.action,
						options: e.actions,
						none: "Choose",
						onChange: (e) => r({ action: e })
					}),
					/* @__PURE__ */ b(Sm, {
						id: `${n}-author`,
						label: "Opened by",
						raw: "author",
						placeholder: "anyone",
						value: t.author,
						onChange: (e) => r({ author: e })
					})
				]
			}),
			/* @__PURE__ */ b(Dm, {
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
					children: /* @__PURE__ */ b(Vr, {
						icon: Ae,
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
function jm({ roles: e }) {
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
function Mm({ review: e, repository: t }) {
	if (!e) return null;
	let n = e.repositories[t], r = n ?? e.reviewers;
	return /* @__PURE__ */ b(Tm, {
		level: "sub",
		title: "Avoozl reviewer chats",
		blurb: "Fresh chats that review each local delivery's exact commit before it merges. Edit them under delivery.reviewers in .avoozl.json.",
		children: e.error ? /* @__PURE__ */ x("p", {
			className: "text-sm text-danger",
			children: ["The delivery block is invalid: ", e.error]
		}) : r.length === 0 ? /* @__PURE__ */ b("p", {
			className: "text-sm text-muted",
			children: "No reviewer roles. Checks alone verify a delivery."
		}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x(wm, { children: [
			n ? "Set for this repository." : "The workspace roles.",
			" Writer model ",
			e.writerModel ?? "not named",
			"."
		] }), /* @__PURE__ */ b(jm, { roles: r })] })
	});
}
gm.checks;
function Nm(e) {
	let [t, n] = c(""), r = e.inspect?.checks ?? null, i = Nu(e.value, r), a = /^[\w.-]+\/[\w.-]+$/.test(e.repository), o = () => {
		let r = t.trim();
		r && (e.onChange(Pu(e.value, r, !0)), n(""));
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
		}), /* @__PURE__ */ b(Sm, {
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
							onChange: (n) => e.onChange(Pu(e.value, t.name, n.target.checked))
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
				children: [/* @__PURE__ */ b(Sm, {
					id: `${e.id}-check-extra`,
					label: "Add another name",
					placeholder: "a check not run yet",
					width: "md",
					value: t,
					onChange: n
				}), /* @__PURE__ */ b(Q, {
					tooltip: "Add this exact, case-sensitive check name to the list",
					onClick: o,
					disabled: !t.trim(),
					children: "Add"
				})]
			})
		]
	});
}
function Pm(e) {
	let t = e.inspect?.reviewRule?.url ?? (e.repository ? `https://github.com/${e.repository}/settings/rules` : null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [
			/* @__PURE__ */ b("p", { children: Iu(e.inspect) }),
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
					/* @__PURE__ */ b(J, { children: "deprecated" }),
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
						children: /* @__PURE__ */ b(Vr, {
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
function Fm(e) {
	let { repository: t, choices: n } = e, i = l(), a = o(() => Fu(i), [i]), [s, u] = Pr(`settings-repo-tab-${e.index}`, "inner", (e) => `Back to ${hm.find((t) => t.key === e)?.label ?? e}`, "mode", !1), [d, m] = c(null), h = `avoozl-settings-repo-${e.index}`, g = (n) => e.onChange({
		...t,
		...n
	}), _ = (e, n) => g({ rules: t.rules.map((t, r) => r === e ? n : t) }), y = t.name.trim();
	return r(() => {
		if (m(null), s !== "checks" && s !== "reviews" || !/^[\w.-]+\/[\w.-]+$/.test(y)) return;
		let n = !0;
		return a(e.workspaceId, y, t.baseBranch).then((e) => n && m(e), (e) => n && m({
			repository: y,
			branch: null,
			reviewRule: null,
			checks: null,
			error: Y(e)
		})), () => {
			n = !1;
		};
	}, [
		s,
		y,
		t.baseBranch,
		e.workspaceId,
		a
	]), /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-repository-tabs",
				ariaLabel: "Repository settings",
				segments: hm.map((e) => ({
					key: e.key,
					label: e.label
				})),
				value: s,
				onChange: (e) => u(e),
				wrap: !0
			}),
			s === "mode" && /* @__PURE__ */ x(Tm, {
				level: "sub",
				title: "Mode and branch",
				blurb: gm.mode,
				children: [
					/* @__PURE__ */ x("p", {
						className: "text-xs text-muted",
						children: [
							"Workspace mode: ",
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								style: { color: "var(--text)" },
								children: Im[Ru(e.mode)]
							}),
							". Change it under Where tasks live."
						]
					}),
					/* @__PURE__ */ x("div", {
						style: dm(),
						children: [
							/* @__PURE__ */ b(Sm, {
								id: `${h}-name`,
								label: "Repository",
								raw: "key",
								rule: ku.name,
								placeholder: "owner/name",
								value: t.name,
								onChange: (e) => g({ name: e })
							}),
							/* @__PURE__ */ b(Sm, {
								id: `${h}-base`,
								label: "Default branch",
								raw: "baseBranch",
								rule: ku.baseBranch,
								placeholder: "main",
								width: "md",
								value: t.baseBranch,
								onChange: (e) => g({ baseBranch: e })
							}),
							/* @__PURE__ */ b(Sm, {
								id: `${h}-concurrency`,
								label: "Tasks at once",
								raw: "concurrency",
								rule: ku.concurrency,
								placeholder: "1",
								type: "number",
								width: "sm",
								value: t.concurrency,
								onChange: (e) => g({ concurrency: e })
							})
						]
					}),
					/* @__PURE__ */ b(xm, {
						id: `${h}-coder-worker`,
						label: "Who codes",
						raw: "coder",
						rule: ku.coder,
						children: /* @__PURE__ */ b(bd, {
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
					/* @__PURE__ */ x(Tm, {
						level: "sub",
						title: "Label rules",
						blurb: gm.triggers,
						children: [
							t.rules.length === 0 && /* @__PURE__ */ b("p", {
								className: "text-sm text-muted",
								children: "No rules yet, so labels start nothing. Add one to let a label start work."
							}),
							t.rules.map((r, i) => /* @__PURE__ */ b(Am, {
								id: `${h}-rule-${i}`,
								rule: r,
								actions: n.actions,
								repository: y,
								workspaceId: e.workspaceId,
								onChange: (e) => _(i, e),
								onRemove: () => g({ rules: t.rules.filter((e, t) => t !== i) })
							}, i)),
							/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(f, {
								onClick: () => g({ rules: [...t.rules, xu()] }),
								children: "Add rule"
							}) })
						]
					}),
					/* @__PURE__ */ b(Tm, {
						level: "sub",
						title: "Managed labels",
						blurb: "Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict.",
						children: /* @__PURE__ */ b("div", {
							style: dm(200),
							children: n.managedLabels.map((e) => /* @__PURE__ */ b(Sm, {
								id: `${h}-label-${e}`,
								label: Au[e] ?? e,
								raw: `managedLabels.${e}`,
								rule: ku[e],
								value: t.managedLabels[e] ?? "",
								onChange: (n) => g({ managedLabels: {
									...t.managedLabels,
									[e]: n
								} })
							}, e))
						})
					}),
					/* @__PURE__ */ b(km, {
						id: h,
						value: t.untriaged,
						repository: y,
						workspaceId: e.workspaceId,
						onChange: (e) => g({ untriaged: e })
					}),
					/* @__PURE__ */ b(Tm, {
						level: "sub",
						title: "Issue Radar labels",
						blurb: "Labels Issue Radar puts on issues it claims. Avoozl only reads them.",
						children: /* @__PURE__ */ b("div", {
							style: dm(200),
							children: n.crewLabels.map((e) => /* @__PURE__ */ b(Sm, {
								id: `${h}-crew-${e}`,
								label: vm[e] ?? e,
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
					/* @__PURE__ */ b(Tm, {
						level: "sub",
						title: "Who counts",
						blurb: "GitHub still decides who has access. This sets how much GitHub permission a person needs for a label, a board drag or a close to count.",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-end gap-3",
							children: [/* @__PURE__ */ b(Cm, {
								id: `${h}-permission`,
								label: "Minimum permission",
								raw: "minimumPermission",
								rule: ku.minimumPermission,
								value: t.minimumPermission,
								options: n.permissions,
								none: t.allowedActors.trim() ? "None" : "Default: write",
								width: "md",
								onChange: (e) => g({ minimumPermission: e })
							}), /* @__PURE__ */ b(Sm, {
								id: `${h}-actors`,
								label: "Or only these people",
								raw: "allowedActors",
								rule: ku.allowedActors,
								placeholder: "login, login",
								width: "md",
								value: t.allowedActors,
								onChange: (e) => g({ allowedActors: e })
							})]
						})
					}),
					/* @__PURE__ */ b(Tm, {
						level: "sub",
						title: "Priority",
						blurb: "Ready tasks carrying a higher label here start first.",
						children: /* @__PURE__ */ b(Sm, {
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
			s === "checks" && /* @__PURE__ */ b(Tm, {
				level: "sub",
				title: "Required checks",
				blurb: gm.checks,
				children: /* @__PURE__ */ b(Nm, {
					id: h,
					value: t.requiredChecks,
					inspect: d,
					repository: y,
					onChange: (e) => g({ requiredChecks: e })
				})
			}),
			s === "reviews" && /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-5",
				children: [/* @__PURE__ */ b(Tm, {
					level: "sub",
					title: "Pull-request reviews",
					blurb: gm.reviews,
					children: /* @__PURE__ */ b(Pm, {
						inspect: d,
						repository: y,
						deprecated: t.pullRequestReviews,
						approvals: t.reviewApprovals,
						onDropDeprecated: () => g({
							pullRequestReviews: !1,
							reviewApprovals: ""
						})
					})
				}), /* @__PURE__ */ b(Mm, {
					review: e.review,
					repository: y
				})]
			})
		]
	}) });
}
var Im = {
	local: "Local only",
	"plans-repo": "Plans repository",
	"single-repo": "Single repository"
};
function Lm({ crews: e }) {
	return e.length ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(Tm, {
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
function Rm(e) {
	let { form: n, choices: r, set: i } = e, a = l(), u = o(() => jt(a), [a]), d = Jo(), f = t((e) => u.repositories(e), [u]), { value: m, reload: h } = Fi(e.workspaceId, f), g = Uo(m ?? [], n.repositories), [_, v] = c(null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = g.find((e) => e.key === _) ?? null, A = s(null), j = async (t) => {
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
					text: Y(e)
				});
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(p, { children: /* @__PURE__ */ x(Tm, {
				title: `Added repositories (${g.length})`,
				blurb: qo,
				children: [
					m === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Loading…"
					}) : /* @__PURE__ */ b(Xo, {
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
			k && y && /* @__PURE__ */ b(Zo, {
				name: k.name,
				edited: JSON.stringify(Eu(n)) !== JSON.stringify(Eu(y)),
				missing: ju(n),
				saving: e.saving,
				error: C,
				onDiscard: () => {
					e.replace(y), v(null), S(null);
				},
				onSave: async () => {
					w(null);
					let t = ju(n);
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
					children: k && !zu(n.mode) ? /* @__PURE__ */ b(zm, {
						row: k,
						review: e.review,
						kept: k.policy >= 0
					}) : k && k.policy >= 0 ? /* @__PURE__ */ b(Fm, {
						index: k.policy,
						repository: n.repositories[k.policy],
						choices: r,
						review: e.review,
						mode: n.mode,
						workspaceId: e.workspaceId,
						onChange: (e) => i({ repositories: n.repositories.map((t, n) => n === k.policy ? e : t) })
					}, k.key) : k && k.github ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(Tm, {
						title: `${k.name} settings`,
						blurb: `${k.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`,
						children: /* @__PURE__ */ x(X, {
							icon: Se,
							tooltip: "Add an entry you can change; saved when you press Save",
							onClick: () => {
								i({ repositories: [...n.repositories, {
									...Su(k.github),
									baseBranch: k.branch
								}] });
							},
							children: ["Add GitHub settings for ", k.github]
						})
					}) }) : k ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(Tm, {
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
			/* @__PURE__ */ b(Qd, {
				workspaceId: e.workspaceId,
				disabled: e.dirty ? "Save or discard your settings changes first: onboarding writes .avoozl.json." : null,
				onChanged: () => Promise.all([h(), e.onRegistryChanged()]),
				onOpenPlans: e.onOpenPlans
			}),
			/* @__PURE__ */ b(p, { children: /* @__PURE__ */ b("div", {
				ref: A,
				children: /* @__PURE__ */ b(es, {
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
function zm(e) {
	let { row: t } = e;
	return /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ x(Tm, {
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
	}), /* @__PURE__ */ b(Mm, {
		review: e.review,
		repository: t.github ?? t.name
	})] });
}
function Bm(e) {
	let { form: t, choices: n, set: r } = e, i = Bu(t.mode), a = Hu(t);
	return /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(hd, {
		value: Ru(t.mode),
		onChange: (e) => r({ mode: e }),
		idPrefix: "avoozl-settings-mode",
		note: zu(t.mode) ? null : /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-1.5 text-sm",
			"data-local-note": !0,
			children: [
				/* @__PURE__ */ b("p", { children: Vu }),
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
		children: zu(t.mode) ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ x("div", {
					style: dm(),
					children: [
						i.has("planningRepository") && /* @__PURE__ */ b(Sm, {
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
						/* @__PURE__ */ b(Cm, {
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
						/* @__PURE__ */ b(Sm, {
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
				/* @__PURE__ */ b(Vm, {
					form: t,
					choices: n,
					set: r
				}),
				/* @__PURE__ */ b(Tm, {
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
function Vm({ form: e, choices: t, set: n }) {
	return /* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(Tm, {
		level: "sub",
		title: "Project fields",
		blurb: "The GitHub Project board Avoozl adds managed issues to and fills with Release, Wave and Avoozl state. People move Status; Avoozl never writes it. Leave every field blank to turn Project sync off.",
		children: [
			/* @__PURE__ */ x("div", {
				style: dm(180),
				children: [/* @__PURE__ */ b(Sm, {
					id: "avoozl-settings-project-owner",
					label: "Owner",
					raw: "project.owner",
					rule: Du.owner,
					placeholder: "org or user",
					width: "md",
					value: e.projectOwner,
					onChange: (e) => n({ projectOwner: e })
				}), /* @__PURE__ */ b(Sm, {
					id: "avoozl-settings-project-number",
					label: "Number",
					raw: "project.number",
					rule: Du.number,
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
				style: dm(180),
				children: t.fields.map((t) => /* @__PURE__ */ b(Sm, {
					id: `avoozl-settings-field-${t}`,
					label: _m[t] ?? t,
					raw: `project.fields.${t}`,
					rule: Du[t],
					placeholder: Ou[t] || "none",
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
				style: dm(180),
				children: t.statusValues.map((t) => /* @__PURE__ */ b(Sm, {
					id: `avoozl-settings-status-${t}`,
					label: ym[t] ?? t,
					raw: `project.statusValues.${t}`,
					rule: Du[t],
					placeholder: Ou[t],
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
function Hm(e) {
	return {
		mode: e.mode,
		planningRepository: e.planningRepository,
		repositories: e.repositories.map((e) => e.name.trim()).filter(Boolean).join(", "),
		projectOwner: e.projectOwner,
		projectNumber: e.projectNumber
	};
}
function Um(e) {
	let { workspaceId: n, tab: i } = e, a = l(), s = o(() => ru(a), [a]), { value: u, error: d, busy: f, reload: p } = Fi(n, t((e) => s.get(e), [s])), [m, h] = c(null), [g, _] = c(null), [v, y] = c(!1);
	r(() => {
		h(u ? Cu(u.github) : null), _(null);
	}, [u]);
	let S = (e) => m && h({
		...m,
		...e
	}), C = async () => {
		if (m) try {
			let e = await s.validate(n, Eu(m));
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
				text: Y(e)
			});
		}
	}, w = async () => {
		if (!m || !u) return "Settings are not loaded.";
		let e = ju(m);
		if (e) return _({
			ok: !1,
			text: `Not saved. ${e}`
		}), `Not saved. ${e}`;
		y(!0);
		try {
			return await s.save(n, Eu(m), u.hash), await p(), _({
				ok: !0,
				text: "Saved to .avoozl.json."
			}), null;
		} catch (e) {
			return _({
				ok: !1,
				text: Y(e)
			}), Y(e);
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
	let E = JSON.stringify(Eu(m)) !== JSON.stringify(Eu(Cu(u.github))), D = ju(m);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			i === "github" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-blurb": "github",
				children: zu(m.mode) ? mm.github : "The mode for this workspace. Save only writes .avoozl.json."
			}),
			u.error && /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ["The saved settings are invalid: ", u.error]
			}),
			i === "repositories" ? /* @__PURE__ */ b(Rm, {
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
			}) : /* @__PURE__ */ b(Bm, {
				form: m,
				choices: T,
				set: S,
				setup: /* @__PURE__ */ b(wd, {
					workspaceId: n,
					client: s,
					settings: u,
					shared: Hm(m),
					onSaved: p
				}),
				crews: Bu(m.mode).has("issueRadarCrews") ? /* @__PURE__ */ b(Lm, { crews: u.crews ?? [] }) : null
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(Q, {
						tooltip: "Check these settings without saving them",
						onClick: () => void C(),
						disabled: v,
						children: "Check"
					}),
					/* @__PURE__ */ b(Q, {
						primary: !0,
						onClick: () => void w(),
						disabled: v || !E || !!D,
						tooltip: D,
						children: "Save"
					}),
					E ? /* @__PURE__ */ b(Vr, {
						disabled: f || v,
						confirm: {
							title: "Discard your unsaved changes?",
							body: "Every edit since the last save on these Settings tabs is lost. .avoozl.json stays as it is.",
							action: "Discard changes"
						},
						onConfirm: () => void p(),
						children: "Discard changes"
					}) : /* @__PURE__ */ b(Q, {
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
function Wm(e) {
	let { workspaceId: t } = e, [n, r] = c(Yu), i = e.tab ?? n, a = pm.some((e) => e.key === i) ? i : Yu, o = (t) => e.onTab ? e.onTab(t) : r(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-settings-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Jr, {
				id: "avoozl-settings-title",
				view: "settings",
				children: "Settings"
			}),
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-settings-tabs",
				ariaLabel: "Settings sections",
				segments: pm.map((e) => ({
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
				children: mm[a]
			}),
			a === "workspaces" ? /* @__PURE__ */ b(Od, {
				selected: t,
				onSelect: e.onSelectWorkspace,
				onListChange: e.onListChange
			}) : t ? a === "plugins" ? /* @__PURE__ */ b(Qf, { workspaceId: t }) : a === "content" ? /* @__PURE__ */ b(tm, { workspaceId: t }) : a === "flow" ? /* @__PURE__ */ b(lm, { workspaceId: t }) : /* @__PURE__ */ b(Um, {
				workspaceId: t,
				tab: a,
				onOpenPlans: e.onOpenPlans
			}) : /* @__PURE__ */ b(h, {
				title: "Pick a workspace",
				subtitle: "Choose one in the header, or add one under Workspaces.",
				action: /* @__PURE__ */ b(f, {
					onClick: () => o("workspaces"),
					children: "Open Workspaces"
				})
			})
		]
	});
}
// kirocrew-app/ui/src/App.tsx
var Gm = [
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
function Km() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function qm(e) {
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
var Jm = (e) => Gm.find((t) => t.key === e)?.label ?? e;
function Ym() {
	return /* @__PURE__ */ b(jr, { children: /* @__PURE__ */ b(Xm, {}) });
}
function Xm() {
	let e = kr(), n = l(), i = o(() => jt(n), [n]), { openChat: a } = u(), s = o(() => Ft(Km()), []), [d, p] = c("dashboard"), [m, g] = c(Yu), [y, S] = c(null), [C, w] = c(null), [T, E] = c(0), [D, O] = c(null), k = o(() => Ut(n), [n]), A = o(() => dl(n), [n]), [j, M] = c(s.workspaceId), [N, P] = c(null), [F, I] = c(null), L = t((e) => {
		P(e), M((t) => Nt(e, t));
	}, []);
	r(() => {
		i.list().then(L, (e) => I(Y(e)));
	}, [i, L]), r(() => {
		It(Km(), { workspaceId: j });
	}, [j]);
	let ee = {
		tab: d,
		settingsTab: m,
		focus: y,
		drill: C
	}, R = (e) => {
		e.focus !== void 0 && S(e.focus), e.drill !== void 0 && w(e.drill), e.settingsTab !== void 0 && g(e.settingsTab), e.tab !== void 0 && p(e.tab);
	}, z = (t) => Tr(e, ee, t, R, (e, t) => t ? `Back to ${Jm(e.tab)}` : "Back to the previous Settings section"), te = () => z({
		settingsTab: "workspaces",
		tab: "settings"
	}), B = N ? j : null, V = d !== "settings" && !B, H = (e, t) => z({
		focus: t ?? null,
		drill: null,
		tab: e
	}), ne = (e, t) => {
		B && Wc(B, t), z({
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
		settingsTab: Xu(d, e, m, pm.map((e) => e.key)),
		tab: e
	});
	return r(() => {
		if (!B) return E(0);
		let e = !0, t = () => k.conflicts(B).then((t) => e && E(t.length), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		B,
		k,
		d
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
		d
	]), r(() => {
		D === null && d === "untriaged" && p("dashboard");
	}, [D, d]), /* @__PURE__ */ b("div", {
		[Er]: "",
		style: { display: "contents" },
		children: /* @__PURE__ */ b(Br, { children: /* @__PURE__ */ b(bc, {
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
							children: [/* @__PURE__ */ b(Fe, { size: 28 }), "Avoozl"]
						}),
						subtitle: "Plan work as a graph, then deliver ready tasks through Kiro Crew",
						actions: /* @__PURE__ */ x("div", {
							className: "flex flex-wrap items-center gap-3",
							children: [/* @__PURE__ */ b(qm, {
								list: N,
								value: j,
								onChange: M
							}), /* @__PURE__ */ b(f, {
								type: "button",
								primary: !0,
								onClick: () => a({
									message: oo,
									autoSend: !1
								}),
								children: "Plan a goal"
							})]
						})
					}),
					/* @__PURE__ */ b("div", {
						className: "px-6 pb-3",
						children: /* @__PURE__ */ b(v, {
							layoutId: "avoozl-views",
							ariaLabel: "Avoozl views",
							segments: Gm.filter((e) => e.key !== "untriaged" || D !== null).map((e) => ({
								key: e.key,
								label: e.key === "untriaged" && D ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Intake, ${D} untriaged items`,
									children: [
										/* @__PURE__ */ b(Yr, {
											view: "untriaged",
											children: "Intake"
										}),
										" ",
										/* @__PURE__ */ b(J, {
											variant: "info",
											children: D
										})
									]
								}) : e.key === "conflicts" && T > 0 ? /* @__PURE__ */ x("span", {
									className: "inline-flex items-center gap-1.5",
									"aria-label": `Conflicts, ${T} need you`,
									children: [
										/* @__PURE__ */ b(Yr, {
											view: "conflicts",
											children: "Conflicts"
										}),
										" ",
										/* @__PURE__ */ b(J, {
											variant: "warning",
											children: T
										})
									]
								}) : /* @__PURE__ */ b(Yr, {
									view: e.key,
									children: e.label
								})
							})),
							value: d,
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
							icon: /* @__PURE__ */ b(Fe, { size: 40 }),
							title: N ? N.items.length === 0 ? "No workspace yet" : "Pick a workspace" : "Loading workspaces…",
							subtitle: N?.items.length === 0 ? "Add or initialize a workspace in Settings. Every tab reads from it." : "Choose one in the header. Every tab reads from it.",
							action: N?.items.length === 0 ? /* @__PURE__ */ b(f, {
								type: "button",
								onClick: te,
								children: "Open Settings › Workspaces"
							}) : void 0
						}) : d === "dashboard" ? /* @__PURE__ */ b(zc, {
							workspaceId: B,
							untriaged: D,
							onNavigate: H,
							onScope: ne,
							onDrill: U
						}) : d === "plans" ? /* @__PURE__ */ b(Lo, {
							workspaceId: B,
							onScope: ne,
							onDrill: U
						}) : d === "graph" ? /* @__PURE__ */ b(nl, {
							workspaceId: B,
							focus: y,
							drill: C,
							onDrill: w
						}) : d === "delivery" ? /* @__PURE__ */ b(ll, { workspaceId: B }) : d === "conflicts" ? /* @__PURE__ */ b(na, { workspaceId: B }) : d === "flow" ? /* @__PURE__ */ b(uc, { workspaceId: B }) : d === "untriaged" ? /* @__PURE__ */ b(nu, { workspaceId: B }) : /* @__PURE__ */ b(Wm, {
							workspaceId: B,
							tab: m,
							onTab: (e) => z({ settingsTab: e }),
							onSelectWorkspace: (e) => e && M(e),
							onListChange: L,
							onOpenPlans: () => W("plans")
						})
					})
				]
			})
		}) })
	});
}
export { Ym as default };
