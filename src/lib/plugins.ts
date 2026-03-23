import { execFileSync } from "node:child_process";

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

export interface PluginFilterResult {
  toInstall: ParsedPlugin[];
  skipped: ParsedPlugin[];     // already installed
  warned: ParsedPlugin[];      // local/project scoped
}

export interface MarketplaceFilterResult {
  toAdd: ParsedMarketplace[];
  skipped: ParsedMarketplace[];
}

// --- Parsing ---

export function parseInstalledPlugins(json: string): ParsedPlugin[] {
  const data = JSON.parse(json);
  const plugins: ParsedPlugin[] = [];
  for (const [key, entries] of Object.entries(data.plugins ?? {})) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const arr = entries;
    // Sort by installedAt descending, take most recent
    const sorted = [...arr].sort(
      (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
    );
    const entry = sorted[0];
    plugins.push({ key, scope: entry.scope, projectPath: entry.projectPath, version: entry.version, installedAt: entry.installedAt });
  }
  return plugins;
}

export function parseKnownMarketplaces(json: string): ParsedMarketplace[] {
  const data = JSON.parse(json);
  const marketplaces: ParsedMarketplace[] = [];
  for (const [name, entry] of Object.entries(data)) {
    const e = entry as any;
    const source = e?.source;
    if (!source) continue;
    const addArg = source.source === "github" ? source.repo : source.url;
    if (typeof addArg !== "string" || !addArg) continue;
    marketplaces.push({ name, addArg });
  }
  return marketplaces;
}

// --- Filtering ---

export function getPluginsToRestore(plugins: ParsedPlugin[], alreadyInstalled: Set<string>): PluginFilterResult {
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

export function getMarketplacesToRestore(marketplaces: ParsedMarketplace[], alreadyRegistered: Set<string>): MarketplaceFilterResult {
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

// --- Validation ---

// Reject CLI arguments that could be argument injection (starting with -)
// or contain unexpected characters
const SAFE_PLUGIN_KEY = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;
const SAFE_MARKETPLACE_ARG = /^[a-zA-Z0-9_.\-/]+$/;
const SAFE_MARKETPLACE_URL = /^https?:\/\/.+$/;

function isSafeMarketplaceArg(arg: string): boolean {
  return SAFE_MARKETPLACE_ARG.test(arg) || SAFE_MARKETPLACE_URL.test(arg);
}

function isSafePluginKey(key: string): boolean {
  return SAFE_PLUGIN_KEY.test(key);
}

// --- Restore execution ---

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

export interface RestoreOptions {
  installedPluginsJson: string;
  knownMarketplacesJson: string;
  dryRun: boolean;
  verbose: boolean;
}

export function restoreClaudePlugins(opts: RestoreOptions): PluginRestoreResult {
  const { installedPluginsJson, knownMarketplacesJson, dryRun, verbose } = opts;

  const plugins = parseInstalledPlugins(installedPluginsJson);
  const marketplaces = parseKnownMarketplaces(knownMarketplacesJson);

  const result: PluginRestoreResult = {
    marketplacesAdded: [],
    marketplacesSkipped: [],
    marketplacesFailed: [],
    pluginsInstalled: [],
    pluginsSkipped: [],
    pluginsWarned: [],
    pluginsFailed: [],
  };

  // Dry-run: compute what would happen without executing any CLI commands.
  // Uses empty sets (treats everything as "not installed") because dry-run must
  // work even without the claude CLI installed. May over-report installs.
  if (dryRun) {
    const mktFilter = getMarketplacesToRestore(marketplaces, new Set());
    const pluginFilter = getPluginsToRestore(plugins, new Set());
    result.marketplacesAdded = mktFilter.toAdd.map((m) => m.name);
    result.marketplacesSkipped = mktFilter.skipped.map((m) => m.name);
    result.pluginsInstalled = pluginFilter.toInstall.map((p) => p.key);
    result.pluginsSkipped = pluginFilter.skipped.map((p) => p.key);
    result.pluginsWarned = pluginFilter.warned.map((p) => p.key);
    return result;
  }

  // Phase 1: marketplaces
  let registeredMarketplaces: Set<string>;
  try {
    registeredMarketplaces = getRegisteredMarketplaces();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      result.claudeCliMissing = true;
      return result;
    }
    throw err;
  }

  const mktFilter = getMarketplacesToRestore(marketplaces, registeredMarketplaces);
  result.marketplacesSkipped = mktFilter.skipped.map((m) => m.name);

  for (const mkt of mktFilter.toAdd) {
    if (!isSafeMarketplaceArg(mkt.addArg)) {
      result.marketplacesFailed.push(mkt.name);
      continue;
    }
    try {
      execFileSync("claude", ["plugins", "marketplace", "add", mkt.addArg], {
        stdio: "pipe",
        timeout: 30_000,
      });
      result.marketplacesAdded.push(mkt.name);
    } catch {
      result.marketplacesFailed.push(mkt.name);
    }
  }

  // Phase 2: plugins
  let installedPluginKeys: Set<string>;
  try {
    installedPluginKeys = getInstalledPluginKeys();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      result.claudeCliMissing = true;
      return result;
    }
    throw err;
  }

  const pluginFilter = getPluginsToRestore(plugins, installedPluginKeys);
  result.pluginsSkipped = pluginFilter.skipped.map((p) => p.key);
  result.pluginsWarned = pluginFilter.warned.map((p) => p.key);

  for (const plugin of pluginFilter.toInstall) {
    if (!isSafePluginKey(plugin.key)) {
      result.pluginsFailed.push(plugin.key);
      continue;
    }
    try {
      if (verbose) {
        console.log(`Installing plugin: ${plugin.key}`);
      }
      execFileSync("claude", ["plugins", "install", plugin.key, "--scope", "user"], {
        stdio: "pipe",
        timeout: 30_000,
      });
      result.pluginsInstalled.push(plugin.key);
    } catch {
      result.pluginsFailed.push(plugin.key);
    }
  }

  return result;
}

// Parses `claude plugins marketplace list` tabular output.
// Expected format: one marketplace name per line (first whitespace-delimited token).
// Filters out header rows, decorators, and "No marketplaces" messages.
function getRegisteredMarketplaces(): Set<string> {
  const output = execFileSync("claude", ["plugins", "marketplace", "list"], {
    stdio: "pipe",
    timeout: 30_000,
  }).toString();
  const names = new Set<string>();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith("No ") &&
      !trimmed.startsWith("-") &&
      !trimmed.toLowerCase().includes("name")
    ) {
      const name = trimmed.split(/\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

// Parses `claude plugins list` tabular output.
// Plugin keys contain "@" (e.g. "superpowers@claude-plugins-official").
function getInstalledPluginKeys(): Set<string> {
  const output = execFileSync("claude", ["plugins", "list"], {
    stdio: "pipe",
    timeout: 30_000,
  }).toString();
  const keys = new Set<string>();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && trimmed.includes("@")) {
      const key = trimmed.split(/\s+/)[0];
      if (key) keys.add(key);
    }
  }
  return keys;
}
