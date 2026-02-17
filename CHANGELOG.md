# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-02-17
### Added
- Release bundle generator (`npm run release:bundle`) that packages runtime files under `release/shibakubot-v1.2.0`.
- Production command registration script (`npm run register:prod`) for compiled output.
- GitHub Actions release workflow that builds and publishes a zip asset when a `v*` tag is pushed.
- `LICENSE` file (MIT).

### Changed
- Version updated from `1.0.0` to `1.2.0`.
- README now includes release/distribution procedure for source and tagged releases.
