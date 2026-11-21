import path from "node:path";

// This process's environment with its own config folder under `dir` and no
// variable `strip` matches, so a child reads no real workspace or port.
export function isolatedEnv(dir: string, strip = /^AVOOZL_|^PORT$/) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(dir, "config"),
  };
  for (const name of Object.keys(env)) if (strip.test(name)) delete env[name];
  return env;
}
