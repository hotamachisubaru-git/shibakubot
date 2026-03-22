import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const packageJsonPath = path.join(projectRoot, "package.json");
const distPath = path.join(projectRoot, "dist");

function assertExists(targetPath) {
  if (!existsSync(targetPath)) {
    const relativePath = path.relative(projectRoot, targetPath) || targetPath;
    throw new Error(`必要なファイルまたはディレクトリが見つかりません: ${relativePath}`);
  }
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.trim().length === 0) {
  throw new Error("package.json の version が未設定、または不正です。");
}

const releaseRoot = path.join(projectRoot, "release");
const bundleName = `shibakubot-v${version}`;
const bundleDir = path.join(releaseRoot, bundleName);
const distributionDir = path.join(releaseRoot, version);

const filesToCopy = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  ".env.example",
  "package.json",
  "package-lock.json",
];

assertExists(distPath);
for (const filePath of filesToCopy) {
  assertExists(path.join(projectRoot, filePath));
}

const releaseReadme = [
  "# ShibakuBot リリースバンドル",
  "",
  `バージョン: v${version}`,
  "",
  "## クイックスタート",
  "1. `npm ci --omit=dev` を実行",
  "2. `.env.example` を `.env` にコピーし、必要な値を設定",
  "3. `npm run register:prod` を実行",
  "4. `npm start` で起動",
  "",
  "このバンドルは `scripts/create-release-bundle.mjs` によって生成されました。",
].join("\n");

function populateBundle(targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  cpSync(distPath, path.join(targetDir, "dist"), { recursive: true });
  for (const filePath of filesToCopy) {
    cpSync(path.join(projectRoot, filePath), path.join(targetDir, filePath));
  }

  writeFileSync(path.join(targetDir, "RELEASE.md"), releaseReadme, "utf8");
}

populateBundle(bundleDir);
populateBundle(distributionDir);

const relativeBundleDir = path.relative(projectRoot, bundleDir);
const relativeDistributionDir = path.relative(projectRoot, distributionDir);
console.log(`リリースバンドルを作成しました: ${relativeBundleDir}`);
console.log(`配布用フォルダを作成しました: ${relativeDistributionDir}`);
