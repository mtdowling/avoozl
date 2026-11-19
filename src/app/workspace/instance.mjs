// Instance names. Each install picks a short display name once, from its own
// word list, and keeps a fixed ID beside it. The ID, never the name, goes in
// hidden markers; the name is for people and can be renamed.
// shortcut: stored in the workspace database like machineIdentity, so a second
// workspace on one machine picks its own. Move to the catalog store when one
// install should share a name across workspaces.
import { randomBytes } from "node:crypto";
import { fail } from "../store/store.mjs";

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

// A plain name for an instance whose own name is not known here: the same ID
// always gives the same word from the list, so the page never shows an ID.
export const plainInstanceName = (id) =>
  INSTANCE_NAMES[
    Number.parseInt(String(id).replace(/\D*/, "").slice(0, 8) || "0", 16) %
      INSTANCE_NAMES.length
  ];

// The ID if one exists, without making one (a planning-only read must not write).
export const peekInstance = (store) => store.getMeta(KEY) ?? null;

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
