import { useCallback as e, useEffect as t, useMemo as n, useState as r } from "react";
import { useAppApi as i } from "@kirocrew/app-sdk";
import { Btn as a } from "@kirocrew/app-sdk/ui";
import { Fragment as o, jsx as s, jsxs as c } from "react/jsx-runtime";
// kirocrew-app/ui/src/panel-chat.ts
function l(e) {
	let t = new URLSearchParams(e.search).get("sid");
	if (t) return t;
	let n = /\/embed\/chat\/([^/?#]+)/.exec(e.pathname);
	return n ? decodeURIComponent(n[1]) : "";
}
function u(e, t) {
	let n = [...t.specs].sort((e, t) => t.length - e.length).find((t) => e === `spec-builder-${t}` || RegExp(`^spec-builder-${d(t)}-[0-9a-f]{8}$`).test(e));
	return n ? {
		kind: "spec-builder",
		spec: n
	} : e.startsWith("crew-") && e.length > 5 ? {
		kind: "crew",
		crew: e.slice(5)
	} : e.startsWith("avoozl_") ? { kind: "avoozl" } : { kind: "other" };
}
var d = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function f(e, t) {
	return e.kind === "spec-builder" && t.files.includes("tasks.md") && !t.approved;
}
// kirocrew-app/ui/src/workspace-api.ts
var p = "/apps/avoozl/api/command";
function m(e) {
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
function h(e) {
	let t = async (t, n = {}, r) => (await e.post(p, {
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
function g(e) {
	try {
		let t = JSON.parse(e?.getItem("avoozl.page") ?? "null");
		return { workspaceId: typeof t?.workspaceId == "string" ? t.workspaceId : null };
	} catch {
		return { workspaceId: null };
	}
}
// kirocrew-app/ui/src/plans-api.ts
function _(e) {
	let t = async (t, n, r = {}) => (await e.post(p, {
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
// kirocrew-app/ui/src/spec-builder-api.ts
var v = "/api/apps/spec-builder/specs";
// kirocrew-app/ui/src/views-api.ts
function y(e) {
	let t = async (t, n, r, i) => (await e.post(p, {
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
// kirocrew-app/ui/src/Panel.tsx
function b() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
function x() {
	let d = i(), [p, x] = r(g(b()).workspaceId), [S, C] = r([]), [w, T] = r([]), [E, D] = r(null), [O, k] = r(null), [A, j] = r(null), M = n(() => l(window.location), []), N = n(() => _(d), [d]), P = n(() => y(d), [d]), F = e(async () => {
		try {
			k(null);
			let e = p;
			if (e || (e = (await h(d).list()).defaultWorkspace, x(e)), !e) return;
			let t = await d.get(v).catch(() => ({ specs: [] }));
			C((t.specs ?? []).map((e) => e.name)), T((await N.specs(e)).items), D(await P.radarCrews(e));
		} catch (e) {
			k(m(e));
		}
	}, [
		d,
		N,
		P,
		p
	]);
	t(() => {
		F();
	}, [F]);
	let I = u(M, { specs: S }), L = I.kind === "spec-builder" ? w.find((e) => e.name === I.spec) : void 0, R = async () => {
		if (p && L?.plan && L.hash) try {
			await N.approve(p, L.plan.id, L.hash), j("Approved this revision for Avoozl."), await F();
		} catch (e) {
			j(m(e));
		}
	}, z = async () => {
		if (p && L) try {
			await N.store(p, L.name), j("Stored as a draft plan. Review it in Specs, then approve."), await F();
		} catch (e) {
			j(m(e));
		}
	};
	return /* @__PURE__ */ c("div", {
		className: "flex flex-col gap-3 p-3 text-sm",
		"data-panel-kind": I.kind,
		children: [
			O && /* @__PURE__ */ c("p", {
				role: "alert",
				children: ["Avoozl can't read this workspace: ", O]
			}),
			I.kind === "spec-builder" && /* @__PURE__ */ c("section", {
				"data-panel-spec": !0,
				children: [
					/* @__PURE__ */ c("h3", {
						className: "font-semibold",
						children: ["Spec check: ", I.spec]
					}),
					!L && /* @__PURE__ */ s("p", {
						className: "text-muted",
						children: "Avoozl has not read this spec folder yet."
					}),
					L && /* @__PURE__ */ c(o, { children: [
						/* @__PURE__ */ c("ul", { children: [
							/* @__PURE__ */ c("li", { children: ["Files: ", L.files.join(", ") || "none"] }),
							/* @__PURE__ */ c("li", { children: ["Tasks: ", L.taskCount] }),
							/* @__PURE__ */ c("li", { children: [
								"Problems: ",
								L.counts.error,
								" errors, ",
								L.counts.warning,
								" warnings"
							] }),
							/* @__PURE__ */ s("li", { children: L.plan?.approved ? "Approved for Avoozl." : "Not approved for Avoozl." })
						] }),
						f(I, {
							files: L.files,
							approved: !!L.plan?.approved
						}) && /* @__PURE__ */ s("p", {
							className: "text-muted",
							children: "tasks.md is written and not approved yet."
						}),
						!L.plan && /* @__PURE__ */ s(a, {
							onClick: () => void z(),
							children: "Store as a plan"
						}),
						L.plan && !L.plan.approved && /* @__PURE__ */ s(a, {
							primary: !0,
							disabled: L.counts.error > 0 || !L.hash,
							onClick: () => void R(),
							children: "Approve for Avoozl"
						})
					] }),
					A && /* @__PURE__ */ s("p", {
						role: "status",
						children: A
					})
				]
			}),
			I.kind === "crew" && /* @__PURE__ */ c("section", {
				"data-panel-crew": !0,
				children: [/* @__PURE__ */ c("h3", {
					className: "font-semibold",
					children: ["Crew ", I.crew]
				}), (() => {
					let e = E?.rows.find((e) => e.crewId === I.crew);
					return e ? /* @__PURE__ */ c("p", { children: [
						e.repository,
						"#",
						e.number,
						" ",
						e.title,
						": ",
						e.phase ?? "no phase",
						e.pr ? `, PR #${e.pr}` : "",
						e.stale ? " (stale)" : ""
					] }) : /* @__PURE__ */ s("p", {
						className: "text-muted",
						children: "No live claim from this crew in Avoozl's repositories."
					});
				})()]
			}),
			I.kind === "avoozl" && /* @__PURE__ */ s("p", {
				className: "text-muted",
				children: "An Avoozl chat. Its result shows in the Avoozl page."
			}),
			I.kind === "other" && /* @__PURE__ */ c("section", {
				"data-panel-recap": !0,
				children: [/* @__PURE__ */ s("h3", {
					className: "font-semibold",
					children: "Recap"
				}), /* @__PURE__ */ c("p", { children: [E ? `${E.rows.length} crew${E.rows.length === 1 ? "" : "s"} on the line` : "Loading…", E && E.stale ? `, ${E.stale} stale` : ""] })]
			})
		]
	});
}
export { x as default };
