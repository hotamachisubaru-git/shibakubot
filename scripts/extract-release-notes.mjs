import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

function readVersion() {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "").trim();

  if (!version) {
    throw new Error("package.json の version が未設定です。");
  }

  return version;
}

function extractVersionSection(changelog, version) {
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start === -1) {
    throw new Error(`CHANGELOG.md に ${heading} が見つかりません。`);
  }

  const rest = changelog.slice(start);
  const nextHeadingIndex = rest.indexOf("\n## [", heading.length);
  const section =
    nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);

  const lines = section.trim().split(/\r?\n/);
  return lines.slice(1).join("\n").trim();
}

const version = readVersion();
const changelogPath = path.join(projectRoot, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const body = extractVersionSection(changelog, version);

if (!body) {
  throw new Error(`CHANGELOG.md の ${version} セクションが空です。`);
}

process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
