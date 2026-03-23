# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-03-23

### Fixed
- Fix profiles directory not found when installed via npm (bundled path resolution)

## [0.3.0] - 2026-03-23

### Added
- Full Claude Code plugin sync: `dotai import` and `dotai use` now automatically restore plugins via the `claude` CLI after importing configuration files
- Marketplace restoration: registers missing plugin marketplaces before installing plugins
- `--skip-plugins` flag on `import` and `use` commands to opt out of plugin restore
- Dry-run plugin preview: `--dry-run` now shows which plugins and marketplaces would be restored
- Plugin metadata files (`known_marketplaces.json`, `blocklist.json`) added to claude profile as portable
- Graceful handling: missing claude CLI, individual install failures, local/project-scoped plugin warnings

## [0.2.0] - 2026-03-22

### Added
- Dynamic profile discovery in `profiles/` directory
- Hooks, agents, rules, CLAUDE.md, keybindings added to claude profile
- Round-trip integration test (init, export, import)
- Path traversal protection in `isKnownConfigDir()`

### Fixed
- Friendly error messages for `dotai use` git failures
- `dotai init` warns and skips when `dotai.json` exists
- Guard `expandHome()` against missing HOME env var
