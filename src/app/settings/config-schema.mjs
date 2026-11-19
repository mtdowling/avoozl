// The `$schema` value Avoozl writes into the configuration files it saves.
// Each names the schema file in the public repository, so an editor can
// fetch it. The older avoozl.dev addresses never resolved; a file that still
// carries one loads as before and gets the current address on its next save.
const SOURCE = "https://raw.githubusercontent.com/mtdowling/avoozl/main/src/";
export const REPOSITORY_CONFIG_SCHEMA_URL =
  SOURCE + "avoozl-config.schema.json";
export const HOST_CONFIG_SCHEMA_URL = SOURCE + "host-config.schema.json";
export const RETIRED_SCHEMA_URLS = Object.freeze([
  "https://avoozl.dev/schema/repository-config-v1.json",
  "https://avoozl.dev/schema/host-config-v1.json",
]);

// The `$schema` to save: a person's own value stays, a retired or missing
// one becomes `current`.
export const savedSchemaUrl = (value, current) =>
  typeof value === "string" && value && !RETIRED_SCHEMA_URLS.includes(value)
    ? value
    : current;
