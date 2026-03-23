# Plugin Sync Design

## Problem

dotai syncs AI CLI configurations between machines, but Claude Code plugins are only partially supported. The current claude profile syncs `installed_plugins.json` and `config.json`, but misses `known_marketplaces.json` and `blocklist.json`. More critically, after import on a new machine the plugin list arrives but the actual plugins are not installed — the `cache/` directory (which contains plugin code) is ephemeral and not synced.

Users must manually re-install every plugin on each new machine.

## Goal

One-command full plugin restore: `dotai import` (or `dotai use`) syncs all plugin metadata AND automatically re-installs plugins via the official `claude` CLI.

## Constraints

- Shell out to `claude plugins install` for re-installation (forward-compatible with CLI changes)
- Claude Code-specific for now (no generic plugin framework)
- Sync all plugins; warn on local-scoped ones (project-specific paths may not exist on target)
- Must work with `--dry-run` and support `--skip-plugins` opt-out

## Design

### 1. Profile Changes (`src/profiles/claude.json`)

**Add to** `portable`**:**

- `plugins/known_marketplaces.json` — marketplace source registry (GitHub repos)
- `plugins/blocklist.json` — user's plugin security preferences

**Add to** `ephemeral`**:**

- `plugins/data/` — plugin runtime data
- `plugins/marketplaces/` — cloned marketplace repos (re-cloned during install)
- `plugins/repos/` — custom repo clones
- `plugins/install-counts-cache.json` — analytics cache

**Add new field:**

```json
{
  "postImport": {
    "type": "claude-plugins",
    "manifestFile": "plugins/installed_plugins.json",
    "marketplacesFile": "plugins/known_marketplaces.json"
  }
}
```

### 2. Type Changes (`src/types.ts`)

```typescript
export interface PostImportHook {
  type: "claude-plugins";
  manifestFile: string;       // relative path within tool config dir
  marketplacesFile: string;   // relative path within tool config dir
}

export interface ToolProfile {
  name: string;
  description: string;
  configDir: string;
  portable: string[];
  ephemeral: string[];
  credentials: string[];
  postImport?: PostImportHook;
}
```

The `PostImportHook` uses an extensible discriminated union pattern (`type` field) so future tools can define their own post-import behavior with different fields. Currently only `"claude-plugins"` exists; additional variants can be added when other tools need post-import hooks.

### 3. New Module: `src/lib/plugins.ts`

#### Data Structures

```typescript
// Mirrors the structure of installed_plugins.json
interface InstalledPluginsManifest {
  version: number;
  plugins: Record<string, PluginInstallEntry[]>;
}

interface PluginInstallEntry {
  scope: "user" | "local" | "project";
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
}

// Mirrors known_marketplaces.json
interface KnownMarketplaces {
  [name: string]: {
    source: { source: "github"; repo: string } | { source: "git"; url: string };
    installLocation: string;
    lastUpdated: string;
  };
}

interface PluginRestoreResult {
  marketplacesAdded: string[];
  marketplacesSkipped: string[];
  pluginsInstalled: string[];
  pluginsSkipped: string[];
  pluginsWarned: string[];   // local-scoped, skipped with warning
  pluginsFailed: string[];
}
```

#### `restoreMarketplaces()`

1. Read `known_marketplaces.json` from the machine path (already imported)
2. Run `claude plugins marketplace list --json` to get currently registered marketplaces. Parse the JSON output to extract marketplace names. If `--json` is not supported, fall back to parsing the tabular output (match marketplace names from the first column).
3. For each marketplace in `known_marketplaces.json` not already registered on the machine:
   - If source is `github`: run `claude plugins marketplace add <owner/repo>`
   - If source is `git`: run `claude plugins marketplace add <url>`
4. Return list of added/skipped marketplaces

#### `restorePlugins()`

1. Read `installed_plugins.json` from the machine path
2. Run `claude plugins list --json` to get the set of plugins currently installed on this machine. Parse plugin keys from the output. If `--json` is not supported, fall back to parsing tabular output. This is used for the "already installed" check — we compare by plugin key (`pluginName@marketplaceName`), NOT by `installPath` (which contains machine-specific absolute paths that differ across machines).
3. For each plugin key (format: `pluginName@marketplaceName`) in the imported manifest:
   - Sort entries by `installedAt` descending, take the most recent entry
   - If `scope === "local"`: warn and skip — `"⚠ Skipping local plugin 'X' (project: /path/to/project)"`
   - If `scope === "project"`: also warn and skip — project-scoped plugins are tied to a specific project path that may not exist on the target machine
   - If the plugin key is already in the `claude plugins list` output: skip (already installed)
   - Otherwise: run `claude plugins install <pluginName@marketplaceName> --scope user`
   - Print progress: `"Installing plugin 3/7: gopls-lsp..."` (sequential installs may be slow due to git clones)
   - Capture exit code; record success or failure
