# Plugin Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Claude Code plugin sync to dotai — import syncs plugin metadata files AND automatically re-installs plugins via `claude plugins install`.

**Architecture:** Extend `ToolProfile` with an optional `postImport` hook. After the file-copy phase of `runImport()`, check the tool's profile for a hook; if present, restore marketplaces then plugins by shelling out to the `claude` CLI. New logic lives in `src/lib/plugins.ts`.

**Tech Stack:** TypeScript, Bun, vitest, node:child_process (execFileSync)

**Spec:** `docs/superpowers/specs/2026-03-23-plugin-sync-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Add `PostImportHook` interface, extend `ToolProfile` |
| `src/profiles/claude.json` | Add portable/ephemeral entries, add `postImport` config |
| `src/lib/plugins.ts` | **New** — parse plugin manifests, shell out to `claude` CLI |
| `src/commands/import.ts` | Call plugin restore after file copy, add `skipPlugins` option |
| `src/commands/use.ts` | Pass `skipPlugins` through to `runImport()` |
| `src/cli.ts` | Add `--skip-plugins` flag to `import` and `use` commands |
| `tests/lib/plugins.test.ts` | **New** — unit tests for plugin parsing and restore |
| `tests/commands/import.test.ts` | Add tests for post-import plugin restore |

---

### Task 1: Extend Types (`src/types.ts`)

**Files:**
- Modify: `src/types.ts`
- Test: `tests/lib/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/lib/profiles.test.ts` that asserts the claude profile has a `postImport` field:

```typescript
it("claude profile has postImport hook", () => {
  const profile = getProfile("claude");
  expect(profile).not.toBeNull();
  expect(profile!.postImport).toBeDefined();
  expect(profile!.postImport!.type).toBe("claude-plugins");
  expect(profile!.postImport!.manifestFile).toBe("plugins/installed_plugins.json");
  expect(profile!.postImport!.marketplacesFile).toBe("plugins/known_marketplaces.json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/lib/profiles.test.ts`
Expected: FAIL — `postImport` is not defined on the type or the profile JSON.

- [ ] **Step 3: Add PostImportHook to types.ts**

In `src/types.ts`, add after the existing `ToolProfile` interface:

```typescript
export interface PostImportHook {
  type: "claude-plugins";
  manifestFile: string;
  marketplacesFile: string;
}
```

And add the optional field to `ToolProfile`:

```typescript
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

- [ ] **Step 4: Update claude.json profile**

In `src/profiles/claude.json`:
- Add to `portable` array: `"plugins/known_marketplaces.json"`, `"plugins/blocklist.json"`
- Add to `ephemeral` array: `"plugins/data/"`, `"plugins/marketplaces/"`, `"plugins/repos/"`, `"plugins/install-counts-cache.json"`
- Add new top-level field:

```json
"postImport": {
  "type": "claude-plugins",
  "manifestFile": "plugins/installed_plugins.json",
  "marketplacesFile": "plugins/known_marketplaces.json"
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/lib/profiles.test.ts`
Expected: PASS — all existing tests still pass, new test passes.

- [ ] **Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass. No regressions from type or profile changes.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/profiles/claude.json tests/lib/profiles.test.ts
git commit -m "feat: add PostImportHook type and update claude profile for plugin sync"
```

> **Note:** The profile changes in this task also cover the export side (spec section 9). The existing `runExport()` file-copy logic automatically picks up new `portable` entries — no code changes needed for export.

---

### Task 2: Plugin Parsing Functions (`src/lib/plugins.ts` — data layer)

**Files:**
- Create: `src/lib/plugins.ts`
- Create: `tests/lib/plugins.test.ts`

- [ ] **Step 1: Write failing tests for manifest parsing**

Create `tests/lib/plugins.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseInstalledPlugins,
  parseKnownMarketplaces,
  getPluginsToRestore,
  getMarketplacesToRestore,
} from "../../src/lib/plugins";

const SAMPLE_INSTALLED = {
  version: 2,
  plugins: {
    "superpowers@claude-plugins-official": [
      {
        scope: "user" as const,
        installPath: "/Users/alice/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5",
        version: "5.0.5",
        installedAt: "2026-01-27T05:56:30.584Z",
        lastUpdated: "2026-03-18T06:52:32.461Z",
        gitCommitSha: "469a6d81ebb8b827e284d4afb090c6c622d97747",
      },
    ],
    "obsidian@obsidian-skills": [
      {
        scope: "local" as const,
        projectPath: "/Users/alice/obsidian_backup/SynologyDrive/Lor-s-Personal",
        installPath: "/Users/alice/.claude/plugins/cache/obsidian-skills/obsidian/1.0.0",
        version: "1.0.0",
        installedAt: "2026-01-15T09:32:54.110Z",
        lastUpdated: "2026-01-15T09:32:54.110Z",
        gitCommitSha: "4540df83fc68a68bef27e83ae79bc4f1b4d2ea7c",
      },
    ],
    "gopls-lsp@claude-plugins-official": [
      {
        scope: "user" as const,
        installPath: "/Users/alice/.claude/plugins/cache/claude-plugins-official/gopls-lsp/1.0.0",
        version: "1.0.0",
        installedAt: "2026-01-19T17:51:46.885Z",
        lastUpdated: "2026-01-19T17:51:46.885Z",
        gitCommitSha: "96276205880a60fd66bbae981f5ab568e70c4cbf",
      },
    ],
  },
};

const SAMPLE_MARKETPLACES = {
  "claude-plugins-official": {
    source: { source: "github" as const, repo: "anthropics/claude-plugins-official" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/claude-plugins-official",
    lastUpdated: "2026-03-23T02:35:04.858Z",
  },
  "obsidian-skills": {
    source: { source: "github" as const, repo: "kepano/obsidian-skills" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/obsidian-skills",
    lastUpdated: "2026-01-15T09:28:33.764Z",
  },
  omc: {
    source: { source: "git" as const, url: "https://github.com/Yeachan-Heo/oh-my-claudecode.git" },
    installLocation: "/Users/alice/.claude/plugins/marketplaces/omc",
    lastUpdated: "2026-03-11T05:50:17.809Z",
  },
};

describe("parseInstalledPlugins", () => {
  it("returns all plugin keys", () => {
    const result = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.key)).toEqual([
      "superpowers@claude-plugins-official",
      "obsidian@obsidian-skills",
      "gopls-lsp@claude-plugins-official",
    ]);
  });

  it("picks most recent entry when multiple exist", () => {
    const manifest = {
      version: 2,
      plugins: {
        "test@mkt": [
          { scope: "user", installPath: "/old", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
          { scope: "user", installPath: "/new", version: "2.0", installedAt: "2026-03-01T00:00:00Z", lastUpdated: "2026-03-01T00:00:00Z", gitCommitSha: "bbb" },
        ],
      },
    };
    const result = parseInstalledPlugins(JSON.stringify(manifest));
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("2.0");
  });
});

describe("parseKnownMarketplaces", () => {
  it("returns all marketplaces with source info", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.name)).toEqual(["claude-plugins-official", "obsidian-skills", "omc"]);
  });

  it("extracts github repo for github sources", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const official = result.find((m) => m.name === "claude-plugins-official")!;
    expect(official.addArg).toBe("anthropics/claude-plugins-official");
  });

  it("extracts git url for git sources", () => {
    const result = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const omc = result.find((m) => m.name === "omc")!;
    expect(omc.addArg).toBe("https://github.com/Yeachan-Heo/oh-my-claudecode.git");
  });
});

describe("getPluginsToRestore", () => {
  it("filters out local-scoped plugins", () => {
    const plugins = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    const result = getPluginsToRestore(plugins, new Set());
    expect(result.toInstall.map((p) => p.key)).toEqual([
      "superpowers@claude-plugins-official",
      "gopls-lsp@claude-plugins-official",
    ]);
    expect(result.warned.map((p) => p.key)).toEqual(["obsidian@obsidian-skills"]);
  });

  it("filters out already-installed plugins", () => {
    const plugins = parseInstalledPlugins(JSON.stringify(SAMPLE_INSTALLED));
    const alreadyInstalled = new Set(["superpowers@claude-plugins-official"]);
    const result = getPluginsToRestore(plugins, alreadyInstalled);
    expect(result.toInstall.map((p) => p.key)).toEqual(["gopls-lsp@claude-plugins-official"]);
    expect(result.skipped.map((p) => p.key)).toEqual(["superpowers@claude-plugins-official"]);
  });

  it("filters out project-scoped plugins", () => {
    const manifest = {
      version: 2,
      plugins: {
        "proj-plugin@mkt": [
          { scope: "project", projectPath: "/some/project", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
        ],
      },
    };
    const plugins = parseInstalledPlugins(JSON.stringify(manifest));
    const result = getPluginsToRestore(plugins, new Set());
    expect(result.toInstall).toHaveLength(0);
    expect(result.warned).toHaveLength(1);
  });
});

describe("getMarketplacesToRestore", () => {
  it("filters out already-registered marketplaces", () => {
    const marketplaces = parseKnownMarketplaces(JSON.stringify(SAMPLE_MARKETPLACES));
    const alreadyRegistered = new Set(["claude-plugins-official"]);
    const result = getMarketplacesToRestore(marketplaces, alreadyRegistered);
    expect(result.toAdd.map((m) => m.name)).toEqual(["obsidian-skills", "omc"]);
    expect(result.skipped.map((m) => m.name)).toEqual(["claude-plugins-official"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/lib/plugins.test.ts`
Expected: FAIL — module `../../src/lib/plugins` does not exist.

- [ ] **Step 3: Implement parsing functions**

Create `src/lib/plugins.ts`:

```typescript
// --- Data types ---

export interface ParsedPlugin {
  key: string;            // "pluginName@marketplaceName"
  scope: "user" | "local" | "project";
  projectPath?: string;
  version: string;
  installedAt: string;
}

export interface ParsedMarketplace {
  name: string;
  addArg: string;         // argument for `claude plugins marketplace add`
}

interface PluginFilterResult {
  toInstall: ParsedPlugin[];
  skipped: ParsedPlugin[];     // already installed
  warned: ParsedPlugin[];      // local/project scoped
}

interface MarketplaceFilterResult {
  toAdd: ParsedMarketplace[];
  skipped: ParsedMarketplace[];
}

// --- Parsing ---

export function parseInstalledPlugins(json: string): ParsedPlugin[] {
  const data = JSON.parse(json);
  const plugins: ParsedPlugin[] = [];

  for (const [key, entries] of Object.entries(data.plugins ?? {})) {
    const arr = entries as any[];
    if (arr.length === 0) continue;
    // Sort by installedAt descending, take most recent
    const sorted = [...arr].sort(
      (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
    );
    const entry = sorted[0];
    plugins.push({
      key,
      scope: entry.scope,
      projectPath: entry.projectPath,
      version: entry.version,
      installedAt: entry.installedAt,
    });
  }

  return plugins;
}

export function parseKnownMarketplaces(json: string): ParsedMarketplace[] {
  const data = JSON.parse(json);
  const marketplaces: ParsedMarketplace[] = [];

  for (const [name, entry] of Object.entries(data)) {
    const e = entry as any;
    const source = e.source;
    let addArg: string;
    if (source.source === "github") {
      addArg = source.repo;
    } else {
      addArg = source.url;
    }
    marketplaces.push({ name, addArg });
  }

  return marketplaces;
}

// --- Filtering ---

export function getPluginsToRestore(
  plugins: ParsedPlugin[],
  alreadyInstalled: Set<string>,
): PluginFilterResult {
  const toInstall: ParsedPlugin[] = [];
  const skipped: ParsedPlugin[] = [];
  const warned: ParsedPlugin[] = [];

  for (const plugin of plugins) {
    if (plugin.scope === "local" || plugin.scope === "project") {
      warned.push(plugin);
    } else if (alreadyInstalled.has(plugin.key)) {
      skipped.push(plugin);
    } else {
      toInstall.push(plugin);
    }
  }

  return { toInstall, skipped, warned };
}

export function getMarketplacesToRestore(
  marketplaces: ParsedMarketplace[],
  alreadyRegistered: Set<string>,
): MarketplaceFilterResult {
  const toAdd: ParsedMarketplace[] = [];
  const skipped: ParsedMarketplace[] = [];

  for (const mkt of marketplaces) {
    if (alreadyRegistered.has(mkt.name)) {
      skipped.push(mkt);
    } else {
      toAdd.push(mkt);
    }
  }

  return { toAdd, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/lib/plugins.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plugins.ts tests/lib/plugins.test.ts
git commit -m "feat: add plugin manifest parsing and filtering logic"
```

---

### Task 3: Plugin Restore Execution (`src/lib/plugins.ts` — CLI layer)

**Files:**
- Modify: `src/lib/plugins.ts`
- Modify: `tests/lib/plugins.test.ts`

- [ ] **Step 1: Write failing tests for CLI execution**

Add to `tests/lib/plugins.test.ts`:

```typescript
import { vi, beforeEach, afterEach } from "vitest";
import { restoreClaudePlugins } from "../../src/lib/plugins";
import * as child_process from "node:child_process";

// Mock execFileSync at module level
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = child_process.execFileSync as ReturnType<typeof vi.fn>;

describe("restoreClaudePlugins", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it("adds marketplaces then installs plugins", () => {
    // marketplace list returns empty (none registered)
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args.includes("marketplace") && args.includes("list")) {
        return Buffer.from("No marketplaces configured\n");
      }
      if (args.includes("list") && !args.includes("marketplace")) {
        return Buffer.from("No plugins installed\n");
      }
      return Buffer.from("");
    });

    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({
        version: 2,
        plugins: {
          "superpowers@claude-plugins-official": [
            { scope: "user", installPath: "/x", version: "5.0.5", installedAt: "2026-01-27T00:00:00Z", lastUpdated: "2026-01-27T00:00:00Z", gitCommitSha: "abc" },
          ],
        },
      }),
      knownMarketplacesJson: JSON.stringify({
        "claude-plugins-official": {
          source: { source: "github", repo: "anthropics/claude-plugins-official" },
          installLocation: "/x",
          lastUpdated: "2026-01-01T00:00:00Z",
        },
      }),
      dryRun: false,
      verbose: false,
    });

    // Should have called marketplace add, then plugin install
    const calls = mockExecFileSync.mock.calls.map((c: any[]) => c[1]);
    expect(calls).toContainEqual(
      expect.arrayContaining(["plugins", "marketplace", "add", "anthropics/claude-plugins-official"])
    );
    expect(calls).toContainEqual(
      expect.arrayContaining(["plugins", "install", "superpowers@claude-plugins-official", "--scope", "user"])
    );
    expect(result.pluginsInstalled).toEqual(["superpowers@claude-plugins-official"]);
    expect(result.marketplacesAdded).toEqual(["claude-plugins-official"]);
  });

  it("skips local-scoped plugins with warning", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({
        version: 2,
        plugins: {
          "obsidian@obsidian-skills": [
            { scope: "local", projectPath: "/some/path", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "abc" },
          ],
        },
      }),
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.pluginsWarned).toEqual(["obsidian@obsidian-skills"]);
    expect(result.pluginsInstalled).toEqual([]);
  });

  it("dry-run reports without executing any CLI commands", () => {
    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({
        version: 2,
        plugins: {
          "superpowers@claude-plugins-official": [
            { scope: "user", installPath: "/x", version: "5.0.5", installedAt: "2026-01-27T00:00:00Z", lastUpdated: "2026-01-27T00:00:00Z", gitCommitSha: "abc" },
          ],
        },
      }),
      knownMarketplacesJson: JSON.stringify({
        "claude-plugins-official": {
          source: { source: "github", repo: "anthropics/claude-plugins-official" },
          installLocation: "/x",
          lastUpdated: "2026-01-01T00:00:00Z",
        },
      }),
      dryRun: true,
      verbose: false,
    });

    // Dry-run should NOT call execFileSync at all (no list, no install, no add)
    expect(mockExecFileSync).not.toHaveBeenCalled();
    // But should still report what WOULD be installed
    expect(result.pluginsInstalled).toEqual(["superpowers@claude-plugins-official"]);
    expect(result.marketplacesAdded).toEqual(["claude-plugins-official"]);
  });

  it("handles missing claude CLI gracefully", () => {
    mockExecFileSync.mockImplementation(() => {
      const err: any = new Error("spawn claude ENOENT");
      err.code = "ENOENT";
      throw err;
    });

    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({ version: 2, plugins: { "x@y": [{ scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "a" }] } }),
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.claudeCliMissing).toBe(true);
    expect(result.pluginsInstalled).toEqual([]);
  });

  it("continues when individual plugin install fails", () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args.includes("list")) return Buffer.from("");
      if (args.includes("install")) {
        callCount++;
        if (callCount === 1) throw new Error("install failed");
        return Buffer.from("");
      }
      return Buffer.from("");
    });

    const result = restoreClaudePlugins({
      installedPluginsJson: JSON.stringify({
        version: 2,
        plugins: {
          "plugin-a@mkt": [{ scope: "user", installPath: "/a", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "a" }],
          "plugin-b@mkt": [{ scope: "user", installPath: "/b", version: "1.0", installedAt: "2026-01-02T00:00:00Z", lastUpdated: "2026-01-02T00:00:00Z", gitCommitSha: "b" }],
        },
      }),
      knownMarketplacesJson: JSON.stringify({}),
      dryRun: false,
      verbose: false,
    });

    expect(result.pluginsFailed).toEqual(["plugin-a@mkt"]);
    expect(result.pluginsInstalled).toEqual(["plugin-b@mkt"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/lib/plugins.test.ts`
Expected: FAIL — `restoreClaudePlugins` is not exported.

- [ ] **Step 3: Implement restoreClaudePlugins**

Add to `src/lib/plugins.ts`:

```typescript
import { execFileSync } from "node:child_process";

export interface PluginRestoreResult {
  marketplacesAdded: string[];
  marketplacesSkipped: string[];
  marketplacesFailed: string[];
  pluginsInstalled: string[];
  pluginsSkipped: string[];
  pluginsWarned: string[];
  pluginsFailed: string[];
  claudeCliMissing?: boolean;
}

interface RestoreOptions {
  installedPluginsJson: string;
  knownMarketplacesJson: string;
  dryRun: boolean;
  verbose: boolean;
}

export function restoreClaudePlugins(opts: RestoreOptions): PluginRestoreResult {
  const result: PluginRestoreResult = {
    marketplacesAdded: [],
    marketplacesSkipped: [],
    marketplacesFailed: [],
    pluginsInstalled: [],
    pluginsSkipped: [],
    pluginsWarned: [],
    pluginsFailed: [],
  };

  const plugins = parseInstalledPlugins(opts.installedPluginsJson);
  const marketplaces = parseKnownMarketplaces(opts.knownMarketplacesJson);

  // In dry-run mode, skip all CLI calls — just report what would happen.
  // Treat everything as "not already installed" since we can't check without CLI.
  if (opts.dryRun) {
    const mktFilter = getMarketplacesToRestore(marketplaces, new Set());
    result.marketplacesAdded = mktFilter.toAdd.map((m) => m.name);

    const pluginFilter = getPluginsToRestore(plugins, new Set());
    result.pluginsInstalled = pluginFilter.toInstall.map((p) => p.key);
    result.pluginsWarned = pluginFilter.warned.map((p) => p.key);
    return result;
  }

  // Phase 1: Restore marketplaces
  let registeredMarketplaces: Set<string>;
  try {
    registeredMarketplaces = getRegisteredMarketplaces();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      result.claudeCliMissing = true;
      return result;
    }
    registeredMarketplaces = new Set();
  }

  const mktFilter = getMarketplacesToRestore(marketplaces, registeredMarketplaces);
  result.marketplacesSkipped = mktFilter.skipped.map((m) => m.name);

  for (const mkt of mktFilter.toAdd) {
    try {
      execFileSync("claude", ["plugins", "marketplace", "add", mkt.addArg], {
        stdio: "pipe",
        timeout: 30_000,
      });
      result.marketplacesAdded.push(mkt.name);
    } catch {
      // Non-fatal: marketplace add failed, plugins from it will fail later
      result.marketplacesFailed.push(mkt.name);
    }
  }

  // Phase 2: Restore plugins
  let installedPluginKeys: Set<string>;
  try {
    installedPluginKeys = getInstalledPluginKeys();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      result.claudeCliMissing = true;
      return result;
    }
    installedPluginKeys = new Set();
  }

  const pluginFilter = getPluginsToRestore(plugins, installedPluginKeys);
  result.pluginsSkipped = pluginFilter.skipped.map((p) => p.key);
  result.pluginsWarned = pluginFilter.warned.map((p) => p.key);

  const total = pluginFilter.toInstall.length;
  for (let i = 0; i < total; i++) {
    const plugin = pluginFilter.toInstall[i];
    if (opts.verbose) {
      console.log(`  Installing plugin ${i + 1}/${total}: ${plugin.key}...`);
    }
    try {
      execFileSync("claude", [
        "plugins", "install", plugin.key, "--scope", "user",
      ], { stdio: "pipe", timeout: 30_000 });
      result.pluginsInstalled.push(plugin.key);
    } catch {
      result.pluginsFailed.push(plugin.key);
    }
  }

  return result;
}

// --- CLI helpers ---

function getRegisteredMarketplaces(): Set<string> {
  const output = execFileSync("claude", ["plugins", "marketplace", "list"], {
    stdio: "pipe",
    timeout: 30_000,
  }).toString();
  // Parse marketplace names from output lines.
  // Each non-empty line that doesn't look like a header/separator is a marketplace name.
  const names = new Set<string>();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("No ") && !trimmed.startsWith("-") && !trimmed.toLowerCase().includes("name")) {
      // First whitespace-delimited token is the name
      const name = trimmed.split(/\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

function getInstalledPluginKeys(): Set<string> {
  const output = execFileSync("claude", ["plugins", "list"], {
    stdio: "pipe",
    timeout: 30_000,
  }).toString();
  const keys = new Set<string>();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    // Plugin keys contain @ — "pluginName@marketplace"
    if (trimmed && trimmed.includes("@")) {
      const key = trimmed.split(/\s+/)[0];
      if (key) keys.add(key);
    }
  }
  return keys;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/lib/plugins.test.ts`
Expected: All PASS.

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugins.ts tests/lib/plugins.test.ts
git commit -m "feat: add plugin restore execution with CLI shelling"
```

---

### Task 4: Wire Into Import Command

**Files:**
- Modify: `src/commands/import.ts`
- Modify: `tests/commands/import.test.ts`

- [ ] **Step 1: Write failing test for skipPlugins option**

Add to `tests/commands/import.test.ts`:

```typescript
it("accepts skipPlugins option without error", () => {
  const machineDir = join(tempDir, "machine");
  const repoDir = join(tempDir, "repo");
  writeFixture(repoDir, "test/settings.json", '{"imported":true}');
  const manifest: Manifest = {
    version: 1,
    tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
  };
  const result = runImport({
    manifest, repoDir, verbose: false, dryRun: false, sync: false,
    backupBase: join(tempDir, "backups"), skipPlugins: true,
  });
  expect(result.filesImported).toBe(1);
  expect(result.pluginRestore).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/import.test.ts`
Expected: FAIL — `skipPlugins` is not a valid option (TypeScript error or runtime error).

- [ ] **Step 3: Update ImportOptions and ImportResult**

In `src/commands/import.ts`, update the interfaces:

```typescript
interface ImportOptions {
  manifest: Manifest;
  repoDir: string;
  verbose: boolean;
  dryRun: boolean;
  sync: boolean;
  only?: string;
  backupBase: string;
  skipPlugins?: boolean;
}

interface ImportResult {
  filesImported: number;
  filesDeleted: number;
  backupPaths: string[];
  toolsImported: string[];
  pluginRestore?: PluginRestoreResult;
}
```

Update the `node:fs` import at the top of the file to include `readFileSync`:

```typescript
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
```

Add new imports after the existing imports:

```typescript
import { getProfile } from "../lib/profiles.js";
import { restoreClaudePlugins } from "../lib/plugins.js";
import type { PluginRestoreResult } from "../lib/plugins.js";
```

Update the destructuring to include `skipPlugins`:

```typescript
const { manifest, repoDir, verbose, dryRun, sync, only, backupBase, skipPlugins } = options;
```

After the existing `for (const toolName of toolNames)` loop (after line 76 `toolsImported.push(toolName);`), outside the loop, add the post-import hook:

```typescript
  // Post-import plugin restore
  let pluginRestore: PluginRestoreResult | undefined;
  if (!skipPlugins) {
    for (const toolName of toolNames) {
      const profile = getProfile(toolName);
      if (profile?.postImport?.type === "claude-plugins") {
        const machineBase = expandHome(manifest.tools[toolName].source);
        const manifestFile = join(machineBase, profile.postImport.manifestFile);
        const marketplacesFile = join(machineBase, profile.postImport.marketplacesFile);

        let installedPluginsJson = "{}";
        let knownMarketplacesJson = "{}";
        try { installedPluginsJson = readFileSync(manifestFile, "utf-8"); } catch {}
        try { knownMarketplacesJson = readFileSync(marketplacesFile, "utf-8"); } catch {}

        pluginRestore = restoreClaudePlugins({
          installedPluginsJson,
          knownMarketplacesJson,
          dryRun,
          verbose,
        });
      }
    }
  }

  return { filesImported, filesDeleted, backupPaths, toolsImported, pluginRestore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/commands/import.test.ts`
Expected: All PASS (existing + new test).

- [ ] **Step 5: Add integration tests for dry-run and skip-plugins in import flow**

Add to `tests/commands/import.test.ts`:

```typescript
it("dry-run returns pluginRestore without executing CLI commands", () => {
  const machineDir = join(tempDir, "machine");
  const repoDir = join(tempDir, "repo");
  writeFixture(machineDir, "plugins/installed_plugins.json", JSON.stringify({
    version: 2,
    plugins: {
      "test-plugin@test-mkt": [
        { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
      ],
    },
  }));
  writeFixture(machineDir, "plugins/known_marketplaces.json", JSON.stringify({
    "test-mkt": {
      source: { source: "github", repo: "test/test-marketplace" },
      installLocation: "/x",
      lastUpdated: "2026-01-01T00:00:00Z",
    },
  }));
  writeFixture(repoDir, "claude/plugins/installed_plugins.json", JSON.stringify({
    version: 2,
    plugins: {
      "test-plugin@test-mkt": [
        { scope: "user", installPath: "/x", version: "1.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z", gitCommitSha: "aaa" },
      ],
    },
  }));
  writeFixture(repoDir, "claude/plugins/known_marketplaces.json", JSON.stringify({
    "test-mkt": {
      source: { source: "github", repo: "test/test-marketplace" },
      installLocation: "/x",
      lastUpdated: "2026-01-01T00:00:00Z",
    },
  }));

  const manifest: Manifest = {
    version: 1,
    tools: {
      claude: {
        source: machineDir,
        include: ["plugins/installed_plugins.json", "plugins/known_marketplaces.json"],
        exclude: [],
      },
    },
  };
  const result = runImport({
    manifest, repoDir, verbose: false, dryRun: true, sync: false,
    backupBase: join(tempDir, "backups"),
  });
  // In dry-run, pluginRestore should be populated but no CLI commands executed
  expect(result.pluginRestore).toBeDefined();
  expect(result.pluginRestore!.pluginsInstalled).toContain("test-plugin@test-mkt");
});

it("skipPlugins prevents plugin restore", () => {
  const machineDir = join(tempDir, "machine");
  const repoDir = join(tempDir, "repo");
  writeFixture(repoDir, "test/settings.json", '{"imported":true}');
  const manifest: Manifest = {
    version: 1,
    tools: { test: { source: machineDir, include: ["settings.json"], exclude: [] } },
  };
  const result = runImport({
    manifest, repoDir, verbose: false, dryRun: false, sync: false,
    backupBase: join(tempDir, "backups"), skipPlugins: true,
  });
  expect(result.pluginRestore).toBeUndefined();
});
```

- [ ] **Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/commands/import.ts tests/commands/import.test.ts
git commit -m "feat: wire plugin restore into import command"
```

---

### Task 5: Wire Into Use Command and CLI

**Files:**
- Modify: `src/commands/use.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update runUse to pass skipPlugins**

In `src/commands/use.ts`, add `skipPlugins` to the options interface and pass it through:

```typescript
export function runUse(options: {
  repoArg: string;
  dryRun: boolean;
  verbose: boolean;
  backupBase: string;
  skipPlugins?: boolean;
}): void {
```

And update the `runImport` call (line 91):

```typescript
    runImport({ manifest, repoDir: tempDir, verbose, dryRun, sync: false, backupBase, skipPlugins: options.skipPlugins });
```

- [ ] **Step 2: Add --skip-plugins to CLI commands**

In `src/cli.ts`, add the option to the `import` command (after existing options):

```typescript
  .option("--skip-plugins", "Skip plugin restore after import", false)
```

And update the import action to pass it:

```typescript
    const result = runImport({
      manifest, repoDir, verbose: opts.verbose, dryRun: opts.dryRun,
      sync: opts.sync, only: opts.only, backupBase: getBackupBase(),
      skipPlugins: opts.skipPlugins,
    });
```

Add plugin restore output after the existing import success message:

```typescript
    if (result.pluginRestore) {
      const pr = result.pluginRestore;
      if (pr.claudeCliMissing) {
        console.log(chalk.yellow("\n⚠ claude CLI not found — skipping plugin restore. Install plugins manually."));
      } else {
        console.log(chalk.bold("\n🔌 Plugin restore:"));
        if (pr.marketplacesAdded.length > 0) {
          console.log(`  Added ${pr.marketplacesAdded.length} marketplace(s): ${pr.marketplacesAdded.join(", ")}`);
        }
        if (pr.pluginsInstalled.length > 0) {
          console.log(chalk.green(`  Installed ${pr.pluginsInstalled.length} plugin(s): ${pr.pluginsInstalled.join(", ")}`));
        }
        for (const w of pr.pluginsWarned) {
          console.log(chalk.yellow(`  ⚠ Skipped local/project plugin: ${w}`));
        }
        if (pr.pluginsSkipped.length > 0) {
          console.log(`  Skipped ${pr.pluginsSkipped.length} already installed: ${pr.pluginsSkipped.join(", ")}`);
        }
        if (pr.pluginsFailed.length > 0) {
          console.log(chalk.red(`  Failed ${pr.pluginsFailed.length}: ${pr.pluginsFailed.join(", ")}`));
        }
      }
    }
```

Add `--skip-plugins` to the `use` command (after existing options):

```typescript
  .option("--skip-plugins", "Skip plugin restore after import", false)
```

And update the use action:

```typescript
    runUse({ repoArg: repo, dryRun: opts.dryRun, verbose: opts.verbose, backupBase: getBackupBase(), skipPlugins: opts.skipPlugins });
```

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass. The `skipPlugins` option on `runUse()` is optional, so existing `use.test.ts` tests continue to pass. The pass-through from `runUse` to `runImport` is tested implicitly via the import command tests in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/commands/use.ts src/cli.ts
git commit -m "feat: add --skip-plugins flag to import and use commands"
```

---

### Task 6: Manual Smoke Test

- [ ] **Step 1: Build the project**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 2: Verify --help shows new flag**

Run: `node dist/cli.js import --help`
Expected: Output includes `--skip-plugins` option.

Run: `node dist/cli.js use --help`
Expected: Output includes `--skip-plugins` option.

- [ ] **Step 3: Run full test suite one final time**

Run: `bun test`
Expected: All tests pass, no regressions.

- [ ] **Step 4: Commit any final fixes if needed**
