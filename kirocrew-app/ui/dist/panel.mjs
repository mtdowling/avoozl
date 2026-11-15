import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Btn as f, Input as p } from "@kirocrew/app-sdk/ui";
import { Check as m, ChevronDown as h, ChevronRight as g, ChevronsDownUp as _, ChevronsUpDown as v, CircleAlert as y, CircleDot as b, CirclePlus as x, ExternalLink as S, GitBranch as C, GitPullRequest as w, Hand as ee, Inbox as T, MessageSquare as te, Pause as E, Play as ne, Radar as re, RefreshCw as ie, X as ae } from "lucide-react";
import { createPortal as oe } from "react-dom";
import { Fragment as D, jsx as O, jsxs as k } from "react/jsx-runtime";
// kirocrew-app/ui/src/workspace-api.ts
var A = "/apps/avoozl/api/command";
function j(e) {
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
function se(e) {
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
function ce(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/demo-api.ts
var le = "@demo", ue = "Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.";
function M(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function de(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function fe(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function pe(e, t) {
	let n = (e) => e.catch((e) => {
		let n = fe(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = de(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => M("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => M("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!M("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: me }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var me = {
	defaultWorkspace: le,
	items: [{
		id: le,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, he = e({
	active: !1,
	notice: () => void 0
}), ge = () => n(he);
function _e() {
	let e = l(), { active: t, notice: n } = ge();
	return o(() => t ? pe(e, n) : e, [
		e,
		t,
		n
	]);
}
function ve() {
	let e = u(), { active: t, notice: n } = ge(), r = e.openChat;
	return o(() => t ? { openChat: () => n(ue) } : { openChat: r }, [
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
function ye(e, t, n) {
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
var be = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function xe(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function F(e, t, n) {
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
var I = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
};
I.nodeWidth, I.nodeHeight, I.columnGap, I.rowGap, I.margin, I.clusterLabel, I.clusterGap;
// kirocrew-app/ui/src/nav-history.ts
var Se = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), L = (e) => Se.has(e);
function Ce(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function we() {
	let e = [], t = 1, n = () => {
		let t = Ce(e, (e) => e.kind === "tab");
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
			let t = Ce(e, (e) => L(e.kind));
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
				let t = Ce(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function Te(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var Ee = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function R(e = Ee) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: we(),
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
		restoreScroll: (t) => void e(() => Te(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
// kirocrew-app/ui/src/NavHistory.tsx
var De = "data-avoozl-app", Oe = e(null), z = null, ke = () => n(Oe) ?? (z ??= R());
function Ae(e, t, n, i, a) {
	let o = ke(), c = s({
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
var je = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", Me = "color-mix(in srgb, var(--text) 30%, transparent)", Ne = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)"
}, B = [], V = null;
function Pe() {
	V || (V = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function H() {
	!B.length && V && (document.documentElement.style.overflow = V.html, document.body.style.overflow = V.body, V = null);
}
var Fe = e(null), U = () => n(Fe);
function W(e) {
	let n = We(), r = e.side === "right", i = xe(r ? "(max-width: 640px)" : "(max-width: 767px)"), o = s(null), l = s(null), [u, d] = c(null), f = s(e);
	f.current = e;
	let p = s(!1), m = t(() => {
		let { unsaved: e, onDismiss: t } = f.current;
		if (!e) return t();
		p.current || (p.current = !0, n(e).then((e) => {
			p.current = !1, e && f.current.onDismiss();
		}));
	}, [n]);
	Ae(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", m), a(() => {
		let e = o.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), B.push(t), Pe(), d(e), (l.current?.querySelector(`:is(${je}):not([data-shelf-close])`) ?? l.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || B.at(-1) !== t || !l.current) return;
			let n = [...l.current.querySelectorAll(je)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = F(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), B.splice(B.indexOf(t), 1), H(), e.open && e.close(), n?.isConnected && n.focus();
		};
	}, []);
	let h = e.title !== void 0, g = r ? {
		width: i ? "100%" : `min(${e.width ?? "36rem"}, 100vw)`,
		height: "100%",
		maxHeight: "none",
		borderRadius: 0
	} : i ? {
		width: "100%",
		height: "100%",
		maxHeight: "none",
		borderRadius: 0
	} : h || e.height ? {
		width: `min(${e.width ?? "64rem"}, 94vw)`,
		height: `min(${e.height ?? "52rem"}, 90vh)`,
		borderRadius: 10
	} : {
		width: `min(${e.width ?? "36rem"}, 94vw)`,
		maxHeight: "88vh",
		borderRadius: 10
	}, _ = h || e.plain ? "relative flex flex-col overflow-hidden border shadow-lg outline-none" : "relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none", v = /* @__PURE__ */ O("button", {
		type: "button",
		"data-shelf-close": !0,
		"aria-label": "Close",
		onClick: m,
		className: "rounded border p-1",
		style: {
			cursor: "pointer",
			background: "none",
			borderColor: "var(--border)",
			color: "inherit",
			display: "inline-flex"
		},
		children: /* @__PURE__ */ O(ae, {
			size: 16,
			"aria-hidden": "true"
		})
	});
	return oe(/* @__PURE__ */ k("dialog", {
		ref: o,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? i ? "shelf-full" : "shelf" : i ? "full" : h ? "large" : "box",
		[De]: "",
		...e.attrs,
		onCancel: (e) => {
			e.preventDefault(), m();
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
		children: [/* @__PURE__ */ O("style", { children: "dialog[data-modal]::backdrop{background:transparent}" + (r ? "@media (prefers-reduced-motion:no-preference){@keyframes avoozl-shelf-in{from{transform:translateX(100%)}to{transform:none}}[data-modal-box][data-shelf]{animation:avoozl-shelf-in 180ms ease-out}}" : "") }), /* @__PURE__ */ k("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: r ? "stretch" : "center",
				justifyContent: r ? "flex-end" : "center"
			},
			children: [/* @__PURE__ */ O("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: m,
				style: {
					position: "absolute",
					inset: 0,
					background: Me
				}
			}), /* @__PURE__ */ O("div", {
				ref: (t) => {
					l.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				"data-shelf": r ? "" : void 0,
				tabIndex: -1,
				className: _,
				style: {
					...Ne,
					...g,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ O(Fe.Provider, {
					value: u,
					children: h ? /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ k("div", {
						className: r ? "min-h-0 flex-1 overflow-y-auto" : "contents",
						children: [/* @__PURE__ */ k("div", {
							className: "flex items-center gap-2 border-b px-4 py-3",
							style: { borderColor: "var(--border)" },
							children: [/* @__PURE__ */ O("h3", {
								id: `${e.id}-title`,
								className: "min-w-0 flex-1 text-lg font-semibold",
								children: e.title
							}), r && v]
						}), /* @__PURE__ */ O("div", {
							className: r ? "p-4" : "min-h-0 flex-1 overflow-y-auto p-4",
							children: e.children
						})]
					}), e.footer && /* @__PURE__ */ O("div", {
						className: "border-t px-4 py-3",
						style: { borderColor: "var(--border)" },
						children: e.footer
					})] }) : /* @__PURE__ */ k(D, { children: [r && /* @__PURE__ */ O("div", {
						className: "flex justify-end",
						children: v
					}), e.children] })
				})
			})]
		})]
	}), document.body);
}
// kirocrew-app/ui/src/Tooltip.tsx
var Ie = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Le = "button, a[href], input, select, textarea, summary, [role=\"button\"]", Re = `${Le}, [tabindex]`, ze = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function G(e) {
	let t = i(), n = U(), l = s(null), u = s(null), [d, f] = c(!1), [p, m] = c(null), h = o(() => P({ onChange: f }), []);
	r(() => h.hide, [h]), r(() => {
		if (!d) return;
		let e = (e) => h.key(e.key), t = () => h.hide(), n = (e) => {
			l.current?.contains(e.target) || h.hide();
		};
		return document.addEventListener("keydown", e), document.addEventListener("pointerdown", n), window.addEventListener("scroll", t, !0), window.addEventListener("resize", t), () => {
			document.removeEventListener("keydown", e), document.removeEventListener("pointerdown", n), window.removeEventListener("scroll", t, !0), window.removeEventListener("resize", t);
		};
	}, [d, h]), a(() => {
		if (!d || !l.current || !u.current) return m(null);
		let e = l.current.getBoundingClientRect(), t = u.current.getBoundingClientRect();
		m(ye(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [d, e.text]);
	let g = e.text?.trim(), [_, v] = c(!1);
	a(() => {
		v(!!g && !l.current?.querySelector(Re));
	});
	let y = typeof e.children == "function" ? e.children(g ? t : void 0) : e.children;
	return g ? /* @__PURE__ */ k("span", {
		ref: l,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => h.enter(e.pointerType),
		onPointerLeave: (e) => e.pointerType !== "touch" && h.leave(),
		onPointerDown: (e) => {
			let t = e.target, n = t.closest(Le), r = t.closest("[data-info-tip]") !== null || !n || !e.currentTarget.contains(n);
			e.pointerType === "touch" && r ? h.tap() : h.hide();
		},
		tabIndex: _ ? 0 : void 0,
		"aria-describedby": _ ? t : void 0,
		onFocus: (e) => h.focus(ze(e.target)),
		onBlur: h.blur,
		"data-tooltip-anchor": !0,
		children: [
			y,
			/* @__PURE__ */ O("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: g
			}),
			d && oe(/* @__PURE__ */ k("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": p?.side,
				style: {
					position: "fixed",
					top: p?.top ?? 0,
					left: p?.left ?? 0,
					visibility: p ? "visible" : "hidden",
					zIndex: be.tooltip,
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
					animation: Ie() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ O("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					g,
					p && /* @__PURE__ */ O("span", {
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
	}) : /* @__PURE__ */ O(D, { children: y });
}
var Be = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Ve = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function He(e) {
	let t = e.icon;
	return /* @__PURE__ */ O(G, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ k(f, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...Ve,
				...e.style
			},
			children: [/* @__PURE__ */ O(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
var Ue = e(async () => !1), We = () => n(Ue);
function Ge({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ k(Ue.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ k(W, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			children: [
				/* @__PURE__ */ O("h3", {
					id: "avoozl-confirm-title",
					className: "text-base font-semibold",
					children: n.title
				}),
				/* @__PURE__ */ O("p", {
					id: "avoozl-confirm-body",
					className: "text-sm text-muted",
					children: n.body
				}),
				/* @__PURE__ */ k("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ O(f, {
						ref: a,
						type: "button",
						onClick: () => l(!1),
						children: "Cancel"
					}), /* @__PURE__ */ O(f, {
						type: "button",
						"data-danger": !0,
						onClick: () => l(!0),
						style: Be,
						children: n.action
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/views-api.ts
function Ke(e) {
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
function qe(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var Je = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function K(e) {
	return typeof e == "string" && Je.test(e) ? e : qe(e) ?? void 0;
}
// kirocrew-app/ui/src/dashboard-api.ts
var Ye = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function Xe(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Ye.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/driver-api.ts
function Ze(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
var Qe = (e) => ({
	running: "A driver session is working. Open it to watch or steer.",
	idle: "The driver session has been quiet for a while. Open it to check on it, or start a new one.",
	none: "No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.",
	unknown: "Avoozl could not read the driver session. It tries again soon."
})[e], $e = (e, t) => Ze(new Date(e).toISOString(), t);
function et(e, t, n) {
	if (!t || n - t.at < 6e4) return null;
	let r = new Set(t.waitingKeys), i = e.recent.filter((e) => Date.parse(e.at) > t.at), a = e.waiting.filter((e) => !r.has(e.key)).map(({ key: e, title: t, label: n }) => ({
		key: e,
		title: t,
		label: n
	}));
	return !i.length && !a.length ? null : {
		since: $e(t.at, n),
		finished: i,
		needsYou: a
	};
}
// kirocrew-app/ui/src/panel-chat.ts
function tt(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function nt(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${rt(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") || t.driver && e === t.driver ? { kind: "avoozl" } : { kind: "other" };
}
var rt = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function it(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/flow-api.ts
function at(e) {
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
var ot = "avoozl:line-changed", st = () => {
	typeof window < "u" && window.dispatchEvent(new Event(ot));
};
function ct(e) {
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
		models: () => e.get("/api/models").then(at),
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
function lt(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var ut = [
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
], dt = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], ft = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", pt = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function mt(e) {
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
function ht(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${lt(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/panel-api.ts
async function gt(e, t) {
	return (await e.post(A, {
		operation: "panel.view",
		input: {},
		workspaceId: t
	})).result;
}
function _t(e, t) {
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
var vt = /* @__PURE__ */ new Set([
	"needs-human",
	"github-conflict",
	"tracker-conflict",
	"review",
	"ready-to-merge",
	"branch-landing",
	"content-match",
	"content-unavailable"
]), yt = {
	"needs-human": "Needs you",
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit",
	review: "Review",
	"ready-to-merge": "Ready to merge",
	"branch-landing": "Ready to land",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function bt(e) {
	if (!vt.has(e.kind) || e.kind === "needs-human" && e.reason === "hand-set-review" || e.kind === "ready-to-merge" && e.integrate) return null;
	let t = [], n = K(e.link) ?? K(e.issue?.url);
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
		label: yt[e.kind] ?? e.kind,
		title: e.title,
		detail: e.detail,
		at: e.changedAt ?? null,
		actions: t
	};
}
function xt(e, t, n) {
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
		issueUrl: K(e.url) ?? null,
		prUrl: K(e.prUrl) ?? null,
		prNumber: e.pr,
		attach: e.crewId ? `/chat?sid=crew-${encodeURIComponent(e.crewId)}` : null,
		noAttach: e.crewId ? null : "The claim names no crew.",
		pr: !!e.pr,
		check: n,
		claimedAt: e.claimedAt ?? null,
		updated: e.updated
	};
}
function St(e) {
	let t = K(e.attachUrl) ?? null;
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
		noAttach: t ? null : `Set the dashboard link for ${e.host} to open its session.`,
		pr: !1,
		check: null,
		claimedAt: null,
		updated: e.updatedAt || null
	};
}
function Ct(e) {
	let t = [];
	e.conflicts || t.push("waiting"), !e.crews && !e.remote && t.push("inFlight"), e.queue || t.push("queue"), e.flow || t.push("recent");
	let n = (e.conflicts ?? []).map(bt).filter((e) => e !== null), r = /* @__PURE__ */ new Map();
	for (let t of e.crews?.groups ?? []) for (let e of t.rows) e.instanceId && r.set(e.instanceId, t.name);
	let i = [...(e.crews?.rows ?? []).map((t) => xt(t, r, e.checks?.[`${t.repository}#${t.pr}`] ?? null)), ...(e.remote ?? []).map(St)], a = null;
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
	})), s = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(ht);
	return {
		waiting: n,
		inFlight: i,
		queue: a,
		recent: o,
		stops: s,
		unread: t
	};
}
function wt(e) {
	let t = e?.state ?? "none", n = e?.workspace ?? null, r = t === "none" || t === "idle" ? e?.others?.[0] : void 0;
	return {
		state: t,
		link: e?.href ?? null,
		start: t === "none" || t === "idle",
		note: Qe(t),
		workspace: n,
		elsewhere: r ? {
			text: `No driver for ${n ?? "this workspace"}. ${r.workspace} has one:`,
			href: r.href,
			slot: r.slot,
			workspace: r.workspace
		} : null
	};
}
function Tt(e, t) {
	return t && e?.others?.find((e) => e.slot === t)?.root || null;
}
var Et = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "");
	return n(e) === n(t);
};
function Dt(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 1 ? "now" : r < 60 ? `${r}m` : r < 2880 ? `${Math.round(r / 60)}h` : `${Math.round(r / 60 / 24)}d`;
}
function Ot(e) {
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
var kt = "\n[data-pp]{container-type:inline-size;font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}\n[data-pp] *{box-sizing:border-box}\n[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}\n[data-pp-head-name]{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}\n[data-pp-head-instance]{font-weight:400;color:var(--muted)}\n[data-pp-head-tools]{flex:none;display:inline-flex;align-items:center;gap:2px}\n[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto}\n[data-pp-head-chip]{flex:none;display:inline-flex;align-items:center;gap:6px;padding:2px 4px;background:transparent;border:0;border-radius:6px;font:inherit;font-size:12px;font-weight:500;line-height:16px;white-space:nowrap;color:var(--text);cursor:pointer}\n[data-pp-head-chip]:hover{background:var(--bg-hover)}\n[data-pp-head-chip-count]{color:var(--muted);font-variant-numeric:tabular-nums}\n[data-pp-hand]{flex:none;color:var(--warn,var(--warning,#b7791f))}\n[data-pp-pulse]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 25%,transparent);animation:pp-pulse 2s ease-in-out infinite}\n@keyframes pp-pulse{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 25%,transparent)}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--ok) 0%,transparent)}}\n@media (prefers-reduced-motion:reduce){[data-pp-pulse]{animation:none}}\n[data-pp-section]{border-bottom:1px solid var(--border)}\n[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}\n[data-pp-section-head]:hover{background:var(--bg-hover)}\n[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}\n[data-pp-section-title]{color:var(--text-strong,var(--text))}\n[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}\n[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}\n[data-pp-row]:hover{background:var(--bg-hover)}\n[data-pp-row-icon]{display:inline-flex;color:var(--muted)}\n[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}\n[data-pp-row-line]{display:flex;flex-wrap:nowrap;align-items:center;gap:0 6px;min-width:0;overflow:hidden}\n[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}\na[data-pp-row-title]{text-decoration:none}\na[data-pp-row-title]:hover{text-decoration:underline}\n[data-pp-row-line]>[data-tooltip-anchor]{flex:0 0 auto;max-width:100%}\n[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:0 1 auto;min-width:0}\n[data-pp-row-line]>[data-tooltip-anchor]:has([data-pp-age]){margin-left:auto}\n[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}\n[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}\n[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}\n[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}\n[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}\n[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}\n[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}\n[data-pp-act],[data-pp-icon]{min-height:22px;background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}\n[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}\n[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}\n[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}\n[data-pp-icon][data-bare]{padding:2px 5px;border-color:transparent}\n[data-pp-cells]{padding:0 12px 8px}\n[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}\n@media (max-width:640px){\n[data-pp-narrow-hide]{display:none}\n[data-pp-act][data-narrow-icon]{padding:2px 6px}\n}\n@container (max-width:520px){\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4)){flex-wrap:wrap}\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4))>[data-tooltip-anchor]:first-child{max-width:100%}\n}\n@container (max-width:520px){\n[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}\n[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}\n}\n";
function At() {
	return /* @__PURE__ */ O("style", { children: kt });
}
var jt = "avoozl.panel.folds", Mt = e(null);
function Nt() {
	try {
		let e = JSON.parse(window.localStorage.getItem(jt) ?? "{}");
		return e && typeof e == "object" && !Array.isArray(e) ? e : {};
	} catch {
		return {};
	}
}
function Pt() {
	let [e, n] = c(Nt), [r, i] = c({}), a = t((e) => {
		n(e);
		try {
			window.localStorage.setItem(jt, JSON.stringify(e));
		} catch {}
	}, []), s = t((t, n) => e[t] ?? n, [e]), l = t((e, t) => i((n) => n[e] === t ? n : {
		...n,
		[e]: t
	}), []), u = Object.keys(r);
	return o(() => ({
		isOpen: s,
		register: l,
		toggle: (t, n) => a({
			...e,
			[t]: !(e[t] ?? n)
		}),
		allOpen: u.length > 0 && u.every((t) => e[t] ?? r[t]),
		setAll: (t) => a({
			...e,
			...Object.fromEntries(u.map((e) => [e, t]))
		}),
		show: (t) => a({
			...e,
			[t]: !0
		})
	}), [
		s,
		l,
		a,
		e,
		r
	]);
}
function Ft(e) {
	let t = Pt();
	return /* @__PURE__ */ O(Mt.Provider, {
		value: t,
		children: /* @__PURE__ */ k("div", {
			"data-pp": !0,
			"data-panel-kind": e.kind,
			style: {
				display: "flex",
				flexDirection: "column"
			},
			children: [/* @__PURE__ */ O(At, {}), e.children]
		})
	});
}
function q(e) {
	let { tone: t = "muted", tip: n, href: r, children: i, ...a } = e;
	return /* @__PURE__ */ O(G, {
		text: n,
		children: r ? /* @__PURE__ */ O("a", {
			"data-pp-chip": !0,
			"data-tone": t,
			href: K(r),
			target: "_blank",
			rel: "noreferrer",
			style: { textDecoration: "none" },
			...a,
			children: i
		}) : /* @__PURE__ */ O("span", {
			"data-pp-chip": !0,
			"data-tone": t,
			...a,
			children: i
		})
	});
}
function It(e) {
	let t = n(Mt), r = t?.allOpen ? "Collapse all sections" : "Expand all sections", i = t?.allOpen ? _ : v;
	return /* @__PURE__ */ k("div", {
		"data-pp-head": !0,
		children: [
			/* @__PURE__ */ O(G, {
				text: e.tip ?? (e.instance ? `${e.name} · ${e.instance}` : e.name),
				children: /* @__PURE__ */ k("span", {
					"data-pp-head-name": !0,
					children: [e.name, e.instance && /* @__PURE__ */ k("span", {
						"data-pp-head-instance": !0,
						children: [" · ", e.instance]
					})]
				})
			}),
			/* @__PURE__ */ k("span", {
				"data-pp-head-tools": !0,
				children: [e.tools, t && /* @__PURE__ */ O(G, {
					text: r,
					children: /* @__PURE__ */ O("button", {
						type: "button",
						"data-pp-icon": !0,
						"data-bare": !0,
						"data-pp-toggle-all": !0,
						"aria-label": r,
						"aria-pressed": t.allOpen,
						onClick: () => t.setAll(!t.allOpen),
						children: /* @__PURE__ */ O(i, {
							size: 13,
							"aria-hidden": "true"
						})
					})
				})]
			}),
			e.chips,
			e.end && /* @__PURE__ */ O("span", {
				"data-pp-head-end": !0,
				children: e.end
			})
		]
	});
}
function Lt(e) {
	let { icon: t, count: r, words: i, tip: a, section: o, ...s } = e, c = n(Mt);
	return /* @__PURE__ */ O(G, {
		text: a,
		children: /* @__PURE__ */ k("button", {
			type: "button",
			"data-pp-head-chip": !0,
			"aria-label": `${i}: ${r}`,
			onClick: () => {
				c?.show(o), requestAnimationFrame(() => document.querySelector(`[data-panel-fold="${o}"]`)?.scrollIntoView({
					block: "start",
					behavior: "smooth"
				}));
			},
			...s,
			children: [
				t,
				/* @__PURE__ */ O("span", {
					"data-pp-narrow-hide": !0,
					"aria-hidden": "true",
					children: i
				}),
				/* @__PURE__ */ O("span", {
					"data-pp-head-chip-count": !0,
					"aria-hidden": "true",
					children: r
				})
			]
		})
	});
}
function J(e) {
	let t = n(Mt), r = !!e.open;
	a(() => t?.register(e.id, r), [
		t?.register,
		e.id,
		r
	]);
	let i = t ? t.isOpen(e.id, r) : r, o = i ? h : g;
	return /* @__PURE__ */ k("div", {
		"data-pp-section": !0,
		"data-panel-fold": e.id,
		"data-open": i ? "" : void 0,
		children: [/* @__PURE__ */ k("button", {
			type: "button",
			"data-pp-section-head": !0,
			"aria-expanded": i,
			onClick: () => t?.toggle(e.id, r),
			children: [
				/* @__PURE__ */ O(o, {
					size: 13,
					"data-pp-chevron": !0,
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ O("span", {
					"data-pp-section-title": !0,
					children: e.title
				}),
				e.count !== void 0 && e.count > 0 && /* @__PURE__ */ O(q, {
					tone: e.tone ?? "info",
					children: e.count
				}),
				e.summary && /* @__PURE__ */ O("span", {
					"data-pp-summary": !0,
					children: e.summary
				})
			]
		}), i && e.children]
	});
}
function Y(e) {
	return /* @__PURE__ */ O("ul", {
		"data-pp-list": !0,
		children: e.children
	});
}
function X(e) {
	return /* @__PURE__ */ O("p", {
		"data-pp-empty": !0,
		role: e.role,
		children: e.children
	});
}
function Z(e) {
	let { icon: t, title: n, href: r, chips: i, age: a, ageTip: o, meta: s, actions: c, multi: l, noTip: u, ...d } = e;
	return /* @__PURE__ */ k("li", {
		"data-pp-row": !0,
		"data-multi": l ? "" : void 0,
		...d,
		children: [
			/* @__PURE__ */ O("span", {
				"data-pp-row-icon": !0,
				children: /* @__PURE__ */ O(t, {
					size: 14,
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ k("span", {
				"data-pp-row-main": !0,
				children: [/* @__PURE__ */ k("span", {
					"data-pp-row-line": !0,
					children: [
						/* @__PURE__ */ O(G, {
							text: u ? null : n,
							display: "block",
							children: r ? /* @__PURE__ */ O("a", {
								"data-pp-row-title": !0,
								href: K(r),
								target: "_blank",
								rel: "noreferrer",
								children: n
							}) : /* @__PURE__ */ O("span", {
								"data-pp-row-title": !0,
								children: n
							})
						}),
						i,
						a && /* @__PURE__ */ O(G, {
							text: o,
							children: /* @__PURE__ */ O("span", {
								"data-pp-age": !0,
								children: a
							})
						})
					]
				}), s && /* @__PURE__ */ O(G, {
					text: s,
					display: "block",
					children: /* @__PURE__ */ O("span", {
						"data-pp-row-meta": !0,
						style: { display: "block" },
						children: s
					})
				})]
			}),
			c && /* @__PURE__ */ O("span", {
				"data-pp-actions": !0,
				children: c
			})
		]
	});
}
function Q(e) {
	let { label: t, icon: n, href: r, onClick: i, disabled: a, primary: o, tip: s, narrowIcon: c, name: l, ...u } = e, d = /* @__PURE__ */ k(D, { children: [n && /* @__PURE__ */ O(n, {
		size: 12,
		"aria-hidden": "true"
	}), c ? /* @__PURE__ */ O("span", {
		"data-pp-narrow-hide": !0,
		children: t
	}) : t] }), f = {
		"aria-label": l,
		"data-narrow-icon": c ? "" : void 0
	};
	return /* @__PURE__ */ O(G, {
		text: s,
		children: r ? /* @__PURE__ */ O("a", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			href: K(r),
			target: "_blank",
			rel: "noreferrer",
			...f,
			...u,
			children: d
		}) : /* @__PURE__ */ O("button", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			type: "button",
			disabled: a,
			onClick: i,
			...f,
			...u,
			children: d
		})
	});
}
var Rt = (e) => String(e).padStart(2, "0");
function zt(e, t) {
	let n = Math.max(0, Math.ceil(e));
	return !t && n < 100 ? `${n}s` : n >= 3600 ? `${Math.floor(n / 3600)}:${Rt(Math.floor(n % 3600 / 60))}:${Rt(n % 60)}` : `${Math.floor(n / 60)}:${Rt(n % 60)}`;
}
var Bt = (e, t) => e || t >= 3600 ? 7 : t < 100 ? 3 : 5, Vt = (e) => e?.cacheSeconds ? e.cacheSeconds : e?.cacheSeconds === 0 ? 20 : 60;
function Ht(e, t) {
	let n = e?.limitedUntil ? Date.parse(e.limitedUntil) : 0;
	return n > t ? Math.ceil((n - t) / 1e3) : 0;
}
function Ut(e, t, n) {
	if (n > 0) return `GitHub's rate limit is reached. Calls resume at ${new Date(Date.now() + n * 1e3).toLocaleTimeString()}. Refresh shows what Avoozl last read.`;
	let r = e?.resources?.core;
	return [`Reads again in ${t}s. GitHub answers are kept ${e?.cacheSeconds ?? 60}s (Settings > GitHub).`, r ? `${r.remaining} of ${r.limit} GitHub calls left this hour.` : ""].filter(Boolean).join(" ");
}
var Wt = (e) => e >= 100 ? "var(--danger)" : `color-mix(in srgb, var(--danger) ${Math.round(Math.max(0, e) * .8)}%, var(--muted))`;
// kirocrew-app/ui/src/task-api.ts
function $(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
// kirocrew-app/ui/src/settings-api.ts
function Gt(e) {
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
function Kt(e) {
	let { workspaceId: n, onRefresh: i, busy: a, bare: l } = e, u = _e(), d = o(() => Gt(u), [u]), [f, p] = c(null), [m, h] = c(60), [g, _] = c(() => Date.now()), v = s(i);
	v.current = i;
	let y = Vt(f), b = Ht(f, g), x = t(() => {
		n && d.get(n).then((e) => p(e.rate ?? null), () => {});
	}, [d, n]);
	r(x, [x]);
	let S = s(60), C = t(() => {
		v.current(), S.current = y, h(y), setTimeout(x, 1500);
	}, [y, x]);
	r(() => {
		S.current = Math.min(S.current, y), h(S.current);
	}, [y]), r(() => {
		let e = setInterval(() => {
			(typeof document > "u" || document.visibilityState !== "hidden") && (_(Date.now()), Ht(f, Date.now()) > 0 || (--S.current, S.current <= 0 ? C() : h(S.current)));
		}, 1e3);
		return () => clearInterval(e);
	}, [f, C]);
	let w = b > 0 ? b : m, ee = `Refresh, ${b > 0 ? "GitHub limit lifts in " : "reads again in "}${zt(w, b > 0)}`;
	if (l) {
		let e = b > 0 ? 100 : Math.round(Math.min(1, Math.max(0, 1 - m / y)) * 100);
		return /* @__PURE__ */ O(G, {
			text: Ut(f, m, b),
			children: /* @__PURE__ */ O("button", {
				type: "button",
				"data-pp-icon": !0,
				"data-bare": !0,
				"data-refresh-age": e,
				"data-limited": b > 0 ? "" : void 0,
				onClick: C,
				disabled: a,
				"aria-label": ee,
				style: { color: Wt(e) },
				children: /* @__PURE__ */ O(ie, {
					size: 13,
					"aria-hidden": "true"
				})
			})
		});
	}
	return /* @__PURE__ */ O(He, {
		icon: ie,
		onClick: C,
		disabled: a,
		tooltip: Ut(f, m, b),
		"aria-label": `Refresh, ${b > 0 ? "GitHub limit lifts in " : "reads again in "}${zt(w, b > 0)}`,
		children: /* @__PURE__ */ O("span", {
			style: {
				display: "inline-block",
				minWidth: `${Bt(b > 0, y)}ch`,
				textAlign: "right",
				fontVariantNumeric: "tabular-nums"
			},
			children: zt(w, b > 0)
		})
	});
}
// kirocrew-app/ui/src/StatusCells.tsx
var qt = "\n[data-sc-row]{container-type:inline-size}\n[data-sc-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}\n@container (max-width:420px){[data-sc-grid]{grid-template-columns:minmax(0,1fr)}}\n[data-sc]{display:flex;flex-wrap:nowrap;align-items:center;align-content:flex-start;gap:0 8px;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:18px;color:var(--text)}\n[data-sc-title]{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-weight:600;color:var(--text-strong,var(--text));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-sc-dot]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}\n[data-sc-dot][data-tone=ok]{background:var(--ok)}\n[data-sc-dot][data-tone=warn]{background:var(--warning,#b7791f)}\n[data-sc-dot][data-tone=danger]{background:var(--danger)}\n[data-sc-actions]{flex:none;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;margin-left:auto}\n[data-sc-act]{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--muted);font:inherit;text-decoration:none;cursor:pointer;transition:background-color .12s,color .12s}\n[data-sc-act]:hover{background:var(--bg-hover);color:var(--text)}\n[data-sc-act][data-primary]{color:var(--accent)}\n[data-sc-act]:disabled{opacity:.6;cursor:default}\n";
function Jt(e) {
	return /* @__PURE__ */ k("div", {
		"data-sc-row": !0,
		children: [/* @__PURE__ */ O("style", { children: qt }), /* @__PURE__ */ O("div", {
			"data-sc-grid": !0,
			children: e.children
		})]
	});
}
function Yt(e) {
	let { tone: t, title: n, tip: r, actions: i, ...a } = e;
	return /* @__PURE__ */ k("div", {
		"data-sc": !0,
		"data-tip": r,
		...a,
		children: [/* @__PURE__ */ O(G, {
			text: r,
			children: (e) => /* @__PURE__ */ k("span", {
				"data-sc-title": !0,
				tabIndex: 0,
				"aria-describedby": e,
				children: [/* @__PURE__ */ O("i", {
					"data-sc-dot": !0,
					"data-tone": t,
					"aria-hidden": "true"
				}), n]
			})
		}), i && /* @__PURE__ */ O("span", {
			"data-sc-actions": !0,
			children: i
		})]
	});
}
function Xt(e) {
	let { label: t, icon: n, onClick: r, href: i, primary: a, tip: o, ...s } = e;
	return /* @__PURE__ */ O(G, {
		text: o ?? t,
		children: i ? /* @__PURE__ */ O("a", {
			"data-sc-act": !0,
			"data-primary": a ? "" : void 0,
			"aria-label": t,
			href: K(i),
			...s,
			children: n
		}) : /* @__PURE__ */ O("button", {
			type: "button",
			"data-sc-act": !0,
			"data-primary": a ? "" : void 0,
			"aria-label": t,
			onClick: r,
			...s,
			children: n
		})
	});
}
// kirocrew-app/ui/src/plans-api.ts
function Zt(e) {
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
function Qt(e) {
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
var $t = "/api/apps/spec-builder/specs", en = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function tn(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function nn(e, t, n = 50) {
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
function rn(e, t, n) {
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
var an = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function on(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => tn(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = d && u ? an(d) : "", [p, m] = c(f), [h, g] = c(!1), [_, v] = c(!1), [y, b] = c(0), x = s(null);
	r(() => {
		h || m(f);
	}, [f, h]);
	let { shown: S, total: C } = o(() => nn(l, h ? p : ""), [
		l,
		p,
		h
	]);
	r(() => {
		x.current?.querySelector(`#${CSS.escape(`${n}-opt-${y}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [y, n]);
	let w = (t) => {
		e.onPick(t.id), g(!1), v(!1), m(u ? an(t) : "");
	}, ee = (t) => {
		let n = rn({
			open: _,
			active: y
		}, t.key, S.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (v(!0), b(n.state.active)) : n.kind === "pick" ? w(S[n.index]) : n.kind === "close" ? v(!1) : (m(""), g(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, T = _ && (S.length > 0 || h);
	return /* @__PURE__ */ k("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ O("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ O("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": T,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": T && S.length ? `${n}-opt-${y}` : void 0,
				autoComplete: "off",
				spellCheck: !1,
				value: p,
				placeholder: e.value ? void 0 : e.emptyLabel ?? e.placeholder,
				onChange: (e) => {
					m(e.target.value), g(!0), v(!0), b(0);
				},
				onFocus: () => {
					v(!0), b(0);
				},
				onBlur: () => {
					v(!1), h && !p.trim() && e.emptyLabel !== void 0 && e.value && e.onPick(""), g(!1);
				},
				onKeyDown: ee,
				className: "rounded border px-2 py-1 text-sm",
				style: en,
				"data-picker": !0
			}),
			/* @__PURE__ */ k("div", {
				hidden: !T,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: be.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ O("ul", {
						ref: x,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: S.map((e, t) => /* @__PURE__ */ k("li", {
							id: `${n}-opt-${t}`,
							role: "option",
							"aria-selected": t === y,
							onMouseDown: (t) => {
								t.preventDefault(), w(e);
							},
							onMouseEnter: () => b(t),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: t === y ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								/* @__PURE__ */ O("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.id
								}),
								/* @__PURE__ */ O("span", {
									className: "min-w-0 flex-1 truncate",
									children: e.title === e.id ? "" : e.title
								}),
								e.spec && /* @__PURE__ */ O("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.spec
								}),
								e.state && /* @__PURE__ */ O("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: e.state
								})
							]
						}, e.id))
					}),
					C === 0 && /* @__PURE__ */ O("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					C > S.length && /* @__PURE__ */ k("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [C - S.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var sn = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), cn = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function ln() {
	return /* @__PURE__ */ O("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function un(e) {
	return /* @__PURE__ */ k("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ O("style", { children: cn }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ k("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ k("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ O("input", {
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
					}), /* @__PURE__ */ k("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ k("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ O(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ O("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ O("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ k("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ O(ln, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var dn = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, fn = {
	...dn,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, pn = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, mn = 6e4;
function hn(e) {
	let t = _e(), n = o(() => ct(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, mn);
		return window.addEventListener(ot, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(ot, r);
		};
	}, [n, e]), i;
}
function gn(e) {
	let [t, n] = c(!1), r = hn(e.workspaceId);
	if (!e.workspaceId) return null;
	let i = r.length > 0, a = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; ");
	return /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(G, {
		text: i ? `The line is stopped: ${a}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (t) => e.bare ? /* @__PURE__ */ O("button", {
			type: "button",
			"data-pp-icon": !0,
			"data-bare": !0,
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": t,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : "Stop the line",
			onClick: () => n(!0),
			style: {
				color: "var(--danger)",
				borderColor: "var(--border)"
			},
			children: /* @__PURE__ */ O(E, {
				size: 13,
				"aria-hidden": "true"
			})
		}) : /* @__PURE__ */ k(f, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": t,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: i ? fn : dn,
			children: [/* @__PURE__ */ O(E, {
				size: 14,
				"aria-hidden": "true",
				style: i ? { color: "var(--danger)" } : void 0
			}), i ? "Line stopped" : "Stop the line"]
		})
	}), t && /* @__PURE__ */ O(_n, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), st(), e.onPulled?.();
		}
	})] });
}
function _n(e) {
	let n = _e(), i = o(() => ct(n), [n]), [a, l] = c(pt), [u, d] = c(null), [m, h] = c(null), [g, _] = c(!1), v = We(), y = s(null), b = (e) => l((t) => ({
		...t,
		...e
	})), x = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			se(n).repositories(r),
			Zt(n).stored(r),
			Ke(n).graph(r)
		]).then(([e, n, r]) => {
			t && d({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? sn(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		y.current?.querySelector("input, button")?.focus();
	}, []);
	let S = async () => {
		let { input: t, error: n } = mt(a);
		if (!t) return h(n ?? null);
		if (!t.full || await v({
			title: "Stop all agents?",
			body: "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.",
			action: "Stop all agents"
		})) {
			_(!0), h(null);
			try {
				await i.stop(e.workspaceId, t), e.onPulled();
			} catch (e) {
				h(j(e));
			} finally {
				_(!1);
			}
		}
	}, C = (e) => /* @__PURE__ */ O("p", {
		className: "text-sm text-muted",
		children: u ? e : "Reading…"
	}), w = (e) => /* @__PURE__ */ k("span", { children: [
		e,
		" ",
		/* @__PURE__ */ O("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), ee = (e, t, n, r, i) => n.length ? /* @__PURE__ */ O(on, {
		label: w(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : C(i), T = {
		all: null,
		repo: u?.repositories.length ? /* @__PURE__ */ k("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [w("Repository"), /* @__PURE__ */ k("select", {
				value: a.repository,
				onChange: (e) => b({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: pn,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ O("option", {
					value: "",
					children: "Choose…"
				}), u.repositories.map((e) => /* @__PURE__ */ O("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : C("No repository is registered."),
		spec: ee("Spec", a.spec, u?.specs ?? [], (e) => b({ spec: e }), "No spec is stored yet."),
		task: ee("Task", a.taskId, u?.tasks ?? [], (e) => b({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ k(W, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: y,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(pt()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		onDismiss: x,
		children: [
			/* @__PURE__ */ k("div", { children: [/* @__PURE__ */ k("h3", {
				id: "avoozl-stop-title",
				className: "flex items-center gap-1.5 text-base font-semibold",
				children: [/* @__PURE__ */ O(E, {
					size: 14,
					"aria-hidden": "true",
					style: { color: "var(--danger)" }
				}), "Stop the line"]
			}), /* @__PURE__ */ O("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			})] }),
			/* @__PURE__ */ O(un, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => b({ kind: e }),
				sections: dt.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ O("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: ft
					}) } : { fields: /* @__PURE__ */ O(un, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => b({ scope: e }),
						sections: ut.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: T[e.value]
						}))
					}) }
				}))
			}),
			/* @__PURE__ */ k("label", {
				className: "flex flex-col gap-1 text-sm",
				children: [
					/* @__PURE__ */ k("span", { children: ["Reason ", /* @__PURE__ */ O("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ O(p, {
						value: a.reason,
						maxLength: 200,
						placeholder: "The base is broken; looking into it",
						onChange: (e) => b({ reason: e.target.value }),
						"data-stop-reason": !0
					}),
					/* @__PURE__ */ O("span", {
						className: "text-xs text-muted",
						children: "One line. It shows on the banner and in Flow."
					})
				]
			}),
			m && /* @__PURE__ */ O("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: m
			}),
			/* @__PURE__ */ k("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [/* @__PURE__ */ O(f, {
					type: "button",
					onClick: x,
					children: "Cancel"
				}), /* @__PURE__ */ k(f, {
					type: "button",
					"data-danger": !0,
					"data-stop-confirm": !0,
					onClick: () => void S(),
					disabled: g,
					style: dn,
					children: [/* @__PURE__ */ O(E, {
						size: 14,
						"aria-hidden": "true"
					}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/instance-api.ts
function vn(e) {
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
function yn(e, t) {
	return e && (t === "header" || e.shared) ? e.name : null;
}
// kirocrew-app/ui/src/InstanceName.tsx
var bn = "avoozl:instance-changed";
function xn(e) {
	let n = _e(), i = o(() => vn(n), [n]), [a, s] = c(null), l = t(() => {
		e && i.view(e).then(s, () => void 0);
	}, [i, e]);
	return r(() => (l(), window.addEventListener(bn, l), () => window.removeEventListener(bn, l)), [l]), a;
}
// kirocrew-app/ui/src/Panel.tsx
var Sn = "/apps/avoozl", Cn = "avoozl.panel.away";
function wn(e) {
	try {
		let t = e?.getItem(Cn);
		e?.removeItem(Cn);
		let n = t ? JSON.parse(t) : null;
		return n && Number.isFinite(n.at) && Array.isArray(n.waitingKeys) ? n : null;
	} catch {
		return null;
	}
}
function Tn() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var En = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, Dn = {
	review: w,
	"ready-to-merge": w,
	"branch-landing": C
}, On = {
	running: "Running",
	idle: "Quiet",
	none: "Not started",
	unknown: "Unknown"
}, kn = {
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
function An(e) {
	return /* @__PURE__ */ O(Y, { children: e.rows.map((t) => /* @__PURE__ */ O(Z, {
		"data-waiting-row": t.kind,
		icon: Dn[t.kind] ?? y,
		title: t.title,
		chips: /* @__PURE__ */ O(q, {
			tone: "warn",
			children: t.label
		}),
		age: t.at ? Dt(t.at, e.now) : null,
		ageTip: t.at ? `Changed ${$(t.at, e.now)}` : void 0,
		meta: t.detail,
		multi: t.actions.length > 1,
		actions: t.actions.map((n) => n.kind === "link" && n.href.startsWith("/apps/") ? /* @__PURE__ */ O(Q, {
			label: n.label,
			onClick: e.onOpenPage
		}, n.label) : n.kind === "link" ? /* @__PURE__ */ O(Q, {
			label: n.label,
			href: K(n.href)
		}, n.label) : /* @__PURE__ */ O(Q, {
			label: n.label,
			disabled: e.busy === t.key,
			onClick: () => e.onAct(t, n)
		}, n.label))
	}, t.key)) });
}
function jn({ rows: e, now: t }) {
	return /* @__PURE__ */ O(Y, { children: e.map((e) => {
		let n = e.pr ? Ot(e.check) : null, r = [
			e.instance ?? (e.source === "radar" ? "No Avoozl" : null),
			e.crew ?? e.who,
			e.source === "radar" ? e.ref : e.who,
			e.phase ? null : "claim label, no claim comment"
		].filter(Boolean);
		return /* @__PURE__ */ O(Z, {
			"data-flight-row": e.source,
			icon: e.pr ? w : e.source === "radar" ? re : b,
			title: e.title,
			href: K(e.issueUrl),
			chips: /* @__PURE__ */ k(D, { children: [
				/* @__PURE__ */ O(q, {
					tone: e.stale ? "warn" : "info",
					tip: e.updated ? `Updated ${$(e.updated, t)}` : void 0,
					children: e.phase ?? "claimed"
				}),
				e.stale && /* @__PURE__ */ O(q, {
					tone: "warn",
					children: "Stale"
				}),
				n && /* @__PURE__ */ k(q, {
					tone: n.tone,
					tip: n.tip,
					href: K(e.prUrl),
					"data-flight-pr": !0,
					children: [
						"PR #",
						e.prNumber,
						" ",
						n.text
					]
				})
			] }),
			age: Dt(e.claimedAt ?? e.updated, t),
			ageTip: [e.claimedAt && `Claimed ${$(e.claimedAt, t)}`, e.updated && `updated ${$(e.updated, t)}`].filter(Boolean).join(", ") || void 0,
			meta: [...new Set(r)].join(" · "),
			actions: e.attach ? /* @__PURE__ */ O(Q, {
				label: "Session",
				name: "Session",
				narrowIcon: !0,
				icon: x,
				href: K(e.attach),
				tip: e.source === "radar" ? "Session. Opens the crew chat, if this crew runs on this machine. Type there to steer it." : "Session. Opens the worker chat on its crew. Type there to steer it.",
				"data-flight-session": !0
			}) : e.noAttach ? /* @__PURE__ */ O(G, {
				text: e.noAttach,
				children: /* @__PURE__ */ O("span", {
					"data-pp-chip": !0,
					"data-tone": "muted",
					children: "No chat"
				})
			}) : null
		}, e.key);
	}) });
}
function Mn() {
	let e = _e(), n = d(), { openChat: i } = ve(), [a, l] = c(ce(Tn()).workspaceId), [u, f] = c(null), [p, h] = c([]), [g, _] = c(null), [v, x] = c(null), [C, E] = c(null), [ae, oe] = c(null), [A, le] = c(() => Date.now()), [ue, M] = c(() => wn(Tn())), de = xn(a), fe = o(() => tt(window.location), []), pe = o(() => Zt(e), [e]), me = o(() => Ke(e), [e]), he = o(() => Qt(e), [e]);
	r(() => {
		a && se(e).list().then((e) => f(e.items.find((e) => e.id === a)?.name ?? null), () => void 0);
	}, [e, a]);
	let ge = s(a), ye = s(g);
	ye.current = g;
	let N = t(async () => {
		let t = ge.current;
		try {
			t || (t = (await se(e).list()).defaultWorkspace, ge.current = t, l(t));
		} catch (e) {
			x(j(e));
			return;
		}
		if (!t) return;
		let n = kn;
		try {
			n = await gt(e, t);
			let r = Tt(n.driver, fe);
			if (r) {
				let i = (await se(e).list()).items.find((e) => Et(e.root, r));
				i && i.id !== t && (t = i.id, ge.current = t, l(t), n = await gt(e, t));
			}
		} catch {}
		try {
			let t = await e.get($t);
			h((t.specs ?? []).map((e) => e.name));
		} catch {}
		x(null), _(n), le(Date.now());
	}, [e, fe]);
	r(() => _t(N, {
		intervalMs: 0,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [N]);
	let P = o(() => Ct(g ?? {}), [g]), be = g?.driver ?? null, xe = g?.specs ?? [], F = nt(fe, {
		specs: p,
		driver: be?.slot ?? null
	}), I = F.kind === "spec-builder" ? xe.find((e) => e.name === F.spec) : void 0, Se = s(P);
	Se.current = P, r(() => {
		let e = () => {
			if (ye.current) try {
				let e = {
					at: Date.now(),
					waitingKeys: Se.current.waiting.map((e) => e.key)
				};
				Tn()?.setItem(Cn, JSON.stringify(e));
			} catch {}
		}, t = () => {
			if (document.visibilityState === "hidden") return e();
			let t = wn(Tn());
			t && M(t);
		};
		return window.addEventListener("blur", e), window.addEventListener("focus", t), document.addEventListener("visibilitychange", t), () => {
			window.removeEventListener("blur", e), window.removeEventListener("focus", t), document.removeEventListener("visibilitychange", t);
		};
	}, []);
	let L = o(() => et(P, ue, A), [
		P,
		ue,
		A
	]), Ce = async (e, t) => {
		if (a && t.kind !== "link") {
			oe(e.key);
			try {
				t.kind === "resolve" ? await me.resolveConflict(a, t.taskId, t.field, t.choice) : await he.land(a, t.repository, t.branch, t.head), E(null), await N();
			} catch (e) {
				E(j(e));
			} finally {
				oe(null);
			}
		}
	}, we = async () => {
		if (a && I?.plan && I.hash) try {
			await pe.approve(a, I.plan.id, I.hash), E("Approved this revision for Avoozl."), await N();
		} catch (e) {
			E(j(e));
		}
	}, Te = async () => {
		if (a && I) try {
			await pe.store(a, I.name), E("Stored as a draft. Review it in Specs, then approve."), await N();
		} catch (e) {
			E(j(e));
		}
	}, Ee = (e) => P.unread.includes(e), R = g === null, De = P.stops.length > 0, Oe = yn(de, "header") ?? g?.instance?.name ?? null, z = (e, t, n, r) => Ee(e) ? /* @__PURE__ */ O(X, { children: R ? "Loading…" : En[e] }) : n === 0 ? /* @__PURE__ */ O(X, { children: t }) : r(), ke = /* @__PURE__ */ k(J, {
		id: "waiting",
		title: "Waiting on you",
		count: P.waiting.length,
		tone: "warn",
		open: !0,
		children: [z("waiting", "Nothing is waiting on you.", P.waiting.length, () => /* @__PURE__ */ O(An, {
			rows: P.waiting.slice(0, 5),
			busy: ae,
			now: A,
			onAct: (e, t) => void Ce(e, t),
			onOpenPage: () => n(Sn)
		})), P.waiting.length > 5 && /* @__PURE__ */ O(X, { children: /* @__PURE__ */ O(Q, {
			label: `Show all ${P.waiting.length}`,
			onClick: () => n(Sn)
		}) })]
	}), Ae = /* @__PURE__ */ O(J, {
		id: "in-flight",
		title: "In flight",
		count: P.inFlight.length,
		summary: g?.crews && g.crews.stale > 0 ? `${g.crews.stale} stale` : void 0,
		open: !0,
		children: z("inFlight", "No crew has a claim right now.", P.inFlight.length, () => /* @__PURE__ */ O(jn, {
			rows: P.inFlight,
			now: A
		}))
	}), je = /* @__PURE__ */ O(J, {
		id: "queue",
		title: "Release queue",
		count: P.queue?.head.length,
		summary: P.queue ? Nn(P.queue) : void 0,
		children: z("queue", P.queue?.held ? `Nothing is next. ${P.queue.held} held.` : "Nothing is next in the queue.", P.queue?.head.length ?? 0, () => /* @__PURE__ */ O(Y, { children: P.queue.head.map((e) => /* @__PURE__ */ O(Z, {
			"data-queue-head": !0,
			icon: T,
			title: e.title,
			chips: /* @__PURE__ */ O(q, {
				tone: "info",
				children: "Next"
			}),
			age: e.taskId,
			meta: `${e.repository} · ${e.reason}`
		}, e.taskId)) }))
	}), Me = /* @__PURE__ */ O(J, {
		id: "recent",
		title: "Recent merges",
		count: P.recent.length,
		summary: P.recent[0] ? `last ${Dt(P.recent[0].at, A)}` : void 0,
		children: z("recent", "Nothing finished lately.", P.recent.length, () => /* @__PURE__ */ O(Y, { children: P.recent.map((e) => /* @__PURE__ */ O(Z, {
			"data-recent-row": !0,
			icon: m,
			title: e.title,
			age: Dt(e.at, A),
			ageTip: $(e.at, A),
			meta: [e.repository, e.taskId].filter(Boolean).join(" · ")
		}, e.taskId)) }))
	}), Ne = /* @__PURE__ */ O(It, {
		name: "Avoozl",
		instance: Oe,
		tip: [Oe ? `Avoozl · ${Oe}` : "Avoozl", u ? `Workspace: ${u}` : ""].filter(Boolean).join(". "),
		tools: /* @__PURE__ */ O(Kt, {
			bare: !0,
			workspaceId: a,
			onRefresh: () => void N()
		}),
		chips: R ? null : /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(Lt, {
			"data-head-needs": !0,
			section: "waiting",
			icon: /* @__PURE__ */ O(ee, {
				size: 14,
				"data-pp-hand": !0,
				"aria-hidden": "true"
			}),
			count: P.waiting.length,
			words: "Needs me",
			tip: `${P.waiting.length} waiting on you. Open Waiting on you.`
		}), /* @__PURE__ */ O(Lt, {
			"data-head-flight": !0,
			section: "in-flight",
			icon: /* @__PURE__ */ O("i", {
				"data-pp-pulse": !0,
				"aria-hidden": "true"
			}),
			count: P.inFlight.length,
			words: "In flight",
			tip: `${P.inFlight.length} in flight. Open In flight.`
		})] }),
		end: /* @__PURE__ */ O("span", {
			"data-panel-line": !0,
			"data-stopped": De ? "" : void 0,
			style: { display: "inline-flex" },
			children: /* @__PURE__ */ O(Ge, { children: /* @__PURE__ */ O(gn, {
				bare: !0,
				workspaceId: a
			}) })
		})
	}), B = wt(g && !g.driver ? {
		state: "unknown",
		slot: null,
		href: null,
		openedAt: null,
		lastSeenAt: null
	} : g?.driver), V = g?.crews ? g.crews.groups?.length ?? 0 : null, Pe = R ? null : /* @__PURE__ */ O("div", {
		"data-pp-cells": !0,
		children: /* @__PURE__ */ k(Jt, { children: [/* @__PURE__ */ O(Yt, {
			"data-panel-driver": B.state,
			tone: B.state === "running" ? "ok" : B.state === "unknown" ? "warn" : "muted",
			title: `Driver: ${On[B.state].toLowerCase()}`,
			tip: [
				"One long-running chat that releases ready work in graph order and hands you the decisions. It releases work only while the chat is open.",
				B.note,
				be?.lastSeenAt && B.state !== "none" ? `Last seen ${$(be.lastSeenAt, A)}.` : "",
				B.workspace ? `Workspace: ${B.workspace}.` : "",
				B.elsewhere ? B.elsewhere.text : ""
			].filter(Boolean).join(" "),
			actions: /* @__PURE__ */ k(D, { children: [
				B.link && /* @__PURE__ */ O(Xt, {
					label: "Open driver session",
					icon: /* @__PURE__ */ O(te, {
						size: 13,
						"aria-hidden": "true"
					}),
					primary: !B.start,
					href: K(B.link),
					"data-driver-open": !0
				}),
				B.start && /* @__PURE__ */ O(Xt, {
					label: B.link ? "Start a new driver session" : "Start a driver session",
					icon: /* @__PURE__ */ O(ne, {
						size: 13,
						"aria-hidden": "true"
					}),
					primary: !B.link,
					tip: B.link ? "Start a new driver session." : "Start a driver session. Opens a new chat on the avoozl-driver agent.",
					onClick: () => i({
						agent: "avoozl-driver",
						message: "Start the Avoozl driver session. Keep this chat open. Release ready work in graph order, watch pull requests through checks and merge, and bring anything that needs a person to me. Use the avoozl tools. Do not merge anything yourself and do not code issues yourself.",
						autoSend: !0
					}),
					"data-driver-start": !0
				}),
				B.elsewhere && /* @__PURE__ */ O(Xt, {
					label: `Open ${B.elsewhere.workspace}'s driver`,
					icon: /* @__PURE__ */ O(S, {
						size: 13,
						"aria-hidden": "true"
					}),
					href: K(B.elsewhere.href),
					tip: B.elsewhere.text,
					"data-driver-elsewhere": !0
				}),
				/* @__PURE__ */ O(Xt, {
					label: "Recheck",
					icon: /* @__PURE__ */ O(ie, {
						size: 13,
						"aria-hidden": "true"
					}),
					onClick: () => void N(),
					"data-driver-recheck": !0
				})
			] })
		}), /* @__PURE__ */ O(Yt, {
			"data-panel-crew": !0,
			tone: V ? "ok" : "warn",
			title: V === null ? "Radar crew: unknown" : V ? `Radar crews: ${V}` : "Radar crew: none",
			tip: "Issue Radar crews code the issues Avoozl releases. Create a crew in Radar, Crews.",
			actions: /* @__PURE__ */ O(Xt, {
				label: "Open Radar",
				icon: /* @__PURE__ */ O(S, {
					size: 13,
					"aria-hidden": "true"
				}),
				href: "/issue-radar",
				tip: "Open Radar, Crews."
			})
		})] })
	}), H = /* @__PURE__ */ k(J, {
		id: "line",
		title: "Line and driver",
		summary: De ? "stopped" : void 0,
		open: !0,
		children: [
			/* @__PURE__ */ O(Y, { children: P.stops.map((e) => /* @__PURE__ */ O(Z, {
				icon: y,
				title: e
			}, e)) }),
			Pe,
			/* @__PURE__ */ O(Y, { children: /* @__PURE__ */ O(Z, {
				icon: re,
				title: "Avoozl app",
				noTip: !0,
				actions: /* @__PURE__ */ O(Q, {
					label: "Open Avoozl",
					"data-open-avoozl": !0,
					onClick: () => n(Sn)
				})
			}) })
		]
	}), Fe = L && /* @__PURE__ */ O("div", {
		"data-since-recap": !0,
		children: /* @__PURE__ */ k(J, {
			id: "since",
			title: "Since you left",
			summary: L.since,
			open: !0,
			children: [
				L.finished.length > 0 && /* @__PURE__ */ O("div", {
					"data-since-finished": !0,
					children: /* @__PURE__ */ O(Y, { children: L.finished.slice(0, 5).map((e) => /* @__PURE__ */ O(Z, {
						icon: m,
						title: e.title,
						chips: /* @__PURE__ */ O(q, {
							tone: "ok",
							children: "Finished"
						})
					}, e.taskId)) })
				}),
				L.needsYou.length > 0 && /* @__PURE__ */ O("div", {
					"data-since-needs-you": !0,
					children: /* @__PURE__ */ O(Y, { children: L.needsYou.slice(0, 5).map((e) => /* @__PURE__ */ O(Z, {
						icon: y,
						title: e.title,
						chips: /* @__PURE__ */ O(q, {
							tone: "warn",
							children: e.label
						})
					}, e.key)) })
				}),
				/* @__PURE__ */ O(X, { children: /* @__PURE__ */ O(Q, {
					label: "Got it",
					onClick: () => M(null)
				}) })
			]
		})
	}), U = F.kind === "crew" ? g?.crews?.rows.find((e) => e.crewId === F.crew) : void 0, W = I ? (g?.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === I.name || e.planId === I.plan?.id)) : [];
	return /* @__PURE__ */ k(Ft, {
		kind: F.kind,
		children: [
			Ne,
			v && /* @__PURE__ */ k(X, {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", v]
			}),
			C && /* @__PURE__ */ O(X, {
				role: "status",
				children: C
			}),
			F.kind === "spec-builder" && /* @__PURE__ */ k(D, { children: [
				/* @__PURE__ */ O("div", {
					"data-panel-spec": !0,
					children: /* @__PURE__ */ O(J, {
						id: "spec",
						title: `Spec check: ${F.spec}`,
						open: !0,
						children: I ? /* @__PURE__ */ O(D, { children: /* @__PURE__ */ k(Y, { children: [
							/* @__PURE__ */ O(Z, {
								icon: T,
								title: `Files: ${I.files.join(", ") || "none"}`
							}),
							/* @__PURE__ */ O(Z, {
								icon: T,
								title: `Tasks: ${I.taskCount}`
							}),
							/* @__PURE__ */ O(Z, {
								icon: I.counts.error > 0 ? y : m,
								title: `Problems: ${I.counts.error} errors, ${I.counts.warning} warnings`,
								chips: /* @__PURE__ */ O(q, {
									tone: I.counts.error > 0 ? "danger" : I.counts.warning > 0 ? "warn" : "ok",
									children: I.counts.error > 0 ? "Fix first" : I.counts.warning > 0 ? "Warnings" : "Clean"
								})
							}),
							/* @__PURE__ */ O(Z, {
								icon: I.plan?.approved ? m : b,
								title: I.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl.",
								meta: it(F, {
									files: I.files,
									approved: !!I.plan?.approved
								}) ? "tasks.md is written and not approved yet." : I.plan?.approved ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it." : null,
								actions: I.plan ? I.plan.approved ? null : /* @__PURE__ */ O(Q, {
									label: "Approve for Avoozl",
									primary: !0,
									disabled: I.counts.error > 0 || !I.hash,
									onClick: () => void we()
								}) : /* @__PURE__ */ O(Q, {
									label: "Store this spec",
									onClick: () => void Te()
								})
							})
						] }) }) : /* @__PURE__ */ O(X, { children: R ? "Loading…" : "Avoozl has not read this spec folder yet." })
					})
				}),
				I?.plan?.approved && /* @__PURE__ */ O(J, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: W.length,
					open: !0,
					children: W.length === 0 ? /* @__PURE__ */ O(X, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ O(Y, { children: W.slice(0, 6).map((e) => /* @__PURE__ */ O(Z, {
						"data-spec-queue-row": e.state,
						icon: T,
						title: e.title,
						chips: /* @__PURE__ */ O(q, {
							tone: "info",
							children: e.state
						}),
						meta: e.reason
					}, e.taskId)) })
				}),
				H
			] }),
			F.kind === "crew" && /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O("div", {
				"data-panel-crew": !0,
				children: /* @__PURE__ */ k(J, {
					id: "crew",
					title: `Crew ${F.crew}`,
					open: !0,
					children: [U ? /* @__PURE__ */ k(Y, { children: [/* @__PURE__ */ O(Z, {
						icon: U.pr ? w : re,
						title: `${U.repository}#${U.number} ${U.title}: ${U.phase ?? "no phase"}${U.pr ? `, PR #${U.pr}` : ""}${U.stale ? " (stale)" : ""}`,
						href: K(U.url),
						age: U.updated ? Dt(U.updated, A) : null,
						ageTip: U.updated ? `Updated ${$(U.updated, A)}` : void 0,
						meta: U.updated ? `Updated ${$(U.updated, A)}` : null,
						actions: /* @__PURE__ */ k(D, { children: [U.prUrl && /* @__PURE__ */ O(Q, {
							label: `PR #${U.pr}`,
							href: K(U.prUrl)
						}), U.commentUrl && /* @__PURE__ */ O(Q, {
							label: "Crew comment",
							href: K(U.commentUrl)
						})] }),
						multi: !0
					}), /* @__PURE__ */ O("li", {
						"data-pp-row": !0,
						style: { gridTemplateColumns: "minmax(0,1fr)" },
						children: /* @__PURE__ */ O(G, {
							text: Xe(U).map((e) => `${e.label}: ${e.state}`).join(", "),
							children: /* @__PURE__ */ O("span", {
								"data-rail": !0,
								role: "img",
								"aria-label": Xe(U).map((e) => `${e.label} ${e.state}`).join(", "),
								style: {
									display: "inline-flex",
									gap: 3
								},
								children: Xe(U).map((e) => /* @__PURE__ */ O("i", {
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
					})] }) : /* @__PURE__ */ O(X, { children: R ? "Loading…" : Ee("inFlight") ? En.inFlight : "No live claim from this crew in Avoozl's repositories." }), /* @__PURE__ */ O(X, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })]
				})
			}), H] }),
			F.kind === "avoozl" && /* @__PURE__ */ k(D, { children: [
				Fe,
				ke,
				Ae,
				je,
				Me,
				H
			] }),
			F.kind === "other" && /* @__PURE__ */ k("div", {
				"data-panel-recap": !0,
				children: [
					Fe,
					ke,
					Ae,
					je,
					Me,
					H
				]
			})
		]
	});
}
function Nn(e) {
	return [
		e.claimed ? `${e.claimed} claimed` : "",
		`${e.next} next`,
		e.held ? `${e.held} held` : ""
	].filter(Boolean).join(" · ");
}
export { Mn as default };
