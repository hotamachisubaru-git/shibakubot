# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4] - 2026-03-09
### Added
- Automatic GitHub Release publishing from `main` / `master` when `package.json` contains an unreleased version.
- Lavalink startup readiness probing before Discord-side player initialization.
- Shared AI text/Discord helper modules to simplify reply generation and history rendering.

### Changed
- Refactored AI slash command routing to use definition-based dispatch instead of long conditional branches.
- Refactored music message command routing to use command definitions with alias handling and centralized feature guards.
- Expanded `/menu` page metadata so navigation and help content are generated from shared definitions.
- Improved guild command deployment output with per-guild success/failure summaries.

## [1.2.0] - 2026-02-17
### Added
- Release bundle generator (`npm run release:bundle`) that packages runtime files under `release/shibakubot-v1.2.0`.
- Production command registration script (`npm run register:prod`) for compiled output.
- GitHub Actions release workflow that builds and publishes a zip asset when a `v*` tag is pushed.
- `LICENSE` file (MIT).

### Changed
- Version updated from `1.0.0` to `1.2.0`.
- README now includes release/distribution procedure for source and tagged releases.
