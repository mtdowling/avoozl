// `engine.update`: whether this machine's tick follows Avoozl's newest green
// main (tick/engine.ts). A machine setting, so `.avoozl.json` may not hold it.
import fs from "node:fs";

export function validateEngine(
  value: unknown,
  source = "Avoozl configuration",
) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${source}: engine must be an object.`);
  for (const key of Object.keys(value))
    if (key !== "update")
      throw Error(`${source}: engine.${key} is not a known setting.`);
  const update = (value as { update?: unknown }).update;
  if (update !== undefined && typeof update !== "boolean")
    throw Error(`${source}: engine.update must be true or false.`);
}

// On unless the machine file says `engine.update: false`; a missing file is
// on too. A file that cannot be parsed or holds a bad `engine` turns it off.
export function engineUpdateOn(configFile: string) {
  let text: string;
  try {
    text = fs.readFileSync(configFile, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
  try {
    const { engine } = JSON.parse(text);
    validateEngine(engine);
    return engine?.update !== false;
  } catch {
    return false;
  }
}
