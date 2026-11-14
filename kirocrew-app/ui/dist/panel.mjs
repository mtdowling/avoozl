import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { Badge as l, Btn as u, Input as d } from "@kirocrew/app-sdk/ui";
import { Fragment as f, jsx as p, jsxs as m } from "react/jsx-runtime";
import { useAppApi as h, useChatLauncher as g, useNavigate as _ } from "@kirocrew/app-sdk";
import { Pause as v } from "lucide-react";
import { createPortal as y } from "react-dom";
// kirocrew-app/ui/src/Badge.tsx
var b = {
	success: { variant: "ok" },
	warning: { variant: "warn" },
	danger: { variant: "err" },
	info: {
		variant: "muted",
		className: "bg-accent-subtle text-accent"
	},
	wave: { variant: "aim" }
};
function x(e) {
	return e && b[e] || { variant: "muted" };
}
function S({ variant: e, children: t }) {
	let n = x(e);
	return /* @__PURE__ */ p(l, {
		variant: n.variant,
		className: n.className,
		children: t
	});
}
// kirocrew-app/ui/src/workspace-api.ts
var C = "/apps/avoozl/api/command";
function w(e) {
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
function T(e) {
	let t = async (t, n = {}, r) => (await e.post(C, {
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
function E(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/demo-api.ts
var D = "@demo", O = "Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.";
function k(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function A(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function ee(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function te(e, t) {
	let n = (e) => e.catch((e) => {
		let n = ee(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = A(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => k("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => k("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!k("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: j }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var j = {
	defaultWorkspace: D,
	items: [{
		id: D,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, ne = e({
	active: !1,
	notice: () => void 0
}), re = () => n(ne);
function ie() {
	let e = h(), { active: t, notice: n } = re();
	return o(() => t ? te(e, n) : e, [
		e,
		t,
		n
	]);
}
function ae() {
	let e = g(), { active: t, notice: n } = re(), r = e.openChat;
	return o(() => t ? { openChat: () => n(O) } : { openChat: r }, [
		t,
		n,
		r
	]);
}
e({
	openTask: () => void 0,
	addTask: () => void 0,
	openReview: () => void 0,
	close: () => void 0
});
function M(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var N = null;
function P(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), N === o && (N = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), N && N !== o && N(), N = o, i || (i = !0, e.onChange(!0));
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
var F = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function oe(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function I(e, t, n) {
	return e === 0 ? -1 : t < 0 ? n ? e - 1 : 0 : n ? (t - 1 + e) % e : (t + 1) % e;
}
Object.freeze([
	["ready", "Ready"],
	["running", "Running"],
	["reviewing", "Reviewing"],
	["needs-you", "Needs you"],
	["waiting", "Blocked or waiting"],
	["done", "Done"],
	["deferred", "Deferred"]
]);
// kirocrew-app/ui/src/graph-layout.ts
var L = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
};
L.nodeWidth, L.nodeHeight, L.columnGap, L.rowGap, L.margin, L.clusterLabel, L.clusterGap;
// kirocrew-app/ui/src/nav-history.ts
var R = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), z = (e) => R.has(e);
function B(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function se() {
	let e = [], t = 1, n = () => {
		let t = B(e, (e) => e.kind === "tab");
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
			let t = B(e, (e) => z(e.kind));
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
				let t = B(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function ce(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var V = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function H(e = V) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: se(),
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
		restoreScroll: (t) => void e(() => ce(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
// kirocrew-app/ui/src/NavHistory.tsx
var U = "data-avoozl-app", le = e(null), ue = null, de = () => n(le) ?? (ue ??= H());
function fe(e, t, n, i, a) {
	let o = de(), c = s({
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
// kirocrew-app/ui/src/Modal.tsx
var W = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", G = "color-mix(in srgb, var(--text) 30%, transparent)", pe = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)"
}, K = [], q = null;
function J() {
	q || (q = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function me() {
	!K.length && q && (document.documentElement.style.overflow = q.html, document.body.style.overflow = q.body, q = null);
}
var he = e(null), ge = () => n(he);
function _e(e) {
	let n = Ce(), r = oe("(max-width: 767px)"), i = s(null), o = s(null), [l, u] = c(null), d = s(e);
	d.current = e;
	let h = s(!1), g = t(() => {
		let { unsaved: e, onDismiss: t } = d.current;
		if (!e) return t();
		h.current || (h.current = !0, n(e).then((e) => {
			h.current = !1, e && d.current.onDismiss();
		}));
	}, [n]);
	fe(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", g), a(() => {
		let e = i.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), K.push(t), J(), u(e), (o.current?.querySelector(W) ?? o.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || K.at(-1) !== t || !o.current) return;
			let n = [...o.current.querySelectorAll(W)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = I(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), K.splice(K.indexOf(t), 1), me(), e.open && e.close(), n?.isConnected && n.focus();
		};
	}, []);
	let _ = e.title !== void 0, v = r ? {
		width: "100%",
		height: "100%",
		maxHeight: "none",
		borderRadius: 0
	} : _ || e.height ? {
		width: `min(${e.width ?? "64rem"}, 94vw)`,
		height: `min(${e.height ?? "52rem"}, 90vh)`,
		borderRadius: 10
	} : {
		width: `min(${e.width ?? "36rem"}, 94vw)`,
		maxHeight: "88vh",
		borderRadius: 10
	}, b = _ || e.plain ? "relative flex flex-col overflow-hidden border shadow-lg outline-none" : "relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none";
	return y(/* @__PURE__ */ m("dialog", {
		ref: i,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? "full" : _ ? "large" : "box",
		[U]: "",
		...e.attrs,
		onCancel: (e) => {
			e.preventDefault(), g();
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
		children: [/* @__PURE__ */ p("style", { children: "dialog[data-modal]::backdrop{background:transparent}" }), /* @__PURE__ */ m("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ p("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: g,
				style: {
					position: "absolute",
					inset: 0,
					background: G
				}
			}), /* @__PURE__ */ p("div", {
				ref: (t) => {
					o.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				tabIndex: -1,
				className: b,
				style: {
					...pe,
					...v,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ p(he.Provider, {
					value: l,
					children: _ ? /* @__PURE__ */ m(f, { children: [
						/* @__PURE__ */ p("h3", {
							id: `${e.id}-title`,
							className: "border-b px-4 py-3 text-lg font-semibold",
							style: { borderColor: "var(--border)" },
							children: e.title
						}),
						/* @__PURE__ */ p("div", {
							className: "min-h-0 flex-1 overflow-y-auto p-4",
							children: e.children
						}),
						e.footer && /* @__PURE__ */ p("div", {
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
var ve = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, ye = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function be(e) {
	let t = i(), n = ge(), l = s(null), u = s(null), [d, h] = c(!1), [g, _] = c(null), v = o(() => P({ onChange: h }), []);
	r(() => v.hide, [v]), r(() => {
		if (!d) return;
		let e = (e) => v.key(e.key), t = () => v.hide();
		return document.addEventListener("keydown", e), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [d, v]), a(() => {
		if (!d || !l.current || !u.current) return _(null);
		let e = l.current.getBoundingClientRect(), t = u.current.getBoundingClientRect();
		_(M(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [d, e.text]);
	let b = e.text?.trim(), x = typeof e.children == "function" ? e.children(b ? t : void 0) : e.children;
	return b ? /* @__PURE__ */ m("span", {
		ref: l,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => v.enter(e.pointerType),
		onPointerLeave: v.leave,
		onPointerDown: v.hide,
		onFocus: (e) => v.focus(ye(e.target)),
		onBlur: v.blur,
		"data-tooltip-anchor": !0,
		children: [
			x,
			/* @__PURE__ */ p("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: b
			}),
			d && y(/* @__PURE__ */ m("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": g?.side,
				style: {
					position: "fixed",
					top: g?.top ?? 0,
					left: g?.left ?? 0,
					visibility: g ? "visible" : "hidden",
					zIndex: F.tooltip,
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
					animation: ve() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ p("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					b,
					g && /* @__PURE__ */ p("span", {
						"aria-hidden": "true",
						style: {
							position: "absolute",
							left: g.arrow - 4,
							[g.side === "top" ? "bottom" : "top"]: -5,
							width: 8,
							height: 8,
							transform: "rotate(45deg)",
							background: "var(--bg-elevated, var(--card))",
							borderRight: g.side === "top" ? "1px solid var(--border)" : void 0,
							borderBottom: g.side === "top" ? "1px solid var(--border)" : void 0,
							borderLeft: g.side === "bottom" ? "1px solid var(--border)" : void 0,
							borderTop: g.side === "bottom" ? "1px solid var(--border)" : void 0
						}
					})
				]
			}), n ?? document.body)
		]
	}) : /* @__PURE__ */ p(f, { children: x });
}
// kirocrew-app/ui/src/controls.tsx
var xe = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Se = e(async () => !1), Ce = () => n(Se);
function we({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ m(Se.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ m(_e, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			children: [
				/* @__PURE__ */ p("h3", {
					id: "avoozl-confirm-title",
					className: "text-base font-semibold",
					children: n.title
				}),
				/* @__PURE__ */ p("p", {
					id: "avoozl-confirm-body",
					className: "text-sm text-muted",
					children: n.body
				}),
				/* @__PURE__ */ m("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ p(u, {
						ref: a,
						type: "button",
						onClick: () => l(!1),
						children: "Cancel"
					}), /* @__PURE__ */ p(u, {
						type: "button",
						"data-danger": !0,
						onClick: () => l(!0),
						style: xe,
						children: n.action
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/views-api.ts
function Te(e) {
	let t = async (t, n, r, i) => (await e.post(C, {
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
		remote: (e) => t("remote.view", {}, e),
		epic: (e, n) => t("epic.get", { id: n }, e),
		delivery: (e) => t("delivery.view", {}, e).then((e) => e.items),
		deliveryPage: (e) => t("delivery.view", {}, e),
		supersede: (e, n, r) => t("task.supersede", {
			id: n,
			create: r
		}, e),
		conflicts: (e) => t("conflicts.view", {}, e).then((e) => e.items),
		radarCrews: (e) => t("radar.crews", {}, e),
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
		decideInvestigation: (e, n, r) => t("investigation.decide", {
			taskId: n,
			action: r
		}, e),
		integrate: (e, n, r) => t("delivery.integrate", {
			taskId: n,
			...r ? { commit: r } : {}
		}, e),
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
function Ee(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var De = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function Y(e) {
	return typeof e == "string" && De.test(e) ? e : Ee(e) ?? void 0;
}
// kirocrew-app/ui/src/dashboard-api.ts
var Oe = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function ke(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Oe.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/flow-api.ts
function Ae(e) {
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
var je = "avoozl:line-changed", Me = () => {
	typeof window < "u" && window.dispatchEvent(new Event(je));
};
function Ne(e) {
	let t = (t, n, r = {}) => e.post(C, {
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
		models: () => e.get("/api/models").then(Ae),
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
function Pe(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var Fe = [
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
], Ie = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], Le = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", Re = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function ze(e) {
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
function Be(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${Pe(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/panel-chat.ts
function Ve(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function He(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${Ue(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") ? { kind: "avoozl" } : { kind: "other" };
}
var Ue = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function We(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/panel-api.ts
var Ge = 3e4;
function Ke(e, t) {
	let n = !1, r = !0, i = async () => {
		if (r && !n) {
			n = !0;
			try {
				await e();
			} catch {} finally {
				n = !1;
			}
		}
	}, a = () => t.doc.visibilityState !== "hidden", o = () => a() && void i(), s = () => a() && void i(), c = t.setTimer(o, t.intervalMs);
	return t.win.addEventListener("focus", s), t.doc.addEventListener("visibilitychange", s), i(), () => {
		r = !1, t.clearTimer(c), t.win.removeEventListener("focus", s), t.doc.removeEventListener("visibilitychange", s);
	};
}
var qe = /* @__PURE__ */ new Set([
	"needs-human",
	"github-conflict",
	"tracker-conflict",
	"review",
	"ready-to-merge",
	"branch-landing",
	"content-match",
	"content-unavailable"
]), Je = {
	"needs-human": "Needs you",
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit",
	review: "Review",
	"ready-to-merge": "Ready to merge",
	"branch-landing": "Ready to land",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function Ye(e) {
	if (!qe.has(e.kind) || e.kind === "needs-human" && e.reason === "hand-set-review" || e.kind === "ready-to-merge" && e.integrate) return null;
	let t = [], n = Y(e.link) ?? Y(e.issue?.url);
	if (e.kind === "github-conflict" && e.taskId && e.field) for (let n of e.choices ?? []) t.push({
		kind: "resolve",
		label: n === "desired" ? "Keep Avoozl's" : "Keep GitHub's",
		taskId: e.taskId,
		field: e.field,
		choice: n
	});
	else e.kind === "branch-landing" && e.repository && e.branch && e.head ? t.push({
		kind: "land",
		label: "Land it",
		repository: e.repository,
		branch: e.branch,
		head: e.head
	}) : n && t.push({
		kind: "link",
		label: e.kind === "ready-to-merge" ? `Open PR${e.pullRequest ? ` #${e.pullRequest}` : ""}` : "Open issue",
		href: n
	});
	return {
		key: `${e.kind}:${e.taskId ?? e.id ?? ""}:${e.field ?? ""}:${e.branch ?? ""}`,
		kind: e.kind,
		label: Je[e.kind] ?? e.kind,
		title: e.title,
		detail: e.detail,
		actions: t
	};
}
function Xe(e) {
	return {
		key: `radar:${e.repository}#${e.number}`,
		source: "radar",
		title: e.title,
		ref: `${e.repository}#${e.number}`,
		who: e.crewName ?? e.crewId ?? "no crew named",
		phase: e.phase,
		stale: e.stale,
		issueUrl: Y(e.url) ?? null,
		prUrl: Y(e.prUrl) ?? null,
		prNumber: e.pr,
		attach: e.crewId ? `/chat?sid=crew-${encodeURIComponent(e.crewId)}` : null,
		noAttach: e.crewId ? null : "The claim names no crew.",
		pr: !!e.pr,
		updated: e.updated
	};
}
function Ze(e) {
	let t = Y(e.attachUrl) ?? null;
	return {
		key: `remote:${e.host}:${e.chatKey}`,
		source: "remote",
		title: e.taskId,
		ref: e.taskId,
		who: `${e.host}, crew ${e.crewId}`,
		phase: e.status ?? e.state,
		stale: e.stale,
		issueUrl: null,
		prUrl: null,
		prNumber: null,
		attach: t,
		noAttach: t ? null : `Set the dashboard link for ${e.host} to attach.`,
		pr: !1,
		updated: e.updatedAt || null
	};
}
function Qe(e) {
	let t = [];
	e.conflicts || t.push("waiting"), !e.crews && !e.remote && t.push("inFlight"), e.queue || t.push("queue"), e.flow || t.push("recent");
	let n = (e.conflicts ?? []).map(Ye).filter((e) => e !== null), r = [...(e.crews?.rows ?? []).map(Xe), ...(e.remote ?? []).map(Ze)], i = null;
	if (e.queue) {
		let t = e.queue.repositories.flatMap((e) => e.rows.map((t) => ({
			repo: e,
			row: t
		})));
		i = {
			head: t.filter((e) => e.row.state === "next").slice(0, 3).map(({ repo: e, row: t }) => ({
				taskId: t.taskId,
				title: t.title,
				repository: e.repository,
				reason: t.reason
			})),
			held: t.filter((e) => e.row.state === "held").length,
			mode: e.queue.repositories[0]?.mode ?? null
		};
	}
	let a = (e.flow?.tasks ?? []).filter((e) => e.finishedAt).sort((e, t) => String(t.finishedAt).localeCompare(String(e.finishedAt))).slice(0, 5).map((e) => ({
		taskId: e.taskId,
		title: e.title,
		repository: e.repository,
		at: String(e.finishedAt)
	})), o = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(Be);
	return {
		waiting: n,
		inFlight: r,
		queue: i,
		recent: a,
		stops: o,
		unread: t
	};
}
function $e(e) {
	return e?.state === "running" ? {
		state: "running",
		link: e.link ?? null,
		note: null
	} : {
		state: "not-started",
		link: null,
		note: "No driver session is open. While none runs, nothing is released and nobody watches merges. Crews already working keep going."
	};
}
var et = "Be the Avoozl driver session for this workspace. Release ready work in graph order, watch merges, and hand me the decisions that need a person. Check Avoozl before each step and do not merge anything yourself.";
// kirocrew-app/ui/src/plans-api.ts
function tt(e) {
	let t = async (t, n, r = {}) => (await e.post(C, {
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
// kirocrew-app/ui/src/release-api.ts
function nt(e) {
	let t = async (t, n, r) => (await e.post(C, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		queue: (e) => t("radar.releasequeue", {}, e),
		armed: (e) => t("radar.armed", {}, e),
		disarm: (e, n, r) => t("radar.disarm", {
			repository: n,
			pullRequest: r
		}, e),
		branches: (e) => t("integration.view", {}, e),
		land: (e, n, r, i) => t("integration.land", {
			repository: n,
			branch: r,
			head: i
		}, e),
		drafts: (e, n = {}) => t("review.drafts", Object.fromEntries(Object.entries(n).filter(([, e]) => e)), e),
		step: (e, n) => t("radar.releasestep", { planId: n }, e)
	};
}
// kirocrew-app/ui/src/spec-builder-api.ts
var rt = "/api/apps/spec-builder/specs", it = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function at(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function ot(e, t, n = 50) {
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
function st(e, t, n) {
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
var ct = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function lt(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => at(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = d && u ? ct(d) : "", [h, g] = c(f), [_, v] = c(!1), [y, b] = c(!1), [x, S] = c(0), C = s(null);
	r(() => {
		_ || g(f);
	}, [f, _]);
	let { shown: w, total: T } = o(() => ot(l, _ ? h : ""), [
		l,
		h,
		_
	]);
	r(() => {
		C.current?.querySelector(`#${CSS.escape(`${n}-opt-${x}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [x, n]);
	let E = (t) => {
		e.onPick(t.id), v(!1), b(!1), g(u ? ct(t) : "");
	}, D = (t) => {
		let n = st({
			open: y,
			active: x
		}, t.key, w.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (b(!0), S(n.state.active)) : n.kind === "pick" ? E(w[n.index]) : n.kind === "close" ? b(!1) : (g(""), v(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, O = y && (w.length > 0 || _);
	return /* @__PURE__ */ m("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ p("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ p("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": O,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": O && w.length ? `${n}-opt-${x}` : void 0,
				autoComplete: "off",
				spellCheck: !1,
				value: h,
				placeholder: e.value ? void 0 : e.emptyLabel ?? e.placeholder,
				onChange: (e) => {
					g(e.target.value), v(!0), b(!0), S(0);
				},
				onFocus: () => {
					b(!0), S(0);
				},
				onBlur: () => {
					b(!1), _ && !h.trim() && e.emptyLabel !== void 0 && e.value && e.onPick(""), v(!1);
				},
				onKeyDown: D,
				className: "rounded border px-2 py-1 text-sm",
				style: it,
				"data-picker": !0
			}),
			/* @__PURE__ */ m("div", {
				hidden: !O,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: F.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ p("ul", {
						ref: C,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: w.map((e, t) => /* @__PURE__ */ m("li", {
							id: `${n}-opt-${t}`,
							role: "option",
							"aria-selected": t === x,
							onMouseDown: (t) => {
								t.preventDefault(), E(e);
							},
							onMouseEnter: () => S(t),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: t === x ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								/* @__PURE__ */ p("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.id
								}),
								/* @__PURE__ */ p("span", {
									className: "min-w-0 flex-1 truncate",
									children: e.title === e.id ? "" : e.title
								}),
								e.spec && /* @__PURE__ */ p("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.spec
								}),
								e.state && /* @__PURE__ */ p("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: e.state
								})
							]
						}, e.id))
					}),
					T === 0 && /* @__PURE__ */ p("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					T > w.length && /* @__PURE__ */ m("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [T - w.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var ut = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), dt = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function ft() {
	return /* @__PURE__ */ p("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function pt(e) {
	return /* @__PURE__ */ m("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ p("style", { children: dt }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ m("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ m("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ p("input", {
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
					}), /* @__PURE__ */ m("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ m("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ p(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ p("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ p("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ m("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ p(ft, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var mt = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, ht = {
	...mt,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, gt = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, _t = 6e4;
function vt(e) {
	let t = ie(), n = o(() => Ne(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, _t);
		return window.addEventListener(je, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(je, r);
		};
	}, [n, e]), i;
}
function yt(e) {
	let [t, n] = c(!1), r = vt(e.workspaceId);
	if (!e.workspaceId) return null;
	let i = r.length > 0, a = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; ");
	return /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p(be, {
		text: i ? `The line is stopped: ${a}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (e) => /* @__PURE__ */ m(u, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": e,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: i ? ht : mt,
			children: [/* @__PURE__ */ p(v, {
				size: 14,
				"aria-hidden": "true",
				style: i ? { color: "var(--danger)" } : void 0
			}), i ? "Line stopped" : "Stop the line"]
		})
	}), t && /* @__PURE__ */ p(bt, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), Me(), e.onPulled?.();
		}
	})] });
}
function bt(e) {
	let n = ie(), i = o(() => Ne(n), [n]), [a, l] = c(Re), [f, h] = c(null), [g, _] = c(null), [y, b] = c(!1), x = Ce(), S = s(null), C = (e) => l((t) => ({
		...t,
		...e
	})), E = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			T(n).repositories(r),
			tt(n).stored(r),
			Te(n).graph(r)
		]).then(([e, n, r]) => {
			t && h({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? ut(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		S.current?.querySelector("input, button")?.focus();
	}, []);
	let D = async () => {
		let { input: t, error: n } = ze(a);
		if (!t) return _(n ?? null);
		if (!t.full || await x({
			title: "Stop all agents?",
			body: "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.",
			action: "Stop all agents"
		})) {
			b(!0), _(null);
			try {
				await i.stop(e.workspaceId, t), e.onPulled();
			} catch (e) {
				_(w(e));
			} finally {
				b(!1);
			}
		}
	}, O = (e) => /* @__PURE__ */ p("p", {
		className: "text-sm text-muted",
		children: f ? e : "Reading…"
	}), k = (e) => /* @__PURE__ */ m("span", { children: [
		e,
		" ",
		/* @__PURE__ */ p("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), A = (e, t, n, r, i) => n.length ? /* @__PURE__ */ p(lt, {
		label: k(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : O(i), ee = {
		all: null,
		repo: f?.repositories.length ? /* @__PURE__ */ m("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [k("Repository"), /* @__PURE__ */ m("select", {
				value: a.repository,
				onChange: (e) => C({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: gt,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ p("option", {
					value: "",
					children: "Choose…"
				}), f.repositories.map((e) => /* @__PURE__ */ p("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : O("No repository is registered."),
		spec: A("Spec", a.spec, f?.specs ?? [], (e) => C({ spec: e }), "No spec is stored yet."),
		task: A("Task", a.taskId, f?.tasks ?? [], (e) => C({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ m(_e, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: S,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(Re()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		onDismiss: E,
		children: [
			/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ m("h3", {
				id: "avoozl-stop-title",
				className: "flex items-center gap-1.5 text-base font-semibold",
				children: [/* @__PURE__ */ p(v, {
					size: 14,
					"aria-hidden": "true",
					style: { color: "var(--danger)" }
				}), "Stop the line"]
			}), /* @__PURE__ */ p("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			})] }),
			/* @__PURE__ */ p(pt, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => C({ kind: e }),
				sections: Ie.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ p("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: Le
					}) } : { fields: /* @__PURE__ */ p(pt, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => C({ scope: e }),
						sections: Fe.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: ee[e.value]
						}))
					}) }
				}))
			}),
			/* @__PURE__ */ m("label", {
				className: "flex flex-col gap-1 text-sm",
				children: [
					/* @__PURE__ */ m("span", { children: ["Reason ", /* @__PURE__ */ p("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ p(d, {
						value: a.reason,
						maxLength: 200,
						placeholder: "The base is broken; looking into it",
						onChange: (e) => C({ reason: e.target.value }),
						"data-stop-reason": !0
					}),
					/* @__PURE__ */ p("span", {
						className: "text-xs text-muted",
						children: "One line. It shows on the banner and in Flow."
					})
				]
			}),
			g && /* @__PURE__ */ p("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: g
			}),
			/* @__PURE__ */ m("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [/* @__PURE__ */ p(u, {
					type: "button",
					onClick: E,
					children: "Cancel"
				}), /* @__PURE__ */ m(u, {
					type: "button",
					"data-danger": !0,
					"data-stop-confirm": !0,
					onClick: () => void D(),
					disabled: y,
					style: mt,
					children: [/* @__PURE__ */ p(v, {
						size: 14,
						"aria-hidden": "true"
					}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/task-api.ts
function xt(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
// kirocrew-app/ui/src/Panel.tsx
var St = "/apps/avoozl";
function Ct() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var X = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, Z = (e, t, n) => {
	let r = /* @__PURE__ */ p("a", {
		href: Y(e),
		target: "_blank",
		rel: "noreferrer",
		className: "text-sm underline",
		children: t
	}, t + e);
	return n ? /* @__PURE__ */ p(be, {
		text: n,
		children: r
	}, t + e) : r;
};
function Q(e) {
	return /* @__PURE__ */ m("details", {
		"data-panel-fold": e.id,
		open: e.open,
		className: "rounded-md border",
		style: {
			border: "1px solid var(--border)",
			borderRadius: 8
		},
		children: [/* @__PURE__ */ m("summary", {
			className: "flex cursor-pointer items-center gap-2 px-3 py-2 font-medium",
			style: {
				display: "flex",
				gap: 8,
				alignItems: "center",
				cursor: "pointer",
				padding: "8px 12px"
			},
			children: [e.count !== void 0 && e.count > 0 && /* @__PURE__ */ p(S, {
				variant: e.warn ? "warning" : "info",
				children: e.count
			}), e.title]
		}), /* @__PURE__ */ p("div", {
			className: "px-3 pb-3",
			style: { padding: "0 12px 12px" },
			children: e.children
		})]
	});
}
var $ = (e) => /* @__PURE__ */ p("p", {
	className: "m-0 text-muted",
	role: e.role,
	style: { margin: 0 },
	children: e.children
});
function wt(e) {
	return /* @__PURE__ */ p("ul", {
		className: "m-0 list-none p-0",
		style: {
			margin: 0,
			padding: 0,
			listStyle: "none",
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: e.rows.map((t) => /* @__PURE__ */ m("li", {
			"data-waiting-row": t.kind,
			children: [
				/* @__PURE__ */ p(S, {
					variant: "warning",
					children: t.label
				}),
				" ",
				/* @__PURE__ */ p("span", {
					className: "font-medium",
					children: t.title
				}),
				/* @__PURE__ */ p("span", {
					className: "block text-xs text-muted",
					style: { display: "block" },
					children: t.detail
				}),
				/* @__PURE__ */ p("span", {
					className: "flex flex-wrap gap-2",
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginTop: 4
					},
					children: t.actions.map((n) => n.kind === "link" ? Z(n.href, n.label) : /* @__PURE__ */ p(u, {
						type: "button",
						disabled: e.busy === t.key,
						onClick: () => e.onAct(t, n),
						children: n.label
					}, n.label))
				})
			]
		}, t.key))
	});
}
function Tt({ rows: e, now: t }) {
	return /* @__PURE__ */ p("ul", {
		className: "m-0 list-none p-0",
		style: {
			margin: 0,
			padding: 0,
			listStyle: "none",
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: e.map((e) => /* @__PURE__ */ m("li", {
			"data-flight-row": e.source,
			children: [
				/* @__PURE__ */ p(S, { children: e.source === "radar" ? "Issue Radar" : "Remote coder" }),
				" ",
				/* @__PURE__ */ p("span", {
					className: "font-medium",
					children: e.title
				}),
				" ",
				/* @__PURE__ */ p("span", {
					className: "text-xs text-muted",
					children: e.ref
				}),
				e.stale && /* @__PURE__ */ m(f, { children: [" ", /* @__PURE__ */ p(S, {
					variant: "warning",
					children: "Stale"
				})] }),
				/* @__PURE__ */ m("span", {
					className: "block text-xs text-muted",
					style: { display: "block" },
					children: [
						e.who,
						" · ",
						e.phase ?? "claim label, no claim comment",
						e.updated ? ` · updated ${xt(e.updated, t)}` : ""
					]
				}),
				/* @__PURE__ */ m("span", {
					className: "flex flex-wrap gap-2",
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8
					},
					children: [
						e.attach && Z(e.attach, "Attach", e.source === "radar" ? "Opens here only if this crew runs on this machine." : void 0),
						e.issueUrl && Z(e.issueUrl, "Issue"),
						e.prUrl && Z(e.prUrl, `PR #${e.prNumber}`),
						!e.attach && e.noAttach && /* @__PURE__ */ p("span", {
							className: "text-xs text-muted",
							children: e.noAttach
						})
					]
				})
			]
		}, e.key))
	});
}
function Et() {
	let e = ie(), n = _(), { openChat: i } = ae(), [a, l] = c(E(Ct()).workspaceId), [d, h] = c([]), [g, v] = c([]), [y, b] = c({}), [x, C] = c(null), [D, O] = c(null), [k, A] = c(null), [ee, te] = c(null), [j, ne] = c(() => Date.now()), re = o(() => Ve(window.location), []), M = o(() => tt(e), [e]), N = o(() => Te(e), [e]), P = o(() => nt(e), [e]), F = o(() => Ne(e), [e]), oe = s(a), I = t(async () => {
		let t = oe.current;
		try {
			t || (t = (await T(e).list()).defaultWorkspace, oe.current = t, l(t));
		} catch (e) {
			O(w(e));
			return;
		}
		if (!t) return;
		let n = (e) => e.then((e) => e, () => null), [r, i, a, o, s, c, u] = await Promise.all([
			n(N.conflicts(t)),
			n(N.radarCrews(t)),
			n(N.remote(t).then((e) => e.workers)),
			n(P.queue(t)),
			n(F.view(t, { window: "10" })),
			e.get(rt).catch(() => ({ specs: [] })),
			n(M.specs(t))
		]);
		O(null), b({
			conflicts: r,
			crews: i,
			remote: a,
			queue: o,
			flow: s
		}), C(i), h((c.specs ?? []).map((e) => e.name)), u && v(u.items), ne(Date.now());
	}, [
		e,
		F,
		M,
		P,
		N
	]);
	r(() => Ke(I, {
		intervalMs: Ge,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [I]);
	let L = o(() => Qe(y), [y]), R = He(re, { specs: d }), z = R.kind === "spec-builder" ? g.find((e) => e.name === R.spec) : void 0, B = async (e, t) => {
		if (a && t.kind !== "link") {
			te(e.key);
			try {
				t.kind === "resolve" ? await N.resolveConflict(a, t.taskId, t.field, t.choice) : await P.land(a, t.repository, t.branch, t.head), A(null), await I();
			} catch (e) {
				A(w(e));
			} finally {
				te(null);
			}
		}
	}, se = async () => {
		if (a && z?.plan && z.hash) try {
			await M.approve(a, z.plan.id, z.hash), A("Approved this revision for Avoozl."), await I();
		} catch (e) {
			A(w(e));
		}
	}, ce = async () => {
		if (a && z) try {
			await M.store(a, z.name), A("Stored as a draft. Review it in Specs, then approve."), await I();
		} catch (e) {
			A(w(e));
		}
	}, V = (e) => L.unread.includes(e), H = Object.keys(y).length === 0, U = L.stops.length > 0, le = /* @__PURE__ */ m(Q, {
		id: "waiting",
		title: "Waiting on you",
		count: L.waiting.length,
		warn: !0,
		open: !0,
		children: [V("waiting") ? /* @__PURE__ */ p($, { children: H ? "Loading…" : X.waiting }) : L.waiting.length === 0 ? /* @__PURE__ */ p($, { children: "Nothing is waiting on you." }) : /* @__PURE__ */ p(wt, {
			rows: L.waiting.slice(0, 5),
			busy: ee,
			onAct: (e, t) => void B(e, t)
		}), L.waiting.length > 5 && /* @__PURE__ */ m(u, {
			type: "button",
			onClick: () => n(St),
			children: ["Show all ", L.waiting.length]
		})]
	}), ue = /* @__PURE__ */ m(Q, {
		id: "in-flight",
		title: "In flight",
		count: L.inFlight.length,
		open: !0,
		children: [V("inFlight") ? /* @__PURE__ */ p($, { children: H ? "Loading…" : X.inFlight }) : L.inFlight.length === 0 ? /* @__PURE__ */ p($, { children: "No crew has a claim right now." }) : /* @__PURE__ */ p(Tt, {
			rows: L.inFlight,
			now: j
		}), x && x.stale > 0 && /* @__PURE__ */ m($, { children: [
			x.stale,
			" stale claim",
			x.stale === 1 ? "" : "s",
			"."
		] })]
	}), de = /* @__PURE__ */ p(Q, {
		id: "queue",
		title: "Release queue",
		count: L.queue?.head.length,
		children: V("queue") || !L.queue ? /* @__PURE__ */ p($, { children: H ? "Loading…" : X.queue }) : L.queue.head.length === 0 ? /* @__PURE__ */ p($, { children: L.queue.held ? `Nothing is next. ${L.queue.held} held.` : "Nothing is next in the queue." }) : /* @__PURE__ */ p("ul", {
			className: "m-0 list-none p-0",
			style: {
				margin: 0,
				padding: 0,
				listStyle: "none"
			},
			children: L.queue.head.map((e) => /* @__PURE__ */ m("li", {
				"data-queue-head": !0,
				children: [
					/* @__PURE__ */ p("span", {
						className: "font-medium",
						children: e.title
					}),
					" ",
					/* @__PURE__ */ p("span", {
						className: "text-xs text-muted",
						children: e.taskId
					}),
					/* @__PURE__ */ m("span", {
						className: "block text-xs text-muted",
						style: { display: "block" },
						children: [
							e.repository,
							" · ",
							e.reason
						]
					})
				]
			}, e.taskId))
		})
	}), fe = /* @__PURE__ */ p(Q, {
		id: "recent",
		title: "Recent merges",
		count: L.recent.length,
		children: V("recent") ? /* @__PURE__ */ p($, { children: H ? "Loading…" : X.recent }) : L.recent.length === 0 ? /* @__PURE__ */ p($, { children: "Nothing finished lately." }) : /* @__PURE__ */ p("ul", {
			className: "m-0 list-none p-0",
			style: {
				margin: 0,
				padding: 0,
				listStyle: "none"
			},
			children: L.recent.map((e) => /* @__PURE__ */ m("li", {
				"data-recent-row": !0,
				children: [
					/* @__PURE__ */ p("span", {
						className: "font-medium",
						children: e.title
					}),
					" ",
					/* @__PURE__ */ p("span", {
						className: "text-xs text-muted",
						children: xt(e.at, j)
					})
				]
			}, e.taskId))
		})
	}), W = /* @__PURE__ */ m("div", {
		"data-panel-line": !0,
		"data-stopped": U ? "" : void 0,
		className: "flex flex-col gap-2",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: [
			U ? /* @__PURE__ */ p(S, {
				variant: "danger",
				children: "Line stopped"
			}) : /* @__PURE__ */ p(S, {
				variant: "success",
				children: "Line running"
			}),
			L.stops.map((e) => /* @__PURE__ */ p($, { children: e }, e)),
			/* @__PURE__ */ p(we, { children: /* @__PURE__ */ p(yt, { workspaceId: a }) })
		]
	}), G = $e(null), pe = /* @__PURE__ */ m("section", {
		"data-panel-driver": G.state,
		className: "flex flex-col gap-2",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: [
			/* @__PURE__ */ m("h3", {
				className: "m-0 font-semibold",
				style: { margin: 0 },
				children: ["Driver session ", /* @__PURE__ */ p(S, {
					variant: G.state === "running" ? "success" : void 0,
					children: G.state === "running" ? "Running" : "Not started"
				})]
			}),
			G.note && /* @__PURE__ */ p($, { children: G.note }),
			G.link ? Z(G.link, "Open driver session") : /* @__PURE__ */ p(u, {
				type: "button",
				primary: !0,
				onClick: () => i({
					message: et,
					autoSend: !1
				}),
				children: "Start a driver session"
			})
		]
	}), K = /* @__PURE__ */ p(u, {
		type: "button",
		onClick: () => n(St),
		children: "Open the Avoozl page"
	}), q = R.kind === "crew" ? x?.rows.find((e) => e.crewId === R.crew) : void 0, J = z ? (y.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === z.name || e.planId === z.plan?.id)) : [];
	return /* @__PURE__ */ m("div", {
		className: "flex flex-col gap-3 p-3 text-sm",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 12,
			padding: 12
		},
		"data-panel-kind": R.kind,
		children: [
			D && /* @__PURE__ */ m("p", {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", D]
			}),
			k && /* @__PURE__ */ p("p", {
				role: "status",
				children: k
			}),
			R.kind === "spec-builder" && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ m("section", {
					"data-panel-spec": !0,
					children: [
						/* @__PURE__ */ m("h3", {
							className: "font-semibold",
							children: ["Spec check: ", R.spec]
						}),
						!z && /* @__PURE__ */ p("p", {
							className: "text-muted",
							children: "Avoozl has not read this spec folder yet."
						}),
						z && /* @__PURE__ */ m(f, { children: [
							/* @__PURE__ */ m("ul", { children: [
								/* @__PURE__ */ m("li", { children: ["Files: ", z.files.join(", ") || "none"] }),
								/* @__PURE__ */ m("li", { children: ["Tasks: ", z.taskCount] }),
								/* @__PURE__ */ m("li", { children: [
									"Problems: ",
									z.counts.error,
									" errors, ",
									z.counts.warning,
									" warnings"
								] }),
								/* @__PURE__ */ p("li", { children: z.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl." })
							] }),
							We(R, {
								files: z.files,
								approved: !!z.plan?.approved
							}) && /* @__PURE__ */ p("p", {
								className: "text-muted",
								children: "tasks.md is written and not approved yet."
							}),
							z.plan?.approved && /* @__PURE__ */ p("p", {
								className: "text-muted",
								children: "Do not press Execute in Spec Builder. Avoozl's gate replaces it."
							}),
							!z.plan && /* @__PURE__ */ p(u, {
								onClick: () => void ce(),
								children: "Store this spec"
							}),
							z.plan && !z.plan.approved && /* @__PURE__ */ p(u, {
								primary: !0,
								disabled: z.counts.error > 0 || !z.hash,
								onClick: () => void se(),
								children: "Approve for Avoozl"
							})
						] })
					]
				}),
				z?.plan?.approved && /* @__PURE__ */ p(Q, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: J.length,
					open: !0,
					children: J.length === 0 ? /* @__PURE__ */ p($, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ p("ul", {
						className: "m-0 list-none p-0",
						style: {
							margin: 0,
							padding: 0,
							listStyle: "none"
						},
						children: J.slice(0, 6).map((e) => /* @__PURE__ */ m("li", {
							"data-spec-queue-row": e.state,
							children: [
								/* @__PURE__ */ p(S, { children: e.state }),
								" ",
								e.title,
								" ",
								/* @__PURE__ */ p("span", {
									className: "text-xs text-muted",
									children: e.reason
								})
							]
						}, e.taskId))
					})
				}),
				W,
				K
			] }),
			R.kind === "crew" && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ m("section", {
					"data-panel-crew": !0,
					className: "flex flex-col gap-2",
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: [
						/* @__PURE__ */ m("h3", {
							className: "font-semibold",
							children: ["Crew ", R.crew]
						}),
						q ? /* @__PURE__ */ m(f, { children: [
							/* @__PURE__ */ m("p", { children: [
								q.repository,
								"#",
								q.number,
								" ",
								q.title,
								": ",
								q.phase ?? "no phase",
								q.pr ? `, PR #${q.pr}` : "",
								q.stale ? " (stale)" : ""
							] }),
							/* @__PURE__ */ p("span", {
								"data-rail": !0,
								className: "inline-flex items-center gap-0.5",
								role: "img",
								"aria-label": ke(q).map((e) => `${e.label} ${e.state}`).join(", "),
								style: {
									display: "inline-flex",
									gap: 3
								},
								children: ke(q).map((e) => /* @__PURE__ */ p("i", {
									"data-rail-step": e.state,
									title: e.label,
									style: {
										display: "block",
										width: 16,
										height: 8,
										borderRadius: 3,
										background: e.state === "done" ? "var(--ok)" : e.state === "now" ? "var(--accent)" : "var(--border)"
									}
								}, e.label))
							}),
							q.updated && /* @__PURE__ */ m($, { children: ["Updated ", xt(q.updated, j)] }),
							/* @__PURE__ */ m("span", {
								className: "flex flex-wrap gap-2",
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 8
								},
								children: [
									q.url && Z(q.url, "Issue"),
									q.prUrl && Z(q.prUrl, `PR #${q.pr}`),
									q.commentUrl && Z(q.commentUrl, "Crew comment")
								]
							})
						] }) : /* @__PURE__ */ p($, { children: H ? "Loading…" : V("inFlight") ? X.inFlight : "No live claim from this crew in Avoozl's repositories." }),
						/* @__PURE__ */ p($, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })
					]
				}),
				W,
				K
			] }),
			R.kind === "avoozl" && /* @__PURE__ */ m(f, { children: [
				pe,
				le,
				ue,
				de,
				W,
				K
			] }),
			R.kind === "other" && /* @__PURE__ */ m("section", {
				"data-panel-recap": !0,
				className: "flex flex-col gap-3",
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [
					/* @__PURE__ */ p("h3", {
						className: "m-0 font-semibold",
						style: { margin: 0 },
						children: "Recap"
					}),
					/* @__PURE__ */ p("p", {
						className: "m-0",
						"data-recap-line": !0,
						style: { margin: 0 },
						children: H ? "Loading…" : `${L.waiting.length} waiting on you · ${L.inFlight.length} in flight · ${U ? "line stopped" : "line running"}`
					}),
					le,
					ue,
					de,
					fe,
					W,
					pe,
					K
				]
			})
		]
	});
}
export { Et as default };
