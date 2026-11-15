import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { Fragment as l, jsx as u, jsxs as d } from "react/jsx-runtime";
import { useAppApi as f, useChatLauncher as p, useNavigate as m } from "@kirocrew/app-sdk";
import { Btn as h, Input as g } from "@kirocrew/app-sdk/ui";
import { Bot as _, Check as v, ChevronRight as y, CircleAlert as b, CircleDot as x, GitBranch as S, GitPullRequest as C, Inbox as w, MessageSquare as T, Pause as E, Radar as D, RefreshCw as O, X as ee } from "lucide-react";
import { createPortal as k } from "react-dom";
// kirocrew-app/ui/src/Logo.tsx
function te({ size: e = 32 }) {
	return /* @__PURE__ */ d("svg", {
		viewBox: "0 0 100 100",
		width: e,
		height: e,
		"aria-hidden": "true",
		focusable: "false",
		children: [
			/* @__PURE__ */ u("path", {
				d: "M8 95 Q50 82 92 95",
				fill: "none",
				stroke: "var(--accent)",
				strokeWidth: 2.5,
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ u("path", {
				d: "M39 36 Q28 28 29 14 Q33 28 43 30 Z M61 36 Q72 28 71 14 Q67 28 57 30 Z",
				fill: "var(--accent)"
			}),
			/* @__PURE__ */ u("path", {
				fillRule: "evenodd",
				fill: "var(--text)",
				d: "M50 8 L84 84 Q80 92 74 97 L64 70 L36 70 L26 97 Q20 92 16 84 Z M50 24 L62 58 L38 58 Z"
			}),
			/* @__PURE__ */ u("path", {
				d: "M39 45 L49 50 L46 55 Z M61 45 L51 50 L54 55 Z",
				fill: "var(--danger)"
			})
		]
	});
}
// kirocrew-app/ui/src/workspace-api.ts
var A = "/apps/avoozl/api/command";
function ne(e) {
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
function re(e) {
	let t = async (t, n = {}, r) => (await e.post(A, {
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
function ie(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/demo-api.ts
var ae = "@demo", oe = "Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.";
function j(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function se(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function ce(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function le(e, t) {
	let n = (e) => e.catch((e) => {
		let n = ce(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = se(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => j("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => j("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!j("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: ue }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var ue = {
	defaultWorkspace: ae,
	items: [{
		id: ae,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, de = e({
	active: !1,
	notice: () => void 0
}), fe = () => n(de);
function pe() {
	let e = f(), { active: t, notice: n } = fe();
	return o(() => t ? le(e, n) : e, [
		e,
		t,
		n
	]);
}
function me() {
	let e = p(), { active: t, notice: n } = fe(), r = e.openChat;
	return o(() => t ? { openChat: () => n(oe) } : { openChat: r }, [
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
function he(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var M = null;
function N(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), M === o && (M = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), M && M !== o && M(), M = o, i || (i = !0, e.onChange(!0));
	};
	return {
		get open() {
			return i;
		},
		enter(n) {
			n === "touch" || i || (a(), r = t(s, e.delay ?? 300));
		},
		leave: o,
		tap() {
			i ? o() : s();
		},
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
var ge = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function _e(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function P(e, t, n) {
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
var F = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
};
F.nodeWidth, F.nodeHeight, F.columnGap, F.rowGap, F.margin, F.clusterLabel, F.clusterGap;
// kirocrew-app/ui/src/nav-history.ts
var ve = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), I = (e) => ve.has(e);
function ye(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function be() {
	let e = [], t = 1, n = () => {
		let t = ye(e, (e) => e.kind === "tab");
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
			let t = ye(e, (e) => I(e.kind));
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
				let t = ye(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function xe(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var Se = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function L(e = Se) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: be(),
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
		restoreScroll: (t) => void e(() => xe(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
// kirocrew-app/ui/src/NavHistory.tsx
var R = "data-avoozl-app", Ce = e(null), z = null, we = () => n(Ce) ?? (z ??= L());
function Te(e, t, n, i, a) {
	let o = we(), c = s({
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
var Ee = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", De = "color-mix(in srgb, var(--text) 30%, transparent)", Oe = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)"
}, B = [], V = null;
function ke() {
	V || (V = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function H() {
	!B.length && V && (document.documentElement.style.overflow = V.html, document.body.style.overflow = V.body, V = null);
}
var Ae = e(null), je = () => n(Ae);
function U(e) {
	let n = Ue(), r = !!e.close, i = _e("(max-width: 767px)"), o = s(null), f = s(null), [p, m] = c(null), h = s(e);
	h.current = e;
	let g = s(!1), _ = t(() => {
		let { unsaved: e, onDismiss: t } = h.current;
		if (!e) return t();
		g.current || (g.current = !0, n(e).then((e) => {
			g.current = !1, e && h.current.onDismiss();
		}));
	}, [n]);
	Te(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", _), a(() => {
		let e = o.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), B.push(t), ke(), m(e), (f.current?.querySelector(`:is(${Ee}):not([data-modal-close])`) ?? f.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || B.at(-1) !== t || !f.current) return;
			let n = [...f.current.querySelectorAll(Ee)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = P(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), B.splice(B.indexOf(t), 1), H(), e.open && e.close(), n?.isConnected && n.focus();
		};
	}, []);
	let v = e.title !== void 0, y = i ? {
		width: "100%",
		height: "100%",
		maxHeight: "none",
		borderRadius: 0
	} : v || e.height ? {
		width: `min(${e.width ?? "64rem"}, 94vw)`,
		height: `min(${e.height ?? "52rem"}, 90vh)`,
		borderRadius: 10
	} : {
		width: `min(${e.width ?? "36rem"}, 94vw)`,
		maxHeight: "88vh",
		borderRadius: 10
	}, b = v || e.plain ? "relative flex flex-col overflow-hidden border shadow-lg outline-none" : "relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none", x = /* @__PURE__ */ u("button", {
		type: "button",
		"data-modal-close": !0,
		"aria-label": "Close",
		onClick: _,
		className: "rounded border p-1",
		style: {
			cursor: "pointer",
			background: "none",
			borderColor: "var(--border)",
			color: "inherit",
			display: "inline-flex"
		},
		children: /* @__PURE__ */ u(ee, {
			size: 16,
			"aria-hidden": "true"
		})
	});
	return k(/* @__PURE__ */ d("dialog", {
		ref: o,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": i ? "full" : v ? "large" : "box",
		[R]: "",
		...e.attrs,
		onCancel: (e) => {
			e.preventDefault(), _();
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
		children: [/* @__PURE__ */ u("style", { children: "dialog[data-modal]::backdrop{background:transparent}" }), /* @__PURE__ */ d("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ u("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: _,
				style: {
					position: "absolute",
					inset: 0,
					background: De
				}
			}), /* @__PURE__ */ u("div", {
				ref: (t) => {
					f.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				tabIndex: -1,
				className: b,
				style: {
					...Oe,
					...y,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ u(Ae.Provider, {
					value: p,
					children: v ? /* @__PURE__ */ d(l, { children: [/* @__PURE__ */ d("div", {
						className: "contents",
						children: [/* @__PURE__ */ d("div", {
							className: "flex items-center gap-2 border-b px-4 py-3",
							style: { borderColor: "var(--border)" },
							children: [/* @__PURE__ */ u("h3", {
								id: `${e.id}-title`,
								className: "min-w-0 flex-1 text-lg font-semibold",
								children: e.title
							}), r && x]
						}), /* @__PURE__ */ u("div", {
							className: "min-h-0 flex-1 overflow-y-auto p-4",
							children: e.children
						})]
					}), e.footer && /* @__PURE__ */ u("div", {
						className: "border-t px-4 py-3",
						style: { borderColor: "var(--border)" },
						children: e.footer
					})] }) : /* @__PURE__ */ d(l, { children: [r && /* @__PURE__ */ u("div", {
						className: "flex justify-end",
						children: x
					}), e.children] })
				})
			})]
		})]
	}), document.body);
}
// kirocrew-app/ui/src/Tooltip.tsx
var Me = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Ne = "button, a[href], input, select, textarea, summary, [role=\"button\"]", Pe = `${Ne}, [tabindex]`, Fe = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function W(e) {
	let t = i(), n = je(), f = s(null), p = s(null), [m, h] = c(!1), [g, _] = c(null), v = o(() => N({ onChange: h }), []);
	r(() => v.hide, [v]), r(() => {
		if (!m) return;
		let e = (e) => v.key(e.key), t = () => v.hide(), n = (e) => {
			f.current?.contains(e.target) || v.hide();
		};
		return document.addEventListener("keydown", e), document.addEventListener("pointerdown", n), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), document.removeEventListener("pointerdown", n), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [m, v]), a(() => {
		if (!m || !f.current || !p.current) return _(null);
		let e = f.current.getBoundingClientRect(), t = p.current.getBoundingClientRect();
		_(he(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [m, e.text]);
	let y = e.text?.trim(), [b, x] = c(!1);
	a(() => {
		x(!!y && !f.current?.querySelector(Pe));
	});
	let S = typeof e.children == "function" ? e.children(y ? t : void 0) : e.children;
	return y ? /* @__PURE__ */ d("span", {
		ref: f,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => v.enter(e.pointerType),
		onPointerLeave: (e) => e.pointerType !== "touch" && v.leave(),
		onPointerDown: (e) => {
			let t = e.target, n = t.closest(Ne), r = t.closest("[data-info-tip]") !== null || !n || !e.currentTarget.contains(n);
			e.pointerType === "touch" && r ? v.tap() : v.hide();
		},
		tabIndex: b ? 0 : void 0,
		"aria-describedby": b ? t : void 0,
		onFocus: (e) => v.focus(Fe(e.target)),
		onBlur: v.blur,
		"data-tooltip-anchor": !0,
		children: [
			S,
			/* @__PURE__ */ u("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: y
			}),
			m && k(/* @__PURE__ */ d("div", {
				ref: p,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": g?.side,
				style: {
					position: "fixed",
					top: g?.top ?? 0,
					left: g?.left ?? 0,
					visibility: g ? "visible" : "hidden",
					zIndex: ge.tooltip,
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
					animation: Me() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ u("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					y,
					g && /* @__PURE__ */ u("span", {
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
	}) : /* @__PURE__ */ u(l, { children: S });
}
// kirocrew-app/ui/src/views-api.ts
function Ie(e) {
	let t = async (t, n, r, i) => (await e.post(A, {
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
		decideConflictFix: (e, n, r, i) => t("conflictfix.decide", {
			repository: n,
			pullRequest: r,
			action: i
		}, e),
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
function Le(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var Re = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function G(e) {
	return typeof e == "string" && Re.test(e) ? e : Le(e) ?? void 0;
}
var ze = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Be = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function Ve(e) {
	let t = e.icon;
	return /* @__PURE__ */ u(W, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ d(h, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...Be,
				...e.style
			},
			children: [/* @__PURE__ */ u(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
({ ...Be });
var He = e(async () => !1), Ue = () => n(He);
function We({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ d(He.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ d(U, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			children: [
				/* @__PURE__ */ u("h3", {
					id: "avoozl-confirm-title",
					className: "text-base font-semibold",
					children: n.title
				}),
				/* @__PURE__ */ u("p", {
					id: "avoozl-confirm-body",
					className: "text-sm text-muted",
					children: n.body
				}),
				/* @__PURE__ */ d("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ u(h, {
						ref: a,
						type: "button",
						onClick: () => l(!1),
						children: "Cancel"
					}), /* @__PURE__ */ u(h, {
						type: "button",
						"data-danger": !0,
						onClick: () => l(!0),
						style: ze,
						children: n.action
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/dashboard-api.ts
var Ge = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function Ke(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Ge.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/driver-api.ts
function qe(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
var Je = (e) => ({
	running: "A driver session is working. Open it to watch or steer.",
	idle: "The driver session has been quiet for a while. Open it to check on it, or start a new one.",
	none: "No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.",
	unknown: "Avoozl could not read the driver session. It tries again soon."
})[e], Ye = (e, t) => qe(new Date(e).toISOString(), t);
function Xe(e, t, n) {
	if (!t || n - t.at < 6e4) return null;
	let r = new Set(t.waitingKeys), i = e.recent.filter((e) => Date.parse(e.at) > t.at), a = e.waiting.filter((e) => !r.has(e.key)).map(({ key: e, title: t, label: n }) => ({
		key: e,
		title: t,
		label: n
	}));
	return !i.length && !a.length ? null : {
		since: Ye(t.at, n),
		finished: i,
		needsYou: a
	};
}
// kirocrew-app/ui/src/panel-chat.ts
function Ze(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function Qe(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${$e(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") || t.driver && e === t.driver ? { kind: "avoozl" } : { kind: "other" };
}
var $e = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function et(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/flow-api.ts
function tt(e) {
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
var nt = "avoozl:line-changed", rt = () => {
	typeof window < "u" && window.dispatchEvent(new Event(nt));
};
function it(e) {
	let t = (t, n, r = {}) => e.post(A, {
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
		models: () => e.get("/api/models").then(tt),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n }),
		proposals: (e) => t(e, "flow.proposals"),
		revertPrompt: (e, n) => t(e, "prompt.override.revert", { target: n }),
		rebasePrompt: (e, n) => t(e, "prompt.override.rebase", n)
	};
}
function at(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var ot = [
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
], st = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], ct = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", lt = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function ut(e) {
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
function dt(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${at(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/panel-api.ts
async function ft(e, t) {
	return (await e.post(A, {
		operation: "panel.view",
		input: {},
		workspaceId: t
	})).result;
}
function pt(e, t) {
	let n = !1, r = !0, i = async () => {
		if (r && !n) {
			n = !0;
			try {
				await e();
			} catch {} finally {
				n = !1;
			}
		}
	}, a = () => t.doc.visibilityState !== "hidden", o = () => a() && void i(), s = () => a() && void i(), c = t.intervalMs > 0 ? t.setTimer(o, t.intervalMs) : null;
	return t.win.addEventListener("focus", s), t.doc.addEventListener("visibilitychange", s), i(), () => {
		r = !1, c !== null && t.clearTimer(c), t.win.removeEventListener("focus", s), t.doc.removeEventListener("visibilitychange", s);
	};
}
var mt = /* @__PURE__ */ new Set([
	"needs-human",
	"github-conflict",
	"tracker-conflict",
	"review",
	"ready-to-merge",
	"branch-landing",
	"content-match",
	"content-unavailable"
]), ht = {
	"needs-human": "Needs you",
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit",
	review: "Review",
	"ready-to-merge": "Ready to merge",
	"branch-landing": "Ready to land",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function gt(e) {
	if (!mt.has(e.kind) || e.kind === "needs-human" && e.reason === "hand-set-review" || e.kind === "ready-to-merge" && e.integrate) return null;
	let t = [], n = G(e.link) ?? G(e.issue?.url);
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
	return t.length || t.push({
		kind: "link",
		label: "Open in Avoozl",
		href: "/apps/avoozl"
	}), {
		key: `${e.kind}:${e.taskId ?? e.id ?? ""}:${e.field ?? ""}:${e.branch ?? ""}`,
		kind: e.kind,
		label: ht[e.kind] ?? e.kind,
		title: e.title,
		detail: e.detail,
		at: e.changedAt ?? null,
		actions: t
	};
}
function _t(e, t, n) {
	return {
		key: `radar:${e.repository}#${e.number}`,
		source: "radar",
		title: e.title,
		ref: `${e.repository}#${e.number}`,
		who: e.crewName ?? e.crewId ?? "no crew named",
		instance: e.instanceId && t.get(e.instanceId) || null,
		crew: e.crewName ?? e.crewId ?? null,
		repository: e.repository,
		phase: e.phase,
		stale: e.stale,
		issueUrl: G(e.url) ?? null,
		prUrl: G(e.prUrl) ?? null,
		prNumber: e.pr,
		attach: e.crewId ? `/chat?sid=crew-${encodeURIComponent(e.crewId)}` : null,
		noAttach: e.crewId ? null : "The claim names no crew.",
		pr: !!e.pr,
		check: n,
		claimedAt: e.claimedAt ?? null,
		updated: e.updated
	};
}
function vt(e) {
	let t = G(e.attachUrl) ?? null;
	return {
		key: `remote:${e.host}:${e.chatKey}`,
		source: "remote",
		title: e.taskId,
		ref: e.taskId,
		who: `${e.host}, crew ${e.crewId}`,
		instance: null,
		crew: e.crewId,
		repository: null,
		phase: e.status ?? e.state,
		stale: e.stale,
		issueUrl: null,
		prUrl: null,
		prNumber: null,
		attach: t,
		noAttach: t ? null : `Set the dashboard link for ${e.host} to attach.`,
		pr: !1,
		check: null,
		claimedAt: null,
		updated: e.updatedAt || null
	};
}
function yt(e) {
	let t = [];
	e.conflicts || t.push("waiting"), !e.crews && !e.remote && t.push("inFlight"), e.queue || t.push("queue"), e.flow || t.push("recent");
	let n = (e.conflicts ?? []).map(gt).filter((e) => e !== null), r = /* @__PURE__ */ new Map();
	for (let t of e.crews?.groups ?? []) for (let e of t.rows) e.instanceId && r.set(e.instanceId, t.name);
	let i = [...(e.crews?.rows ?? []).map((t) => _t(t, r, e.checks?.[`${t.repository}#${t.pr}`] ?? null)), ...(e.remote ?? []).map(vt)], a = null;
	if (e.queue) {
		let t = e.queue.repositories.flatMap((e) => e.rows.map((t) => ({
			repo: e,
			row: t
		})));
		a = {
			head: t.filter((e) => e.row.state === "next").slice(0, 3).map(({ repo: e, row: t }) => ({
				taskId: t.taskId,
				title: t.title,
				repository: e.repository,
				reason: t.reason
			})),
			next: t.filter((e) => e.row.state === "next").length,
			claimed: t.filter((e) => e.row.state === "claimed").length,
			held: t.filter((e) => e.row.state === "held").length,
			mode: e.queue.repositories[0]?.mode ?? null
		};
	}
	let o = (e.flow?.tasks ?? []).filter((e) => e.finishedAt).sort((e, t) => String(t.finishedAt).localeCompare(String(e.finishedAt))).slice(0, 5).map((e) => ({
		taskId: e.taskId,
		title: e.title,
		repository: e.repository,
		at: String(e.finishedAt)
	})), s = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(dt);
	return {
		waiting: n,
		inFlight: i,
		queue: a,
		recent: o,
		stops: s,
		unread: t
	};
}
function bt(e) {
	let t = e?.state ?? "none", n = e?.workspace ?? null, r = t === "none" || t === "idle" ? e?.others?.[0] : void 0;
	return {
		state: t,
		link: e?.href ?? null,
		start: t === "none" || t === "idle",
		note: Je(t),
		workspace: n,
		elsewhere: r ? {
			text: `No driver for ${n ?? "this workspace"}. ${r.workspace} has one:`,
			href: r.href,
			slot: r.slot,
			workspace: r.workspace
		} : null
	};
}
function xt(e, t) {
	return t && e?.others?.find((e) => e.slot === t)?.root || null;
}
var St = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "");
	return n(e) === n(t);
};
function K(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 1 ? "now" : r < 60 ? `${r}m` : r < 2880 ? `${Math.round(r / 60)}h` : `${Math.round(r / 60 / 24)}d`;
}
function Ct(e) {
	return e ? e.state === "failing" ? {
		text: `✗ ${e.failed.length}`,
		tone: "danger",
		tip: `Failing: ${e.failed.join(", ")}.`
	} : e.state === "pending" ? {
		text: `… ${e.done}/${e.total}`,
		tone: "warn",
		tip: `${e.done} of ${e.total} checks done.`
	} : e.state === "passing" ? {
		text: `✓ ${e.total}`,
		tone: "ok",
		tip: `All ${e.total} checks passed.`
	} : {
		text: "no checks",
		tone: "muted",
		tip: "No checks have run on this pull request."
	} : {
		text: "?",
		tone: "muted",
		tip: "Avoozl could not read this pull request's checks."
	};
}
// kirocrew-app/ui/src/PanelParts.tsx
var wt = "\n[data-pp]{font-size:12px;line-height:1.35;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box}\n[data-pp] *{box-sizing:border-box}\n[data-pp-toolbar]{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;padding:6px 8px;border-bottom:1px solid var(--border)}\n[data-pp-toolbar-end]{margin-left:auto;display:inline-flex;align-items:center;gap:6px}\n[data-pp-strip]{display:flex;flex-wrap:wrap;gap:4px 6px;padding:6px 8px;border-bottom:1px solid var(--border)}\n[data-pp-section]{border-bottom:1px solid var(--border)}\n[data-pp-section]>summary{display:flex;align-items:center;gap:6px;min-height:28px;padding:0 8px;cursor:pointer;list-style:none;font-size:12px;font-weight:600;user-select:none}\n[data-pp-section]>summary::-webkit-details-marker{display:none}\n[data-pp-section]>summary [data-pp-chevron]{transition:transform .12s;flex:none;color:var(--muted)}\n[data-pp-section][open]>summary [data-pp-chevron]{transform:rotate(90deg)}\n[data-pp-summary]{margin-left:auto;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-list]{list-style:none;margin:0;padding:0}\n[data-pp-row]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;column-gap:6px;padding:3px 8px;min-height:36px;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent)}\n[data-pp-row-icon]{display:inline-flex;color:var(--muted)}\n[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}\n[data-pp-row-line]{display:flex;align-items:center;gap:6px;min-width:0}\n[data-pp-row-title]{display:block;font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}\na[data-pp-row-title]{text-decoration:none}\na[data-pp-row-title]:hover{text-decoration:underline}\n[data-pp-row-line]>[data-tooltip-anchor]{flex:none}\n[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:1 1 auto;min-width:0}\n[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}\n[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}\n[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:none;max-width:10rem;padding:0 6px;border-radius:4px;font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:color-mix(in srgb,var(--text) 8%,transparent)}\n[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}\n[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 16%,transparent)}\n[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}\n[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}\n[data-pp-act]{background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:0 8px;border:1px solid var(--border);border-radius:6px;color:var(--text);font:inherit;font-size:12px;text-decoration:none;white-space:nowrap;cursor:pointer}\n[data-pp-act]:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}\n[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}\n[data-pp-act]:disabled{opacity:.5;cursor:default}\n[data-pp-empty]{margin:0;padding:6px 8px;font-size:12px;color:var(--muted)}\n@media (max-width:640px){\n[data-pp-row][data-multi]{grid-template-columns:16px minmax(0,1fr)}\n[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}\n}\n";
function Tt() {
	return /* @__PURE__ */ u("style", { children: wt });
}
function Et(e) {
	return /* @__PURE__ */ d("div", {
		"data-pp": !0,
		"data-panel-kind": e.kind,
		style: {
			display: "flex",
			flexDirection: "column"
		},
		children: [/* @__PURE__ */ u(Tt, {}), e.children]
	});
}
function q(e) {
	let { tone: t = "muted", tip: n, tap: r, href: i, children: a, ...o } = e;
	return /* @__PURE__ */ u(W, {
		text: n,
		children: i ? /* @__PURE__ */ u("a", {
			"data-pp-chip": !0,
			"data-tone": t,
			href: G(i),
			target: "_blank",
			rel: "noreferrer",
			style: { textDecoration: "none" },
			...o,
			children: a
		}) : /* @__PURE__ */ u("span", {
			"data-pp-chip": !0,
			"data-tone": t,
			"data-tap": r && n ? "" : void 0,
			...o,
			children: a
		})
	});
}
function Dt(e) {
	return /* @__PURE__ */ d("div", {
		"data-pp-toolbar": !0,
		children: [e.children, e.end && /* @__PURE__ */ u("span", {
			"data-pp-toolbar-end": !0,
			children: e.end
		})]
	});
}
function Ot(e) {
	return /* @__PURE__ */ u("div", {
		"data-pp-strip": !0,
		children: e.children
	});
}
function J(e) {
	return /* @__PURE__ */ d("details", {
		"data-pp-section": !0,
		"data-panel-fold": e.id,
		open: e.open,
		children: [/* @__PURE__ */ d("summary", { children: [
			/* @__PURE__ */ u(y, {
				size: 12,
				"data-pp-chevron": !0,
				"aria-hidden": "true"
			}),
			e.title,
			e.count !== void 0 && e.count > 0 && /* @__PURE__ */ u(q, {
				tone: e.tone ?? "info",
				children: e.count
			}),
			e.summary && /* @__PURE__ */ u("span", {
				"data-pp-summary": !0,
				children: e.summary
			})
		] }), e.children]
	});
}
function Y(e) {
	return /* @__PURE__ */ u("ul", {
		"data-pp-list": !0,
		children: e.children
	});
}
function X(e) {
	return /* @__PURE__ */ u("p", {
		"data-pp-empty": !0,
		role: e.role,
		children: e.children
	});
}
function Z(e) {
	let { icon: t, title: n, href: r, chips: i, age: a, ageTip: o, meta: s, actions: c, multi: l, noTip: f, ...p } = e;
	return /* @__PURE__ */ d("li", {
		"data-pp-row": !0,
		"data-multi": l ? "" : void 0,
		...p,
		children: [
			/* @__PURE__ */ u("span", {
				"data-pp-row-icon": !0,
				children: /* @__PURE__ */ u(t, {
					size: 14,
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ d("span", {
				"data-pp-row-main": !0,
				children: [/* @__PURE__ */ d("span", {
					"data-pp-row-line": !0,
					children: [
						/* @__PURE__ */ u(W, {
							text: f ? null : n,
							display: "block",
							children: r ? /* @__PURE__ */ u("a", {
								"data-pp-row-title": !0,
								href: G(r),
								target: "_blank",
								rel: "noreferrer",
								children: n
							}) : /* @__PURE__ */ u("span", {
								"data-pp-row-title": !0,
								children: n
							})
						}),
						i,
						a && /* @__PURE__ */ u(W, {
							text: o,
							children: /* @__PURE__ */ u("span", {
								"data-pp-age": !0,
								children: a
							})
						})
					]
				}), s && /* @__PURE__ */ u(W, {
					text: s,
					display: "block",
					children: /* @__PURE__ */ u("span", {
						"data-pp-row-meta": !0,
						style: { display: "block" },
						children: s
					})
				})]
			}),
			c && /* @__PURE__ */ u("span", {
				"data-pp-actions": !0,
				children: c
			})
		]
	});
}
function Q(e) {
	let { label: t, icon: n, href: r, onClick: i, disabled: a, primary: o, tip: s, ...c } = e, f = /* @__PURE__ */ d(l, { children: [n && /* @__PURE__ */ u(n, {
		size: 13,
		"aria-hidden": "true"
	}), t] });
	return /* @__PURE__ */ u(W, {
		text: s,
		children: r ? /* @__PURE__ */ u("a", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			href: G(r),
			target: "_blank",
			rel: "noreferrer",
			...c,
			children: f
		}) : /* @__PURE__ */ u("button", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			type: "button",
			disabled: a,
			onClick: i,
			...c,
			children: f
		})
	});
}
var kt = (e) => String(e).padStart(2, "0");
function At(e, t) {
	let n = Math.max(0, Math.ceil(e));
	return !t && n < 100 ? `${n}s` : n >= 3600 ? `${Math.floor(n / 3600)}:${kt(Math.floor(n % 3600 / 60))}:${kt(n % 60)}` : `${Math.floor(n / 60)}:${kt(n % 60)}`;
}
var jt = (e, t) => e || t >= 3600 ? 7 : t < 100 ? 3 : 5, Mt = (e) => e?.cacheSeconds ? e.cacheSeconds : e?.cacheSeconds === 0 ? 20 : 60;
function Nt(e, t) {
	let n = e?.limitedUntil ? Date.parse(e.limitedUntil) : 0;
	return n > t ? Math.ceil((n - t) / 1e3) : 0;
}
function Pt(e, t, n) {
	if (n > 0) return `GitHub's rate limit is reached. Calls resume at ${new Date(Date.now() + n * 1e3).toLocaleTimeString()}. Refresh shows what Avoozl last read.`;
	let r = e?.resources?.core;
	return [`Reads again in ${t}s. GitHub answers are kept ${e?.cacheSeconds ?? 60}s (Settings > GitHub).`, r ? `${r.remaining} of ${r.limit} GitHub calls left this hour.` : ""].filter(Boolean).join(" ");
}
// kirocrew-app/ui/src/task-api.ts
function $(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
// kirocrew-app/ui/src/settings-api.ts
function Ft(e) {
	let t = async (t, n, r) => (await e.post(A, {
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
// kirocrew-app/ui/src/RefreshButton.tsx
function It(e, n, i) {
	let a = pe(), l = o(() => Ft(a), [a]), [u, d] = c(null), [f, p] = c(60), [m, h] = c(() => Date.now()), g = s(n);
	g.current = n;
	let _ = Mt(u), v = Nt(u, m), y = t(() => {
		e && l.get(e).then((e) => d(e.rate ?? null), () => {});
	}, [l, e]);
	r(y, [y]);
	let b = s(60), x = t(() => {
		g.current(), b.current = _, p(_), setTimeout(y, 1500);
	}, [_, y]);
	return r(() => {
		b.current = Math.min(b.current, _), p(b.current);
	}, [_]), r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (h(Date.now()), Nt(u, Date.now()) > 0 || (--b.current, b.current <= 0 ? x() : p(b.current)));
		}, 1e3);
		return () => clearInterval(e);
	}, [u, x]), {
		refresh: x,
		busy: i,
		left: f,
		limited: v,
		period: _,
		tip: Pt(u, f, v)
	};
}
function Lt({ state: e }) {
	let { refresh: t, busy: n, left: r, limited: i, period: a } = e, o = i > 0 ? i : r;
	return /* @__PURE__ */ u(Ve, {
		icon: O,
		onClick: t,
		disabled: n,
		tooltip: e.tip,
		"aria-label": `Refresh, ${i > 0 ? "GitHub limit lifts in " : "reads again in "}${At(o, i > 0)}`,
		children: /* @__PURE__ */ u("span", {
			style: {
				display: "inline-block",
				minWidth: `${jt(i > 0, a)}ch`,
				textAlign: "right",
				fontVariantNumeric: "tabular-nums"
			},
			children: At(o, i > 0)
		})
	});
}
function Rt(e) {
	return /* @__PURE__ */ u(Lt, { state: It(e.workspaceId, e.onRefresh, e.busy) });
}
// kirocrew-app/ui/src/plans-api.ts
function zt(e) {
	let t = async (t, n, r = {}) => (await e.post(A, {
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
function Bt(e) {
	let t = async (t, n, r) => (await e.post(A, {
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
var Vt = "/api/apps/spec-builder/specs", Ht = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function Ut(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function Wt(e, t, n = 50) {
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
function Gt(e, t, n) {
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
var Kt = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function qt(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, f = o(() => Ut(e.items), [e.items]), p = e.keep ?? !0, m = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), h = (t) => e.plain ? t.title : Kt(t), g = m && p ? h(m) : "", [_, v] = c(g), [y, b] = c(!1), [x, S] = c(!1), [C, w] = c(0), T = s(null);
	r(() => {
		y || v(g);
	}, [g, y]);
	let { shown: E, total: D } = o(() => Wt(f, y ? _ : ""), [
		f,
		_,
		y
	]);
	r(() => {
		T.current?.querySelector(`#${CSS.escape(`${n}-opt-${C}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [C, n]);
	let O = (t) => {
		e.onPick(t.id), b(!1), S(!1), v(p ? h(t) : "");
	}, ee = (t) => {
		let n = Gt({
			open: x,
			active: C
		}, t.key, E.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (S(!0), w(n.state.active)) : n.kind === "pick" ? O(E[n.index]) : n.kind === "close" ? S(!1) : (v(""), b(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, k = x && (E.length > 0 || y);
	return /* @__PURE__ */ d("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ u("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ u("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": k,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": k && E.length ? `${n}-opt-${C}` : void 0,
				autoComplete: "off",
				spellCheck: !1,
				value: _,
				placeholder: e.value ? void 0 : e.emptyLabel ?? e.placeholder,
				onChange: (e) => {
					v(e.target.value), b(!0), S(!0), w(0);
				},
				onFocus: () => {
					S(!0), w(0);
				},
				onBlur: () => {
					S(!1), y && !_.trim() && e.emptyLabel !== void 0 && e.value && e.onPick(""), b(!1);
				},
				onKeyDown: ee,
				className: "rounded border px-2 py-1 text-sm",
				style: Ht,
				"data-picker": !0
			}),
			/* @__PURE__ */ d("div", {
				hidden: !k,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: ge.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ u("ul", {
						ref: T,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: E.map((t, r) => /* @__PURE__ */ d("li", {
							id: `${n}-opt-${r}`,
							role: "option",
							"aria-selected": r === C,
							onMouseDown: (e) => {
								e.preventDefault(), O(t);
							},
							onMouseEnter: () => w(r),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: r === C ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								e.plain ? /* @__PURE__ */ u("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title
								}) : /* @__PURE__ */ d(l, { children: [/* @__PURE__ */ u("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.id
								}), /* @__PURE__ */ u("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title === t.id ? "" : t.title
								})] }),
								t.spec && /* @__PURE__ */ u("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.spec
								}),
								t.state && /* @__PURE__ */ u("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: t.state
								})
							]
						}, t.id))
					}),
					D === 0 && /* @__PURE__ */ u("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					D > E.length && /* @__PURE__ */ d("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [D - E.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var Jt = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), Yt = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function Xt() {
	return /* @__PURE__ */ u("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function Zt(e) {
	return /* @__PURE__ */ d("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ u("style", { children: Yt }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ d("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ d("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ u("input", {
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
					}), /* @__PURE__ */ d("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ d("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ u(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ u("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ u("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ d("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ u(Xt, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var Qt = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, $t = {
	...Qt,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, en = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, tn = 6e4;
function nn(e) {
	let t = pe(), n = o(() => it(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, tn);
		return window.addEventListener(nt, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(nt, r);
		};
	}, [n, e]), i;
}
function rn(e) {
	let [t, n] = c(!1), r = nn(e.workspaceId);
	if (!e.workspaceId) return null;
	let i = r.length > 0, a = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; ");
	return /* @__PURE__ */ d(l, { children: [/* @__PURE__ */ u(W, {
		text: i ? `The line is stopped: ${a}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (e) => /* @__PURE__ */ d(h, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": e,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: {
				...i ? $t : Qt,
				padding: "4px 6px"
			},
			children: [/* @__PURE__ */ u(E, {
				size: 14,
				"aria-hidden": "true",
				style: i ? { color: "var(--danger)" } : void 0
			}), /* @__PURE__ */ u("span", {
				className: "sr-only",
				children: i ? "Line stopped" : "Stop the line"
			})]
		})
	}), t && /* @__PURE__ */ u(an, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), rt(), e.onPulled?.();
		}
	})] });
}
function an(e) {
	let n = pe(), i = o(() => it(n), [n]), [a, l] = c(lt), [f, p] = c(null), [m, _] = c(null), [v, y] = c(!1), b = Ue(), x = s(null), S = (e) => l((t) => ({
		...t,
		...e
	})), C = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			re(n).repositories(r),
			zt(n).stored(r),
			Ie(n).graph(r)
		]).then(([e, n, r]) => {
			t && p({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? Jt(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		x.current?.querySelector("input, button")?.focus();
	}, []);
	let w = async () => {
		let { input: t, error: n } = ut(a);
		if (!t) return _(n ?? null);
		if (!t.full || await b({
			title: "Stop all agents?",
			body: "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.",
			action: "Stop all agents"
		})) {
			y(!0), _(null);
			try {
				await i.stop(e.workspaceId, t), e.onPulled();
			} catch (e) {
				_(ne(e));
			} finally {
				y(!1);
			}
		}
	}, T = (e) => /* @__PURE__ */ u("p", {
		className: "text-sm text-muted",
		children: f ? e : "Reading…"
	}), D = (e) => /* @__PURE__ */ d("span", { children: [
		e,
		" ",
		/* @__PURE__ */ u("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), O = (e, t, n, r, i) => n.length ? /* @__PURE__ */ u(qt, {
		label: D(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : T(i), ee = {
		all: null,
		repo: f?.repositories.length ? /* @__PURE__ */ d("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [D("Repository"), /* @__PURE__ */ d("select", {
				value: a.repository,
				onChange: (e) => S({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: en,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ u("option", {
					value: "",
					children: "Choose…"
				}), f.repositories.map((e) => /* @__PURE__ */ u("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : T("No repository is registered."),
		spec: O("Spec", a.spec, f?.specs ?? [], (e) => S({ spec: e }), "No spec is stored yet."),
		task: O("Task", a.taskId, f?.tasks ?? [], (e) => S({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ d(U, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: x,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(lt()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		onDismiss: C,
		children: [
			/* @__PURE__ */ d("div", { children: [/* @__PURE__ */ d("h3", {
				id: "avoozl-stop-title",
				className: "flex items-center gap-1.5 text-base font-semibold",
				children: [/* @__PURE__ */ u(E, {
					size: 14,
					"aria-hidden": "true",
					style: { color: "var(--danger)" }
				}), "Stop the line"]
			}), /* @__PURE__ */ u("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			})] }),
			/* @__PURE__ */ u(Zt, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => S({ kind: e }),
				sections: st.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ u("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: ct
					}) } : { fields: /* @__PURE__ */ u(Zt, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => S({ scope: e }),
						sections: ot.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: ee[e.value]
						}))
					}) }
				}))
			}),
			/* @__PURE__ */ d("label", {
				className: "flex flex-col gap-1 text-sm",
				children: [
					/* @__PURE__ */ d("span", { children: ["Reason ", /* @__PURE__ */ u("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ u(g, {
						value: a.reason,
						maxLength: 200,
						placeholder: "The base is broken; looking into it",
						onChange: (e) => S({ reason: e.target.value }),
						"data-stop-reason": !0
					}),
					/* @__PURE__ */ u("span", {
						className: "text-xs text-muted",
						children: "One line. It shows on the banner and in Flow."
					})
				]
			}),
			m && /* @__PURE__ */ u("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: m
			}),
			/* @__PURE__ */ d("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [/* @__PURE__ */ u(h, {
					type: "button",
					onClick: C,
					children: "Cancel"
				}), /* @__PURE__ */ d(h, {
					type: "button",
					"data-danger": !0,
					"data-stop-confirm": !0,
					onClick: () => void w(),
					disabled: v,
					style: Qt,
					children: [/* @__PURE__ */ u(E, {
						size: 14,
						"aria-hidden": "true"
					}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/instance-api.ts
function on(e) {
	let t = async (t, n, r) => (await e.post(A, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		view: (e) => t("instance.view", {}, e),
		rename: (e, n) => t("instance.rename", { name: n }, e)
	};
}
function sn(e, t) {
	return e && (t === "header" || e.shared) ? e.name : null;
}
// kirocrew-app/ui/src/InstanceName.tsx
var cn = "avoozl:instance-changed";
function ln(e) {
	let n = pe(), i = o(() => on(n), [n]), [a, s] = c(null), l = t(() => {
		e && i.view(e).then(s, () => void 0);
	}, [i, e]);
	return r(() => (l(), window.addEventListener(cn, l), () => window.removeEventListener(cn, l)), [l]), a;
}
// kirocrew-app/ui/src/Panel.tsx
var un = "/apps/avoozl", dn = "avoozl.panel.away";
function fn(e) {
	try {
		let t = e?.getItem(dn);
		e?.removeItem(dn);
		let n = t ? JSON.parse(t) : null;
		return n && Number.isFinite(n.at) && Array.isArray(n.waitingKeys) ? n : null;
	} catch {
		return null;
	}
}
function pn() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var mn = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, hn = {
	review: C,
	"ready-to-merge": C,
	"branch-landing": S
}, gn = {
	running: "Running",
	idle: "Quiet",
	none: "Not started",
	unknown: "Unknown"
}, _n = {
	conflicts: null,
	crews: null,
	remote: null,
	queue: null,
	flow: null,
	driver: null,
	specs: null,
	instance: null,
	checks: null
};
function vn(e) {
	return /* @__PURE__ */ u(Y, { children: e.rows.map((t) => /* @__PURE__ */ u(Z, {
		"data-waiting-row": t.kind,
		icon: hn[t.kind] ?? b,
		title: t.title,
		chips: /* @__PURE__ */ u(q, {
			tone: "warn",
			children: t.label
		}),
		age: t.at ? K(t.at, e.now) : null,
		ageTip: t.at ? `Changed ${$(t.at, e.now)}` : void 0,
		meta: t.detail,
		multi: t.actions.length > 1,
		actions: t.actions.map((n) => n.kind === "link" && n.href.startsWith("/apps/") ? /* @__PURE__ */ u(Q, {
			label: n.label,
			onClick: e.onOpenPage
		}, n.label) : n.kind === "link" ? /* @__PURE__ */ u(Q, {
			label: n.label,
			href: G(n.href)
		}, n.label) : /* @__PURE__ */ u(Q, {
			label: n.label,
			disabled: e.busy === t.key,
			onClick: () => e.onAct(t, n)
		}, n.label))
	}, t.key)) });
}
function yn({ rows: e, now: t }) {
	return /* @__PURE__ */ u(Y, { children: e.map((e) => {
		let n = e.pr ? Ct(e.check) : null, r = [
			e.instance ?? (e.source === "radar" ? "No Avoozl" : null),
			e.crew ?? e.who,
			e.source === "radar" ? e.ref : e.who,
			e.phase ? null : "claim label, no claim comment"
		].filter(Boolean);
		return /* @__PURE__ */ u(Z, {
			"data-flight-row": e.source,
			icon: e.pr ? C : e.source === "radar" ? D : x,
			title: e.title,
			href: G(e.issueUrl),
			chips: /* @__PURE__ */ d(l, { children: [
				/* @__PURE__ */ u(q, {
					tone: e.stale ? "warn" : "info",
					tip: e.updated ? `Updated ${$(e.updated, t)}` : void 0,
					children: e.phase ?? "claimed"
				}),
				e.stale && /* @__PURE__ */ u(q, {
					tone: "warn",
					children: "Stale"
				}),
				n && /* @__PURE__ */ d(q, {
					tone: n.tone,
					tip: n.tip,
					href: G(e.prUrl),
					"data-flight-pr": !0,
					children: [
						"PR #",
						e.prNumber,
						" ",
						n.text
					]
				})
			] }),
			age: K(e.claimedAt ?? e.updated, t),
			ageTip: [e.claimedAt && `Claimed ${$(e.claimedAt, t)}`, e.updated && `updated ${$(e.updated, t)}`].filter(Boolean).join(", ") || void 0,
			meta: [...new Set(r)].join(" · "),
			actions: e.attach ? /* @__PURE__ */ u(Q, {
				label: "Attach",
				icon: T,
				href: G(e.attach),
				tip: e.source === "radar" ? "Opens the crew chat, if this crew runs on this machine. Type there to steer it." : "Opens the worker chat on its crew. Type there to steer it."
			}) : e.noAttach ? /* @__PURE__ */ u(W, {
				text: e.noAttach,
				children: /* @__PURE__ */ u("span", {
					"data-pp-chip": !0,
					"data-tone": "muted",
					"data-tap": "",
					children: "No chat"
				})
			}) : null
		}, e.key);
	}) });
}
function bn() {
	let e = pe(), n = m(), { openChat: i } = me(), [a, f] = c(ie(pn()).workspaceId), [p, h] = c([]), [g, y] = c(null), [S, T] = c(null), [E, O] = c(null), [ee, k] = c(null), [A, ae] = c(() => Date.now()), [oe, j] = c(() => fn(pn())), se = ln(a), ce = o(() => Ze(window.location), []), le = o(() => zt(e), [e]), ue = o(() => Ie(e), [e]), de = o(() => Bt(e), [e]), fe = s(a), he = s(g);
	he.current = g;
	let M = t(async () => {
		let t = fe.current;
		try {
			t || (t = (await re(e).list()).defaultWorkspace, fe.current = t, f(t));
		} catch (e) {
			T(ne(e));
			return;
		}
		if (!t) return;
		let n = _n;
		try {
			n = await ft(e, t);
			let r = xt(n.driver, ce);
			if (r) {
				let i = (await re(e).list()).items.find((e) => St(e.root, r));
				i && i.id !== t && (t = i.id, fe.current = t, f(t), n = await ft(e, t));
			}
		} catch {}
		try {
			let t = await e.get(Vt);
			h((t.specs ?? []).map((e) => e.name));
		} catch {}
		T(null), y(n), ae(Date.now());
	}, [e, ce]);
	r(() => pt(M, {
		intervalMs: 0,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [M]);
	let N = o(() => yt(g ?? {}), [g]), ge = g?.driver ?? null, _e = g?.specs ?? [], P = Qe(ce, {
		specs: p,
		driver: ge?.slot ?? null
	}), F = P.kind === "spec-builder" ? _e.find((e) => e.name === P.spec) : void 0, ve = s(N);
	ve.current = N, r(() => {
		let e = () => {
			if (he.current) try {
				let e = {
					at: Date.now(),
					waitingKeys: ve.current.waiting.map((e) => e.key)
				};
				pn()?.setItem(dn, JSON.stringify(e));
			} catch {}
		}, t = () => {
			if (document.visibilityState === "hidden") return e();
			let t = fn(pn());
			t && j(t);
		};
		return window.addEventListener("blur", e), window.addEventListener("focus", t), document.addEventListener("visibilitychange", t), () => {
			window.removeEventListener("blur", e), window.removeEventListener("focus", t), document.removeEventListener("visibilitychange", t);
		};
	}, []);
	let I = o(() => Xe(N, oe, A), [
		N,
		oe,
		A
	]), ye = async (e, t) => {
		if (a && t.kind !== "link") {
			k(e.key);
			try {
				t.kind === "resolve" ? await ue.resolveConflict(a, t.taskId, t.field, t.choice) : await de.land(a, t.repository, t.branch, t.head), O(null), await M();
			} catch (e) {
				O(ne(e));
			} finally {
				k(null);
			}
		}
	}, be = async () => {
		if (a && F?.plan && F.hash) try {
			await le.approve(a, F.plan.id, F.hash), O("Approved this revision for Avoozl."), await M();
		} catch (e) {
			O(ne(e));
		}
	}, xe = async () => {
		if (a && F) try {
			await le.store(a, F.name), O("Stored as a draft. Review it in Specs, then approve."), await M();
		} catch (e) {
			O(ne(e));
		}
	}, Se = (e) => N.unread.includes(e), L = g === null, R = N.stops.length > 0, Ce = sn(se, "other") ?? g?.instance?.name ?? null, z = (e, t, n, r) => Se(e) ? /* @__PURE__ */ u(X, { children: L ? "Loading…" : mn[e] }) : n === 0 ? /* @__PURE__ */ u(X, { children: t }) : r(), we = /* @__PURE__ */ d(J, {
		id: "waiting",
		title: "Waiting on you",
		count: N.waiting.length,
		tone: "warn",
		open: !0,
		children: [z("waiting", "Nothing is waiting on you.", N.waiting.length, () => /* @__PURE__ */ u(vn, {
			rows: N.waiting.slice(0, 5),
			busy: ee,
			now: A,
			onAct: (e, t) => void ye(e, t),
			onOpenPage: () => n(un)
		})), N.waiting.length > 5 && /* @__PURE__ */ u(X, { children: /* @__PURE__ */ u(Q, {
			label: `Show all ${N.waiting.length}`,
			onClick: () => n(un)
		}) })]
	}), Te = /* @__PURE__ */ u(J, {
		id: "in-flight",
		title: "In flight",
		count: N.inFlight.length,
		summary: g?.crews && g.crews.stale > 0 ? `${g.crews.stale} stale` : void 0,
		open: !0,
		children: z("inFlight", "No crew has a claim right now.", N.inFlight.length, () => /* @__PURE__ */ u(yn, {
			rows: N.inFlight,
			now: A
		}))
	}), Ee = /* @__PURE__ */ u(J, {
		id: "queue",
		title: "Release queue",
		count: N.queue?.head.length,
		summary: N.queue ? xn(N.queue) : void 0,
		children: z("queue", N.queue?.held ? `Nothing is next. ${N.queue.held} held.` : "Nothing is next in the queue.", N.queue?.head.length ?? 0, () => /* @__PURE__ */ u(Y, { children: N.queue.head.map((e) => /* @__PURE__ */ u(Z, {
			"data-queue-head": !0,
			icon: w,
			title: e.title,
			chips: /* @__PURE__ */ u(q, {
				tone: "info",
				children: "Next"
			}),
			age: e.taskId,
			meta: `${e.repository} · ${e.reason}`
		}, e.taskId)) }))
	}), De = /* @__PURE__ */ u(J, {
		id: "recent",
		title: "Recent merges",
		count: N.recent.length,
		summary: N.recent[0] ? `last ${K(N.recent[0].at, A)}` : void 0,
		children: z("recent", "Nothing finished lately.", N.recent.length, () => /* @__PURE__ */ u(Y, { children: N.recent.map((e) => /* @__PURE__ */ u(Z, {
			"data-recent-row": !0,
			icon: v,
			title: e.title,
			age: K(e.at, A),
			ageTip: $(e.at, A),
			meta: [e.repository, e.taskId].filter(Boolean).join(" · ")
		}, e.taskId)) }))
	}), Oe = /* @__PURE__ */ d("div", {
		"data-panel-line": !0,
		"data-stopped": R ? "" : void 0,
		style: {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			flexWrap: "wrap"
		},
		children: [/* @__PURE__ */ u(q, {
			tone: R ? "danger" : "ok",
			children: R ? "Line stopped" : "Line running"
		}), /* @__PURE__ */ u(We, { children: /* @__PURE__ */ u(rn, { workspaceId: a }) })]
	}), B = N.stops.length > 0 && /* @__PURE__ */ u(Y, { children: N.stops.map((e) => /* @__PURE__ */ u(Z, {
		icon: b,
		title: e
	}, e)) }), V = /* @__PURE__ */ d(Dt, {
		end: /* @__PURE__ */ d(l, { children: [/* @__PURE__ */ u(Rt, {
			workspaceId: a,
			onRefresh: () => void M()
		}), /* @__PURE__ */ d("button", {
			type: "button",
			"aria-label": "Open Avoozl",
			"data-open-avoozl": !0,
			"data-pp-act": !0,
			onClick: () => n(un),
			style: {
				background: "var(--bg-elevated, var(--card))",
				fontWeight: 600
			},
			children: [/* @__PURE__ */ u(te, { size: 16 }), "Open Avoozl"]
		})] }),
		children: [/* @__PURE__ */ u(q, {
			tone: "info",
			tip: Ce ? `This Avoozl is called ${Ce}.` : void 0,
			children: Ce ?? "Avoozl"
		}), /* @__PURE__ */ u("span", {
			"data-recap-line": !0,
			style: {
				fontSize: 11,
				color: "var(--muted)"
			},
			children: L ? "Loading…" : `${N.waiting.length} waiting on you · ${N.inFlight.length} in flight · ${R ? "line stopped" : "line running"}`
		})]
	}), ke = /* @__PURE__ */ d(Ot, { children: [
		Oe,
		N.queue && /* @__PURE__ */ d(q, {
			tone: N.queue.next ? "info" : "muted",
			tap: !0,
			tip: `Release queue: ${xn(N.queue)}${N.queue.mode ? `. Mode: ${N.queue.mode}.` : "."}`,
			"data-strip-queue": !0,
			children: ["Queue ", xn(N.queue)]
		}),
		N.recent[0] && /* @__PURE__ */ d(q, {
			tap: !0,
			tip: `${N.recent.length} recent merge${N.recent.length === 1 ? "" : "s"}. Last: ${N.recent[0].title}, ${$(N.recent[0].at, A)}.`,
			"data-strip-merged": !0,
			children: [
				"Merged ",
				N.recent.length,
				" · ",
				K(N.recent[0].at, A)
			]
		})
	] }), H = bt(g && !g.driver ? {
		state: "unknown",
		slot: null,
		href: null,
		openedAt: null,
		lastSeenAt: null
	} : g?.driver), Ae = L ? null : /* @__PURE__ */ d(Y, { children: [/* @__PURE__ */ u(Z, {
		"data-panel-driver": H.state,
		icon: _,
		title: "Driver session",
		chips: /* @__PURE__ */ d(l, { children: [/* @__PURE__ */ u(q, {
			tone: H.state === "running" ? "ok" : H.state === "unknown" ? "warn" : "muted",
			children: gn[H.state]
		}), H.workspace && /* @__PURE__ */ u(q, {
			"data-driver-workspace": !0,
			tip: "The workspace this driver releases work for.",
			children: H.workspace
		})] }),
		multi: !0,
		meta: `${H.note}${ge?.lastSeenAt && H.state !== "none" ? ` Last seen ${$(ge.lastSeenAt, A)}.` : ""}`,
		actions: /* @__PURE__ */ d(l, { children: [H.link && /* @__PURE__ */ u(Q, {
			label: "Open driver session",
			href: G(H.link)
		}), H.start && /* @__PURE__ */ u(Q, {
			label: H.link ? "Start a new driver session" : "Start a driver session",
			primary: !H.link,
			tip: "Opens a new chat on the avoozl-driver agent and sends its first message. It releases work only while the chat is open.",
			onClick: () => i({
				agent: "avoozl-driver",
				message: "Start the Avoozl driver session. Keep this chat open. Release ready work in graph order, watch pull requests through checks and merge, and bring anything that needs a person to me. Use the avoozl tools. Do not merge anything yourself and do not code issues yourself.",
				autoSend: !0
			}),
			"data-driver-start": !0
		})] })
	}), H.elsewhere && /* @__PURE__ */ u(Z, {
		"data-driver-elsewhere": !0,
		noTip: !0,
		icon: _,
		title: `${H.elsewhere.text} `,
		actions: /* @__PURE__ */ u(Q, {
			label: "Open",
			href: G(H.elsewhere.href)
		})
	})] }), je = I && /* @__PURE__ */ u("div", {
		"data-since-recap": !0,
		children: /* @__PURE__ */ d(J, {
			id: "since",
			title: "Since you left",
			summary: I.since,
			open: !0,
			children: [
				I.finished.length > 0 && /* @__PURE__ */ u("div", {
					"data-since-finished": !0,
					children: /* @__PURE__ */ u(Y, { children: I.finished.slice(0, 5).map((e) => /* @__PURE__ */ u(Z, {
						icon: v,
						title: e.title,
						chips: /* @__PURE__ */ u(q, {
							tone: "ok",
							children: "Finished"
						})
					}, e.taskId)) })
				}),
				I.needsYou.length > 0 && /* @__PURE__ */ u("div", {
					"data-since-needs-you": !0,
					children: /* @__PURE__ */ u(Y, { children: I.needsYou.slice(0, 5).map((e) => /* @__PURE__ */ u(Z, {
						icon: b,
						title: e.title,
						chips: /* @__PURE__ */ u(q, {
							tone: "warn",
							children: e.label
						})
					}, e.key)) })
				}),
				/* @__PURE__ */ u(X, { children: /* @__PURE__ */ u(Q, {
					label: "Got it",
					onClick: () => j(null)
				}) })
			]
		})
	}), U = P.kind === "crew" ? g?.crews?.rows.find((e) => e.crewId === P.crew) : void 0, Me = F ? (g?.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === F.name || e.planId === F.plan?.id)) : [];
	return /* @__PURE__ */ d(Et, {
		kind: P.kind,
		children: [
			V,
			S && /* @__PURE__ */ d(X, {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", S]
			}),
			E && /* @__PURE__ */ u(X, {
				role: "status",
				children: E
			}),
			P.kind === "spec-builder" && /* @__PURE__ */ d(l, { children: [
				/* @__PURE__ */ u("div", {
					"data-panel-spec": !0,
					children: /* @__PURE__ */ u(J, {
						id: "spec",
						title: `Spec check: ${P.spec}`,
						open: !0,
						children: F ? /* @__PURE__ */ u(l, { children: /* @__PURE__ */ d(Y, { children: [
							/* @__PURE__ */ u(Z, {
								icon: w,
								title: `Files: ${F.files.join(", ") || "none"}`
							}),
							/* @__PURE__ */ u(Z, {
								icon: w,
								title: `Tasks: ${F.taskCount}`
							}),
							/* @__PURE__ */ u(Z, {
								icon: F.counts.error > 0 ? b : v,
								title: `Problems: ${F.counts.error} errors, ${F.counts.warning} warnings`,
								chips: /* @__PURE__ */ u(q, {
									tone: F.counts.error > 0 ? "danger" : F.counts.warning > 0 ? "warn" : "ok",
									children: F.counts.error > 0 ? "Fix first" : F.counts.warning > 0 ? "Warnings" : "Clean"
								})
							}),
							/* @__PURE__ */ u(Z, {
								icon: F.plan?.approved ? v : x,
								title: F.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl.",
								meta: et(P, {
									files: F.files,
									approved: !!F.plan?.approved
								}) ? "tasks.md is written and not approved yet." : F.plan?.approved ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it." : null,
								actions: F.plan ? F.plan.approved ? null : /* @__PURE__ */ u(Q, {
									label: "Approve for Avoozl",
									primary: !0,
									disabled: F.counts.error > 0 || !F.hash,
									onClick: () => void be()
								}) : /* @__PURE__ */ u(Q, {
									label: "Store this spec",
									onClick: () => void xe()
								})
							})
						] }) }) : /* @__PURE__ */ u(X, { children: L ? "Loading…" : "Avoozl has not read this spec folder yet." })
					})
				}),
				F?.plan?.approved && /* @__PURE__ */ u(J, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: Me.length,
					open: !0,
					children: Me.length === 0 ? /* @__PURE__ */ u(X, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ u(Y, { children: Me.slice(0, 6).map((e) => /* @__PURE__ */ u(Z, {
						"data-spec-queue-row": e.state,
						icon: w,
						title: e.title,
						chips: /* @__PURE__ */ u(q, {
							tone: "info",
							children: e.state
						}),
						meta: e.reason
					}, e.taskId)) })
				}),
				ke,
				B
			] }),
			P.kind === "crew" && /* @__PURE__ */ d(l, { children: [
				/* @__PURE__ */ u("div", {
					"data-panel-crew": !0,
					children: /* @__PURE__ */ d(J, {
						id: "crew",
						title: `Crew ${P.crew}`,
						open: !0,
						children: [U ? /* @__PURE__ */ d(Y, { children: [/* @__PURE__ */ u(Z, {
							icon: U.pr ? C : D,
							title: `${U.repository}#${U.number} ${U.title}: ${U.phase ?? "no phase"}${U.pr ? `, PR #${U.pr}` : ""}${U.stale ? " (stale)" : ""}`,
							href: G(U.url),
							age: U.updated ? K(U.updated, A) : null,
							ageTip: U.updated ? `Updated ${$(U.updated, A)}` : void 0,
							meta: U.updated ? `Updated ${$(U.updated, A)}` : null,
							actions: /* @__PURE__ */ d(l, { children: [U.prUrl && /* @__PURE__ */ u(Q, {
								label: `PR #${U.pr}`,
								href: G(U.prUrl)
							}), U.commentUrl && /* @__PURE__ */ u(Q, {
								label: "Crew comment",
								href: G(U.commentUrl)
							})] }),
							multi: !0
						}), /* @__PURE__ */ u("li", {
							"data-pp-row": !0,
							style: { gridTemplateColumns: "minmax(0,1fr)" },
							children: /* @__PURE__ */ u(W, {
								text: Ke(U).map((e) => `${e.label}: ${e.state}`).join(", "),
								children: /* @__PURE__ */ u("span", {
									"data-rail": !0,
									role: "img",
									"aria-label": Ke(U).map((e) => `${e.label} ${e.state}`).join(", "),
									style: {
										display: "inline-flex",
										gap: 3
									},
									children: Ke(U).map((e) => /* @__PURE__ */ u("i", {
										"data-rail-step": e.state,
										style: {
											display: "block",
											width: 16,
											height: 8,
											borderRadius: 3,
											background: e.state === "done" ? "var(--ok)" : e.state === "now" ? "var(--accent)" : "var(--border)"
										}
									}, e.label))
								})
							})
						})] }) : /* @__PURE__ */ u(X, { children: L ? "Loading…" : Se("inFlight") ? mn.inFlight : "No live claim from this crew in Avoozl's repositories." }), /* @__PURE__ */ u(X, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })]
					})
				}),
				ke,
				B
			] }),
			P.kind === "avoozl" && /* @__PURE__ */ d(l, { children: [
				ke,
				B,
				Ae,
				je,
				we,
				Te,
				Ee,
				De
			] }),
			P.kind === "other" && /* @__PURE__ */ d("div", {
				"data-panel-recap": !0,
				children: [
					ke,
					B,
					Ae,
					je,
					we,
					Te,
					Ee,
					De
				]
			})
		]
	});
}
function xn(e) {
	return [
		e.claimed ? `${e.claimed} claimed` : "",
		`${e.next} next`,
		e.held ? `${e.held} held` : ""
	].filter(Boolean).join(" · ");
}
export { bn as default };
