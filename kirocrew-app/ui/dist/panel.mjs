import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Btn as f, Input as p } from "@kirocrew/app-sdk/ui";
import { Check as m, ChevronDown as h, ChevronRight as g, ChevronsDownUp as _, ChevronsUpDown as v, CircleAlert as y, CircleDot as b, CirclePlus as x, ExternalLink as ee, GitBranch as S, GitPullRequest as C, Inbox as w, MessageSquare as te, Pause as T, Play as ne, Radar as re, RefreshCw as ie, X as ae } from "lucide-react";
import { createPortal as oe } from "react-dom";
import { Fragment as E, jsx as D, jsxs as O } from "react/jsx-runtime";
// kirocrew-app/ui/src/workspace-api.ts
var k = "/apps/avoozl/api/command";
function se(e) {
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
function ce(e) {
	let t = async (t, n = {}, r) => (await e.post(k, {
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
function le(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/demo-api.ts
var ue = "@demo", de = "Demo mode: in your own workspace this would open a Kiro Crew chat. No chat started.";
function fe(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function pe(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function me(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function he(e, t) {
	let n = (e) => e.catch((e) => {
		let n = me(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = pe(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => fe("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => fe("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!fe("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: ge }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var ge = {
	defaultWorkspace: ue,
	items: [{
		id: ue,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, _e = e({
	active: !1,
	notice: () => void 0
}), ve = () => n(_e);
function A() {
	let e = l(), { active: t, notice: n } = ve();
	return o(() => t ? he(e, n) : e, [
		e,
		t,
		n
	]);
}
function ye() {
	let e = u(), { active: t, notice: n } = ve(), r = e.openChat;
	return o(() => t ? { openChat: () => n(de) } : { openChat: r }, [
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
function be(e, t, n) {
	let r = e.top - 6 - t.height, i = e.top + e.height + 6, a = r >= 6 || i + t.height > n.height - 6 ? "top" : "bottom", o = (e, t, n) => Math.max(6, Math.min(e, n - 6 - t)), s = o(a === "top" ? r : i, t.height, n.height), c = o(e.left + e.width / 2 - t.width / 2, t.width, n.width);
	return {
		top: s,
		left: c,
		side: a,
		arrow: Math.max(8, Math.min(t.width - 8, e.left + e.width / 2 - c))
	};
}
var j = null;
function xe(e) {
	let t = e.setTimer ?? ((e, t) => setTimeout(e, t)), n = e.clearTimer ?? ((e) => clearTimeout(e)), r = null, i = !1, a = () => {
		r !== null && n(r), r = null;
	}, o = () => {
		a(), j === o && (j = null), i && (i = !1, e.onChange(!1));
	}, s = () => {
		a(), j && j !== o && j(), j = o, i || (i = !0, e.onChange(!0));
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
var Se = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function Ce(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function we(e, t, n) {
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
var M = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
};
M.nodeWidth, M.nodeHeight, M.columnGap, M.rowGap, M.margin, M.clusterLabel, M.clusterGap;
// kirocrew-app/ui/src/nav-history.ts
var N = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), Te = (e) => N.has(e);
function Ee(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function P() {
	let e = [], t = 1, n = () => {
		let t = Ee(e, (e) => e.kind === "tab");
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
			let t = Ee(e, (e) => Te(e.kind));
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
				let t = Ee(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function F(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var De = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function I(e = De) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: P(),
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
		restoreScroll: (t) => void e(() => F(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
// kirocrew-app/ui/src/NavHistory.tsx
var Oe = "data-avoozl-app", ke = e(null), Ae = null, je = () => n(ke) ?? (Ae ??= I());
function L(e, t, n, i, a) {
	let o = je(), c = s({
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
var Me = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", Ne = "color-mix(in srgb, var(--bg) 60%, transparent)", Pe = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)",
	boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
}, Fe = "1px solid var(--border)", Ie = "dialog[data-modal]::backdrop{background:transparent}\n[data-modal-backdrop]{backdrop-filter:blur(12px)}\n[data-modal-close]:hover{background:var(--bg-hover);color:var(--text)}\n[data-modal-close]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}\n@media (prefers-reduced-motion:no-preference){[data-modal-box]{animation:avoozl-modal-in .2s ease}}\n@keyframes avoozl-modal-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}", R = [], z = null;
function Le() {
	z || (z = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function B() {
	!R.length && z && (document.documentElement.style.overflow = z.html, document.body.style.overflow = z.body, z = null);
}
var V = e(null), Re = () => n(V);
function H(e) {
	let n = Ye(), r = Ce("(max-width: 767px)"), i = s(null), o = s(null), [l, u] = c(null), d = s(e);
	d.current = e;
	let f = s(!1), p = t(() => {
		let { unsaved: e, onDismiss: t } = d.current;
		if (!e) return t();
		f.current || (f.current = !0, n(e).then((e) => {
			f.current = !1, e && d.current.onDismiss();
		}));
	}, [n]);
	L(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", p), a(() => {
		let e = i.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), R.push(t), Le(), u(e), (o.current?.querySelector(`:is(${Me}):not([data-modal-close])`) ?? o.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || R.at(-1) !== t || !o.current) return;
			let n = [...o.current.querySelectorAll(Me)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = we(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), R.splice(R.indexOf(t), 1), B(), e.open && e.close(), n?.isConnected && n.focus();
		};
	}, []);
	let m = r ? {
		width: "100%",
		height: "100%",
		maxHeight: "none",
		borderRadius: 0,
		border: "none"
	} : {
		width: `min(${e.width ?? "41.25rem"}, calc(100vw - 4rem))`,
		...e.height ? { height: `min(${e.height}, 90vh)` } : { maxHeight: "90vh" },
		borderRadius: 16
	};
	return oe(/* @__PURE__ */ O("dialog", {
		ref: i,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? "full" : "box",
		[Oe]: "",
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
		children: [/* @__PURE__ */ D("style", { children: Ie }), /* @__PURE__ */ O("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ D("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: p,
				style: {
					position: "absolute",
					inset: 0,
					background: Ne
				}
			}), /* @__PURE__ */ D("div", {
				ref: (t) => {
					o.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				tabIndex: -1,
				className: "relative flex flex-col overflow-hidden border outline-none",
				style: {
					...Pe,
					...m,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ O(V.Provider, {
					value: l,
					children: [
						/* @__PURE__ */ D("div", {
							"data-modal-header": !0,
							style: {
								display: "flex",
								flexShrink: 0,
								alignItems: "center",
								gap: 12,
								padding: "12px 48px 12px 20px",
								borderBottom: Fe
							},
							children: /* @__PURE__ */ D("h2", {
								id: `${e.id}-title`,
								style: {
									margin: 0,
									minWidth: 0,
									flex: 1,
									fontSize: 15,
									fontWeight: 600,
									color: "var(--text-strong, var(--text))",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: e.title
							})
						}),
						/* @__PURE__ */ D("button", {
							type: "button",
							"data-modal-close": !0,
							"aria-label": "Close",
							onClick: p,
							style: {
								position: "absolute",
								top: 12,
								right: 16,
								width: 28,
								height: 28,
								padding: 6,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 8,
								border: 0,
								background: "transparent",
								color: "var(--muted)",
								cursor: "pointer"
							},
							children: /* @__PURE__ */ D(ae, {
								size: 16,
								"aria-hidden": "true"
							})
						}),
						/* @__PURE__ */ D("div", {
							"data-modal-body": !0,
							style: {
								minHeight: 0,
								flex: 1,
								...e.flush ? {
									overflow: "hidden",
									padding: 0,
									gap: 0
								} : {
									overflowX: "hidden",
									overflowY: "auto",
									padding: "16px 20px",
									gap: 12
								},
								display: "flex",
								flexDirection: "column"
							},
							children: e.children
						}),
						e.footer && /* @__PURE__ */ D("div", {
							"data-modal-footer": !0,
							style: {
								display: "flex",
								flexShrink: 0,
								flexWrap: "wrap",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 8,
								padding: "12px 20px",
								borderTop: Fe,
								background: "var(--bg-accent, var(--bg-elevated))"
							},
							children: e.footer
						})
					]
				})
			})]
		})]
	}), document.body);
}
// kirocrew-app/ui/src/Tooltip.tsx
var ze = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, U = "button, a[href], input, select, textarea, summary, [role=\"button\"]", Be = `${U}, [tabindex]`, Ve = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function W(e) {
	let t = i(), n = Re(), l = s(null), u = s(null), [d, f] = c(!1), [p, m] = c(null), h = o(() => xe({ onChange: f }), []);
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
		m(be(e, t, {
			width: window.innerWidth,
			height: window.innerHeight
		}));
	}, [d, e.text]);
	let g = e.text?.trim(), [_, v] = c(!1);
	a(() => {
		v(!!g && !l.current?.querySelector(Be));
	});
	let y = typeof e.children == "function" ? e.children(g ? t : void 0) : e.children;
	return g ? /* @__PURE__ */ O("span", {
		ref: l,
		style: {
			display: e.display ?? "inline-flex",
			minWidth: 0
		},
		onPointerEnter: (e) => h.enter(e.pointerType),
		onPointerLeave: (e) => e.pointerType !== "touch" && h.leave(),
		onPointerDown: (e) => {
			let t = e.target, n = t.closest(U), r = t.closest("[data-info-tip]") !== null || !n || !e.currentTarget.contains(n);
			e.pointerType === "touch" && r ? h.tap() : h.hide();
		},
		tabIndex: _ ? 0 : void 0,
		"aria-describedby": _ ? t : void 0,
		onFocus: (e) => h.focus(Ve(e.target)),
		onBlur: h.blur,
		"data-tooltip-anchor": !0,
		children: [
			y,
			/* @__PURE__ */ D("span", {
				id: t,
				role: "tooltip",
				hidden: !0,
				children: g
			}),
			d && oe(/* @__PURE__ */ O("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": p?.side,
				style: {
					position: "fixed",
					top: p?.top ?? 0,
					left: p?.left ?? 0,
					visibility: p ? "visible" : "hidden",
					zIndex: Se.tooltip,
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
					/* @__PURE__ */ D("style", { children: "@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}" }),
					g,
					p && /* @__PURE__ */ D("span", {
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
	}) : /* @__PURE__ */ D(E, { children: y });
}
// kirocrew-app/ui/src/views-api.ts
function He(e) {
	let t = async (t, n, r, i) => (await e.post(k, {
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
function Ue(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var We = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function G(e) {
	return typeof e == "string" && We.test(e) ? e : Ue(e) ?? void 0;
}
var Ge = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Ke = {
	display: "inline-flex",
	alignItems: "center",
	gap: 6
};
function qe(e) {
	let t = e.icon;
	return /* @__PURE__ */ D(W, {
		text: e.tooltip,
		children: (n) => /* @__PURE__ */ O(f, {
			type: "button",
			onClick: e.onClick,
			disabled: e.disabled,
			primary: e.primary,
			"aria-label": e["aria-label"],
			"aria-describedby": n,
			style: {
				...Ke,
				...e.style
			},
			children: [/* @__PURE__ */ D(t, {
				size: 14,
				"aria-hidden": "true"
			}), e.children]
		})
	});
}
({ ...Ke });
var Je = e(async () => !1), Ye = () => n(Je);
function Xe({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ O(Je.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ D(H, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			title: n.title,
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			footer: /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D(f, {
				ref: a,
				type: "button",
				onClick: () => l(!1),
				children: "Cancel"
			}), /* @__PURE__ */ D(f, {
				type: "button",
				"data-danger": !0,
				onClick: () => l(!0),
				style: Ge,
				children: n.action
			})] }),
			children: /* @__PURE__ */ D("p", {
				id: "avoozl-confirm-body",
				className: "text-sm text-muted",
				children: n.body
			})
		})]
	});
}
// kirocrew-app/ui/src/dashboard-api.ts
var Ze = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function Qe(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Ze.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/driver-api.ts
function $e(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
var et = (e) => ({
	running: "A driver session is working. Open it to watch or steer.",
	idle: "The driver session has been quiet for a while. Open it to check on it, or start a new one.",
	none: "No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.",
	unknown: "Avoozl could not read the driver session. It tries again soon."
})[e], tt = (e, t) => $e(new Date(e).toISOString(), t);
function nt(e, t, n) {
	if (!t || n - t.at < 6e4) return null;
	let r = new Set(t.waitingKeys), i = e.recent.filter((e) => Date.parse(e.at) > t.at), a = e.waiting.filter((e) => !r.has(e.key)).map(({ key: e, title: t, label: n }) => ({
		key: e,
		title: t,
		label: n
	}));
	return !i.length && !a.length ? null : {
		since: tt(t.at, n),
		finished: i,
		needsYou: a
	};
}
// kirocrew-app/ui/src/panel-chat.ts
function rt(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function it(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${at(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") || t.driver && e === t.driver ? { kind: "avoozl" } : { kind: "other" };
}
var at = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function ot(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/flow-api.ts
function st(e) {
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
var ct = "avoozl:line-changed", lt = () => {
	typeof window < "u" && window.dispatchEvent(new Event(ct));
};
function ut(e) {
	let t = (t, n, r = {}) => e.post(k, {
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
		models: () => e.get("/api/models").then(st),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n }),
		proposals: (e) => t(e, "flow.proposals"),
		revertPrompt: (e, n) => t(e, "prompt.override.revert", { target: n }),
		rebasePrompt: (e, n) => t(e, "prompt.override.rebase", n)
	};
}
function dt(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var ft = [
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
], pt = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], mt = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", ht = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function gt(e) {
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
function _t(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${dt(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/panel-api.ts
async function vt(e, t) {
	return (await e.post(k, {
		operation: "panel.view",
		input: {},
		workspaceId: t
	})).result;
}
function yt(e, t) {
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
var bt = /* @__PURE__ */ new Set([
	"needs-human",
	"github-conflict",
	"tracker-conflict",
	"review",
	"ready-to-merge",
	"branch-landing",
	"content-match",
	"content-unavailable"
]), xt = {
	"needs-human": "Needs you",
	"github-conflict": "GitHub edit",
	"tracker-conflict": "Tracker edit",
	review: "Review",
	"ready-to-merge": "Ready to merge",
	"branch-landing": "Ready to land",
	"content-match": "Content rule",
	"content-unavailable": "Rule set unavailable"
};
function St(e) {
	if (!bt.has(e.kind) || e.kind === "needs-human" && e.reason === "hand-set-review" || e.kind === "ready-to-merge" && e.integrate) return null;
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
		label: xt[e.kind] ?? e.kind,
		title: e.title,
		detail: e.detail,
		at: e.changedAt ?? null,
		actions: t
	};
}
function Ct(e, t, n) {
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
function wt(e) {
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
		noAttach: t ? null : `Set the dashboard link for ${e.host} to open its session.`,
		pr: !1,
		check: null,
		claimedAt: null,
		updated: e.updatedAt || null
	};
}
function Tt(e) {
	let t = [];
	e.conflicts || t.push("waiting"), !e.crews && !e.remote && t.push("inFlight"), e.queue || t.push("queue"), e.flow || t.push("recent");
	let n = (e.conflicts ?? []).map(St).filter((e) => e !== null), r = /* @__PURE__ */ new Map();
	for (let t of e.crews?.groups ?? []) for (let e of t.rows) e.instanceId && r.set(e.instanceId, t.name);
	let i = [...(e.crews?.rows ?? []).map((t) => Ct(t, r, e.checks?.[`${t.repository}#${t.pr}`] ?? null)), ...(e.remote ?? []).map(wt)], a = null;
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
	})), s = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(_t);
	return {
		waiting: n,
		inFlight: i,
		queue: a,
		recent: o,
		stops: s,
		unread: t
	};
}
function Et(e) {
	let t = e?.state ?? "none", n = e?.workspace ?? null, r = t === "none" || t === "idle" ? e?.others?.[0] : void 0;
	return {
		state: t,
		link: e?.href ?? null,
		start: t === "none" || t === "idle",
		note: et(t),
		workspace: n,
		elsewhere: r ? {
			text: `No driver for ${n ?? "this workspace"}. ${r.workspace} has one:`,
			href: r.href,
			slot: r.slot,
			workspace: r.workspace
		} : null
	};
}
function Dt(e, t) {
	return t && e?.others?.find((e) => e.slot === t)?.root || null;
}
var Ot = (e, t) => {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "");
	return n(e) === n(t);
};
function kt(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	return r < 1 ? "now" : r < 60 ? `${r}m` : r < 2880 ? `${Math.round(r / 60)}h` : `${Math.round(r / 60 / 24)}d`;
}
function At(e) {
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
function jt(e, t) {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, ""), r = n(e), i = n(t);
	return !!i && (r === i || r.startsWith(`${i}/`));
}
function Mt(e) {
	let t = (t) => !!(t && e.workspaces.some((e) => e.id === t));
	if (e.driverRoot) {
		let t = e.workspaces.find((t) => Ot(t.root, e.driverRoot));
		if (t) return {
			id: t.id,
			why: "driver"
		};
	}
	if (e.project) {
		let t = null;
		for (let n of e.workspaces) for (let r of [n.root, ...n.roots]) r && jt(e.project, r) && (!t || r.length > t.length) && (t = {
			id: n.id,
			length: r.length
		});
		if (t) return {
			id: t.id,
			why: "folder"
		};
	}
	return t(e.last) ? {
		id: e.last,
		why: "last"
	} : t(e.fallback) ? {
		id: e.fallback,
		why: "default"
	} : {
		id: null,
		why: "none"
	};
}
async function Nt(e, t) {
	if (!t) return null;
	try {
		let n = await e.get("/api/chat/slots"), r = (Array.isArray(n) ? n : []).find((e) => e.key === t);
		return typeof r?.project == "string" && r.project ? r.project : null;
	} catch {
		return null;
	}
}
// kirocrew-app/ui/src/PanelParts.tsx
var Pt = "\n[data-pp]{container-type:inline-size;font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}\n[data-pp] *{box-sizing:border-box}\n[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}\n[data-pp-head-name]{flex:0 1 auto;display:inline-flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}\n[data-pp-head-brand]{display:inline-flex;align-items:baseline;gap:4px;flex:none}\n[data-pp-head-instance]{font-weight:400;color:var(--muted);flex:none}\n[data-pp-head-workspace]{font-weight:400;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-pp-head-link]{padding:0;margin:0;background:none;border:0;font:inherit;color:inherit;cursor:pointer;text-decoration:none}\n[data-pp-head-link]:hover,[data-pp-head-link]:focus-visible{color:var(--accent);text-decoration:underline}\n[data-pp-head-tools]{flex:none;display:inline-flex;align-items:center;gap:2px}\n[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto}\n[data-pp-section]{border-bottom:1px solid var(--border)}\n[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}\n[data-pp-section-head]:hover{background:var(--bg-hover)}\n[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}\n[data-pp-section-title]{color:var(--text-strong,var(--text))}\n[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}\n[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}\n[data-pp-row]:hover{background:var(--bg-hover)}\n[data-pp-row-icon]{display:inline-flex;color:var(--muted)}\n[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}\n[data-pp-row-line]{display:flex;flex-wrap:nowrap;align-items:center;gap:0 6px;min-width:0;overflow:hidden}\n[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}\na[data-pp-row-title]{text-decoration:none}\na[data-pp-row-title]:hover{text-decoration:underline}\n[data-pp-row-line]>[data-tooltip-anchor]{flex:0 0 auto;max-width:100%}\n[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:0 1 auto;min-width:0}\n[data-pp-row-line]>[data-tooltip-anchor]:has([data-pp-age]){margin-left:auto}\n[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}\n[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}\n[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}\n[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}\n[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}\n[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}\n[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}\n[data-pp-act],[data-pp-icon]{min-height:22px;background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}\n[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}\n[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}\n[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}\n[data-pp-icon][data-bare]{padding:2px 5px;border-color:transparent}\n[data-pp-cells]{padding:0 12px 8px}\n[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}\n@media (max-width:640px){\n[data-pp-head-name]>[data-pp-head-brand]{display:none}\n[data-pp-head-workspace]>[data-pp-head-dot]{display:none}\n[data-pp-narrow-hide]{display:none}\n[data-pp-act][data-narrow-icon]{padding:2px 6px}\n}\n@container (max-width:520px){\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4)){flex-wrap:wrap}\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4))>[data-tooltip-anchor]:first-child{max-width:100%}\n}\n@container (max-width:520px){\n[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}\n[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}\n}\n";
function Ft() {
	return /* @__PURE__ */ D("style", { children: Pt });
}
var It = "avoozl.panel.folds", Lt = e(null);
function Rt() {
	try {
		let e = JSON.parse(window.localStorage.getItem(It) ?? "{}");
		return e && typeof e == "object" && !Array.isArray(e) ? e : {};
	} catch {
		return {};
	}
}
function zt() {
	let [e, n] = c(Rt), [r, i] = c({}), a = t((e) => {
		n(e);
		try {
			window.localStorage.setItem(It, JSON.stringify(e));
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
function Bt(e) {
	let t = zt();
	return /* @__PURE__ */ D(Lt.Provider, {
		value: t,
		children: /* @__PURE__ */ O("div", {
			"data-pp": !0,
			"data-panel-kind": e.kind,
			style: {
				display: "flex",
				flexDirection: "column"
			},
			children: [/* @__PURE__ */ D(Ft, {}), e.children]
		})
	});
}
function K(e) {
	let { tone: t = "muted", tip: n, href: r, children: i, ...a } = e;
	return /* @__PURE__ */ D(W, {
		text: n,
		children: r ? /* @__PURE__ */ D("a", {
			"data-pp-chip": !0,
			"data-tone": t,
			href: G(r),
			target: "_blank",
			rel: "noreferrer",
			style: { textDecoration: "none" },
			...a,
			children: i
		}) : /* @__PURE__ */ D("span", {
			"data-pp-chip": !0,
			"data-tone": t,
			...a,
			children: i
		})
	});
}
function Vt(e) {
	let t = n(Lt), r = t?.allOpen ? "Collapse all sections" : "Expand all sections", i = t?.allOpen ? _ : v;
	return /* @__PURE__ */ O("div", {
		"data-pp-head": !0,
		children: [
			/* @__PURE__ */ O("span", {
				"data-pp-head-name": !0,
				children: [/* @__PURE__ */ O("span", {
					"data-pp-head-brand": !0,
					children: [e.onName ? /* @__PURE__ */ D(W, {
						text: e.nameTip,
						children: /* @__PURE__ */ D("button", {
							type: "button",
							"data-pp-head-link": !0,
							"aria-label": e.nameTip,
							onClick: e.onName,
							children: e.name
						})
					}) : e.name, e.instance && /* @__PURE__ */ D(W, {
						text: e.tip,
						children: /* @__PURE__ */ O("span", {
							"data-pp-head-instance": !0,
							children: ["· ", e.instance]
						})
					})]
				}), e.workspace && /* @__PURE__ */ O("span", {
					"data-pp-head-workspace": !0,
					children: [/* @__PURE__ */ D("span", {
						"data-pp-head-dot": !0,
						children: "· "
					}), e.workspace]
				})]
			}),
			/* @__PURE__ */ O("span", {
				"data-pp-head-tools": !0,
				children: [e.tools, t && /* @__PURE__ */ D(W, {
					text: r,
					children: /* @__PURE__ */ D("button", {
						type: "button",
						"data-pp-icon": !0,
						"data-bare": !0,
						"data-pp-toggle-all": !0,
						"aria-label": r,
						"aria-pressed": t.allOpen,
						onClick: () => t.setAll(!t.allOpen),
						children: /* @__PURE__ */ D(i, {
							size: 13,
							"aria-hidden": "true"
						})
					})
				})]
			}),
			e.end && /* @__PURE__ */ D("span", {
				"data-pp-head-end": !0,
				children: e.end
			})
		]
	});
}
function q(e) {
	let t = n(Lt), r = !!e.open;
	a(() => t?.register(e.id, r), [
		t?.register,
		e.id,
		r
	]);
	let i = t ? t.isOpen(e.id, r) : r, o = i ? h : g;
	return /* @__PURE__ */ O("div", {
		"data-pp-section": !0,
		"data-panel-fold": e.id,
		"data-open": i ? "" : void 0,
		children: [/* @__PURE__ */ O("button", {
			type: "button",
			"data-pp-section-head": !0,
			"aria-expanded": i,
			onClick: () => t?.toggle(e.id, r),
			children: [
				/* @__PURE__ */ D(o, {
					size: 13,
					"data-pp-chevron": !0,
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ D("span", {
					"data-pp-section-title": !0,
					children: e.title
				}),
				e.count !== void 0 && e.count > 0 && /* @__PURE__ */ D(K, {
					tone: e.tone ?? "info",
					children: e.count
				}),
				e.summary && /* @__PURE__ */ D("span", {
					"data-pp-summary": !0,
					children: e.summary
				})
			]
		}), i && e.children]
	});
}
function J(e) {
	return /* @__PURE__ */ D("ul", {
		"data-pp-list": !0,
		children: e.children
	});
}
function Y(e) {
	return /* @__PURE__ */ D("p", {
		"data-pp-empty": !0,
		role: e.role,
		children: e.children
	});
}
function X(e) {
	let { icon: t, title: n, href: r, chips: i, age: a, ageTip: o, meta: s, actions: c, multi: l, noTip: u, ...d } = e;
	return /* @__PURE__ */ O("li", {
		"data-pp-row": !0,
		"data-multi": l ? "" : void 0,
		...d,
		children: [
			/* @__PURE__ */ D("span", {
				"data-pp-row-icon": !0,
				children: /* @__PURE__ */ D(t, {
					size: 14,
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ O("span", {
				"data-pp-row-main": !0,
				children: [/* @__PURE__ */ O("span", {
					"data-pp-row-line": !0,
					children: [
						/* @__PURE__ */ D(W, {
							text: u ? null : n,
							display: "block",
							children: r ? /* @__PURE__ */ D("a", {
								"data-pp-row-title": !0,
								href: G(r),
								target: "_blank",
								rel: "noreferrer",
								children: n
							}) : /* @__PURE__ */ D("span", {
								"data-pp-row-title": !0,
								children: n
							})
						}),
						i,
						a && /* @__PURE__ */ D(W, {
							text: o,
							children: /* @__PURE__ */ D("span", {
								"data-pp-age": !0,
								children: a
							})
						})
					]
				}), s && /* @__PURE__ */ D(W, {
					text: s,
					display: "block",
					children: /* @__PURE__ */ D("span", {
						"data-pp-row-meta": !0,
						style: { display: "block" },
						children: s
					})
				})]
			}),
			c && /* @__PURE__ */ D("span", {
				"data-pp-actions": !0,
				children: c
			})
		]
	});
}
function Z(e) {
	let { label: t, icon: n, href: r, onClick: i, disabled: a, primary: o, tip: s, narrowIcon: c, name: l, ...u } = e, d = /* @__PURE__ */ O(E, { children: [n && /* @__PURE__ */ D(n, {
		size: 12,
		"aria-hidden": "true"
	}), c ? /* @__PURE__ */ D("span", {
		"data-pp-narrow-hide": !0,
		children: t
	}) : t] }), f = {
		"aria-label": l,
		"data-narrow-icon": c ? "" : void 0
	};
	return /* @__PURE__ */ D(W, {
		text: s,
		children: r ? /* @__PURE__ */ D("a", {
			"data-pp-act": !0,
			"data-pp-primary": o ? "" : void 0,
			href: G(r),
			target: "_blank",
			rel: "noreferrer",
			...f,
			...u,
			children: d
		}) : /* @__PURE__ */ D("button", {
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
var Ht = (e) => String(e).padStart(2, "0");
function Ut(e, t) {
	let n = Math.max(0, Math.ceil(e));
	return !t && n < 100 ? `${n}s` : n >= 3600 ? `${Math.floor(n / 3600)}:${Ht(Math.floor(n % 3600 / 60))}:${Ht(n % 60)}` : `${Math.floor(n / 60)}:${Ht(n % 60)}`;
}
var Wt = (e, t) => e || t >= 3600 ? 7 : t < 100 ? 3 : 5, Gt = (e) => e?.cacheSeconds ? e.cacheSeconds : e?.cacheSeconds === 0 ? 20 : 60;
function Kt(e, t) {
	let n = e?.limitedUntil ? Date.parse(e.limitedUntil) : 0;
	return n > t ? Math.ceil((n - t) / 1e3) : 0;
}
function qt(e, t, n) {
	if (n > 0) return `GitHub's rate limit is reached. Calls resume at ${new Date(Date.now() + n * 1e3).toLocaleTimeString()}. Refresh shows what Avoozl last read.`;
	let r = e?.resources?.core;
	return [`Reads again in ${t}s. GitHub answers are kept ${e?.cacheSeconds ?? 60}s (Settings > GitHub).`, r ? `${r.remaining} of ${r.limit} GitHub calls left this hour.` : ""].filter(Boolean).join(" ");
}
var Jt = (e) => e >= 100 ? "var(--danger)" : `color-mix(in srgb, var(--danger) ${Math.round(Math.max(0, e) * .8)}%, var(--muted))`;
// kirocrew-app/ui/src/task-api.ts
function Q(e, t = Date.now()) {
	if (!e) return "";
	let n = Date.parse(e);
	if (!Number.isFinite(n)) return "";
	let r = Math.round((t - n) / 6e4);
	return r < 1 ? "just now" : r < 60 ? `${r} min ago` : r < 1440 ? `${Math.round(r / 60)} h ago` : r < 20160 ? `${Math.round(r / 60 / 24)} d ago` : e.slice(0, 10);
}
// kirocrew-app/ui/src/settings-api.ts
function Yt(e) {
	let t = async (t, n, r) => (await e.post(k, {
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
var Xt = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: 28,
	height: 28,
	padding: 0,
	borderRadius: 6,
	border: "1px solid var(--border)",
	background: "transparent",
	cursor: "pointer"
};
// kirocrew-app/ui/src/RefreshButton.tsx
function Zt(e, n, i) {
	let a = A(), l = o(() => Yt(a), [a]), [u, d] = c(null), [f, p] = c(60), [m, h] = c(() => Date.now()), g = s(n);
	g.current = n;
	let _ = Gt(u), v = Kt(u, m), y = t(() => {
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
			(typeof document > "u" || document.visibilityState !== "hidden") && (h(Date.now()), Kt(u, Date.now()) > 0 || (--b.current, b.current <= 0 ? x() : p(b.current)));
		}, 1e3);
		return () => clearInterval(e);
	}, [u, x]), {
		refresh: x,
		busy: i,
		left: f,
		limited: v,
		period: _,
		tip: qt(u, f, v)
	};
}
function Qt({ state: e }) {
	let { refresh: t, busy: n, left: r, limited: i, period: a } = e, o = i > 0 ? i : r;
	return /* @__PURE__ */ D(qe, {
		icon: ie,
		onClick: t,
		disabled: n,
		tooltip: e.tip,
		"aria-label": `Refresh, ${i > 0 ? "GitHub limit lifts in " : "reads again in "}${Ut(o, i > 0)}`,
		children: /* @__PURE__ */ D("span", {
			style: {
				display: "inline-block",
				minWidth: `${Wt(i > 0, a)}ch`,
				textAlign: "right",
				fontVariantNumeric: "tabular-nums"
			},
			children: Ut(o, i > 0)
		})
	});
}
function $t({ state: e, nav: t }) {
	let { refresh: n, busy: r, left: i, limited: a, period: o } = e, s = `Refresh, ${a > 0 ? "GitHub limit lifts in " : "reads again in "}${Ut(a > 0 ? a : i, a > 0)}`, c = a > 0 ? 100 : Math.round(Math.min(1, Math.max(0, 1 - i / o)) * 100);
	return /* @__PURE__ */ D(W, {
		text: e.tip,
		children: /* @__PURE__ */ D("button", {
			type: "button",
			...t ? { "data-nav-refresh": "" } : {
				"data-pp-icon": "",
				"data-bare": ""
			},
			"data-refresh-age": c,
			"data-limited": a > 0 ? "" : void 0,
			onClick: n,
			disabled: r,
			"aria-label": s,
			style: t ? {
				...Xt,
				color: Jt(c)
			} : { color: Jt(c) },
			children: /* @__PURE__ */ D(ie, {
				size: 13,
				"aria-hidden": "true"
			})
		})
	});
}
function en(e) {
	let t = Zt(e.workspaceId, e.onRefresh, e.busy);
	return e.bare ? /* @__PURE__ */ D($t, { state: t }) : /* @__PURE__ */ D(Qt, { state: t });
}
// kirocrew-app/ui/src/StatusCells.tsx
var tn = "\n[data-sc-row]{container-type:inline-size}\n[data-sc-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}\n@container (max-width:420px){[data-sc-grid]{grid-template-columns:minmax(0,1fr)}}\n[data-sc]{display:flex;flex-wrap:nowrap;align-items:center;align-content:flex-start;gap:0 8px;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:18px;color:var(--text)}\n[data-sc-title]{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-weight:600;color:var(--text-strong,var(--text));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-sc-dot]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}\n[data-sc-dot][data-tone=ok]{background:var(--ok)}\n[data-sc-dot][data-tone=warn]{background:var(--warning,#b7791f)}\n[data-sc-dot][data-tone=danger]{background:var(--danger)}\n[data-sc-actions]{flex:none;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;margin-left:auto}\n[data-sc-act]{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--muted);font:inherit;text-decoration:none;cursor:pointer;transition:background-color .12s,color .12s}\n[data-sc-act]:hover{background:var(--bg-hover);color:var(--text)}\n[data-sc-act][data-primary]{color:var(--accent)}\n[data-sc-act]:disabled{opacity:.6;cursor:default}\n";
function nn(e) {
	return /* @__PURE__ */ O("div", {
		"data-sc-row": !0,
		children: [/* @__PURE__ */ D("style", { children: tn }), /* @__PURE__ */ D("div", {
			"data-sc-grid": !0,
			children: e.children
		})]
	});
}
function rn(e) {
	let { tone: t, title: n, tip: r, actions: i, ...a } = e;
	return /* @__PURE__ */ O("div", {
		"data-sc": !0,
		"data-tip": r,
		...a,
		children: [/* @__PURE__ */ D(W, {
			text: r,
			children: (e) => /* @__PURE__ */ O("span", {
				"data-sc-title": !0,
				tabIndex: 0,
				"aria-describedby": e,
				children: [/* @__PURE__ */ D("i", {
					"data-sc-dot": !0,
					"data-tone": t,
					"aria-hidden": "true"
				}), n]
			})
		}), i && /* @__PURE__ */ D("span", {
			"data-sc-actions": !0,
			children: i
		})]
	});
}
function an(e) {
	let { label: t, icon: n, onClick: r, href: i, primary: a, tip: o, ...s } = e;
	return /* @__PURE__ */ D(W, {
		text: o ?? t,
		children: i ? /* @__PURE__ */ D("a", {
			"data-sc-act": !0,
			"data-primary": a ? "" : void 0,
			"aria-label": t,
			href: G(i),
			...s,
			children: n
		}) : /* @__PURE__ */ D("button", {
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
function on(e) {
	let t = async (t, n, r = {}) => (await e.post(k, {
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
function sn(e) {
	let t = async (t, n, r) => (await e.post(k, {
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
		gates: (e) => t("gate.list", {}, e),
		clearGate: (e, n, r) => t("gate.clear", {
			taskId: n,
			reason: r
		}, e),
		step: (e, n) => t("radar.releasestep", { planId: n }, e)
	};
}
// kirocrew-app/ui/src/spec-builder-api.ts
var cn = "/api/apps/spec-builder/specs", ln = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function un(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function dn(e, t, n = 50) {
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
function fn(e, t, n) {
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
var pn = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function mn(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => un(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = (t) => e.plain ? t.title : pn(t), p = d && u ? f(d) : "", [m, h] = c(p), [g, _] = c(!1), [v, y] = c(!1), [b, x] = c(0), ee = s(null);
	r(() => {
		g || h(p);
	}, [p, g]);
	let { shown: S, total: C } = o(() => dn(l, g ? m : ""), [
		l,
		m,
		g
	]);
	r(() => {
		ee.current?.querySelector(`#${CSS.escape(`${n}-opt-${b}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [b, n]);
	let w = (t) => {
		e.onPick(t.id), _(!1), y(!1), h(u ? f(t) : "");
	}, te = (t) => {
		let n = fn({
			open: v,
			active: b
		}, t.key, S.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (y(!0), x(n.state.active)) : n.kind === "pick" ? w(S[n.index]) : n.kind === "close" ? y(!1) : (h(""), _(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, T = v && (S.length > 0 || g);
	return /* @__PURE__ */ O("div", {
		className: "flex min-w-0 flex-col gap-1 text-sm",
		style: {
			maxWidth: e.maxWidth ?? "100%",
			position: "relative"
		},
		children: [
			/* @__PURE__ */ D("label", {
				htmlFor: n,
				children: e.label
			}),
			/* @__PURE__ */ D("input", {
				id: n,
				type: "text",
				role: "combobox",
				"aria-expanded": T,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": T && S.length ? `${n}-opt-${b}` : void 0,
				autoComplete: "off",
				spellCheck: !1,
				value: m,
				placeholder: e.value ? void 0 : e.emptyLabel ?? e.placeholder,
				onChange: (e) => {
					h(e.target.value), _(!0), y(!0), x(0);
				},
				onFocus: () => {
					y(!0), x(0);
				},
				onBlur: () => {
					y(!1), g && !m.trim() && e.emptyLabel !== void 0 && e.value && e.onPick(""), _(!1);
				},
				onKeyDown: te,
				className: "rounded border px-2 py-1 text-sm",
				style: ln,
				"data-picker": !0
			}),
			/* @__PURE__ */ O("div", {
				hidden: !T,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: Se.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ D("ul", {
						ref: ee,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: S.map((t, r) => /* @__PURE__ */ O("li", {
							id: `${n}-opt-${r}`,
							role: "option",
							"aria-selected": r === b,
							onMouseDown: (e) => {
								e.preventDefault(), w(t);
							},
							onMouseEnter: () => x(r),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: r === b ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								e.plain ? /* @__PURE__ */ D("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title
								}) : /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.id
								}), /* @__PURE__ */ D("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title === t.id ? "" : t.title
								})] }),
								t.spec && /* @__PURE__ */ D("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.spec
								}),
								t.state && /* @__PURE__ */ D("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: t.state
								})
							]
						}, t.id))
					}),
					C === 0 && /* @__PURE__ */ D("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					C > S.length && /* @__PURE__ */ O("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [C - S.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var hn = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), gn = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function _n() {
	return /* @__PURE__ */ D("hr", {
		"data-section-rule": !0,
		className: "my-3 border-0 border-t",
		style: {
			borderColor: "var(--border)",
			borderTopWidth: 1,
			borderTopStyle: "solid"
		}
	});
}
function vn(e) {
	return /* @__PURE__ */ O("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ D("style", { children: gn }), e.sections.map((t) => {
			let n = t.key === e.value, r = t.icon, i = `${e.name}-${t.key}`;
			return /* @__PURE__ */ O("section", {
				"data-radio-section": t.key,
				"data-open": n,
				className: "rounded-lg",
				style: {
					border: `${n ? 2 : 1}px solid ${n ? "var(--accent)" : "var(--border)"}`,
					background: n ? "color-mix(in srgb, var(--accent) 4%, var(--card))" : "var(--card)",
					marginTop: 8,
					opacity: t.disabled ? .65 : 1
				},
				children: [/* @__PURE__ */ O("label", {
					htmlFor: i,
					className: "flex items-start gap-3",
					style: {
						padding: n ? 11 : 12,
						cursor: t.disabled ? "not-allowed" : "pointer"
					},
					children: [/* @__PURE__ */ D("input", {
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
					}), /* @__PURE__ */ O("span", {
						className: "flex min-w-0 flex-col gap-0.5",
						children: [
							/* @__PURE__ */ O("span", {
								className: "flex items-center gap-2 text-base font-semibold",
								children: [r && /* @__PURE__ */ D(r, {
									size: 16,
									"aria-hidden": "true",
									style: {
										flex: "none",
										color: n ? "var(--accent)" : "var(--muted)"
									}
								}), t.title]
							}),
							/* @__PURE__ */ D("span", {
								id: `${i}-line`,
								className: "text-sm text-muted",
								children: t.line
							}),
							t.disabled && /* @__PURE__ */ D("span", {
								className: "text-xs text-muted",
								children: t.disabled
							})
						]
					})]
				}), n && !t.disabled && (t.description || t.fields) && /* @__PURE__ */ O("div", {
					"data-radio-fold-body": !0,
					className: "flex min-w-0 flex-col",
					style: { padding: "0 13px 13px" },
					children: [
						t.description,
						t.description && t.fields && /* @__PURE__ */ D(_n, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var yn = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, bn = {
	...yn,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, xn = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, Sn = 6e4;
function Cn(e) {
	let t = A(), n = o(() => ut(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, Sn);
		return window.addEventListener(ct, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(ct, r);
		};
	}, [n, e]), i;
}
function wn(e) {
	let [t, n] = c(!1), r = Cn(e.workspaceId), i = A(), a = o(() => ut(i), [i]), s = Ye();
	if (!e.workspaceId) return null;
	let l = r.length > 0, u = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; "), d = t && /* @__PURE__ */ D(Tn, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), lt(), e.onPulled?.();
		}
	});
	if (e.bare || e.nav) {
		let t = async () => {
			if (await s({
				title: "Resume the line?",
				body: `New work starts again. The line was stopped for: ${u}`,
				action: "Resume"
			}) && e.workspaceId) {
				for (let t of r) await a.resume(e.workspaceId, t.id);
				lt();
			}
		}, i = l ? "Resume the line" : "Stop the line", o = l ? ne : T;
		return /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D(W, {
			text: i,
			children: /* @__PURE__ */ D("button", {
				type: "button",
				...e.nav ? {} : {
					"data-pp-icon": "",
					"data-bare": ""
				},
				"data-stop-line": !0,
				"data-stopped": l ? "" : void 0,
				"aria-label": i,
				onClick: () => l ? void t() : n(!0),
				style: {
					...e.nav ? Xt : {},
					color: l ? "var(--ok)" : "var(--danger)",
					borderColor: "var(--border)"
				},
				children: /* @__PURE__ */ D(o, {
					size: 13,
					"aria-hidden": "true"
				})
			})
		}), d] });
	}
	return /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D(W, {
		text: l ? `The line is stopped: ${u}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (e) => /* @__PURE__ */ O(f, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": l ? "" : void 0,
			"aria-describedby": e,
			"aria-label": l ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: {
				...l ? bn : yn,
				padding: "4px 6px"
			},
			children: [/* @__PURE__ */ D(T, {
				size: 14,
				"aria-hidden": "true",
				style: l ? { color: "var(--danger)" } : void 0
			}), /* @__PURE__ */ D("span", {
				className: "sr-only",
				children: l ? "Line stopped" : "Stop the line"
			})]
		})
	}), d] });
}
function Tn(e) {
	let n = A(), i = o(() => ut(n), [n]), [a, l] = c(ht), [u, d] = c(null), [m, h] = c(null), [g, _] = c(!1), v = Ye(), y = s(null), b = (e) => l((t) => ({
		...t,
		...e
	})), x = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			ce(n).repositories(r),
			on(n).stored(r),
			He(n).graph(r)
		]).then(([e, n, r]) => {
			t && d({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? hn(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		y.current?.querySelector("input, button")?.focus();
	}, []);
	let ee = async () => {
		let { input: t, error: n } = gt(a);
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
				h(se(e));
			} finally {
				_(!1);
			}
		}
	}, S = (e) => /* @__PURE__ */ D("p", {
		className: "text-sm text-muted",
		children: u ? e : "Reading…"
	}), C = (e) => /* @__PURE__ */ O("span", { children: [
		e,
		" ",
		/* @__PURE__ */ D("span", {
			className: "text-xs text-muted",
			children: "(required)"
		})
	] }), w = (e, t, n, r, i) => n.length ? /* @__PURE__ */ D(mn, {
		label: C(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : S(i), te = {
		all: null,
		repo: u?.repositories.length ? /* @__PURE__ */ O("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [C("Repository"), /* @__PURE__ */ O("select", {
				value: a.repository,
				onChange: (e) => b({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: xn,
				"data-stop-target": !0,
				children: [/* @__PURE__ */ D("option", {
					value: "",
					children: "Choose…"
				}), u.repositories.map((e) => /* @__PURE__ */ D("option", {
					value: e,
					children: e
				}, e))]
			})]
		}) : S("No repository is registered."),
		spec: w("Spec", a.spec, u?.specs ?? [], (e) => b({ spec: e }), "No spec is stored yet."),
		task: w("Task", a.taskId, u?.tasks ?? [], (e) => b({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ O(H, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: y,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(ht()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		title: /* @__PURE__ */ O("span", {
			className: "inline-flex items-center gap-1.5",
			children: [/* @__PURE__ */ D(T, {
				size: 14,
				"aria-hidden": "true",
				style: { color: "var(--danger)" }
			}), " Stop the line"]
		}),
		onDismiss: x,
		footer: /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D(f, {
			type: "button",
			onClick: x,
			children: "Cancel"
		}), /* @__PURE__ */ O(f, {
			type: "button",
			"data-danger": !0,
			"data-stop-confirm": !0,
			onClick: () => void ee(),
			disabled: g,
			style: yn,
			children: [/* @__PURE__ */ D(T, {
				size: 14,
				"aria-hidden": "true"
			}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
		})] }),
		children: [
			/* @__PURE__ */ D("div", { children: /* @__PURE__ */ D("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			}) }),
			/* @__PURE__ */ D(vn, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => b({ kind: e }),
				sections: pt.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ D("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: mt
					}) } : { fields: /* @__PURE__ */ D(vn, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => b({ scope: e }),
						sections: ft.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: te[e.value]
						}))
					}) }
				}))
			}),
			/* @__PURE__ */ O("label", {
				className: "flex flex-col gap-1 text-sm",
				children: [
					/* @__PURE__ */ O("span", { children: ["Reason ", /* @__PURE__ */ D("span", {
						className: "text-xs text-muted",
						children: "(required)"
					})] }),
					/* @__PURE__ */ D(p, {
						value: a.reason,
						maxLength: 200,
						placeholder: "The base is broken; looking into it",
						onChange: (e) => b({ reason: e.target.value }),
						"data-stop-reason": !0
					}),
					/* @__PURE__ */ D("span", {
						className: "text-xs text-muted",
						children: "One line. It shows on the banner and in Flow."
					})
				]
			}),
			m && /* @__PURE__ */ D("p", {
				role: "alert",
				className: "text-sm text-danger",
				children: m
			})
		]
	});
}
// kirocrew-app/ui/src/instance-api.ts
function En(e) {
	let t = async (t, n, r) => (await e.post(k, {
		operation: t,
		input: n,
		workspaceId: r
	})).result;
	return {
		view: (e) => t("instance.view", {}, e),
		rename: (e, n) => t("instance.rename", { name: n }, e)
	};
}
function Dn(e, t) {
	return e && (t === "header" || e.shared) ? e.name : null;
}
// kirocrew-app/ui/src/InstanceName.tsx
var On = "avoozl:instance-changed";
function kn(e) {
	let n = A(), i = o(() => En(n), [n]), [a, s] = c(null), l = t(() => {
		e && i.view(e).then(s, () => void 0);
	}, [i, e]);
	return r(() => (l(), window.addEventListener(On, l), () => window.removeEventListener(On, l)), [l]), a;
}
// kirocrew-app/ui/src/Panel.tsx
var An = "/apps/avoozl", jn = "avoozl.panel.away";
function Mn(e) {
	try {
		let t = e?.getItem(jn);
		e?.removeItem(jn);
		let n = t ? JSON.parse(t) : null;
		return n && Number.isFinite(n.at) && Array.isArray(n.waitingKeys) ? n : null;
	} catch {
		return null;
	}
}
function $() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var Nn = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, Pn = {
	review: C,
	"ready-to-merge": C,
	"branch-landing": S
}, Fn = {
	running: "Running",
	idle: "Quiet",
	none: "Not started",
	unknown: "Unknown"
}, In = {
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
function Ln(e) {
	return /* @__PURE__ */ D(J, { children: e.rows.map((t) => /* @__PURE__ */ D(X, {
		"data-waiting-row": t.kind,
		icon: Pn[t.kind] ?? y,
		title: t.title,
		chips: /* @__PURE__ */ D(K, {
			tone: "warn",
			children: t.label
		}),
		age: t.at ? kt(t.at, e.now) : null,
		ageTip: t.at ? `Changed ${Q(t.at, e.now)}` : void 0,
		meta: t.detail,
		multi: t.actions.length > 1,
		actions: t.actions.map((n) => n.kind === "link" && n.href.startsWith("/apps/") ? /* @__PURE__ */ D(Z, {
			label: n.label,
			onClick: e.onOpenPage
		}, n.label) : n.kind === "link" ? /* @__PURE__ */ D(Z, {
			label: n.label,
			href: G(n.href)
		}, n.label) : /* @__PURE__ */ D(Z, {
			label: n.label,
			disabled: e.busy === t.key,
			onClick: () => e.onAct(t, n)
		}, n.label))
	}, t.key)) });
}
function Rn({ rows: e, now: t }) {
	return /* @__PURE__ */ D(J, { children: e.map((e) => {
		let n = e.pr ? At(e.check) : null, r = [
			e.instance ?? (e.source === "radar" ? "No Avoozl" : null),
			e.crew ?? e.who,
			e.source === "radar" ? e.ref : e.who,
			e.phase ? null : "claim label, no claim comment"
		].filter(Boolean);
		return /* @__PURE__ */ D(X, {
			"data-flight-row": e.source,
			icon: e.pr ? C : e.source === "radar" ? re : b,
			title: e.title,
			href: G(e.issueUrl),
			chips: /* @__PURE__ */ O(E, { children: [
				/* @__PURE__ */ D(K, {
					tone: e.stale ? "warn" : "info",
					tip: e.updated ? `Updated ${Q(e.updated, t)}` : void 0,
					children: e.phase ?? "claimed"
				}),
				e.stale && /* @__PURE__ */ D(K, {
					tone: "warn",
					children: "Stale"
				}),
				n && /* @__PURE__ */ O(K, {
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
			age: kt(e.claimedAt ?? e.updated, t),
			ageTip: [e.claimedAt && `Claimed ${Q(e.claimedAt, t)}`, e.updated && `updated ${Q(e.updated, t)}`].filter(Boolean).join(", ") || void 0,
			meta: [...new Set(r)].join(" · "),
			actions: e.attach ? /* @__PURE__ */ D(Z, {
				label: "Session",
				name: "Session",
				narrowIcon: !0,
				icon: x,
				href: G(e.attach),
				tip: e.source === "radar" ? "Session. Opens the crew chat, if this crew runs on this machine. Type there to steer it." : "Session. Opens the worker chat on its crew. Type there to steer it.",
				"data-flight-session": !0
			}) : e.noAttach ? /* @__PURE__ */ D(W, {
				text: e.noAttach,
				children: /* @__PURE__ */ D("span", {
					"data-pp-chip": !0,
					"data-tone": "muted",
					children: "No chat"
				})
			}) : null
		}, e.key);
	}) });
}
var zn = {
	driver: "this driver chat drives it",
	folder: "this chat's project folder is in it",
	last: "the app page showed it last",
	default: "the default workspace",
	none: "none found"
};
function Bn() {
	let e = A(), n = d(), { openChat: i } = ye(), [a, l] = c(le($()).workspaceId), [u, f] = c(null), [p, h] = c([]), [g, _] = c(null), [v, x] = c(null), [S, T] = c(null), [ae, oe] = c(null), [k, ue] = c(() => Date.now()), [de, fe] = c(() => Mn($())), pe = kn(a), me = o(() => rt(window.location), []), he = o(() => on(e), [e]), ge = o(() => He(e), [e]), _e = o(() => sn(e), [e]);
	r(() => {
		a && ce(e).list().then((e) => f(e.items.find((e) => e.id === a)?.name ?? null), () => void 0);
	}, [e, a]);
	let ve = s(a), be = s(g);
	be.current = g;
	let j = s(null), xe = s(null), Se = s(null), [Ce, we] = c(null), M = t(async () => {
		let t = ve.current, n;
		try {
			n = await ce(e).list(), t || (t = n.defaultWorkspace, ve.current = t, l(t));
		} catch (e) {
			x(se(e));
			return;
		}
		if (!t) return;
		let r = In;
		try {
			r = await vt(e, t), xe.current ??= (async () => {
				let t = await Nt(e, me), r = /* @__PURE__ */ new Map();
				t && await Promise.all(n.items.map((t) => ce(e).repositories(t.id).then((e) => void r.set(t.id, e.map((e) => e.localCheckout).filter((e) => !!e))).catch(() => void 0))), j.current = {
					project: t,
					roots: r
				}, t && Se.current?.();
			})();
			let i = j.current ?? {
				project: null,
				roots: /* @__PURE__ */ new Map()
			}, a = Mt({
				driverRoot: Dt(r.driver, me),
				project: i.project,
				workspaces: n.items.map((e) => ({
					id: e.id,
					root: e.root,
					roots: i.roots.get(e.id) ?? []
				})),
				last: le($()).workspaceId,
				fallback: n.defaultWorkspace
			});
			we(a.why), a.id && a.id !== t && (t = a.id, ve.current = t, l(t), r = await vt(e, t));
		} catch {}
		try {
			let t = await e.get(cn);
			h((t.specs ?? []).map((e) => e.name));
		} catch {}
		x(null), _(r), ue(Date.now());
	}, [e, me]);
	Se.current = M, r(() => yt(M, {
		intervalMs: 0,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [M]);
	let N = o(() => Tt(g ?? {}), [g]), Te = g?.driver ?? null, Ee = g?.specs ?? [], P = it(me, {
		specs: p,
		driver: Te?.slot ?? null
	}), F = P.kind === "spec-builder" ? Ee.find((e) => e.name === P.spec) : void 0, De = s(N);
	De.current = N, r(() => {
		let e = () => {
			if (be.current) try {
				let e = {
					at: Date.now(),
					waitingKeys: De.current.waiting.map((e) => e.key)
				};
				$()?.setItem(jn, JSON.stringify(e));
			} catch {}
		}, t = () => {
			if (document.visibilityState === "hidden") return e();
			let t = Mn($());
			t && fe(t);
		};
		return window.addEventListener("blur", e), window.addEventListener("focus", t), document.addEventListener("visibilitychange", t), () => {
			window.removeEventListener("blur", e), window.removeEventListener("focus", t), document.removeEventListener("visibilitychange", t);
		};
	}, []);
	let I = o(() => nt(N, de, k), [
		N,
		de,
		k
	]), Oe = async (e, t) => {
		if (a && t.kind !== "link") {
			oe(e.key);
			try {
				t.kind === "resolve" ? await ge.resolveConflict(a, t.taskId, t.field, t.choice) : await _e.land(a, t.repository, t.branch, t.head), T(null), await M();
			} catch (e) {
				T(se(e));
			} finally {
				oe(null);
			}
		}
	}, ke = async () => {
		if (a && F?.plan && F.hash) try {
			await he.approve(a, F.plan.id, F.hash), T("Approved this revision for Avoozl."), await M();
		} catch (e) {
			T(se(e));
		}
	}, Ae = async () => {
		if (a && F) try {
			await he.store(a, F.name), T("Stored as a draft. Review it in Specs, then approve."), await M();
		} catch (e) {
			T(se(e));
		}
	}, je = (e) => N.unread.includes(e), L = g === null, Me = N.stops.length > 0, Ne = Dn(pe, "header") ?? g?.instance?.name ?? null, Pe = (e, t, n, r) => je(e) ? /* @__PURE__ */ D(Y, { children: L ? "Loading…" : Nn[e] }) : n === 0 ? /* @__PURE__ */ D(Y, { children: t }) : r(), Fe = /* @__PURE__ */ O(q, {
		id: "waiting",
		title: "Needs you",
		count: N.waiting.length,
		tone: "warn",
		open: !0,
		children: [Pe("waiting", "Nothing is waiting on you.", N.waiting.length, () => /* @__PURE__ */ D(Ln, {
			rows: N.waiting.slice(0, 5),
			busy: ae,
			now: k,
			onAct: (e, t) => void Oe(e, t),
			onOpenPage: () => n(An)
		})), N.waiting.length > 5 && /* @__PURE__ */ D(Y, { children: /* @__PURE__ */ D(Z, {
			label: `Show all ${N.waiting.length}`,
			onClick: () => n(An)
		}) })]
	}), Ie = /* @__PURE__ */ D(q, {
		id: "in-flight",
		title: "In flight",
		count: N.inFlight.length,
		summary: g?.crews && g.crews.stale > 0 ? `${g.crews.stale} stale` : void 0,
		open: !0,
		children: Pe("inFlight", "No crew has a claim right now.", N.inFlight.length, () => /* @__PURE__ */ D(Rn, {
			rows: N.inFlight,
			now: k
		}))
	}), R = /* @__PURE__ */ D(q, {
		id: "queue",
		title: "Release queue",
		count: N.queue?.head.length,
		summary: N.queue ? Vn(N.queue) : void 0,
		children: Pe("queue", N.queue?.held ? `Nothing is next. ${N.queue.held} held.` : "Nothing is next in the queue.", N.queue?.head.length ?? 0, () => /* @__PURE__ */ D(J, { children: N.queue.head.map((e) => /* @__PURE__ */ D(X, {
			"data-queue-head": !0,
			icon: w,
			title: e.title,
			chips: /* @__PURE__ */ D(K, {
				tone: "info",
				children: "Next"
			}),
			age: e.taskId,
			meta: `${e.repository} · ${e.reason}`
		}, e.taskId)) }))
	}), z = /* @__PURE__ */ D(q, {
		id: "recent",
		title: "Recent merges",
		count: N.recent.length,
		summary: N.recent[0] ? `last ${kt(N.recent[0].at, k)}` : void 0,
		children: Pe("recent", "Nothing finished lately.", N.recent.length, () => /* @__PURE__ */ D(J, { children: N.recent.map((e) => /* @__PURE__ */ D(X, {
			"data-recent-row": !0,
			icon: m,
			title: e.title,
			age: kt(e.at, k),
			ageTip: Q(e.at, k),
			meta: [e.repository, e.taskId].filter(Boolean).join(" · ")
		}, e.taskId)) }))
	}), Le = /* @__PURE__ */ D(Vt, {
		name: "Avoozl",
		onName: () => n(An),
		nameTip: "Open Avoozl",
		instance: Ne,
		workspace: u,
		tip: [Ne ? `Avoozl · ${Ne}` : "Avoozl", u ? `Workspace: ${u}${Ce ? ` (${zn[Ce]})` : ""}` : ""].filter(Boolean).join(". "),
		tools: /* @__PURE__ */ D(en, {
			bare: !0,
			workspaceId: a,
			onRefresh: () => void M()
		}),
		end: /* @__PURE__ */ D("span", {
			"data-panel-line": !0,
			"data-stopped": Me ? "" : void 0,
			style: { display: "inline-flex" },
			children: /* @__PURE__ */ D(Xe, { children: /* @__PURE__ */ D(wn, {
				bare: !0,
				workspaceId: a
			}) })
		})
	}), B = Et(g && !g.driver ? {
		state: "unknown",
		slot: null,
		href: null,
		openedAt: null,
		lastSeenAt: null
	} : g?.driver), V = g?.crews ? g.crews.groups?.length ?? 0 : null, Re = L ? null : /* @__PURE__ */ D("div", {
		"data-pp-cells": !0,
		children: /* @__PURE__ */ O(nn, { children: [/* @__PURE__ */ D(rn, {
			"data-panel-driver": B.state,
			tone: B.state === "running" ? "ok" : B.state === "unknown" ? "warn" : "muted",
			title: `Driver: ${Fn[B.state].toLowerCase()}`,
			tip: [
				"One long-running chat that releases ready work in graph order and hands you the decisions. It releases work only while the chat is open.",
				B.note,
				Te?.lastSeenAt && B.state !== "none" ? `Last seen ${Q(Te.lastSeenAt, k)}.` : "",
				B.workspace ? `Workspace: ${B.workspace}.` : "",
				B.elsewhere ? B.elsewhere.text : ""
			].filter(Boolean).join(" "),
			actions: /* @__PURE__ */ O(E, { children: [
				B.link && /* @__PURE__ */ D(an, {
					label: "Open driver session",
					icon: /* @__PURE__ */ D(te, {
						size: 13,
						"aria-hidden": "true"
					}),
					primary: !B.start,
					href: G(B.link),
					"data-driver-open": !0
				}),
				B.start && /* @__PURE__ */ D(an, {
					label: B.link ? "Start a new driver session" : "Start a driver session",
					icon: /* @__PURE__ */ D(ne, {
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
				B.elsewhere && /* @__PURE__ */ D(an, {
					label: `Open ${B.elsewhere.workspace}'s driver`,
					icon: /* @__PURE__ */ D(ee, {
						size: 13,
						"aria-hidden": "true"
					}),
					href: G(B.elsewhere.href),
					tip: B.elsewhere.text,
					"data-driver-elsewhere": !0
				}),
				/* @__PURE__ */ D(an, {
					label: "Recheck",
					icon: /* @__PURE__ */ D(ie, {
						size: 13,
						"aria-hidden": "true"
					}),
					onClick: () => void M(),
					"data-driver-recheck": !0
				})
			] })
		}), /* @__PURE__ */ D(rn, {
			"data-panel-crew": !0,
			tone: V ? "ok" : "warn",
			title: V === null ? "Radar crew: unknown" : V ? `Radar crews: ${V}` : "Radar crew: none",
			tip: "Issue Radar crews code the issues Avoozl releases. Create a crew in Radar, Crews.",
			actions: /* @__PURE__ */ D(an, {
				label: "Open Radar",
				icon: /* @__PURE__ */ D(ee, {
					size: 13,
					"aria-hidden": "true"
				}),
				href: "/issue-radar",
				tip: "Open Radar, Crews."
			})
		})] })
	}), H = /* @__PURE__ */ O(q, {
		id: "line",
		title: "Line and driver",
		summary: Me ? "stopped" : void 0,
		open: !0,
		children: [/* @__PURE__ */ D(J, { children: N.stops.map((e) => /* @__PURE__ */ D(X, {
			icon: y,
			title: e
		}, e)) }), Re]
	}), ze = I && /* @__PURE__ */ D("div", {
		"data-since-recap": !0,
		children: /* @__PURE__ */ O(q, {
			id: "since",
			title: "Since you left",
			summary: I.since,
			open: !0,
			children: [
				I.finished.length > 0 && /* @__PURE__ */ D("div", {
					"data-since-finished": !0,
					children: /* @__PURE__ */ D(J, { children: I.finished.slice(0, 5).map((e) => /* @__PURE__ */ D(X, {
						icon: m,
						title: e.title,
						chips: /* @__PURE__ */ D(K, {
							tone: "ok",
							children: "Finished"
						})
					}, e.taskId)) })
				}),
				I.needsYou.length > 0 && /* @__PURE__ */ D("div", {
					"data-since-needs-you": !0,
					children: /* @__PURE__ */ D(J, { children: I.needsYou.slice(0, 5).map((e) => /* @__PURE__ */ D(X, {
						icon: y,
						title: e.title,
						chips: /* @__PURE__ */ D(K, {
							tone: "warn",
							children: e.label
						})
					}, e.key)) })
				}),
				/* @__PURE__ */ D(Y, { children: /* @__PURE__ */ D(Z, {
					label: "Got it",
					onClick: () => fe(null)
				}) })
			]
		})
	}), U = P.kind === "crew" ? g?.crews?.rows.find((e) => e.crewId === P.crew) : void 0, Be = F ? (g?.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === F.name || e.planId === F.plan?.id)) : [];
	return /* @__PURE__ */ O(Bt, {
		kind: P.kind,
		children: [
			Le,
			v && /* @__PURE__ */ O(Y, {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", v]
			}),
			S && /* @__PURE__ */ D(Y, {
				role: "status",
				children: S
			}),
			P.kind === "spec-builder" && /* @__PURE__ */ O(E, { children: [
				/* @__PURE__ */ D("div", {
					"data-panel-spec": !0,
					children: /* @__PURE__ */ D(q, {
						id: "spec",
						title: `Spec check: ${P.spec}`,
						open: !0,
						children: F ? /* @__PURE__ */ D(E, { children: /* @__PURE__ */ O(J, { children: [
							/* @__PURE__ */ D(X, {
								icon: w,
								title: `Files: ${F.files.join(", ") || "none"}`
							}),
							/* @__PURE__ */ D(X, {
								icon: w,
								title: `Tasks: ${F.taskCount}`
							}),
							/* @__PURE__ */ D(X, {
								icon: F.counts.error > 0 ? y : m,
								title: `Problems: ${F.counts.error} errors, ${F.counts.warning} warnings`,
								chips: /* @__PURE__ */ D(K, {
									tone: F.counts.error > 0 ? "danger" : F.counts.warning > 0 ? "warn" : "ok",
									children: F.counts.error > 0 ? "Fix first" : F.counts.warning > 0 ? "Warnings" : "Clean"
								})
							}),
							/* @__PURE__ */ D(X, {
								icon: F.plan?.approved ? m : b,
								title: F.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl.",
								meta: ot(P, {
									files: F.files,
									approved: !!F.plan?.approved
								}) ? "tasks.md is written and not approved yet." : F.plan?.approved ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it." : null,
								actions: F.plan ? F.plan.approved ? null : /* @__PURE__ */ D(Z, {
									label: "Approve for Avoozl",
									primary: !0,
									disabled: F.counts.error > 0 || !F.hash,
									onClick: () => void ke()
								}) : /* @__PURE__ */ D(Z, {
									label: "Store this spec",
									onClick: () => void Ae()
								})
							})
						] }) }) : /* @__PURE__ */ D(Y, { children: L ? "Loading…" : "Avoozl has not read this spec folder yet." })
					})
				}),
				F?.plan?.approved && /* @__PURE__ */ D(q, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: Be.length,
					open: !0,
					children: Be.length === 0 ? /* @__PURE__ */ D(Y, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ D(J, { children: Be.slice(0, 6).map((e) => /* @__PURE__ */ D(X, {
						"data-spec-queue-row": e.state,
						icon: w,
						title: e.title,
						chips: /* @__PURE__ */ D(K, {
							tone: "info",
							children: e.state
						}),
						meta: e.reason
					}, e.taskId)) })
				}),
				H
			] }),
			P.kind === "crew" && /* @__PURE__ */ O(E, { children: [/* @__PURE__ */ D("div", {
				"data-panel-crew": !0,
				children: /* @__PURE__ */ O(q, {
					id: "crew",
					title: `Crew ${P.crew}`,
					open: !0,
					children: [U ? /* @__PURE__ */ O(J, { children: [/* @__PURE__ */ D(X, {
						icon: U.pr ? C : re,
						title: `${U.repository}#${U.number} ${U.title}: ${U.phase ?? "no phase"}${U.pr ? `, PR #${U.pr}` : ""}${U.stale ? " (stale)" : ""}`,
						href: G(U.url),
						age: U.updated ? kt(U.updated, k) : null,
						ageTip: U.updated ? `Updated ${Q(U.updated, k)}` : void 0,
						meta: U.updated ? `Updated ${Q(U.updated, k)}` : null,
						actions: /* @__PURE__ */ O(E, { children: [U.prUrl && /* @__PURE__ */ D(Z, {
							label: `PR #${U.pr}`,
							href: G(U.prUrl)
						}), U.commentUrl && /* @__PURE__ */ D(Z, {
							label: "Crew comment",
							href: G(U.commentUrl)
						})] }),
						multi: !0
					}), /* @__PURE__ */ D("li", {
						"data-pp-row": !0,
						style: { gridTemplateColumns: "minmax(0,1fr)" },
						children: /* @__PURE__ */ D(W, {
							text: Qe(U).map((e) => `${e.label}: ${e.state}`).join(", "),
							children: /* @__PURE__ */ D("span", {
								"data-rail": !0,
								role: "img",
								"aria-label": Qe(U).map((e) => `${e.label} ${e.state}`).join(", "),
								style: {
									display: "inline-flex",
									gap: 3
								},
								children: Qe(U).map((e) => /* @__PURE__ */ D("i", {
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
					})] }) : /* @__PURE__ */ D(Y, { children: L ? "Loading…" : je("inFlight") ? Nn.inFlight : "No live claim from this crew in Avoozl's repositories." }), /* @__PURE__ */ D(Y, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })]
				})
			}), H] }),
			P.kind === "avoozl" && /* @__PURE__ */ O(E, { children: [
				ze,
				Fe,
				Ie,
				R,
				z,
				H
			] }),
			P.kind === "other" && /* @__PURE__ */ O("div", {
				"data-panel-recap": !0,
				children: [
					ze,
					Fe,
					Ie,
					R,
					z,
					H
				]
			})
		]
	});
}
function Vn(e) {
	return [
		e.claimed ? `${e.claimed} claimed` : "",
		`${e.next} next`,
		e.held ? `${e.held} held` : ""
	].filter(Boolean).join(" · ");
}
export { Bn as default };
