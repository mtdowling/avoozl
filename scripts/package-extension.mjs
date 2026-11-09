#!/usr/bin/env node
// Builds an installable .vsix from extension/ without adding a build
// dependency. A .vsix is a zip holding an OPC manifest plus the extension
// files, so `zip` is enough and the result is inspectable.
//
//   node scripts/package-extension.mjs [--out DIR]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const extensionRoot = path.join(repositoryRoot, "extension");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"),
);

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function vsixManifest() {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escape(manifest.name)}" Version="${escape(manifest.version)}" Publisher="${escape(manifest.publisher)}" />
    <DisplayName>${escape(manifest.displayName)}</DisplayName>
    <Description xml:space="preserve">${escape(manifest.description)}</Description>
    <Tags>${escape((manifest.keywords || []).join(","))}</Tags>
    <Categories>${escape((manifest.categories || []).join(","))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escape(manifest.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="${escape(manifest.repository?.url || "")}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".css" ContentType="text/css" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".svg" ContentType="image/svg+xml" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Default Extension="" ContentType="application/octet-stream" />
</Types>
`;

// Only the files the extension needs at runtime. Tests and editor settings
// stay out of the package.
const INCLUDE = ["package.json", "README.md", "LICENSE", "src", "media"];

function copyInto(target) {
  for (const entry of INCLUDE) {
    const from = path.join(extensionRoot, entry);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(target, entry), { recursive: true });
  }
}

const out = (() => {
  const index = process.argv.indexOf("--out");
  return index === -1
    ? path.join(repositoryRoot, "build")
    : process.argv[index + 1];
})();

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "aicommander-vsix-"));
try {
  fs.mkdirSync(path.join(staging, "extension"), { recursive: true });
  copyInto(path.join(staging, "extension"));
  fs.writeFileSync(
    path.join(staging, "extension.vsixmanifest"),
    vsixManifest(),
  );
  fs.writeFileSync(path.join(staging, "[Content_Types].xml"), CONTENT_TYPES);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, manifest.name + "-" + manifest.version + ".vsix");
  fs.rmSync(file, { force: true });
  execFileSync(
    "zip",
    [
      "-q",
      "-r",
      "-X",
      file,
      "extension.vsixmanifest",
      "[Content_Types].xml",
      "extension",
    ],
    { cwd: staging },
  );
  const size = fs.statSync(file).size;
  console.log(
    JSON.stringify(
      {
        vsix: file,
        bytes: size,
        version: manifest.version,
        engine: manifest.engines.vscode,
        install:
          "code --install-extension " +
          file +
          "  (or --extensions-dir DIR to keep a profile isolated)",
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
