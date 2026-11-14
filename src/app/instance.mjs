// Instance names. Each install picks a short display name once, from its own
// word list, and keeps a fixed ID beside it. The ID, never the name, goes in
// hidden markers; the name is for people and can be renamed. Neither leaves a
// mirror for a public repository (stripInstance, assertNoInstance).
// shortcut: stored in the workspace database like machineIdentity, so a second
// workspace on one machine picks its own. Move to the catalog store when one
// install should share a name across workspaces.
import { randomBytes } from "node:crypto";
import { fail } from "./store.mjs";

// Plants, places and weather. Not the star and galaxy names Issue Radar gives
// its crews (test/instance.test.mjs lists those and checks none repeats).
export const INSTANCE_NAMES = [
  "Mira",
  "Juno",
  "Ada",
  "Basil",
  "Cedar",
  "Dune",
  "Ember",
  "Fable",
  "Gale",
  "Harbor",
  "Iris",
  "Jade",
  "Kite",
  "Lark",
  "Moss",
  "Nettle",
  "Orchid",
  "Pike",
  "Quill",
  "Reed",
  "Sage",
  "Tarn",
  "Umber",
  "Vale",
  "Wren",
  "Yarrow",
  "Alder",
  "Birch",
  "Clover",
  "Dell",
  "Elm",
  "Fern",
  "Glen",
  "Heron",
  "Ivy",
  "Juniper",
  "Kelp",
  "Linden",
  "Maple",
  "Otter",
];

const KEY = "instanceIdentity";
const SEEN = "instanceSeen";
export const INSTANCE_ID = /^inst-[0-9a-f]{12}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,23}$/;
const ID_SHAPE = /inst-[0-9a-f]{12}/g;

// The identity, made on first use and kept after.
export function instanceIdentity(store, { random = Math.random } = {}) {
  const existing = store.getMeta(KEY);
  if (existing) return existing;
  const identity = {
    id: `inst-${randomBytes(6).toString("hex")}`,
    name: INSTANCE_NAMES[Math.floor(random() * INSTANCE_NAMES.length)],
    namedAt: new Date().toISOString(),
  };
  store.setMeta(KEY, identity);
  return identity;
}

export function renameInstance(store, value) {
  const name = String(value ?? "").trim();
  if (!NAME.test(name) || INSTANCE_ID.test(name))
    fail(
      "An instance name is 1 to 24 letters, digits, spaces or hyphens, and is not an instance ID.",
    );
  const identity = { ...instanceIdentity(store), name };
  store.setMeta(KEY, identity);
  return identity;
}

// Another instance's ID, seen in a marker. Only well-formed IDs count.
export function recordSeenInstance(store, id) {
  if (!INSTANCE_ID.test(String(id ?? ""))) return;
  if (id === instanceIdentity(store).id) return;
  const seen = store.getMeta(SEEN) || [];
  if (!seen.includes(id)) store.setMeta(SEEN, [...seen, id]);
}

// `shared` is true once another instance was seen; until then the name shows
// in the header only.
export function instanceView(store) {
  const { id, name } = instanceIdentity(store);
  const others = store.getMeta(SEEN) || [];
  return { id, name, others, shared: others.length > 0 };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Text bound for a public repository: no instance ID, no name, no `instance=`
// or `name=` marker field. Foreign IDs go by their shape.
export function stripInstance(text, { id, name } = {}) {
  let out = String(text ?? "")
    .replace(/\s*\binstance=\S+/g, "")
    .replace(/<!--\s*avoozl-driver[^>]*-->\s*/g, "")
    .replace(ID_SHAPE, "");
  if (id) out = out.split(id).join("");
  if (name) out = out.replace(new RegExp(`\\b${escape(name)}\\b`, "g"), "");
  return out;
}

export function assertNoInstance(text, identity) {
  if (stripInstance(text, identity) !== String(text ?? ""))
    fail(
      "Text for a public repository must not carry the instance ID or name.",
      422,
    );
  return text;
}
