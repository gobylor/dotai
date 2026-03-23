import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { copyFile, copyDir, createBackup } from "../lib/fileops.js";
import { resolveFiles, expandHome } from "../lib/resolve.js";
import { getProfile } from "../lib/profiles.js";
import { restoreClaudePlugins } from "../lib/plugins.js";
import type { PluginRestoreResult } from "../lib/plugins.js";
import type { Manifest } from "../types.js";

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

export function runImport(options: ImportOptions): ImportResult {
  const { manifest, repoDir, verbose, dryRun, sync, only, backupBase, skipPlugins } = options;
  let filesImported = 0;
  let filesDeleted = 0;
  const backupPaths: string[] = [];
  const toolsImported: string[] = [];
  const toolNames = only ? [only] : Object.keys(manifest.tools);

  for (const toolName of toolNames) {
    const tool = manifest.tools[toolName];
    if (!tool) continue;
    const machineBase = expandHome(tool.source);
    const resolved = resolveFiles(manifest, repoDir, toolName);

    const hasExisting = existsSync(machineBase) && resolved.files.some(
      (f) => f.state === "modified" || f.state === "repo-only"
    );

    if (hasExisting && !dryRun) {
      const bp = createBackup(machineBase, backupBase, toolName);
      backupPaths.push(bp);
      if (verbose) console.log(`  Backup created for ${toolName}: ${bp}`);
    }

    if (!dryRun) {
      mkdirSync(machineBase, { recursive: true });
    }

    for (const file of resolved.files) {
      if (file.state === "repo-only" || file.state === "modified") {
        if (dryRun) {
          if (verbose) console.log(`  [dry-run] would copy: ${file.relativePath}`);
        } else {
          if (existsSync(file.repoPath) && statSync(file.repoPath).isDirectory()) {
            copyDir(file.repoPath, file.machinePath);
          } else {
            copyFile(file.repoPath, file.machinePath);
          }
          if (verbose) console.log(`  ${toolName}: ${file.relativePath}`);
          filesImported++;
        }
      } else if (file.state === "machine-only" && sync) {
        if (dryRun) {
          if (verbose) console.log(`  [dry-run] would delete: ${file.relativePath}`);
        } else {
          rmSync(file.machinePath, { force: true });
          if (verbose) console.log(`  ${toolName}: deleted ${file.relativePath}`);
          filesDeleted++;
        }
      }
    }
    toolsImported.push(toolName);
  }

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
}
