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

    // Back up when the machine directory already exists and there are files to modify.
    // This intentionally triggers even for repo-only files (new additions) because the user
    // may want to restore the pre-import state if the new files cause issues.
    const hasExisting = existsSync(machineBase) && resolved.files.some(
      (f) => f.state === "modified" || f.state === "repo-only"
    );

    if (hasExisting && !dryRun) {
      const filesToBackup = resolved.files
        .filter((f) => f.state === "modified" || (f.state === "machine-only" && sync))
        .map((f) => f.relativePath);
      const bp = createBackup(machineBase, backupBase, toolName, filesToBackup);
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
      const toolEntry = manifest.tools[toolName];
      if (!toolEntry) continue;
      if (profile?.postImport?.type === "claude-plugins") {
        // In dry-run mode, read from repo (files weren't copied to machine).
        // In live mode, read from machine (files were just copied).
        const readBase = dryRun
          ? join(repoDir, toolName)
          : expandHome(toolEntry.source);
        const manifestFile = join(readBase, profile.postImport.manifestFile);
        const marketplacesFile = join(readBase, profile.postImport.marketplacesFile);

        let installedPluginsJson = "{}";
        let knownMarketplacesJson = "{}";
        try {
          installedPluginsJson = readFileSync(manifestFile, "utf-8");
        } catch (err: unknown) {
          if (err instanceof Error && (err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`Warning: Could not read ${manifestFile}: ${(err as Error).message}`);
          }
        }
        try {
          knownMarketplacesJson = readFileSync(marketplacesFile, "utf-8");
        } catch (err: unknown) {
          if (err instanceof Error && (err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`Warning: Could not read ${marketplacesFile}: ${(err as Error).message}`);
          }
        }

        try {
          // NOTE: Currently only the "claude" profile has postImport. If multiple tools gain
          // postImport hooks, this should accumulate results rather than overwriting.
          pluginRestore = restoreClaudePlugins({
            installedPluginsJson,
            knownMarketplacesJson,
            dryRun,
            verbose,
          });
        } catch (err: unknown) {
          console.warn(`Warning: Plugin restore failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
    }
  }

  return { filesImported, filesDeleted, backupPaths, toolsImported, pluginRestore };
}
