# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-03-23

### Security
- Fix symlink traversal in `walkDir` — no longer follows symlinks that escape base directory (SEC-01)
- Replace permissive marketplace URL regex with strict domain allowlist (github.com, gitlab.com, bitbucket.org) + `DOTAI_ALLOWED_DOMAINS` env var for enterprise self-hosted Git (SEC-02)
- Add input validation to `parseRepoArg` rejecting metacharacters and leading dashes (SEC-03)
- Add try/catch around `JSON.parse` in profile loading to prevent unhandled crashes (SEC-04)
- Expand credential scanning patterns: `*.p12`, `*.pfx`, `*.jks`, `id_rsa`, `id_ed25519`, `.netrc`, `secrets.json`, etc. (SEC-06)
- `parseManifest` now validates internally; `validateExternalManifest` only checks `isKnownConfigDir` (SEC-07)
- Replace `as any` with typed `Record<string, unknown>` in manifest and plugin validation (SEC-08)
- Add MAX_PLUGINS=50 / MAX_MARKETPLACES=20 limits to prevent slow DoS via malicious repos (SEC-09)

### Fixed
- Fix misleading "Exported tool (0 items)" when nothing was actually exported (FUNC-01)
- Replace empty `catch {}` in import with ENOENT-aware error handling (FUNC-02)
- Fix marketplace parser excluding names containing "name" substring (FUNC-03)
- Fix plugin key parser accepting any line with `@` as a plugin key (FUNC-04)
- Add permission error handling in `walkDir` to prevent crashes on unreadable directories (FUNC-05)
- Remove redundant `rmSync` in `use.ts` catch block (FUNC-07)
- Remove dead `deleteFile` export from fileops (FUNC-10)
- Doctor "All checks passed" now acknowledges unmanaged files (FUNC-12)
- Fix 2 flaky tests: mock network calls in `use.test.ts`, use `vi.stubEnv` in roundtrip test (FLAKY-01/02)

### Improved
- `createBackup` only backs up files about to be overwritten instead of entire config directory (PERF-01)
- Profile loading now cached at module level (PERF-02)
- `filesAreEqual` short-circuits on size mismatch before reading file contents (PERF-04)
- Plugin restore and git clone show progress unconditionally, not just with `--verbose` (PERF-05/06)
- `--only` with nonexistent tool name now shows error with available tools (UX-01)
- Error messages include directory path context (UX-03)
- Added `--help` examples for init, export, and use commands (UX-04)
- Skip README rewrite when nothing was exported (UX-06)
- Replace `process.exit(1)` in helpers with thrown errors for testability (FUNC-06)

### Tests
- Added `tests/cli.test.ts` — first test coverage for CLI entry point (TEST-01)
- Added 22 injection rejection tests for plugin safety regexes (TEST-02)
- Added offline `runUse` success flow test (TEST-03)
- Expanded coverage for diff, status, doctor, resolve, manifest, fileops, gitignore, readme, profiles (TEST-04–12)
- Test suite: 81 → 159 tests (+79), 15 → 16 test files

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
