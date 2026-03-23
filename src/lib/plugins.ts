// --- Data types ---

export interface ParsedPlugin {
  key: string;
  scope: "user" | "local" | "project";
  projectPath?: string;
  version: string;
  installedAt: string;
}

export interface ParsedMarketplace {
  name: string;
  addArg: string;
}

interface PluginFilterResult {
  toInstall: ParsedPlugin[];
  skipped: ParsedPlugin[];
  warned: ParsedPlugin[];
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
    const source = e.source;
    const addArg = source.source === "github" ? source.repo : source.url;
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
    if (plugin.scope === "local" || plugin.scope === "project") { warned.push(plugin); }
    else if (alreadyInstalled.has(plugin.key)) { skipped.push(plugin); }
    else { toInstall.push(plugin); }
  }
  return { toInstall, skipped, warned };
}

export function getMarketplacesToRestore(marketplaces: ParsedMarketplace[], alreadyRegistered: Set<string>): MarketplaceFilterResult {
  const toAdd: ParsedMarketplace[] = [];
  const skipped: ParsedMarketplace[] = [];
  for (const mkt of marketplaces) {
    if (alreadyRegistered.has(mkt.name)) { skipped.push(mkt); }
    else { toAdd.push(mkt); }
  }
  return { toAdd, skipped };
}
