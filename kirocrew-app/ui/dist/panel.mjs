import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Btn as f, Input as p } from "@kirocrew/app-sdk/ui";
import { Bot as m, Check as h, ChevronDown as g, ChevronRight as _, ChevronsDownUp as v, ChevronsUpDown as y, CircleAlert as b, CircleDot as x, GitBranch as S, GitPullRequest as C, Inbox as w, MessageSquare as T, Pause as E, Radar as ee, RefreshCw as te, X as ne } from "lucide-react";
import { createPortal as D } from "react-dom";
import { Fragment as O, jsx as k, jsxs as A } from "react/jsx-runtime";
// kirocrew-app/ui/src/workspace-api.ts
var j = "/apps/avoozl/api/command";
function re(e) {
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
function ie(e) {
	let t = async (t, n = {}, r) => (await e.post(j, {
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
function ae(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/demo-api.ts
var oe = "@demo", se = "Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.";
function ce(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function le(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function ue(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function de(e, t) {
	let n = (e) => e.catch((e) => {
		let n = ue(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = le(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => ce("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => ce("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!ce("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: fe }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var fe = {
	defaultWorkspace: oe,
	items: [{
		id: oe,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, pe = e({
	active: !1,
	notice: () => void 0
}), me = () => n(pe);
function M() {
	let e = l(), { active: t, notice: n } = me();
	return o(() => t ? de(e, n) : e, [
		e,
		t,
		n
	]);
}
function he() {
	let e = u(), { active: t, notice: n } = me(), r = e.openChat;
	return o(() => t ? { openChat: () => n(se) } : { openChat: r }, [
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
function N(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var P = null;
function ge(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), P === o && (P = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), P && P !== o && P(), P = o, i || (i = !0, e.onChange(!0));
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
var _e = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function F(e) {
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
]), ve = (e) => R.has(e);
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
			let t = ye(e, (e) => ve(e.kind));
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
var z = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function B(e = z) {
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
var Se = "data-avoozl-app", V = e(null), Ce = null, we = () => n(V) ?? (Ce ??= B());
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
}, H = [], U = null;
function ke() {
	U || (U = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function Ae() {
	!H.length && U && (document.documentElement.style.overflow = U.html, document.body.style.overflow = U.body, U = null);
}
var W = e(null), je = () => n(W);
function Me(e) {
	let n = Ve(), r = e.side === "right", i = F(r ? "(max-width: 640px)" : "(max-width: 767px)"), o = s(null), l = s(null), [u, d] = c(null), f = s(e);
	f.current = e;
	let p = s(!1), m = t(() => {
		let { unsaved: e, onDismiss: t } = f.current;
		if (!e) return t();
		p.current || (p.current = !0, n(e).then((e) => {
			p.current = !1, e && f.current.onDismiss();
		}));
	}, [n]);
	Te(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", m), a(() => {
		let e = o.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), H.push(t), ke(), d(e), (l.current?.querySelector(`:is(${Ee}):not([data-shelf-close])`) ?? l.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || H.at(-1) !== t || !l.current) return;
			let n = [...l.current.querySelectorAll(Ee)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = I(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), H.splice(H.indexOf(t), 1), Ae(), e.open && e.close(), n?.isConnected && n.focus();
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
	}, _ = h || e.plain ? "relative flex flex-col overflow-hidden border shadow-lg outline-none" : "relative flex flex-col gap-3 overflow-y-auto border p-4 shadow-lg outline-none", v = /* @__PURE__ */ k("button", {
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
		children: /* @__PURE__ */ k(ne, {
			size: 16,
			"aria-hidden": "true"
		})
	});
	return D(/* @__PURE__ */ A("dialog", {
		ref: o,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? i ? "shelf-full" : "shelf" : i ? "full" : h ? "large" : "box",
		[Se]: "",
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
		children: [/* @__PURE__ */ k("style", { children: "dialog[data-modal]::backdrop{background:transparent}" + (r ? "@media (prefers-reduced-motion:no-preference){@keyframes avoozl-shelf-in{from{transform:translateX(100%)}to{transform:none}}[data-modal-box][data-shelf]{animation:avoozl-shelf-in 180ms ease-out}}" : "") }), /* @__PURE__ */ A("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: r ? "stretch" : "center",
				justifyContent: r ? "flex-end" : "center"
			},
			children: [/* @__PURE__ */ k("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: m,
				style: {
					position: "absolute",
					inset: 0,
					background: De
				}
			}), /* @__PURE__ */ k("div", {
				ref: (t) => {
					l.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				"data-shelf": r ? "" : void 0,
				tabIndex: -1,
				className: _,
				style: {
					...Oe,
					...g,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ k(W.Provider, {
					value: u,
					children: h ? /* @__PURE__ */ A(O, { children: [/* @__PURE__ */ A("div", {
						className: r ? "min-h-0 flex-1 overflow-y-auto" : "contents",
						children: [/* @__PURE__ */ A("div", {
							className: "flex items-center gap-2 border-b px-4 py-3",
							style: { borderColor: "var(--border)" },
							children: [/* @__PURE__ */ k("h3", {
								id: `${e.id}-title`,
								className: "min-w-0 flex-1 text-lg font-semibold",
								children: e.title
							}), r && v]
						}), /* @__PURE__ */ k("div", {
							className: r ? "p-4" : "min-h-0 flex-1 overflow-y-auto p-4",
							children: e.children
						})]
					}), e.footer && /* @__PURE__ */ k("div", {
						className: "border-t px-4 py-3",
						style: { borderColor: "var(--border)" },
						children: e.footer
					})] }) : /* @__PURE__ */ A(O, { children: [r && /* @__PURE__ */ k("div", {
						className: "flex justify-end",
						children: v
					}), e.children] })
				})
			})]
		})]
	}), document.body);
}
// kirocrew-app/ui/src/Tooltip.tsx
var Ne = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, Pe = "button, a[href], input, select, textarea, summary, [role=\"button\"]", Fe = `${Pe}, [tabindex]`, Ie = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function G(e) {
	let t = i(), n = je(), l = s(null), u = s(null), [d, f] = c(!1), [p, m] = c(null), h = o(() => ge({ onChange: f }), []);
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
		m(N(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [d, e.text]);
	let g = e.text?.trim(), [_, v] = c(!1);
	a(() => {
		v(!!g && !l.current?.querySelector(Fe));
	});
	let y = typeof e.children == "function" ? e.children(g ? t : void 0) : e.children;
	return g ? /* @__PURE__ */ A("span", {
		ref: l,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => h.enter(e.pointerType),
		onPointerLeave: (e) => e.pointerType !== "touch" && h.leave(),
		onPointerDown: (e) => {
			let t = e.target, n = t.closest(Pe), r = t.closest("[data-info-tip]") !== null || !n || !e.currentTarget.contains(n);
			e.pointerType === "touch" && r ? h.tap() : h.hide();
		},
		tabIndex: _ ? 0 : void 0,
		"aria-describedby": _ ? t : void 0,
		onFocus: (e) => h.focus(Ie(e.target)),
		onBlur: h.blur,
		"data-tooltip-anchor": !0,
		children: [
			y,
			/* @__PURE__ */ k("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: g
			}),
			d && D(/* @__PURE__ */ A("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": p?.side,
				style: {
					position: "fixed",
					top: p?.top ?? 0,
					left: p?.left ?? 0,
					visibility: p ? "visible" : "hidden",
					zIndex: _e.tooltip,
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
					animation: Ne() ? void 0 : "avoozl-tip-in 120ms ease-out"
				},
				children: [
					/* @__PURE__ */ k("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					g,
					p && /* @__PURE__ */ k("span", {
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
	}) : /* @__PURE__ */ k(O, { children: y });
}
var Le = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Re = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function ze(e) {
	let t = e.icon;
	return /* @__PURE__ */ k(G, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ A(f, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...Re,
				...e.style
			},
			children: [/* @__PURE__ */ k(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
var Be = e(async () => !1), Ve = () => n(Be);
function He({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ A(Be.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ A(Me, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			children: [
				/* @__PURE__ */ k("h3", {
					id: "avoozl-confirm-title",
					className: "text-base font-semibold",
					children: n.title
				}),
				/* @__PURE__ */ k("p", {
					id: "avoozl-confirm-body",
					className: "text-sm text-muted",
					children: n.body
				}),
				/* @__PURE__ */ A("div", {
					className: "flex justify-end gap-2",
					children: [/* @__PURE__ */ k(f, {
						ref: a,
						type: "button",
						onClick: () => l(!1),
						children: "Cancel"
					}), /* @__PURE__ */ k(f, {
						type: "button",
						"data-danger": !0,
						onClick: () => l(!0),
						style: Le,
						children: n.action
					})]
				})
			]
		})]
	});
}
// kirocrew-app/ui/src/views-api.ts
function Ue(e) {
	let t = async (t, n, r, i) => (await e.post(j, {
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
function We(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var Ge = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function K(e) {
	return typeof e == "string" && Ge.test(e) ? e : We(e) ?? void 0;
}
// kirocrew-app/ui/src/dashboard-api.ts
var Ke = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function qe(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Ke.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/driver-api.ts
function Je(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
var Ye = (e) => ({
	running: "A driver session is working. Open it to watch or steer.",
	idle: "The driver session has been quiet for a while. Open it to check on it, or start a new one.",
	none: "No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.",
	unknown: "Avoozl could not read the driver session. It tries again soon."
})[e], Xe = (e, t) => Je(new Date(e).toISOString(), t);
function Ze(e, t, n) {
	if (!t || n - t.at < 6e4) return null;
	let r = new Set(t.waitingKeys), i = e.recent.filter((e) => Date.parse(e.at) > t.at), a = e.waiting.filter((e) => !r.has(e.key)).map(({ key: e, title: t, label: n }) => ({
		key: e,
		title: t,
		label: n
	}));
	return !i.length && !a.length ? null : {
		since: Xe(t.at, n),
		finished: i,
		needsYou: a
	};
}
// kirocrew-app/ui/src/panel-chat.ts
function Qe(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function $e(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${et(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") || t.driver && e === t.driver ? { kind: "avoozl" } : { kind: "other" };
}
var et = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function tt(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/flow-api.ts
function nt(e) {
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
var rt = "avoozl:line-changed", it = () => {
	typeof window < "u" && window.dispatchEvent(new Event(rt));
};
function at(e) {
	let t = (t, n, r = {}) => e.post(j, {
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
		models: () => e.get("/api/models").then(nt),
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
function ot(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var st = [
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
], ct = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], lt = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", ut = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function dt(e) {
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
function ft(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${ot(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/panel-api.ts
async function pt(e, t) {
	return (await e.post(j, {
		operation: "panel.view",
		input: {},
		workspaceId: t
	})).result;
}
function mt(e, t) {
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
var ht = /* @__PURE__ */ new Set([
	"needs-human",
	"github-conflict",
	"tracker-conflict",
	"review",
	"ready-to-merge",
	"branch-landing",
	"content-match",
	"content-unavailable"
]), gt = {
	"needs-human": "Needs you",
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit",
	review: "Review",
	"ready-to-merge": "Ready to merge",
	"branch-landing": "Ready to land",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function _t(e) {
	if (!ht.has(e.kind) || e.kind === "needs-human" && e.reason === "hand-set-review" || e.kind === "ready-to-merge" && e.integrate) return null;
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
		label: gt[e.kind] ?? e.kind,
		title: e.title,
		detail: e.detail,
		at: e.changedAt ?? null,
		actions: t
	};
}
function vt(e, t, n) {
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
function yt(e) {
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
		noAttach: t ? null : `Set the dashboard link for ${e.host} to attach.`,
		pr: !1,
		check: null,
		claimedAt: null,
		updated: e.updatedAt || null
	};
}
function bt(e) {
	let t = [];
	e.conflicts || t.push("waiting"), !e.crews && !e.remote && t.push("inFlight"), e.queue || t.push("queue"), e.flow || t.push("recent");
	let n = (e.conflicts ?? []).map(_t).filter((e) => e !== null), r = /* @__PURE__ */ new Map();
	for (let t of e.crews?.groups ?? []) for (let e of t.rows) e.instanceId && r.set(e.instanceId, t.name);
	let i = [...(e.crews?.rows ?? []).map((t) => vt(t, r, e.checks?.[`${t.repository}#${t.pr}`] ?? null)), ...(e.remote ?? []).map(yt)], a = null;
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
	})), s = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(ft);
	return {
		waiting: n,
		inFlight: i,
		queue: a,
		recent: o,
		stops: s,
		unread: t
	};
}
function xt(e) {
	let t = e?.state ?? "none", n = e?.workspace ?? null, r = t === "none" || t === "idle" ? e?.others?.[0] : void 0;
	return {
		state: t,
		link: e?.href ?? null,
		start: t === "none" || t === "idle",
		note: Ye(t),
		workspace: n,
		elsewhere: r ? {
			text: `No driver for ${n ?? "this workspace"}. ${r.workspace} has one:`,
			href: r.href,
			slot: r.slot,
			workspace: r.workspace
		} : null
	};
}
function St(e, t) {
	return t && e?.others?.find((e) => e.slot === t)?.root || null;
}
var Ct = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "");
	return n(e) === n(t);
};
function wt(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 1 ? "now" : r < 60 ? `${r}m` : r < 2880 ? `${Math.round(r / 60)}h` : `${Math.round(r / 60 / 24)}d`;
}
function Tt(e) {
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
var Et = "\n[data-pp]{font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}\n[data-pp] *{box-sizing:border-box}\n[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}\n[data-pp-head-name]{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}\n[data-pp-head-instance]{font-weight:400;color:var(--muted)}\n[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:6px}\n[data-pp-status]{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted)}\n[data-pp-section]{border-bottom:1px solid var(--border)}\n[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}\n[data-pp-section-head]:hover{background:var(--bg-hover)}\n[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}\n[data-pp-section-title]{color:var(--text-strong,var(--text))}\n[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}\n[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}\n[data-pp-row]:hover{background:var(--bg-hover)}\n[data-pp-row-icon]{display:inline-flex;color:var(--muted)}\n[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}\n[data-pp-row-line]{display:flex;align-items:center;gap:6px;min-width:0}\n[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}\na[data-pp-row-title]{text-decoration:none}\na[data-pp-row-title]:hover{text-decoration:underline}\n[data-pp-row-line]>[data-tooltip-anchor]{flex:0 1 auto;min-width:0}\n[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:1 1 auto;min-width:min(100%,12ch)}\n[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}\n[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}\n[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 1 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}\n[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}\n[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}\n[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}\n[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}\n[data-pp-act],[data-pp-icon]{background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}\n[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}\n[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}\n[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}\n[data-pp-icon][data-bare]{padding:2px 6px}\n[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}\n@media (max-width:640px),(pointer:coarse){\n[data-pp-head]{min-height:44px;padding-top:0;padding-bottom:0}\n[data-pp-section-head]{min-height:44px}\n[data-pp-row]{min-height:44px;padding-top:0;padding-bottom:0}\n[data-pp-row-main]{padding:4px 0}\n[data-pp] button,[data-pp-act],[data-pp-icon]{min-height:44px;min-width:44px}\n[data-pp-act],[data-pp-icon]{padding:0 10px}\n[data-pp-chip][data-tap]{min-height:44px;padding:0 10px}\n[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}\n[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}\n}\n";
function Dt() {
	return /* @__PURE__ */ k("style", { children: Et });
}
var Ot = "avoozl.panel.folds", kt = e(null);
function At() {
	try {
		let e = JSON.parse(window.localStorage.getItem(Ot) ?? "{}");
		return e && typeof e == "object" && !Array.isArray(e) ? e : {};
	} catch {
		return {};
	}
}
function jt() {
	let [e, n] = c(At), [r, i] = c({}), a = t((e) => {
		n(e);
		try {
			window.localStorage.setItem(Ot, JSON.stringify(e));
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
		})
	}), [
		s,
		l,
		a,
		e,
		r
	]);
}
function Mt(e) {
	let t = jt();
	return /* @__PURE__ */ k(kt.Provider, {
		value: t,
		children: /* @__PURE__ */ A("div", {
			"data-pp": !0,
			"data-panel-kind": e.kind,
			style: {
				display: "flex",
				flexDirection: "column"
			},
			children: [/* @__PURE__ */ k(Dt, {}), e.children]
		})
	});
}
function q(e) {
	let { tone: t = "muted", tip: n, tap: r, href: i, children: a, ...o } = e;
	return /* @__PURE__ */ k(G, {
		text: n,
		children: i ? /* @__PURE__ */ k("a", {
			"data-pp-chip": !0,
			"data-tone": t,
			href: K(i),
			target: "_blank",
			rel: "noreferrer",
			style: { textDecoration: "none" },
			...o,
			children: a
		}) : /* @__PURE__ */ k("span", {
			"data-pp-chip": !0,
			"data-tone": t,
			"data-tap": r && n ? "" : void 0,
			...o,
			children: a
		})
	});
}
function Nt(e) {
	let t = n(kt), r = t?.allOpen ? "Collapse all sections" : "Expand all sections", i = t?.allOpen ? v : y;
	return /* @__PURE__ */ A("div", {
		"data-pp-head": !0,
		children: [/* @__PURE__ */ k(G, {
			text: e.instance ? `${e.name} · ${e.instance}` : e.name,
			children: /* @__PURE__ */ A("span", {
				"data-pp-head-name": !0,
				children: [e.name, e.instance && /* @__PURE__ */ A("span", {
					"data-pp-head-instance": !0,
					children: [" · ", e.instance]
				})]
			})
		}), /* @__PURE__ */ A("span", {
			"data-pp-head-end": !0,
			children: [e.children, t && /* @__PURE__ */ k(G, {
				text: r,
				children: /* @__PURE__ */ k("button", {
					type: "button",
					"data-pp-icon": !0,
					"data-bare": !0,
					"data-pp-toggle-all": !0,
					"aria-label": r,
					"aria-pressed": t.allOpen,
					onClick: () => t.setAll(!t.allOpen),
					children: /* @__PURE__ */ k(i, {
						size: 13,
						"aria-hidden": "true"
					})
				})
			})]
		})]
	});
}
function Pt(e) {
	return /* @__PURE__ */ k("div", {
		"data-pp-status": !0,
		children: e.children
	});
}
function J(e) {
	let t = n(kt), r = !!e.open;
	a(() => t?.register(e.id, r), [
		t?.register,
		e.id,
		r
	]);
	let i = t ? t.isOpen(e.id, r) : r, o = i ? g : _;
	return /* @__PURE__ */ A("div", {
		"data-pp-section": !0,
		"data-panel-fold": e.id,
		"data-open": i ? "" : void 0,
		children: [/* @__PURE__ */ A("button", {
			type: "button",
			"data-pp-section-head": !0,
			"aria-expanded": i,
			onClick: () => t?.toggle(e.id, r),
			children: [
				/* @__PURE__ */ k(o, {
					size: 13,
					"data-pp-chevron": !0,
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ k("span", {
					"data-pp-section-title": !0,
					children: e.title
				}),
				e.count !== void 0 && e.count > 0 && /* @__PURE__ */ k(q, {
					tone: e.tone ?? "info",
					children: e.count
				}),
				e.summary && /* @__PURE__ */ k("span", {
					"data-pp-summary": !0,
					children: e.summary
				})
			]
		}), i && e.children]
	});
}
function Y(e) {
	return /* @__PURE__ */ k("ul", {
		"data-pp-list": !0,
		children: e.children
	});
}
function X(e) {
	return /* @__PURE__ */ k("p", {
		"data-pp-empty": !0,
		role: e.role,
		children: e.children
	});
}
function Z(e) {
	let { icon: t, title: n, href: r, chips: i, age: a, ageTip: o, meta: s, actions: c, multi: l, noTip: u, ...d } = e;
	return /* @__PURE__ */ A("li", {
		"data-pp-row": !0,
		"data-multi": l ? "" : void 0,
		...d,
		children: [
			/* @__PURE__ */ k("span", {
				"data-pp-row-icon": !0,
				children: /* @__PURE__ */ k(t, {
					size: 14,
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ A("span", {
				"data-pp-row-main": !0,
				children: [/* @__PURE__ */ A("span", {
					"data-pp-row-line": !0,
					children: [
						/* @__PURE__ */ k(G, {
							text: u ? null : n,
							display: "block",
							children: r ? /* @__PURE__ */ k("a", {
								"data-pp-row-title": !0,
								href: K(r),
								target: "_blank",
								rel: "noreferrer",
								children: n
							}) : /* @__PURE__ */ k("span", {
								"data-pp-row-title": !0,
								children: n
							})
						}),
						i,
						a && /* @__PURE__ */ k(G, {
							text: o,
							children: /* @__PURE__ */ k("span", {
								"data-pp-age": !0,
								children: a
							})
						})
					]
				}), s && /* @__PURE__ */ k(G, {
					text: s,
					display: "block",
					children: /* @__PURE__ */ k("span", {
						"data-pp-row-meta": !0,
						style: { display: "block" },
						children: s
					})
				})]
			}),
			c && /* @__PURE__ */ k("span", {
				"data-pp-actions": !0,
				children: c
			})
		]
	});
}
function Q(e) {
	let { label: t, icon: n, href: r, onClick: i, disabled: a, primary: o, tip: s, ...c } = e, l = /* @__PURE__ */ A(O, { children: [n && /* @__PURE__ */ k(n, {
		size: 12,
		"aria-hidden": "true"
	}), t] });
	return /* @__PURE__ */ k(G, {
		text: s,
		children: r ? /* @__PURE__ */ k("a", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			href: K(r),
			target: "_blank",
			rel: "noreferrer",
			...c,
			children: l
		}) : /* @__PURE__ */ k("button", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			type: "button",
			disabled: a,
			onClick: i,
			...c,
			children: l
		})
	});
}
var Ft = (e) => String(e).padStart(2, "0");
function It(e, t) {
	let n = Math.max(0, Math.ceil(e));
	return !t && n < 100 ? `${n}s` : n >= 3600 ? `${Math.floor(n / 3600)}:${Ft(Math.floor(n % 3600 / 60))}:${Ft(n % 60)}` : `${Math.floor(n / 60)}:${Ft(n % 60)}`;
}
var Lt = (e, t) => e || t >= 3600 ? 7 : t < 100 ? 3 : 5, Rt = (e) => e?.cacheSeconds ? e.cacheSeconds : e?.cacheSeconds === 0 ? 20 : 60;
function zt(e, t) {
	let n = e?.limitedUntil ? Date.parse(e.limitedUntil) : 0;
	return n > t ? Math.ceil((n - t) / 1e3) : 0;
}
function Bt(e, t, n) {
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
function Vt(e) {
	let t = async (t, n, r) => (await e.post(j, {
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
function Ht(e) {
	let { workspaceId: n, onRefresh: i, busy: a, bare: l } = e, u = M(), d = o(() => Vt(u), [u]), [f, p] = c(null), [m, h] = c(60), [g, _] = c(() => Date.now()), v = s(i);
	v.current = i;
	let y = Rt(f), b = zt(f, g), x = t(() => {
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
			(typeof document > "u" || document.visibilityState !== "hidden") && (_(Date.now()), zt(f, Date.now()) > 0 || (--S.current, S.current <= 0 ? C() : h(S.current)));
		}, 1e3);
		return () => clearInterval(e);
	}, [f, C]);
	let w = b > 0 ? b : m, T = `Refresh, ${b > 0 ? "GitHub limit lifts in " : "reads again in "}${It(w, b > 0)}`;
	return l ? /* @__PURE__ */ k(G, {
		text: Bt(f, m, b),
		children: /* @__PURE__ */ A("button", {
			type: "button",
			"data-pp-icon": !0,
			onClick: C,
			disabled: a,
			"aria-label": T,
			children: [/* @__PURE__ */ k(te, {
				size: 11,
				"aria-hidden": "true"
			}), /* @__PURE__ */ k("span", {
				style: {
					display: "inline-block",
					minWidth: `${Lt(b > 0, y)}ch`,
					textAlign: "right",
					fontVariantNumeric: "tabular-nums"
				},
				children: It(w, b > 0)
			})]
		})
	}) : /* @__PURE__ */ k(ze, {
		icon: te,
		onClick: C,
		disabled: a,
		tooltip: Bt(f, m, b),
		"aria-label": `Refresh, ${b > 0 ? "GitHub limit lifts in " : "reads again in "}${It(w, b > 0)}`,
		children: /* @__PURE__ */ k("span", {
			style: {
				display: "inline-block",
				minWidth: `${Lt(b > 0, y)}ch`,
				textAlign: "right",
				fontVariantNumeric: "tabular-nums"
			},
			children: It(w, b > 0)
		})
	});
}
// kirocrew-app/ui/src/plans-api.ts
function Ut(e) {
	let t = async (t, n, r = {}) => (await e.post(j, {
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
function Wt(e) {
	let t = async (t, n, r) => (await e.post(j, {
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
var Gt = "/api/apps/spec-builder/specs", Kt = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function qt(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function Jt(e, t, n = 50) {
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
function Yt(e, t, n) {
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
var Xt = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function Zt(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => qt(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = d && u ? Xt(d) : "", [p, m] = c(f), [h, g] = c(!1), [_, v] = c(!1), [y, b] = c(0), x = s(null);
	r(() => {
		h || m(f);
	}, [f, h]);
	let { shown: S, total: C } = o(() => Jt(l, h ? p : ""), [
		l,
		p,
		h
	]);
	r(() => {
		x.current?.querySelector(`#${CSS.escape(`${n}-opt-${y}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [y, n]);
	let w = (t) => {
		e.onPick(t.id), g(!1), v(!1), m(u ? Xt(t) : "");
	}, T = (t) => {
		let n = Yt({
			open: _,
			active: y
		}, t.key, S.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (v(!0), b(n.state.active)) : n.kind === "pick" ? w(S[n.index]) : n.kind === "close" ? v(!1) : (m(""), g(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, E = _ && (S.length > 0 || h);
	return /* @__PURE__ */ A("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ k("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ k("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": E,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": E && S.length ? `${n}-opt-${y}` : void 0,
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
				onKeyDown: T,
				className: "rounded border px-2 py-1 text-sm",
				style: Kt,
				"data-picker": !0
			}),
			/* @__PURE__ */ A("div", {
				hidden: !E,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: _e.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ k("ul", {
						ref: x,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: S.map((e, t) => /* @__PURE__ */ A("li", {
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
								/* @__PURE__ */ k("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.id
								}),
								/* @__PURE__ */ k("span", {
									className: "min-w-0 flex-1 truncate",
									children: e.title === e.id ? "" : e.title
								}),
								e.spec && /* @__PURE__ */ k("span", {
									className: "shrink-0 text-xs text-muted",
									children: e.spec
								}),
								e.state && /* @__PURE__ */ k("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: e.state
								})
							]
						}, e.id))
					}),
					C === 0 && /* @__PURE__ */ k("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					C > S.length && /* @__PURE__ */ A("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [C - S.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var Qt = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), $t = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function en() {
	return /* @__PURE__ */ k("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function tn(e) {
	return /* @__PURE__ */ A("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ k("style", { children: $t }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ A("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ A("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ k("input", {
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
					}), /* @__PURE__ */ A("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ A("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ k(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ k("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ k("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ A("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ k(en, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var nn = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, rn = {
	...nn,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, an = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, on = 6e4;
function sn(e) {
	let t = M(), n = o(() => at(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, on);
		return window.addEventListener(rt, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(rt, r);
		};
	}, [n, e]), i;
}
function cn(e) {
	let [t, n] = c(!1), r = sn(e.workspaceId);
	if (!e.workspaceId) return null;
	let i = r.length > 0, a = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; ");
	return /* @__PURE__ */ A(O, { children: [/* @__PURE__ */ k(G, {
		text: i ? `The line is stopped: ${a}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (t) => e.bare ? /* @__PURE__ */ A("button", {
			type: "button",
			"data-pp-act": !0,
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": t,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: { color: "var(--danger)" },
			children: [/* @__PURE__ */ k(E, {
				size: 12,
				"aria-hidden": "true"
			}), i ? "Stop more" : "Stop the line"]
		}) : /* @__PURE__ */ A(f, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": i ? "" : void 0,
			"aria-describedby": t,
			"aria-label": i ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: i ? rn : nn,
			children: [/* @__PURE__ */ k(E, {
				size: 14,
				"aria-hidden": "true",
				style: i ? { color: "var(--danger)" } : void 0
			}), i ? "Line stopped" : "Stop the line"]
		})
	}), t && /* @__PURE__ */ k(ln, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), it(), e.onPulled?.();
		}
	})] });
}
function ln(e) {
	let n = M(), i = o(() => at(n), [n]), [a, l] = c(ut), [u, d] = c(null), [m, h] = c(null), [g, _] = c(!1), v = Ve(), y = s(null), b = (e) => l((t) => ({
		...t,
		...e
	})), x = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			ie(n).repositories(r),
			Ut(n).stored(r),
			Ue(n).graph(r)
		]).then(([e, n, r]) => {
			t && d({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? Qt(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		y.current?.querySelector("input, button")?.focus();
	}, []);
	let S = async () => {
		let { input: t, error: n } = dt(a);
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
				h(re(e));
			} finally {
				_(!1);
			}
		}
	}, C = (e) => /* @__PURE__ */ k("p", {
		className: "text-sm text-muted",
		children: u ? e : "Reading…"
	}), w = (e) => /* @__PURE__ */ A("span", { children: [
		e,
		" ",
		/* @__PURE__ */ k("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), T = (e, t, n, r, i) => n.length ? /* @__PURE__ */ k(Zt, {
		label: w(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : C(i), ee = {
		all: null,
		repo: u?.repositories.length ? /* @__PURE__ */ A("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [w("Repository"), /* @__PURE__ */ A("select", {
				value: a.repository,
				onChange: (e) => b({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: an,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ k("option", {
					value: "",
					children: "Choose…"
				}), u.repositories.map((e) => /* @__PURE__ */ k("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : C("No repository is registered."),
		spec: T("Spec", a.spec, u?.specs ?? [], (e) => b({ spec: e }), "No spec is stored yet."),
		task: T("Task", a.taskId, u?.tasks ?? [], (e) => b({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ A(Me, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: y,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(ut()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		onDismiss: x,
		children: [
			/* @__PURE__ */ A("div", { children: [/* @__PURE__ */ A("h3", {
				id: "avoozl-stop-title",
				className: "flex items-center gap-1.5 text-base font-semibold",
				children: [/* @__PURE__ */ k(E, {
					size: 14,
					"aria-hidden": "true",
					style: { color: "var(--danger)" }
				}), "Stop the line"]
			}), /* @__PURE__ */ k("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			})] }),
			/* @__PURE__ */ k(tn, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => b({ kind: e }),
				sections: ct.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ k("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: lt
					}) } : { fields: /* @__PURE__ */ k(tn, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => b({ scope: e }),
						sections: st.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: ee[e.value]
						}))
					}) }
				}))
			}),
			/* @__PURE__ */ A("label", {
				className: "flex flex-col gap-1 text-sm",
				children: [
					/* @__PURE__ */ A("span", { children: ["Reason ", /* @__PURE__ */ k("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ k(p, {
						value: a.reason,
						maxLength: 200,
						placeholder: "The base is broken; looking into it",
						onChange: (e) => b({ reason: e.target.value }),
						"data-stop-reason": !0
					}),
					/* @__PURE__ */ k("span", {
						className: "text-xs text-muted",
						children: "One line. It shows on the banner and in Flow."
					})
				]
			}),
			m && /* @__PURE__ */ k("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: m
			}),
			/* @__PURE__ */ A("div", {
				className: "flex flex-wrap justify-end gap-2",
				children: [/* @__PURE__ */ k(f, {
					type: "button",
					onClick: x,
					children: "Cancel"
				}), /* @__PURE__ */ A(f, {
					type: "button",
					"data-danger": !0,
					"data-stop-confirm": !0,
					onClick: () => void S(),
					disabled: g,
					style: nn,
					children: [/* @__PURE__ */ k(E, {
						size: 14,
						"aria-hidden": "true"
					}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
				})]
			})
		]
	});
}
// kirocrew-app/ui/src/instance-api.ts
function un(e) {
	let t = async (t, n, r) => (await e.post(j, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		view: (e) => t("instance.view", {}, e),
		rename: (e, n) => t("instance.rename", { name: n }, e)
	};
}
function dn(e, t) {
	return e && (t === "header" || e.shared) ? e.name : null;
}
// kirocrew-app/ui/src/InstanceName.tsx
var fn = "avoozl:instance-changed";
function pn(e) {
	let n = M(), i = o(() => un(n), [n]), [a, s] = c(null), l = t(() => {
		e && i.view(e).then(s, () => void 0);
	}, [i, e]);
	return r(() => (l(), window.addEventListener(fn, l), () => window.removeEventListener(fn, l)), [l]), a;
}
// kirocrew-app/ui/src/Panel.tsx
var mn = "/apps/avoozl", hn = "avoozl.panel.away";
function gn(e) {
	try {
		let t = e?.getItem(hn);
		e?.removeItem(hn);
		let n = t ? JSON.parse(t) : null;
		return n && Number.isFinite(n.at) && Array.isArray(n.waitingKeys) ? n : null;
	} catch {
		return null;
	}
}
function _n() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var vn = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, yn = {
	review: C,
	"ready-to-merge": C,
	"branch-landing": S
}, bn = {
	running: "Running",
	idle: "Quiet",
	none: "Not started",
	unknown: "Unknown"
}, xn = {
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
function Sn(e) {
	return /* @__PURE__ */ k(Y, { children: e.rows.map((t) => /* @__PURE__ */ k(Z, {
		"data-waiting-row": t.kind,
		icon: yn[t.kind] ?? b,
		title: t.title,
		chips: /* @__PURE__ */ k(q, {
			tone: "warn",
			children: t.label
		}),
		age: t.at ? wt(t.at, e.now) : null,
		ageTip: t.at ? `Changed ${$(t.at, e.now)}` : void 0,
		meta: t.detail,
		multi: t.actions.length > 1,
		actions: t.actions.map((n) => n.kind === "link" && n.href.startsWith("/apps/") ? /* @__PURE__ */ k(Q, {
			label: n.label,
			onClick: e.onOpenPage
		}, n.label) : n.kind === "link" ? /* @__PURE__ */ k(Q, {
			label: n.label,
			href: K(n.href)
		}, n.label) : /* @__PURE__ */ k(Q, {
			label: n.label,
			disabled: e.busy === t.key,
			onClick: () => e.onAct(t, n)
		}, n.label))
	}, t.key)) });
}
function Cn({ rows: e, now: t }) {
	return /* @__PURE__ */ k(Y, { children: e.map((e) => {
		let n = e.pr ? Tt(e.check) : null, r = [
			e.instance ?? (e.source === "radar" ? "No Avoozl" : null),
			e.crew ?? e.who,
			e.source === "radar" ? e.ref : e.who,
			e.phase ? null : "claim label, no claim comment"
		].filter(Boolean);
		return /* @__PURE__ */ k(Z, {
			"data-flight-row": e.source,
			icon: e.pr ? C : e.source === "radar" ? ee : x,
			title: e.title,
			href: K(e.issueUrl),
			chips: /* @__PURE__ */ A(O, { children: [
				/* @__PURE__ */ k(q, {
					tone: e.stale ? "warn" : "info",
					tip: e.updated ? `Updated ${$(e.updated, t)}` : void 0,
					children: e.phase ?? "claimed"
				}),
				e.stale && /* @__PURE__ */ k(q, {
					tone: "warn",
					children: "Stale"
				}),
				n && /* @__PURE__ */ A(q, {
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
			age: wt(e.claimedAt ?? e.updated, t),
			ageTip: [e.claimedAt && `Claimed ${$(e.claimedAt, t)}`, e.updated && `updated ${$(e.updated, t)}`].filter(Boolean).join(", ") || void 0,
			meta: [...new Set(r)].join(" · "),
			actions: e.attach ? /* @__PURE__ */ k(Q, {
				label: "Attach",
				icon: T,
				href: K(e.attach),
				tip: e.source === "radar" ? "Opens the crew chat, if this crew runs on this machine. Type there to steer it." : "Opens the worker chat on its crew. Type there to steer it."
			}) : e.noAttach ? /* @__PURE__ */ k(G, {
				text: e.noAttach,
				children: /* @__PURE__ */ k("span", {
					"data-pp-chip": !0,
					"data-tone": "muted",
					"data-tap": "",
					children: "No chat"
				})
			}) : null
		}, e.key);
	}) });
}
function wn() {
	let e = M(), n = d(), { openChat: i } = he(), [a, l] = c(ae(_n()).workspaceId), [u, f] = c(null), [p, g] = c([]), [_, v] = c(null), [y, S] = c(null), [T, E] = c(null), [te, ne] = c(null), [D, j] = c(() => Date.now()), [oe, se] = c(() => gn(_n())), ce = pn(a), le = o(() => Qe(window.location), []), ue = o(() => Ut(e), [e]), de = o(() => Ue(e), [e]), fe = o(() => Wt(e), [e]);
	r(() => {
		a && ie(e).list().then((e) => f(e.items.find((e) => e.id === a)?.name ?? null), () => void 0);
	}, [e, a]);
	let pe = s(a), me = s(_);
	me.current = _;
	let N = t(async () => {
		let t = pe.current;
		try {
			t || (t = (await ie(e).list()).defaultWorkspace, pe.current = t, l(t));
		} catch (e) {
			S(re(e));
			return;
		}
		if (!t) return;
		let n = xn;
		try {
			n = await pt(e, t);
			let r = St(n.driver, le);
			if (r) {
				let i = (await ie(e).list()).items.find((e) => Ct(e.root, r));
				i && i.id !== t && (t = i.id, pe.current = t, l(t), n = await pt(e, t));
			}
		} catch {}
		try {
			let t = await e.get(Gt);
			g((t.specs ?? []).map((e) => e.name));
		} catch {}
		S(null), v(n), j(Date.now());
	}, [e, le]);
	r(() => mt(N, {
		intervalMs: 0,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [N]);
	let P = o(() => bt(_ ?? {}), [_]), ge = _?.driver ?? null, _e = _?.specs ?? [], F = $e(le, {
		specs: p,
		driver: ge?.slot ?? null
	}), I = F.kind === "spec-builder" ? _e.find((e) => e.name === F.spec) : void 0, L = s(P);
	L.current = P, r(() => {
		let e = () => {
			if (me.current) try {
				let e = {
					at: Date.now(),
					waitingKeys: L.current.waiting.map((e) => e.key)
				};
				_n()?.setItem(hn, JSON.stringify(e));
			} catch {}
		}, t = () => {
			if (document.visibilityState === "hidden") return e();
			let t = gn(_n());
			t && se(t);
		};
		return window.addEventListener("blur", e), window.addEventListener("focus", t), document.addEventListener("visibilitychange", t), () => {
			window.removeEventListener("blur", e), window.removeEventListener("focus", t), document.removeEventListener("visibilitychange", t);
		};
	}, []);
	let R = o(() => Ze(P, oe, D), [
		P,
		oe,
		D
	]), ve = async (e, t) => {
		if (a && t.kind !== "link") {
			ne(e.key);
			try {
				t.kind === "resolve" ? await de.resolveConflict(a, t.taskId, t.field, t.choice) : await fe.land(a, t.repository, t.branch, t.head), E(null), await N();
			} catch (e) {
				E(re(e));
			} finally {
				ne(null);
			}
		}
	}, ye = async () => {
		if (a && I?.plan && I.hash) try {
			await ue.approve(a, I.plan.id, I.hash), E("Approved this revision for Avoozl."), await N();
		} catch (e) {
			E(re(e));
		}
	}, be = async () => {
		if (a && I) try {
			await ue.store(a, I.name), E("Stored as a draft. Review it in Specs, then approve."), await N();
		} catch (e) {
			E(re(e));
		}
	}, xe = (e) => P.unread.includes(e), z = _ === null, B = P.stops.length > 0, Se = dn(ce, "other") ?? _?.instance?.name ?? null, V = (e, t, n, r) => xe(e) ? /* @__PURE__ */ k(X, { children: z ? "Loading…" : vn[e] }) : n === 0 ? /* @__PURE__ */ k(X, { children: t }) : r(), Ce = /* @__PURE__ */ A(J, {
		id: "waiting",
		title: "Waiting on you",
		count: P.waiting.length,
		tone: "warn",
		open: !0,
		children: [V("waiting", "Nothing is waiting on you.", P.waiting.length, () => /* @__PURE__ */ k(Sn, {
			rows: P.waiting.slice(0, 5),
			busy: te,
			now: D,
			onAct: (e, t) => void ve(e, t),
			onOpenPage: () => n(mn)
		})), P.waiting.length > 5 && /* @__PURE__ */ k(X, { children: /* @__PURE__ */ k(Q, {
			label: `Show all ${P.waiting.length}`,
			onClick: () => n(mn)
		}) })]
	}), we = /* @__PURE__ */ k(J, {
		id: "in-flight",
		title: "In flight",
		count: P.inFlight.length,
		summary: _?.crews && _.crews.stale > 0 ? `${_.crews.stale} stale` : void 0,
		open: !0,
		children: V("inFlight", "No crew has a claim right now.", P.inFlight.length, () => /* @__PURE__ */ k(Cn, {
			rows: P.inFlight,
			now: D
		}))
	}), Te = /* @__PURE__ */ k(J, {
		id: "queue",
		title: "Release queue",
		count: P.queue?.head.length,
		summary: P.queue ? Tn(P.queue) : void 0,
		children: V("queue", P.queue?.held ? `Nothing is next. ${P.queue.held} held.` : "Nothing is next in the queue.", P.queue?.head.length ?? 0, () => /* @__PURE__ */ k(Y, { children: P.queue.head.map((e) => /* @__PURE__ */ k(Z, {
			"data-queue-head": !0,
			icon: w,
			title: e.title,
			chips: /* @__PURE__ */ k(q, {
				tone: "info",
				children: "Next"
			}),
			age: e.taskId,
			meta: `${e.repository} · ${e.reason}`
		}, e.taskId)) }))
	}), Ee = /* @__PURE__ */ k(J, {
		id: "recent",
		title: "Recent merges",
		count: P.recent.length,
		summary: P.recent[0] ? `last ${wt(P.recent[0].at, D)}` : void 0,
		children: V("recent", "Nothing finished lately.", P.recent.length, () => /* @__PURE__ */ k(Y, { children: P.recent.map((e) => /* @__PURE__ */ k(Z, {
			"data-recent-row": !0,
			icon: h,
			title: e.title,
			age: wt(e.at, D),
			ageTip: $(e.at, D),
			meta: [e.repository, e.taskId].filter(Boolean).join(" · ")
		}, e.taskId)) }))
	}), De = /* @__PURE__ */ k(Nt, {
		name: u ?? "Avoozl",
		instance: Se,
		children: /* @__PURE__ */ k(Ht, {
			bare: !0,
			workspaceId: a,
			onRefresh: () => void N()
		})
	}), Oe = /* @__PURE__ */ A(Pt, { children: [/* @__PURE__ */ k("span", {
		"data-panel-line": !0,
		"data-stopped": B ? "" : void 0,
		style: { display: "inline-flex" },
		children: /* @__PURE__ */ k(q, {
			tone: B ? "danger" : "ok",
			children: B ? "Line stopped" : "Line running"
		})
	}), /* @__PURE__ */ k("span", {
		"data-recap-line": !0,
		children: z ? "Loading…" : `${P.waiting.length} waiting on you · ${P.inFlight.length} in flight`
	})] }), H = xt(_ && !_.driver ? {
		state: "unknown",
		slot: null,
		href: null,
		openedAt: null,
		lastSeenAt: null
	} : _?.driver), U = z ? null : /* @__PURE__ */ A(O, { children: [/* @__PURE__ */ k(Z, {
		"data-panel-driver": H.state,
		icon: m,
		title: "Driver",
		chips: /* @__PURE__ */ A(O, { children: [/* @__PURE__ */ k(q, {
			tone: H.state === "running" ? "ok" : H.state === "unknown" ? "warn" : "muted",
			children: bn[H.state]
		}), H.workspace && /* @__PURE__ */ k(q, {
			"data-driver-workspace": !0,
			tip: "The workspace this driver releases work for.",
			children: H.workspace
		})] }),
		multi: !0,
		meta: `${H.note}${ge?.lastSeenAt && H.state !== "none" ? ` Last seen ${$(ge.lastSeenAt, D)}.` : ""}`,
		actions: /* @__PURE__ */ A(O, { children: [H.link && /* @__PURE__ */ k(Q, {
			label: "Open driver session",
			href: K(H.link)
		}), H.start && /* @__PURE__ */ k(Q, {
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
	}), H.elsewhere && /* @__PURE__ */ k(Z, {
		"data-driver-elsewhere": !0,
		noTip: !0,
		icon: m,
		title: `${H.elsewhere.text} `,
		actions: /* @__PURE__ */ k(Q, {
			label: "Open",
			href: K(H.elsewhere.href)
		})
	})] }), ke = /* @__PURE__ */ k(J, {
		id: "line",
		title: "Line and driver",
		summary: B ? "stopped" : void 0,
		open: !0,
		children: /* @__PURE__ */ A(Y, { children: [
			/* @__PURE__ */ k(Z, {
				"data-line-row": !0,
				icon: x,
				title: B ? "The line is stopped" : "The line is running",
				noTip: !0,
				actions: /* @__PURE__ */ k(He, { children: /* @__PURE__ */ k(cn, {
					bare: !0,
					workspaceId: a
				}) })
			}),
			P.stops.map((e) => /* @__PURE__ */ k(Z, {
				icon: b,
				title: e
			}, e)),
			U,
			/* @__PURE__ */ k(Z, {
				icon: ee,
				title: "Avoozl app",
				noTip: !0,
				actions: /* @__PURE__ */ k(Q, {
					label: "Open Avoozl",
					"data-open-avoozl": !0,
					onClick: () => n(mn)
				})
			})
		] })
	}), Ae = R && /* @__PURE__ */ k("div", {
		"data-since-recap": !0,
		children: /* @__PURE__ */ A(J, {
			id: "since",
			title: "Since you left",
			summary: R.since,
			open: !0,
			children: [
				R.finished.length > 0 && /* @__PURE__ */ k("div", {
					"data-since-finished": !0,
					children: /* @__PURE__ */ k(Y, { children: R.finished.slice(0, 5).map((e) => /* @__PURE__ */ k(Z, {
						icon: h,
						title: e.title,
						chips: /* @__PURE__ */ k(q, {
							tone: "ok",
							children: "Finished"
						})
					}, e.taskId)) })
				}),
				R.needsYou.length > 0 && /* @__PURE__ */ k("div", {
					"data-since-needs-you": !0,
					children: /* @__PURE__ */ k(Y, { children: R.needsYou.slice(0, 5).map((e) => /* @__PURE__ */ k(Z, {
						icon: b,
						title: e.title,
						chips: /* @__PURE__ */ k(q, {
							tone: "warn",
							children: e.label
						})
					}, e.key)) })
				}),
				/* @__PURE__ */ k(X, { children: /* @__PURE__ */ k(Q, {
					label: "Got it",
					onClick: () => se(null)
				}) })
			]
		})
	}), W = F.kind === "crew" ? _?.crews?.rows.find((e) => e.crewId === F.crew) : void 0, je = I ? (_?.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === I.name || e.planId === I.plan?.id)) : [];
	return /* @__PURE__ */ A(Mt, {
		kind: F.kind,
		children: [
			De,
			Oe,
			y && /* @__PURE__ */ A(X, {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", y]
			}),
			T && /* @__PURE__ */ k(X, {
				role: "status",
				children: T
			}),
			F.kind === "spec-builder" && /* @__PURE__ */ A(O, { children: [
				/* @__PURE__ */ k("div", {
					"data-panel-spec": !0,
					children: /* @__PURE__ */ k(J, {
						id: "spec",
						title: `Spec check: ${F.spec}`,
						open: !0,
						children: I ? /* @__PURE__ */ k(O, { children: /* @__PURE__ */ A(Y, { children: [
							/* @__PURE__ */ k(Z, {
								icon: w,
								title: `Files: ${I.files.join(", ") || "none"}`
							}),
							/* @__PURE__ */ k(Z, {
								icon: w,
								title: `Tasks: ${I.taskCount}`
							}),
							/* @__PURE__ */ k(Z, {
								icon: I.counts.error > 0 ? b : h,
								title: `Problems: ${I.counts.error} errors, ${I.counts.warning} warnings`,
								chips: /* @__PURE__ */ k(q, {
									tone: I.counts.error > 0 ? "danger" : I.counts.warning > 0 ? "warn" : "ok",
									children: I.counts.error > 0 ? "Fix first" : I.counts.warning > 0 ? "Warnings" : "Clean"
								})
							}),
							/* @__PURE__ */ k(Z, {
								icon: I.plan?.approved ? h : x,
								title: I.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl.",
								meta: tt(F, {
									files: I.files,
									approved: !!I.plan?.approved
								}) ? "tasks.md is written and not approved yet." : I.plan?.approved ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it." : null,
								actions: I.plan ? I.plan.approved ? null : /* @__PURE__ */ k(Q, {
									label: "Approve for Avoozl",
									primary: !0,
									disabled: I.counts.error > 0 || !I.hash,
									onClick: () => void ye()
								}) : /* @__PURE__ */ k(Q, {
									label: "Store this spec",
									onClick: () => void be()
								})
							})
						] }) }) : /* @__PURE__ */ k(X, { children: z ? "Loading…" : "Avoozl has not read this spec folder yet." })
					})
				}),
				I?.plan?.approved && /* @__PURE__ */ k(J, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: je.length,
					open: !0,
					children: je.length === 0 ? /* @__PURE__ */ k(X, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ k(Y, { children: je.slice(0, 6).map((e) => /* @__PURE__ */ k(Z, {
						"data-spec-queue-row": e.state,
						icon: w,
						title: e.title,
						chips: /* @__PURE__ */ k(q, {
							tone: "info",
							children: e.state
						}),
						meta: e.reason
					}, e.taskId)) })
				}),
				ke
			] }),
			F.kind === "crew" && /* @__PURE__ */ A(O, { children: [/* @__PURE__ */ k("div", {
				"data-panel-crew": !0,
				children: /* @__PURE__ */ A(J, {
					id: "crew",
					title: `Crew ${F.crew}`,
					open: !0,
					children: [W ? /* @__PURE__ */ A(Y, { children: [/* @__PURE__ */ k(Z, {
						icon: W.pr ? C : ee,
						title: `${W.repository}#${W.number} ${W.title}: ${W.phase ?? "no phase"}${W.pr ? `, PR #${W.pr}` : ""}${W.stale ? " (stale)" : ""}`,
						href: K(W.url),
						age: W.updated ? wt(W.updated, D) : null,
						ageTip: W.updated ? `Updated ${$(W.updated, D)}` : void 0,
						meta: W.updated ? `Updated ${$(W.updated, D)}` : null,
						actions: /* @__PURE__ */ A(O, { children: [W.prUrl && /* @__PURE__ */ k(Q, {
							label: `PR #${W.pr}`,
							href: K(W.prUrl)
						}), W.commentUrl && /* @__PURE__ */ k(Q, {
							label: "Crew comment",
							href: K(W.commentUrl)
						})] }),
						multi: !0
					}), /* @__PURE__ */ k("li", {
						"data-pp-row": !0,
						style: { gridTemplateColumns: "minmax(0,1fr)" },
						children: /* @__PURE__ */ k(G, {
							text: qe(W).map((e) => `${e.label}: ${e.state}`).join(", "),
							children: /* @__PURE__ */ k("span", {
								"data-rail": !0,
								role: "img",
								"aria-label": qe(W).map((e) => `${e.label} ${e.state}`).join(", "),
								style: {
									display: "inline-flex",
									gap: 3
								},
								children: qe(W).map((e) => /* @__PURE__ */ k("i", {
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
					})] }) : /* @__PURE__ */ k(X, { children: z ? "Loading…" : xe("inFlight") ? vn.inFlight : "No live claim from this crew in Avoozl's repositories." }), /* @__PURE__ */ k(X, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })]
				})
			}), ke] }),
			F.kind === "avoozl" && /* @__PURE__ */ A(O, { children: [
				Ae,
				Ce,
				we,
				Te,
				Ee,
				ke
			] }),
			F.kind === "other" && /* @__PURE__ */ A("div", {
				"data-panel-recap": !0,
				children: [
					Ae,
					Ce,
					we,
					Te,
					Ee,
					ke
				]
			})
		]
	});
}
function Tn(e) {
	return [
		e.claimed ? `${e.claimed} claimed` : "",
		`${e.next} next`,
		e.held ? `${e.held} held` : ""
	].filter(Boolean).join(" · ");
}
export { wn as default };