4. Return `PluginRestoreResult`

#### Error Handling

- If `claude` CLI is not found (`ENOENT` from `execFileSync`): warn `"claude CLI not found — skipping plugin restore. Install plugins manually."` and return empty result
- If a single plugin install fails: log the error, continue with remaining plugins
- Never fail the entire import because of plugin restore errors
- All `claude` CLI commands are assumed to work non-interactively (no TTY prompts). If a command hangs unexpectedly, it will be killed by the `execFileSync` timeout (30 seconds per command). This assumption should be verified during implementation.

### 4. Import Flow Changes (`src/commands/import.ts`)

After the existing file-copy loop completes:

```
if (!opts.skipPlugins) {
  for each tool in manifest:
    load profile for this tool
    if profile.postImport exists and profile.postImport.type === "claude-plugins":
      1. restoreMarketplaces(...)
      2. restorePlugins(...)
      3. print results
}
```

The profile is loaded via `getProfile(toolName)` from `src/lib/profiles.ts`.

**New option:** `--skip-plugins` (boolean, default false) — skips the post-import hook.

**Dry-run behavior:** When `--dry-run` is active, parse the manifest files and print what would be installed, but don't execute any commands.

### 5. Use Command (`src/commands/use.ts`)

`runUse()` already calls `runImport()` internally. Pass through the `skipPlugins` option. Add `--skip-plugins` flag to the `use` CLI command.

### 6. CLI Changes (`src/cli.ts`)

Add `--skip-plugins` option to both `import` and `use` commands.

### 7. Import Result Type

Extend the existing import result to include plugin restore info:

```typescript
interface ImportResult {
  // ... existing fields
  pluginRestore?: PluginRestoreResult;
}
```

### 8. Console Output

After file import summary, if plugins were restored:

```
✅ Imported claude, codex (15 files)
  Backup: ~/.dotai-backup/backup-2026-03-23T10-00-00/claude

🔌 Plugin restore:
  Added 2 marketplaces: context-engineering-marketplace, omc
  Installed 7 plugins: superpowers, gopls-lsp, document-skills, ...
  ⚠ Skipped 1 local plugin: obsidian@obsidian-skills (project: /Users/.../obsidian_backup)
  Skipped 1 already installed: agent-architecture@context-engineering-marketplace
```

### 9. Export Side

No code changes needed for export. The existing `runExport()` file-copy logic automatically picks up new entries in the `portable` array of `claude.json`. Adding `plugins/known_marketplaces.json` and `plugins/blocklist.json` to portable is sufficient — they will be exported alongside the existing plugin files.

## Files Changed

| File | Change |
| --- | --- |
| `src/types.ts` | Add `PostImportHook` interface, extend `ToolProfile` |
| `src/profiles/claude.json` | Add portable/ephemeral entries, add `postImport` |
| `src/lib/plugins.ts` | **New** — `restoreMarketplaces()`, `restorePlugins()` |
| `src/commands/import.ts` | Call plugin restore after file copy, add `skipPlugins` option |
| `src/commands/use.ts` | Pass `skipPlugins` through to `runImport()` |
| `src/cli.ts` | Add `--skip-plugins` flag to `import` and `use` commands |
| `tests/plugins.test.ts` | **New** — unit tests for plugin parsing and restore logic |

## Testing Strategy

1. **Unit tests for** `plugins.ts`**:**

   - Parse `installed_plugins.json` correctly
   - Parse `known_marketplaces.json` correctly
   - Skip local-scoped plugins with warning
   - Skip already-installed plugins
   - Handle missing `claude` CLI gracefully
   - Handle individual plugin install failures without aborting

2. **Integration test:**

   - Mock `execFileSync` to capture commands
   - Verify correct marketplace add + plugin install commands are generated
   - Verify `--dry-run` produces output without executing
   - Verify `--skip-plugins` skips the hook entirely

## Out of Scope

- Generic plugin framework for other tools (Codex, Cursor) — Claude-only for now
- Syncing plugin data (`plugins/data/`) — runtime state, not portable
- Plugin version pinning — re-installs latest from marketplace
- Removing plugins on target that aren't in the synced manifest