import { createContext as e, useCallback as t, useContext as n, useEffect as r, useId as i, useLayoutEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { useAppApi as l, useChatLauncher as u, useNavigate as d } from "@kirocrew/app-sdk";
import { Btn as f, Input as p } from "@kirocrew/app-sdk/ui";
import { Check as m, ChevronDown as h, ChevronRight as g, ChevronsDownUp as _, ChevronsUpDown as v, CircleAlert as y, CircleDot as b, CirclePlus as x, ExternalLink as S, GitBranch as C, GitPullRequest as w, Inbox as T, MessageSquare as ee, Pause as E, Play as te, Radar as ne, RefreshCw as re, X as ie } from "lucide-react";
import { createPortal as ae } from "react-dom";
import { Fragment as D, jsx as O, jsxs as k } from "react/jsx-runtime";
// kirocrew-app/ui/src/workspace-api.ts
var A = "/apps/avoozl/api/command";
function oe(e) {
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
		remove: (e) => t("workspaces.remove", { id: e }),
		stop: (e) => t("workspaces.stop", { id: e }),
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
function de(e, t) {
	return e === "post" && t === "/apps/avoozl/api/command" || e === "get";
}
function fe(e) {
	let t = `Demo mode: in your own workspace this would call ${e}. Nothing changed.`;
	return Object.assign(Error(t), {
		status: 409,
		body: JSON.stringify({
			error: t,
			demo: !0
		})
	});
}
function pe(e) {
	if (!e || typeof e != "object" || !("body" in e)) return null;
	try {
		let t = JSON.parse(String(e.body));
		return t && t.demo === !0 && typeof t.error == "string" ? t.error : null;
	} catch {
		return null;
	}
}
function me(e, t) {
	let n = (e) => e.catch((e) => {
		let n = pe(e);
		throw n && t(n), e;
	}), r = (e) => {
		let n = fe(e);
		return t(n.message), Promise.reject(n);
	};
	return {
		request: (t, i) => de("request", t) ? n(e.request(t, i)) : r(t),
		get: (t, i) => de("get", t) ? n(e.get(t, i)) : r(t),
		post: (t, i, a) => {
			if (!de("post", t)) return r(t);
			let o = i?.operation;
			return o === "workspaces.list" ? Promise.resolve({ result: he }) : typeof o == "string" && o.startsWith("workspaces.") ? r(`${t} (${o})`) : n(e.post(t, i, a));
		},
		put: (e) => r(e),
		del: (e) => r(e)
	};
}
var he = {
	defaultWorkspace: le,
	items: [{
		id: le,
		name: "Demo: Recipe Box",
		root: "A temporary folder for the demo",
		enabled: !0,
		state: "ok",
		served: !1
	}]
}, ge = e({
	active: !1,
	notice: () => void 0
}), _e = () => n(ge);
function j() {
	let e = l(), { active: t, notice: n } = _e();
	return o(() => t ? me(e, n) : e, [
		e,
		t,
		n
	]);
}
function ve() {
	let e = u(), { active: t, notice: n } = _e(), r = e.openChat;
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
var M = null;
function be(e) {
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
var xe = {
	raised: 1,
	sticky: 10,
	drawer: 50,
	popover: 60,
	tooltip: 2147483e3
};
// kirocrew-app/ui/src/use-media.ts
function Se(e) {
	let [t, n] = c(() => typeof window < "u" && window.matchMedia ? window.matchMedia(e).matches : !1);
	return r(() => {
		if (typeof window > "u" || !window.matchMedia) return;
		let t = window.matchMedia(e), r = () => n(t.matches);
		return t.addEventListener("change", r), () => t.removeEventListener("change", r);
	}, [e]), t;
}
// kirocrew-app/ui/src/focus-trap.ts
function Ce(e, t, n) {
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
var N = {
	nodeWidth: 168,
	nodeHeight: 36,
	columnGap: 28,
	rowGap: 14,
	margin: 12,
	clusterLabel: 14,
	clusterGap: 12
};
N.nodeWidth, N.nodeHeight, N.columnGap, N.rowGap, N.margin, N.clusterLabel, N.clusterGap;
// kirocrew-app/ui/src/nav-history.ts
var P = /* @__PURE__ */ new Set([
	"drawer",
	"modal",
	"confirm"
]), we = (e) => P.has(e);
function Te(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}
function F() {
	let e = [], t = 1, n = () => {
		let t = Te(e, (e) => e.kind === "tab");
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
			let t = Te(e, (e) => we(e.kind));
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
				let t = Te(n(), (t) => t.kind === e);
				if (!t) break;
				r.release(t.id), a--;
			}
		}
	};
	return r;
}
function I(e, t, n, r = 60) {
	if (!e) return;
	let i = (r) => {
		e.scrollTop = t, Math.abs(e.scrollTop - t) >= 2 && r > 0 && n(() => i(r - 1));
	};
	i(r);
}
var Ee = (e) => typeof requestAnimationFrame > "u" ? setTimeout(e, 16) : requestAnimationFrame(e);
function L(e = Ee) {
	let t = /* @__PURE__ */ new Map(), n = { current: null };
	return {
		history: F(),
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
		restoreScroll: (t) => void e(() => I(n.current, t, e)),
		handlers: /* @__PURE__ */ new Map(),
		setters: /* @__PURE__ */ new Map()
	};
}
// kirocrew-app/ui/src/NavHistory.tsx
var De = "data-avoozl-app", Oe = e(null), ke = null, Ae = () => n(Oe) ?? (ke ??= L());
function R(e, t, n, i, a) {
	let o = Ae(), c = s({
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
var je = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex=\"-1\"])", Me = "color-mix(in srgb, var(--bg) 60%, transparent)", Ne = {
	background: "var(--card, var(--bg))",
	color: "var(--text)",
	borderColor: "var(--border)",
	boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
}, Pe = "1px solid var(--border)", Fe = "dialog[data-modal]::backdrop{background:transparent}\n[data-modal-backdrop]{backdrop-filter:blur(12px)}\n[data-modal-close]:hover{background:var(--bg-hover);color:var(--text)}\n[data-modal-close]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}\n@media (prefers-reduced-motion:no-preference){[data-modal-box]{animation:avoozl-modal-in .2s ease}}\n@keyframes avoozl-modal-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}", z = [], B = null;
function Ie() {
	B || (B = {
		html: document.documentElement.style.overflow,
		body: document.body.style.overflow
	}, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden");
}
function V() {
	!z.length && B && (document.documentElement.style.overflow = B.html, document.body.style.overflow = B.body, B = null);
}
var H = e(null), Le = () => n(H);
function U(e) {
	let n = Ke(), r = Se("(max-width: 767px)"), i = s(null), o = s(null), [l, u] = c(null), d = s(e);
	d.current = e;
	let f = s(!1), p = t(() => {
		let { unsaved: e, onDismiss: t } = d.current;
		if (!e) return t();
		f.current || (f.current = !0, n(e).then((e) => {
			f.current = !1, e && d.current.onDismiss();
		}));
	}, [n]);
	R(e.kind ?? "modal", !0, e.backLabel ?? "Close the dialog", p), a(() => {
		let e = i.current;
		if (!e) return;
		let t = {}, n = document.activeElement;
		e.open || e.showModal(), z.push(t), Ie(), u(e), (o.current?.querySelector("[data-autofocus]") ?? o.current?.querySelector(`:is(${je}):not([data-modal-close])`) ?? o.current)?.focus();
		let r = (e) => {
			if (e.key !== "Tab" || z.at(-1) !== t || !o.current) return;
			let n = [...o.current.querySelectorAll(je)].filter((e) => e.offsetParent !== null || e === document.activeElement), r = Ce(n.length, n.indexOf(document.activeElement), e.shiftKey);
			r < 0 || (e.preventDefault(), n[r].focus());
		};
		return document.addEventListener("keydown", r), () => {
			document.removeEventListener("keydown", r), z.splice(z.indexOf(t), 1), V(), e.open && e.close(), n?.isConnected && n.focus();
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
	return ae(/* @__PURE__ */ k("dialog", {
		ref: i,
		role: e.role,
		"aria-modal": "true",
		"aria-labelledby": e.labelledBy ?? `${e.id}-title`,
		"aria-describedby": e.describedBy,
		"data-modal": e.id,
		"data-modal-size": r ? "full" : "box",
		[De]: "",
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
		children: [/* @__PURE__ */ O("style", { children: Fe }), /* @__PURE__ */ k("div", {
			style: {
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center"
			},
			children: [/* @__PURE__ */ O("div", {
				"aria-hidden": "true",
				"data-modal-backdrop": !0,
				onClick: p,
				style: {
					position: "absolute",
					inset: 0,
					background: Me
				}
			}), /* @__PURE__ */ O("div", {
				ref: (t) => {
					o.current = t, e.boxRef && (e.boxRef.current = t);
				},
				"data-modal-box": !0,
				tabIndex: -1,
				className: "relative flex flex-col overflow-hidden border outline-none",
				style: {
					...Ne,
					...m,
					boxSizing: "border-box",
					overscrollBehavior: "contain"
				},
				children: /* @__PURE__ */ k(H.Provider, {
					value: l,
					children: [
						/* @__PURE__ */ O("div", {
							"data-modal-header": !0,
							style: {
								display: "flex",
								flexShrink: 0,
								alignItems: "center",
								gap: 12,
								padding: "12px 48px 12px 20px",
								borderBottom: Pe
							},
							children: /* @__PURE__ */ O("h2", {
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
						/* @__PURE__ */ O("button", {
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
							children: /* @__PURE__ */ O(ie, {
								size: 16,
								"aria-hidden": "true"
							})
						}),
						/* @__PURE__ */ O("div", {
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
						e.footer && /* @__PURE__ */ O("div", {
							"data-modal-footer": !0,
							style: {
								display: "flex",
								flexShrink: 0,
								flexWrap: "wrap",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 8,
								padding: "12px 20px",
								borderTop: Pe,
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
var Re = () => typeof window < "u" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, W = "button, a[href], input, select, textarea, summary, [role=\"button\"]", ze = `${W}, [tabindex]`, Be = (e) => {
	try {
		return e.matches(":focus-visible");
	} catch {
		return !0;
	}
};
function G(e) {
	let t = i(), n = Le(), l = s(null), u = s(null), [d, f] = c(!1), [p, m] = c(null), h = o(() => be({ onChange: f }), []);
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
		v(!!g && !l.current?.querySelector(ze));
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
			let t = e.target, n = t.closest(W), r = t.closest("[data-info-tip]") !== null || !n || !e.currentTarget.contains(n);
			e.pointerType === "touch" && r ? h.tap() : h.hide();
		},
		tabIndex: _ ? 0 : void 0,
		"aria-describedby": _ ? t : void 0,
		onFocus: (e) => h.focus(Be(e.target)),
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
			d && ae(/* @__PURE__ */ k("div", {
				ref: u,
				"aria-hidden": "true",
				"data-tooltip": !0,
				"data-side": p?.side,
				style: {
					position: "fixed",
					top: p?.top ?? 0,
					left: p?.left ?? 0,
					visibility: p ? "visible" : "hidden",
					zIndex: xe.tooltip,
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
					animation: Re() ? void 0 : "avoozl-tip-in 120ms ease-out"
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
// kirocrew-app/ui/src/views-api.ts
function Ve(e) {
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
function He(e) {
	if (typeof e != "string") return null;
	try {
		let t = new URL(e.trim());
		return t.protocol === "https:" || t.protocol === "http:" ? t.href : null;
	} catch {
		return null;
	}
}
var Ue = /^\/(?:chat\?sid=|apps\/|issue-radar(?:$|[/?#]))[^\s\\]*$/;
function K(e) {
	return typeof e == "string" && Ue.test(e) ? e : He(e) ?? void 0;
}
// kirocrew-app/ui/src/controls.tsx
var We = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff"
}, Ge = e(async () => !1), Ke = () => n(Ge);
function qe({ children: e }) {
	let [n, i] = c(null), a = s(null), o = t((e) => new Promise((t) => i({
		...e,
		resolve: t
	})), []), l = (e) => {
		n?.resolve(e), i(null);
	};
	return r(() => {
		n && a.current?.focus();
	}, [n]), /* @__PURE__ */ k(Ge.Provider, {
		value: o,
		children: [e, n && /* @__PURE__ */ O(U, {
			id: "avoozl-confirm",
			kind: "confirm",
			role: "alertdialog",
			backLabel: "Cancel",
			width: "28rem",
			title: n.title,
			describedBy: "avoozl-confirm-body",
			attrs: { "data-confirm-dialog": !0 },
			onDismiss: () => l(!1),
			footer: /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(f, {
				ref: a,
				type: "button",
				onClick: () => l(!1),
				children: "Cancel"
			}), /* @__PURE__ */ O(f, {
				type: "button",
				"data-danger": !0,
				onClick: () => l(!0),
				style: We,
				children: n.action
			})] }),
			children: /* @__PURE__ */ O("p", {
				id: "avoozl-confirm-body",
				className: "text-sm text-muted",
				children: n.body
			})
		})]
	});
}
// kirocrew-app/ui/src/dashboard-api.ts
var Je = [
	"Ready",
	"Claimed",
	"PR",
	"CI",
	"Merge"
];
function Ye(e) {
	let t = e.pr ? 3 : e.noMarker ? 1 : 2;
	return Je.map((e, n) => ({
		label: e,
		state: n < t ? "done" : n === t ? "now" : "later"
	}));
}
// kirocrew-app/ui/src/driver-api.ts
function Xe(e, t = Date.now()) {
	let n = e ? Date.parse(e) : NaN;
	if (!Number.isFinite(n)) return "never";
	let r = Math.max(0, Math.round((t - n) / 6e4));
	if (r < 1) return "just now";
	if (r < 60) return `${r} min ago`;
	let i = Math.round(r / 60);
	return i < 48 ? `${i} h ago` : `${Math.round(i / 24)} d ago`;
}
var Ze = (e) => ({
	running: "A driver session is working. Open it to watch or steer.",
	idle: "The driver session has been quiet for a while. Open it to check on it, or start a new one.",
	none: "No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.",
	unknown: "Avoozl could not read the driver session. It tries again soon."
})[e], Qe = (e, t) => Xe(new Date(e).toISOString(), t);
function $e(e, t, n) {
	if (!t || n - t.at < 6e4) return null;
	let r = new Set(t.waitingKeys), i = e.recent.filter((e) => Date.parse(e.at) > t.at), a = e.waiting.filter((e) => !r.has(e.key)).map(({ key: e, title: t, label: n }) => ({
		key: e,
		title: t,
		label: n
	}));
	return !i.length && !a.length ? null : {
		since: Qe(t.at, n),
		finished: i,
		needsYou: a
	};
}
// kirocrew-app/ui/src/panel-chat.ts
function et(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function tt(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${nt(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") || t.driver && e === t.driver ? { kind: "avoozl" } : { kind: "other" };
}
var nt = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function rt(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/flow-api.ts
function it(e) {
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
var at = "avoozl:line-changed", ot = () => {
	typeof window < "u" && window.dispatchEvent(new Event(at));
};
function st(e) {
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
		models: () => e.get("/api/models").then(it),
		saveInstructions: (e, n) => t(e, "flow.instructions.update", { instructions: n }),
		proposals: (e) => t(e, "flow.proposals"),
		revertPrompt: (e, n) => t(e, "prompt.override.revert", { target: n }),
		rebasePrompt: (e, n) => t(e, "prompt.override.rebase", n)
	};
}
function ct(e) {
	return e.scope === "repo" ? `repository ${e.projectId}` : e.scope === "spec" ? `spec ${e.planId}` : e.scope === "task" ? `task ${e.taskId} and its dependents` : "everything in this workspace";
}
var lt = [
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
], ut = [{
	value: "line",
	label: "Stop the line",
	line: "No new work starts in what you pick. Chats already running keep going."
}, {
	value: "agents",
	label: "Stop all agents",
	line: "No new work starts anywhere, and every running chat Avoozl opened stops now."
}], dt = "Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.", ft = () => ({
	kind: "line",
	scope: "all",
	repository: "",
	spec: "",
	taskId: "",
	reason: ""
});
function pt(e) {
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
function mt(e) {
	if (e.manual && e.full) {
		let t = e.sessions ?? [], n = t.filter((e) => e.stopped && !e.finished).length, r = t.filter((e) => !e.stopped).length, i = ` ${n} chat${n === 1 ? "" : "s"} stopped${r ? `; ${r} could not be stopped` : ""}.`;
		return `All agents stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}.${i} ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
	}
	if (e.manual) {
		let t = ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`;
		return `Line stopped by ${e.by?.name ?? "someone"}: ${e.reason ?? ""}. Scope: ${ct(e)}.${t}`;
	}
	return `Line stopped: ${e.check ? `\`${e.check}\` fails on ${e.branch}` : `a worker named ${e.culprit} as the cause`}${e.commit ? ` since ${e.commit.slice(0, 7)}` : ""}${e.culprit ? ` (task ${e.culprit})` : " (culprit unknown)"}.${e.fixTaskId ? ` Fix: ${e.fixTaskId}, ${e.fixState ?? "ready"}.` : ""}${e.runAnyway ? " Dispatch resumed by Run anyway." : ` ${e.paused ?? 0} task${e.paused === 1 ? "" : "s"} paused.`}`;
}
// kirocrew-app/ui/src/executors/kirocrew.ts
async function ht(e, t) {
	if (!t) return null;
	try {
		let n = await e.get("/api/chat/slots"), r = (Array.isArray(n) ? n : []).find((e) => e.key === t);
		return typeof r?.project == "string" && r.project ? r.project : null;
	} catch {
		return null;
	}
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
	})), s = (e.flow?.line ?? []).filter((e) => !e.closedAt).map(mt);
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
		note: Ze(t),
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
function kt(e, t) {
	let n = (e) => e.replace(/\\/g, "/").replace(/\/+$/, ""), r = n(e), i = n(t);
	return !!i && (r === i || r.startsWith(`${i}/`));
}
function At(e) {
	let t = (t) => !!(t && e.workspaces.some((e) => e.id === t));
	if (e.driverRoot) {
		let t = e.workspaces.find((t) => Et(t.root, e.driverRoot));
		if (t) return {
			id: t.id,
			why: "driver"
		};
	}
	if (e.project) {
		let t = null;
		for (let n of e.workspaces) for (let r of [n.root, ...n.roots]) r && kt(e.project, r) && (!t || r.length > t.length) && (t = {
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
// kirocrew-app/ui/src/PanelParts.tsx
var jt = "\n[data-pp]{container-type:inline-size;font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}\n[data-pp] *{box-sizing:border-box}\n[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}\n[data-pp-head-name]{flex:0 1 auto;display:inline-flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}\n[data-pp-head-brand]{display:inline-flex;align-items:baseline;gap:4px;flex:none}\n[data-pp-head-instance]{font-weight:400;color:var(--muted);flex:none}\n[data-pp-head-workspace]{font-weight:400;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-pp-head-link]{padding:0;margin:0;background:none;border:0;font:inherit;color:inherit;cursor:pointer;text-decoration:none}\n[data-pp-head-link]:hover,[data-pp-head-link]:focus-visible{color:var(--accent);text-decoration:underline}\n[data-pp-head-tools]{flex:none;display:inline-flex;align-items:center;gap:2px}\n[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto}\n[data-pp-section]{border-bottom:1px solid var(--border)}\n[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}\n[data-pp-section-head]:hover{background:var(--bg-hover)}\n[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}\n[data-pp-section-title]{color:var(--text-strong,var(--text))}\n[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}\n[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}\n[data-pp-row]:hover{background:var(--bg-hover)}\n[data-pp-row-icon]{display:inline-flex;color:var(--muted)}\n[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}\n[data-pp-row-line]{display:flex;flex-wrap:nowrap;align-items:center;gap:0 6px;min-width:0;overflow:hidden}\n[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}\na[data-pp-row-title]{text-decoration:none}\na[data-pp-row-title]:hover{text-decoration:underline}\n[data-pp-row-line]>[data-tooltip-anchor]{flex:0 0 auto;max-width:100%}\n[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:0 1 auto;min-width:0}\n[data-pp-row-line]>[data-tooltip-anchor]:has([data-pp-age]){margin-left:auto}\n[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}\n[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}\n[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}\n[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}\n[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}\n[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}\n[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}\n[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}\n[data-pp-act],[data-pp-icon]{min-height:22px;background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}\n[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}\n[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}\n[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}\n[data-pp-icon][data-bare]{padding:2px 5px;border-color:transparent}\n[data-pp-cells]{padding:0 12px 8px}\n[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}\n@media (max-width:640px){\n[data-pp-head-name]>[data-pp-head-brand]{display:none}\n[data-pp-head-workspace]>[data-pp-head-dot]{display:none}\n[data-pp-narrow-hide]{display:none}\n[data-pp-act][data-narrow-icon]{padding:2px 6px}\n}\n@container (max-width:520px){\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4)){flex-wrap:wrap}\n[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4))>[data-tooltip-anchor]:first-child{max-width:100%}\n}\n@container (max-width:520px){\n[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}\n[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}\n}\n";
function Mt() {
	return /* @__PURE__ */ O("style", { children: jt });
}
var Nt = "avoozl.panel.folds", Pt = e(null);
function Ft() {
	try {
		let e = JSON.parse(window.localStorage.getItem(Nt) ?? "{}");
		return e && typeof e == "object" && !Array.isArray(e) ? e : {};
	} catch {
		return {};
	}
}
function It() {
	let [e, n] = c(Ft), [r, i] = c({}), a = t((e) => {
		n(e);
		try {
			window.localStorage.setItem(Nt, JSON.stringify(e));
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
function Lt(e) {
	let t = It();
	return /* @__PURE__ */ O(Pt.Provider, {
		value: t,
		children: /* @__PURE__ */ k("div", {
			"data-pp": !0,
			"data-panel-kind": e.kind,
			style: {
				display: "flex",
				flexDirection: "column"
			},
			children: [/* @__PURE__ */ O(Mt, {}), e.children]
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
function Rt(e) {
	let t = n(Pt), r = t?.allOpen ? "Collapse all sections" : "Expand all sections", i = t?.allOpen ? _ : v;
	return /* @__PURE__ */ k("div", {
		"data-pp-head": !0,
		children: [
			/* @__PURE__ */ k("span", {
				"data-pp-head-name": !0,
				children: [/* @__PURE__ */ k("span", {
					"data-pp-head-brand": !0,
					children: [e.onName ? /* @__PURE__ */ O(G, {
						text: e.nameTip,
						children: /* @__PURE__ */ O("button", {
							type: "button",
							"data-pp-head-link": !0,
							"aria-label": e.nameTip,
							onClick: e.onName,
							children: e.name
						})
					}) : e.name, e.instance && /* @__PURE__ */ O(G, {
						text: e.tip,
						children: /* @__PURE__ */ k("span", {
							"data-pp-head-instance": !0,
							children: ["· ", e.instance]
						})
					})]
				}), e.workspace && /* @__PURE__ */ k("span", {
					"data-pp-head-workspace": !0,
					children: [/* @__PURE__ */ O("span", {
						"data-pp-head-dot": !0,
						children: "· "
					}), e.workspace]
				})]
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
			e.end && /* @__PURE__ */ O("span", {
				"data-pp-head-end": !0,
				children: e.end
			})
		]
	});
}
function J(e) {
	let t = n(Pt), r = !!e.open;
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
var zt = (e) => String(e).padStart(2, "0");
function Bt(e, t) {
	let n = Math.max(0, Math.ceil(e));
	return !t && n < 100 ? `${n}s` : n >= 3600 ? `${Math.floor(n / 3600)}:${zt(Math.floor(n % 3600 / 60))}:${zt(n % 60)}` : `${Math.floor(n / 60)}:${zt(n % 60)}`;
}
var Vt = (e) => e?.cacheSeconds ? e.cacheSeconds : e?.cacheSeconds === 0 ? 20 : 60;
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
var Kt = {
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
}, qt = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	alignSelf: "stretch",
	aspectRatio: "1 / 1",
	minWidth: 24,
	maxHeight: 28,
	padding: 0,
	boxSizing: "border-box",
	borderRadius: 6,
	border: "1px solid var(--border)",
	background: "transparent",
	cursor: "pointer"
};
// kirocrew-app/ui/src/RefreshButton.tsx
function Jt(e, n, i) {
	let a = j(), l = o(() => Gt(a), [a]), [u, d] = c(null), [f, p] = c(60), [m, h] = c(() => Date.now()), g = s(n);
	g.current = n;
	let _ = Vt(u), v = Ht(u, m), y = t(() => {
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
			(typeof document > "u" || document.visibilityState !== "hidden") && (h(Date.now()), Ht(u, Date.now()) > 0 || (--b.current, b.current <= 0 ? x() : p(b.current)));
		}, 1e3);
		return () => clearInterval(e);
	}, [u, x]), {
		refresh: x,
		busy: i,
		left: f,
		limited: v,
		period: _,
		tip: Ut(u, f, v)
	};
}
function Yt({ state: e, look: t = "square" }) {
	let { refresh: n, busy: r, left: i, limited: a, period: o } = e, s = `Refresh, ${a > 0 ? "GitHub limit lifts in " : "reads again in "}${Bt(a > 0 ? a : i, a > 0)}`, c = a > 0 ? 100 : Math.round(Math.min(1, Math.max(0, 1 - i / o)) * 100), l = Wt(c), u = {
		bare: {
			attrs: {
				"data-pp-icon": "",
				"data-bare": ""
			},
			style: { color: l }
		},
		nav: {
			attrs: { "data-nav-refresh": "" },
			style: {
				...Kt,
				color: l
			}
		},
		square: {
			attrs: { "data-refresh-square": "" },
			style: {
				...qt,
				color: l
			}
		}
	}[t];
	return /* @__PURE__ */ O(G, {
		text: e.tip,
		children: /* @__PURE__ */ O("button", {
			type: "button",
			...u.attrs,
			"data-refresh": !0,
			"data-refresh-age": c,
			"data-limited": a > 0 ? "" : void 0,
			onClick: n,
			disabled: r,
			"aria-label": s,
			style: u.style,
			children: /* @__PURE__ */ O(re, {
				size: t === "bare" ? 13 : 14,
				"aria-hidden": "true"
			})
		})
	});
}
function Xt(e) {
	let t = Jt(e.workspaceId, e.onRefresh, e.busy);
	return /* @__PURE__ */ O(Yt, {
		state: t,
		look: e.bare ? "bare" : "square"
	});
}
// kirocrew-app/ui/src/StatusCells.tsx
var Zt = "\n[data-sc-row]{container-type:inline-size}\n[data-sc-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}\n@container (max-width:420px){[data-sc-grid]{grid-template-columns:minmax(0,1fr)}}\n[data-sc]{display:flex;flex-wrap:nowrap;align-items:center;align-content:flex-start;gap:0 8px;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:18px;color:var(--text)}\n[data-sc-title]{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-weight:600;color:var(--text-strong,var(--text));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-sc-dot]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}\n[data-sc-dot][data-tone=ok]{background:var(--ok)}\n[data-sc-dot][data-tone=warn]{background:var(--warning,#b7791f)}\n[data-sc-dot][data-tone=danger]{background:var(--danger)}\n[data-sc-actions]{flex:none;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;margin-left:auto}\n[data-sc-act]{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--muted);font:inherit;text-decoration:none;cursor:pointer;transition:background-color .12s,color .12s}\n[data-sc-act]:hover{background:var(--bg-hover);color:var(--text)}\n[data-sc-act][data-primary]{color:var(--accent)}\n[data-sc-act]:disabled{opacity:.6;cursor:default}\n";
function Qt(e) {
	return /* @__PURE__ */ k("div", {
		"data-sc-row": !0,
		children: [/* @__PURE__ */ O("style", { children: Zt }), /* @__PURE__ */ O("div", {
			"data-sc-grid": !0,
			children: e.children
		})]
	});
}
function $t(e) {
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
function en(e) {
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
function tn(e) {
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
		batches: (e) => t(e, "plan.approvalBatches"),
		selection: (e, n) => t(e, "plan.approvalBatches", { ids: n }).then((e) => e.selection),
		approveMany: (e, n) => t(e, "plan.approveMany", { items: n }),
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
function nn(e) {
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
		gates: (e) => t("gate.list", {}, e),
		clearGate: (e, n, r) => t("gate.clear", {
			taskId: n,
			reason: r
		}, e),
		step: (e, n) => t("radar.releasestep", { planId: n }, e)
	};
}
// kirocrew-app/ui/src/spec-builder-api.ts
var rn = "/api/apps/spec-builder/specs", an = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)"
};
function on(e) {
	return {
		items: e,
		ids: e.map((e) => e.id.toLowerCase()),
		text: e.map((e) => `${e.id}\n${e.title}\n${e.spec ?? ""}`.toLowerCase())
	};
}
function sn(e, t, n = 50) {
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
function cn(e, t, n) {
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
var ln = (e) => e.title && e.title !== e.id ? `${e.id}: ${e.title}` : e.id;
// kirocrew-app/ui/src/Picker.tsx
function un(e) {
	let t = i(), n = e.id ?? `avoozl-pick-${t.replace(/:/g, "")}`, a = `${n}-list`, l = o(() => on(e.items), [e.items]), u = e.keep ?? !0, d = o(() => e.items.find((t) => t.id === e.value) ?? null, [e.items, e.value]), f = (t) => e.plain ? t.title : ln(t), p = d && u ? f(d) : "", [m, h] = c(p), [g, _] = c(!1), [v, y] = c(!1), [b, x] = c(0), S = s(null);
	r(() => {
		g || h(p);
	}, [p, g]);
	let { shown: C, total: w } = o(() => sn(l, g ? m : ""), [
		l,
		m,
		g
	]);
	r(() => {
		S.current?.querySelector(`#${CSS.escape(`${n}-opt-${b}`)}`)?.scrollIntoView?.({ block: "nearest" });
	}, [b, n]);
	let T = (t) => {
		e.onPick(t.id), _(!1), y(!1), h(u ? f(t) : "");
	}, ee = (t) => {
		let n = cn({
			open: v,
			active: b
		}, t.key, C.length);
		n.kind !== "none" && (t.preventDefault(), n.kind === "move" ? (y(!0), x(n.state.active)) : n.kind === "pick" ? T(C[n.index]) : n.kind === "close" ? y(!1) : (h(""), _(!1), e.emptyLabel !== void 0 && e.value && e.onPick("")));
	}, E = v && (C.length > 0 || g);
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
				"aria-expanded": E,
				"aria-controls": a,
				"aria-autocomplete": "list",
				"aria-activedescendant": E && C.length ? `${n}-opt-${b}` : void 0,
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
				onKeyDown: ee,
				className: "rounded border px-2 py-1 text-sm",
				style: an,
				"data-picker": !0
			}),
			/* @__PURE__ */ k("div", {
				hidden: !E,
				className: "rounded border shadow",
				style: {
					position: "absolute",
					top: "100%",
					left: 0,
					right: 0,
					zIndex: xe.popover,
					marginTop: 2,
					background: "var(--card, var(--bg))",
					borderColor: "var(--border)",
					maxHeight: "16rem",
					overflow: "auto"
				},
				children: [
					/* @__PURE__ */ O("ul", {
						ref: S,
						id: a,
						role: "listbox",
						"aria-label": typeof e.label == "string" ? e.label : void 0,
						className: "flex flex-col p-1",
						children: C.map((t, r) => /* @__PURE__ */ k("li", {
							id: `${n}-opt-${r}`,
							role: "option",
							"aria-selected": r === b,
							onMouseDown: (e) => {
								e.preventDefault(), T(t);
							},
							onMouseEnter: () => x(r),
							className: "flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-0.5",
							style: r === b ? { background: "color-mix(in srgb, var(--text) 10%, transparent)" } : void 0,
							children: [
								e.plain ? /* @__PURE__ */ O("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title
								}) : /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.id
								}), /* @__PURE__ */ O("span", {
									className: "min-w-0 flex-1 truncate",
									children: t.title === t.id ? "" : t.title
								})] }),
								t.spec && /* @__PURE__ */ O("span", {
									className: "shrink-0 text-xs text-muted",
									children: t.spec
								}),
								t.state && /* @__PURE__ */ O("span", {
									className: "shrink-0 rounded border px-1 text-xs",
									style: { borderColor: "var(--border)" },
									children: t.state
								})
							]
						}, t.id))
					}),
					w === 0 && /* @__PURE__ */ O("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: "No match."
					}),
					w > C.length && /* @__PURE__ */ k("p", {
						className: "px-2 py-1 text-xs text-muted",
						children: [w - C.length, " more; type to narrow."]
					})
				]
			})
		]
	});
}
var dn = (e) => e.filter((e) => e.kind !== "package").map((e) => ({
	id: e.id,
	title: e.title || e.id,
	spec: e.spec ?? e.planId ?? null,
	state: e.state ?? e.status ?? null
})), fn = "\n@keyframes avoozl-radio-fold-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n[data-radio-fold-body] { animation: avoozl-radio-fold-in 180ms ease-out; }\n@media (prefers-reduced-motion: reduce) { [data-radio-fold-body] { animation: none !important; } }\n";
function pn() {
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
function mn(e) {
	return /* @__PURE__ */ k("div", {
		role: "radiogroup",
		"aria-label": e.label,
		className: "flex flex-col",
		"data-radio-fold": e.name,
		children: [/* @__PURE__ */ O("style", { children: fn }), e.sections.map((t) => {
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
						t.description && t.fields && /* @__PURE__ */ O(pn, {}),
						t.fields
					]
				})]
			}, t.key);
		})]
	});
}
// kirocrew-app/ui/src/StopLine.tsx
var hn = {
	background: "var(--danger)",
	borderColor: "var(--danger)",
	color: "#fff",
	display: "inline-flex",
	alignItems: "center",
	gap: 6
}, gn = {
	...hn,
	background: "color-mix(in srgb, var(--danger) 16%, var(--card, var(--bg)))",
	color: "var(--text)",
	borderWidth: 2
}, _n = {
	borderColor: "var(--border)",
	color: "var(--text)",
	background: "var(--card, transparent)",
	maxWidth: "100%"
}, vn = 6e4;
function yn(e) {
	let t = j(), n = o(() => st(t), [t]), [i, a] = c([]);
	return r(() => {
		if (!e) return a([]);
		let t = !0, r = () => n.view(e, { window: "10" }).then((e) => t && a((e.line ?? []).filter((e) => !e.closedAt)), () => void 0);
		r();
		let i = setInterval(r, vn);
		return window.addEventListener(at, r), () => {
			t = !1, clearInterval(i), window.removeEventListener(at, r);
		};
	}, [n, e]), i;
}
function bn(e) {
	let [t, n] = c(!1), r = yn(e.workspaceId), i = j(), a = o(() => st(i), [i]), s = Ke();
	if (!e.workspaceId) return null;
	let l = r.length > 0, u = r.map((e) => e.reason ?? (e.check ? `${e.check} fails on ${e.branch}` : `the line on ${e.branch}`)).slice(0, 3).join("; "), d = t && /* @__PURE__ */ O(xn, {
		workspaceId: e.workspaceId,
		onClose: () => n(!1),
		onPulled: () => {
			n(!1), ot(), e.onPulled?.();
		}
	});
	if (e.bare || e.nav || e.square) {
		let t = async () => {
			if (await s({
				title: "Resume the line?",
				body: `New work starts again. The line was stopped for: ${u}`,
				action: "Resume"
			}) && e.workspaceId) {
				for (let t of r) await a.resume(e.workspaceId, t.id);
				ot();
			}
		}, i = l ? "Resume the line" : "Stop the line", o = l ? te : E;
		return /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(G, {
			text: i,
			children: /* @__PURE__ */ O("button", {
				type: "button",
				...e.nav || e.square ? {} : {
					"data-pp-icon": "",
					"data-bare": ""
				},
				"data-stop-line": !0,
				"data-stopped": l ? "" : void 0,
				"aria-label": i,
				onClick: () => l ? void t() : n(!0),
				style: {
					...e.square ? qt : e.nav ? Kt : {},
					color: l ? "var(--ok)" : "var(--danger)",
					borderColor: "var(--border)"
				},
				children: /* @__PURE__ */ O(o, {
					size: e.bare ? 13 : 14,
					"aria-hidden": "true"
				})
			})
		}), d] });
	}
	return /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(G, {
		text: l ? `The line is stopped: ${u}. Resume it from the banner on the Dashboard or Flow. Press to stop more.` : "Stop new work in a scope, or stop all agents, with a reason",
		children: (e) => /* @__PURE__ */ k(f, {
			type: "button",
			"data-stop-line": !0,
			"data-stopped": l ? "" : void 0,
			"aria-describedby": e,
			"aria-label": l ? `Line stopped, ${r.length} open stop${r.length === 1 ? "" : "s"}. Stop more` : void 0,
			onClick: () => n(!0),
			style: {
				...l ? gn : hn,
				padding: "4px 6px"
			},
			children: [/* @__PURE__ */ O(E, {
				size: 14,
				"aria-hidden": "true",
				style: l ? { color: "var(--danger)" } : void 0
			}), /* @__PURE__ */ O("span", {
				className: "sr-only",
				children: l ? "Line stopped" : "Stop the line"
			})]
		})
	}), d] });
}
function xn(e) {
	let n = j(), i = o(() => st(n), [n]), [a, l] = c(ft), [u, d] = c(null), [m, h] = c(null), [g, _] = c(!1), v = Ke(), y = s(null), b = (e) => l((t) => ({
		...t,
		...e
	})), x = t(() => e.onClose(), [e]);
	r(() => {
		let t = !0, r = e.workspaceId;
		return Promise.allSettled([
			se(n).repositories(r),
			tn(n).stored(r),
			Ve(n).graph(r)
		]).then(([e, n, r]) => {
			t && d({
				repositories: e.status === "fulfilled" ? e.value.map((e) => e.id) : [],
				specs: n.status === "fulfilled" ? n.value.items.filter((e) => !e.archivedAt).map((e) => ({
					id: e.id,
					title: e.title || e.id,
					state: e.state
				})) : [],
				tasks: r.status === "fulfilled" ? dn(r.value.tasks) : []
			});
		}), () => {
			t = !1;
		};
	}, [n, e.workspaceId]), r(() => {
		y.current?.querySelector("input, button")?.focus();
	}, []);
	let S = async () => {
		let { input: t, error: n } = pt(a);
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
				h(oe(e));
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
	] }), T = (e, t, n, r, i) => n.length ? /* @__PURE__ */ O(un, {
		label: w(e),
		items: n,
		value: t,
		onPick: r,
		placeholder: `Type a ${e.toLowerCase()} ID or title`
	}) : C(i), ee = {
		all: null,
		repo: u?.repositories.length ? /* @__PURE__ */ k("label", {
			className: "flex min-w-0 flex-col gap-1 text-sm",
			children: [w("Repository"), /* @__PURE__ */ k("select", {
				value: a.repository,
				onChange: (e) => b({ repository: e.target.value }),
				className: "rounded border px-2 py-1 text-sm",
				style: _n,
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
		spec: T("Spec", a.spec, u?.specs ?? [], (e) => b({ spec: e }), "No spec is stored yet."),
		task: T("Task", a.taskId, u?.tasks ?? [], (e) => b({ taskId: e }), "No task yet.")
	};
	return /* @__PURE__ */ k(U, {
		id: "avoozl-stop",
		width: "36rem",
		backLabel: "Cancel",
		describedBy: "avoozl-stop-line",
		boxRef: y,
		attrs: { "data-stop-dialog": !0 },
		unsaved: JSON.stringify(a) !== JSON.stringify(ft()) && {
			title: "Discard this stop?",
			body: "The line keeps running. What you entered is lost.",
			action: "Discard"
		},
		title: /* @__PURE__ */ k("span", {
			className: "inline-flex items-center gap-1.5",
			children: [/* @__PURE__ */ O(E, {
				size: 14,
				"aria-hidden": "true",
				style: { color: "var(--danger)" }
			}), " Stop the line"]
		}),
		onDismiss: x,
		footer: /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O(f, {
			type: "button",
			onClick: x,
			children: "Cancel"
		}), /* @__PURE__ */ k(f, {
			type: "button",
			"data-danger": !0,
			"data-stop-confirm": !0,
			onClick: () => void S(),
			disabled: g,
			style: hn,
			children: [/* @__PURE__ */ O(E, {
				size: 14,
				"aria-hidden": "true"
			}), a.kind === "agents" ? "Stop all agents" : "Stop the line"]
		})] }),
		children: [
			/* @__PURE__ */ O("div", { children: /* @__PURE__ */ O("p", {
				id: "avoozl-stop-line",
				className: "text-sm text-muted",
				children: "Only a person can resume it."
			}) }),
			/* @__PURE__ */ O(mn, {
				name: "avoozl-stop-kind",
				label: "How to stop",
				value: a.kind,
				onChange: (e) => b({ kind: e }),
				sections: ut.map((e) => ({
					key: e.value,
					title: e.label,
					line: e.line,
					...e.value === "agents" ? { description: /* @__PURE__ */ O("p", {
						className: "text-sm text-muted",
						"data-full-warning": !0,
						children: dt
					}) } : { fields: /* @__PURE__ */ O(mn, {
						name: "avoozl-stop-scope",
						label: "What to stop",
						value: a.scope,
						onChange: (e) => b({ scope: e }),
						sections: lt.map((e) => ({
							key: e.value,
							title: e.label,
							line: e.line,
							fields: ee[e.value]
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
			})
		]
	});
}
// kirocrew-app/ui/src/instance-api.ts
function Sn(e) {
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
function Cn(e, t) {
	return e && (t === "header" || e.shared) ? e.name : null;
}
// kirocrew-app/ui/src/InstanceName.tsx
var wn = "avoozl:instance-changed";
function Tn(e) {
	let n = j(), i = o(() => Sn(n), [n]), [a, s] = c(null), l = t(() => {
		e && i.view(e).then(s, () => void 0);
	}, [i, e]);
	return r(() => (l(), window.addEventListener(wn, l), () => window.removeEventListener(wn, l)), [l]), a;
}
// kirocrew-app/ui/src/Panel.tsx
var En = "/apps/avoozl", Dn = "avoozl.panel.away";
function On(e) {
	try {
		let t = e?.getItem(Dn);
		e?.removeItem(Dn);
		let n = t ? JSON.parse(t) : null;
		return n && Number.isFinite(n.at) && Array.isArray(n.waitingKeys) ? n : null;
	} catch {
		return null;
	}
}
function kn() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
var An = {
	waiting: "Avoozl could not read what is waiting on you. It tries again soon.",
	inFlight: "Avoozl could not read the crews. It tries again soon.",
	queue: "Avoozl could not read the release queue. It tries again soon.",
	recent: "Avoozl could not read recent merges. It tries again soon."
}, jn = {
	review: w,
	"ready-to-merge": w,
	"branch-landing": C
}, Mn = {
	running: "Running",
	idle: "Quiet",
	none: "Not started",
	unknown: "Unknown"
}, Nn = {
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
function Pn(e) {
	return /* @__PURE__ */ O(Y, { children: e.rows.map((t) => /* @__PURE__ */ O(Z, {
		"data-waiting-row": t.kind,
		icon: jn[t.kind] ?? y,
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
function Fn({ rows: e, now: t }) {
	return /* @__PURE__ */ O(Y, { children: e.map((e) => {
		let n = e.pr ? Ot(e.check) : null, r = [
			e.instance ?? (e.source === "radar" ? "No Avoozl" : null),
			e.crew ?? e.who,
			e.source === "radar" ? e.ref : e.who,
			e.phase ? null : "claim label, no claim comment"
		].filter(Boolean);
		return /* @__PURE__ */ O(Z, {
			"data-flight-row": e.source,
			icon: e.pr ? w : e.source === "radar" ? ne : b,
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
var In = {
	driver: "this driver chat drives it",
	folder: "this chat's project folder is in it",
	last: "the app page showed it last",
	default: "the default workspace",
	none: "none found"
};
function Ln() {
	let e = j(), n = d(), { openChat: i } = ve(), [a, l] = c(ce(kn()).workspaceId), [u, f] = c(null), [p, h] = c([]), [g, _] = c(null), [v, x] = c(null), [C, E] = c(null), [ie, ae] = c(null), [A, le] = c(() => Date.now()), [ue, de] = c(() => On(kn())), fe = Tn(a), pe = o(() => et(window.location), []), me = o(() => tn(e), [e]), he = o(() => Ve(e), [e]), ge = o(() => nn(e), [e]);
	r(() => {
		a && se(e).list().then((e) => f(e.items.find((e) => e.id === a)?.name ?? null), () => void 0);
	}, [e, a]);
	let _e = s(a), ye = s(g);
	ye.current = g;
	let M = s(null), be = s(null), xe = s(null), [Se, Ce] = c(null), N = t(async () => {
		let t = _e.current, n;
		try {
			n = await se(e).list(), t || (t = n.defaultWorkspace, _e.current = t, l(t));
		} catch (e) {
			x(oe(e));
			return;
		}
		if (!t) return;
		let r = Nn;
		try {
			r = await gt(e, t), be.current ??= (async () => {
				let t = await ht(e, pe), r = /* @__PURE__ */ new Map();
				t && await Promise.all(n.items.map((t) => se(e).repositories(t.id).then((e) => void r.set(t.id, e.map((e) => e.localCheckout).filter((e) => !!e))).catch(() => void 0))), M.current = {
					project: t,
					roots: r
				}, t && xe.current?.();
			})();
			let i = M.current ?? {
				project: null,
				roots: /* @__PURE__ */ new Map()
			}, a = At({
				driverRoot: Tt(r.driver, pe),
				project: i.project,
				workspaces: n.items.map((e) => ({
					id: e.id,
					root: e.root,
					roots: i.roots.get(e.id) ?? []
				})),
				last: ce(kn()).workspaceId,
				fallback: n.defaultWorkspace
			});
			Ce(a.why), a.id && a.id !== t && (t = a.id, _e.current = t, l(t), r = await gt(e, t));
		} catch {}
		try {
			let t = await e.get(rn);
			h((t.specs ?? []).map((e) => e.name));
		} catch {}
		x(null), _(r), le(Date.now());
	}, [e, pe]);
	xe.current = N, r(() => _t(N, {
		intervalMs: 0,
		doc: document,
		win: window,
		setTimer: (e, t) => setInterval(e, t),
		clearTimer: (e) => clearInterval(e)
	}), [N]);
	let P = o(() => Ct(g ?? {}), [g]), we = g?.driver ?? null, Te = g?.specs ?? [], F = tt(pe, {
		specs: p,
		driver: we?.slot ?? null
	}), I = F.kind === "spec-builder" ? Te.find((e) => e.name === F.spec) : void 0, Ee = s(P);
	Ee.current = P, r(() => {
		let e = () => {
			if (ye.current) try {
				let e = {
					at: Date.now(),
					waitingKeys: Ee.current.waiting.map((e) => e.key)
				};
				kn()?.setItem(Dn, JSON.stringify(e));
			} catch {}
		}, t = () => {
			if (document.visibilityState === "hidden") return e();
			let t = On(kn());
			t && de(t);
		};
		return window.addEventListener("blur", e), window.addEventListener("focus", t), document.addEventListener("visibilitychange", t), () => {
			window.removeEventListener("blur", e), window.removeEventListener("focus", t), document.removeEventListener("visibilitychange", t);
		};
	}, []);
	let L = o(() => $e(P, ue, A), [
		P,
		ue,
		A
	]), De = async (e, t) => {
		if (a && t.kind !== "link") {
			ae(e.key);
			try {
				t.kind === "resolve" ? await he.resolveConflict(a, t.taskId, t.field, t.choice) : await ge.land(a, t.repository, t.branch, t.head), E(null), await N();
			} catch (e) {
				E(oe(e));
			} finally {
				ae(null);
			}
		}
	}, Oe = async () => {
		if (a && I?.plan && I.hash) try {
			await me.approve(a, I.plan.id, I.hash), E("Approved this revision for Avoozl."), await N();
		} catch (e) {
			E(oe(e));
		}
	}, ke = async () => {
		if (a && I) try {
			await me.store(a, I.name), E("Stored as a draft. Review it in Specs, then approve."), await N();
		} catch (e) {
			E(oe(e));
		}
	}, Ae = (e) => P.unread.includes(e), R = g === null, je = P.stops.length > 0, Me = Cn(fe, "header") ?? g?.instance?.name ?? null, Ne = (e, t, n, r) => Ae(e) ? /* @__PURE__ */ O(X, { children: R ? "Loading…" : An[e] }) : n === 0 ? /* @__PURE__ */ O(X, { children: t }) : r(), Pe = /* @__PURE__ */ k(J, {
		id: "waiting",
		title: "Needs you",
		count: P.waiting.length,
		tone: "warn",
		open: !0,
		children: [Ne("waiting", "Nothing is waiting on you.", P.waiting.length, () => /* @__PURE__ */ O(Pn, {
			rows: P.waiting.slice(0, 5),
			busy: ie,
			now: A,
			onAct: (e, t) => void De(e, t),
			onOpenPage: () => n(En)
		})), P.waiting.length > 5 && /* @__PURE__ */ O(X, { children: /* @__PURE__ */ O(Q, {
			label: `Show all ${P.waiting.length}`,
			onClick: () => n(En)
		}) })]
	}), Fe = /* @__PURE__ */ O(J, {
		id: "in-flight",
		title: "In flight",
		count: P.inFlight.length,
		summary: g?.crews && g.crews.stale > 0 ? `${g.crews.stale} stale` : void 0,
		open: !0,
		children: Ne("inFlight", "No crew has a claim right now.", P.inFlight.length, () => /* @__PURE__ */ O(Fn, {
			rows: P.inFlight,
			now: A
		}))
	}), z = /* @__PURE__ */ O(J, {
		id: "queue",
		title: "Release queue",
		count: P.queue?.head.length,
		summary: P.queue ? Rn(P.queue) : void 0,
		children: Ne("queue", P.queue?.held ? `Nothing is next. ${P.queue.held} held.` : "Nothing is next in the queue.", P.queue?.head.length ?? 0, () => /* @__PURE__ */ O(Y, { children: P.queue.head.map((e) => /* @__PURE__ */ O(Z, {
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
	}), B = /* @__PURE__ */ O(J, {
		id: "recent",
		title: "Recent merges",
		count: P.recent.length,
		summary: P.recent[0] ? `last ${Dt(P.recent[0].at, A)}` : void 0,
		children: Ne("recent", "Nothing finished lately.", P.recent.length, () => /* @__PURE__ */ O(Y, { children: P.recent.map((e) => /* @__PURE__ */ O(Z, {
			"data-recent-row": !0,
			icon: m,
			title: e.title,
			age: Dt(e.at, A),
			ageTip: $(e.at, A),
			meta: [e.repository, e.taskId].filter(Boolean).join(" · ")
		}, e.taskId)) }))
	}), Ie = /* @__PURE__ */ O(Rt, {
		name: "Avoozl",
		onName: () => n(En),
		nameTip: "Open Avoozl",
		instance: Me,
		workspace: u,
		tip: [Me ? `Avoozl · ${Me}` : "Avoozl", u ? `Workspace: ${u}${Se ? ` (${In[Se]})` : ""}` : ""].filter(Boolean).join(". "),
		tools: /* @__PURE__ */ O(Xt, {
			bare: !0,
			workspaceId: a,
			onRefresh: () => void N()
		}),
		end: /* @__PURE__ */ O("span", {
			"data-panel-line": !0,
			"data-stopped": je ? "" : void 0,
			style: { display: "inline-flex" },
			children: /* @__PURE__ */ O(qe, { children: /* @__PURE__ */ O(bn, {
				bare: !0,
				workspaceId: a
			}) })
		})
	}), V = wt(g && !g.driver ? {
		state: "unknown",
		slot: null,
		href: null,
		openedAt: null,
		lastSeenAt: null
	} : g?.driver), H = g?.crews ? g.crews.groups?.length ?? 0 : null, Le = R ? null : /* @__PURE__ */ O("div", {
		"data-pp-cells": !0,
		children: /* @__PURE__ */ k(Qt, { children: [/* @__PURE__ */ O($t, {
			"data-panel-driver": V.state,
			tone: V.state === "running" ? "ok" : V.state === "unknown" ? "warn" : "muted",
			title: `Driver: ${Mn[V.state].toLowerCase()}`,
			tip: [
				"One long-running chat that releases ready work in graph order and hands you the decisions. It releases work only while the chat is open.",
				V.note,
				we?.lastSeenAt && V.state !== "none" ? `Last seen ${$(we.lastSeenAt, A)}.` : "",
				V.workspace ? `Workspace: ${V.workspace}.` : "",
				V.elsewhere ? V.elsewhere.text : ""
			].filter(Boolean).join(" "),
			actions: /* @__PURE__ */ k(D, { children: [
				V.link && /* @__PURE__ */ O(en, {
					label: "Open driver session",
					icon: /* @__PURE__ */ O(ee, {
						size: 13,
						"aria-hidden": "true"
					}),
					primary: !V.start,
					href: K(V.link),
					"data-driver-open": !0
				}),
				V.start && /* @__PURE__ */ O(en, {
					label: V.link ? "Start a new driver session" : "Start a driver session",
					icon: /* @__PURE__ */ O(te, {
						size: 13,
						"aria-hidden": "true"
					}),
					primary: !V.link,
					tip: V.link ? "Start a new driver session." : "Start a driver session. Opens a new chat on the avoozl-driver agent.",
					onClick: () => i({
						agent: "avoozl-driver",
						message: "Start the Avoozl driver session. Keep this chat open. Release ready work in graph order, watch pull requests through checks and merge, and bring anything that needs a person to me. Use the avoozl tools. Do not merge anything yourself and do not code issues yourself.",
						autoSend: !0
					}),
					"data-driver-start": !0
				}),
				V.elsewhere && /* @__PURE__ */ O(en, {
					label: `Open ${V.elsewhere.workspace}'s driver`,
					icon: /* @__PURE__ */ O(S, {
						size: 13,
						"aria-hidden": "true"
					}),
					href: K(V.elsewhere.href),
					tip: V.elsewhere.text,
					"data-driver-elsewhere": !0
				}),
				/* @__PURE__ */ O(en, {
					label: "Recheck",
					icon: /* @__PURE__ */ O(re, {
						size: 13,
						"aria-hidden": "true"
					}),
					onClick: () => void N(),
					"data-driver-recheck": !0
				})
			] })
		}), /* @__PURE__ */ O($t, {
			"data-panel-crew": !0,
			tone: H ? "ok" : "warn",
			title: H === null ? "Radar crew: unknown" : H ? `Radar crews: ${H}` : "Radar crew: none",
			tip: "Issue Radar crews code the issues Avoozl releases. Create a crew in Radar, Crews.",
			actions: /* @__PURE__ */ O(en, {
				label: "Open Radar",
				icon: /* @__PURE__ */ O(S, {
					size: 13,
					"aria-hidden": "true"
				}),
				href: "/issue-radar",
				tip: "Open Radar, Crews."
			})
		})] })
	}), U = /* @__PURE__ */ k(J, {
		id: "line",
		title: "Line and driver",
		summary: je ? "stopped" : void 0,
		open: !0,
		children: [/* @__PURE__ */ O(Y, { children: P.stops.map((e) => /* @__PURE__ */ O(Z, {
			icon: y,
			title: e
		}, e)) }), Le]
	}), Re = L && /* @__PURE__ */ O("div", {
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
					onClick: () => de(null)
				}) })
			]
		})
	}), W = F.kind === "crew" ? g?.crews?.rows.find((e) => e.crewId === F.crew) : void 0, ze = I ? (g?.queue?.repositories ?? []).flatMap((e) => e.rows.filter((e) => e.spec === I.name || e.planId === I.plan?.id)) : [];
	return /* @__PURE__ */ k(Lt, {
		kind: F.kind,
		children: [
			Ie,
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
								meta: rt(F, {
									files: I.files,
									approved: !!I.plan?.approved
								}) ? "tasks.md is written and not approved yet." : I.plan?.approved ? "Do not press Execute in Spec Builder. Avoozl's gate replaces it." : null,
								actions: I.plan ? I.plan.approved ? null : /* @__PURE__ */ O(Q, {
									label: "Approve for Avoozl",
									primary: !0,
									disabled: I.counts.error > 0 || !I.hash,
									onClick: () => void Oe()
								}) : /* @__PURE__ */ O(Q, {
									label: "Store this spec",
									onClick: () => void ke()
								})
							})
						] }) }) : /* @__PURE__ */ O(X, { children: R ? "Loading…" : "Avoozl has not read this spec folder yet." })
					})
				}),
				I?.plan?.approved && /* @__PURE__ */ O(J, {
					id: "spec-queue",
					title: "This spec in the queue",
					count: ze.length,
					open: !0,
					children: ze.length === 0 ? /* @__PURE__ */ O(X, { children: "Nothing from this spec is in the queue yet." }) : /* @__PURE__ */ O(Y, { children: ze.slice(0, 6).map((e) => /* @__PURE__ */ O(Z, {
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
				U
			] }),
			F.kind === "crew" && /* @__PURE__ */ k(D, { children: [/* @__PURE__ */ O("div", {
				"data-panel-crew": !0,
				children: /* @__PURE__ */ k(J, {
					id: "crew",
					title: `Crew ${F.crew}`,
					open: !0,
					children: [W ? /* @__PURE__ */ k(Y, { children: [/* @__PURE__ */ O(Z, {
						icon: W.pr ? w : ne,
						title: `${W.repository}#${W.number} ${W.title}: ${W.phase ?? "no phase"}${W.pr ? `, PR #${W.pr}` : ""}${W.stale ? " (stale)" : ""}`,
						href: K(W.url),
						age: W.updated ? Dt(W.updated, A) : null,
						ageTip: W.updated ? `Updated ${$(W.updated, A)}` : void 0,
						meta: W.updated ? `Updated ${$(W.updated, A)}` : null,
						actions: /* @__PURE__ */ k(D, { children: [W.prUrl && /* @__PURE__ */ O(Q, {
							label: `PR #${W.pr}`,
							href: K(W.prUrl)
						}), W.commentUrl && /* @__PURE__ */ O(Q, {
							label: "Crew comment",
							href: K(W.commentUrl)
						})] }),
						multi: !0
					}), /* @__PURE__ */ O("li", {
						"data-pp-row": !0,
						style: { gridTemplateColumns: "minmax(0,1fr)" },
						children: /* @__PURE__ */ O(G, {
							text: Ye(W).map((e) => `${e.label}: ${e.state}`).join(", "),
							children: /* @__PURE__ */ O("span", {
								"data-rail": !0,
								role: "img",
								"aria-label": Ye(W).map((e) => `${e.label} ${e.state}`).join(", "),
								style: {
									display: "inline-flex",
									gap: 3
								},
								children: Ye(W).map((e) => /* @__PURE__ */ O("i", {
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
					})] }) : /* @__PURE__ */ O(X, { children: R ? "Loading…" : Ae("inFlight") ? An.inFlight : "No live claim from this crew in Avoozl's repositories." }), /* @__PURE__ */ O(X, { children: "Avoozl cannot message this chat. It shows what the claim on GitHub says." })]
				})
			}), U] }),
			F.kind === "avoozl" && /* @__PURE__ */ k(D, { children: [
				Re,
				Pe,
				Fe,
				z,
				B,
				U
			] }),
			F.kind === "other" && /* @__PURE__ */ k("div", {
				"data-panel-recap": !0,
				children: [
					Re,
					Pe,
					Fe,
					z,
					B,
					U
				]
			})
		]
	});
}
function Rn(e) {
	return [
		e.claimed ? `${e.claimed} claimed` : "",
		`${e.next} next`,
		e.held ? `${e.held} held` : ""
	].filter(Boolean).join(" · ");
}
export { Ln as default };
