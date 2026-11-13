import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u } from "@kirocrew/app-sdk";
import { Badge as d, Btn as f, Card as p, CardTitle as m, EmptyState as h, Input as g, PageHeader as _, SegmentedControl as v } from "@kirocrew/app-sdk/ui";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { createPortal as S } from "react-dom";
import { Activity as C, Archive as w, ArchiveRestore as T, ArrowLeft as E, ArrowRight as D, Ban as O, BookOpen as k, Check as A, ChevronRight as j, CircleAlert as M, CircleAlert as N, CircleCheck as P, CircleDot as F, CircleHelp as I, ClipboardCheck as L, Copy as R, Crosshair as ee, Download as te, ExternalLink as ne, Eye as z, FileText as B, FileText as V, Folder as re, FolderOpen as ie, Gauge as H, Gauge as U, GitBranch as ae, GitPullRequest as oe, GitPullRequestDraft as se, History as ce, Inbox as le, Inbox as ue, Info as de, Laptop as fe, LayoutDashboard as pe, LayoutGrid as W, LayoutGrid as me, Lock as he, MessageSquare as ge, MessagesSquare as _e, Network as ve, Network as ye, Package as be, Pause as xe, Pencil as Se, Play as Ce, Plus as we, Radar as Te, RefreshCw as Ee, RotateCcw as De, ScanSearch as Oe, Settings as ke, ShieldCheck as Ae, Trash2 as je, Users as Me, Workflow as Ne, X as Pe } from "lucide-react";
// \0rolldown/runtime.js
var Fe = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports);
// kirocrew-app/ui/src/Logo.tsx
function Ie({ size: e = 32 }) {
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
function Le(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var Re = null;
function ze(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), Re === o && (Re = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), Re && Re !== o && Re(), Re = o, i || (i = !0, e.onChange(!0));
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
var Be = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Ve = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function G(e) {
	let t = i(), n = s(null), l = s(null), [u, d] = c(!1), [f, p] = c(null), m = o(() => ze({ onChange: d }), []);
	r(() => m.hide, [m]), r(() => {
		if (!u) return;
		let e = (e) => m.key(e.key), t = () => m.hide();
		return document.addEventListener("keydown", e), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [u, m]), a(() => {
		if (!u || !n.current || !l.current) return p(null);
		let e = n.current.getBoundingClientRect(), t = l.current.getBoundingClientRect();
		p(Le(e, t, {
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
		onFocus: (e) => m.focus(Ve(e.target)),
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
					animation: Be() ? void 0 : "avoozl-tip-in 120ms ease-out"
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
var He = {
	success: { variant: "ok" },
	warning: { variant: "warn" },
	danger: { variant: "err" },
	info: {
		variant: "muted",
		className: "bg-accent-subtle text-accent"
	},
	wave: { variant: "aim" }
};
function Ue(e) {
	return e && He[e] || { variant: "muted" };
}
function K({ variant: e, children: t }) {
	let n = Ue(e);
	return /* @__PURE__ */ b(d, {
		variant: n.variant,
		className: n.className,
		children: t
	});
}
// kirocrew-app/ui/src/graph-layout.ts
var We = [
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
], Ge = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
}, Ke = 1.5;
function qe(e, t = 1100) {
	let n = (12 / (12 + Math.max(0, e))) ** 2, r = Math.max(.6, Math.min(1.4, t / 1100)), i = 1 + Ke * n * r, a = (e) => Math.round(e * i);
	return {
		...Ge,
		columnGap: a(Ge.columnGap),
		rowGap: a(Ge.rowGap),
		clusterGap: a(Ge.clusterGap)
	};
}
var Je = Ge.nodeWidth, Ye = Ge.nodeHeight;
Ge.columnGap, Ge.rowGap, Ge.margin, Ge.clusterLabel, Ge.clusterGap;
var Xe = 2, Ze = 12, Qe = 8;
function $e(e) {
	return e.state ? e.state : e.complete ? "done" : e.decision || e.status === "blocked" ? "needs-you" : e.status === "deferred" ? "deferred" : e.status === "running" || e.status === "review" ? "running" : e.ready ? "ready" : "waiting";
}
function et(e) {
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
var tt = (e) => e ?? "(none)";
function nt(e) {
	if (!e.startsWith("doc:")) return e;
	let t = e.slice(4);
	return /^\.kiro\/specs\/([^/]+)\//.exec(t)?.[1] ?? t.replace(/\.md$/, "");
}
function rt(e, t) {
	let n = new Map(e.epics.map((e) => [e.id, e.title])), r = new Map(e.epics.map((e, t) => [e.id, t])), i = (e) => {
		if (!e) return "No epic";
		let t = n.get(e);
		return t && t !== e ? t : nt(e);
	}, a = /* @__PURE__ */ new Map();
	for (let t of e.tasks) a.has(t.epic) || a.set(t.epic, []), a.get(t.epic).push(t);
	let o = [...a.keys()].sort((e, t) => (e === null ? 1e9 : r.get(e) ?? 1e8) - (t === null ? 1e9 : r.get(t) ?? 1e8)), s = /* @__PURE__ */ new Map(), c = [];
	for (let e of o) {
		let n = a.get(e);
		if (t.has(tt(e))) {
			let t = `epic:${tt(e)}`, r = new Set(n.map($e)), a = [
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
					done: n.filter((e) => $e(e) === "done").length
				}
			});
		} else for (let t of n) s.set(t.id, t.id), c.push({
			id: t.id,
			task: t,
			title: t.title,
			epic: e,
			state: $e(t),
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
function it(e, t) {
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
function at(e) {
	if (e.length < 2) return 0;
	let t = e.length >> 1, n = e.slice(0, t), r = e.slice(t), i = at(n) + at(r), a = 0, o = 0, s = 0;
	for (; a < n.length && o < r.length;) n[a] <= r[o] ? e[s++] = n[a++] : (e[s++] = r[o++], i += n.length - a);
	for (; a < n.length;) e[s++] = n[a++];
	for (; o < r.length;) e[s++] = r[o++];
	return i;
}
function ot(e, t) {
	let n = 0;
	for (let r = 0; r + 1 < e.length; r++) {
		let i = new Map(e[r + 1].map((e, t) => [e, t])), a = [];
		e[r].forEach((e, n) => {
			for (let r of t.get(e).down) a.push([n, i.get(r)]);
		}), a.sort((e, t) => e[0] - t[0] || e[1] - t[1]), n += at(a.map((e) => e[1]));
	}
	return n;
}
function st(e, t, n, r) {
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
function ct(e, t) {
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
var lt = (e) => {
	let t = [...e].sort((e, t) => e - t), n = t.length >> 1;
	return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2;
};
function ut(e, t = /* @__PURE__ */ new Set(), n = {}) {
	let { nodeWidth: r, nodeHeight: i, columnGap: a, rowGap: o, margin: s, clusterLabel: c, clusterGap: l } = n.spacing ?? Ge, { nodes: u, edges: d, epicTitle: f } = rt(e, t), p = new Map(u.map((e) => [e.id, e])), m = new Set(d.flatMap((e) => [e.from, e.to])), h = u.filter((e) => m.has(e.id)), g = u.filter((e) => !m.has(e.id)), { ranks: _, pairs: v } = it(h.map((e) => e.id), d), y = /* @__PURE__ */ new Map();
	for (let e of h) y.set(e.id, {
		id: e.id,
		cluster: `epic:${tt(e.epic)}`,
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
				height: Xe,
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
	for (let e of h) w.has(tt(e.epic)) || w.set(tt(e.epic), w.size);
	let T = (e) => {
		let t = p.get(e);
		return t ? w.get(tt(t.epic)) * 1e6 + C.get(e) : 0xe8d4a51000;
	};
	for (let e of S) e.sort((e, t) => T(e) - T(t));
	let E = ot(S, y);
	if (!n.naive) {
		let e = S.map((e) => [...e]);
		for (let t = 0; t < Ze && E > 0; t++) {
			let n = t % 2 == 0, r = S.map((e) => [...e]);
			if (n) for (let e = 1; e < r.length; e++) r[e] = st(r[e], y, r[e - 1], "up");
			else for (let e = r.length - 2; e >= 0; e--) r[e] = st(r[e], y, r[e + 1], "down");
			let i = ot(r, y);
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
	let ee = /* @__PURE__ */ new Map(), te = /* @__PURE__ */ new Map(), ne = 0, z = [];
	for (let e of j) {
		let t = Math.max(1, Math.ceil(e.length / F));
		e.forEach((e, n) => {
			ee.set(e, ne + Math.floor(n / F)), te.set(e, t > 1 ? n % F : n);
		}), t === 1 && z.push(e), ne += t;
	}
	for (let e = 0; e < Qe; e++) {
		let t = e % 2 == 0 ? z : [...z].reverse();
		for (let e of t) {
			let t = e.map((e) => {
				let t = R.get(e).map((e) => te.get(e));
				return t.length ? lt(t) : te.get(e);
			}), n = e.length;
			ct(t, e.map(() => 1)).forEach((t, r) => te.set(e[r], Math.min(Math.max(Math.round(t), r), F - n + r)));
		}
	}
	for (let e of h) e.wave = _.get(e.id), e.x = s + ee.get(e.id) * D, e.y = k + te.get(e.id) * O;
	let B = /* @__PURE__ */ new Map(), V = (e, t) => {
		B.has(e) || B.set(e, /* @__PURE__ */ new Map());
		let n = B.get(e);
		return n.has(t) || n.set(t, n.size), n.get(t);
	}, re = d.map((e) => {
		let t = p.get(e.from), n = p.get(e.to), s = ee.get(t.id), c = ee.get(n.id), l = t.y + i / 2, u = n.y + i / 2, d = (a / 2 - 4) / 2, f = t.x + r + 3 + V(`c${s}:out`, t.id) % 3 * d, m = n.x - 3 - V(`c${c - 1}:in`, n.id) % 3 * d;
		if (c === s + 1) return {
			...e,
			points: l === u ? [[t.x + r, l], [n.x, u]] : [
				[t.x + r, l],
				[f, l],
				[f, u],
				[n.x, u]
			]
		};
		let h = n.y - o / 2, g = n.y + i + o / 2, _ = Math.abs(l - h) <= Math.abs(l - g) ? h : g, v = _ + (V(`r${Math.round(_)}`, t.id) % 3 - 1) * 3;
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
	}), ie = [], H = /* @__PURE__ */ new Set(), U = /* @__PURE__ */ new Map();
	for (let e of u) U.set(tt(e.epic), (U.get(tt(e.epic)) ?? 0) + (e.members?.total ?? 1));
	let ae = /* @__PURE__ */ new Map();
	for (let e of h) {
		let t = ee.get(e.id);
		ae.has(t) || ae.set(t, []), ae.get(t).push(e);
	}
	for (let e of [...ae.keys()].sort((e, t) => e - t)) {
		let n = ae.get(e).sort((e, t) => e.y - t.y), a = [], s = () => {
			if (!a.length) return;
			let e = tt(a[0].epic), n = t.has(e);
			ie.push({
				epic: a[0].epic,
				title: f(a[0].epic),
				count: U.get(e) ?? a.length,
				collapsed: n,
				x: a[0].x - 4,
				y: a[0].y - o + 2,
				width: r + 8,
				height: a[a.length - 1].y + i + 2 - (a[0].y - o + 2),
				label: !n && !H.has(e)
			}), n || H.add(e), a = [];
		};
		for (let e of n) a.length && tt(a[0].epic) !== tt(e.epic) && s(), a.push(e);
		s();
	}
	let oe = h.length ? k + F * O - o : 0, se = h.length ? oe + O : k, ce = [], le = g;
	le.forEach((e, n) => {
		e.loose = !0, e.wave = 0, e.x = s + n % L * D, e.y = se + Math.floor(n / L) * O;
		let r = tt(e.epic), i = ce[ce.length - 1];
		i && tt(i.epic) === r ? i.count++ : t.has(r) || ce.push({
			epic: e.epic,
			title: f(e.epic),
			count: 1,
			x: e.x,
			y: e.y - o - 1,
			chars: Math.max(8, Math.floor((D * Math.max(1, L - n % L) - a) / 6))
		});
	});
	let ue = le.length ? Math.ceil(le.length / L) : 0, de = Math.max(I, le.length ? Math.min(L, le.length) : 0, 1);
	return {
		nodes: [...h, ...le],
		edges: re,
		clusters: ie,
		loose: ce,
		waves: x,
		crossings: E,
		rows: F,
		width: s * 2 + de * D - a,
		height: Math.max(ue ? se + ue * O - o + s : 0, oe + s, s * 2)
	};
}
function dt(e, t) {
	return t ? "none" : e.members ? "drill" : "open";
}
function ft(e, t) {
	if (!t) return e;
	let n;
	if (t.kind === "epic") n = new Set(e.tasks.filter((e) => e.epic === t.id || e.id === t.id).map((e) => e.id));
	else {
		let { up: r, down: i } = mt(e.edges.filter((e) => e.blocking), t.id);
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
function pt(e) {
	return e.map(([e, t], n) => `${n ? "L" : "M"}${Math.round(e * 10) / 10},${Math.round(t * 10) / 10}`).join(" ");
}
function mt(e, t) {
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
function ht(e, t) {
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
function gt(e, t, n, r, i = .1, a = 3) {
	let o = Math.min(a, Math.max(i, e.scale * t)), s = o / e.scale;
	return {
		scale: o,
		x: n - (n - e.x) * s,
		y: r - (r - e.y) * s
	};
}
function _t(e, t, n) {
	let r = Math.max(.1, Math.min(1, t / e.width, n / e.height));
	return {
		scale: r,
		x: Math.max(0, (t - e.width * r) / 2),
		y: 0
	};
}
var vt = (e, t) => (e?.kind ?? null) === (t?.kind ?? null) && (e?.id ?? null) === (t?.id ?? null);
function yt(e, t, n, r) {
	if (!t.drill) return e;
	let i = [.../* @__PURE__ */ new Set([...Object.keys(n), ...Object.keys(r)])].filter((e) => JSON.stringify(n[e]) !== JSON.stringify(r[e]));
	if (!i.length) return e;
	let a = i.every((e) => e === "q"), o = e[e.length - 1];
	return a && o?.searchOnly && vt(o.drill, t.drill) ? e : [...e, {
		...t,
		filter: n,
		searchOnly: a
	}];
}
function bt(e, t) {
	return e.map((n, r) => ({
		at: r,
		entry: n,
		next: r + 1 < e.length ? e[r + 1].drill : t
	})).filter(({ entry: e, next: t }) => !vt(e.drill, t)).map(({ at: e, entry: t }) => ({
		at: e,
		label: xt(t.drill)
	}));
}
var xt = (e) => e ? e.kind === "epic" ? e.title : `Focus: ${e.title}` : "All tasks", St = (e) => {
	let t = e[e.length - 1];
	if (!t) return null;
	let n = t.drill ? xt(t.drill) : "all tasks";
	return t.filter ? `Back to ${n}, before the filter change` : `Back to ${n}`;
};
function Ct(e, t, n) {
	return n ? [...e, t] : [];
}
function wt(e, t = e.length - 1) {
	return t < 0 || t >= e.length ? null : {
		entry: e[t],
		stack: e.slice(0, t)
	};
}
var Tt = (e) => e.button === 3, Et = (e) => !!e.altKey && e.key === "ArrowLeft" || !!e.metaKey && e.key === "[", Dt = "/apps/avoozl/api/command";
function q(e) {
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
function Ot(e) {
	let t = async (t, n = {}, r) => (await e.post(Dt, {
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
function kt(e, t = Date.now()) {
	if (!e) return "Not loaded";
	let { lastRun: n, lock: r } = e;
	if (r) return r.live ? `Running (pid ${r.pid})` : `Stale lock (pid ${r.pid})`;
	if (!n) return "Never run";
	if (n.outcome === "unreadable") return "Last run unreadable";
	let i = n.at ? Math.max(0, Math.round((t - Date.parse(n.at)) / 1e3)) : null, a = i === null ? "" : i < 90 ? ` ${i}s ago` : ` ${Math.round(i / 60)}m ago`;
	return n.outcome === "error" ? `Failed${a}: ${n.error ?? "unknown error"}` : n.outcome === "locked" ? `Skipped${a}: another tick held the lock` : n.policy === "invalid" ? `Ran${a}; .avoozl.json is invalid: ${n.error ?? ""}`.trim() : `Ran${a}; policy ${n.policy ?? "unknown"}`;
}
function At(e, t) {
	return t && e.items.some((e) => e.id === t) ? t : e.items.find((e) => e.served)?.id ?? e.defaultWorkspace ?? e.items[0]?.id ?? null;
}
var jt = "avoozl.page";
function Mt(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
function Nt(e, t) {
	try {
		e?.setItem(jt, JSON.stringify(t));
	} catch {}
}
var Pt = {
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
}, Ft = (e) => Pt[e] ?? {
	label: e,
	tip: `State: ${e}`
}, It = {
	check: "failed checks",
	review: "review",
	comment: "comment",
	conflict: "conflict",
	"auto-merge": "auto-merge off"
}, Lt = {
	session: "sent to the worker",
	conductor: "queued for the conductor",
	"new attempt": "carried to a new attempt"
}, Rt = {
	bound: "stopped: all rounds used",
	"same-check": "stopped: the same check failed 3 times",
	blocked: "stopped: the worker is blocked"
};
function zt(e) {
	let t = [`${e.rounds} of ${e.bound ?? "?"} rounds`];
	return e.latest && t.push(`last: ${e.latest.kinds.map((e) => It[e] ?? e).join(", ")}, ${Lt[e.latest.to] ?? e.latest.to}`), e.stopped && t.push(Rt[e.stopped] ?? `stopped: ${e.stopped}`), t.join(" · ");
}
function Bt(e) {
	let t = async (t, n, r, i) => (await e.post(Dt, {
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
function Vt(e) {
	return {
		tasks: e.tasks.length,
		edges: e.edges.length,
		blocking: e.edges.filter((e) => e.blocking).length,
		ready: e.tasks.filter((e) => e.ready).length
	};
}
function Ht(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
function Ut(e) {
	return [
		`${e.role} #${e.attempt}`,
		e.status ?? "not observed",
		Wt(e)
	].filter(Boolean).join(" · ");
}
function Wt(e) {
	if (e.served === void 0) return e.model ?? null;
	let t = `requested ${e.model ?? "agent default"}`;
	if (!e.served) return `${t}, served model not reported`;
	let n = [e.served.withheld ? "withheld" : null, e.served.changed ? "changed mid-session" : null].filter(Boolean).join(", ");
	return `${t}, served ${e.served.model ?? "unknown"}${n ? ` (${n})` : ""}`;
}
function Gt(e) {
	let t = e.outcome === "refused" ? `${e.verdict ?? "verdict"} refused` : e.verdict ?? (e.outcome === "failed" ? "no verdict" : e.outcome), n = e.served && e.served !== e.model ? `${e.model ?? "model unknown"} → served ${e.served}` : e.model ?? "model unknown";
	return [
		e.role,
		t,
		n,
		e.stale ? "stale" : null
	].filter(Boolean).join(" · ");
}
function Kt(e) {
	return [
		e.reviewer,
		e.state,
		e.stale ? `stale (${e.commit?.slice(0, 12) ?? "older commit"})` : null,
		e.allowed ? null : `ignored: ${e.reason ?? "not allowed"}`
	].filter(Boolean).join(" · ");
}
function qt(e) {
	return Object.entries(e).filter(([e, t]) => e !== "taskId" && [
		"string",
		"number",
		"boolean"
	].includes(typeof t)).map(([e, t]) => [e, String(t)]);
}
var Jt = {
	decision: "Open decision",
	"needs-human": "Needs you",
	review: "Review",
	"stale-session": "Session ended",
	resource: "Shared resource",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function Yt(e) {
	return (e.authority ?? "local") === "local" && !e.supersededBy && e.status !== "superseded";
}
function Xt(e) {
	let t = {};
	return e.id.trim() && (t.id = e.id.trim()), e.title.trim() && (t.title = e.title.trim()), t;
}
var Zt = /* @__PURE__ */ new Set([
	"closed",
	"lost",
	"gone"
]);
function Qt(e) {
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
		live: !Zt.has(n.status ?? "")
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
function $t(e) {
	return e === "running" ? "Waiting on your decision: marked running, but no session is running" : "Waiting on your decision: marked in review, but no review is running";
}
// kirocrew-app/ui/src/dashboard-api.ts
var en = /* @__PURE__ */ new Set(["closed", "lost"]), tn = (e) => Ht(e.issue?.url ?? null);
function nn(e) {
	return [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null;
}
function rn(e) {
	return e.complete ? null : e.deliveries.some((e) => e.state === "decision") ? "Stopped after its retries; retry it or dismiss the findings." : null;
}
function an(e) {
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
	}, o = new Set((r ?? []).filter((e) => !e.complete && e.sessions.some((e) => !en.has(e.status ?? ""))).map((e) => e.id));
	for (let e of i) {
		let t = $e(e);
		a[t === "done" ? "done" : o.has(e.id) ? "running" : t === "running" ? "needs-you" : t] += 1;
	}
	let s = [], c = /* @__PURE__ */ new Set(), l = (e) => {
		c.has(e.key) || (c.add(e.key), s.push(e));
	};
	for (let t of e.delivery ?? []) {
		let e = rn(t);
		e && l({
			key: `delivery:${t.id}`,
			kind: "delivery",
			taskId: t.id,
			title: t.title,
			detail: e,
			tab: "delivery",
			href: tn(t)
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
		href: tn(t)
	});
	let d = (r ?? []).filter((e) => !e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		sessions: e.sessions.filter((e) => !en.has(e.status ?? ""))
	})).filter((e) => e.sessions.length > 0), f = new Map((n?.tasks ?? []).map((e) => [e.id, e])), p = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), m = d.flatMap((e) => e.sessions.map((t) => {
		let n = f.get(e.id)?.epic ?? null;
		return {
			slot: t.slot,
			role: t.role,
			focus: t.title,
			taskId: e.id,
			title: e.title,
			epic: n ? p.get(n) ?? nt(n) : null,
			attempt: t.attempt,
			model: Wt(t),
			startedAt: t.boundAt,
			lastAt: t.statusAt ?? t.boundAt,
			status: t.status,
			session: t
		};
	})).sort((e, t) => (t.lastAt ?? "").localeCompare(e.lastAt ?? "")), h = n ? et(n) : /* @__PURE__ */ new Map(), g = i.filter((e) => $e(e) === "ready").map((e) => ({
		...e,
		wave: h.get(e.id) ?? 1
	})).sort((e, t) => (e.order ?? Infinity) - (t.order ?? Infinity) || e.wave - t.wave || e.id.localeCompare(t.id)), _ = (e.delivery ?? []).filter((e) => e.complete).map((e) => ({
		id: e.id,
		title: e.title,
		at: nn(e),
		issue: tn(e),
		pulls: e.pullRequests.flatMap((e) => {
			let t = Ht(e.url);
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
		t.total += 1, $e(e) === "done" && (t.done += 1), b.set(e.epic, t);
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
var on = "(max-width: 480px)";
function sn(e, t) {
	return t ? "small" : e ? "wide" : "medium";
}
function cn(e) {
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
function ln(e) {
	return e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `${e.document}, lines ${e.lineStart}–${e.lineEnd}` : `${e.document}, line ${e.lineStart}` : e.document;
}
function un(e, t) {
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
var dn = (e) => e.lineStart ? e.lineEnd && e.lineEnd !== e.lineStart ? `Lines ${e.lineStart}–${e.lineEnd}` : `Line ${e.lineStart}` : null, fn = (e) => !!e && !e.startsWith("/") && !/^[A-Za-z]:/.test(e) && !e.split(/[\\/]/).includes("..");
function pn(e, t) {
	let n = -1;
	return e.forEach((r, i) => {
		r <= t && (n < 0 || r >= e[n]) && (n = i);
	}), n;
}
function mn(e, t, n) {
	if (!t) return [];
	if (n && n > t) {
		let r = e.flatMap((e, r) => e.line >= t && e.line <= n ? [r] : []);
		if (r.length) return r;
	}
	let r = pn(e.map((e) => e.line), t);
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
function hn(e) {
	let t = async (t, n, r, i) => (await e.post(Dt, {
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
function gn(e, t, n) {
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
function _n(e, t) {
	let n = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "").slice(0, 60).replace(/-+$/, "");
	if (n.length < 3 && (n = `task-${n || "new"}`.replace(/-+$/, "")), !t.has(n)) return n;
	for (let e = 2;; e++) if (!t.has(`${n}-${e}`)) return `${n}-${e}`;
}
var vn = [
	"merged-pr",
	"integrated",
	"released",
	"answered"
], yn = (e) => e.split("\n").map((e) => e.trim()).filter(Boolean);
function bn() {
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
function xn(e) {
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
function Sn(e, t) {
	let n = { id: e.id.trim() }, r = (e, r, i) => {
		t && JSON.stringify(r) === JSON.stringify(i) || (n[e] = r);
	};
	r("title", e.title.trim(), t?.title.trim()), r("summary", e.summary.trim(), t?.summary.trim()), r("acceptance", yn(e.acceptance), t ? yn(t.acceptance) : void 0), r("checks", yn(e.checks), t ? yn(t.checks) : void 0), e.epic && r("epic", e.epic, t?.epic), r("repository", e.repository.trim() || void 0, t && t.repository.trim() || void 0), n.repository === void 0 && delete n.repository;
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
function Cn(e) {
	return /Database changed/.test(e) ? "This task changed elsewhere. Reload it, then make your change again." : e;
}
function J(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
function wn(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.floor((t - n) / 6e4));
	if (r < 60) return `${r} min`;
	let i = Math.floor(r / 60);
	return i < 24 ? `${i} h ${r % 60} min` : `${Math.floor(i / 24)} d ${i % 24} h`;
}
function Tn(e) {
	if (e.link) return e.link;
	let t = e.slot.startsWith("dashboard:") ? e.slot.slice(10) : e.slot;
	return `/chat?sid=${encodeURIComponent(t)}`;
}
// kirocrew-app/ui/src/drawer-context.ts
var En = e({
	openTask: () => void 0,
	addTask: () => void 0,
	openReview: () => void 0
}), Dn = () => n(En), On = "(none)", kn = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : null, An = (e) => e.spec ? `spec:${e.spec}` : e.planId ? `plan:${e.planId}` : void 0, jn = (e) => !!(e.q?.trim() || e.plan || e.epic || e.repository || e.state || e.waveMin || e.waveMax || e.authority || e.needsYou || e.archived), Mn = (e, t) => !e.planArchived || !!(t.archived || t.plan);
function Nn(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "", r = t.plan;
	return Mn(e, t) && (!n || e.title.toLowerCase().includes(n) || e.id.toLowerCase().includes(n)) && (!r || (r.startsWith("spec:") ? e.spec === r.slice(5) : r.startsWith("plan:") ? e.planId === r.slice(5) : !1)) && (!t.epic || e.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !e.repository : e.repository === t.repository)) && (!t.state || e.state === t.state) && (!t.waveMin || e.wave >= t.waveMin) && (!t.waveMax || e.wave <= t.waveMax) && (!t.authority || (e.authority ?? "local") === t.authority) && (!t.needsYou || e.state === "needs-you" || !!e.decision);
}
var Pn = (e, t) => ({
	id: e.id,
	title: e.title,
	epic: e.epic,
	planId: e.planId ?? null,
	spec: e.spec ?? null,
	repository: e.repository,
	authority: e.authority,
	state: $e(e),
	wave: t,
	decision: e.decision,
	planArchived: e.planArchived ?? null
});
function Fn(e, t = {}) {
	let n = e?.tasks ?? [], r = e ? et(e) : /* @__PURE__ */ new Map(), i = (e, t) => {
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
		plans: i(kn, (e) => t[e] ?? e.replace(/^(spec|plan):/, "")),
		epics: i((e) => e.epic, (e) => a.get(e) ?? e),
		repositories: [...[...o].sort().map((e) => ({
			value: e,
			label: e
		})), ...n.some((e) => !e.repository) ? [{
			value: On,
			label: "No repository"
		}] : []],
		states: We.map((e) => ({
			value: e.id,
			label: e.label
		})),
		authorities: i((e) => e.authority ?? "local", (e) => e),
		waves: Math.max(0, ...r.values())
	};
}
function In(e, t) {
	if (!jn(t) && !e.tasks.some((e) => e.planArchived)) return e;
	let n = et(e), r = e.tasks.filter((e) => Nn(Pn(e, n.get(e.id) ?? 1), t)), i = new Set(r.map((e) => e.id));
	return {
		...e,
		tasks: r,
		edges: e.edges.filter((e) => i.has(e.from) && i.has(e.to))
	};
}
var Ln = (e) => `avoozl.filters.${e}`, Rn = "avoozl-filter";
function zn(e, t) {
	try {
		let n = JSON.parse(e?.getItem(Ln(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of [
			"q",
			"plan",
			"epic",
			"repository",
			"authority"
		]) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		We.some((e) => e.id === n.state) && (r.state = n.state);
		for (let e of ["waveMin", "waveMax"]) Number.isInteger(n[e]) && n[e] > 0 && (r[e] = n[e]);
		return n.needsYou === !0 && (r.needsYou = !0), n.archived === !0 && (r.archived = !0), r;
	} catch {
		return {};
	}
}
function Bn(e, t, n) {
	try {
		e?.setItem(Ln(t), JSON.stringify(n));
	} catch {}
}
function Vn(e, t) {
	let n = {
		...e,
		...t
	};
	for (let e of Object.keys(n)) (n[e] === void 0 || n[e] === "" || n[e] === !1) && delete n[e];
	return n;
}
// kirocrew-app/ui/src/delivery-api.ts
var Hn = [
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
], Un = [{
	id: "running",
	label: "Running"
}, {
	id: "reviewing",
	label: "Reviewing"
}];
function Wn(e, t) {
	return t === "in-progress" ? [...e.running, ...e.reviewing] : e[t];
}
function Gn(e) {
	return Un.map((t) => ({
		...t,
		cards: e[t.id]
	})).filter((e) => e.cards.length);
}
var Kn = (e) => `color-mix(in srgb, ${e} 8%, var(--card, transparent))`, qn = /* @__PURE__ */ new Set(["closed", "lost"]), Jn = (e) => (e?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1) ?? null;
function Yn(e) {
	return e ? [
		e.integration?.at,
		...e.sessions.map((e) => e.statusAt ?? e.boundAt),
		...e.evidence.map((e) => e.at),
		...e.deliveries.map((e) => typeof e.updatedAt == "string" ? e.updatedAt : null)
	].filter((e) => typeof e == "string").sort().at(-1) ?? null : null;
}
function Xn(e, t) {
	let n = Jn(t), r = (t?.sessions ?? []).filter((e) => !qn.has(e.status ?? ""));
	return n === "decision" || t?.needsYou || e && $e(e) === "needs-you" && !t?.complete ? "needs-you" : t?.complete || e && $e(e) === "done" ? "done" : n === "done" || n === "verified" || t?.status === "review" && !t.handSetReview || r.some((e) => e.role !== "worker") || t?.githubReviews?.state === "pending" ? "reviewing" : r.length || n === "running" || n === "failed" || t?.status === "running" && !t.handSetReview ? "running" : e && $e(e) === "ready" ? "ready" : "waiting";
}
function Zn(e, t) {
	return e === "running" || e === "reviewing" ? "running" : e === "waiting" ? t && $e(t) === "deferred" ? "deferred" : "waiting" : e;
}
function Qn(e, t) {
	let n = new Map((e?.tasks ?? []).map((e) => [e.id, e])), r = e ? et(e) : /* @__PURE__ */ new Map(), i = new Map((e?.epics ?? []).map((e) => [e.id, e.title])), a = {
		ready: [],
		running: [],
		reviewing: [],
		"needs-you": [],
		waiting: [],
		done: []
	}, o = /* @__PURE__ */ new Set(), s = (e, t) => {
		let n = t?.id ?? e.id;
		o.add(n);
		let s = e?.epic ?? null, c = (t?.sessions ?? []).map((e) => e.attempt), l = Xn(e, t);
		a[l].push({
			id: n,
			title: t?.title ?? e.title,
			epic: s ? i.get(s) ?? nt(s) : null,
			epicId: s,
			repository: e?.repository ?? null,
			planId: e?.planId ?? null,
			spec: e?.spec ?? null,
			state: Zn(l, e),
			wave: r.get(n) ?? 1,
			decision: e?.decision ?? null,
			authority: t?.authority ?? e?.authority ?? "local",
			route: e?.route ?? null,
			issue: t?.issue ?? e?.issue ?? null,
			item: t,
			attempt: c.length ? Math.max(...c) : null,
			sessions: t?.sessions ?? [],
			reviewRounds: t?.rounds?.length ?? 0,
			deliveryState: Jn(t),
			deferred: e ? $e(e) === "deferred" : !1,
			review: e?.review === !0,
			handSetReview: !!(t?.handSetReview ?? e?.handSetReview),
			noSession: t?.noSession ?? e?.noSession ?? null,
			nextAction: t?.nextAction ?? e?.nextAction ?? null,
			planArchived: t?.planArchived ?? e?.planArchived ?? null,
			at: Yn(t)
		});
	};
	for (let e of t) e.status !== "superseded" && s(n.get(e.id) ?? null, e);
	for (let t of e?.tasks ?? []) !o.has(t.id) && t.kind === "leaf" && t.status !== "superseded" && s(t, null);
	return a.done.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a.running.sort((e, t) => (t.at ?? "").localeCompare(e.at ?? "")), a;
}
function $n(e) {
	let t = (e?.statuses ?? []).filter((e) => !e.complete && !["deferred", "blocked"].includes(e.id));
	return t.find((e) => e.id === "planned")?.id ?? t[0]?.id ?? null;
}
function er(e) {
	let t = (e?.statuses ?? []).filter((e) => e.complete);
	return (t.find((e) => e.id === "done") ?? t.find((e) => e.id === "accepted") ?? t[0])?.id ?? null;
}
function tr(e, t) {
	return Object.fromEntries(Object.keys(e).map((n) => [n, e[n].filter((e) => Nn({
		...e,
		decision: e.decision ?? (e.deliveryState === "decision" ? "delivery stopped" : null)
	}, t))]));
}
var nr = {
	id: "done",
	label: "Done",
	tint: "var(--ok)"
};
function rr(e, t, n = 16) {
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
function ir(e) {
	if (e) return e === "running" ? "in-progress" : e === "deferred" ? "waiting" : e;
}
var ar = (e) => e.route === "local" && !e.deferred, or = de, sr = {
	dashboard: pe,
	plans: B,
	graph: ve,
	delivery: W,
	flow: H,
	conflicts: M,
	untriaged: le,
	settings: ke
};
function cr(e) {
	let t = {
		kind: e.kind,
		taskId: e.taskId ?? null
	};
	return e.field && (t.field = e.field), e.slot && (t.slot = e.slot), e.id && (t.id = e.id), t;
}
function lr(e) {
	let t = async (t, n, r) => (await e.post(Dt, {
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
var ur = (e, t) => Math.min(t, Math.max(1, e) * 100), dr = (e) => `Show ${Math.min(100, e)} more (${e} left)`, fr = {
	color: "var(--danger)",
	borderColor: "var(--danger)"
}, pr = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, mr = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function Y(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(G, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x(f, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...mr,
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
	return /* @__PURE__ */ b(G, {
		text: e.tooltip ?? e.label,
		children: (n) => /* @__PURE__ */ b(f, {
			type: "button",
			"aria-label": e.label,
			"aria-describedby": e.tooltip && e.tooltip !== e.label ? n : void 0,
			onClick: e.onClick,
			disabled: e.disabled,
			style: {
				...mr,
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
var hr = e(async () => !1), gr = () => n(hr);
function _r({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		if (!n) return;
		a.current?.focus();
		let e = (e) => {
			e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), l(!1));
		};
		return document.addEventListener("keydown", e, !0), () => document.removeEventListener("keydown", e, !0);
	}), /* @__PURE__ */ x(hr.Provider, {
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
							style: pr,
							children: n.action
						})]
					})
				]
			})]
		})]
	});
}
function vr(e) {
	let t = gr(), n = e.icon;
	return /* @__PURE__ */ b(G, {
		text: e.tooltip ?? e.label,
		children: (r) => /* @__PURE__ */ x(f, {
			type: "button",
			"data-danger": !0,
			"aria-label": e.label,
			"aria-describedby": e.tooltip ? r : void 0,
			disabled: e.disabled,
			onClick: () => void t(e.confirm).then((t) => t && e.onConfirm()),
			style: {
				...mr,
				...fr
			},
			children: [n && /* @__PURE__ */ b(n, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function yr(e, t) {
	if (e.open) for (let n of t) n !== e && n.open && (n.open = !1);
}
function br(e) {
	let [t, n] = c(e.open ?? !1), { group: r } = e;
	return /* @__PURE__ */ x("details", {
		open: t,
		name: r,
		onToggle: (t) => {
			let i = t.currentTarget;
			n(i.open), e.onToggle?.(i.open), r && yr(i, i.ownerDocument.querySelectorAll(`details[data-fold-group="${CSS.escape(r)}"]`));
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
function xr(e) {
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
function Sr(e) {
	let n = l(), r = o(() => lr(n), [n]), { openChat: i } = u(), [a, s] = c(null);
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
					s(q(e));
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
function Cr(e) {
	let [t, n] = c({
		reset: e,
		pages: {}
	}), r = t.reset === e ? t.pages : {}, i = (e, t) => ur(r[e] ?? 1, t);
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
function wr(e) {
	return e.left <= 0 ? null : /* @__PURE__ */ b("button", {
		type: "button",
		className: "mt-2 text-xs underline",
		onClick: e.onMore,
		"data-show-more": !0,
		children: dr(e.left)
	});
}
function Z({ tooltip: e, ...t }) {
	return /* @__PURE__ */ b(G, {
		text: e,
		children: (e) => /* @__PURE__ */ b(f, {
			...t,
			"aria-describedby": e
		})
	});
}
function Tr(e) {
	let t = sr[e.view];
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
function Er(e) {
	let t = sr[e.view];
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
function Dr({ text: e }) {
	let t = Ht(e);
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
function Or({ label: e, records: t }) {
	return t.length ? /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [/* @__PURE__ */ b("span", {
			className: "font-medium",
			children: e
		}), /* @__PURE__ */ b("ul", {
			className: "mt-1 flex flex-col gap-1",
			children: t.map((e, t) => /* @__PURE__ */ b("li", {
				className: "text-muted",
				children: qt(e).map(([e, t]) => `${e}: ${t}`).join(" · ")
			}, t))
		})]
	}) : null;
}
function kr({ rounds: e }) {
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
							children: Gt(e)
						}) : Gt(e),
						e.cause && /* @__PURE__ */ x("span", {
							className: "text-muted",
							children: [" · ", e.cause]
						}),
						e.findings.length > 0 && /* @__PURE__ */ b("ul", {
							className: "ml-3 mt-1 flex flex-col gap-1",
							children: e.findings.map((e) => /* @__PURE__ */ x("li", { children: [
								/* @__PURE__ */ b(K, {
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
function Ar({ reviews: e }) {
	let t = Ht(e.pullRequest), n = `PR ${e.pullRequestNumber ? `#${e.pullRequestNumber}` : ""}`;
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "GitHub reviews"
			}),
			" ",
			/* @__PURE__ */ b(K, {
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
					children: Kt(e)
				}, e.reviewer))
			})
		]
	});
}
function jr({ feedback: e }) {
	let t = Ht(e.pullRequest);
	return /* @__PURE__ */ x("div", {
		className: "mt-2 text-xs",
		children: [
			/* @__PURE__ */ b("span", {
				className: "font-medium",
				children: "PR feedback"
			}),
			" ",
			zt(e),
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
						let n = Ht(e.url);
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
function Mr({ item: e, onSupersede: t }) {
	let [n, r] = c(!1), [i, a] = c({
		id: "",
		title: e.title
	}), [o, s] = c(!1), [l, u] = c(null);
	if (!n) return /* @__PURE__ */ b("div", {
		className: "mt-2",
		children: /* @__PURE__ */ b(Z, {
			tooltip: "Replace this task with a new one. Cannot be undone here.",
			onClick: () => r(!0),
			children: "Supersede"
		})
	});
	let d = async () => {
		s(!0), u(null);
		try {
			await t(e.id, Xt(i)), r(!1);
		} catch (e) {
			u(q(e));
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
				children: [/* @__PURE__ */ b(vr, {
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
function Nr(e) {
	return (e.rounds ?? []).filter((e) => e.current).flatMap((e) => e.verdicts.flatMap((e) => e.findings.filter((e) => e.state === "open")));
}
function Pr({ item: e, busy: t, onRetry: n }) {
	let r = Nr(e), [i, a] = c(/* @__PURE__ */ new Set()), [o, s] = c("");
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
			/* @__PURE__ */ b("div", { children: /* @__PURE__ */ x(vr, {
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
function Fr({ item: e, onSupersede: t }) {
	return /* @__PURE__ */ x("div", {
		className: "mt-2 border-t pt-2",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ b(K, {
					variant: e.complete ? "success" : "info",
					children: e.status ?? "no status"
				}), e.repository && /* @__PURE__ */ b(K, { children: e.repository })]
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
					let n = Ht(e.url), r = `PR ${e.number ? `#${e.number}` : ""}${e.merged ? " (merged)" : ""}`;
					return /* @__PURE__ */ b("li", { children: n ? /* @__PURE__ */ b("a", {
						href: n,
						target: "_blank",
						rel: "noreferrer",
						className: "underline",
						children: r
					}) : r }, t);
				})
			}),
			e.githubReviews && /* @__PURE__ */ b(Ar, { reviews: e.githubReviews }),
			e.prFeedback && /* @__PURE__ */ b(jr, { feedback: e.prFeedback }),
			e.evidence.length > 0 && /* @__PURE__ */ x("div", {
				className: "mt-2 text-xs",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: "Evidence"
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-1",
					children: e.evidence.map((e, t) => /* @__PURE__ */ x("li", { children: [
						e.text ? /* @__PURE__ */ b(Dr, { text: e.text }) : e.kind ?? "record",
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
			/* @__PURE__ */ b(kr, { rounds: e.rounds ?? [] }),
			/* @__PURE__ */ b(Or, {
				label: "Deliveries",
				records: e.deliveries
			}),
			/* @__PURE__ */ b(Or, {
				label: "Worktrees",
				records: e.worktrees
			}),
			Yt(e) && /* @__PURE__ */ b(Mr, {
				item: e,
				onSupersede: t
			})
		]
	});
}
// kirocrew-app/ui/src/conflicts-api.ts
function Ir(e) {
	let t = (e.authority ?? "local") === "local";
	return e.kind === "stale-session" && e.slot ? "dismiss" : e.kind === "review" ? Br(e).length ? "reviewed" : null : !t || e.kind === "needs-human" && e.reason === "hand-set-review" ? null : e.kind === "needs-human" ? e.reason === "blocked" ? "unblock" : "reviewed" : e.kind === "decision" ? "settle" : null;
}
var Lr = {
	reviewed: "Mark reviewed",
	unblock: "Unblock",
	dismiss: "Dismiss",
	settle: "Settle"
}, Rr = {
	reviewed: "Count it as reviewed so it may start. Undo by editing it.",
	unblock: "Return it to planned so it may start when ready.",
	dismiss: "Remove the ended session from this list. Its chat is kept.",
	settle: "Clear the decision and note your answer on the task."
}, zr = (e) => `${e.kind ?? ""}:${e.taskId ?? ""}:${e.field ?? ""}:${e.slot ?? ""}${e.id ? `:${e.id}` : ""}`, Br = (e) => (e.tasks ?? []).filter((e) => (e.authority ?? "local") === "local").map((e) => ({ taskId: e.id })), Vr = (e) => e.kind === "review" ? Br(e) : [e.slot ? {
	taskId: e.taskId,
	slot: e.slot
} : { taskId: e.taskId }], Hr = (e) => e.reduce((e, t) => e + Vr(t).length, 0);
function Ur(e, t, n) {
	let r = new Set(n.settled.map((e) => `${e.taskId}\u0000${e.slot ?? ""}`)), i = (e) => r.has(`${e}\u0000`);
	return e.flatMap((e) => {
		if (Ir(e) !== t) return [e];
		if (e.kind === "review") {
			let t = (e.tasks ?? []).filter((e) => !i(e.id));
			return t.length === (e.tasks ?? []).length ? [e] : t.length ? [Wr(e, t)] : [];
		}
		return r.has(`${e.taskId}\u0000${t === "dismiss" ? e.slot ?? "" : ""}`) ? [] : [e];
	});
}
function Wr(e, t) {
	let n = t.length;
	return {
		...e,
		tasks: t,
		title: `Review ${n} ${n === 1 ? "task" : "tasks"} in ${e.plan ?? "this plan"}: their design text changed`
	};
}
function Gr(e, t) {
	let n = t.settled.length, r = [n ? `${Lr[e]}: ${n} done.` : ""];
	return t.refused.length && r.push(`Refused ${t.refused.length}: ${t.refused.map((e) => `${e.taskId} (${e.reason})`).join("; ")}`), {
		ok: t.refused.length === 0,
		text: r.filter(Boolean).join(" ")
	};
}
function Kr(e) {
	return e.kind === "github-conflict" && !e.choices?.length ? e.field === "identity" ? "Two issues claim this task. Close or merge the duplicate issue on GitHub; Avoozl reads the result on its next tick." : "GitHub owns the issue state. Reopen or close it on GitHub; Avoozl reads the result on its next tick." : e.kind === "resource" ? "Two active runs share a resource. Stop one run, or wait for one to finish." : e.kind === "tracker-conflict" ? "The tracker record owns this field. Change it there or in the plan." : e.kind === "content-unavailable" ? "Add or fix this rule set’s terms file or plugin on this machine. Avoozl checks again on the next tick." : e.kind === "content-match" ? null : e.kind === "needs-human" && e.reason === "hand-set-review" ? "Discuss it, mark it done, or move it back to planned from the task." : e.kind === "review" && Ir(e) === null ? "GitHub or a plugin owns these tasks. Review them where they live." : Ir(e) === null && e.kind !== "github-conflict" ? `${e.authority} owns this task. Settle it where it lives.` : null;
}
var qr = [
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
function Jr(e) {
	return Object.fromEntries(qr.map((t) => [t.key, e.filter(t.keep).length]));
}
function Yr(e) {
	return e.kind === "github-conflict" ? `${e.changedBy ?? "Someone"} changed ${e.field ?? "a managed field"} on GitHub; Avoozl manages it. ${e.detail}` : e.kind === "needs-human" && e.reason === "crew" || e.kind === "needs-human" && e.reason === "hand-set-review" ? e.detail : e.kind === "needs-human" ? e.reason === "blocked" ? "Marked blocked: nothing starts until you unblock it." : "New or edited: it waits for your review before it can start." : e.kind === "review" ? e.detail : e.kind === "decision" ? `An open question stops this task: ${e.detail}` : e.kind === "stale-session" ? `Its chat ended before the task finished. ${e.detail}` : e.detail;
}
var Xr = (e) => e.changedAt ?? e.openedAt ?? null;
function Zr(e) {
	let t = new Set(e.map(Ir));
	if (t.size !== 1) return null;
	let [n] = t;
	return n && n !== "settle" ? n : null;
}
function Qr(e, t, n) {
	let r = t === 1 && n ? n : `${t} ${e === "reviewed" ? "tasks" : "items"}`;
	return {
		title: `${Lr[e]}: ${r}?`,
		body: {
			reviewed: "They count as reviewed and may start when ready. To undo, edit each task again.",
			unblock: "They go back to planned and may start when ready.",
			dismiss: "The ended sessions leave the list. Their chats are not deleted.",
			settle: "The decision is cleared and your answer is noted on the task."
		}[e],
		action: Lr[e]
	};
}
function $r(e) {
	let t = /* @__PURE__ */ new Set(["closed", "lost"]), n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.sessions.filter((e) => !t.has(e.status ?? "")).sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
		e[0] && n.set(r.id, Tn(e[0]));
	}
	return n;
}
var ei = 864e5, ti = [
	{
		value: "1d",
		label: "Older than a day",
		ms: ei
	},
	{
		value: "7d",
		label: "Older than a week",
		ms: 7 * ei
	},
	{
		value: "30d",
		label: "Older than 30 days",
		ms: 30 * ei
	}
], ni = (e) => e.taskId ?? e.tasks?.[0]?.id ?? null, ri = (e, t) => e.issue?.repository ?? t?.repository ?? null;
function ii(e, t, n, r) {
	let i = t.q?.trim().toLowerCase() ?? "", a = qr.find((e) => e.key === t.kind), o = ti.find((e) => e.value === t.age), s = Xr(e), c = ri(e, n);
	return (!i || e.title.toLowerCase().includes(i) || (e.taskId ?? "").toLowerCase().includes(i) || e.detail.toLowerCase().includes(i)) && (!a || a.keep(e)) && (!t.plan || (n ? kn(n) : null) === t.plan) && (!t.epic || n?.epic === t.epic) && (!t.repository || (t.repository === "(none)" ? !c : c === t.repository)) && (!o || s !== null && r - Date.parse(s) > o.ms) && (!t.changedBy || e.changedBy === t.changedBy);
}
function ai(e, t) {
	let n = new Map((t?.tasks ?? []).map((e) => [e.id, e])), r = new Map((t?.epics ?? []).map((e) => [e.id, e.title])), i = Jr(e), a = (t, n = (e) => e) => {
		let r = /* @__PURE__ */ new Set();
		for (let n of e) {
			let e = t(n);
			e && r.add(e);
		}
		return [...r].map((e) => ({
			value: e,
			label: n(e)
		})).sort((e, t) => e.label.localeCompare(t.label));
	}, o = (e) => n.get(ni(e) ?? "");
	return {
		kinds: qr.filter((e) => e.key !== "all").map((e) => ({
			value: e.key,
			label: `${e.label} (${i[e.key]})`
		})),
		plans: a((e) => {
			let t = o(e);
			return t ? kn(t) : null;
		}, (e) => e.replace(/^(spec|plan):/, "")),
		epics: a((e) => o(e)?.epic, (e) => r.get(e) ?? e),
		repositories: [...a((e) => ri(e, o(e))), ...e.some((e) => !ri(e, o(e))) ? [{
			value: On,
			label: "No repository"
		}] : []],
		ages: ti.map(({ value: e, label: t }) => ({
			value: e,
			label: t
		})),
		changedBy: a((e) => e.changedBy)
	};
}
var oi = "avoozl-conflict-filter", si = (e) => `avoozl.conflict-filters.${e}`, ci = [
	"q",
	"kind",
	"plan",
	"epic",
	"repository",
	"age",
	"changedBy"
];
function li(e, t) {
	try {
		let n = JSON.parse(e?.getItem(si(t)) ?? "null");
		if (!n || typeof n != "object") return {};
		let r = {};
		for (let e of ci) typeof n[e] == "string" && n[e] && (r[e] = n[e]);
		return r.kind && !qr.some((e) => e.key === r.kind && e.key !== "all") && delete r.kind, r.age && !ti.some((e) => e.value === r.age) && delete r.age, r;
	} catch {
		return {};
	}
}
function ui(e, t, n) {
	try {
		e?.setItem(si(t), JSON.stringify(n));
	} catch {}
}
var di = (e) => ci.some((t) => !!e[t]?.trim());
// kirocrew-app/ui/src/useRead.ts
function fi(e, n) {
	let [i, a] = c(null), [o, s] = c(null), [l, u] = c(!1), d = t(async () => {
		if (e) {
			u(!0), s(null);
			try {
				a(await n(e));
			} catch (e) {
				s(q(e));
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
function pi({ owner: e }) {
	if (!e.authority) return null;
	if (e.authority !== "github") return /* @__PURE__ */ b(K, { children: e.authority });
	if (!e.issue) return /* @__PURE__ */ b(K, { children: "pending projection" });
	let t = Ht(e.issue.url), n = e.issue.number ? `#${e.issue.number}` : "GitHub";
	return t ? /* @__PURE__ */ b("a", {
		href: t,
		target: "_blank",
		rel: "noreferrer",
		className: "text-xs underline",
		children: n
	}) : /* @__PURE__ */ b(K, { children: n });
}
// kirocrew-app/ui/src/FilterSelect.tsx
var mi = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function hi(e) {
	return /* @__PURE__ */ x("label", {
		htmlFor: e.id,
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: { maxWidth: "13rem" },
		children: [/* @__PURE__ */ b("span", { children: e.label }), /* @__PURE__ */ x("select", {
			id: e.id,
			value: e.value,
			onChange: (t) => e.onChange(t.target.value),
			className: "rounded border px-2 py-1 text-sm",
			style: mi,
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
var gi = {
	...mi,
	width: "4.5rem"
}, _i = (e) => {
	let t = Number(e);
	return Number.isInteger(t) && t > 0 ? t : void 0;
};
function vi({ id: e, field: t }) {
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
			style: mi
		})]
	}) : t.kind === "select" ? /* @__PURE__ */ b(hi, {
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
					onChange: (e) => t.onChange(_i(e.target.value), t.max),
					className: "rounded border px-2 py-1 text-sm",
					style: gi
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
					onChange: (e) => t.onChange(t.min, _i(e.target.value)),
					className: "rounded border px-2 py-1 text-sm",
					style: gi
				})
			]
		})]
	});
}
function yi(e) {
	let t = As("(max-width: 767px)"), [n, r] = c(!1), i = /* @__PURE__ */ x("div", {
		className: "flex flex-wrap items-end gap-3",
		"data-filter-bar": !0,
		children: [e.fields.map((t) => /* @__PURE__ */ b(vi, {
			id: e.id,
			field: t
		}, t.key)), /* @__PURE__ */ x(Z, {
			tooltip: "Clear every filter on this tab",
			type: "button",
			onClick: e.onClear,
			disabled: !e.active,
			style: {
				display: "inline-flex",
				alignItems: "center",
				gap: 6
			},
			children: [/* @__PURE__ */ b(Pe, {
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
function bi() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function xi(e, n) {
	let { event: i, read: a, write: o, empty: s } = n, [l, u] = c(() => e ? a(bi(), e) : s);
	return r(() => {
		u(e ? a(bi(), e) : s);
		let t = () => e && u(a(bi(), e));
		return window.addEventListener(i, t), () => window.removeEventListener(i, t);
	}, [
		e,
		i,
		a,
		s
	]), [l, t((t) => {
		u(t), e && (o(bi(), e, t), window.dispatchEvent(new Event(i)));
	}, [
		e,
		i,
		o
	])];
}
function Si(e, t, n) {
	e.write(bi(), t, n), window.dispatchEvent(new Event(e.event));
}
// kirocrew-app/ui/src/ConflictsView.tsx
var Ci = {
	event: oi,
	read: li,
	write: ui,
	empty: {}
}, wi = {
	...Jt,
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit"
}, Ti = {
	title: "Title",
	body: "Managed body section",
	labels: "Managed labels",
	blockers: "Blocked-by links",
	state: "Issue state",
	identity: "Issue identity"
}, Ei = (e) => Array.isArray(e) ? e.length ? e.join(", ") : "none" : e || "empty";
function Di({ item: e }) {
	if (e.expected === void 0 && e.actual === void 0) return null;
	let t = (e, t) => /* @__PURE__ */ x("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ b("div", {
			className: "text-xs text-muted",
			children: e
		}), /* @__PURE__ */ b("pre", {
			className: "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs",
			style: { borderColor: "var(--border)" },
			children: Ei(t)
		})]
	});
	return /* @__PURE__ */ x("div", {
		className: "mt-2 grid gap-2",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" },
		children: [t("Avoozl expected", e.expected), t(e.changedBy ? `GitHub has (changed by ${e.changedBy})` : "GitHub has", e.actual)]
	});
}
function Oi(e) {
	let { item: t, workspaceId: n, revision: r, busy: i, run: a } = e, s = l(), u = o(() => Bt(s), [s]), d = o(() => hn(s), [s]), [f, p] = c(""), m = Ir(t), h = Ht(t.issue?.url ?? null), _ = (i, o) => a(async () => {
		let a = await d.settle(n, i, Vr(t), r, o);
		return e.onSettled(i, a), Gr(i, a);
	}), v = Kr(t);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			t.kind === "content-match" && t.id && /* @__PURE__ */ b(Ai, {
				id: t.id,
				readable: t.readable === !0,
				workspaceId: n,
				busy: i,
				run: a
			}),
			t.kind === "github-conflict" && (t.choices?.length ?? 0) > 0 && /* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(vr, {
						icon: De,
						tooltip: "Next tick writes Avoozl's value over the GitHub edit",
						disabled: i || t.resolution === "desired",
						confirm: {
							title: `Re-apply Avoozl's ${Ti[t.field ?? ""] ?? t.field} on ${t.taskId}?`,
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
					htmlFor: `answer-${zr(t)}`,
					className: "flex flex-1 flex-col gap-1 text-xs",
					style: { minWidth: "16rem" },
					children: [/* @__PURE__ */ x("span", { children: [
						"Your answer to “",
						t.detail,
						"”"
					] }), /* @__PURE__ */ b(g, {
						id: `answer-${zr(t)}`,
						value: f,
						onChange: (e) => p(e.target.value)
					})]
				}), /* @__PURE__ */ b(vr, {
					icon: A,
					tooltip: Rr.settle,
					disabled: i || !f.trim(),
					confirm: Qr("settle", 1, t.title),
					onConfirm: () => _("settle", f.trim()),
					children: "Settle"
				})]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					m === "dismiss" && /* @__PURE__ */ b(vr, {
						icon: Pe,
						tooltip: Rr.dismiss,
						disabled: i,
						confirm: Qr("dismiss", 1, t.title),
						onConfirm: () => _("dismiss"),
						children: "Dismiss"
					}),
					t.kind === "review" && m === "reviewed" && /* @__PURE__ */ b(ki, {
						item: t,
						busy: i,
						onConfirm: () => _("reviewed")
					}),
					m && m !== "settle" && m !== "dismiss" && t.kind !== "review" && /* @__PURE__ */ b(Y, {
						icon: A,
						tooltip: Rr[m],
						disabled: i,
						onClick: () => _(m),
						children: Lr[m]
					}),
					t.kind === "stale-session" && t.deliveryState === "decision" && /* @__PURE__ */ b(Y, {
						icon: De,
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
					t.kind === "tracker-conflict" && Ht(t.link ?? null) && /* @__PURE__ */ b("a", {
						href: Ht(t.link ?? null),
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
function ki({ item: e, busy: t, onConfirm: n }) {
	let r = gr(), i = Hr([e]);
	return /* @__PURE__ */ x(Y, {
		icon: A,
		tooltip: "Count these tasks as reviewed so they may start when ready",
		disabled: t,
		onClick: () => void r(Qr("reviewed", i, i === 1 ? e.tasks?.[0]?.title : void 0)).then((e) => e && n()),
		children: [
			"Mark ",
			i,
			" reviewed"
		]
	});
}
function Ai(e) {
	let { id: t, readable: n, workspaceId: r, busy: i, run: a } = e, s = l(), u = o(() => Bt(s), [s]), [d, f] = c(""), [p, m] = c(null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2",
		children: [
			n && /* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-2",
				children: /* @__PURE__ */ b(Y, {
					icon: z,
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
				}), /* @__PURE__ */ b(vr, {
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
function ji({ item: e, workspaceId: t }) {
	let n = l(), i = o(() => hn(n), [n]), [a, s] = c(null), [u, d] = c(null);
	return r(() => {
		e.taskId && i.detail(t, e.taskId).then(s, (e) => d(q(e)));
	}, [
		i,
		t,
		e.taskId
	]), /* @__PURE__ */ x("div", {
		className: "mt-2 flex flex-col gap-2 rounded border p-2 text-sm",
		style: { borderColor: "var(--border)" },
		"data-history": !0,
		children: [
			/* @__PURE__ */ b(Di, { item: e }),
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
					children: [/* @__PURE__ */ b(G, {
						text: e.at,
						children: /* @__PURE__ */ b("span", {
							className: "w-20 shrink-0 text-muted",
							children: J(e.at)
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
function Mi(e) {
	let { item: t } = e, n = Dn(), [r, i] = c(null), a = Xr(t);
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
					/* @__PURE__ */ b(K, {
						variant: [
							"decision",
							"needs-human",
							"review",
							"content-match",
							"content-unavailable"
						].includes(t.kind) ? "warning" : "danger",
						children: wi[t.kind] ?? t.kind
					}),
					t.field && /* @__PURE__ */ b(K, { children: Ti[t.field] ?? t.field }),
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
					/* @__PURE__ */ b(pi, { owner: t }),
					e.plan && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: ["· plan ", e.plan]
					}),
					a && /* @__PURE__ */ b(G, {
						text: a,
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["· ", J(a)]
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
								children: [/* @__PURE__ */ b(ne, {
									size: 14,
									"aria-hidden": "true"
								}), "Attach"]
							}),
							/* @__PURE__ */ b(X, {
								icon: ge,
								label: `Ask in a chat about ${t.title}`,
								tooltip: "Ask in a chat: a new chat seeded with this item's full context",
								onClick: e.onAsk
							}),
							t.kind === "review" ? /* @__PURE__ */ b(X, {
								icon: or,
								label: `Info: ${t.title}`,
								tooltip: "Why these tasks need review, and the list of them",
								onClick: () => n.openReview(t, e.onReviewed)
							}) : /* @__PURE__ */ b(X, {
								icon: ce,
								label: `History of ${t.title}`,
								tooltip: "History",
								onClick: () => i(r === "history" ? null : "history")
							}),
							t.taskId && /* @__PURE__ */ b(X, {
								icon: or,
								label: `View task ${t.taskId}`,
								tooltip: "Open this task's details in the drawer",
								onClick: () => n.openTask(t.taskId)
							}),
							/* @__PURE__ */ b(Y, {
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
				children: Yr(t)
			}),
			r === "history" && /* @__PURE__ */ b(ji, {
				item: t,
				workspaceId: e.workspaceId
			}),
			r === "resolve" && /* @__PURE__ */ b("div", {
				className: "mt-2 rounded border p-2",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(Oi, {
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
function Ni({ workspaceId: e }) {
	let n = l(), i = o(() => Bt(n), [n]), a = o(() => hn(n), [n]), s = Sr(e), u = gr(), { value: d, error: m, busy: h, reload: g } = fi(e, t(async (e) => {
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
	}, [i])), [_, v] = xi(e, Ci), S = JSON.stringify(_), C = Cr(S), [w, T] = c(null), [E, D] = c(0), [O, k] = c(/* @__PURE__ */ new Set()), [A, j] = c(!1), [M, N] = c(null);
	r(() => {
		T(d?.page.items ?? null), D(d?.page.revision ?? 0), k(/* @__PURE__ */ new Set());
	}, [d]);
	let P = o(() => {
		let e = d?.graph ?? null;
		return new Map((e?.tasks ?? []).map((e) => [e.id, e.spec ?? e.planId ?? (e.epic ? nt(e.epic) : null)]));
	}, [d]), F = o(() => new Map((d?.graph?.tasks ?? []).map((e) => [e.id, e])), [d]);
	r(() => k(/* @__PURE__ */ new Set()), [S]);
	let I = o(() => $r(d?.delivery ?? []), [d]), L = (e) => {
		j(!0), N(null), (async () => {
			try {
				N(await e());
			} catch (e) {
				let t = q(e);
				N({
					ok: !1,
					text: /Database changed/.test(t) ? "Something changed elsewhere. Refresh, then try again." : t
				});
			} finally {
				j(!1);
			}
		})();
	}, R = (e, t) => {
		D(t.revision), T((n) => n && Ur(n, e, t)), k(/* @__PURE__ */ new Set());
	}, ee = w ?? [], te = ai(ee, d?.graph ?? null), ne = Date.now(), z = ee.filter((e) => ii(e, _, F.get(ni(e) ?? ""), ne)), B = C.take("conflicts", z), V = z.filter((e) => O.has(zr(e))), re = B.length > 0 && B.every((e) => O.has(zr(e))), ie = V.length === z.length && z.length > 0, H = Zr(V), U = (e) => {
		let t = {
			..._,
			...e
		};
		for (let e of Object.keys(t)) t[e] || delete t[e];
		v(t);
	}, ae = async () => {
		e && H && await u(Qr(H, Hr(V))) && L(async () => {
			let t = await a.settle(e, H, V.flatMap(Vr), E);
			return R(H, t), Gr(H, t);
		});
	}, oe = (e, t) => {
		let n = new Set(O);
		t ? n.add(zr(e)) : n.delete(zr(e)), k(n);
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-conflicts-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(Tr, {
					id: "avoozl-conflicts-title",
					view: "conflicts",
					children: "Conflicts"
				}), e && /* @__PURE__ */ b(Y, {
					icon: Ee,
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
				/* @__PURE__ */ b(yi, {
					id: "avoozl-conflicts",
					label: "Filter conflicts",
					active: di(_),
					onClear: () => v({}),
					fields: [
						{
							kind: "search",
							key: "q",
							label: "Search",
							value: _.q ?? "",
							placeholder: "Task, ID or detail",
							onChange: (e) => U({ q: e })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: _.kind ?? "",
							options: te.kinds,
							onChange: (e) => U({ kind: e })
						},
						{
							kind: "select",
							key: "plan",
							label: "Plan",
							value: _.plan ?? "",
							options: te.plans,
							onChange: (e) => U({ plan: e })
						},
						{
							kind: "select",
							key: "epic",
							label: "Epic",
							value: _.epic ?? "",
							options: te.epics,
							onChange: (e) => U({ epic: e })
						},
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: _.repository ?? "",
							options: te.repositories,
							onChange: (e) => U({ repository: e })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: _.age ?? "",
							options: te.ages,
							onChange: (e) => U({ age: e })
						},
						{
							kind: "select",
							key: "changed-by",
							label: "Changed by",
							value: _.changedBy ?? "",
							options: te.changedBy,
							onChange: (e) => U({ changedBy: e })
						}
					],
					children: /* @__PURE__ */ x("p", {
						role: "status",
						className: "text-xs text-muted",
						children: [
							z.length,
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
									"aria-label": `Select the ${B.length} shown`,
									checked: re,
									onChange: (e) => {
										let t = new Set(O);
										for (let n of B) e.target.checked ? t.add(zr(n)) : t.delete(zr(n));
										k(t);
									}
								}),
								"Select the ",
								B.length,
								" shown"
							]
						}),
						z.length > B.length && /* @__PURE__ */ x(Z, {
							tooltip: "Select every matching item, including ones not shown yet",
							type: "button",
							onClick: () => k(new Set(z.map(zr))),
							disabled: ie,
							children: [
								"Select all ",
								z.length,
								" matching"
							]
						}),
						/* @__PURE__ */ x("span", {
							role: "status",
							className: "text-xs text-muted",
							"data-selection": !0,
							children: [
								V.length ? `${V.length} selected${ie ? `: all ${z.length} matching` : re && V.length === B.length ? `: the ${B.length} shown` : ""}. Bulk acts on these ${V.length}. · ` : "",
								B.length,
								" shown of ",
								z.length,
								A ? " · Working…" : ""
							]
						}),
						V.length > 0 && /* @__PURE__ */ x(y, { children: [
							/* @__PURE__ */ x(Y, {
								icon: ge,
								tooltip: "Start a Kiro Crew chat seeded with the selected items",
								onClick: () => void s.ask({ items: V.map(cr) }),
								children: [
									"Ask in a chat about ",
									V.length,
									" ",
									V.length === 1 ? "item" : "items"
								]
							}),
							H ? /* @__PURE__ */ x(Z, {
								tooltip: Rr[H],
								type: "button",
								primary: !0,
								onClick: () => void ae(),
								disabled: A,
								children: [
									Lr[H],
									" ",
									V.length
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
						children: B.map((t) => /* @__PURE__ */ b(Mi, {
							item: t,
							plan: t.taskId ? P.get(t.taskId) ?? null : null,
							onReviewed: () => void g(),
							attach: (t.kind === "stale-session" ? t.link : null) ?? (t.taskId ? I.get(t.taskId) ?? null : null),
							workspaceId: e,
							revision: E,
							busy: A,
							selectable: !0,
							selected: O.has(zr(t)),
							onSelect: (e) => oe(t, e),
							run: L,
							onSettled: R,
							onAsk: () => void s.ask({ items: [cr(t)] })
						}, zr(t)))
					}),
					/* @__PURE__ */ b(wr, { ...C.more("conflicts", z.length) }),
					z.length === 0 && /* @__PURE__ */ b("p", {
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
var Pi = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
function Fi(e) {
	let t = [], n = new RegExp(Pi.source, "g"), r = 0, i;
	for (; i = n.exec(e);) i.index > r && t.push({
		kind: "text",
		text: e.slice(r, i.index)
	}), i[1] ? t.push({
		kind: "code",
		text: i[1].slice(1, -1)
	}) : i[2] ? t.push({
		kind: "strong",
		children: Fi(i[2].slice(2, -2))
	}) : i[3] ? t.push({
		kind: "em",
		children: Fi(i[3].slice(1, -1))
	}) : t.push({
		kind: "link",
		href: Ht(i[6]),
		children: Fi(i[5])
	}), r = i.index + i[0].length;
	return r < e.length && t.push({
		kind: "text",
		text: e.slice(r)
	}), t;
}
var Ii = (e) => e.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((e) => e.trim()), Li = /^\s*\|.*\|\s*$/, Ri = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, zi = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
function Bi(e) {
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
		if (Li.test(o) && e + 1 < t.length && Ri.test(t[e + 1])) {
			a();
			let r = e + 1, i = Ii(o), s = [];
			for (e += 2; e < t.length && Li.test(t[e]); e++) s.push(Ii(t[e]));
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
		let u = zi.exec(o);
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
var Vi = (e, t, n) => `${e}-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section"}-${n}`;
function Hi(e, t, n = 3) {
	return Bi(e).flatMap((e, r) => e.kind === "heading" && e.level <= n ? [{
		level: e.level,
		text: e.text.replace(/[*_`]/g, ""),
		id: Vi(t, e.text, r)
	}] : []);
}
// kirocrew-app/ui/src/prism/before.ts
var Ui = globalThis;
// node_modules/prismjs/components/prism-sql.js
Ui.__avoozlPrismPrevious = Ui.Prism, Ui.Prism = {
	manual: !0,
	disableWorkerMessageHandler: !0
}, (/* @__PURE__ */ Fe(((e, t) => {
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
var Wi = globalThis, Gi = Wi.Prism;
Wi.__avoozlPrismPrevious === void 0 ? delete Wi.Prism : Wi.Prism = Wi.__avoozlPrismPrevious, delete Wi.__avoozlPrismPrevious;
// kirocrew-app/ui/src/highlight.ts
var Ki = [
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
], qi = {
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
}, Ji = /* @__PURE__ */ new Map();
function Yi(e) {
	if (!e || !Array.isArray(e.tokens)) return null;
	let t = {};
	try {
		e.tokens.forEach((e, n) => {
			let r = Ki.includes(e.type) ? e.type : "plain", i = [...new Set(String(e.flags ?? "").replace(/[^imsu]/g, ""))].join("");
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
function Xi(e) {
	Ji.clear();
	for (let [t, n] of Object.entries(e ?? {})) {
		let e = Yi(n);
		e && Ji.set(t.toLowerCase(), e);
	}
	return [...Ji.keys()];
}
function Zi(e) {
	if (!e) return null;
	let t = e.toLowerCase();
	return Ji.get(t) ?? Gi.languages[qi[t] ?? t] ?? null;
}
var Qi = (e) => Array.isArray(e) ? e.flatMap(Qi) : typeof e == "string" ? [e] : [{
	types: [e.type, ...[e.alias ?? []].flat()],
	content: Qi(e.content)
}];
function $i(e, t) {
	let n = Zi(t);
	if (!n || e.length > 2e4) return null;
	try {
		return Qi(Gi.tokenize(e, n));
	} catch {
		return null;
	}
}
var ea = {
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
function ta(e) {
	let t = [...e].reverse().find((e) => ea[e]) ?? e.find((e) => ea[e]);
	return {
		...t ? { color: ea[t] } : {},
		...e.includes("comment") ? { fontStyle: "italic" } : {}
	};
}
// kirocrew-app/ui/src/Markdown.tsx
function na({ parts: e }) {
	return e.map((e, t) => e.kind === "text" ? e.text : e.kind === "code" ? /* @__PURE__ */ b("code", {
		className: "rounded px-1 text-[12px]",
		style: { background: "var(--bg-elevated)" },
		children: e.text
	}, t) : e.kind === "strong" ? /* @__PURE__ */ b("strong", { children: /* @__PURE__ */ b(na, { parts: e.children }) }, t) : e.kind === "em" ? /* @__PURE__ */ b("em", { children: /* @__PURE__ */ b(na, { parts: e.children }) }, t) : e.href ? /* @__PURE__ */ b("a", {
		href: e.href,
		target: "_blank",
		rel: "noreferrer",
		className: "underline",
		style: { color: "var(--accent)" },
		children: /* @__PURE__ */ b(na, { parts: e.children })
	}, t) : /* @__PURE__ */ b(na, { parts: e.children }, t));
}
var ra = ({ text: e }) => /* @__PURE__ */ b(na, { parts: Fi(e) });
function ia({ tokens: e }) {
	return e.map((e, t) => typeof e == "string" ? e : /* @__PURE__ */ b("span", {
		style: ta(e.types),
		children: /* @__PURE__ */ b(ia, { tokens: e.content })
	}, t));
}
function aa({ text: e, lang: t, line: n }) {
	let r = $i(e, t);
	return /* @__PURE__ */ b("pre", {
		className: "overflow-x-auto rounded border p-2 text-[12px]",
		style: {
			borderColor: "var(--border)",
			background: "var(--bg-elevated)"
		},
		"data-lang": t ?? void 0,
		"data-line": n,
		"data-highlighted": r ? "true" : void 0,
		children: /* @__PURE__ */ b("code", { children: r ? /* @__PURE__ */ b(ia, { tokens: r }) : e })
	});
}
function oa({ text: e, idPrefix: t, measure: n }) {
	let r = n ? { maxWidth: n } : void 0;
	return /* @__PURE__ */ b("div", {
		className: "flex min-w-0 flex-col gap-2 break-words text-sm leading-relaxed",
		style: { color: "var(--text)" },
		children: Bi(e).map((e, n) => {
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
					id: t ? Vi(t, e.text, n) : void 0,
					className: `${i} mt-2 font-semibold`,
					style: {
						...r,
						scrollMarginTop: 12
					},
					children: /* @__PURE__ */ b(ra, { text: e.text })
				}, n);
			}
			if (e.kind === "paragraph") return /* @__PURE__ */ b("p", {
				"data-line": e.line,
				style: r,
				children: /* @__PURE__ */ b(ra, { text: e.text })
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
				children: /* @__PURE__ */ b(ra, { text: e.text })
			}, n);
			if (e.kind === "code") return /* @__PURE__ */ b(aa, {
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
						children: /* @__PURE__ */ b(ra, { text: e })
					}, t)) }) }), /* @__PURE__ */ b("tbody", { children: e.rows.map((t, n) => /* @__PURE__ */ b("tr", { children: e.head.map((e, n) => /* @__PURE__ */ b("td", {
						className: "border px-2 py-1 align-top",
						style: { borderColor: "var(--border)" },
						children: /* @__PURE__ */ b(ra, { text: t[n] ?? "" })
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
					}), /* @__PURE__ */ b(ra, { text: e.text })]
				}, t))
			}, n);
		})
	});
}
// kirocrew-app/ui/src/plans-api.ts
var sa = "Uncategorized";
function ca(e) {
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
function la(e) {
	return e.total ? Math.round(e.done / e.total * 100) : null;
}
function ua(e) {
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
function da(e) {
	return `Use the Avoozl skill's "Plan a goal" steps 2 to 4 to change ${e.spec ? `the existing spec folder .kiro/specs/${e.spec}/${e.planId ? ` (plan ${e.planId})` : ""}` : `the stored plan ${e.planId}, which has no spec folder yet; move it to .kiro/specs/<name>/ first`}. Ask me what should change. Edit it in a planner session, critique it in a second isolated session, store the new revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Plans view.`;
}
function fa(e) {
	let t = async (t, n, r = {}) => (await e.post(Dt, {
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
var pa = (e, t, n = t + "s") => `${e} ${e === 1 ? t : n}`;
function ma(e) {
	return e.retire ? [
		`${pa(e.open, "open task")}: archived. Their rows stay as history.`,
		`${pa(e.running, "running chat")}: left alone. Each task is archived when its chat ends.`,
		`${pa(e.done, "done task")}: kept as they are.`,
		`${pa(e.dependents, "task")} outside the plan that wait on it: each gets a decision for you.`,
		"The plan is marked deleted and stays in history. There is no undo button."
	] : ["The draft is marked deleted. No task was made from it.", "The plan stays in history."];
}
var ha = [
	["requirements.md", "Requirements"],
	["bugfix.md", "Bugfix"],
	["design.md", "Design"],
	["tasks.md", "Tasks"]
];
function ga(e) {
	return e ? ha.filter(([t]) => typeof e.documents?.[t] == "string").map(([t, n]) => ({
		file: t,
		label: n,
		text: e.documents[t]
	})) : [];
}
var _a = (e) => e ? e.slice(0, 12) : "—", va = (e) => `${e.file ?? "tasks.md"}:${e.lineStart}`;
function ya(e) {
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
function ba(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.repository ?? "unknown repository";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return [...t];
}
function xa(e) {
	return e ? e.disk.changed ? "The folder changed on disk. Reload it first." : e.approvals.some((t) => t.hash === e.hash) ? "This revision is approved." : e.quality.canApprove ? null : "Fix the errors below first." : "Store this spec first.";
}
var Sa = "Use the Avoozl skill's \"Plan a goal\" steps. Ask me for the goal and which repositories are in scope. Draft one Kiro spec folder in the planning repository with a planner session, critique it in a second isolated session, store and validate the revision, and show me the result. Do not approve it; I approve the exact revision in the Avoozl Plans view.";
function Ca(e, t) {
	let n = t.q?.trim().toLowerCase() ?? "";
	return e.filter((e) => (!e.archived || t.archived) && (!n || e.name.toLowerCase().includes(n) || (e.spec ?? "").toLowerCase().includes(n) || (e.planId ?? "").toLowerCase().includes(n)) && (!t.category || (e.category ?? "Uncategorized") === t.category) && (!t.status || e.status === t.status) && (!t.kind || e.kind === t.kind) && (!t.has || (t.has === "ready" ? e.now.ready > 0 : t.has === "running" ? e.now.running > 0 : e.now.needsYou > 0)));
}
function wa(e) {
	let t = (t) => [...new Set(e.map(t))].sort((e, t) => e === "Uncategorized" ? 1 : t === "Uncategorized" ? -1 : e.localeCompare(t));
	return {
		categories: t((e) => e.category ?? "Uncategorized"),
		statuses: t((e) => e.status)
	};
}
var Ta = (e) => ({
	plan: e.key,
	purpose: "discuss-plan"
}), Ea = [
	"Its open tasks stop starting. Running chats keep going.",
	"Tasks in other plans that wait on it get a decision for you.",
	"It is hidden on Plans, Graph, Delivery and the Dashboard. Show archived brings it back.",
	"Nothing is deleted, and its spec folder is not touched. Unarchive undoes all of it."
];
function Da(e) {
	let t = e.action === "archived" ? "Archived" : e.action === "unarchived" ? "Unarchived" : e.action;
	return e.by ? `${t} by ${e.by}` : t;
}
// kirocrew-app/ui/src/PlansView.tsx
var Oa = "80ch", ka = "17rem", Aa = "(max-width: 1023px)";
function ja(e) {
	for (let t = e?.parentElement ?? null; t; t = t.parentElement) {
		let { overflowY: e } = getComputedStyle(t);
		if (/(auto|scroll|overlay)/.test(e) && t.scrollHeight > t.clientHeight) return t;
	}
	return null;
}
function Ma(e, t) {
	let [n, i] = c(null);
	return r(() => {
		if (!t) return;
		let n = () => {
			let t = ja(e.current), n = t ? Math.max(0, t.getBoundingClientRect().top) : 0, r = t ? Math.min(window.innerHeight, t.getBoundingClientRect().bottom) : window.innerHeight;
			i(Math.max(240, Math.floor(r - n - 16)));
		};
		return n(), window.addEventListener("resize", n), () => window.removeEventListener("resize", n);
	}, [e, t]), n;
}
var Na = (e) => `avoozl-doc-${e.replace(/\.md$/, "")}`, Pa = (e) => document.getElementById(e)?.scrollIntoView?.({ block: "start" });
function Fa({ docs: e, error: t }) {
	let n = ga(e);
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
			}), /* @__PURE__ */ b(oa, {
				text: t.text,
				idPrefix: Na(t.file),
				measure: Oa
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
function Ia(e) {
	let { projection: t, busy: n } = e;
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ b(m, { children: "GitHub preview" }),
		/* @__PURE__ */ b("p", {
			className: "mt-1 text-sm text-muted",
			children: "Lists every write a projection would make. Nothing is written."
		}),
		/* @__PURE__ */ b("div", {
			className: "mt-2",
			children: /* @__PURE__ */ b(Z, {
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
					/* @__PURE__ */ b(K, { children: "preview only" }),
					" Another machine writes ",
					t.previewOnly.join(", "),
					"."
				] }),
				t.writes.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-muted",
					children: "GitHub already matches this revision."
				}) : ba(t.writes).map(([e, t]) => /* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("p", {
					className: "font-medium",
					children: [
						e,
						" · ",
						t.length,
						" writes"
					]
				}), /* @__PURE__ */ b("ul", {
					className: "mt-1 flex flex-col gap-0.5",
					children: t.map((e, t) => /* @__PURE__ */ b("li", { children: ya(e) }, t))
				})] }, e)),
				t.conflicts.map((e) => /* @__PURE__ */ x("p", { children: [
					/* @__PURE__ */ b(K, {
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
function La(e) {
	let { spec: t, plan: n, preview: r, busy: i } = e, a = xa(n), o = n?.disk.critique ?? t.critique, s = n?.quality.diagnostics ?? [];
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
						/* @__PURE__ */ b("code", { children: _a(n.hash) }),
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
							icon: te,
							tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
							onClick: e.onStore,
							disabled: i,
							children: "Import"
						}),
						n?.disk.changed && /* @__PURE__ */ b(Y, {
							icon: Ee,
							tooltip: "Store the changed files as a new revision to approve",
							onClick: e.onReload,
							disabled: i,
							children: "Reload from disk"
						}),
						n && /* @__PURE__ */ x(Y, {
							icon: L,
							onClick: e.onApprove,
							disabled: i || a !== null,
							tooltip: a ?? "Approve this exact revision. Its ready tasks may then start.",
							children: ["Approve revision ", _a(n.hash)]
						})
					]
				}),
				n && a && /* @__PURE__ */ b("p", {
					className: "mt-2 text-sm text-muted",
					children: a
				})
			] }),
			/* @__PURE__ */ b(Fa, {
				docs: e.docs,
				error: e.docsError
			}, t.name),
			/* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Diagnostics" }), n ? s.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-2 text-sm text-muted",
				children: "No diagnostics."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: s.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(K, {
						variant: e.severity === "error" ? "danger" : void 0,
						children: e.severity
					}),
					" ",
					/* @__PURE__ */ b("code", { children: va(e) }),
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
				children: o.current ? "Reviews this revision." : `Reviews ${_a(o.reviewedHash)}, not this revision.`
			}), o.findings.length === 0 ? /* @__PURE__ */ b("p", {
				className: "mt-1 text-sm text-muted",
				children: "No findings."
			}) : /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: o.findings.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b(K, { children: e.kind }),
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
							/* @__PURE__ */ b(pi, { owner: e }),
							r.baseline?.taskIds.includes(e.taskId) && /* @__PURE__ */ b(K, { children: "done" }),
							t.length > 0 && /* @__PURE__ */ x("span", {
								className: "text-muted",
								children: [" · requires ", t.join(", ")]
							})
						] }, e.taskId);
					})
				})
			] }),
			n?.state === "approved" && /* @__PURE__ */ b(Ia, {
				projection: e.projection,
				busy: i,
				onPreview: e.onProjection
			}),
			n && n.approvals.length > 0 && /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ b(m, { children: "Approvals" }), /* @__PURE__ */ b("ul", {
				className: "mt-2 flex flex-col gap-1 text-sm",
				children: n.approvals.map((e) => /* @__PURE__ */ x("li", { children: [
					/* @__PURE__ */ b("code", { children: _a(e.hash) }),
					" · ",
					e.at,
					e.approvedBy ? ` · ${e.approvedBy}` : ""
				] }, e.id))
			})] })
		]
	});
}
function Ra({ tasks: e }) {
	let t = la(e), n = As("(prefers-reduced-motion: reduce)"), [i, a] = c(n ? t ?? 0 : 0);
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
var za = {
	done: "success",
	approved: "info",
	changed: "warning",
	draft: void 0,
	"not imported": void 0
}, Ba = {
	done: "Done",
	approved: "Approved",
	changed: "Changed on disk",
	draft: "Draft",
	"not imported": "Not imported"
};
function Va({ now: e }) {
	let t = [
		e.needsYou ? /* @__PURE__ */ x(K, {
			variant: "warning",
			children: [e.needsYou, " need you"]
		}, "you") : null,
		e.running ? /* @__PURE__ */ x(K, {
			variant: "info",
			children: [e.running, " running"]
		}, "run") : null,
		e.ready ? /* @__PURE__ */ x(K, { children: [e.ready, " ready"] }, "ready") : null
	].filter(Boolean);
	return t.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: t
	}) : /* @__PURE__ */ b("span", {
		className: "text-xs text-muted",
		children: "—"
	});
}
var Ha = {
	padding: "8px 10px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "middle"
}, Ua = {
	padding: "6px 10px",
	textAlign: "left",
	fontWeight: 600,
	whiteSpace: "nowrap"
};
function Wa(e) {
	let { filter: t } = e, n = wa(e.rows), r = (n) => {
		let r = {
			...t,
			...n
		};
		for (let e of Object.keys(r)) r[e] || delete r[e];
		e.onChange(r);
	};
	return /* @__PURE__ */ b(yi, {
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
					label: Ba[e] ?? e
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
var Ga = "Archive this plan: its tasks stop starting and it is hidden. You can undo it.", Ka = "Unarchive this plan: its tasks may start again and it shows everywhere.";
function qa(e) {
	let { row: t } = e, n = ua(t);
	return /* @__PURE__ */ x("span", {
		className: "flex justify-end gap-1.5",
		children: [
			n.importable && e.onImport && /* @__PURE__ */ b(X, {
				icon: te,
				label: `Import ${t.name}`,
				tooltip: "Store this folder as a draft plan. Approves and starts nothing.",
				disabled: e.busy,
				onClick: e.onImport
			}),
			e.onOpen && /* @__PURE__ */ b(X, {
				icon: or,
				label: `Open docs for ${t.name}`,
				tooltip: "Open this plan's documents and tasks",
				onClick: e.onOpen
			}),
			n.scoped && /* @__PURE__ */ b(X, {
				icon: ye,
				label: `Graph of ${t.name}`,
				tooltip: "Show this plan's tasks in the Graph",
				onClick: () => e.onScope("graph")
			}),
			n.scoped && /* @__PURE__ */ b(X, {
				icon: me,
				label: `Delivery of ${t.name}`,
				tooltip: "Show this plan's tasks in Delivery",
				onClick: () => e.onScope("delivery")
			}),
			n.review && e.onReview && /* @__PURE__ */ b(X, {
				icon: L,
				label: `Review ${t.name}`,
				tooltip: "Open this plan to check and approve it",
				onClick: e.onReview
			}),
			e.onChange && /* @__PURE__ */ b(X, {
				icon: Se,
				label: `Plan a change to ${t.name}`,
				tooltip: "Start a planner chat to change this plan",
				onClick: e.onChange
			}),
			e.onArchive && n.archivable && /* @__PURE__ */ b(X, {
				icon: w,
				label: `Archive ${t.name}`,
				tooltip: Ga,
				disabled: e.busy,
				onClick: e.onArchive
			}),
			e.onUnarchive && n.unarchivable && /* @__PURE__ */ b(X, {
				icon: T,
				label: `Unarchive ${t.name}`,
				tooltip: Ka,
				disabled: e.busy,
				onClick: e.onUnarchive
			}),
			e.onDelete && n.deletable && /* @__PURE__ */ b(X, {
				icon: je,
				label: `Delete ${t.name}`,
				tooltip: "Delete this plan. You confirm first; it stays in history.",
				disabled: e.busy,
				onClick: e.onDelete,
				style: fr
			})
		]
	});
}
function Ja(e) {
	let t = ca(e.rows), [n, r] = c(/* @__PURE__ */ new Set()), i = Cr(e.reset ?? ""), a = (e) => (t) => {
		t.stopPropagation(), e();
	}, o = (e, t) => {
		let n = new Set(e);
		return n.has(t) ? n.delete(t) : n.add(t), n;
	}, s = /* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", {
		className: "text-xs text-muted",
		children: [
			/* @__PURE__ */ b("th", {
				style: Ua,
				children: "Plan"
			}),
			/* @__PURE__ */ b("th", {
				style: Ua,
				children: "Status"
			}),
			/* @__PURE__ */ b("th", {
				style: Ua,
				children: "Progress"
			}),
			/* @__PURE__ */ b("th", {
				style: Ua,
				children: "Now"
			}),
			/* @__PURE__ */ b("th", {
				style: {
					...Ua,
					textAlign: "right"
				},
				children: "Epics"
			}),
			/* @__PURE__ */ b("th", {
				style: Ua,
				children: "Last change"
			}),
			/* @__PURE__ */ b("th", {
				style: Ua,
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
							/* @__PURE__ */ b(ie, {
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
								children: /* @__PURE__ */ b(Ra, { tasks: u })
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
									style: Ha,
									children: [/* @__PURE__ */ b("button", {
										type: "button",
										className: "text-left font-medium hover:underline",
										onClick: a(() => e.onOpen(t)),
										children: t.name
									}), /* @__PURE__ */ x("span", {
										className: "mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted",
										children: [
											/* @__PURE__ */ b(K, { children: t.kind === "spec" ? t.type ?? "spec" : "old-style" }),
											t.spec ? /* @__PURE__ */ b("code", { children: t.spec }) : t.planId ? /* @__PURE__ */ b("code", { children: t.planId }) : null,
											t.errors > 0 && /* @__PURE__ */ x(K, {
												variant: "danger",
												children: [t.errors, " errors"]
											}),
											t.archived && /* @__PURE__ */ b(K, { children: "Archived" })
										]
									})]
								}),
								/* @__PURE__ */ b("td", {
									style: Ha,
									className: "whitespace-nowrap",
									children: /* @__PURE__ */ b(K, {
										variant: za[t.status],
										children: Ba[t.status] ?? t.status
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Ha,
										width: 150
									},
									children: /* @__PURE__ */ b(Ra, { tasks: t.tasks })
								}),
								/* @__PURE__ */ b("td", {
									style: Ha,
									children: /* @__PURE__ */ b(Va, { now: t.now })
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...Ha,
										textAlign: "right"
									},
									className: "tabular-nums",
									children: t.epics
								}),
								/* @__PURE__ */ b("td", {
									style: Ha,
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(G, {
										text: t.lastChange,
										children: /* @__PURE__ */ b("span", { children: t.lastChange ? J(t.lastChange) : "—" })
									})
								}),
								/* @__PURE__ */ b("td", {
									style: Ha,
									className: "whitespace-nowrap",
									onClick: (e) => e.stopPropagation(),
									children: /* @__PURE__ */ b(qa, {
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
					}), t.rows.length > l.length && /* @__PURE__ */ b(wr, { ...i.more(t.category, t.rows.length) })]
				})]
			}, t.category);
		})
	});
}
function Ya(e) {
	let { row: t, graph: n, docs: r } = e, i = (n?.tasks ?? []).filter((e) => e.kind === "leaf"), a = Object.fromEntries(We.map((e) => [e.id, 0]));
	for (let e of i) a[$e(e)] += 1;
	let o = new Map((n?.epics ?? []).map((e) => [e.id, e.title])), s = /* @__PURE__ */ new Map();
	for (let e of i) {
		if (!e.epic) continue;
		let t = o.get(e.epic), n = s.get(e.epic) ?? {
			title: t && t !== e.epic ? t : nt(e.epic),
			done: 0,
			total: 0
		};
		n.total += 1, $e(e) === "done" && (n.done += 1), s.set(e.epic, n);
	}
	let c = (n?.tasks ?? []).filter((e) => e.decision), l = ga(r), u = (e) => /* @__PURE__ */ b("h4", {
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
						icon: Se,
						primary: !0,
						tooltip: "Start a planner chat that drafts a change to the spec files",
						onClick: e.onEdit,
						children: "Edit plan"
					}),
					/* @__PURE__ */ b(Y, {
						icon: _e,
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
								tooltip: Ga,
								onClick: e.onArchive
							}),
							e.onUnarchive && /* @__PURE__ */ b(X, {
								icon: T,
								label: `Unarchive ${t.name}`,
								tooltip: Ka,
								onClick: e.onUnarchive
							}),
							e.onDelete && /* @__PURE__ */ b(X, {
								icon: je,
								label: `Delete ${t.name}`,
								tooltip: "Delete this plan. You confirm first; it stays in history.",
								onClick: e.onDelete,
								style: fr
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
						/* @__PURE__ */ b(K, {
							variant: za[t.status],
							children: Ba[t.status] ?? t.status
						}),
						t.type && /* @__PURE__ */ b(K, { children: t.type }),
						t.archived && /* @__PURE__ */ b(K, { children: "Archived" })
					]
				}), /* @__PURE__ */ b(Ra, { tasks: t.tasks })]
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
				children: We.map((e) => /* @__PURE__ */ x("div", {
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
					return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(G, {
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
						onClick: () => Pa(`avoozl-doc-${e.file}`),
						children: e.label
					}), /* @__PURE__ */ b("ul", {
						className: "flex flex-col",
						children: Hi(e.text, Na(e.file), 2).filter((e) => e.level === 2).map((e) => /* @__PURE__ */ b("li", {
							className: "truncate pl-3",
							children: /* @__PURE__ */ b("button", {
								type: "button",
								className: "text-left text-xs text-muted hover:underline",
								onClick: () => Pa(e.id),
								children: e.text
							})
						}, e.id))
					})] }, e.file))
				})]
			}),
			/* @__PURE__ */ x("div", { children: [u("Last change"), /* @__PURE__ */ b("p", {
				className: "mt-1",
				children: /* @__PURE__ */ b(G, {
					text: t.lastChange,
					children: /* @__PURE__ */ b("span", { children: t.lastChange ? J(t.lastChange) : /* @__PURE__ */ b("span", {
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
						children: [/* @__PURE__ */ b("span", { children: Da(e) }), /* @__PURE__ */ b(G, {
							text: e.at,
							children: /* @__PURE__ */ b("span", {
								className: "shrink-0 text-xs text-muted",
								children: J(e.at)
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
function Xa(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), d = s(null);
	r(() => {
		d.current?.focus();
		let t = (t) => t.key === "Escape" && e.onDone(null);
		return document.addEventListener("keydown", t), () => document.removeEventListener("keydown", t);
	}, [e]);
	let p = async () => {
		u(!0), o(null);
		try {
			let r = await n.archive(i, t.planId);
			e.onDone(`Archived ${t.name}. ${r.held} tasks held, ${r.running} running chats left alone, ${r.decisions} decisions opened. Show archived on Plans brings it back.`);
		} catch (e) {
			o(q(e));
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
					children: Ea.map((e) => /* @__PURE__ */ b("li", { children: e }, e))
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
function Za(e) {
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
							/* @__PURE__ */ b(G, {
								text: t.at,
								children: /* @__PURE__ */ b("span", { children: J(t.at) })
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
				tooltip: Ka,
				onClick: e.onUnarchive,
				children: "Unarchive"
			})
		]
	}) : null;
}
function Qa(e) {
	let { row: t, client: n, workspaceId: i } = e, [a, o] = c(null), [l, u] = c(!1), [d, p] = c(null), [m, h] = c(!1), g = s(null);
	r(() => {
		n.deletePreview(i, t.planId).then(o, (e) => p(q(e)));
	}, [
		n,
		i,
		t.planId
	]), r(() => {
		g.current?.focus();
		let t = (t) => t.key === "Escape" && e.onDone(null);
		return document.addEventListener("keydown", t), () => document.removeEventListener("keydown", t);
	}, [e]);
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
				p(q(e));
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
					children: ma(a).map((e) => /* @__PURE__ */ b("li", { children: e }, e))
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
function $a(e) {
	let n = e.workspaceId, i = l(), { openChat: a } = u(), d = o(() => fa(i), [i]), h = o(() => Bt(i), [i]), g = Dn(), _ = Sr(n), v = As(Aa), S = s(null), C = Ma(S, !v), [w, T] = c(null), [E, D] = c(null), [O, k] = c(null), [A, j] = c(null), [M, N] = c(null), [P, F] = c({}), [I, L] = c(null), [R, ee] = c(null), [te, ne] = c(null), [z, B] = c(null), [V, re] = c(null), [ie, H] = c(null), [U, ae] = c(null), [oe, se] = c(null), [ce, le] = c(!1), [, ue] = c(0), de = s(null), fe = t(async (e) => {
		le(!0), se(null);
		try {
			await e();
		} catch (e) {
			se(q(e));
		} finally {
			le(!1);
		}
	}, []), pe = t((e) => fe(async () => j(await d.table(e))), [fe, d]);
	r(() => {
		j(null), N(null), n && (pe(n), d.languages(n).then((e) => {
			Xi(e.languages), ue((e) => e + 1);
		}, () => void 0));
	}, [
		n,
		pe,
		d
	]);
	let W = A?.items.find((e) => e.key === M) ?? null, me = W?.spec ? A?.specs.find((e) => e.name === W.spec) ?? null : null, he = t(async (e, t) => {
		if (L(null), ee(null), ne(null), !t) return;
		let [n, r] = await Promise.all([d.get(e, t), d.preview(e, t).catch(() => null)]);
		L(n), ee(r);
	}, [d]);
	r(() => {
		if (B(null), re(null), ae(null), H(null), !n || !W) return;
		let e = !0;
		return fe(() => he(n, W.planId)), h.graph(n, {
			plan: W.planId ?? void 0,
			spec: W.spec ?? void 0
		}).then((t) => e && H(t), () => void 0), W.spec ? d.documents(n, W.spec).then((t) => e && B(t), (t) => e && re(q(t))) : W.planId && d.text(n, W.planId).then((t) => e && ae({
			text: t,
			error: null
		}), (t) => e && ae({
			text: null,
			error: q(t)
		})), () => {
			e = !1;
		};
	}, [n, M]), r(() => {
		M && de.current?.scrollIntoView?.({ block: "start" });
	}, [M]);
	let ge = (e) => N(e.key), _e = (t, n) => e.onScope?.(t, { plan: An(n) }), ve = (e) => a({
		message: da(e),
		autoSend: !1
	}), ye = (e) => {
		if (!n) return;
		let t = n;
		fe(async () => {
			let n = await e(t), r = await d.table(t);
			j(r);
			let i = r.items.find((e) => e.key === M) ?? null;
			await he(t, i?.planId ?? n?.id ?? null);
		});
	}, be = (e) => e.spec && ye((t) => d.store(t, e.spec)), xe = (e) => e.planId && ye(async (t) => {
		let n = await d.unarchive(t, e.planId);
		return k(`Unarchived ${e.name}. ${n.released} tasks may start again; ${n.decisions} decisions closed.`), { id: e.planId };
	}), Se = A ? Ca(A.items, P) : [];
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-plans-title",
		className: "flex flex-col gap-3.5",
		children: [
			w && n && /* @__PURE__ */ b(Qa, {
				workspaceId: n,
				row: w,
				client: d,
				onDone: (e) => {
					T(null), e !== null && (N(null), k(e), pe(n));
				}
			}),
			E && n && /* @__PURE__ */ b(Xa, {
				workspaceId: n,
				row: E,
				client: d,
				onDone: (e) => {
					D(null), e !== null && (k(e), pe(n));
				}
			}),
			O && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				children: O
			}),
			/* @__PURE__ */ x("div", {
				ref: de,
				className: "flex flex-wrap items-center gap-3",
				children: [
					W && /* @__PURE__ */ b(f, {
						onClick: () => N(null),
						children: "← All plans"
					}),
					/* @__PURE__ */ b(Tr, {
						id: "avoozl-plans-title",
						view: "plans",
						children: W ? W.name : "Plans"
					}),
					n && !W && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Y, {
						icon: Ee,
						onClick: () => void pe(n),
						disabled: ce,
						children: "Refresh"
					}), /* @__PURE__ */ b(Y, {
						icon: we,
						tooltip: "Add a draft task. It waits for your review.",
						onClick: () => g.addTask(),
						children: "Add task"
					})] }),
					W && /* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(qa, {
							row: W,
							onScope: (e) => _e(e, W),
							onReview: () => Pa("avoozl-plan-main")
						})
					})
				]
			}),
			(oe || _.error) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: oe ?? _.error
			}),
			/* @__PURE__ */ b("p", {
				role: "status",
				className: "sr-only",
				children: ce ? "Working…" : ""
			}),
			n ? W ? /* @__PURE__ */ x("div", {
				style: v ? {
					display: "flex",
					flexDirection: "column",
					gap: 14
				} : {
					display: "grid",
					gridTemplateColumns: `${ka} minmax(0, 1fr)`,
					gap: 14,
					alignItems: "start"
				},
				children: [/* @__PURE__ */ b("aside", {
					ref: S,
					"aria-label": "Plan summary",
					"data-plan-aside-scroll": !0,
					style: v ? void 0 : {
						position: "sticky",
						top: 8,
						maxHeight: C ?? "calc(100vh - 2rem)",
						overflowY: "auto",
						overscrollBehavior: "contain"
					},
					children: /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(Ya, {
						row: W,
						graph: ie,
						docs: z,
						onEdit: () => ve(W),
						onDiscuss: () => void _.ask(Ta(W)),
						onDelete: ua(W).deletable ? () => T(W) : void 0,
						onArchive: ua(W).archivable ? () => D(W) : void 0,
						onUnarchive: ua(W).unarchivable ? () => xe(W) : void 0,
						onDrill: (t) => e.onDrill?.(t),
						onOpenTask: (e) => g.openTask(e)
					}) })
				}), /* @__PURE__ */ x("div", {
					id: "avoozl-plan-main",
					className: "min-w-0",
					children: [
						/* @__PURE__ */ b(Za, {
							row: W,
							busy: ce,
							onUnarchive: () => xe(W)
						}),
						W.categoryProblem && /* @__PURE__ */ x("p", {
							className: "mb-3 text-sm text-muted",
							children: [
								/* @__PURE__ */ b(K, {
									variant: "warning",
									children: "front-matter"
								}),
								" ",
								W.categoryProblem
							]
						}),
						me ? /* @__PURE__ */ b(La, {
							docs: z,
							docsError: V,
							spec: me,
							plan: I,
							preview: R,
							projection: te,
							busy: ce,
							onStore: () => ye((e) => d.store(e, me.name)),
							onReload: () => I && ye((e) => d.reload(e, I.id, I.hash)),
							onApprove: () => I && ye((e) => d.approve(e, I.id, I.hash)),
							onProjection: () => I && void fe(async () => ne(await d.projection(n, I.id)))
						}) : /* @__PURE__ */ x(p, { children: [
							/* @__PURE__ */ b(m, { children: W.name }),
							/* @__PURE__ */ x("p", {
								className: "mt-1 text-xs text-muted",
								children: [/* @__PURE__ */ b("code", { children: W.planId }), " · written before the spec layout, so it has no folder. Its tasks show in Graph and Delivery."]
							}),
							/* @__PURE__ */ b("div", {
								className: "mt-2",
								children: U ? U.error ? /* @__PURE__ */ b("p", {
									className: "text-sm text-danger",
									children: U.error
								}) : U.text ? /* @__PURE__ */ b(oa, {
									text: U.text,
									measure: Oa
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
			}) : /* @__PURE__ */ x(y, { children: [A && A.items.length > 0 && /* @__PURE__ */ b(Wa, {
				filter: P,
				rows: A.items,
				onChange: F,
				children: /* @__PURE__ */ x("p", {
					className: "text-xs text-muted",
					role: "status",
					children: [
						Se.length,
						" of ",
						A.items.length,
						" plans"
					]
				})
			}), /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-plans-list": !0,
				children: [
					A === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: ce ? "Loading…" : "Not loaded"
					}) : A.items.length === 0 ? /* @__PURE__ */ x("p", {
						className: "text-sm text-muted",
						children: [
							"No plans yet",
							A.root ? ` in ${A.root}/.kiro/specs` : "",
							". Use Plan a goal in the header to start one."
						]
					}) : Se.length ? /* @__PURE__ */ b(Ja, {
						rows: Se,
						reset: JSON.stringify(P),
						busy: ce,
						onOpen: ge,
						onScope: _e,
						onChange: ve,
						onImport: be,
						onDelete: T,
						onArchive: D,
						onUnarchive: xe
					}) : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "No plan matches these filters."
					}),
					A?.problem && /* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: ["Spec folders: ", A.problem]
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-2 text-xs text-muted",
						children: [
							"Categories come from ",
							/* @__PURE__ */ b("code", { children: "category:" }),
							" in the front-matter of a spec's requirements.md or bugfix.md. Avoozl never guesses one. ",
							sa,
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
var eo = "avoozl-cited", to = "\n[data-cited=\"true\"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }\n";
function no(e) {
	return e.getAttribute("role") === "heading" ? `h${e.getAttribute("aria-level") ?? "6"}` : e.tagName.toLowerCase();
}
function ro(e, t, n, r, i = e) {
	let a = [...e.querySelectorAll("[data-line]")];
	for (let e of a) e.classList.remove(eo), delete e.dataset.cited;
	let o = mn(a.map((e) => ({
		line: Number(e.dataset.line),
		tag: no(e)
	})), t, n).map((e) => a[e]);
	for (let e of o) e.classList.add(eo), e.dataset.cited = "true";
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
function io(e) {
	let t = s(null), n = As("(prefers-reduced-motion: reduce)"), { text: i, lineStart: a, lineEnd: o } = e;
	return r(() => {
		let e = t.current;
		if (!e) return;
		let r = requestAnimationFrame(() => ro(e, a, o, n));
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
		children: [/* @__PURE__ */ b("style", { children: to }), /* @__PURE__ */ b(oa, {
			text: i,
			idPrefix: e.idPrefix
		})]
	});
}
// kirocrew-app/ui/src/repository-rows.ts
function ao(e, t) {
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
var oo = (e) => e && /^[\w.-]+\/[\w.-]+$/.test(e) ? `https://github.com/${e}` : null;
// kirocrew-app/ui/src/focus-trap.ts
function so(e, t, n) {
	return e === 0 ? -1 : t < 0 ? n ? e - 1 : 0 : n ? (t - 1 + e) % e : (t + 1) % e;
}
// kirocrew-app/ui/src/Modal.tsx
var co = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])";
function lo(e) {
	let t = s(null), n = As("(max-width: 767px)"), i = s(e.onDismiss);
	return i.current = e.onDismiss, r(() => {
		let e = document.activeElement;
		t.current?.querySelector(co)?.focus();
		let n = (e) => {
			if (document.querySelector("[data-confirm-dialog]")) return;
			if (e.key === "Escape") {
				e.preventDefault(), i.current();
				return;
			}
			if (e.key !== "Tab" || !t.current) return;
			let n = [...t.current.querySelectorAll(co)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = so(n.length, n.indexOf(document.activeElement), e.shiftKey);
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
var uo = "A repository is a code checkout on this computer. Tasks change its code in their own worktrees and land on its branch. Each workspace keeps its own list.";
function fo() {
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
function po(e, t) {
	return e.github ? t === "local" ? "Local only mode" : t ? t === "plans-repo" ? "Plans repository mode" : "Single repository mode" : "GitHub, no mode yet" : "Local only";
}
function mo(e) {
	return e.rows.length ? /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"aria-label": "Added repositories",
		"data-repository-list": !0,
		children: e.rows.map((t) => {
			let n = oo(t.github);
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
					/* @__PURE__ */ b(K, { children: po(t, e.mode) }),
					/* @__PURE__ */ x("span", {
						className: "flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ b(Y, {
								icon: Se,
								tooltip: `Change ${t.name}'s settings in a dialog`,
								"aria-label": `Edit ${t.name}`,
								onClick: () => e.onEdit(t.key),
								children: "Edit"
							}),
							t.folder && /* @__PURE__ */ b(X, {
								icon: ie,
								label: `Open ${t.name} in Finder`,
								onClick: () => e.onReveal(t.folder)
							}),
							n && /* @__PURE__ */ b(go, {
								href: n,
								name: t.name
							}),
							/* @__PURE__ */ b(vr, {
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
				children: uo
			}),
			/* @__PURE__ */ b(Y, {
				icon: we,
				primary: !0,
				onClick: e.onAdd,
				children: "Add repository"
			})
		]
	});
}
function ho(e) {
	let t = gr(), n = () => e.edited ? void t({
		title: `Discard your changes to ${e.name}?`,
		body: "Every edit in this dialog is lost. .avoozl.json stays as it is.",
		action: "Discard changes"
	}).then((t) => t && e.onDiscard()) : e.onDiscard();
	return /* @__PURE__ */ b(lo, {
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
function go({ href: e, name: t }) {
	return /* @__PURE__ */ x(_o, {
		href: e,
		tip: "Open on GitHub",
		children: [/* @__PURE__ */ b(ne, {
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
function _o(e) {
	return /* @__PURE__ */ b(G, {
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
function vo(e) {
	let t = l(), n = o(() => Ot(t), [t]), [i, a] = c(""), [s, u] = c(null), [d, p] = c(""), [m, h] = c(""), [_, v] = c(!1), [y, S] = c(null);
	r(() => {
		u(null), S(null);
	}, [i]);
	let C = async () => {
		v(!0), S(null);
		try {
			let t = await n.detectRepository(e.workspaceId, i.trim());
			u(t), p(t.id ?? ""), h(t.baseBranch);
		} catch (e) {
			S(q(e));
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
				S(q(e));
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
								/* @__PURE__ */ b(Z, {
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
var yo = "avoozl-reader", bo = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex=\"-1\"])";
function xo(e) {
	let { workspaceId: n, target: i, onClose: a } = e, u = l(), d = o(() => hn(u), [u]), f = fo(), p = As("(max-width: 767px)"), m = As("(prefers-reduced-motion: reduce)"), [h, g] = c({
		text: null,
		error: null
	}), [_, v] = c(null), [, C] = c(0), w = s(null), T = s(null), E = s(null);
	r(() => {
		let e = !0;
		return d.document(n, i.document).then((t) => e && g({
			text: t.text,
			error: null
		}), (t) => e && g({
			text: null,
			error: q(t)
		})), fa(u).languages(n).then((t) => {
			Xi(t.languages), e && C((e) => e + 1);
		}, () => void 0), () => {
			e = !1;
		};
	}, [
		u,
		d,
		n,
		i.document
	]);
	let D = t(() => {
		let e = T.current;
		e && i.lineStart && ro(e, i.lineStart, i.lineEnd, m);
	}, [
		i.lineStart,
		i.lineEnd,
		m
	]);
	r(() => {
		if (h.text === null) return;
		let e = requestAnimationFrame(D);
		return () => cancelAnimationFrame(e);
	}, [h.text, D]), r(() => {
		E.current = document.activeElement, w.current?.focus();
		let e = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), e.stopPropagation(), a();
				return;
			}
			if (e.key !== "Tab" || !w.current) return;
			let t = [...w.current.querySelectorAll(bo)];
			if (!t.length) return e.preventDefault();
			let n = t[0], r = t[t.length - 1], i = document.activeElement;
			e.shiftKey && (i === n || i === w.current) ? (e.preventDefault(), r.focus()) : e.shiftKey || i !== r && w.current.contains(i) || (e.preventDefault(), n.focus());
		};
		return document.addEventListener("keydown", e, !0), () => {
			document.removeEventListener("keydown", e, !0), E.current?.focus?.();
		};
	}, [a]);
	let O = async () => {
		try {
			await navigator.clipboard.writeText(i.document), v(`Copied ${i.document}.`);
		} catch {
			v(`Could not copy. The path is ${i.document}`);
		}
	}, k = async () => {
		if (!fn(i.document)) return v("This path is outside the workspace, so it is not opened.");
		try {
			let e = (await Ot(u).list()).items.find((e) => e.id === n)?.root;
			if (!e) return v("The workspace folder is not known here.");
			v(await f(`${e.replace(/\/$/, "")}/${i.document}`));
		} catch (e) {
			v(q(e));
		}
	}, A = h.text ? Hi(h.text, yo, 3) : [], j = dn(i), M = (e) => w.current?.querySelector(`#${CSS.escape(e)}`)?.scrollIntoView?.({
		block: "start",
		behavior: m ? "auto" : "smooth"
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
		children: [/* @__PURE__ */ b("div", {
			"aria-hidden": "true",
			"data-reader-backdrop": !0,
			className: "absolute inset-0",
			onClick: a,
			style: { background: "color-mix(in srgb, var(--text) 35%, transparent)" }
		}), /* @__PURE__ */ x("div", {
			ref: w,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "avoozl-reader-title",
			tabIndex: -1,
			className: `relative flex flex-col overflow-hidden border shadow-lg outline-none ${p ? "" : "rounded-lg"}`,
			style: {
				width: p ? "100vw" : "min(78rem, 94vw)",
				height: p ? "100vh" : "90vh",
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
							}), j && /* @__PURE__ */ b("span", {
								className: "self-start",
								children: /* @__PURE__ */ b(G, {
									text: `Scroll back to ${j.toLowerCase()}`,
									children: (e) => /* @__PURE__ */ b("button", {
										type: "button",
										className: "text-xs text-muted hover:underline",
										onClick: D,
										"aria-describedby": e,
										children: j
									})
								})
							})]
						}),
						/* @__PURE__ */ b(X, {
							icon: R,
							label: "Copy path",
							tooltip: `Copy ${i.document}`,
							onClick: () => void O()
						}),
						/* @__PURE__ */ b(X, {
							icon: ie,
							label: "Reveal in Finder",
							tooltip: "Show this file in Finder",
							onClick: () => void k()
						}),
						/* @__PURE__ */ b(Y, {
							icon: Pe,
							onClick: a,
							"aria-label": "Close the file",
							children: "Close"
						})
					]
				}), _ && /* @__PURE__ */ b("p", {
					role: "status",
					className: "mt-1 text-xs text-muted",
					style: { overflowWrap: "anywhere" },
					children: _
				})]
			}), /* @__PURE__ */ x("div", {
				className: "min-h-0 grow",
				style: p ? {
					display: "flex",
					flexDirection: "column",
					overflowY: "auto"
				} : {
					display: "grid",
					gridTemplateColumns: "15rem minmax(0, 1fr)",
					minHeight: 0
				},
				ref: p ? T : void 0,
				children: [A.length > 0 && (p ? /* @__PURE__ */ x("details", {
					className: "border-b px-4 py-2 text-sm",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ b("summary", {
						className: "cursor-pointer font-medium",
						children: "Outline"
					}), /* @__PURE__ */ b(So, {
						headings: A,
						onJump: M
					})]
				}) : /* @__PURE__ */ x("nav", {
					"aria-label": "File outline",
					className: "overflow-y-auto border-r px-3 py-3 text-sm",
					style: { borderColor: "var(--border)" },
					children: [/* @__PURE__ */ b("h4", {
						className: "text-xs font-semibold uppercase tracking-wide text-muted",
						children: "Outline"
					}), /* @__PURE__ */ b(So, {
						headings: A,
						onJump: M
					})]
				})), /* @__PURE__ */ b("div", {
					ref: p ? void 0 : T,
					className: "min-w-0 px-5 py-4",
					style: p ? void 0 : {
						overflowY: "auto",
						gridColumn: A.length ? void 0 : "1 / -1"
					},
					"aria-label": `Contents of ${i.document}`,
					children: h.error ? /* @__PURE__ */ b("p", {
						role: "alert",
						className: "text-sm text-danger",
						children: h.error
					}) : h.text === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Reading…"
					}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("style", { children: to }), /* @__PURE__ */ b(oa, {
						text: h.text,
						idPrefix: yo,
						measure: Oa
					})] })
				})]
			})]
		})]
	}), document.body);
}
function So(e) {
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
var Co = .9;
function wo(e, t) {
	let n = Math.max(Math.min(360, t), Math.floor(t * Co));
	return Math.min(n, Math.max(Math.min(360, n), Number.isFinite(e) ? Math.round(e) : 620));
}
var To = (e) => `avoozl.drawerWidth.${e}`;
function Eo(e, t) {
	try {
		let n = Number(e?.getItem(To(t)));
		return Number.isFinite(n) && n > 0 ? n : 620;
	} catch {
		return 620;
	}
}
function Do(e, t, n) {
	try {
		n === 620 ? e?.removeItem(To(t)) : e?.setItem(To(t), String(n));
	} catch {}
}
function Oo(e, t) {
	return t === "ArrowLeft" ? e + 40 : t === "ArrowRight" ? e - 40 : null;
}
// kirocrew-app/ui/src/ReviewState.tsx
var ko = (e, t) => `asked ${e ?? "agent default"}${t ? `, ran ${t}` : ""}`;
function Ao(e) {
	let t = Qt(e.item);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: `flex flex-col gap-1 ${e.compact ? "text-xs" : "text-sm"}`,
		"data-review-runs": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", {
			className: "flex flex-wrap items-center gap-1.5",
			children: [
				/* @__PURE__ */ b(K, {
					variant: t.live ? "info" : void 0,
					children: t.role
				}),
				/* @__PURE__ */ x("span", { children: ["round ", t.round] }),
				/* @__PURE__ */ x("span", {
					className: "text-muted",
					children: ["· ", ko(t.requested, t.served)]
				}),
				t.verdict ? /* @__PURE__ */ b(K, {
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
						children: [/* @__PURE__ */ b(ne, {
							size: 12,
							"aria-hidden": "true"
						}), "Attach"]
					}), e.onInfo && /* @__PURE__ */ b(X, {
						icon: or,
						label: `Details of ${t.role} round ${t.round}`,
						tooltip: "Open the task's details",
						onClick: e.onInfo
					})]
				})
			]
		}, t.key))
	}) : null;
}
function jo(e) {
	let { task: t, workspaceId: n } = e, r = l(), i = o(() => Bt(r), [r]), a = Sr(n), [s, u] = c(!1), [d, p] = c(!1), [m, h] = c(null), g = (t.authority ?? "local") === "local", _ = er(e.graph), v = $n(e.graph), y = async (r, a) => {
		if (e.revision !== null) {
			p(!0), h(null);
			try {
				await i.updateTask(n, t.id, { status: r }, e.revision), u(!1), e.onChanged?.(a);
			} catch (e) {
				h(q(e));
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
				children: $t(t.noSession)
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
						icon: ge,
						tooltip: "Start a Kiro Crew chat about this task. It changes nothing.",
						onClick: () => void a.ask({ tasks: [t.id] }),
						children: "Discuss"
					}),
					g && _ && !s && /* @__PURE__ */ b(Y, {
						icon: A,
						disabled: d || e.revision === null,
						tooltip: "Mark it done. Tasks that wait on it may start. You confirm first.",
						onClick: () => u(!0),
						children: "Mark done"
					}),
					g && v && /* @__PURE__ */ b(Y, {
						icon: De,
						disabled: d || e.revision === null,
						tooltip: `Set its status back to ${v}. The tick may then start it.`,
						onClick: () => void y(v, `Moved ${t.id} back to ${v}.`),
						children: "Back to planned"
					}),
					e.onInfo && /* @__PURE__ */ b(Y, {
						icon: or,
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
var Mo = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function No({ id: e, label: t, children: n, hint: r }) {
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
function Po(e) {
	return /* @__PURE__ */ b("textarea", {
		id: e.id,
		rows: e.rows ?? 3,
		value: e.value,
		placeholder: e.placeholder,
		onChange: (t) => e.onChange(t.target.value),
		className: "rounded border px-2 py-1 text-sm",
		style: Mo
	});
}
function Fo(e) {
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
							style: Mo,
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
							style: Mo,
							children: [/* @__PURE__ */ b("option", {
								value: "",
								children: "its own completion"
							}), vn.map((e) => /* @__PURE__ */ b("option", {
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
function Io({ preview: e }) {
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
function Lo(e) {
	let { workspaceId: t, graph: n, detail: r } = e, i = l(), a = o(() => hn(i), [i]), s = o(() => r ? xn(r) : null, [r]), [u, d] = c(() => s ?? {
		...bn(),
		prerequisites: e.prerequisite ? [{
			id: e.prerequisite,
			kind: "requires",
			condition: ""
		}] : []
	}), [p, m] = c(!1), [h, _] = c(!1), [v, y] = c(null), [S, C] = c(null), w = o(() => new Set((n?.tasks ?? []).map((e) => e.id)), [n]), T = r ? r.task.id : p ? u.id : _n(u.title, w), E = gn(n?.edges ?? [], T || "(new)", u.prerequisites.map((e) => e.id)), D = (e) => d({
		...u,
		...e
	}), O = r?.locked ?? null, k = !!u.title.trim() && (!!r || /^[a-z][a-z0-9-]{2,80}$/.test(T)) && !E, A = async () => {
		_(!0), y(null);
		try {
			let i = Sn({
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
			y(Cn(q(e)));
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
					/* @__PURE__ */ b(K, {
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
			/* @__PURE__ */ b(No, {
				id: "avoozl-task-title",
				label: "Title",
				children: /* @__PURE__ */ b(g, {
					id: "avoozl-task-title",
					value: u.title,
					onChange: (e) => D({ title: e.target.value }),
					required: !0
				})
			}),
			!r && /* @__PURE__ */ b(No, {
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
			/* @__PURE__ */ b(No, {
				id: "avoozl-task-summary",
				label: "Description",
				children: /* @__PURE__ */ b(Po, {
					id: "avoozl-task-summary",
					rows: 4,
					value: u.summary,
					onChange: (e) => D({ summary: e })
				})
			}),
			/* @__PURE__ */ x("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ b(No, {
					id: "avoozl-task-epic",
					label: "Epic",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-epic",
						value: u.epic,
						onChange: (e) => D({ epic: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: Mo,
						children: [/* @__PURE__ */ b("option", {
							value: "",
							children: r ? "Keep" : "Inbox"
						}), (n?.epics ?? []).map((e) => /* @__PURE__ */ b("option", {
							value: e.id,
							children: e.title
						}, e.id))]
					})
				}), /* @__PURE__ */ b(No, {
					id: "avoozl-task-repository",
					label: "Repository",
					children: /* @__PURE__ */ x("select", {
						id: "avoozl-task-repository",
						value: u.repository,
						onChange: (e) => D({ repository: e.target.value }),
						className: "rounded border px-2 py-1 text-sm",
						style: Mo,
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
			/* @__PURE__ */ b(No, {
				id: "avoozl-task-acceptance",
				label: "Acceptance",
				hint: "One condition per line.",
				children: /* @__PURE__ */ b(Po, {
					id: "avoozl-task-acceptance",
					value: u.acceptance,
					onChange: (e) => D({ acceptance: e })
				})
			}),
			/* @__PURE__ */ b(No, {
				id: "avoozl-task-checks",
				label: "Checks",
				hint: "One command per line, such as npm test.",
				children: /* @__PURE__ */ b(Po, {
					id: "avoozl-task-checks",
					rows: 2,
					value: u.checks,
					onChange: (e) => D({ checks: e })
				})
			}),
			/* @__PURE__ */ b(Fo, {
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
			S && /* @__PURE__ */ b(Io, { preview: S }),
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
var Ro = [
	"queued",
	"coding",
	"tests",
	"commands",
	"ci-wait",
	"review",
	"rework",
	"merge",
	"waiting"
], zo = {
	queued: "#94a3b8",
	coding: "#3b82f6",
	tests: "#10b981",
	commands: "#8b5cf6",
	"ci-wait": "#0ea5e9",
	review: "#ec4899",
	rework: "#ef4444",
	merge: "#14b8a6",
	waiting: "#a8a29e"
}, Bo = {
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
function Vo(e) {
	return Number.isFinite(e) ? e >= 1e6 ? `${(e / 1e6).toFixed(1)}M` : e >= 1e4 ? `${Math.round(e / 1e3)}k` : e >= 1e3 ? `${(e / 1e3).toFixed(1)}k` : String(Math.round(e)) : "–";
}
var Ho = (e) => e ? e.toFixed(2) : "0";
function Uo(e) {
	let t = [];
	return (e.input || e.output) && t.push(`${Vo(e.input)} in · ${Vo(e.output)} out`), e.credits && t.push(`${Ho(e.credits)} credits`), t.join(" · ") || "none";
}
function Wo(e) {
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
function Go(e, t) {
	let n = [{
		value: "auto",
		label: "auto (Kiro Crew picks)"
	}, ...e];
	return t && !n.some((e) => e.value === t) && n.push({
		value: t,
		label: `${t} (not offered now)`
	}), n;
}
var Ko = "avoozl.flow.filter.", qo = {
	event: "avoozl:flow-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(Ko + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(Ko + t, JSON.stringify(n));
		} catch {}
	}
}, Jo = [
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
function Yo(e) {
	let t = (t, n, r = {}) => e.post(Dt, {
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
		models: () => e.get("/api/models").then(Wo),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n })
	};
}
function Xo(e) {
	if (e == null || !Number.isFinite(e)) return "–";
	let t = Math.round(e / 6e4);
	if (e < 6e4) return `${Math.round(e / 1e3)} s`;
	if (t < 60) return `${t} m`;
	let n = Math.floor(t / 60), r = t % 60;
	return n < 48 ? r ? `${n} h ${r} m` : `${n} h` : `${Math.round(n / 24)} d`;
}
var Zo = (e) => e == null ? "–" : `${Math.round(e * 100)}%`;
function Qo(e) {
	let t = e.metrics, n = e.previous;
	return [
		{
			key: "lead",
			title: "Lead time",
			value: Xo(t.leadTimeMs),
			was: n.tasks ? Xo(n.leadTimeMs) : null,
			empty: t.leadTimeMs === null ? "Finish a task to see lead time." : null,
			tip: "Median time from ready to integrated or merged."
		},
		{
			key: "efficiency",
			title: "Flow efficiency",
			value: Zo(t.flowEfficiency),
			was: n.tasks ? Zo(n.flowEfficiency) : null,
			empty: t.flowEfficiency === null ? "Finish a task to see how much of its time was active." : null,
			tip: "Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting."
		},
		{
			key: "first-pass",
			title: "First-pass rate",
			value: Zo(t.firstPassRate),
			was: n.tasks ? Zo(n.firstPassRate) : null,
			empty: t.firstPassRate === null ? "Finish a task to see how many pass the first time." : null,
			tip: "Tasks accepted on their first attempt with no rework."
		},
		{
			key: "fix",
			title: "Time to fix",
			value: Xo(t.timeToFixMs),
			was: n.tasks && n.timeToFixMs !== null ? Xo(n.timeToFixMs) : null,
			empty: t.timeToFixMs === null ? "No line stop yet." : null,
			tip: "From the line stopping to the check passing on the branch again."
		}
	];
}
function $o(e) {
	let t = Ro.reduce((t, n) => t + (e[n] || 0), 0);
	return t ? Ro.filter((t) => e[t] > 0).map((n) => ({
		stage: n,
		ms: e[n],
		share: e[n] / t,
		color: zo[n],
		label: Bo[n]
	})) : [];
}
var es = {
	"tool-calls": "from tool calls",
	markers: "from phase markers (coarse)",
	events: "from events"
};
function ts(e) {
	if (e.type === "plan") return `${e.change} (spec ${e.spec})`;
	let t = e.file === "repository" ? ` in ${e.repository}` : "";
	return `${e.key} ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}${t}`;
}
var ns = (e) => `${e.metric} ${e.direction === "down" ? "↓" : "↑"}`;
function rs(e) {
	if (e.status !== "approved" || !e.pdca) return null;
	if (!e.pdca.result) return `PDCA: measuring over the next ${e.pdca.window} tasks.`;
	let t = e.pdca.result === "helped" ? "helped" : e.pdca.result === "worse" ? "worse" : "did not help", n = (t) => t == null ? "–" : /rate|efficiency/.test(e.metric) ? Zo(t) : Xo(t);
	return `PDCA: ${e.metric} ${n(e.pdca.before)} → ${n(e.pdca.after)}, ${t}.`;
}
function is(e) {
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
function as(e) {
	return !!(e.repository || e.epic || e.window || e.stage);
}
var os = {
	scope: "dependents",
	localChecksFirst: !0,
	max: 3,
	by: "epic",
	everyTasks: 10,
	slowFactor: 2,
	model: "auto"
};
function ss(e = {}) {
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
function cs(e) {
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
var ls = 300, us = 90, ds = 4;
function fs({ points: e, value: t, format: n, color: r }) {
	let i = e.map(t), a = i.filter((e) => e !== null), o = Math.max(...a, 0) || 1, s = (t) => e.length < 2 ? ls / 2 : ds + t * 292 / (e.length - 1), c = (e) => 86 - e / o * 82, l = i.map((e, t) => e === null ? null : `${s(t)},${c(e)}`).reduce((e, t) => (t === null ? e.push([]) : e[e.length - 1].push(t), e), [[]]).filter((e) => e.length), u = a.at(-1);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ b("span", {
			className: "text-lg font-semibold tabular-nums",
			children: u === void 0 ? "–" : n(u)
		}), /* @__PURE__ */ x("svg", {
			viewBox: `0 0 ${ls} ${us}`,
			width: "100%",
			height: us,
			role: "img",
			"aria-label": e.map((e, t) => `${e.key}: ${i[t] === null ? "none" : n(i[t])}`).join(", "),
			preserveAspectRatio: "none",
			children: [
				/* @__PURE__ */ b("line", {
					x1: 0,
					x2: ls,
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
function ps({ points: e }) {
	return /* @__PURE__ */ b("div", {
		className: "flex flex-col gap-1",
		children: /* @__PURE__ */ b("div", {
			className: "flex items-end gap-1",
			style: { height: us },
			role: "img",
			"aria-label": "Stage mix per period",
			children: e.map((e) => {
				let t = Ro.reduce((t, n) => t + e.stages[n], 0);
				return /* @__PURE__ */ b(G, {
					text: `${e.key}: ${Ro.filter((t) => e.stages[t]).map((t) => `${Bo[t]} ${Xo(e.stages[t])}`).join(", ") || "no time"}`,
					children: (n) => /* @__PURE__ */ b("div", {
						tabIndex: 0,
						"aria-describedby": n,
						className: "flex flex-col-reverse overflow-hidden rounded-sm",
						style: {
							height: us,
							width: 14,
							background: "color-mix(in srgb, var(--muted) 12%, transparent)"
						},
						children: Ro.filter((t) => e.stages[t]).map((n) => /* @__PURE__ */ b("span", { style: {
							height: `${100 * e.stages[n] / (t || 1)}%`,
							background: zo[n],
							display: "block"
						} }, n))
					})
				}, e.key);
			})
		})
	});
}
function ms({ rows: e }) {
	let t = (e) => e.credits || e.input + e.output, n = Math.max(...e.map(t), 0) || 1;
	return /* @__PURE__ */ b("div", {
		className: "flex items-end gap-1",
		style: { height: us },
		role: "img",
		"aria-label": e.map((e) => `${e.key}: ${Uo(e)}`).join(", "),
		children: e.map((e) => /* @__PURE__ */ b("span", {
			className: "rounded-sm",
			style: {
				display: "block",
				flex: "none",
				height: Math.max(2, Math.round(us * t(e) / n)),
				width: 14,
				background: "var(--accent)"
			}
		}, e.key))
	});
}
function hs({ title: e, children: t, empty: n }) {
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
function gs({ view: e }) {
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
					/* @__PURE__ */ b(hs, {
						title: "Lead time (median)",
						empty: a,
						children: /* @__PURE__ */ b(fs, {
							points: r,
							value: (e) => e.leadTimeMs,
							format: Xo,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(hs, {
						title: "Flow efficiency",
						empty: a,
						children: /* @__PURE__ */ b(fs, {
							points: r,
							value: (e) => e.flowEfficiency,
							format: Zo,
							color: "var(--ok)"
						})
					}),
					/* @__PURE__ */ b(hs, {
						title: "First-pass rate",
						empty: a,
						children: /* @__PURE__ */ b(fs, {
							points: r,
							value: (e) => e.firstPassRate,
							format: Zo,
							color: "var(--accent)"
						})
					}),
					/* @__PURE__ */ b(hs, {
						title: "Time to fix",
						empty: !r.some((e) => e.timeToFixMs !== null),
						children: /* @__PURE__ */ b(fs, {
							points: r,
							value: (e) => e.timeToFixMs,
							format: Xo,
							color: "var(--danger)"
						})
					}),
					/* @__PURE__ */ b(hs, {
						title: "Stage mix",
						empty: a,
						children: /* @__PURE__ */ b(ps, { points: r })
					}),
					/* @__PURE__ */ b(hs, {
						title: "Tokens and credits",
						empty: !i.length,
						children: /* @__PURE__ */ b(ms, { rows: i })
					})
				]
			}),
			!a && /* @__PURE__ */ b(xs, {})
		]
	});
}
function _s({ title: e, rows: t }) {
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
					children: Bo[e.key] ?? e.key
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums text-muted",
					children: Uo(e)
				})]
			}, e.key))
		})]
	});
}
function vs({ view: e }) {
	let t = e.usage;
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-3",
		children: [/* @__PURE__ */ b(m, { children: "Tokens and credits" }), t?.available ? t.total.turns ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("p", {
			className: "text-sm",
			children: [
				"Total: ",
				/* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Uo(t.total)
				}),
				" over ",
				t.total.turns,
				" turns."
			]
		}), /* @__PURE__ */ x("div", {
			className: "grid gap-4",
			style: { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" },
			children: [
				/* @__PURE__ */ b(_s, {
					title: "By stage",
					rows: t.byStage
				}),
				/* @__PURE__ */ b(_s, {
					title: "By model",
					rows: t.byModel
				}),
				/* @__PURE__ */ b(_s, {
					title: "By plan",
					rows: t.byPlan
				}),
				/* @__PURE__ */ b(_s, {
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
var ys = {
	display: "flex",
	height: 12,
	borderRadius: 4,
	overflow: "hidden",
	background: "color-mix(in srgb, var(--muted) 15%, transparent)"
};
function bs({ stages: e, scale: t, label: n }) {
	let r = $o(e), i = r.reduce((e, t) => e + t.ms, 0), a = `${n}: ${r.map((e) => `${e.label} ${Xo(e.ms)}`).join(", ") || "no time yet"}`;
	return /* @__PURE__ */ b("div", {
		style: { width: `${Math.max(4, t ? 100 * i / t : 100)}%` },
		children: /* @__PURE__ */ b(G, {
			text: a,
			display: "block",
			children: (e) => /* @__PURE__ */ b("div", {
				role: "img",
				"aria-label": a,
				"aria-describedby": e,
				tabIndex: 0,
				style: ys,
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
function xs() {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted",
		"aria-label": "Stages",
		children: Ro.map((e) => /* @__PURE__ */ x("li", {
			className: "inline-flex items-center gap-1",
			children: [/* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					width: 10,
					height: 10,
					borderRadius: 2,
					background: zo[e],
					display: "inline-block"
				}
			}), Bo[e]]
		}, e))
	});
}
function Ss({ stops: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Yo(r), [r]), a = Dn(), s = gr(), [u, d] = c(null);
	if (!e.length) return null;
	let f = async (e) => {
		if (t && await s({
			title: "Run anyway?",
			body: `New work will start while ${e.check ? `\`${e.check}\`` : "the line"} still fails on ${e.branch}. The stop stays open and shows who ran anyway.`,
			action: "Run anyway"
		})) try {
			await i.runAnyway(t, e.id), n?.();
		} catch (e) {
			d(q(e));
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
						children: is(e)
					}), e.runAnyway && /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [
							"Run anyway by ",
							e.runAnyway.by,
							", ",
							J(e.runAnyway.at, Date.now()),
							"."
						]
					})]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [e.fixTaskId && /* @__PURE__ */ b(Y, {
						icon: or,
						tooltip: "Open the fix task's details in the drawer",
						onClick: () => a.openTask(e.fixTaskId),
						children: "Open fix task"
					}), !e.runAnyway && /* @__PURE__ */ b(Y, {
						icon: Ce,
						tooltip: "Resume new work while the check still fails; asks first",
						onClick: () => void f(e),
						style: fr,
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
function Cs({ view: e }) {
	return /* @__PURE__ */ b("div", {
		className: "grid gap-3",
		style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" },
		"data-flow-cards": !0,
		children: Qo(e).map((e) => /* @__PURE__ */ x(p, {
			className: "flex flex-col gap-1",
			children: [/* @__PURE__ */ b(G, {
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
function ws({ tasks: e }) {
	let t = Dn(), n = As("(max-width: 767px)"), r = Cr(String(e.length)), i = Math.max(0, ...e.map((e) => Ro.reduce((t, n) => t + (e.stages[n] || 0), 0))), a = r.take("flow-bars", e);
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-2",
		children: [
			/* @__PURE__ */ b(m, { children: "Time per task" }),
			/* @__PURE__ */ b(xs, {}),
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
					}), a = /* @__PURE__ */ b(bs, {
						stages: e.stages,
						scale: i,
						label: e.taskId
					}), o = /* @__PURE__ */ x("span", {
						className: "inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
						children: [
							e.coarse && /* @__PURE__ */ b(G, {
								text: "Built from phase markers or events, not from tool calls",
								children: (e) => /* @__PURE__ */ b("span", {
									"aria-describedby": e,
									tabIndex: 0,
									className: "text-xs text-muted",
									children: "(coarse)"
								})
							}),
							e.batch && /* @__PURE__ */ b(K, { children: "batch" }),
							Xo(e.leadMs),
							/* @__PURE__ */ b(G, {
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
									children: /* @__PURE__ */ b(or, {
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
			/* @__PURE__ */ b(wr, { ...r.more("flow-bars", e.length) }),
			/* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				children: "(coarse) marks bars built from reports, not tool calls."
			})
		]
	});
}
function Ts({ proposal: e, retro: t, onDecide: n, busy: r }) {
	let i = rs(e);
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
							children: ts(e)
						}),
						" ",
						/* @__PURE__ */ b("span", {
							className: "text-muted",
							children: ns(e)
						}),
						e.removesCheck && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(K, {
							variant: "warning",
							children: "removes a check"
						})] }),
						e.revertOf && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ b(K, { children: "revert" })] })
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
function Es({ view: e, workspaceId: t, onChanged: n }) {
	let r = l(), i = o(() => Yo(r), [r]), a = gr(), [s, u] = c(!1), [d, f] = c(null), [h, g] = c(!1), _ = async (e, r, o) => {
		if (!t) return;
		let s = !1;
		if (!(o === "approve" && r.removesCheck && (s = await a({
			title: "Approve removing a check?",
			body: `${ts(r)} removes a review role or a declared check, so fewer things are checked before work lands.`,
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
				f(q(e));
			} finally {
				u(!1);
			}
		}
	}, v = async () => {
		if (t) try {
			await i.startRetro(t), g(!0);
		} catch (e) {
			f(q(e));
		}
	}, y = e.retros.some((e) => e.state === "running");
	return /* @__PURE__ */ x(p, {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(m, { children: "Retros" }), /* @__PURE__ */ b(Y, {
					icon: Ce,
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
								e.bottleneck ? ` · bottleneck ${Bo[e.bottleneck.stage] ?? e.bottleneck.stage}` : ""
							]
						}),
						e.state === "running" && /* @__PURE__ */ x("span", {
							className: "text-sm text-muted",
							children: [
								"Running since ",
								J(e.startedAt, Date.now()),
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
							children: e.proposals.map((t) => /* @__PURE__ */ b(Ts, {
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
function Ds({ view: e }) {
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
function Os({ workspaceId: e }) {
	let n = l(), r = o(() => Yo(n), [n]), [i, a] = xi(e, qo), s = JSON.stringify(i), { value: c, error: u, busy: d, reload: f } = fi(e, t((e) => r.view(e, JSON.parse(s)), [r, s])), m = (e) => a({
		...i,
		...e
	});
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-flow-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Tr, {
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
				/* @__PURE__ */ b(Ss, {
					stops: c.line,
					workspaceId: e,
					onChanged: () => void f()
				}),
				/* @__PURE__ */ b(yi, {
					id: "avoozl-flow",
					label: "Filter flow timing",
					active: as(i),
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
							options: Jo,
							onChange: (e) => m({ window: e || void 0 })
						},
						{
							kind: "select",
							key: "stage",
							label: "Stage",
							value: i.stage ?? "",
							options: [...Ro.map((e) => ({
								value: e,
								label: Bo[e]
							}))],
							onChange: (e) => m({ stage: e || void 0 })
						}
					]
				}),
				/* @__PURE__ */ b(Cs, { view: c }),
				c.bottleneck && /* @__PURE__ */ x(p, {
					className: "flex items-start gap-2 text-sm",
					children: [/* @__PURE__ */ b(U, {
						size: 18,
						"aria-hidden": "true",
						style: {
							color: zo[c.bottleneck.stage],
							flex: "none"
						}
					}), /* @__PURE__ */ x("span", { children: [
						/* @__PURE__ */ x("span", {
							className: "font-semibold",
							children: ["Biggest bottleneck: ", Bo[c.bottleneck.stage]]
						}),
						", ",
						Math.round(c.bottleneck.share * 100),
						"% of lead time",
						c.bottleneck.repository ? ` in ${c.bottleneck.repository}` : "",
						" (median ",
						Xo(c.bottleneck.medianMs),
						" per task)."
					] })]
				}),
				c.tasks.length ? /* @__PURE__ */ b(ws, { tasks: c.tasks }) : /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(U, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "No timing yet",
					subtitle: "Avoozl records where each task's time goes as soon as a task is dispatched."
				}),
				/* @__PURE__ */ b(gs, { view: c }),
				/* @__PURE__ */ b(vs, { view: c }),
				/* @__PURE__ */ b(Ds, { view: c }),
				/* @__PURE__ */ b(Es, {
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
function ks({ timing: e }) {
	return e ? /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		"data-timing-fold": !0,
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ b("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ b(bs, {
						stages: e.stages,
						scale: 0,
						label: e.taskId
					})
				}), /* @__PURE__ */ b("span", {
					className: "tabular-nums",
					children: Xo(e.leadMs)
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
								background: zo[e.stage] ?? "var(--muted)",
								flex: "none"
							}
						}),
						/* @__PURE__ */ b("span", { children: Bo[e.stage] ?? e.stage }),
						e.detail && /* @__PURE__ */ b("code", {
							className: "text-xs",
							children: e.detail
						}),
						/* @__PURE__ */ b("span", {
							className: "tabular-nums",
							children: Xo(e.lengthMs)
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: es[e.source]
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
function As(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
function js({ label: e, children: t }) {
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("dt", {
		className: "text-muted",
		children: e
	}), /* @__PURE__ */ b("dd", {
		className: "min-w-0 break-words",
		children: t
	})] });
}
function Ms({ title: e, links: t, open: n }) {
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
function Ns(e) {
	let { origin: n } = e, i = l(), a = o(() => hn(i), [i]), [s, u] = c(null), [d, f] = c(null), p = t(() => f(null), []), m = async (t) => {
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
				error: q(e)
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
				children: h?.readable ? un(n.text, h.document).map((e, t) => e.link ? /* @__PURE__ */ b("button", {
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
							icon: V,
							tooltip: `Open all of ${e.document} in a reader, at the cited line`,
							onClick: () => f(e),
							"aria-label": `Open full file ${e.document}`,
							children: "Open full file"
						}), /* @__PURE__ */ x(Y, {
							icon: z,
							tooltip: "Show the lines this task was made from here, read from the file now",
							onClick: () => void m(e),
							"aria-label": `${s?.source === e ? "Hide" : "Read"} ${ln(e)}`,
							children: [
								s?.source === e ? "Hide" : "Read",
								" ",
								ln(e)
							]
						})]
					}, e.document + e.lineStart) : /* @__PURE__ */ x("span", {
						className: "text-xs text-muted",
						children: [ln(e), " (no longer in this workspace)"]
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
						children: [s.source.document, dn(s.source) ? ` · ${dn(s.source)} marked` : ""]
					}), /* @__PURE__ */ b("button", {
						type: "button",
						className: "ml-auto underline",
						onClick: () => f(s.source),
						children: "Open full file"
					})]
				}), /* @__PURE__ */ b(io, {
					text: s.text,
					lineStart: s.source.lineStart,
					lineEnd: s.source.lineEnd,
					maxHeight: 360,
					idPrefix: "avoozl-origin",
					label: `Contents of ${s.source.document}`
				})] })
			}),
			d && /* @__PURE__ */ b(xo, {
				workspaceId: e.workspaceId,
				target: d,
				onClose: p
			})
		]
	});
}
function Ps(e) {
	let { workspaceId: n, id: i } = e, a = l(), s = o(() => hn(a), [a]), u = o(() => Bt(a), [a]), [d, f] = c(null), p = Cr(e.id), [m, h] = c(null), [g, _] = c(!1), v = Sr(n), [S, C] = c(!1), [w, T] = c(null), E = t(async () => {
		h(null);
		try {
			f(await s.detail(n, i));
		} catch (e) {
			h(q(e));
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
					text: q(e)
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
	let { task: O, delivery: k } = d, A = O.authority === "local", j = (k?.deliveries ?? []).map((e) => e.state).filter((e) => typeof e == "string").at(-1), M = O.status === "deferred", N = $n(e.graph), P = k?.complete ?? O.state === "done", F = Ht(O.issue?.url ?? null);
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
					/* @__PURE__ */ b(pi, { owner: O }),
					O.state && /* @__PURE__ */ b(K, {
						variant: O.state === "needs-you" ? "warning" : void 0,
						children: O.state
					}),
					d.locked && /* @__PURE__ */ b(K, { children: "locked" }),
					O.planArchived && /* @__PURE__ */ b(K, { children: "Archived" })
				]
			})] }),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap gap-2",
				children: [
					e.onFocus && /* @__PURE__ */ b(Y, {
						icon: ee,
						tooltip: "Show only this task and the tasks it waits on and that wait on it",
						onClick: () => {
							e.onFocus(O.id, O.title), e.onClose();
						},
						children: "Focus"
					}),
					/* @__PURE__ */ b(Y, {
						icon: ge,
						tooltip: "Start a Kiro Crew chat seeded with this task's full context",
						onClick: () => void v.ask({ tasks: [O.id] }),
						children: "Ask in a chat"
					}),
					j === "decision" && /* @__PURE__ */ b(Y, {
						icon: De,
						disabled: S,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => D(async () => (await u.retry(n, O.id), {
							ok: !0,
							text: "Retrying."
						})),
						children: "Retry"
					}),
					!P && A && !M && /* @__PURE__ */ b(Y, {
						icon: xe,
						disabled: S,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: "deferred" }, d.revision), {
							ok: !0,
							text: "Deferred. No new attempt starts; a running session is left alone."
						})),
						children: "Defer"
					}),
					!P && A && M && N && /* @__PURE__ */ b(Y, {
						icon: Ce,
						disabled: S,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => D(async () => (await u.updateTask(n, O.id, { status: N }, d.revision), {
							ok: !0,
							text: "Resumed."
						})),
						children: "Resume"
					}),
					/* @__PURE__ */ b(Y, {
						icon: Se,
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
			O.handSetReview && /* @__PURE__ */ b(jo, {
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
			Qt(k).length > 0 && /* @__PURE__ */ x("section", {
				"aria-label": "Review",
				className: "flex flex-col gap-1",
				children: [/* @__PURE__ */ b("h4", {
					className: "text-sm font-semibold",
					children: "Review"
				}), /* @__PURE__ */ b(Ao, { item: k })]
			}),
			g && /* @__PURE__ */ b("div", {
				className: "rounded border p-3",
				style: { borderColor: "var(--border)" },
				children: /* @__PURE__ */ b(Lo, {
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
					/* @__PURE__ */ b(br, {
						id: "summary",
						group: "task-drawer",
						title: "Summary",
						open: d.conflicts.length === 0,
						children: /* @__PURE__ */ x("dl", {
							className: "grid gap-x-3 gap-y-1.5 text-sm",
							style: { gridTemplateColumns: "max-content 1fr" },
							children: [
								/* @__PURE__ */ b(js, {
									label: "Epic",
									children: O.epicTitle ? nt(O.epicTitle) : "none"
								}),
								d.origin && /* @__PURE__ */ b(js, {
									label: "Came from",
									children: /* @__PURE__ */ b(Ns, {
										origin: d.origin,
										issue: F,
										workspaceId: n
									})
								}),
								/* @__PURE__ */ x(js, {
									label: "Plan",
									children: [d.plan ? `${d.plan.title}${d.plan.approved ? " (approved)" : ` (${d.plan.state ?? "draft"})`}` : "none", O.planArchived ? " · archived: its tasks do not start until you unarchive it" : ""]
								}),
								/* @__PURE__ */ x(js, {
									label: "Authority",
									children: [
										/* @__PURE__ */ b(pi, { owner: O }),
										" ",
										O.authority
									]
								}),
								/* @__PURE__ */ b(js, {
									label: "Route",
									children: O.route
								}),
								/* @__PURE__ */ b(js, {
									label: "Status",
									children: O.status ?? "none"
								}),
								/* @__PURE__ */ b(js, {
									label: "State",
									children: O.state ?? "unknown"
								}),
								/* @__PURE__ */ b(js, {
									label: "Wave",
									children: O.wave
								}),
								/* @__PURE__ */ b(js, {
									label: "Done when",
									children: O.completion
								}),
								O.repository && /* @__PURE__ */ b(js, {
									label: "Repository",
									children: O.repository
								}),
								O.owner && /* @__PURE__ */ b(js, {
									label: "Assignee",
									children: O.owner
								}),
								O.decision && /* @__PURE__ */ b(js, {
									label: "Decision",
									children: O.decision
								}),
								O.needsReview && /* @__PURE__ */ b(js, {
									label: "Review",
									children: "Needs your review"
								}),
								(k?.pullRequests ?? []).map((e, t) => /* @__PURE__ */ b(js, {
									label: "Pull request",
									children: Ht(e.url) ? /* @__PURE__ */ x("a", {
										href: Ht(e.url),
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
					/* @__PURE__ */ b(br, {
						id: "description",
						group: "task-drawer",
						title: "Description",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [
								O.summary ? /* @__PURE__ */ b(oa, { text: O.summary }) : /* @__PURE__ */ b("p", {
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
								}), /* @__PURE__ */ b(oa, { text: O.context })] })
							]
						})
					}),
					/* @__PURE__ */ b(br, {
						id: "links",
						group: "task-drawer",
						title: "Links",
						children: /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-3",
							children: [/* @__PURE__ */ b(Ms, {
								title: "Waits on",
								links: d.waitsOn,
								open: e.open
							}), /* @__PURE__ */ b(Ms, {
								title: "Blocks",
								links: d.blocks,
								open: e.open
							})]
						})
					}),
					/* @__PURE__ */ b(br, {
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
											href: Tn(e),
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
												Wt(e) ?? "model not named",
												" · started",
												" ",
												J(e.boundAt),
												e.statusAt ? ` · last activity ${J(e.statusAt)}` : ""
											]
										})
									] }, e.slot))
								}),
								j === "decision" && /* @__PURE__ */ b(Pr, {
									item: k,
									busy: S,
									onRetry: (e) => D(async () => (await u.retry(n, O.id, e), {
										ok: !0,
										text: "Dismissed and retrying."
									}))
								}),
								/* @__PURE__ */ b(Fr, {
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
					/* @__PURE__ */ b(br, {
						id: "timing",
						group: "task-drawer",
						title: "Timing",
						children: /* @__PURE__ */ b(ks, { timing: d.timing ?? null })
					}),
					/* @__PURE__ */ b(br, {
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
										children: Yr(e)
									}),
									e.changedAt && /* @__PURE__ */ x("div", {
										className: "text-xs text-muted",
										children: [
											"Changed ",
											J(e.changedAt),
											e.changedBy ? ` by ${e.changedBy}` : "",
											". See Timeline for this task's history."
										]
									}),
									/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(Y, {
										icon: ge,
										tooltip: "Start a Kiro Crew chat seeded with this item",
										onClick: () => void v.ask({ items: [cr(e)] }),
										children: "Ask in a chat"
									}) }),
									/* @__PURE__ */ b(Oi, {
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
					/* @__PURE__ */ b(br, {
						id: "timeline",
						group: "task-drawer",
						title: "Timeline",
						children: d.timeline.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
							className: "flex flex-col gap-1 text-sm",
							children: p.take("timeline", d.timeline).map((e, t) => /* @__PURE__ */ x("li", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ b(G, {
									text: e.at,
									children: /* @__PURE__ */ b("span", {
										className: "w-28 shrink-0 text-xs text-muted",
										children: J(e.at)
									})
								}), /* @__PURE__ */ b("span", { children: e.text })]
							}, t))
						}), /* @__PURE__ */ b(wr, { ...p.more("timeline", d.timeline.length) })] }) : /* @__PURE__ */ b("p", {
							className: "text-sm text-muted",
							children: "Nothing recorded yet."
						})
					})
				]
			}),
			k && Yt(k) && /* @__PURE__ */ b(Mr, {
				item: k,
				onSupersede: async (e, t) => {
					await u.supersede(n, e, t), await E();
				}
			}),
			k?.sessions.length ? /* @__PURE__ */ x("p", {
				className: "text-xs text-muted",
				children: [
					"Running for ",
					wn(k.sessions.at(-1).boundAt),
					" in its latest attempt."
				]
			}) : null
		]
	});
}
function Fs(e) {
	let t = l(), n = o(() => Bt(t), [t]), i = o(() => hn(t), [t]), [a, s] = c(null), [u, d] = c(!1), [f, p] = c(null);
	r(() => {
		n.conflictsPage(e.workspaceId).then((t) => s({
			revision: t.revision,
			group: t.items.find((t) => t.kind === "review" && t.id === e.group.id) ?? null
		}), (e) => p(q(e)));
	}, [
		n,
		e.workspaceId,
		e.group.id
	]);
	let m = a ? a.group : e.group, h = async () => {
		if (a && m) {
			d(!0), p(null);
			try {
				let t = Gr("reviewed", await i.settle(e.workspaceId, "reviewed", Vr(m), a.revision));
				t.ok ? e.onReviewed() : p(t.text);
			} catch (e) {
				p(q(e));
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
			}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("div", { children: m && /* @__PURE__ */ b(ki, {
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
						/* @__PURE__ */ b(pi, { owner: t })
					]
				}, t.id))
			})] })
		]
	});
}
function Is() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function Ls(e) {
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
			let n = Oo(e.width, t.key);
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
function Rs({ workspaceId: e, children: n, onFocus: i }) {
	let a = l(), u = o(() => Bt(a), [a]), [d, f] = c(null), [p, m] = c([]), [h, g] = c(null), [_, v] = c(!1), S = s(null), C = s(null), w = As("(max-width: 767px)"), T = As("(prefers-reduced-motion: reduce)"), [E, D] = c(620), [O, k] = c(!1);
	r(() => {
		D(e ? Eo(Is(), e) : 620);
	}, [e]);
	let A = t((t) => {
		let n = wo(t, window.innerWidth);
		D(n), e && Do(Is(), e, n);
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
	return r(() => {
		d && e && u.graph(e).then(g, () => g(null));
	}, [
		N,
		e,
		u
	]), r(() => {
		if (!d) return;
		let e = requestAnimationFrame(() => {
			v(!0), S.current?.focus();
		}), t = (e) => {
			e.key === "Escape" && (e.preventDefault(), P());
		};
		return document.addEventListener("keydown", t), () => {
			cancelAnimationFrame(e), document.removeEventListener("keydown", t);
		};
	}, [N, P]), /* @__PURE__ */ x(En.Provider, {
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
				!w && /* @__PURE__ */ b(Ls, {
					width: wo(E, typeof window > "u" ? E : window.innerWidth),
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
						width: w ? "100%" : wo(E, typeof window > "u" ? E : window.innerWidth),
						background: "var(--card, var(--bg))",
						color: "var(--text)",
						borderColor: "var(--border)",
						transform: _ || T ? "none" : "translateX(100%)",
						transition: T || O ? "none" : "transform 180ms ease-out"
					},
					children: [/* @__PURE__ */ x("div", {
						className: "mb-3 flex items-center gap-2",
						children: [
							p.length > 0 && /* @__PURE__ */ b(Z, {
								tooltip: "Go back to what you had open before",
								onClick: () => {
									let e = p.at(-1);
									e && (m(p.slice(0, -1)), f(e));
								},
								children: "Back"
							}),
							/* @__PURE__ */ b("span", { className: "grow" }),
							d.kind === "task" && /* @__PURE__ */ b(Y, {
								icon: we,
								tooltip: "Add a draft task that waits on this one",
								onClick: () => M.addTask({ prerequisite: d.id }),
								children: "Add a task after this"
							}),
							/* @__PURE__ */ b(Y, {
								icon: Pe,
								onClick: P,
								"aria-label": "Close task details",
								children: "Close"
							})
						]
					}), d.kind === "task" ? /* @__PURE__ */ b(Ps, {
						workspaceId: e,
						id: d.id,
						graph: h,
						open: M.openTask,
						onClose: P,
						onFocus: i
					}) : d.kind === "review" ? /* @__PURE__ */ b(Fs, {
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
					}), /* @__PURE__ */ b(Lo, {
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
var zs = 200, Bs = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, Vs = {
	...Jt,
	delivery: "Delivery",
	"github-conflict": "GitHub edit"
}, Hs = "(min-width: 1024px)", Us = {
	flight: "22rem",
	blocked: "22rem",
	recent: "22rem"
};
function Ws({ height: e, children: t }) {
	let n = As(Hs);
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
function Gs({ title: e, children: t, empty: n }) {
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
var Ks = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)"
}, qs = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "baseline"
};
function Js({ id: e, title: t, onOpen: n }) {
	return /* @__PURE__ */ b(G, {
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
function Ys({ item: e, attach: t, onOpen: n, onInfo: r, onAsk: i }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(K, {
				variant: [
					"decision",
					"needs-human",
					"review"
				].includes(e.kind) ? "warning" : "danger",
				children: Vs[e.kind] ?? e.kind
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
					t && /* @__PURE__ */ b(G, {
						text: "Open the task's running chat",
						children: /* @__PURE__ */ b("a", {
							href: t,
							className: "self-center text-sm underline",
							"aria-label": `Attach to the chat for ${e.title}`,
							children: "Attach"
						})
					}),
					/* @__PURE__ */ b(X, {
						icon: or,
						label: e.group ? `Info: ${e.title}` : `Details for ${e.title}`,
						tooltip: e.group ? "Why these tasks need review, and the list of them" : "Open the task drawer",
						onClick: r
					}),
					/* @__PURE__ */ b(X, {
						icon: ge,
						label: `Ask in a chat about ${e.title}`,
						tooltip: "Ask in a chat: a new chat seeded with this item's full context",
						onClick: i
					}),
					/* @__PURE__ */ b(X, {
						icon: e.tab === "conflicts" ? A : ne,
						label: e.tab === "conflicts" ? `Resolve ${e.title}` : `Open ${e.title} in Delivery`,
						tooltip: e.tab === "conflicts" ? "Resolve it in Conflicts" : "Open it in Delivery",
						onClick: n
					})
				]
			})
		]
	});
}
var Xs = {
	worker: "Worker",
	checks: "Checks",
	planner: "Planner"
}, Zs = (e) => Xs[e.role] ?? (e.role === "worker" ? "Worker" : `Reviewer · ${e.role}`), Qs = 2e4;
function $s({ row: e, now: t, onInfo: n }) {
	return /* @__PURE__ */ x("li", {
		className: "flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ b(K, { children: Zs(e) }),
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
							wn(e.startedAt, t),
							" · ",
							e.status ?? "not observed",
							" ",
							J(e.lastAt, t)
						]
					})
				]
			}),
			/* @__PURE__ */ x("span", {
				className: "flex gap-1.5",
				children: [/* @__PURE__ */ b(X, {
					icon: or,
					label: `Details for ${e.title}`,
					tooltip: "Open the task drawer",
					onClick: n
				}), /* @__PURE__ */ x("a", {
					href: Tn(e.session),
					className: "self-center text-sm underline",
					"aria-label": `Attach to the ${e.role} chat for ${e.title}`,
					style: {
						display: "inline-flex",
						alignItems: "center",
						gap: 4
					},
					children: [/* @__PURE__ */ b(ne, {
						size: 14,
						"aria-hidden": "true"
					}), "Attach"]
				})]
			})
		]
	});
}
function ec(e) {
	let t = cn(e.layout);
	return /* @__PURE__ */ b("ul", {
		className: "min-w-0",
		style: t.list,
		"aria-label": `Tasks by state, ${e.total} in all`,
		"data-state-counts": e.layout,
		children: We.map((n) => /* @__PURE__ */ b("li", {
			className: "min-w-0",
			children: /* @__PURE__ */ b(G, {
				text: `Show ${n.label.toLowerCase()} tasks in Delivery`,
				display: e.layout === "small" ? "block" : void 0,
				children: /* @__PURE__ */ x("button", {
					type: "button",
					onClick: () => e.onPick(n.id),
					"aria-label": `${n.label}: ${e.counts[n.id]} tasks. Show them in Delivery`,
					className: "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
					style: {
						...t.button,
						borderColor: `color-mix(in srgb, ${Bs[n.id]} 60%, var(--border))`,
						background: `color-mix(in srgb, ${Bs[n.id]} 14%, var(--card, transparent))`,
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
								style: { fill: Bs[n.id] }
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
function tc({ count: e, onOpen: t }) {
	return /* @__PURE__ */ b(G, {
		text: "Open issues and pull requests no rule, triage label or task covers. Opens the Untriaged tab.",
		children: (n) => /* @__PURE__ */ x("button", {
			type: "button",
			onClick: t,
			"aria-label": `Untriaged: ${e} items. Open the Untriaged tab`,
			"aria-describedby": n,
			className: "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
			style: {
				borderColor: "color-mix(in srgb, var(--accent) 60%, var(--border))",
				background: "color-mix(in srgb, var(--accent) 14%, var(--card, transparent))",
				color: "var(--text)"
			},
			"data-untriaged-stat": !0,
			children: [
				/* @__PURE__ */ b(ue, {
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
function nc({ items: e, now: t, onOpen: n, pages: r }) {
	return e ? e.length ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b("ol", {
		className: "mt-1 flex flex-col text-sm",
		children: r.take("activity", e).map((e, r) => /* @__PURE__ */ x("li", {
			className: "flex items-baseline gap-2 border-t py-1.5 first:border-t-0",
			style: { borderColor: "var(--border)" },
			children: [/* @__PURE__ */ b(G, {
				text: e.at,
				children: /* @__PURE__ */ b("span", {
					className: "w-16 shrink-0 text-xs text-muted",
					children: J(e.at, t)
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
	}), /* @__PURE__ */ b(wr, { ...r.more("activity", e.length) })] }) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Nothing has happened yet."
	}) : /* @__PURE__ */ b("p", {
		className: "mt-2 text-sm text-muted",
		children: "Loading…"
	});
}
function rc(e) {
	let { workspaceId: n, onNavigate: i } = e, a = l(), s = o(() => Bt(a), [a]), u = o(() => fa(a), [a]), d = o(() => lr(a), [a]), p = Sr(n), m = sn(As(Hs), As(on)), { value: g, error: _, busy: v, reload: S } = fi(n, t(async (e) => {
		let [t, n, r, i, a] = await Promise.allSettled([
			s.graph(e),
			s.delivery(e),
			s.conflicts(e),
			u.stored(e),
			d.activity(e, zs)
		]), o = (e) => e.status === "fulfilled" ? e.value : null, c = [
			t,
			n,
			r,
			i,
			a
		].filter((e) => e.status === "rejected").length, l = o(r);
		return {
			summary: an({
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
	])), w = o(() => Yo(a), [a]), T = fi(n, t((e) => w.view(e, { window: "10" }), [w])), E = g?.summary, D = Dn(), O = Cr(""), [k, A] = c(() => Date.now());
	r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (A(Date.now()), S());
		}, Qs);
		return () => clearInterval(e);
	}, [S]);
	let j = (e) => {
		let t = e.group ? [e.group] : (g?.conflicts ?? []).filter((t) => t.taskId === e.taskId && (e.kind === "delivery" || t.kind === e.kind));
		p.ask(t.length ? { items: t.map(ic) } : { tasks: e.taskId ? [e.taskId] : [] });
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-dashboard-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				"data-dashboard-header": !0,
				children: [
					/* @__PURE__ */ b(Tr, {
						id: "avoozl-dashboard-title",
						view: "dashboard",
						children: "Dashboard"
					}),
					E && g.total > 0 && /* @__PURE__ */ x("span", {
						className: "whitespace-nowrap text-xs text-muted tabular-nums",
						children: [g.total, " tasks"]
					}),
					m === "small" ? /* @__PURE__ */ b(X, {
						icon: Ee,
						label: "Refresh",
						tooltip: "Read the Dashboard again",
						onClick: () => void S(),
						disabled: v
					}) : /* @__PURE__ */ b(Y, {
						icon: Ee,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}),
					/* @__PURE__ */ b("span", {
						role: "status",
						className: v || g?.failed ? "text-xs text-muted" : "sr-only",
						children: v ? "Loading…" : g?.failed ? `${g.failed} of 5 reads failed; those sections are empty.` : ""
					}),
					e.untriaged !== null && e.untriaged !== void 0 && /* @__PURE__ */ b(tc, {
						count: e.untriaged,
						onOpen: () => i("untriaged")
					}),
					E && g.total > 0 && /* @__PURE__ */ b(ec, {
						counts: E.counts,
						total: g.total,
						layout: m,
						onPick: (t) => e.onScope?.("delivery", { state: t })
					})
				]
			}),
			/* @__PURE__ */ b(Ss, {
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
				icon: /* @__PURE__ */ b(Ie, { size: 40 }),
				title: "No tasks yet",
				subtitle: "Plan a goal from the header, then approve its spec in Plans. Ready tasks start on their own.",
				action: /* @__PURE__ */ b(f, {
					onClick: () => i("plans"),
					children: "Open Plans"
				})
			}) : E ? /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ x(Ws, {
					height: Us.flight,
					children: [/* @__PURE__ */ x(Gs, {
						title: `In flight (${E.inFlight.length})`,
						empty: E.inFlight.length === 0 && "No agent is working right now.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: O.take("flight", E.inFlight).map((e) => /* @__PURE__ */ b($s, {
								row: e,
								now: k,
								onInfo: () => D.openTask(e.taskId)
							}, e.slot))
						}), /* @__PURE__ */ b(wr, { ...O.more("flight", E.inFlight.length) })]
					}), /* @__PURE__ */ x(Gs, {
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
								let n = t.total ? Math.round(t.done / t.total * 100) : 0, r = t.title === t.epic ? nt(t.epic) : t.title;
								return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(G, {
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
				/* @__PURE__ */ x(Ws, {
					height: Us.blocked,
					children: [/* @__PURE__ */ x(Gs, {
						title: `Needs you (${E.attention.length})`,
						empty: E.attention.length === 0 && "Nothing waits on you.",
						children: [/* @__PURE__ */ b("ul", {
							className: "mt-1",
							children: O.take("attention", E.attention).map((e) => /* @__PURE__ */ b(Ys, {
								item: e,
								attach: ac(E.running, e.taskId),
								onOpen: () => i(e.tab, e.taskId ?? void 0),
								onInfo: () => e.group ? D.openReview(e.group, () => void S()) : e.taskId && D.openTask(e.taskId),
								onAsk: () => j(e)
							}, e.key))
						}), /* @__PURE__ */ b(wr, { ...O.more("attention", E.attention.length) })]
					}), /* @__PURE__ */ x(Gs, {
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
										style: Ks,
										children: "Wave"
									}),
									/* @__PURE__ */ b("th", {
										style: Ks,
										children: "Task"
									}),
									/* @__PURE__ */ b("th", {
										style: {
											...Ks,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b("span", {
											className: "sr-only",
											children: "Graph"
										})
									})
								] }) }), /* @__PURE__ */ b("tbody", { children: O.take("next", E.readyNext).map((e) => /* @__PURE__ */ x("tr", { children: [
									/* @__PURE__ */ b("td", {
										style: qs,
										children: /* @__PURE__ */ x(K, {
											variant: "wave",
											children: ["wave ", e.wave]
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...qs,
											width: "100%"
										},
										children: /* @__PURE__ */ b(Js, {
											id: e.id,
											title: e.title,
											onOpen: () => D.openTask(e.id)
										})
									}),
									/* @__PURE__ */ b("td", {
										style: {
											...qs,
											textAlign: "right"
										},
										children: /* @__PURE__ */ b(X, {
											icon: ye,
											label: `Show ${e.title} in the Graph`,
											onClick: () => i("graph", e.id)
										})
									})
								] }, e.id)) })]
							}),
							/* @__PURE__ */ b(wr, { ...O.more("next", E.readyNext.length) })
						]
					})]
				}),
				/* @__PURE__ */ x(Ws, {
					height: Us.recent,
					children: [/* @__PURE__ */ x(Gs, {
						title: `Recently completed (${E.recent.length})`,
						empty: E.recent.length === 0 && "Nothing delivered yet.",
						children: [/* @__PURE__ */ b("table", {
							className: "w-full border-collapse text-sm",
							children: /* @__PURE__ */ b("tbody", { children: O.take("recent", E.recent).map((e) => /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ b("td", {
									style: qs,
									children: /* @__PURE__ */ b("span", {
										role: "img",
										"aria-label": "Done",
										style: { color: "var(--ok)" },
										children: "✓"
									})
								}),
								/* @__PURE__ */ b("td", {
									style: {
										...qs,
										width: "100%"
									},
									children: /* @__PURE__ */ b(Js, {
										id: e.id,
										title: e.title,
										onOpen: () => D.openTask(e.id)
									})
								}),
								/* @__PURE__ */ b("td", {
									style: qs,
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
										...qs,
										textAlign: "right"
									},
									className: "whitespace-nowrap text-xs text-muted",
									children: /* @__PURE__ */ b(G, {
										text: e.at,
										children: /* @__PURE__ */ b("span", { children: J(e.at, k) })
									})
								})
							] }, e.id)) })
						}), /* @__PURE__ */ b(wr, { ...O.more("recent", E.recent.length) })]
					}), /* @__PURE__ */ b(Gs, {
						title: "Recent activity",
						children: /* @__PURE__ */ b(nc, {
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
var ic = (e) => cr(e);
function ac(e, t) {
	let n = [...e.find((e) => e.id === t)?.sessions ?? []].sort((e, t) => (e.role === "worker" ? -1 : 0) - (t.role === "worker" ? -1 : 0) || t.attempt - e.attempt);
	return n[0] ? Tn(n[0]) : null;
}
// kirocrew-app/ui/src/FilterBar.tsx
var oc = {
	event: Rn,
	read: zn,
	write: Bn,
	empty: {}
};
function sc(e) {
	return xi(e, oc);
}
function cc(e, t) {
	Si(oc, e, t);
}
function lc(e) {
	let { filter: t, choices: n } = e, r = (n) => e.onChange(Vn(t, n));
	return /* @__PURE__ */ b(yi, {
		id: e.id,
		label: "Filter tasks",
		active: jn(t),
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
var uc = 60, dc = 640, fc = {
	ready: "var(--accent)",
	running: "var(--tile-purple, var(--aim))",
	waiting: "var(--border)",
	"needs-you": "var(--danger)",
	done: "var(--ok)",
	deferred: "var(--muted)"
}, pc = Object.fromEntries(We.map((e) => [e.id, e.label])), mc = (e, t) => e.length > t ? e.slice(0, t - 1) + "…" : e, hc = (e, t) => {
	(e.key === "Enter" || e.key === " ") && (e.preventDefault(), t());
};
function gc({ task: e, x: t, y: n }) {
	if (e.authority !== "github") return /* @__PURE__ */ b("text", {
		x: t,
		y: n,
		textAnchor: "end",
		fontSize: 10,
		style: { fill: "var(--muted)" },
		children: e.authority ?? "local"
	});
	let r = e.issue ? Ht(e.issue.url) : null, i = e.issue ? e.issue.number ? `#${e.issue.number}` : "GitHub" : "pending", a = /* @__PURE__ */ b("text", {
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
function _c(e) {
	let { node: t, selected: n } = e, r = fc[t.state], i = t.members ? `${t.members.done} of ${t.members.total} done` : `${t.id} · ${pc[t.state]}`, a = t.members ? `Epic ${t.title}, collapsed, ${i}. Press to show only this epic.` : `${t.title}, ${t.id}, ${pc[t.state]}${t.task?.review ? ", waits for review" : ""}${t.task?.planArchived ? ", archived plan" : ""}${t.task?.handSetReview ? ", review set by hand, none running" : ""}`;
	return /* @__PURE__ */ x("g", {
		transform: `translate(${t.x},${t.y})`,
		role: "button",
		tabIndex: 0,
		"aria-label": a,
		"aria-pressed": t.members ? void 0 : n,
		"data-node": t.id,
		onClick: () => e.onSelect(t),
		onKeyDown: (n) => hc(n, () => e.onSelect(t)),
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
				width: Je,
				height: Ye,
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
				height: Ye,
				rx: 3,
				style: { fill: r }
			}),
			/* @__PURE__ */ b("text", {
				x: 12,
				y: 15,
				fontSize: 11,
				fontWeight: 600,
				style: { fill: "var(--text)" },
				children: mc(t.title, t.task?.review ? 19 : 25)
			}),
			t.task?.review && /* @__PURE__ */ b("text", {
				x: Je - 6,
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
				children: mc(i, t.task ? 20 : 28)
			}),
			t.task && /* @__PURE__ */ b(gc, {
				task: t.task,
				x: Je - 6,
				y: 29
			})
		]
	});
}
function vc() {
	return /* @__PURE__ */ x("ul", {
		"aria-label": "Node colors",
		className: "flex flex-wrap gap-3 text-xs text-muted",
		children: [We.map((e) => /* @__PURE__ */ x("li", {
			className: "flex items-center gap-1",
			children: [/* @__PURE__ */ b("svg", {
				width: 10,
				height: 10,
				"aria-hidden": "true",
				children: /* @__PURE__ */ b("rect", {
					width: 10,
					height: 10,
					rx: 2,
					style: { fill: fc[e.id] }
				})
			}), e.label]
		}, e.id)), /* @__PURE__ */ b("li", { children: "Solid arrow: waiting · faded arrow: met · dashed arrow: sequence" })]
	});
}
function yc(e) {
	let { task: t } = e, n = Dn(), { waitsOn: r, blocks: i } = e.neighbors, a = $e(t);
	return /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
		"aria-label": "Task details",
		role: "region",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(m, { children: t.title }),
					/* @__PURE__ */ b(Z, {
						tooltip: "Open this task's details in the drawer",
						onClick: () => n.openTask(t.id),
						children: "All details"
					}),
					/* @__PURE__ */ b(Z, {
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
					/* @__PURE__ */ b(K, { children: t.kind }),
					/* @__PURE__ */ b(pi, { owner: t }),
					/* @__PURE__ */ b(K, {
						variant: t.complete ? "success" : void 0,
						children: t.status ?? "no status"
					}),
					/* @__PURE__ */ b(K, {
						variant: a === "needs-you" ? "warning" : a === "ready" ? "info" : void 0,
						children: pc[a]
					}),
					t.review && /* @__PURE__ */ b(K, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(K, { children: "Archived" }),
					t.handSetReview && /* @__PURE__ */ b(K, {
						variant: "warning",
						children: "set by hand"
					})
				]
			}),
			t.handSetReview && /* @__PURE__ */ x("p", {
				className: "mt-1 text-sm",
				"data-hand-set-review": !0,
				children: [
					$t(t.noSession),
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
function bc({ workspaceId: e, focus: n = null, drill: i = null, onDrill: a }) {
	let u = l(), d = o(() => Bt(u), [u]), f = Dn(), [m, h] = sc(e), { value: g, error: _, busy: v, reload: S } = fi(e, t((e) => d.graph(e), [d])), C = o(() => g ? ft(In(g, m), i) : null, [
		g,
		m,
		i
	]), w = o(() => Fn(g), [g]), [T, D] = c(null);
	r(() => D(null), [i]);
	let [O, k] = c(null), [A, j] = c(null), [M, N] = c({
		x: 0,
		y: 0,
		scale: 1
	}), P = s(null), F = s(null), I = s(!1), L = o(() => [...new Set((C?.tasks ?? []).map((e) => e.epic ?? "(none)"))], [C]), R = o(() => T ?? new Set(!i && (C?.tasks.length ?? 0) > uc ? L : []), [
		T,
		C,
		L,
		i
	]), [ee, te] = c(1100), ne = o(() => qe(C?.tasks.length ?? 0, ee), [C, ee]), z = o(() => C ? ut(C, R, { spacing: ne }) : null, [
		C,
		R,
		ne
	]), B = o(() => new Map(z?.nodes.map((e) => [e.id, e]) ?? []), [z]), V = C?.tasks.find((e) => e.id === O) ?? null, re = C ? Vt(C) : null, ie = (e) => {
		if (!e) return "No epic";
		let t = g?.epics.find((t) => t.id === e)?.title;
		return t && t !== e ? t : nt(e);
	}, [H, U] = c([]), ae = s({
		drill: i,
		view: M,
		selected: O
	}), oe = s(!1), se = s(null);
	r(() => {
		let e = ae.current;
		oe.current ? oe.current = !1 : e.drill !== i && U((t) => Ct(t, e, i)), ae.current = {
			drill: i,
			view: M,
			selected: O
		};
	}, [i]), r(() => {
		ae.current = {
			drill: i,
			view: M,
			selected: O
		};
	}, [M, O]);
	let ce = (e) => {
		U((t) => yt(t, {
			drill: i,
			view: M,
			selected: O
		}, m, e)), h(e);
	}, le = (e) => {
		let t = wt(H, e);
		if (!t) return;
		let { entry: n } = t, r = H.slice(t.stack.length).find((e) => e.filter)?.filter;
		se.current = n.view, U(t.stack), k(n.selected), r && h(r), n.drill === i ? N(n.view) : (oe.current = !0, a?.(n.drill));
	}, ue = (e) => {
		Et(e) && H.length && (e.preventDefault(), le());
	}, de = (e) => {
		Tt(e) && H.length && (e.preventDefault(), le());
	}, fe = (e) => a?.({
		kind: "epic",
		id: e,
		title: ie(e)
	}), pe = t(() => {
		z && P.current && (se.current ? (N(se.current), se.current = null) : N(_t(z, P.current.clientWidth || 800, dc)));
	}, [z]);
	r(pe, [pe]), r(() => {
		let e = P.current;
		if (!e || typeof ResizeObserver > "u") return;
		let t = new ResizeObserver(() => te((t) => Math.abs(t - e.clientWidth) > 40 ? e.clientWidth : t));
		return t.observe(e), () => t.disconnect();
	}, [z !== null]), r(() => {
		let e = P.current;
		if (!e) return;
		let t = (t) => {
			if (!t.ctrlKey && !t.metaKey) return;
			t.preventDefault();
			let n = e.getBoundingClientRect(), r = Math.exp(-t.deltaY * .01);
			N((e) => gt(e, r, t.clientX - n.left, t.clientY - n.top));
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [z]);
	let W = (e) => {
		let t = P.current?.clientWidth || 800;
		N((n) => gt(n, e, t / 2, dc / 2));
	}, me = (e) => {
		let t = new Set(R);
		t.has(e) ? t.delete(e) : t.add(e), D(t);
	}, he = (e) => {
		let t = dt(e, I.current);
		if (t === "drill") return fe(e.epic);
		if (t === "open") {
			if (e.task?.kind === "epic" && g?.tasks.some((t) => t.epic === e.id)) return fe(e.id);
			k(e.id), f.openTask(e.id);
		}
	}, ge = (e) => {
		let t = C?.tasks.find((t) => t.id === e);
		t && R.has(t.epic ?? "(none)") && me(t.epic ?? "(none)"), k(e);
	}, _e = s(null);
	r(() => {
		C && n && _e.current !== n && (_e.current = n, ge(n));
	}, [C, n]);
	let ve = (e) => {
		e.button === 0 && (F.current = {
			x: e.clientX,
			y: e.clientY,
			view: M,
			moved: !1
		}, I.current = !1);
	}, ye = (e) => {
		let t = F.current;
		if (!t) return;
		let n = e.clientX - t.x, r = e.clientY - t.y;
		!t.moved && Math.hypot(n, r) < 4 || (t.moved || e.currentTarget.setPointerCapture(e.pointerId), t.moved = I.current = !0, N({
			...t.view,
			x: t.view.x + n,
			y: t.view.y + r
		}));
	}, be = () => {
		F.current = null;
	}, xe = (e, t) => O !== null && (e === O || t === O), Se = A ?? O, Ce = o(() => {
		if (!z || !Se || !B.has(Se)) return null;
		let { up: e, down: t } = mt(z.edges, Se);
		return {
			up: /* @__PURE__ */ new Set([...e, Se]),
			down: /* @__PURE__ */ new Set([...t, Se])
		};
	}, [
		z,
		Se,
		B
	]), Te = (e) => !Ce || Ce.up.has(e) || Ce.down.has(e), De = (e, t) => !Ce || Ce.up.has(e) && Ce.up.has(t) || Ce.down.has(e) && Ce.down.has(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-graph-title",
		className: "flex flex-col gap-3.5",
		"data-graph-view": !0,
		onKeyDown: ue,
		onMouseUp: de,
		onAuxClick: de,
		children: [
			/* @__PURE__ */ b("div", {
				className: "flex flex-wrap items-center gap-3",
				children: /* @__PURE__ */ b(Tr, {
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
			e ? /* @__PURE__ */ x(lc, {
				id: "avoozl-graph",
				filter: m,
				choices: w,
				onChange: ce,
				children: [/* @__PURE__ */ x("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ b(Y, {
						icon: Ee,
						onClick: () => void S(),
						disabled: v,
						children: "Refresh"
					}), /* @__PURE__ */ b(Y, {
						icon: we,
						tooltip: "Add a draft task. It waits for your review.",
						onClick: () => f.addTask(),
						children: "Add task"
					})]
				}), /* @__PURE__ */ b("p", {
					role: "status",
					className: "mt-2 text-sm text-muted",
					children: v ? "Loading…" : re ? `${re.tasks} of ${g.total} tasks · ${re.blocking} blocking edges · ${re.ready} ready · ${z?.waves ?? 0} waves` : ""
				})]
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Choose a workspace in the header."
			}),
			C && C.total === 0 && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "No tasks yet. Store and approve a plan in the Plans tab to fill the graph."
			}),
			z && z.nodes.length > 0 && /* @__PURE__ */ x(p, { children: [
				/* @__PURE__ */ x("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						H.length > 0 && /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(Y, {
							icon: E,
							tooltip: St(H) ?? void 0,
							onClick: () => le(),
							"aria-label": St(H) ?? "Back",
							children: "Back"
						}), /* @__PURE__ */ x("nav", {
							"aria-label": "Graph drill-in",
							className: "flex flex-wrap items-center gap-1 text-sm",
							"data-graph-crumbs": !0,
							children: [bt(H, i).map(({ at: e, label: t }) => /* @__PURE__ */ x("span", {
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
								children: xt(i)
							})]
						})] }),
						/* @__PURE__ */ b(Z, {
							tooltip: "Fold each epic into one box",
							onClick: () => D(new Set(L)),
							children: "Collapse all"
						}),
						/* @__PURE__ */ b(Z, {
							tooltip: "Show every task inside each epic",
							onClick: () => D(/* @__PURE__ */ new Set()),
							children: "Expand all"
						}),
						/* @__PURE__ */ b("span", { className: "grow" }),
						/* @__PURE__ */ b(Z, {
							tooltip: "Zoom out",
							onClick: () => W(1 / 1.25),
							"aria-label": "Zoom out",
							children: "−"
						}),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							"aria-live": "polite",
							children: [Math.round(M.scale * 100), "%"]
						}),
						/* @__PURE__ */ b(Z, {
							tooltip: "Zoom in",
							onClick: () => W(1.25),
							"aria-label": "Zoom in",
							children: "+"
						}),
						/* @__PURE__ */ b(Z, {
							tooltip: "Fit the whole graph in view",
							onClick: pe,
							children: "Fit"
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					className: "mt-2",
					children: /* @__PURE__ */ b(vc, {})
				}),
				/* @__PURE__ */ b("div", {
					ref: P,
					className: "mt-2 overflow-hidden rounded border",
					style: {
						borderColor: "var(--border)",
						height: dc,
						touchAction: "none"
					},
					children: /* @__PURE__ */ x("svg", {
						role: "group",
						"aria-label": "Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom.",
						width: "100%",
						height: dc,
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
							transform: `translate(${M.x},${M.y}) scale(${M.scale})`,
							children: [
								z.clusters.map((e, t) => {
									let n = tt(e.epic);
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
											onClick: () => !I.current && fe(e.epic),
											onKeyDown: (t) => hc(t, () => fe(e.epic)),
											style: {
												fill: "var(--muted)",
												cursor: "pointer"
											},
											children: [mc(e.title, 30), " ›"]
										})]
									}, `${n}:${t}`);
								}),
								z.loose.map((e) => {
									let t = tt(e.epic);
									return /* @__PURE__ */ b("text", {
										x: e.x,
										y: e.y + 11,
										fontSize: 10,
										role: "button",
										tabIndex: 0,
										"aria-label": `Epic ${e.title}: ${e.count} with no dependencies. Press to show only this epic.`,
										onClick: () => !I.current && fe(e.epic),
										onKeyDown: (t) => hc(t, () => fe(e.epic)),
										style: {
											fill: "var(--muted)",
											cursor: "pointer"
										},
										children: mc(`${e.title} · ${e.count} with no dependencies`, e.chars)
									}, `loose:${t}`);
								}),
								z.edges.map((e) => {
									let t = Ce !== null && De(e.from, e.to), n = Ce !== null && !t, r = xe(e.from, e.to);
									return /* @__PURE__ */ b("path", {
										d: pt(e.points),
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
								z.nodes.map((e) => /* @__PURE__ */ b(_c, {
									node: e,
									selected: e.id === O,
									dim: !Te(e.id),
									onSelect: he,
									onHover: j
								}, e.id))
							]
						})]
					})
				})
			] }),
			C && V && /* @__PURE__ */ b(yc, {
				task: V,
				neighbors: ht(C, V.id),
				onSelect: ge
			})
		]
	});
}
// kirocrew-app/ui/src/DeliveryView.tsx
function xc(e) {
	let { card: t, busy: n, act: r, client: i, workspaceId: a } = e, o = Dn(), s = t.authority === "local", c = Ht(t.issue?.url ?? null), l = t.item?.complete ?? !1;
	return /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(p, { children: /* @__PURE__ */ x("div", {
		className: "p-1",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex items-start gap-2",
				children: [e.phase && /* @__PURE__ */ b(Sc, { phase: e.phase }), /* @__PURE__ */ b("button", {
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
					t.epic && /* @__PURE__ */ b(K, { children: t.epic }),
					/* @__PURE__ */ b(pi, { owner: {
						authority: t.authority,
						issue: t.issue
					} }),
					t.attempt !== null && /* @__PURE__ */ x(K, { children: ["attempt ", t.attempt] }),
					t.reviewRounds > 0 && /* @__PURE__ */ x(K, { children: [t.reviewRounds, " review rounds"] }),
					t.deliveryState && /* @__PURE__ */ b(K, {
						variant: t.deliveryState === "decision" ? "warning" : void 0,
						children: t.deliveryState
					}),
					t.deferred && /* @__PURE__ */ b(K, { children: "deferred" }),
					t.review && /* @__PURE__ */ b(K, { children: "review" }),
					t.planArchived && /* @__PURE__ */ b(K, { children: "Archived" })
				]
			}),
			t.item && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(Ao, {
					item: t.item,
					compact: !0,
					onInfo: () => o.openTask(t.id)
				})
			}),
			t.handSetReview && /* @__PURE__ */ b("div", {
				className: "mt-2.5",
				children: /* @__PURE__ */ b(jo, {
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
					children: Ut(e)
				}) : Ut(e) }, e.slot))
			}),
			/* @__PURE__ */ x("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [
					e.ready && ar(t) && /* @__PURE__ */ b(Y, {
						icon: Ce,
						disabled: n,
						tooltip: "Starts this task first on the next tick, within the limit.",
						onClick: () => e.onStart(t.id),
						children: "Start now"
					}),
					t.deliveryState === "decision" && /* @__PURE__ */ b(Y, {
						icon: De,
						disabled: n,
						tooltip: "Starts a new attempt for this task.",
						onClick: () => r(() => i.retry(a, t.id)),
						children: "Retry"
					}),
					!l && s && e.canDefer && !t.deferred && /* @__PURE__ */ b(Y, {
						icon: xe,
						disabled: n,
						tooltip: "Pauses new dispatch. A running chat is left alone. Resume undoes it.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: "deferred" }, e.revision)),
						children: "Defer"
					}),
					!l && s && t.deferred && e.resume && /* @__PURE__ */ b(Y, {
						icon: Ce,
						disabled: n,
						tooltip: "Lets the tick start this task again. Undoes Defer.",
						onClick: () => r(() => i.updateTask(a, t.id, { status: e.resume }, e.revision)),
						children: "Resume"
					}),
					!l && !s && c && /* @__PURE__ */ b(G, {
						text: "Open the issue; move its Project card to Deferred to pause it",
						children: /* @__PURE__ */ b("a", {
							href: c,
							target: "_blank",
							rel: "noreferrer",
							className: "self-center text-xs underline",
							children: "Defer on the board"
						})
					}),
					/* @__PURE__ */ b(Y, {
						icon: or,
						tooltip: "Open this task's details in the drawer",
						onClick: () => o.openTask(t.id),
						children: "Details"
					})
				]
			})
		]
	}) }) });
}
function Sc({ phase: e }) {
	let t = As("(prefers-reduced-motion: reduce)"), n = e === "running" ? "Running: a worker is coding" : "Reviewing: a reviewer or checks chat is reading";
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
var Cc = 16;
function wc() {
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
function Tc(e) {
	let { lanes: t, narrow: n } = e, { ref: r, width: i } = wc(), a = e.only === "done" ? [nr] : Hn.filter((t) => !e.only || t.id === e.only), o = rr(i, a.length, Cc), [s, l] = c(/* @__PURE__ */ new Set(["waiting"])), u = Cr(e.reset ?? ""), d = o === 1, f = (t, n, r) => /* @__PURE__ */ x("ul", {
		className: "flex flex-col gap-3",
		children: [u.take(t, n).map((t) => e.card(t, r)), u.more(t, n.length).left > 0 && /* @__PURE__ */ b("li", { children: /* @__PURE__ */ b(wr, { ...u.more(t, n.length) }) })]
	});
	return /* @__PURE__ */ b("div", {
		ref: r,
		"data-lane-columns": o,
		style: {
			display: "grid",
			gap: Cc,
			gridTemplateColumns: `repeat(${o}, minmax(0, 1fr))`,
			alignItems: "start"
		},
		children: a.map((e) => {
			let r = Wn(t, e.id), i = (d || n) && s.has(e.id);
			return /* @__PURE__ */ x("section", {
				"aria-label": `${e.label}: ${r.length}`,
				className: "flex min-w-0 flex-col gap-3 rounded-lg border p-3",
				style: {
					background: Kn(e.tint),
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
						/* @__PURE__ */ b(K, {
							variant: e.id === "needs-you" && r.length ? "warning" : void 0,
							children: r.length
						})
					]
				}), !i && (r.length === 0 ? /* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "None"
				}) : e.id === "in-progress" ? Gn(t).map((t) => /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2",
					role: "group",
					"aria-label": `${t.label}: ${t.cards.length}`,
					children: [/* @__PURE__ */ x("h4", {
						className: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted",
						children: [
							t.label,
							" ",
							/* @__PURE__ */ b(K, { children: t.cards.length })
						]
					}), f(`${e.id}:${t.id}`, t.cards, t.id)]
				}, t.id)) : f(e.id, r))]
			}, e.id);
		})
	});
}
function Ec() {
	return As("(max-width: 767px)");
}
function Dc({ workspaceId: e }) {
	let n = l(), r = o(() => Bt(n), [n]), i = o(() => lr(n), [n]), { value: a, error: s, busy: u, reload: d } = fi(e, t(async (e) => {
		let [t, n] = await Promise.all([r.deliveryPage(e), r.graph(e).catch(() => null)]);
		return {
			items: t.items,
			graph: n,
			reports: t.contentReports ?? []
		};
	}, [r])), f = Ec(), [h, g] = sc(e), [_, v] = c(!1), [S, C] = c(!1), [w, T] = c(null), E = (e) => {
		C(!0), T(null), (async () => {
			try {
				await e(), await d();
			} catch (e) {
				T({
					ok: !1,
					text: q(e)
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
			text: q(e)
		})).finally(() => C(!1)));
	}, O = t(async (t, n) => {
		e && (await r.supersede(e, t, n), await d());
	}, [
		r,
		e,
		d
	]), k = a ? Qn(a.graph, a.items) : null, A = k ? tr(k, h) : null, j = o(() => Fn(a?.graph ?? null), [a]), M = A ? new Set(Object.values(A).flat().map((e) => e.id)) : null, N = (a?.reports ?? []).filter((e) => !M || !e.taskId || M.has(e.taskId)), P = a?.items.filter((e) => e.status === "superseded") ?? [], F = !!a?.graph?.statuses.some((e) => e.id === "deferred"), I = $n(a?.graph ?? null), L = a?.graph?.revision ?? 0;
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-delivery-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [
					/* @__PURE__ */ b(Tr, {
						id: "avoozl-delivery-title",
						view: "delivery",
						children: "Delivery"
					}),
					e && /* @__PURE__ */ b(Y, {
						icon: Ee,
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
				/* @__PURE__ */ b(lc, {
					id: "avoozl-delivery",
					filter: h,
					choices: j,
					onChange: g
				}),
				/* @__PURE__ */ b(Tc, {
					lanes: A,
					only: ir(h.state),
					narrow: f,
					reset: JSON.stringify(h),
					card: (t, n) => /* @__PURE__ */ b(xc, {
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
				N.length > 0 && /* @__PURE__ */ b(Oc, { reports: N }),
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
					] }), /* @__PURE__ */ b(Fr, {
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
function Oc({ reports: e }) {
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
					/* @__PURE__ */ b(K, { children: e.set }),
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
function kc(e) {
	let t = (t, n) => e.post(Dt, {
		operation: "untriaged.view",
		input: n,
		workspaceId: t
	}).then((e) => e.result);
	return {
		view: (e) => t(e, {}),
		refresh: (e) => t(e, { refresh: !0 })
	};
}
function Ac(e) {
	let t = (t, n, r) => e.post(Dt, {
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
function jc(e) {
	if (!e.length) return {
		ok: !1,
		reason: "Select issues to send them to an Issue Radar crew.",
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
function Mc(e) {
	return e.emptyScope ? "Empty scope: takes every open issue, labeled or not." : `Watches ${e.labels.join(", ")}. Avoozl adds ${e.labels[0]}.`;
}
function Nc(e) {
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
var Pc = (e) => (t, n) => e.post(Dt, {
	operation: "github.repository.labels",
	input: { repository: n },
	workspaceId: t
}).then((e) => e.result);
function Fc(e, t) {
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
var Ic = [
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
], Lc = [{
	value: "issue",
	label: "Issues"
}, {
	value: "pr",
	label: "Pull requests"
}], Rc = (e) => !!(e.repository || e.kind || e.age || e.author || e.label), zc = 864e5;
function Bc(e, t, n = Date.now()) {
	if (t.repository && e.repository !== t.repository || t.kind && e.kind !== t.kind || t.author && e.author !== t.author || t.label && !e.labels.includes(t.label)) return !1;
	if (t.age) {
		let r = e.createdAt ? Date.parse(e.createdAt) : NaN;
		return Number.isFinite(r) ? t.age === "older" ? n - r > 30 * zc : n - r <= Number(t.age) * zc : !1;
	}
	return !0;
}
function Vc(e) {
	let t = (e) => [...new Set(e)].sort((e, t) => e.localeCompare(t)).map((e) => ({
		value: e,
		label: e
	})), n = e?.items ?? [];
	return {
		repositories: t((e?.repositories ?? []).map((e) => e.repository)),
		authors: t(n.map((e) => e.author).filter((e) => !!e)),
		labels: t(n.flatMap((e) => e.labels))
	};
}
function Hc(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 60 ? `${r} min` : r < 1440 ? `${Math.round(r / 60)} h` : r < 525600 ? `${Math.round(r / 60 / 24)} d` : `${Math.round(r / 60 / 24 / 365)} y`;
}
var Uc = (e) => `${e.repository}#${e.number}`;
function Wc(e, t, n) {
	let r = new Set(e);
	for (let e of t) n ? r.add(e) : r.delete(e);
	return r;
}
function Gc(e) {
	if (!e.length) return {
		url: "/issue-radar",
		exact: !1,
		tooltip: "Select rows to open them in Issue Radar."
	};
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.repository, [...t.get(n.repository) ?? [], `#${n.number}`]);
	let n = [...t].map(([e, t]) => `${e} ${t.join(", ")}`).join("; ");
	return {
		url: e[0].links.issueRadar.url,
		exact: !1,
		tooltip: `Issue Radar can't take a selection from a link yet, so this opens Issue Radar. Pick these there: ${n}.`
	};
}
function Kc(e) {
	let t = e.repositories.find((e) => e.error);
	return e.repositories.length ? e.repositories.every((e) => !e.checkedAt) ? {
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
var qc = "avoozl:untriaged-filter:", Jc = {
	event: "avoozl:untriaged-filter",
	empty: {},
	read(e, t) {
		try {
			let n = JSON.parse(e?.getItem(qc + t) ?? "{}");
			return n && typeof n == "object" && !Array.isArray(n) ? n : {};
		} catch {
			return {};
		}
	},
	write(e, t, n) {
		try {
			e?.setItem(qc + t, JSON.stringify(n));
		} catch {}
	}
}, Yc = [
	["Pick a crew", "A crew works the open issues that carry a label it watches. Avoozl adds that label."],
	["Check the label", "Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label."],
	["Sent", "A crew picks an issue on its own next turn. Follow it under With Issue Radar."]
], Xc = { color: "var(--danger)" };
function Zc(e) {
	let { workspaceId: n, client: i, items: a, repository: o } = e, [l, u] = c(0), [d, p] = c(null), [m, h] = c(""), [_, v] = c(""), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = s(null), j = t(() => e.onClose(l === 2 ? void 0 : "Cancelled. Nothing was written."), [e, l]);
	r(() => {
		let e = !0;
		return i.crews(n, o).then((t) => {
			e && (p(t), t.crews.length && h(t.crews[0].id));
		}).catch((t) => e && O(q(t))), () => {
			e = !1;
		};
	}, [
		i,
		n,
		o
	]), r(() => {
		k.current?.querySelector("input, button")?.focus();
	}, [l, d]), r(() => {
		let e = (e) => {
			e.key === "Escape" && (e.preventDefault(), j());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, [j]);
	let M = d?.crews.find((e) => e.id === m) ?? null, P = () => ({
		items: a.map((e) => ({
			repository: e.repository,
			number: e.number
		})),
		...d?.available ? { crew: { id: m } } : { label: _.trim() }
	}), F = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(q(e));
		} finally {
			E(!1);
		}
	}, I = () => F(async () => {
		S(await i.preview(n, P())), u(1);
	}), L = () => F(async () => {
		w(await i.send(n, P())), u(2), e.onSent();
	}), R = d ? d.available ? !!M : !!_.trim() : !1;
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
					children: Yc.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: [/* @__PURE__ */ b(Te, {
						size: 14,
						"aria-hidden": "true"
					}), Yc[l][0]]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-radar-line",
					className: "text-sm text-muted",
					children: Yc[l][1]
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
											e.status && /* @__PURE__ */ b(K, { children: e.status }),
											e.labels.map((e) => /* @__PURE__ */ b(K, {
												variant: "info",
												children: e
											}, e))
										]
									}), /* @__PURE__ */ b("span", {
										className: "text-xs text-muted",
										children: Mc(e)
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
							style: Xc,
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
							style: Xc,
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
						}) : /* @__PURE__ */ b(Pe, {
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
							disabled: T || !R,
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
var Qc = {
	textAlign: "left",
	fontWeight: 500,
	fontSize: 12,
	color: "var(--muted)",
	padding: "4px 8px",
	borderBottom: "1px solid var(--border)",
	whiteSpace: "nowrap"
}, $c = {
	padding: "6px 8px",
	borderTop: "1px solid var(--border)",
	verticalAlign: "top"
}, el = {
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
function tl(e) {
	let t = e.icon;
	return /* @__PURE__ */ b(G, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ x("a", {
			href: e.href,
			"aria-label": e.label,
			"aria-describedby": n,
			...e.external ? {
				target: "_blank",
				rel: "noopener noreferrer"
			} : { target: "_top" },
			style: el,
			className: "text-sm",
			children: [/* @__PURE__ */ b(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
function nl({ item: e }) {
	let t = e.kind === "issue" ? F : e.draft ? se : oe, n = e.kind === "issue" ? "Issue" : e.draft ? "Draft pull request" : "Pull request";
	return /* @__PURE__ */ b(G, {
		text: n,
		children: /* @__PURE__ */ b("span", {
			role: "img",
			"aria-label": n,
			style: {
				display: "inline-flex",
				color: e.kind === "issue" ? "var(--ok)" : "var(--accent)"
			},
			children: /* @__PURE__ */ b(t, {
				size: 16,
				"aria-hidden": "true"
			})
		})
	});
}
var rl = {
	passing: "Checks pass",
	failing: "Checks fail",
	pending: "Checks running"
};
function il({ item: e }) {
	if (e.kind !== "pr") return null;
	let t = e.checks;
	return /* @__PURE__ */ x("span", {
		className: "inline-flex flex-wrap items-center gap-1.5 text-xs",
		children: [e.draft && /* @__PURE__ */ b(K, { children: "draft" }), t && /* @__PURE__ */ x("span", {
			className: "inline-flex items-center gap-1",
			style: { color: t === "passing" ? "var(--ok)" : t === "failing" ? "var(--danger)" : "var(--muted)" },
			children: [t === "passing" ? /* @__PURE__ */ b(A, {
				size: 12,
				"aria-hidden": "true"
			}) : t === "failing" ? /* @__PURE__ */ b(Pe, {
				size: 12,
				"aria-hidden": "true"
			}) : null, rl[t]]
		})]
	});
}
function al({ labels: e }) {
	return e.length ? /* @__PURE__ */ b("span", {
		className: "inline-flex flex-wrap gap-1",
		children: e.map((e) => /* @__PURE__ */ b(K, { children: e }, e))
	}) : null;
}
function ol({ item: e, onSend: t }) {
	let n = `${e.repository} #${e.number}`;
	return /* @__PURE__ */ x("span", {
		className: "inline-flex gap-1.5",
		children: [
			t && (e.kind === "issue" ? /* @__PURE__ */ b(X, {
				icon: Me,
				label: `Send ${n} to an Issue Radar crew`,
				tooltip: "Send to an Issue Radar crew: pick a crew, check the label, then Avoozl adds it.",
				onClick: () => t(e)
			}) : /* @__PURE__ */ b("span", {
				"aria-hidden": "true",
				style: {
					display: "inline-block",
					width: 28
				}
			})),
			/* @__PURE__ */ b(tl, {
				icon: Te,
				label: `Open ${n} in Issue Radar`,
				tooltip: e.links.issueRadar.tooltip,
				href: e.links.issueRadar.url
			}),
			e.links.review && /* @__PURE__ */ b(tl, {
				icon: Oe,
				label: `Code review for ${n}`,
				tooltip: e.links.review.tooltip,
				href: e.links.review.url
			})
		]
	});
}
function sl({ item: e }) {
	return /* @__PURE__ */ x("a", {
		href: e.links.github,
		target: "_blank",
		rel: "noopener noreferrer",
		className: "min-w-0",
		style: { overflowWrap: "anywhere" },
		children: [
			/* @__PURE__ */ x("span", {
				className: "text-muted tabular-nums",
				children: ["#", e.number]
			}),
			" ",
			/* @__PURE__ */ b("span", {
				className: "underline",
				children: e.title
			})
		]
	});
}
function cl(e) {
	return /* @__PURE__ */ b("input", {
		type: "checkbox",
		checked: e.checked,
		"aria-label": `Select ${e.item.repository} #${e.item.number}`,
		onChange: (t) => e.onChange(t.target.checked)
	});
}
function ll(e) {
	let t = e.items.map(Uc), n = t.length > 0 && t.every((t) => e.selected.has(t));
	return /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-untriaged-table": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...Qc,
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
						...Qc,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Author"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Age"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Labels"
				}),
				/* @__PURE__ */ b("th", {
					style: {
						...Qc,
						textAlign: "right"
					},
					children: /* @__PURE__ */ b(G, {
						text: "Comments",
						children: /* @__PURE__ */ b("span", {
							role: "img",
							"aria-label": "Comments",
							style: { display: "inline-flex" },
							children: /* @__PURE__ */ b(ge, {
								size: 12,
								"aria-hidden": "true"
							})
						})
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.items.map((t) => /* @__PURE__ */ x("tr", {
				"data-untriaged-row": Uc(t),
				children: [
					/* @__PURE__ */ b("td", {
						style: $c,
						children: /* @__PURE__ */ b(cl, {
							item: t,
							checked: e.selected.has(Uc(t)),
							onChange: (n) => e.onSelect([Uc(t)], n)
						})
					}),
					/* @__PURE__ */ b("td", {
						style: $c,
						children: /* @__PURE__ */ b(nl, { item: t })
					}),
					/* @__PURE__ */ x("td", {
						style: {
							...$c,
							minWidth: "16rem"
						},
						children: [/* @__PURE__ */ b(sl, { item: t }), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(il, { item: t }) })]
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: t.repository
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: t.author ?? ""
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(G, {
							text: t.createdAt ? `Opened ${t.createdAt.slice(0, 10)}` : null,
							children: /* @__PURE__ */ b("span", {
								className: "tabular-nums",
								children: Hc(t.createdAt, e.now)
							})
						})
					}),
					/* @__PURE__ */ b("td", {
						style: $c,
						children: /* @__PURE__ */ b(al, { labels: t.labels })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							textAlign: "right"
						},
						className: "tabular-nums",
						children: t.comments
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ol, {
							item: t,
							onSend: e.onSend
						})
					})
				]
			}, Uc(t))) })]
		})
	});
}
function ul(e) {
	return /* @__PURE__ */ b("ul", {
		className: "flex flex-col",
		"data-untriaged-stack": !0,
		children: e.items.map((t) => /* @__PURE__ */ x("li", {
			className: "flex items-start gap-2 border-t py-2 first:border-t-0",
			style: { borderColor: "var(--border)" },
			"data-untriaged-row": Uc(t),
			children: [
				/* @__PURE__ */ b(cl, {
					item: t,
					checked: e.selected.has(Uc(t)),
					onChange: (n) => e.onSelect([Uc(t)], n)
				}),
				/* @__PURE__ */ b(nl, { item: t }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(sl, { item: t }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								t.repository,
								" · ",
								t.author ?? "unknown",
								" · ",
								Hc(t.createdAt, e.now),
								" · ",
								t.comments,
								" comment",
								t.comments === 1 ? "" : "s"
							]
						}),
						/* @__PURE__ */ b(il, { item: t }),
						/* @__PURE__ */ b(al, { labels: t.labels })
					]
				}),
				/* @__PURE__ */ b(ol, {
					item: t,
					onSend: e.onSend
				})
			]
		}, Uc(t)))
	});
}
function dl({ list: e, now: t }) {
	let n = e.repositories.filter((e) => e.error || e.truncated), r = e.repositories.map((e) => e.checkedAt).filter((e) => !!e).sort();
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-0.5 text-xs text-muted",
		"data-untriaged-checked": !0,
		children: [/* @__PURE__ */ x("span", { children: [r.length ? `Checked ${J(r[0], t)}` : "Not checked yet", " · GitHub is read at most every 10 minutes."] }), n.map((e) => /* @__PURE__ */ x("span", {
			className: e.error ? "text-danger" : void 0,
			children: [
				e.repository,
				": ",
				e.error ?? `GitHub search returns ${e.read} of the ${e.searched ?? "more"} items it found. Narrow its Untriaged filter to see the rest.`
			]
		}, e.repository))]
	});
}
function fl({ items: e, now: t, narrow: n }) {
	let r = (e) => e.handoff ? `Sent${e.handoff.crew ? ` to ${e.handoff.crew.name}` : ""}${e.handoff.label ? ` with ${e.handoff.label}` : ""}${e.handoff.at ? ` ${J(e.handoff.at, t)}` : ""}` : "A crew found it on its own", i = ({ item: e }) => {
		let t = Nc(e);
		return /* @__PURE__ */ b(K, {
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
			"data-radar-row": Uc(e),
			children: [
				/* @__PURE__ */ b(nl, { item: e }),
				/* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-1 flex-col gap-1 text-sm",
					children: [
						/* @__PURE__ */ b(sl, { item: e }),
						/* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: [
								e.repository,
								" · ",
								r(e)
							]
						}),
						/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(i, { item: e }) })
					]
				}),
				/* @__PURE__ */ b(ol, { item: e })
			]
		}, Uc(e)))
	}) : /* @__PURE__ */ b("div", {
		style: { overflowX: "auto" },
		children: /* @__PURE__ */ x("table", {
			className: "w-full text-sm",
			style: { borderCollapse: "collapse" },
			"data-radar-list": !0,
			children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
				/* @__PURE__ */ b("th", {
					style: {
						...Qc,
						width: 28
					},
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Kind"
					})
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Item"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "Repository"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "State"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: "How it got there"
				}),
				/* @__PURE__ */ b("th", {
					style: Qc,
					children: /* @__PURE__ */ b("span", {
						className: "sr-only",
						children: "Open in"
					})
				})
			] }) }), /* @__PURE__ */ b("tbody", { children: e.map((e) => /* @__PURE__ */ x("tr", {
				"data-radar-row": Uc(e),
				children: [
					/* @__PURE__ */ b("td", {
						style: $c,
						children: /* @__PURE__ */ b(nl, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							minWidth: "16rem"
						},
						children: /* @__PURE__ */ b(sl, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: e.repository
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(i, { item: e })
					}),
					/* @__PURE__ */ b("td", {
						style: $c,
						className: "text-muted",
						children: r(e)
					}),
					/* @__PURE__ */ b("td", {
						style: {
							...$c,
							whiteSpace: "nowrap"
						},
						children: /* @__PURE__ */ b(ol, { item: e })
					})
				]
			}, Uc(e))) })]
		})
	});
}
function pl({ workspaceId: e }) {
	let n = l(), r = o(() => kc(n), [n]), i = o(() => Ac(n), [n]), [a, s] = c("untriaged"), [u, d] = c(null), [f, p] = c(null), { value: m, error: g, busy: _ } = fi(e, t((e) => r.view(e), [r])), [S, C] = c(null), [w, T] = c(!1), [E, D] = c(null), [O, k] = xi(e, Jc), [A, j] = c(() => /* @__PURE__ */ new Set()), M = As("(max-width: 767px)"), N = Date.now(), P = S ?? m, F = o(() => Vc(P), [P]), I = o(() => (P?.items ?? []).filter((e) => Bc(e, O, N)), [
		P,
		O,
		N
	]), L = Cr(JSON.stringify(O)), R = I.filter((e) => A.has(Uc(e))), ee = Gc(R), te = jc(R), ne = P?.withRadar ?? [], z = async () => {
		if (e) try {
			C(await r.view(e)), j(/* @__PURE__ */ new Set());
		} catch (e) {
			D(q(e));
		}
	}, B = (e) => k({
		...O,
		...e
	}), V = (e, t) => j(Wc(A, e, t)), re = async () => {
		if (e) {
			T(!0), D(null);
			try {
				C(await r.refresh(e));
			} catch (e) {
				D(q(e));
			} finally {
				T(!1);
			}
		}
	};
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-untriaged-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-3",
				children: [/* @__PURE__ */ b(Tr, {
					id: "avoozl-untriaged-title",
					view: "untriaged",
					children: "Untriaged"
				}), /* @__PURE__ */ b(Y, {
					icon: Ee,
					onClick: () => void re(),
					disabled: _ || w || !P?.enabled,
					tooltip: "Read GitHub now instead of waiting for the next check",
					children: w ? "Checking…" : "Check now"
				})]
			}),
			/* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Open issues and pull requests no trigger rule, triage label or Avoozl task covers. Send issues to an Issue Radar crew, or open them in Issue Radar or Code Review Sage."
			}),
			P?.enabled && /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(v, {
				layoutId: "avoozl-untriaged-show",
				ariaLabel: "Show",
				segments: [{
					key: "untriaged",
					label: `Untriaged (${P.items.length})`
				}, {
					key: "radar",
					label: `With Issue Radar (${ne.length})`
				}],
				value: a,
				onChange: (e) => s(e)
			}) }),
			f && /* @__PURE__ */ b("p", {
				role: "status",
				className: "text-sm text-muted",
				"data-radar-note": !0,
				children: f
			}),
			(g || E) && /* @__PURE__ */ b("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: g ?? E
			}),
			P ? P.enabled ? a === "radar" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				"data-radar-view": !0,
				children: [/* @__PURE__ */ b("p", {
					className: "text-xs text-muted",
					children: "Issues a crew holds, or that you sent to one. Crews act with your GitHub login, so Avoozl tells their work apart by label: a close on an issue a crew claimed counts only once its pull request merges, a crew’s labels never start Avoozl rules, and a crew’s “needs human” label shows under Needs you."
				}), ne.length === 0 ? /* @__PURE__ */ b(h, {
					icon: /* @__PURE__ */ b(Te, {
						size: 36,
						"aria-hidden": "true"
					}),
					title: "Nothing with Issue Radar",
					subtitle: "Select issues under Untriaged and press Send to Issue Radar."
				}) : /* @__PURE__ */ b(fl, {
					items: ne,
					now: N,
					narrow: M
				})]
			}) : P.items.length === 0 ? /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ b(dl, {
				list: P,
				now: N
			}), /* @__PURE__ */ b(h, {
				icon: /* @__PURE__ */ b(ue, {
					size: 36,
					"aria-hidden": "true"
				}),
				...Kc(P)
			})] }) : /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ b(yi, {
					id: "avoozl-untriaged",
					label: "Filter untriaged items",
					active: Rc(O),
					onClear: () => k({}),
					fields: [
						{
							kind: "select",
							key: "repository",
							label: "Repository",
							value: O.repository ?? "",
							options: F.repositories,
							onChange: (e) => B({ repository: e || void 0 })
						},
						{
							kind: "select",
							key: "kind",
							label: "Kind",
							value: O.kind ?? "",
							options: Lc,
							onChange: (e) => B({ kind: e || void 0 })
						},
						{
							kind: "select",
							key: "age",
							label: "Age",
							value: O.age ?? "",
							options: Ic,
							onChange: (e) => B({ age: e || void 0 })
						},
						{
							kind: "select",
							key: "author",
							label: "Author",
							value: O.author ?? "",
							options: F.authors,
							onChange: (e) => B({ author: e || void 0 })
						},
						{
							kind: "select",
							key: "label",
							label: "Label",
							value: O.label ?? "",
							options: F.labels,
							onChange: (e) => B({ label: e || void 0 })
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
									children: [I.length === P.items.length ? `${P.items.length} untriaged` : `${I.length} of ${P.items.length} untriaged`, R.length ? ` · ${R.length} selected` : ""]
								}), /* @__PURE__ */ b(dl, {
									list: P,
									now: N
								})]
							}),
							/* @__PURE__ */ b(G, {
								text: ee.tooltip,
								children: (e) => /* @__PURE__ */ x("a", {
									href: R.length ? ee.url : void 0,
									target: "_top",
									role: "button",
									"aria-disabled": !R.length || void 0,
									"aria-describedby": e,
									tabIndex: 0,
									style: {
										...el,
										opacity: R.length ? 1 : .5,
										cursor: R.length ? "pointer" : "default"
									},
									className: "text-sm",
									"data-bulk-open": !0,
									children: [/* @__PURE__ */ b(Te, {
										size: 14,
										"aria-hidden": "true"
									}), "Open selected in Issue Radar"]
								})
							}),
							/* @__PURE__ */ b(Y, {
								icon: Me,
								onClick: () => d(R),
								disabled: !te.ok,
								tooltip: te.reason,
								children: "Send selected to Issue Radar"
							})
						]
					})
				}),
				I.length === 0 ? /* @__PURE__ */ x("p", {
					className: "text-sm text-muted",
					children: [
						"No untriaged item matches these filters. Clear them to see all ",
						P.items.length,
						"."
					]
				}) : b(M ? ul : ll, {
					items: L.take("untriaged", I),
					selected: A,
					now: N,
					onSelect: V,
					onSend: (e) => d([e])
				}),
				/* @__PURE__ */ b(wr, { ...L.more("untriaged", I.length) })
			] }) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "The Untriaged list needs a GitHub mode. Choose one in Settings › GitHub."
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: _ ? "Loading…" : "Not loaded"
			}),
			u && e && /* @__PURE__ */ b(Zc, {
				workspaceId: e,
				client: i,
				items: u,
				repository: u[0].repository,
				onSent: () => void z(),
				onClose: (e) => {
					d(null), p(e ?? null);
				}
			})
		]
	});
}
// kirocrew-app/ui/src/settings-api.ts
function ml(e) {
	let t = async (t, n, r) => (await e.post(Dt, {
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
function hl(e) {
	let t = Tl(e.project);
	return {
		mode: Q(e.mode) || "plans-repo",
		planningRepository: Q(e.planningRepository),
		repositories: Object.keys(Tl(e.repositories)).join(", "),
		projectOwner: Q(t.owner),
		projectNumber: Q(t.number),
		projectTitle: "",
		releases: "",
		iteration: !!Tl(t.fields).iteration,
		tableByWave: !1,
		epic: !0
	};
}
function gl(e) {
	let t = /^\d+$/.test(e.projectNumber.trim()) ? Number(e.projectNumber.trim()) : void 0, n = Fl({
		owner: kl(e.projectOwner),
		number: t,
		title: t === void 0 ? kl(e.projectTitle) : void 0
	});
	return Fl({
		mode: e.mode,
		planningRepository: e.mode === "plans-repo" ? kl(e.planningRepository) : void 0,
		repositories: Ol(e.repositories),
		project: Object.keys(n).length ? n : void 0,
		releases: Ol(e.releases),
		iteration: e.iteration,
		tableByWave: e.tableByWave,
		epic: e.epic
	});
}
var _l = (e) => /[\s,"]/.test(e) ? `"${e}"` : e;
function vl(e) {
	let t = (e) => Array.isArray(e) ? e.filter((e) => typeof e == "string" && e.trim() !== "").map((e) => e.trim()) : [], n = t(e.labelsAll), r = t(e.labelsAny), i = t(e.labelsNone), a = typeof e.assignee == "string" ? e.assignee.trim() : "";
	return [
		...n.map((e) => `label:${_l(e)}`),
		...r.length ? [`label:${r.map(_l).join(",")}`] : [],
		...i.length ? [`-label:${i.map(_l).join(",")}`] : [],
		...a ? [`assignee:${a}`] : []
	].join(" ");
}
var yl = "Same syntax as GitHub's issue search. Supported: label:, -label:, assignee:, no:assignee.", bl = (e) => (t, n, r, i = !1) => e.post(Dt, {
	operation: "github.trigger.preview",
	input: {
		match: r,
		...n.trim() ? { repository: n.trim() } : {},
		...i ? { untriaged: !0 } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function xl(e) {
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
var Sl = () => ({
	filter: "",
	triageLabels: [],
	ignoreOlderThanDays: "",
	notify: !1
}), Cl = (e) => e.map((e) => `-label:${_l(e)}`).join(" ");
function wl(e) {
	let t = Fl({
		filter: kl(e.filter),
		triageLabels: e.triageLabels.length ? e.triageLabels : void 0,
		ignoreOlderThanDays: Al(e.ignoreOlderThanDays),
		notify: e.notify || void 0
	});
	return Object.keys(t).length ? t : void 0;
}
var Tl = (e) => e && typeof e == "object" && !Array.isArray(e) ? e : {}, Q = (e) => typeof e == "string" ? e : typeof e == "number" ? String(e) : "", El = (e) => Array.isArray(e) ? e.map(Q).join(", ") : "", Dl = (e) => Object.fromEntries(Object.entries(Tl(e)).map(([e, t]) => [e, Q(t)]));
function Ol(e) {
	let t = e.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
	return t.length ? t : void 0;
}
var kl = (e) => e.trim() ? e.trim() : void 0;
function Al(e) {
	let t = e.trim();
	if (t) return /^\d+$/.test(t) ? Number(t) : t;
}
var jl = /* @__PURE__ */ new Set([
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
function Ml() {
	return {
		id: "",
		action: "deliver",
		match: "",
		author: "",
		autoPublishChildren: !1
	};
}
function Nl(e = "") {
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
		untriaged: Sl(),
		rest: {}
	};
}
function Pl(e) {
	let t = Tl(e.project);
	return {
		mode: Q(e.mode),
		planningRepository: Q(e.planningRepository),
		defaultAuthority: Q(e.defaultAuthority),
		epicIssueType: Q(e.epicIssueType),
		projectOwner: Q(t.owner),
		projectNumber: Q(t.number),
		fields: Dl(t.fields),
		statusValues: Dl(t.statusValues),
		repositories: Object.entries(Tl(e.repositories)).map(([e, t]) => {
			let n = Tl(t), r = n.pullRequestReviews;
			return {
				name: e,
				baseBranch: Q(n.baseBranch),
				coder: Q(n.coder),
				allowedActors: El(n.allowedActors),
				minimumPermission: Q(n.minimumPermission),
				requiredChecks: El(n.requiredChecks),
				concurrency: Q(n.concurrency),
				priority: El(n.priority),
				pullRequestReviews: r != null,
				reviewApprovals: Q(Tl(r).approvals),
				managedLabels: Dl(n.managedLabels),
				crewLabels: Dl(n.crewLabels),
				rules: (Array.isArray(n.rules) ? n.rules : []).map((e) => {
					let t = Tl(e);
					return {
						id: Q(t.id),
						action: Q(t.action),
						match: typeof t.match == "string" ? t.match : vl(t),
						author: Q(t.author),
						autoPublishChildren: t.autoPublishChildren === !0
					};
				}),
				untriaged: (() => {
					let e = Tl(n.untriaged);
					return {
						filter: Q(e.filter),
						triageLabels: Array.isArray(e.triageLabels) ? e.triageLabels.map(Q).filter(Boolean) : [],
						ignoreOlderThanDays: Q(e.ignoreOlderThanDays),
						notify: e.notify === !0
					};
				})(),
				rest: Object.fromEntries(Object.entries(n).filter(([e]) => !jl.has(e)))
			};
		})
	};
}
function Fl(e) {
	return Object.fromEntries(Object.entries(e).filter(([, e]) => e !== void 0));
}
function Il(e) {
	let t = Fl(Object.fromEntries(Object.entries(e).map(([e, t]) => [e, kl(t)])));
	return Object.keys(t).length ? t : void 0;
}
function Ll(e) {
	let t = Il(e.fields), n = Il(e.statusValues), r = !!(e.projectOwner.trim() || e.projectNumber.trim() || t || n);
	return {
		mode: kl(e.mode) ?? null,
		planningRepository: kl(e.planningRepository) ?? null,
		defaultAuthority: kl(e.defaultAuthority) ?? null,
		epicIssueType: kl(e.epicIssueType) ?? null,
		project: r ? Fl({
			owner: kl(e.projectOwner),
			number: Al(e.projectNumber),
			fields: t,
			statusValues: n
		}) : null,
		repositories: e.repositories.length ? Object.fromEntries(e.repositories.map((e) => [e.name.trim(), Fl({
			...e.rest,
			baseBranch: kl(e.baseBranch),
			coder: kl(e.coder),
			allowedActors: Ol(e.allowedActors),
			minimumPermission: kl(e.minimumPermission),
			requiredChecks: Ol(e.requiredChecks),
			concurrency: Al(e.concurrency),
			priority: Ol(e.priority),
			pullRequestReviews: e.pullRequestReviews ? Fl({ approvals: Al(e.reviewApprovals) }) : void 0,
			managedLabels: Il(e.managedLabels),
			crewLabels: Il(e.crewLabels),
			rules: e.rules.map((e) => Fl({
				id: e.id.trim(),
				action: e.action,
				match: kl(e.match),
				author: kl(e.author),
				autoPublishChildren: e.autoPublishChildren || void 0
			})),
			untriaged: wl(e.untriaged)
		})])) : null
	};
}
var Rl = {
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
	todo: {
		required: !1,
		blank: "blank: Todo"
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
}, zl = {
	status: "Status",
	release: "Release",
	wave: "Wave",
	iteration: "",
	todo: "Todo",
	inProgress: "In progress",
	done: "Done",
	deferred: "Deferred"
}, Bl = {
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
}, Vl = {
	managed: "Managed issue",
	ready: "Ready to code",
	responding: "Responding",
	planning: "Planning",
	stale: "Stale claim",
	decision: "Needs a decision"
};
function Hl(e) {
	if (e.mode === "plans-repo" && !e.planningRepository.trim()) return "Plans repository mode needs its planning repository (Where tasks live).";
	if (!Xl(e.mode)) return null;
	let t = e.projectOwner.trim() || e.projectNumber.trim() || Object.values(e.fields).some((e) => e.trim()) || Object.values(e.statusValues).some((e) => e.trim());
	if (t && !e.projectOwner.trim()) return "The Project needs its owner (Where tasks live › Project fields).";
	if (t && !e.projectNumber.trim()) return "The Project needs its number (Where tasks live › Project fields).";
	for (let [t, n] of e.repositories.entries()) {
		let r = n.name.trim() || `Repository ${t + 1}`;
		if (!n.name.trim()) return `${r} needs its owner/name (Repositories › Mode and branch).`;
		if (Xl(e.mode) && !n.baseBranch.trim()) return `${r} needs its default branch (Repositories › Mode and branch).`;
	}
	return null;
}
function Ul(e, t, n, r = Date.now()) {
	let i = t[e], a = [];
	return n && a.push("Required by GitHub branch rule"), i && a.push(i.at ? `${i.source} · last run ${J(i.at, r)}` : i.source), a.join(" · ") || "Not seen on recent commits or open pull requests";
}
function Wl(e, t, n = Date.now()) {
	let r = Ol(e) ?? [], i = t?.sources ?? {}, a = new Set(t?.seen ?? []), o = new Set(t?.required ?? []);
	return [.../* @__PURE__ */ new Set([...t?.seen ?? [], ...r])].map((e) => ({
		name: e,
		checked: o.has(e) || r.includes(e),
		seen: a.has(e),
		branchRule: o.has(e),
		where: Ul(e, i, o.has(e), n)
	})).sort((e, t) => Number(t.branchRule) - Number(e.branchRule) || Number(t.seen) - Number(e.seen) || e.name.localeCompare(t.name));
}
function Gl(e, t, n) {
	let r = Ol(e) ?? [];
	return (n ? [.../* @__PURE__ */ new Set([...r, t])] : r.filter((e) => e !== t)).join(", ");
}
var Kl = (e) => (t, n, r) => e.post(Dt, {
	operation: "github.repository.inspect",
	input: {
		repository: n,
		...r.trim() ? { baseBranch: r.trim() } : {}
	},
	workspaceId: t
}).then((e) => e.result);
function ql(e) {
	if (!e) return "Reading the branch rules…";
	if (e.error || !e.reviewRule) return e.reviewError ?? e.error ?? "The branch rules could not be read.";
	let t = e.reviewRule;
	return t.hidden ? `${t.hiddenReason ?? "GitHub hides the classic protection rule from this account."} The approval count is unknown${t.approvals ? `, at least ${t.approvals} from a ruleset` : ""}. GitHub still enforces it on merge. ${t.approvals ? `Avoozl waits for ${t.approvals} approval${t.approvals === 1 ? "" : "s"} meanwhile.` : "Avoozl's reviewer chats stay the review gate."}` : t.approvals ? `${e.branch} needs ${t.approvals} approving review${t.approvals === 1 ? "" : "s"} (${t.sources.join(" and ")})${t.dismissStale ? ", and a new push dismisses old approvals" : ""}. Avoozl waits for that many from allowed people on the pull request's head commit.` : "No branch rule asks for approvals; Avoozl's reviewer chats are the review gate.";
}
var Jl = [
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
], Yl = (e) => e === "plans-repo" || e === "single-repo" ? e : "local", Xl = (e) => Yl(e) !== "local";
function Zl(e) {
	let t = Yl(e), n = [
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
var Ql = "Labels, checks, reviews and the Project board only apply to GitHub modes.";
function $l(e) {
	let t = [];
	return e.planningRepository.trim() && t.push("planning repository"), (e.projectOwner.trim() || e.projectNumber.trim()) && t.push("Project board"), e.repositories.length && t.push(`${e.repositories.length} repository GitHub setting${e.repositories.length === 1 ? "" : "s"}`), e.epicIssueType.trim() && t.push("epic issue type"), t;
}
var eu = [
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
], tu = (e) => /^create|^enable/.test(e.action) ? "create" : /^keep/.test(e.action) ? "keep" : "change";
function nu(e) {
	return eu.map((t) => ({
		...t,
		writes: e.filter((e) => t.steps.includes(e.step))
	})).filter((e) => e.writes.length);
}
function ru(e, t, n) {
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
var iu = [{
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
}], au = (e) => Yl(e) === "single-repo" ? "issue-radar" : "worker", ou = "workspaces";
function su(e, t, n, r) {
	let i = ou;
	return t === "settings" && e !== "settings" ? i : r.includes(n) ? n : i;
}
// kirocrew-app/ui/src/RadioFold.tsx
var cu = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function lu() {
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
function uu(e) {
	return /* @__PURE__ */ x("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ b("style", { children: cu }), e.sections.map((t) => {
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
						t.description && t.fields && /* @__PURE__ */ b(lu, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/ModePicker.tsx
var du = "var(--ok)", fu = "var(--tile-purple, var(--accent))";
function pu({ color: e, children: t }) {
	return /* @__PURE__ */ b("span", {
		className: "inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold leading-4",
		style: {
			background: e,
			color: "var(--card)"
		},
		children: t
	});
}
function mu() {
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
function hu({ color: e }) {
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
function gu({ color: e }) {
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
var _u = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card)",
	minWidth: 0,
	overflow: "hidden"
};
function vu({ name: e, locked: t, children: n }) {
	return /* @__PURE__ */ x("div", {
		style: _u,
		className: "flex-1 text-[11px] leading-4",
		children: [/* @__PURE__ */ x("div", {
			className: "flex items-center gap-1 px-2 py-1 font-semibold",
			style: {
				background: "var(--bg-elevated, transparent)",
				borderBottom: "1px solid var(--border)",
				color: "var(--text)"
			},
			children: [t && /* @__PURE__ */ b(mu, {}), /* @__PURE__ */ b("span", {
				className: "truncate",
				children: e
			})]
		}), /* @__PURE__ */ b("div", {
			className: "flex flex-col",
			children: n
		})]
	});
}
function yu({ icon: e, title: t, pill: n, sub: r }) {
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
function bu() {
	return /* @__PURE__ */ x("div", {
		"aria-hidden": "true",
		children: [/* @__PURE__ */ x("div", {
			className: "flex gap-3",
			children: [/* @__PURE__ */ b(vu, {
				name: "acme/plans",
				locked: !0,
				children: /* @__PURE__ */ b(yu, {
					icon: /* @__PURE__ */ b(hu, { color: du }),
					title: "Add login",
					pill: /* @__PURE__ */ b(pu, {
						color: du,
						children: "Open"
					}),
					sub: "#12 · spec 1.2"
				})
			}), /* @__PURE__ */ b(vu, {
				name: "acme/app",
				children: /* @__PURE__ */ b(yu, {
					icon: /* @__PURE__ */ b(gu, { color: fu }),
					title: "Add login",
					pill: /* @__PURE__ */ b(pu, {
						color: fu,
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
function xu() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(vu, {
			name: "acme/app",
			children: [/* @__PURE__ */ b(yu, {
				icon: /* @__PURE__ */ b(hu, { color: du }),
				title: "Add login",
				pill: /* @__PURE__ */ b(pu, {
					color: du,
					children: "Open"
				}),
				sub: "#12 · spec 1.2"
			}), /* @__PURE__ */ b(yu, {
				icon: /* @__PURE__ */ b(gu, { color: fu }),
				title: "Add login",
				pill: /* @__PURE__ */ b(pu, {
					color: fu,
					children: "Merged"
				}),
				sub: /* @__PURE__ */ x(y, { children: ["body: ", /* @__PURE__ */ b("code", { children: "Closes #12" })] })
			})]
		})
	});
}
function Su() {
	return /* @__PURE__ */ b("div", {
		className: "flex",
		"aria-hidden": "true",
		children: /* @__PURE__ */ x(vu, {
			name: "This Mac · Avoozl workspace",
			children: [/* @__PURE__ */ b(yu, {
				icon: /* @__PURE__ */ b(hu, { color: du }),
				title: "Add login",
				pill: /* @__PURE__ */ b(pu, {
					color: fu,
					children: "Done"
				}),
				sub: "task 1.2 · in the database"
			}), /* @__PURE__ */ b(yu, {
				icon: /* @__PURE__ */ b(gu, { color: fu }),
				title: "avoozl/1.2 → main",
				pill: /* @__PURE__ */ b(pu, {
					color: fu,
					children: "Merged"
				}),
				sub: "merged in your checkout"
			})]
		})
	});
}
var Cu = {
	local: Su,
	"plans-repo": bu,
	"single-repo": xu
}, wu = {
	local: "A worker chat codes the task, Avoozl checks it and merges the branch on this Mac. Nothing is sent to GitHub.",
	"plans-repo": "The pull request merges from the linked branch; GitHub closes the private issue. The code repository never names the plans repository.",
	"single-repo": "The pull request says Closes #12; GitHub closes the issue when it merges."
}, Tu = {
	local: fe,
	"plans-repo": he,
	"single-repo": ae
};
function Eu(e) {
	let t = e.idPrefix ?? "avoozl-mode", n = Yl(e.value);
	return /* @__PURE__ */ b("div", {
		"data-mode-picker": !0,
		children: /* @__PURE__ */ b(uu, {
			name: t,
			label: "Where tasks live",
			value: n,
			onChange: (t) => e.onChange(t),
			sections: Jl.map((t) => {
				let r = Cu[t.mode];
				return {
					key: t.mode,
					title: t.title,
					line: t.line,
					icon: Tu[t.mode],
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
									children: wu[t.mode]
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
function Du(e) {
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
function Ou(e) {
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
var ku = [
	{
		title: "A task becomes ready",
		text: "When everything a task waits on is done, the tick marks it ready and starts it, up to the limit at once.",
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
			boxes: [
				"Worker chats",
				"Save",
				"Issue Radar"
			],
			on: 1
		})
	}
], Au = [
	{
		title: "A task becomes ready",
		text: "When everything it waits on is done, Avoozl adds the repository's ready label to its issue.",
		picture: /* @__PURE__ */ b(Ou, {
			boxes: ["Waits on", "Ready label"],
			on: 1,
			note: "Scope the crew to this exact label in Issue Radar."
		})
	},
	{
		title: "Issue Radar takes it",
		text: "The crew scoped to that label claims the issue and codes it in its own session.",
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
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
		picture: /* @__PURE__ */ b(Ou, {
			boxes: [
				"Issue Radar",
				"Save",
				"Worker chats"
			],
			on: 1
		})
	}
];
function ju(e) {
	let [t, n] = c(null), r = Yl(e.mode), i = e.value || au(e.mode), a = iu.filter((e) => e.modes.includes(r));
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2.5",
		children: [
			/* @__PURE__ */ b("div", {
				role: "radiogroup",
				"aria-label": "Who codes",
				className: "grid gap-3",
				style: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" },
				children: a.map((t) => {
					let n = i === t.coder, r = au(e.mode) === t.coder;
					return /* @__PURE__ */ x("div", {
						id: `${e.id}-${t.coder}`,
						role: "radio",
						"aria-checked": n,
						tabIndex: n ? 0 : -1,
						"data-coder": t.coder,
						onClick: () => e.onChange(r ? "" : t.coder),
						onKeyDown: (n) => {
							let r = a.indexOf(t), i = n.key === "ArrowRight" || n.key === "ArrowDown" ? a[(r + 1) % a.length] : n.key === "ArrowLeft" || n.key === "ArrowUp" ? a[(r - 1 + a.length) % a.length] : n.key === " " || n.key === "Enter" ? t : null;
							i && (n.preventDefault(), e.onChange(au(e.mode) === i.coder ? "" : i.coder), document.getElementById(`${e.id}-${i.coder}`)?.focus());
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
								children: /* @__PURE__ */ b(Ou, { boxes: [...t.flow] })
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
				icon: I,
				onClick: () => n(t ? null : i),
				"aria-label": t ? "Hide how this works" : "How does this work?",
				children: t ? "Hide how this works" : "How does this work?"
			}) }),
			t && /* @__PURE__ */ b(Du, {
				id: `${e.id}-walk`,
				label: t === "issue-radar" ? "How Issue Radar codes a task" : "How worker chats code a task",
				steps: t === "issue-radar" ? Au : ku,
				onClose: () => n(null)
			})
		]
	});
}
// kirocrew-app/ui/src/SetupWizard.tsx
var Mu = {
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
}, Nu = [
	["What to set up", "Avoozl reads GitHub first. Pick the extras; the mode, repositories and Project come from this tab."],
	["Check each change", "Every write Avoozl would make on GitHub. It never deletes or renames anything."],
	["Making the changes", "Avoozl makes them one at a time. Cancel stops before the next one."],
	["Save the settings file", "Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save."]
];
function Pu(e) {
	let { workspaceId: n, client: i, form: a } = e, [o, l] = c(0), [u, d] = c(e.first), [p, m] = c(!1), [h, _] = c(null), v = s(null), S = s(null), C = t(() => {
		v.current ? (i.cancelSetup(n, v.current), e.onClose("Cancelled. Avoozl stops before its next write; check again to see what was made.")) : e.onClose(o === 3 ? void 0 : "Cancelled. Nothing was written.");
	}, [
		i,
		n,
		e,
		o
	]);
	r(() => {
		S.current?.querySelector("input, button")?.focus();
		let e = (e) => {
			e.key === "Escape" && (e.preventDefault(), C());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, [C]);
	let w = async (e) => {
		m(!0), _(null);
		try {
			await e();
		} catch (e) {
			_(q(e));
		} finally {
			m(!1);
		}
	}, T = () => w(async () => {
		d(await i.setup(n, gl(a))), l(1);
	}), E = () => w(async () => {
		if (u) {
			l(2), v.current = u.previewHash;
			try {
				d(await i.setup(n, {
					...gl(a),
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
	}), O = nu(u?.writes ?? []), k = u?.writes.length ?? 0, A = (u?.results ?? []).filter((e) => e.status !== "done");
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
					children: Nu.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: Nu[o][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-setup-line",
					className: "text-sm text-muted",
					children: Nu[o][1]
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
											style: Mu[tu(e)],
											children: tu(e)
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
function Fu(e) {
	let { workspaceId: n, client: i, settings: a, shared: o } = e, [s, l] = c(() => hl(a.github)), u = {
		...s,
		...o,
		mode: o.mode || s.mode
	}, [d, f] = c(null), [p, m] = c(null), [h, g] = c(() => (/* @__PURE__ */ new Date()).toISOString()), [_, v] = c(!1), [y, S] = c(null), C = JSON.stringify(gl(u)), w = t(async () => {
		f(null), m(null);
		try {
			f(await i.setup(n, JSON.parse(C)));
		} catch (e) {
			m(q(e));
		}
		g((/* @__PURE__ */ new Date()).toISOString());
	}, [
		i,
		n,
		C
	]);
	r(() => l(hl(a.github)), [a]), r(() => {
		w();
	}, [w]);
	let T = ru(d, p, h);
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
					/* @__PURE__ */ b(G, {
						text: new Date(T.at).toLocaleString(),
						children: /* @__PURE__ */ x("span", {
							className: "text-xs text-muted",
							children: ["Checked ", J(T.at, Date.now())]
						})
					}),
					/* @__PURE__ */ b(X, {
						icon: Ee,
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
						icon: Ne,
						primary: !0,
						onClick: () => v(!0),
						tooltip: "Show each change first. Nothing is written until you apply.",
						children: "Set up GitHub"
					}),
					/* @__PURE__ */ b(X, {
						icon: Ee,
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
							/* @__PURE__ */ b(Pe, {
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
						icon: Ee,
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
			_ && /* @__PURE__ */ b(Pu, {
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
function Iu(e) {
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
var Lu = {
	info: "var(--muted)",
	warn: "var(--text)",
	error: "var(--danger)"
};
function Ru(e) {
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
				children: [t.served && /* @__PURE__ */ b(K, {
					variant: "info",
					children: "This backend"
				}), /* @__PURE__ */ b(G, {
					text: Ft(t.state).tip,
					children: /* @__PURE__ */ b("span", {
						"data-workspace-state": t.state,
						children: /* @__PURE__ */ b(K, {
							variant: Ft(t.state).variant,
							children: Ft(t.state).label
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
function zu(e = {}) {
	let { onSelect: n, onListChange: i } = e, a = l(), s = o(() => Ot(a), [a]), u = o(() => lr(a), [a]), [d, h] = c(null), [g, _] = c(null), [v, y] = c(e.selected ?? null), [S, C] = c(null), [w, T] = c(null), [E, D] = c(!1), [O, k] = c({
		id: "",
		root: "",
		name: ""
	}), A = t(async (e) => {
		D(!0), T(null);
		try {
			await e();
		} catch (e) {
			T(q(e));
		} finally {
			D(!1);
		}
	}, []), j = t((e = null) => A(async () => {
		let t = await s.list();
		_(t), y((n) => At(t, e ?? n));
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
	}, F = g?.items.find((e) => e.id === v) ?? null, I = As("(min-width: 768px)");
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
							children: g.items.map((e) => /* @__PURE__ */ b(Ru, {
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
									/* @__PURE__ */ b(Iu, {
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
									/* @__PURE__ */ b(Iu, {
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
									/* @__PURE__ */ b(Iu, {
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
								children: kt(S)
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
										children: [/* @__PURE__ */ b(G, {
											text: e.at,
											children: /* @__PURE__ */ b("span", {
												className: "whitespace-nowrap tabular-nums text-muted",
												children: e.at ? `${e.at.slice(11, 19)} · ${J(e.at)}` : "unknown"
											})
										}), /* @__PURE__ */ b("span", {
											className: "font-medium uppercase",
											style: { color: Lu[e.level] },
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
// kirocrew-app/ui/src/plugins-api.ts
var Bu = "Contract version", Vu = "Which version of Avoozl's plugin interface this plugin was built for. Not the plugin's own version.", Hu = () => ({
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
}), Uu = [
	["Where from", "Pick where the plugin’s files are. Open one source and fill it in."],
	["What", "What Avoozl found there. Check it is the plugin you meant."],
	["Applies to", "Declare it on this computer only, or share it with the repository."],
	["Review and approve", "Nothing runs until you approve this exact version."]
], Wu = [
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
], Gu = (e) => e[e.where].trim(), Ku = {
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
}, qu = (e) => e.provides ?? e.kinds ?? [], Ju = (e) => qu(e).map((e) => Ku[e]?.title ?? e);
function Yu(e) {
	let t = {
		create: 0,
		change: 0,
		keep: 0,
		skip: 0
	};
	for (let n of e) t[n.action]++;
	return t;
}
function Xu(e) {
	if (e === void 0) return "";
	let t = typeof e == "string" ? e : JSON.stringify(e);
	return t.length > 80 ? t.slice(0, 77) + "..." : t;
}
var Zu = (e, t, n) => ({
	id: e.id,
	repositories: e.repositories,
	previewHash: e.previewHash,
	acceptLowered: t,
	confirmPublic: n
});
function Qu(e, t, n, r) {
	return e.state === "approved" ? t ? t.changes.some((e) => e.action === "create" || e.action === "change") ? t.warnings.length && !n ? "Accept the who-counts change to import." : e.source === "machine" && !r ? "Confirm that the settings and the plugin id go into .avoozl.json." : null : "Nothing to import: every setting is already the same." : "Avoozl has not previewed the pack yet." : `Approve version ${e.version ?? ""} first. Nothing from the pack applies before that.`;
}
function $u(e) {
	let t = Gu(e);
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
function ed(e, t) {
	return {
		...e,
		...t.id ? { id: t.id } : {},
		...t.contract === void 0 ? {} : { contract: String(t.contract) }
	};
}
function td(e, t, n) {
	if (!t) return "Avoozl has not looked at the source yet.";
	if (t.error) return t.error;
	if (t.contract !== void 0 && t.supported === !1) return `The plugin is built for contract version ${t.contract}; this Avoozl loads ${n.join(", ") || "1"}.`;
	let r = e.where === "package" ? e.version.trim() : "";
	return r && t.version && r !== t.version ? `The installed package is version ${t.version}, not ${r}. Install ${r} or clear the version.` : null;
}
function nd(e) {
	return e.where === "path" && /^(?:\/|~|[A-Za-z]:[\\/])/.test(e.path.trim()) ? "A shared folder must be a path inside the repository, written relative to it." : null;
}
function rd(e, t = !1) {
	let n = e.id.trim();
	if (!/^[a-z][a-z0-9-]{0,60}$/.test(n)) return { error: "Give the plugin a lowercase id." };
	if (n === "local" || n === "github") return { error: `${n} is a built-in route.` };
	let r = Gu(e);
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
function id(e) {
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
var ad = (e) => !!e.hash && (e.state === "unapproved" || e.state === "changed"), od = (e) => {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t?.code === "plugin-public-repository" || /publish this plugin/.test(t?.error ?? "") ? String(t.error) : null;
	} catch {
		return null;
	}
};
function sd(e) {
	let t = async (t, n, r) => (await e.post(Dt, {
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
// kirocrew-app/ui/src/PackImport.tsx
var cd = {
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
function ld({ preview: e }) {
	let t = Yu(e.changes);
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
								children: /* @__PURE__ */ b(K, {
									variant: e.warning ? "warning" : cd[e.action].variant,
									children: cd[e.action].label
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
										children: ["was ", /* @__PURE__ */ b("code", { children: Xu(e.from) })]
									}),
									/* @__PURE__ */ b("code", { children: Xu(e.to) }),
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
function ud(e) {
	let { row: n, workspaceId: i, client: a, onClose: o, onChanged: l } = e, [u, d] = c(null), [p, m] = c(!1), [h, g] = c(!1), [_, v] = c(!1), [y, S] = c(null), C = s(null), w = t(() => o(), [o]);
	r(() => {
		let e = !0;
		return a.packPreview(i, n.id ?? "").then((t) => e && d(t)).catch((t) => e && S(q(t))), () => {
			e = !1;
		};
	}, [
		a,
		i,
		n.id
	]), r(() => {
		let e = (e) => {
			e.key === "Escape" && (e.preventDefault(), w());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, [w]), r(() => {
		C.current?.querySelector("button")?.focus();
	}, []);
	let T = Qu(n, u, p, h), E = async () => {
		if (u && !T) {
			v(!0), S(null);
			try {
				await a.packImport(i, Zu(u, p, h)), await l(), o(`Imported ${n.id} version ${n.version} into .avoozl.json.`);
			} catch (e) {
				S(q(e));
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
				u ? /* @__PURE__ */ b(ld, { preview: u }) : !y && /* @__PURE__ */ b("p", {
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
var dd = {
	path: re,
	package: be,
	git: ae
};
function fd(e) {
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
var pd = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function md({ form: e, set: t }) {
	let n = {
		path: /* @__PURE__ */ b(fd, {
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
			children: [/* @__PURE__ */ b(fd, {
				label: "Package name",
				marker: "required",
				raw: "package",
				children: /* @__PURE__ */ b(g, {
					value: e.package,
					placeholder: "@example/avoozl-tracker",
					onChange: (e) => t({ package: e.target.value })
				})
			}), /* @__PURE__ */ b(fd, {
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
				/* @__PURE__ */ b(fd, {
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
					children: [/* @__PURE__ */ b(fd, {
						label: "Tag, branch or commit",
						marker: "required",
						raw: "ref",
						children: /* @__PURE__ */ b(g, {
							value: e.ref,
							placeholder: "v1.0.0",
							onChange: (e) => t({ ref: e.target.value })
						})
					}), /* @__PURE__ */ b(fd, {
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
		children: /* @__PURE__ */ b(uu, {
			name: "avoozl-plugin-source",
			label: "Where from",
			value: e.where,
			onChange: (e) => t({ where: e }),
			sections: Wu.map((e) => ({
				key: e.key,
				title: e.title,
				line: e.line,
				icon: dd[e.key],
				fields: n[e.key]
			}))
		})
	});
}
function hd(e) {
	let { form: t, preview: n, set: r } = e, i = n.contract !== void 0, a = n.capabilities ? Object.entries(n.capabilities).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; ") || "none" : void 0, o = [
		["Source", `${Wu.find((e) => e.key === t.where)?.title}: ${Gu(t)}${t.where === "git" ? ` at ${t.ref}` : ""}`],
		["Commit found", n.commit],
		["Version", n.version],
		["Parts", n.provides || n.kinds ? Ju(n).join(", ") : void 0],
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
			/* @__PURE__ */ b(fd, {
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
			/* @__PURE__ */ b(fd, {
				label: Bu,
				marker: "required",
				raw: "contract",
				hint: i ? `From the plugin’s own avoozl-plugin.json. ${Vu}` : Vu,
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
						...pd,
						maxWidth: "8rem"
					},
					children: e.supported.map((e) => /* @__PURE__ */ b("option", {
						value: String(e),
						children: e
					}, e))
				})
			}),
			/* @__PURE__ */ b(fd, {
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
function gd(e) {
	let { form: t } = e, n = nd(t), r = t.where === "git" ? "Written to .avoozl.json. Each computer fetches the commit with Update, then approves it." : t.where === "package" ? "Written to .avoozl.json. Each computer installs the package, then approves it." : "Written to .avoozl.json. Each computer approves it for itself.", i = (e, t, n) => /* @__PURE__ */ x("div", {
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
		children: /* @__PURE__ */ b(uu, {
			name: "avoozl-plugin-scope",
			label: "Applies to",
			value: t.scope,
			onChange: (t) => {
				e.set({ scope: t }), e.setConfirmPublic(!1);
			},
			sections: [{
				key: "machine",
				icon: fe,
				title: "This computer only",
				line: "Saved in this computer’s Avoozl settings. Nothing goes into the repository.",
				description: i("Only this computer runs it, after you approve it here.", "you are trying it, or its name is private.", "Others on the repository do not see it or run it.")
			}, {
				key: "repository",
				icon: Me,
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
function _d(e) {
	let { workspaceId: n, client: i, onClose: a, onChanged: o } = e, l = e.supported.length ? e.supported : [1], [u, d] = c(0), [p, m] = c(Hu()), [h, g] = c(null), [_, v] = c(null), [y, S] = c(null), [C, w] = c(!1), [T, E] = c(!1), [D, O] = c(null), k = s(null), A = (e) => {
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
		let e = (e) => {
			e.key === "Escape" && (e.preventDefault(), j());
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, [j]), r(() => {
		k.current?.querySelector("summary, input:not([disabled]), button")?.focus();
	}, [u]);
	let M = async (e) => {
		E(!0), O(null);
		try {
			await e();
		} catch (e) {
			O(q(e));
		} finally {
			E(!1);
		}
	}, N = () => M(async () => {
		if (!Gu(p)) throw Error(p.where === "path" ? "Name the plugin folder." : p.where === "git" ? "Give the git URL." : "Name the package.");
		if (p.where === "git" && !p.ref.trim()) throw Error("Give a tag, branch or commit.");
		let e = await i.preview(n, $u(p));
		if (e.error) throw Error(e.error);
		g(e), m((t) => ed(t, e)), d(1);
	}), P = () => M(async () => {
		let e = rd(p, C);
		if (!e.input) throw Error(e.error ?? "Check the form.");
		try {
			let t = await i.add(n, e.input);
			v(t), t.pack && t.id && S(await i.packPreview(n, t.id).catch(() => null));
		} catch (e) {
			let t = od(e);
			throw t ? Error(`${t} Tick the box to share it anyway.`) : e;
		}
		await o(), d(3);
	}), F = () => M(async () => {
		_ && (await i.approve(n, _), await o(), a(`Approved ${_.id} version ${_.version}.`));
	}), I = u === 1 ? td(p, h, l) : null;
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
					children: Uu.map(([e], t) => /* @__PURE__ */ x("li", {
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
					children: Uu[u][0]
				}), /* @__PURE__ */ b("p", {
					id: "avoozl-plugin-line",
					className: "text-sm text-muted",
					children: Uu[u][1]
				})] }),
				u === 0 && /* @__PURE__ */ b(md, {
					form: p,
					set: A
				}),
				u === 1 && h && /* @__PURE__ */ b(hd, {
					form: p,
					preview: h,
					supported: l,
					set: A,
					problem: I
				}),
				u === 2 && /* @__PURE__ */ b(gd, {
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
							}), /* @__PURE__ */ b(K, {
								variant: id(_).attention ? "warning" : void 0,
								children: id(_).label
							})]
						}),
						_.reason && /* @__PURE__ */ b("p", {
							className: "text-xs text-muted",
							children: _.reason
						}),
						/* @__PURE__ */ b(bd, { row: _ }),
						/* @__PURE__ */ b(yd, { row: _ }),
						y && /* @__PURE__ */ x("div", {
							className: "flex flex-col gap-1",
							children: [
								/* @__PURE__ */ b("h4", {
									className: "text-sm font-semibold",
									children: "Settings pack"
								}),
								/* @__PURE__ */ b(ld, { preview: y }),
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
								let e = rd(p);
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
						u === 3 && _ && ad(_) && /* @__PURE__ */ x(f, {
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
						u === 3 && _ && !ad(_) && /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => a(`Added ${_.id}. It can't be approved yet: ${_.reason ?? id(_).label}.`),
							children: "Keep it unapproved"
						})
					]
				})
			]
		})]
	});
}
function vd(e) {
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
			children: Uu.map(([e, t], n) => /* @__PURE__ */ x("li", {
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
				icon: we,
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
		n && /* @__PURE__ */ b(_d, {
			workspaceId: e.workspaceId,
			client: e.client,
			supported: e.supported,
			onChanged: e.onChanged,
			onClose: o
		})
	] });
}
// kirocrew-app/ui/src/PluginsSettings.tsx
function yd({ row: e }) {
	let t = Object.entries(e.capabilities ?? {}).map(([e, t]) => `${e}: ${t.length ? t.join(", ") : "none"}`).join("; "), n = [
		["Version", e.version],
		[Bu, e.contract === void 0 ? void 0 : String(e.contract)],
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
function bd({ row: e }) {
	let t = qu(e);
	return t.length ? /* @__PURE__ */ b("ul", {
		className: "mt-2 flex flex-col gap-1 text-xs",
		"data-plugin-parts": !0,
		children: t.map((t) => /* @__PURE__ */ x("li", { children: [
			/* @__PURE__ */ b("span", {
				className: "font-semibold",
				children: Ku[t]?.title ?? t
			}),
			/* @__PURE__ */ x("span", {
				className: "text-muted",
				children: [" ", Ku[t]?.line]
			}),
			t === "pack" && e.pack ? /* @__PURE__ */ b("span", {
				className: "block text-muted",
				children: e.pack.imported ? `Imported version ${e.pack.imported.version}: ${e.pack.imported.settings.length} settings.${e.pack.offer ? ` Version ${e.version} is not imported yet.` : ""}` : "Not imported yet."
			}) : null
		] }, t))
	}) : null;
}
function xd(e) {
	let { row: t, busy: n, act: r, client: i, workspaceId: a } = e, o = id(t), s = t.id ?? "";
	return /* @__PURE__ */ x(p, { children: [
		/* @__PURE__ */ x("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ b(m, { children: t.id ?? "Unnamed entry" }),
				/* @__PURE__ */ b(K, {
					variant: o.attention ? "warning" : void 0,
					children: o.label
				}),
				t.health?.state === "ok" ? /* @__PURE__ */ b(K, { children: "Healthy" }) : null
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
		/* @__PURE__ */ b(bd, { row: t }),
		/* @__PURE__ */ b(yd, { row: t }),
		t.id ? /* @__PURE__ */ x("div", {
			className: "mt-3 flex flex-wrap gap-2",
			children: [
				t.pack ? /* @__PURE__ */ b(Z, {
					tooltip: "See what each pack setting would create, change or keep, then import it",
					primary: t.pack.offer && t.state === "approved",
					disabled: n,
					onClick: () => e.onImport(t),
					children: t.pack.imported && t.pack.offer ? `Preview version ${t.version}` : t.pack.imported ? "Preview pack" : "Preview and import pack"
				}) : null,
				ad(t) ? /* @__PURE__ */ x(Z, {
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
				t.git ? /* @__PURE__ */ b(Z, {
					tooltip: "Fetch the ref's current commit. A new commit needs approval again.",
					disabled: n,
					onClick: () => r(() => i.update(a, s)),
					children: t.commit ? `Update from ${t.git.ref}` : `Fetch ${t.git.ref}`
				}) : null,
				t.state === "disabled" ? /* @__PURE__ */ b(Z, {
					tooltip: "Let this plugin run again",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !1)),
					children: "Enable"
				}) : t.state !== "invalid" && t.state !== "missing" ? /* @__PURE__ */ b(Z, {
					tooltip: "Stop this plugin from running. Enable undoes it.",
					disabled: n,
					onClick: () => r(() => i.disable(a, s, !0)),
					children: "Disable"
				}) : null,
				/* @__PURE__ */ b("span", {
					className: "ml-auto",
					children: /* @__PURE__ */ b(vr, {
						icon: je,
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
function Sd({ workspaceId: e }) {
	let n = l(), r = o(() => sd(n), [n]), { value: i, error: a, busy: s, reload: u } = fi(e, t((e) => r.list(e), [r])), [d, f] = c(!1), [m, g] = c(null), [_, v] = c(null), [y, S] = c(null), C = (e) => {
		f(!0), g(null), e().then(() => u()).catch((e) => g(q(e))).finally(() => f(!1));
	}, w = As("(min-width: 1024px)");
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		children: [
			a ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: a
			}) : null,
			m ? /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: m
			}) : null,
			y ? /* @__PURE__ */ b("p", {
				className: "text-xs text-muted",
				role: "status",
				children: y
			}) : null,
			_ ? /* @__PURE__ */ b(ud, {
				row: _,
				workspaceId: e,
				client: r,
				onChanged: u,
				onClose: (e) => {
					v(null), S(e ?? null);
				}
			}) : null,
			/* @__PURE__ */ x("div", {
				"data-plugins-layout": !0,
				style: w ? {
					display: "grid",
					gridTemplateColumns: "minmax(18rem, 2fr) minmax(0, 3fr)",
					gap: 14,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 14
				},
				children: [/* @__PURE__ */ b(vd, {
					workspaceId: e,
					client: r,
					supported: i?.supportedContracts ?? [],
					onChanged: u
				}), /* @__PURE__ */ x("div", {
					className: "flex min-w-0 flex-col gap-3",
					"aria-label": "Installed plugins",
					children: [i && !i.plugins.length ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(h, {
						title: "No plugins",
						subtitle: "Nothing loads until a plugin is declared and approved. Add one on the left."
					}) }) : null, i?.plugins.map((t, n) => /* @__PURE__ */ b(xd, {
						row: t,
						busy: d || s,
						act: C,
						client: r,
						workspaceId: e,
						onImport: v
					}, `${t.id}-${t.source}-${n}`))]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/content-api.ts
var Cd = {
	plan: "Plan files",
	github: "GitHub text",
	brief: "Session briefs",
	diff: "Worker diffs"
}, wd = {
	plan: "Spec files when a plan is saved or approved.",
	github: "Issue, comment and pull request text Avoozl writes.",
	brief: "The brief a worker session starts with.",
	diff: "Lines a worker adds, checked before a push."
}, Td = Object.keys(Cd);
function Ed(e) {
	return e.source === "plugin" ? `Rules plugin ${e.plugin}${e.version ? `, version ${e.version}` : ""}` : e.source === "policy" ? ".avoozl.json" : e.termsFrom === "machine" ? "Terms file named in this machine’s settings" : "Terms file in .avoozl/local/content-rules";
}
function Dd(e) {
	let t = e.boundaries ? e.boundaries.map((e) => Cd[e] ?? e).join(", ") : "Every boundary";
	return e.repositories ? `${t} in ${e.repositories.join(", ")}` : t;
}
var Od = {
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
}, kd = (e) => Od[e]?.name ?? e, Ad = (e, t) => {
	let n = Od[e]?.modes;
	return !n || n.includes(t ?? "");
}, jd = () => ({
	id: "",
	action: "block",
	boundaries: [...Td],
	repositories: [],
	plugin: ""
}), Md = (e) => ({
	id: e.id,
	action: e.action,
	boundaries: e.boundaries ?? [...Td],
	repositories: e.repositories ?? [],
	plugin: e.plugin ?? ""
}), Nd = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function Pd(e, t) {
	let n = e.id.trim();
	return n ? n.toLowerCase().startsWith("builtin:") ? { error: "Names starting builtin: are reserved." } : Nd.test(n) ? t.includes(n) ? { error: `A set named ${n} already exists.` } : e.boundaries.length ? { entry: {
		id: n,
		...e.action === "report" ? { action: "report" } : {},
		...e.boundaries.length && e.boundaries.length < Td.length ? { boundaries: Td.filter((t) => e.boundaries.includes(t)) } : {},
		...e.repositories.length ? { repositories: [...e.repositories] } : {},
		...e.plugin ? { plugin: e.plugin } : {}
	} } : { error: "Pick at least one place to check." } : { error: "Use lowercase letters, digits, dots, dashes or underscores." } : { error: "Give the set a name." };
}
var Fd = (e) => Pd(Md(e), []).entry ?? { id: e.id }, Id = /[.*+?^${}()|[\]\\]/g, Ld = (e) => e.replace(Id, "\\$&"), Rd = (e) => e.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
function zd(e) {
	let t = Rd(e);
	return Ld(t) === e ? {
		kind: "word",
		value: t
	} : {
		kind: "pattern",
		value: e
	};
}
function Bd(e) {
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
		let r = t.slice(0, n).trim(), i = zd(t.slice(n + 1).trim()), a = Vd.exec(r);
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
var Vd = /^allow(?:\s+(.*))?$/i, Hd = (e, t) => e === "word" ? Ld(t.trim()) : t.trim();
function Ud(e) {
	return e.kind === "blank" ? "" : e.kind === "note" ? `# ${e.text}` : e.kind === "raw" ? e.text : e.kind === "allow" ? `allow${e.rule.trim() ? ` ${e.rule.trim()}` : ""}: ${Hd(e.match, e.value)}` : `${e.name.trim()}: ${Hd(e.kind, e.value)}`;
}
var Wd = (e) => e.length ? e.map(Ud).join("\n") + "\n" : "", Gd = (e) => [...new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name.trim()] : []))].filter(Boolean);
function Kd(e, t = []) {
	if (e.kind === "raw") return "Needs a name, a colon, then the word or pattern.";
	if (e.kind === "allow") return e.rule.trim() && !Gd(t).includes(e.rule.trim()) ? "Allows a rule this file does not have." : e.value.trim() ? e.match === "pattern" ? qd(e.value) : null : "Give a word, phrase or pattern to allow.";
	if (e.kind !== "word" && e.kind !== "pattern") return null;
	let n = e.name.trim();
	return n ? n.includes(":") ? "A name cannot hold a colon." : /^#/.test(n) ? "A name cannot start with #." : Vd.test(n) ? "A name cannot start with allow; use an Allow row." : e.value.trim() ? e.kind === "pattern" ? qd(e.value) : null : "Give a word, phrase or pattern." : "Give the rule a name.";
}
function qd(e) {
	try {
		new RegExp(e.trim(), "i");
	} catch (e) {
		return `The pattern does not compile (${String(e.message).split(": ").pop()}).`;
	}
	return null;
}
function Jd(e) {
	let t = Bd(e);
	return t.flatMap((e, n) => {
		let r = Kd(e, t);
		return r ? [{
			line: n + 1,
			message: r
		}] : [];
	});
}
var Yd = (e) => e.filter((e) => e.kind === "word" || e.kind === "pattern").length, Xd = (e) => e.filter((e) => e.kind === "allow").length;
function Zd(e) {
	let t = new Set(e.flatMap((e) => e.kind === "word" || e.kind === "pattern" ? [e.name] : [])), n = e.length + 1;
	for (; t.has(`rule-${n}`);) n += 1;
	return `rule-${n}`;
}
function Qd(e, t) {
	let n = t.flatMap((e) => e.kind === "allow" && !Kd(e, t) ? [{
		rule: e.rule.trim(),
		re: new RegExp(Hd(e.match, e.value), "i")
	}] : []), r = t.flatMap((e) => {
		if (e.kind !== "word" && e.kind !== "pattern" || Kd(e, t)) return [];
		let r = e.name.trim();
		return [{
			name: r,
			re: new RegExp(Hd(e.kind, e.value), "gi"),
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
function $d(e, t) {
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
function ef(e) {
	let t = async (t, n, r) => (await e.post(Dt, {
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
var tf = "avoozl-content-help";
function nf() {
	let e = document.getElementById(tf);
	e && (e.open = !0, e.scrollIntoView({
		behavior: "smooth",
		block: "start"
	}));
}
function rf({ children: e = "How rules work" }) {
	return /* @__PURE__ */ x("button", {
		type: "button",
		className: "inline-flex items-center gap-1 text-xs underline",
		onClick: nf,
		"data-help-link": !0,
		children: [/* @__PURE__ */ b(k, {
			size: 12,
			"aria-hidden": "true"
		}), e]
	});
}
var af = {
	border: "1px solid var(--border)",
	borderRadius: 10,
	background: "color-mix(in srgb, var(--text) 4%, var(--card, var(--bg)))"
};
function of(e) {
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
				e.locked && /* @__PURE__ */ b(he, {
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
function sf(e) {
	let { value: t, selection: n } = e, r = (e, t) => n?.kind === e && "id" in n && n.id === t, i = /* @__PURE__ */ b(Y, {
		icon: we,
		primary: !0,
		onClick: () => e.onSelect({ kind: "new" }),
		tooltip: "Make a set of your own words to block or report",
		children: "Add rule set"
	});
	return /* @__PURE__ */ x("nav", {
		"aria-label": "Rule sets",
		className: "flex flex-col gap-3 p-3",
		style: af,
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
					/* @__PURE__ */ b("span", { children: /* @__PURE__ */ b(rf, {}) })
				]
			}) : /* @__PURE__ */ b("ul", {
				className: "flex flex-col gap-0.5",
				children: t?.sets.map((t) => /* @__PURE__ */ b(of, {
					title: t.id,
					selected: r("set", t.id),
					onClick: () => e.onSelect({
						kind: "set",
						id: t.id
					}),
					note: t.available ? /* @__PURE__ */ b("span", {
						className: "text-[11px] text-muted",
						children: t.action === "report" ? "Reports" : "Blocks"
					}) : /* @__PURE__ */ b(K, {
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
						children: t?.builtins.map((n) => /* @__PURE__ */ b(of, {
							locked: !0,
							title: kd(n.id),
							raw: n.id,
							selected: r("builtin", n.id),
							onClick: () => e.onSelect({
								kind: "builtin",
								id: n.id
							}),
							note: Ad(n.id, t?.mode) ? null : /* @__PURE__ */ b("span", {
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
function cf({ rows: e }) {
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
function lf({ id: e, appliesAt: t, mode: n }) {
	let r = Od[e], i = Ad(e, n);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-rule-details": e,
		children: [
			/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ x("h3", {
				className: "flex items-center gap-2 text-base font-semibold",
				children: [
					/* @__PURE__ */ b(he, {
						size: 14,
						"aria-hidden": "true",
						style: { color: "var(--muted)" }
					}),
					kd(e),
					i ? /* @__PURE__ */ b(K, { children: "Always on" }) : /* @__PURE__ */ b(K, { children: "Not used" })
				]
			}), /* @__PURE__ */ b("code", {
				className: "text-[11px] text-muted",
				children: e
			})] }),
			!i && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				children: "Not used in this mode: there is no planning repository to keep private. It runs in Plans repository mode."
			}),
			/* @__PURE__ */ b(cf, { rows: [
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
function uf(e) {
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
var df = (e, t, n) => n ? [.../* @__PURE__ */ new Set([...e, t])] : e.filter((e) => e !== t);
function ff(e) {
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
				}), /* @__PURE__ */ b(xr, {
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
						icon: z,
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
					children: Td.map((e) => /* @__PURE__ */ b(uf, {
						label: Cd[e],
						hint: wd[e],
						checked: t.boundaries.includes(e),
						onChange: (r) => n({ boundaries: df(t.boundaries, e, r) })
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
						children: r.repositories.map((e) => /* @__PURE__ */ b(uf, {
							label: e,
							checked: t.repositories.includes(e),
							onChange: (r) => n({ repositories: df(t.repositories, e, r) })
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
var pf = {
	border: "1px solid var(--border)",
	borderRadius: 6,
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	padding: "4px 8px",
	fontSize: 13,
	minWidth: 0,
	width: "100%"
}, mf = { fontFamily: "var(--mono, monospace)" }, hf = {
	display: "grid",
	gridTemplateColumns: "minmax(6rem, 9rem) minmax(8rem, 10rem) minmax(0, 1fr) auto",
	gap: 8,
	alignItems: "center"
}, gf = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
	gap: 6,
	alignItems: "center"
};
function _f(e) {
	let { row: t, index: n } = e, r = Kd(t, e.rows), i = `avoozl-term-error-${n}`, a = e.narrow ? gf : hf;
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
						...pf,
						...t.kind === "raw" ? mf : { color: "var(--muted)" }
					}
				}),
				/* @__PURE__ */ b(X, {
					icon: Pe,
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
	let o = t.kind === "allow", s = o ? t.match : t.kind, c = o ? `allow-${t.match}` : t.kind, l = (e, t, n) => e === t ? n : t === "pattern" ? Ld(n) : zd(n).kind === "word" ? zd(n).value : n, u = (n) => {
		if (n === c) return;
		let r = n.endsWith("pattern") ? "pattern" : "word", i = l(s, r, t.value);
		n.startsWith("allow") ? e.onChange({
			kind: "allow",
			rule: o ? t.rule : "",
			match: r,
			value: i
		}) : e.onChange({
			kind: r,
			name: o ? Zd(e.rows) : t.name,
			value: i
		});
	}, d = Gd(e.rows), f = o ? /* @__PURE__ */ x("select", {
		value: t.rule,
		"aria-label": `Rule allowed on line ${n + 1}`,
		onChange: (n) => e.onChange({
			...t,
			rule: n.target.value
		}),
		style: pf,
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
		style: pf
	}), p = /* @__PURE__ */ x("select", {
		value: c,
		"aria-label": `Kind on line ${n + 1}`,
		onChange: (e) => u(e.target.value),
		style: pf,
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
			...pf,
			...s === "pattern" ? mf : {},
			...r ? { borderColor: "var(--danger)" } : {},
			...e.narrow ? { gridColumn: "1 / 3" } : {}
		}
	}), h = /* @__PURE__ */ b(X, {
		icon: Pe,
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
function vf(e) {
	let t = s(null), n = o(() => Jd(e.text), [e.text]), r = new Set(n.map((e) => e.line)), i = Math.max(1, e.text.replace(/\n$/, "").split("\n").length), a = {
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
function yf({ rows: e }) {
	let [t, n] = c(""), r = o(() => Qd(t, e), [t, e]), i = t.split("\n"), a = r.filter((e) => !e.allowed), s = r.length - a.length, l = [...new Set(a.map((e) => e.rule))];
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
			children: i.map((e, t) => /* @__PURE__ */ x("div", { children: [$d(e, r.filter((e) => e.line === t)).map((e, t) => !e.rules.length && e.allowed ? /* @__PURE__ */ x("span", {
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
function bf(e) {
	let { workspaceId: t, client: n, set: i } = e, [a, o] = c(null), [s, l] = c([]), [u, d] = c(""), [p, m] = c(""), [h, g] = c("builder"), [_, y] = c(null), [S, C] = c(null), [w, T] = c(!1), E = As("(max-width: 640px)");
	r(() => {
		let e = !0;
		return o(null), y(null), C(null), n.terms(t, i.id).then((t) => {
			if (!e) return;
			o(t);
			let n = t.text ?? "";
			d(n), m(n), l(Bd(n));
		}).catch((t) => e && y(q(t))), () => {
			e = !1;
		};
	}, [
		n,
		t,
		i.id
	]);
	let D = (e) => {
		l(e), d(Wd(e)), C(null);
	}, O = (e) => {
		d(e), l(Bd(e)), C(null);
	}, k = Jd(u), A = u !== p, j = async () => {
		T(!0), y(null);
		try {
			let r = await n.saveTerms(t, i.id, u);
			m(u), C(`Saved ${r.rules} rule${r.rules === 1 ? "" : "s"}.`), await e.onSaved();
		} catch (e) {
			y(q(e));
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
							Yd(s),
							" rule",
							Yd(s) === 1 ? "" : "s",
							Xd(s) ? `, ${Xd(s)} allow` : "",
							!a.exists && !A ? ", no file yet" : ""
						]
					}),
					/* @__PURE__ */ b("span", {
						className: "ml-auto",
						children: /* @__PURE__ */ b(rf, { children: "How a line works" })
					})
				]
			}),
			h === "builder" ? /* @__PURE__ */ x("div", {
				className: "flex flex-col gap-2",
				children: [
					Yd(s) === 0 && /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: "No rules yet. Add one: a name that shows in logs, and the word or pattern to find."
					}),
					/* @__PURE__ */ b("ul", {
						className: "flex flex-col gap-2",
						"aria-label": "Rules",
						children: s.map((e, t) => /* @__PURE__ */ b(_f, {
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
							icon: we,
							onClick: () => D([...s, {
								kind: "word",
								name: Zd(s),
								value: ""
							}]),
							children: "Add rule"
						}), /* @__PURE__ */ b(Y, {
							icon: we,
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
			}) : /* @__PURE__ */ b(vf, {
				text: u,
				onChange: O
			}),
			/* @__PURE__ */ b(yf, { rows: s }),
			/* @__PURE__ */ x("p", {
				className: "flex items-start gap-1.5 text-xs text-muted",
				children: [/* @__PURE__ */ b(Ae, {
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
function xf(e) {
	let { set: t, value: n } = e, [i, a] = c(() => t ? Md(t) : jd()), [o, s] = c(null), [l, u] = c(!1), d = t ? JSON.stringify(Fd(t)) : null;
	r(() => {
		a(t ? Md(t) : jd()), s(null);
	}, [d]);
	let p = n.sets.filter((e) => e.id !== t?.id), m = n.choices ?? {
		repositories: [],
		plugins: []
	}, h = Pd(i, p.map((e) => e.id)), g = !t || JSON.stringify(h.entry) !== JSON.stringify(Fd(t)), _ = async (t, r) => {
		u(!0), s(null);
		try {
			e.onSaved(await e.client.saveSets(e.workspaceId, t, n.configHash), r);
		} catch (e) {
			s(q(e));
		} finally {
			u(!1);
		}
	}, v = () => {
		if (!h.entry) return s(h.error ?? "Check the form.");
		let e = n.sets.map((e) => e.id === t?.id ? h.entry : Fd(e));
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
							t && /* @__PURE__ */ b(K, {
								variant: t.available ? "success" : "warning",
								children: t.available ? "Available" : "Unavailable"
							}),
							t && /* @__PURE__ */ b(K, { children: t.action === "report" ? "Reports" : "Blocks" })
						]
					}), /* @__PURE__ */ b("p", {
						className: "text-xs text-muted",
						children: t ? "Your words to keep out of what Avoozl writes." : "Name it and pick where it checks. Add its words after you save."
					})]
				}), t && /* @__PURE__ */ b(vr, {
					icon: je,
					disabled: l,
					confirm: {
						title: `Delete the rule set ${t.id}?`,
						body: "It is removed from .avoozl.json and stops checking. Its terms file stays on this machine, so a new set with the same name uses it again.",
						action: "Delete set"
					},
					onConfirm: () => void _(p.map(Fd), null),
					children: "Delete set"
				})]
			}),
			t && /* @__PURE__ */ b(cf, { rows: [
				["Rules from", Ed(t)],
				["Checks", Dd(t)],
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
					/* @__PURE__ */ b(ff, {
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
					/* @__PURE__ */ b(bf, {
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
var Sf = String.raw`# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b`, Cf = String.raw`# zebra falcon app is the public name
allow: zebra falcon app
# ACME-0000 is the sample ticket in the docs
allow ticket: \bacme-0000\b`;
function wf() {
	return /* @__PURE__ */ x("details", {
		id: tf,
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
						children: Sf
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
						children: Cf
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b("h4", {
						className: "font-semibold",
						children: "Where it checks"
					}),
					/* @__PURE__ */ b("ul", {
						className: "text-muted",
						children: Td.map((e) => /* @__PURE__ */ x("li", { children: [
							/* @__PURE__ */ x("span", {
								style: { color: "var(--text)" },
								children: [Cd[e], ":"]
							}),
							" ",
							wd[e]
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
function Tf({ workspaceId: e }) {
	let n = l(), i = o(() => ef(n), [n]), { value: a, error: s, reload: u } = fi(e, t((e) => i.list(e), [i])), [d, f] = c(null), p = d ?? a;
	r(() => f(null), [a]);
	let [m, h] = c(null), g = m && (m.kind === "new" || m.kind !== "set" || p?.sets.some((e) => e.id === m.id)) ? m : p?.sets[0] ? {
		kind: "set",
		id: p.sets[0].id
	} : p?.builtins[0] ? {
		kind: "builtin",
		id: p.builtins[0].id
	} : null, _ = As("(min-width: 860px)"), v = g?.kind === "set" ? p?.sets.find((e) => e.id === g.id) ?? null : null, y = g?.kind === "builtin" ? p?.builtins.find((e) => e.id === g.id) : void 0;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-4",
		children: [
			s && /* @__PURE__ */ b("p", {
				className: "text-xs text-danger",
				children: s
			}),
			p?.error && /* @__PURE__ */ x("p", {
				className: "text-xs text-danger",
				children: [".avoozl.json contentRules is invalid, so every check blocks: ", p.error]
			}),
			/* @__PURE__ */ x("div", {
				"data-content-layout": !0,
				style: _ ? {
					display: "grid",
					gridTemplateColumns: "minmax(14rem, 18rem) minmax(0, 1fr)",
					gap: 16,
					alignItems: "start"
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [/* @__PURE__ */ b(sf, {
					value: p,
					selection: g,
					onSelect: h
				}), /* @__PURE__ */ b("div", {
					className: "min-w-0 rounded-lg border p-4",
					style: {
						borderColor: "var(--border)",
						background: "var(--card, var(--bg))"
					},
					children: p ? y ? /* @__PURE__ */ b(lf, {
						id: y.id,
						appliesAt: y.appliesAt,
						mode: p.mode
					}) : g?.kind === "new" || v ? /* @__PURE__ */ b(xf, {
						workspaceId: e,
						client: i,
						value: p,
						set: v,
						reload: u,
						onSaved: (e, t) => {
							f(e), h(t ? {
								kind: "set",
								id: t
							} : null);
						}
					}, v?.id ?? "new") : null : /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Reading rule sets…"
					})
				})]
			}),
			/* @__PURE__ */ b(wf, {})
		]
	});
}
// kirocrew-app/ui/src/PromptInstructions.tsx
var Ef = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Df(e) {
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
			/* @__PURE__ */ b(br, {
				id: `${e.id}-builtin`,
				title: `Built-in ${e.agent} prompt (read-only)`,
				children: e.builtIn ? /* @__PURE__ */ x("div", {
					className: "flex flex-col gap-2 pb-2",
					children: [/* @__PURE__ */ b("pre", {
						className: "rounded border p-2 text-xs",
						style: {
							...Ef,
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							maxHeight: "16rem",
							overflowY: "auto"
						},
						children: e.builtIn
					}), /* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(Y, {
						icon: t ? A : R,
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
				}), /* @__PURE__ */ b(Wf, { rule: { required: !1 } })]
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
				style: Ef
			}),
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(G, {
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
var Of = { required: !1 }, kf = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Af({ name: e }) {
	return /* @__PURE__ */ b(G, {
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
function jf(e) {
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
				}), /* @__PURE__ */ b(Wf, { rule: Of })]
			}),
			e.children,
			e.note && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.note
			}),
			/* @__PURE__ */ b(Af, { name: e.raw })
		]
	});
}
var Mf = [
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
function Nf({ workspaceId: e }) {
	let n = l(), i = o(() => Yo(n), [n]), { value: a, error: s, reload: u } = fi(e, t((e) => i.settings(e), [i])), [d, m] = c(ss()), [h, _] = c(""), [v, y] = c(!1), [S, C] = c(null), [w, T] = c({
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
		a && (m(ss(a.flow)), _(a.instructions ?? ""));
	}, [a]);
	let E = (e) => m({
		...d,
		...e
	}), D = async () => {
		if (!a) return;
		let t = cs(d);
		if (t.error) return C({ error: t.error });
		y(!0), C(null);
		try {
			await i.saveSettings(e, {
				flow: t.flow,
				expectedHash: a.hash
			}), h !== (a.instructions ?? "") && await i.saveInstructions(e, h), C({ ok: "Saved." }), await u();
		} catch (e) {
			C({ error: q(e) });
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
	let O = d.scope || os.scope, k = d.localChecksFirst ? d.localChecksFirst === "on" : os.localChecksFirst;
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3",
		"data-flow-settings": !0,
		children: [/* @__PURE__ */ x(p, {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ b($, {
					title: "Timing",
					blurb: "Always on. Avoozl records where each task's time goes; nothing to set."
				}),
				/* @__PURE__ */ b($, {
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
								}), /* @__PURE__ */ b(Wf, { rule: Of })]
							}),
							/* @__PURE__ */ b(xr, {
								id: "avoozl-flow-scope",
								label: "What to pause",
								value: O,
								onChange: (e) => E({ scope: e }),
								cards: Mf.map((e) => ({ ...e }))
							}),
							/* @__PURE__ */ b(Af, { name: "flow.stopTheLine.scope" })
						]
					})
				}),
				/* @__PURE__ */ x($, {
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
							/* @__PURE__ */ b(Wf, { rule: Of })
						]
					}), /* @__PURE__ */ b(Af, { name: "flow.localChecksFirst" })]
				}),
				/* @__PURE__ */ b($, {
					title: "Batching",
					blurb: "Run small related tasks together to pay setup and checks once. 1 turns it off.",
					children: /* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [/* @__PURE__ */ b(jf, {
							id: "avoozl-flow-max",
							label: "Most tasks per run",
							raw: "flow.batch.max",
							width: "13rem",
							children: /* @__PURE__ */ b(g, {
								id: "avoozl-flow-max",
								inputMode: "numeric",
								value: d.max,
								placeholder: String(os.max),
								onChange: (e) => E({ max: e.target.value })
							})
						}), /* @__PURE__ */ b(jf, {
							id: "avoozl-flow-by",
							label: "Group by",
							raw: "flow.batch.by",
							width: "12rem",
							children: /* @__PURE__ */ x("select", {
								id: "avoozl-flow-by",
								value: d.by,
								onChange: (e) => E({ by: e.target.value }),
								className: "rounded border px-2 py-1 text-sm",
								style: kf,
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
				/* @__PURE__ */ x($, {
					title: "Retro",
					blurb: "A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.",
					children: [/* @__PURE__ */ x("div", {
						className: "flex flex-wrap gap-4",
						children: [
							/* @__PURE__ */ b(jf, {
								id: "avoozl-flow-every",
								label: "After this many tasks",
								raw: "flow.retro.everyTasks",
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-every",
									inputMode: "numeric",
									value: d.everyTasks,
									placeholder: String(os.everyTasks),
									onChange: (e) => E({ everyTasks: e.target.value })
								})
							}),
							/* @__PURE__ */ b(jf, {
								id: "avoozl-flow-slow",
								label: "Slow when over (× usual)",
								raw: "flow.retro.slowFactor",
								width: "14rem",
								children: /* @__PURE__ */ b(g, {
									id: "avoozl-flow-slow",
									inputMode: "decimal",
									value: d.slowFactor,
									placeholder: String(os.slowFactor),
									onChange: (e) => E({ slowFactor: e.target.value })
								})
							}),
							/* @__PURE__ */ b(jf, {
								id: "avoozl-flow-model",
								label: "Model",
								raw: "flow.retro.model",
								width: "16rem",
								note: w.error ?? void 0,
								children: /* @__PURE__ */ b("select", {
									id: "avoozl-flow-model",
									value: d.model || os.model,
									onChange: (e) => E({ model: e.target.value === os.model ? "" : e.target.value }),
									className: "rounded border px-2 py-1 text-sm",
									style: kf,
									children: Go(w.list, d.model).map((e) => /* @__PURE__ */ b("option", {
										value: e.value,
										children: e.label
									}, e.value))
								})
							})
						]
					}), /* @__PURE__ */ b(Df, {
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
var Pf = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
}, Ff = (e = 220) => ({
	display: "grid",
	gap: 12,
	gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${e}px), 1fr))`,
	alignItems: "start"
}), If = {
	sm: "9rem",
	md: "18rem",
	lg: "28rem"
}, Lf = [
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
], Rf = {
	workspaces: "The Avoozl workspaces on this machine, each a folder with its own task database. Add one for each set of plans you keep apart.",
	repositories: "The code checkouts tasks change and land in, with their GitHub settings. Save only writes .avoozl.json.",
	github: "The mode, planning repository and Project board. Save only writes .avoozl.json; Set up GitHub creates what's missing, after showing each change.",
	plugins: "A plugin can bring a team’s settings pack, content rules, a tracker, an intake source or a delivery route. Each one runs or imports only after you approve it on this machine.",
	content: "Terms Avoozl must never write: in plan files, issues, comments, briefs and diffs. A match stops the write and asks you.",
	flow: "How Avoozl measures delivery time and reacts to slow or broken work. Every group applies in each mode."
}, zf = [
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
], Bf = {
	mode: "Which repository this is, the branch pull requests merge into, and who writes the code.",
	triggers: "A rule starts its action when an allowed person's label makes an issue match its line. No label name is built in.",
	checks: "Names of GitHub checks (CI jobs) that must pass on a task's PR before Avoozl counts it as done.",
	reviews: "Avoozl follows this branch's review rule on GitHub. To change it, change the rule on GitHub."
}, Vf = {
	status: "Status field",
	release: "Release field",
	wave: "Wave field",
	iteration: "Iteration field"
}, Hf = {
	claim: "Claim label",
	needsHuman: "Needs-human label"
}, Uf = {
	todo: "Todo option",
	inProgress: "In progress option",
	done: "Done option",
	deferred: "Deferred option"
};
function Wf({ rule: e }) {
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
function Gf(e) {
	return /* @__PURE__ */ x("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: e.width ? { maxWidth: If[e.width] } : void 0,
		children: [
			/* @__PURE__ */ x("label", {
				htmlFor: e.id,
				className: "flex flex-wrap items-baseline gap-x-2",
				children: [/* @__PURE__ */ b("span", {
					className: "font-medium",
					children: e.label
				}), /* @__PURE__ */ b(Wf, { rule: e.rule })]
			}),
			e.children,
			e.rule?.blank && /* @__PURE__ */ b("span", {
				className: "text-xs text-muted",
				children: e.rule.blank
			}),
			e.raw && /* @__PURE__ */ b(G, {
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
function Kf(e) {
	return /* @__PURE__ */ b(Gf, {
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
function qf(e) {
	return /* @__PURE__ */ b(Gf, {
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
			style: Pf,
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
function Jf({ children: e }) {
	return /* @__PURE__ */ b("p", {
		className: "mt-1 text-xs text-muted",
		children: e
	});
}
function $(e) {
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
var Yf = {
	all: "has all",
	any: "has any",
	none: "has none",
	assignee: "assigned to"
};
function Xf(e) {
	let t = l(), n = o(() => bl(t), [t]), [i, a] = c(null), [s, u] = c(null), d = !!e.untriaged, f = e.value.trim() || e.untriaged?.placeholder.trim() || "";
	r(() => {
		if (!f) {
			a(null), u(null);
			return;
		}
		let t = !0, r = setTimeout(() => {
			n(e.workspaceId, e.repository, f, d).then((e) => t && (a(e), u(null)), (e) => t && u(q(e)));
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
			/* @__PURE__ */ x(Gf, {
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
					children: yl
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
				children: xl(p.parsed).map((e) => /* @__PURE__ */ x("span", {
					className: "flex flex-wrap items-center gap-1",
					children: [/* @__PURE__ */ b("span", {
						className: "text-xs text-muted",
						children: Yf[e.kind]
					}), e.values.map((t) => /* @__PURE__ */ b(K, {
						variant: e.kind === "none" ? void 0 : "info",
						children: t
					}, t))]
				}, e.kind))
			}),
			p?.parsed && /* @__PURE__ */ b(Zf, {
				preview: p,
				untriaged: d
			})
		]
	});
}
function Zf({ preview: e, untriaged: t = !1 }) {
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
function Qf(e) {
	let t = l(), n = o(() => Pc(t), [t]), [i, a] = c(null), { id: s, value: u, repository: d } = e, f = (t) => e.onChange({
		...u,
		...t
	}), p = /^[\w.-]+\/[\w.-]+$/.test(d);
	r(() => {
		if (a(null), !p) return;
		let t = !0;
		return n(e.workspaceId, d).then((e) => t && a(e), (e) => t && a({
			repository: d,
			labels: null,
			error: q(e)
		})), () => {
			t = !1;
		};
	}, [
		p,
		d,
		e.workspaceId,
		n
	]);
	let m = Fc(u.triageLabels, i?.labels ?? null), h = (e, t) => f({ triageLabels: t ? [...u.triageLabels, e] : u.triageLabels.filter((t) => t.toLocaleLowerCase() !== e.toLocaleLowerCase()) });
	return /* @__PURE__ */ x($, {
		level: "sub",
		title: "Untriaged",
		blurb: "What the Untriaged tab lists for this repository: open issues and pull requests no rule, triage label or task covers.",
		children: [
			/* @__PURE__ */ b(Xf, {
				id: `${s}-untriaged-filter`,
				value: u.filter,
				repository: d,
				workspaceId: e.workspaceId,
				onChange: (e) => f({ filter: e }),
				untriaged: { placeholder: Cl(u.triageLabels) }
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
						}), /* @__PURE__ */ b(Wf, { rule: { required: !1 } })]
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
					/* @__PURE__ */ b(G, {
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
				children: [/* @__PURE__ */ b(Kf, {
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
								/* @__PURE__ */ b(Wf, { rule: { required: !1 } })
							]
						}),
						/* @__PURE__ */ b("span", {
							className: "text-xs text-muted",
							children: "At most one Kiro Crew notice an hour, with the counts. Off by default."
						}),
						/* @__PURE__ */ b(G, {
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
function $f(e) {
	let { rule: t, id: n } = e, r = (n) => e.onChange({
		...t,
		...n
	});
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 border-t pt-3",
		style: { borderColor: "var(--border)" },
		children: [
			/* @__PURE__ */ x("div", {
				style: Ff(180),
				children: [
					/* @__PURE__ */ b(Kf, {
						id: `${n}-id`,
						label: "Rule name",
						raw: "id",
						rule: { required: !0 },
						placeholder: "deliver-ready",
						value: t.id,
						onChange: (e) => r({ id: e })
					}),
					/* @__PURE__ */ b(qf, {
						id: `${n}-action`,
						label: "Action",
						raw: "action",
						rule: { required: !0 },
						value: t.action,
						options: e.actions,
						none: "Choose",
						onChange: (e) => r({ action: e })
					}),
					/* @__PURE__ */ b(Kf, {
						id: `${n}-author`,
						label: "Opened by",
						raw: "author",
						placeholder: "anyone",
						value: t.author,
						onChange: (e) => r({ author: e })
					})
				]
			}),
			/* @__PURE__ */ b(Xf, {
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
					children: /* @__PURE__ */ b(vr, {
						icon: je,
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
function ep({ roles: e }) {
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
function tp({ review: e, repository: t }) {
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
		}) : /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x(Jf, { children: [
			n ? "Set for this repository." : "The workspace roles.",
			" Writer model ",
			e.writerModel ?? "not named",
			"."
		] }), /* @__PURE__ */ b(ep, { roles: r })] })
	});
}
Bf.checks;
function np(e) {
	let [t, n] = c(""), r = e.inspect?.checks ?? null, i = Wl(e.value, r), a = /^[\w.-]+\/[\w.-]+$/.test(e.repository), o = () => {
		let r = t.trim();
		r && (e.onChange(Gl(e.value, r, !0)), n(""));
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
		}), /* @__PURE__ */ b(Kf, {
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
							onChange: (n) => e.onChange(Gl(e.value, t.name, n.target.checked))
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
				children: [/* @__PURE__ */ b(Kf, {
					id: `${e.id}-check-extra`,
					label: "Add another name",
					placeholder: "a check not run yet",
					width: "md",
					value: t,
					onChange: n
				}), /* @__PURE__ */ b(Z, {
					tooltip: "Add this exact, case-sensitive check name to the list",
					onClick: o,
					disabled: !t.trim(),
					children: "Add"
				})]
			})
		]
	});
}
function rp(e) {
	let t = e.inspect?.reviewRule?.url ?? (e.repository ? `https://github.com/${e.repository}/settings/rules` : null);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-2 text-sm",
		children: [
			/* @__PURE__ */ b("p", { children: ql(e.inspect) }),
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
					/* @__PURE__ */ b(K, { children: "deprecated" }),
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
						children: /* @__PURE__ */ b(vr, {
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
function ip(e) {
	let { repository: t, choices: n } = e, i = l(), a = o(() => Kl(i), [i]), [s, u] = c("mode"), [d, m] = c(null), h = `avoozl-settings-repo-${e.index}`, g = (n) => e.onChange({
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
			error: q(e)
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
				segments: zf.map((e) => ({
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
				blurb: Bf.mode,
				children: [
					/* @__PURE__ */ x("p", {
						className: "text-xs text-muted",
						children: [
							"Workspace mode: ",
							/* @__PURE__ */ b("span", {
								className: "font-medium",
								style: { color: "var(--text)" },
								children: ap[Yl(e.mode)]
							}),
							". Change it under Where tasks live."
						]
					}),
					/* @__PURE__ */ x("div", {
						style: Ff(),
						children: [
							/* @__PURE__ */ b(Kf, {
								id: `${h}-name`,
								label: "Repository",
								raw: "key",
								rule: Bl.name,
								placeholder: "owner/name",
								value: t.name,
								onChange: (e) => g({ name: e })
							}),
							/* @__PURE__ */ b(Kf, {
								id: `${h}-base`,
								label: "Default branch",
								raw: "baseBranch",
								rule: Bl.baseBranch,
								placeholder: "main",
								width: "md",
								value: t.baseBranch,
								onChange: (e) => g({ baseBranch: e })
							}),
							/* @__PURE__ */ b(Kf, {
								id: `${h}-concurrency`,
								label: "Tasks at once",
								raw: "concurrency",
								rule: Bl.concurrency,
								placeholder: "1",
								type: "number",
								width: "sm",
								value: t.concurrency,
								onChange: (e) => g({ concurrency: e })
							})
						]
					}),
					/* @__PURE__ */ b(Gf, {
						id: `${h}-coder-worker`,
						label: "Who codes",
						raw: "coder",
						rule: Bl.coder,
						children: /* @__PURE__ */ b(ju, {
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
						blurb: Bf.triggers,
						children: [
							t.rules.length === 0 && /* @__PURE__ */ b("p", {
								className: "text-sm text-muted",
								children: "No rules yet, so labels start nothing. Add one to let a label start work."
							}),
							t.rules.map((r, i) => /* @__PURE__ */ b($f, {
								id: `${h}-rule-${i}`,
								rule: r,
								actions: n.actions,
								repository: y,
								workspaceId: e.workspaceId,
								onChange: (e) => _(i, e),
								onRemove: () => g({ rules: t.rules.filter((e, t) => t !== i) })
							}, i)),
							/* @__PURE__ */ b("div", { children: /* @__PURE__ */ b(f, {
								onClick: () => g({ rules: [...t.rules, Ml()] }),
								children: "Add rule"
							}) })
						]
					}),
					/* @__PURE__ */ b($, {
						level: "sub",
						title: "Managed labels",
						blurb: "Labels Avoozl itself adds and removes on issues to show their state. Don't edit them by hand: a hand edit shows as a conflict.",
						children: /* @__PURE__ */ b("div", {
							style: Ff(200),
							children: n.managedLabels.map((e) => /* @__PURE__ */ b(Kf, {
								id: `${h}-label-${e}`,
								label: Vl[e] ?? e,
								raw: `managedLabels.${e}`,
								rule: Bl[e],
								value: t.managedLabels[e] ?? "",
								onChange: (n) => g({ managedLabels: {
									...t.managedLabels,
									[e]: n
								} })
							}, e))
						})
					}),
					/* @__PURE__ */ b(Qf, {
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
							style: Ff(200),
							children: n.crewLabels.map((e) => /* @__PURE__ */ b(Kf, {
								id: `${h}-crew-${e}`,
								label: Hf[e] ?? e,
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
							children: [/* @__PURE__ */ b(qf, {
								id: `${h}-permission`,
								label: "Minimum permission",
								raw: "minimumPermission",
								rule: Bl.minimumPermission,
								value: t.minimumPermission,
								options: n.permissions,
								none: t.allowedActors.trim() ? "None" : "Default: write",
								width: "md",
								onChange: (e) => g({ minimumPermission: e })
							}), /* @__PURE__ */ b(Kf, {
								id: `${h}-actors`,
								label: "Or only these people",
								raw: "allowedActors",
								rule: Bl.allowedActors,
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
						children: /* @__PURE__ */ b(Kf, {
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
				blurb: Bf.checks,
				children: /* @__PURE__ */ b(np, {
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
					blurb: Bf.reviews,
					children: /* @__PURE__ */ b(rp, {
						inspect: d,
						repository: y,
						deprecated: t.pullRequestReviews,
						approvals: t.reviewApprovals,
						onDropDeprecated: () => g({
							pullRequestReviews: !1,
							reviewApprovals: ""
						})
					})
				}), /* @__PURE__ */ b(tp, {
					review: e.review,
					repository: y
				})]
			})
		]
	}) });
}
var ap = {
	local: "Local only",
	"plans-repo": "Plans repository",
	"single-repo": "Single repository"
};
function op({ crews: e }) {
	return e.length ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b($, {
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
function sp(e) {
	let { form: n, choices: r, set: i } = e, a = l(), u = o(() => Ot(a), [a]), d = fo(), f = t((e) => u.repositories(e), [u]), { value: m, reload: h } = fi(e.workspaceId, f), g = ao(m ?? [], n.repositories), [_, v] = c(null), [y, S] = c(null), [C, w] = c(null), [T, E] = c(!1), [D, O] = c(null), k = g.find((e) => e.key === _) ?? null, A = s(null), j = async (t) => {
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
					text: q(e)
				});
			} finally {
				E(!1);
			}
		}
	};
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(p, { children: /* @__PURE__ */ x($, {
				title: `Added repositories (${g.length})`,
				blurb: uo,
				children: [
					m === null ? /* @__PURE__ */ b("p", {
						className: "text-sm text-muted",
						children: "Loading…"
					}) : /* @__PURE__ */ b(mo, {
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
			k && y && /* @__PURE__ */ b(ho, {
				name: k.name,
				edited: JSON.stringify(Ll(n)) !== JSON.stringify(Ll(y)),
				missing: Hl(n),
				saving: e.saving,
				error: C,
				onDiscard: () => {
					e.replace(y), v(null), S(null);
				},
				onSave: async () => {
					w(null);
					let t = Hl(n);
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
					children: k && !Xl(n.mode) ? /* @__PURE__ */ b(cp, {
						row: k,
						review: e.review,
						kept: k.policy >= 0
					}) : k && k.policy >= 0 ? /* @__PURE__ */ b(ip, {
						index: k.policy,
						repository: n.repositories[k.policy],
						choices: r,
						review: e.review,
						mode: n.mode,
						workspaceId: e.workspaceId,
						onChange: (e) => i({ repositories: n.repositories.map((t, n) => n === k.policy ? e : t) })
					}, k.key) : k && k.github ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b($, {
						title: `${k.name} settings`,
						blurb: `${k.github} has no GitHub settings in .avoozl.json yet, so it uses the defaults.`,
						children: /* @__PURE__ */ x(Y, {
							icon: we,
							tooltip: "Add an entry you can change; saved when you press Save",
							onClick: () => {
								i({ repositories: [...n.repositories, {
									...Nl(k.github),
									baseBranch: k.branch
								}] });
							},
							children: ["Add GitHub settings for ", k.github]
						})
					}) }) : k ? /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b($, {
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
			/* @__PURE__ */ b(p, { children: /* @__PURE__ */ b("div", {
				ref: A,
				children: /* @__PURE__ */ b(vo, {
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
function cp(e) {
	let { row: t } = e;
	return /* @__PURE__ */ x(p, { children: [/* @__PURE__ */ x($, {
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
	}), /* @__PURE__ */ b(tp, {
		review: e.review,
		repository: t.github ?? t.name
	})] });
}
function lp(e) {
	let { form: t, choices: n, set: r } = e, i = Zl(t.mode), a = $l(t);
	return /* @__PURE__ */ b(p, { children: /* @__PURE__ */ b(Eu, {
		value: Yl(t.mode),
		onChange: (e) => r({ mode: e }),
		idPrefix: "avoozl-settings-mode",
		note: Xl(t.mode) ? null : /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-1.5 text-sm",
			"data-local-note": !0,
			children: [
				/* @__PURE__ */ b("p", { children: Ql }),
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
		children: Xl(t.mode) ? /* @__PURE__ */ x("div", {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ x("div", {
					style: Ff(),
					children: [
						i.has("planningRepository") && /* @__PURE__ */ b(Kf, {
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
						/* @__PURE__ */ b(qf, {
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
						/* @__PURE__ */ b(Kf, {
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
				/* @__PURE__ */ b(up, {
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
function up({ form: e, choices: t, set: n }) {
	return /* @__PURE__ */ b("div", { children: /* @__PURE__ */ x($, {
		level: "sub",
		title: "Project fields",
		blurb: "The GitHub Project board Avoozl adds managed issues to and fills with Release and Wave. Leave every field blank to turn Project sync off.",
		children: [
			/* @__PURE__ */ x("div", {
				style: Ff(180),
				children: [/* @__PURE__ */ b(Kf, {
					id: "avoozl-settings-project-owner",
					label: "Owner",
					raw: "project.owner",
					rule: Rl.owner,
					placeholder: "org or user",
					width: "md",
					value: e.projectOwner,
					onChange: (e) => n({ projectOwner: e })
				}), /* @__PURE__ */ b(Kf, {
					id: "avoozl-settings-project-number",
					label: "Number",
					raw: "project.number",
					rule: Rl.number,
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
				style: Ff(180),
				children: t.fields.map((t) => /* @__PURE__ */ b(Kf, {
					id: `avoozl-settings-field-${t}`,
					label: Vf[t] ?? t,
					raw: `project.fields.${t}`,
					rule: Rl[t],
					placeholder: zl[t] || "none",
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
				style: Ff(180),
				children: t.statusValues.map((t) => /* @__PURE__ */ b(Kf, {
					id: `avoozl-settings-status-${t}`,
					label: Uf[t] ?? t,
					raw: `project.statusValues.${t}`,
					rule: Rl[t],
					placeholder: zl[t],
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
function dp(e) {
	return {
		mode: e.mode,
		planningRepository: e.planningRepository,
		repositories: e.repositories.map((e) => e.name.trim()).filter(Boolean).join(", "),
		projectOwner: e.projectOwner,
		projectNumber: e.projectNumber
	};
}
function fp(e) {
	let { workspaceId: n, tab: i } = e, a = l(), s = o(() => ml(a), [a]), { value: u, error: d, busy: f, reload: p } = fi(n, t((e) => s.get(e), [s])), [m, h] = c(null), [g, _] = c(null), [v, y] = c(!1);
	r(() => {
		h(u ? Pl(u.github) : null), _(null);
	}, [u]);
	let S = (e) => m && h({
		...m,
		...e
	}), C = async () => {
		if (m) try {
			let e = await s.validate(n, Ll(m));
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
				text: q(e)
			});
		}
	}, w = async () => {
		if (!m || !u) return "Settings are not loaded.";
		let e = Hl(m);
		if (e) return _({
			ok: !1,
			text: `Not saved. ${e}`
		}), `Not saved. ${e}`;
		y(!0);
		try {
			return await s.save(n, Ll(m), u.hash), await p(), _({
				ok: !0,
				text: "Saved to .avoozl.json."
			}), null;
		} catch (e) {
			return _({
				ok: !1,
				text: q(e)
			}), q(e);
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
	let E = JSON.stringify(Ll(m)) !== JSON.stringify(Ll(Pl(u.github))), D = Hl(m);
	return /* @__PURE__ */ x("div", {
		className: "flex flex-col gap-3.5",
		children: [
			i === "github" && /* @__PURE__ */ b("p", {
				className: "text-sm text-muted",
				"data-blurb": "github",
				children: Xl(m.mode) ? Rf.github : "The mode for this workspace. Save only writes .avoozl.json."
			}),
			u.error && /* @__PURE__ */ x("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: ["The saved settings are invalid: ", u.error]
			}),
			i === "repositories" ? /* @__PURE__ */ b(sp, {
				form: m,
				choices: T,
				review: u.review,
				workspaceId: n,
				dirty: E,
				set: S,
				replace: h,
				onSave: w,
				saving: v,
				onRegistryChanged: p
			}) : /* @__PURE__ */ b(lp, {
				form: m,
				choices: T,
				set: S,
				setup: /* @__PURE__ */ b(Fu, {
					workspaceId: n,
					client: s,
					settings: u,
					shared: dp(m),
					onSaved: p
				}),
				crews: Zl(m.mode).has("issueRadarCrews") ? /* @__PURE__ */ b(op, { crews: u.crews ?? [] }) : null
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ b(Z, {
						tooltip: "Check these settings without saving them",
						onClick: () => void C(),
						disabled: v,
						children: "Check"
					}),
					/* @__PURE__ */ b(Z, {
						primary: !0,
						onClick: () => void w(),
						disabled: v || !E || !!D,
						tooltip: D,
						children: "Save"
					}),
					E ? /* @__PURE__ */ b(vr, {
						disabled: f || v,
						confirm: {
							title: "Discard your unsaved changes?",
							body: "Every edit since the last save on these Settings tabs is lost. .avoozl.json stays as it is.",
							action: "Discard changes"
						},
						onConfirm: () => void p(),
						children: "Discard changes"
					}) : /* @__PURE__ */ b(Z, {
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
function pp(e) {
	let { workspaceId: t } = e, [n, r] = c(ou), i = e.tab ?? n, a = Lf.some((e) => e.key === i) ? i : ou, o = (t) => e.onTab ? e.onTab(t) : r(t);
	return /* @__PURE__ */ x("section", {
		"aria-labelledby": "avoozl-settings-title",
		className: "flex flex-col gap-3.5",
		children: [
			/* @__PURE__ */ b(Tr, {
				id: "avoozl-settings-title",
				view: "settings",
				children: "Settings"
			}),
			/* @__PURE__ */ b(v, {
				layoutId: "avoozl-settings-tabs",
				ariaLabel: "Settings sections",
				segments: Lf.map((e) => ({
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
				children: Rf[a]
			}),
			a === "workspaces" ? /* @__PURE__ */ b(zu, {
				selected: t,
				onSelect: e.onSelectWorkspace,
				onListChange: e.onListChange
			}) : t ? a === "plugins" ? /* @__PURE__ */ b(Sd, { workspaceId: t }) : a === "content" ? /* @__PURE__ */ b(Tf, { workspaceId: t }) : a === "flow" ? /* @__PURE__ */ b(Nf, { workspaceId: t }) : /* @__PURE__ */ b(fp, {
				workspaceId: t,
				tab: a
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
var mp = [
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
		label: "Untriaged"
	},
	{
		key: "settings",
		label: "Settings"
	}
];
function hp() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function gp(e) {
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
function _p() {
	let e = l(), n = o(() => Ot(e), [e]), { openChat: i } = u(), a = o(() => Mt(hp()), []), [s, d] = c("dashboard"), [p, m] = c(ou), [g, y] = c(null), [S, C] = c(null), [w, T] = c(0), [E, D] = c(null), O = o(() => Bt(e), [e]), k = o(() => kc(e), [e]), [A, j] = c(a.workspaceId), [M, N] = c(null), [P, F] = c(null), I = t((e) => {
		N(e), j((t) => At(e, t));
	}, []);
	r(() => {
		n.list().then(I, (e) => F(q(e)));
	}, [n, I]), r(() => {
		Nt(hp(), { workspaceId: A });
	}, [A]);
	let L = () => {
		m("workspaces"), d("settings");
	}, R = M ? A : null, ee = s !== "settings" && !R, te = t((e, t) => {
		y(t ?? null), C(null), d(e);
	}, []), ne = t((e, t) => {
		R && cc(R, t), y(null), C(null), d(e);
	}, [R]), z = t((e) => {
		y(null), C(e), d("graph");
	}, []), B = (e) => {
		y(null), C(null), m((t) => su(s, e, t, Lf.map((e) => e.key))), d(e);
	};
	return r(() => {
		if (!R) return T(0);
		let e = !0, t = () => O.conflicts(R).then((t) => e && T(t.length), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		R,
		O,
		s
	]), r(() => {
		if (!R) return D(null);
		let e = !0, t = () => k.view(R).then((t) => e && D(t.enabled ? t.total : null), () => void 0);
		t();
		let n = setInterval(t, 6e4);
		return () => {
			e = !1, clearInterval(n);
		};
	}, [
		R,
		k,
		s
	]), r(() => {
		E === null && s === "untriaged" && d("dashboard");
	}, [E, s]), /* @__PURE__ */ b(_r, { children: /* @__PURE__ */ b(Rs, {
		workspaceId: R,
		onFocus: (e, t) => z({
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
						children: [/* @__PURE__ */ b(Ie, { size: 28 }), "Avoozl"]
					}),
					subtitle: "Plan work as a graph, then deliver ready tasks through Kiro Crew",
					actions: /* @__PURE__ */ x("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ b(gp, {
							list: M,
							value: A,
							onChange: j
						}), /* @__PURE__ */ b(f, {
							type: "button",
							primary: !0,
							onClick: () => i({
								message: Sa,
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
						segments: mp.filter((e) => e.key !== "untriaged" || E !== null).map((e) => ({
							key: e.key,
							label: e.key === "untriaged" && E ? /* @__PURE__ */ x("span", {
								className: "inline-flex items-center gap-1.5",
								"aria-label": `Untriaged, ${E} items`,
								children: [
									/* @__PURE__ */ b(Er, {
										view: "untriaged",
										children: "Untriaged"
									}),
									" ",
									/* @__PURE__ */ b(K, {
										variant: "info",
										children: E
									})
								]
							}) : e.key === "conflicts" && w > 0 ? /* @__PURE__ */ x("span", {
								className: "inline-flex items-center gap-1.5",
								"aria-label": `Conflicts, ${w} need you`,
								children: [
									/* @__PURE__ */ b(Er, {
										view: "conflicts",
										children: "Conflicts"
									}),
									" ",
									/* @__PURE__ */ b(K, {
										variant: "warning",
										children: w
									})
								]
							}) : /* @__PURE__ */ b(Er, {
								view: e.key,
								children: e.label
							})
						})),
						value: s,
						onChange: (e) => B(e),
						wrap: !0
					})
				}),
				P && /* @__PURE__ */ b("p", {
					role: "alert",
					className: "px-6 pb-2 text-sm text-danger",
					children: P
				}),
				/* @__PURE__ */ b("div", {
					className: "flex-1 min-h-0 overflow-y-auto px-6 pb-8",
					children: ee ? /* @__PURE__ */ b(h, {
						icon: /* @__PURE__ */ b(Ie, { size: 40 }),
						title: M ? M.items.length === 0 ? "No workspace yet" : "Pick a workspace" : "Loading workspaces…",
						subtitle: M?.items.length === 0 ? "Add or initialize a workspace in Settings. Every tab reads from it." : "Choose one in the header. Every tab reads from it.",
						action: M?.items.length === 0 ? /* @__PURE__ */ b(f, {
							type: "button",
							onClick: L,
							children: "Open Settings › Workspaces"
						}) : void 0
					}) : s === "dashboard" ? /* @__PURE__ */ b(rc, {
						workspaceId: R,
						untriaged: E,
						onNavigate: te,
						onScope: ne,
						onDrill: z
					}) : s === "plans" ? /* @__PURE__ */ b($a, {
						workspaceId: R,
						onScope: ne,
						onDrill: z
					}) : s === "graph" ? /* @__PURE__ */ b(bc, {
						workspaceId: R,
						focus: g,
						drill: S,
						onDrill: C
					}) : s === "delivery" ? /* @__PURE__ */ b(Dc, { workspaceId: R }) : s === "conflicts" ? /* @__PURE__ */ b(Ni, { workspaceId: R }) : s === "flow" ? /* @__PURE__ */ b(Os, { workspaceId: R }) : s === "untriaged" ? /* @__PURE__ */ b(pl, { workspaceId: R }) : /* @__PURE__ */ b(pp, {
						workspaceId: R,
						tab: p,
						onTab: m,
						onSelectWorkspace: (e) => e && j(e),
						onListChange: I
					})
				})
			]
		})
	}) });
}
export { _p as default };
